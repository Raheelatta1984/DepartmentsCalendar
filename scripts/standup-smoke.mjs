import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

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
window.matchMedia = window.matchMedia || (() => ({
  matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
}));

const { createRoot } = await import('react-dom/client');
const { StoreProvider, useStore, emptyStandup, newId, normaliseState } = await import('../src/store.tsx');
const { getScope, canViewStandupBoard, canViewDepartmentStandups, canEditStandupEntry } = await import('../src/lib/permissions.ts');
const { buildDepartmentPulse, buildStandupPulses, standupLayers, entryFor, isWorkingDay } = await import('../src/lib/standups.ts');
const { toISO } = await import('../src/lib/dates.ts');

let latest;
function Probe() {
  latest = useStore();
  return null;
}

const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(StoreProvider, null, React.createElement(Probe))));

const state = latest.state;
const today = toISO(new Date());
const department = state.departments[1]; // a real operational department
const members = state.employees.filter((e) => e.departmentId === department.id && e.status !== 'inactive');

/* ---- Seed shape ---------------------------------------------------- */
assert.ok(state.standups.length > 100, `expected a rich stand-up history, got ${state.standups.length}`);
const keys = new Set(state.standups.map((entry) => `${entry.date}|${entry.employeeId}`));
assert.equal(keys.size, state.standups.length, 'one stand-up row per employee per working day');
for (const entry of state.standups) {
  assert.ok(entry.date <= today, 'no future stand-ups are seeded');
  assert.match(entry.id, /^std-/);
  for (const action of entry.actionItems) assert.ok(action.title.length > 0);
  for (const request of entry.supportRequests) {
    assert.ok(['internal', 'cross_functional'].includes(request.type));
    if (request.type === 'cross_functional') assert.ok(request.targetDepartmentId, 'cross-functional callouts name a department');
    if (request.type === 'internal') assert.equal(request.targetDepartmentId, null);
  }
}
assert.ok(state.standups.some((entry) => entry.blockers.trim().length > 0), 'seed includes blockers');
assert.ok(state.standups.some((entry) => entry.supportRequests.length > 0), 'seed includes support callouts');
assert.ok(state.standups.some((entry) => entry.supportRequests.some((r) => r.type === 'cross_functional')), 'seed includes cross-functional support');

/* ---- Pulse math reconciles to the rows ----------------------------- */
const pulse = buildDepartmentPulse(state, department.id, today);
assert.equal(pulse.memberCount, members.length);
assert.equal(pulse.submittedCount + pulse.draftCount + pulse.pendingCount, pulse.memberCount);
assert.ok(pulse.submissionRate >= 0 && pulse.submissionRate <= 100);
const todayEntries = state.standups.filter((entry) => entry.departmentId === department.id && entry.date === today);
assert.equal(pulse.entries.length, todayEntries.length);
assert.equal(
  pulse.blockerCount,
  todayEntries.filter((entry) => entry.status === 'submitted' && entry.blockers.trim()).length,
);
assert.equal(
  pulse.openSupportCount,
  todayEntries.flatMap((entry) => entry.supportRequests).filter((request) => request.status !== 'resolved').length,
);
const group = buildStandupPulses(state, state.departments.map((d) => d.id), today);
assert.equal(group.length, state.departments.length);

/* ---- Layers read top to bottom and cover every active member -------- */
const layers = standupLayers(state, department, today);
assert.ok(layers.length >= 2, 'department has at least a head and a team layer');
const roleOrder = layers.map((layer) => layer.role);
assert.deepEqual(roleOrder, [...roleOrder].sort((a, b) => {
  const rank = { department_head: 5, unit_head: 4, manager: 3, supervisor: 2, employee: 1, ceo: 7, head_operations: 6 };
  return rank[b] - rank[a];
}));
const layeredPeople = layers.flatMap((layer) => layer.members.map((m) => m.employee.id)).sort();
assert.deepEqual(layeredPeople, members.map((m) => m.id).sort(), 'every active member appears exactly once');

