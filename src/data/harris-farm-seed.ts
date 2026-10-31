import { addDays, format, startOfWeek } from 'date-fns';
import type { Activity, Department, DeliveryStream, Employee, Entity, Tenant, WorkItem } from '../types';
import { HARRIS_FARM_TENANT_ID, HARRIS_FARM_IT_DEPT_ID, TENANTS } from './tenant-seed';

export const HARRIS_FARM_GROUP_ID = 'ent-hfm-group';
export const HARRIS_FARM_ENTITY_ID = 'ent-hfm-company';
export const HARRIS_FARM_ACTIVE_USER_ID = 'hfm-emp-angus';

export const HARRIS_FARM_STREAM_IDS = {
  cio: 'hfm-stream-cio-office',
  delivery: 'hfm-stream-delivery',
  pmo: 'hfm-stream-pmo-ba',
  qa: 'hfm-stream-qa',
  data: 'hfm-stream-data',
  cto: 'hfm-stream-cto-office',
  architecture: 'hfm-stream-lead-architecture',
  devops: 'hfm-stream-devops',
  architectureDesign: 'hfm-stream-architecture-design',
  d365: 'hfm-stream-d365',
} as const;

export const HARRIS_FARM_EMPLOYEE_IDS = {
  angus: 'hfm-emp-angus',
  luke: 'hfm-emp-luke',
  ram: 'hfm-emp-ram',
  phil: 'hfm-emp-phil',
  bharat: 'hfm-emp-bharat',
  sunil: 'hfm-emp-sunil',
  arti: 'hfm-emp-arti',
  swechchha: 'hfm-emp-swechchha',
  daniel: 'hfm-emp-daniel',
  damien: 'hfm-emp-damien',
  sujan: 'hfm-emp-sujan',
  pavithra: 'hfm-emp-pavithra',
  priyanka: 'hfm-emp-priyanka',
  aliRad: 'hfm-emp-ali-rad',
  raheem: 'hfm-emp-raheem',
  natasha: 'hfm-emp-natasha',
  greg: 'hfm-emp-greg',
  naweesh: 'hfm-emp-naweesh',
  rob: 'hfm-emp-rob',
  mohsin: 'hfm-emp-mohsin',
  akin: 'hfm-emp-akin',
  michael: 'hfm-emp-michael',
  anup: 'hfm-emp-anup',
  mukti: 'hfm-emp-mukti',
  jayden: 'hfm-emp-jayden',
  tristan: 'hfm-emp-tristan',
  ibadur: 'hfm-emp-ibadur',
  samundra: 'hfm-emp-samundra',
  sudeep: 'hfm-emp-sudeep',
  ramaparsad: 'hfm-emp-ramaparsad',
  abhishek: 'hfm-emp-abhishek',
} as const;

const WORK_ITEM_IDS = {
  epic: 'hfm-wi-epic-devops-onboarding',
  devopsFeature: 'hfm-wi-feature-devops',
  devopsTicket: 'hfm-wi-ticket-devops-pipeline',
  pmoFeature: 'hfm-wi-feature-pmo',
  pmoTicket: 'hfm-wi-ticket-pmo',
  qaTicket: 'hfm-wi-ticket-qa',
  dataFeature: 'hfm-wi-feature-data',
  dataTicket: 'hfm-wi-ticket-data-finance',
  architectureFeature: 'hfm-wi-feature-architecture',
  architectureTicket: 'hfm-wi-ticket-architecture-design',
  d365Feature: 'hfm-wi-feature-d365',
  d365Ticket: 'hfm-wi-ticket-d365',
} as const;

interface EmployeeSpec {
  key: keyof typeof HARRIS_FARM_EMPLOYEE_IDS;
  name: string;
  role: Employee['role'];
  jobTitle: string;
  manager: keyof typeof HARRIS_FARM_EMPLOYEE_IDS | null;
  stream: keyof typeof HARRIS_FARM_STREAM_IDS | null;
  employmentType?: Employee['employmentType'];
  workLocation?: Employee['workLocation'];
  leadershipPortfolio?: string;
  responsibleDepartmentIds?: string[];
  supportingStreams?: Array<keyof typeof HARRIS_FARM_STREAM_IDS>;
  collaborationNotes?: string;
}

