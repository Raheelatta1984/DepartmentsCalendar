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
    feelingScale: z.array(record({ value: z.number().int().min(1).max(5), label: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).length(5).refine((rows) => new Set(rows.map((row) => row.value)).size === 5).optional(),
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
    costCenter: text, color: text, devopsEnabled: z.boolean().optional(),
  }).min(1),
  deliveryStreams: rows({
    id, departmentId: id, parentId: id.nullable(), name: text, code: text, leadId: id.nullable(), color: text,
  }).optional(),
  designations: rows({ id, tenantId: id, title: text, code: text, description: text }).optional(),
  calendarShares: rows({
    id, ownerId: id, audience: z.enum(['department', 'employee']),
    departmentId: id.nullable(), employeeId: id.nullable(), createdAt: text,
  }).optional(),
  workItems: rows({
    id, kind: z.enum(['epic', 'feature', 'ticket']), title: text, description: text, acceptanceCriteria: text.optional(), parentId: id.nullable(),
    departmentId: id, streamId: id.nullable(), projectId: id.nullable(), assigneeId: id.nullable(),
    funding: z.enum(['capex', 'opex', 'unclassified']), phase: taskPhase,
    status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'cancelled']),
    priority: z.enum(['critical', 'high', 'medium', 'low']), estimateHours: number.min(0).max(100_000),
    source: z.enum(['manual', 'azure_devops', 'csv', 'json']), externalId: text, externalUrl: z.string().max(2048).refine((v) => !v || /^https:\/\/(dev\.azure\.com\/|[a-z0-9-]+\.visualstudio\.com\/)/i.test(v), 'Only Azure DevOps HTTPS links are allowed'),
    organization: text, devopsProject: text, createdAt: text, updatedAt: text,
  }).optional(),
  devopsImports: rows({ id, departmentId: id, actorId: id, at: text, filename: text,
    created: number.int().min(0), updated: number.int().min(0), unchanged: number.int().min(0),
  }).optional(),
  employees: rows({
    id, name: text, email: text, code: text, entityId: id, departmentId: id,
    role: z.enum(['ceo', 'head_operations', 'department_head', 'unit_head', 'manager', 'supervisor', 'employee']),
    jobTitle: text.optional(), designationId: id.optional(),
    managerId: id.nullable(), countryCode: text, weeklyHours: number.min(1).max(80), joinDate: date,
    status: z.enum(['active', 'on_leave', 'inactive']), avatarColor: text,
    employmentType: z.enum(['employee', 'contractor']).optional(),
    workLocation: z.enum(['on_site', 'hybrid', 'remote']).optional(),
    leadershipPortfolio: text.optional(), responsibleDepartmentIds: z.array(id).max(500).optional(),
    supportingStreamIds: z.array(id).max(500).optional(), collaborationNotes: text.optional(),
    costRateAUD: number.min(0).max(10_000).optional(), streamId: id.optional(),
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
    workItemId: id.optional(), streamId: id.optional(), delegationNote: text.optional(),
    delegationHistory: rows({
      fromEmployeeId: id, toEmployeeId: id, byEmployeeId: id, at: text, note: text,
    }).optional(),
  }),
  timeEntries: rows({
    id, employeeId: id, activityId: id, date, startTime: time.optional(), endTime: time.optional(),
    hours: number.min(0).max(24), note: text,
    billable: z.boolean(), approved: z.boolean(), loggedById: id.optional(),
    createdAt: text.optional(), updatedAt: text.optional(),
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
    raisedById: id.optional(), sourceDepartmentId: id.optional(), followUpActivityId: id.optional(),
    followUps: rows({ id, authorId: id, targetId: id, note: text, createdAt: text, activityId: id.optional() }).optional(),
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
    feeling: z.number().int().min(1).max(5).nullable().optional(),
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
  leadershipUpdates: rows({ id, authorId: id, departmentId: id, message: text, createdAt: text }).optional(),
  oneOnOnes: rows({
    id, employeeId: id, managerId: id, departmentId: id, date,
    feeling: z.number().int().min(1).max(5).nullable(),
    workLifeBalance: text, support: text, escalation: text, discussion: text, improvement: text, careerProgression: text,
    summary: text, summaryModel: text, summaryGeneratedAt: text.nullable(), createdAt: text, updatedAt: text,
  }).optional(),
  settings: record({
    groupName: text, workingDayStart: time, workingDayEnd: time,
    holidayHorizonYears: z.number().int().min(1).max(20), performanceThreshold: number.min(0).max(100),
    weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
    onboardingVersion: z.number().int().min(0).optional(),
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
  // Additive delivery collections must preserve the same tenant/department
  // boundary as activities. Validate references and acyclic hierarchy here,
  // not just in the import preview (the workspace API accepts whole snapshots).
  const entityTenant = new Map(state.entities.map((e) => [e.id, e.tenantId]));
  const departments = new Map(state.departments.map((d) => [d.id, d]));
  const employees = new Map(state.employees.map((e) => [e.id, e]));
  const projects = new Map((state.projects ?? []).map((p) => [p.id, p]));
  const streams = new Map((state.deliveryStreams ?? []).map((s) => [s.id, s]));
  const designations = new Map((state.designations ?? []).map((designation) => [designation.id, designation]));
  const items = new Map((state.workItems ?? []).map((i) => [i.id, i]));
  const sameDepartment = (a, b) => a && b && entityTenant.get(departments.get(a)?.entityId) === entityTenant.get(departments.get(b)?.entityId);
  for (const [index, stream] of (state.deliveryStreams ?? []).entries()) {
    const path = ['deliveryStreams', index];
    const dept = departments.get(stream.departmentId);
    if (!dept) ctx.addIssue({ code: 'custom', path, message: 'Stream department must exist' });
    if (stream.parentId && (!streams.has(stream.parentId) || streams.get(stream.parentId).departmentId !== stream.departmentId)) ctx.addIssue({ code: 'custom', path, message: 'Invalid parent stream' });
    if (stream.leadId && employees.get(stream.leadId)?.departmentId !== stream.departmentId) ctx.addIssue({ code: 'custom', path, message: 'Invalid stream lead' });
    const seen = new Set([stream.id]); let parent = stream.parentId;
    while (parent) {
      if (seen.has(parent)) { ctx.addIssue({ code: 'custom', path, message: 'Stream hierarchy contains a cycle' }); break; }
      seen.add(parent); parent = streams.get(parent)?.parentId;
    }
  }
  for (const [index, item] of (state.workItems ?? []).entries()) {
    const path = ['workItems', index]; const parent = items.get(item.parentId);
    if (!departments.has(item.departmentId)) ctx.addIssue({ code: 'custom', path, message: 'Work-item department must exist' });
    if (item.streamId && streams.get(item.streamId)?.departmentId !== item.departmentId) ctx.addIssue({ code: 'custom', path, message: 'Invalid work-item stream' });
    if (item.projectId && (projects.get(item.projectId)?.departmentId !== item.departmentId || !sameDepartment(item.departmentId, projects.get(item.projectId)?.departmentId))) ctx.addIssue({ code: 'custom', path, message: 'Invalid work-item project' });
    if (item.assigneeId && !sameDepartment(item.departmentId, employees.get(item.assigneeId)?.departmentId)) ctx.addIssue({ code: 'custom', path, message: 'Invalid work-item assignee' });
    if (item.kind === 'epic' ? item.parentId : !parent || parent.kind !== (item.kind === 'feature' ? 'epic' : 'feature') || parent.departmentId !== item.departmentId || parent.projectId !== item.projectId || parent.funding !== item.funding) ctx.addIssue({ code: 'custom', path, message: 'Invalid delivery hierarchy' });
    if (item.funding === 'capex' && projects.get(item.projectId)?.portfolio !== 'capital') ctx.addIssue({ code: 'custom', path, message: 'Capex requires a capital project' });
    const seen = new Set([item.id]); let ancestor = item.parentId;
    while (ancestor) {
      if (seen.has(ancestor)) { ctx.addIssue({ code: 'custom', path, message: 'Work-item hierarchy contains a cycle' }); break; }
      seen.add(ancestor); ancestor = items.get(ancestor)?.parentId;
    }
  }
  for (const [index, employee] of state.employees.entries()) {
    const path = ['employees', index];
    if (employee.streamId && streams.get(employee.streamId)?.departmentId !== employee.departmentId) ctx.addIssue({ code: 'custom', path, message: 'Invalid home stream' });
    for (const streamId of employee.supportingStreamIds ?? []) {
      if (streams.get(streamId)?.departmentId !== employee.departmentId) ctx.addIssue({ code: 'custom', path, message: 'Invalid supporting stream' });
    }
    const employeeTenant = entityTenant.get(departments.get(employee.departmentId)?.entityId);
    if (employee.designationId) {
      const designation = designations.get(employee.designationId);
      if (!designation || (employeeTenant && designation.tenantId !== employeeTenant)) {
        ctx.addIssue({ code: 'custom', path, message: 'Invalid employee designation' });
      }
    }
    for (const departmentId of employee.responsibleDepartmentIds ?? []) {
      const assignedDepartment = departments.get(departmentId);
      const assignedTenant = entityTenant.get(assignedDepartment?.entityId);
      if (!assignedDepartment || (employeeTenant && assignedTenant !== employeeTenant)) {
        ctx.addIssue({ code: 'custom', path, message: 'Invalid executive department assignment' });
      }
    }
  }
  for (const [index, activity] of state.activities.entries()) {
    if (activity.workItemId && (!items.has(activity.workItemId) || !sameDepartment(activity.departmentId, items.get(activity.workItemId)?.departmentId))) ctx.addIssue({ code: 'custom', path: ['activities', index], message: 'Invalid delivery activity link' });
    if (activity.streamId && streams.get(activity.streamId)?.departmentId !== activity.departmentId) ctx.addIssue({ code: 'custom', path: ['activities', index], message: 'Invalid activity stream' });
  }
  for (const [index, share] of (state.calendarShares ?? []).entries()) {
    const path = ['calendarShares', index];
    const owner = employees.get(share.ownerId);
    if (!owner) ctx.addIssue({ code: 'custom', path, message: 'Calendar-share owner must exist' });
    if (share.audience === 'department') {
      if (!owner || share.departmentId !== owner.departmentId || share.employeeId) ctx.addIssue({ code: 'custom', path, message: 'Department shares must target the owner’s home department only' });
    } else {
      const recipient = employees.get(share.employeeId);
      if (!recipient || recipient.id === share.ownerId || share.departmentId || !sameDepartment(owner?.departmentId, recipient.departmentId)) {
        ctx.addIssue({ code: 'custom', path, message: 'Person shares must target another employee in the same tenant' });
      }
    }
  }
  const minutes = (value) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  for (const [index, activity] of state.activities.entries()) {
    if (activity.startDate !== activity.endDate || (!activity.startTime && !activity.endTime)) continue;
    const path = ['activities', index];
    const start = minutes(activity.startTime); const end = minutes(activity.endTime);
    if (start === null || end === null || end <= start) {
      ctx.addIssue({ code: 'custom', path, message: 'Same-day activity requires a valid start and end time' });
    } else if (Math.abs(activity.plannedHours * 60 - (end - start)) > 1) {
      ctx.addIssue({ code: 'custom', path, message: 'Activity hours must match the selected time window' });
    }
  }
  for (const [index, entry] of state.timeEntries.entries()) {
    if (!entry.startTime && !entry.endTime) {
      if (entry.loggedById && !employees.has(entry.loggedById)) ctx.addIssue({ code: 'custom', path: ['timeEntries', index], message: 'Time-entry logger must exist' });
      continue; // legacy rows predate work windows
    }
    const path = ['timeEntries', index];
    const start = minutes(entry.startTime); const end = minutes(entry.endTime);
    if (start === null || end === null || end <= start) {
      ctx.addIssue({ code: 'custom', path, message: 'Time entry requires a valid same-day start and end time' });
    } else if (Math.abs(entry.hours * 60 - (end - start)) > 1) {
      ctx.addIssue({ code: 'custom', path, message: 'Time-entry hours must match the selected time window' });
    }
    if (entry.loggedById && !employees.has(entry.loggedById)) ctx.addIssue({ code: 'custom', path, message: 'Time-entry logger must exist' });
  }
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
