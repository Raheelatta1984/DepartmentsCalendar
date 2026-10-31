# Orbit — Department Activity, Workload & Roadmap Portal

A working, deployable prototype of the portal you described: **every department's daily activity, follow-ups, appointments, meetings, seminars, sessions and tasks exposed up the chain from the newest employee to the CEO**, with workload measured from hours actually spent, a central calendar per department and per person, country-aware public holidays, timesheets, performance scoring and automatic escalation to the department head with the Head of Operations in copy.

**Multiple tenants, one deployment.** The workspace hosts several tenants side by side — each tenant owns its group → company → sub-company → department → people tree. Switching tenant changes every entity, department, person, activity, timesheet, stand-up, project, PTO record and audit event on screen: **no row of another tenant is ever read, written, listed or configured.** A tenant is also the master switch for calendar rollout: **one department, a selected list, or all departments.**

**Harris Farm Markets is the default onboarding tenant.** It contains the `Harris Farm Markets` group, a `HarrisFarm Markets` company entity and just one active department for now: IT. Angus Harris and Luke Harris are both represented as co-CEOs with independently editable department portfolios. The reporting hierarchy runs Angus Harris → RAM (CIO) and Phil (CTO); delivery sits under the CIO, data and architecture under the CTO, and the PMO, BA Lead and QA Lead lines nest beneath delivery. It is drawn on the **Organisation** screen, where anyone can be re-parented by drag-and-drop. Job titles, remote/contractor status and nested delivery streams are edited in Master setup. Warehouse and retail-site departments can be added later without changing the model.

**Holidays plan, PTO and public holidays.** The **Leave & PTO** tab lets an employee log a tentative date; the line manager approves it and it becomes approved holidays (PTO) on the calendar for the employee, their line manager and up to hire management — and it stays visible to colleagues so a blocker or an assistance request is never a surprise. **PTO hours are counted in their own bucket and always exclude public holidays (PH)**, which are badged PH on every calendar and reported separately.

Built with React + TypeScript, with a deterministic product demo and an optional **shared Neon Free PostgreSQL workspace on the existing GitHub-linked Vercel deployment**. The frontend and server-only API deploy together. Follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) to connect Neon and configure secrets; merging code alone does not create a database.

**Pilot access model:** anyone with the workspace password can view and edit the entire shared workspace. Persona switching and tenant switching preview employee and tenant scopes but are **not individual authentication or server-enforced authorization**. Do not store sensitive real employee/payroll data yet. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what is implemented versus planned.

**Private work calendars, delegation and time ownership.** Ordinary employees see their own work, not their manager’s or teammates’ unshared activities. Owners can share a calendar with their department or a specific employee; grants are one-way and read-only, never permission to edit, log time, approve, push sync or manage connections. Reporting leads retain downstream review and are the only users who can log or approve on a team member’s behalf. Same-department tasks can be delegated to a colleague: current ownership moves to the assignee across calendars, roadmaps and timesheets, while historical time stays with its original logger.

**Reconciled working windows and responsive layouts.** Same-day activity and timesheet start/end times calculate hours automatically. Partial, overnight or manually mismatched durations show an explanation and are held by the modal, store and snapshot validator until reconciled; legacy all-day rows remain readable. The shell, filters, menus and modals adapt across mobile, tablet and desktop, with dense calendars/tables scrolling inside their own containers rather than widening the page.

---

## DevOps delivery and effort reporting

The **DevOps delivery** tab adds epic → feature → ticket planning, nested department streams and leads, acceptance criteria, one-step linking of work items to their feature or epic, CSV/JSON backlog imports, and optional read-only Azure DevOps link lookup. A **Sample epic** loads an illustrative DevOps hierarchy (epic, five features and ten work items, each with a description and acceptance criteria) without creating calendar bookings or actual hours. Calendar activities link to backlog items; timesheets remain the single source of actual hours. The separate **Effort reports** tab groups planned/logged/approved effort by epic, feature, ticket, resource, department, stream and funding, with CSV exports.

