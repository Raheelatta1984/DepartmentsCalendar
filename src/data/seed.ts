import { addDays, format, startOfWeek } from 'date-fns';
import type {
  Activity,
  ActivityType,
  AuditEntry,
  CalendarConnection,
  Department,
  Employee,
  Entity,
  Escalation,
  Priority,
  Role,
  StoreState,
  Subtask,
  SyncJob,
  TaskStatus,
  TimeEntry,
} from '../types';
import { COUNTRIES, buildHolidayDataset } from './countries';
import { RETAIL_CAPITALISATION_POLICY, RETAIL_CIO_ID, RETAIL_COMPANY_ID, RETAIL_IT_DEPT_ID, retailSample } from './retail-seed';
import { DEFAULT_TENANT_ID, HARBOURLINE_TENANT_ID, MERIDIAN_TENANT_ID, TENANTS } from './tenant-seed';
import { buildLeaveSeed } from './leave-seed';
import { buildApproval, capitalisationReport, monthKey, monthScope } from '../lib/capitalisation';
import { toISO } from '../lib/dates';
import { buildStandupSeed } from './standup-seed';

/* ------------------------------------------------------------------ */
/* Deterministic pseudo-random generator so the demo is reproducible  */
/* ------------------------------------------------------------------ */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261021);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pickN = <T,>(arr: T[], n: number): T[] => [...arr].sort(() => rnd() - 0.5).slice(0, n);

const TODAY = new Date();
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

const SLOTS = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '15:00', '16:00'];
function slotFor(): { startTime: string; endTime: string } {
  const start = pick(SLOTS);
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + between(30, 120);
  const endTime = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return { startTime: start, endTime };
}

/* ------------------------------------------------------------------ */
/* Group structure                                                     */
/* ------------------------------------------------------------------ */
const MERIDIAN_ENTITY = (entity: Omit<Entity, 'tenantId'>): Entity => ({
  ...entity,
  tenantId: MERIDIAN_TENANT_ID,
});

export const ENTITIES: Entity[] = [
  MERIDIAN_ENTITY({ id: 'ent-group', name: 'Meridian Group Holdings', code: 'MGH', type: 'group', parentId: null, countryCode: 'AE', timezone: 'Asia/Dubai', industry: 'Diversified holding' }),
  MERIDIAN_ENTITY({ id: 'ent-contracting', name: 'Meridian Contracting LLC', code: 'MCL', type: 'company', parentId: 'ent-group', countryCode: 'AE', timezone: 'Asia/Dubai', industry: 'Construction & contracting' }),
  MERIDIAN_ENTITY({ id: 'ent-facilities', name: 'Meridian Facilities Management LLC', code: 'MFM', type: 'company', parentId: 'ent-group', countryCode: 'AE', timezone: 'Asia/Dubai', industry: 'Integrated facilities management' }),
  MERIDIAN_ENTITY({ id: 'ent-tech', name: 'Meridian Technology FZ-LLC', code: 'MTF', type: 'company', parentId: 'ent-group', countryCode: 'AE', timezone: 'Asia/Dubai', industry: 'IT & digital services' }),
  MERIDIAN_ENTITY({ id: 'ent-qatar', name: 'Meridian Qatar W.L.L.', code: 'MQW', type: 'sub_company', parentId: 'ent-contracting', countryCode: 'QA', timezone: 'Asia/Qatar', industry: 'Construction & contracting' }),
  MERIDIAN_ENTITY({ id: 'ent-uk', name: 'Meridian Advisory Ltd', code: 'MAL', type: 'sub_company', parentId: 'ent-group', countryCode: 'GB', timezone: 'Europe/London', industry: 'Advisory & consulting' }),
];

interface DeptSpec {
  id: string;
  name: string;
  code: string;
  entityId: string;
  color: string;
  head: string;
  headRole: Role;
  headCountry: string;
}

