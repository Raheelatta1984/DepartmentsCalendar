# Orbit — current architecture and production roadmap

The selected deployment is **the existing GitHub-linked Vercel project + Neon Free PostgreSQL**. Keep that project and production URL. Setup instructions, environment variables, verification, costs, and recovery are in [`DEPLOYMENT.md`](DEPLOYMENT.md).

## 1. What is implemented

```text
Any modern browser / phone / computer
             │ same-origin HTTPS
             ▼
Existing Vercel project (GitHub main → production)
  ├─ React + Vite SPA (dist/)
  ├─ GET    /api/config       storage mode + session status
  ├─ POST   /api/session      shared-password sign-in
  ├─ DELETE /api/session      clear this browser's session
  ├─ GET    /api/workspace    read shared state + revision
  └─ PUT    /api/workspace    validate and compare-and-swap
             │ Neon serverless HTTPS driver
             │ server-only DATABASE_URL, parameterized queries
             ▼
Neon Free PostgreSQL
  ├─ orbit_workspace: one versioned JSONB state document
  └─ orbit_login_limits: hashed address + expiring attempt window
```

Three Vercel function entry points import a common native Node HTTP handler. There is no always-running server in production, no cross-origin API URL, and no database credential in a `VITE_*` variable. The local development server mounts the exact same API alongside Vite on a single port.

### Storage modes

- **Shared**: requires `DATABASE_URL`, `WORKSPACE_PASSWORD`, and `SESSION_SECRET`. The first authenticated visit initializes the database with the pilot dataset once. Thereafter all devices read the same state.
- **Demo**: no database configured, or a static-only build. Explicit amber banner; state is stored only in this browser's localStorage. This preserves the original demo while account setup is pending.
- **Configuration/outage error**: a partially configured shared backend or failed database request never silently falls back to a private local copy.

Shared company data is not cached in localStorage. Only the selected persona ID is remembered per browser. Changing personas does not write to Neon or affect another person's view.

### Consistency and free-tier behavior

- Writes are debounced and serialized. Edits made during an in-flight save use the returned revision for the next save.
- SQL `UPDATE ... WHERE version = expected_version` and `INSERT ... ON CONFLICT DO NOTHING` provide atomic concurrency control across Vercel instances.
- A stale save returns HTTP 409. The browser retains its unsaved edits, offers JSON export, and requires an explicit discard/reload. It never automatically force-overwrites newer remote data.
- Network failures retain unsaved data in the current tab. A before-unload warning asks the user not to close while changes are dirty.
- Manual refresh and refocusing a clean tab after a minute load other devices' updates. There is no continuous polling or keep-alive job, allowing Neon to suspend when idle.
- A strict server-side schema validates fields, collection identifiers and required master records. Snapshot payloads are limited to 3 MB. This design is for a small pilot, **not** large-scale multi-user production.

### Access boundary

The shared password protects the whole workspace. Signed cookies are HttpOnly, SameSite=Strict, Secure in production, and expire after 12 hours. Secrets stay server-side. Mutations reject cross-origin requests; there is no permissive CORS configuration. Login attempt limits are stored in Postgres, not per-instance memory. Secret rotation plus redeployment invalidates previous cookies.

**Every password holder can read and modify every record.** Persona switching and `src/lib/permissions.ts` are product previews only, not authorization. Audit entries can be edited with a snapshot and are not immutable evidence. The pilot must not contain sensitive real employee/payroll data.

## 2. Existing product model

The TypeScript model in `src/types.ts` contains:

- Group → companies → sub-companies; departments with a head and operations owner.
- Employees, reporting lines, roles, working country and weekly hours.
- Activities, subtasks, assignees, dates, priority, status and delivery progress.
- Time entries by employee/activity/day; holidays and country-specific weekly off.
- Escalation records, simulated calendar connections/jobs, settings and recent audit entries.

All screens continue to use the existing analytics and store operations. The deployed pilot persists that complete document instead of pretending that the normalized SQL design is already wired up.

The current metrics run in the browser. Capacity excludes weekly off/public holidays; utilization uses logged effort, not planned time or attendance. `src/lib/analytics.ts` is the current source of truth, and README documents the formula.

Two rules keep the screen and its guidance honest. **Entity focus**: `src/lib/entities.ts` resolves a legal-entity selection to the entity plus its sub-companies, and the command centre intersects that tree with the departments already in role scope — narrowing only, never widening. **Live guide context**: `src/lib/ai-guide-live.ts` derives the top-of-tab guide panel's figures from the same store snapshot and filters the page uses, so the note cannot drift from the numbers above it.

## 3. Before production: individual authentication and authorization

The next phase must replace the shared-password model with individual identities (for example Microsoft Entra ID / Google through an OIDC library). Neon supplies PostgreSQL storage; the current implementation does not provide managed SSO, realtime subscriptions, or employee-level authorization.

Enforce these scopes **on the server** before returning records, not just in React:

| Role | Intended scope (future enforcement) |
| --- | --- |
| Employee | Own activities, calendar and time entries |
| Supervisor / manager / unit head | Their reporting subtree |
| Department head | Own department and reporting line |
| Head of Operations | Departments assigned to their operations portfolio |
| CEO | Group-wide reporting |