IT is enabled by default; other departments can opt in through Master setup. See [`docs/DEVOPS_DELIVERY.md`](docs/DEVOPS_DELIVERY.md) for the import template, Azure setup, hour semantics, capex safeguards and production authorization boundary.

---

## Release notes, in one place

`src/data/releases.ts` is the single source of truth for what shipped. The **What’s new** tab renders it directly, and `npm run changelog` regenerates [`docs/CHANGELOG.md`](docs/CHANGELOG.md) from the same array — so the screen and the repository changelog cannot describe different releases.

Adding a release is one edit: append an entry (title, ISO and display date, label, tone, icon, description, bullets and an optional link to the screen). Keep the log newest first; titles stay unique.

`npm run changelog:check` runs inside `npm test` and in CI, and fails if the markdown is stale, an entry is out of order, or a label, tone, icon or link target is unknown. The app smoke also renders the tab and asserts the newest notes are present.

---

## 1. What is in the demo

| Your requirement | Where it lives in the portal |
| --- | --- |
| All departments' daily activities, follow-ups, appointments, meetings, seminars, sessions, tasks | **Activity register** (9 activity types, subtasks, priority, status, progress) and **Department calendar** |
| Each employee's schedule visible to supervisor → manager → unit head → department head → COO → CEO | **Role-based scope ribbon** + **Employee 360** modal; reporting-tree filters preview intended scopes (not server authorization yet) |
| CEO checks the accounts department collectively and its workload | **Command centre** → department scorecard (logged vs capacity, utilization, on-time, score) and `Accounts & Finance` drill-down |
| Workload calculated from hours spent on activities | Every score uses **logged timesheet hours ÷ country-aware capacity** (not planned hours, not attendance) |
| Portal linked to Outlook, Google Calendar optional; an inserted task appears in the calendar | **Calendar sync** tab + sync toggles on every activity + a real **.ics** export that can be imported into Outlook/Google today |
| Central calendar by department, by employee; managers review a responsible employee's calendar | **Department calendar** (year, quarter, month, team-week swimlanes, day) with employee picker, per-person utilization and multi-task day cells |
| Employees cannot see unshared manager/teammate activity; owners control read access | **Department calendar → Share my calendar** — department or specific-person grants, revocation, one-way read-only scope in calendar/register/search/dashboard/timesheet queries |
| Delegate tasks and count them under the assigned member | **Activity modal → Assigned to** — same-department task delegation, delegation note/history, current-assignee ownership; only reporting leads can otherwise log on another member’s behalf |
| Start/stop times calculate hours and mismatches block submission | **Activity modal** and **Timesheet entry modal** — automatic same-day durations, live reconciliation messages, store/server validation |
| Staff / worker management at master level | **Master setup → Employees** (access role, linked designation, reporting line, home/supporting streams, work location and engagement type) |
| Co-CEO portfolios and future department responsibility | **Master setup → Employees → Edit** — explicit department checklist per co-CEO plus editable free-text portfolio; see [`docs/HARRIS_FARM_ONBOARDING.md`](docs/HARRIS_FARM_ONBOARDING.md) |
| Who reports to whom — a reporting-line org chart you can re-shape | **Organisation** (drag a person onto a new manager or the top-level zone; searchable chart, reporting directory and change history) — the same people tree also sits in **Master setup → Organization hierarchy → Reporting lines** |
| Entities / companies and sub-companies so a group of companies fits | **Master setup → Entities** (group → company → sub-company tree, each with country & timezone) |
| Department master with head / responsible assignee | **Master setup → Departments** (head, operations owner, cost centre, calendar colour) |
| Performance matrix daily / weekly / monthly / quarterly / annual | **Performance & escalation** — identical formula at every grain, 8-period trend |
| Low-performing department reported to department head, CC Head of Operations | **Attention queue → Escalate** and the **rule engine**; generates a ready-to-send email with To/CC and full audit record |
| Head of Operations sees only the departments he is responsible for | Preview role scope: COO sees every operational department (owner field), not the rest of the group |
| Daily timesheet by activity, review where time was spent vs the planned task | **Timesheets** — expandable department → head/lead/member → activity Team week, entry history, reporting-lead approvals, plan-vs-actual |
| Daily department stand-up: last working day update, progress, blockers, support requests, action items of the day | **Daily stand-up** tab — one check-in per member per working day, department board layered head → manager → supervisor → employee, internal & cross-functional support callouts |
| Only department heads / managers / supervisors track their department's stand-up progress; CEO/COO see a high-level summary and drill in department by department | **Role-scoped stand-up board** (supervisor rank and above) + **Executive pulse** for CEO/COO; plain employees only see their own form; a **stand-up pulse card** on the command centre shows per-department submission, blockers and support callouts |
| Roadmap with department/employee/task/subtask rows, columns for year, quarter, month, week number, day and date | **Roadmap timeline** with all six header rows, department → heads → leads → members → activities/subtasks drill-down, holiday shading and today marker |
| Country-specific weekly off + public holidays for the next 5 years, with reason shown | **Master setup → Holidays & weekends** (12 countries, multi-year generation, per-country weekend toggles) and shading in calendar/roadmap |
| Track IT effort by project/task and capitalise it for the board | **IT projects & capex** portfolio (110 projects) + **Capitalisation pack** (AASB 138, AUD) with monthly board approval of resource hours |
| AI guide that helps on every screen, toggleable on/off | **AI guide panel at the top of every tab and section** — GUIDE badge, italic promise, prose explanation, numbered **Do this** steps, one **Watch** caution and a collapsible **Live context** block computed from the same live snapshot the screen reads. It follows the section / sub-tab in focus, folds to a single line, and hides with × or the top-bar toggle |
| Dashboard focused on one legal entity | **Command centre → entity picker** — all entities in scope, a group of companies, a company or one of its subsidiaries; every card, score, queue and the day board recompute for that entity tree only |
| Select a profile only after group of company and entity, scoped to that company’s people | **Avatar menu → Select profile** — group of company → entity → profile list showing only that entity’s employees |
| Multiple tenants, each with its own entities, sub-entities and departments; **no cross-tenant information or resource** | **Top bar → Tenant** switcher + **Master setup → Tenants & calendar scope**. Tenants, entities, departments, people, activities, timesheets, stand-ups, projects, capitalisation packs, PTO and audit rows are attributed and filtered on read *and* on write |
| Holidays plan: employee logs a tentative date, line manager approves it, approved holidays show as PTO and count in a separate PTO total, excluding PH public holidays | **Leave & PTO** tab — request → approval → PTO; PH excluded from the hours and reported on its own line; PH badge on every calendar; PTO balance per person and per team |
| Approved leave visible on the calendar to the employee, their line manager, up to hire management — and to other employees who need cover | **Department calendar** (PTO chips + PH), **Leave & PTO → Team calendar**, **Employee 360** and the command centre card all show who is away and **who is next responsible** |
| Master settings to choose whether the calendar is for a single department, several departments or all departments | **Master setup → Tenants & calendar scope** — single (default: IT), multiple (pick departments) or all; every operational screen follows it |

