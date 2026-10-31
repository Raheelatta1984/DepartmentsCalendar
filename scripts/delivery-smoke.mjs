import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createSeedState } from '../src/data/seed.ts';
import { devopsSampleWorkItems, withDeliverySample } from '../src/data/delivery-seed.ts';
import { acceptanceCriteriaList, effortReport, linkActivity, linkWorkItemsToParent, parseCSV, parseImport, plannedHoursInPeriod, previewImport, streamDescendants, validStreamParent, validateWorkItem, workItemDescendants } from '../src/lib/delivery.ts';
import { capitalisationEligibility, projectLoggedStats } from '../src/lib/capitalisation.ts';
import { mergeTenantState, scopeStateToTenant } from '../src/lib/tenants.ts';
import { workspaceSchema } from '../server/validation.mjs';
import { toSharedState } from '../src/lib/workspace-api.ts';

const seed = createSeedState();
const state = scopeStateToTenant(seed, 'tnt-harbourline');
const defaults = { departmentId: 'rdept-it', projectId: '', streamId: '', organization: 'test-org', devopsProject: 'TestProject' };
const rows = parseImport(JSON.stringify([
  { externalId: '30', kind: 'ticket', title: 'Build adapter', parentExternalId: '20', funding: 'unclassified', estimateHours: 8 },
  { externalId: '20', kind: 'feature', title: 'Payments', parentExternalId: '10', funding: 'unclassified' },
  { externalId: '10', kind: 'epic', title: 'Modernisation', funding: 'unclassified' },
]), 'json');
const preview = previewImport(state, rows, defaults, '2026-10-30T00:00:00.000Z');
assert.deepEqual(preview.errors, []);
assert.equal(preview.created, 3);
const imported = { ...state, workItems: [...preview.items, ...state.workItems] };
const again = previewImport(imported, rows, defaults, '2026-10-31T00:00:00.000Z');
assert.equal(again.created, 0); assert.equal(again.updated, 0); assert.equal(again.unchanged, 3);
assert.equal(new Set(imported.workItems.map((i) => i.id)).size, imported.workItems.length);
assert.equal(workItemDescendants(imported.workItems, preview.items.find((i) => i.externalId === '10').id).size, 3);
console.log('PASS: out-of-order hierarchy import, stable external identity and idempotent re-import');

const bad = previewImport(state, [...rows, { ...rows[0] }], defaults);
assert.ok(bad.errors.some((e) => e.includes('duplicate'))); assert.equal(bad.items.length, 0);
const missingParent = previewImport(state, [{ ...rows[0], parentExternalId: 'missing' }], defaults);
assert.ok(missingParent.errors.some((e) => e.includes('parent')));
const csv = parseCSV('externalId,kind,title,description\n1,epic,"A, B","line one\nline ""two"""');
assert.equal(csv[1][2], 'A, B'); assert.equal(csv[1][3], 'line one\nline "two"');
assert.throws(() => parseCSV('a,b\n"unclosed,2'));
console.log('PASS: CSV quoting and all-or-nothing validation reject duplicates and missing parents');

