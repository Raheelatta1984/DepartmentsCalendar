import { addDays, differenceInCalendarDays, format, startOfWeek } from 'date-fns';
import type {
  Activity,
  ActivityType,
  CapitalisationPolicy,
  Department,
  Employee,
  Entity,
  Project,
  ProjectCategory,
  ProjectStage,
  ProjectStatus,
  ProjectTask,
  Role,
  StoreState,
  TaskPhase,
  TimeEntry,
} from '../types';

/* ------------------------------------------------------------------ */
/* Harbourline Retail Australia — a standalone Australian retail group */
/* Deliberately independent of Meridian Group: own entity tree, people, */
/* departments, AUD reporting currency and IT-only capex portfolio.     */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261022);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const TODAY = new Date();
const todayMid = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export const RETAIL_GROUP_ID = 'ent-hra-group';
export const RETAIL_COMPANY_ID = 'ent-hra-retail';
export const RETAIL_SERVICES_ID = 'ent-hra-services';
export const RETAIL_IT_DEPT_ID = 'rdept-it';

/* ------------------------------------------------------------------ */
/* Entity tree — a new, separate group with its own company + sub-co    */
/* ------------------------------------------------------------------ */
export const RETAIL_ENTITIES: Entity[] = [
  {
    id: RETAIL_GROUP_ID,
    name: 'Harbourline Retail Australia',
    code: 'HRA',
    type: 'group',
    parentId: null,
    countryCode: 'AU',
    timezone: 'Australia/Sydney',
    industry: 'Retail — stores, eCommerce & supply chain',
    currency: 'AUD',
  },
  {
    id: RETAIL_COMPANY_ID,
    name: 'Harbourline Retail Australia Pty Ltd',
    code: 'HRAL',
    type: 'company',
    parentId: RETAIL_GROUP_ID,
    countryCode: 'AU',
    timezone: 'Australia/Sydney',
    industry: 'Omnichannel retail',
    currency: 'AUD',
  },
  {
    id: RETAIL_SERVICES_ID,
    name: 'Harbourline Retail Services Pty Ltd',
    code: 'HRSV',
    type: 'sub_company',
    parentId: RETAIL_COMPANY_ID,
    countryCode: 'AU',
    timezone: 'Australia/Melbourne',
    industry: 'Store operations & distribution support',
    currency: 'AUD',
  },
];

interface RetailDeptSpec {
  id: string;
  name: string;
  code: string;
  entityId: string;
  color: string;
  head: string;
  headRole: Role;
  costCenter: string;
}

const RETAIL_DEPT_SPECS: RetailDeptSpec[] = [
  { id: 'rdept-exec', name: 'Retail Executive Office', code: 'REX', entityId: RETAIL_GROUP_ID, color: '#8b5cf6', head: 'Charlotte Whitmore', headRole: 'ceo', costCenter: 'HRA-100' },
  { id: RETAIL_IT_DEPT_ID, name: 'Information Technology (PMO)', code: 'RIT', entityId: RETAIL_COMPANY_ID, color: '#06b6d4', head: 'Priya Raman', headRole: 'department_head', costCenter: 'HRA-420' },
  { id: 'rdept-storeops', name: 'Store Operations', code: 'RSO', entityId: RETAIL_SERVICES_ID, color: '#3b82f6', head: 'Daniel Nguyen', headRole: 'department_head', costCenter: 'HRA-210' },
  { id: 'rdept-merch', name: 'Merchandising & Buying', code: 'RMB', entityId: RETAIL_COMPANY_ID, color: '#f59e0b', head: 'Sarah Kowalski', headRole: 'department_head', costCenter: 'HRA-320' },
  { id: 'rdept-finance', name: 'Finance & Commercial', code: 'RFC', entityId: RETAIL_COMPANY_ID, color: '#eab308', head: "Michael O'Brien", headRole: 'department_head', costCenter: 'HRA-120' },
  { id: 'rdept-supply', name: 'Supply Chain & Logistics', code: 'RSC', entityId: RETAIL_SERVICES_ID, color: '#84cc16', head: 'Amara Okafor', headRole: 'department_head', costCenter: 'HRA-310' },
  { id: 'rdept-digital', name: 'Digital & eCommerce', code: 'RDX', entityId: RETAIL_COMPANY_ID, color: '#ec4899', head: 'Wei Chen', headRole: 'department_head', costCenter: 'HRA-330' },
  { id: 'rdept-people', name: 'People & Culture', code: 'RPC', entityId: RETAIL_GROUP_ID, color: '#14b8a6', head: 'Isabella Rossi', headRole: 'department_head', costCenter: 'HRA-130' },
];

export const RETAIL_DEPARTMENTS: Department[] = RETAIL_DEPT_SPECS.map((spec) => ({
  id: spec.id,
  entityId: spec.entityId,
  name: spec.name,
  code: spec.code,
  headId: null,
  opsOwnerId: null,
  costCenter: spec.costCenter,
  color: spec.color,
}));

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */
export const RETAIL_EMPLOYEES: Employee[] = [];
let empSeq = 0;

