import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
window.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

const { createRoot } = await import('react-dom/client');
const { StoreProvider, useStore, emptyActivity, emptyStandup, emptyEscalation, normaliseState } = await import('../src/store.tsx');
const { HARRIS_FARM_EMPLOYEE_IDS: ids } = await import('../src/data/harris-farm-seed.ts');
const { createSeedState } = await import('../src/data/seed.ts');
const { standupVisibleIds, standupStateForViewer, canSeeLeadershipUpdate, canViewEscalation, canViewOneOnOne, canReadOneOnOneNotes, feelingScale } = await import('../src/lib/people-workflows.ts');
const { standupLayers } = await import('../src/lib/standups.ts');
const { scopeStateToTenant, scopeStateToDepartments, mergeTenantState, removeTenant } = await import('../src/lib/tenants.ts');
const { toSharedState } = await import('../src/lib/workspace-api.ts');
const { workspaceSchema } = await import('../server/validation.mjs');
const { MAX_BODY_BYTES } = await import('../server/app.mjs');
let latest;
function Probe() { latest = useStore(); return null; }
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(StoreProvider, null, React.createElement(Probe))));
const switchUser = async (id) => { await act(async () => latest.setActiveUser(id)); assert.equal(latest.scope.user.id, id); };
const now = new Date().toISOString();
const date = now.slice(0, 10);

// Five actual levels: Angus → RAM → Swechchha → Damien → Pavithra.
const viewerIds = standupVisibleIds(latest.state.employees, ids.pavithra);
assert.ok(viewerIds.has(ids.pavithra) && viewerIds.has(ids.damien));
for (const id of [ids.swechchha, ids.ram, ids.angus, ids.rahil, ids.rob]) assert.ok(!viewerIds.has(id), `higher or unrelated personal stand-up excluded: ${id}`);
const leadIds = standupVisibleIds(latest.state.employees, ids.damien);
for (const id of [ids.damien, ids.swechchha, ids.pavithra, ids.rahil, ids.natasha]) assert.ok(leadIds.has(id));
assert.ok(!leadIds.has(ids.ram) && !leadIds.has(ids.angus) && !leadIds.has(ids.rob));
for (const id of [ids.angus, ids.ram, ids.swechchha, ids.damien, ids.pavithra]) {
  await switchUser(id);
  const entry = { ...emptyStandup(latest.state, date), feeling: 3, lastDayUpdate: `Personal update ${id}`, progressUpdate: 'On track', status: 'submitted', submittedAt: now };
  await act(async () => latest.upsertStandup(entry));
}
await switchUser(ids.ram);
await act(async () => assert.equal(latest.publishLeadershipUpdate('Leadership direction, cascaded separately.'), null));
const update = latest.state.leadershipUpdates[0];
assert.ok(canSeeLeadershipUpdate(latest.state, ids.pavithra, update));
assert.ok(!canSeeLeadershipUpdate(latest.state, ids.rob, update));
await switchUser(ids.pavithra);
assert.match(latest.publishLeadershipUpdate('not a lead') ?? '', /heads and leads/);
const visible = standupStateForViewer(latest.state, ids.pavithra);
assert.ok(visible.standups.some((row) => row.employeeId === ids.damien));
assert.ok(!visible.standups.some((row) => [ids.swechchha, ids.ram, ids.angus].includes(row.employeeId)));
assert.ok(visible.leadershipUpdates.some((row) => canSeeLeadershipUpdate(latest.state, ids.pavithra, row)));
const fakeDraft = { ...visible.standups.find((row) => row.employeeId === ids.damien), status: 'draft' };
assert.ok(!standupStateForViewer({ ...latest.state, standups: [fakeDraft] }, ids.pavithra).standups.length, 'other people’s drafts are hidden');
const layers = standupLayers(standupStateForViewer(latest.state, ids.damien), latest.state.departments.find((d) => d.id === latest.scope.user.departmentId), date);
assert.ok(layers.some((row) => row.label === 'BA Leads') && layers.some((row) => row.label === 'QA Leads'));
assert.ok(layers.every((row) => !/manager|supervisor/i.test(row.label)));
console.log('PASS stand-up visibility, draft privacy, business layers and leadership cascade');

