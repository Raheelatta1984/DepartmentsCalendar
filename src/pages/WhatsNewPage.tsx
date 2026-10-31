import React from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GitBranch,
  LayoutGrid,
  LockKeyhole,
  MessagesSquare,
  Package,
  Palette,
  Plane,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '../components/ui';
import type { ViewKey } from '../types';

type ReleaseTone = 'brand' | 'info' | 'neutral' | 'good';

type Update = {
  label: string;
  released: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: ReleaseTone;
  bullets: string[];
  /** Where the reader can go to see the change for themselves. */
  opens?: { view: ViewKey; label: string };
};

/* Newest first. Every merged, user-visible change belongs here — add the entry
   in the same change that ships the feature, not weeks later. */
const updates: Update[] = [
  {
    label: 'Just added',
    released: '31 October 2026',
    title: 'Private calendars, delegation and clear time ownership',
    description:
      'Your working calendar is private by default. Ordinary employees see their own work, not a manager’s or a teammate’s unshared activities. An owner can share their calendar with their whole department or with one specific colleague, and revoke it again at any time — the grant is one-way and read-only. Sharing never hands over editing, on-behalf logging, approval, sync-push or connection-management rights; reporting leads keep the review they already had. Same-department tasks can be delegated to a colleague, which moves current ownership across calendars, roadmaps and timesheets while historical time stays with whoever logged it. Same-day start and end times now calculate hours automatically, and partial, overnight or manually mismatched entries are held by the modal, the store and the snapshot validator until they are reconciled.',
    icon: <LockKeyhole className="h-4 w-4" />,
    tone: 'brand',
    bullets: [
      'Share my calendar with a department or one person — and revoke it',
      'Read-only grants: no edit, log-on-behalf, approval, sync or connection rights',
      'Same-department delegation with history and current-assignee ownership',
      'Start/end times calculate hours; mismatches block submission instead of saving',
      'Mobile, tablet and desktop shells with dense grids scrolling in place',
    ],
    opens: { view: 'calendar', label: 'Open the calendar' },
  },
  {
    label: 'Just added',
    released: '31 October 2026',
    title: 'Harris Farm Markets onboarded as the default IT tenant',
    description:
      'The portal now opens on Harris Farm Markets: the Harris Farm Markets group, a HarrisFarm Markets company entity and a single active Information Technology department. Angus and Luke Harris are both represented as co-CEOs with independently editable department portfolios, and the named IT roster — CIO, CTO, Head of Data, delivery, architecture, D365, PMO/BA and QA — carries editable designations, reporting lines, remote/contractor status and nested delivery streams. Planning activities are linked to the draft DevOps hierarchy as clearly labelled one-hour placeholders. No timesheet hours, PTO or stand-up history were invented for these people, and Harbourline and Meridian remain separate tenants.',
    icon: <Building2 className="h-4 w-4" />,
    tone: 'brand',
    bullets: [
      'Default tenant: group → company → IT department only',
      'Two co-CEOs with editable portfolios and department responsibility',
      'Named IT roster with editable designations, reporting lines and streams',
      'Draft DevOps-linked planning activities — no fabricated actuals',
      'One-time additive migration; the other tenants are untouched',
    ],
    opens: { view: 'admin', label: 'Open master setup' },
  },
  {
    label: 'Just added',
    released: '30 October 2026',
    title: 'DevOps delivery, streams and effort reports',
    description:
      'A DevOps delivery tab now connects the backlog to the workday: epic → feature → ticket with nested department streams and accountable leads, acceptance criteria on every work item, one-step linking of existing items, CSV/JSON backlog imports with a full preview, and optional read-only Azure DevOps link lookup. A Sample epic loads a complete illustrative hierarchy — one epic, five features and ten work items, each with acceptance criteria — without creating bookings or actual hours. Calendar activities link to backlog items and timesheets stay the single source of actual hours. The separate Effort reports tab groups planned, logged and approved effort by epic, feature, ticket, resource, department, stream and funding, with CSV exports.',
    icon: <GitBranch className="h-4 w-4" />,
    tone: 'brand',
    bullets: [
      'Epic → feature → ticket planning with nested streams and leads',
      'Acceptance criteria stored, imported, exported and shown as a checklist',
      'CSV/JSON import: row-level errors, rollback preview, repeat-safe upsert',
      'Sample epic and one-step Link work items for an existing backlog',
      'Effort by seven dimensions with capex-tagged vs policy-eligible hours',
      'Optional read-only Azure lookup — the PAT never reaches the browser',
    ],
    opens: { view: 'delivery', label: 'Open DevOps delivery' },
  },
  {
    label: 'New',
    released: '29 October 2026',
    title: 'The platform moved forward in one verified upgrade',
    description:
      'Tailwind CSS 4, Vite 8, the lucide 1 icon set, Node 26 type definitions and PGlite 0.5.11 all landed together instead of as a chain of breaking-major merges. The same change rebuilt the lock file with every platform-specific optional binary, so `npm ci` resolves identically on Linux, macOS and Windows and CI stays reproducible. Typecheck, the unit and smoke suites and the production build were all green on the new toolchain.',
    icon: <Package className="h-4 w-4" />,
    tone: 'info',
    bullets: [
      'Tailwind CSS 4 and Vite 8',
      'lucide 1 icon set, @types/node 26, PGlite 0.5.11',
      'Lock file rebuilt with every platform’s optional binary',
      'Verified by typecheck, unit + smoke suites and a production build',
    ],
  },
  {
    label: 'Recent',
    released: '29 October 2026',
    title: 'Security hardening around the session and the build pipeline',
    description:
      'A security pass over credential storage, XSS, cookies, headers and the supply chain closed the gaps around an already sound session: a Content-Security-Policy now ships on every surface, framing is restricted, and unsafe methods still need a same-origin Origin/Sec-Fetch-Site plus a JSON body on top of SameSite=Strict. No credential is written to web storage, a URL or an Authorization header. GitHub Actions are pinned by commit SHA and a regression guard fails the suite if any of these controls weaken. The full review and its accepted residual risks are recorded in docs/security.',
    icon: <ShieldCheck className="h-4 w-4" />,
    tone: 'info',
    bullets: [
      'Content-Security-Policy and hardened headers on app and API',
      'HttpOnly, SameSite=Strict, Secure __Host- session cookie',
      'No token in localStorage, sessionStorage, IndexedDB or document.cookie',
      'Origin + JSON-body checks on unsafe methods',
      'SHA-pinned GitHub Actions and a regression test guard',
    ],
  },
  {
    label: 'Earlier',
    released: '24 October 2026',
    title: 'A faster, calmer shared API',
    description:
      'A dependency-free request guard now sits in front of the Neon-backed API. Sliding-window rate limits answer 429 with Retry-After, negative caches stop empty workspaces and bad sessions from reaching the database, and a Bloom filter short-circuits repeat wrong passwords while the real constant-time compare always runs. A five-second micro-cache with single-flight reads and weak ETags keeps the opening snapshot from being fetched twice, and a short circuit breaker lets a database blip pass instead of becoming a retry storm.',
    icon: <Zap className="h-4 w-4" />,
    tone: 'neutral',
    bullets: [
      'Per-client and per-route rate limits with Retry-After',
      'Negative cache and a 5 s circuit breaker after a Neon failure',
      'Bloom-filtered rejections with the real password compare preserved',
      'Single-flight reads, 5 s snapshot cache and ETag → 304',
      'Tunable by environment variable, with a kill switch',
    ],
  },
  {
    label: 'Earlier',
    released: '21 October 2026',
    title: 'Production infrastructure under the demo',
    description:
      'Connection pooling through Neon’s PgBouncer endpoint, read-replica routing with automatic fallback, Memcached caching with an in-memory fallback, image sharding and a health-monitoring surface are implemented server-side. Every piece degrades to a safe default when it is not configured, so a demo workspace behaves exactly as before while a production deployment can spread reads and absorb traffic.',
    icon: <Server className="h-4 w-4" />,
    tone: 'neutral',
    bullets: [
      'PgBouncer pooling modes with validated limits and timeouts',
      'Read replicas with round-robin/least-connections and fallback',
      'Memcached TTLs with an in-memory fallback',
      'Image sharding plus infrastructure health and smoke scripts',
    ],
  },
  {
    label: 'Earlier',
    released: '26 October 2026',
    title: 'Multiple tenants with no cross-tenant data, a Leave & PTO tab and a single-department calendar setting',
    description:
      'The workspace hosts several tenants side by side. A tenant owns its own group → companies → sub-companies → departments → people, and switching tenant in the top bar changes every entity, department, person, activity, timesheet, stand-up, project, PTO record and audit event on screen — nothing from another tenant is ever read, written or configured. A Leave & PTO tab lets an employee log a tentative holiday date; once the line manager approves it, it becomes approved PTO on every calendar for the employee, their management chain and any colleague who needs cover. PTO is counted in its own bucket and always excludes public holidays, which are badged PH and reported separately. Master setup gained a department calendar scope so the calendar can run for a single department — the default IT department — several departments, or all of them.',
    icon: <Plane className="h-4 w-4" />,
    tone: 'neutral',
    bullets: [
      'Tenant switcher in the top bar; tenant isolation enforced on read and on write',
      'Leave & PTO tab: tentative date → line-manager approval → approved PTO and a separate PTO balance',
      'Public holidays badged PH and excluded from every PTO hour and total',
      'Who is away and who is next responsible, on the calendar, the command centre and Employee 360',
      'Master setup → Tenants & calendar scope: single department (default IT), selected departments or all departments',
    ],
  },
  {
    label: 'Earlier',
    released: '26 October 2026',
    title: 'A sleeping database wakes itself — automatic refresh, with a manual retry',
    description:
      'Neon suspends when nobody is editing, so “The shared database is temporarily unavailable” is normally a cold start rather than an outage. The workspace detects that case and refreshes itself on a short, capped backoff with a live countdown, while keeping Refresh now, Retry now and Reload page one click away. Queued edits and unsaved changes stay in this tab throughout, and the first successful attempt still creates the schema and seeds the pilot data exactly once if the database is empty. Only failures a retry cannot fix — an incomplete configuration, an expired session or a version conflict — ask you to act instead.',
    icon: <RefreshCw className="h-4 w-4" />,
    tone: 'neutral',
    bullets: [
      'Automatic refresh with a countdown on the opening screen and in the status bar',
      'Manual Refresh now / Retry now and Reload page are always available',
      'Unsaved edits are never discarded by an automatic retry',
      'Background tabs wait for you to return instead of polling, and a reconnect retries immediately',
    ],
  },
  {
    label: 'Earlier',
    released: '22 October 2026',
    title: 'Daily stand-up tab with department pulse and support callouts',
    description:
      'A dedicated Daily stand-up tab gives every member a check-in form — last working day update, progress, blockers, support requests and the day’s action items. Supervisors, managers and department heads track their own department on a top-to-bottom board, while the CEO and COO get an executive pulse with high-level department summaries that drill into every employee layer. A stand-up pulse card sits on the command centre with submission progress and blocker/support callouts.',
    icon: <MessagesSquare className="h-4 w-4" />,
    tone: 'neutral',
    bullets: [
      'One stand-up per member per working day, with drafts and submit states',
      'Internal and cross-functional support callouts with acknowledge → resolve lifecycle',
      'Role-scoped board: leadership sees only their authorised departments',
      'Executive pulse for CEO/COO plus a stand-up pulse card on the command centre',
    ],
  },
  {
    label: 'Earlier',
    released: '21 October 2026',
    title: 'Guide at the top of every tab, and a calendar that reads at any grain',
    description:
      'The AI guide sits at the top of each tab and section instead of floating in the bottom-right corner, and follows the section or sub-tab in focus — fold it to a single line, or hide it with ×. The department calendar gained Year and Quarter grains beside Month, Week and Day, and every day cell holds as many activities as it needs: busy days show their first few tasks plus “+N more”, which expands the day in place and hands the full list to the day panel.',
    icon: <LayoutGrid className="h-4 w-4" />,
    tone: 'neutral',
    bullets: [
      'AI guide pinned to the top of every tab and section',
      'Year, Quarter, Month, Week and Day calendar grains',
      'Multi-task day cells with inline “+N more” expansion',
      'Add a task straight onto the selected day',
    ],
  },
  {
    label: 'Earlier',
    released: '21 October 2026',
    title: 'A guide that reads like a note, and a dashboard that stays on one entity',
    description:
      'The AI guide is a taped sticky note: a GUIDE badge, a one-line promise, the prose that explains the screen, a short numbered “Do this” list, one “Watch” caution and a collapsible Live context block built from the figures on screen. The command centre also gained an entity picker, so every card, score, queue and the day board read one legal entity and its companies at a time — all entities in scope is still one click away.',
    icon: <Sparkles className="h-4 w-4" />,
    tone: 'neutral',
    bullets: [
      'Sticky-note guide with Do this, Watch and Live context',
      'Live context computed from the same snapshot as the screen',
      'Entity picker scopes the whole command centre',
      'Entity focus narrows role scope — it never widens it',
    ],
  },
  {
    label: 'Earlier',
    released: '21 October 2026',
    title: 'AI guide and entity-scoped profile selection',
    description:
      'A contextual AI guide sticky note follows you across every tab, section and sub-section, auto-adjusting its width and height to the content, with an enable/disable toggle in the note and the top bar. Profile switching now flows through group of company → entity, so only the selected company’s employees are listed.',
    icon: <WandSparkles className="h-4 w-4" />,
    tone: 'neutral',
    bullets: ['AI guide on every screen, auto-fitted to its content', 'One-click enable/disable toggle everywhere', 'Profiles scoped to the selected entity’s employees'],
  },
  {
    label: 'Earlier',
    released: '21 October 2026',
    title: 'A portal that feels like your brand',
    description: 'Set a logo, header and footer for each entity, then tune accent and background colours plus body and heading fonts. Preview changes and apply them to the entity in Theme Studio.',
    icon: <Palette className="h-4 w-4" />,
    tone: 'neutral',
    bullets: ['Per-entity portal identity', 'Live preview before applying', 'Prompt-guided theme suggestions'],
    opens: { view: 'theme-studio', label: 'Open Theme Studio' },
  },
  {
    label: 'Earlier',
    released: '21 October 2026',
    title: 'A dedicated place for portal updates',
    description: 'The What’s new area keeps recent improvements and useful release highlights separate from day-to-day calendar work.',
    icon: <Sparkles className="h-4 w-4" />,
    tone: 'neutral',
    bullets: ['Find new capabilities quickly', 'See the latest portal improvements'],
  },
  {
    label: 'Earlier',
    released: '21 October 2026',
    title: 'Projects and capitalisation workflow',
    description: 'Keep delivery milestones, project effort and capitalisation approvals connected to the wider department activity picture.',
    icon: <CalendarDays className="h-4 w-4" />,
    tone: 'neutral',
    bullets: ['Project portfolio visibility', 'Capitalisation review and approval'],
    opens: { view: 'capitalisation', label: 'Open the pack' },
  },
];