function addRetailEmployee(input: {
  name: string;
  role: Role;
  departmentId: string;
  entityId: string;
  managerId: string | null;
  costRateAUD: number;
  weeklyHours?: number;
  joinDate?: string;
  status?: Employee['status'];
  title?: string;
}): Employee {
  empSeq += 1;
  const slug = input.name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean).join('.');
  const emp: Employee = {
    id: `rtl-emp-${String(empSeq).padStart(3, '0')}`,
    name: input.name,
    email: `${slug}@harbourlineretail.com.au`,
    code: `HRA-${String(2000 + empSeq)}`,
    entityId: input.entityId,
    departmentId: input.departmentId,
    role: input.role,
    managerId: input.managerId,
    countryCode: 'AU',
    weeklyHours: input.weeklyHours ?? 38,
    joinDate: input.joinDate ?? `20${between(15, 24)}-0${between(1, 9)}-${String(between(10, 27)).padStart(2, '0')}`,
    status: input.status ?? 'active',
    avatarColor: ['#0ea5e9', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#eab308'][empSeq % 8],
    costRateAUD: input.costRateAUD,
  };
  RETAIL_EMPLOYEES.push(emp);
  return emp;
}

const retailCeo = addRetailEmployee({
  name: 'Charlotte Whitmore',
  role: 'ceo',
  departmentId: 'rdept-exec',
  entityId: RETAIL_GROUP_ID,
  managerId: null,
  costRateAUD: 260,
  weeklyHours: 40,
  joinDate: '2018-03-05',
  title: 'Chief Executive Officer',
});

const retailCoo = addRetailEmployee({
  name: 'Marcus Webb',
  role: 'head_operations',
  departmentId: 'rdept-exec',
  entityId: RETAIL_GROUP_ID,
  managerId: retailCeo.id,
  costRateAUD: 225,
  weeklyHours: 40,
  joinDate: '2019-07-15',
  title: 'Chief Operating Officer',
});

const deptHeads = new Map<string, Employee>();
RETAIL_DEPT_SPECS.forEach((spec) => {
  const head = addRetailEmployee({
    name: spec.head,
    role: spec.headRole,
    departmentId: spec.id,
    entityId: spec.entityId,
    managerId: spec.headRole === 'ceo' ? null : retailCoo.id,
    costRateAUD: spec.id === RETAIL_IT_DEPT_ID ? 185 : 195,
    weeklyHours: 40,
    joinDate: `20${between(15, 22)}-0${between(1, 9)}-1${between(0, 9)}`,
    title: spec.id === RETAIL_IT_DEPT_ID ? 'Chief Information Officer' : `${spec.name} Head`,
  });
  deptHeads.set(spec.id, head);
});
const cio = deptHeads.get(RETAIL_IT_DEPT_ID)!;
export const RETAIL_CIO_ID = cio.id;

RETAIL_DEPARTMENTS.forEach((d) => {
  d.headId = deptHeads.get(d.id)?.id ?? null;
  d.opsOwnerId = retailCoo.id;
});

const pmoManager = addRetailEmployee({
  name: 'Ravi Deshpande',
  role: 'manager',
  departmentId: RETAIL_IT_DEPT_ID,
  entityId: RETAIL_COMPANY_ID,
  managerId: cio.id,
  costRateAUD: 155,
  joinDate: '2020-02-17',
  title: 'PMO & Delivery Manager',
});
const opsManager = addRetailEmployee({
  name: 'Helen Park',
  role: 'manager',
  departmentId: RETAIL_IT_DEPT_ID,
  entityId: RETAIL_COMPANY_ID,
  managerId: cio.id,
  costRateAUD: 150,
  joinDate: '2019-11-04',
  title: 'IT Operations Manager',
});
const securityManager = addRetailEmployee({
  name: 'Tomasz Nowak',
  role: 'manager',
  departmentId: RETAIL_IT_DEPT_ID,
  entityId: RETAIL_COMPANY_ID,
  managerId: cio.id,
  costRateAUD: 160,
  joinDate: '2021-01-11',
  title: 'Cyber Security Manager',
});

const IT_LEADS = [
  { name: 'Ayesha Siddiqui', title: 'Delivery Lead — Store Systems', rate: 138 },
  { name: 'Ben Carter', title: 'Delivery Lead — Digital', rate: 138 },
  { name: 'Nina Petrova', title: 'Data & Analytics Lead', rate: 142 },
  { name: 'Owen Fitzgerald', title: 'Infrastructure & Cloud Lead', rate: 140 },
  { name: 'Grace Liu', title: 'Security Operations Lead', rate: 145 },
];
const itLeads = IT_LEADS.map((lead) =>
  addRetailEmployee({
    name: lead.name,
    role: 'supervisor',
    departmentId: RETAIL_IT_DEPT_ID,
    entityId: RETAIL_COMPANY_ID,
    managerId: pick([pmoManager.id, opsManager.id, securityManager.id]),
    costRateAUD: lead.rate,
    joinDate: `20${between(17, 23)}-0${between(1, 9)}-${String(between(10, 27)).padStart(2, '0')}`,
    title: lead.title,
  }),
);

