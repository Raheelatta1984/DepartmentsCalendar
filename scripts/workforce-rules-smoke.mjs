import assert from 'node:assert/strict';
import {
  canApproveEmployeeTime,
  canAssignActivity,
  canEditActivity,
  canLogForEmployee,
  compareOrganisationEmployees,
  getScope,
  organisationBand,
} from '../src/lib/permissions.ts';
import { addHoursToTime, elapsedHours, hoursMatchTimeWindow, timeToMinutes, timeWindowError } from '../src/lib/time.ts';
import { withDesignationDefaults } from '../src/lib/master-data.ts';

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`PASS ${name}`);
}

const departments = [
  { id: 'dept-a', entityId: 'entity', name: 'Alpha', code: 'A', headId: 'head-a', opsOwnerId: null },
  { id: 'dept-b', entityId: 'entity', name: 'Beta', code: 'B', headId: 'head-b', opsOwnerId: null },
];
const person = (id, role, departmentId, managerId, jobTitle = role) => ({
  id,
  name: id,
  email: `${id}@example.com`,
  code: id.toUpperCase(),
  entityId: 'entity',
  departmentId,
  role,
  jobTitle,
  managerId,
  countryCode: 'AU',
  weeklyHours: 38,
  joinDate: '2026-01-01',
  status: 'active',
  avatarColor: '#123456',
});
const employees = [
  { ...person('ceo', 'ceo', 'dept-a', null, 'Chief Executive Officer'), responsibleDepartmentIds: ['dept-a'] },
  person('head-a', 'department_head', 'dept-a', 'ceo', 'Head of Alpha'),
  person('lead-a', 'manager', 'dept-a', 'head-a', 'Alpha Lead'),
  person('member-a', 'employee', 'dept-a', 'lead-a', 'Team Member'),
  person('peer-a', 'employee', 'dept-a', 'lead-a', 'Team Member'),
  person('head-b', 'department_head', 'dept-b', 'ceo', 'Head of Beta'),
  person('other-b', 'employee', 'dept-b', 'head-b', 'Beta Specialist'),
];
const state = {
  entities: [{ id: 'entity', tenantId: 'tenant-a' }],
  departments,
  employees,
  calendarShares: [],
  designations: [],
};

check('ordinary employees see only their own work by default', () => {
  assert.deepEqual(getScope(state, 'member-a').visibleEmployeeIds, ['member-a']);
  assert.deepEqual(getScope(state, 'peer-a').visibleEmployeeIds, ['peer-a']);
  assert.equal(getScope(state, 'member-a').visibleEmployeeIds.includes('lead-a'), false);
});

check('reporting leads see downstream reports, not their own manager or peers', () => {
  const scope = getScope(state, 'lead-a');
  assert.deepEqual(new Set(scope.visibleEmployeeIds), new Set(['lead-a', 'member-a', 'peer-a']));
  assert.equal(scope.visibleEmployeeIds.includes('head-a'), false);
});

check('department sharing reveals the owner only and remains read-only', () => {
  const shared = {
    ...state,
    calendarShares: [{ id: 'share-1', ownerId: 'lead-a', audience: 'department', departmentId: 'dept-a', employeeId: null }],
  };
  const scope = getScope(shared, 'member-a');
  assert.deepEqual(new Set(scope.visibleEmployeeIds), new Set(['member-a', 'lead-a']));
  assert.equal(scope.visibleEmployeeIds.includes('peer-a'), false);
  const managerActivity = { type: 'meeting', assigneeId: 'lead-a' };
  assert.equal(canLogForEmployee(shared, 'member-a', 'lead-a'), false);
  assert.equal(canEditActivity(shared, 'member-a', managerActivity), false);
});

check('direct cross-department sharing never exposes the owner’s department', () => {
  const shared = {
    ...state,
    calendarShares: [{ id: 'share-2', ownerId: 'other-b', audience: 'employee', departmentId: null, employeeId: 'member-a' }],
  };
  const scope = getScope(shared, 'member-a');
  assert.deepEqual(new Set(scope.visibleEmployeeIds), new Set(['member-a', 'other-b']));
  assert.equal(scope.visibleEmployeeIds.includes('head-b'), false);
  assert.equal(scope.visibleDepartmentIds.includes('dept-b'), true);

  const ceoScope = getScope({ ...shared, calendarShares: [{ ...shared.calendarShares[0], employeeId: 'ceo' }] }, 'ceo');
  assert.equal(ceoScope.visibleEmployeeIds.includes('other-b'), true);
  assert.equal(ceoScope.visibleEmployeeIds.includes('head-b'), false);
});

