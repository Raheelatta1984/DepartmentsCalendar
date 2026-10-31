import type { Activity, Department, DeliveryStream, Employee, Role, StoreState } from '../types';

export const ROLE_LABELS: Record<Role, string> = {
  ceo: 'Chief Executive Officer',
  head_operations: 'Head of Operations',
  department_head: 'Department Head',
  unit_head: 'Unit Head',
  manager: 'Manager',
  supervisor: 'Supervisor',
  employee: 'Employee',
};

export const ROLE_RANK: Record<Role, number> = {
  ceo: 7,
  head_operations: 6,
  department_head: 5,
  unit_head: 4,
  manager: 3,
  supervisor: 2,
  employee: 1,
};

/** Business designation when present; the role label is the access-tier fallback. */
export function employeeTitle(employee: Pick<Employee, 'role' | 'jobTitle'> | undefined): string {
  return employee?.jobTitle?.trim() || (employee ? ROLE_LABELS[employee.role] : 'Employee');
}

export interface Scope {
  user: Employee;
  isGroupExecutive: boolean;
  visibleDepartments: Department[];
  visibleDepartmentIds: string[];
  visibleEmployeeIds: string[];
  directReportIds: string[];
  canManageMaster: boolean;
  /**
   * Who may re-draw the reporting lines: every access tier that already owns
   * master data, plus unit heads and managers for their own organisations.
   * Employees can read the chart but not re-parent people.
   */
  canManageReportingLines: boolean;
  canConfigureGroup: boolean;
  canEscalate: boolean;
  canApproveTimesheets: boolean;
  canViewAllEntities: boolean;
}

