import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { WorkspaceSync } from '../src/lib/workspace-sync.ts';
import { MAX_AUTO_RETRIES } from '../src/lib/retry.ts';
import { ApiError, fromSharedState, getWorkspaceConfig, toSharedState } from '../src/lib/workspace-api.ts';
import { createSeedState } from '../src/data/seed.ts';
import { workspaceSchema } from '../server/validation.mjs';

const initial = toSharedState(createSeedState());
const parsed = workspaceSchema.safeParse(initial);
assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
assert.equal('activeUserId' in initial.settings, false);
const brandedSnapshot = {
  ...initial,
  entities: initial.entities.map((entity, index) => index === 0 ? {
    ...entity,
    logoUrl: 'data:image/png;base64,AA==',
    portalHeader: 'Meridian Workspace',
    portalFooter: '© Meridian Group',
    brandColor: '#126a84',
    backgroundColor: '#f2f8fa',
    fontFamily: 'Inter',
    headingFont: 'Georgia',
  } : entity),
};
assert.equal(workspaceSchema.safeParse(brandedSnapshot).success, true, 'entity theme configuration must persist through the shared workspace API');
console.log('PASS: full seeded dataset and entity theme branding validate against the Neon API schema');

/* Entity focus: the command centre reads one legal entity at a time and a
   selection covers that entity plus every company beneath it — never a
   sibling group, and never outside the departments already in scope. */
const { entitySubtreeIds, scopeEntityOptions, departmentsInEntityScope } = await import('../src/lib/entities.ts');
const entitySeed = createSeedState();
const contractingTree = entitySubtreeIds(entitySeed.entities, 'ent-contracting');
assert.ok(contractingTree.has('ent-contracting') && contractingTree.has('ent-qatar'), 'a company selection includes its sub-companies');
assert.equal(contractingTree.has('ent-group'), false, 'a company selection never rolls up to the group');
assert.equal(contractingTree.has('ent-hra-group'), false, 'a company selection never bleeds into a sibling group');

const contractingDepartments = departmentsInEntityScope(entitySeed.entities, entitySeed.departments, 'ent-contracting');
assert.ok(contractingDepartments.length > 0 && contractingDepartments.length < entitySeed.departments.length, 'entity focus narrows the dashboard');
assert.ok(contractingDepartments.every((dept) => contractingTree.has(dept.entityId)), 'every focused department belongs to the selected entity tree');

const allDepartments = departmentsInEntityScope(entitySeed.entities, entitySeed.departments, 'all');
assert.equal(allDepartments.length, entitySeed.departments.length, "'all' keeps the whole scope in view");

const contractingScope = entitySeed.departments.filter((dept) => ['ent-contracting', 'ent-qatar'].includes(dept.entityId));
const contractingOptions = scopeEntityOptions(entitySeed.entities, contractingScope);
assert.equal(contractingOptions[0].entity.id, 'ent-group', 'the picker anchors on the root group of company');
assert.deepEqual(
  contractingOptions.map(({ entity, depth }) => `${entity.id}@${depth}`),
  ['ent-group@0', 'ent-contracting@1', 'ent-qatar@2'],
  'the picker offers the ancestors and the companies that hold a department in scope, in tree order',
);
assert.ok(contractingOptions.every(({ entity }) => entity.id !== 'ent-hra-group'), 'the picker never offers an entity outside the role scope');
console.log('PASS: dashboard entity focus covers the entity tree and stays inside role scope');

/* Capitalisation guardrails: only capital-project development tasks may be
   capitalised, and every logged hour is either capitalised or reconciled. */
const { capitalisationReport, monthScope, monthKey } = await import('../src/lib/capitalisation.ts');
const seededState = createSeedState();
const retailIt = seededState.departments.find((dept) => dept.code === 'RIT');
assert.ok(retailIt, 'the retail IT department must exist');
const capitalReport = capitalisationReport(createSeedState(), {
  entityId: 'ent-hra-retail',
  departmentId: retailIt.id,
  ...monthScope(monthKey(new Date())),
});
const seededProjects = seededState.projects;
assert.ok(seededProjects.length >= 100, `expected 100+ IT projects, found ${seededProjects.length}`);
assert.equal(seededProjects.filter((project) => project.portfolio === 'capital').length, 30);
assert.ok(capitalReport.lines.length > 0, 'capitalisable timesheet lines must reach the board pack');
assert.ok(capitalReport.capitalisedHours > 0 && capitalReport.capitalisedCost > 0);
for (const projectId of new Set(capitalReport.lines.map((line) => line.projectId))) {
  const project = seededProjects.find((row) => row.id === projectId);
  assert.equal(project?.portfolio, 'capital', 'only capital projects may be capitalised');
}
assert.equal(capitalReport.byProject.length, 30, 'the pack lists capital projects only');
assert.ok(capitalReport.byProject.every((row) => seededProjects.find((p) => p.id === row.projectId)?.portfolio === 'capital'));
assert.ok(capitalReport.exclusions.some((line) => line.reason === 'operational_project'), 'operational projects must be excluded');
assert.ok(capitalReport.exclusions.some((line) => line.reason === 'non_capitalisable_task'), 'non-capitalisable phases must be excluded');
assert.equal(capitalReport.lines.length + capitalReport.exclusions.length, capitalReport.entriesCount, 'every entry is classified');
assert.ok(capitalReport.byResource.every((row) => Math.abs(row.capitalHours + row.excludedHours - row.totalHours) < 0.11));
assert.ok(capitalReport.capitalisedHours <= capitalReport.capitalHours, 'project rates cannot inflate effort');
console.log('PASS: capitalisation pack excludes operational effort and reconciles every logged hour');

