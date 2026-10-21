# Orbit — Department Activity, Workload & Roadmap Portal

A working, deployable prototype of the portal you described: **every department's daily activity, follow-ups, appointments, meetings, seminars, sessions and tasks exposed up the chain from the newest employee to the CEO**, with workload measured from hours actually spent, a central calendar per department and per person, country-aware public holidays, timesheets, performance scoring and automatic escalation to the department head with the Head of Operations in copy.

Built as a static React + TypeScript app with a deterministic demo dataset so you can **open it and click through the whole product** before committing to a backend. The production architecture (Postgres/Supabase + Microsoft Graph + Google Calendar) is documented end-to-end in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the ready-to-run SQL in [`docs/schema.sql`](docs/schema.sql).

---

## 1. What is in the demo

| Your requirement | Where it lives in the portal |
| --- | --- |
| All departments' daily activities, follow-ups, appointments, meetings, seminars, sessions, tasks | **Activity register** (9 activity types, subtasks, priority, status, progress) and **Department calendar** |
| Each employee's schedule visible to supervisor → manager → unit head → department head → COO → CEO | **Role-based scope ribbon** + **Employee 360** modal; the reporting tree decides who can open whose calendar |
| CEO checks the accounts department collectively and its workload | **Command centre** → department scorecard (logged vs capacity, utilization, on-time, score) and `Accounts & Finance` drill-down |
| Workload calculated from hours spent on activities | Every score uses **logged timesheet hours ÷ country-aware capacity** (not planned hours, not attendance) |
| Portal linked to Outlook, Google Calendar optional; an inserted task appears in the calendar | **Calendar sync** tab + sync toggles on every activity + a real **.ics** export that can be imported into Outlook/Google today |
| Central calendar by department, by employee; managers review a responsible employee's calendar | **Department calendar** (month, team-week swimlanes, day) with employee picker and per-person utilization |
| Staff / worker management at master level | **Master setup → Employees** (role, reporting line, entity, department, country, contracted hours) |
| Entities / companies and sub-companies so a group of companies fits | **Master setup → Entities** (group → company → sub-company tree, each with country & timezone) |
| Department master with head / responsible assignee | **Master setup → Departments** (head, operations owner, cost centre, calendar colour) |
| Performance matrix daily / weekly / monthly / quarterly / annual | **Performance & escalation** — identical formula at every grain, 8-period trend |
| Low-performing department reported to department head, CC Head of Operations | **Attention queue → Escalate** and the **rule engine**; generates a ready-to-send email with To/CC and full audit record |
| Head of Operations sees only the departments he is responsible for | Role scope: COO sees every operational department (owner field), not the rest of the group |
| Daily timesheet by activity, review where time was spent vs the planned task | **Timesheets** — team week grid, entry history, approvals, plan-vs-actual |
| Roadmap with department/employee/task/subtask rows, columns for year, quarter, month, week number, day and date | **Roadmap timeline** with all six header rows, collapsible hierarchy, holiday shading and today marker |
| Country-specific weekly off + public holidays for the next 5 years, with reason shown | **Master setup → Holidays & weekends** (12 countries, multi-year generation, per-country weekend toggles) and shading in calendar/roadmap |

### Demo personas (switch from the avatar menu, top-right)

| Persona | Role | Sees |
| --- | --- | --- |
| Arjun Mehta | CEO | All 6 entities, 14 departments, 68 people |
| Layla Al Mansoori | Head of Operations | All operational departments, portfolio scoring, escalation log |
| Fatima Noor / Ravi Krishnan / … | Department heads | Own department + reporting line |
| Unit heads / managers / supervisors | Management | Their own reporting tree only |
| Employees | Self-service | Own calendar, own timesheet, own activity register |

The data deliberately contains a realistic mix: 660+ activities, 4 000+ timesheet entries, 890+ holiday records, calendar connections in connected/pending/disconnected states, and a few departments under the 70-point threshold so the escalation flow has something to act on.

---

## 2. How the numbers are calculated

```
capacity        = contracted weekly hours ÷ 5 × working days in the period
                  (working days exclude the country's weekly-off days and public holidays)
                  for a running period only elapsed days count, so Monday is not "20% utilized"

utilization     = logged timesheet hours ÷ capacity × 100
utilizationScore= 100 − |utilization − 85| × 1.3        (clamped 0–100; punishes both idle and overload)
onTimeRate      = completed activities whose deadline has passed ÷ all activities whose deadline has passed
completionRate  = average delivery progress of in-period activities (completed = 100)
score           = 40% utilizationScore + 35% onTimeRate + 25% completionRate
```

Escalation rule: at the end of every day/week/month/quarter, any department whose score is below the configured threshold (default **70**) produces one escalation record per period. Recipients: **department head (To)**, **Head of Operations (CC)**. Duplicate suppression is by `(department_id, period, period_start)`. Every escalation is kept in an immutable audit log with acknowledgement and closure statuses.

---

## 3. Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

Requires Node 20+. There is no backend: the demo state is stored in `localStorage` (about 1 MB). Use **avatar menu → Reset demo data** at any time.

Optional smoke tests (they render the real app inside jsdom and exercise every store action):

```bash
npm run smoke         # renders all 8 screens, fails on console errors
npm run smoke:store   # creates/updates/deletes activities, logs time, generates holidays, escalates
```

