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

| Area | Lead | Initial team / line |
| --- | --- | --- |
| CIO Office | RAM — CIO | Delivery Head Swechchha; Data Head Bharat |
| Delivery & PMO | Swechchha | PMO / BA stream led by Daniel; Damien coordinates PMO / BA and QA; Sujan, Pavithra, Priyanka and Ali Rad are in the stream |
| Quality Assurance | Damien | Raheem (QA) and Natasha (designation to confirm) |
| Data & Analytics | Bharat | Sunil and Arti (designations to confirm); Priyanka and Ali Rad can also support this stream |
| CTO Office | Phil — CTO | Lead Architecture stream led by Greg |
| DevOps | Naweesh | Rob, Mohsin, Akin, Michael, Anup and Mukti (Support DevOps) |
| Architecture Design | Jayden | Tristan |
| D365 | Ibadur | Samundra, Sudeep, Ramaparsad and Abhishek |

In **DevOps delivery → Streams & leads**, the nested stream tree is editable: CIO Office → Delivery & PMO → PMO / BA → QA; a Data & Analytics branch; and CTO Office → Lead Architecture → DevOps, Architecture Design and D365. Use **Master setup → Employees** to edit each person's home stream, secondary streams, job title, manager, remote location or contractor status.

## DevOps tickets, activities and actual time

The onboarding seed creates an editable epic → feature → ticket hierarchy for DevOps, PMO / BA, QA, Data, Architecture and D365. It also creates one-hour, next-week planning placeholders for the named IT staff. Those activities link to draft tickets and have descriptions warning that their dates and plans need confirmation. They are examples to shape, not a work plan approved by Harris Farm.

**No actual time is pre-logged.** No timesheet hours were supplied, so the seed deliberately leaves Harris Farm's `timeEntries` empty. Once a person performs work, open **Timesheets → Log time** and select the linked follow-up, requirements-gathering, planning, QA, architecture or D365 activity. Actual effort is entered only by the user and rolls up to the linked ticket / stream in Effort reports.

## Fields to confirm before real use

No real email addresses, contracted hours or start dates were supplied. Current addresses use the reserved, non-deliverable `@harrisfarmmarkets.example` domain; 38 hours/week and 31 October 2026 are onboarding placeholders. Verify those fields in Master setup before connecting email, setting capacity targets or treating reports as operational records. Abhishek is marked as a remote contractor; Mohsin and Ramaparsad are marked as remote resources. Other job titles, employment classifications, cost rates and actual hours should be confirmed by Harris Farm.
