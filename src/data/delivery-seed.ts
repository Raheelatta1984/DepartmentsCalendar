import type { DeliveryStream, FundingClass, Priority, StoreState, TaskPhase, TaskStatus, WorkItem, WorkItemKind } from '../types';

const SAMPLE_EPIC_ID = 'sample-devops-epic';

interface SampleSpec {
  id: string;
  kind: WorkItemKind;
  title: string;
  description: string;
  acceptanceCriteria: string;
  parentId: string | null;
  streamCode: string;
  phase: TaskPhase;
  status: TaskStatus;
  priority: Priority;
  estimateHours: number;
}

/**
 * An illustrative DevOps platform epic, its features and its delivery work
 * items. Everything here is backlog metadata (including the estimate); no
 * calendar booking or actual hours are fabricated. Parents use stable IDs so
 * loading the sample twice never duplicates it.
 */
const DEVOPS_SAMPLE: SampleSpec[] = [
  {
    id: SAMPLE_EPIC_ID,
    kind: 'epic',
    title: 'DevOps platform & release automation',
    description:
      'Give every Harbourline IT team one automated path from commit to production. This epic covers reusable CI/CD templates, infrastructure as code, release governance, platform observability and pipeline identity, so change lead time and failed deployments fall without adding manual release effort.',
    acceptanceCriteria: [
      'At least 80% of active IT services build and deploy through the standard pipeline templates',
      'Every production change is traceable from Azure DevOps work item to deployment record',
      'Test and production environments are reproducible from code with no manual portal steps',
      'Change failure rate and lead time are reported weekly for every delivery stream',
    ].join('\n'),
    parentId: null,
    streamCode: 'DEVOPS',
    phase: 'build',
    status: 'in_progress',
    priority: 'high',
    estimateHours: 0,
  },
  {
    id: 'sample-devops-epic-ci-cd',
    kind: 'feature',
    title: 'CI/CD pipeline standardisation',
    description:
      'Codified build, test and packaging templates for the service types Harbourline IT runs, so a new repository is pipeline-ready on day one.',
    acceptanceCriteria: [
      'Reusable templates exist for .NET, Node and Python services',
      'New repositories opt in with a single extends block and no duplicated pipeline code',
      'Template changes are versioned and announced through the platform change calendar',
    ].join('\n'),
    parentId: SAMPLE_EPIC_ID,
    streamCode: 'DEVOPS',
    phase: 'build',
    status: 'in_progress',
    priority: 'high',
    estimateHours: 120,
  },
  {
    id: 'sample-devops-epic-ci-cd-build-templates',
    kind: 'ticket',
    title: 'Create reusable build and test pipeline templates',
    description:
      'Author the shared Azure Pipelines templates that restore, build, unit test and package the three supported service types, including dependency caching and parallel test execution.',
    acceptanceCriteria: [
      'Templates build a reference .NET, Node and Python service from a clean agent',
      'Dependency caching cuts a warm pipeline run by at least 30%',
      'A template change is exercised by the platform team’s own pipeline before release',
      'Usage documentation and a migration example are published in the platform catalogue',
    ].join('\n'),
    parentId: 'sample-devops-epic-ci-cd',
    streamCode: 'DEVOPS',
    phase: 'build',
    status: 'in_progress',
    priority: 'high',
    estimateHours: 16,
  },
  {
    id: 'sample-devops-epic-ci-cd-quality-gates',
    kind: 'ticket',
    title: 'Add automated quality gates to the shared pipelines',
    description:
      'Wire unit coverage, static analysis and dependency vulnerability checks into the templates so a failing gate blocks a merge instead of being discovered at release.',
    acceptanceCriteria: [
      'Pull requests show coverage, SAST and dependency results as required checks',
      'A seeded vulnerability fails the pipeline and names the offending package',
      'Teams can raise a documented, time-boxed exception without editing YAML',
      'Gate results are retained for audit for 12 months',
    ].join('\n'),
    parentId: 'sample-devops-epic-ci-cd',
    streamCode: 'DEVOPS',
    phase: 'build',
    status: 'not_started',
    priority: 'medium',
    estimateHours: 12,
  },
  {
    id: 'sample-devops-epic-iac',
    kind: 'feature',
    title: 'Infrastructure as code & environment provisioning',
    description:
      'Replace portal-built environments with reviewed Terraform modules, so test and production infrastructure can be recreated, compared and audited.',
    acceptanceCriteria: [
      'Landing zone, network and data modules are published and versioned',
      'A test environment is created from code in under 30 minutes',
      'Drift between code and deployed environments is detected daily',
    ].join('\n'),
    parentId: SAMPLE_EPIC_ID,
    streamCode: 'CLOUD',
    phase: 'build',
    status: 'in_progress',
    priority: 'high',
    estimateHours: 160,
  },
  {
    id: 'sample-devops-epic-iac-modules',
    kind: 'ticket',
    title: 'Publish the Terraform module library for landing zones',
    description:
      'Package the approved landing zone, virtual network and key vault patterns as versioned modules with examples, input validation and a migration guide.',
    acceptanceCriteria: [
      'Modules cover the subscription landing zone, virtual network and key vault',
      'Every module has input validation, a working example and a README',
      'A sample environment deploys from the modules in a clean subscription',
      'Module releases follow semantic versioning with a published changelog',
    ].join('\n'),
    parentId: 'sample-devops-epic-iac',
    streamCode: 'CLOUD',
    phase: 'build',
    status: 'in_progress',
    priority: 'high',
    estimateHours: 20,
  },
  {
    id: 'sample-devops-epic-iac-preview-envs',
    kind: 'ticket',
    title: 'Create ephemeral preview environments per pull request',
    description:
      'Provision an isolated, short-lived environment for each labelled pull request so testers and reviewers can validate a change before it merges.',
    acceptanceCriteria: [
      'A labelled pull request provisions an isolated environment automatically',
      'The environment is destroyed within one hour of merge or closure',
      'Preview cost per environment is visible on the platform dashboard',
      'No shared production resource is reachable from a preview environment',
    ].join('\n'),
    parentId: 'sample-devops-epic-iac',
    streamCode: 'CLOUD',
    phase: 'design',
    status: 'not_started',
    priority: 'medium',
    estimateHours: 12,
  },
  {
    id: 'sample-devops-epic-release',
    kind: 'feature',
    title: 'Release automation & change traceability',
    description:
      'Make releases repeatable and evidenced: one approval path, automatic deployment records and a clear link from change request to work item.',
    acceptanceCriteria: [
      'Standard and emergency release paths are documented and enforced by the pipeline',
      'Every production deployment creates a record linked to its work items',
      'Change advisory evidence is exported without manual collation',
    ].join('\n'),
    parentId: SAMPLE_EPIC_ID,
    streamCode: 'DEVOPS',
    phase: 'deploy',
    status: 'in_progress',
    priority: 'high',
    estimateHours: 140,
  },
  {
    id: 'sample-devops-epic-release-gated',
    kind: 'ticket',
    title: 'Automate gated releases to test and production',
    description:
      'Add environment approvals, generated release notes and a proven rollback step to the shared release pipeline.',
    acceptanceCriteria: [
      'A production deployment waits for the nominated approver group',
      'Release notes list the completed work items since the previous deployment',
      'A failed deployment can be rolled back to the previous artefact in one run',
      'Approval, deployment and rollback times are recorded against the release',
    ].join('\n'),
    parentId: 'sample-devops-epic-release',
    streamCode: 'DEVOPS',
    phase: 'deploy',
    status: 'in_progress',
    priority: 'high',
    estimateHours: 16,
  },
  {
    id: 'sample-devops-epic-release-work-item-links',
    kind: 'ticket',
    title: 'Link deployment records to Azure DevOps work items',
    description:
      'Use the pipeline work-item association so every deployment record shows the epic, feature and ticket that changed, and each work item shows the deployments that carried it.',
    acceptanceCriteria: [
      'Deployment records show the associated work-item IDs and titles',
      'A work item’s history shows the deployments that carried it',
      'Records remain available for audit after 12 months',
      'No manual spreadsheet is needed to answer “what changed in this release?”',
    ].join('\n'),
    parentId: 'sample-devops-epic-release',
    streamCode: 'DEVOPS',
    phase: 'build',
    status: 'not_started',
    priority: 'medium',
    estimateHours: 10,
  },
  {
    id: 'sample-devops-epic-observability',
    kind: 'feature',
    title: 'Platform observability & service health',
    description:
      'Give platform services golden-signal dashboards, actionable alerts and runbooks so incidents are detected and owned before users report them.',
    acceptanceCriteria: [
      'Every platform service exposes latency, traffic, errors and saturation',
      'Alerts route to the owning on-call rotation with a linked runbook',
      'SLO attainment is reviewed monthly with the service owner',
    ].join('\n'),
    parentId: SAMPLE_EPIC_ID,
    streamCode: 'DEVOPS',
    phase: 'build',
    status: 'not_started',
    priority: 'medium',
    estimateHours: 120,
  },
  {
    id: 'sample-devops-epic-observability-dashboards',
    kind: 'ticket',
    title: 'Build golden-signal dashboards for platform services',
    description:
      'Create provisioned dashboards for each platform service covering latency, traffic, error rate and saturation, with links to the service owner and the underlying query.',
    acceptanceCriteria: [
      'Dashboards show latency, traffic, error rate and saturation per service',
      'Each panel links to the underlying query and the service owner',
      'Dashboard provisioning is managed as code',
      'A new service appears on the dashboard through the standard onboarding template',
    ].join('\n'),
    parentId: 'sample-devops-epic-observability',
    streamCode: 'DEVOPS',
    phase: 'build',
    status: 'not_started',
    priority: 'medium',
    estimateHours: 12,
  },
  {
    id: 'sample-devops-epic-observability-slo-alerts',
    kind: 'ticket',
    title: 'Add SLO alerts and runbook links for on-call',
    description:
      'Define service-level objectives for platform services and route burn-rate alerts to the owning on-call rotation with a runbook attached.',
    acceptanceCriteria: [
      'Burn-rate alerts fire to the correct on-call rotation',
      'Every alert links to a runbook with diagnosis and rollback steps',
      'Alert noise is reviewed monthly and noisy rules are retired',
      'A game-day exercise proves detection and escalation end to end',
    ].join('\n'),
    parentId: 'sample-devops-epic-observability',
    streamCode: 'DEVOPS',
    phase: 'design',
    status: 'not_started',
    priority: 'low',
    estimateHours: 8,
  },
  {
    id: 'sample-devops-epic-identity',
    kind: 'feature',
    title: 'Pipeline identity & secrets hardening',
    description:
      'Remove long-lived credentials from pipelines and rotate the remaining platform secrets automatically, aligning delivery automation with the Zero Trust identity programme.',
    acceptanceCriteria: [
      'No pipeline stores a long-lived cloud credential',
      'Workload identity federation is the default for new service connections',
      'Remaining platform secrets rotate on a documented schedule',
    ].join('\n'),
    parentId: SAMPLE_EPIC_ID,
    streamCode: 'SECURITY',
    phase: 'design',
    status: 'not_started',
    priority: 'high',
    estimateHours: 90,
  },
  {
    id: 'sample-devops-epic-identity-federation',
    kind: 'ticket',
    title: 'Move pipeline cloud access to workload identity federation',
    description:
      'Replace the shared service connection secret with short-lived federated credentials scoped to the target environment.',
    acceptanceCriteria: [
      'Deployments authenticate with short-lived federated credentials',
      'The legacy service connection is disabled and its secret revoked',
      'A pipeline run proves access with no stored secret',
      'Access scope is limited to the target environment',
    ].join('\n'),
    parentId: 'sample-devops-epic-identity',
    streamCode: 'SECURITY',
    phase: 'design',
    status: 'not_started',
    priority: 'high',
    estimateHours: 14,
  },
  {
    id: 'sample-devops-epic-identity-rotation',
    kind: 'ticket',
    title: 'Automate rotation for platform service account secrets',
    description:
      'Rotate platform service account secrets on a schedule and on demand, with consumers reading the current value from the vault rather than a pipeline variable.',
    acceptanceCriteria: [
      'Rotation runs on schedule and on demand without service downtime',
      'Consumers read the current secret from the vault, not a pipeline variable',
      'Rotation events are logged and alerted to the platform team',
      'A documented rollback exists for a failed rotation',
    ].join('\n'),
    parentId: 'sample-devops-epic-identity',
    streamCode: 'SECURITY',
    phase: 'build',
    status: 'not_started',
    priority: 'medium',
    estimateHours: 10,
  },
];