const IT_ENGINEERS: { name: string; rate: number; reportsTo: Employee; title: string }[] = [
  { name: "Liam O'Connor", rate: 118, reportsTo: itLeads[0], title: 'Senior POS Engineer' },
  { name: 'Mei Tanaka', rate: 112, reportsTo: itLeads[0], title: 'Integration Engineer' },
  { name: 'Jack Morrison', rate: 105, reportsTo: itLeads[0], title: 'Store Systems Analyst' },
  { name: 'Fatima Al Hashimi', rate: 108, reportsTo: itLeads[0], title: 'Test Analyst' },
  { name: 'Ethan Brooks', rate: 102, reportsTo: itLeads[1], title: 'Full-stack Developer' },
  { name: 'Sofia Marchetti', rate: 106, reportsTo: itLeads[1], title: 'Front-end Developer' },
  { name: 'Noah Williams', rate: 110, reportsTo: itLeads[1], title: 'Mobile Developer' },
  { name: 'Chloe Martin', rate: 104, reportsTo: itLeads[1], title: 'UX Designer' },
  { name: 'Aditya Rao', rate: 115, reportsTo: itLeads[2], title: 'Data Engineer' },
  { name: 'Hannah Schmidt', rate: 112, reportsTo: itLeads[2], title: 'Analytics Engineer' },
  { name: 'Kofi Mensah', rate: 108, reportsTo: itLeads[2], title: 'BI Developer' },
  { name: 'Elena Volkova', rate: 118, reportsTo: itLeads[3], title: 'Cloud Platform Engineer' },
  { name: 'Sam Whitfield', rate: 110, reportsTo: itLeads[3], title: 'Network Engineer' },
  { name: 'Priyanka Nair', rate: 112, reportsTo: itLeads[3], title: 'Systems Engineer' },
  { name: 'Tom Baker', rate: 100, reportsTo: itLeads[3], title: 'Service Desk Analyst' },
  { name: 'Aroha Ngata', rate: 102, reportsTo: itLeads[3], title: 'Endpoint Engineer' },
  { name: 'Ismail Yilmaz', rate: 122, reportsTo: itLeads[4], title: 'Security Engineer' },
  { name: 'Rebecca Adeyemi', rate: 120, reportsTo: itLeads[4], title: 'IAM Specialist' },
  { name: 'Lucas Pereira', rate: 116, reportsTo: itLeads[4], title: 'SOC Analyst' },
  { name: 'Zoe Anderson', rate: 114, reportsTo: itLeads[4], title: 'GRC Analyst' },
  { name: 'Muhammad Iqbal', rate: 108, reportsTo: pmoManager, title: 'PMO Analyst' },
  { name: "Kate O'Sullivan", rate: 106, reportsTo: pmoManager, title: 'Business Analyst' },
  { name: 'Rafael Costa', rate: 104, reportsTo: opsManager, title: 'Application Support Analyst' },
  { name: 'Yasmin Haddad', rate: 102, reportsTo: opsManager, title: 'Service Management Analyst' },
];
const itEngineers = IT_ENGINEERS.map((eng) =>
  addRetailEmployee({
    name: eng.name,
    role: 'employee',
    departmentId: RETAIL_IT_DEPT_ID,
    entityId: RETAIL_COMPANY_ID,
    managerId: eng.reportsTo.id,
    costRateAUD: eng.rate,
    joinDate: `20${between(18, 24)}-0${between(1, 9)}-${String(between(10, 27)).padStart(2, '0')}`,
    title: eng.title,
  }),
);

const itTeam = RETAIL_EMPLOYEES.filter((e) => e.departmentId === RETAIL_IT_DEPT_ID);

/* A small business-side population so the retail group is not just IT. */
const BUSINESS_STAFF: { name: string; dept: string; role: Role; rate: number }[] = [
  { name: 'Holly Bennett', dept: 'rdept-storeops', role: 'supervisor', rate: 92 },
  { name: 'Dylan Hughes', dept: 'rdept-storeops', role: 'employee', rate: 78 },
  { name: 'Natalie Kim', dept: 'rdept-merch', role: 'supervisor', rate: 98 },
  { name: 'Oscar Reid', dept: 'rdept-finance', role: 'supervisor', rate: 105 },
  { name: 'Ivy Chandler', dept: 'rdept-supply', role: 'supervisor', rate: 96 },
  { name: 'Leo Tanaka', dept: 'rdept-digital', role: 'supervisor', rate: 112 },
  { name: 'Mia Fitzgerald', dept: 'rdept-people', role: 'supervisor', rate: 94 },
];
const businessStaff = BUSINESS_STAFF.map((person) => {
  const dept = RETAIL_DEPT_SPECS.find((d) => d.id === person.dept)!;
  return addRetailEmployee({
    name: person.name,
    role: person.role,
    departmentId: person.dept,
    entityId: dept.entityId,
    managerId: deptHeads.get(person.dept)?.id ?? retailCoo.id,
    costRateAUD: person.rate,
    joinDate: `20${between(16, 23)}-0${between(1, 9)}-${String(between(10, 27)).padStart(2, '0')}`,
  });
});

/* ------------------------------------------------------------------ */
/* Capitalisation policy (AASB 138 / IAS 38)                           */
/* ------------------------------------------------------------------ */
export const RETAIL_CAPITALISATION_POLICY: CapitalisationPolicy = {
  currency: 'AUD',
  standard: 'AASB 138 / IAS 38 — intangible assets arising from development',
  eligiblePhases: ['design', 'build', 'test', 'deploy', 'hypercare'],
  excludedPhases: ['discovery', 'support', 'training'],
  minimumHours: 0.5,
  roleCostRates: {
    ceo: 260,
    head_operations: 225,
    department_head: 185,
    unit_head: 160,
    manager: 155,
    supervisor: 140,
    employee: 110,
  },
  evidence: [
    'Technical feasibility of completing the intangible asset is established.',
    'Intention and ability to complete the asset and use or sell it.',
    'The asset will generate probable future economic benefits (approved business case and board funding).',
    'Adequate technical, financial and other resources are available to complete development.',
    'Expenditure attributable to the asset is reliably measured from approved timesheets.',
    'Only development-phase effort is capitalised; research, BAU support and training are expensed.',
  ],
  approverRole: 'Board Audit & Risk Committee, on recommendation of the CIO and CFO',
};

