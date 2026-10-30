import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/#/dashboard', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.IS_REACT_ACT_ENVIRONMENT = false;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
window.scrollTo = () => {};

const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); origError(...args); };
window.addEventListener('error', (e) => errors.push('window error: ' + e.message));

const { createRoot } = await import('react-dom/client');
const React = (await import('react')).default;
const { StoreProvider } = await import('../src/store.tsx');
const { ToastProvider } = await import('../src/components/toast.tsx');
const { App } = await import('../src/App.tsx');

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(StoreProvider, null, React.createElement(ToastProvider, null, React.createElement(App))));
await new Promise((r) => setTimeout(r, 2500));

const text = document.body.textContent || '';
console.log('--- rendered length:', text.length);
/* The portal opens on the IT-first tenant, so the command centre names that
   tenant — never another tenant’s group name. */
const tenantSelect = document.querySelector('select[aria-label="Tenant"]');
assert.ok(tenantSelect, 'the top bar exposes a tenant switcher');
console.log('--- active tenant:', tenantSelect.value);
assert.equal(tenantSelect.value, 'tnt-harbourline', 'the IT-first tenant is the default');
assert.ok(text.includes('Harbourline Retail Australia'), 'dashboard must render the active tenant');
/* The switcher lists tenant names only — never their entities, departments
   or people. Isolation is checked against Meridian rows here. */
assert.ok(!text.includes('Arjun Mehta'), 'another tenant’s people must never be on screen');
assert.ok(!text.includes('Accounts & Finance'), 'another tenant’s departments must never be on screen');
assert.ok(!text.includes('Meridian Contracting'), 'another tenant’s entities must never be on screen');
console.log('--- body sample:', text.slice(0, 400).replace(/\s+/g, ' '));
for (const v of ['calendar','activities','roadmap','timesheet','standups','leave','delivery','effort-reports','projects','capitalisation','performance','integrations','admin']) {
  window.location.hash = '#/' + v;
  window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 900));
  const t = document.body.textContent || '';
  const h1 = document.querySelector('h1')?.textContent;
  assert.ok(h1 && t.length > 500, `view ${v} must render its heading and content`);
  const rows = document.querySelectorAll('tbody tr').length;
  const tables = document.querySelectorAll('table').length;
  console.log(`--- view ${v}: length ${t.length} h1=${h1} tables=${tables} rows=${rows}`);
  if (v === 'leave') {
    assert.ok(t.includes('PTO entitlement'), 'the leave tab shows the PTO balance');
    assert.ok(t.includes('PH excluded'), 'public holidays are reported separately from PTO');
    assert.ok(t.includes('Plan a holiday'), 'an employee can log a tentative date');
    assert.ok(t.includes('Approvals'), 'the approval queue sub-tab is present');
    assert.ok(!t.includes('Arjun Mehta') && !t.includes('Fatima Noor'), 'no cross-tenant people in the leave tab');
  }
  if (v === 'calendar') {
    assert.ok(/public holiday|PH/.test(t), 'public holidays are marked as PH on the calendar');
    assert.ok(t.includes('On leave & next responsible'), 'the calendar tells colleagues who is away and who to ask');
  }
  if (v === 'admin') {
    assert.ok(t.includes('Tenants & calendar scope'), 'master setup exposes the tenant and calendar-scope settings');
  }
}
/* The command centre opens on the signed-in person's own entity, and the
   sticky note keeps the guide shape: Do this, Watch, Live context. */
const note = document.querySelector('[aria-label="AI guide"]');
assert.ok(note, 'the AI guide sticky note must render');
const noteText = (note.textContent || '').replace(/\s+/g, ' ');
assert.ok(noteText.includes('Guide'), 'the note carries the GUIDE badge');
assert.ok(noteText.includes('Do this:'), 'the note lists numbered Do this steps');
assert.ok(noteText.includes('Watch:'), 'the note keeps its Watch caution');
assert.ok(/Live context \(\d+\)/.test(noteText), 'the note exposes a Live context disclosure');
assert.ok(noteText.includes('guidance, not advice'), 'the note keeps its provenance line');

window.location.hash = '#/dashboard';
window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
await new Promise((r) => setTimeout(r, 600));
const entityPicker = document.querySelector('select[aria-label="Entity"]');
assert.ok(entityPicker, 'the command centre exposes an entity picker');
assert.ok(entityPicker.value && entityPicker.value !== 'all', 'the command centre opens on the person’s own entity');
assert.ok(document.querySelector('select[aria-label="Department"]'), 'the department filter stays available inside the entity');
console.log('--- entity picker default:', entityPicker.value, 'options:', entityPicker.options.length);

/* The single-department master setting is applied to the whole tenant. */
const departmentOptions = [...document.querySelectorAll('select[aria-label="Department"] option')].map((option) => option.textContent);
assert.deepEqual(departmentOptions.filter((label) => label && !/all/i.test(label)), ['Information Technology (PMO)'], 'the calendar scope is the IT department only');
console.log('--- department options:', departmentOptions.join(' | '));

const stored = localStorage.getItem('orbit.portal.state.v1');
console.log('--- stored bytes:', stored ? stored.length : 0);
console.log('--- errors:', errors.length);
errors.slice(0, 12).forEach((e) => console.log('  ERR:', e.slice(0, 500)));

assert.equal(errors.length, 0, 'all screens must render without console/window errors');
assert.ok(stored && JSON.parse(stored).employees.length > 0, 'local demo must persist');
root.unmount();
dom.window.close();
