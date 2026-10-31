import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workspaceSchema } from '../server/validation.mjs';
import { SeedError, prepareSeedState } from '../server/workspace-seed.mjs';

/**
 * Tenancy and leave are part of the shared snapshot contract: a snapshot may
 * hold several tenants, and every tenant-owned row must validate. These tests
 * pin the shape the client writes so a bad snapshot is rejected before it can
 * reach another browser.
 */

const baseState = {
  tenants: [
    {
      id: 'tnt-harbourline',
      name: 'Harbourline Retail Australia',
      code: 'HRA',
      countryCode: 'AU',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      industry: 'Retail',
      status: 'active',
      calendarScope: { mode: 'single', departmentIds: ['dept-it'] },
      ptoAnnualEntitlementDays: 20,
    },
  ],
  entities: [
    {
      id: 'group',
      tenantId: 'tnt-harbourline',
      name: 'Group',
      code: 'G',
      type: 'group',
      parentId: null,
      countryCode: 'AU',
      timezone: 'Australia/Sydney',
    },
  ],
  departments: [{ id: 'dept-it', entityId: 'group', name: 'IT', code: 'ITD', headId: null, opsOwnerId: null, costCenter: '', color: '#333333' }],
  employees: [
    {
      id: 'employee',
      name: 'Pilot',
      email: 'pilot@example.com',
      code: 'P1',
      entityId: 'group',
      departmentId: 'dept-it',
      role: 'department_head',
      managerId: null,
      countryCode: 'AU',
      weeklyHours: 38,
      joinDate: '2026-10-21',
      status: 'active',
      avatarColor: '#333333',
    },
  ],
  activities: [],
  timeEntries: [],
  holidays: [],
  countries: [{ code: 'AU', name: 'Australia', flag: 'AU', weeklyOff: [0, 6], timezone: 'Australia/Sydney' }],
  escalations: [],
  connections: [],
  syncJobs: [],
  auditLog: [{ id: 'aud-1', tenantId: 'tnt-harbourline', at: '2026-10-21T00:00:00.000Z', actorId: 'employee', action: 'Seeded', detail: '' }],
  standups: [],
  leaves: [
    {
      id: 'lv-1',
      employeeId: 'employee',
      departmentId: 'dept-it',
      entityId: 'group',
      startDate: '2026-11-02',
      endDate: '2026-11-06',
      hours: 38,
      workingDays: 5,
      publicHolidayDays: 0,
      publicHolidayHours: 0,
      type: 'annual',
      reason: 'Family holiday',
      status: 'approved',
      delegateId: null,
      submittedAt: '2026-10-20T00:00:00.000Z',
      decidedById: null,
      decidedAt: null,
      decisionNote: '',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    },
  ],
  settings: { groupName: 'Pilot', workingDayStart: '09:00', workingDayEnd: '17:00', holidayHorizonYears: 5, performanceThreshold: 70, weekStartsOn: 1 },
};

const parse = (state) => workspaceSchema.safeParse(state);

test('a multi-record snapshot with tenants, PTO and the calendar scope validates', () => {
  const parsed = parse(baseState);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues, null, 2));
  assert.equal(parsed.data.tenants.length, 1);
  assert.equal(parsed.data.leaves[0].status, 'approved');
  assert.equal(parsed.data.tenants[0].calendarScope.mode, 'single');
});

test('tenants are optional for older snapshots, but a broken tenant is rejected', () => {
  const { tenants: _omit, ...legacy } = baseState;
  assert.equal(parse(legacy).success, true, 'older snapshots keep working');

  assert.equal(parse({ ...baseState, tenants: [] }).success, false, 'at least one tenant is required');
  assert.equal(
    parse({ ...baseState, tenants: [{ ...baseState.tenants[0], calendarScope: { mode: 'some', departmentIds: [] } }] }).success,
    false,
    'the calendar scope mode is constrained',
  );
  assert.equal(
    parse({ ...baseState, tenants: [{ ...baseState.tenants[0], ptoAnnualEntitlementDays: -1 }] }).success,
    false,
    'PTO entitlement cannot be negative',
  );
  assert.equal(
    parse({ ...baseState, tenants: [baseState.tenants[0], { ...baseState.tenants[0] }] }).success,
    false,
    'duplicate tenant identifiers are refused',
  );
});

test('leave rows are validated, including the PH exclusion fields', () => {
  assert.equal(parse({ ...baseState, leaves: [{ ...baseState.leaves[0], status: 'tentative' }] }).success, false);
  assert.equal(parse({ ...baseState, leaves: [{ ...baseState.leaves[0], type: 'holiday' }] }).success, false);
  assert.equal(parse({ ...baseState, leaves: [{ ...baseState.leaves[0], hours: -2 }] }).success, false);
  assert.equal(parse({ ...baseState, leaves: [{ ...baseState.leaves[0], id: 'lv-1' }, baseState.leaves[0]] }).success, false);
  assert.equal(parse({ ...baseState, leaves: 'none' }).success, false);
});