/* ------------------------------------------------------------------ */
/* Project portfolio — 110 IT projects, 30 of them capital             */
/* ------------------------------------------------------------------ */
interface ProjectSpec {
  name: string;
  category: ProjectCategory;
  portfolio: 'capital' | 'operational';
}

const CAPITAL_SPECS: ProjectSpec[] = [
  { name: 'POS Platform Replacement — Phase 2', category: 'delivery', portfolio: 'capital' },
  { name: 'Store Network Refresh — NSW', category: 'network', portfolio: 'capital' },
  { name: 'Loyalty & CRM Platform Rebuild', category: 'delivery', portfolio: 'capital' },
  { name: 'eCommerce Replatform — Headless', category: 'digital_experience', portfolio: 'capital' },
  { name: 'Warehouse Automation Integration', category: 'integration', portfolio: 'capital' },
  { name: 'Cloud Data Platform Foundation', category: 'data_analytics', portfolio: 'capital' },
  { name: 'Zero Trust Identity Programme', category: 'security', portfolio: 'capital' },
  { name: 'Self-Checkout Rollout — 120 Stores', category: 'delivery', portfolio: 'capital' },
  { name: 'Finance ERP Upgrade — SAP S/4HANA', category: 'enterprise_apps', portfolio: 'capital' },
  { name: 'Digital Picking & Click-and-Collect', category: 'digital_experience', portfolio: 'capital' },
  { name: 'Retail Media Platform', category: 'digital_experience', portfolio: 'capital' },
  { name: 'Supply Chain Control Tower', category: 'data_analytics', portfolio: 'capital' },
  { name: 'Store Back-Office Modernisation', category: 'delivery', portfolio: 'capital' },
  { name: 'Customer Data Platform', category: 'data_analytics', portfolio: 'capital' },
  { name: 'Fraud & Chargeback Analytics', category: 'security', portfolio: 'capital' },
  { name: 'Distribution Centre Network Segmentation', category: 'security', portfolio: 'capital' },
  { name: 'Pricing & Promotions Engine', category: 'enterprise_apps', portfolio: 'capital' },
  { name: 'Workforce Management System', category: 'enterprise_apps', portfolio: 'capital' },
  { name: 'Mobile Store Operations App', category: 'delivery', portfolio: 'capital' },
  { name: 'API Gateway & Integration Fabric', category: 'integration', portfolio: 'capital' },
  { name: 'IT Service Management Replacement', category: 'operations', portfolio: 'capital' },
  { name: 'Merchandising Planning Suite', category: 'enterprise_apps', portfolio: 'capital' },
  { name: 'Sustainability Reporting Platform', category: 'compliance', portfolio: 'capital' },
  { name: 'Contact Centre Cloud Migration', category: 'network', portfolio: 'capital' },
  { name: 'Data Governance & Catalogue', category: 'data_analytics', portfolio: 'capital' },
  { name: 'Payment Tokenisation — PCI DSS 4.0', category: 'security', portfolio: 'capital' },
  { name: 'In-Store Analytics Platform', category: 'data_analytics', portfolio: 'capital' },
  { name: 'Backup & Disaster Recovery Uplift', category: 'infrastructure', portfolio: 'capital' },
  { name: 'Vendor Portal Rebuild', category: 'integration', portfolio: 'capital' },
  { name: 'Store Wi-Fi 6E Upgrade', category: 'network', portfolio: 'capital' },
];

const OPERATIONAL_SPECS: ProjectSpec[] = [
  ...['BAU — POS incident & problem management', 'Store level 1/2 service desk', 'IT change & release governance', 'Field services coordination', 'Store openings & closures technology support', 'Peak trading readiness — Black Friday & Boxing Day', 'IT asset & stocktake management', 'Print & label fleet support', 'Endpoint patching and lifecycle', 'Telco and mobility expense management', 'IT procurement and vendor administration', 'Service catalogue and knowledge management', 'Batch scheduling and overnight operations', 'Store network fault coordination', 'IT communications and training calendar', 'POS device testing lab', 'Retail tech bar support rosters', 'Incident communications and reporting', 'IT capacity and resource planning', 'Business continuity exercises — IT'].map((name) => ({ name, category: 'operations' as ProjectCategory, portfolio: 'operational' as const })),
  ...['SOC monitoring and triage', 'Vulnerability management and remediation', 'Identity and access management operations', 'Privileged access recertification', 'Phishing simulation and awareness', 'Endpoint detection and response tuning', 'Firewall and proxy rule governance', 'PCI DSS continuous compliance', 'Third-party security assessments', 'Incident response readiness', 'Security architecture review board', 'Data loss prevention operations'].map((name) => ({ name, category: 'security' as ProjectCategory, portfolio: 'operational' as const })),
  ...['Azure landing zone operations', 'VMware and compute estate maintenance', 'Network capacity management', 'Microsoft 365 administration', 'Backup and restore operations', 'Database administration', 'Middleware and integration runtime support', 'VDI and store back-office images', 'Storage lifecycle management', 'Cloud cost optimisation', 'Data centre access and facilities', 'IT monitoring and observability'].map((name) => ({ name, category: 'infrastructure' as ProjectCategory, portfolio: 'operational' as const })),
  ...['Enterprise reporting BAU', 'Power BI service administration', 'Data quality remediation', 'Master data management operations', 'Demand forecasting model tuning', 'Customer insights reporting', 'Retail analytics advisory', 'Data platform release management'].map((name) => ({ name, category: 'data_analytics' as ProjectCategory, portfolio: 'operational' as const })),
  ...['Integration platform operations', 'API lifecycle management', 'EDI partner onboarding', 'Payment gateway support', 'Loyalty and CRM integrations BAU', 'Supplier portal support', 'Marketplace channel integrations'].map((name) => ({ name, category: 'integration' as ProjectCategory, portfolio: 'operational' as const })),
  ...['eCommerce run and release management', 'CMS content operations', 'Mobile app maintenance', 'Search relevance tuning', 'Personalisation operations', 'A/B testing and analytics tagging', 'Customer care tooling support'].map((name) => ({ name, category: 'digital_experience' as ProjectCategory, portfolio: 'operational' as const })),
  ...['ERP application support', 'HRIS administration', 'Merchandise planning support', 'WMS application support', 'CRM administration', 'Finance systems month-end support'].map((name) => ({ name, category: 'enterprise_apps' as ProjectCategory, portfolio: 'operational' as const })),
  ...['SD-WAN operations', 'Store connectivity support', 'Wireless performance tuning', 'Telephony and contact centre operations'].map((name) => ({ name, category: 'network' as ProjectCategory, portfolio: 'operational' as const })),
  ...['IT audit coordination', 'IT controls testing support', 'Software licence compliance', 'Records and retention management'].map((name) => ({ name, category: 'compliance' as ProjectCategory, portfolio: 'operational' as const })),
];

