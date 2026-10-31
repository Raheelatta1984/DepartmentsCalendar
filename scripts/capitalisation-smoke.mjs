import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { monthKey } from '../src/lib/capitalisation.ts';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));

const { createRoot } = await import('react-dom/client');
const { StoreProvider, useStore } = await import('../src/store.tsx');

let latest;
function Probe() {
  latest = useStore();
  return null;
}

const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(StoreProvider, null, React.createElement(Probe))));
// This regression script exercises the independent Harbourline capex demo;
// Harris Farm Markets is now the default tenant and has no invented projects.
await act(async () => latest.setActiveTenant('tnt-harbourline'));

assert.ok(latest.state.projects.length >= 100, 'seed must include 100+ IT projects');
const retailIt = latest.state.departments.find((dept) => dept.code === 'RIT');
assert.ok(retailIt, 'retail IT department missing');
const retailEntity = latest.state.entities.find((entity) => entity.id === retailIt.entityId);
assert.equal(retailEntity.countryCode, 'AU');
assert.equal(retailEntity.currency, 'AUD');
assert.equal(latest.state.projects.filter((project) => project.portfolio === 'capital').length, 30);

/* Submitting the pack snapshots live board numbers and records an audit entry. */
const month = monthKey(new Date());
const before = latest.state.capitalisationApprovals.length;
let submitted;
await act(async () => {
  submitted = latest.submitCapitalisation(retailEntity.id, retailIt.id, month);
});
assert.ok(submitted.capitalisedHours > 0, 'submission must carry capitalised hours');
assert.ok(submitted.capitalisedCostAUD > 0, 'submission must carry an AUD value');
assert.equal(submitted.status, 'submitted');
const afterSubmit = latest.state.capitalisationApprovals.find((row) => row.period === month && row.entityId === retailEntity.id);
assert.equal(afterSubmit.status, 'submitted');
assert.equal(latest.state.capitalisationApprovals.length, before, 'one approval row per entity/month');
assert.equal(
  latest.state.capitalisationApprovals.filter((row) => row.period === month && row.entityId === retailEntity.id).length,
  1,
  'the seeded month is refreshed, not duplicated',
);
assert.ok(latest.state.auditLog.some((entry) => entry.action === 'Capitalisation pack submitted'));

await act(async () => latest.submitCapitalisation(retailEntity.id, retailIt.id, month));
assert.equal(latest.state.capitalisationApprovals.length, before, 're-submitting refreshes instead of duplicating');

await act(async () => latest.decideCapitalisation(afterSubmit.id, 'approved', 'Approved by the board.'));
const decided = latest.state.capitalisationApprovals.find((row) => row.id === afterSubmit.id);
assert.equal(decided.status, 'approved');
assert.ok(decided.decidedById, 'decision must be attributed');
assert.equal(decided.note, 'Approved by the board.');

/* Loading the retail sample is additive: no existing record is lost. */
const entitiesBefore = latest.state.entities.length;
const activitiesBefore = latest.state.activities.length;
await act(async () => latest.loadRetailSample());
assert.equal(latest.state.entities.length, entitiesBefore, 'existing entities are preserved');
assert.equal(latest.state.activities.length, activitiesBefore, 'existing activities are preserved');

await act(async () => root.unmount());
console.log('PASS: board approval workflow snapshots capitalised hours, records the decision and never deletes existing data');
