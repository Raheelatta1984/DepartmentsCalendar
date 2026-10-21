# Orbit — long-term, reliable and scalable design (free to start)

This document answers the question behind the prototype: *what should this portal actually run on if it must stay reliable for a group of companies, scale to thousands of employees, and cost roughly nothing while it proves itself?*

---

## 1. The recommendation in one table

| Layer | Choice | Free tier | Why this one |
| --- | --- | --- | --- |
| Front end | **React + Vite + TypeScript** (this repo) | Vercel / Cloudflare Pages / Netlify — free | Static, fast, no server to patch; deploys in minutes; works on a phone |
| Database + Auth + API | **Supabase** (managed Postgres) | 500 MB DB, 5 GB egress, 50k MAU, unlimited API requests | Real SQL (needed for the workload maths), Row Level Security for the bottom-to-top visibility rules, built-in auth (Microsoft/Google SSO), realtime updates |
| Background jobs | **Supabase Edge Functions** (Deno) or **Cloudflare Workers** on cron | 500k invocations (Supabase) / 100k requests/day (CF) | Calendar sync, escalation scan and holiday refresh are scheduled jobs — no server to babysit |
| Corporate calendar | **Microsoft Graph** (`/me/events`) | Free with any Microsoft 365 tenant | Native Outlook sync; delegated permissions mean nobody's password is stored |
| Optional calendar | **Google Calendar API v3** | Free for internal use | Per-user OAuth; same event model |
| Email | **Graph `sendMail`** (from the signed-in PMO mailbox) or **Resend** | 3 000 emails/mo (Resend) | Escalation to department head + CC Head of Operations |
| Holiday source | **Nager.Date** / **`python-holidays`** + manual overrides | Free, no key for Nager.Date | 100+ countries; stored in your DB so the portal never depends on a live third party |
| Monitoring | **Sentry** free (5k errors/mo), Supabase logs, UptimeRobot | Free | You need to know when sync fails before the CEO does |
| Files/exports | generated in the browser (CSV/ICS) | — | No storage cost for exports |

**Why not Google Sheets / SharePoint lists / Notion?** They are excellent for a 10-person tracker and bad at this problem: no per-row permissions that follow a reporting tree, no reliable relational integrity between entity → department → employee → activity → time entry, no transaction-safe background sync, and no auditable scoring. A group with sub-companies, hourly workload and escalation obligations needs a real relational store.

**Why Postgres over Firestore/Mongo?** The product is inherently relational and heavy on aggregation (`SUM(hours) GROUP BY department, week`). SQL makes the workload maths a single indexed query and keeps the score reproducible and auditable. Supabase gives you Postgres without operating it.

**Why a monolith-with-jobs rather than microservices?** At 50–5 000 employees, one database plus three scheduled functions is simpler, cheaper and more reliable than a service mesh. The seams (auth, sync, escalation) are already separable if scale demands it.

---

## 2. Domain model

```
entities (group / company / sub_company, self-referencing parent)
   └── departments (head_id, ops_owner_id, cost_centre, colour)
         └── employees (role, manager_id self-FK, country_code, weekly_hours)
               ├── activities (assignee_id, department_id, entity_id, start/end, planned_hours)
               │     └── activity_subtasks
               └── time_entries (activity_id, date, hours, billable, approved_by)
calendar_connections (employee_id, provider, tokens, two_way)
sync_jobs (activity_id, provider, action, status, attempts, last_error)
holidays (country_code, date, name, type)   country_config (weekly_off[])
escalations (department_id, period, period_start, score, recipients[], cc[], status)
audit_log (actor_id, action, entity, entity_id, before, after)
```

Full DDL, constraints, indexes, RLS policies and metric views: [`schema.sql`](schema.sql).

Design decisions worth knowing:

- **Soft delete** (`deleted_at`) on everything that can appear in an audit trail. The escalation and audit tables are append-only.
- **Money/hours are `numeric`**, never floats: `hours numeric(5,2)`.
- **`activities` stores a timezone-independent date pair plus an optional time window**; all "today/this week" logic is evaluated in the *employee's* timezone on the server. Never trust the browser clock for reporting.
- **Activity ID is the calendar event UID** (`orbit-{uuid}@group.example`), which makes every sync operation idempotent.
- **One row per employee per day per activity in `time_entries`** with a unique constraint on `(employee_id, activity_id, entry_date)` if you prefer single submission per day, or allow multiples with a note. The demo allows multiples because splitting a day across two tasks is normal.