const PROJECT_SPECS = [...CAPITAL_SPECS, ...OPERATIONAL_SPECS];

const STAGE_BY_INDEX: ProjectStage[] = ['build', 'build', 'test', 'deploy', 'hypercare', 'design', 'build', 'business_case', 'approved', 'design'];
const STATUS_BY_STAGE: Record<ProjectStage, ProjectStatus> = {
  idea: 'pipeline',
  business_case: 'pipeline',
  approved: 'pipeline',
  design: 'active',
  build: 'active',
  test: 'active',
  deploy: 'active',
  hypercare: 'active',
  closed: 'completed',
  on_hold: 'on_hold',
};

const CAPITAL_TASK_PLAN: { phase: TaskPhase; title: string; share: number }[] = [
  { phase: 'discovery', title: 'Discovery & requirements', share: 0.12 },
  { phase: 'design', title: 'Solution design & architecture', share: 0.16 },
  { phase: 'build', title: 'Configuration & build', share: 0.32 },
  { phase: 'test', title: 'System & UAT testing', share: 0.18 },
  { phase: 'deploy', title: 'Deployment & cutover', share: 0.12 },
  { phase: 'hypercare', title: 'Hypercare & stabilisation', share: 0.06 },
  { phase: 'support', title: 'BAU support handover', share: 0.04 },
];

const OPERATIONAL_TASK_PLAN: { phase: TaskPhase; title: string; share?: number }[] = [
  { phase: 'support', title: 'Run & maintain' },
  { phase: 'support', title: 'Minor enhancements & change requests' },
  { phase: 'training', title: 'Service reporting & user education' },
];

export const RETAIL_PROJECTS: Project[] = [];
export const RETAIL_ACTIVITIES: Activity[] = [];
export const RETAIL_TIME_ENTRIES: TimeEntry[] = [];

let projectSeq = 0;
let activitySeq = 0;
let entrySeq = 0;

const sponsorPool = [retailCeo, retailCoo, cio];
const managerPool = [pmoManager, opsManager, securityManager, ...itLeads];
const assigneePool = itTeam.filter((e) => e.role === 'employee' || e.role === 'supervisor');
const locationPool = ['Sydney CBD — Level 12', 'Bella Vista office', 'Eastern Creek DC', 'Store lab — Auburn', 'Hybrid — Teams'];

const NOTES: Record<TaskPhase, string[]> = {
  design: ['Design workshop completed; architecture decision recorded.', 'Solution options reviewed with the vendor.', 'Design sign-off pack updated.'],
  build: ['Build sprint completed; unit tests passing.', 'Configuration deployed to the dev environment.', 'Code review and merge completed.'],
  test: ['UAT script executed; two defects raised.', 'Regression pack 84% complete.', 'Performance test results reviewed with the vendor.'],
  deploy: ['Cutover checklist executed for 12 stores.', 'Deployment window completed without incident.', 'Hypercare rota confirmed with store operations.'],
  hypercare: ['Store check-ins completed; no P1 incidents.', 'Defect triage with the vendor.', 'Stabilisation metrics reviewed.'],
  support: ['Routine support and monitoring completed.', 'Service request queue cleared.', 'BAU handover knowledge article published.'],
  discovery: ['Requirements workshop held with business stakeholders.', 'Current-state assessment documented.', 'Vendor demonstration and scoring completed.'],
  training: ['Store team training session delivered.', 'Knowledge base article updated.', 'Service review pack prepared.'],
};

