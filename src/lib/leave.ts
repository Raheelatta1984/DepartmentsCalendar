import type {
  Department,
  Employee,
  Holiday,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  StoreState,
  Tenant,
} from '../types';
import type { Scope } from './permissions';
import { ROLE_LABELS, ROLE_RANK, reportingTree } from './permissions';
import { daysBetweenInclusive, fromISO, toISO } from './dates';

/* ------------------------------------------------------------------ */
/* Leave, PTO and public-holiday rules                                 */
/*                                                                     */
/* An employee asks for a tentative date range on the Leave / PTO tab.  */
/* The line manager (or anyone above them) approves it. Once approved   */
/* the range is PTO on every calendar in the tenant, and the hours are  */
/* counted in its own PTO bucket. Public holidays (PH) and weekly-offs  */
/* are never counted as PTO — they are reported as PH instead.          */
/* ------------------------------------------------------------------ */

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Annual leave (PTO)',
  sick: 'Sick leave',
  unpaid: 'Unpaid leave',
  parental: 'Parental leave',
  study: 'Study / exam leave',
  other: 'Other approved absence',
};

export const LEAVE_TYPE_SHORT: Record<LeaveType, string> = {
  annual: 'PTO',
  sick: 'Sick',
  unpaid: 'Unpaid',
  parental: 'Parental',
  study: 'Study',
  other: 'Other',
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const LEAVE_STATUS_TONES: Record<LeaveStatus, 'good' | 'warn' | 'danger' | 'neutral'> = {
  pending: 'warn',
  approved: 'good',
  rejected: 'danger',
  cancelled: 'neutral',
};

/** Annual leave is the only type that draws down the PTO balance. */
export const isPtoType = (type: LeaveType) => type === 'annual';

export const dailyHoursFor = (employee: Pick<Employee, 'weeklyHours'>) =>
  Math.round((employee.weeklyHours / 5) * 100) / 100;

const holidaySet = (holidays: Holiday[], countryCode: string) => {
  const set = new Set<string>();
  holidays
    .filter((holiday) => holiday.countryCode === countryCode && holiday.type !== 'weekly_off')
    .forEach((holiday) => set.add(holiday.date));
  return set;
};

export interface LeaveBreakdown {
  /** Calendar days in the request, inclusive. */
  totalDays: number;
  /** Days actually counted as PTO: no weekly-off, no public holiday. */
  workingDays: number;
  /** Public holidays inside the range — shown as PH, excluded from PTO hours. */
  publicHolidayDays: number;
  /** Non-working weekly-off days inside the range. */
  weeklyOffDays: number;
  hours: number;
  publicHolidayHours: number;
  /** The individual working dates, used by the calendar preview. */
  workingDates: string[];
  publicHolidayDates: string[];
}

/**
 * Splits a requested span into working days, public holidays and weekly
 * offs using the employee's own country calendar. PTO hours are working
 * days × daily hours, so a public holiday can never be counted as leave.
 */
export function leaveBreakdown(
  state: Pick<StoreState, 'holidays' | 'countries'>,
  employee: Pick<Employee, 'countryCode' | 'weeklyHours'>,
  startDate: string,
  endDate: string,
): LeaveBreakdown {
  const daily = dailyHoursFor(employee);
  if (!startDate || !endDate || fromISO(endDate) < fromISO(startDate)) {
    return {
      totalDays: 0,
      workingDays: 0,
      publicHolidayDays: 0,
      weeklyOffDays: 0,
      hours: 0,
      publicHolidayHours: 0,
      workingDates: [],
      publicHolidayDates: [],
    };
  }
  const weeklyOff = state.countries.find((country) => country.code === employee.countryCode)?.weeklyOff ?? [0, 6];
  const ph = holidaySet(state.holidays, employee.countryCode);
  const dates = daysBetweenInclusive(startDate, endDate);

  let workingDays = 0;
  let publicHolidayDays = 0;
  let weeklyOffDays = 0;
  const workingDates: string[] = [];
  const publicHolidayDates: string[] = [];

  dates.forEach((date) => {
    const iso = toISO(date);
    if (weeklyOff.includes(date.getDay())) {
      weeklyOffDays += 1;
      return;
    }
    if (ph.has(iso)) {
      publicHolidayDays += 1;
      publicHolidayDates.push(iso);
      return;
    }
    workingDays += 1;
    workingDates.push(iso);
  });

  return {
    totalDays: dates.length,
    workingDays,
    publicHolidayDays,
    weeklyOffDays,
    hours: Math.round(workingDays * daily * 10) / 10,
    publicHolidayHours: Math.round(publicHolidayDays * daily * 10) / 10,
    workingDates,
    publicHolidayDates,
  };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */
export function leavesFor(state: Pick<StoreState, 'leaves'>, employeeId: string): LeaveRequest[] {
  return (state.leaves ?? [])
    .filter((leave) => leave.employeeId === employeeId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function leaveOnDate(
  state: Pick<StoreState, 'leaves'>,
  employeeId: string,
  date: string,
): LeaveRequest | undefined {
  return (state.leaves ?? []).find(
    (leave) =>
      leave.employeeId === employeeId &&
      leave.status === 'approved' &&
      leave.startDate <= date &&
      leave.endDate >= date,
  );
}

/** Everyone in the given departments who is on approved leave on that date. */
export function awayOnDate(
  state: Pick<StoreState, 'leaves' | 'employees'>,
  departmentIds: string[],
  date: string,
): { employee: Employee; leave: LeaveRequest }[] {
  const allowed = new Set(departmentIds);
  const byEmployee = new Map(state.employees.map((employee) => [employee.id, employee]));
  return (state.leaves ?? [])
    .filter(
      (leave) =>
        leave.status === 'approved' &&
        allowed.has(leave.departmentId) &&
        leave.startDate <= date &&
        leave.endDate >= date,
    )
    .map((leave) => ({ employee: byEmployee.get(leave.employeeId)!, leave }))
    .filter((row) => Boolean(row.employee));
}

export interface PtoSummary {
  employeeId: string;
  /** Contracted weekly hours ÷ 5 × entitlement days. */
  entitlementHours: number;
  entitlementDays: number;
  /** Approved annual leave hours — public holidays excluded. */
  approvedPtoHours: number;
  pendingPtoHours: number;
  remainingPtoHours: number;
  /** Approved non-PTO absences (sick, unpaid …), reported separately. */
  otherApprovedHours: number;
  /** Public-holiday hours that fell inside approved leave and were excluded. */
  publicHolidayHoursExcluded: number;
  approvedRequests: number;
  pendingRequests: number;
  upcomingLeave?: LeaveRequest;
}

/**
 * PTO balance for one employee in one calendar year. Public holidays are
 * excluded twice over: they are never inside `hours`, and any that fell in
 * an approved range are surfaced separately as `publicHolidayHoursExcluded`.
 */
export function ptoSummary(
  state: Pick<StoreState, 'leaves' | 'holidays' | 'countries' | 'tenants'>,
  employee: Pick<Employee, 'id' | 'countryCode' | 'weeklyHours'>,
  tenant: Tenant | undefined,
  year: number,
): PtoSummary {
  const daily = dailyHoursFor(employee);
  const entitlementDays = tenant?.ptoAnnualEntitlementDays ?? 20;
  const rows = (state.leaves ?? []).filter(
    (leave) => leave.employeeId === employee.id && leave.startDate.slice(0, 4) === String(year),
  );
  const approved = rows.filter((leave) => leave.status === 'approved');
  const pending = rows.filter((leave) => leave.status === 'pending');
  const sum = (list: LeaveRequest[], predicate: (leave: LeaveRequest) => boolean) =>
    Math.round(list.filter(predicate).reduce((total, leave) => total + leave.hours, 0) * 10) / 10;

  const approvedPtoHours = sum(approved, (leave) => isPtoType(leave.type));
  const pendingPtoHours = sum(pending, (leave) => isPtoType(leave.type));
  const entitlementHours = Math.round(entitlementDays * daily * 10) / 10;
  const today = toISO(new Date());
  const upcoming = rows
    .filter((leave) => leave.status !== 'cancelled' && leave.status !== 'rejected' && leave.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  return {
    employeeId: employee.id,
    entitlementHours,
    entitlementDays,
    approvedPtoHours,
    pendingPtoHours,
    remainingPtoHours: Math.max(0, Math.round((entitlementHours - approvedPtoHours) * 10) / 10),
    otherApprovedHours: sum(approved, (leave) => !isPtoType(leave.type)),
    publicHolidayHoursExcluded:
      Math.round(approved.reduce((total, leave) => total + (leave.publicHolidayHours ?? 0), 0) * 10) / 10,
    approvedRequests: approved.length,
    pendingRequests: pending.length,
    upcomingLeave: upcoming,
  };
}

export interface PtoTotals {
  employees: number;
  entitlementHours: number;
  approvedPtoHours: number;
  pendingPtoHours: number;
  remainingPtoHours: number;
  otherApprovedHours: number;
  publicHolidayHoursExcluded: number;
  pendingRequests: number;
}

/** PTO roll-up for a set of people, used by the leave tab and the dashboard. */
export function ptoTotals(
  state: Pick<StoreState, 'leaves' | 'holidays' | 'countries' | 'tenants' | 'employees'>,
  employees: Pick<Employee, 'id' | 'countryCode' | 'weeklyHours'>[],
  tenant: Tenant | undefined,
  year: number,
): PtoTotals {
  const summaries = employees.map((employee) => ptoSummary(state, employee, tenant, year));
  const sum = (pick: (summary: PtoSummary) => number) =>
    Math.round(summaries.reduce((total, summary) => total + pick(summary), 0) * 10) / 10;
  return {
    employees: employees.length,
    entitlementHours: sum((s) => s.entitlementHours),
    approvedPtoHours: sum((s) => s.approvedPtoHours),
    pendingPtoHours: sum((s) => s.pendingPtoHours),
    remainingPtoHours: sum((s) => s.remainingPtoHours),
    otherApprovedHours: sum((s) => s.otherApprovedHours),
    publicHolidayHoursExcluded: sum((s) => s.publicHolidayHoursExcluded),
    pendingRequests: summaries.reduce((total, summary) => total + summary.pendingRequests, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Approval chain                                                      */
/* ------------------------------------------------------------------ */
/** Everyone who may decide a request: the line manager upwards, then the department head and COO/CEO. */
export function approverIds(state: Pick<StoreState, 'employees' | 'departments'>, employeeId: string): string[] {
  const employee = state.employees.find((row) => row.id === employeeId);
  if (!employee) return [];
  const out: string[] = [];
  let current = employee.managerId ? state.employees.find((row) => row.id === employee.managerId) : undefined;
  const seen = new Set<string>([employee.id]);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    out.push(current.id);
    current = current.managerId ? state.employees.find((row) => row.id === current!.managerId) : undefined;
  }
  const department = state.departments.find((row) => row.id === employee.departmentId);
  if (department?.headId && !seen.has(department.headId)) out.push(department.headId);
  state.employees
    .filter((row) => row.role === 'ceo' || row.role === 'head_operations')
    .forEach((row) => {
      if (!seen.has(row.id)) out.push(row.id);
    });
  return out;
}

/** The immediate line manager — the person the request is addressed to. */
export function lineManager(state: Pick<StoreState, 'employees'>, employee: Employee): Employee | undefined {
  return employee.managerId ? state.employees.find((row) => row.id === employee.managerId) : undefined;
}

/**
 * Leadership can decide a request: the requester's line manager, anyone
 * above them, the department head, or a group executive. Never oneself.
 */
export function canDecideLeave(
  state: Pick<StoreState, 'employees' | 'departments'>,
  scope: Scope,
  leave: LeaveRequest,
): boolean {
  if (leave.employeeId === scope.user.id) return false;
  if (leave.status !== 'pending') return false;
  const chain = approverIds(state, leave.employeeId);
  if (chain.includes(scope.user.id)) return true;
  // A department head may decide for their own department even if the
  // reporting line is incomplete (new joiner, contractor, restructure).
  return (
    ROLE_RANK[scope.user.role] >= ROLE_RANK.department_head &&
    scope.visibleDepartmentIds.includes(leave.departmentId)
  );
}

/** Pending requests the signed-in person is expected to act on. */
export function approvalQueue(
  state: Pick<StoreState, 'employees' | 'departments' | 'leaves'>,
  scope: Scope,
): LeaveRequest[] {
  return (state.leaves ?? [])
    .filter(
      (leave) =>
        leave.status === 'pending' &&
        scope.visibleDepartmentIds.includes(leave.departmentId) &&
        canDecideLeave(state, scope, leave),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Who picks the work up while someone is on PTO. Order of preference:
 * the named delegate, then the first manager up the line who is not away,
 * then the department head, then the operations owner.
 */
export function nextResponsible(
  state: Pick<StoreState, 'employees' | 'departments' | 'leaves'>,
  employeeId: string,
  date: string,
): { employee: Employee; reason: string } | undefined {
  const employee = state.employees.find((row) => row.id === employeeId);
  if (!employee) return undefined;
  const isAway = (id: string) => Boolean(leaveOnDate(state, id, date));
  const department = state.departments.find((row) => row.id === employee.departmentId);

  const activeLeave = leaveOnDate(state, employeeId, date);
  const delegate = activeLeave?.delegateId ? state.employees.find((row) => row.id === activeLeave.delegateId) : undefined;
  if (delegate && delegate.id !== employeeId && !isAway(delegate.id)) {
    return { employee: delegate, reason: 'Named delegate' };
  }

  let manager = employee.managerId ? state.employees.find((row) => row.id === employee.managerId) : undefined;
  const seen = new Set<string>([employeeId]);
  while (manager && !seen.has(manager.id)) {
    seen.add(manager.id);
    if (!isAway(manager.id)) return { employee: manager, reason: `${ROLE_LABELS[manager.role]} · line manager` };
    const nextManagerId: string | null = manager.managerId;
    manager = nextManagerId ? state.employees.find((row) => row.id === nextManagerId) : undefined;
  }

  const head = department?.headId ? state.employees.find((row) => row.id === department.headId) : undefined;
  if (head && head.id !== employeeId && !isAway(head.id)) {
    return { employee: head, reason: 'Department head' };
  }
  const opsOwner = department?.opsOwnerId ? state.employees.find((row) => row.id === department.opsOwnerId) : undefined;
  if (opsOwner && !isAway(opsOwner.id)) return { employee: opsOwner, reason: 'Operations owner' };
  return undefined;
}

/** Peers in the same department, most senior first — the cover shortlist. */
export function coverOptions(state: Pick<StoreState, 'employees'>, employee: Employee): Employee[] {
  return state.employees
    .filter(
      (row) =>
        row.id !== employee.id &&
        row.departmentId === employee.departmentId &&
        row.status === 'active' &&
        !reportingTree([employee], employee.id).includes(row.id),
    )
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name));
}

/** Public holidays that fall inside a range, for the PH badge on the calendar. */
export function publicHolidaysInRange(
  state: Pick<StoreState, 'holidays'>,
  start: string,
  end: string,
  countryCodes: string[],
): Holiday[] {
  const allowed = new Set(countryCodes);
  return state.holidays
    .filter(
      (holiday) =>
        holiday.type !== 'weekly_off' && allowed.has(holiday.countryCode) && holiday.date >= start && holiday.date <= end,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function departmentOf(state: Pick<StoreState, 'departments'>, departmentId: string): Department | undefined {
  return state.departments.find((department) => department.id === departmentId);
}

/* ------------------------------------------------------------------ */
/* Capacity impact                                                     */
/* ------------------------------------------------------------------ */
/**
 * Approved PTO hours inside a window. Capacity is reduced by this amount,
 * so a person on approved leave is not scored as “under-utilised” — the
 * absence is reported in the PTO bucket instead of the workload matrix.
 */
export function approvedPtoHoursInRange(
  state: Pick<StoreState, 'leaves' | 'holidays' | 'countries'>,
  employee: Pick<Employee, 'id' | 'countryCode' | 'weeklyHours'>,
  start: string,
  end: string,
): number {
  return Math.round(
    (state.leaves ?? [])
      .filter((leave) => leave.employeeId === employee.id && leave.status === 'approved' && isPtoType(leave.type))
      .reduce((total, leave) => {
        const from = leave.startDate > start ? leave.startDate : start;
        const to = leave.endDate < end ? leave.endDate : end;
        if (from > to) return total;
        return total + leaveBreakdown(state, employee, from, to).hours;
      }, 0) * 10,
  ) / 10;
}

/** Working days of approved PTO inside a window — used for attendance. */
export function approvedPtoDaysInRange(
  state: Pick<StoreState, 'leaves' | 'holidays' | 'countries'>,
  employee: Pick<Employee, 'id' | 'countryCode' | 'weeklyHours'>,
  start: string,
  end: string,
): number {
  return (state.leaves ?? [])
    .filter((leave) => leave.employeeId === employee.id && leave.status === 'approved' && isPtoType(leave.type))
    .reduce((total, leave) => {
      const from = leave.startDate > start ? leave.startDate : start;
      const to = leave.endDate < end ? leave.endDate : end;
      if (from > to) return total;
      return total + leaveBreakdown(state, employee, from, to).workingDays;
    }, 0);
}
