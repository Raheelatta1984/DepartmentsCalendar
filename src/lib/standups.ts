import type {
  Department,
  Employee,
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
  key: string;
  label: string;
  members: { employee: Employee; entry: StandupEntry | undefined }[];
}

const LAYERS = [
  ['executive', 'Executive leadership'],
  ['heads', 'Department Heads'],
  ['pmo', 'PMO'],
  ['baqa', 'BA & QA Leads'],
  ['ba', 'BA Leads'],
  ['qa', 'QA Leads'],
  ['leads', 'Department & stream leads'],
  ['members', 'Team members'],
] as const;

/** Classify by real business designation, not the legacy access-role name. */
function layerFor(employee: Employee, department: Department): string {
  const title = (employee.jobTitle ?? '').toLowerCase();
  if (employee.role === 'ceo' || employee.role === 'head_operations') return 'executive';
  if (employee.id === department.headId || employee.role === 'department_head' || /\b(head|cio|cto)\b/.test(title)) return 'heads';
  const lead = /\blead\b/.test(title);
  const ba = /\bba\b|business analy/.test(title);
  const qa = /\bqa\b|quality assur/.test(title);
  if (lead && ba && qa) return 'baqa';
  if (lead && ba) return 'ba';
  if (lead && qa) return 'qa';
  if (/\bpmo\b/.test(title)) return 'pmo';
  if (lead || ['unit_head', 'manager', 'supervisor'].includes(employee.role)) return 'leads';
  return 'members';
}

/** Caller passes a viewer-filtered state; each visible active person appears once. */
export function standupLayers(state: StoreState, department: Department, date: string): StandupLayer[] {
  const members = state.employees
    .filter((employee) => employee.departmentId === department.id && employee.status !== 'inactive')
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name));
  return LAYERS.map(([key, label]) => ({
    key, label,
    members: members.filter((employee) => layerFor(employee, department) === key)
      .map((employee) => ({ employee, entry: entryFor(state.standups, date, employee.id) })),
  })).filter((layer) => layer.members.length > 0);
}