/**
 * A compact, editable initial register for the Harris Farm Markets IT pilot.
 * Email addresses are non-deliverable .example placeholders because no real
 * work addresses were supplied. Role remains the access tier; jobTitle is the
 * business designation and can be changed in Master setup.
 */
const EMPLOYEE_SPECS: EmployeeSpec[] = [
  {
    key: 'angus', name: 'Angus Harris', role: 'ceo', jobTitle: 'Co-CEO · Operations', manager: null, stream: null,
    leadershipPortfolio: 'Operations across business units, including IT for the initial rollout.',
    responsibleDepartmentIds: [HARRIS_FARM_IT_DEPT_ID],
  },
  {
    key: 'luke', name: 'Luke Harris', role: 'ceo', jobTitle: 'Co-CEO · Warehouse & Retail Operations', manager: null, stream: null,
    leadershipPortfolio: 'Warehouse and retail operational sites. Add the relevant departments when that rollout begins.',
    responsibleDepartmentIds: [],
  },
  { key: 'ram', name: 'RAM', role: 'department_head', jobTitle: 'Chief Information Officer (CIO)', manager: 'angus', stream: 'cio' },
  { key: 'phil', name: 'Phil', role: 'manager', jobTitle: 'Chief Technology Officer (CTO)', manager: 'angus', stream: 'cto' },
  { key: 'bharat', name: 'Bharat', role: 'manager', jobTitle: 'Head of Data', manager: 'ram', stream: 'data' },
  { key: 'sunil', name: 'Sunil', role: 'employee', jobTitle: 'Data team member · designation to confirm', manager: 'bharat', stream: 'data' },
  { key: 'arti', name: 'Arti', role: 'employee', jobTitle: 'Data team member · designation to confirm', manager: 'bharat', stream: 'data' },
  { key: 'swechchha', name: 'Swechchha', role: 'manager', jobTitle: 'Delivery Head', manager: 'ram', stream: 'delivery' },
  { key: 'daniel', name: 'Daniel', role: 'supervisor', jobTitle: 'PMO', manager: 'swechchha', stream: 'pmo' },
  { key: 'damien', name: 'Damien', role: 'supervisor', jobTitle: 'PMO / BA', manager: 'swechchha', stream: 'qa' },
  { key: 'sujan', name: 'Sujan', role: 'employee', jobTitle: 'Junior PMO', manager: 'swechchha', stream: 'pmo' },
  { key: 'pavithra', name: 'Pavithra', role: 'employee', jobTitle: 'Junior PMO', manager: 'daniel', stream: 'pmo' },
  {
    key: 'priyanka', name: 'Priyanka', role: 'employee', jobTitle: 'BA / PMO', manager: 'swechchha', stream: 'pmo',
    supportingStreams: ['data'], collaborationNotes: 'Works with the Data team alongside the PMO / BA stream.',
  },
  {
    key: 'aliRad', name: 'Ali Rad', role: 'employee', jobTitle: 'BA / PMO', manager: 'swechchha', stream: 'pmo',
    supportingStreams: ['data'], collaborationNotes: 'Supports Data and Finance stakeholders; the Finance department is not part of the initial IT-only rollout.',
  },
  { key: 'raheem', name: 'Raheem', role: 'employee', jobTitle: 'QA', manager: 'damien', stream: 'qa' },
  { key: 'natasha', name: 'Natasha', role: 'employee', jobTitle: 'Project resource · designation to confirm', manager: 'damien', stream: 'qa' },
  { key: 'greg', name: 'Greg', role: 'manager', jobTitle: 'Lead Architect', manager: 'phil', stream: 'architecture' },
  { key: 'naweesh', name: 'Naweesh', role: 'supervisor', jobTitle: 'DevOps Lead', manager: 'greg', stream: 'devops' },
  { key: 'rob', name: 'Rob', role: 'employee', jobTitle: 'DevOps developer', manager: 'naweesh', stream: 'devops' },
  { key: 'mohsin', name: 'Mohsin', role: 'employee', jobTitle: 'DevOps developer · remote resource', manager: 'naweesh', stream: 'devops', workLocation: 'remote' },
  { key: 'akin', name: 'Akin', role: 'employee', jobTitle: 'DevOps developer', manager: 'naweesh', stream: 'devops' },
  { key: 'michael', name: 'Michael', role: 'employee', jobTitle: 'DevOps developer', manager: 'naweesh', stream: 'devops' },
  { key: 'anup', name: 'Anup', role: 'employee', jobTitle: 'DevOps developer', manager: 'naweesh', stream: 'devops' },
  { key: 'mukti', name: 'Mukti', role: 'employee', jobTitle: 'Support · DevOps team member', manager: 'naweesh', stream: 'devops' },
  { key: 'jayden', name: 'Jayden', role: 'supervisor', jobTitle: 'Architecture Design Lead', manager: 'greg', stream: 'architectureDesign' },
  { key: 'tristan', name: 'Tristan', role: 'employee', jobTitle: 'Architecture Design team member', manager: 'jayden', stream: 'architectureDesign' },
  { key: 'ibadur', name: 'Ibadur', role: 'supervisor', jobTitle: 'D365 Stream Lead', manager: 'greg', stream: 'd365' },
  { key: 'samundra', name: 'Samundra', role: 'employee', jobTitle: 'D365 team member', manager: 'ibadur', stream: 'd365' },
  { key: 'sudeep', name: 'Sudeep', role: 'employee', jobTitle: 'D365 team member', manager: 'ibadur', stream: 'd365' },
  { key: 'ramaparsad', name: 'Ramaparsad', role: 'employee', jobTitle: 'D365 team member · remote resource', manager: 'ibadur', stream: 'd365', workLocation: 'remote' },
  { key: 'abhishek', name: 'Abhishek', role: 'employee', jobTitle: 'D365 contractor · remote', manager: 'ibadur', stream: 'd365', employmentType: 'contractor', workLocation: 'remote' },
];

