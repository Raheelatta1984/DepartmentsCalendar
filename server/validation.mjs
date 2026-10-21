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

// Deliberately allow only the demo's data model, not arbitrary JSON or OAuth tokens.
// activeUserId is a browser preference, never shared with other devices.
export const workspaceSchema = record({
  entities: rows({
    id, name: text, code: text, type: z.enum(['group', 'company', 'sub_company']),
    parentId: id.nullable(), countryCode: text, timezone: text, industry: text.optional(),
  }).min(1),
  departments: rows({
    id, entityId: id, name: text, code: text, headId: id.nullable(), opsOwnerId: id.nullable(),
    costCenter: text, color: text,
  }).min(1),
  employees: rows({
    id, name: text, email: text, code: text, entityId: id, departmentId: id,
    role: z.enum(['ceo', 'head_operations', 'department_head', 'unit_head', 'manager', 'supervisor', 'employee']),
    managerId: id.nullable(), countryCode: text, weeklyHours: number.min(1).max(80), joinDate: date,
    status: z.enum(['active', 'on_leave', 'inactive']), avatarColor: text,
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
  settings: record({
    groupName: text, workingDayStart: time, workingDayEnd: time,
    holidayHorizonYears: z.number().int().min(1).max(20), performanceThreshold: number.min(0).max(100),
    weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  }),
  auditLog: rows({ id, at: text, actorId: id, action: text, detail: text }),
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
