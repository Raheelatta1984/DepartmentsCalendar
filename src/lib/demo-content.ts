import type { Entity, StoreState, Tenant } from '../types';
import { entitySubtreeIds, scopeEntityOptions } from './entities';
import { scopeStateToTenant } from './tenants';
import { buildDepartmentReport } from './dept-report';
import { departmentScore } from './analytics';
import { toISO } from './dates';

/* ------------------------------------------------------------------ */
/* App demo — Play-Store-style showcase model                          */
/*                                                                     */
/* One pure model per (tenant, entity) selection drives both the       */
/* on-screen demo and the exported PDF, so the two can never disagree.*/
/* ------------------------------------------------------------------ */

export type DemoScreenshotKind = 'dashboard' | 'calendar' | 'status' | 'pmo';

export interface DemoScreenshot {
  id: string;
  kind: DemoScreenshotKind;
  title: string;
  caption: string;
  points: string[];
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

  const screenshots: DemoScreenshot[] = [
    {
      id: 'dashboard',
      kind: 'dashboard',
      title: 'Command centre',
      caption: 'Live workload, score and queues for the whole entity on one screen.',
      points: [
        `${departments.length} departments · ${employees.length} people in scope`,
        `${thisWeek.length} activities scheduled this week`,
        deptReport ? `Top RAG: ${topDept.name} is ${deptReport.ragLabel.toLowerCase()} (score ${deptReport.score})` : 'RAG status per department',
      ],
    },
    {
      id: 'calendar',
      kind: 'calendar',
      title: 'Department calendar',
      caption: 'Collective and individual calendars with one-click sharing.',
      points: [
        `${activities.length} planned activities across the entity`,
        'Outlook & Google sync with read-only safety',
        'Holidays, leave and workload side by side',
      ],
    },
    {
      id: 'status',
      kind: 'status',
      title: 'Department status pack',
      caption: deptReport ? `${topDept.name} — ${deptReport.ragLabel} ${deptReport.ragHint.toLowerCase()}, feeling ${deptReport.feelingLabel}, workload ${deptReport.workloadLabel.toLowerCase()}.` : 'Weekly attachment-style status pack per department.',
      points: [
        'Executive RAG, feeling, workload and support need',
        ...(deptReport ? deptReport.milestones.slice(0, 2).map((m) => `Milestone ${m.date} — ${m.label}`) : []),
        'Export to PDF / PPTX / CSV for leadership',
      ],
    },
    {
      id: 'pmo',
      kind: 'pmo',
      title: 'PMO tool & DevOps delivery',
      caption: topProject ? `Live portfolio: ${projects.length} projects, incl. ${topProject.code} ${topProject.name}.` : 'Project intake to delivery on one backlog.',
      points: [
        'Project request form → PMO approval → project onboarded',
        `${state.workItems.length} backlog items across epics, features and tickets`,
        'Estimates, update logs, risks and stakeholders per project',
      ],
    },
  ];

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
