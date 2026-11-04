import { format, parseISO } from 'date-fns';
import type { Department, PeriodKey, StoreState } from '../types';
import { departmentScore, workloadBand } from './analytics';
import { toISO } from './dates';
import { PROJECT_STAGE_LABELS } from './capitalisation';

/* ------------------------------------------------------------------ */
/* Department status pack — high-level reporting model                 */
/*                                                                     */
/* Builds one attachment-style report per department from live         */
/* workspace data: RAG status, feeling, workload, support need,        */
/* priority clusters, delivered outcomes, key milestones, risks and   */
/* governance commitments. Pure functions so the screen, the PPTX     */
/* export and the CSV export can never tell different stories.         */
/* ------------------------------------------------------------------ */

export type Rag = 'green' | 'amber' | 'red';

export interface DeptReportPriority { title: string; detail: string }
export interface DeptReportMilestone { date: string; label: string }
export interface DeptReportModel {
  departmentId: string;
  code: string;
  name: string;
  period: PeriodKey;
  periodLabel: string;
  updateDate: string;
  actionTrackerDate: string;
  rag: Rag;
  ragLabel: string;
  ragHint: string;
  score: number;
  feeling: number | null;
  feelingLabel: string;
  workloadLabel: string;
  workloadTone: 'danger' | 'warn' | 'good';
  utilization: number;
  supportNeed: string;
  priorities: DeptReportPriority[];
  outcomes: string[];
  milestones: DeptReportMilestone[];
  risks: string[];
  governance: string[];
  headcount: number;
  openActivities: number;
  overdueActivities: number;
  plannedHours: number;
  loggedHours: number;
}

export const GOVERNANCE_COMMITMENTS = [
  'Update and save the weekly check-in slide by 4:00 pm every Friday.',
  'Every Amber or Red item states the decision, resource or escalation needed, who is needed and by when.',
  'Maintain a complete linked project list and verify every status-pack link opens.',
  'RAG reflects confidence in hitting the target date, not effort spent.',
];

const RAG_META: Record<Rag, { label: string; hint: string }> = {
  green: { label: 'GREEN', hint: 'On track' },
  amber: { label: 'AMBER', hint: 'Slipping' },
  red: { label: 'RED', hint: 'Off track' },
};

const FEELING_LABELS: Record<number, string> = {
  1: '1 — Very low',
  2: '2 — Low',
  3: '3 — Neutral',
  4: '4 — Good',
  5: '5 — Great',
};

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const dayLabel = (iso: string) => format(parseISO(iso), 'd MMM');

/** Latest submitted feeling per department member, averaged. */
function departmentFeeling(state: StoreState, departmentId: string): number | null {
  const newest = new Map<string, { feeling: number; date: string }>();
  for (const entry of state.standups) {
    if (entry.departmentId !== departmentId || entry.status !== 'submitted' || entry.feeling == null) continue;
    const prev = newest.get(entry.employeeId);
    if (!prev || entry.date >= prev.date) newest.set(entry.employeeId, { feeling: entry.feeling, date: entry.date });
  }
  if (!newest.size) return null;
  const avg = [...newest.values()].reduce((sum, row) => sum + row.feeling, 0) / newest.size;
  return Math.round(avg * 10) / 10;
}

function openSupportNeed(state: StoreState, departmentId: string): string {
  const open = state.standups
    .filter((entry) => entry.departmentId === departmentId && entry.status === 'submitted')
    .flatMap((entry) => entry.supportRequests)
    .filter((request) => request.status !== 'resolved');
  if (!open.length) return 'None this week';
  const top = open[0];
  const count = open.length;
  return `${top.description || top.type.replace('_', ' ')}${count > 1 ? ` (+${count - 1} more)` : ''}`;
}

