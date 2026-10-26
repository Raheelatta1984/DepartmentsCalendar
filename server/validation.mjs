import { z } from 'zod';

const text = z.string().max(10_000);
const id = z.string().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const number = z.number().finite();
const record = (shape) => z.strictObject(shape);
const rows = (shape) => z.array(record(shape)).max(50_000);
const period = z.enum(['day', 'week', 'month', 'quarter', 'year']);
const provider = z.enum(['outlook', 'google']);
const taskPhase = z.enum(['discovery', 'design', 'build', 'test', 'deploy', 'hypercare', 'support', 'training']);
const projectCategory = z.enum(['delivery', 'operations', 'security', 'data_analytics', 'infrastructure', 'integration', 'digital_experience', 'enterprise_apps', 'network', 'compliance']);

// Deliberately allow only the demo's data model, not arbitrary JSON or OAuth tokens.
// activeUserId is a browser preference, never shared with other devices.
export const workspaceSchema = record({
  // A workspace hosts one or more tenants. Every tenant-owned row is
  // attributed through its entity / department / employee, which is what the
  // client uses to keep the tenants isolated; the IDs are validated here so a
  // snapshot can never contain a dangling reference by accident.
  tenants: rows({
    id, name: text, code: text, countryCode: text, timezone: text, currency: text,
    industry: text.optional(), status: z.enum(['active', 'archived']),
    calendarScope: record({
      mode: z.enum(['single', 'multiple', 'all']),
      departmentIds: z.array(id).max(500),
    }),
    ptoAnnualEntitlementDays: number.min(0).max(365),
    createdAt: text.optional(),
  }).min(1).optional(),
  entities: rows({
    id, tenantId: id.optional(), name: text, code: text, type: z.enum(['group', 'company', 'sub_company']),
    parentId: id.nullable(), countryCode: text, timezone: text, industry: text.optional(), currency: text.optional(),
    logoUrl: z.string().max(500_000).optional(), portalHeader: text.optional(), portalFooter: text.optional(),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    fontFamily: z.enum(['Inter', 'Arial', 'Georgia', 'system']).optional(), headingFont: z.enum(['Inter', 'Arial', 'Georgia', 'system']).optional(),
  }).min(1),
  departments: rows({
    id, entityId: id, name: text, code: text, headId: id.nullable(), opsOwnerId: id.nullable(),
    costCenter: text, color: text,
  }).min(1),
  employees: rows({
    id, name: text, email: text, code: text, entityId: id, departmentId: id,
    role: z.enum(['ceo', 'head_operations', 'department_head', 'unit_head', 'manager', 'supervisor', 'employee']),
    managerId: id.nullable(), countryCode: text, weeklyHours: number.min(1).max(80), joinDate: date,
    status: z.enum(['active', 'on_leave', 'inactive']), avatarColor: text, costRateAUD: number.min(0).max(10_000).optional(),
  }).min(1),
  activities: rows({
    id, title: text, description: text,
    type: z.enum(['task', 'follow_up', 'appointment', 'meeting', 'seminar', 'session', 'training', 'audit', 'site_visit']),
    entityId: id, departmentId: id, assigneeId: id, createdById: id,
    startDate: date, endDate: date, startTime: time.optional(), endTime: time.optional(),
    plannedHours: number.min(0).max(100_000),
    status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'cancelled']),
    priority: z.enum(['critical', 'high', 'medium', 'low']), progress: number.min(0).max(100),
    location: text.optional(), subtasks: rows({ id, title: text, done: z.boolean(), plannedHours: number.min(0) }),
    sync: record({ outlook: z.boolean(), google: z.boolean() }), createdAt: text,
    projectId: id.optional(), projectTaskId: id.optional(), capitalisable: z.boolean().optional(), projectPhase: taskPhase.optional(),
  }),
  timeEntries: rows({
    id, employeeId: id, activityId: id, date, hours: number.min(0).max(24), note: text,
    billable: z.boolean(), approved: z.boolean(),
  }),
  holidays: rows({ id, countryCode: text, date, name: text, type: z.enum(['public_holiday', 'company_holiday', 'weekly_off']) }),
  countries: rows({
    code: id, name: text, flag: text, weeklyOff: z.array(z.number().int().min(0).max(6)).max(7),
    timezone: text, note: text.optional(),
  }).min(1),
  escalations: rows({
    id, departmentId: id, period, periodStart: date, periodEnd: date,
    score: number, threshold: number, utilization: number, onTimeRate: number,
    recipients: z.array(id), cc: z.array(id), createdAt: text,
    status: z.enum(['open', 'acknowledged', 'closed']), note: text,
  }),
  connections: rows({
    id, employeeId: id, provider, accountEmail: text,
    status: z.enum(['connected', 'pending', 'disconnected']), lastSync: text.nullable(), twoWay: z.boolean(),
  }),
  syncJobs: rows({
    id, activityId: id, provider, action: z.enum(['create', 'update', 'delete']),
    status: z.enum(['queued', 'synced', 'failed']), at: text, message: text,
  }),
  leaves: rows({
    id, employeeId: id, departmentId: id, entityId: id,
    startDate: date, endDate: date,
    hours: number.min(0).max(1000), workingDays: number.min(0).max(400),
    publicHolidayDays: number.min(0).max(400), publicHolidayHours: number.min(0).max(1000),
    type: z.enum(['annual', 'sick', 'unpaid', 'parental', 'study', 'other']),
    reason: text, status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
    delegateId: id.nullable(),
    submittedAt: text, decidedById: id.nullable(), decidedAt: text.nullable(),
    decisionNote: text, createdAt: text, updatedAt: text,
  }).optional(),
  standups: rows({
    id, date, departmentId: id, employeeId: id,
    lastDayUpdate: text, progressUpdate: text, blockers: text,
    actionItems: rows({
      id, title: text, ownerId: id.nullable(), dueDate: date.nullable(),
      status: z.enum(['open', 'done']),
    }),
    supportRequests: rows({
      id, description: text, type: z.enum(['internal', 'cross_functional']),
      targetDepartmentId: id.nullable(),
      status: z.enum(['open', 'acknowledged', 'resolved']),
      createdAt: text, resolvedAt: text.nullable(),
    }),
    status: z.enum(['draft', 'submitted']),
    submittedAt: text.nullable(), createdAt: text, updatedAt: text,
  }).optional(),
  settings: record({
    groupName: text, workingDayStart: time, workingDayEnd: time,
    holidayHorizonYears: z.number().int().min(1).max(20), performanceThreshold: number.min(0).max(100),
    weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  }),
  auditLog: rows({ id, tenantId: id.optional(), at: text, actorId: id, action: text, detail: text }),
  projects: rows({
    id, code: text, name: text, description: text, entityId: id, departmentId: id,
    portfolio: z.enum(['capital', 'operational']), category: projectCategory,
    stage: z.enum(['idea', 'business_case', 'approved', 'design', 'build', 'test', 'deploy', 'hypercare', 'closed', 'on_hold']),
    status: z.enum(['pipeline', 'active', 'on_hold', 'completed', 'cancelled']),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    sponsorId: id, managerId: id, startDate: date, endDate: date,
    budgetAUD: number.min(0), capexAUD: number.min(0), opexAUD: number.min(0),
    capitalisationRate: number.min(0).max(1), assetClass: text, usefulLifeYears: number.min(0).max(50),
    capitalisationStart: date, capitalisationEnd: date, boardApproved: z.boolean(), wbsCode: text,
    tasks: rows({
      id, projectId: id, activityId: id, title: text, phase: taskPhase,
      capitalisable: z.boolean(), plannedHours: number.min(0), startDate: date, endDate: date,
    }),
  }).optional(),
  capitalisation: record({
    currency: z.literal('AUD'), standard: text,
    eligiblePhases: z.array(taskPhase), excludedPhases: z.array(taskPhase),
    minimumHours: number.min(0), roleCostRates: z.record(z.string(), number.min(0)),
    evidence: z.array(text), approverRole: text,
  }).optional(),
  capitalisationApprovals: rows({
    id, entityId: id, period: z.string().regex(/^\d{4}-\d{2}$/), title: text,
    capitalisedHours: number.min(0), capitalisedCostAUD: number.min(0), excludedHours: number.min(0),
    utilisation: number.min(0).max(1000),
    status: z.enum(['draft', 'submitted', 'approved', 'rejected']),
    submittedById: id.nullable(), submittedAt: text.nullable(), decidedById: id.nullable(), decidedAt: text.nullable(), note: text,
  }).optional(),
}).superRefine((state, ctx) => {
  for (const [key, value] of Object.entries(state)) {
    if (!Array.isArray(value)) continue;
    const ids = value.map((row) => row.id ?? row.code);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'Duplicate record identifiers' });
    }
  }
});

export const saveSchema = record({ version: z.number().int().min(0).max(2_147_483_646), state: workspaceSchema });
export const loginSchema = record({ password: z.string().min(1).max(512) });
