import type { Employee } from '../types';

/* ------------------------------------------------------------------ */
/* Reporting-line (organisation) hierarchy                             */
/*                                                                     */
/* The employee master already stores `managerId`, so the organisation */
/* chart is derived from that one field and never duplicated. Screens  */
/* that draw, search or re-parent the hierarchy share the traversal    */
/* rules here so a move made on the chart and a move made in Master    */
/* setup can never produce two different trees.                        */
/* ------------------------------------------------------------------ */

export interface OrgNode {
  employee: Employee;
  /** 0 = top of the hierarchy (no manager inside the visible set). */
  depth: number;
  children: OrgNode[];
  /** Reports below this person at any depth. */
  descendants: number;
  /** Reports at any depth, including this person. */
  teamSize: number;
}

export interface OrgMoveResult {
  ok: boolean;
  /** Human explanation shown in a toast or the drag preview. */
  reason: string;
}

const byName = (a: Employee, b: Employee) => a.name.localeCompare(b.name);

/** Manager id → direct reports, in name order. `null` holds the top level. */
export function orgChildrenMap(employees: Employee[]): Map<string | null, Employee[]> {
  const map = new Map<string | null, Employee[]>();
  const ids = new Set(employees.map((employee) => employee.id));
  employees.forEach((employee) => {
    // A manager outside the visible set is treated as "none" so the person
    // still appears at the top of the chart rather than disappearing from it.
    const key = employee.managerId && ids.has(employee.managerId) ? employee.managerId : null;
    const list = map.get(key) ?? [];
    list.push(employee);
    map.set(key, list);
  });
  map.forEach((list) => list.sort(byName));
  return map;
}

/** Ids of everybody below `rootId` in the reporting line. */
export function orgDescendantIds(employees: Employee[], rootId: string): Set<string> {
  const children = orgChildrenMap(employees);
  const out = new Set<string>();
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const person = stack.pop()!;
    if (person.id === rootId || out.has(person.id)) continue;
    out.add(person.id);
    stack.push(...(children.get(person.id) ?? []));
  }
  return out;
}

/** The person plus every report below them — the change-scope of a move. */
export function orgTeamIds(employees: Employee[], rootId: string): Set<string> {
  return new Set<string>([rootId, ...orgDescendantIds(employees, rootId)]);
}

/** Top-level people → their reports, with depth and team counts. */
export function buildOrgTree(employees: Employee[]): OrgNode[] {
  const children = orgChildrenMap(employees);
  const seen = new Set<string>();

  const walk = (employee: Employee, depth: number): OrgNode => {
    seen.add(employee.id);
    const directReports = (children.get(employee.id) ?? []).filter((child) => !seen.has(child.id));
    const nodes = directReports.map((child) => walk(child, depth + 1));
    const descendants = nodes.reduce((total, node) => total + node.descendants + 1, 0);
    return { employee, depth, children: nodes, descendants, teamSize: descendants + 1 };
  };

  return (children.get(null) ?? []).map((employee) => walk(employee, 0));
}

/** Flattens any tree into the order it is drawn (top-down). */
export function flattenOrg(nodes: OrgNode[]): OrgNode[] {
  const out: OrgNode[] = [];
  const stack = [...nodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    out.push(node);
    [...node.children].reverse().forEach((child) => stack.push(child));
  }
  return out;
}

/** Reporting line from the person up to the top of the hierarchy. */
export function orgChain(employees: Employee[], employeeId: string): Employee[] {
  const map = new Map(employees.map((employee) => [employee.id, employee]));
  const out: Employee[] = [];
  const seen = new Set<string>();
  let current = map.get(employeeId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    out.push(current);
    current = current.managerId ? map.get(current.managerId) : undefined;
  }
  return out;
}

/** “Angus Harris → RAM → Swechchha” — the line a person reports through. */
export function orgBreadcrumb(employees: Employee[], employeeId: string): string {
  return orgChain(employees, employeeId)
    .reverse()
    .map((employee) => employee.name)
    .join(' → ');
}

