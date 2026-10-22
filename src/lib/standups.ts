import type {
  Department,
  Employee,
  Role,
  StandupActionItem,
  StandupEntry,
  StoreState,
  SupportRequest,
} from '../types';
import { addDays } from 'date-fns';
import { pct, toISO } from './dates';
import { ROLE_RANK } from './permissions';

/* ------------------------------------------------------------------ */
/* Daily stand-up domain logic                                         */
/*                                                                     */
/* Pure helpers shared by the stand-up tab, the command-centre pulse   */
/* card, the AI guide and the smoke tests. Nothing here writes state.  */
/* ------------------------------------------------------------------ */

export function entryFor(entries: StandupEntry[], date: string, employeeId: string): StandupEntry | undefined {
  return entries.find((entry) => entry.date === date && entry.employeeId === employeeId);
}

/** Working days skip the person's country weekly-off and public holidays. */
export function isWorkingDay(
  state: Pick<StoreState, 'holidays' | 'countries'>,
  dateISO: string,
  countryCode: string,
): boolean {
  const cfg = state.countries.find((country) => country.code === countryCode);
  const day = new Date(`${dateISO}T00:00:00`).getDay();
  if (cfg?.weeklyOff.includes(day)) return false;
  return !state.holidays.some(
    (holiday) => holiday.countryCode === countryCode && holiday.date === dateISO && holiday.type !== 'weekly_off',
  );
}

/** Most recent working day strictly before `dateISO` for the person's country. */
export function previousWorkingDay(
  state: Pick<StoreState, 'holidays' | 'countries'>,
  dateISO: string,
  countryCode: string,
): string {
  let cursor = addDays(new Date(`${dateISO}T00:00:00`), -1);
  for (let guard = 0; guard < 14; guard += 1) {
    const iso = toISO(cursor);
    if (isWorkingDay(state, iso, countryCode)) return iso;
    cursor = addDays(cursor, -1);
  }
  return toISO(addDays(new Date(`${dateISO}T00:00:00`), -1));
}

export function openActions(entry: StandupEntry | undefined): StandupActionItem[] {
  return (entry?.actionItems ?? []).filter((action) => action.status === 'open');
}

export function openSupport(entry: StandupEntry | undefined): SupportRequest[] {
  return (entry?.supportRequests ?? []).filter((request) => request.status !== 'resolved');
}

export interface DepartmentStandupPulse {
  departmentId: string;
  date: string;
  memberCount: number;
  submittedCount: number;
  draftCount: number;
  pendingCount: number;
  submissionRate: number;
  blockerCount: number;
  openSupportCount: number;
  crossFunctionalCount: number;
  openActionCount: number;
  doneActionCount: number;
  entries: StandupEntry[];
}

export function buildDepartmentPulse(state: StoreState, departmentId: string, date: string): DepartmentStandupPulse {
  const members = state.employees.filter(
    (employee) => employee.departmentId === departmentId && employee.status !== 'inactive',
  );
  const entries = state.standups.filter(
    (entry) => entry.departmentId === departmentId && entry.date === date && members.some((m) => m.id === entry.employeeId),
  );
  const submitted = entries.filter((entry) => entry.status === 'submitted');
  const drafts = entries.filter((entry) => entry.status === 'draft');
  const blockers = submitted.filter((entry) => entry.blockers.trim().length > 0).length;
  const supportRequests = entries.flatMap((entry) => entry.supportRequests);
  const openSupportRequests = supportRequests.filter((request) => request.status !== 'resolved');
  const actions = entries.flatMap((entry) => entry.actionItems);

  return {
    departmentId,
    date,
    memberCount: members.length,
    submittedCount: submitted.length,
    draftCount: drafts.length,
    pendingCount: Math.max(0, members.length - entries.length),
    submissionRate: pct(submitted.length, members.length),
    blockerCount: blockers,
    openSupportCount: openSupportRequests.length,
    crossFunctionalCount: openSupportRequests.filter((request) => request.type === 'cross_functional').length,
    openActionCount: actions.filter((action) => action.status === 'open').length,
    doneActionCount: actions.filter((action) => action.status === 'done').length,
    entries,
  };
}

export function buildStandupPulses(state: StoreState, departmentIds: string[], date: string): DepartmentStandupPulse[] {
  return departmentIds.map((departmentId) => buildDepartmentPulse(state, departmentId, date));
}

/* ---- Top-to-bottom reporting layers -------------------------------- */

export interface StandupLayer {
  role: Role;
  label: string;
  members: { employee: Employee; entry: StandupEntry | undefined }[];
}

const LAYER_ORDER: { role: Role; label: string }[] = [
  { role: 'department_head', label: 'Department head' },
  { role: 'unit_head', label: 'Unit heads' },
  { role: 'manager', label: 'Managers' },
  { role: 'supervisor', label: 'Supervisors' },
  { role: 'employee', label: 'Team members' },
];

/**
 * The department board reads top to bottom: head first, then the
 * management layer, supervisors, and finally the employees. The CEO and
 * Head of Operations appear inside their own Executive Office layer.
 */
export function standupLayers(state: StoreState, department: Department, date: string): StandupLayer[] {
  const members = state.employees
    .filter((employee) => employee.departmentId === department.id && employee.status !== 'inactive')
    .sort((a, b) => {
      const rank = ROLE_RANK[b.role] - ROLE_RANK[a.role];
      return rank || a.name.localeCompare(b.name);
    });

  return LAYER_ORDER.map(({ role, label }) => ({
    role,
    label,
    members: members
      .filter((employee) => employee.role === role)
      .map((employee) => ({ employee, entry: entryFor(state.standups, date, employee.id) })),
  })).filter((layer) => layer.members.length > 0);
}
