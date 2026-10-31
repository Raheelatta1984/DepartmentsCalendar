import assert from 'node:assert/strict';
import { createSeedState } from '../src/data/seed.ts';
import {
  HARRIS_FARM_ACTIVE_USER_ID,
  HARRIS_FARM_EMPLOYEE_IDS,
  HARRIS_FARM_ENTITY_ID,
  HARRIS_FARM_GROUP_ID,
  HARRIS_FARM_STREAM_IDS,
} from '../src/data/harris-farm-seed.ts';
import { HARRIS_FARM_IT_DEPT_ID, HARRIS_FARM_TENANT_ID } from '../src/data/tenant-seed.ts';
import { employeeTitle, getScope } from '../src/lib/permissions.ts';
import {
  buildOrgTree,
  flattenOrg,
  orgBlockedTargets,
  orgBreadcrumb,
  orgImpactSummary,
  orgStats,
  orgTeamIds,
  reparentEmployees,
  validateOrgMove,
} from '../src/lib/org.ts';
import { scopeStateToTenant } from '../src/lib/tenants.ts';
import { toSharedState } from '../src/lib/workspace-api.ts';
import { workspaceSchema } from '../server/validation.mjs';
import { initialiseWorkspaceState } from '../src/store.tsx';

const full = createSeedState();
const state = scopeStateToTenant(full, HARRIS_FARM_TENANT_ID);
const byId = new Map(state.employees.map((employee) => [employee.id, employee]));
const streams = new Map(state.deliveryStreams.map((stream) => [stream.id, stream]));
const workItems = new Map(state.workItems.map((item) => [item.id, item]));

assert.equal(state.settings.activeTenantId, HARRIS_FARM_TENANT_ID);
assert.equal(state.settings.activeUserId, HARRIS_FARM_ACTIVE_USER_ID);
assert.equal(state.tenants.find((tenant) => tenant.id === HARRIS_FARM_TENANT_ID)?.name, 'Harris Farm Markets');
const group = state.entities.find((entity) => entity.id === HARRIS_FARM_GROUP_ID);
const company = state.entities.find((entity) => entity.id === HARRIS_FARM_ENTITY_ID);
assert.equal(group?.name, 'Harris Farm Markets');
assert.equal(group?.type, 'group');
assert.equal(company?.name, 'HarrisFarm Markets');
assert.equal(company?.parentId, group.id);
assert.equal(state.departments.length, 1);
assert.equal(state.departments[0].id, HARRIS_FARM_IT_DEPT_ID);
assert.equal(state.departments[0].headId, HARRIS_FARM_EMPLOYEE_IDS.ram);
assert.equal(state.departments[0].opsOwnerId, HARRIS_FARM_EMPLOYEE_IDS.angus);
assert.equal(state.departments[0].devopsEnabled, true);

const names = new Set(state.employees.map((employee) => employee.name));
for (const name of [
  'Angus Harris', 'Luke Harris', 'RAM', 'Phil', 'Bharat', 'Sunil', 'Arti', 'Swechchha', 'Daniel',
  'Damien', 'Sujan', 'Pavithra', 'Priyanka', 'Ali Rad', 'Rahil', 'Natasha', 'Greg', 'Naweesh',
  'Rob', 'Mohsin', 'Akin', 'Michael', 'Anup', 'Mukti', 'Jayden', 'Tristan', 'Ibadur', 'Samundra',
  'Sudeep', 'Ramaparsad', 'Abhishek',
]) assert.ok(names.has(name), `missing onboarding person: ${name}`);
assert.equal(state.employees.length, 31);