const epic = imported.workItems.find((i) => i.externalId === '10');
const feature = imported.workItems.find((i) => i.externalId === '20');
const ticket = imported.workItems.find((i) => i.externalId === '30');
const employee = imported.employees.find((e) => e.departmentId === 'rdept-it' && e.role === 'employee');
const otherDept = imported.departments.find((d) => d.id !== 'rdept-it');
const otherEmployee = imported.employees.find((e) => e.departmentId === otherDept.id);
const baseActivity = { id: 'test-act', title: 'Adapter build', description: '', type: 'task', entityId: employee.entityId, departmentId: employee.departmentId, assigneeId: employee.id, createdById: employee.id, startDate: '2026-10-26', endDate: '2026-10-30', plannedHours: 20, status: 'in_progress', priority: 'medium', progress: 0, subtasks: [], sync: { outlook: false, google: false }, createdAt: '2026-10-26' };
const activity = linkActivity(imported, baseActivity, ticket.id);
const otherActivity = { ...linkActivity(imported, baseActivity, ticket.id), id: 'test-act-2', assigneeId: otherEmployee.id, departmentId: otherEmployee.departmentId, entityId: otherEmployee.entityId, streamId: otherEmployee.streamId, plannedHours: 10 };
const project = imported.projects.find((p) => p.portfolio === 'capital' && p.boardApproved);
const capexTicket = { ...ticket, funding: 'capex', projectId: project.id, phase: 'build' };
const capexFeature = { ...feature, funding: 'capex', projectId: project.id };
const capexEpic = { ...epic, funding: 'capex', projectId: project.id };
const reportState = { ...imported, departments: imported.departments.map((d) => ({ ...d, devopsEnabled: true })), workItems: imported.workItems.map((i) => i.id === ticket.id ? capexTicket : i.id === feature.id ? capexFeature : i.id === epic.id ? capexEpic : i), activities: [activity, otherActivity, ...imported.activities.filter((a) => !['test-act', 'test-act-2'].includes(a.id))], timeEntries: [
  { id: 't1', employeeId: employee.id, activityId: activity.id, date: '2026-10-27', hours: 6, note: '', billable: true, approved: true },
  { id: 't2', employeeId: otherEmployee.id, activityId: otherActivity.id, date: '2026-10-28', hours: 4, note: '', billable: true, approved: false },
] };
const filters = { start: '2026-10-26', end: '2026-10-30', departmentId: 'all', employeeId: 'all', streamId: 'all', epicId: 'all', featureId: 'all', ticketId: 'all', funding: 'all', approvedOnly: false };
const report = effortReport(reportState, filters);
assert.equal(report.totals.hours, 10); assert.ok(report.totals.plannedHours >= 30);
for (const dimension of ['epic', 'feature', 'ticket', 'resource', 'department', 'stream', 'funding']) assert.equal(report.group(dimension).reduce((n, g) => n + g.hours, 0), 10, `${dimension} reconciles`);
const epicRow = report.group('epic').find((g) => g.id === epic.id);
assert.equal(epicRow.hours, 10); assert.equal(epicRow.departments, 2); assert.equal(epicRow.resources, 2);
assert.equal(effortReport(reportState, { ...filters, approvedOnly: true }).totals.hours, 6);
assert.equal(effortReport(reportState, { ...filters, departmentId: otherDept.id }).totals.hours, 4);
assert.equal(plannedHoursInPeriod(reportState, activity, '2026-10-26', '2026-10-27'), 8);
assert.equal(plannedHoursInPeriod(reportState, { ...activity, startDate: '2026-10-31', endDate: '2026-11-01' }, filters.start, filters.end), 0);
console.log('PASS: all seven report groupings reconcile, cross-department contribution rolls up once, plans prorate and approval filters work');

const linked = linkActivity(reportState, { ...baseActivity, startDate: project.capitalisationStart, endDate: project.capitalisationStart }, ticket.id);
assert.equal(capitalisationEligibility(reportState, linked, project).eligible, true);
assert.equal(capitalisationEligibility(reportState, { ...linked, projectPhase: 'support' }, project).eligible, false);
const opexState = { ...reportState, workItems: reportState.workItems.map((i) => i.id === ticket.id ? { ...i, funding: 'opex' } : i) };
assert.equal(capitalisationEligibility(opexState, linked, project).eligible, false);
assert.ok(projectLoggedStats(reportState, project).hours >= 6);
console.log('PASS: delivery-linked activities reach capex policy without a synthetic project task; opex/support remain excluded');