### Demo profiles (switch from the avatar menu, top-right)

Pick the **group of company**, then the **entity** — the profile list then shows only that entity’s employees, never all profiles from multiple entities at once, and never another tenant’s people.

**The portal opens on Harris Farm Markets** with Angus Harris selected and the calendar scoped to its **single IT department (HIT)**. Use the avatar menu to switch between Angus, Luke, CIO RAM, CTO Phil, Data Head Bharat and the rest of the Harris Farm IT roster. Update job titles in Master setup → Employees and reporting lines on the **Organisation** screen; for either co-CEO, assign department responsibility checkboxes as the organisation expands.

| Persona | Role | Sees |
| --- | --- | --- |
| Angus Harris | Co-CEO · Operations | Current IT department portfolio; additional departments can be assigned later |
| Luke Harris | Co-CEO · Warehouse & Retail Operations | No operational department assigned yet; portfolio note is editable and departments can be added later |
| RAM / Phil / Bharat | CIO / CTO / Head of Data | Their respective IT leadership and delivery streams |
| Swechchha / Greg / Naweesh / Jayden / Ibadur | Delivery / Architecture / stream leads | Nested delivery streams and linked DevOps tickets |
| Harbourline profiles | Separate retail demo tenant | Harbourline entities, IT sample workload and its own tenant-scoped data |
| Arjun Mehta / Layla Al Mansoori | Meridian CEO / Head of Operations | Meridian’s entities and departments — never Harris Farm or Harbourline rows |
| Fatima Noor / Ravi Krishnan / … | Department heads | Own department + reporting line |
| Unit heads / managers / supervisors | Management | Their own reporting tree only |
| Employees | Self-service | Own calendar, own timesheet, own activity register |