test('calendar grants, designations, delegation and time windows validate without breaking legacy rows', () => {
  const owner = { ...baseState.employees[0], designationId: 'des-1', jobTitle: 'Department Lead' };
  const teammate = {
    ...baseState.employees[0],
    id: 'teammate',
    role: 'employee',
    managerId: owner.id,
    designationId: 'des-1',
    jobTitle: 'Department Lead',
  };
  const activity = {
    id: 'act-shared',
    title: 'Delegated month-end task',
    description: '',
    type: 'task',
    entityId: 'group',
    departmentId: 'dept-it',
    assigneeId: teammate.id,
    createdById: owner.id,
    startDate: '2026-10-31',
    endDate: '2026-10-31',
    startTime: '09:00',
    endTime: '10:30',
    plannedHours: 1.5,
    status: 'in_progress',
    priority: 'medium',
    progress: 25,
    location: 'HQ',
    subtasks: [],
    sync: { outlook: false, google: false },
    createdAt: '2026-10-31T08:00:00.000Z',
    delegationNote: 'Please complete this task',
    delegationHistory: [{ fromEmployeeId: owner.id, toEmployeeId: teammate.id, byEmployeeId: owner.id, at: '2026-10-31T08:00:00.000Z', note: 'Please complete this task' }],
  };
  const timeEntry = {
    id: 'te-shared',
    employeeId: teammate.id,
    activityId: activity.id,
    date: '2026-10-31',
    startTime: '09:00',
    endTime: '10:30',
    hours: 1.5,
    note: 'Completed assigned work',
    billable: true,
    approved: false,
    loggedById: owner.id,
    createdAt: '2026-10-31T10:30:00.000Z',
    updatedAt: '2026-10-31T10:30:00.000Z',
  };
  const workforceState = {
    ...baseState,
    employees: [owner, teammate],
    designations: [{ id: 'des-1', tenantId: 'tnt-harbourline', title: 'Department Lead', code: 'LEAD', description: '' }],
    calendarShares: [{ id: 'share-1', ownerId: owner.id, audience: 'employee', departmentId: null, employeeId: teammate.id, createdAt: '2026-10-31T08:00:00.000Z' }],
    activities: [activity],
    timeEntries: [timeEntry],
  };
  assert.equal(parse(workforceState).success, true, JSON.stringify(parse(workforceState).error?.issues, null, 2));
  assert.equal(parse({ ...workforceState, activities: [{ ...activity, plannedHours: 2 }] }).success, false, 'activity duration mismatches are refused');
  assert.equal(parse({ ...workforceState, timeEntries: [{ ...timeEntry, hours: 2 }] }).success, false, 'timesheet duration mismatches are refused');
  assert.equal(parse({ ...workforceState, calendarShares: [{ ...workforceState.calendarShares[0], employeeId: owner.id }] }).success, false, 'self shares are refused');
  assert.equal(parse({ ...workforceState, designations: [{ ...workforceState.designations[0], tenantId: 'tnt-other' }] }).success, false, 'cross-tenant designation links are refused');
  assert.equal(parse({ ...workforceState, activities: [{ ...activity, startTime: undefined, endTime: undefined }], timeEntries: [{ ...timeEntry, startTime: undefined, endTime: undefined }] }).success, true, 'legacy all-day rows remain readable');
});

test('unknown fields are still refused on tenant-owned rows', () => {
  assert.equal(
    parse({ ...baseState, entities: [{ ...baseState.entities[0], anotherTenantId: 'tnt-meridian' }] }).success,
    false,
    'a strict object prevents accidental cross-tenant back-doors',
  );
});

test('db:init never shares the device tenant or persona', () => {
  const prepared = prepareSeedState({
    ...baseState,
    settings: { ...baseState.settings, activeUserId: 'employee', activeTenantId: 'tnt-harbourline' },
  });
  assert.equal('activeUserId' in prepared.settings, false);
  assert.equal('activeTenantId' in prepared.settings, false);
  assert.equal(prepared.settings.groupName, 'Pilot');
});

test('an over-sized seed is refused before any write', () => {
  assert.throws(() => prepareSeedState(baseState, { maxBytes: 32 }), SeedError);
});

test('feeling scales, cascade updates and one-on-one records have strict compatible shapes', () => {
  const scale = [1, 2, 3, 4, 5].map((value) => ({ value, label: `Level ${value}`, color: '#123456' }));
  const session = {
    id: 'one-1', employeeId: 'employee', managerId: 'employee', departmentId: 'dept-it', date: '2026-10-31', feeling: 4,
    workLifeBalance: 'Balance', support: 'Support', escalation: '', discussion: 'Discussion', improvement: 'Feedback', careerProgression: 'Task',
    summary: 'Summary', summaryModel: 'model', summaryGeneratedAt: '2026-10-31T00:00:00Z', createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z',
  };
  const data = { ...baseState, tenants: [{ ...baseState.tenants[0], feelingScale: scale }], oneOnOnes: [session], leadershipUpdates: [{ id: 'update', authorId: 'employee', departmentId: 'dept-it', message: 'Message', createdAt: '2026-10-31T00:00:00Z' }] };
  assert.equal(parse(data).success, true);
  assert.equal(parse({ ...data, tenants: [{ ...data.tenants[0], feelingScale: [...scale.slice(0, 4), scale[0]] }] }).success, false, 'duplicate scale values are invalid');
  assert.equal(parse({ ...data, tenants: [{ ...data.tenants[0], feelingScale: scale.map((row) => ({ ...row, color: 'url(unsafe)' })) }] }).success, false, 'colours are strict hex values');
  assert.equal(parse({ ...data, oneOnOnes: [{ ...session, feeling: 0 }] }).success, false);
  assert.equal(parse({ ...data, oneOnOnes: [{ ...session, accidentalSecret: 'no' }] }).success, false);
  assert.equal(parse({ ...baseState, standups: [{ id: 's', date: '2026-10-31', departmentId: 'dept-it', employeeId: 'employee', feeling: 6, lastDayUpdate: '', progressUpdate: '', blockers: '', actionItems: [], supportRequests: [], status: 'draft', submittedAt: null, createdAt: '', updatedAt: '' }] }).success, false);
});
