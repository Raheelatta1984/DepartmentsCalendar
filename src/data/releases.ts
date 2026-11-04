import type { ViewKey } from '../types';

/* ------------------------------------------------------------------ */
/* Release log — the single source of truth                            */
/*                                                                     */
/* The What’s new tab renders this file directly, and                  */
/* `npm run changelog` generates docs/CHANGELOG.md from it. Adding a   */
/* release means editing this array only: the screen and the           */
/* repository changelog can never disagree.                            */
/*                                                                     */
/* Rules enforced by scripts/changelog.mjs (and therefore by CI):      */
/*   · newest first, by ISO `date`                                     */
/*   · titles are unique                                               */
/*   · labels, tones, icons and linked views come from the lists below */
/*   · every entry has a description and at least one bullet           */
/* ------------------------------------------------------------------ */

export const RELEASE_LABELS = ['Just added', 'New', 'Recent', 'Earlier'] as const;
export type ReleaseLabel = (typeof RELEASE_LABELS)[number];

export const RELEASE_TONES = ['brand', 'info', 'neutral', 'good'] as const;
export type ReleaseTone = (typeof RELEASE_TONES)[number];

/* Icon keys stay as plain strings so this module has no React import and
   can be read by the changelog generator under vite-node too. */
export const RELEASE_ICONS = [
  'lock',
  'building',
  'branch',
  'package',
  'shield',
  'zap',
  'server',
  'plane',
  'refresh',
  'standup',
  'layout',
  'sparkles',
  'wand',
  'palette',
  'news',
  'calendar',
  'cloud',
  'database',
  'lifebuoy',
] as const;
export type ReleaseIcon = (typeof RELEASE_ICONS)[number];

export const RELEASE_LINK_VIEWS = [
  'calendar',
  'delivery',
  'effort-reports',
  'admin',
  'organisation',
  'theme-studio',
  'capitalisation',
  'timesheet',
  'leave',
  'standups',
  'one-on-ones',
  'performance',
  'dept-report',
  'demo',
] as const satisfies readonly ViewKey[];
export type ReleaseLinkView = (typeof RELEASE_LINK_VIEWS)[number];

export type Release = {
  title: string;
  /** ISO date used for ordering and the generated changelog. */
  date: string;
  /** Display form shown in the portal. */
  released: string;
  label: ReleaseLabel;
  tone: ReleaseTone;
  icon: ReleaseIcon;
  description: string;
  bullets: string[];
  /** Where the reader can go to see the change for themselves. */
  link?: { view: ReleaseLinkView; label: string };
};