const employee = (key) => byId.get(HARRIS_FARM_EMPLOYEE_IDS[key]);
assert.equal(employee('angus').role, 'ceo');
assert.equal(employee('luke').role, 'ceo');
assert.equal(employeeTitle(employee('angus')), 'Co-CEO · Operations');
assert.deepEqual(employee('angus').responsibleDepartmentIds, [HARRIS_FARM_IT_DEPT_ID]);
assert.deepEqual(employee('luke').responsibleDepartmentIds, []);
assert.match(employee('luke').leadershipPortfolio, /Warehouse and retail/);
assert.equal(employee('ram').jobTitle, 'Chief Information Officer (CIO)');
assert.equal(employee('phil').jobTitle, 'Chief Technology Officer (CTO)');
assert.equal(employee('bharat').jobTitle, 'Head of Data');
assert.equal(employee('pavithra').managerId, employee('damien').id, 'Junior PMO reports to the PMO');
assert.equal(employee('sujan').managerId, employee('swechchha').id);
// Confirmed organisation hierarchy: Angus → Ram (CIO) / Phil (CTO).
assert.equal(employee('ram').managerId, employee('angus').id);
assert.equal(employee('phil').managerId, employee('angus').id);
assert.equal(employee('swechchha').managerId, employee('ram').id, 'Delivery Head reports to the CIO');
assert.equal(employee('bharat').managerId, employee('phil').id, 'Head of Data reports to the CTO');
assert.equal(employee('greg').managerId, employee('phil').id);
assert.equal(employee('damien').managerId, employee('swechchha').id, 'PMO reports to the Delivery Head');
assert.equal(employee('daniel').managerId, employee('swechchha').id, 'Daniel is a PMO peer, not above Damien');
assert.equal(employee('natasha').managerId, employee('damien').id, 'BA Lead reports to the PMO');
assert.equal(employee('rahil').managerId, employee('damien').id, 'QA Lead reports to the PMO');
assert.equal(employee('rahil').name, 'Rahil');
assert.equal(employee('rahil').jobTitle, 'QA Lead');
assert.equal(employee('natasha').jobTitle, 'BA Lead');
assert.equal(employee('naweesh').managerId, employee('greg').id);
assert.equal(employee('jayden').managerId, employee('naweesh').id, 'Architecture Design Lead reports to the DevOps Lead');
assert.equal(employee('ibadur').managerId, employee('jayden').id);
assert.equal(employee('tristan').managerId, employee('jayden').id);
assert.equal(employee('rob').managerId, employee('naweesh').id);
assert.equal(employee('mohsin').workLocation, 'remote');
assert.equal(employee('ramaparsad').workLocation, 'remote');
assert.equal(employee('abhishek').employmentType, 'contractor');
assert.equal(employee('abhishek').workLocation, 'remote');
assert.ok(employee('priyanka').supportingStreamIds.includes(HARRIS_FARM_STREAM_IDS.data));
assert.ok(employee('aliRad').supportingStreamIds.includes(HARRIS_FARM_STREAM_IDS.data));
assert.match(employee('aliRad').collaborationNotes, /Finance/);

assert.equal(state.deliveryStreams.length, 10);
for (const [key, lead] of [
  ['cio', 'ram'], ['delivery', 'swechchha'], ['pmo', 'damien'], ['qa', 'rahil'], ['data', 'bharat'],
  ['cto', 'phil'], ['architecture', 'greg'], ['devops', 'naweesh'], ['architectureDesign', 'jayden'], ['d365', 'ibadur'],
]) assert.equal(streams.get(HARRIS_FARM_STREAM_IDS[key])?.leadId, employee(lead).id, `${key} lead`);
assert.equal(streams.get(HARRIS_FARM_STREAM_IDS.delivery)?.parentId, HARRIS_FARM_STREAM_IDS.cio);
assert.equal(streams.get(HARRIS_FARM_STREAM_IDS.architecture)?.parentId, HARRIS_FARM_STREAM_IDS.cto);
assert.equal(streams.get(HARRIS_FARM_STREAM_IDS.data)?.parentId, HARRIS_FARM_STREAM_IDS.cto);
assert.equal(streams.get(HARRIS_FARM_STREAM_IDS.devops)?.parentId, HARRIS_FARM_STREAM_IDS.architecture);
assert.equal(streams.get(HARRIS_FARM_STREAM_IDS.architectureDesign)?.parentId, HARRIS_FARM_STREAM_IDS.architecture);
assert.equal(streams.get(HARRIS_FARM_STREAM_IDS.d365)?.parentId, HARRIS_FARM_STREAM_IDS.architecture);

const activeScope = getScope(state, HARRIS_FARM_EMPLOYEE_IDS.angus);
assert.deepEqual(activeScope.visibleDepartmentIds, [HARRIS_FARM_IT_DEPT_ID]);
assert.equal(activeScope.visibleEmployeeIds.length, 31);
const lukeScope = getScope(state, HARRIS_FARM_EMPLOYEE_IDS.luke);
assert.deepEqual(lukeScope.visibleDepartmentIds, [], 'Luke has no unrolled departments assigned yet');
assert.deepEqual(lukeScope.visibleEmployeeIds, [HARRIS_FARM_EMPLOYEE_IDS.luke]);

