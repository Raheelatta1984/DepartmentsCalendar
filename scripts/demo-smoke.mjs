import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/* ------------------------------------------------------------------ */
/* App demo smoke                                                      */
/*                                                                     */
/* Renders the store-style demo screen, switches tenant via the        */
/* selector, and validates the pure demo model + PDF export.           */
/* ------------------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/#/demo', pretendToBeVisual: true });
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
console.error = (...args) => { const message = args.map(String).join(' '); if (!message.includes('not wrapped in act')) errors.push(message); originalError(...args); };
window.addEventListener('error', (event) => errors.push(event.message));

const React = (await import('react')).default;
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { createSeedState } = await import('../src/data/seed.ts');
const { buildDemoModel, demoEntityOptions } = await import('../src/lib/demo-content.ts');
const { buildDemoPDF } = await import('../src/lib/demo-pdf.ts');

const seed = createSeedState();

// Pure model: tenant + entity selection changes brand, name and stats; stays tenant-scoped.
const meridian = buildDemoModel(seed, seed.tenants.find((t) => t.id === 'tnt-meridian'), 'ent-group');
const harbourlineEntities = demoEntityOptions(seed, 'tnt-harbourline');
const harbourline = buildDemoModel(seed, seed.tenants.find((t) => t.id === 'tnt-harbourline'), harbourlineEntities[0].entity.id);
assert.notEqual(meridian.appName, harbourline.appName, 'app name follows the selected entity');
assert.ok(meridian.appName.includes('Meridian'), `meridian model branded: ${meridian.appName}`);
assert.ok(harbourline.appName.includes(harbourlineEntities[0].entity.name));
assert.notEqual(meridian.tenantName, harbourline.tenantName);
assert.ok(meridian.stats.length === 4 && harbourline.stats.length === 4);
assert.ok(meridian.screenshots.length === 4 && harbourline.screenshots.every((s) => s.points.length > 0));
assert.ok(!JSON.stringify(meridian.screenshots).includes('Harris'), 'meridian demo never mentions the other tenant');
console.log('PASS: demo model follows tenant + entity selection and stays tenant-scoped');

// PDF: real PDF, cover + one page per screenshot + features page.
const pdf = buildDemoPDF(meridian);
assert.ok(pdf.output().startsWith('%PDF'));
assert.equal(pdf.getNumberOfPages(), 2 + meridian.screenshots.length);
console.log('PASS: demo PDF is a real multi-page PDF (cover + screenshots + features)');

// Screen: renders and the tenant selector re-brands the demo.
localStorage.setItem('orbit.portal.state.v1', JSON.stringify(seed));
const { StoreProvider } = await import('../src/store.tsx');
const { ToastProvider } = await import('../src/components/toast.tsx');
const { App } = await import('../src/App.tsx');
const { NAV_ITEMS } = await import('../src/components/Layout.tsx');
assert.ok(NAV_ITEMS.some((item) => item.id === 'demo'), 'app demo is in the navigation');

const root = createRoot(document.getElementById('root'));
await act(async () => {
  root.render(React.createElement(StoreProvider, null, React.createElement(ToastProvider, null, React.createElement(App))));
});
let html = document.getElementById('root').innerHTML;
assert.ok(html.includes('App demo'), 'demo page renders');
assert.ok(html.includes('Screenshots'), 'screenshot carousel section renders');
assert.ok(html.includes('Why every company needs it'), 'features section renders');
assert.ok(html.includes('Export demo PDF'), 'PDF export action renders');
assert.ok(html.includes('Orbit ·'), 'store-style app name renders');

// Switch tenant in the selector: the hero app name must change.
const selects = [...document.querySelectorAll('select')];
const tenantSelect = selects[0];
assert.ok(tenantSelect, 'tenant selector renders');
const options = [...tenantSelect.options].map((o) => o.value);
assert.ok(options.length >= 2, `multiple tenants selectable: ${options.join(',')}`);
const target = options.find((v) => v !== tenantSelect.value);
const before = document.getElementById('root').innerHTML.match(/Orbit · [^<]+/)?.[0];
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(tenantSelect, target);
  tenantSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
});
html = document.getElementById('root').innerHTML;
const after = html.match(/Orbit · [^<]+/)?.[0];
assert.ok(before && after && before !== after, `tenant switch re-brands the demo: "${before}" → "${after}"`);
console.log('PASS: demo screen renders, tenant selector re-renders brand and content live');

assert.deepEqual(errors, [], `no runtime errors: ${errors.join(' | ')}`);
console.log('PASS: app demo smoke — model, PDF, screen and tenant switching all behave');