const streams = state.deliveryStreams.filter((s) => s.departmentId === 'rdept-it');
const architecture = streams.find((s) => s.code === 'ARCHITECTURE');
assert.ok(streamDescendants(streams, architecture.id).has(streams.find((s) => s.code === 'SOLUTION-ARCHITECTURE').id));
assert.equal(validStreamParent(streams, architecture.id, streams.find((s) => s.code === 'SOLUTION-ARCHITECTURE').id, 'rdept-it'), false);
const scoped = scopeStateToTenant(seed, 'tnt-harbourline');
assert.ok(scoped.workItems.every((i) => i.departmentId === 'rdept-it'));
assert.ok(scoped.deliveryStreams.every((s) => s.departmentId === 'rdept-it'));
const edited = { ...scoped, workItems: scoped.workItems.map((i, n) => n === 0 ? { ...i, title: 'Edited locally' } : i) };
const merged = mergeTenantState(seed, edited, 'tnt-harbourline');
assert.deepEqual(merged.workItems.filter((i) => i.departmentId === 'dept-it'), seed.workItems.filter((i) => i.departmentId === 'dept-it'));
assert.equal(workspaceSchema.safeParse(toSharedState(merged)).success, true);
const invalid = { ...merged, workItems: merged.workItems.map((i) => i.id === ticket.id ? { ...i, parentId: i.id } : i) };
// Add the imported hierarchy to the full snapshot before checking server cycle validation.
const fullImported = mergeTenantState(merged, reportState, 'tnt-harbourline');
const parsedFull = workspaceSchema.safeParse(toSharedState(fullImported)); if (!parsedFull.success) console.log(parsedFull.error.issues.slice(0,8)); assert.equal(parsedFull.success, true);
const cyclic = { ...fullImported, workItems: fullImported.workItems.map((i) => i.id === epic.id ? { ...i, parentId: ticket.id } : i) };
assert.equal(workspaceSchema.safeParse(toSharedState(cyclic)).success, false);
console.log('PASS: nested streams reject cycles; delivery rows stay tenant-scoped and server validation rejects cyclic backlogs');

/* Illustrative DevOps sample: epic → features → work items, all with acceptance criteria. */
const sample = state.workItems.filter((i) => i.id.startsWith('sample-devops-epic'));
const sampleEpic = sample.find((i) => i.kind === 'epic');
const sampleFeatures = sample.filter((i) => i.kind === 'feature');
const sampleTickets = sample.filter((i) => i.kind === 'ticket');
assert.equal(sample.filter((i) => i.kind === 'epic').length, 1);
assert.equal(sampleFeatures.length, 5); assert.equal(sampleTickets.length, 10);
assert.ok(sample.every((i) => i.acceptanceCriteria.trim().length > 40));
assert.ok(sampleFeatures.every((f) => f.parentId === sampleEpic.id));
assert.ok(sampleTickets.every((t) => sampleFeatures.some((f) => f.id === t.parentId)));
assert.ok(sample.every((i) => i.departmentId === 'rdept-it'));
assert.ok(sample.every((i) => validateWorkItem(sample, i) === null));
assert.ok(sampleFeatures.every((f) => f.streamId && f.streamId.startsWith('stream-rdept-it-')));
assert.ok(sample.every((i) => i.estimateHours >= 0));
assert.equal(state.activities.filter((a) => a.workItemId?.startsWith('sample-devops-epic')).length, 0);
console.log('PASS: seeded DevOps epic links five features and ten work items, each with testable acceptance criteria and no invented bookings');

const withoutSample = { ...state, workItems: state.workItems.filter((i) => !i.id.startsWith('sample-devops-epic')) };
const regenerated = devopsSampleWorkItems(withoutSample, 'rdept-it');
assert.equal(regenerated.length, 16);
assert.ok(regenerated.every((i) => validateWorkItem([...regenerated, ...withoutSample.workItems], i) === null));
assert.equal(withDeliverySample(seed).workItems.length, seed.workItems.length);
assert.equal(withDeliverySample(seed).deliveryStreams.length, seed.deliveryStreams.length);
console.log('PASS: the DevOps sample is idempotent, complete when regenerated and valid against the existing backlog');

const reLinked = linkWorkItemsToParent(state.workItems, sampleFeatures[1].id, [sampleTickets.find((t) => t.parentId === sampleFeatures[0].id).id]);
assert.equal(reLinked.error, null);
const movedTicket = reLinked.items.find((i) => i.id === sampleTickets.find((t) => t.parentId === sampleFeatures[0].id).id);
assert.equal(movedTicket.parentId, sampleFeatures[1].id);
assert.equal(movedTicket.projectId, sampleFeatures[1].projectId);
assert.equal(movedTicket.funding, sampleFeatures[1].funding);
assert.match(linkWorkItemsToParent(state.workItems, sampleFeatures[0].id, [sampleEpic.id]).error, /Only tickets/);
assert.match(linkWorkItemsToParent(state.workItems, sampleTickets[0].id, [sampleFeatures[0].id]).error, /cannot own/);
assert.ok(linkWorkItemsToParent(state.workItems, sampleFeatures[0].id, []).error);
const relinkedFeatures = linkWorkItemsToParent(state.workItems, sampleEpic.id, [sampleFeatures[2].id]);
assert.equal(relinkedFeatures.error, null);
assert.equal(relinkedFeatures.items.find((i) => i.id === sampleFeatures[2].id).parentId, sampleEpic.id);
assert.equal(relinkedFeatures.items.filter((i) => i.parentId === sampleFeatures[2].id).every((i) => i.projectId === sampleEpic.projectId && i.funding === sampleEpic.funding), true);
console.log('PASS: linking re-parents work items, carries parent project/funding and rejects wrong kinds or empty selections');