---

## 3. Roles, scope and Row Level Security

Roles (in order): `employee` → `supervisor` → `manager` → `unit_head` → `department_head` → `head_operations` → `ceo`.

The prototype ships the same logic in TypeScript (`src/lib/permissions.ts`); in production it becomes SQL so it cannot be bypassed by calling the API directly:

```sql
-- Everyone can read their own row; managers read their whole reporting tree.
create or replace function app.can_view_employee(target uuid)
returns boolean language sql stable security definer as $$
  with recursive tree as (
    select id from public.employees where id = auth.uid()
    union all
    select e.id from public.employees e join tree t on e.manager_id = t.id
  )
  select exists (select 1 from tree where id = target)
      or app.is_executive()               -- CEO / Head of Operations
      or app.is_department_head_of(target);
$$;
```

Policy summary:

| Table | Employee | Supervisor/Manager | Department head | Head of Operations | CEO |
| --- | --- | --- | --- | --- | --- |
| own activity / timesheet | read+write | read+write | read+write | read | read |
| team activities | — | read (reporting tree) | read (department) | read (all operational) | read (group) |
| timesheet approval | — | approve own tree | approve department | read | read |
| department master | — | — | edit own department | edit operational | edit all |
| entities / holidays / settings | — | — | — | edit | edit |
| escalation log | own record | — | own department | all | all |

Enforcement notes:

- Use **one Postgres role + RLS**, never service-role keys in the browser. Only Edge Functions get the service key, and only for sync workers and the escalation scan.
- Aggregate views (department scores) are exposed through `security definer` views or RPCs that return **only aggregates** — the CEO sees hours per department without automatically seeing a junior's private notes.
- SSO: Supabase Auth supports **Microsoft Entra ID** and **Google**. Map the IdP group/role claim to `employees.role`; keep `employees.manager_id` as the single source of truth for scope.
- Sessions: short-lived JWT, refresh rotation, MFA enforced at the IdP for executives.

---

## 4. Calendar synchronisation (Outlook first, Google optional)

### 4.1 Microsoft 365 / Outlook

1. **Entra ID app registration** (free): multi-tenant if you serve several companies, single-tenant if one group.
2. Delegated permissions: `Calendars.ReadWrite`, `User.Read`, `offline_access`; add `Mail.Send` only if sending escalation mail as the signed-in PMO.
3. Admin consent once per tenant; users connect from **Calendar sync → Connect**.
4. Store the refresh token **encrypted at rest** (Supabase Vault / `pgcrypto` with a key in Edge Function secrets). Never in a public table, never in the browser.
5. Write events with `POST /me/events` (create) / `PATCH /me/events/{id}` (update) / `DELETE` (cancel). Send `transactionId` and a stable `iCalUId` for idempotency.
6. Use `showAs` = `busy` for meetings, `free` for multi-day effort tasks, and a category `Orbit / <department>` so users can filter.
7. Subscribe to **change notifications** (`/subscriptions`, max ~3 days, renew by cron) to pull edits made directly in Outlook back into Orbit (two-way mode). Until then, one-way Orbit → Outlook is the safest default.

### 4.2 Google Calendar

- Google Cloud project → OAuth consent screen → *Internal* (no verification needed) → `calendar.events` scope.
- Offline access for refresh tokens; the worker refreshes and retries once on `401`.
- Same idempotency strategy with `event.id` = activity UUID (base32hex-safe) or `iCalUID`.

### 4.3 Sync worker design

```
on activity insert/update/delete  →  enqueue sync_jobs (status=queued)
cron every 2 minutes             →  claim N jobs with SELECT … FOR UPDATE SKIP LOCKED
                                 →  group by (employee, provider), batch where possible
                                 →  call Graph / Google with exponential backoff + jitter
                                 →  mark synced | failed (attempts++, next_attempt_at)
                                 →  dead-letter after 8 attempts, alert PMO
```