const ID_BY_KEY = Object.fromEntries(
  Object.entries(HARRIS_FARM_EMPLOYEE_IDS).map(([key, id]) => [key, id]),
) as Record<keyof typeof HARRIS_FARM_EMPLOYEE_IDS, string>;

const STREAM_BY_KEY = Object.fromEntries(
  Object.entries(HARRIS_FARM_STREAM_IDS).map(([key, id]) => [key, id]),
) as Record<keyof typeof HARRIS_FARM_STREAM_IDS, string>;

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

function makeEmployees(): Employee[] {
  return EMPLOYEE_SPECS.map((spec, index) => ({
    id: ID_BY_KEY[spec.key],
    name: spec.name,
    // Reserved example domain: replace with verified work addresses before enabling email integrations.
    email: `${slug(spec.name)}@harrisfarmmarkets.example`,
    code: `HFM-${String(index + 1).padStart(4, '0')}`,
    entityId: HARRIS_FARM_ENTITY_ID,
    departmentId: HARRIS_FARM_IT_DEPT_ID,
    role: spec.role,
    jobTitle: spec.jobTitle,
    managerId: spec.manager ? ID_BY_KEY[spec.manager] : null,
    countryCode: 'AU',
    weeklyHours: 38,
    joinDate: '2026-10-31',
    status: 'active',
    avatarColor: ['#047857', '#0e7490', '#7c3aed', '#c2410c', '#2563eb', '#b45309', '#be185d'][index % 7],
    employmentType: spec.employmentType ?? 'employee',
    ...(spec.workLocation ? { workLocation: spec.workLocation } : {}),
    ...(spec.leadershipPortfolio ? { leadershipPortfolio: spec.leadershipPortfolio } : {}),
    ...(spec.responsibleDepartmentIds ? { responsibleDepartmentIds: spec.responsibleDepartmentIds } : {}),
    ...(spec.supportingStreams?.length ? { supportingStreamIds: spec.supportingStreams.map((key) => STREAM_BY_KEY[key]) } : {}),
    ...(spec.collaborationNotes ? { collaborationNotes: spec.collaborationNotes } : {}),
    ...(spec.stream ? { streamId: STREAM_BY_KEY[spec.stream] } : {}),
  }));
}