assert.deepEqual(acceptanceCriteriaList('- First outcome\n2. Second outcome\n\n* Third outcome'), ['First outcome', 'Second outcome', 'Third outcome']);
const acRows = parseImport('externalId,kind,title,parentExternalId,description,acceptanceCriteria\n91,epic,Platform modernisation,,,"Outcome one\nOutcome two"\n', 'csv');
assert.equal(acRows[0].acceptanceCriteria, 'Outcome one\nOutcome two');
const acPreview = previewImport(state, acRows, defaults);
assert.deepEqual(acPreview.errors, []);
assert.equal(acPreview.items[0].acceptanceCriteria, 'Outcome one\nOutcome two');
const reimportedAc = previewImport({ ...state, workItems: [...acPreview.items, ...state.workItems] }, [{ ...acRows[0], acceptanceCriteria: '' }], defaults);
assert.deepEqual(reimportedAc.errors, []);
assert.equal(reimportedAc.items[0].acceptanceCriteria, 'Outcome one\nOutcome two');
console.log('PASS: acceptance criteria survive CSV/JSON import, bullet normalisation and a blank-field re-import');

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Node = dom.window.Node; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
const { createRoot } = await import('react-dom/client');
const { StoreProvider, useStore } = await import('../src/store.tsx');
const { DeliveryPage } = await import('../src/pages/DeliveryPage.tsx');
const { EffortReportsPage } = await import('../src/pages/EffortReportsPage.tsx');
let store; let mode = 'delivery';
function Probe() { store = useStore(); return React.createElement(React.Fragment, null, mode === 'delivery' ? React.createElement(DeliveryPage, { onNewActivity() {}, onNavigate() {} }) : React.createElement(EffortReportsPage)); }
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(StoreProvider, null, React.createElement(Probe))));
// The legacy stream/sample UI assertions target Harbourline; Harris Farm has
// its own curated nested IT streams and tickets.
await act(async () => store.setActiveTenant('tnt-harbourline'));
assert.match(document.body.textContent, /Connect the backlog to the workday/);
assert.match(document.body.textContent, /Architecture/);
assert.match(document.body.textContent, /DevOps platform & release automation/);
assert.match(document.body.textContent, /AC/);
const before = store.state.workItems.length;
let error;
await act(async () => { error = store.importWorkItems(preview, 'test.json'); });
assert.equal(error, null); assert.equal(store.state.workItems.length, before + 3);
await act(async () => { error = store.importWorkItems(preview, 'test.json'); });
assert.equal(error, null); assert.equal(store.state.workItems.length, before + 3);
const sampleCount = store.state.workItems.length;
let sampleError;
await act(async () => { sampleError = store.loadDevopsSample('rdept-it'); });
assert.match(sampleError, /already loaded/);
assert.equal(store.state.workItems.length, sampleCount);
const seededFeature = store.state.workItems.find((i) => i.id === 'sample-devops-epic-ci-cd');
const seededTicket = store.state.workItems.find((i) => i.id === 'sample-devops-epic-ci-cd-quality-gates');
await act(async () => { error = store.linkWorkItems(seededFeature.id, [seededTicket.id]); });
assert.equal(error, null);
assert.equal(store.state.workItems.find((i) => i.id === seededTicket.id).parentId, seededFeature.id);
mode = 'reports';
await act(async () => root.render(React.createElement(StoreProvider, null, React.createElement(Probe))));
assert.match(document.body.textContent, /Where the hours go/);
assert.match(document.body.textContent, /By epic/);
await act(async () => root.unmount());
console.log('PASS: delivery and reporting screens render; store import is repeat-safe');
