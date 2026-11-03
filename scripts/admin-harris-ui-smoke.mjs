/* UI smoke test: the Master setup switch for the Harris Farm Markets group and
   entity is discoverable and works end to end in the rendered application.

   With the switch off (the default) the tenant is hidden; the Tenants tab of
   Master setup explains why and offers a one-click "Enable now" button. After
   enabling, the tenant appears in the list, can be switched to, and the
   Group settings toggle turns visibility off and on again. */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/#/admin',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
global.confirm = (...args) => window.confirm(...args);

const errors = [];
const originalError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
window.addEventListener('error', (event) => errors.push(event.message));

const React = (await import('react')).default;
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { createSeedState } = await import('../src/data/seed.ts');
localStorage.setItem('orbit.portal.state.v1', JSON.stringify(createSeedState()));
const { StoreProvider, useStore } = await import('../src/store.tsx');
const { ToastProvider } = await import('../src/components/toast.tsx');
const { App } = await import('../src/App.tsx');
let latest;
function Probe() { latest = useStore(); return null; }
const root = createRoot(document.getElementById('root'));
await act(async () => { root.render(React.createElement(StoreProvider, null, React.createElement(ToastProvider, null, React.createElement(React.Fragment, null, React.createElement(Probe), React.createElement(App))))); });