- **Idempotent by construction**: the job carries the provider event ID; replays are harmless.
- **Rate limits**: Graph throttles per mailbox (~10 000 requests/10 min); batch with `$batch` (20 requests) and smooth with a per-mailbox queue. Google quota is 1 M units/day — comfortably enough for a mid-size group.
- **Conflict policy (two-way)**: last-write-wins on `lastModifiedDateTime`, but never overwrite `title`/`start` if the Orbit activity is `completed`; record a `sync_conflicts` row for review.
- **Privacy**: only the assignee's own mailbox is written; managers view the calendar **inside Orbit** under RLS, not by reading other people's mailboxes.
- **Failure UX**: a visible failed count on the dashboard and a retry button per job — silence is the enemy.

### 4.4 Fallback that works on day one

The app exports a standards-compliant **`.ics`** file (real `VEVENT`s with `UID`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `LOCATION`, `CATEGORIES`). A PMO can publish this as a subscribed calendar from any static host before OAuth is approved. This is already implemented in `src/lib/export.ts` and is the recommended go-live stepping stone.

---

## 5. Escalation engine

- Scheduled function at **17:30 in each entity's timezone**, or one global run at 18:00 GST with per-entity offsets.
- For every department, compute the period score using the SQL metric views (identical formula to the UI).
- If `score < threshold` and no escalation exists for `(department_id, period, period_start)`, insert one and send mail:
  - **To:** `department_head.email`
  - **CC:** `head_operations.email`, plus optional `ceo.email` for critical (<50) scores
  - **Body:** score, utilization, on-time rate, overdue count, link to the filtered calendar and the top three blocked activities.
- Retry email independently of the score record (transactional outbox pattern) so a mail outage never loses the record.
- Acknowledgement and closure are explicit statuses; unresolved escalations appear in the Head of Operations' dashboard until closed.
- **Dedupe + digest:** cap at one email per department per period; a daily digest prevents alert fatigue.

---

## 6. Holidays and country calendars

- Seed the database from **Nager.Date** (`https://date.nager.at/api/v3/PublicHolidays/{year}/{country}`) or `python-holidays`, then store the rows. The portal never calls the API at runtime.
- Refresh annually by cron for `holiday_horizon_years` (default 5). Merge, never delete manual overrides.
- **Lunar/religious holidays** (Eid, Ramadan, Diwali, Chinese New Year, Vesak) are moon-sighting dependent: keep `is_tentative boolean` and surface "tentative" in the tooltip. Never let payroll or SLA penalties hinge on a projected date without a manual confirmation step.
- **Weekly off** is per country (Fri–Sat in the Gulf, Sat–Sun in the West, Sun in India/Pakistan) and is stored in `country_config.weekly_off` as an int array. It directly changes capacity, so a wrong setting silently corrupts every score — make it visible on the settings screen (it is).
- Company-specific shutdowns (e.g. Eid closure for a whole group) are `company_holiday` rows scoped by entity.

---

## 7. Reporting performance

At 5 000 employees × ~8 activities/day × 250 days ≈ 10 M activity rows and 3–5 M timesheet rows per year. Postgres handles this comfortably if you:

1. Index `time_entries (employee_id, entry_date)` and `(department_id, entry_date)` via a denormalised `department_id`.
2. Keep **materialized views** `mv_department_period_scores` and `mv_employee_period_scores`, refreshed after each timesheet write (or every 15 min) with `CONCURRENTLY`.
3. Partition `time_entries` and `activities` by year once past ~20 M rows; archive closed years to cold storage.
4. Cache the dashboard response per user/period for 60 seconds (HTTP `Cache-Control` + Supabase).
5. Never compute scores in the browser in production; the UI reads the same numbers everyone else sees.

Storage estimate: one timesheet row ≈ 150 bytes → 5 M rows ≈ 750 MB, so a group of ~500 staff stays inside the 500 MB free tier for about a year if you archive closed periods to a free-tier export. Beyond that, Supabase Pro is $25/month — still far below the cost of the custom trackers this replaces.

---

## 8. Security, privacy and governance