/** Walks the reporting line so managers see their whole downstream team. */
export function reportingTree(employees: Employee[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  employees.forEach((e) => {
    if (!e.managerId) return;
    const list = children.get(e.managerId) ?? [];
    list.push(e.id);
    children.set(e.managerId, list);
  });
  const out: string[] = [];
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.includes(id)) continue;
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

export function getScope(state: StoreState, userId: string): Scope {
  const user = state.employees.find((e) => e.id === userId) ?? state.employees[0];
  const isGroupExecutive = user.role === 'ceo' || user.role === 'head_operations';
  const reports = reportingTree(state.employees, user.id);

  let visibleDepartments: Department[];
  if (user.role === 'ceo') {
    // Legacy single-CEO profiles without an explicit list retain group-wide
    // visibility. Co-CEOs can opt into an editable department portfolio; an
    // explicit empty list means the portfolio has not been rolled out yet.
    visibleDepartments = user.responsibleDepartmentIds === undefined
      ? state.departments
      : state.departments.filter((d) => user.responsibleDepartmentIds!.includes(d.id) || d.headId === user.id);
  } else if (user.role === 'head_operations') {
    // Operations leaders can either use the legacy ops-owner mapping or an
    // explicit, editable department portfolio.
    visibleDepartments = user.responsibleDepartmentIds !== undefined
      ? state.departments.filter((d) => user.responsibleDepartmentIds!.includes(d.id) || d.headId === user.id)
      : state.departments.filter(
          (d) => d.opsOwnerId === user.id || d.headId === user.id || d.id === user.departmentId,
        );
  } else if (user.role === 'department_head') {
    visibleDepartments = state.departments.filter((d) => d.id === user.departmentId || d.headId === user.id);
  } else {
    visibleDepartments = state.departments.filter((d) => d.id === user.departmentId);
  }

  /* Capture accountable departments before adding any direct-share department.
     A person-to-person grant must never turn into visibility of the owner's
     entire department for an executive or department head. */
  const accountableDepartmentIds = visibleDepartments.map((department) => department.id);

  /* Calendar sharing is one-way and employee-controlled. A colleague becomes
     visible only when they shared with this person directly or with this
     person's home department. Reporting-line and executive access remain
     independent, so a manager never needs a grant to review their own team. */
  const sharedOwnerIds = (state.calendarShares ?? [])
    .filter((share) =>
      share.ownerId !== user.id && (
        (share.audience === 'employee' && share.employeeId === user.id) ||
        (share.audience === 'department' && share.departmentId === user.departmentId)
      ),
    )
    .map((share) => share.ownerId)
    .filter((ownerId) => state.employees.some((employee) => employee.id === ownerId));

  // A direct person-to-person grant may cross departments inside the same
  // tenant. Only that person's rows become visible, never the whole department.
  const sharedDepartmentIds = state.employees
    .filter((employee) => sharedOwnerIds.includes(employee.id))
    .map((employee) => employee.departmentId);
  visibleDepartments = [
    ...visibleDepartments,
    ...state.departments.filter((department) =>
      sharedDepartmentIds.includes(department.id) && !visibleDepartments.some((row) => row.id === department.id),
    ),
  ];
  const visibleDepartmentIds = visibleDepartments.map((d) => d.id);

  /* Group executives and department heads see their accountable departments.
     Other leaders see their reporting line. Everyone can additionally see a
     calendar explicitly shared with them; ordinary employees otherwise see
     only themselves — not their line manager or teammates' working activity. */
  const visibleEmployeeIds =
    user.role === 'ceo' || user.role === 'head_operations' || user.role === 'department_head'
      ? Array.from(new Set([
          ...state.employees
            .filter((e) => accountableDepartmentIds.includes(e.departmentId) || e.id === user.id)
            .map((e) => e.id),
          ...sharedOwnerIds,
        ]))
      : Array.from(new Set([user.id, ...reports, ...sharedOwnerIds]));

  return {
    user,
    isGroupExecutive,
    visibleDepartments,
    visibleDepartmentIds,
    visibleEmployeeIds,
    directReportIds: reports,
    canManageMaster: user.role === 'ceo' || user.role === 'head_operations' || user.role === 'department_head',
    canManageReportingLines: ROLE_RANK[user.role] >= ROLE_RANK.unit_head,
    canConfigureGroup: user.role === 'ceo' || user.role === 'head_operations',
    canEscalate: ['ceo', 'head_operations', 'department_head'].includes(user.role),
    canApproveTimesheets: ROLE_RANK[user.role] >= ROLE_RANK.supervisor,
    canViewAllEntities: user.role === 'ceo',
  };
}

export function canViewEmployee(scope: Scope, employeeId: string) {
  return scope.visibleEmployeeIds.includes(employeeId);
}

/* ------------------------------------------------------------------ */
/* Activity ownership, on-behalf logging and delegation                */
/* ------------------------------------------------------------------ */

/** Self service, or a supervisor-and-above ancestor in the reporting tree. */
export function canLogForEmployee(state: StoreState, actorId: string, employeeId: string): boolean {
  if (actorId === employeeId) return state.employees.some((employee) => employee.id === employeeId);
  const actor = state.employees.find((employee) => employee.id === actorId);
  const target = state.employees.find((employee) => employee.id === employeeId);
  if (!actor || !target || target.status === 'inactive') return false;
  return ROLE_RANK[actor.role] >= ROLE_RANK.supervisor && reportingTree(state.employees, actorId).includes(employeeId);
}

/** Actual time can be approved only by the employee's reporting lead. */
export function canApproveEmployeeTime(state: StoreState, actorId: string, employeeId: string): boolean {
  return actorId !== employeeId && canLogForEmployee(state, actorId, employeeId);
}

/** Shared calendars are read-only unless the viewer is the owner's reporting lead. */
export function canEditActivity(state: StoreState, actorId: string, activity: Activity): boolean {
  return canLogForEmployee(state, actorId, activity.assigneeId);
}

/**
 * Leaders can assign work to their reporting line. An employee can delegate a
 * task they currently own to a colleague in the same department, even before
 * calendars are shared. Delegation changes the current assignee; it never
 * rewrites historical time already logged by the previous owner.
 */
export function canAssignActivity(
  state: StoreState,
  actorId: string,
  activity: Pick<Activity, 'type' | 'assigneeId'>,
  targetEmployeeId: string,
): boolean {
  if (canLogForEmployee(state, actorId, targetEmployeeId)) return true;
  if (activity.type !== 'task') return false;
  const actor = state.employees.find((employee) => employee.id === actorId);
  const target = state.employees.find((employee) => employee.id === targetEmployeeId);
  return Boolean(
    actor && target && activity.assigneeId === actorId && target.id !== actorId &&
    target.departmentId === actor.departmentId && target.status !== 'inactive',
  );
}

export type OrganisationBand = 'heads' | 'leads' | 'members';

export const ORGANISATION_BAND_LABELS: Record<OrganisationBand, string> = {
  heads: 'Department heads',
  leads: 'Department leads',
  members: 'Team members',
};

/** Consistent executive drill-down order for roadmap and team-week views. */
export function organisationBand(
  employee: Employee,
  department: Department | undefined,
  streams: DeliveryStream[] = [],
): OrganisationBand {
  if (department?.headId === employee.id || ['ceo', 'head_operations', 'department_head'].includes(employee.role)) {
    return 'heads';
  }
  if (['unit_head', 'manager', 'supervisor'].includes(employee.role) || streams.some((stream) => stream.leadId === employee.id)) {
    return 'leads';
  }
  return 'members';
}

export function compareOrganisationEmployees(
  a: Employee,
  b: Employee,
  departments: Department[],
  streams: DeliveryStream[] = [],
): number {
  const departmentA = departments.find((department) => department.id === a.departmentId);
  const departmentB = departments.find((department) => department.id === b.departmentId);
  const departmentOrder = (departmentA?.name ?? '').localeCompare(departmentB?.name ?? '');
  if (departmentOrder) return departmentOrder;
  const rank: Record<OrganisationBand, number> = { heads: 0, leads: 1, members: 2 };
  const bandOrder = rank[organisationBand(a, departmentA, streams)] - rank[organisationBand(b, departmentB, streams)];
  return bandOrder || a.name.localeCompare(b.name);
}

/* ------------------------------------------------------------------ */
/* Daily stand-up authorization                                        */
/*                                                                     */
/* Every member writes their own stand-up. Progress and activity       */
/* tracking is restricted to the leadership layer of the relevant      */
/* department (supervisor → manager → unit head → department head),    */
/* while the CEO/COO see every department they are responsible for.    */
/* Plain employees never open another person's stand-up.               */
/* ------------------------------------------------------------------ */

/** Supervisors and above can open the department stand-up board. */
export function canViewStandupBoard(scope: Scope): boolean {
  return ROLE_RANK[scope.user.role] >= ROLE_RANK.supervisor;
}

/** Leadership may only track stand-ups for departments inside their scope. */
export function canViewDepartmentStandups(scope: Scope, departmentId: string): boolean {
  return canViewStandupBoard(scope) && scope.visibleDepartmentIds.includes(departmentId);
}

/** A stand-up entry is editable by its author; leadership tracks but does not rewrite. */
export function canEditStandupEntry(scope: Scope, employeeId: string): boolean {
  return scope.user.id === employeeId;
}

/** Department leadership and group executives can acknowledge/resolve support callouts. */
export function canResolveSupportRequest(scope: Scope, departmentId: string): boolean {
  return canViewDepartmentStandups(scope, departmentId);
}

export function describeScope(scope: Scope) {
  switch (scope.user.role) {
    case 'ceo':
      return scope.user.responsibleDepartmentIds === undefined
        ? `Group-wide visibility · ${scope.visibleDepartments.length} departments · ${scope.visibleEmployeeIds.length} people`
        : `${scope.visibleDepartments.length} assigned department${scope.visibleDepartments.length === 1 ? '' : 's'} · ${scope.visibleEmployeeIds.length} people`;
    case 'head_operations':
      return `${scope.visibleDepartments.length} operational units across the group`;
    case 'department_head':
      return `Owns ${scope.visibleDepartments.map((d) => d.code).join(', ')} · ${scope.visibleEmployeeIds.length} people`;
    default:
      return `Team of ${scope.visibleEmployeeIds.length} (self + reporting line)`;
  }
}