The workspace contains **three tenants**. Harbourline and Meridian retain illustrative activity, timesheet, holiday, stand-up, leave and escalation data. Harris Farm has the named IT onboarding roster, linked planning activities and a draft DevOps ticket hierarchy, but **no actual timesheet hours, PTO or stand-up history are fabricated** for those people.

### Harris Farm Markets — default onboarding tenant (IT only)

The entity tree is **Harris Farm Markets (group) → HarrisFarm Markets (company)**. Only the **Information Technology** department is created initially, with DevOps delivery enabled. The roster includes two co-CEOs, CIO RAM, CTO Phil, Data Head Bharat and team, Delivery Head Swechchha, PMO Damien with QA Lead Rahil and BA Lead Natasha, Lead Architect Greg, DevOps Lead Naweesh, Architecture Design Lead Jayden, D365 Lead Ibadur and their teams. Reporting lines are drawn and re-parented on the **Organisation** screen — the whole structure is below in [`docs/HARRIS_FARM_ONBOARDING.md`](docs/HARRIS_FARM_ONBOARDING.md). Department portfolios, designations, remote/contractor status and supporting streams can be edited in **Master setup → Employees**; streams and leads are configurable in **DevOps delivery → Streams & leads**.

Activities are seeded as clearly labelled one-hour planning placeholders for ticket follow-up, requirements gathering, planning, QA, architecture and D365 work. Confirm the schedule and plan with each resource. When work is performed, log actual effort against the linked activity in **Timesheets**; no actual hours are pre-populated.

### Harbourline Retail Australia — separate retail demo tenant and IT capex programme

**Harbourline Retail Australia** is a separate example tenant, with its own group → company → sub-company tree, Australian country/timezone rules (AUD reporting currency), retail departments (Store Operations, Merchandising, Finance, Supply Chain, Digital, People & Culture) and a 33-person **Information Technology (PMO)** department.

- **110 IT projects** across delivery, operations, security, data & analytics, infrastructure, integration, digital experience, enterprise apps, network and compliance.
- **Calendar scope: single department (Information Technology, RIT)** in the Harbourline example tenant. Change it to *multiple* or *all* in **Master setup → Tenants & calendar scope** and every operational screen follows.
- **30 capital projects** (board-funded capex, AASB 138 development effort) and **80 operational run projects** that are expensed.
- Project tasks are real activities on the calendar/timesheet, so resources log daily effort against the exact task.
- The **Capitalisation pack** screen reports only capital-project development effort, converts hours to fully-loaded AUD cost, reconciles every expensed hour, and drives a submit → board decision workflow with an audit trail.
- Non-capital effort (operational projects, BAU support, training, discovery) never appears in the capitalisation pack but remains in the standard **Timesheets** and **Performance & escalation** utilisation reports.

Capitalisation policy (editable in the workspace data): eligible phases `design`, `build`, `test`, `deploy`, `hypercare`; excluded phases `discovery`, `support`, `training`; each capital project carries its own capitalisation rate and window. Approver: Board Audit & Risk Committee on recommendation of the CIO and CFO.

---

## 2. How the numbers are calculated