export function buildDepartmentReport(
  state: StoreState,
  department: Department,
  period: PeriodKey,
  anchor: Date,
): DeptReportModel {
  const score = departmentScore(state, department, period, anchor);
  const today = toISO(anchor);
  const tomorrow = toISO(new Date(anchor.getTime() + 86400000));

  const rag: Rag = score.score >= 85 ? 'green' : score.score >= 70 ? 'amber' : 'red';
  const feeling = departmentFeeling(state, department.id);
  const workload = workloadBand(score.utilization);

  const members = state.employees.filter((e) => e.departmentId === department.id && e.status !== 'inactive');

  // Priority clusters: open high/critical work first, then capital projects.
  const openActivities = state.activities
    .filter((a) => a.departmentId === department.id && a.status !== 'completed' && a.status !== 'cancelled' && a.endDate >= today)
    .sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || a.endDate.localeCompare(b.endDate));
  const projects = state.projects
    .filter((p) => p.departmentId === department.id && (p.status === 'active' || p.status === 'pipeline'))
    .sort((a, b) => b.budgetAUD - a.budgetAUD);
  const priorities: DeptReportPriority[] = [
    ...openActivities.slice(0, 4).map((a) => ({
      title: a.title,
      detail: `${a.priority} · ${state.employees.find((e) => e.id === a.assigneeId)?.name ?? 'Unassigned'} · due ${dayLabel(a.endDate)}`,
    })),
    ...projects.slice(0, 2).map((p) => ({
      title: `${p.code} · ${p.name}`,
      detail: `${PROJECT_STAGE_LABELS[p.stage]} · ${p.status} · budget ${p.budgetAUD.toLocaleString('en-AU')} AUD`,
    })),
  ].slice(0, 6);

  // Delivered outcomes: completed work this period + onboarded/closed projects.
  const periodActivities = state.activities.filter((a) => a.departmentId === department.id && a.status === 'completed');
  const completedProjects = state.projects.filter((p) => p.departmentId === department.id && p.status === 'completed');
  const outcomes = [
    ...periodActivities.slice(0, 4).map((a) => `${a.title} — completed`),
    ...completedProjects.slice(0, 2).map((p) => `${p.code} · ${p.name} — delivered & closed`),
  ].slice(0, 5);

  // Key milestones: PMO milestones on the department's projects, then project end dates.
  const projectIds = new Set(state.projects.filter((p) => p.departmentId === department.id).map((p) => p.id));
  const milestoneRows: DeptReportMilestone[] = [
    ...state.pmoMilestones
      .filter((m) => projectIds.has(m.projectId) && m.status !== 'done' && m.dueDate >= today)
      .map((m) => ({ date: m.dueDate, label: `${m.title} (${state.projects.find((p) => p.id === m.projectId)?.code ?? ''})` })),
    ...state.projects
      .filter((p) => p.departmentId === department.id && p.status !== 'completed' && p.status !== 'cancelled' && p.endDate >= today)
      .map((p) => ({ date: p.endDate, label: `${p.code} · ${p.name} — target end` })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);

  // Risks & dependencies: open escalations, open PMO risks, blocked work.
  const risks: string[] = [
    ...state.escalations
      .filter((e) => e.departmentId === department.id && e.status === 'open')
      .slice(0, 3)
      .map((e) => `Escalation open (score ${e.score}) — ${e.note || 'see Performance & escalation'}`),
    ...state.pmoRisks
      .filter((r) => r.status === 'open' && projectIds.has(r.projectId))
      .slice(0, 3)
      .map((r) => `${r.title} (${r.severity}) — ${state.projects.find((p) => p.id === r.projectId)?.code ?? ''}`),
    ...state.activities
      .filter((a) => a.departmentId === department.id && a.status === 'blocked')
      .slice(0, 2)
      .map((a) => `Blocked: ${a.title}`),
    ...(score.overdueActivities > 0 ? [`${score.overdueActivities} overdue item${score.overdueActivities === 1 ? '' : 's'} need recovery plans`] : []),
  ].slice(0, 8);

  return {
    departmentId: department.id,
    code: department.code,
    name: department.name,
    period,
    periodLabel: period === 'week' ? 'week commencing ' + dayLabel(toISO(anchor)) : format(anchor, 'MMMM yyyy'),
    updateDate: dayLabel(today) + ' ' + format(anchor, 'yyyy'),
    actionTrackerDate: dayLabel(tomorrow) + ' ' + format(new Date(anchor.getTime() + 86400000), 'yyyy'),
    rag,
    ragLabel: RAG_META[rag].label,
    ragHint: RAG_META[rag].hint,
    score: Math.round(score.score),
    feeling,
    feelingLabel: feeling == null ? '—' : FEELING_LABELS[Math.round(feeling)] ?? `${feeling}`,
    workloadLabel: workload.label,
    workloadTone: workload.tone,
    utilization: score.utilization,
    supportNeed: openSupportNeed(state, department.id),
    priorities,
    outcomes,
    milestones: milestoneRows,
    risks,
    governance: GOVERNANCE_COMMITMENTS,
    headcount: members.length,
    openActivities: score.openActivities,
    overdueActivities: score.overdueActivities,
    plannedHours: score.plannedHours,
    loggedHours: score.loggedHours,
  };
}

export function buildDepartmentReports(state: StoreState, departments: Department[], period: PeriodKey, anchor: Date): DeptReportModel[] {
  return departments.map((department) => buildDepartmentReport(state, department, period, anchor));
}
