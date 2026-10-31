# DevOps delivery, streams and effort reporting

## 1. The problem this solves

IT needs one traceable chain from a strategic outcome to the hours a person actually spent:

```text
Tenant / legal entity
└── Department (IT first; other departments can opt in)
    ├── Delivery stream → nested sub-stream → accountable lead
    └── Epic
        └── Feature
            └── Ticket
                └── Calendar activity (resource, dates, planned hours)
                    └── Timesheet entries (actual hours, approval)
                        ├── Effort reports
                        └── Existing project capitalisation pack
```

A ticket can be owned by IT while a resource from another enabled department contributes. The contribution is attributed to the **resource’s home department and executing stream**, and rolls up to the ticket’s feature and epic. This is how a shared epic can show, for example, IT 15 hours and Finance 4 hours in the same week.

The default demonstration remains IT-only. To see cross-department contributions, enable DevOps delivery on the additional departments and widen **Master setup → Tenants & calendar scope** to multiple/all departments. Tenant boundaries are never widened.

## 2. What is implemented

### DevOps delivery tab

- Epic → feature → ticket hierarchy with parent/child validation.
- Manual creation and editing; title, description, acceptance criteria, owner, stream, project/WBS, funding, phase, status and backlog estimate.
- **Acceptance criteria** are stored per work item (one criterion per line). They appear as a checklist in the item’s detail panel, travel with CSV/JSON import and CSV export, and are fetched read-only from Azure DevOps (`Microsoft.VSTS.Common.AcceptanceCriteria`) when a link is looked up.
- **Link work items** re-parents existing features under an epic, or tickets under a feature, in one step. The parent supplies project and funding context so the hierarchy rules cannot be broken; calendar plans and timesheet actuals are untouched.
- **Sample epic** loads an illustrative DevOps backlog (see section 3) into an enabled department. It is always available from the delivery header until it has been loaded, and is part of the seeded demo workspace.
- Nested department streams with a lead. Example IT streams include Architecture → Solution Architecture, D365, Data & Analytics, Integration, Cloud → DevOps, and Cyber Security.
- Resource home-stream assignment in the employee master.
- CSV/JSON upload with a downloadable template, local parse, full preview, row-level errors and explicit confirmation.
- Repeat-safe upsert by `(organization, Azure project, external work-item ID)`.
- Optional read-only Azure DevOps URL lookup through a same-origin server endpoint.
- Import batch history and workspace audit entries.
- **Plan** opens the existing activity editor with the work-item link prefilled.

### Calendar and timesheets

- Activities can link to an epic, feature or ticket; tickets are the normal planning level.
- Calendar activity chips show the linked work-item type/ID/title.
- The activity supplies planned hours and dates. Importing a backlog does **not** invent bookings.
- Timesheets remain the single source of actual hours. A timesheet links to an activity, which links to the backlog.
- The existing approval flag is available to reports. No second timesheet system is created.

### Separate Effort reports tab

Group the same filtered ledger by:

1. Epic
2. Feature
3. Ticket
4. Resource
5. Department
6. Stream (including sub-stream rollup)
7. Funding class

Filters include date range, resource department, resource, executing stream, epic, feature, ticket, funding and approved-actuals-only. Summary and detailed ledger CSV exports are separate. Clicking a group exposes its contributing rows.

## 3. Sample DevOps backlog

The seeded demo workspace, and the **Sample epic** button for any other enabled department, include one complete DevOps example:

```text
DevOps platform & release automation (epic)
├── CI/CD pipeline standardisation (feature)
│   ├── Create reusable build and test pipeline templates (work item)
│   └── Add automated quality gates to the shared pipelines (work item)
├── Infrastructure as code & environment provisioning (feature)
│   ├── Publish the Terraform module library for landing zones (work item)
│   └── Create ephemeral preview environments per pull request (work item)
├── Release automation & change traceability (feature)
│   ├── Automate gated releases to test and production (work item)
│   └── Link deployment records to Azure DevOps work items (work item)
├── Platform observability & service health (feature)
│   ├── Build golden-signal dashboards for platform services (work item)
│   └── Add SLO alerts and runbook links for on-call (work item)
└── Pipeline identity & secrets hardening (feature)
    ├── Move pipeline cloud access to workload identity federation (work item)
    └── Automate rotation for platform service account secrets (work item)
```

