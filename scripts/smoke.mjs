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
console.log('--- has dashboard:', text.includes('Meridian Group Holdings'));
assert.ok(text.includes('Meridian Group Holdings'), 'dashboard must render');
console.log('--- body sample:', text.slice(0, 400).replace(/\s+/g, ' '));
for (const v of ['calendar','activities','roadmap','timesheet','standups','projects','capitalisation','performance','integrations','admin']) {
  window.location.hash = '#/' + v;
  window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 900));
  const t = document.body.textContent || '';
  const h1 = document.querySelector('h1')?.textContent;
  assert.ok(h1 && t.length > 500, `view ${v} must render its heading and content`);
  const rows = document.querySelectorAll('tbody tr').length;
  const tables = document.querySelectorAll('table').length;
  console.log(`--- view ${v}: length ${t.length} h1=${h1} tables=${tables} rows=${rows}`);
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

const stored = localStorage.getItem('orbit.portal.state.v1');
console.log('--- stored bytes:', stored ? stored.length : 0);
console.log('--- errors:', errors.length);
errors.slice(0, 12).forEach((e) => console.log('  ERR:', e.slice(0, 500)));

assert.equal(errors.length, 0, 'all screens must render without console/window errors');
assert.ok(stored && JSON.parse(stored).employees.length > 0, 'local demo must persist');
root.unmount();
dom.window.close();