```
capitalised hours = Σ (logged hours on capital-project development tasks × project capitalisation rate)
capitalised cost  = capitalised hours × fully-loaded hourly cost (AUD)
capitalisation rate % = capitalisable capital-project hours ÷ all logged IT hours

capacity        = contracted weekly hours ÷ 5 × working days in the period
                  (working days exclude the country's weekly-off days and public holidays)
                  for a running period only elapsed days count, so Monday is not "20% utilized"

utilization     = logged timesheet hours ÷ capacity × 100
utilizationScore= 100 − |utilization − 85| × 1.3        (clamped 0–100; punishes both idle and overload)
onTimeRate      = completed activities whose deadline has passed ÷ all activities whose deadline has passed
completionRate  = average delivery progress of in-period activities (completed = 100)
score           = 40% utilizationScore + 35% onTimeRate + 25% completionRate

capacity on leave = capacity − approved PTO hours in the period
                    (leave is a separate bucket, so it is never scored as under-utilisation)

PTO hours       = working days in the approved range × (contracted weekly hours ÷ 5)
                  working days exclude the country's weekly-off days AND public holidays
public holiday (PH) hours = public-holiday days inside the range × daily hours  → reported separately, never counted as PTO
PTO remaining   = tenant PTO entitlement (working days) × daily hours − approved annual-leave hours
                  (sick, unpaid, parental, study and other leave are tracked outside the PTO balance)
```

Calendar scope is a per-tenant master setting: `single` (one department — Harris Farm IT / `HIT` by default), `multiple` (an explicit list) or `all`. It filters departments, people, activities, timesheets, stand-ups, projects, capitalisation packs, PTO and performance on every operational screen and in the AI guide's live context; the signed-in person's own department is always kept so nobody is locked out of their own calendar.

Escalation rule: at the end of every day/week/month/quarter, any department whose score is below the configured threshold (default **70**) produces one escalation record per period. Recipients: **department head (To)**, **Head of Operations (CC)**. Duplicate suppression is by `(department_id, period, period_start)`. The pilot keeps recent editable audit entries and escalation acknowledgement/closure statuses. Immutable, server-attributed audit logging and automatic delivery are future work.

---

## 3. Run it locally

Requires **Node 22.x** (see `.nvmrc`):

```bash
npm ci
cp .env.example .env
npm run dev      # website + same-origin API at http://localhost:5173
npm run check    # type-check, PostgreSQL/API tests, sync tests, build, all-screen/store smoke tests
npm run build    # type-check + production frontend build into dist/
npm run preview  # static browser-only demo, not the shared API
npm run db:init  # one-shot: create the Neon schema + seed the pilot dataset if empty
```

Without database variables, the app explicitly uses browser-only `localStorage`. **Avatar menu → Reset demo data** resets only this local demo. To test shared storage, edit the ignored `.env` with a separate development Neon connection and authentication secrets; never put them in `VITE_*` variables or source control.

Individual checks:

```bash
npm test              # embedded PostgreSQL + real API + workforce rules + shared React store/sync tests
npm run test:workforce # privacy, delegation, duration, hierarchy and real store ownership checks
npm run smoke         # all screens inside jsdom
npm run smoke:store   # store CRUD, time entries, holiday generation, escalation and personas
npm run smoke:tenancy # tenant isolation, PTO/PH maths, calendar-scope master setting
npm run smoke:leave   # store-level tenant switching and the leave request → approval lifecycle
```

## 4. Existing Vercel deployment + Neon Free

**Keep the project already deployed on Vercel and connected to this GitHub repository.** `main` remains the production branch. `vercel.json` configures the Vite build and three Node serverless API functions; no separate backend service is needed.

One-time setup in your own dashboards:

1. Create/connect a **Neon Free** project. Copy its pooled PostgreSQL URL with `sslmode=require`.
2. In the **existing Vercel project → Settings → Environment Variables**, set server-only `DATABASE_URL`, `WORKSPACE_PASSWORD` (≥16 characters) and independent `SESSION_SECRET` (≥32 characters) for **Production**.
3. Redeploy. Environment-variable changes do not alter an already built deployment.
4. Optional but recommended: with the same three values in your local ignored `.env`, run `npm run db:init -- --dry-run` and then `npm run db:init`. This creates the schema and seeds the pilot dataset *before* anyone opens the app, so the first page load and every refresh is a plain read. It is idempotent and never overwrites an existing workspace.
5. Open the same Vercel HTTPS URL on any computer/phone, sign in, and wait for **Saved to Neon** after changes. A second device can load the same data. Already-open tabs have **Refresh** and a safe conflict warning. If Neon is asleep, the app retries up to five times, then pauses and offers **Retry now** and **Reload page**.