const DEPT_SPECS: DeptSpec[] = [
  { id: 'dept-exec', name: 'Executive Office', code: 'EXE', entityId: 'ent-group', color: '#8b5cf6', head: 'Arjun Mehta', headRole: 'ceo', headCountry: 'AE' },
  { id: 'dept-finance', name: 'Accounts & Finance', code: 'FIN', entityId: 'ent-contracting', color: '#f59e0b', head: 'Fatima Noor', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-ops', name: 'Operations', code: 'OPS', entityId: 'ent-contracting', color: '#3b82f6', head: 'Ravi Krishnan', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-hr', name: 'Human Resources & Admin', code: 'HRA', entityId: 'ent-group', color: '#ec4899', head: 'Aisha Rahman', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-it', name: 'Information Technology', code: 'ITS', entityId: 'ent-tech', color: '#06b6d4', head: 'Daniel Okoro', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-procurement', name: 'Procurement & Supply Chain', code: 'PSC', entityId: 'ent-contracting', color: '#84cc16', head: 'Hassan Ali', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-projects', name: 'Projects & Engineering', code: 'ENG', entityId: 'ent-contracting', color: '#f97316', head: 'Imran Sheikh', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-qhse', name: 'QHSE', code: 'QHS', entityId: 'ent-contracting', color: '#ef4444', head: 'Nadia Haddad', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-sales', name: 'Sales & Business Development', code: 'SBD', entityId: 'ent-group', color: '#14b8a6', head: 'Omar Farooq', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-marketing', name: 'Marketing & Communications', code: 'MKT', entityId: 'ent-group', color: '#a855f7', head: 'Sara Lindqvist', headRole: 'department_head', headCountry: 'GB' },
  { id: 'dept-facilities', name: 'Facilities Operations', code: 'FOP', entityId: 'ent-facilities', color: '#0ea5e9', head: 'Meera Nair', headRole: 'department_head', headCountry: 'AE' },
  { id: 'dept-shared', name: 'Finance Shared Services', code: 'FSS', entityId: 'ent-group', color: '#eab308', head: 'Vikram Desai', headRole: 'department_head', headCountry: 'IN' },
  { id: 'dept-qatar', name: 'Qatar Operations', code: 'QOP', entityId: 'ent-qatar', color: '#6366f1', head: 'Khalid Al Thani', headRole: 'department_head', headCountry: 'QA' },
  { id: 'dept-uk', name: 'Advisory & Consulting', code: 'ADV', entityId: 'ent-uk', color: '#22c55e', head: 'Emma Clarke', headRole: 'department_head', headCountry: 'GB' },
];

const FIRST = ['Ahmed', 'Maria', 'Joseph', 'Priya', 'Saeed', 'Laura', 'Bilal', 'Ananya', 'Tariq', 'Grace', 'Hussain', 'Diana', 'Yousef', 'Nisha', 'Peter', 'Aliya', 'Faisal', 'Maya', 'Sanjay', 'Aya', 'Waleed', 'Elena', 'Rahul', 'Salma', 'Karim', 'Jessica', 'Naveed', 'Hana', 'Michael', 'Zara', 'Osman', 'Divya', 'Jamal', 'Rebecca', 'Arif', 'Noor', 'Sunil', 'Amna', 'Tom', 'Leena', 'Farhan', 'Sofia', 'Adil', 'Rania', 'Vishal', 'Mariam', 'Ben', 'Iqra', 'Samir', 'Chloe'];
const LAST = ['Khan', 'Fernandes', 'Mathew', 'Sharma', 'Al Balushi', 'Whitfield', 'Ahmed', 'Iyer', 'Mahmood', 'Okafor', 'Raza', 'Costa', 'Al Marri', 'Menon', 'Nguyen', 'Siddiqui', 'Hameed', 'Rao', 'Patel', 'Haddad', 'Aziz', 'Petrov', 'Verma', 'Yusuf', 'Nasser', 'Brown', 'Chaudhry', 'Kim', 'Oduya', 'Mirza', 'Sultan', 'Pillai', 'Rahim', 'Wilson', 'Bakr', 'Saeed', 'Kapoor', 'Javed', 'Hall', 'Hussain', 'Sheikh', 'Rossi', 'Qureshi', 'Mansour', 'Deshmukh', 'Farooqi', 'Davies', 'Malik', 'Zaman', 'Evans'];

const AVATAR_COLORS = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#eab308', '#6366f1', '#14b8a6'];

const usedNames = new Set<string>();
function employeeName(): string {
  for (let i = 0; i < 80; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  return `${pick(FIRST)} ${pick(LAST)} ${usedNames.size}`;
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean).join('.');
}

/* ------------------------------------------------------------------ */
/* Employees                                                           */
/* ------------------------------------------------------------------ */
export const EMPLOYEES: Employee[] = [];
export const DEPARTMENTS: Department[] = [];

let empSeq = 0;
function addEmployee(input: {
  name: string;
  role: Role;
  entityId: string;
  departmentId: string;
  managerId: string | null;
  countryCode: string;
  weeklyHours?: number;
  joinDate?: string;
  status?: Employee['status'];
}): Employee {
  empSeq += 1;
  const emp: Employee = {
    id: `emp-${String(empSeq).padStart(3, '0')}`,
    name: input.name,
    email: `${slug(input.name)}@meridiangroup.com`,
    code: `MGH-${String(1000 + empSeq)}`,
    entityId: input.entityId,
    departmentId: input.departmentId,
    role: input.role,
    managerId: input.managerId,
    countryCode: input.countryCode,
    weeklyHours: input.weeklyHours ?? 45,
    joinDate: input.joinDate ?? `20${between(15, 24)}-0${between(1, 9)}-${String(between(10, 27))}`,
    status: input.status ?? 'active',
    avatarColor: AVATAR_COLORS[empSeq % AVATAR_COLORS.length],
  };
  EMPLOYEES.push(emp);
  return emp;
}

const ceo = addEmployee({
  name: 'Arjun Mehta',
  role: 'ceo',
  entityId: 'ent-group',
  departmentId: 'dept-exec',
  managerId: null,
  countryCode: 'AE',
  weeklyHours: 50,
  joinDate: '2015-02-01',
});

const coo = addEmployee({
  name: 'Layla Al Mansoori',
  role: 'head_operations',
  entityId: 'ent-group',
  departmentId: 'dept-exec',
  managerId: ceo.id,
  countryCode: 'AE',
  weeklyHours: 48,
  joinDate: '2016-06-12',
});

DEPT_SPECS.forEach((spec) => {
  const head = addEmployee({
    name: spec.head,
    role: spec.headRole,
    entityId: spec.entityId,
    departmentId: spec.id,
    managerId: spec.headRole === 'ceo' ? null : coo.id,
    countryCode: spec.headCountry,
    weeklyHours: spec.headRole === 'ceo' ? 50 : 45,
    joinDate: `20${between(14, 20)}-0${between(1, 9)}-0${between(1, 9)}`,
  });
  if (spec.id === 'dept-exec') {
    // Head of Department records for Executive Office = CEO, with COO as ops owner
    DEPARTMENTS.push({
      id: spec.id,
      entityId: spec.entityId,
      name: spec.name,
      code: spec.code,
      headId: head.id,
      opsOwnerId: coo.id,
      costCenter: 'MG-100',
      color: spec.color,
    });
    return;
  }
  const unitHead = addEmployee({
    name: spec.id === 'dept-finance' ? 'Sneha Kulkarni' : spec.id === 'dept-it' ? 'Yusuf Karim' : employeeName(),
    role: spec.id === 'dept-ops' || spec.id === 'dept-projects' ? 'manager' : 'unit_head',
    entityId: spec.entityId,
    departmentId: spec.id,
    managerId: head.id,
    countryCode: spec.headCountry,
  });
  const supervisor1 = addEmployee({
    name: employeeName(),
    role: 'supervisor',
    entityId: spec.entityId,
    departmentId: spec.id,
    managerId: unitHead.id,
    countryCode: spec.headCountry,
  });
  addEmployee({
    name: employeeName(),
    role: 'employee',
    entityId: spec.entityId,
    departmentId: spec.id,
    managerId: supervisor1.id,
    countryCode: spec.headCountry,
    status: spec.id === 'dept-marketing' ? 'on_leave' : 'active',
  });
  addEmployee({
    name: employeeName(),
    role: 'employee',
    entityId: spec.entityId,
    departmentId: spec.id,
    managerId: supervisor1.id,
    countryCode: spec.headCountry,
  });

  DEPARTMENTS.push({
    id: spec.id,
    entityId: spec.entityId,
    name: spec.name,
    code: spec.code,
    headId: head.id,
    opsOwnerId: coo.id,
    costCenter: `MG-${200 + DEPARTMENTS.length * 10}`,
    color: spec.color,
  });
});

/* ------------------------------------------------------------------ */
/* Activities                                                          */
/* ------------------------------------------------------------------ */
const TEMPLATES: Record<ActivityType, string[]> = {
  task: ['Monthly close checklist', 'Vendor reconciliation', 'Update SOP documentation', 'Payment run preparation', 'Contract review pack', 'Resource levelling plan', 'Data clean-up exercise', 'Report pack preparation'],
  follow_up: ['Follow up on pending LPOs', 'Client follow-up — variation order', 'Follow up with bank on facility', 'Follow up on audit observations', 'Follow up on recruitment offers', 'Follow up on site snags'],
  appointment: ['Client meeting — Dubai Marina', 'Interview panel — shortlisted candidates', 'Bank relationship review', 'Consultant appointment', 'QHSE certification walkthrough'],
  meeting: ['Departmental stand-up', 'Weekly progress review', 'Cost review with QS', 'HR business partner sync', 'Sprint planning', 'Management committee meeting', 'Vendor negotiation'],
  seminar: ['Procurement compliance seminar', 'IFRS update seminar', 'Leadership development seminar', 'Digital transformation seminar'],
  session: ['Design review session', 'Training session — ERP', 'Buddy onboarding session', 'Risk assessment session', 'Town hall session'],
  training: ['First-aid refresher training', 'ERP procurement module training', 'Fire warden training', 'Agile foundation training'],
  audit: ['Internal audit — stores', 'ISO 9001 internal audit', 'Payroll compliance audit', 'Site HSE audit'],
  site_visit: ['Site inspection — Tower B', 'Factory acceptance visit', 'Client site walk — Qatar', 'Snag close-out visit'],
};

const STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'blocked', 'completed'];
const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