function makeStreams(): DeliveryStream[] {
  const ids = HARRIS_FARM_EMPLOYEE_IDS;
  const streamIds = HARRIS_FARM_STREAM_IDS;
  return [
    { id: streamIds.cio, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: null, name: 'CIO Office', code: 'CIO', leadId: ids.ram, color: '#0f766e' },
    { id: streamIds.delivery, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: streamIds.cio, name: 'Delivery & PMO', code: 'DELIVERY', leadId: ids.swechchha, color: '#7c3aed' },
    { id: streamIds.pmo, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: streamIds.delivery, name: 'PMO / BA', code: 'PMOBA', leadId: ids.daniel, color: '#2563eb' },
    { id: streamIds.qa, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: streamIds.pmo, name: 'Quality Assurance', code: 'QA', leadId: ids.damien, color: '#d97706' },
    { id: streamIds.data, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: streamIds.cio, name: 'Data & Analytics', code: 'DATA', leadId: ids.bharat, color: '#059669' },
    { id: streamIds.cto, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: null, name: 'CTO Office', code: 'CTO', leadId: ids.phil, color: '#4f46e5' },
    { id: streamIds.architecture, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: streamIds.cto, name: 'Lead Architecture', code: 'ARCH', leadId: ids.greg, color: '#9333ea' },
    { id: streamIds.devops, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: streamIds.architecture, name: 'DevOps', code: 'DEVOPS', leadId: ids.naweesh, color: '#0891b2' },
    { id: streamIds.architectureDesign, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: streamIds.architecture, name: 'Architecture Design', code: 'ARCHDES', leadId: ids.jayden, color: '#ea580c' },
    { id: streamIds.d365, departmentId: HARRIS_FARM_IT_DEPT_ID, parentId: streamIds.architecture, name: 'D365', code: 'D365', leadId: ids.ibadur, color: '#4f46e5' },
  ];
}

const ACCEPTANCE = {
  devops: 'Pipeline requirements and ownership are agreed with the stream lead.\nChanges, checks and handover notes are recorded against the ticket.',
  pmo: 'Requirements, planning decisions and follow-ups are captured with an owner and next action.\nDelivery status is visible to the CIO and delivery head.',
  qa: 'Test scenarios and outcomes are recorded.\nDefects or follow-up actions have an owner and target date.',
  data: 'Data and reporting requirements are documented with source owners.\nFinance dependencies are noted for a later cross-department rollout.',
  architecture: 'Design decisions and architecture dependencies are documented.\nThe relevant stream leads review the proposed approach.',
  d365: 'D365 deployment prerequisites and configuration decisions are documented.\nTest evidence and open issues are linked to the work item.',
};