PROJECT_SPECS.forEach((spec, index) => {
  projectSeq += 1;
  const isCapital = spec.portfolio === 'capital';
  const code = isCapital ? `HRA-CAP-${String(projectSeq).padStart(3, '0')}` : `HRA-OPS-${String(projectSeq - CAPITAL_SPECS.length).padStart(3, '0')}`;
  const id = `rtl-prj-${String(projectSeq).padStart(3, '0')}`;

  // Capital projects are staggered from 14 months ago to 4 months ahead;
  // the last few are board-approved pipeline with no effort yet.
  const startOffset = isCapital ? (index < 26 ? -between(60, 420) : between(40, 120)) : -between(400, 720);
  const durationDays = isCapital ? between(200, 430) : between(320, 900);
  const start = addDays(todayMid, startOffset);
  const end = addDays(start, durationDays);

  let stage: ProjectStage;
  let status: ProjectStatus;
  if (isCapital) {
    if (index >= 26) {
      stage = (['business_case', 'approved', 'idea'] as ProjectStage[])[index - 26] ?? 'business_case';
      status = 'pipeline';
    } else if (index < 3) {
      stage = 'hypercare';
      status = 'active';
    } else if (index < 5) {
      stage = 'deploy';
      status = 'active';
    } else if (index < 8) {
      stage = 'test';
      status = 'active';
    } else {
      stage = STAGE_BY_INDEX[index % STAGE_BY_INDEX.length];
      status = STATUS_BY_STAGE[stage];
    }
  } else {
    stage = 'closed';
    status = 'active';
  }

  const budget = isCapital ? between(6, 180) * 100000 : between(4, 30) * 25000;
  const capex = isCapital ? Math.round(budget * (between(72, 92) / 100)) : 0;
  const manager = pick(managerPool);
  const projectTasks: ProjectTask[] = [];
  const plan: { phase: TaskPhase; title: string; share?: number }[] = isCapital ? CAPITAL_TASK_PLAN : OPERATIONAL_TASK_PLAN;

  let cursor = start;
  const totalDays = Math.max(plan.length, differenceInCalendarDays(end, start));
  plan.forEach((step, stepIndex) => {
    activitySeq += 1;
    const share = step.share ?? 1 / plan.length;
    const taskDays = Math.max(7, Math.round(totalDays * share));
    const taskStart = cursor;
    const taskEnd = addDays(taskStart, taskDays);
    cursor = taskEnd;
    const taskId = `rtl-pt-${String(projectSeq).padStart(3, '0')}-${stepIndex + 1}`;
    const activityId = `rtl-act-${String(activitySeq).padStart(4, '0')}`;
    const capitalisable = isCapital && RETAIL_CAPITALISATION_POLICY.eligiblePhases.includes(step.phase);
    const assignee = assigneePool[(projectSeq * 3 + stepIndex) % assigneePool.length];
    const plannedHours = isCapital
      ? Math.round(between(60, 220) * (share + 0.4))
      : between(20, 90);

    projectTasks.push({
      id: taskId,
      projectId: id,
      activityId,
      title: `${step.title} — ${spec.name}`,
      phase: step.phase,
      capitalisable,
      plannedHours,
      startDate: iso(taskStart),
      endDate: iso(taskEnd),
    });

    const day = new Date();
    const inPast = taskEnd < day;
    const ongoing = taskStart <= day && taskEnd >= day;
    const taskStatus = status === 'pipeline' ? 'not_started' : inPast ? (rnd() > 0.12 ? 'completed' : 'in_progress') : ongoing ? 'in_progress' : 'not_started';
    const progress = taskStatus === 'completed' ? 100 : taskStatus === 'in_progress' ? between(25, 85) : 0;

    RETAIL_ACTIVITIES.push({
      id: activityId,
      title: `${step.title} — ${spec.name}`,
      description: `${isCapital ? 'Capital project' : 'Operational run'} task on ${spec.name} (${code}). Phase: ${step.phase}. ${capitalisable ? 'Development effort is capitalisable under the AASB 138 policy.' : 'Effort is expensed and excluded from the capitalisation report.'}`,
      type: 'task',
      entityId: RETAIL_COMPANY_ID,
      departmentId: RETAIL_IT_DEPT_ID,
      assigneeId: assignee.id,
      createdById: manager.id,
      startDate: iso(taskStart),
      endDate: iso(taskEnd),
      plannedHours,
      status: taskStatus,
      priority: isCapital ? pick(['critical', 'high', 'high', 'medium'] as const) : pick(['medium', 'low'] as const),
      progress,
      location: pick(locationPool),
      subtasks: [
        { id: `${taskId}-s1`, title: 'Prepare inputs & confirm scope', done: progress > 25, plannedHours: Math.round(plannedHours * 0.2) },
        { id: `${taskId}-s2`, title: 'Execute and record outcome', done: progress > 70, plannedHours: Math.round(plannedHours * 0.6) },
        { id: `${taskId}-s3`, title: 'PMO evidence & sign-off', done: progress === 100, plannedHours: Math.round(plannedHours * 0.2) },
      ],
      sync: { outlook: false, google: false },
      createdAt: iso(addDays(taskStart, -between(3, 20))),
      projectId: id,
      projectTaskId: taskId,
      capitalisable,
      projectPhase: step.phase,
    });
  });

  RETAIL_PROJECTS.push({
    id,
    code,
    name: spec.name,
    description: isCapital
      ? `${spec.name} is a board-funded capital initiative in the ${spec.category.replace('_', ' ')} portfolio. Development effort is capitalised once AASB 138 criteria are met.`
      : `${spec.name} is a recurring IT operational service. All effort is expensed and appears only in the team utilisation report.`,
    entityId: RETAIL_COMPANY_ID,
    departmentId: RETAIL_IT_DEPT_ID,
    portfolio: spec.portfolio,
    category: spec.category,
    stage,
    status,
    priority: isCapital ? pick(['critical', 'high', 'high', 'medium'] as const) : pick(['medium', 'low'] as const),
    sponsorId: pick(sponsorPool).id,
    managerId: manager.id,
    startDate: iso(start),
    endDate: iso(end),
    budgetAUD: budget,
    capexAUD: capex,
    opexAUD: budget - capex,
    capitalisationRate: isCapital ? [1, 1, 0.9, 1, 0.85][projectSeq % 5] : 0,
    assetClass: isCapital ? pick(['Software — internally developed', 'Software — purchased & configured', 'Network infrastructure', 'Hardware — store systems']) : 'Expensed operating cost',
    usefulLifeYears: isCapital ? pick([3, 4, 5, 7]) : 0,
    capitalisationStart: isCapital ? iso(addDays(start, 20)) : iso(start),
    capitalisationEnd: isCapital ? iso(addDays(end, 30)) : iso(end),
    boardApproved: isCapital,
    wbsCode: isCapital ? `HRA-${spec.category.toUpperCase()}-${String(projectSeq).padStart(3, '0')}` : `HRA-RUN-${String(projectSeq).padStart(3, '0')}`,
    tasks: projectTasks,
  });
});