function makeSubtasks(type: ActivityType, title: string): Subtask[] {
  const base: Record<ActivityType, string[]> = {
    task: ['Prepare inputs', 'Validate with stakeholder', 'Update tracker'],
    follow_up: ['Send reminder', 'Record response', 'Escalate if overdue'],
    appointment: ['Confirm attendees', 'Prepare agenda', 'Share minutes'],
    meeting: ['Circulate agenda', 'Capture decisions', 'Publish action log'],
    seminar: ['Register attendees', 'Arrange logistics', 'Collect feedback'],
    session: ['Prepare deck', 'Run session', 'Capture action items'],
    training: ['Confirm trainer', 'Issue materials', 'Assessment'],
    audit: ['Prepare checklist', 'Conduct fieldwork', 'Draft findings'],
    site_visit: ['Arrange access', 'Inspection checklist', 'Photo record & report'],
  };
  const n = between(1, 3);
  return base[type].slice(0, n).map((t, i) => ({
    id: `sub-${Math.random().toString(36).slice(2, 9)}`,
    title: `${t} — ${title.split(' ').slice(0, 3).join(' ')}`,
    done: i === 0 && rnd() > 0.35,
    plannedHours: between(1, 6),
  }));
}

export const ACTIVITIES: Activity[] = [];
let activitySeq = 0;

