export type Role =
  | 'ceo'
  | 'head_operations'
  | 'department_head'
  | 'unit_head'
  | 'manager'
  | 'supervisor'
  | 'employee';

export type EntityType = 'group' | 'company' | 'sub_company';

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

export interface Entity {
  id: string;
  name: string;
  code: string;
  type: EntityType;
  parentId: string | null;
  countryCode: string;
  timezone: string;
  industry?: string;
  /** Local reporting currency for entity-level financial reports. */
  currency?: string;
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
  groupName: string;
  workingDayStart: string;
  workingDayEnd: string;
  holidayHorizonYears: number;
  performanceThreshold: number;
  weekStartsOn: 0 | 1 | 6;
}

export interface StoreState {
  entities: Entity[];
  departments: Department[];
  employees: Employee[];
  activities: Activity[];
  timeEntries: TimeEntry[];
  holidays: Holiday[];
  countries: CountryConfig[];
  escalations: Escalation[];
  connections: CalendarConnection[];
  syncJobs: SyncJob[];
  settings: Settings;
  auditLog: AuditEntry[];
  projects: Project[];
  capitalisation: CapitalisationPolicy;
  capitalisationApprovals: CapitalisationApproval[];
}

export interface AuditEntry {
  id: string;
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
  | 'projects'
  | 'capitalisation'
  | 'performance'
  | 'admin'
  | 'integrations'
  | 'whats-new'
  | 'theme';
