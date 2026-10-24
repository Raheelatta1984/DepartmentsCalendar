# Orbit — Department Activity, Workload & Roadmap Portal

A working, deployable prototype of the portal you described: **every department's daily activity, follow-ups, appointments, meetings, seminars, sessions and tasks exposed up the chain from the newest employee to the CEO**, with workload measured from hours actually spent, a central calendar per department and per person, country-aware public holidays, timesheets, performance scoring and automatic escalation to the department head with the Head of Operations in copy.

Built with React + TypeScript, with a deterministic product demo and an optional **shared Neon Free PostgreSQL workspace on the existing GitHub-linked Vercel deployment**. The frontend and server-only API deploy together. Follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) to connect Neon and configure secrets; merging code alone does not create a database.

**Pilot access model:** anyone with the workspace password can view and edit the entire shared workspace. Persona switching previews employee scopes but is **not individual authentication or server-enforced authorization**. Do not store sensitive real employee/payroll data yet. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what is implemented versus planned.

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
| Staff / worker management at master level | **Master setup → Employees** (role, reporting line, entity, department, country, contracted hours) |
| Entities / companies and sub-companies so a group of companies fits | **Master setup → Entities** (group → company → sub-company tree, each with country & timezone) |
| Department master with head / responsible assignee | **Master setup → Departments** (head, operations owner, cost centre, calendar colour) |
| Performance matrix daily / weekly / monthly / quarterly / annual | **Performance & escalation** — identical formula at every grain, 8-period trend |
| Low-performing department reported to department head, CC Head of Operations | **Attention queue → Escalate** and the **rule engine**; generates a ready-to-send email with To/CC and full audit record |
| Head of Operations sees only the departments he is responsible for | Preview role scope: COO sees every operational department (owner field), not the rest of the group |
| Daily timesheet by activity, review where time was spent vs the planned task | **Timesheets** — team week grid, entry history, approvals, plan-vs-actual |
| Daily department stand-up: last working day update, progress, blockers, support requests, action items of the day | **Daily stand-up** tab — one check-in per member per working day, department board layered head → manager → supervisor → employee, internal & cross-functional support callouts |
| Only department heads / managers / supervisors track their department's stand-up progress; CEO/COO see a high-level summary and drill in department by department | **Role-scoped stand-up board** (supervisor rank and above) + **Executive pulse** for CEO/COO; plain employees only see their own form; a **stand-up pulse card** on the command centre shows per-department submission, blockers and support callouts |
| Roadmap with department/employee/task/subtask rows, columns for year, quarter, month, week number, day and date | **Roadmap timeline** with all six header rows, collapsible hierarchy, holiday shading and today marker |
| Country-specific weekly off + public holidays for the next 5 years, with reason shown | **Master setup → Holidays & weekends** (12 countries, multi-year generation, per-country weekend toggles) and shading in calendar/roadmap |
| Track IT effort by project/task and capitalise it for the board | **IT projects & capex** portfolio (110 projects) + **Capitalisation pack** (AASB 138, AUD) with monthly board approval of resource hours |
| AI guide that helps on every screen, toggleable on/off | **AI guide panel at the top of every tab and section** — GUIDE badge, italic promise, prose explanation, numbered **Do this** steps, one **Watch** caution and a collapsible **Live context** block computed from the same live snapshot the screen reads. It follows the section / sub-tab in focus, folds to a single line, and hides with × or the top-bar toggle |
| Dashboard focused on one legal entity | **Command centre → entity picker** — all entities in scope, a group of companies, a company or one of its subsidiaries; every card, score, queue and the day board recompute for that entity tree only |
| Select a profile only after group of company and entity, scoped to that company’s people | **Avatar menu → Select profile** — group of company → entity → profile list showing only that entity’s employees |

### Demo profiles (switch from the avatar menu, top-right)

Pick the **group of company**, then the **entity** — the profile list then shows only that entity’s employees, never all profiles from multiple entities at once.