function addActivity(input: Partial<Activity> & {
  title: string;
  type: ActivityType;
  assignee: Employee;
  startDate: string;
  endDate: string;
  plannedHours: number;
}): Activity {
  activitySeq += 1;
  const { assignee } = input;
  const timed = ['meeting', 'appointment', 'seminar', 'training', 'session'].includes(input.type);
  const times =
    input.startTime && input.endTime
      ? { startTime: input.startTime, endTime: input.endTime }
      : timed
        ? slotFor()
        : { startTime: undefined, endTime: undefined };
  const activity: Activity = {
    id: `act-${String(activitySeq).padStart(4, '0')}`,
    title: input.title,
    description:
      input.description ??
      `${input.title} for ${DEPARTMENTS.find((d) => d.id === assignee.departmentId)?.name ?? 'the department'}. Coordinate with stakeholders and record the outcome in the department tracker.`,
    type: input.type,
    entityId: assignee.entityId,
    departmentId: assignee.departmentId,
    assigneeId: assignee.id,
    createdById: input.createdById ?? assignee.managerId ?? ceo.id,
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: times.startTime,
    endTime: times.endTime,
    plannedHours: input.plannedHours,
    status: input.status ?? 'in_progress',
    priority: input.priority ?? pick(PRIORITIES),
    progress: input.progress ?? 0,
    location: input.location,
    subtasks: input.subtasks ?? makeSubtasks(input.type, input.title),
    sync: input.sync ?? { outlook: true, google: rnd() > 0.5 },
    createdAt: input.createdAt ?? iso(addDays(new Date(input.startDate), -between(2, 12))),
  };
  ACTIVITIES.push(activity);
  return activity;
}

