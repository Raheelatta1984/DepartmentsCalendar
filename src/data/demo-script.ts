import type { ViewKey } from '../types';

/* ------------------------------------------------------------------ */
/* Demo video script — one scene per portal screen.                    */
/*                                                                     */
/* `narration` is the AI voiceover (generated to public/demo-audio),  */
/* `caption` is the on-screen line shown while the scene plays. Both   */
/* stay tenant-neutral; the live tenant/entity name is overlaid by     */
/* the player from the current demo selection.                         */
/* ------------------------------------------------------------------ */

export interface DemoScene {
  view: ViewKey;
  caption: string;
  narration: string;
  /** Audio clip path under /public, e.g. /demo-audio/dashboard.mp3 */
  audio: string;
}

const SCENES: [ViewKey, string, string][] = [
  ['dashboard', 'Command centre', 'Welcome to your command centre. Every number on this screen is computed live from your own workspace: workload, scores, queues and the day board. One glance tells leadership exactly where the week stands.'],
  ['calendar', 'Department calendar', 'The department calendar brings every team’s week into one shared view. Collective and individual calendars, holiday-aware, and shareable with a single link.'],
  ['activities', 'Activity register', 'Every task, meeting and audit lives in one register. Each item carries an owner, priority, subtasks and acceptance criteria, so nothing depends on someone’s memory.'],
  ['roadmap', 'Roadmap timeline', 'The roadmap plots your whole year, month, week and day plan on one timeline. Walk the plan forward and spot collisions months before they happen.'],
  ['timesheet', 'Timesheets', 'People log effort once, and those hours roll up automatically to departments, projects and funding. No double entry, no Friday timesheet battle.'],
  ['standups', 'Daily stand-up', 'Ten minutes each morning: what moved, what is blocked, and who needs support. Feelings and blockers are recorded daily, so problems surface in days, not quarters.'],
  ['one-on-ones', 'One-on-ones', 'Managers get a private, structured check-in with every report. Notes stay between the two people, and AI summaries capture the actions automatically.'],
  ['leave', 'Leave & PTO', 'Leave requests are approved in one place, and approved time off reduces capacity automatically, so plans always reflect reality.'],
  ['delivery', 'DevOps delivery & PMO tool', 'The PMO tool runs project intake from request form to approval, then onboards each project onto the epic backlog. Milestones, risks, update logs and stakeholders stay on one project page.'],
  ['effort-reports', 'Effort reports', 'Where did the hours go? By backlog item, person, department, stream or funding class — planned versus logged, capex versus opex, reconciled in one report.'],
  ['projects', 'IT projects & capex', 'The capital and operational portfolio as managed projects: budget, stage, sponsor, project manager and capitalisation window on every project.'],
  ['capitalisation', 'Capitalisation pack', 'The monthly capitalisation pack is built from real logged hours, with eligible phases, rates and a reason code for every excluded hour. Audit-ready by default.'],
  ['performance', 'Performance & escalation', 'Departments and people are scored on the same formula every period. Open escalations carry owners, follow-ups and resolution notes — performance management with data, not opinions.'],
  ['integrations', 'Calendar sync', 'Outlook and Google calendars stay in sync automatically. The portal meets people where they already work, with read-only safety and tracked sync jobs.'],
  ['organisation', 'Organisation', 'One reporting hierarchy drives visibility, approvals and access. Re-parent a team with a drag, and every screen follows instantly.'],
  ['admin', 'Master setup', 'Master setup configures tenants, entities, departments, people and holidays in one place. Onboard a new company in the group in an afternoon, branded and isolated.'],
  ['whats-new', 'What’s new', 'Release notes render from the same log as the changelog and link straight to the screens they describe, so users always know what changed.'],
  ['dept-report', 'Department status pack', 'The weekly status pack per department: executive RAG, feeling, workload, milestones, risks and governance — exportable to PDF, PowerPoint or CSV for leadership.'],
  ['demo', 'App demo', 'And this tour itself: a tenant-aware demo where every screenshot and every number follows the company you select. Try your own tenant and entity.'],
  ['theme-studio', 'Theme Studio', 'Finally, Theme Studio gives every entity its own brand — colors, fonts, logo and portal header — across the whole workspace, including these exports.'],
];

export const DEMO_SCENES: DemoScene[] = SCENES.map(([view, caption, narration]) => ({
  view,
  caption,
  narration,
  audio: `/demo-audio/${view}.mp3`,
}));

export const DEMO_VIDEO_TITLE = 'Orbit workspace — product tour';
