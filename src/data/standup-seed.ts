import { addDays } from 'date-fns';
import type {
  Activity,
  CountryConfig,
  Department,
  Employee,
  Holiday,
  StandupActionItem,
  StandupEntry,
  SupportRequest,
} from '../types';
import { isWorkingDay } from '../lib/standups';
import type { StoreState } from '../types';
import { toISO } from '../lib/dates';

/* ------------------------------------------------------------------ */
/* Deterministic daily stand-up seed                                   */
/*                                                                     */
/* Builds four working days of stand-up history for every active       */
/* member. Today is intentionally incomplete (some members still       */
/* pending) so the board has a live submission story. Content reuses   */
/* the member's own seeded activities wherever possible.               */
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

const LAST_DAY_TEMPLATES = [
  'Closed out {task} and updated the department tracker with the outcome.',
  'Ran the daily coordination for {task} and circulated the notes to stakeholders.',
  'Progressed {task}; evidence and working papers are filed in the shared workspace.',
  'Wrapped up {task} ahead of the review and handed the open points to the next shift.',
  'Completed the scheduled work for {task} and logged the effort against the activity.',
];

const PROGRESS_TEMPLATES = [
  '{task} is on plan at roughly {pct}% complete; remaining work is sized and scheduled.',
  '{task} continues on track — {pct}% done with no deviation from the baseline dates.',
  '{task} is at {pct}%; the next milestone review is booked with the sponsor.',
  'Overall delivery for {task} stands at {pct}% and remains inside the approved budget.',
];

const GENERIC_TASKS = [
  'the department checklist',
  'the weekly reporting pack',
  'the stakeholder follow-up list',
  'the process improvement backlog',
  'the compliance review actions',
];

const BLOCKER_TEMPLATES = [
  'Waiting on an internal approval before the next step can start.',
  'Access request for the reporting system is still pending with IT.',
  'Vendor confirmation overdue; delivery date may slip if not received today.',
  'Need clarification from the business owner on the revised scope.',
  'Dependency on another team’s deliverable is holding up final sign-off.',
];

const SUPPORT_TEMPLATES = [
  'Need a reviewer to sign off the updated documentation today.',
  'Requesting access to the shared finance drive to finish reconciliation.',
  'Need scheduling support to rebook the client walkthrough.',
  'Require a technical resource to help resolve the integration issue.',
  'Asking for procurement support to expedite the pending purchase order.',
];

const ACTION_TEMPLATES = [
  'Update the activity tracker and flag at-risk items',
  'Circulate meeting notes and decisions to stakeholders',
  'Follow up open items with the responsible owner',
  'Prepare inputs for tomorrow’s progress review',
  'Complete the review checklist and file evidence',
  'Chase pending approvals and record responses',
  'Close out yesterday’s snag list',
  'Draft the status update for the department head',
];

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function between(rnd: () => number, min: number, max: number) {
  return min + Math.floor(rnd() * (max - min + 1));
}

function fill(template: string, task: string, pctDone: number) {
  return template.replace('{task}', task).replace('{pct}', String(pctDone));
}

/** The five most recent working days (including today) for a person's country. */
function recentWorkingDays(
  state: Pick<StoreState, 'holidays' | 'countries'>,
  countryCode: string,
  today: Date,
  count: number,
): string[] {
  const days: string[] = [];
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let guard = 0; days.length < count && guard < 30; guard += 1) {
    const iso = toISO(cursor);
    if (isWorkingDay(state, iso, countryCode)) days.push(iso);
    cursor = addDays(cursor, -1);
  }
  return days.reverse();
}

export interface StandupSeedInput {
  employees: Employee[];
  departments: Department[];
  activities: Activity[];
  holidays: Holiday[];
  countries: CountryConfig[];
}

export function buildStandupSeed(input: StandupSeedInput, today = new Date(), historyDays = 4): StandupEntry[] {
  const rnd = mulberry32(20261022);
  const state: Pick<StoreState, 'holidays' | 'countries'> = {
    holidays: input.holidays,
    countries: input.countries,
  };
  const todayISO = toISO(today);
  const entries: StandupEntry[] = [];

  input.employees
    .filter((employee) => employee.status !== 'inactive')
    .forEach((employee, employeeIndex) => {
      const ownActivities = input.activities
        .filter((activity) => activity.assigneeId === employee.id)
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      const days = recentWorkingDays(state, employee.countryCode, today, historyDays);
      // A stable, realistic mix: ~78% of people have checked in today.
      const checkedInToday = employeeIndex % 9 !== 4;

      days.forEach((date, dayIndex) => {
        const isToday = date === todayISO;
        if (isToday && !checkedInToday) return;

        const activity = ownActivities[dayIndex % Math.max(1, ownActivities.length)];
        const task = activity?.title ?? pick(rnd, GENERIC_TASKS);
        const pctDone = activity
          ? Math.max(5, Math.min(95, activity.progress || between(rnd, 20, 80)))
          : between(rnd, 25, 85);

        const hasBlocker = rnd() < 0.18;
        const wantsSupport = rnd() < 0.14;
        const isCrossFunctional = wantsSupport && rnd() < 0.45;
        const otherDepartments = input.departments.filter((dept) => dept.id !== employee.departmentId);
        const targetDept = isCrossFunctional && otherDepartments.length ? pick(rnd, otherDepartments) : null;

        const actionCount = between(rnd, 1, 3);
        const actionItems: StandupActionItem[] = Array.from({ length: actionCount }, (_, i) => {
          const done = !isToday && (rnd() < 0.6 || i === 0);
          return {
            id: `sact-${employee.id}-${date}-${i + 1}`,
            title: pick(rnd, ACTION_TEMPLATES),
            ownerId: employee.id,
            dueDate: isToday ? date : done ? date : toISO(addDays(new Date(`${date}T00:00:00`), 1)),
            status: done ? 'done' : 'open',
          };
        });

        const supportRequests: SupportRequest[] = wantsSupport
          ? [
              {
                id: `ssup-${employee.id}-${date}`,
                description: pick(rnd, SUPPORT_TEMPLATES),
                type: isCrossFunctional ? 'cross_functional' : 'internal',
                targetDepartmentId: targetDept?.id ?? null,
                status: isToday ? 'open' : rnd() < 0.5 ? 'resolved' : 'acknowledged',
                createdAt: `${date}T08:${between(rnd, 30, 52)}:00.000Z`,
                resolvedAt: isToday ? null : `${date}T15:${between(rnd, 10, 55)}:00.000Z`,
              },
            ]
          : [];

        const submittedAt = `${date}T08:${between(rnd, 35, 55)}:00.000Z`;
        entries.push({
          id: `std-${employee.id}-${date}`,
          date,
          departmentId: employee.departmentId,
          employeeId: employee.id,
          lastDayUpdate: fill(pick(rnd, LAST_DAY_TEMPLATES), task, pctDone),
          progressUpdate: fill(pick(rnd, PROGRESS_TEMPLATES), task, pctDone),
          blockers: hasBlocker ? pick(rnd, BLOCKER_TEMPLATES) : '',
          actionItems,
          supportRequests,
          status: 'submitted',
          submittedAt,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        });
      });
    });

  return entries;
}