Until configured, the public site stays an explicitly labelled **browser-only demo**, not a working shared database. Never publish credentials, disable the password gate, or give production database access to arbitrary preview builds.

**Free is conditional:** choose Neon Free and stay within quotas. Vercel Hobby has personal/non-commercial eligibility restrictions; business use may require another plan/provider. No unlimited free usage or production SLA is promised. The snapshot API has a **3 MB pilot limit**, and everyone with the shared password has full workspace access. Account provisioning, sensitive variables and live verification still require access to your provider accounts.

Full instructions, two-device verification, free-tier caveats, backups/restore, and troubleshooting: **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**. GitHub Actions runs verification on PRs and `main`; GitHub Pages deployment is manual and serves only the local demo.

## 5. Architecture at a glance

```text
Browser on any device
        │ same-origin HTTPS + HttpOnly session
        ▼
Existing Vercel project (GitHub main → production)
  React SPA + /api/config + /api/session + /api/workspace
        │ parameterized SQL over HTTPS; credentials never in the browser
        ▼
Neon Free PostgreSQL
  Versioned workspace snapshot + persistent sign-in attempt limits
```

Every `/api/*` call first passes an in-process request guard (per-client sliding-window rate limits, a 5 s read micro-cache with `ETag`/`304` revalidation, a negative cache with a Bloom filter for known misses, and a circuit breaker for transient Neon outages) so repeated, abusive or pointless requests never reach the database — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#request-guard-rate-limits-negative-caching-and-bloom-filters-serverrequest-guardmjs). Writes are debounced and serialized, with atomic revision checks in Postgres. Transient failures receive up to five automatic retries; schema, permissions and credential failures stop and show repair steps instead of causing an endless refresh loop. The first successful attempt seeds an empty database once. Conflicting/offline edits stay in the current tab for export or retry instead of silently overwriting newer remote changes. Persona selection is device-local; shared company data is not cached in localStorage. This is one trusted pilot workspace, not a normalized enterprise backend.

See [`docs/architecture.svg`](docs/architecture.svg) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Real OAuth calendar sync, SSO, server-enforced employee scopes, durable scheduled delivery and immutable audit logging are **planned, not implemented**. The actual Neon schema is [`docs/neon.sql`](docs/neon.sql); the older [`docs/schema.sql`](docs/schema.sql) is a Supabase-specific future reference and must not be run for this deployment.

---

## 6. Screens