const workingEmployees = EMPLOYEES.filter((e) => e.status !== 'inactive');
const todayMid = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

workingEmployees.forEach((emp) => {
  const count = emp.role === 'employee' ? between(6, 9) : emp.role === 'supervisor' ? between(5, 8) : between(4, 7);
  const types = pickN(Object.keys(TEMPLATES) as ActivityType[], Math.min(6, count));
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const offsetStart = between(-18, 16);
    const start = addDays(todayMid, offsetStart);
    const duration = type === 'task' ? between(1, 6) : type === 'seminar' ? between(1, 3) : between(0, 2);
    const end = addDays(start, duration);
    const planned = type === 'meeting' ? between(1, 3) : type === 'task' ? between(6, 26) : between(1, 8);
    const inPast = end < todayMid;
    const ongoing = start <= todayMid && end >= todayMid;
    let status: TaskStatus;
    let progress = 0;
    if (inPast) {
      const r = rnd();
      status = r > 0.32 ? 'completed' : r > 0.12 ? 'in_progress' : 'blocked';
      progress = status === 'completed' ? 100 : status === 'in_progress' ? between(45, 85) : between(10, 40);
    } else if (ongoing) {
      status = rnd() > 0.2 ? 'in_progress' : 'blocked';
      progress = between(25, 75);
    } else {
      status = 'not_started';
      progress = 0;
    }
    const title = pick(TEMPLATES[type]);
    const subtasks = makeSubtasks(type, title);
    if (status === 'completed') subtasks.forEach((s) => (s.done = true));
    const doneHours = subtasks.filter((s) => s.done).reduce((a, s) => a + s.plannedHours, 0);
    const actualProgress = subtasks.length
      ? Math.max(progress, Math.min(95, Math.round((doneHours / Math.max(1, subtasks.reduce((a, s) => a + s.plannedHours, 0))) * 100)))
      : progress;
    addActivity({
      title,
      type,
      assignee: emp,
      startDate: iso(start),
      endDate: iso(end),
      plannedHours: planned,
      status,
      progress: status === 'completed' ? 100 : actualProgress,
      priority: pick(PRIORITIES),
      subtasks,
      location: type === 'site_visit' || type === 'appointment' ? pick(['Dubai Marina Site', 'Business Bay Office', 'Doha Office', 'Client HQ', 'Jebel Ali Yard']) : pick(['Teams', 'Boardroom 2', 'HQ Floor 7', 'Client office', 'Zoom']),
      createdAt: iso(addDays(start, -between(2, 14))),
    });
  }
  // One guaranteed high-visibility activity this week per employee
  const ws = startOfWeek(todayMid, { weekStartsOn: 1 });
  const t = pick(Object.keys(TEMPLATES) as ActivityType[]);
  const title = pick(TEMPLATES[t]);
  addActivity({
    title,
    type: t,
    assignee: emp,
    startDate: iso(addDays(ws, between(0, 4))),
    endDate: iso(addDays(ws, between(0, 4))),
    plannedHours: between(2, 6),
    status: 'in_progress',
    progress: between(20, 80),
    priority: rnd() > 0.5 ? 'high' : 'medium',
    location: pick(['Teams', 'Boardroom 1', 'Client office']),
  });
});