/* Non-project IT BAU activities: these hours are never capitalised but they
   stay in the team utilisation denominator, which the board pack reconciles. */
const IT_BAU_ACTIVITIES: { title: string; type: ActivityType; phase: TaskPhase; assignee: Employee }[] = [
  { title: 'Service desk escalation — store trading incidents', type: 'follow_up', phase: 'support', assignee: itEngineers[14] },
  { title: 'IT leadership team meeting', type: 'meeting', phase: 'support', assignee: pmoManager },
  { title: 'Vendor contract and renewal review', type: 'task', phase: 'support', assignee: opsManager },
  { title: 'Cyber tabletop exercise — store outage', type: 'session', phase: 'training', assignee: securityManager },
  { title: 'Architecture review board', type: 'meeting', phase: 'discovery', assignee: itLeads[3] },
  { title: 'Graduate and intern mentoring', type: 'training', phase: 'training', assignee: itLeads[1] },
];
IT_BAU_ACTIVITIES.forEach((spec, i) => {
  activitySeq += 1;
  const start = addDays(todayMid, -between(20, 55));
  RETAIL_ACTIVITIES.push({
    id: `rtl-act-${String(activitySeq).padStart(4, '0')}`,
    title: spec.title,
    description: `${spec.title} — IT department business-as-usual effort with no capital project linkage. Expensed.`,
    type: spec.type,
    entityId: RETAIL_COMPANY_ID,
    departmentId: RETAIL_IT_DEPT_ID,
    assigneeId: spec.assignee.id,
    createdById: cio.id,
    startDate: iso(start),
    endDate: iso(addDays(start, 30 + i)),
    plannedHours: between(6, 18),
    status: 'in_progress',
    priority: 'medium',
    progress: between(30, 80),
    location: 'Sydney CBD — Level 12',
    subtasks: [],
    sync: { outlook: false, google: false },
    createdAt: iso(addDays(start, -4)),
    projectPhase: spec.phase,
    capitalisable: false,
  });
});

/* Non-project IT activities + business-side activities so every retail
   department has a living calendar (kept small for snapshot size). */
const GENERAL_ACTIVITY_TITLES: Record<string, string[]> = {
  'rdept-storeops': ['Store trading review', 'Weekend rostering sign-off', 'Store compliance walk'],
  'rdept-merch': ['Range review session', 'Supplier negotiation', 'Markdown approval'],
  'rdept-finance': ['Month-end close checklist', 'Board pack preparation', 'Capital review with PMO'],
  'rdept-supply': ['DC capacity review', 'Freight exception management', 'Stock integrity audit'],
  'rdept-digital': ['Trading performance review', 'Campaign readiness check', 'Customer journey workshop'],
  'rdept-people': ['Recruitment pipeline review', 'Enterprise agreement briefing', 'Engagement survey follow-up'],
  'rdept-exec': ['Executive committee meeting', 'Board pre-read review', 'Strategy offsite planning'],
};
businessStaff.forEach((emp, i) => {
  const titles = GENERAL_ACTIVITY_TITLES[emp.departmentId] ?? ['Departmental review'];
  titles.forEach((title, j) => {
    activitySeq += 1;
    const start = addDays(todayMid, -between(0, 25) + j);
    RETAIL_ACTIVITIES.push({
      id: `rtl-act-${String(activitySeq).padStart(4, '0')}`,
      title,
      description: `${title} for ${emp.departmentId.replace('rdept-', '')} — retail business activity, not an IT project.`,
      type: (['meeting', 'task', 'follow_up'] as ActivityType[])[(i + j) % 3],
      entityId: emp.entityId,
      departmentId: emp.departmentId,
      assigneeId: emp.id,
      createdById: emp.managerId ?? retailCeo.id,
      startDate: iso(start),
      endDate: iso(addDays(start, j === 0 ? 0 : 1)),
      plannedHours: between(2, 6),
      status: j === 0 ? 'in_progress' : 'not_started',
      priority: 'medium',
      progress: j === 0 ? between(30, 70) : 0,
      location: 'Sydney CBD — Level 12',
      subtasks: [],
      sync: { outlook: true, google: false },
      createdAt: iso(addDays(start, -5)),
    });
  });
});

/* ------------------------------------------------------------------ */
/* Daily effort: IT resources log time against project tasks            */
/* ------------------------------------------------------------------ */
const AU_WEEKLY_OFF = [0, 6];
const entryNote = (phase: TaskPhase): string => pick(NOTES[phase] ?? NOTES.support);

