export type Role =
  | 'ceo'
  | 'head_operations'
  | 'department_head'
  | 'unit_head'
  | 'manager'
  | 'supervisor'
  | 'employee';

export type EntityType = 'group' | 'company' | 'sub_company';

/* ------------------------------------------------------------------ */
/* Tenants — the hard isolation boundary                               */
/*                                                                     */
/* A workspace hosts one or more tenants. A tenant owns its own entity  */
/* tree (group → companies → sub-companies), its own departments,       */
/* people, projects, activities, timesheets, stand-ups, holidays se-    */
/* lection and leave records. Nothing is shared across tenants: the     */
/* store and every screen only ever read the active tenant's rows.      */
/* ------------------------------------------------------------------ */

/** How the department calendar is rolled out for a tenant. */
export type CalendarScopeMode = 'single' | 'multiple' | 'all';

export interface CalendarScopeSettings {
  /**
   * single   = the calendar only ever covers one department
   * multiple = the calendar covers an explicit list of departments
   * all      = every department in the tenant
   */
  mode: CalendarScopeMode;
  /** Departments in scope for `single` / `multiple`; ignored for `all`. */
  departmentIds: string[];
}

export interface Tenant {
  id: string;
  name: string;
  code: string;
  /** Country/timezone defaults used when an entity does not override them. */
  countryCode: string;
  timezone: string;
  currency: string;
  industry?: string;
  status: 'active' | 'archived';
  /** Master setting: is this calendar implemented for one, several or all departments? */
  calendarScope: CalendarScopeSettings;
  /** Paid time off entitlement, in working days per year (public holidays excluded). */
  ptoAnnualEntitlementDays: number;
  createdAt?: string;
}

/* ------------------------------------------------------------------ */
/* Leave / paid time off                                               */
/* ------------------------------------------------------------------ */
export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'parental' | 'study' | 'other';
/** annual = PTO; the other types never count toward the PTO balance. */
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  departmentId: string;
  entityId: string;
  /** Calendar span requested by the employee (inclusive). */
  startDate: string;
  endDate: string;
  /** PTO counts working hours only — public holidays and weekly-offs are excluded. */
  hours: number;
  workingDays: number;
  /** Public holiday days/hours inside the span, excluded from PTO. */
  publicHolidayDays: number;
  publicHolidayHours: number;
  type: LeaveType;
  reason: string;
  status: LeaveStatus;
  /** Person who covers the work while the requester is away. */
  delegateId: string | null;
  submittedAt: string;
  decidedById: string | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | 'task'
  | 'follow_up'
  | 'appointment'
  | 'meeting'
  | 'seminar'
  | 'session'
  | 'training'
  | 'audit'
  | 'site_visit';

export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type HolidayType = 'public_holiday' | 'company_holiday' | 'weekly_off';
export type CalendarProvider = 'outlook' | 'google';

/* ------------------------------------------------------------------ */
/* IT project portfolio, time capitalisation and board approval        */
/* ------------------------------------------------------------------ */
export type ProjectPortfolio = 'capital' | 'operational';

export type ProjectCategory =
  | 'delivery'
  | 'operations'
  | 'security'
  | 'data_analytics'
  | 'infrastructure'
  | 'integration'
  | 'digital_experience'
  | 'enterprise_apps'
  | 'network'
  | 'compliance';

export type ProjectStage =
  | 'idea'
  | 'business_case'
  | 'approved'
  | 'design'
  | 'build'
  | 'test'
  | 'deploy'
  | 'hypercare'
  | 'closed'
  | 'on_hold';

export type ProjectStatus = 'pipeline' | 'active' | 'on_hold' | 'completed' | 'cancelled';

/** Delivery phase of a single project task — drives AASB 138 capitalisation. */
export type TaskPhase = 'discovery' | 'design' | 'build' | 'test' | 'deploy' | 'hypercare' | 'support' | 'training';

export interface ProjectTask {
  id: string;
  projectId: string;
  /** The activity the resource logs their daily time against. */
  activityId: string;
  title: string;
  phase: TaskPhase;
  capitalisable: boolean;
  plannedHours: number;
  startDate: string;
  endDate: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  entityId: string;
  departmentId: string;
  portfolio: ProjectPortfolio;
  category: ProjectCategory;
  stage: ProjectStage;
  status: ProjectStatus;
  priority: Priority;
  sponsorId: string;
  managerId: string;
  startDate: string;
  endDate: string;
  /** Board-approved total budget in the entity's local currency. */
  budgetAUD: number;
  capexAUD: number;
  opexAUD: number;
  /** Share of a capitalisable hour that is capitalised (e.g. 0.9 = 90%). */
  capitalisationRate: number;
  assetClass: string;
  usefulLifeYears: number;
  capitalisationStart: string;
  capitalisationEnd: string;
  boardApproved: boolean;
  wbsCode: string;
  tasks: ProjectTask[];
}

export interface CapitalisationPolicy {
  currency: 'AUD';
  standard: string;
  eligiblePhases: TaskPhase[];
  excludedPhases: TaskPhase[];
  minimumHours: number;
  /** Fully-loaded cost per hour by role, in the local currency. */
  roleCostRates: Record<string, number>;
  evidence: string[];
  approverRole: string;
}