Validate tenant boundaries and edits server-side. Use least-privilege database roles and explicit policies/queries. Do not pass a database owner's credentials to browsers. An authenticated employee must not be able to select a CEO persona to acquire rights.

## 4. Record-level PostgreSQL migration

Before concurrent use or data growth makes full snapshots impractical:

1. Normalize the domain into tables with foreign keys and migration history.
2. Replace whole-workspace PUTs with authorized record-level operations and revision checks.
3. Compute scores/aggregates on the server with indexes on department, assignee and date.
4. Introduce tenant IDs and validate them throughout the API.
5. Add append-only, server-attributed audit logging and a documented retention policy.
6. Provide a migration/import tool for existing pilot snapshots and test restoration.

[`schema.sql`](schema.sql) is a **legacy, Supabase-specific design reference**. It assumes `auth.uid()` and Supabase identity services that this Neon application does not have. It is not a runnable Neon migration; adapt its identities, policies and ID types before using the relational design. The actual runtime tables are in [`neon.sql`](neon.sql), mirrored by `server/repository.mjs`.

## 5. Calendar synchronization — not implemented

The UI connection flows and sync jobs remain simulations. `.ics` downloads are real and can be imported into Outlook, Google or Apple Calendar; they are not a live subscription or OAuth connection.

For a real connector:

1. Register a Microsoft Entra application with delegated `Calendars.ReadWrite`, `User.Read` and `offline_access`; enable Google Calendar API with a separate OAuth client if needed.
2. Associate the consented identity with an authenticated employee.
3. Store refresh tokens encrypted server-side, separate from the workspace snapshot; never expose them in browser backups.
4. Add a durable outbox/queue; use the Orbit activity ID as an idempotency key/iCal UID.
5. Persist provider event IDs, retry with backoff and honor provider throttling.
6. Start with outbound create/update/delete; add inbound webhooks, renewal and delta-token reconciliation in a later phase.
7. Verify webhook signatures and ownership; log failures without exposing tokens or personal event details.

A free Vercel deployment does not imply a reliable high-frequency scheduler. Choose a supported durable queue/scheduler and budget separately when enabling this phase.

## 6. Escalation and email — not implemented server-side

The current application can calculate scores and compose escalation emails. It does not send them automatically. A future worker should scan closed periods, enforce one escalation per `(department, period, period_start)`, send to the department head with the Head of Operations copied, and record provider delivery IDs with retries and deduplication.

Never describe simulated sync jobs or generated email text as evidence that a mailbox or external calendar has been touched.

## 7. Holidays, availability and operations

- The seeded holiday engine covers 12 countries and multiple future years, with per-country weekly off. Future lunar-calendar dates remain tentative; validate authoritative announcements before operational use.
- Choose a Neon region available near the intended users; do not promise a specific region on every free plan.
- Track provider quotas, database size, API payload size, conflict rates, save failures and restore success.
- Add reliable backups, recovery objectives, retention controls, monitoring and incident procedures before important data is stored.
- Do not defeat scale-to-zero with keep-alive requests. Cold starts are a normal free-tier trade-off.
- Vercel Hobby is restricted to eligible personal/non-commercial usage. A business portal may need a different plan or hosting provider. No free production SLA or unlimited capacity is promised.

## 8. Delivery checklist

| Phase | State |
| --- | --- |
| Browser product demo, analytics, export | Implemented |
| Vercel API + Neon snapshot persistence + shared-password pilot | Implemented in this repository; requires account/environment setup |
| Provision/confirm a live Neon project and production secrets | Owner dashboard action; not performed merely by merging code |
| Individual login + server-enforced permissions + normalized records | Planned |
| Real OAuth calendar sync, durable worker and email delivery | Planned |
| Backups/PITR, compliance controls, tamper-evident audit and production SLA | Planned / provider setup |


## IT project portfolio and time capitalisation

The workspace model now carries three additive collections alongside the original
domain model (nothing was removed or renamed):

- `projects` — 110 IT projects (30 capital, 80 operational) with capex, WBS code,
  capitalisation rate/window, sponsor, PM and task breakdown. Each project task
  points at a real activity (`activityId`), so it appears in the calendar,
  timesheets and roadmap like any other work.
- `capitalisation` — the AASB 138 / IAS 38 policy: eligible and excluded
  development phases, hourly role cost bands, evidence checklist and approver.
- `capitalisationApprovals` — immutable snapshots of the board submission for an
  entity and calendar month (hours, cost, utilisation, status, submitter, decision
  and note).

`src/lib/capitalisation.ts` classifies every timesheet entry in scope:

1. Only activities linked to a **capital** project, in an eligible phase and
   inside the project's capitalisation window are capitalised.
2. Capitalised hours are the logged hours multiplied by the project's
   capitalisation rate; value uses the resource's fully-loaded AUD rate.
3. Operational projects, non-capitalisable phases (support, training, discovery)
   and non-project BAU remain in the utilisation denominator and are reported as
   excluded effort with an auditable reason.
4. Every in-scope entry ends up in exactly one bucket, so the board pack
   reconciles logged hours to capitalised + excluded effort.

The board workflow (submit → refresh → approve/reject) is stored through the same
shared-workspace persistence and audit log as the rest of the portal. As with the
performance scores, calculations run client-side for the pilot; move the same
queries server-side before using the numbers for statutory reporting.
