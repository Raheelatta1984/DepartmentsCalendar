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
const tenantGrid = [...document.querySelectorAll('div')].find((row) => row.className === 'mt-3 grid gap-2 px-4 pb-4 sm:grid-cols-2');
assert.ok(tenantGrid, 'the tenant grid should render');
const harrisCard = [...tenantGrid.children].find((row) => (row.textContent ?? '').includes('HFM · AUD · AU'));
assert.ok(harrisCard, 'the Harris Farm tenant card should be in the grid');
await click(button('Switch to tenant', harrisCard));
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
await click(button('Tenants & calendar scope'));
assert.ok(text().includes('HFM · AUD · AU'), 're-enabling the switch should make the tenant card appear again');

if (errors.length) {
  console.error('React rendered errors:', errors.join('\n'));
  process.exit(1);
}
console.log('PASS: Master setup hidden-tenant notice, one-click enable, tenant switch and the Group settings toggle all behave');
