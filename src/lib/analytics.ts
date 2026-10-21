import type {
  Activity,
  ActivityType,
  Department,
  DepartmentScore,
  Employee,
  EmployeeScore,
  Holiday,
  PeriodKey,
  StoreState,
  TimeEntry,
} from '../types';
import { clamp, fromISO, pct, periodRange, toISO, workingDays } from './dates';

const holidaysByCountry = (holidays: Holiday[]) => {
  const map = new Map<string, Holiday[]>();
  holidays.forEach((h) => {
    if (h.type === 'weekly_off') return;
    const list = map.get(h.countryCode) ?? [];
    list.push(h);
    map.set(h.countryCode, list);
  });
  return map;
};

export function capacityHoursFor(
  employee: Employee,
  start: string,
  end: string,
  holidays: Holiday[],
  countries: StoreState['countries'],
) {
  const cfg = countries.find((c) => c.code === employee.countryCode);
  const weeklyOff = cfg?.weeklyOff ?? [0, 6];
  const days = workingDays(start, end, weeklyOff, holidays, employee.countryCode);
  const daily = employee.weeklyHours / 5;
  return Math.round(days * daily * 10) / 10;
}

export const inRange = (activity: Activity, start: string, end: string) =>
  fromISO(activity.startDate) <= fromISO(end) && fromISO(activity.endDate) >= fromISO(start);

export function filterActivities(
  state: StoreState,
  opts: { departmentIds?: string[]; employeeIds?: string[]; start: string; end: string; type?: ActivityType | 'all' },
) {
  const deptSet = opts.departmentIds ? new Set(opts.departmentIds) : null;
  const empSet = opts.employeeIds ? new Set(opts.employeeIds) : null;
  return state.activities.filter((a) => {
    if (deptSet && !deptSet.has(a.departmentId)) return false;
    if (empSet && !empSet.has(a.assigneeId)) return false;
    if (opts.type && opts.type !== 'all' && a.type !== opts.type) return false;
    return inRange(a, opts.start, opts.end);
  });
}

