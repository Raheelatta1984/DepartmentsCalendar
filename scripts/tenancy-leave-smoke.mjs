import assert from 'node:assert/strict';
import { createSeedState } from '../src/data/seed.ts';
import {
  buildTenantIndex,
  calendarDepartmentIds,
  findTenant,
  mergeTenantState,
  removeTenant,
  resolveTenantId,
  scopeStateToDepartments,
  scopeStateToTenant,
  tenantDepartments,
} from '../src/lib/tenants.ts';
import {
  approvalQueue,
  awayOnDate,
  canDecideLeave,
  leaveBreakdown,
  nextResponsible,
  ptoSummary,
} from '../src/lib/leave.ts';
import { getScope } from '../src/lib/permissions.ts';
import { toISO } from '../src/lib/dates.ts';

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', name, error.message]);
  }
};

const state = createSeedState();
const full = JSON.parse(JSON.stringify(state));
const index = buildTenantIndex(state);
const tenantIds = state.tenants.map((tenant) => tenant.id);

/* ------------------------------------------------------------------ */
/* 1. Tenant register and ownership                                    */
/* ------------------------------------------------------------------ */
check('every entity belongs to a registered tenant', () => {
  assert.ok(state.tenants.length >= 3, 'the pilot seeds Harris Farm, Harbourline and Meridian tenants');
  state.entities.forEach((entity) => {
    assert.ok(tenantIds.includes(entity.tenantId), `${entity.id} has no valid tenant`);
  });
});

check('entity trees never span two tenants', () => {
  state.entities.forEach((entity) => {
    if (!entity.parentId) return;
    const parent = state.entities.find((row) => row.id === entity.parentId);
    assert.equal(parent?.tenantId, entity.tenantId, `${entity.id} sits under another tenant’s parent`);
  });
});

check('departments and people inherit the entity tenant', () => {
  state.departments.forEach((department) => {
    const entity = state.entities.find((row) => row.id === department.entityId);
    assert.ok(entity, `${department.id} has no entity`);
    assert.equal(index.departmentTenant.get(department.id), entity.tenantId);
  });
  state.employees.forEach((employee) => {
    assert.ok(index.employeeTenant.get(employee.id), `${employee.id} has no tenant`);
  });
});

check('tenant scopes are disjoint for every row that matters', () => {
  const harbourline = scopeStateToTenant(state, 'tnt-harbourline');
  const meridian = scopeStateToTenant(state, 'tnt-meridian');
  const harrisFarm = scopeStateToTenant(state, 'tnt-harris-farm');

  const ids = (rows) => new Set(rows.map((row) => row.id));
  const overlap = (a, b, label) => {
    const shared = [...ids(a)].filter((id) => ids(b).has(id));
    assert.equal(shared.length, 0, `${label} leak across tenants: ${shared.slice(0, 3).join(', ')}`);
  };
  overlap(harbourline.entities, meridian.entities, 'entities');
  overlap(harbourline.departments, meridian.departments, 'departments');
  overlap(harbourline.employees, meridian.employees, 'employees');
  overlap(harbourline.activities, meridian.activities, 'activities');
  overlap(harbourline.timeEntries, meridian.timeEntries, 'timeEntries');
  overlap(harbourline.projects, meridian.projects, 'projects');
  overlap(harbourline.leaves, meridian.leaves, 'leaves');
  overlap(harbourline.standups, meridian.standups, 'standups');
  for (const [label, key] of [
    ['entities', 'entities'], ['departments', 'departments'], ['employees', 'employees'],
    ['activities', 'activities'], ['timeEntries', 'timeEntries'], ['projects', 'projects'],
    ['leaves', 'leaves'], ['standups', 'standups'],
  ]) {
    overlap(harrisFarm[key], harbourline[key], `Harris Farm / Harbourline ${label}`);
    overlap(harrisFarm[key], meridian[key], `Harris Farm / Meridian ${label}`);
  }

  assert.ok(harbourline.employees.every((employee) => employee.email.includes('harbourlineretail')));
  assert.ok(meridian.employees.every((employee) => !employee.email.includes('harbourlineretail')));
  assert.equal(harbourline.entities.length + meridian.entities.length + harrisFarm.entities.length, state.entities.length);
  assert.equal(harbourline.employees.length + meridian.employees.length + harrisFarm.employees.length, state.employees.length);
});

check('a tenant never references another tenant’s rows', () => {
  tenantIds.forEach((tenantId) => {
    const scoped = scopeStateToTenant(state, tenantId);
    const employees = new Set(scoped.employees.map((row) => row.id));
    const departments = new Set(scoped.departments.map((row) => row.id));
    const activities = new Set(scoped.activities.map((row) => row.id));
    scoped.timeEntries.forEach((entry) => assert.ok(employees.has(entry.employeeId), 'time entry of a foreign employee'));
    scoped.leaves.forEach((leave) => assert.ok(employees.has(leave.employeeId), 'leave of a foreign employee'));
    scoped.standups.forEach((row) => assert.ok(departments.has(row.departmentId), 'stand-up of a foreign department'));
    scoped.syncJobs.forEach((job) => assert.ok(activities.has(job.activityId), 'sync job of a foreign activity'));
  });
});