/* Recently delivered work: gives the weekly/monthly scores real completed volume */
workingEmployees.forEach((emp) => {
  for (let i = 0; i < 2; i++) {
    const type = pick(['task', 'follow_up', 'meeting', 'audit', 'session'] as ActivityType[]);
    // First completion lands inside the current week so weekly on-time delivery
    // is meaningful even on a Monday.
    const start = addDays(todayMid, i === 0 ? -between(0, Math.max(0, todayMid.getDay() === 0 ? 2 : todayMid.getDay() - 1)) : -between(3, 9));
    const title = pick(TEMPLATES[type]);
    const subtasks = makeSubtasks(type, title).map((x) => ({ ...x, done: true }));
    addActivity({
      title: `${title} — completed`,
      type,
      assignee: emp,
      startDate: iso(start),
      endDate: iso(start),
      plannedHours: between(2, 6),
      status: 'completed',
      progress: 100,
      subtasks,
      priority: rnd() > 0.6 ? 'high' : 'medium',
      location: pick(['Teams', 'HQ Floor 7', 'Client office']),
    });
  }
});

/* keep timeline realistic: no end before start */
ACTIVITIES.forEach((a) => {
  if (a.endDate < a.startDate) a.endDate = a.startDate;
});

/* ------------------------------------------------------------------ */
/* Timesheets — last 30 days of logged effort for every employee        */
/* ------------------------------------------------------------------ */
export const TIME_ENTRIES: TimeEntry[] = [];
let entrySeq = 0;

const countryWeeklyOff = (code: string) => COUNTRIES.find((c) => c.code === code)?.weeklyOff ?? [0, 6];

EMPLOYEES.forEach((emp) => {
  const myActivities = ACTIVITIES.filter((a) => a.assigneeId === emp.id);
  if (!myActivities.length) return;
  for (let dayOffset = 28; dayOffset >= 0; dayOffset--) {
    const day = addDays(todayMid, -dayOffset);
    if (countryWeeklyOff(emp.countryCode).includes(day.getDay())) continue;
    if (rnd() < 0.12) continue; // leave / no logging
    const candidates = myActivities.filter((a) => a.startDate <= iso(day) && a.endDate >= addDays(day, -6).toISOString().slice(0, 10));
    const pool = candidates.length ? candidates : myActivities;
    const entries = between(2, 3);
    let remaining = 9;
    for (let i = 0; i < entries && remaining > 0.5; i++) {
      const act = pick(pool);
      const hours = Math.min(remaining, pick([2, 2.5, 2.5, 3, 3, 3.5, 4]));
      if (hours <= 0) continue;
      entrySeq += 1;
      TIME_ENTRIES.push({
        id: `te-${String(entrySeq).padStart(5, '0')}`,
        employeeId: emp.id,
        activityId: act.id,
        date: iso(day),
        hours,
        note: pick(['Executed as planned.', 'Coordination completed.', 'Pending client approval.', 'Draft shared for review.', 'Follow-up scheduled.', 'Issues logged in tracker.']),
        billable: rnd() > 0.35,
        approved: rnd() > 0.25,
      });
      remaining -= hours;
    }
  }
});