function makeWorkItems(now: string): WorkItem[] {
  const departmentId = HARRIS_FARM_IT_DEPT_ID;
  const streams = HARRIS_FARM_STREAM_IDS;
  const employees = HARRIS_FARM_EMPLOYEE_IDS;
  const shared = {
    departmentId,
    projectId: null,
    funding: 'unclassified' as const,
    status: 'not_started' as const,
    priority: 'medium' as const,
    estimateHours: 0,
    source: 'manual' as const,
    externalId: '',
    externalUrl: '',
    organization: 'Harris Farm Markets',
    devopsProject: 'Harris Farm IT',
    createdAt: now,
    updatedAt: now,
  };
  const specs: Array<Pick<WorkItem, 'id' | 'kind' | 'title' | 'description' | 'acceptanceCriteria' | 'parentId' | 'streamId' | 'assigneeId' | 'phase'>> = [
    {
      id: WORK_ITEM_IDS.epic, kind: 'epic', title: 'Harris Farm Markets — IT delivery and DevOps onboarding',
      description: 'Initial, editable IT backlog connecting DevOps delivery, PMO / BA, data, architecture and D365 work. Refine the scope and acceptance criteria with the teams.',
      acceptanceCriteria: 'Department and stream ownership are confirmed.\nWork is planned on linked activities and actual hours are entered in Timesheets only after work is performed.',
      parentId: null, streamId: streams.cio, assigneeId: employees.ram, phase: 'discovery',
    },
    {
      id: WORK_ITEM_IDS.devopsFeature, kind: 'feature', title: 'DevOps platform and pipeline operations',
      description: 'Initial DevOps workstream for requirements, pipeline improvements, operational follow-up and support.',
      acceptanceCriteria: ACCEPTANCE.devops, parentId: WORK_ITEM_IDS.epic, streamId: streams.devops, assigneeId: employees.naweesh, phase: 'build',
    },
    {
      id: WORK_ITEM_IDS.devopsTicket, kind: 'ticket', title: 'CI/CD pipeline requirements, improvements and follow-up',
      description: 'Draft ticket for DevOps planning, implementation, support and release follow-up. Confirm the exact backlog scope with Naweesh and the team.',
      acceptanceCriteria: ACCEPTANCE.devops, parentId: WORK_ITEM_IDS.devopsFeature, streamId: streams.devops, assigneeId: employees.naweesh, phase: 'build',
    },
    {
      id: WORK_ITEM_IDS.pmoFeature, kind: 'feature', title: 'Delivery, PMO and business analysis',
      description: 'PMO / BA stream for DevOps requirements gathering, planning, coordination and delivery reporting.',
      acceptanceCriteria: ACCEPTANCE.pmo, parentId: WORK_ITEM_IDS.epic, streamId: streams.delivery, assigneeId: employees.swechchha, phase: 'discovery',
    },
    {
      id: WORK_ITEM_IDS.pmoTicket, kind: 'ticket', title: 'DevOps requirements, sprint planning and delivery follow-ups',
      description: 'Draft PMO / BA ticket for gathering requirements, planning work and following up delivery actions.',
      acceptanceCriteria: ACCEPTANCE.pmo, parentId: WORK_ITEM_IDS.pmoFeature, streamId: streams.pmo, assigneeId: employees.swechchha, phase: 'discovery',
    },
    {
      id: WORK_ITEM_IDS.qaTicket, kind: 'ticket', title: 'DevOps release QA and issue follow-up',
      description: 'Draft QA ticket for recording release test scenarios, evidence, defects and follow-up actions with the PMO / BA team.',
      acceptanceCriteria: ACCEPTANCE.qa, parentId: WORK_ITEM_IDS.pmoFeature, streamId: streams.qa, assigneeId: employees.damien, phase: 'test',
    },
    {
      id: WORK_ITEM_IDS.dataFeature, kind: 'feature', title: 'Data and reporting dependencies',
      description: 'Data stream work for requirements, data quality and reporting, including finance hand-offs as the rollout expands.',
      acceptanceCriteria: ACCEPTANCE.data, parentId: WORK_ITEM_IDS.epic, streamId: streams.data, assigneeId: employees.bharat, phase: 'discovery',
    },
    {
      id: WORK_ITEM_IDS.dataTicket, kind: 'ticket', title: 'Data requirements, pipeline checks and finance hand-off',
      description: 'Draft data ticket for requirements gathering, pipeline follow-up and Finance coordination. Finance remains a collaboration area, not an onboarded department.',
      acceptanceCriteria: ACCEPTANCE.data, parentId: WORK_ITEM_IDS.dataFeature, streamId: streams.data, assigneeId: employees.bharat, phase: 'design',
    },
    {
      id: WORK_ITEM_IDS.architectureFeature, kind: 'feature', title: 'Architecture and solution design',
      description: 'Lead Architecture stream for technical design, architecture decisions and review of DevOps dependencies.',
      acceptanceCriteria: ACCEPTANCE.architecture, parentId: WORK_ITEM_IDS.epic, streamId: streams.architecture, assigneeId: employees.greg, phase: 'design',
    },
    {
      id: WORK_ITEM_IDS.architectureTicket, kind: 'ticket', title: 'Architecture design review and DevOps technical decisions',
      description: 'Draft architecture ticket for design review, decision records and technical follow-up.',
      acceptanceCriteria: ACCEPTANCE.architecture, parentId: WORK_ITEM_IDS.architectureFeature, streamId: streams.architectureDesign, assigneeId: employees.jayden, phase: 'design',
    },
    {
      id: WORK_ITEM_IDS.d365Feature, kind: 'feature', title: 'D365 delivery and operational readiness',
      description: 'D365 stream for deployment planning, configuration, testing and remote contractor support.',
      acceptanceCriteria: ACCEPTANCE.d365, parentId: WORK_ITEM_IDS.epic, streamId: streams.d365, assigneeId: employees.ibadur, phase: 'build',
    },
    {
      id: WORK_ITEM_IDS.d365Ticket, kind: 'ticket', title: 'D365 deployment planning, configuration and testing',
      description: 'Draft D365 ticket for deployment preparation, configuration, data checks and operational handover.',
      acceptanceCriteria: ACCEPTANCE.d365, parentId: WORK_ITEM_IDS.d365Feature, streamId: streams.d365, assigneeId: employees.ibadur, phase: 'build',
    },
  ];
  return specs.map((item) => ({ ...shared, ...item }));
}

