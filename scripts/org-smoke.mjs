#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* Organisation hierarchy checks                                       */
/*                                                                     */
/* The chart, the directory and Master setup all read the reporting    */
/* line from `managerId` through src/lib/org.ts. These checks prove    */
/* the traversal, the guards and the move itself on the seeded         */
/* workspace, so a drag can never invent a loop or strand a team.      */
/* ------------------------------------------------------------------ */
import assert from 'node:assert/strict';
import { createSeedState } from '../src/data/seed.ts';
import { HARRIS_FARM_EMPLOYEE_IDS } from '../src/data/harris-farm-seed.ts';
import { HARRIS_FARM_TENANT_ID } from '../src/data/tenant-seed.ts';
import { scopeStateToTenant } from '../src/lib/tenants.ts';
import { getScope } from '../src/lib/permissions.ts';
import {
  buildOrgTree,
  flattenOrg,
  orgBlockedTargets,
  orgBreadcrumb,
  orgChain,
  orgChildrenMap,
  orgDepth,
  orgDescendantIds,
  orgImpactSummary,
  orgStats,
  orgTeamIds,
  reparentEmployees,
  validateOrgMove,
} from '../src/lib/org.ts';

const full = createSeedState();
const state = scopeStateToTenant(full, HARRIS_FARM_TENANT_ID);
const byId = new Map(state.employees.map((employee) => [employee.id, employee]));
const id = (key) => HARRIS_FARM_EMPLOYEE_IDS[key];

/* ---------- traversal ------------------------------------------------- */
const tree = buildOrgTree(state.employees);
const flat = flattenOrg(tree);
assert.equal(flat.length, state.employees.length, 'every person appears exactly once');
assert.equal(new Set(flat.map((node) => node.employee.id)).size, state.employees.length, 'no duplicates in the chart');
assert.equal(flat[0].employee.id, id('angus'));
assert.equal(orgDepth(state.employees, id('angus')), 0);
assert.equal(orgDepth(state.employees, id('ram')), 1);
assert.equal(orgDepth(state.employees, id('ibadur')), 5);
assert.equal(orgDepth(state.employees, id('abhishek')), 6);
assert.equal(orgBreadcrumb(state.employees, id('abhishek')), 'Angus Harris → Phil → Greg → Naweesh → Jayden → Ibadur → Abhishek');
assert.deepEqual(orgChain(state.employees, id('ram')).map((row) => row.name), ['RAM', 'Angus Harris']);

const children = orgChildrenMap(state.employees);
assert.deepEqual((children.get(id('angus')) ?? []).map((row) => row.name), ['Phil', 'RAM'], 'CTO and CIO both report to Angus');
assert.deepEqual((children.get(id('phil')) ?? []).map((row) => row.name), ['Bharat', 'Greg']);
assert.deepEqual((children.get(id('ram')) ?? []).map((row) => row.name), ['Swechchha']);
assert.deepEqual((children.get(id('damien')) ?? []).map((row) => row.name), ['Natasha', 'Pavithra', 'Rahil']);
assert.deepEqual((children.get(id('jayden')) ?? []).map((row) => row.name), ['Ibadur', 'Tristan']);
assert.deepEqual((children.get(id('ibadur')) ?? []).map((row) => row.name).sort(), ['Abhishek', 'Ramaparsad', 'Samundra', 'Sudeep']);

const stats = orgStats(state.employees);
assert.equal(stats.headcount, state.employees.length);
assert.equal(stats.layers, 7);
assert.equal(stats.topLevel, 2, 'Angus and Luke Harris are both unanchored');
assert.equal(stats.individualContributors, Array.from(children.values()).flat().filter((row) => !(children.get(row.id) ?? []).length).length);
assert.equal(orgTeamIds(state.employees, id('angus')).size, state.employees.length - 1, 'Angus holds everybody except Luke');
assert.equal(orgDescendantIds(state.employees, id('bharat')).size, 2);
assert.match(orgImpactSummary(state.employees, id('naweesh')), /direct reports/);
assert.equal(orgImpactSummary(state.employees, id('tristan')), 'No reports move with them.');