export interface CapitalisationApproval {
  id: string;
  entityId: string;
  /** yyyy-MM */
  period: string;
  title: string;
  capitalisedHours: number;
  capitalisedCostAUD: number;
  excludedHours: number;
  utilisation: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedById: string | null;
  submittedAt: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Delivery backlog: epic → feature → ticket, independent of estimates */
/* ------------------------------------------------------------------ */
export type WorkItemKind = 'epic' | 'feature' | 'ticket';
export type FundingClass = 'capex' | 'opex' | 'unclassified';
export type WorkItemSource = 'manual' | 'azure_devops' | 'csv' | 'json';

export interface DeliveryStream {
  id: string;
  departmentId: string;
  parentId: string | null;
  name: string;
  code: string;
  leadId: string | null;
  color: string;
}

export interface WorkItem {
  id: string;
  kind: WorkItemKind;
  title: string;
  description: string;
  /** Epics have no parent; features belong to epics; tickets to features. */
  parentId: string | null;
  departmentId: string;
  streamId: string | null;
  projectId: string | null;
  assigneeId: string | null;
  funding: FundingClass;
  phase: TaskPhase;
  status: TaskStatus;
  priority: Priority;
  /** Own backlog estimate. Calendar plans and actuals are derived separately. */
  estimateHours: number;
  source: WorkItemSource;
  externalId: string;
  externalUrl: string;
  organization: string;
  devopsProject: string;
  createdAt: string;
  updatedAt: string;
}

export interface DevopsImportBatch {
  id: string;
  departmentId: string;
  actorId: string;
  at: string;
  filename: string;
  created: number;
  updated: number;
  unchanged: number;
}

/** Canonical import row; aliases for Azure DevOps flat-query exports are mapped by the parser. */
export interface WorkItemImportRow {
  source?: WorkItemSource;
  externalId: string;
  kind: WorkItemKind;
  title: string;
  parentExternalId: string;
  description: string;
  departmentCode: string;
  projectCode: string;
  streamCode: string;
  assigneeEmail: string;
  funding: FundingClass;
  phase: TaskPhase;
  status: TaskStatus;
  estimateHours: number | null;
  externalUrl: string;
  organization: string;
  devopsProject: string;
}

export interface WorkItemImportDefaults {
  funding?: FundingClass;
  departmentId: string;
  projectId: string;
  streamId: string;
  organization: string;
  devopsProject: string;
}

export interface WorkItemImportPreview {
  items: WorkItem[];
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
  warnings: string[];
}

export interface Entity {
  id: string;
  /** Tenant that owns this entity — the hard isolation boundary. */
  tenantId: string;
  name: string;
  code: string;
  type: EntityType;
  parentId: string | null;
  countryCode: string;
  timezone: string;
  industry?: string;
  /** Local reporting currency for entity-level financial reports. */
  currency?: string;
  /** Entity-owned portal brand layer. Logo may be a URL or uploaded data URL. */
  logoUrl?: string;
  portalHeader?: string;
  portalFooter?: string;
  brandColor?: string;
  backgroundColor?: string;
  fontFamily?: 'Inter' | 'Arial' | 'Georgia' | 'system';
  headingFont?: 'Inter' | 'Arial' | 'Georgia' | 'system';
}

export interface Department {
  id: string;
  entityId: string;
  name: string;
  code: string;
  headId: string | null;
  opsOwnerId: string | null;
  costCenter: string;
  color: string;
  /** Opt-in delivery workspace; defaults to the seeded IT departments only. */
  devopsEnabled?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  code: string;
  entityId: string;
  departmentId: string;
  role: Role;
  managerId: string | null;
  countryCode: string;
  weeklyHours: number;
  joinDate: string;
  status: 'active' | 'on_leave' | 'inactive';
  avatarColor: string;
  /** Fully-loaded hourly cost used by the capitalisation report. */
  costRateAUD?: number;
  /** Home stream inside the employee's department. */
  streamId?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  plannedHours: number;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  type: ActivityType;
  entityId: string;
  departmentId: string;
  assigneeId: string;
  createdById: string;
  startDate: string;
  endDate: string;
  /** Optional same-day time window, used by the daily schedule and calendar export. */
  startTime?: string;
  endTime?: string;
  plannedHours: number;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  location?: string;
  subtasks: Subtask[];
  sync: Record<CalendarProvider, boolean>;
  createdAt: string;
  /** Project task linkage — set when the activity is a deliverable of an IT project. */
  projectId?: string;
  projectTaskId?: string;
  /** AASB 138 eligible development effort; operational/BAU tasks are never capitalised. */
  capitalisable?: boolean;
  projectPhase?: TaskPhase;
  /** Delivery backlog item against which this calendar effort is planned. */
  workItemId?: string;
  /** Executing stream; the resource keeps their own home department/stream. */
  streamId?: string;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  activityId: string;
  date: string;
  hours: number;
  note: string;
  billable: boolean;
  approved: boolean;
}

export interface Holiday {
  id: string;
  countryCode: string;
  date: string;
  name: string;
  type: HolidayType;
}

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  weeklyOff: number[];
  timezone: string;
  note?: string;
}