/** Fixed stream codes are resolved to this department's real stream IDs. */
function sampleProject(state: StoreState, departmentId: string) {
  const projects = state.projects.filter((p) => p.departmentId === departmentId);
  return projects.find((p) => p.code === 'HRA-OPS-003')
    ?? projects.find((p) => p.portfolio !== 'capital')
    ?? projects[0]
    ?? null;
}

function sampleStreams(state: StoreState, departmentId: string) {
  const streams = state.deliveryStreams.filter((s) => s.departmentId === departmentId);
  const devops = streams.find((s) => s.code === 'DEVOPS') ?? null;
  const byCode = (code: string) => streams.find((s) => s.code === code) ?? devops;
  return { streams, devops, byCode };
}

/** Work items for the sample DevOps epic, ready to insert into a workspace. */
export function devopsSampleWorkItems(state: StoreState, departmentId?: string): WorkItem[] {
  const department = departmentId
    ? state.departments.find((d) => d.id === departmentId)
    : state.departments.find((d) => d.code === 'RIT') ?? state.departments.find((d) => d.devopsEnabled);
  if (!department) return [];
  const project = sampleProject(state, department.id);
  const funding: FundingClass = project?.portfolio === 'capital' ? 'capex' : project ? 'opex' : 'unclassified';
  const { devops, byCode } = sampleStreams(state, department.id);
  const members = state.employees.filter((e) => e.departmentId === department.id && e.status !== 'inactive');
  const devopsMembers = members.filter((e) => e.streamId === devops?.id);
  const ticketOwners = devopsMembers.length ? devopsMembers : members;
  const owner = members.find((e) => e.id === devops?.leadId)?.id ?? members[0]?.id ?? null;
  const now = new Date().toISOString();
  return DEVOPS_SAMPLE.map((spec, index) => ({
    id: spec.id,
    kind: spec.kind,
    title: spec.title,
    description: spec.description,
    acceptanceCriteria: spec.acceptanceCriteria,
    parentId: spec.parentId,
    departmentId: department.id,
    streamId: byCode(spec.streamCode)?.id ?? null,
    projectId: project?.id ?? null,
    assigneeId: spec.kind === 'ticket' ? ticketOwners[index % Math.max(1, ticketOwners.length)]?.id ?? owner : owner,
    funding,
    phase: spec.phase,
    status: spec.status,
    priority: spec.priority,
    estimateHours: spec.estimateHours,
    source: 'manual',
    externalId: '',
    externalUrl: '',
    organization: '',
    devopsProject: '',
    createdAt: now,
    updatedAt: now,
  }));
}