// A new activity and its 6 actual hours save atomically; editing does not duplicate the ledger.
const activity = emptyActivity(latest.state, { id: 'act-inline-test', title: 'Eight planned, six actual', startDate: date, endDate: date, startTime: '09:00', endTime: '17:00', plannedHours: 8, sync: { outlook: false, google: false } });
const actual = { id: 'time-inline-test', employeeId: ids.pavithra, activityId: activity.id, date, startTime: '09:00', endTime: '15:00', hours: 6, note: '', billable: true, approved: false };
await act(async () => assert.equal(latest.upsertActivity(activity, actual), null));
assert.equal(latest.state.activities.find((row) => row.id === activity.id).plannedHours, 8);
assert.equal(latest.state.timeEntries.find((row) => row.id === actual.id).hours, 6);
await act(async () => assert.equal(latest.addTimeEntry({ ...actual, endTime: '16:00', hours: 7 }), null));
assert.equal(latest.state.timeEntries.filter((row) => row.id === actual.id).length, 1);
assert.equal(latest.state.timeEntries.find((row) => row.id === actual.id).hours, 7);
assert.match(latest.upsertActivity({ ...activity, id: 'bad-activity' }, { ...actual, id: 'bad-time', activityId: 'bad-activity', endTime: '14:00' }) ?? '', /do not match/);
assert.ok(!latest.state.activities.some((row) => row.id === 'bad-activity'), 'invalid actual time blocks both writes');
console.log('PASS planned versus actual hours, atomic create and timesheet updates');

// Ignore arbitrary recipient and CC input; route to the immediate lead with one urgent activity.
const escalation = { ...emptyEscalation(latest.state, latest.scope.user.departmentId), id: 'esc-line-test', note: 'Need support', recipients: [ids.angus], cc: [ids.rob] };
await act(async () => assert.equal(latest.upsertEscalation(escalation), null));
const raised = latest.state.escalations.find((row) => row.id === escalation.id);
assert.equal(raised.raisedById, ids.pavithra);
assert.deepEqual(raised.recipients, [ids.damien]);
assert.deepEqual(raised.cc, []);
const urgent = latest.state.activities.find((row) => row.id === raised.followUpActivityId);
assert.equal(urgent.assigneeId, ids.damien);
assert.equal(urgent.type, 'follow_up');
assert.equal(urgent.priority, 'critical');
assert.ok(canViewEscalation(latest.state, ids.swechchha, raised));
assert.ok(!canViewEscalation(latest.state, ids.rob, raised));
await switchUser(ids.swechchha);
assert.match(latest.addEscalationFollowUp(raised.id, ids.rob, 'No unrelated staff', true) ?? '', /reporting line/);
await act(async () => assert.equal(latest.addEscalationFollowUp(raised.id, ids.pavithra, 'Please discuss support options.', true), null));
const follow = latest.state.escalations.find((row) => row.id === raised.id).followUps[0];
assert.equal(follow.authorId, ids.swechchha);
assert.equal(follow.targetId, ids.pavithra);
const followTask = latest.state.activities.find((row) => row.id === follow.activityId);
assert.equal(followTask.assigneeId, ids.pavithra);
assert.equal(followTask.type, 'follow_up');
assert.equal(followTask.priority, 'critical');
await switchUser(ids.rob);
assert.match(latest.addEscalationFollowUp(raised.id, ids.rob, 'Unauthorized', false) ?? '', /outside your reporting line/);
await act(async () => latest.setEscalationStatus(raised.id, 'closed'));
assert.equal(latest.state.escalations.find((row) => row.id === raised.id).status, 'open');
await switchUser(ids.angus);
assert.match(latest.upsertEscalation({ ...escalation, id: 'no-manager' }) ?? '', /reporting lead/);
console.log('PASS upward-only escalation, urgent activity and top-to-bottom follow-up');