/** 0 for the top of the hierarchy, 1 for their direct reports, and so on. */
export function orgDepth(employees: Employee[], employeeId: string): number {
  return Math.max(0, orgChain(employees, employeeId).length - 1);
}

/**
 * Validates a reporting-line change before it is written. The chart and the
 * directory both call this, so the same move is refused for the same reason
 * wherever the user attempts it.
 */
export function validateOrgMove(
  employees: Employee[],
  employeeId: string,
  managerId: string | null,
): OrgMoveResult {
  const employee = employees.find((row) => row.id === employeeId);
  if (!employee) return { ok: false, reason: 'That person is no longer in the register.' };
  if (!managerId) return { ok: true, reason: 'Moves to the top of the hierarchy.' };
  if (managerId === employeeId) return { ok: false, reason: 'A person cannot report to themselves.' };

  const manager = employees.find((row) => row.id === managerId);
  if (!manager) return { ok: false, reason: 'The chosen manager is not in this workspace.' };
  if (manager.status === 'inactive') return { ok: false, reason: `${manager.name} is inactive and cannot take new reports.` };
  if (employee.managerId === managerId) return { ok: false, reason: `${employee.name} already reports to ${manager.name}.` };
  if (orgDescendantIds(employees, employeeId).has(managerId)) {
    return {
      ok: false,
      reason: `${manager.name} sits below ${employee.name}, so this would loop the hierarchy.`,
    };
  }
  return { ok: true, reason: `${employee.name} will report to ${manager.name}.` };
}

/**
 * Immutable re-parent: only the reporting line changes. Department, entity,
 * stream and every other field stay exactly as they were, so a reporting-line
 * correction never silently re-scopes someone's calendar access.
 */
export function reparentEmployees(
  employees: Employee[],
  employeeId: string,
  managerId: string | null,
): Employee[] {
  return employees.map((employee) =>
    employee.id === employeeId ? { ...employee, managerId: managerId ?? null } : employee,
  );
}

/**
 * People who cannot legitimately be dropped on: the person themselves and
 * their own reports. Used to grey out invalid drop targets while dragging.
 */
export function orgBlockedTargets(employees: Employee[], employeeId: string): Set<string> {
  return orgTeamIds(employees, employeeId);
}

export interface OrgStats {
  headcount: number;
  /** People with at least one direct report. */
  managers: number;
  /** People with no manager inside the visible set. */
  topLevel: number;
  /** Number of reporting layers. */
  layers: number;
  /** People with nobody reporting to them. */
  individualContributors: number;
  /** The busiest manager's direct-report count. */
  widestSpan: number;
}

export function orgStats(employees: Employee[]): OrgStats {
  const nodes = flattenOrg(buildOrgTree(employees));
  const directCounts = nodes.map((node) => node.children.length);
  return {
    headcount: employees.length,
    managers: directCounts.filter((count) => count > 0).length,
    topLevel: nodes.filter((node) => node.depth === 0).length,
    layers: nodes.reduce((deepest, node) => Math.max(deepest, node.depth + 1), 0),
    individualContributors: directCounts.filter((count) => count === 0).length,
    widestSpan: directCounts.reduce((widest, count) => Math.max(widest, count), 0),
  };
}

/**
 * People who inherit the calendar scope of a manager: used by the chart's
 * change-impact note so a move is never described as "just a line on a page".
 */
export function orgImpactSummary(employees: Employee[], employeeId: string): string {
  const team = orgTeamIds(employees, employeeId);
  const direct = orgChildrenMap(employees).get(employeeId) ?? [];
  if (team.size <= 1) return 'No reports move with them.';
  return `${direct.length} direct report${direct.length === 1 ? '' : 's'} · ${team.size - 1} in the team move with them.`;
}