/* ------------------------------------------------------------------ */
/* 2. Writes stay inside the tenant                                    */
/* ------------------------------------------------------------------ */
check('saving one tenant leaves the other byte-for-byte untouched', () => {
  const before = scopeStateToTenant(full, 'tnt-meridian');
  const edited = scopeStateToTenant(full, 'tnt-harbourline');
  edited.activities = [
    { ...before.activities[0] ?? state.activities[0], id: 'new-activity', departmentId: edited.departments[0].id, assigneeId: edited.employees[0].id, entityId: edited.entities[0].id, title: 'Tenant-safe edit' },
    ...edited.activities,
  ];
  edited.leaves = [
    ...edited.leaves,
    {
      ...edited.leaves[0],
      id: 'new-leave',
      employeeId: edited.employees.find((employee) => employee.role === 'employee')?.id ?? edited.employees[0].id,
      status: 'pending',
    },
  ];
  const merged = mergeTenantState(full, edited, 'tnt-harbourline');

  assert.ok(merged.activities.some((activity) => activity.id === 'new-activity'));
  assert.ok(merged.leaves.some((leave) => leave.id === 'new-leave'));
  assert.deepEqual(scopeStateToTenant(merged, 'tnt-meridian'), before, 'the other tenant must be identical');
  assert.equal(merged.entities.length, full.entities.length, 'no entity duplicated by the merge');
  assert.equal(merged.leaves.length, full.leaves.length + 1, 'exactly one leave row added');
});

check('removing a tenant removes only its own rows', () => {
  const dataOnly = ({ tenants: _register, settings: _settings, ...rest }) => rest;
  const other = dataOnly(scopeStateToTenant(full, 'tnt-meridian'));
  const remaining = removeTenant(full, 'tnt-harbourline');
  assert.equal(remaining.tenants.length, full.tenants.length - 1);
  assert.ok(!remaining.tenants.some((tenant) => tenant.id === 'tnt-harbourline'));
  assert.deepEqual(dataOnly(scopeStateToTenant(remaining, 'tnt-meridian')), other);
  assert.ok(remaining.employees.every((employee) => !employee.id.startsWith('rtl-')));
  assert.equal(
    remaining.leaves.filter((leave) => leave.employeeId.startsWith('rtl-')).length,
    0,
    'leave rows of the removed tenant must go too',
  );
});

/* ------------------------------------------------------------------ */
/* 3. Calendar scope master setting                                    */
/* ------------------------------------------------------------------ */
check('Harbourline example tenant still covers its IT department only', () => {
  const tenant = findTenant(state.tenants, 'tnt-harbourline');
  assert.equal(tenant.calendarScope.mode, 'single');
  const scoped = scopeStateToTenant(state, tenant.id);
  const departments = calendarDepartmentIds(scoped, tenant);
  assert.equal(departments.length, 1, 'single department scope');
  assert.equal(departments[0], 'rdept-it', 'and it is the IT department');

  const calendar = scopeStateToDepartments(scoped, departments);
  assert.equal(calendar.departments.length, 1);
  assert.ok(calendar.employees.every((employee) => employee.departmentId === 'rdept-it'));
  assert.ok(calendar.activities.every((activity) => activity.departmentId === 'rdept-it'));
  assert.equal(calendar.leaves.filter((leave) => leave.departmentId !== 'rdept-it').length, 0);
});

check('multiple and all modes widen the calendar without crossing tenants', () => {
  const tenant = findTenant(state.tenants, 'tnt-harbourline');
  const scoped = scopeStateToTenant(state, tenant.id);
  const itAndStores = ['rdept-it', 'rdept-storeops'];
  const multiple = scopeStateToDepartments(scoped, itAndStores);
  assert.equal(multiple.departments.length, 2);
  assert.ok(multiple.employees.every((employee) => itAndStores.includes(employee.departmentId)));

  const all = scopeStateToDepartments(scoped, tenantDepartments(scoped, tenant.id).map((department) => department.id));
  assert.equal(all.departments.length, tenantDepartments(scoped, tenant.id).length);
  assert.ok(all.employees.every((employee) => index.employeeTenant.get(employee.id) === tenant.id));
});

check('a person’s own department is always kept in scope', () => {
  const tenant = findTenant(state.tenants, 'tnt-harbourline');
  const scoped = scopeStateToTenant(state, tenant.id);
  const storeOps = scoped.departments.find((department) => department.id === 'rdept-storeops');
  assert.ok(storeOps);
  const departments = calendarDepartmentIds(scoped, tenant, storeOps.id);
  assert.ok(departments.includes('rdept-it'), 'configured scope kept');
  assert.ok(departments.includes('rdept-storeops'), 'own department added');
});

/* ------------------------------------------------------------------ */
/* 4. Leave, PTO and public holidays                                   */
/* ------------------------------------------------------------------ */
const harbourline = scopeStateToTenant(state, 'tnt-harbourline');
const harbourlineTenant = findTenant(state.tenants, 'tnt-harbourline');
const cio = harbourline.employees.find((employee) => employee.id === 'rtl-emp-004');
assert.ok(cio, 'the IT department head is seeded');