| Persona | Role | Sees |
| --- | --- | --- |
| Arjun Mehta | CEO | All 9 entities, 22 departments, 117 people (Meridian group + Harbourline Retail Australia) |
| Layla Al Mansoori | Head of Operations | All operational departments, portfolio scoring, escalation log |
| Fatima Noor / Ravi Krishnan / … | Department heads | Own department + reporting line |
| Unit heads / managers / supervisors | Management | Their own reporting tree only |
| Employees | Self-service | Own calendar, own timesheet, own activity register |

The data deliberately contains a realistic mix: 1 100+ activities, 6 000+ timesheet entries, 890+ holiday records, 570+ daily stand-up entries (with blockers, internal/cross-functional support callouts and 1 100+ action items), calendar connections in connected/pending/disconnected states, and a few departments under the 70-point threshold so the escalation flow has something to act on.

### Harbourline Retail Australia — independent retail entity and IT capex programme

The demo now also contains **Harbourline Retail Australia**, a retail group that is completely separate from Meridian: its own group → company → sub-company tree, Australian country/timezone rules (AUD reporting currency), retail departments (Store Operations, Merchandising, Finance, Supply Chain, Digital, People & Culture) and a 33-person **Information Technology (PMO)** department.

- **110 IT projects** across delivery, operations, security, data & analytics, infrastructure, integration, digital experience, enterprise apps, network and compliance.
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
```

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
```

Without database variables, the app explicitly uses browser-only `localStorage`. **Avatar menu → Reset demo data** resets only this local demo. To test shared storage, edit the ignored `.env` with a separate development Neon connection and authentication secrets; never put them in `VITE_*` variables or source control.

Individual checks:

```bash
npm test              # embedded PostgreSQL + real API tests + shared React store/sync tests
npm run smoke         # all 8 screens inside jsdom
npm run smoke:store   # store CRUD, time entries, holiday generation, escalation and personas
```

## 4. Existing Vercel deployment + Neon Free

**Keep the project already deployed on Vercel and connected to this GitHub repository.** `main` remains the production branch. `vercel.json` configures the Vite build and three Node serverless API functions; no separate backend service is needed.

One-time setup in your own dashboards:

1. Create/connect a **Neon Free** project. Copy its pooled PostgreSQL URL with `sslmode=require`.
2. In the **existing Vercel project → Settings → Environment Variables**, set server-only `DATABASE_URL`, `WORKSPACE_PASSWORD` (≥16 characters) and independent `SESSION_SECRET` (≥32 characters) for **Production**.
3. Redeploy. Environment-variable changes do not alter an already built deployment.
4. Open the same Vercel HTTPS URL on any computer/phone, sign in, and wait for **Saved to Neon** after changes. A second device can load the same data. Already-open tabs have **Refresh** and a safe conflict warning.

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

Every `/api/*` call first passes an in-process request guard (per-client sliding-window rate limits, a 5 s read micro-cache with `ETag`/`304` revalidation, a negative cache with a Bloom filter for known misses, and a circuit breaker for Neon outages) so repeated, abusive or pointless requests never reach the database — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#request-guard-rate-limits-negative-caching-and-bloom-filters-serverrequest-guardmjs). Writes are debounced and serialized, with atomic revision checks in Postgres. Conflicting/offline edits stay in the current tab for export or retry instead of silently overwriting newer remote changes. Persona selection is device-local; shared company data is not cached in localStorage. This is one trusted pilot workspace, not a normalized enterprise backend.

See [`docs/architecture.svg`](docs/architecture.svg) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Real OAuth calendar sync, SSO, server-enforced employee scopes, durable scheduled delivery and immutable audit logging are **planned, not implemented**. The actual Neon schema is [`docs/neon.sql`](docs/neon.sql); the older [`docs/schema.sql`](docs/schema.sql) is a Supabase-specific future reference and must not be run for this deployment.

---

## 6. Screens

