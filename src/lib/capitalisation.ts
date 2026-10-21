import type {
  Activity,
  CapitalisationApproval,
  CapitalisationPolicy,
  Employee,
  Project,
  ProjectTask,
  Role,
  StoreState,
  TaskPhase,
} from '../types';
import { capacityHoursFor } from './analytics';
import { fromISO, periodRange, toISO } from './dates';

const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export interface CapitalisationScope {
  entityId?: string;
  departmentId?: string;
  employeeId?: string;
  start: string;
  end: string;
}

export type ExclusionReason =
  | 'operational_project'
  | 'non_capitalisable_task'
  | 'outside_capitalisation_window'
  | 'cancelled_project'
  | 'below_policy_threshold'
  | 'not_project_effort';

export interface CapitalisationLine {
  entryId: string;
  date: string;
  employeeId: string;
  employeeName: string;
  role: Role;
  costCentre: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectCategory: string;
  taskId: string;
  taskTitle: string;
  phase: TaskPhase;
  hours: number;
  rate: number;
  capitalisedHours: number;
  costRate: number;
  capitalisedCost: number;
}

export interface ExclusionLine {
  entryId: string;
  date: string;
  employeeId: string;
  employeeName: string;
  hours: number;
  costRate: number;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
  reason: ExclusionReason;
  detail: string;
}

export interface ResourceCapitalisation {
  employeeId: string;
  name: string;
  role: Role;
  departmentId: string;
  costCentre: string;
  costRate: number;
  capitalHours: number;
  capitalisedHours: number;
  capitalisedCost: number;
  excludedHours: number;
  nonProjectHours: number;
  totalHours: number;
  capacityHours: number;
  capitalShare: number;
  utilisation: number;
  projects: number;
}

export interface ProjectCapitalisation {
  projectId: string;
  code: string;
  name: string;
  category: string;
  stage: string;
  status: string;
  wbsCode: string;
  capexAUD: number;
  budgetAUD: number;
  rate: number;
  hours: number;
  capitalisedHours: number;
  capitalisedCost: number;
  excludedHours: number;
  resources: number;
  capitalisationProgress: number;
  deliveryProgress: number;
}

export interface CapitalisationReport {
  scope: CapitalisationScope;
  policy: CapitalisationPolicy;
  currency: string;
  entityName: string;
  departmentName: string;
  periodLabel: string;
  effectiveEnd: string;
  headcount: number;
  totalHours: number;
  capitalHours: number;
  capitalisedHours: number;
  capitalisedCost: number;
  excludedProjectHours: number;
  nonProjectHours: number;
  nonCapitalisedCost: number;
  capacityHours: number;
  utilisation: number;
  capitalisationRate: number;
  activeCapitalProjects: number;
  capitalProjectsInScope: number;
  pipelineCapexAUD: number;
  approvedCapexAUD: number;
  projectsAtRisk: number;
  lines: CapitalisationLine[];
  exclusions: ExclusionLine[];
  byResource: ResourceCapitalisation[];
  byProject: ProjectCapitalisation[];
  byCategory: { category: string; capitalisedHours: number; capitalisedCost: number; projects: number }[];
  byPhase: { phase: TaskPhase; hours: number; capitalisedHours: number; cost: number }[];
  entriesCount: number;
  approvedEntries: number;
}

/**
 * Fully-loaded hourly cost. Retail people carry an explicit AUD rate; anyone
 * else falls back to the policy's role band so older data still reports.
 */
export function employeeCostRate(state: StoreState, employee?: Employee): number {
  if (!employee) return state.capitalisation?.roleCostRates.employee ?? 0;
  return employee.costRateAUD ?? state.capitalisation?.roleCostRates[employee.role] ?? 0;
}

const projectTaskFor = (project: Project | undefined, activity: Activity): ProjectTask | undefined =>
  project?.tasks.find((task) => task.id === activity.projectTaskId) ??
  project?.tasks.find((task) => task.activityId === activity.id);

