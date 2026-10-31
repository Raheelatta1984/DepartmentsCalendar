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
  'Damien', 'Sujan', 'Pavithra', 'Priyanka', 'Ali Rad', 'Raheem', 'Natasha', 'Greg', 'Naweesh',
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
assert.equal(employee('pavithra').managerId, employee('daniel').id);
assert.equal(employee('sujan').managerId, employee('swechchha').id);
assert.equal(employee('raheem').managerId, employee('damien').id);
assert.equal(employee('natasha').managerId, employee('damien').id);
assert.equal(employee('mohsin').workLocation, 'remote');
assert.equal(employee('ramaparsad').workLocation, 'remote');
assert.equal(employee('abhishek').employmentType, 'contractor');
assert.equal(employee('abhishek').workLocation, 'remote');
assert.ok(employee('priyanka').supportingStreamIds.includes(HARRIS_FARM_STREAM_IDS.data));
assert.ok(employee('aliRad').supportingStreamIds.includes(HARRIS_FARM_STREAM_IDS.data));
assert.match(employee('aliRad').collaborationNotes, /Finance/);

assert.equal(state.deliveryStreams.length, 10);
for (const [key, lead] of [
  ['cio', 'ram'], ['delivery', 'swechchha'], ['pmo', 'daniel'], ['qa', 'damien'], ['data', 'bharat'],
  ['cto', 'phil'], ['architecture', 'greg'], ['devops', 'naweesh'], ['architectureDesign', 'jayden'], ['d365', 'ibadur'],
]) assert.equal(streams.get(HARRIS_FARM_STREAM_IDS[key])?.leadId, employee(lead).id, `${key} lead`);
assert.equal(streams.get(HARRIS_FARM_STREAM_IDS.delivery)?.parentId, HARRIS_FARM_STREAM_IDS.cio);
assert.equal(streams.get(HARRIS_FARM_STREAM_IDS.architecture)?.parentId, HARRIS_FARM_STREAM_IDS.cto);
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

console.log('PASS: Harris Farm tenant, co-CEO scopes, editable reporting titles, nested IT streams, DevOps-linked planning and additive upgrade');