const latestRelease = updates[0].released;

export function WhatsNewPage({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const newest = updates.filter((update) => update.label === 'Just added').length;
  return (
    <div>
      <PageHeader
        eyebrow="Portal updates"
        title="What’s new"
        description="Every user-visible change since the portal went live, newest first — including the work that ships under the surface."
        actions={<Badge tone="good"><CheckCircle2 className="h-3 w-3" /> You’re up to date</Badge>}
      />

      <Card className="mb-4 overflow-hidden !p-0">
        <div className="relative overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 px-5 py-6 text-white sm:px-7">
          <div className="absolute -right-8 -top-12 h-48 w-48 rounded-full border border-white/10" />
          <div className="absolute -right-1 -top-5 h-32 w-32 rounded-full border border-white/10" />
          <div className="relative max-w-2xl">
            <Badge tone="brand" className="!bg-white/10 !text-blue-100 !ring-white/10">
              <LockKeyhole className="h-3 w-3" /> New · Private calendars
            </Badge>
            <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">Your work calendar is yours to share.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Sharing with a department or a single colleague is now a decision you make — read-only, reversible, and never a
              licence to edit, log time on your behalf or approve on your behalf. Delegate a task and current ownership moves
              with it, while history stays where it was recorded.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button className="!border-white/15 !bg-white !text-slate-900 hover:!bg-slate-100" onClick={() => onNavigate('calendar')}>
                <CalendarDays className="h-3.5 w-3.5" /> Open the calendar <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
              <Button className="!border-white/15 !bg-white/10 !text-white hover:!bg-white/20" onClick={() => onNavigate('delivery')}>
                <GitBranch className="h-3.5 w-3.5" /> See DevOps delivery
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-300">
              <span><strong className="font-semibold text-white">{updates.length}</strong> release notes</span>
              <span><strong className="font-semibold text-white">{newest}</strong> in the last few days</span>
              <span>Last updated <strong className="font-semibold text-white">{latestRelease}</strong></span>
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" /><h2 className="text-sm font-semibold text-slate-800">Recent updates</h2></div>
        <Badge tone="neutral">{updates.length} notes · newest first</Badge>
      </div>
      <div className="space-y-3">
        {updates.map((update) => (
          <Card key={update.title}>
            <div className="flex gap-3">
              <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${update.tone === 'brand' ? 'bg-brand-50 text-brand-600' : update.tone === 'info' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-600'}`}>
                {update.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{update.title}</h3>
                  <Badge tone={update.tone}>{update.label}</Badge>
                  <span className="text-[10px] text-slate-400">{update.released}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{update.description}</p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {update.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />{bullet}
                    </li>
                  ))}
                </ul>
                {update.opens ? (
                  <Button size="sm" className="mt-3" onClick={() => onNavigate(update.opens!.view)}>
                    {update.opens.label} <ArrowUpRight className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