export function capitalisationEligibility(
  state: StoreState,
  activity: Activity,
  project: Project | undefined,
): { eligible: boolean; reason?: ExclusionReason; detail?: string } {
  if (!project) return { eligible: false, reason: 'not_project_effort', detail: 'No project linked to this activity' };
  if (project.status === 'cancelled') return { eligible: false, reason: 'cancelled_project', detail: 'Project cancelled' };
  if (project.portfolio !== 'capital') {
    return { eligible: false, reason: 'operational_project', detail: 'Operational run project — expensed' };
  }
  const task = projectTaskFor(project, activity);
  const phase = activity.projectPhase ?? task?.phase ?? 'support';
  const phaseEligible = state.capitalisation?.eligiblePhases.includes(phase) ?? false;
  if (!activity.capitalisable || !task?.capitalisable || !phaseEligible) {
    return {
      eligible: false,
      reason: 'non_capitalisable_task',
      detail: `Phase "${phase}" is excluded by the AASB 138 policy`,
    };
  }
  if (activity.startDate < project.capitalisationStart || activity.endDate > project.capitalisationEnd) {
    return {
      eligible: false,
      reason: 'outside_capitalisation_window',
      detail: `Outside capitalisation window ${project.capitalisationStart} → ${project.capitalisationEnd}`,
    };
  }
  return { eligible: true };
}

const emptyReport = (
  state: StoreState,
  scope: CapitalisationScope,
  policy: CapitalisationPolicy,
): CapitalisationReport => ({
  scope,
  policy,
  currency: policy.currency,
  entityName: 'All entities',
  departmentName: 'All departments',
  periodLabel: `${scope.start} → ${scope.end}`,
  effectiveEnd: scope.end,
  headcount: 0,
  totalHours: 0,
  capitalHours: 0,
  capitalisedHours: 0,
  capitalisedCost: 0,
  excludedProjectHours: 0,
  nonProjectHours: 0,
  nonCapitalisedCost: 0,
  capacityHours: 0,
  utilisation: 0,
  capitalisationRate: 0,
  activeCapitalProjects: 0,
  capitalProjectsInScope: 0,
  pipelineCapexAUD: 0,
  approvedCapexAUD: 0,
  projectsAtRisk: 0,
  lines: [],
  exclusions: [],
  byResource: [],
  byProject: [],
  byCategory: [],
  byPhase: [],
  entriesCount: 0,
  approvedEntries: 0,
});

/**
 * Builds the board capitalisation pack. Only effort on capital projects in an
 * AASB 138 eligible development phase becomes a capitalised line. Operational
 * projects, BAU support and training remain in the utilisation denominator and
 * are reported separately as excluded effort.
 */