const change = (name) => ({ ...initial, settings: { ...initial.settings, groupName: name } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const updates = [];
const statuses = [];
const pending = deferred();
const controller = new WorkspaceSync({ state: initial, version: 1 }, (info) => statuses.push(info), () => assert.fail('a write must not reload the UI'), {
  read: async () => assert.fail('unexpected read'),
  write: async (version, state) => { updates.push({ version, state }); if (updates.length === 1) return pending.promise; return { version: 3 }; },
}, 60_000);
controller.update(change('A'));
const saving = controller.flush();
controller.update(change('B'));
pending.resolve({ version: 2 });
await saving;
await controller.flush();
assert.deepEqual(updates.map((u) => u.version), [1, 2]);
assert.deepEqual(updates.map((u) => u.state.settings.groupName), ['A', 'B']);
assert.equal(statuses.at(-1).status, 'saved');
assert.equal(controller.dirty, false);
controller.dispose();
console.log('PASS: writes are serialized; edits made during a save use the new version');

let writes = 0;
let reads = 0;
let loaded;
let info;
const conflicting = new WorkspaceSync({ state: initial, version: 1 }, (value) => { info = value; }, (value) => { loaded = value; }, {
  write: async () => { writes++; throw new ApiError(409, 'conflict'); },
  read: async () => { reads++; return { state: change('Remote'), version: 2 }; },
}, 60_000);
conflicting.update(change('Local'));
await conflicting.flush();
assert.equal(info.status, 'conflict');
assert.equal(conflicting.dirty, true);
conflicting.update(change('More local edits'));
conflicting.retry();
await conflicting.flush();
await conflicting.refresh();
assert.equal(writes, 1);
assert.equal(reads, 0);
assert.equal(loaded, undefined);
await conflicting.refresh(true);
assert.equal(loaded.settings.groupName, 'Remote');
assert.equal(conflicting.dirty, false);
conflicting.dispose();
console.log('PASS: conflicts preserve unsaved edits until an explicit discard-and-reload');

let failures = 0;
const retrying = new WorkspaceSync({ state: initial, version: 1 }, (value) => { info = value; }, () => assert.fail('failure must not reload'), {
  read: async () => { throw new ApiError(503, 'unavailable'); },
  write: async () => { if (failures++ === 0) throw new ApiError(0, 'offline'); return { version: 2 }; },
}, 60_000);
retrying.update(change('Offline edits'));
await retrying.flush();
assert.equal(info.status, 'error');
assert.equal(retrying.dirty, true);
retrying.retry();
await sleep(0);
assert.equal(info.status, 'saved');
await retrying.refresh();
assert.equal(info.status, 'error');
assert.equal(retrying.dirty, false);
retrying.dispose();
console.log('PASS: offline saves and failed refreshes retain data and can be retried');

/* Auto-refresh: "The shared database is temporarily unavailable" usually means a
   suspended Neon instance that wakes on the first request. The sync engine retries
   a bounded number of times, keeps queued edits, and never retries a verdict that
   a retry cannot fix (bad setup, cross-origin, expired session). */
let autoWrites = 0;
let autoInfo;
const auto = new WorkspaceSync({ state: initial, version: 1 }, (value) => { autoInfo = value; }, () => assert.fail('an automatic retry must not reload the UI'), {
  read: async () => assert.fail('unexpected read'),
  write: async () => {
    autoWrites++;
    if (autoWrites === 1) throw new ApiError(503, 'The shared database is temporarily unavailable. Please retry.', { retryable: true, retryAfterSeconds: 1 });
    return { version: 2 };
  },
}, 60_000, [1_000]);
auto.update(change('Auto recovered'));
await auto.flush();
assert.equal(autoInfo.status, 'error');
assert.ok(autoInfo.retryAt > Date.now() - 5, 'a retryable failure schedules the next automatic attempt');
assert.equal(auto.dirty, true, 'the queued edit survives the failed attempt');
await sleep(Math.max(0, autoInfo.retryAt - Date.now()) + 100);
assert.equal(autoWrites, 2, 'the automatic retry re-sent the queued edit without a click');
assert.equal(autoInfo.status, 'saved');
assert.equal(autoInfo.retryAt, undefined, 'a successful retry clears the schedule');
assert.equal(auto.dirty, false);
auto.dispose();
console.log('PASS: a transient database outage retries itself and still saves queued edits');

let hardFailures = 0;
let hardInfo;
const hard = new WorkspaceSync({ state: initial, version: 1 }, (value) => { hardInfo = value; }, () => {}, {
  read: async () => assert.fail('unexpected read'),
  write: async () => { hardFailures++; throw new ApiError(403, 'Cross-origin requests are not allowed.', { retryable: false }); },
}, 60_000, [50]);
hard.update(change('Never retried'));
await hard.flush();
assert.equal(hardInfo.status, 'error');
assert.equal(hardInfo.retryAt, undefined, 'a non-retryable failure is shown to the user, not retried on a timer');
hard.retryIfBlocked(); // browser focus/online events must not override the server verdict
await sleep(150);
assert.equal(hardFailures, 1, 'a non-retryable failure is never sent again automatically');
hard.dispose();
console.log('PASS: non-retryable failures never auto-retry');

let exhaustedWrites = 0;
let exhaustedInfo;
const exhausted = new WorkspaceSync({ state: initial, version: 1 }, (value) => { exhaustedInfo = value; }, () => {}, {
  read: async () => assert.fail('unexpected read'),
  write: async () => {
    exhaustedWrites++;
    throw new ApiError(503, 'Neon remains unavailable.', { retryable: true });
  },
}, 60_000, [1]);
exhausted.update(change('Keep my edits'));
await exhausted.flush();
for (let attempt = 0; attempt < MAX_AUTO_RETRIES; attempt++) await sleep(1_050);
assert.equal(exhaustedWrites, MAX_AUTO_RETRIES + 1, 'the initial write gets no more than five automatic retries');
assert.equal(exhaustedInfo.autoRetryExhausted, true, 'the user is told when automatic retries are paused');
assert.equal(exhaustedInfo.retryAt, undefined, 'no timer remains after the retry budget is exhausted');
assert.equal(exhausted.dirty, true, 'queued user edits are preserved after retries stop');
exhausted.retryIfBlocked();
assert.equal(exhaustedWrites, MAX_AUTO_RETRIES + 1, 'an online/focus event cannot reset the automatic retry budget');
exhausted.retry();
assert.equal(exhaustedWrites, MAX_AUTO_RETRIES + 2, 'a deliberate manual retry starts a fresh budget');
exhausted.dispose();
console.log('PASS: automatic retries stop after five attempts; manual retry remains available');

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5173/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const { StoreProvider, useStore, emptyActivity } = await import('../src/store.tsx');
let latest;
function Probe() { latest = useStore(); return null; }
const root = createRoot(document.getElementById('root'));
const requests = [];
let remote = initial;
globalThis.fetch = async (path, options = {}) => {
  requests.push({ path, options });
  if (options.method === 'PUT') return Response.json({ version: 2 });
  return Response.json({ state: remote, version: 3 });
};
const shared = { snapshot: { state: initial, version: 1 }, onSignOut: async () => {} };
await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(StoreProvider, { shared }, React.createElement(Probe)))));
const other = latest.state.employees.find((e) => e.id !== latest.state.settings.activeUserId);
await act(async () => latest.setActiveUser(other.id));
await sleep(750);
assert.equal(requests.length, 0, 'changing personas must not write shared data');
await act(async () => latest.upsertActivity({ ...emptyActivity(latest.state), title: 'Shared activity' }));
await act(async () => sleep(800));
assert.equal(requests.length, 1);
assert.equal('activeUserId' in JSON.parse(requests[0].options.body).state.settings, false);
assert.equal(localStorage.getItem('orbit.portal.state.v1'), null, 'shared data must not be stored in localStorage');
assert.equal(localStorage.getItem('orbit.portal.persona.v1'), other.id);
const beforeReset = latest.state;
await act(async () => latest.resetDemo());
assert.equal(latest.state, beforeReset, 'reset demo must not reset shared data');
remote = change('Changed on another device');
await act(async () => { latest.workspace.refresh(); await sleep(50); });
assert.equal(latest.state.settings.groupName, 'Changed on another device');
assert.equal(latest.state.settings.activeUserId, other.id);
await sleep(750);
assert.equal(requests.length, 2, 'a refresh must not echo a new write back to the server');
assert.equal(fromSharedState(initial, 'removed-user').settings.activeUserId, initial.employees[0].id);
await act(async () => root.unmount());
console.log('PASS: real React shared store keeps personas local, disables demo reset and loads other devices’ data');