/* Deliberately weaken a couple of departments so escalation reporting has signal */
const weakDepts = ['dept-marketing', 'dept-shared'];
weakDepts.forEach((deptId) => {
  ACTIVITIES.filter((a) => a.departmentId === deptId).forEach((a) => {
    if (a.endDate < iso(todayMid) && a.status !== 'completed' && rnd() > 0.4) {
      a.status = 'blocked';
      a.progress = between(5, 35);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Calendar connections + sync queue                                   */
/* ------------------------------------------------------------------ */
export const CONNECTIONS: CalendarConnection[] = [];
let connSeq = 0;
EMPLOYEES.forEach((emp) => {
  const outlook = rnd();
  connSeq += 1;
  CONNECTIONS.push({
    id: `conn-${connSeq}`,
    employeeId: emp.id,
    provider: 'outlook',
    accountEmail: emp.email.replace('@meridiangroup.com', '@meridiangroup.onmicrosoft.com'),
    status: outlook > 0.22 ? 'connected' : outlook > 0.1 ? 'pending' : 'disconnected',
    lastSync: outlook > 0.22 ? new Date(Date.now() - between(2, 300) * 60000).toISOString() : null,
    twoWay: true,
  });
  connSeq += 1;
  const google = rnd();
  CONNECTIONS.push({
    id: `conn-${connSeq}`,
    employeeId: emp.id,
    provider: 'google',
    accountEmail: emp.email.replace('@meridiangroup.com', '@gmail.com'),
    status: google > 0.55 ? 'connected' : google > 0.35 ? 'pending' : 'disconnected',
    lastSync: google > 0.55 ? new Date(Date.now() - between(5, 900) * 60000).toISOString() : null,
    twoWay: false,
  });
});

export const SYNC_JOBS: SyncJob[] = ACTIVITIES.filter((_, i) => i % 7 === 0)
  .slice(0, 26)
  .flatMap((a, i) => {
    const jobs: SyncJob[] = [
      {
        id: `job-${i}-o`,
        activityId: a.id,
        provider: 'outlook',
        action: 'create',
        status: rnd() > 0.12 ? 'synced' : 'failed',
        at: new Date(Date.now() - between(30, 2400) * 60000).toISOString(),
        message: a.sync.outlook ? 'Event written to Outlook via Microsoft Graph' : 'Outlook sync disabled by owner',
      },
    ];
    if (a.sync.google) {
      jobs.push({
        id: `job-${i}-g`,
        activityId: a.id,
        provider: 'google',
        action: 'create',
        status: rnd() > 0.2 ? 'synced' : 'queued',
        at: new Date(Date.now() - between(30, 2400) * 60000).toISOString(),
        message: 'Google Calendar event upserted',
      });
    }
    return jobs;
  });

/* ------------------------------------------------------------------ */
/* Escalations                                                         */
/* ------------------------------------------------------------------ */
export const ESCALATIONS: Escalation[] = [
  {
    id: 'esc-001',
    departmentId: 'dept-marketing',
    period: 'week',
    periodStart: iso(addDays(startOfWeek(todayMid, { weekStartsOn: 1 }), -7)),
    periodEnd: iso(addDays(startOfWeek(todayMid, { weekStartsOn: 1 }), -3)),
    score: 54,
    threshold: 70,
    utilization: 61,
    onTimeRate: 48,
    recipients: ['emp-010'],
    cc: ['emp-002'],
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    status: 'open',
    note: 'Blocked campaign approvals and 2 overdue seminar deliverables. Weekly score below threshold.',
  },
  {
    id: 'esc-002',
    departmentId: 'dept-shared',
    period: 'week',
    periodStart: iso(addDays(startOfWeek(todayMid, { weekStartsOn: 1 }), -7)),
    periodEnd: iso(addDays(startOfWeek(todayMid, { weekStartsOn: 1 }), -3)),
    score: 62,
    threshold: 70,
    utilization: 72,
    onTimeRate: 58,
    recipients: ['emp-012'],
    cc: ['emp-002'],
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    status: 'acknowledged',
    note: 'Timesheet approvals pending for 6 staff; month-end close at risk.',
  },
];

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */
export const AUDIT_LOG: AuditEntry[] = [
  { id: 'aud-1', at: new Date(Date.now() - 86400000).toISOString(), actorId: ceo.id, action: 'Settings updated', detail: 'Holiday horizon set to 5 years; escalation threshold set to 70.' },
  { id: 'aud-2', at: new Date(Date.now() - 2 * 86400000).toISOString(), actorId: coo.id, action: 'Department head assigned', detail: 'QHSE head assigned to Nadia Haddad.' },
  { id: 'aud-3', at: new Date(Date.now() - 3 * 86400000).toISOString(), actorId: 'emp-002', action: 'Calendar connected', detail: 'Microsoft 365 tenant connected with two-way sync.' },
];

/* ------------------------------------------------------------------ */
/* Full seed                                                           */
/* ------------------------------------------------------------------ */
export function createSeedState(): StoreState {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i);
  // Harbourline Retail Australia is seeded as an independent entity tree with
  // its own IT project portfolio. Existing Meridian data is merged, never replaced.
  const retail = retailSample();
  const holidayRows = buildHolidayDataset(years, COUNTRIES.map((c) => c.code));
  const seededEmployees = [...EMPLOYEES, ...retail.employees];
  const seededDepartments = [...DEPARTMENTS, ...retail.departments];
  const seededActivities = [...ACTIVITIES, ...retail.activities];
  const seededLeafEmployees = seededEmployees.filter((employee) => employee.status !== 'inactive');
  const leaves = buildLeaveSeed({
    employees: seededLeafEmployees,
    departments: seededDepartments,
    holidays: holidayRows,
    countries: COUNTRIES,
  });
  const base: StoreState = {
    tenants: TENANTS,
    entities: [...ENTITIES, ...retail.entities],
    departments: seededDepartments,
    employees: seededEmployees,
    activities: seededActivities,
    timeEntries: [...TIME_ENTRIES, ...retail.timeEntries],
    projects: retail.projects,
    capitalisation: RETAIL_CAPITALISATION_POLICY,
    capitalisationApprovals: [],
    holidays: holidayRows,
    countries: COUNTRIES,
    standups: buildStandupSeed({
      employees: seededEmployees,
      departments: seededDepartments,
      activities: seededActivities,
      holidays: holidayRows,
      countries: COUNTRIES,
    }),
    escalations: ESCALATIONS.map((esc) => {
      const dept = DEPARTMENTS.find((d) => d.id === esc.departmentId);
      const head = EMPLOYEES.find((e) => e.id === dept?.headId);
      const cooEmp = EMPLOYEES.find((e) => e.role === 'head_operations');
      return {
        ...esc,
        recipients: head ? [head.id] : [],
        cc: cooEmp ? [cooEmp.id] : [],
      };
    }),
    connections: CONNECTIONS,
    syncJobs: SYNC_JOBS,
    leaves,
    auditLog: [
      {
        id: 'aud-hra-1',
        tenantId: HARBOURLINE_TENANT_ID,
        at: new Date(Date.now() - 86400000).toISOString(),
        actorId: RETAIL_CIO_ID,
        action: 'Calendar scope updated',
        detail: 'Harbourline Retail Australia: calendar implemented for the IT department only (single-department mode).',
      },
      ...AUDIT_LOG.map((entry) => ({
        ...entry,
        // Attribute existing history to the tenant that owns the actor.
        tenantId: entry.actorId.startsWith('rtl-') ? HARBOURLINE_TENANT_ID : MERIDIAN_TENANT_ID,
      })),
    ],
    settings: {
      // The portal opens on the IT-first tenant with the IT department head
      // signed in; the calendar covers that single department.
      activeUserId: RETAIL_CIO_ID,
      activeTenantId: DEFAULT_TENANT_ID,
      groupName: 'Harbourline Retail Australia',
      workingDayStart: '08:30',
      workingDayEnd: '17:30',
      holidayHorizonYears: 5,
      performanceThreshold: 70,
      weekStartsOn: 1,
    },
  };

  // Seed the retail IT capitalisation approval workflow: last month is board
  // approved, the running month is submitted for the next board pack.
  const now = new Date();
  const currentMonth = monthKey(now);
  const priorMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const priorScope = monthScope(priorMonth);
  const priorReport = capitalisationReport(base, {
    entityId: RETAIL_COMPANY_ID,
    departmentId: RETAIL_IT_DEPT_ID,
    ...priorScope,
  });
  const approved = buildApproval(base, RETAIL_COMPANY_ID, RETAIL_IT_DEPT_ID, priorMonth, 'approved');
  approved.capitalisedHours = priorReport.capitalisedHours;
  approved.capitalisedCostAUD = priorReport.capitalisedCost;
  approved.excludedHours = priorReport.excludedProjectHours + priorReport.nonProjectHours;
  approved.utilisation = priorReport.utilisation;
  approved.submittedById = RETAIL_CIO_ID;
  approved.submittedAt = new Date(now.getFullYear(), now.getMonth(), 2, 9, 30).toISOString();
  approved.decidedById = ceo.id;
  approved.decidedAt = new Date(now.getFullYear(), now.getMonth(), 8, 16, 0).toISOString();
  approved.note = `Board Audit & Risk Committee approved ${priorReport.capitalisedHours.toFixed(1)} capitalisable hours (${priorReport.capitalisationRate}% of IT effort) at the ${priorMonth} meeting. Non-capitalisable effort remains expensed.`;

  const submitted = buildApproval(base, RETAIL_COMPANY_ID, RETAIL_IT_DEPT_ID, currentMonth, 'submitted');
  submitted.submittedById = RETAIL_CIO_ID;
  submitted.submittedAt = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate(), 5), 10, 15).toISOString();

  return { ...base, capitalisationApprovals: [submitted, approved] };
}

export const CEO_ID = ceo.id;
export const COO_ID = coo.id;
export const demoToday = toISO(todayMid);