export function capitalisationReport(state: StoreState, scopeInput: CapitalisationScope): CapitalisationReport {
  const policy = state.capitalisation;
  if (!policy) return emptyReport(state, scopeInput, {} as CapitalisationPolicy);
  const todayISO = toISO(new Date());
  const scope: CapitalisationScope = {
    ...scopeInput,
    end: scopeInput.end,
  };

  const employees = state.employees.filter((emp) => {
    if (emp.status === 'inactive') return false;
    if (scope.entityId && scope.entityId !== 'all' && emp.entityId !== scope.entityId) return false;
    if (scope.departmentId && scope.departmentId !== 'all' && emp.departmentId !== scope.departmentId) return false;
    if (scope.employeeId && scope.employeeId !== 'all' && emp.id !== scope.employeeId) return false;
    return true;
  });
  const employeeIds = new Set(employees.map((e) => e.id));
  const employeeMap = new Map(state.employees.map((e) => [e.id, e]));
  const activityMap = new Map(state.activities.map((a) => [a.id, a]));
  const projectMap = new Map(state.projects.map((p) => [p.id, p]));
  const deptMap = new Map(state.departments.map((d) => [d.id, d]));

  const effectiveEnd = scope.start <= todayISO && scope.end > todayISO ? todayISO : scope.end;
  const capacityHours = round(
    employees.reduce(
      (sum, emp) => sum + capacityHoursFor(emp, scope.start, effectiveEnd, state.holidays, state.countries),
      0,
    ),
  );

  const entries = state.timeEntries.filter(
    (entry) => employeeIds.has(entry.employeeId) && entry.date >= scope.start && entry.date <= scope.end,
  );

  const lines: CapitalisationLine[] = [];
  const exclusions: ExclusionLine[] = [];
  const resourceMap = new Map<string, ResourceCapitalisation>();
  const projectAgg = new Map<string, ProjectCapitalisation>();

  const resourcesFor = (emp: Employee): ResourceCapitalisation => {
    const existing = resourceMap.get(emp.id);
    if (existing) return existing;
    const created: ResourceCapitalisation = {
      employeeId: emp.id,
      name: emp.name,
      role: emp.role,
      departmentId: emp.departmentId,
      costCentre: deptMap.get(emp.departmentId)?.costCenter ?? '—',
      costRate: employeeCostRate(state, emp),
      capitalHours: 0,
      capitalisedHours: 0,
      capitalisedCost: 0,
      excludedHours: 0,
      nonProjectHours: 0,
      totalHours: 0,
      capacityHours: capacityHoursFor(emp, scope.start, effectiveEnd, state.holidays, state.countries),
      capitalShare: 0,
      utilisation: 0,
      projects: 0,
    };
    resourceMap.set(emp.id, created);
    return created;
  };

  // Capital projects in scope are listed even with zero effort (pipeline).
  state.projects
    .filter((project) => project.portfolio === 'capital')
    .filter((project) => !scope.entityId || scope.entityId === 'all' || project.entityId === scope.entityId)
    .filter((project) => !scope.departmentId || scope.departmentId === 'all' || project.departmentId === scope.departmentId)
    .forEach((project) => {
      projectAgg.set(project.id, {
        projectId: project.id,
        code: project.code,
        name: project.name,
        category: project.category,
        stage: project.stage,
        status: project.status,
        wbsCode: project.wbsCode,
        capexAUD: project.capexAUD,
        budgetAUD: project.budgetAUD,
        rate: project.capitalisationRate,
        hours: 0,
        capitalisedHours: 0,
        capitalisedCost: 0,
        excludedHours: 0,
        resources: 0,
        capitalisationProgress: 0,
        deliveryProgress: 0,
      });
    });

  const projectResources = new Map<string, Set<string>>();
  const phaseAgg = new Map<TaskPhase, { hours: number; capitalisedHours: number; cost: number }>();

  entries.forEach((entry) => {
    const emp = employeeMap.get(entry.employeeId);
    if (!emp) return;
    const activity = activityMap.get(entry.activityId);
    const resource = resourcesFor(emp);
    resource.totalHours = round(resource.totalHours + entry.hours);
    if (!activity) {
      resource.nonProjectHours = round(resource.nonProjectHours + entry.hours);
      exclusions.push({
        entryId: entry.id,
        date: entry.date,
        employeeId: emp.id,
        employeeName: emp.name,
        hours: entry.hours,
        costRate: resource.costRate,
        reason: 'not_project_effort',
        detail: 'Department activity with no project linkage',
      });
      return;
    }
    const project = activity.projectId ? projectMap.get(activity.projectId) : undefined;
    const eligibility = capitalisationEligibility(state, activity, project);
    const task = project ? projectTaskFor(project, activity) : undefined;
    const phase = (activity.projectPhase ?? task?.phase ?? 'support') as TaskPhase;

    if (!project || !eligibility.eligible) {
      resource.excludedHours = round(resource.excludedHours + entry.hours);
      if (!project) resource.nonProjectHours = round(resource.nonProjectHours + entry.hours);
      exclusions.push({
        entryId: entry.id,
        date: entry.date,
        employeeId: emp.id,
        employeeName: emp.name,
        hours: entry.hours,
        costRate: resource.costRate,
        projectId: project?.id,
        projectCode: project?.code,
        projectName: project?.name,
        reason: eligibility.reason ?? 'not_project_effort',
        detail: eligibility.detail ?? 'Not a capital project',
      });
      if (project) {
        const agg = projectAgg.get(project.id);
        if (agg) agg.excludedHours = round(agg.excludedHours + entry.hours);
      }
      return;
    }

    const rate = project.capitalisationRate;
    const capitalisedHours = round(entry.hours * rate, 2);
    const costRate = resource.costRate;
    const capitalisedCost = round(capitalisedHours * costRate, 2);
    lines.push({
      entryId: entry.id,
      date: entry.date,
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      costCentre: resource.costCentre,
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      projectCategory: project.category,
      taskId: task?.id ?? activity.projectTaskId ?? activity.id,
      taskTitle: task?.title ?? activity.title,
      phase,
      hours: entry.hours,
      rate,
      capitalisedHours,
      costRate,
      capitalisedCost,
    });
    resource.capitalHours = round(resource.capitalHours + entry.hours);
    resource.capitalisedHours = round(resource.capitalisedHours + capitalisedHours, 2);
    resource.capitalisedCost = round(resource.capitalisedCost + capitalisedCost, 2);

    const agg = projectAgg.get(project.id);
    if (agg) {
      agg.hours = round(agg.hours + entry.hours);
      agg.capitalisedHours = round(agg.capitalisedHours + capitalisedHours, 2);
      agg.capitalisedCost = round(agg.capitalisedCost + capitalisedCost, 2);
      agg.resources = 0;
    }
    const set = projectResources.get(project.id) ?? new Set<string>();
    set.add(emp.id);
    projectResources.set(project.id, set);
    const phaseRow = phaseAgg.get(phase) ?? { hours: 0, capitalisedHours: 0, cost: 0 };
    phaseRow.hours = round(phaseRow.hours + entry.hours);
    phaseRow.capitalisedHours = round(phaseRow.capitalisedHours + capitalisedHours, 2);
    phaseRow.cost = round(phaseRow.cost + capitalisedCost, 2);
    phaseAgg.set(phase, phaseRow);
  });

  const byResource = Array.from(resourceMap.values())
    .map((row) => ({
      ...row,
      capitalShare: row.totalHours ? Math.round((row.capitalHours / row.totalHours) * 100) : 0,
      utilisation: row.capacityHours ? Math.round((row.totalHours / row.capacityHours) * 100) : 0,
      projects: new Set(
        lines.filter((line) => line.employeeId === row.employeeId).map((line) => line.projectId),
      ).size,
    }))
    .sort((a, b) => b.capitalisedCost - a.capitalisedCost);

  const byProject = Array.from(projectAgg.values())
    .map((row) => {
      const resources = projectResources.get(row.projectId)?.size ?? 0;
      const project = projectMap.get(row.projectId);
      const plannedCapitalHours = project
        ? project.tasks.filter((task) => task.capitalisable).reduce((sum, task) => sum + task.plannedHours, 0)
        : 0;
      const deliveryProgress = project
        ? Math.round(
            project.tasks.reduce((sum, task) => {
              const activity = activityMap.get(task.activityId);
              const progress = activity?.status === 'completed' ? 100 : activity?.progress ?? 0;
              return sum + progress * task.plannedHours;
            }, 0) / Math.max(1, plannedCapitalHours),
          )
        : 0;
      return {
        ...row,
        resources,
        capitalisationProgress: plannedCapitalHours ? Math.min(100, Math.round((row.hours / plannedCapitalHours) * 100)) : 0,
        deliveryProgress,
      };
    })
    .sort((a, b) => b.capitalisedCost - a.capitalisedCost);

  const categoryMap = new Map<string, { category: string; capitalisedHours: number; capitalisedCost: number; projects: Set<string> }>();
  byProject.forEach((project) => {
    const row = categoryMap.get(project.category) ?? {
      category: project.category,
      capitalisedHours: 0,
      capitalisedCost: 0,
      projects: new Set<string>(),
    };
    row.capitalisedHours = round(row.capitalisedHours + project.capitalisedHours, 2);
    row.capitalisedCost = round(row.capitalisedCost + project.capitalisedCost, 2);
    row.projects.add(project.projectId);
    categoryMap.set(project.category, row);
  });

  const totalHours = round(entries.reduce((sum, entry) => sum + entry.hours, 0));
  const capitalHours = round(lines.reduce((sum, line) => sum + line.hours, 0));
  const capitalisedHours = round(lines.reduce((sum, line) => sum + line.capitalisedHours, 0), 2);
  const capitalisedCost = round(lines.reduce((sum, line) => sum + line.capitalisedCost, 0), 2);
  const excludedProjectHours = round(
    exclusions.filter((line) => Boolean(line.projectId)).reduce((sum, line) => sum + line.hours, 0),
  );
  const nonProjectHours = round(exclusions.filter((line) => !line.projectId).reduce((sum, line) => sum + line.hours, 0));
  const nonCapitalisedCost = round(
    exclusions.reduce((sum, line) => sum + line.hours * line.costRate, 0),
    2,
  );

  const capitalProjects = state.projects.filter(
    (project) =>
      project.portfolio === 'capital' &&
      (!scope.entityId || scope.entityId === 'all' || project.entityId === scope.entityId) &&
      (!scope.departmentId || scope.departmentId === 'all' || project.departmentId === scope.departmentId),
  );
  const activeCapitalProjects = capitalProjects.filter((project) => project.status === 'active').length;
  const pipelineCapexAUD = capitalProjects
    .filter((project) => project.status === 'pipeline')
    .reduce((sum, project) => sum + project.capexAUD, 0);
  const approvedCapexAUD = capitalProjects.reduce((sum, project) => sum + project.capexAUD, 0);
  const projectsAtRisk = byProject.filter((project) => {
    if (project.status !== 'active') return false;
    const source = projectMap.get(project.projectId);
    if (!source) return false;
    const daysLeft = Math.round((fromISO(source.endDate).getTime() - fromISO(todayISO).getTime()) / 86400000);
    if (daysLeft > 60) return false;
    return project.deliveryProgress < (daysLeft < 0 ? 85 : 45);
  }).length;

  const entityName =
    !scope.entityId || scope.entityId === 'all'
      ? 'All entities'
      : state.entities.find((entity) => entity.id === scope.entityId)?.name ?? 'Unknown entity';
  const departmentName =
    !scope.departmentId || scope.departmentId === 'all'
      ? 'All departments'
      : deptMap.get(scope.departmentId)?.name ?? 'Unknown department';

  return {
    scope,
    policy,
    currency: policy.currency,
    entityName,
    departmentName,
    periodLabel: `${scope.start} → ${scope.end}`,
    effectiveEnd,
    headcount: employees.length,
    totalHours,
    capitalHours,
    capitalisedHours,
    capitalisedCost,
    excludedProjectHours,
    nonProjectHours,
    nonCapitalisedCost,
    capacityHours,
    utilisation: capacityHours ? Math.round((totalHours / capacityHours) * 100) : 0,
    capitalisationRate: totalHours ? Math.round((capitalHours / totalHours) * 100) : 0,
    activeCapitalProjects,
    capitalProjectsInScope: capitalProjects.length,
    pipelineCapexAUD,
    approvedCapexAUD,
    projectsAtRisk,
    lines: lines.sort((a, b) => b.date.localeCompare(a.date)),
    exclusions: exclusions.sort((a, b) => b.date.localeCompare(a.date)),
    byResource,
    byProject,
    byCategory: Array.from(categoryMap.values())
      .map(({ projects, ...rest }) => ({ ...rest, projects: projects.size }))
      .sort((a, b) => b.capitalisedCost - a.capitalisedCost),
    byPhase: Array.from(phaseAgg.entries())
      .map(([phase, value]) => ({ phase, ...value }))
      .sort((a, b) => b.hours - a.hours),
    entriesCount: entries.length,
    approvedEntries: entries.filter((entry) => entry.approved).length,
  };
}

