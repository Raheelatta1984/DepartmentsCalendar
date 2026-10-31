import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/#/standups', pretendToBeVisual: true });
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
const value = async (node, next) => {
  assert.ok(node, `control for ${next} should exist`);
  const proto = node instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : node instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, next);
  await act(async () => { node.dispatchEvent(new dom.window.Event(node instanceof dom.window.HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};
const navigate = async (view) => { await act(async () => { window.location.hash = `#/${view}`; window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); }); };
const dialog = (name) => { const result = document.querySelector(`[role="dialog"][aria-label="${name}"]`); assert.ok(result, `dialog ${name} should exist`); return result; };
const person = (name) => { const result = latest.state.employees.find((row) => row.name === name); assert.ok(result, `missing ${name}`); return result; };
const setUser = async (name) => { await act(async () => latest.setActiveUser(person(name).id)); };

// Submit through the visible stand-up form and verify the reporting-line board.
await setUser('Pavithra');
await value(document.querySelector('textarea[placeholder^="e.g. Closed the vendor"]'), 'UI author update');
await value(document.querySelector('textarea[placeholder^="e.g. Payment run"]'), 'UI progress update');
await click(document.querySelectorAll('[role="radio"]')[3]);
await click(button('Submit stand-up'));
assert.ok(latest.state.standups.some((row) => row.employeeId === person('Pavithra').id && row.lastDayUpdate === 'UI author update' && row.feeling === 4 && row.status === 'submitted'));
await click(button('Reporting-line board'));
const ownRow = [...document.querySelectorAll('[role="button"]')].find((row) => row.textContent.includes('Pavithra'));
assert.ok(ownRow, 'board lists own row');
await click(ownRow);
assert.ok(text().includes('UI author update'), 'expanded board shows own submitted update');
assert.ok(text().includes('Reporting line'), 'board explains its visibility');

// Publish a cascade through the UI, then read it as a downstream report.
await setUser('Damien');
await value(document.querySelector('textarea[placeholder^="Share a leadership update"]'), 'UI cascade message');
await click(button('Publish update'));
await setUser('Pavithra');
assert.ok(text().includes('UI cascade message'), 'leadership update cascades to downstream employees');

// Create an activity with 8 planned/8 actual hours, then add and edit ledger time globally.
await navigate('activities');
await click(button('New activity'));
let activityDialog = dialog('Schedule new activity');
await value(activityDialog.querySelector('input[placeholder="e.g. Month-end close review with finance"]'), 'UI timed activity');
await value([...activityDialog.querySelectorAll('input[type="time"]')][1], '17:00');
await click(activityDialog.querySelector('input[type="checkbox"]'));
await value(activityDialog.querySelector('input[aria-label="Time entry end"]'), '17:00');
await click(button('Create activity', activityDialog));
const activity = latest.state.activities.find((row) => row.title === 'UI timed activity');
assert.ok(activity, 'activity should be created');
assert.equal(activity.plannedHours, 8);
assert.ok(latest.state.timeEntries.some((row) => row.activityId === activity.id && row.hours === 8), 'initial actual hours share the real ledger');
await navigate('standups');
await click(button('Log / update time'));
await click(button('Log time', dialog('Log or update time')));
let timeDialog = dialog('Log time');
await value([...timeDialog.querySelectorAll('select')].find((row) => [...row.options].some((option) => option.value === activity.id)), activity.id);
await value([...timeDialog.querySelectorAll('input[type="time"]')][0], '09:00');
await value([...timeDialog.querySelectorAll('input[type="time"]')][1], '11:30');
await click(button('Log time', timeDialog));
assert.ok(latest.state.timeEntries.some((row) => row.activityId === activity.id && row.hours === 2.5), 'global launcher adds time from another tab');
let picker = dialog('Log or update time');
const entryButton = [...picker.querySelectorAll('button')].find((row) => row.textContent.includes('UI timed activity') && row.textContent.includes('2.5h'));
assert.ok(entryButton, 'new entry can be edited from the global picker');
await click(entryButton);
timeDialog = dialog('Edit time entry');
await value([...timeDialog.querySelectorAll('input[type="time"]')][1], '12:00');
await click(button('Save', timeDialog));
assert.ok(latest.state.timeEntries.some((row) => row.activityId === activity.id && row.hours === 3), 'global launcher updates the same ledger row');
await click(button('Close', dialog('Log or update time')));

// Consent cancellation makes no request; a provider error does not produce a summary.
await navigate('one-on-ones');
await click(button('New one-on-one'));
let sessionDialog = dialog('One-on-one discussion');
await value(sessionDialog.querySelector('textarea[aria-label="Career progression tasks & advice"]'), 'Discuss growth opportunities');
await value(sessionDialog.querySelector('select[aria-label="Session feeling"]'), '4');
let calls = 0;
let consent = false;
window.confirm = () => consent;
global.fetch = async () => { calls++; return { ok: false, json: async () => ({ error: 'Provider temporarily unavailable.' }) }; };
await click(button('Generate AI summary & share', sessionDialog));
assert.equal(calls, 0, 'no provider call without consent');
consent = true;
await click(button('Generate AI summary & share', sessionDialog));
assert.equal(calls, 1);
assert.ok(text().includes('Provider temporarily unavailable.'), 'provider error is visible');
assert.equal(latest.state.oneOnOnes.length, 0, 'provider error did not save or invent a summary');
let sent;
global.fetch = async (_url, options) => { calls++; sent = JSON.parse(options.body); return { ok: true, json: async () => ({ summary: 'Agreed to discuss growth.', model: 'test-provider' }) }; };
await click(button('Generate AI summary & share', sessionDialog));
assert.equal(sent.careerProgression, 'Discuss growth opportunities');
assert.ok(!('employeeId' in sent) && !('name' in sent), 'no names or IDs sent automatically');
assert.equal(latest.state.oneOnOnes[0]?.summary, 'Agreed to discuss growth.');
assert.ok(text().includes('not suitable for confidential personnel information'), 'pilot limitation remains visible');

// Repeated performance scans cannot duplicate a source/period escalation.
await setUser('Damien');
await navigate('performance');
await click(button('Run performance scan'));
const scans = () => latest.state.escalations.filter((row) => row.raisedById === person('Damien').id && row.sourceDepartmentId);
assert.ok(scans().length > 0, 'scan created at least one below-threshold escalation');
const count = scans().length;
await click(button('Run performance scan'));
assert.equal(scans().length, count, 'second scan does not duplicate the escalation');
assert.ok(text().includes('No new escalations needed'));

// No top-level reporting lead: the UI reports a real error, not success.
await setUser('Angus Harris');
await click(button('Raise escalation'));
let escalationDialog = dialog('Raise an escalation');
await value(escalationDialog.querySelector('textarea[aria-label="Escalation concern"]'), 'UI escalation concern');
assert.ok(button('Raise urgent follow-up', escalationDialog).disabled, 'top-level user cannot raise without a reporting lead');
assert.ok(text().includes('No reporting lead configured'), 'missing lead is explained');
await click(button('Cancel', escalationDialog));
// A stale lead is present but inactive: the store rejects the action and the UI reports it.
const staleLead = person('Swechchha');
await act(async () => latest.upsertEmployee({ ...staleLead, status: 'inactive' }));
await setUser('Damien');
await click(button('Raise escalation'));
escalationDialog = dialog('Raise an escalation');
await value(escalationDialog.querySelector('textarea[aria-label="Escalation concern"]'), 'UI escalation concern');
await click(button('Raise urgent follow-up', escalationDialog));
assert.ok(text().includes('A current reporting lead is required'), 'invalid lead produces an error toast');
assert.ok(!latest.state.escalations.some((row) => row.note === 'UI escalation concern'), 'failed creation does not mutate');

assert.equal(errors.length, 0, `UI should have no React or browser errors: ${errors.join('\n')}`);
await act(async () => root.unmount());
console.log('PASS UI stand-up, cascade, activity/global ledger, consent/provider errors, scan deduplication and escalation errors');
process.exit(0);
