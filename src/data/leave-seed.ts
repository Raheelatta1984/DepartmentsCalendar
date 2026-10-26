import { addDays, format } from 'date-fns';
import type {
  CountryConfig,
  Department,
  Employee,
  Holiday,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
} from '../types';
import { leaveBreakdown } from '../lib/leave';

/* ------------------------------------------------------------------ */
/* Deterministic leave / PTO seed                                      */
/*                                                                     */
/* A realistic spread of requests for both tenants:                     */
/*   • approved PTO in the past and in the near future                  */
/*   • pending requests waiting on a line manager                      */
/*   • one approved span that crosses an Australian public holiday, so  */
/*     the “PH excluded” rule is visible in the numbers                 */
/*   • sick leave and an unpaid request, reported outside the PTO       */
/*                                                                     */
/* Hours are always calculated with leaveBreakdown(), the same function */
/* the UI uses, so the seed can never disagree with the screen.         */
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

interface Spec {
  employee: Employee;
  startOffset: number;
  days: number;
  type: LeaveType;
  status: LeaveStatus;
  reason: string;
  /** Use the employee's line manager as the named delegate when available. */
  delegate?: 'manager' | 'peer';
}

const REASONS: Record<LeaveType, string[]> = {
  annual: [
    'Family holiday — booked flights.',
    'Annual break with family.',
    'Short break before the release freeze.',
    'Personal leave planned around the school holidays.',
  ],
  sick: ['Unwell — GP advised rest for the week.', 'Flu recovery.'],
  unpaid: ['Extended personal matters.', 'Unpaid time away for a family matter.'],
  parental: ['Parental leave following the birth of a child.'],
  study: ['Professional certification exam and study days.'],
  other: ['Approved absence agreed with the department head.'],
};