export const RELEASES: Release[] = [
  {
    title: 'App demo: a Play-Store-style, tenant-aware product tour exportable to PDF',
    date: '2026-11-04',
    released: '4 November 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'sparkles',
    description:
      'A new App demo screen presents the portal like a mobile-app store listing — branded app icon, name, star rating and review count, live stats strip, 20" monitor-framed screenshots and a "why every company needs it" feature grid. Tenant and entity selectors re-render the entire demo for the chosen company: brand colors and logo, department/people/project/activity counts, and every screenshot — which is now the real portal screen itself, rendered live inside an auto-adjusting 20" 16:9 monitor frame, pixel-identical to what users see in the app, complete with the yellow AI guide sticky note. A built-in demo video plays a cinematic tour of all screens with AI voiceover narration. The whole demo exports to a shareable PDF (branded cover, stats, one page per screen, features page) so the wider audience can see exactly what each company gets.',
    bullets: [
      'New App demo screen styled like a Google Play listing: icon, rating, stats, screenshots, feature grid',
      'Screenshots are the real screens: each of the 20 tabs is rendered by its actual page component inside an auto-adjusting 20" 16:9 monitor frame — one full-width block per screen, pixel-identical to the app',
      'All 20 portal tabs are covered: every screen is the live page with the real yellow AI guide sticky note (title, tip, watch) rendered on top',
      'Watch demo video: a cinematic in-app player that auto-advances through all 20 real screens with per-scene captions and human-sounding AI voiceover narration, branded by the selected tenant',
      'Each screenshot ships with an AI-generated brief — purpose, impact, outcome and real examples by industry (retail, construction, facilities, IT services, advisory)',
      'Tenant + entity selection drives everything — brand, logo, colors and all numbers/screenshots follow the selection and stay tenant-scoped',
      'Export demo PDF: branded cover, one page per screen (sticky note + AI brief drawn in) and a features page — ready to share with the wider audience',
    ],
    link: { view: 'demo', label: 'Open the app demo' },
  },
  {
    title: 'Department status pack with department filters and real PDF / PPTX+AI-prompt / CSV export',
    date: '2026-11-04',
    released: '4 November 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'layout',
    description:
      'A new Department status pack screen renders the weekly attachment-style overview for any department: executive RAG with score, team feeling, workload band, support need, immediate priority clusters, delivered outcomes, key milestones, critical risks & dependencies and governance commitments — all derived live from the workspace. A dedicated selection section lets you pick all, multiple or a single department (plus a week/month period). The pack exports to a real PDF (jsPDF, one colored A4 page per department in the same layout as the screen — not a page print), to PPTX, and to CSV. The PPTX export also copies an AI prompt to the clipboard and embeds it on a Copilot slide: open the file, go to Copilot, paste and run, and every slide is reformatted into the status-pack design with the RAG colors.',
    bullets: [
      'New Department status pack screen with an attachment-style report card per department (RAG, feeling, workload, support need, priorities, outcomes, milestones, risks, governance)',
      'Separate department selection section: all / multiple / single department chips, plus week or month period',
      'Real PDF export (jsPDF): one colored A4-landscape page per department, same layout and colors as the on-screen section',
      'PPTX export (one slide per department) that automatically copies a Copilot AI prompt to the clipboard and embeds it on the deck’s first slide — paste into Copilot in PowerPoint to reformat the whole file',
      'CSV export for downstream tooling; report content is computed from live data so the screen and every export always agree',
    ],
    link: { view: 'dept-report', label: 'Open the status pack' },
  },
  {
    title: 'PMO tool on top of the DevOps delivery tab for the IT department',
    date: '2026-11-04',
    released: '4 November 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'branch',
    description:
      'The IT department now has a PMO section at the top of the DevOps delivery tab — the PM Planner flow made real in the portal. Business requests are raised on a project request form and wait in the PMO / TO review queue; approving one onboards a project (with a PM allocated) and drops a new epic on top of the backlog. Each project has a landing page with an informative overview (RACI status, value raised, budget), a weekly update log, a delivery tab (milestones, risks & issues, supporting decisions) and a stakeholder registry fed from Active Directory or vendor entry. A Portfolio tab gives leadership the counts, filters, stage distribution, PM allocation and a 12-month Gantt, and a Resources tab shows allocations and capacity per person. PMO members and project resources can update work status and estimate hours on projects and their subtasks directly from the project.',
    bullets: [
      'PMO tool pinned to the top of the DevOps delivery tab under the IT department, with Requests, Projects, Portfolio and Resources tabs',
      'Project request form → PMO / TO approval queue → approval onboards the project and places a new epic on top of the backlog',
      'Per-project landing page: overview, weekly update log, delivery (milestones, risks, decisions) and stakeholder registry (Active Directory or vendors)',
      'Portfolio leadership view: project counts, filters, stage distribution, allocation by PM and a 12-month portfolio Gantt',
      'Resources tab with per-person allocations, estimates and capacity; PMO and resources can edit work and estimate hours on projects and subtasks',
    ],
    link: { view: 'delivery', label: 'Open DevOps delivery' },
  },
  {
    title: 'A Disabled status for tenants, with one-click Enable and Restore',
    date: '2026-11-03',
    released: '3 November 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'shield',
    description:
      'Disabling a tenant no longer means it disappears: tenant status now has three values — Active, Disabled and Archived. A Disabled tenant stays in the workspace and visible in Master setup → Tenants with a disabled badge and a one-click Enable button, so it can never be lost or become unrecoverable; its data is kept and it returns to selection the moment it is enabled. Archived tenants stay visible too, with a Restore button. The tenant Edit dialog offers all three statuses with an explanation of each, and saving Master settings no longer overwrites device-local preferences such as the active tenant.',
    bullets: [
      'Three tenant statuses: Active, Disabled and Archived',
      'A Disabled tenant stays visible in Master setup → Tenants with a disabled badge and an Enable button — its data is never deleted',
      'An Archived tenant stays visible with a Restore button, so a tenant can never be lost',
      'The tenant Edit dialog offers Active / Disabled / Archived with an explanation of each',
      'Saving Master settings only sends the fields you actually changed — device-local preferences like the active tenant are never overwritten',
    ],
    link: { view: 'admin', label: 'Open master setup' },
  },
  {
    title: 'Master setup switch for the Harris Farm Markets group and entity',
    date: '2026-11-03',
    released: '3 November 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'building',
    description:
      'Master setup now carries a master switch for the Harris Farm Markets group and entity. Off by default, the tenant — its group → company entities, IT department, people, delivery streams and DevOps backlog — stays hidden from tenant selection and every operational screen. When the tenant is missing from Master setup → Tenants, a notice explains the switch and offers a one-click Enable button, so the tenant reappears in the list immediately; turning the switch off again hides it without deleting any data. The earlier temporary block on Harris Farm tenant selection has been replaced by this explicit, reversible switch.',
    bullets: [
      'New Master setup → Group settings switch: Enable Harris Farm Markets group and entity',
      'Off by default — the tenant is hidden from selection and every screen until the switch is turned on',
      'A hidden-tenant notice in Master setup → Tenants explains why the tenant is missing and enables it with one click',
      'Turning it on restores the full tenant: group → company entities, IT department, co-CEO portfolios, people, streams, work items and activities',
      'Hiding the tenant never deletes its data — the rows are kept and reappear when the switch is re-enabled',
      'The previous temporary block on Harris Farm tenant selection has been removed in favour of this explicit switch',
    ],
    link: { view: 'admin', label: 'Open master setup' },
  },
  {
    title: 'Reporting-line check-ins, escalations and one-on-ones',
    date: '2026-11-01',
    released: '1 November 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'standup',
    description: 'Stand-ups show your own check-in, your immediate reporting lead and your downstream reports, without displaying higher personal stand-ups. Department heads and leads can publish separate cascade updates. Every tab now offers time logging and editing, including directly in an activity. Staff can raise an escalation only to their reporting lead; it creates an urgent follow-up activity and supports notes and actions along the reporting chain. A configurable coloured 1–5 feeling scale and structured one-on-ones support wellbeing and career conversations.',
    bullets: [
      'Reporting-line stand-up board: self, immediate lead and downstream reports; no higher personal stand-ups or peer leakage',
      'Separate cascade messages from department heads and leads, and business-designation layers for PMO, BA and QA',
      'Log or edit actual hours from every tab and inside activity setup, alongside planned hours',
      'Escalations route to the reporter’s immediate lead and automatically create a critical follow-up activity',
      'Reporting-chain follow-up threads support notes and optional urgent actions from leadership down to staff',
      'Tenant-configurable 1–5 feeling labels and colour codes in Master setup',
      'One-on-one discussions cover balance, support, feelings, escalation, feedback and career tasks and advice',
      'On request, a configured AI provider generates a summary for the lead and their leadership chain; drafts are not shown upward in the portal',
      'The shared pilot snapshot limit is 4 MB; individual authentication is still required before storing confidential personnel information',
    ],
    link: { view: 'one-on-ones', label: 'Open one-on-ones' },
  },
  {
    title: 'Reporting-line hierarchy you can drag into shape',
    date: '2026-11-01',
    released: '1 November 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'branch',
    description:
      'A new Organisation screen turns the employee register into a live reporting-line chart: Angus Harris at the top, RAM as CIO and Phil as CTO beneath him, the Delivery Head under the CIO, and the PMO, BA Lead and QA Lead lines under delivery — with Data, Lead Architecture, DevOps, Architecture Design and D365 under the CTO. Drag anyone onto a colleague to make them the manager, or drop them on the top-level zone to remove their manager; their whole team moves with them and the change is saved and audited immediately. A move rewrites the reporting line only, so departments, entities, delivery streams and calendar access keep their own settings. Search keeps the line above a person in view, the directory lists every reporting line in one table, and the same drag-and-drop is available in Master setup.',
    bullets: [
      'New Organisation screen with a drag-and-drop reporting-line chart',
      'Top-level drop zone, search that keeps reporting context, and a reporting directory',
      'Change-manager picker as a keyboard-friendly alternative to dragging',
      'Cycle and self-reporting protection, with the reason shown before a drop is accepted',
      'Every line change written to the audit trail with the previous and new manager',
      'Harris Farm Markets reporting lines confirmed: CIO and CTO under Angus, delivery under the CIO, data and architecture under the CTO, PMO with BA and QA leads beneath it',
    ],
    link: { view: 'organisation', label: 'Open the organisation chart' },
  },
  {
    title: 'Organization hierarchy with drag-and-drop setup',
    date: '2026-10-31',
    released: '31 October 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'branch',
    description:
      'Master setup gained an Organization hierarchy tab beside Entities, so the group → company → sub-company → department tree can be set up and re-organized by hand. Drag any company, sub-company or department onto a new parent — or to the top level — and the move is saved, audited and reflected on every screen immediately. Roles that cannot manage master data see the tree read-only, and the validator blocks any drop that would loop a parent beneath its own child.',
    bullets: [
      'New Organization hierarchy tab in Master setup, next to Entities & group',
      'Drag-and-drop re-parenting for companies, sub-companies and departments',
      'Top-level drop zone to make an entity a group of companies',
      'Every move is saved and audited the moment it is dropped',
      'Cycle protection stops a parent being dropped beneath its own child',
      'Read-only tree for roles without master-data access',
    ],
    link: { view: 'admin', label: 'Open master setup' },
  },
  {
    title: 'Private calendars, delegation and clear time ownership',
    date: '2026-10-31',
    released: '31 October 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'lock',
    description:
      'Your working calendar is private by default. Ordinary employees see their own work, not a manager’s or a teammate’s unshared activities. An owner can share their calendar with their whole department or with one specific colleague, and revoke it again at any time — the grant is one-way and read-only. Sharing never hands over editing, on-behalf logging, approval, sync-push or connection-management rights; reporting leads keep the review they already had. Same-department tasks can be delegated to a colleague, which moves current ownership across calendars, roadmaps and timesheets while historical time stays with whoever logged it. Same-day start and end times now calculate hours automatically, and partial, overnight or manually mismatched entries are held by the modal, the store and the snapshot validator until they are reconciled.',
    bullets: [
      'Share my calendar with a department or one person — and revoke it',
      'Read-only grants: no edit, log-on-behalf, approval, sync or connection rights',
      'Same-department delegation with history and current-assignee ownership',
      'Start/end times calculate hours; mismatches block submission instead of saving',
      'Mobile, tablet and desktop shells with dense grids scrolling in place',
    ],
    link: { view: 'calendar', label: 'Open the calendar' },
  },
  {
    title: 'Harris Farm Markets onboarded as the default IT tenant',
    date: '2026-10-31',
    released: '31 October 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'building',
    description:
      'The portal now opens on Harris Farm Markets: the Harris Farm Markets group, a HarrisFarm Markets company entity and a single active Information Technology department. Angus and Luke Harris are both represented as co-CEOs with independently editable department portfolios, and the named IT roster — CIO, CTO, Head of Data, delivery, architecture, D365, PMO/BA and QA — carries editable designations, reporting lines, remote/contractor status and nested delivery streams. Planning activities are linked to the draft DevOps hierarchy as clearly labelled one-hour placeholders. No timesheet hours, PTO or stand-up history were invented for these people, and Harbourline and Meridian remain separate tenants.',
    bullets: [
      'Default tenant: group → company → IT department only',
      'Two co-CEOs with editable portfolios and department responsibility',
      'Named IT roster with editable designations, reporting lines and streams',
      'Draft DevOps-linked planning activities — no fabricated actuals',
      'One-time additive migration; the other tenants are untouched',
    ],
    link: { view: 'admin', label: 'Open master setup' },
  },
  {
    title: 'DevOps delivery, streams and effort reports',
    date: '2026-10-30',
    released: '30 October 2026',
    label: 'Just added',
    tone: 'brand',
    icon: 'branch',
    description:
      'A DevOps delivery tab now connects the backlog to the workday: epic → feature → ticket with nested department streams and accountable leads, acceptance criteria on every work item, one-step linking of existing items, CSV/JSON backlog imports with a full preview, and optional read-only Azure DevOps link lookup. A Sample epic loads a complete illustrative hierarchy — one epic, five features and ten work items, each with acceptance criteria — without creating bookings or actual hours. Calendar activities link to backlog items and timesheets stay the single source of actual hours. The separate Effort reports tab groups planned, logged and approved effort by epic, feature, ticket, resource, department, stream and funding, with CSV exports.',
    bullets: [
      'Epic → feature → ticket planning with nested streams and leads',
      'Acceptance criteria stored, imported, exported and shown as a checklist',
      'CSV/JSON import: row-level errors, rollback preview, repeat-safe upsert',
      'Sample epic and one-step Link work items for an existing backlog',
      'Effort by seven dimensions with capex-tagged vs policy-eligible hours',
      'Optional read-only Azure lookup — the PAT never reaches the browser',
    ],
    link: { view: 'delivery', label: 'Open DevOps delivery' },
  },
  {
    title: 'The platform moved forward in one verified upgrade',
    date: '2026-10-29',
    released: '29 October 2026',
    label: 'New',
    tone: 'info',
    icon: 'package',
    description:
      'Tailwind CSS 4, Vite 8, the lucide 1 icon set, Node 26 type definitions and PGlite 0.5.11 all landed together instead of as a chain of breaking-major merges. The same change rebuilt the lock file with every platform-specific optional binary, so npm ci resolves identically on Linux, macOS and Windows and CI stays reproducible. Typecheck, the unit and smoke suites and the production build were all green on the new toolchain.',
    bullets: [
      'Tailwind CSS 4 and Vite 8',
      'lucide 1 icon set, @types/node 26, PGlite 0.5.11',
      'Lock file rebuilt with every platform’s optional binary',
      'Verified by typecheck, unit + smoke suites and a production build',
    ],
  },
  {
    title: 'Security hardening around the session and the build pipeline',
    date: '2026-10-29',
    released: '29 October 2026',
    label: 'Recent',
    tone: 'info',
    icon: 'shield',
    description:
      'A security pass over credential storage, XSS, cookies, headers and the supply chain closed the gaps around an already sound session: a Content-Security-Policy now ships on every surface, framing is restricted, and unsafe methods still need a same-origin Origin/Sec-Fetch-Site plus a JSON body on top of SameSite=Strict. No credential is written to web storage, a URL or an Authorization header. GitHub Actions are pinned by commit SHA and a regression guard fails the suite if any of these controls weaken. The full review and its accepted residual risks are recorded in docs/security.',
    bullets: [
      'Content-Security-Policy and hardened headers on app and API',
      'HttpOnly, SameSite=Strict, Secure __Host- session cookie',
      'No token in localStorage, sessionStorage, IndexedDB or document.cookie',
      'Origin + JSON-body checks on unsafe methods',
      'SHA-pinned GitHub Actions and a regression test guard',
    ],
  },
  {
    title: 'Multiple tenants with no cross-tenant data, a Leave & PTO tab and a single-department calendar setting',
    date: '2026-10-26',
    released: '26 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'plane',
    description:
      'The workspace hosts several tenants side by side. A tenant owns its own group → companies → sub-companies → departments → people, and switching tenant in the top bar changes every entity, department, person, activity, timesheet, stand-up, project, PTO record and audit event on screen — nothing from another tenant is ever read, written or configured. A Leave & PTO tab lets an employee log a tentative holiday date; once the line manager approves it, it becomes approved PTO on every calendar for the employee, their management chain and any colleague who needs cover. PTO is counted in its own bucket and always excludes public holidays, which are badged PH and reported separately. Master setup gained a department calendar scope so the calendar can run for a single department — the default IT department — several departments, or all of them.',
    bullets: [
      'Tenant switcher in the top bar; tenant isolation enforced on read and on write',
      'Leave & PTO tab: tentative date → line-manager approval → approved PTO and a separate PTO balance',
      'Public holidays badged PH and excluded from every PTO hour and total',
      'Who is away and who is next responsible, on the calendar, the command centre and Employee 360',
      'Master setup → Tenants & calendar scope: single department (default IT), selected departments or all departments',
    ],
    link: { view: 'leave', label: 'Open Leave & PTO' },
  },
  {
    title: 'Demo mode starts even without a database',
    date: '2026-10-26',
    released: '26 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'lifebuoy',
    description:
      'With no DATABASE_URL, the API used a demo configuration without a session secret, and the per-client rate-limit key derivation threw before any route ran — so every request, including the config probe, returned 500 and the gateway reported the workspace as unavailable. The key derivation now works without a secret, demo mode renders immediately, and bounded retries stop a cold Neon database from turning into an endless retry loop.',
    bullets: [
      'Browser-only demo mode loads with no database configured',
      'No 500 cascade from the rate-limit key derivation',
      'Retries are bounded and pause in hidden tabs; a manual retry always remains',
    ],
  },
  {
    title: 'A sleeping database wakes itself — automatic refresh, with a manual retry',
    date: '2026-10-26',
    released: '26 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'refresh',
    description:
      'Neon suspends when nobody is editing, so “The shared database is temporarily unavailable” is normally a cold start rather than an outage. The workspace detects that case and refreshes itself on a short, capped backoff with a live countdown, while keeping Refresh now, Retry now and Reload page one click away. Queued edits and unsaved changes stay in this tab throughout, and the first successful attempt still creates the schema and seeds the pilot data exactly once if the database is empty. Only failures a retry cannot fix — an incomplete configuration, an expired session or a version conflict — ask you to act instead.',
    bullets: [
      'Automatic refresh with a countdown on the opening screen and in the status bar',
      'Manual Refresh now / Retry now and Reload page are always available',
      'Unsaved edits are never discarded by an automatic retry',
      'Background tabs wait for you to return instead of polling, and a reconnect retries immediately',
    ],
  },
  {
    title: 'Initialise the shared workspace before the first page load',
    date: '2026-10-26',
    released: '26 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'database',
    description:
      'npm run db:init creates the schema and seeds the pilot workspace ahead of time, so the first person to open a fresh deployment no longer pays for schema creation and a large seed write, and the data exists before anyone loads or refreshes the page. Running it again is safe: an existing workspace is detected and left alone.',
    bullets: [
      'One command creates or upgrades the shared schema',
      'Seeding happens once, before the first visit',
      'Safe to re-run; an existing workspace is never reset',
    ],
  },
  {
    title: 'A faster, calmer shared API',
    date: '2026-10-24',
    released: '24 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'zap',
    description:
      'A dependency-free request guard now sits in front of the Neon-backed API. Sliding-window rate limits answer 429 with Retry-After, negative caches stop empty workspaces and bad sessions from reaching the database, and a Bloom filter short-circuits repeat wrong passwords while the real constant-time compare always runs. A five-second micro-cache with single-flight reads and weak ETags keeps the opening snapshot from being fetched twice, and a short circuit breaker lets a database blip pass instead of becoming a retry storm.',
    bullets: [
      'Per-client and per-route rate limits with Retry-After',
      'Negative cache and a 5 s circuit breaker after a Neon failure',
      'Bloom-filtered rejections with the real password compare preserved',
      'Single-flight reads, 5 s snapshot cache and ETag → 304',
      'Tunable by environment variable, with a kill switch',
    ],
  },
  {
    title: 'Daily stand-up tab with department pulse and support callouts',
    date: '2026-10-22',
    released: '22 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'standup',
    description:
      'A dedicated Daily stand-up tab gives every member a check-in form — last working day update, progress, blockers, support requests and the day’s action items. Supervisors, managers and department heads track their own department on a top-to-bottom board, while the CEO and COO get an executive pulse with high-level department summaries that drill into every employee layer. A stand-up pulse card sits on the command centre with submission progress and blocker/support callouts.',
    bullets: [
      'One stand-up per member per working day, with drafts and submit states',
      'Internal and cross-functional support callouts with acknowledge → resolve lifecycle',
      'Role-scoped board: leadership sees only their authorised departments',
      'Executive pulse for CEO/COO plus a stand-up pulse card on the command centre',
    ],
    link: { view: 'standups', label: 'Open daily stand-up' },
  },
  {
    title: 'Production infrastructure under the demo',
    date: '2026-10-22',
    released: '22 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'server',
    description:
      'Connection pooling through Neon’s PgBouncer endpoint, read-replica routing with automatic fallback, Memcached caching with an in-memory fallback, image sharding and a health-monitoring surface are implemented server-side. Every piece degrades to a safe default when it is not configured, so a demo workspace behaves exactly as before while a production deployment can spread reads and absorb traffic.',
    bullets: [
      'PgBouncer pooling modes with validated limits and timeouts',
      'Read replicas with round-robin/least-connections and fallback',
      'Memcached TTLs with an in-memory fallback',
      'Image sharding plus infrastructure health and smoke scripts',
    ],
  },
  {
    title: 'Guide at the top of every tab, and a calendar that reads at any grain',
    date: '2026-10-21',
    released: '21 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'layout',
    description:
      'The AI guide sits at the top of each tab and section instead of floating in the bottom-right corner, and follows the section or sub-tab in focus — fold it to a single line, or hide it with ×. The department calendar gained Year and Quarter grains beside Month, Week and Day, and every day cell holds as many activities as it needs: busy days show their first few tasks plus “+N more”, which expands the day in place and hands the full list to the day panel.',
    bullets: [
      'AI guide pinned to the top of every tab and section',
      'Year, Quarter, Month, Week and Day calendar grains',
      'Multi-task day cells with inline “+N more” expansion',
      'Add a task straight onto the selected day',
    ],
  },
  {
    title: 'A guide that reads like a note, and a dashboard that stays on one entity',
    date: '2026-10-21',
    released: '21 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'sparkles',
    description:
      'The AI guide is a taped sticky note: a GUIDE badge, a one-line promise, the prose that explains the screen, a short numbered “Do this” list, one “Watch” caution and a collapsible Live context block built from the figures on screen. The command centre also gained an entity picker, so every card, score, queue and the day board read one legal entity and its companies at a time — all entities in scope is still one click away.',
    bullets: [
      'Sticky-note guide with Do this, Watch and Live context',
      'Live context computed from the same snapshot as the screen',
      'Entity picker scopes the whole command centre',
      'Entity focus narrows role scope — it never widens it',
    ],
  },
  {
    title: 'AI guide and entity-scoped profile selection',
    date: '2026-10-21',
    released: '21 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'wand',
    description:
      'A contextual AI guide sticky note follows you across every tab, section and sub-section, auto-adjusting its width and height to the content, with an enable/disable toggle in the note and the top bar. Profile switching now flows through group of company → entity, so only the selected company’s employees are listed.',
    bullets: ['AI guide on every screen, auto-fitted to its content', 'One-click enable/disable toggle everywhere', 'Profiles scoped to the selected entity’s employees'],
  },
  {
    title: 'A portal that feels like your brand',
    date: '2026-10-21',
    released: '21 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'palette',
    description:
      'Set a logo, header and footer for each entity, then tune accent and background colours plus body and heading fonts. Preview changes and apply them to the entity in Theme Studio.',
    bullets: ['Per-entity portal identity', 'Live preview before applying', 'Prompt-guided theme suggestions'],
    link: { view: 'theme-studio', label: 'Open Theme Studio' },
  },
  {
    title: 'A dedicated place for portal updates',
    date: '2026-10-21',
    released: '21 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'news',
    description:
      'The What’s new area keeps recent improvements and useful release highlights separate from day-to-day calendar work. It is now generated from this one release log, so the screen and docs/CHANGELOG.md always describe the same releases.',
    bullets: ['Find new capabilities quickly', 'See the latest portal improvements', 'One generated changelog for the repo and the screen'],
  },
  {
    title: 'Projects and capitalisation workflow',
    date: '2026-10-21',
    released: '21 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'calendar',
    description:
      'Keep delivery milestones, project effort and capitalisation approvals connected to the wider department activity picture.',
    bullets: ['Project portfolio visibility', 'Capitalisation review and approval'],
    link: { view: 'capitalisation', label: 'Open the pack' },
  },
  {
    title: 'A shared workspace behind one password',
    date: '2026-10-21',
    released: '21 October 2026',
    label: 'Earlier',
    tone: 'neutral',
    icon: 'cloud',
    description:
      'The portal gained an optional shared workspace: same-origin server functions persist one pilot snapshot in Neon PostgreSQL with server-only credentials, an HttpOnly shared-password session and atomic revision checks. The browser shows sync, save and conflict status, exports a private JSON backup and can restore one, while personas stay device-local so switching a profile never changes what the team sees.',
    bullets: [
      'One shared snapshot with revision checks instead of silent overwrites',
      'HttpOnly shared-password session; no credential in the browser',
      'Sync, save and conflict status in the shell',
      'Private JSON backup export and owner restore',
      'Device-local personas; browser-only demo when no database is configured',
    ],
  },
];

/** Newest first — used by the tab, the changelog and the tests. */
export const RELEASES_NEWEST_FIRST = [...RELEASES].sort((a, b) => b.date.localeCompare(a.date));

export const LATEST_RELEASE_DATE = RELEASES[0]?.date ?? '';