const text = () => document.body.textContent ?? '';
const button = (label, parent = document) => {
  const result = [...parent.querySelectorAll('button')].find((row) => (row.textContent ?? '').trim() === label);
  assert.ok(result, `button ${label} should exist. Buttons: ${[...parent.querySelectorAll('button')].map((row) => row.textContent?.trim()).filter(Boolean).join(' | ').slice(-1000)}`);
  return result;
};
const click = async (node) => { await act(async () => { node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const navigate = async (view) => { await act(async () => { window.location.hash = `#/${view}`; window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); }); };
const dialog = (name) => {
  const result = document.querySelector(`[role="dialog"][aria-label="${name}"]`);
  assert.ok(result, `dialog ${name} should exist`);
  return result;
};
const setValue = async (node, next) => {
  assert.ok(node, `control for ${next} should exist`);
  const proto = node instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : node instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : node instanceof dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, next);
  await act(async () => { node.dispatchEvent(new dom.window.Event(node instanceof dom.window.HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};
const tenantGrid = () => [...document.querySelectorAll('div')].find((row) => row.className === 'mt-3 grid gap-2 px-4 pb-4 sm:grid-cols-2');
const tenantCard = (name) => {
  const grid = tenantGrid();
  assert.ok(grid, 'the tenant grid should render');
  return [...grid.children].find((row) => (row.textContent ?? '').includes(name));
};

/* The seeded workspace opens on Harbourline with the switch off. */
assert.equal(latest.tenant.id, 'tnt-harbourline');
await navigate('admin');

/* 1. With the switch off, the Tenants tab explains the missing tenant. */
assert.ok(text().includes('hidden behind the Master setup switch'), 'the hidden-tenant notice should explain the switch');
assert.ok(!text().includes('HFM · AUD · AU'), 'the Harris Farm tenant card should not be listed while the switch is off');

/* 2. One-click enable from the notice makes the tenant appear. */
await click(button('Enable now'));
assert.ok(!text().includes('hidden behind the Master setup switch'), 'the notice should disappear once enabled');
assert.ok(text().includes('HFM · AUD · AU'), 'the Harris Farm tenant card should appear once enabled');

/* 3. The tenant can be switched to and shows its own data. */
await click(button('Switch to tenant', tenantCard('HFM · AUD · AU')));
assert.equal(latest.tenant.id, 'tnt-harris-farm', 'switching to the tenant should make Harris Farm active');
assert.ok(text().includes('Information Technology'), 'the Harris Farm IT department should be visible after switching');

/* 4. The Group settings toggle turns visibility off and on again. */
await click(button('Group settings'));
const switchControl = document.querySelector('[role="switch"]');
assert.ok(switchControl, 'the Master setup toggle should render');
assert.equal(switchControl.getAttribute('aria-checked'), 'true', 'the toggle should start enabled after step 2');
await click(switchControl);
await click(button('Save settings'));
assert.equal(latest.tenant.id, 'tnt-harbourline', 'hiding the tenant should fall back to the default tenant');
await click(button('Tenants & calendar scope'));
assert.ok(text().includes('hidden behind the Master setup switch'), 'the notice should return when the switch is off again');
assert.ok(!text().includes('HFM · AUD · AU'), 'the tenant card should be hidden again');

await click(button('Group settings'));
const switchControl2 = document.querySelector('[role="switch"]');
assert.equal(switchControl2.getAttribute('aria-checked'), 'false', 'the toggle should reflect the disabled state');
await click(switchControl2);
await click(button('Save settings'));
assert.equal(latest.tenant.id, 'tnt-harris-farm', 're-enabling the switch should resume the remembered tenant');
await click(button('Tenants & calendar scope'));
assert.ok(text().includes('HFM · AUD · AU'), 're-enabling the switch should make the tenant card appear again');

/* 5. The tenant status can be Disabled from the Edit modal — the card stays
      visible with a Disabled badge and an Enable button. */
await click(button('Edit', tenantCard('HFM · AUD · AU')));
const editDialog = dialog('Edit tenant');
const statusSelect = [...editDialog.querySelectorAll('select')].find((row) => [...row.options].some((option) => option.value === 'disabled'));
assert.ok(statusSelect, 'the tenant status select should offer a Disabled option');
await setValue(statusSelect, 'disabled');
await click(button('Save tenant', editDialog));
const disabledCard = tenantCard('HFM · AUD · AU');
assert.ok((disabledCard.textContent ?? '').includes('disabled'), 'the tenant card should show a disabled badge');
assert.ok((disabledCard.textContent ?? '').includes('Enable'), 'a disabled tenant should offer an Enable button');
assert.equal(button('Switch to tenant', disabledCard).disabled, true, 'a disabled tenant cannot be switched to');

/* 6. Enable restores the tenant to active — the remembered tenant resumes. */
await click(button('Enable', disabledCard));
assert.ok((tenantCard('HFM · AUD · AU').textContent ?? '').includes('active'), 'enabling should restore the active badge');
assert.equal(latest.tenant.id, 'tnt-harris-farm', 'enabling restores the remembered tenant');

/* 7. Archiving keeps the tenant visible with a Restore button. */
await click(button('Edit', tenantCard('HFM · AUD · AU')));
const archivedDialog = dialog('Edit tenant');
const archivedSelect = [...archivedDialog.querySelectorAll('select')].find((row) => [...row.options].some((option) => option.value === 'archived'));
assert.ok(archivedSelect, 'the tenant status select should offer an Archived option');
await setValue(archivedSelect, 'archived');
await click(button('Save tenant', archivedDialog));
const archivedCard = tenantCard('HFM · AUD · AU');
assert.ok((archivedCard.textContent ?? '').includes('archived'), 'the tenant card should show an archived badge');
assert.ok((archivedCard.textContent ?? '').includes('Restore'), 'an archived tenant should offer a Restore button');
assert.equal(latest.tenant.id, 'tnt-harbourline', 'archiving the active tenant falls back to another tenant');

/* 8. Restoring brings the tenant back to active and switchable. */
await click(button('Restore', archivedCard));
const restoredCard = tenantCard('HFM · AUD · AU');
assert.ok((restoredCard.textContent ?? '').includes('active'), 'restoring should return the tenant to active');
assert.equal(latest.tenant.id, 'tnt-harris-farm', 'restoring brings the remembered tenant back');
assert.ok(!(restoredCard.textContent ?? '').includes('Restore'), 'a restored tenant no longer offers a Restore button');

if (errors.length) {
  console.error('React rendered errors:', errors.join('\n'));
  process.exit(1);
}
console.log('PASS: Master setup switch discoverability, one-click enable, tenant disable/archive with Enable/Restore, and switching all behave');