interface ActivitySpec {
  employee: keyof typeof HARRIS_FARM_EMPLOYEE_IDS;
  workItemId: string;
  action: string;
  type: Activity['type'];
}

const ACTIVITY_SPECS: ActivitySpec[] = [
  { employee: 'ram', workItemId: WORK_ITEM_IDS.pmoTicket, action: 'CIO intake and delivery priority review', type: 'meeting' },
  { employee: 'phil', workItemId: WORK_ITEM_IDS.architectureTicket, action: 'CTO technical review and DevOps alignment', type: 'meeting' },
  { employee: 'bharat', workItemId: WORK_ITEM_IDS.dataTicket, action: 'Data requirements gathering and dependency review', type: 'meeting' },
  { employee: 'sunil', workItemId: WORK_ITEM_IDS.dataTicket, action: 'Data pipeline requirements follow-up', type: 'follow_up' },
  { employee: 'arti', workItemId: WORK_ITEM_IDS.dataTicket, action: 'Data quality checks and planning', type: 'task' },
  { employee: 'swechchha', workItemId: WORK_ITEM_IDS.pmoTicket, action: 'Delivery planning and DevOps workstream review', type: 'meeting' },
  { employee: 'daniel', workItemId: WORK_ITEM_IDS.pmoTicket, action: 'PMO ticket follow-up and action tracking', type: 'follow_up' },
  { employee: 'damien', workItemId: WORK_ITEM_IDS.qaTicket, action: 'PMO / BA coordination and QA follow-up', type: 'follow_up' },
  { employee: 'sujan', workItemId: WORK_ITEM_IDS.pmoTicket, action: 'Junior PMO planning and status update', type: 'task' },
  { employee: 'pavithra', workItemId: WORK_ITEM_IDS.pmoTicket, action: 'Junior PMO requirements follow-up', type: 'follow_up' },
  { employee: 'priyanka', workItemId: WORK_ITEM_IDS.dataTicket, action: 'BA / PMO data requirements gathering', type: 'meeting' },
  { employee: 'aliRad', workItemId: WORK_ITEM_IDS.dataTicket, action: 'Data and Finance dependency follow-up', type: 'follow_up' },
  { employee: 'raheem', workItemId: WORK_ITEM_IDS.qaTicket, action: 'QA test planning and evidence review', type: 'audit' },
  { employee: 'natasha', workItemId: WORK_ITEM_IDS.qaTicket, action: 'Release readiness follow-up', type: 'follow_up' },
  { employee: 'greg', workItemId: WORK_ITEM_IDS.architectureTicket, action: 'Lead Architect design review and technical planning', type: 'meeting' },
  { employee: 'naweesh', workItemId: WORK_ITEM_IDS.devopsTicket, action: 'DevOps pipeline planning and ticket triage', type: 'task' },
  { employee: 'rob', workItemId: WORK_ITEM_IDS.devopsTicket, action: 'DevOps pipeline implementation', type: 'task' },
  { employee: 'mohsin', workItemId: WORK_ITEM_IDS.devopsTicket, action: 'Remote DevOps ticket follow-up', type: 'follow_up' },
  { employee: 'akin', workItemId: WORK_ITEM_IDS.devopsTicket, action: 'DevOps build and requirements review', type: 'task' },
  { employee: 'michael', workItemId: WORK_ITEM_IDS.devopsTicket, action: 'DevOps deployment validation', type: 'task' },
  { employee: 'anup', workItemId: WORK_ITEM_IDS.devopsTicket, action: 'DevOps release planning', type: 'task' },
  { employee: 'mukti', workItemId: WORK_ITEM_IDS.devopsTicket, action: 'DevOps support queue follow-up', type: 'follow_up' },
  { employee: 'jayden', workItemId: WORK_ITEM_IDS.architectureTicket, action: 'Architecture design and decision records', type: 'task' },
  { employee: 'tristan', workItemId: WORK_ITEM_IDS.architectureTicket, action: 'Architecture design requirements follow-up', type: 'follow_up' },
  { employee: 'ibadur', workItemId: WORK_ITEM_IDS.d365Ticket, action: 'D365 stream planning and deployment follow-up', type: 'task' },
  { employee: 'samundra', workItemId: WORK_ITEM_IDS.d365Ticket, action: 'D365 configuration and test preparation', type: 'task' },
  { employee: 'sudeep', workItemId: WORK_ITEM_IDS.d365Ticket, action: 'D365 data checks and requirements gathering', type: 'task' },
  { employee: 'ramaparsad', workItemId: WORK_ITEM_IDS.d365Ticket, action: 'Remote D365 testing and follow-up', type: 'follow_up' },
  { employee: 'abhishek', workItemId: WORK_ITEM_IDS.d365Ticket, action: 'Remote contractor D365 support', type: 'task' },
];