globalThis.fetch = async () => new Response('<html>static host</html>', { status: 404 });
assert.equal((await getWorkspaceConfig()).mode, 'demo');
globalThis.fetch = async () => Response.json({ error: 'database unavailable' }, { status: 503 });
await assert.rejects(getWorkspaceConfig, (error) => error instanceof ApiError && error.status === 503);
console.log('PASS: static demo detection never hides a configured API outage');


const { WorkspaceGateway } = await import('../src/components/WorkspaceGateway.tsx');
function GatewayProbe() {
  const { state, workspace } = useStore();
  return React.createElement('p', { 'data-testid': 'gateway-content' }, `${workspace.mode}:${state.settings.groupName}`);
}
async function renderGateway(fetcher) {
  globalThis.fetch = fetcher;
  const gatewayRoot = createRoot(document.getElementById('root'));
  await act(async () => gatewayRoot.render(React.createElement(React.StrictMode, null,
    React.createElement(WorkspaceGateway, null, React.createElement(GatewayProbe)))));
  await act(async () => sleep(50));
  return async () => { await act(async () => gatewayRoot.unmount()); };
}
let close = await renderGateway(async () => Response.json({ mode: 'shared', authenticated: false }));
assert.equal(document.querySelector('input')?.type, 'password');
assert.equal(document.querySelector('[data-testid="gateway-content"]'), null);
await close();
close = await renderGateway(async () => Response.json({ error: 'setup incomplete', retryable: false }, { status: 503 }));
assert.match(document.body.textContent, /Workspace unavailable/);
assert.match(document.body.textContent, /Try again/);
assert.doesNotMatch(document.body.textContent, /Refreshing automatically/, 'a broken setup is not retried on a timer');
assert.equal(document.querySelector('[data-testid="gateway-content"]'), null);
await close();
// A transient outage - the sleeping-database wake-up - recovers on its own.
let flakyReads = 0;
const flakyFetcher = async (path) => {
  if (path === '/api/config') return Response.json({ mode: 'shared', authenticated: true });
  flakyReads++;
  if (flakyReads === 1) {
    return Response.json({
      error: 'The shared database is temporarily unavailable. Your unsaved changes have not been discarded. Please retry.',
      retryable: true,
      retryAfterSeconds: 1,
    }, { status: 503 });
  }
  return Response.json({ state: initial, version: 1 });
};
close = await renderGateway(flakyFetcher);
assert.match(document.body.textContent, /temporarily unavailable/);
assert.match(document.body.textContent, /Refreshing automatically/, 'the outage screen announces the automatic refresh');
assert.equal(document.querySelector('[data-testid="gateway-content"]'), null);
await act(async () => sleep(1_400));
assert.ok(document.querySelector('[data-testid="gateway-content"]'), 'the gateway opens itself once the database answers');
assert.equal(flakyReads, 2);
await close();
console.log('PASS: a transient outage auto-refreshes the gateway, a broken setup does not');
close = await renderGateway(async () => Response.json({ mode: 'demo', authenticated: false }));
assert.match(document.querySelector('[data-testid="gateway-content"]').textContent, /^demo:/);
await close();
let seeded;
let initialWrites = 0;
const bootFetcher = async (path, options = {}) => {
  if (path === '/api/config') return Response.json({ mode: 'shared', authenticated: true });
  if (options.method === 'PUT') {
    initialWrites++;
    const payload = JSON.parse(options.body);
    assert.equal(payload.version, 0);
    seeded = payload.state;
    return Response.json({ version: 1 });
  }
  return Response.json({ state: seeded ?? null, version: seeded ? 1 : 0 });
};
close = await renderGateway(bootFetcher);
assert.match(document.querySelector('[data-testid="gateway-content"]').textContent, /^shared:/);
assert.equal(initialWrites, 1);
assert.equal('activeUserId' in seeded.settings, false);
await close();
close = await renderGateway(bootFetcher);
assert.equal(initialWrites, 1, 'returning visitors must never reseed the database');
await close();
dom.window.close();
console.log('PASS: real gateway gates private data, reports setup errors and seeds the workspace once');
