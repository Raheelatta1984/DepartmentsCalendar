# Harris Farm Markets onboarding

## Entity and scope

- Tenant: **Harris Farm Markets** (`HFM`), initially the active tenant.
- Entity tree: **Harris Farm Markets** (group) → **HarrisFarm Markets** (company).
- Department rollout: **Information Technology** (`HIT`) only. DevOps delivery is enabled for IT. Warehouse, retail sites and Finance are not departments yet.
- The older Harbourline and Meridian tenants remain separate demo tenants and do not share Harris Farm data.

## Co-CEO flexibility

Angus Harris and Luke Harris both use the `ceo` access tier, with their individual business designations and portfolios stored separately:

- **Angus Harris — Co-CEO · Operations**: currently assigned the IT department.
- **Luke Harris — Co-CEO · Warehouse & Retail Operations**: no operational department is assigned yet; the portfolio note is retained for the later Warehouse / retail rollout.

Open **Master setup → Employees → Edit** to change a designation or portfolio. The **Departments in this executive portfolio** checklist controls a co-CEO's department reporting scope. After creating Warehouse, Retail or other departments, assign them to the relevant co-CEO there. Existing CEO profiles without an explicit list keep their legacy group-wide scope; an explicit empty list means no departments are assigned yet.

The `role` field remains the permission tier, while `jobTitle` is editable business language. `managerId` supports the reporting line. `supportingStreamIds` and collaboration notes allow people to contribute to multiple teams without changing their home team.

## Initial IT leadership and reporting lines

The confirmed reporting hierarchy is derived from each person's `managerId`. Nothing about it is
stored twice: change a line here, on the **Organisation** screen or in Master setup → Employees and
every screen reads the same tree.

```
Angus Harris  Co-CEO · Operations
├─ RAM  CIO
│   └─ Swechchha  Delivery Head
│       └─ Damien  PMO
│           ├─ Rahil   QA Lead
│           ├─ Natasha BA Lead
│           └─ Pavithra Junior PMO
├─ Phil  CTO
│   ├─ Bharat  Head of Data ─ Sunil, Arti
│   └─ Greg    Lead Architect
│       └─ Naweesh  DevOps Lead ─ Rob, Mohsin, Akin, Michael, Anup, Mukti
│           └─ Jayden  Architecture Design Lead ─ Tristan
│               └─ Ibadur  D365 Stream Lead ─ Samundra, Sudeep, Ramaparsad, Abhishek
```

| Area | Lead | Reports to | Initial team / line |
| --- | --- | --- | --- |
| CIO Office | RAM — CIO | Angus Harris | Delivery Head Swechchha |
| Delivery & PMO | Swechchha — Delivery Head | RAM | PMO Damien; Daniel (PMO analyst), Sujan, Priyanka and Ali Rad in the stream |
| PMO | Damien — PMO | Swechchha | QA Lead Rahil, BA Lead Natasha, Junior PMO Pavithra |
| Quality Assurance | Rahil — QA Lead | Damien | QA stream under PMO / BA |
| PMO / BA | Natasha — BA Lead | Damien | BA work across the delivery streams |
| CTO Office | Phil — CTO | Angus Harris | Head of Data Bharat; Lead Architect Greg |
| Data & Analytics | Bharat — Head of Data | Phil | Sunil and Arti (designations to confirm); Priyanka and Ali Rad can also support this stream |
| Lead Architecture | Greg — Lead Architect | Phil | DevOps Lead Naweesh |
| DevOps | Naweesh — DevOps Lead | Greg | Rob, Mohsin, Akin, Michael, Anup and Mukti (Support DevOps) |
| Architecture Design | Jayden — Architecture Design Lead | Naweesh | Tristan |
| D365 | Ibadur — D365 Stream Lead | Jayden | Samundra, Sudeep, Ramaparsad and Abhishek |

Luke Harris remains a second co-CEO with no operational department assigned yet; his portfolio note is
kept for the later Warehouse / retail rollout.

### Changing the hierarchy

- **Organisation** (Configuration → Organisation) is the working chart: drag a card onto the colleague
  who should become the manager, or drop it on the top-level zone to remove their manager. Search keeps
  the reporting line above a person visible, the directory lists every line in one table, and
  "Change manager" is the keyboard-friendly alternative to dragging.
- **Master setup → Organization hierarchy → Reporting lines** shows the same people tree beside the
  entity and department tree, with the same drag-and-drop.
- A move rewrites `managerId` only. Department, entity, delivery stream, timesheet approval rights and
  calendar sharing keep their own settings — change those in Master setup → Employees.
- The person's whole team moves with them. A drop that would place a manager beneath their own report
  is refused with the reason, and your own line cannot be moved to the top level by yourself.
- Every change is written to the audit trail as "Reporting line changed" with the previous and new
  manager, and is listed on Organisation → Line changes.

In **DevOps delivery → Streams & leads**, the nested stream tree is editable: CIO Office → Delivery & PMO
→ PMO / BA → QA; CTO Office → Data & Analytics and Lead Architecture → DevOps → Architecture Design →
D365. Use **Master setup → Employees** to edit each person's home stream, secondary streams, job title,
manager, remote location or contractor status.

## DevOps tickets, activities and actual time

The onboarding seed creates an editable epic → feature → ticket hierarchy for DevOps, PMO / BA, QA, Data, Architecture and D365. It also creates one-hour, next-week planning placeholders for the named IT staff. Those activities link to draft tickets and have descriptions warning that their dates and plans need confirmation. They are examples to shape, not a work plan approved by Harris Farm.

**No actual time is pre-logged.** No timesheet hours were supplied, so the seed deliberately leaves Harris Farm's `timeEntries` empty. Once a person performs work, open **Timesheets → Log time** and select the linked follow-up, requirements-gathering, planning, QA, architecture or D365 activity. Actual effort is entered only by the user and rolls up to the linked ticket / stream in Effort reports.

## Fields to confirm before real use

No real email addresses, contracted hours or start dates were supplied. Current addresses use the reserved, non-deliverable `@harrisfarmmarkets.example` domain; 38 hours/week and 31 October 2026 are onboarding placeholders. Verify those fields in Master setup before connecting email, setting capacity targets or treating reports as operational records. Abhishek is marked as a remote contractor; Mohsin and Ramaparsad are marked as remote resources. Other job titles, employment classifications, cost rates and actual hours should be confirmed by Harris Farm.
