import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/* ------------------------------------------------------------------ */
/* PMO tool smoke                                                      */
/*                                                                     */
/* Renders the portal on the DevOps delivery tab for the Harris Farm    */
/* IT department, drives the request → approve → onboard flow through  */
/* the real store, and checks tenancy scoping + server validation of   */
/* the new PMO collections.                                            */
/* ------------------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/#/delivery', pretendToBeVisual: true });
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
const { HARRIS_FARM_TENANT_ID, HARRIS_FARM_IT_DEPT_ID } = await import('../src/data/tenant-seed.ts');
const { isItDepartment } = await import('../src/components/PmoPanel.tsx');
const { scopeStateToTenant, mergeTenantState } = await import('../src/lib/tenants.ts');
const { workspaceSchema } = await import('../server/validation.mjs');
const { toSharedState } = await import('../src/lib/workspace-api.ts');

const seed = createSeedState();
seed.settings = { ...seed.settings, activeTenantId: HARRIS_FARM_TENANT_ID, activeUserId: 'hfm-emp-ram', harrisFarmMarketEnabled: true };
localStorage.setItem('orbit.portal.state.v1', JSON.stringify(seed));

const { StoreProvider, useStore } = await import('../src/store.tsx');
const { ToastProvider } = await import('../src/components/toast.tsx');
const { App } = await import('../src/App.tsx');

let api;
function Probe() {
  api = useStore();
  return null;
}

const root = createRoot(document.getElementById('root'));
await act(async () => {
  root.render(React.createElement(StoreProvider, null, React.createElement(ToastProvider, null, React.createElement(React.Fragment, null, React.createElement(Probe), React.createElement(App)))));
});

// The PMO panel renders on top of the DevOps delivery tab for IT departments only.
const html = document.getElementById('root').innerHTML;
assert.ok(html.includes('PMO tool'), 'PMO tool panel is visible on the delivery tab');
assert.ok(html.includes('Requests'), 'requests tab present');
assert.ok(isItDepartment({ id: HARRIS_FARM_IT_DEPT_ID, code: 'HIT', name: 'Information Technology' }), 'HFM IT department recognised');
assert.ok(!isItDepartment({ id: 'x', code: 'FIN', name: 'Accounts & Finance' }), 'non-IT department excluded');
console.log('PASS: PMO panel renders on top of the DevOps delivery tab for the IT department');

// Drive the intake → approval flow through the real store actions.
const before = api.scopedState ?? api.state;
await act(async () => {
  api.upsertPmoRequest({
    id: 'pmo-req-smoke', title: 'Smoke test request', description: 'Onboard me', requestedById: 'hfm-emp-ram',
    pillar: 'BIA', portfolio: 'capital', category: 'delivery', estimatedBudgetAUD: 50000, valueRaised: 'Faster close',
    status: 'submitted', submittedAt: new Date().toISOString(),
  });
});
await act(async () => {
  const error = api.decidePmoRequest('pmo-req-smoke', 'approved', 'Go ahead');
  assert.equal(error, null);
});

const after = api.scopedState ?? api.state;
const request = after.pmoRequests.find((r) => r.id === 'pmo-req-smoke');
assert.equal(request.status, 'approved');
assert.ok(request.projectId, 'approved request is linked to a project');
const project = after.projects.find((p) => p.id === request.projectId);
assert.ok(project, 'project was created');
assert.equal(project.departmentId, HARRIS_FARM_IT_DEPT_ID);
const epic = after.workItems.find((i) => i.projectId === project.id && i.kind === 'epic');
assert.ok(epic, 'an epic was created for the onboarded project');
assert.equal(after.workItems[0].id, epic.id, 'new epic sits on top of the backlog');
console.log('PASS: request approval onboards a project and puts a new epic on top of the backlog');

// PMO members and department resources may update estimates; outsiders may not.
const ticket = after.workItems.find((i) => i.departmentId === HARRIS_FARM_IT_DEPT_ID && i.id !== epic.id) ?? epic;
await act(async () => {
  const error = api.updatePmoWorkItem({ ...ticket, estimateHours: 12 });
  assert.equal(error, null);
});
assert.equal((api.scopedState ?? api.state).workItems.find((i) => i.id === ticket.id).estimateHours, 12);
console.log('PASS: PMO / resources can update estimate hours on project work items');

// Update log, risk, milestone, decision and stakeholder all persist.
await act(async () => {
  api.upsertPmoUpdate({ id: 'pmo-upd-smoke', projectId: project.id, weekOf: '2026-11-02', authorId: 'hfm-emp-ram', summary: 'Week 1: kicked off', stage: 'approved', status: 'active', createdAt: new Date().toISOString() });
  api.upsertPmoRisk({ id: 'pmo-risk-smoke', projectId: project.id, title: 'Capacity', description: 'Two projects compete', severity: 'high', status: 'open', createdAt: new Date().toISOString() });
  api.upsertPmoMilestone({ id: 'pmo-ms-smoke', projectId: project.id, title: 'MVP', dueDate: '2026-12-15', status: 'planned' });
  api.upsertPmoDecision({ id: 'pmo-dec-smoke', projectId: project.id, title: 'Hosting', decision: 'Azure', decidedById: 'hfm-emp-ram', decidedAt: new Date().toISOString() });
  api.upsertPmoStakeholder({ id: 'pmo-stk-smoke', projectId: project.id, name: 'Vendor Co', email: 'pm@vendor.example', role: 'Vendor PM', source: 'vendor' });
});
const pmoState = api.scopedState ?? api.state;
assert.equal(pmoState.pmoUpdates.length, 1);
assert.equal(pmoState.pmoRisks.length, 1);
assert.equal(pmoState.pmoMilestones.length, 1);
assert.equal(pmoState.pmoDecisions.length, 1);
assert.equal(pmoState.pmoStakeholders.length, 1);
console.log('PASS: update log, risks, milestones, decisions and stakeholders persist per project');

// Tenancy: PMO rows follow their project's tenant and survive a merge round-trip.
const scoped = scopeStateToTenant(createSeedState(), 'tnt-meridian');
assert.equal((scoped.pmoRequests ?? []).length, 0, 'other tenants never see the PMO rows');
const full = api.workspace && false ? null : null;
const shared = toSharedState(api.fullState ?? (api.scopedState ?? api.state));
const parsed = workspaceSchema.safeParse(shared);
assert.ok(parsed.success, `server schema accepts the PMO collections: ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))}`);
const editedScoped = { ...(api.scopedState ?? api.state) };
const merged = mergeTenantState({ ...createSeedState(), ...(api.fullState ?? {}) }, editedScoped, HARRIS_FARM_TENANT_ID);
assert.ok((merged.pmoRequests ?? []).some((r) => r.id === 'pmo-req-smoke'), 'merge keeps the tenant PMO request');
console.log('PASS: PMO rows are tenant-scoped, merge-safe and accepted by the server schema');

assert.deepEqual(errors, [], `no runtime errors: ${errors.join(' | ')}`);
console.log('PASS: PMO tool smoke — panel, intake flow, estimates, tenancy and validation all behave');
