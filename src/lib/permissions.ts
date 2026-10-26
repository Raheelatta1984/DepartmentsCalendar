import type { Department, Employee, Role, StoreState } from '../types';

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

export interface Scope {
  user: Employee;
  isGroupExecutive: boolean;
  visibleDepartments: Department[];
  visibleDepartmentIds: string[];
  visibleEmployeeIds: string[];
  directReportIds: string[];
  canManageMaster: boolean;
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
    visibleDepartments = state.departments;
  } else if (user.role === 'head_operations') {
    // COO owns every operational department (opsOwnerId) plus their own department
    visibleDepartments = state.departments.filter(
      (d) => d.opsOwnerId === user.id || d.headId === user.id || d.id === user.departmentId,
    );
  } else if (user.role === 'department_head') {
    visibleDepartments = state.departments.filter((d) => d.id === user.departmentId || d.headId === user.id);
  } else {
    visibleDepartments = state.departments.filter((d) => d.id === user.departmentId);
  }

  const visibleDepartmentIds = visibleDepartments.map((d) => d.id);
  /* Group executives see the people of the departments in scope — which is
     already the active tenant cut down to the departments the calendar is
     implemented for. Nobody outside those departments is ever listed. */
  const visibleEmployeeIds =
    user.role === 'ceo' || user.role === 'head_operations'
      ? state.employees
          .filter((e) => visibleDepartmentIds.includes(e.departmentId) || e.id === user.id)
          .map((e) => e.id)
      : Array.from(new Set([user.id, ...reports]));

  return {
    user,
    isGroupExecutive,
    visibleDepartments,
    visibleDepartmentIds,
    visibleEmployeeIds,
    directReportIds: reports,
    canManageMaster: user.role === 'ceo' || user.role === 'head_operations' || user.role === 'department_head',
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
      return `Group-wide visibility · ${scope.visibleDepartments.length} departments · ${scope.visibleEmployeeIds.length} people`;
    case 'head_operations':
      return `${scope.visibleDepartments.length} operational units across the group`;
    case 'department_head':
      return `Owns ${scope.visibleDepartments.map((d) => d.code).join(', ')} · ${scope.visibleEmployeeIds.length} people`;
    default:
      return `Team of ${scope.visibleEmployeeIds.length} (self + reporting line)`;
  }
}