Every item has a title, a description and measurable acceptance criteria; the sample epic and features also carry their own criteria. Items are linked to the DevOps, Cloud and Security streams and to the department’s DevOps resources, and the whole hierarchy shares one opex project (`IT change & release governance` in the seeded workspace) and one funding class.

The sample is illustrative **backlog metadata only**:

- Estimates are backlog estimates, not calendar bookings or actual hours.
- No activity is created, no time is logged and no capitalisation treatment is implied.
- IDs are stable, so loading the sample twice never duplicates it (the button disappears once loaded).
- Edit, re-link or delete the items like any other backlog item.

Use it to demonstrate the hierarchy, acceptance criteria and linking before importing a real Azure DevOps export.

## 4. Hour and funding semantics

| Measure | Source | Meaning |
| --- | --- | --- |
| Backlog estimate | Work item `estimateHours` | Original estimate in hours. Not a calendar booking and not actual effort. Story points are never silently converted to hours. |
| Planned hours | Activity `plannedHours` | Total planned effort over the activity dates. Reports prorate it across the resource’s working days, excluding weekly-offs and public holidays. |
| Logged hours | Timesheet `hours` | Actual effort on the timesheet date. |
| Approved hours | Timesheet where `approved=true` | Subset of logged hours. The report can exclude unapproved actuals while retaining plans. |
| Capex-tagged hours | Backlog funding `capex` | Management classification; requires a linked capital project. Not an accounting decision by itself. |
| Policy-eligible hours | Existing capitalisation rules | Capital project + eligible development phase + inside capitalisation window + linked eligible work. |
| Capitalised cost | Eligible hours × project rate × resource AUD cost rate | Feeds the existing capitalisation workflow. |

Each actual entry appears once in the detailed ledger. Ancestor rollups deliberately overlap: **do not add the epic total to the feature total or ticket total**. Within any one grouping, hours reconcile to the filtered ledger. Unlinked/BAU effort is retained in a separate bucket when no backlog filter excludes it.

Plan proration is a planning approximation, not a record of daily attendance. A multi-day activity’s plan is allocated over its working days; actual hours are never prorated. Changing a resource’s department changes current attribution because the pilot does not store historical department snapshots.

## 5. One-time upload mechanism

### Canonical CSV columns

```csv
externalId,kind,title,parentExternalId,description,acceptanceCriteria,departmentCode,projectCode,streamCode,assigneeEmail,funding,phase,status,estimateHours,externalUrl,organization,devopsProject
1001,epic,Customer platform modernisation,,,,RIT,,,,unclassified,discovery,not_started,0,,contoso,Retail
1002,feature,Checkout improvements,1001,,,,RIT,,,,unclassified,build,in_progress,80,,contoso,Retail
1003,ticket,Implement payment adapter,1002,,"Refunds complete in under 30 seconds
Audit trail shows the operator",RIT,,,,unclassified,build,not_started,24,,contoso,Retail
```

- Required: `externalId`, `kind`, `title`.
- `kind`: `epic`, `feature`, `ticket`.
- `acceptanceCriteria`: optional. One criterion per line inside a quoted CSV field; leading `-`, `*` or `1.` markers are accepted and normalised when displayed.
- Feature parent must be an epic; ticket parent must be a feature. Parents may be earlier/later in the file or already in the workspace.
- `departmentCode` defaults to the selected delivery department.
- `projectCode` must match an existing project in that department. It supplies the WBS/capitalisation context.
- `streamCode` must match a stream in that department.
- `assigneeEmail` must match an existing resource in the active tenant. Cross-department assignees are allowed.
- `funding`: `capex`, `opex`, `unclassified`. Capex requires an existing capital project.
- `phase`: discovery, design, build, test, deploy, hypercare, support, training.
- `status`: not_started, in_progress, blocked, completed, cancelled.
- Blank optional fields on a re-import preserve existing local project/stream/assignee/funding/phase/status/estimate overrides. A blank description or acceptance-criteria field also preserves the existing value.
- UTF-8, quoted commas, escaped quotes and multiline CSV fields are supported.
- Limits: 500 rows and 512 KB per batch; the entire shared snapshot must remain below the existing 4 MB pilot limit.