function makeActivities(employees: Employee[], workItems: WorkItem[], today = new Date()): Activity[] {
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const itemMap = new Map(workItems.map((item) => [item.id, item]));
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const nextMonday = addDays(monday, 7);
  const createdAt = today.toISOString();

  return ACTIVITY_SPECS.map((spec, index) => {
    const employeeId = ID_BY_KEY[spec.employee];
    const employee = employeeMap.get(employeeId)!;
    const item = itemMap.get(spec.workItemId)!;
    const date = format(addDays(nextMonday, index % 5), 'yyyy-MM-dd');
    const managerId = employee.managerId;
    return {
      id: `hfm-act-${String(index + 1).padStart(3, '0')}`,
      title: `${spec.action} — ${item.title}`,
      description: 'Onboarding planning placeholder. Confirm the real scope, date and planned effort with the resource before execution; no actual time is pre-logged.',
      type: spec.type,
      entityId: HARRIS_FARM_ENTITY_ID,
      departmentId: HARRIS_FARM_IT_DEPT_ID,
      assigneeId: employee.id,
      createdById: managerId ?? employee.id,
      startDate: date,
      endDate: date,
      startTime: '09:00',
      endTime: '10:00',
      plannedHours: 1,
      status: 'not_started',
      priority: 'medium',
      progress: 0,
      location: employee.workLocation === 'remote' ? 'Remote · Teams' : 'Teams',
      subtasks: [{ id: `hfm-sub-${index + 1}`, title: 'Confirm scope and record outcome', done: false, plannedHours: 1 }],
      sync: { outlook: false, google: false },
      createdAt,
      workItemId: item.id,
      streamId: item.streamId ?? employee.streamId,
    };
  });
}

