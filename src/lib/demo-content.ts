import type { StoreState, Tenant, ViewKey } from '../types';
import { entitySubtreeIds, scopeEntityOptions } from './entities';
import { scopeStateToTenant } from './tenants';
import { buildDepartmentReport } from './dept-report';
import { departmentScore } from './analytics';
import { toISO } from './dates';
import { AI_GUIDE } from './ai-guide';

/* ------------------------------------------------------------------ */
/* App demo — Play-Store-style showcase model                          */
/*                                                                     */
/* One pure model per (tenant, entity) selection drives both the       */
/* on-screen demo and the exported PDF, so the two can never disagree.*/
/* Every navigation tab gets a detailed screenshot, including the      */
/* AI guide sticky note content, so the tour covers the whole app.    */
/* ------------------------------------------------------------------ */

export interface DemoScreenshot {
  id: string;
  /** The portal view this screenshot miniatures. */
  kind: ViewKey;
  title: string;
  caption: string;
  points: string[];
  /** AI guide sticky-note content shown inside the screenshot. */
  guide: { title: string; subtitle: string; tip: string; watch: string };
}

export interface DemoFeature {
  title: string;
  detail: string;
}

export interface DemoModel {
  tenantId: string;
  tenantName: string;
  entityId: string;
  entityName: string;
  appName: string;
  tagline: string;
  brandColor: string;
  logoUrl?: string;
  portalHeader?: string;
  rating: number;
  reviews: string;
  stats: { label: string; value: string }[];
  screenshots: DemoScreenshot[];
  features: DemoFeature[];
  highlights: string[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function buildDemoModel(fullState: StoreState, tenant: Tenant | undefined, entityId: string): DemoModel {
  const tenantId = tenant?.id ?? fullState.settings.activeTenantId;
  const state = scopeStateToTenant(fullState, tenantId);
  const entity = state.entities.find((e) => e.id === entityId) ?? state.entities.find((e) => e.tenantId === tenantId) ?? state.entities[0];
  const entityIds = entitySubtreeIds(state.entities, entity.id);
  const departments = state.departments.filter((d) => entityIds.has(d.entityId));
  const employees = state.employees.filter((e) => entityIds.has(e.entityId));
  const projects = state.projects.filter((p) => departments.some((d) => d.id === p.departmentId));
  const today = toISO(new Date());
  const weekAgo = toISO(new Date(Date.now() - 7 * 86400000));
  const activities = state.activities.filter((a) => departments.some((d) => d.id === a.departmentId));
  const thisWeek = activities.filter((a) => a.startDate >= weekAgo && a.startDate <= today);

  const brandColor = HEX.test(entity.brandColor ?? '') ? entity.brandColor! : '#2563eb';
  const brandName = entity.portalHeader || tenant?.name || state.settings.groupName;
  const appName = `Orbit · ${entity.name}`;

  // Deterministic rating derived from live delivery health, not a fixed string.
  const scores = departments.slice(0, 8).map((d) => departmentScore(state, d, 'week', new Date()).score);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 80;
  const rating = Math.max(4.2, Math.min(4.9, Math.round((3.9 + (avgScore / 100) * 1.0) * 10) / 10));

  const topDept = departments[0];
  const topProject = [...projects].sort((a, b) => b.budgetAUD - a.budgetAUD)[0];
  const deptReport = topDept ? buildDepartmentReport(state, topDept, 'week', new Date()) : null;
  const openEscalations = state.escalations.filter((e) => e.status === 'open' && departments.some((d) => d.id === e.departmentId)).length;
  const openLeaves = state.leaves.filter((l) => l.status === 'pending' && employees.some((e) => e.id === l.employeeId)).length;
  const openRequests = state.pmoRequests.filter((r) => r.status === 'submitted' || r.status === 'under_review').length;

  // One detailed screenshot per navigation tab — the full tour.
  const VIEW_POINTS: Partial<Record<ViewKey, (s: StoreState) => string[]>> = {
    dashboard: () => [
      `${departments.length} departments · ${employees.length} people in scope`,
      `${thisWeek.length} activities scheduled this week`,
      deptReport ? `Top RAG: ${topDept.name} is ${deptReport.ragLabel.toLowerCase()} (score ${deptReport.score})` : 'RAG status per department',
    ],
    calendar: () => [
      `${activities.length} planned activities across the entity`,
      'Collective & individual views with one-click sharing',
      'Outlook & Google sync with read-only safety',
    ],
    activities: () => [
      `${activities.filter((a) => a.status !== 'completed' && a.status !== 'cancelled').length} open activities in the register`,
      'Tasks, meetings, seminars, audits & site visits in one list',
      'Subtasks, delegation and acceptance criteria per item',
    ],
    roadmap: () => [
      'Year → month → week → day timeline of everything planned',
      `${projects.length} projects plotted on the roadmap`,
      'Drag the anchor to walk the plan forward or back',
    ],
    timesheet: () => [
      `${state.timeEntries.length} time entries logged across the entity`,
      'Log once — hours roll up to department, project and funding',
      'Approve or query entries with one click',
    ],
    standups: () => [
      'Daily check-ins: last day, progress, blockers, support callouts',
      `${state.standups.filter((s) => s.status === 'submitted').length} submitted stand-ups on record`,
      'Feeling score feeds the department status pack',
    ],
    'one-on-ones': () => [
      'Private manager check-ins with notes only the two of you see',
      `${state.oneOnOnes.length} sessions on record`,
      'AI-assisted summaries of the conversation',
    ],
    leave: () => [
      `${openLeaves} pending leave requests awaiting approval`,
      'Public holidays per country, weekly offs and company holidays',
      'PTO reduces capacity automatically in workload math',
    ],
    delivery: () => [
      `${state.workItems.length} backlog items — epic → feature → ticket`,
      `PMO tool on top: ${openRequests} request${openRequests === 1 ? '' : 's'} waiting in the review queue`,
      'Import Azure DevOps or CSV/JSON with preview-before-commit',
    ],
    'effort-reports': () => [
      'Hours by backlog item, resource, department, stream or funding',
      'Planned vs logged, capex vs opex — without double counting',
      'Export the grouped ledger for reconciliation',
    ],
    projects: () => [
      `${projects.length} projects in the portfolio`,
      topProject ? `Largest: ${topProject.code} · ${topProject.name} (${topProject.budgetAUD.toLocaleString('en-AU')} AUD)` : 'Capital and operational portfolios side by side',
      'Tasks, capitalisation windows and board approval per project',
    ],
    capitalisation: () => [
      'AASB 138 pack: eligible phases, rates and evidence per month',
      'Submit to the board, track approval status',
      'Every excluded hour has a reason code',
    ],
    performance: () => [
      `${openEscalations} open escalation${openEscalations === 1 ? '' : 's'} in scope`,
      'Scores per department and per person, with trends',
      'Escalation log with follow-ups and resolution notes',
    ],
    integrations: () => [
      'Connect Outlook & Google calendars per person',
      'Sync jobs tracked with status and last run',
      'Read-only safety: the portal never writes back blindly',
    ],
    organisation: () => [
      'Reporting hierarchy as a drag-and-drop tree',
      `${employees.length} people across ${departments.length} departments`,
      'Designations and titles managed in one place',
    ],
    admin: () => [
      'Master setup: tenants, entities, departments, people, holidays',
      'DevOps enablement per department, calendar scope per tenant',
      'Audit log of every change with actor and timestamp',
    ],
    'whats-new': () => [
      'Release notes rendered from the same log as the changelog',
      'Each entry links straight to the screen it describes',
      'Never a stale marketing page',
    ],
    'dept-report': () => [
      deptReport ? `${topDept.name}: ${deptReport.ragLabel} ${deptReport.ragHint.toLowerCase()} · feeling ${deptReport.feelingLabel} · ${deptReport.workloadLabel.toLowerCase()}` : 'Weekly attachment-style status pack per department',
      ...(deptReport ? deptReport.milestones.slice(0, 2).map((m) => `Milestone ${m.date} — ${m.label}`) : []),
      'All / multiple / single department · export PDF, PPTX (with Copilot prompt) or CSV',
    ],
    demo: () => [
      'This very tour — store-style, tenant-aware, PDF-exportable',
      'Every screenshot is live miniature UI of the real screens',
      'Pick any tenant & entity and the demo re-renders',
    ],
    'theme-studio': () => [
      'Brand color, fonts and portal header/footer per entity',
      'Logo upload with instant preview across the portal',
      'The demo and status pack inherit the same brand',
    ],
  };

  const VIEW_TITLES: Partial<Record<ViewKey, string>> = {
    dashboard: 'Command centre',
    calendar: 'Department calendar',
    activities: 'Activity register',
    roadmap: 'Roadmap timeline',
    timesheet: 'Timesheets',
    standups: 'Daily stand-up',
    'one-on-ones': 'One-on-ones',
    leave: 'Leave & PTO',
    delivery: 'DevOps delivery + PMO tool',
    'effort-reports': 'Effort reports',
    projects: 'IT projects & capex',
    capitalisation: 'Capitalisation pack',
    performance: 'Performance & escalation',
    integrations: 'Calendar sync',
    organisation: 'Organisation',
    admin: 'Master setup',
    'whats-new': 'What’s new',
    'dept-report': 'Department status pack',
    demo: 'App demo',
    'theme-studio': 'Theme Studio',
  };

  const NAV_VIEWS: ViewKey[] = [
    'dashboard', 'calendar', 'activities', 'roadmap', 'timesheet', 'standups', 'one-on-ones', 'leave',
    'delivery', 'effort-reports', 'projects', 'capitalisation', 'performance', 'integrations',
    'organisation', 'admin', 'whats-new', 'dept-report', 'demo', 'theme-studio',
  ];

  const screenshots: DemoScreenshot[] = NAV_VIEWS.map((view) => {
    const guide = AI_GUIDE[view] ?? AI_GUIDE.dashboard;
    return {
      id: view,
      kind: view,
      title: VIEW_TITLES[view] ?? guide.title,
      caption: guide.subtitle ?? guide.blurb.slice(0, 140),
      points: (VIEW_POINTS[view]?.(state) ?? [guide.blurb.slice(0, 120)]).slice(0, 4),
      guide: {
        title: guide.title,
        subtitle: guide.subtitle ?? '',
        tip: guide.tips[0] ?? guide.blurb.slice(0, 120),
        watch: guide.watch ?? '',
      },
    };
  });

  const features: DemoFeature[] = [
    { title: 'One calendar for every department', detail: 'Collective and individual calendars, shared with a link — Outlook & Google stay in sync.' },
    { title: 'Timesheets people actually complete', detail: 'Log and approve effort once; hours roll up to departments, projects and funding automatically.' },
    { title: 'Department status pack in one click', detail: 'RAG, feeling, workload, milestones and risks per department — exportable to PDF, PPTX or CSV.' },
    { title: 'PMO tool & DevOps delivery', detail: 'Requests, portfolio, portfolio Gantt, resources and the epic → feature → ticket backlog in one place.' },
    { title: 'Leave, stand-ups & one-on-ones', detail: 'PTO approvals, daily stand-ups with blockers and support callouts, and private manager check-ins.' },
    { title: 'Tenant-scoped by design', detail: 'Every company in the group gets its own isolated workspace — select tenant and entity, the demo re-renders live.' },
  ];

  return {
    tenantId,
    tenantName: tenant?.name ?? state.settings.groupName,
    entityId: entity.id,
    entityName: entity.name,
    appName,
    tagline: `${brandName}’s activity, workload, delivery and PMO workspace — one must-have app for every team.`,
    brandColor,
    logoUrl: entity.logoUrl,
    portalHeader: entity.portalHeader,
    rating,
    reviews: `${(employees.length * 3 + 40).toLocaleString('en-AU')} reviews`,
    stats: [
      { label: 'Departments', value: String(departments.length) },
      { label: 'People', value: String(employees.length) },
      { label: 'Projects', value: String(projects.length) },
      { label: 'Activities this week', value: String(thisWeek.length) },
    ],
    screenshots,
    features,
    highlights: [
      `Branded for ${entity.name} — logo, colors and header update with the entity selection`,
      `Scoped to ${tenant?.name ?? 'the group'}: only this tenant’s data ever appears`,
      'Export this demo as a PDF to share with the wider audience',
    ],
  };
}

export function demoEntityOptions(fullState: StoreState, tenantId: string) {
  const state = scopeStateToTenant(fullState, tenantId);
  const departments = state.departments;
  return scopeEntityOptions(state.entities, departments);
}