export function buildLeaveSeed(input: {
  employees: Employee[];
  departments: Department[];
  holidays: Holiday[];
  countries: CountryConfig[];
  today?: Date;
}): LeaveRequest[] {
  const rnd = mulberry32(20261026);
  const today = input.today ?? new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const iso = (d: Date) => format(d, 'yyyy-MM-dd');
  const state = { holidays: input.holidays, countries: input.countries };

  const itTeam = input.employees.filter((employee) => employee.departmentId === 'rdept-it');
  const cio = itTeam.find((employee) => employee.role === 'department_head');
  const itManagers = itTeam.filter((employee) => ['manager', 'supervisor', 'unit_head'].includes(employee.role));
  const itMembers = itTeam.filter((employee) => employee.role === 'employee');

  /* Meridian gets a handful of rows too, so tenant isolation is visible in
     the data rather than only in the code. */
  const meridian = input.employees.filter((employee) => employee.id.startsWith('emp-'));

  const specs: Spec[] = [];

  const push = (spec: Spec) => specs.push(spec);

  // --- Harbourline IT: past approved PTO -----------------------------
  itMembers.slice(0, 5).forEach((employee, index) => {
    const start = -(18 + index * 11);
    push({
      employee,
      startOffset: start,
      days: 3 + (index % 3),
      type: 'annual',
      status: 'approved',
      reason: REASONS.annual[index % REASONS.annual.length],
      delegate: 'manager',
    });
  });

  // --- Harbourline IT: a span that crosses a public holiday -----------
  const holidayCrossing = itMembers[5];
  if (holidayCrossing) {
    const upcomingHoliday = input.holidays
      .filter(
        (holiday) =>
          holiday.countryCode === holidayCrossing.countryCode &&
          holiday.type !== 'weekly_off' &&
          holiday.date >= iso(addDays(todayMid, 3)),
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const anchor = upcomingHoliday ? new Date(`${upcomingHoliday.date}T00:00:00`) : addDays(todayMid, 12);
    push({
      employee: holidayCrossing,
      startOffset: Math.round((anchor.getTime() - todayMid.getTime()) / 86_400_000) - 2,
      days: 8,
      type: 'annual',
      status: 'approved',
      reason: 'Two-week break — the public holiday inside the span is excluded from PTO.',
      delegate: 'manager',
    });
  }

  // --- Harbourline IT: upcoming approved PTO (the team plan) ---------
  itMembers.slice(6, 9).forEach((employee, index) => {
    push({
      employee,
      startOffset: 5 + index * 9,
      days: 2 + (index % 2) * 2,
      type: 'annual',
      status: 'approved',
      reason: REASONS.annual[(index + 1) % REASONS.annual.length],
      delegate: 'peer',
    });
  });

  // --- Harbourline IT: pending requests for the manager to decide ----
  itMembers.slice(9, 13).forEach((employee, index) => {
    push({
      employee,
      startOffset: 12 + index * 6,
      days: 2 + (index % 3),
      type: 'annual',
      status: 'pending',
      reason: REASONS.annual[index % REASONS.annual.length],
      delegate: 'peer',
    });
  });

  // --- A pending request from a manager, so the queue shows escalation
  if (itManagers[0]) {
    push({
      employee: itManagers[0],
      startOffset: 21,
      days: 3,
      type: 'annual',
      status: 'pending',
      reason: 'Planned leave around the quarter-end release.',
      delegate: 'peer',
    });
  }

  // --- Two members are on PTO right now, so the cover story is live ---
  itMembers.slice(0, 2).forEach((employee, index) => {
    push({
      employee,
      startOffset: -1 + index,
      days: 4 + index,
      type: 'annual',
      status: 'approved',
      reason: 'PTO in progress — cover and delegate agreed with the team.',
      delegate: 'peer',
    });
  });

  // --- PTO already taken earlier in the year (PTO balance history) ----
  if (cio) {
    push({
      employee: cio,
      startOffset: -13,
      days: 3,
      type: 'annual',
      status: 'approved',
      reason: 'Annual leave taken earlier in the year.',
      delegate: 'peer',
    });
  }

  // --- A pending request from the CIO herself (goes up the chain) -----
  if (cio) {
    push({
      employee: cio,
      startOffset: 34,
      days: 5,
      type: 'annual',
      status: 'pending',
      reason: 'Annual leave — cover agreed with the PMO manager.',
      delegate: 'peer',
    });
  }

  // --- Sick leave and one unpaid request -----------------------------
  if (itMembers[2]) {
    push({
      employee: itMembers[2],
      startOffset: -30,
      days: 2,
      type: 'sick',
      status: 'approved',
      reason: REASONS.sick[0],
    });
  }
  if (itMembers[3]) {
    push({
      employee: itMembers[3],
      startOffset: -8,
      days: 1,
      type: 'sick',
      status: 'approved',
      reason: REASONS.sick[1],
    });
  }
  if (itMembers[7]) {
    push({
      employee: itMembers[7],
      startOffset: -45,
      days: 4,
      type: 'unpaid',
      status: 'approved',
      reason: REASONS.unpaid[0],
    });
  }

  // --- Meridian: one approved PTO and one pending request -------------
  meridian.slice(0, 4).forEach((employee, index) => {
    push({
      employee,
      startOffset: index === 0 ? 3 : index === 1 ? -20 : 8 + index * 4,
      days: 2 + (index % 3),
      type: index === 2 ? 'sick' : 'annual',
      status: index === 1 ? 'pending' : 'approved',
      reason: REASONS[index === 2 ? 'sick' : 'annual'][index % 2],
      delegate: 'peer',
    });
  });

  const byDepartment = new Map<string, Employee[]>();
  input.employees.forEach((employee) => {
    const list = byDepartment.get(employee.departmentId) ?? [];
    list.push(employee);
    byDepartment.set(employee.departmentId, list);
  });

  return specs.map((spec, index) => {
    const startDate = iso(addDays(todayMid, spec.startOffset));
    const endDate = iso(addDays(todayMid, spec.startOffset + spec.days - 1));
    const breakdown = leaveBreakdown(state, spec.employee, startDate, endDate);
    const manager = spec.employee.managerId
      ? input.employees.find((employee) => employee.id === spec.employee.managerId)
      : undefined;
    const peers = (byDepartment.get(spec.employee.departmentId) ?? []).filter(
      (employee) => employee.id !== spec.employee.id && employee.role !== 'ceo',
    );
    const delegate =
      spec.status === 'approved' || spec.status === 'pending'
        ? spec.delegate === 'manager' && manager
          ? manager
          : peers[Math.floor(rnd() * Math.max(1, peers.length))]
        : undefined;
    const decided = spec.status === 'approved' ? manager ?? peers[0] : undefined;
    const submittedAt = addDays(todayMid, spec.startOffset - 10).toISOString();

    return {
      id: `lv-${String(index + 1).padStart(3, '0')}`,
      employeeId: spec.employee.id,
      departmentId: spec.employee.departmentId,
      entityId: spec.employee.entityId,
      startDate,
      endDate,
      hours: breakdown.hours,
      workingDays: breakdown.workingDays,
      publicHolidayDays: breakdown.publicHolidayDays,
      publicHolidayHours: breakdown.publicHolidayHours,
      type: spec.type,
      reason: spec.reason,
      status: spec.status,
      delegateId: delegate?.id ?? null,
      submittedAt,
      decidedById: decided?.id ?? null,
      decidedAt: spec.status === 'approved' ? submittedAt : null,
      decisionNote:
        spec.status === 'approved'
          ? 'Approved — cover confirmed and excluded public holidays noted.'
          : '',
      createdAt: submittedAt,
      updatedAt: submittedAt,
    } satisfies LeaveRequest;
  });
}