check('only self or a supervisor-and-above reporting ancestor can log time', () => {
  assert.equal(canLogForEmployee(state, 'member-a', 'member-a'), true);
  assert.equal(canLogForEmployee(state, 'member-a', 'peer-a'), false);
  assert.equal(canLogForEmployee(state, 'member-a', 'lead-a'), false);
  assert.equal(canLogForEmployee(state, 'lead-a', 'member-a'), true);
  assert.equal(canLogForEmployee(state, 'head-a', 'member-a'), true);
  assert.equal(canLogForEmployee(state, 'head-b', 'member-a'), false);
});

check('only a reporting lead can approve another employee’s time', () => {
  assert.equal(canApproveEmployeeTime(state, 'lead-a', 'member-a'), true);
  assert.equal(canApproveEmployeeTime(state, 'member-a', 'member-a'), false);
  assert.equal(canApproveEmployeeTime(state, 'peer-a', 'member-a'), false);
});

check('task delegation is same-department and never a general activity permission', () => {
  const ownTask = { type: 'task', assigneeId: 'member-a' };
  assert.equal(canAssignActivity(state, 'member-a', ownTask, 'peer-a'), true);
  assert.equal(canAssignActivity(state, 'member-a', ownTask, 'other-b'), false);
  assert.equal(canAssignActivity(state, 'member-a', { ...ownTask, type: 'meeting' }, 'peer-a'), false);
  assert.equal(canAssignActivity(state, 'lead-a', { type: 'meeting', assigneeId: 'lead-a' }, 'member-a'), true);
});

check('roadmap and team-week order is heads, leads, then members', () => {
  assert.equal(organisationBand(employees.find((e) => e.id === 'head-a'), departments[0]), 'heads');
  assert.equal(organisationBand(employees.find((e) => e.id === 'lead-a'), departments[0]), 'leads');
  assert.equal(organisationBand(employees.find((e) => e.id === 'member-a'), departments[0]), 'members');
  assert.equal(
    organisationBand(employees.find((e) => e.id === 'member-a'), departments[0], [{ id: 'stream', leadId: 'member-a' }]),
    'leads',
  );
  const ordered = ['member-a', 'peer-a', 'lead-a', 'head-a']
    .map((id) => employees.find((employee) => employee.id === id))
    .sort((a, b) => compareOrganisationEmployees(a, b, departments))
    .map((employee) => employee.id);
  assert.deepEqual(ordered, ['head-a', 'lead-a', 'member-a', 'peer-a']);
});

check('same-day time windows calculate rounded hours and reject mismatches', () => {
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(timeToMinutes('24:00'), null);
  assert.equal(elapsedHours('09:00', '10:30'), 1.5);
  assert.equal(elapsedHours('09:00', '09:20'), 0.33);
  assert.equal(elapsedHours('10:00', '09:00'), null);
  assert.equal(hoursMatchTimeWindow(0.33, '09:00', '09:20'), true);
  assert.equal(hoursMatchTimeWindow(0.5, '09:00', '09:20'), false);
  assert.equal(timeWindowError(1.5, '09:00', '10:30'), null);
  assert.match(timeWindowError(2, '09:00', '10:30'), /do not match/);
  assert.match(timeWindowError(1, '09:00', ''), /both a start and end time/);
  assert.match(timeWindowError(1, '', '', { requireWindow: true }), /Choose both/);
  assert.equal(timeWindowError(1, '', ''), null);
  assert.equal(addHoursToTime('09:00', 1.5), '10:30');
});

check('legacy job titles normalize into deterministic reusable designations', () => {
  const first = withDesignationDefaults(state);
  const second = withDesignationDefaults(first);
  assert.deepEqual(second, first);
  const teamMembers = first.employees.filter((employee) => employee.jobTitle === 'Team Member');
  assert.equal(teamMembers.length, 2);
  assert.equal(teamMembers[0].designationId, teamMembers[1].designationId);
  assert.equal(new Set(first.designations.map((designation) => designation.id)).size, first.designations.length);
  const custom = withDesignationDefaults({
    ...first,
    employees: [{ ...first.employees[0], designationId: first.designations[0].id, jobTitle: 'Custom Business Title' }],
  });
  assert.equal(custom.employees[0].jobTitle, 'Custom Business Title');
});

console.log(`WORKFORCE RULES PASS (${checks} groups)`);