assert.equal(state.workItems.filter((item) => item.kind === 'epic').length, 1);
assert.equal(state.workItems.filter((item) => item.kind === 'feature').length, 5);
assert.equal(state.workItems.filter((item) => item.kind === 'ticket').length, 6);
for (const activity of state.activities) {
  assert.ok(workItems.has(activity.workItemId), `${activity.id} links to an onboarded ticket`);
  assert.ok(byId.has(activity.assigneeId));
  assert.match(activity.description, /no actual time is pre-logged/i);
}
const activityOwners = new Set(state.activities.map((activity) => activity.assigneeId));
assert.equal(activityOwners.size, 29);
assert.ok(state.employees.filter((row) => row.role !== 'ceo').every((row) => activityOwners.has(row.id)));
const harrisEmployeeIds = new Set(state.employees.map((row) => row.id));
assert.equal(state.timeEntries.filter((entry) => harrisEmployeeIds.has(entry.employeeId)).length, 0, 'no unprovided actual timesheet hours are fabricated');

/* The organisation hierarchy is derived from managerId, so the reporting-line
   rules are tested on the same snapshot the Organisation screen reads. */
const hfmTree = buildOrgTree(state.employees);
const hfmFlat = flattenOrg(hfmTree);
assert.equal(hfmFlat.length, state.employees.length, 'every person appears once in the chart');
assert.equal(hfmFlat[0].employee.name, 'Angus Harris', 'Angus is the top of the hierarchy');
assert.equal(hfmFlat.filter((node) => node.depth === 0 && node.employee.name !== 'Luke Harris').length, 1, 'one CIO/CTO line under Angus');
assert.deepEqual(
  orgBreadcrumb(state.employees, employee('rahil').id),
  'Angus Harris → RAM → Swechchha → Damien → Rahil',
  'QA lead sits five layers down the confirmed line',
);
assert.deepEqual(
  orgBreadcrumb(state.employees, employee('ibadur').id),
  'Angus Harris → Phil → Greg → Naweesh → Jayden → Ibadur',
  'D365 lead sits under the Architecture Design lead',
);
assert.deepEqual(
  orgBreadcrumb(state.employees, employee('bharat').id),
  'Angus Harris → Phil → Bharat',
  'Head of Data reports to the CTO',
);
assert.equal(orgStats(state.employees).layers, 7, 'Angus → Phil → Greg → Naweesh → Jayden → Ibadur → D365 team');
assert.equal(orgStats(state.employees).topLevel, 2, 'Angus and Luke are both top level');

// A move keeps the whole team together and only rewrites managerId.
const beforeMove = new Map(state.employees.map((row) => [row.id, row]));
const moved = reparentEmployees(state.employees, employee('bharat').id, employee('ram').id);
const movedBharat = moved.find((row) => row.id === employee('bharat').id);
assert.equal(movedBharat.managerId, employee('ram').id);
assert.equal(movedBharat.departmentId, beforeMove.get(employee('bharat').id).departmentId, 'a move never re-scopes the department');
assert.equal(movedBharat.streamId, beforeMove.get(employee('bharat').id).streamId, 'a move never re-scopes the stream');
assert.equal(orgTeamIds(moved, employee('bharat').id).size, 3, 'Bharat moves with Sunil and Arti');

// Invalid moves are refused with an explanation instead of being written.
assert.equal(validateOrgMove(state.employees, employee('bharat').id, employee('bharat').id).ok, false, 'no self-reporting');
assert.equal(validateOrgMove(state.employees, employee('ram').id, employee('swechchha').id).ok, false, 'no hierarchy loop');
assert.equal(validateOrgMove(state.employees, employee('ram').id, employee('angus').id).ok, false, 'already reports there');
assert.equal(validateOrgMove(state.employees, employee('bharat').id, employee('ram').id).ok, true, 'a legitimate move is allowed');
assert.equal(validateOrgMove(state.employees, employee('phil').id, null).ok, true, 'a person can be made top level');
assert.match(orgImpactSummary(state.employees, employee('ram').id), /direct report/);
assert.deepEqual(orgBlockedTargets(state.employees, employee('ram').id).has(employee('damien').id), true);

const parsed = workspaceSchema.safeParse(toSharedState(full));
assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues, null, 2));