export interface Escalation {
  id: string;
  departmentId: string;
  period: PeriodKey;
  periodStart: string;
  periodEnd: string;
  score: number;
  threshold: number;
  utilization: number;
  onTimeRate: number;
  recipients: string[];
  cc: string[];
  createdAt: string;
  status: 'open' | 'acknowledged' | 'closed';
  note: string;
}

/* ------------------------------------------------------------------ */
/* Daily department stand-up                                           */
/* ------------------------------------------------------------------ */
export type SupportRequestType = 'internal' | 'cross_functional';
export type SupportRequestStatus = 'open' | 'acknowledged' | 'resolved';
export type StandupActionStatus = 'open' | 'done';
export type StandupStatus = 'draft' | 'submitted';

/** A blocker raised in a stand-up that needs help from another person/team. */
export interface SupportRequest {
  id: string;
  description: string;
  /** internal = help inside the department; cross_functional = another department. */
  type: SupportRequestType;
  /** The department asked for help when the request is cross-functional. */
  targetDepartmentId: string | null;
  status: SupportRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
}

/** Action item the member commits to during the stand-up. */
export interface StandupActionItem {
  id: string;
  title: string;
  ownerId: string | null;
  dueDate: string | null;
  status: StandupActionStatus;
}

/**
 * One member's stand-up for one working day: last working day update,
 * progress, blockers, support callouts and the day's action items.
 * One row per employee per date (upserted).
 */
export interface StandupEntry {
  id: string;
  /** yyyy-MM-dd — the working day the stand-up covers. */
  date: string;
  departmentId: string;
  employeeId: string;
  /** Share on last working day's activity. */
  lastDayUpdate: string;
  /** Progress update against current deliverables. */
  progressUpdate: string;
  /** Blockers — empty string means the member is unblocked. */
  blockers: string;
  actionItems: StandupActionItem[];
  supportRequests: SupportRequest[];
  status: StandupStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarConnection {
  id: string;
  employeeId: string;
  provider: CalendarProvider;
  accountEmail: string;
  status: 'connected' | 'pending' | 'disconnected';
  lastSync: string | null;
  twoWay: boolean;
}

export interface SyncJob {
  id: string;
  activityId: string;
  provider: CalendarProvider;
  action: 'create' | 'update' | 'delete';
  status: 'queued' | 'synced' | 'failed';
  at: string;
  message: string;
}

export interface Settings {
  activeUserId: string;
  /** Device-local tenant preference — never shared with other users. */
  activeTenantId: string;
  groupName: string;
  workingDayStart: string;
  workingDayEnd: string;
  holidayHorizonYears: number;
  performanceThreshold: number;
  weekStartsOn: 0 | 1 | 6;
}

export interface StoreState {
  tenants: Tenant[];
  entities: Entity[];
  departments: Department[];
  deliveryStreams: DeliveryStream[];
  workItems: WorkItem[];
  devopsImports: DevopsImportBatch[];
  employees: Employee[];
  activities: Activity[];
  timeEntries: TimeEntry[];
  holidays: Holiday[];
  countries: CountryConfig[];
  escalations: Escalation[];
  connections: CalendarConnection[];
  syncJobs: SyncJob[];
  standups: StandupEntry[];
  leaves: LeaveRequest[];
  settings: Settings;
  auditLog: AuditEntry[];
  projects: Project[];
  capitalisation: CapitalisationPolicy;
  capitalisationApprovals: CapitalisationApproval[];
}

export interface AuditEntry {
  id: string;
  /** Tenant the event belongs to; absent on legacy rows, which stay global. */
  tenantId?: string;
  at: string;
  actorId: string;
  action: string;
  detail: string;
}

export type PeriodKey = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface DepartmentScore {
  departmentId: string;
  period: PeriodKey;
  periodStart: string;
  periodEnd: string;
  headcount: number;
  plannedHours: number;
  loggedHours: number;
  billableHours: number;
  capacityHours: number;
  utilization: number;
  onTimeRate: number;
  completionRate: number;
  attendanceRate: number;
  workloadIndex: number;
  score: number;
  openActivities: number;
  overdueActivities: number;
  trend: number;
}

export interface EmployeeScore {
  employeeId: string;
  plannedHours: number;
  loggedHours: number;
  capacityHours: number;
  utilization: number;
  onTimeRate: number;
  completionRate: number;
  score: number;
}

export interface AppFilters {
  /** 'all' or an entity id — the dashboard focuses on that entity and its companies. */
  entityId: string;
  departmentId: string;
  employeeId: string;
  period: PeriodKey;
  anchor: string;
}

export type ViewKey =
  | 'dashboard'
  | 'calendar'
  | 'activities'
  | 'roadmap'
  | 'timesheet'
  | 'standups'
  | 'leave'
  | 'projects'
  | 'delivery'
  | 'effort-reports'
  | 'capitalisation'
  | 'performance'
  | 'admin'
  | 'integrations'
  | 'whats-new'
  | 'theme-studio';
