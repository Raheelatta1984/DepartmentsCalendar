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

export interface DemoBrief {
  purpose: string;
  impact: string;
  outcome: string;
  examples: { industry: string; example: string }[];
}

export interface DemoScreenshot {
  id: string;
  /** The portal view this screenshot miniatures. */
  kind: ViewKey;
  title: string;
  caption: string;
  points: string[];
  /** AI guide sticky-note content shown inside the screenshot. */
  guide: { title: string; subtitle: string; tip: string; watch: string };
  /** AI-generated brief: purpose, impact, outcome + industry examples. */
  brief: DemoBrief;
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
      brief: buildBrief(view, {
        deptName: topDept?.name ?? 'the department',
        project: topProject ? `${topProject.code} ${topProject.name}` : null,
        people: employees.length,
        departments: departments.length,
        activities: thisWeek.length,
        projects: projects.length,
        entityName: entity.name,
      }),
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

/* ------------------------------------------------------------------ */
/* AI-generated brief per screen: purpose, impact, outcome + examples  */
/* ------------------------------------------------------------------ */

interface BriefContext {
  deptName: string;
  project: string | null;
  people: number;
  departments: number;
  activities: number;
  projects: number;
  entityName: string;
}

const BRIEF_TEXT: Partial<Record<ViewKey, (c: BriefContext) => { purpose: string; impact: string; outcome: string }>> = {
  dashboard: (c) => ({
    purpose: 'Give leadership one live command centre instead of a dozen spreadsheets.',
    impact: `Every number on screen is computed from the same snapshot — ${c.departments} departments and ${c.people} people for ${c.entityName} can no longer disagree about the week.`,
    outcome: `Decisions move from "what is the number?" to "what do we do about it" — e.g. ${c.deptName} spotting slipping RAG before the board asks.`,
  }),
  calendar: (c) => ({
    purpose: 'Make the whole department’s week visible and shareable in one calendar.',
    impact: `${c.activities} activities this week become one collective view; double-booking and ghost meetings disappear.`,
    outcome: 'Teams plan around real commitments; clients and sites see a professional, coordinated schedule.',
  }),
  activities: () => ({
    purpose: 'Turn every task, meeting and audit into a tracked register with owners and criteria.',
    impact: 'Nothing lives only in someone’s head — each item carries a status, priority, subtasks and acceptance criteria.',
    outcome: 'Delivery becomes auditable: completion rates and overdue items are measurable, not anecdotal.',
  }),
  roadmap: () => ({
    purpose: 'Show the year → month → week → day plan so strategy and daily work connect.',
    impact: `${0} placeholder`,
    outcome: '',
  }),
  timesheet: () => ({
    purpose: 'Capture effort once and let it roll up everywhere it matters.',
    impact: 'Hours log to a single activity and automatically feed department scores, project cost and funding reports.',
    outcome: 'Timesheet completion stops being a Friday battle; finance and PMO read the same numbers.',
  }),
  standups: () => ({
    purpose: 'Run a 10-minute daily check-in that surfaces blockers before they cost days.',
    impact: 'Feeling, blockers and support callouts are recorded daily — patterns appear within a week, not a quarter.',
    outcome: 'Support requests get an owner and a status; morale issues surface while they are still small.',
  }),
  'one-on-ones': () => ({
    purpose: 'Give managers a private, structured check-in with every report.',
    impact: 'Notes stay between the two people involved; AI summaries capture actions without manual minutes.',
    outcome: 'Retention and performance conversations happen continuously instead of only at review season.',
  }),
  leave: () => ({
    purpose: 'Approve PTO in one place and keep capacity math honest.',
    impact: 'Approved leave automatically reduces capacity in workload calculations — no more over-promising.',
    outcome: 'Planning reflects reality; holiday clashes are visible before they break a deadline.',
  }),
  delivery: (c) => ({
    purpose: 'Connect the DevOps backlog to the workday and the PMO tool to the portfolio.',
    impact: `${c.projects} projects and the epic → feature → ticket hierarchy stay in one place; PMO requests flow request → approval → project → epic.`,
    outcome: `Leadership sees delivery status weekly without chasing updates — ${c.project ?? 'each project'} has milestones, risks and an update log.`,
  }),
  'effort-reports': () => ({
    purpose: 'Answer "where did the hours go?" by backlog item, person, department, stream or funding class.',
    impact: 'Planned vs logged is reconciled in one report; capex and opex are never mixed.',
    outcome: 'Client billing, board packs and capitalisation all read from the same ledger.',
  }),
  projects: (c) => ({
    purpose: 'Run the capital and operational portfolio as managed projects, not wish lists.',
    impact: `${c.projects} projects each carry budget, stage, sponsor, PM and capitalisation window.`,
    outcome: `Board reporting is a filter, not a fire drill — ${c.project ?? 'the largest project'} shows budget, stage and progress together.`,
  }),
  capitalisation: () => ({
    purpose: 'Produce a defensible AASB 138 capitalisation pack every month.',
    impact: 'Eligible phases, rates and evidence are attached to every hour; exclusions carry reason codes.',
    outcome: 'Audit season becomes a export-and-review exercise instead of a reconstruction.',
  }),
  performance: () => ({
    purpose: 'Score departments and people on the same formula, and escalate early.',
    impact: 'Utilisation, on-time rate and workload index are computed per period; open escalations carry owners and follow-ups.',
    outcome: 'Problem teams are coached with data, and the escalation log shows what was done about it.',
  }),
  integrations: () => ({
    purpose: 'Keep Outlook and Google calendars in sync without double entry.',
    impact: 'Every activity can push to the calendars people already live in; sync jobs are tracked and visible.',
    outcome: 'Adoption is high because the tool meets people where they already are.',
  }),
  organisation: () => ({
    purpose: 'Maintain one reporting hierarchy that every screen respects.',
    impact: `${' '}People, visibility and approvals all follow the org chart — drag to re-parent, no re-keying.`,
    outcome: 'New joiners and restructures take minutes, and access rules follow automatically.',
  }),
  admin: () => ({
    purpose: 'Configure tenants, entities, departments, people and holidays in one master setup.',
    impact: 'DevOps enablement, calendar scope and holidays are switches — the demo you are reading re-renders per tenant from exactly these settings.',
    outcome: 'A new company in the group is onboarded in an afternoon, branded and isolated.',
  }),
  'whats-new': () => ({
    purpose: 'Keep every user informed with release notes that link to the real screens.',
    impact: 'The screen and the changelog render from one source, so they can never disagree.',
    outcome: 'New features are discovered in-app instead of via hallway announcements.',
  }),
  'dept-report': (c) => ({
    purpose: 'Produce the weekly one-page status pack per department in seconds.',
    impact: `RAG, feeling, workload, milestones and risks for ${c.deptName} are computed live — and exportable to PDF, PPTX (with a Copilot reformat prompt) or CSV.`,
    outcome: 'Leadership meetings start from a shared, current document instead of a stitched-together deck.',
  }),
  demo: () => ({
    purpose: 'Show any prospect or new tenant exactly what their company gets — branded and live.',
    impact: 'This very tour re-renders per tenant and entity: icon, colors, stats and every screenshot follow the selection.',
    outcome: 'Onboarding conversations become "here is your workspace" instead of "imagine a workspace".',
  }),
  'theme-studio': (c) => ({
    purpose: `Give ${c.entityName} its own identity across the whole portal.`,
    impact: 'Brand color, fonts, logo and header/footer apply everywhere — including this demo and the status-pack exports.',
    outcome: 'Every company in the group feels the portal is theirs, not a generic tool.',
  }),
};

// Fill the roadmap template properly (kept out of the literal above for readability).
BRIEF_TEXT.roadmap = (c) => ({
  purpose: 'Show the year → month → week → day plan so strategy and daily work connect.',
  impact: `${c.projects} projects and ${c.activities} activities this week are plotted on one timeline; the anchor walks the plan forward and back.`,
  outcome: 'Stakeholders see the shape of the year at a glance and spot collisions months ahead.',
});

const INDUSTRY_EXAMPLES: { industry: string; example: (c: BriefContext) => string }[] = [
  { industry: 'Retail', example: (c) => `A store-rollout programme tracks ${c.projects} projects on the roadmap and posts the weekly status pack to the COO every Friday.` },
  { industry: 'Construction & contracting', example: () => 'Site mobilisations and handover milestones live on the shared calendar; PTO reduces crew capacity automatically before rostering.' },
  { industry: 'Facilities management', example: () => 'Contract SLAs become activities with owners; effort reports feed client billing without re-keying timesheets.' },
  { industry: 'IT & digital services', example: (c) => `The PMO tool runs intake → delivery for ${c.projects} projects, with the epic backlog imported from Azure DevOps.` },
  { industry: 'Advisory & consulting', example: () => 'Consultants log effort once; capitalisation packs and client reports read from the same ledger at month-end.' },
];

function buildBrief(view: ViewKey, ctx: BriefContext): DemoBrief {
  const t = BRIEF_TEXT[view]?.(ctx) ?? {
    purpose: 'One more screen in the workspace, computed live from the same data.',
    impact: 'Everything on screen comes from the shared tenant snapshot.',
    outcome: 'Less chasing, more deciding.',
  };
  return {
    purpose: t.purpose,
    impact: t.impact,
    outcome: t.outcome,
    examples: INDUSTRY_EXAMPLES.map((e) => ({ industry: e.industry, example: e.example(ctx) })),
  };
}