/* ---------- guards ---------------------------------------------------- */
assert.equal(validateOrgMove(state.employees, id('ram'), id('ram')).ok, false, 'self-reporting is refused');
assert.equal(validateOrgMove(state.employees, id('phil'), id('angus')).ok, false, 'already reporting to Angus');
assert.equal(validateOrgMove(state.employees, id('angus'), id('ram')).ok, false, 'Angus cannot report to the CIO below him');
assert.equal(validateOrgMove(state.employees, id('angus'), id('abhishek')).ok, false, 'no reporting to a deep descendant');
assert.equal(validateOrgMove(state.employees, id('greg'), id('jayden')).ok, false, 'a manager cannot move under his own report');
assert.equal(validateOrgMove(state.employees, 'hfm-emp-does-not-exist', id('ram')).ok, false, 'unknown people are refused');
assert.equal(validateOrgMove(state.employees, id('bharat'), 'hfm-emp-does-not-exist').ok, false, 'unknown managers are refused');
assert.equal(validateOrgMove(state.employees, id('bharat'), id('ram')).ok, true, 'a legitimate move is accepted');
assert.equal(validateOrgMove(state.employees, id('phil'), null).ok, true, 'a person can be made top level');
assert.deepEqual([...orgBlockedTargets(state.employees, id('greg'))].sort(), [...orgTeamIds(state.employees, id('greg'))].sort());

/* ---------- the move -------------------------------------------------- */
const target = id('bharat');
const manager = id('ram');
const moved = reparentEmployees(state.employees, target, manager);
const movedById = new Map(moved.map((employee) => [employee.id, employee]));
assert.equal(movedById.get(target).managerId, manager);
assert.deepEqual(movedById.get(target), { ...byId.get(target), managerId: manager }, 'only the reporting line changes');
const untouched = state.employees.filter((employee) => employee.id !== target);
assert.ok(untouched.every((employee) => movedById.get(employee.id) === employee), 'nobody else is rewritten');
assert.equal(orgTeamIds(moved, target).size, 3, 'the whole team travels with the person');
assert.equal(orgBreadcrumb(moved, target), 'Angus Harris → RAM → Bharat');
assert.equal(orgDepth(moved, target), 2);

const topLevel = reparentEmployees(state.employees, target, null);
assert.equal(topLevel.find((employee) => employee.id === target).managerId, null);
assert.equal(orgDepth(topLevel, target), 0);

/* ---------- tenancy and permissions ---------------------------------- */
assert.equal(
  orgBreadcrumb(full.employees, state.employees.find((employee) => employee.id === id('rahil')).id).includes('Harbourline'),
  false,
  'a reporting line never crosses tenants',
);
const angusScope = getScope(state, id('angus'));
assert.equal(angusScope.canManageReportingLines, true, 'the CEO can re-parent people');
const employeeScope = getScope(state, id('tristan'));
assert.equal(employeeScope.canManageReportingLines, false, 'an individual contributor sees the chart read-only');
const managerScope = getScope(state, id('greg'));
assert.equal(managerScope.canManageReportingLines, false, 'a manager sees the chart read-only');
const leadScope = getScope(state, id('naweesh'));
assert.equal(leadScope.canManageReportingLines, false, 'a supervisor sees the chart read-only');
const cioScope = getScope(state, id('ram'));
assert.equal(cioScope.canManageReportingLines, true, 'the CIO can re-parent people');

// A manager that sits outside the visible set must not strand their reports.
const orphaned = state.employees.map((employee) =>
  employee.id === id('greg') ? { ...employee, managerId: 'some-other-tenant-person' } : employee,
);
assert.equal(orgDepth(orphaned, id('greg')), 0, 'an out-of-scope manager is treated as the top of the tree');
assert.equal(flattenOrg(buildOrgTree(orphaned)).length, orphaned.length, 'nobody disappears from the chart');

console.log('PASS: reporting-line traversal, guards, moves, tenancy and read-only access all behave');

/* ---------- store action + screen render ------------------------------ */
/* The store action is what a drag actually calls. It must refuse invalid
   moves with a reason, write valid ones to the audit trail, and never touch
   anything except the reporting line. */