---

## 4. Deploy for free

The build is a static bundle — no server needed for the demo:

| Platform | Free tier | Steps |
| --- | --- | --- |
| **Vercel** (recommended) | 100 GB bandwidth/mo, automatic HTTPS + custom domain | Import the repo → framework *Vite* → build `npm run build` → output `dist` |
| **Cloudflare Pages** | unlimited requests, 500 builds/mo | Connect repo → build command/output as above |
| **Netlify** | 100 GB/mo | Same settings |
| **GitHub Pages** | free for public repos | A workflow is included at `.github/workflows/deploy.yml`; enable Pages → *GitHub Actions* |

`vite.config.ts` uses a relative `base`, so the same build works at a domain root or a sub-path.

For the **production** version with a shared multi-user database and real calendar sync, follow [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The short version:

- **Supabase free tier** — Postgres + Auth + Row Level Security + Edge Functions (500 MB DB, 5 GB bandwidth, 50k monthly active users).
- **Microsoft Graph** — free with any Microsoft 365 tenant; one Entra ID app registration with delegated `Calendars.ReadWrite`.
- **Google Calendar API** — free for internal use; per-user OAuth tokens.
- **Vercel / Cloudflare Pages** — free static hosting.
- **Resend / Graph `sendMail`** — free escalation email delivery.

Cost at pilot scale (up to ~50 staff, 1 group): **$0/month**. The break points and the paid alternatives are listed in the architecture doc (free Supabase pauses after 7 days of inactivity unless a daily cron keeps it warm; 500 MB holds roughly 3–5 million timesheet rows).

---

## 5. Production architecture at a glance

```
┌──────────────────┐    HTTPS     ┌───────────────────────────┐
│ React SPA        │ ───────────► │ Supabase (Postgres+Auth)  │
│ Vercel/CF Pages  │ ◄─────────── │ RLS by role & reporting   │
└────────┬─────────┘   Realtime   └───────────┬───────────────┘
         │                                    │ triggers / cron
         │ OAuth (delegated)                  ▼
┌────────▼─────────┐              ┌───────────────────────────┐
│ Microsoft Graph  │ ◄─────────── │ Sync worker (Edge Function │
│ Google Calendar  │ ───────────► │ or Cloudflare Worker)      │
└──────────────────┘   webhooks   └───────────┬───────────────┘
                                             │
                                  ┌──────────▼───────────────┐
                                  │ Escalation engine + email │
                                  │ (Graph sendMail / Resend) │
                                  └──────────────────────────┘
```

See [`docs/architecture.svg`](docs/architecture.svg) for the diagram and the detailed doc for scopes, token handling, idempotency, rate limits and RLS policies.

---

## 6. Screens

| Screen | Purpose |
| --- | --- |
| **Command centre** | Portfolio KPIs, 8-period trend, department scorecard, attention queue with one-click escalation, today across the group, sync health |
| **Department calendar** | Month grid, team-week swimlanes per employee, day timeline; public holidays with reason; right rail for the selected day, employee review and upcoming non-working days |
| **Activity register** | Filterable register of every activity with inline status changes, progress, sync state, CSV and .ics export |
| **Roadmap timeline** | Hierarchical rows (department → employee → activity → subtask) against year/quarter/month/ISO-week/day/date columns, 13/26/52-week horizon |
| **Timesheets** | Team week grid (click a cell to log), entry history with approvals, approval queue, plan-vs-actual |
| **Performance & escalation** | Department matrix across all metrics, employee scorecards, escalation log, rule engine, generated email |
| **Calendar sync** | Provider cards, per-employee connections, sync queue log, production checklist, troubleshooting |
| **Master setup** | Entities, departments, employees, holidays/weekends, group settings, audit trail, full JSON backup |

---

## 7. Repository layout

```
src/
  components/       design system, layout, modals, charts, activity UI
  data/             12-country holiday engine + deterministic demo dataset
  lib/              analytics (scores, capacity, trends), permissions, exports, date helpers
  pages/            one file per screen
  store.tsx         state, persistence, actions, simulated sync queue
  types.ts          domain model
docs/
  ARCHITECTURE.md   long-term scalable design, free-tier plan, phase plan
  schema.sql        production Postgres DDL + RLS + metric views
  architecture.svg
.github/workflows/  GitHub Pages deploy
```

## 8. Honest limitations of this demo

- Data is local to the browser; there is no shared backend, so two people do not see each other's edits.
- The Outlook/Google handshake is **simulated** — the connect flow, sync queue and event payloads are modelled, but no OAuth tokens are stored and no mailbox is touched. The **.ics export is real** and imports into Outlook, Google Calendar or Apple Calendar.
- Escalation emails are generated but not sent; use *Copy* or *Open in mail app*.
- Holiday data for future years is a planning projection. Islamic (Eid/Ramadan/Hijri) dates are tentative by nature and are labelled accordingly; UK/AU/US/IN/PK/SG dates use published rules.
- Scores are computed client-side from the seeded dataset; in production the same formulas run in SQL/edge functions so results are consistent and auditable.

Everything above is deliberate: the goal is to let you validate the **shape of the product** now, then wire it to free production services with the documented schema and sync design.