| Screen | Purpose |
| --- | --- |
| **Command centre** | Portfolio KPIs, 8-period trend, department scorecard, attention queue with one-click escalation, today across the group, sync health |
| **Department calendar** | Year board (12 mini months), quarter (3 month grids), month grid, team-week swimlanes per employee, day timeline; every day cell holds every task with an inline “+N more”; public holidays with reason; right rail for the selected day, employee review and upcoming non-working days |
| **Activity register** | Filterable register of every activity with inline status changes, progress, sync state, CSV and .ics export |
| **Roadmap timeline** | Hierarchical rows (department → employee → activity → subtask) against year/quarter/month/ISO-week/day/date columns, 13/26/52-week horizon |
| **Timesheets** | Team week grid (click a cell to log), entry history with approvals, approval queue, plan-vs-actual; optional project/task link for capitalisation |
| **Daily stand-up** | Member check-in form (last working day, progress, blockers, action items, internal/cross-functional support), department board grouped top-to-bottom by reporting layer with acknowledge/resolve callout lifecycle, executive pulse for CEO/COO, and a per-department pulse card on the command centre |
| **IT projects & capex** | 110-project register with portfolio, category, stage, capex, capitalisation rate, delivery progress and task-level effort |
| **Capitalisation pack** | Board pack in AUD: capitalised hours and cost by resource/project, excluded effort reconciliation, AASB 138 evidence, board submission and decision log |
| **Performance & escalation** | Department matrix across all metrics, employee scorecards, escalation log, rule engine, generated email |
| **Calendar sync** | Provider cards, per-employee connections, sync queue log, production checklist, troubleshooting |
| **Master setup** | Entities, departments, employees, holidays/weekends, group settings, audit trail, full JSON backup |

---

## 7. Repository layout

```text
api/                  Vercel function entry points (config, session, workspace)
server/               shared Node API, authentication, validation, Neon repository
src/
  components/         layout, modals, charts, workspace login and save status
  data/               12-country holiday engine + deterministic demo and retail capex datasets
  lib/                analytics, capitalisation engine, permissions preview, exports, dates, shared-state sync
  pages/              one file per screen
  store.tsx           state/actions + local-demo or shared-Neon persistence
  types.ts            domain model
tests/                real HTTP/API and embedded PostgreSQL tests
scripts/              UI/store/shared-sync smoke checks + owner backup restore
docs/
  DEPLOYMENT.md       existing Vercel + Neon Free setup, verification and recovery
  ARCHITECTURE.md     implemented pilot and production roadmap
  neon.sql            actual runtime pilot schema (auto-created by the API)
  schema.sql          legacy Supabase relational-design reference only
  architecture.svg
.github/workflows/    CI verification + optional manual static Pages demo
vercel.json           existing Vercel project build/API configuration
.env.example          secret names only; actual .env is ignored
```

## 8. Honest limitations

- **Shared storage needs setup.** With no Neon variables, data remains local to the browser. A successful static deployment does not automatically create/connect Neon.
- **Trusted pilot only.** Shared-password holders can access all records. Employee/persona scope is a UI preview, not authenticated authorization; audit entries are not tamper-proof.
- **Snapshot scale.** One versioned JSONB workspace, 3 MB request limit, full-state saves and explicit conflict handling. Record-level APIs, individual identities and migrations are needed before broad or sensitive production use.
- **Calendar sync is simulated.** No OAuth tokens are stored and no external mailbox is touched. `.ics` exports are real downloads, not subscriptions.
- **Emails are composed, not sent.** Use Copy/Open in mail app. There is no automatic background delivery.
- **Future holidays are projections.** Lunar-calendar dates remain tentative; verify official announcements.
- **Scores run client-side.** Move the same formulas and authorization to server-side queries before relying on them operationally.
- **Free tiers have constraints.** Monitor Neon quotas and verify that your Vercel plan permits your use case. Arrange/test backups; the free pilot is not a payroll-grade service or SLA.