const React = (await import('react')).default;
const { act } = await import('react');
const { JSDOM } = await import('jsdom');
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
const { ToastProvider } = await import('../src/components/toast.tsx');
const { OrganisationPage } = await import('../src/pages/OrganisationPage.tsx');

let latest;
function Probe() {
  latest = useStore();
  return null;
}
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(StoreProvider, null, React.createElement(Probe))));
assert.equal(latest.state.settings.activeTenantId, HARRIS_FARM_TENANT_ID, 'the smoke test runs on the Harris Farm workspace');
assert.equal(latest.state.settings.activeUserId, id('angus'));

// Refused: looping the hierarchy.
const loopRefusal = await act(async () => latest.moveReportingLine(id('ram'), id('swechchha')));
assert.match(loopRefusal, /below/, 'the loop is refused with a reason');
assert.equal(latest.state.employees.find((row) => row.id === id('ram')).managerId, id('angus'), 'a refused move writes nothing');
assert.equal(latest.state.auditLog.filter((entry) => entry.action === 'Reporting line changed').length, 0, 'a refused move is not audited');

// Refused: the signed-in person cannot unanchor themselves.
const selfRefusal = await act(async () => latest.moveReportingLine(id('angus'), null));
assert.match(selfRefusal, /your own reporting line/i);

// Accepted: the Head of Data moves under the CIO and keeps everything else.
const before = latest.state.employees.find((row) => row.id === id('bharat'));
const error = await act(async () => latest.moveReportingLine(id('bharat'), id('ram')));
assert.equal(error, null, 'a valid move returns no error');
const after = latest.state.employees.find((row) => row.id === id('bharat'));
assert.equal(after.managerId, id('ram'));
assert.equal(after.departmentId, before.departmentId);
assert.equal(after.streamId, before.streamId);
assert.equal(after.jobTitle, before.jobTitle);
const entries = latest.state.auditLog.filter((entry) => entry.action === 'Reporting line changed');
assert.equal(entries.length, 1, 'the move is audited once');
assert.match(entries[0].detail, /Bharat: Phil → RAM/);
assert.equal(entries[0].actorId, id('angus'));

/* The screen draws the confirmed line and stays quiet about people it must
   not offer as drop targets. */
await act(async () => {
  root.render(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(
        ToastProvider,
        null,
        React.createElement(OrganisationPage),
      ),
    ),
  );
});
const markup = document.body.textContent ?? '';
for (const name of ['Angus Harris', 'RAM', 'Phil', 'Swechchha', 'Damien', 'Rahil', 'Natasha', 'Greg', 'Naweesh', 'Jayden', 'Ibadur', 'Bharat']) {
  assert.ok(markup.includes(name), `the chart renders ${name}`);
}
assert.ok(markup.includes('Reporting hierarchy'), 'the chart tab is the default view');
assert.ok(markup.includes('Top of the hierarchy'), 'the top-level drop zone is offered to an executive');
assert.ok(!markup.includes('hfm-emp-'), 'internal ids never leak into the visible page text');
await act(async () => root.unmount());
console.log('PASS: the store action and the Organisation screen behave for a real drag');

/* Master setup carries the same people tree beside the entity and department
   tree; opening the tab must render the reporting lines without errors. */
const { AdminPage } = await import('../src/pages/AdminPage.tsx');
const adminHost = document.createElement('div');
document.body.appendChild(adminHost);
const adminRoot = createRoot(adminHost);
await act(async () => {
  adminRoot.render(
    React.createElement(
      StoreProvider,
      null,
      React.createElement(ToastProvider, null, React.createElement(AdminPage)),
    ),
  );
});
const hierarchyTab = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Organization hierarchy'));
assert.ok(hierarchyTab, 'Master setup still offers the Organization hierarchy tab');
await act(async () => hierarchyTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
const adminMarkup = document.body.textContent ?? '';
assert.ok(adminMarkup.includes('Reporting lines'), 'the people tree is drawn in Master setup');
assert.ok(adminMarkup.includes('Angus Harris') && adminMarkup.includes('Rahil'), 'the confirmed reporting lines are drawn there too');
await act(async () => adminRoot.unmount());
console.log('PASS: Master setup draws the same reporting lines');