export const monthKey = (date: Date | string) =>
  (typeof date === 'string' ? fromISO(date) : date).toLocaleDateString('en-CA').slice(0, 7);

export function monthScope(month: string): { start: string; end: string } {
  const [year, index] = month.split('-').map(Number);
  const anchor = new Date(year, index - 1, 1);
  const range = periodRange(anchor, 'month', 1);
  return { start: toISO(range.start), end: toISO(range.end) };
}

/** Snapshot an approval record from the live report for the board pack. */
export function buildApproval(
  state: StoreState,
  entityId: string,
  departmentId: string,
  month: string,
  status: CapitalisationApproval['status'] = 'draft',
): CapitalisationApproval {
  const scope = monthScope(month);
  const report = capitalisationReport(state, { entityId, departmentId, ...scope });
  const existing = state.capitalisationApprovals.find(
    (approval) => approval.entityId === entityId && approval.period === month,
  );
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? `cap-appr-${month}-${entityId}`,
    entityId,
    period: month,
    title: `${report.entityName} — IT capitalisation for ${month}`,
    capitalisedHours: report.capitalisedHours,
    capitalisedCostAUD: report.capitalisedCost,
    excludedHours: report.excludedProjectHours + report.nonProjectHours,
    utilisation: report.utilisation,
    status,
    submittedById: status === 'draft' ? null : state.settings.activeUserId,
    submittedAt: status === 'draft' ? null : now,
    decidedById: existing?.decidedById ?? null,
    decidedAt: existing?.decidedAt ?? null,
    note:
      existing?.note ??
      `Capitalisation rate ${report.capitalisationRate}% of ${report.totalHours}h logged. ${report.capitalProjectsInScope} capital projects in scope, ${report.projectsAtRisk} requiring PMO attention.`,
  };
}

