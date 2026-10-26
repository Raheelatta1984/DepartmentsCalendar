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