// Upgrade an older locally stored snapshot additively and switch its former
// default Harbourline focus to the requested Harris Farm onboarding tenant.
const withoutHarris = {
  ...full,
  tenants: full.tenants.filter((tenant) => tenant.id !== HARRIS_FARM_TENANT_ID),
  entities: full.entities.filter((entity) => entity.tenantId !== HARRIS_FARM_TENANT_ID),
  departments: full.departments.filter((department) => department.id !== HARRIS_FARM_IT_DEPT_ID),
  employees: full.employees.filter((person) => !harrisEmployeeIds.has(person.id)),
  deliveryStreams: full.deliveryStreams.filter((stream) => stream.departmentId !== HARRIS_FARM_IT_DEPT_ID),
  workItems: full.workItems.filter((item) => item.departmentId !== HARRIS_FARM_IT_DEPT_ID),
  activities: full.activities.filter((activity) => activity.departmentId !== HARRIS_FARM_IT_DEPT_ID),
  timeEntries: full.timeEntries.filter((entry) => !harrisEmployeeIds.has(entry.employeeId)),
  settings: { ...full.settings, activeTenantId: 'tnt-harbourline', activeUserId: 'rtl-emp-004', onboardingVersion: 0 },
};
const migrated = initialiseWorkspaceState(withoutHarris);
assert.equal(migrated.settings.activeTenantId, HARRIS_FARM_TENANT_ID);
assert.equal(migrated.settings.activeUserId, HARRIS_FARM_ACTIVE_USER_ID);
assert.equal(migrated.tenants.filter((tenant) => tenant.id === HARRIS_FARM_TENANT_ID).length, 1);
assert.equal(scopeStateToTenant(migrated, HARRIS_FARM_TENANT_ID).employees.length, 31);

/* A workspace saved on the earlier draft reporting lines is upgraded in place:
   lines and designations change, ids and everything else stay the same. */
const draftSnapshot = {
  ...full,
  employees: full.employees.map((person) => {
    if (person.id === HARRIS_FARM_EMPLOYEE_IDS.raheem) return { ...person, name: 'Raheem', jobTitle: 'QA', managerId: HARRIS_FARM_EMPLOYEE_IDS.damien };
    if (person.id === HARRIS_FARM_EMPLOYEE_IDS.bharat) return { ...person, managerId: HARRIS_FARM_EMPLOYEE_IDS.ram };
    if (person.id === HARRIS_FARM_EMPLOYEE_IDS.jayden) return { ...person, managerId: HARRIS_FARM_EMPLOYEE_IDS.greg };
    if (person.id === HARRIS_FARM_EMPLOYEE_IDS.natasha) return { ...person, managerId: HARRIS_FARM_EMPLOYEE_IDS.damien };
    if (person.id === HARRIS_FARM_EMPLOYEE_IDS.ibadur) return { ...person, managerId: HARRIS_FARM_EMPLOYEE_IDS.greg };
    return person;
  }),
  settings: { ...full.settings, onboardingVersion: 1 },
};
const upgraded = scopeStateToTenant(initialiseWorkspaceState(draftSnapshot), HARRIS_FARM_TENANT_ID);
const upgradedById = new Map(upgraded.employees.map((person) => [person.id, person]));
assert.equal(upgraded.settings.onboardingVersion, 2);
assert.equal(upgraded.employees.length, draftSnapshot.employees.filter((person) => person.entityId === HARRIS_FARM_ENTITY_ID).length);
assert.equal(upgradedById.get(HARRIS_FARM_EMPLOYEE_IDS.raheem).name, 'Rahil');
assert.equal(upgradedById.get(HARRIS_FARM_EMPLOYEE_IDS.raheem).jobTitle, 'QA Lead');
assert.equal(upgradedById.get(HARRIS_FARM_EMPLOYEE_IDS.bharat).managerId, HARRIS_FARM_EMPLOYEE_IDS.phil);
assert.equal(upgradedById.get(HARRIS_FARM_EMPLOYEE_IDS.jayden).managerId, HARRIS_FARM_EMPLOYEE_IDS.naweesh);
assert.equal(upgradedById.get(HARRIS_FARM_EMPLOYEE_IDS.ibadur).managerId, HARRIS_FARM_EMPLOYEE_IDS.jayden);
assert.equal(upgradedById.get(HARRIS_FARM_EMPLOYEE_IDS.natasha).managerId, HARRIS_FARM_EMPLOYEE_IDS.damien);
assert.equal(upgraded.timeEntries.filter((entry) => harrisEmployeeIds.has(entry.employeeId)).length, 0, 'the upgrade never invents actual time');

console.log('PASS: Harris Farm tenant, confirmed organisation hierarchy, co-CEO scopes, editable reporting titles, nested IT streams, DevOps-linked planning and additive upgrade');