| Screen | Purpose |
| --- | --- |
| **Command centre** | Portfolio KPIs, 8-period trend, department scorecard, attention queue with one-click escalation, today across the group, sync health |
| **Department calendar** | Year board (12 mini months), quarter (3 month grids), month grid, team-week swimlanes per employee, day timeline; every day cell holds every task with an inline “+N more”; public holidays with reason; right rail for the selected day, employee review and upcoming non-working days |
| **Activity register** | Filterable register of every activity with inline status changes, progress, sync state, CSV and .ics export |
| **Roadmap timeline** | Hierarchical rows (department → heads → leads → members → activity → subtask) against year/quarter/month/ISO-week/day/date columns, 13/26/52-week horizon |
| **Timesheets** | Expandable Team week (department/head/lead/member/person/activity, click a permitted cell to log), entry history, reporting-lead approval queue, plan-vs-actual; optional project/task link for capitalisation |
| **Leave & PTO** | Plan a holiday (tentative date → line manager approval → approved PTO), PTO balance excluding public holidays (PH), approval queue for line managers and above, team leave calendar with PH badges, who is away and who is next responsible |
| **Daily stand-up** | Member check-in form (last working day, progress, blockers, action items, internal/cross-functional support), department board grouped top-to-bottom by reporting layer with acknowledge/resolve callout lifecycle, executive pulse for CEO/COO, and a per-department pulse card on the command centre |
| **IT projects & capex** | 110-project register with portfolio, category, stage, capex, capitalisation rate, delivery progress and task-level effort |
| **Capitalisation pack** | Board pack in AUD: capitalised hours and cost by resource/project, excluded effort reconciliation, AASB 138 evidence, board submission and decision log |
| **Performance & escalation** | Department matrix across all metrics, employee scorecards, escalation log, rule engine, generated email |
| **Calendar sync** | Provider cards, per-employee connections, sync queue log, production checklist, troubleshooting |
| **Organisation** | Reporting-line chart of every person in the workspace, drawn from the employee register. Drag-and-drop re-parenting with cycle and self-report protection, a top-level drop zone, search that keeps the line above a person in view, a keyboard-friendly change-manager picker, a flat reporting directory, move-impact notes and the audited history of every line change |
| **Master setup** | Editable tenants & calendar scope (single / multiple / all departments, PTO entitlement), entities, departments, sub-departments/streams, designations, employees, holidays/weekends, group settings, audit trail, full JSON backup |
| **What’s new** | Every user-visible release, newest first, with a link to the screen each change lives on — rendered from the same release log that generates `docs/CHANGELOG.md` |

---

## 7. Repository layout

```text
api/                  Vercel function entry points (config, session, workspace)
server/               shared Node API, authentication, validation, Neon repository
src/
  components/         layout, modals, charts, workspace login and save status
  data/               12-country holiday engine, tenant register, leave/retail seeds and the release log (releases.ts)
  lib/                analytics, capitalisation, tenant isolation, leave/PTO, ownership/sharing rules, time reconciliation, exports, dates, shared-state sync
  pages/              one file per screen
  store.tsx           state/actions + local-demo or shared-Neon persistence
  types.ts            domain model
tests/                real HTTP/API and embedded PostgreSQL tests
scripts/              UI/store/shared-sync smoke checks + owner seed (db:init) and backup restore
docs/
  DEPLOYMENT.md       existing Vercel + Neon Free setup, verification and recovery
  ARCHITECTURE.md     implemented pilot and production roadmap
  CHANGELOG.md        release notes generated from src/data/releases.ts (never hand-edited)
  neon.sql            actual runtime pilot schema (auto-created by the API)
  schema.sql          legacy Supabase relational-design reference only
  architecture.svg
.github/workflows/    CI verification + optional manual static Pages demo
vercel.json           existing Vercel project build/API configuration
.env.example          secret names only; actual .env is ignored
```

## 8. Honest limitations

- **Shared storage needs setup.** With no Neon variables, data remains local to the browser. A successful static deployment does not automatically create/connect Neon.
- **Trusted pilot only.** Shared-password holders can access all records. Employee/persona scope and tenant isolation are enforced by the application over one shared snapshot, not by per-tenant authentication or row-level policies in the database; audit entries are not tamper-proof.
- **Tenant isolation is application-level.** No screen, calculation or export can read another tenant’s rows, and writes merge back per tenant — but the raw JSONB snapshot is still one trusted workspace protected by one shared password.
- **Snapshot scale.** One versioned JSONB workspace, 3 MB request limit, full-state saves and explicit conflict handling. Record-level APIs, individual identities and migrations are needed before broad or sensitive production use.
- **Calendar sync is simulated.** No OAuth tokens are stored and no external mailbox is touched. `.ics` exports are real downloads, not subscriptions.
- **Emails are composed, not sent.** Use Copy/Open in mail app. There is no automatic background delivery.
- **Future holidays are projections.** Lunar-calendar dates remain tentative; verify official announcements.
- **Scores run client-side.** Move the same formulas and authorization to server-side queries before relying on them operationally.
- **Free tiers have constraints.** Monitor Neon quotas and verify that your Vercel plan permits your use case. Arrange/test backups; the free pilot is not a payroll-grade service or SLA.