check('PTO hours exclude public holidays and weekly offs', () => {
  const holiday = harbourline.holidays.find(
    (row) => row.countryCode === 'AU' && row.type !== 'weekly_off',
  );
  assert.ok(holiday, 'an Australian public holiday exists');
  const start = holiday.date;
  const end = toISO(new Date(new Date(`${start}T00:00:00`).getTime() + 6 * 86_400_000));
  const breakdown = leaveBreakdown(harbourline, cio, start, end);
  assert.ok(breakdown.publicHolidayDays >= 1, 'the holiday is reported as PH');
  assert.equal(breakdown.workingDays + breakdown.publicHolidayDays + breakdown.weeklyOffDays, breakdown.totalDays);
  assert.equal(breakdown.hours, Math.round(breakdown.workingDays * (cio.weeklyHours / 5) * 10) / 10, 'hours exclude PH');
  assert.ok(breakdown.publicHolidayHours > 0);
});

check('the seeded PH-crossing request shows excluded holiday hours', () => {
  const crossing = harbourline.leaves.filter((leave) => leave.publicHolidayDays > 0);
  assert.ok(crossing.length >= 1, 'at least one request crosses a public holiday');
  crossing.forEach((leave) => {
    assert.ok(leave.hours > 0);
    assert.equal(
      leave.hours,
      Math.round(leave.workingDays * ((harbourline.employees.find((employee) => employee.id === leave.employeeId).weeklyHours) / 5) * 10) / 10,
    );
  });
});

check('PTO summary counts approved annual leave only and reports PH separately', () => {
  const summary = ptoSummary(harbourline, cio, harbourlineTenant, new Date().getFullYear());
  assert.equal(summary.entitlementDays, harbourlineTenant.ptoAnnualEntitlementDays);
  assert.equal(summary.entitlementHours, Math.round(summary.entitlementDays * (cio.weeklyHours / 5) * 10) / 10);
  assert.ok(summary.approvedPtoHours >= 0);
  assert.ok(summary.pendingRequests >= 1, 'the seeded CIO request is pending');
  assert.equal(summary.remainingPtoHours, Math.max(0, summary.entitlementHours - summary.approvedPtoHours));
});

check('only the line manager and above can approve, never the requester', () => {
  const pending = harbourline.leaves.find((leave) => leave.status === 'pending' && leave.employeeId !== cio.id);
  assert.ok(pending, 'a pending request exists');
  const employee = harbourline.employees.find((row) => row.id === pending.employeeId);
  const requestScope = getScope(harbourline, pending.employeeId);
  assert.equal(canDecideLeave(harbourline, requestScope, pending), false, 'self-approval is refused');

  const manager = harbourline.employees.find((row) => row.id === employee.managerId);
  assert.ok(manager);
  const managerScope = getScope(harbourline, manager.id);
  assert.equal(canDecideLeave(harbourline, managerScope, pending), true, 'the line manager can decide');
  assert.ok(approvalQueue(harbourline, managerScope).some((leave) => leave.id === pending.id));
});

check('a decision never crosses tenants', () => {
  const meridian = scopeStateToTenant(state, 'tnt-meridian');
  const meridianHead = meridian.employees.find((employee) => employee.role === 'ceo');
  const scopedHead = getScope(meridian, meridianHead.id);
  assert.equal(
    approvalQueue(harbourline, scopedHead).length,
    0,
    'a Meridian executive has no Harbourline approval queue',
  );
});

check('next responsible follows delegate, manager, then department head', () => {
  const today = toISO(new Date());
  const away = awayOnDate(harbourline, ['rdept-it'], today);
  if (away.length) {
    const cover = nextResponsible(harbourline, away[0].employee.id, today);
    assert.ok(cover, 'somebody is responsible while the person is away');
    assert.notEqual(cover.employee.id, away[0].employee.id);
  }
  const someone = harbourline.employees.find((employee) => employee.managerId);
  const cover = nextResponsible(harbourline, someone.id, '2031-01-06');
  assert.ok(cover, 'a manager is offered when nobody is away');
  assert.ok(['Named delegate', 'Department head', 'Operations owner'].includes(cover.reason) || cover.reason.includes('line manager'));
});

/* ------------------------------------------------------------------ */
/* 5. Persona and scope safety                                         */
/* ------------------------------------------------------------------ */
check('the default persona belongs to the active tenant and never leaks to another tenant', () => {
  const resolved = resolveTenantId(state.tenants, state.settings.activeTenantId);
  const scoped = scopeStateToTenant(state, resolved);
  assert.ok(scoped.employees.some((employee) => employee.id === state.settings.activeUserId));
  assert.equal(scoped.employees.find((employee) => employee.id === 'emp-001'), undefined);
  assert.equal(resolved, 'tnt-harris-farm');
});

const failures = results.filter((row) => row[0] === 'FAIL');
results.forEach((row) => console.log('CHECK', ...row));
console.log(`\n${results.length - failures.length}/${results.length} tenancy & leave checks passed`);
if (failures.length) process.exit(1);