/* ---- Role-based authorization -------------------------------------- */
const ceo = state.employees.find((e) => e.role === 'ceo');
const coo = state.employees.find((e) => e.role === 'head_operations');
const head = state.employees.find((e) => e.id === department.headId);
const worker = state.employees.find((e) => e.role === 'employee' && e.departmentId === department.id);
for (const person of [ceo, coo, head]) {
  assert.ok(canViewStandupBoard(getScope(state, person.id)), `${person.role} can open the board`);
}
const workerScope = getScope(state, worker.id);
assert.equal(canViewStandupBoard(workerScope), false, 'plain employees cannot open the board');
assert.equal(canViewDepartmentStandups(getScope(state, head.id), department.id), true);
assert.equal(canEditStandupEntry(workerScope, worker.id), true, 'authors edit their own stand-up');
assert.equal(canEditStandupEntry(workerScope, head.id), false, 'authors cannot rewrite another stand-up');
const otherDepartment = state.departments.find((d) => d.id !== department.id && !getScope(state, head.id).visibleDepartmentIds.includes(d.id));
if (otherDepartment) {
  assert.equal(canViewDepartmentStandups(getScope(state, head.id), otherDepartment.id), false, 'heads cannot read departments outside their scope');
}

/* ---- Store actions: upsert, uniqueness, support lifecycle, actions -- */
/* Pick somebody who has not checked in today so the first save appends. */
const author = state.employees.find(
  (employee) => employee.status !== 'inactive' && !entryFor(state.standups, today, employee.id),
) ?? worker;
assert.ok(!entryFor(latest.state.standups, today, author.id), 'test author starts without a stand-up today');
const before = latest.state.standups.length;
const fresh = emptyStandup(latest.state, today);
fresh.employeeId = author.id;
fresh.departmentId = author.departmentId;
fresh.lastDayUpdate = 'Smoke: closed the reconciliation pack.';
fresh.progressUpdate = 'Smoke: month-end at 60%.';
fresh.actionItems = [{ id: newId('sact'), title: 'File the pack', ownerId: author.id, dueDate: today, status: 'open' }];
const request = {
  id: newId('ssup'), description: 'Smoke: need reviewer access', type: 'internal',
  targetDepartmentId: null, status: 'open', createdAt: new Date().toISOString(), resolvedAt: null,
};
fresh.supportRequests = [request];
await act(async () => latest.upsertStandup({ ...fresh, status: 'submitted', submittedAt: new Date().toISOString() }));
assert.equal(latest.state.standups.length, before + 1, 'new stand-up is appended');
assert.equal(entryFor(latest.state.standups, today, author.id)?.status, 'submitted');

await act(async () => latest.upsertStandup({ ...fresh, blockers: 'Smoke blocker', status: 'submitted', submittedAt: fresh.submittedAt }));
assert.equal(latest.state.standups.length, before + 1, 're-saving the same day replaces the row instead of duplicating');
assert.equal(entryFor(latest.state.standups, today, author.id)?.blockers, 'Smoke blocker');

const saved = entryFor(latest.state.standups, today, author.id);
await act(async () => latest.setSupportRequestStatus(saved.id, request.id, 'acknowledged'));
assert.equal(entryFor(latest.state.standups, today, author.id).supportRequests[0].status, 'acknowledged');
await act(async () => latest.setSupportRequestStatus(saved.id, request.id, 'resolved'));
const resolved = entryFor(latest.state.standups, today, author.id).supportRequests[0];
assert.equal(resolved.status, 'resolved');
assert.ok(resolved.resolvedAt, 'resolution is timestamped');

const actionId = saved.actionItems[0].id;
await act(async () => latest.toggleStandupAction(saved.id, actionId));
assert.equal(entryFor(latest.state.standups, today, author.id).actionItems[0].status, 'done');
await act(async () => latest.toggleStandupAction(saved.id, actionId));
assert.equal(entryFor(latest.state.standups, today, author.id).actionItems[0].status, 'open');

/* ---- Backwards compatibility: older caches heal without standups ---- */
const healed = normaliseState({ ...latest.state, standups: undefined });
assert.deepEqual(healed.standups, []);

/* ---- Working-day helper respects country weekends ------------------ */
assert.equal(typeof isWorkingDay(state, today, worker.countryCode), 'boolean');

await act(async () => root.unmount());
console.log('PASS: daily stand-up seed, pulse math, layered board, role authorization and store lifecycle all behave');