/** True when the workspace already contains the illustrative DevOps epic. */
export const hasDevopsSample = (state: StoreState) => state.workItems.some((i) => i.id === SAMPLE_EPIC_ID);
export const DEVOPS_SAMPLE_EPIC_ID = SAMPLE_EPIC_ID;

/** Small, explicitly illustrative backlog: no extra actual hours are fabricated. */
export function withDeliverySample(state: StoreState): StoreState {
  const streams: DeliveryStream[] = [...(state.deliveryStreams ?? [])];
  const items: WorkItem[] = [...(state.workItems ?? [])];
  const employees = state.employees.map((e) => ({ ...e }));
  const activities = state.activities.map((a) => ({ ...a }));
  const now = new Date().toISOString();
  state.departments.filter((d) => d.devopsEnabled).forEach((dept) => {
    // Departments that already have an intentionally configured stream tree
    // (for example Harris Farm Markets' CIO/CTO organisation) keep that tree;
    // the generic demo streams below are only for an empty delivery workspace.
    if (streams.some((stream) => stream.departmentId === dept.id)) return;
    const prefix = `stream-${dept.id}`;
    const members = employees.filter((e) => e.departmentId === dept.id);
    const leads = members.filter((e) => ['supervisor', 'manager'].includes(e.role));
    const specs: [string, string, string | null][] = [
      ['architecture', 'Architecture', null], ['solution-architecture', 'Solution architecture', 'architecture'],
      ['d365', 'D365 & enterprise apps', null], ['data', 'Data & analytics', null],
      ['integration', 'Integration & APIs', null], ['cloud', 'Cloud & infrastructure', null],
      ['devops', 'DevOps & platform', 'cloud'], ['security', 'Cyber security', null],
    ];
    specs.forEach(([code, name, parent], i) => {
      if (!streams.some((s) => s.id === `${prefix}-${code}`)) streams.push({ id: `${prefix}-${code}`, departmentId: dept.id, parentId: parent ? `${prefix}-${parent}` : null, name, code: code.toUpperCase().replace(/-/g, '-'), leadId: leads[i % Math.max(1, leads.length)]?.id ?? dept.headId, color: ['#6366f1', '#8b5cf6', '#0ea5e9', '#14b8a6', '#f59e0b', '#06b6d4', '#3b82f6', '#ec4899'][i] });
    });
    const deliveryStreams = streams.filter((s) => s.departmentId === dept.id);
    const leafStreams = deliveryStreams.filter((s) => !deliveryStreams.some((child) => child.parentId === s.id));
    members.forEach((e, i) => { e.streamId ??= leafStreams[i % leafStreams.length]?.id; });
    if (dept.code !== 'RIT') return;
    const projects = state.projects.filter((p) => p.departmentId === dept.id && p.tasks.length >= 4).slice(0, 3);
    projects.forEach((project, pi) => {
      const epicId = `demo-epic-${pi + 1}`;
      if (items.some((i) => i.id === epicId)) return;
      const base = { departmentId: dept.id, projectId: project.id, assigneeId: project.managerId, funding: project.portfolio === 'capital' ? 'capex' as const : 'opex' as const, source: 'manual' as const, externalId: '', externalUrl: '', organization: '', devopsProject: '', createdAt: now, updatedAt: now };
      items.push({ ...base, id: epicId, kind: 'epic', title: project.name, description: 'Illustrative epic linked to the seeded project. Replace with your own Azure DevOps export when ready.', acceptanceCriteria: 'Success measures are agreed with the business sponsor\nFeatures and tickets reconcile to the project WBS and funding class', parentId: null, streamId: deliveryStreams[pi]?.id ?? null, phase: 'design', status: 'in_progress', priority: 'high', estimateHours: 0 });
      ['Solution & experience', 'Build & rollout'].forEach((name, fi) => {
        const featureId = `${epicId}-feature-${fi + 1}`;
        items.push({ ...base, id: featureId, kind: 'feature', title: name, description: 'A feature groups the delivery tickets and rolls up their calendar plans and logged effort.', acceptanceCriteria: 'Acceptance is reviewed with the product owner\nChild tickets roll up planned and logged effort', parentId: epicId, streamId: leafStreams[(pi * 2 + fi) % leafStreams.length]?.id ?? null, phase: fi ? 'build' : 'design', status: 'in_progress', priority: 'medium', estimateHours: 0 });
        project.tasks.slice(fi * 2, fi * 2 + 2).forEach((task, ti) => {
          const activity = activities.find((a) => a.id === task.activityId);
          const ticketId = `${featureId}-ticket-${ti + 1}`;
          items.push({ ...base, id: ticketId, kind: 'ticket', title: task.title, description: 'Sample ticket. Schedule work against it, then log time on the calendar activity.', acceptanceCriteria: 'The calendar activity is planned with dates and planned hours\nActual time is logged against this ticket and approved', parentId: featureId, streamId: employees.find((e) => e.id === activity?.assigneeId)?.streamId ?? null, assigneeId: activity?.assigneeId ?? project.managerId, phase: task.phase, status: activity?.status ?? 'not_started', priority: 'medium', estimateHours: task.plannedHours });
          if (activity) { activity.workItemId = ticketId; activity.streamId = employees.find((e) => e.id === activity.assigneeId)?.streamId; }
        });
      });
    });
    // A complete DevOps example: epic → 5 features → 10 work items, all with
    // title, description and acceptance criteria, linked in one hierarchy.
    if (hasDevopsSample({ ...state, workItems: items })) return;
    devopsSampleWorkItems({ ...state, deliveryStreams: streams, employees, workItems: items }, dept.id)
      .forEach((item) => { if (!items.some((i) => i.id === item.id)) items.push(item); });
  });
  return { ...state, deliveryStreams: streams, workItems: items, employees, activities };
}