JSON accepts either an array of the same row objects or `{ "items": [...] }`.

### Azure DevOps flat-query export

Export a flat query with parent links. Recognised aliases include:

| Azure export column | Canonical field |
| --- | --- |
| ID / System.Id | externalId |
| Work Item Type / System.WorkItemType | kind |
| Title / System.Title | title |
| Parent | parentExternalId |
| State / System.State | status |
| Assigned To / System.AssignedTo | assigneeEmail |
| Original Estimate / Microsoft.VSTS.Scheduling.OriginalEstimate | estimateHours |
| Acceptance Criteria / Microsoft.VSTS.Common.AcceptanceCriteria | acceptanceCriteria |
| System.TeamProject | devopsProject |

Epic and Feature map directly. Task, Bug, User Story, Product Backlog Item and Issue map to ticket. Azure’s deeper User Story → Task hierarchy is not represented as two ticket levels: map the export to the canonical three-level model before import. The link lookup selects the nearest feature and epic ancestors and omits intermediate user-story levels from the local view; it does not change Azure DevOps.

Custom Azure states/process templates may need a mapping to the canonical statuses. Unknown states fail the preview rather than being guessed.

### Import safety

The parser and preview are local. Nothing is committed until **Confirm import**. Duplicate IDs, missing parents, wrong parent types, unknown project/stream/resource references, invalid capex links and cyclic hierarchies fail the whole batch. Successful imports record counts, filename, actor and time; raw file contents and credentials are not retained. The shared workspace still uses compare-and-swap revision control.

## 6. Optional Azure DevOps link lookup

Set this **server-only** environment variable in the existing Vercel project and redeploy:

```text
AZURE_DEVOPS_PAT=<personal access token with Work Items (Read)>
```

Restrict the PAT to the required Azure organisation/projects. Never prefix it with `VITE_`, commit it, paste it into a work-item description or store it in the workspace snapshot.

The endpoint is `POST /api/devops` with `{ "url": "https://dev.azure.com/org/project/_workitems/edit/123" }`.

Controls:

- Existing shared-workspace session required; demo mode cannot call it.
- Same-origin mutation guard and per-client rate limit.
- Only direct HTTPS `dev.azure.com` / `*.visualstudio.com` work-item URLs; no arbitrary host, credentials in URL, query/fragment or redirect following.
- Bounded timeout, ancestor depth and response size.
- Read-only Azure REST API `7.1`; no write-back.
- Returns sanitised metadata for preview, not the PAT or raw provider error body.

Lookup is an on-demand import assist, not continuous synchronisation. If the server is not configured, CSV/JSON upload and manual entry still work.

## 7. Permissions and production boundary

The current repository uses one shared workspace password. Persona/role checks are **product previews**, not server-enforced authorization. In the UI, department leadership can import/configure streams; stream leads can maintain their department backlog. Any holder of the shared password can still read or modify the raw snapshot through the API.

Before real employee, project-financial or cross-customer use:

1. Add individual SSO and server-side tenant/department/stream roles.
2. Move backlog, activities and timesheets to record-level tables with row-level authorization and indexed reporting queries.
3. Add immutable time/financial audit history, period locking and historical resource-department snapshots.
4. Replace the shared PAT with delegated OAuth or a managed workload identity; add a durable sync worker, webhook/reconciliation jobs and conflict policy.
5. Have Finance approve capex policy, WBS mapping, eligible phases and period close. The software classification is not statutory accounting advice.

The additive JSONB collections (`deliveryStreams`, `workItems`, `devopsImports`) and optional activity/employee/department fields persist through the existing Neon workspace API. Older snapshots heal to empty delivery collections; existing projects, activities and timesheets are not replaced.

## 8. Verification

```bash
npm run typecheck
npm run smoke:delivery
node --test tests/devops.test.mjs
npm run check
```

The delivery smoke test covers out-of-order imports, idempotency, CSV quoting, invalid batches, acceptance-criteria import and preservation, the seeded DevOps sample hierarchy, linking and re-parenting rules, all seven report groupings, cross-department rollups, working-day plan allocation, approval filtering, capex eligibility, nested stream cycles, tenant isolation, server schema validation and rendering both new tabs. Azure tests use mocked provider responses; a live Azure tenant/PAT is still required for an end-to-end provider check.