- **Least privilege**: RLS, no service keys client-side, scoped OAuth tokens per employee.
- **Audit**: append-only `audit_log` for master-data changes, escalation status changes and timesheet approvals (who, when, before/after).
- **Data minimisation**: the portal stores activity titles, hours and outcomes — not email bodies or attachments. Optional activity descriptions should not be used for HR performance decisions without a policy note.
- **Retention**: keep timesheets for the statutory period in your jurisdiction (often 5–7 years); delete calendar tokens immediately on offboarding (`disconnect` cascades).
- **Residency**: choose the Supabase region closest to the group (e.g. `ap-southeast-2` Sydney, `me-central-1` for the Gulf) — free tier still lets you pick a region.
- **Right to erasure**: soft-delete the employee, hard-delete PII in a scheduled job, keep anonymised hours for historical reporting.
- **Backups**: nightly `pg_dump` to free object storage (Supabase Storage or Cloudflare R2); test a restore quarterly. Supabase free tier has no PITR — this is the single most important thing to add before you trust it with payroll-adjacent data.
- **Exit plan**: standard Postgres — the schema and data move to Neon, RDS or on-prem without rewrites.

---

## 9. Free-tier reality check

| Service | Free limit | What happens at the limit | Mitigation |
| --- | --- | --- | --- |
| Supabase | 500 MB DB, 5 GB egress/mo, pauses after 7 days of inactivity | Project pauses (data safe, needs manual unpause) | A daily cron `select 1` keeps it warm; archive old years |
| Vercel Hobby | 100 GB bandwidth, non-commercial use | Throttle/ask to upgrade | Cloudflare Pages has no bandwidth cap and allows commercial use |
| Graph | Included with M365 licences | Throttling (429) | Queue + backoff already designed |
| Google Calendar | 1 M quota units/day | 403 quota exceeded | Per-user pacing; batch |
| Resend | 100 emails/day, 3 000/mo | Rejections | Digest emails; Graph sendMail as fallback |
| Sentry | 5k errors/mo | Sampling stops | Fine for a pilot |

**Scale trigger points:** >500 employees or >1 M activity rows/year → move to Supabase Pro ($25/mo) and add PITR. >3 000 employees → dedicated read replica and a separate reporting schema. Neither is a rewrite; both are configuration changes.

---

## 10. Phased delivery plan

| Phase | Scope | Effort (1–2 devs) |
| --- | --- | --- |
| **0 — Validate** (this repo) | Clickable prototype, scoring model agreed, holiday data reviewed | done |
| **1 — Pilot** | Supabase schema + RLS, Entra SSO, activities/timesheets live, one department | 2–3 weeks |
| **2 — Calendar** | Graph one-way sync + `.ics` subscription fallback, sync log and retries | 2 weeks |
| **3 — Governance** | Materialized score views, escalation engine + email, Head of Operations dashboard, audit trail | 2 weeks |
| **4 — Rollout** | Entity/department/employee import (CSV or Graph directory), Google option, mobile polish, training | 2–3 weeks |
| **5 — Scale** | Two-way sync via webhooks, approvals workflow, client billing exports, SSO group mapping, PITR/backups | ongoing |

Data migration from spreadsheets: provide CSV templates for employees (name, email, code, role, manager email, department, country, weekly hours) and let the importer resolve `manager_email` into `manager_id` after insert.

---

## 11. What I would monitor from day one

1. **Sync success rate** per provider (target >99%) and the age of the oldest queued job.
2. **Timesheet submission rate** — % of employees with an entry yesterday. Under 80% means the score is measuring data quality, not performance.
3. **Escalation volume** per week — a sudden spike usually means a threshold that is too high, not a collapse in performance.
4. **Holiday/calendar freshness** — last refresh date per country.
5. **Auth failures** and session refreshes, especially around SSO certificate rollover.

---

## 12. Why this design will still make sense in five years

- The **data model is the product**; the UI can be rewritten without touching a single timesheet.
- Everything runs on **open standards**: Postgres, OAuth2/OIDC, iCalendar, REST. No proprietary lock-in.
- **Calendar sync is idempotent and observable**, so adding providers (Apple/iCloud via CalDAV, Teams meetings) is incremental.
- The **score formula is explicit and versioned** (see the settings screen); if governance changes the weights, old periods keep their historical scores.
- Costs start at **zero** and grow in predictable steps tied to headcount, not to executive urgency.