export interface HarrisFarmSample {
  tenant: Tenant;
  entities: Entity[];
  departments: Department[];
  employees: Employee[];
  deliveryStreams: DeliveryStream[];
  workItems: WorkItem[];
  activities: Activity[];
}

export function harrisFarmSample(today = new Date()): HarrisFarmSample {
  const tenant = TENANTS.find((row) => row.id === HARRIS_FARM_TENANT_ID)!;
  const entities: Entity[] = [
    {
      id: HARRIS_FARM_GROUP_ID, tenantId: HARRIS_FARM_TENANT_ID, name: 'Harris Farm Markets', code: 'HFM-GRP',
      type: 'group', parentId: null, countryCode: 'AU', timezone: 'Australia/Sydney',
      industry: 'Retail — fresh food, stores & supply chain', currency: 'AUD',
    },
    {
      id: HARRIS_FARM_ENTITY_ID, tenantId: HARRIS_FARM_TENANT_ID, name: 'HarrisFarm Markets', code: 'HFM',
      type: 'company', parentId: HARRIS_FARM_GROUP_ID, countryCode: 'AU', timezone: 'Australia/Sydney',
      industry: 'Retail — fresh food, stores & supply chain', currency: 'AUD',
    },
  ];
  const employees = makeEmployees();
  const ram = employees.find((employee) => employee.id === HARRIS_FARM_EMPLOYEE_IDS.ram)!;
  const angus = employees.find((employee) => employee.id === HARRIS_FARM_EMPLOYEE_IDS.angus)!;
  const departments: Department[] = [{
    id: HARRIS_FARM_IT_DEPT_ID,
    entityId: HARRIS_FARM_ENTITY_ID,
    name: 'Information Technology',
    code: 'HIT',
    headId: ram.id,
    opsOwnerId: angus.id,
    costCenter: 'HFM-IT',
    color: '#0f766e',
    devopsEnabled: true,
  }];
  const deliveryStreams = makeStreams();
  const workItems = makeWorkItems(today.toISOString());
  const activities = makeActivities(employees, workItems, today);
  return { tenant, entities, departments, employees, deliveryStreams, workItems, activities };
}

/** Add the Harris Farm onboarding rows once to an older pilot snapshot. */
export function withHarrisFarmSample<T extends {
  tenants?: Tenant[];
  entities: Entity[];
  departments: Department[];
  employees: Employee[];
  deliveryStreams?: DeliveryStream[];
  workItems?: WorkItem[];
  activities: Activity[];
}>(state: T): T & { tenants: Tenant[]; deliveryStreams: DeliveryStream[]; workItems: WorkItem[] } {
  const sample = harrisFarmSample();
  const mergeById = <Row extends { id: string }>(existing: Row[] | undefined, added: Row[]) => {
    const rows = existing ?? [];
    const ids = new Set(rows.map((row) => row.id));
    return [...rows, ...added.filter((row) => !ids.has(row.id))];
  };
  return {
    ...state,
    tenants: mergeById(state.tenants, [sample.tenant]),
    entities: mergeById(state.entities, sample.entities),
    departments: mergeById(state.departments, sample.departments),
    employees: mergeById(state.employees, sample.employees),
    deliveryStreams: mergeById(state.deliveryStreams, sample.deliveryStreams),
    workItems: mergeById(state.workItems, sample.workItems),
    activities: mergeById(state.activities, sample.activities),
  };
}

export const HARRIS_FARM_ACTIVITY_TEMPLATES = ACTIVITY_SPECS.map(({ employee, workItemId, action, type }) => ({
  employeeId: HARRIS_FARM_EMPLOYEE_IDS[employee], workItemId, action, type,
}));