// Only participants can edit; leadership sees the generated summary, not portal discussion notes.
await switchUser(ids.pavithra);
const session = { id: 'one-line-test', employeeId: ids.pavithra, managerId: ids.damien, departmentId: latest.scope.user.departmentId, date, feeling: 2, workLifeBalance: 'Balance', support: 'Support', escalation: 'Escalation', discussion: 'Discussion', improvement: 'Feedback', careerProgression: 'Career task and advice', summary: '', summaryModel: '', summaryGeneratedAt: null, createdAt: now, updatedAt: now };
assert.match(latest.upsertOneOnOne({ ...session, managerId: ids.ram }) ?? '', /direct reporting lead/);
await act(async () => assert.equal(latest.upsertOneOnOne(session), null));
assert.ok(canReadOneOnOneNotes(session, ids.pavithra) && canReadOneOnOneNotes(session, ids.damien));
assert.ok(!canViewOneOnOne(latest.state, ids.swechchha, session), 'draft not shown to higher leader');
const generated = { ...session, summary: 'AI provider summary', summaryModel: 'test-model', summaryGeneratedAt: now };
await act(async () => assert.equal(latest.upsertOneOnOne(generated), null));
for (const id of [ids.pavithra, ids.damien, ids.swechchha, ids.ram, ids.angus]) assert.ok(canViewOneOnOne(latest.state, id, generated));
assert.ok(!canViewOneOnOne(latest.state, ids.rob, generated));
assert.ok(!canReadOneOnOneNotes(generated, ids.swechchha));
await switchUser(ids.swechchha);
assert.match(latest.upsertOneOnOne({ ...generated, discussion: 'Not permitted' }) ?? '', /Only the employee/);
await switchUser(ids.damien);
await act(async () => assert.equal(latest.upsertOneOnOne({ ...generated, discussion: 'Updated discussion' }), null));
const edited = latest.state.oneOnOnes.find((row) => row.id === session.id);
assert.equal(edited.summary, '', 'editing source notes invalidates the stale shared summary');
assert.ok(!canViewOneOnOne(latest.state, ids.swechchha, edited));
// Removing master records with people history must not orphan or silently discard it.
assert.match(latest.deleteEmployee(ids.pavithra) ?? '', /Mark them inactive/);
assert.match(latest.deleteEmployee(ids.damien) ?? '', /Mark them inactive/);
assert.match(latest.deleteDepartment(session.departmentId) ?? '', /history/);
assert.match(latest.deleteEntity(latest.state.employees.find((row) => row.id === ids.pavithra).entityId) ?? '', /history/);
assert.ok(latest.state.oneOnOnes.some((row) => row.id === session.id));
console.log('PASS one-on-one participants, leadership sharing and summary invalidation');

// Tenant-specific feeling scale, backwards compatibility and all tenant lifecycle paths.
const tenant = latest.tenant;
const custom = feelingScale(tenant).map((row) => row.value === 1 ? { ...row, label: 'Needs support', color: '#123456' } : row);
await act(async () => latest.upsertTenant({ ...tenant, feelingScale: custom }));
assert.equal(feelingScale(latest.tenant)[0].label, 'Needs support');
const healed = normaliseState({ ...latest.state, oneOnOnes: undefined, leadershipUpdates: undefined });
assert.deepEqual(healed.oneOnOnes, []); assert.deepEqual(healed.leadershipUpdates, []);
const original = createSeedState();
const merged = mergeTenantState(original, latest.state, latest.tenant.id);
const harris = scopeStateToTenant(merged, latest.tenant.id);
const other = scopeStateToTenant(merged, 'tnt-harbourline');
assert.ok(harris.oneOnOnes.some((row) => row.id === session.id));
assert.ok(harris.leadershipUpdates.some((row) => row.id === update.id));
assert.equal(other.oneOnOnes.length, 0); assert.equal(other.leadershipUpdates.length, 0);
assert.ok(scopeStateToDepartments(harris, [harris.departments[0].id]).oneOnOnes.some((row) => row.id === session.id));
assert.ok(!removeTenant(merged, latest.tenant.id).oneOnOnes.some((row) => row.id === session.id));
const parsed = workspaceSchema.safeParse(toSharedState(merged));
assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
assert.ok(Buffer.byteLength(JSON.stringify({ version: 0, state: parsed.data })) < MAX_BODY_BYTES);
console.log('PASS feeling configuration, schema, old snapshots and tenant isolation');

await act(async () => root.unmount());