export function filterEntries(
  state: StoreState,
  opts: { employeeIds?: string[]; departmentIds?: string[]; start: string; end: string },
) {
  const empSet = opts.employeeIds ? new Set(opts.employeeIds) : null;
  const deptSet = opts.departmentIds ? new Set(opts.departmentIds) : null;
  const empDept = new Map(state.employees.map((e) => [e.id, e.departmentId]));
  return state.timeEntries.filter((t) => {
    if (t.date < opts.start || t.date > opts.end) return false;
    if (empSet && !empSet.has(t.employeeId)) return false;
    if (deptSet && !deptSet.has(empDept.get(t.employeeId) ?? '')) return false;
    return true;
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Weighted delivery progress: completed items count 100, cancelled count 0. */
export function averageProgress(activities: Activity[]) {
  if (!activities.length) return 0;
  const total = activities.reduce(
    (sum, a) => sum + (a.status === 'completed' ? 100 : a.status === 'cancelled' ? 0 : a.progress),
    0,
  );
  return Math.round(total / activities.length);
}

export function employeeScore(
  state: StoreState,
  employee: Employee,
  start: string,
  end: string,
  holidays: Holiday[] = state.holidays,
): EmployeeScore {
  // For a period that is still running, compare effort against the capacity
  // that has actually elapsed — otherwise every Monday would look like 20%.
  const effectiveEnd = start <= toISO(new Date()) && end > toISO(new Date()) ? toISO(new Date()) : end;
  const capacity = capacityHoursFor(employee, start, effectiveEnd, holidays, state.countries);
  const activities = state.activities.filter((a) => a.assigneeId === employee.id && inRange(a, start, end));
  const entries = state.timeEntries.filter(
    (t) => t.employeeId === employee.id && t.date >= start && t.date <= end,
  );
  const logged = round1(entries.reduce((sum, e) => sum + e.hours, 0));
  const planned = round1(activities.reduce((sum, a) => sum + a.plannedHours, 0));
  // Only items whose deadline has actually passed count toward on-time delivery.
  const due = activities.filter((a) => a.endDate <= effectiveEnd);
  const completed = due.filter((a) => a.status === 'completed');
  const onTimeRate = due.length ? pct(completed.length, due.length) : averageProgress(activities);
  const completionRate = averageProgress(activities);
  const utilization = pct(logged, capacity);
  const utilScore = clamp(100 - Math.abs(utilization - 85) * 1.3);
  const score = Math.round(utilScore * 0.4 + onTimeRate * 0.35 + completionRate * 0.25);

  return {
    employeeId: employee.id,
    plannedHours: planned,
    loggedHours: logged,
    capacityHours: capacity,
    utilization,
    onTimeRate,
    completionRate,
    score,
  };
}

export function departmentScore(
  state: StoreState,
  department: Department,
  period: PeriodKey,
  anchor: Date,
): DepartmentScore {
  const { start, end } = periodRange(anchor, period, state.settings.weekStartsOn);
  const startISO = toISO(start);
  const endISO = toISO(end);
  const holidays = state.holidays;
  const members = state.employees.filter((e) => e.departmentId === department.id && e.status !== 'inactive');
  const memberIds = members.map((m) => m.id);

  const activities = state.activities.filter(
    (a) => a.departmentId === department.id && inRange(a, startISO, endISO),
  );
  const entries = state.timeEntries.filter(
    (t) => memberIds.includes(t.employeeId) && t.date >= startISO && t.date <= endISO,
  );

  const effectiveEnd = startISO <= toISO(new Date()) && endISO > toISO(new Date()) ? toISO(new Date()) : endISO;
  const capacity = round1(
    members.reduce((sum, m) => sum + capacityHoursFor(m, startISO, effectiveEnd, holidays, state.countries), 0),
  );
  const fullCapacity = round1(
    members.reduce((sum, m) => sum + capacityHoursFor(m, startISO, endISO, holidays, state.countries), 0),
  );
  const logged = round1(entries.reduce((sum, e) => sum + e.hours, 0));
  const billable = round1(entries.filter((e) => e.billable).reduce((sum, e) => sum + e.hours, 0));
  const planned = round1(activities.reduce((sum, a) => sum + a.plannedHours, 0));

  const due = activities.filter((a) => a.endDate <= effectiveEnd);
  const completed = due.filter((a) => a.status === 'completed');
  const overdue = activities.filter((a) => a.status !== 'completed' && a.endDate < toISO(new Date()));
  // When nothing was due inside the window (e.g. a quiet week) fall back to
  // progress so a department is not punished for a calendar artefact.
  const onTimeRate = due.length ? pct(completed.length, due.length) : averageProgress(activities);
  const completionRate = averageProgress(activities);
  const utilization = pct(logged, capacity);

  // Attendance: share of expected working days that have at least one logged entry.
  let expectedDays = 0;
  let loggedDays = 0;
  members.forEach((m) => {
    const cfg = state.countries.find((c) => c.code === m.countryCode);
    const days = workingDays(startISO, effectiveEnd, cfg?.weeklyOff ?? [0, 6], holidays, m.countryCode);
    expectedDays += days;
    const distinct = new Set(entries.filter((e) => e.employeeId === m.id).map((e) => e.date));
    loggedDays += Math.min(days, distinct.size);
  });
  const attendanceRate = pct(loggedDays, expectedDays);

  const utilScore = clamp(100 - Math.abs(utilization - 85) * 1.3);
  const score = Math.round(utilScore * 0.4 + onTimeRate * 0.35 + completionRate * 0.25);
  const workloadIndex = fullCapacity ? Math.round((planned / fullCapacity) * 100) : 0;

  const prev = periodRange(shiftAnchor(anchor, period, -1), period, state.settings.weekStartsOn);
  const prevActivities = state.activities.filter(
    (a) => a.departmentId === department.id && inRange(a, toISO(prev.start), toISO(prev.end)),
  );
  const prevEntries = state.timeEntries.filter(
    (t) => memberIds.includes(t.employeeId) && t.date >= toISO(prev.start) && t.date <= toISO(prev.end),
  );
  const prevCapacity = round1(
    members.reduce((sum, m) => sum + capacityHoursFor(m, toISO(prev.start), toISO(prev.end), holidays, state.countries), 0),
  );
  const prevLogged = round1(prevEntries.reduce((sum, e) => sum + e.hours, 0));
  const prevUtil = pct(prevLogged, prevCapacity);
  const trend = utilization - prevUtil;

  return {
    departmentId: department.id,
    period,
    periodStart: startISO,
    periodEnd: endISO,
    headcount: members.length,
    plannedHours: planned,
    loggedHours: logged,
    billableHours: billable,
    capacityHours: capacity,
    utilization,
    onTimeRate,
    completionRate,
    attendanceRate,
    workloadIndex,
    score,
    openActivities: activities.filter((a) => a.status !== 'completed' && a.status !== 'cancelled').length,
    overdueActivities: overdue.length,
    trend,
  };
}

export function shiftAnchor(anchor: Date, period: PeriodKey, direction: number) {
  const d = new Date(anchor);
  switch (period) {
    case 'day':
      d.setDate(d.getDate() + direction);
      break;
    case 'week':
      d.setDate(d.getDate() + direction * 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + direction);
      break;
    case 'quarter':
      d.setMonth(d.getMonth() + direction * 3);
      break;
    default:
      d.setFullYear(d.getFullYear() + direction);
  }
  return d;
}

export function groupScore(state: StoreState, departmentIds: string[], period: PeriodKey, anchor: Date) {
  const depts = state.departments.filter((d) => departmentIds.includes(d.id));
  const scores = depts.map((d) => departmentScore(state, d, period, anchor));
  if (!scores.length) {
    return {
      departments: scores,
      headcount: 0,
      capacityHours: 0,
      loggedHours: 0,
      plannedHours: 0,
      utilization: 0,
      onTimeRate: 0,
      completionRate: 0,
      attendanceRate: 0,
      score: 0,
      trend: 0,
      openActivities: 0,
      overdueActivities: 0,
      periodStart: toISO(periodRange(anchor, period).start),
      periodEnd: toISO(periodRange(anchor, period).end),
    };
  }
  const sum = (key: keyof DepartmentScore) => scores.reduce((a, s) => a + (s[key] as number), 0);
  const avg = (key: keyof DepartmentScore) => Math.round(sum(key) / scores.length);
  return {
    departments: scores,
    headcount: sum('headcount'),
    capacityHours: round1(sum('capacityHours')),
    loggedHours: round1(sum('loggedHours')),
    plannedHours: round1(sum('plannedHours')),
    utilization: pct(sum('loggedHours'), sum('capacityHours')),
    onTimeRate: avg('onTimeRate'),
    completionRate: avg('completionRate'),
    attendanceRate: avg('attendanceRate'),
    score: avg('score'),
    trend: Math.round(sum('trend') / scores.length),
    openActivities: sum('openActivities'),
    overdueActivities: sum('overdueActivities'),
    periodStart: scores[0].periodStart,
    periodEnd: scores[0].periodEnd,
  };
}

export function scoreSeries(
  state: StoreState,
  departmentIds: string[],
  period: PeriodKey,
  anchor: Date,
  buckets = 8,
) {
  return Array.from({ length: buckets }, (_, i) => {
    const point = shiftAnchor(anchor, period, i - (buckets - 1));
    const s = groupScore(state, departmentIds, period, point);
    return {
      label:
        period === 'month'
          ? point.toLocaleDateString('en-GB', { month: 'short' })
          : period === 'quarter'
            ? `Q${Math.floor(point.getMonth() / 3) + 1}`
            : period === 'year'
              ? String(point.getFullYear())
              : point.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      start: s.periodStart,
      score: s.score,
      utilization: s.utilization,
      onTime: s.onTimeRate,
      completion: s.completionRate,
    };
  });
}

export function typeDistribution(activities: Activity[]) {
  const map = new Map<ActivityType, { hours: number; count: number }>();
  activities.forEach((a) => {
    const cur = map.get(a.type) ?? { hours: 0, count: 0 };
    cur.hours += a.plannedHours;
    cur.count += 1;
    map.set(a.type, cur);
  });
  return Array.from(map.entries())
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.hours - a.hours);
}

export function hoursByDay(entries: TimeEntry[], start: string, end: string) {
  const map = new Map<string, number>();
  entries.forEach((e) => {
    if (e.date < start || e.date > end) return;
    map.set(e.date, (map.get(e.date) ?? 0) + e.hours);
  });
  return map;
}

export function workloadBand(utilization: number) {
  if (utilization > 115) return { label: 'Over capacity', tone: 'danger' as const };
  if (utilization > 95) return { label: 'At capacity', tone: 'warn' as const };
  if (utilization >= 65) return { label: 'Healthy', tone: 'good' as const };
  if (utilization >= 40) return { label: 'Under-loaded', tone: 'warn' as const };
  return { label: 'Idle / unlogged', tone: 'danger' as const };
}

export function scoreTone(score: number, threshold = 70) {
  if (score >= 85) return 'good' as const;
  if (score >= threshold) return 'warn' as const;
  return 'danger' as const;
}

export const TYPE_LABELS: Record<ActivityType, string> = {
  task: 'Task',
  follow_up: 'Follow-up',
  appointment: 'Appointment',
  meeting: 'Meeting',
  seminar: 'Seminar',
  session: 'Session',
  training: 'Training',
  audit: 'Audit',
  site_visit: 'Site visit',
};

export const TYPE_ICON_HINT: Record<ActivityType, string> = {
  task: 'check',
  follow_up: 'repeat',
  appointment: 'calendar',
  meeting: 'users',
  seminar: 'presentation',
  session: 'monitor',
  training: 'graduation',
  audit: 'shield',
  site_visit: 'map-pin',
};