export function projectLoggedStats(state: StoreState, project: Project) {
  const activityIds = new Set(project.tasks.map((task) => task.activityId));
  const entries = state.timeEntries.filter((entry) => activityIds.has(entry.activityId));
  const capitalisableIds = new Set(project.tasks.filter((task) => task.capitalisable).map((task) => task.activityId));
  const capitalHours = entries.filter((entry) => capitalisableIds.has(entry.activityId)).reduce((sum, entry) => sum + entry.hours, 0);
  const hours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const planned = project.tasks.reduce((sum, task) => sum + task.plannedHours, 0);
  return {
    hours: round(hours),
    capitalHours: round(capitalHours),
    planned,
    progress: planned ? Math.min(100, Math.round((hours / planned) * 100)) : 0,
    resources: new Set(entries.map((entry) => entry.employeeId)).size,
    entries: entries.length,
  };
}

export const PROJECT_CATEGORY_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  operations: 'Operations',
  security: 'Security',
  data_analytics: 'Data & analytics',
  infrastructure: 'Infrastructure',
  integration: 'Integration',
  digital_experience: 'Digital experience',
  enterprise_apps: 'Enterprise apps',
  network: 'Network',
  compliance: 'Compliance',
};

export const PROJECT_STAGE_LABELS: Record<string, string> = {
  idea: 'Idea',
  business_case: 'Business case',
  approved: 'Board approved',
  design: 'Design',
  build: 'Build',
  test: 'Test',
  deploy: 'Deploy',
  hypercare: 'Hypercare',
  closed: 'Closed',
  on_hold: 'On hold',
};

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  operational_project: 'Operational project (expensed)',
  non_capitalisable_task: 'Non-capitalisable phase',
  outside_capitalisation_window: 'Outside capitalisation window',
  cancelled_project: 'Cancelled project',
  below_policy_threshold: 'Below policy threshold',
  not_project_effort: 'No project linkage',
};

export const currency = (amount: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount);

export const hoursLabel = (hours: number) => `${round(hours, 1).toLocaleString('en-AU')}h`;