/* Give each IT person a spread of project tasks so every project has hours. */
const entriesByDay = 51;
const activityByAssignee = new Map<string, Activity[]>();
itTeam.forEach((emp) => {
  const acts = RETAIL_ACTIVITIES.filter((a) => a.assigneeId === emp.id);
  activityByAssignee.set(emp.id, acts);
});

for (let dayOffset = entriesByDay; dayOffset >= 0; dayOffset--) {
  const day = addDays(todayMid, -dayOffset);
  if (AU_WEEKLY_OFF.includes(day.getDay())) continue;
  const dayISO = iso(day);
  itTeam.forEach((emp) => {
    if (rnd() < 0.08) return; // leave / no logging
    const myActs = activityByAssignee.get(emp.id) ?? [];
    const live = myActs.filter((a) => a.startDate <= dayISO && a.endDate >= dayISO);
    const pool = live.length ? live : myActs;
    if (!pool.length) return;
    const entryCount = between(2, 4);
    let remaining = 7.5;
    for (let i = 0; i < entryCount && remaining > 0.5; i++) {
      const act = pool[(dayOffset + i * 5 + entrySeq) % pool.length];
      const hours = Math.min(remaining, pick([1.5, 2, 2, 2.5, 3, 3.5, 4]));
      if (hours < 0.5) continue;
      entrySeq += 1;
      TIME_ENTRY_PUSH({
        id: `rtl-te-${String(entrySeq).padStart(5, '0')}`,
        employeeId: emp.id,
        activityId: act.id,
        date: dayISO,
        hours,
        note: entryNote(act.projectPhase ?? 'support'),
        billable: Boolean(act.capitalisable),
        approved: dayOffset > 7 || rnd() > 0.4,
      });
      remaining -= hours;
    }
  });
}

/* Business-side staff log their own non-project effort. */
businessStaff.forEach((emp) => {
  const acts = RETAIL_ACTIVITIES.filter((a) => a.assigneeId === emp.id);
  for (let dayOffset = 20; dayOffset >= 0; dayOffset--) {
    const day = addDays(todayMid, -dayOffset);
    if (AU_WEEKLY_OFF.includes(day.getDay()) || rnd() < 0.35) continue;
    const live = acts.filter((a) => a.startDate <= iso(day) && a.endDate >= iso(day));
    if (!live.length) continue;
    entrySeq += 1;
    const act = pick(live);
    TIME_ENTRY_PUSH({
      id: `rtl-te-${String(entrySeq).padStart(5, '0')}`,
      employeeId: emp.id,
      activityId: act.id,
      date: iso(day),
      hours: pick([2, 3, 4]),
      note: 'Business activity — expensed, outside the IT capitalisation programme.',
      billable: false,
      approved: true,
    });
  }
});

function TIME_ENTRY_PUSH(entry: TimeEntry) {
  RETAIL_TIME_ENTRIES.push(entry);
}

/* Roster of PMO oversight effort so the CIO and PMO appear in the report. */
const oversightActivity = RETAIL_ACTIVITIES.filter((a) => a.projectId && a.capitalisable).slice(0, 6);
[pmoManager, cio].forEach((emp) => {
  oversightActivity.forEach((act, i) => {
    for (let d = 1; d <= 4; d++) {
      entrySeq += 1;
      RETAIL_TIME_ENTRIES.push({
        id: `rtl-te-${String(entrySeq).padStart(5, '0')}`,
        employeeId: emp.id,
        activityId: act.id,
        date: iso(addDays(todayMid, -(i + d * 3))),
        hours: 1.5,
        note: 'PMO governance, financial tracking and board evidence review.',
        billable: true,
        approved: true,
      });
    }
  });
});

/* ------------------------------------------------------------------ */
/* Merge helper — additive only, never deletes existing data            */
/* ------------------------------------------------------------------ */
export interface RetailSample {
  entities: Entity[];
  departments: Department[];
  employees: Employee[];
  projects: Project[];
  activities: Activity[];
  timeEntries: TimeEntry[];
  capitalisation: CapitalisationPolicy;
}

export function retailSample(): RetailSample {
  return {
    entities: RETAIL_ENTITIES,
    departments: RETAIL_DEPARTMENTS,
    employees: RETAIL_EMPLOYEES,
    projects: RETAIL_PROJECTS,
    activities: RETAIL_ACTIVITIES,
    timeEntries: RETAIL_TIME_ENTRIES,
    capitalisation: RETAIL_CAPITALISATION_POLICY,
  };
}

const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
  const known = new Set(existing.map((row) => row.id));
  return [...existing, ...incoming.filter((row) => !known.has(row.id))];
};

/**
 * Adds the Harbourline retail programme to an existing workspace while
 * preserving every entity, department, person, project and timesheet row.
 */
export function withRetailSample(state: StoreState): StoreState {
  const sample = retailSample();
  return {
    ...state,
    entities: mergeById(state.entities, sample.entities),
    departments: mergeById(state.departments, sample.departments),
    employees: mergeById(state.employees, sample.employees),
    projects: mergeById(state.projects ?? [], sample.projects),
    activities: mergeById(state.activities, sample.activities),
    timeEntries: mergeById(state.timeEntries, sample.timeEntries),
    capitalisation: state.capitalisation ?? sample.capitalisation,
    capitalisationApprovals: state.capitalisationApprovals ?? [],
  };
}

export const RETAIL_DEMO_TODAY = iso(addDays(startOfWeek(todayMid, { weekStartsOn: 1 }), 0));
