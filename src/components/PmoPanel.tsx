import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  GanttChartSquare,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { newId, useScopedState, useStore } from '../store';
import type {
  Department,
  PmoDecision,
  PmoMilestone,
  PmoRequest,
  PmoRisk,
  PmoStakeholder,
  PmoUpdateEntry,
  Project,
  ProjectCategory,
  ProjectStage,
  ProjectStatus,
  WorkItem,
} from '../types';
import { PROJECT_CATEGORY_LABELS, PROJECT_STAGE_LABELS, currency, hoursLabel, projectLoggedStats } from '../lib/capitalisation';
import { workItemDescendants } from '../lib/delivery';
import { toISO } from '../lib/dates';
import { employeeTitle } from '../lib/permissions';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, SectionHeader, Select, StatCard, Tabs, Textarea } from './ui';
import { useToast } from './toast';

/** The PMO tool lives under the IT department — any tenant's IT department. */
export function isItDepartment(department: Department | undefined): boolean {
  if (!department) return false;
  return /^\s*IT\s*$|^(RIT|ITS|HIT)$/i.test(department.code) || /information technology/i.test(department.name);
}

const requestStatusTone: Record<PmoRequest['status'], 'warn' | 'info' | 'good' | 'danger'> = {
  submitted: 'warn',
  under_review: 'info',
  approved: 'good',
  rejected: 'danger',
};
const riskSeverityTone: Record<PmoRisk['severity'], 'neutral' | 'warn' | 'danger' | 'danger'> = {
  low: 'neutral',
  medium: 'warn',
  high: 'danger',
  critical: 'danger',
};
const milestoneTone: Record<PmoMilestone['status'], 'neutral' | 'info' | 'warn' | 'good'> = {
  planned: 'neutral',
  on_track: 'info',
  at_risk: 'warn',
  done: 'good',
};
const projectStatusTone: Record<ProjectStatus, 'info' | 'warn' | 'good' | 'danger' | 'neutral'> = {
  active: 'info',
  pipeline: 'warn',
  completed: 'good',
  on_hold: 'danger',
  cancelled: 'neutral',
};
const label = (s: string) => s.replace(/_/g, ' ');

const STAGES: ProjectStage[] = ['idea', 'business_case', 'approved', 'design', 'build', 'test', 'deploy', 'hypercare', 'closed', 'on_hold'];
const PROJECT_STATUSES: ProjectStatus[] = ['pipeline', 'active', 'on_hold', 'completed', 'cancelled'];
const CATEGORIES = Object.keys(PROJECT_CATEGORY_LABELS) as ProjectCategory[];

/** Monday of the current week — the default update-log week. */
function weekStartISO(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now.getTime() - day * 86400000);
  return toISO(monday);
}

export function PmoPanel({ departmentId }: { departmentId: string }) {
  const state = useScopedState();
  const { scope } = useStore();
  const [tab, setTab] = useState<'requests' | 'projects' | 'portfolio' | 'resources'>('requests');
  const department = state.departments.find((d) => d.id === departmentId);
  const canReview = scope.canManageMaster || state.deliveryStreams.some((s) => s.leadId === scope.user.id && s.departmentId === departmentId);
  const requests = state.pmoRequests;
  const pending = requests.filter((r) => r.status === 'submitted' || r.status === 'under_review').length;

  if (!department) return null;
  return (
    <Card className="mb-4" padded={false}>
      <div className="border-b border-slate-100 p-4">
        <SectionHeader
          title="PMO tool · PM Planner"
          subtitle={`Project intake, portfolio and resource planning for ${department.name}. New requests are reviewed here, then onboarded to the top of the epic backlog.`}
          action={<div className="flex items-center gap-2 text-[11px] text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" /> PMO / TO review queue · tenant-scoped</div>}
        />
        <div className="mt-3">
          <Tabs
            tabs={[
              { id: 'requests', label: 'Requests', count: pending },
              { id: 'projects', label: 'Projects' },
              { id: 'portfolio', label: 'Portfolio' },
              { id: 'resources', label: 'Resources' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>
      <div className="p-4">
        {tab === 'requests' ? <RequestsTab departmentId={departmentId} canReview={canReview} /> : null}
        {tab === 'projects' ? <ProjectsTab departmentId={departmentId} canReview={canReview} /> : null}
        {tab === 'portfolio' ? <PortfolioTab departmentId={departmentId} /> : null}
        {tab === 'resources' ? <ResourcesTab departmentId={departmentId} /> : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Requests — intake form + PMO/TO approval queue                     */
/* ------------------------------------------------------------------ */

function RequestsTab({ departmentId, canReview }: { departmentId: string; canReview: boolean }) {
  const state = useScopedState();
  const { upsertPmoRequest, decidePmoRequest } = useStore();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Omit<PmoRequest, 'id' | 'status' | 'submittedAt'> | null>(null);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const requests = state.pmoRequests.filter((r) => !query || `${r.title} ${r.pillar} ${r.description}`.toLowerCase().includes(query.toLowerCase()));

  const newRequest = () => {
    setDraft({
      title: '',
      description: '',
      requestedById: state.settings.activeUserId,
      pillar: 'BIA',
      portfolio: 'operational',
      category: 'delivery',
      estimatedBudgetAUD: 0,
      valueRaised: '',
    });
    setFormOpen(true);
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Project request form"
        subtitle="Business requests land here first (BIA focus). PMO and TO confirm, then an approved request moves to Projects with a PM allocated."
        action={
          <div className="flex flex-wrap gap-2">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><Input className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search requests…" /></div>
            <Button size="sm" variant="primary" onClick={newRequest}><Plus className="h-3.5 w-3.5" /> New request</Button>
          </div>
        }
      />
      {!requests.length ? (
        <EmptyState
          title="No requests yet"
          description="Anyone can raise a project request. It sits in this queue until PMO / TO approve it — approval onboards the project and drops a new epic on top of the DevOps backlog."
          action={<Button size="sm" variant="primary" onClick={newRequest}><Plus className="h-3.5 w-3.5" /> New request</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              {['Request', 'Requested by', 'Pillar', 'Portfolio / category', 'Est. budget', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold first:pl-4">{h}</th>)}
            </tr></thead>
            <tbody>
              {requests.map((request) => {
                const requester = state.employees.find((e) => e.id === request.requestedById);
                const reviewer = state.employees.find((e) => e.id === request.reviewedById);
                const pending = request.status === 'submitted' || request.status === 'under_review';
                return (
                  <tr key={request.id} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                    <td className="max-w-[320px] px-3 py-3 pl-4">
                      <div className="font-semibold text-slate-800">{request.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{request.description}</div>
                      {request.valueRaised ? <div className="mt-1 text-[10px] text-emerald-700">Value raised: {request.valueRaised}</div> : null}
                      <div className="mt-1 text-[10px] text-slate-400">Submitted {new Date(request.submittedAt).toLocaleDateString('en-AU')}</div>
                    </td>
                    <td className="px-3 py-3">{requester ? <div className="flex items-center gap-1.5"><Avatar name={requester.name} color={requester.avatarColor} size={22} /><span className="text-[11px] text-slate-600">{requester.name}</span></div> : '—'}</td>
                    <td className="px-3 py-3"><Badge tone="purple">{request.pillar}</Badge></td>
                    <td className="px-3 py-3"><Badge tone={request.portfolio === 'capital' ? 'good' : 'neutral'}>{request.portfolio}</Badge><div className="mt-1 text-[10px] text-slate-400">{PROJECT_CATEGORY_LABELS[request.category]}</div></td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">{currency(request.estimatedBudgetAUD)}</td>
                    <td className="px-3 py-3">
                      <Badge tone={requestStatusTone[request.status]}>{label(request.status)}</Badge>
                      {reviewer ? <div className="mt-1 text-[10px] text-slate-400">by {reviewer.name}</div> : null}
                      {request.reviewNote ? <div className="mt-1 max-w-[180px] text-[10px] text-slate-500">{request.reviewNote}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      {pending && canReview ? (
                        <div className="flex flex-col gap-1">
                          <Button size="sm" variant="primary" onClick={() => { setDeciding(request.id); setNote(''); }}><Check className="h-3 w-3" /> Approve</Button>
                          <Button size="sm" onClick={() => { const error = decidePmoRequest(request.id, 'rejected', 'Rejected in review.'); if (error) toast.push({ tone: 'error', title: 'Could not reject', description: error }); else toast.push({ tone: 'success', title: 'Request rejected', description: request.title }); }}><X className="h-3 w-3" /> Reject</Button>
                        </div>
                      ) : request.projectId ? <div className="text-[10px] text-slate-400">Project {state.projects.find((p) => p.id === request.projectId)?.code ?? ''}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setDraft(null); }}
        title="New project request"
        subtitle="The request lands in the PMO / TO review queue. Once approved it becomes a project with an epic on top of the backlog."
        width="max-w-2xl"
        footer={
          <>
            <Button size="sm" onClick={() => { setFormOpen(false); setDraft(null); }}>Cancel</Button>
            <Button size="sm" variant="primary" disabled={!draft?.title.trim()} onClick={() => {
              if (!draft) return;
              upsertPmoRequest({ ...draft, title: draft.title.trim(), id: newId('pmo-req'), status: 'submitted', submittedAt: new Date().toISOString() });
              toast.push({ tone: 'success', title: 'Request submitted', description: 'It now sits in the PMO / TO review queue.' });
              setFormOpen(false); setDraft(null);
            }}><ClipboardList className="h-3.5 w-3.5" /> Submit request</Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Buyers App D365 confirmation" /></Field>
              <Field label="Requester"><Select value={draft.requestedById} onChange={(e) => setDraft({ ...draft, requestedById: e.target.value })}>{state.employees.filter((e) => e.status !== 'inactive').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
            </div>
            <Field label="Description"><Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What should this project deliver, and why now?" /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Pillar" hint="e.g. BIA / digital function"><Input value={draft.pillar} onChange={(e) => setDraft({ ...draft, pillar: e.target.value })} /></Field>
              <Field label="Portfolio"><Select value={draft.portfolio} onChange={(e) => setDraft({ ...draft, portfolio: e.target.value as PmoRequest['portfolio'] })}><option value="operational">Operational (opex)</option><option value="capital">Capital (capex)</option></Select></Field>
              <Field label="Category"><Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ProjectCategory })}>{CATEGORIES.map((c) => <option key={c} value={c}>{PROJECT_CATEGORY_LABELS[c]}</option>)}</Select></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Estimated budget (AUD)"><Input type="number" min={0} step={1000} value={draft.estimatedBudgetAUD} onChange={(e) => setDraft({ ...draft, estimatedBudgetAUD: Number(e.target.value) })} /></Field>
              <Field label="Value raised" hint="Expected benefit in plain words"><Input value={draft.valueRaised} onChange={(e) => setDraft({ ...draft, valueRaised: e.target.value })} placeholder="e.g. Faster month-end close" /></Field>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title="Approve request & onboard project"
        subtitle="Creates the project, allocates you as PM, and adds a new epic on top of the DevOps backlog."
        footer={
          <>
            <Button size="sm" onClick={() => setDeciding(null)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => {
              if (!deciding) return;
              const error = decidePmoRequest(deciding, 'approved', note);
              if (error) toast.push({ tone: 'error', title: 'Could not approve', description: error });
              else toast.push({ tone: 'success', title: 'Project onboarded', description: 'New epic sits on top of the backlog; the request moved to Projects.' });
              setDeciding(null);
            }}><Check className="h-3.5 w-3.5" /> Approve & onboard</Button>
          </>
        }
      >
        <Field label="Review note (optional)"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision context for the requester and leadership." /></Field>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Projects — portfolio list + per-project landing page                */
/* ------------------------------------------------------------------ */

function ProjectsTab({ departmentId, canReview }: { departmentId: string; canReview: boolean }) {
  const state = useScopedState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const projects = state.projects.filter((p) => p.departmentId === departmentId);
  // Newest onboarded first — approval prepends, so new projects sit on top.
  const selected = projects.find((p) => p.id === selectedId) ?? null;

  if (selected) return <ProjectDetail project={selected} canReview={canReview} onBack={() => setSelectedId(null)} />;

  return (
    <div className="space-y-3">
      <SectionHeader title="Projects" subtitle="Newly onboarded projects appear on top. Open a project for its landing page, update log, delivery, stakeholders and work estimates." />
      {!projects.length ? (
        <EmptyState title="No projects in this department yet" description="Approve a request in the Requests tab to onboard the first project." icon={<FolderKanban className="h-5 w-5" />} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const pm = state.employees.find((e) => e.id === project.managerId);
            const sponsor = state.employees.find((e) => e.id === project.sponsorId);
            const stats = projectLoggedStats(state, project);
            const openRisks = state.pmoRisks.filter((r) => r.projectId === project.id && r.status !== 'closed').length;
            return (
              <button key={project.id} onClick={() => setSelectedId(project.id)} className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-slate-400">{project.code}</div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{project.name}</div>
                  </div>
                  <Badge tone={projectStatusTone[project.status]}>{label(project.status)}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone="purple">{PROJECT_STAGE_LABELS[project.stage]}</Badge>
                  <Badge tone={project.portfolio === 'capital' ? 'good' : 'neutral'}>{project.portfolio}</Badge>
                  {openRisks ? <Badge tone="danger">{openRisks} open risk{openRisks === 1 ? '' : 's'}</Badge> : null}
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                  {pm ? <Avatar name={pm.name} color={pm.avatarColor} size={20} /> : null}
                  <span>PM {pm?.name ?? 'unassigned'}</span>
                  <span className="text-slate-300">·</span>
                  <span>Sponsor {sponsor?.name ?? '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Budget {currency(project.budgetAUD)}</span>
                  <span>Logged {hoursLabel(stats.hours)} / planned {hoursLabel(stats.planned)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ project, canReview, onBack }: { project: Project; canReview: boolean; onBack: () => void }) {
  const state = useScopedState();
  const { upsertProject } = useStore();
  const [tab, setTab] = useState<'overview' | 'updates' | 'delivery' | 'stakeholders' | 'work'>('overview');
  const pm = state.employees.find((e) => e.id === project.managerId);
  const sponsor = state.employees.find((e) => e.id === project.sponsorId);
  const request = state.pmoRequests.find((r) => r.projectId === project.id);
  const stats = projectLoggedStats(state, project);
  const updates = state.pmoUpdates.filter((u) => u.projectId === project.id).sort((a, b) => b.weekOf.localeCompare(a.weekOf));
  const risks = state.pmoRisks.filter((r) => r.projectId === project.id);
  const milestones = state.pmoMilestones.filter((m) => m.projectId === project.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const decisions = state.pmoDecisions.filter((d) => d.projectId === project.id);
  const stakeholders = state.pmoStakeholders.filter((s) => s.projectId === project.id);
  const items = state.workItems.filter((i) => i.projectId === project.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"><ChevronRight className="h-3.5 w-3.5 rotate-180" /> All projects</button>
        <Tabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'updates', label: 'Update log', count: updates.length },
            { id: 'delivery', label: 'Delivery', count: risks.filter((r) => r.status === 'open').length + milestones.length },
            { id: 'stakeholders', label: 'Stakeholders', count: stakeholders.length },
            { id: 'work', label: 'Work & estimates', count: items.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionHeader title={project.name} subtitle={`${project.code} · ${PROJECT_CATEGORY_LABELS[project.category]} · ${project.portfolio}`} />
            <p className="mt-3 text-xs leading-relaxed text-slate-600">{project.description || 'No description yet.'}</p>
            {request?.valueRaised ? <p className="mt-2 rounded-lg bg-emerald-50 p-2.5 text-[11px] text-emerald-800">Value raised: {request.valueRaised}</p> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Stage"><Select value={project.stage} onChange={(e) => upsertProject({ ...project, stage: e.target.value as ProjectStage })}>{STAGES.map((s) => <option key={s} value={s}>{PROJECT_STAGE_LABELS[s]}</option>)}</Select></Field>
              <Field label="Status"><Select value={project.status} onChange={(e) => upsertProject({ ...project, status: e.target.value as ProjectStatus })}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
              <Field label="Project manager (PM)"><Select value={project.managerId} onChange={(e) => upsertProject({ ...project, managerId: e.target.value })}>{state.employees.filter((emp) => emp.status !== 'inactive').map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</Select></Field>
              <Field label="Sponsor"><Select value={project.sponsorId} onChange={(e) => upsertProject({ ...project, sponsorId: e.target.value })}>{state.employees.filter((emp) => emp.status !== 'inactive').map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</Select></Field>
              <Field label="Start date"><Input type="date" value={project.startDate} onChange={(e) => upsertProject({ ...project, startDate: e.target.value })} /></Field>
              <Field label="End date"><Input type="date" value={project.endDate} onChange={(e) => upsertProject({ ...project, endDate: e.target.value })} /></Field>
            </div>
          </Card>
          <div className="space-y-3">
            <Card>
              <SectionHeader title="RACI / status snapshot" subtitle="Informative landing-page summary" />
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Responsible (PM)</dt><dd className="font-medium text-slate-800">{pm?.name ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Accountable (sponsor)</dt><dd className="font-medium text-slate-800">{sponsor?.name ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Stage</dt><dd className="font-medium text-slate-800">{PROJECT_STAGE_LABELS[project.stage]}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-800">{label(project.status)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Budget</dt><dd className="font-medium tabular-nums text-slate-800">{currency(project.budgetAUD)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Logged / planned</dt><dd className="font-medium tabular-nums text-slate-800">{hoursLabel(stats.hours)} / {hoursLabel(stats.planned)}</dd></div>
              </dl>
            </Card>
            <Card>
              <SectionHeader title="Open risks" subtitle={`${risks.filter((r) => r.status !== 'closed').length} active · ${risks.length} total`} />
              <div className="mt-3 space-y-1.5">
                {risks.filter((r) => r.status !== 'closed').slice(0, 4).map((risk) => <div key={risk.id} className="flex items-center gap-1.5 text-[11px] text-slate-600"><AlertTriangle className="h-3 w-3 flex-none text-amber-500" />{risk.title}</div>)}
                {!risks.some((r) => r.status !== 'closed') ? <p className="text-[11px] text-slate-400">No open risks.</p> : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'updates' ? <UpdateLogTab project={project} updates={updates} /> : null}
      {tab === 'delivery' ? <DeliveryTab project={project} risks={risks} milestones={milestones} decisions={decisions} canReview={canReview} /> : null}
      {tab === 'stakeholders' ? <StakeholdersTab project={project} stakeholders={stakeholders} /> : null}
      {tab === 'work' ? <WorkItemsTab project={project} items={items} canReview={canReview} /> : null}
    </div>
  );
}

function UpdateLogTab({ project, updates }: { project: Project; updates: PmoUpdateEntry[] }) {
  const state = useScopedState();
  const { upsertPmoUpdate } = useStore();
  const toast = useToast();
  const [weekOf, setWeekOf] = useState(weekStartISO());
  const [summary, setSummary] = useState('');
  const [stage, setStage] = useState<ProjectStage>(project.stage);
  const [status, setStatus] = useState<ProjectStatus>(project.status);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card>
        <SectionHeader title="Log a weekly update" subtitle="Keeps a log of every week's update on the project." />
        <div className="mt-3 space-y-3">
          <Field label="Week of"><Input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Stage"><Select value={stage} onChange={(e) => setStage(e.target.value as ProjectStage)}>{STAGES.map((s) => <option key={s} value={s}>{PROJECT_STAGE_LABELS[s]}</option>)}</Select></Field>
            <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
          </div>
          <Field label="Summary"><Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What moved this week? Blockers, decisions needed, next steps…" /></Field>
          <Button size="sm" variant="primary" disabled={!summary.trim()} onClick={() => {
            upsertPmoUpdate({ id: newId('pmo-upd'), projectId: project.id, weekOf, authorId: state.settings.activeUserId, summary: summary.trim(), stage, status, createdAt: new Date().toISOString() });
            toast.push({ tone: 'success', title: 'Update logged', description: `Week of ${weekOf}` });
            setSummary('');
          }}><Check className="h-3.5 w-3.5" /> Log update</Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <SectionHeader title="Update log" subtitle={`${updates.length} entr${updates.length === 1 ? 'y' : 'ies'} · newest first`} />
        {!updates.length ? <div className="mt-3"><EmptyState title="No updates yet" description="PMs update weekly (or as agreed); PMO chases stale projects." icon={<CalendarDays className="h-5 w-5" />} /></div> : (
          <div className="mt-3 space-y-2">
            {updates.map((update) => {
              const author = state.employees.find((e) => e.id === update.authorId);
              return (
                <div key={update.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge tone="brand">Week of {update.weekOf}</Badge>
                    <Badge tone="purple">{PROJECT_STAGE_LABELS[update.stage]}</Badge>
                    <Badge tone={projectStatusTone[update.status]}>{label(update.status)}</Badge>
                    <span className="ml-auto text-slate-400">{author?.name ?? '—'} · {new Date(update.createdAt).toLocaleDateString('en-AU')}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{update.summary}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function DeliveryTab({ project, risks, milestones, decisions, canReview }: { project: Project; risks: PmoRisk[]; milestones: PmoMilestone[]; decisions: PmoDecision[]; canReview: boolean }) {
  const state = useScopedState();
  const { upsertPmoRisk, upsertPmoMilestone, upsertPmoDecision, deletePmoRisk, deletePmoMilestone, deletePmoDecision } = useStore();
  const toast = useToast();
  const [riskDraft, setRiskDraft] = useState(false);
  const [risk, setRisk] = useState({ title: '', description: '', severity: 'medium' as PmoRisk['severity'], status: 'open' as PmoRisk['status'], ownerId: '' });
  const [milestoneDraft, setMilestoneDraft] = useState({ title: '', dueDate: project.endDate });
  const [decisionDraft, setDecisionDraft] = useState({ title: '', decision: '' });

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card>
        <SectionHeader title="Milestones" subtitle="Milestone status drives the project stage view" action={<Button size="sm" onClick={() => { if (!milestoneDraft.title.trim()) return; upsertPmoMilestone({ id: newId('pmo-ms'), projectId: project.id, title: milestoneDraft.title.trim(), dueDate: milestoneDraft.dueDate, status: 'planned' }); setMilestoneDraft({ title: '', dueDate: project.endDate }); toast.push({ tone: 'success', title: 'Milestone added' }); }}><Plus className="h-3.5 w-3.5" /> Add</Button>} />
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[1fr_110px] gap-2"><Input value={milestoneDraft.title} onChange={(e) => setMilestoneDraft({ ...milestoneDraft, title: e.target.value })} placeholder="Milestone title" /><Input type="date" value={milestoneDraft.dueDate} onChange={(e) => setMilestoneDraft({ ...milestoneDraft, dueDate: e.target.value })} /></div>
          {!milestones.length ? <p className="text-[11px] text-slate-400">No milestones yet.</p> : milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs">
              <Select value={m.status} onChange={(e) => upsertPmoMilestone({ ...m, status: e.target.value as PmoMilestone['status'] })} className="w-auto">
                <option value="planned">planned</option><option value="on_track">on track</option><option value="at_risk">at risk</option><option value="done">done</option>
              </Select>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{m.title}</span>
              <span className="tabular-nums text-slate-400">{m.dueDate}</span>
              {canReview ? <button aria-label={`Delete milestone ${m.title}`} onClick={() => deletePmoMilestone(m.id)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button> : null}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Risks & issues" subtitle={`${risks.filter((r) => r.status === 'open').length} open`} action={canReview ? <Button size="sm" onClick={() => setRiskDraft((v) => !v)}><Plus className="h-3.5 w-3.5" /> {riskDraft ? 'Close' : 'Add'}</Button> : undefined} />
        {riskDraft ? (
          <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-2.5">
            <Input value={risk.title} onChange={(e) => setRisk({ ...risk, title: e.target.value })} placeholder="Risk / issue title" />
            <Textarea rows={2} value={risk.description} onChange={(e) => setRisk({ ...risk, description: e.target.value })} placeholder="Description & impact" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={risk.severity} onChange={(e) => setRisk({ ...risk, severity: e.target.value as PmoRisk['severity'] })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></Select>
              <Select value={risk.ownerId} onChange={(e) => setRisk({ ...risk, ownerId: e.target.value })}><option value="">No owner</option>{state.employees.filter((e) => e.status !== 'inactive').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
            </div>
            <Button size="sm" variant="primary" disabled={!risk.title.trim()} onClick={() => { upsertPmoRisk({ id: newId('pmo-risk'), projectId: project.id, title: risk.title.trim(), description: risk.description, severity: risk.severity, status: risk.status, ownerId: risk.ownerId || undefined, createdAt: new Date().toISOString() }); setRisk({ title: '', description: '', severity: 'medium', status: 'open', ownerId: '' }); setRiskDraft(false); toast.push({ tone: 'success', title: 'Risk logged' }); }}><Check className="h-3.5 w-3.5" /> Save risk</Button>
          </div>
        ) : null}
        <div className="mt-3 space-y-2">
          {!risks.length ? <p className="text-[11px] text-slate-400">No risks raised.</p> : risks.map((r) => {
            const owner = state.employees.find((e) => e.id === r.ownerId);
            return (
              <div key={r.id} className="rounded-lg border border-slate-100 px-2.5 py-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Badge tone={riskSeverityTone[r.severity]}>{r.severity}</Badge>
                  <Select value={r.status} onChange={(e) => upsertPmoRisk({ ...r, status: e.target.value as PmoRisk['status'] })} className="w-auto"><option value="open">open</option><option value="mitigating">mitigating</option><option value="closed">closed</option></Select>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{r.title}</span>
                  {canReview ? <button aria-label={`Delete risk ${r.title}`} onClick={() => deletePmoRisk(r.id)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                </div>
                {r.description ? <p className="mt-1 text-[11px] text-slate-500">{r.description}</p> : null}
                {owner ? <p className="mt-0.5 text-[10px] text-slate-400">Owner {owner.name}</p> : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Supporting decisions" action={<Button size="sm" onClick={() => { if (!decisionDraft.title.trim() || !decisionDraft.decision.trim()) return; upsertPmoDecision({ id: newId('pmo-dec'), projectId: project.id, title: decisionDraft.title.trim(), decision: decisionDraft.decision.trim(), decidedById: state.settings.activeUserId, decidedAt: new Date().toISOString() }); setDecisionDraft({ title: '', decision: '' }); toast.push({ tone: 'success', title: 'Decision recorded' }); }}><Plus className="h-3.5 w-3.5" /> Record</Button>} />
        <div className="mt-3 space-y-2">
          <Input value={decisionDraft.title} onChange={(e) => setDecisionDraft({ ...decisionDraft, title: e.target.value })} placeholder="Decision title" />
          <Textarea rows={2} value={decisionDraft.decision} onChange={(e) => setDecisionDraft({ ...decisionDraft, decision: e.target.value })} placeholder="What was decided?" />
          {!decisions.length ? <p className="text-[11px] text-slate-400">No decisions recorded.</p> : decisions.map((d) => {
            const decider = state.employees.find((e) => e.id === d.decidedById);
            return (
              <div key={d.id} className="rounded-lg border border-slate-100 px-2.5 py-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{d.title}</span>
                  {canReview ? <button aria-label={`Delete decision ${d.title}`} onClick={() => deletePmoDecision(d.id)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{d.decision}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{decider?.name ?? '—'} · {new Date(d.decidedAt).toLocaleDateString('en-AU')}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function StakeholdersTab({ project, stakeholders }: { project: Project; stakeholders: PmoStakeholder[] }) {
  const state = useScopedState();
  const { upsertPmoStakeholder, deletePmoStakeholder } = useStore();
  const toast = useToast();
  const [source, setSource] = useState<'active_directory' | 'vendor'>('active_directory');
  const [employeeId, setEmployeeId] = useState('');
  const [vendor, setVendor] = useState({ name: '', email: '', role: '' });

  const add = () => {
    if (source === 'active_directory') {
      const employee = state.employees.find((e) => e.id === employeeId);
      if (!employee) return;
      upsertPmoStakeholder({ id: newId('pmo-stk'), projectId: project.id, name: employee.name, email: employee.email, role: employeeTitle(employee), source: 'active_directory' });
      setEmployeeId('');
    } else {
      if (!vendor.name.trim() || !vendor.email.trim()) return;
      upsertPmoStakeholder({ id: newId('pmo-stk'), projectId: project.id, name: vendor.name.trim(), email: vendor.email.trim(), role: vendor.role.trim() || 'Vendor', source: 'vendor' });
      setVendor({ name: '', email: '', role: '' });
    }
    toast.push({ tone: 'success', title: 'Stakeholder added' });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card>
        <SectionHeader title="Add stakeholder" subtitle="From Active Directory (people) or as a vendor / consultant" />
        <div className="mt-3 space-y-3">
          <Tabs tabs={[{ id: 'active_directory', label: 'Active Directory' }, { id: 'vendor', label: 'Vendor' }]} value={source} onChange={setSource} guideSkip />
          {source === 'active_directory' ? (
            <Field label="Person"><Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Select a person…</option>{state.employees.filter((e) => e.status !== 'inactive').map((e) => <option key={e.id} value={e.id}>{e.name} · {e.email}</option>)}</Select></Field>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><Input value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} /></Field><Field label="Email"><Input value={vendor.email} onChange={(e) => setVendor({ ...vendor, email: e.target.value })} /></Field></div>
              <Field label="Role"><Input value={vendor.role} onChange={(e) => setVendor({ ...vendor, role: e.target.value })} placeholder="e.g. Vendor PM" /></Field>
            </>
          )}
          <Button size="sm" variant="primary" onClick={add}><Plus className="h-3.5 w-3.5" /> Add to registry</Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <SectionHeader title="Stakeholder registry" subtitle={`${stakeholders.length} registered`} />
        {!stakeholders.length ? <div className="mt-3"><EmptyState title="No stakeholders yet" description="Add people via Active Directory or register vendors / consultants." icon={<Users className="h-5 w-5" />} /></div> : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">{['Name', 'Email', 'Role', 'Source', ''].map((h) => <th key={h} className="px-3 py-2 font-semibold first:pl-4">{h}</th>)}</tr></thead>
              <tbody>
                {stakeholders.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-3 py-2.5 pl-4 font-medium text-slate-700">{s.name}</td>
                    <td className="px-3 py-2.5 text-slate-500">{s.email}</td>
                    <td className="px-3 py-2.5 text-slate-500">{s.role}</td>
                    <td className="px-3 py-2.5"><Badge tone={s.source === 'active_directory' ? 'info' : 'warn'}>{s.source === 'active_directory' ? 'Active Directory' : s.source}</Badge></td>
                    <td className="px-3 py-2.5"><button aria-label={`Remove ${s.name}`} onClick={() => deletePmoStakeholder(s.id)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* PMO and resources update work / estimate times on projects and subtasks. */
function WorkItemsTab({ project, items, canReview }: { project: Project; items: WorkItem[]; canReview: boolean }) {
  const state = useScopedState();
  const { scope, updatePmoWorkItem } = useStore();
  const toast = useToast();
  const [estimates, setEstimates] = useState<Record<string, number>>({});
  const canEditWork = canReview || scope.user.departmentId === project.departmentId;
  const epics = items.filter((i) => i.kind === 'epic');
  const childrenOf = (id: string) => items.filter((i) => i.parentId === id);

  const saveEstimate = (item: WorkItem) => {
    const value = estimates[item.id];
    if (value === undefined || !Number.isFinite(value) || value < 0) return;
    const error = updatePmoWorkItem({ ...item, estimateHours: value });
    if (error) toast.push({ tone: 'error', title: 'Estimate not saved', description: error });
    else { toast.push({ tone: 'success', title: 'Estimate updated', description: `${item.title} · ${value}h` }); setEstimates((prev) => { const next = { ...prev }; delete next[item.id]; return next; }); }
  };

  const renderItem = (item: WorkItem, depth: number) => {
    const stats = (() => {
      const ids = workItemDescendants(state.workItems, item.id);
      const lines = state.timeEntries.filter((entry) => { const activity = state.activities.find((a) => a.id === entry.activityId); return activity?.workItemId && ids.has(activity.workItemId); });
      const planned = state.activities.filter((a) => a.workItemId && ids.has(a.workItemId)).reduce((n, a) => n + a.plannedHours, 0);
      return { logged: lines.reduce((n, e) => n + e.hours, 0), planned };
    })();
    const assignee = state.employees.find((e) => e.id === item.assigneeId);
    return (
      <React.Fragment key={item.id}>
        <tr className="border-b border-slate-100 hover:bg-slate-50/70">
          <td className="max-w-[340px] py-2.5 pl-4 pr-3"><div style={{ paddingLeft: depth * 16 }} className="flex items-center gap-1.5">
            <Badge tone={item.kind === 'epic' ? 'purple' : item.kind === 'feature' ? 'info' : 'neutral'}>{item.kind}</Badge>
            <span className="truncate text-xs font-medium text-slate-700">{item.title}</span>
          </div></td>
          <td className="px-3 py-2.5 text-[11px] text-slate-500">{assignee?.name ?? 'Unassigned'}</td>
          <td className="px-3 py-2.5"><Badge tone={item.status === 'blocked' ? 'danger' : item.status === 'completed' ? 'good' : 'info'}>{label(item.status)}</Badge></td>
          <td className="px-3 py-2.5">
            {canEditWork ? (
              <div className="flex items-center gap-1">
                <Input type="number" min={0} step={0.5} className="w-20" value={estimates[item.id] ?? item.estimateHours} onChange={(e) => setEstimates((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))} />
                <span className="text-[10px] text-slate-400">h</span>
                {estimates[item.id] !== undefined && estimates[item.id] !== item.estimateHours ? <Button size="sm" onClick={() => saveEstimate(item)}><Check className="h-3 w-3" /> Save</Button> : null}
              </div>
            ) : <span className="tabular-nums text-slate-600">{hoursLabel(item.estimateHours)}</span>}
          </td>
          <td className="px-3 py-2.5 tabular-nums text-[11px] text-slate-500">{hoursLabel(stats.planned)}</td>
          <td className="px-3 py-2.5 tabular-nums text-[11px] font-semibold text-slate-700">{hoursLabel(stats.logged)}</td>
        </tr>
        {childrenOf(item.id).map((child) => renderItem(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <Card padded={false}>
      <div className="p-4"><SectionHeader title={`Work & estimates · ${project.code}`} subtitle="PMO and project resources update work status and estimate hours on the project's epics, features and tickets. Planned and logged hours come from the calendar and timesheets." /></div>
      {!items.length ? <div className="p-4 pt-0"><EmptyState title="No backlog items linked to this project" description="Work items link to the project in the DevOps delivery backlog below." icon={<GanttChartSquare className="h-5 w-5" />} /></div> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
          <thead><tr className="border-y border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">{['Work item', 'Assignee', 'Status', 'Estimate', 'Planned', 'Logged'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold first:pl-4">{h}</th>)}</tr></thead>
          <tbody>{epics.map((epic) => renderItem(epic, 0))}{items.filter((i) => !i.parentId && i.kind !== 'epic').map((i) => renderItem(i, 0))}</tbody>
        </table></div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio — leadership view: counts, filters, stage spread, gantt  */
/* ------------------------------------------------------------------ */

function PortfolioTab({ departmentId }: { departmentId: string }) {
  const state = useScopedState();
  const projects = state.projects.filter((p) => p.departmentId === departmentId);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [pm, setPm] = useState('all');

  const filtered = projects
    .filter((p) => (stage === 'all' || p.stage === stage) && (status === 'all' || p.status === status) && (category === 'all' || p.category === category) && (pm === 'all' || p.managerId === pm))
    .filter((p) => !query || `${p.name} ${p.code} ${p.description}`.toLowerCase().includes(query.toLowerCase()));

  const stageCounts = useMemo(() => {
    const map = new Map<ProjectStage, number>();
    projects.forEach((p) => map.set(p.stage, (map.get(p.stage) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [projects]);
  const pmCounts = useMemo(() => {
    const map = new Map<string, number>();
    projects.forEach((p) => map.set(p.managerId, (map.get(p.managerId) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [projects]);
  const openRisks = state.pmoRisks.filter((r) => r.status === 'open' && projects.some((p) => p.id === r.projectId)).length;
  const pendingRequests = state.pmoRequests.filter((r) => (r.status === 'submitted' || r.status === 'under_review')).length;

  // Simple month-bucketed gantt across the filtered portfolio.
  const { start, months } = useMemo(() => {
    const valid = filtered.map((p) => p.startDate).filter(Boolean).sort();
    const startDate = valid[0] ? valid[0].slice(0, 7) : toISO(new Date()).slice(0, 7);
    const list: string[] = [];
    const [y, m] = startDate.split('-').map(Number);
    for (let i = 0; i < 12; i++) {
      const d = new Date(y, m - 1 + i, 1);
      list.push(toISO(d).slice(0, 7));
    }
    return { start: startDate, months: list };
  }, [filtered]);
  const monthIndex = (iso: string) => {
    const [y, m] = iso.slice(0, 7).split('-').map(Number);
    const [sy, sm] = start.split('-').map(Number);
    return (y - sy) * 12 + (m - sm);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects in portfolio" value={projects.length} hint={`${filtered.length} after filters`} icon={<FolderKanban className="h-4 w-4" />} />
        <StatCard label="Active" value={projects.filter((p) => p.status === 'active').length} hint={`${projects.filter((p) => p.status === 'pipeline').length} in pipeline`} icon={<GanttChartSquare className="h-4 w-4" />} tone="brand" />
        <StatCard label="Open risks" value={openRisks} hint="Across the portfolio" icon={<AlertTriangle className="h-4 w-4" />} tone={openRisks ? 'danger' : 'good'} />
        <StatCard label="Pending requests" value={pendingRequests} hint="Waiting on PMO / TO review" icon={<ClipboardList className="h-4 w-4" />} tone="warn" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <SectionHeader title="Stage distribution" subtitle="Where the portfolio sits today" />
          <div className="mt-3 space-y-2">
            {stageCounts.map(([s, count]) => (
              <div key={s} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-slate-500">{PROJECT_STAGE_LABELS[s]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${projects.length ? (count / projects.length) * 100 : 0}%` }} /></div>
                <span className="w-6 text-right tabular-nums text-slate-600">{count}</span>
              </div>
            ))}
            {!stageCounts.length ? <p className="text-[11px] text-slate-400">No projects yet.</p> : null}
          </div>
        </Card>
        <Card>
          <SectionHeader title="By project manager" subtitle="PM allocation across the portfolio" />
          <div className="mt-3 space-y-2">
            {pmCounts.map(([id, count]) => {
              const person = state.employees.find((e) => e.id === id);
              return (
                <div key={id} className="flex items-center gap-2 text-xs">
                  {person ? <Avatar name={person.name} color={person.avatarColor} size={20} /> : null}
                  <span className="min-w-0 flex-1 truncate text-slate-600">{person?.name ?? 'Unassigned'}</span>
                  <span className="tabular-nums font-semibold text-slate-800">{count}</span>
                </div>
              );
            })}
            {!pmCounts.length ? <p className="text-[11px] text-slate-400">No projects yet.</p> : null}
          </div>
        </Card>
        <Card>
          <SectionHeader title="Filters" subtitle="Leadership slice of the portfolio" />
          <div className="mt-3 grid gap-2">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><Input className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects…" /></div>
            <Select value={stage} onChange={(e) => setStage(e.target.value)}><option value="all">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{PROJECT_STAGE_LABELS[s]}</option>)}</Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{PROJECT_CATEGORY_LABELS[c]}</option>)}</Select>
            <Select value={pm} onChange={(e) => setPm(e.target.value)}><option value="all">All PMs</option>{pmCounts.map(([id]) => { const person = state.employees.find((e) => e.id === id); return <option key={id} value={id}>{person?.name ?? 'Unassigned'}</option>; })}</Select>
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader title="Portfolio Gantt" subtitle={`12 months from ${start} · ${filtered.length} project${filtered.length === 1 ? '' : 's'}`} />
        {!filtered.length ? <div className="mt-3"><EmptyState title="Nothing matches these filters" icon={<GanttChartSquare className="h-5 w-5" />} /></div> : (
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid text-[10px] text-slate-400" style={{ gridTemplateColumns: `minmax(180px,1fr) repeat(${months.length}, minmax(40px,1fr))` }}>
                <div />
                {months.map((m) => <div key={m} className="border-l border-slate-100 px-1 py-1">{m}</div>)}
              </div>
              <div className="mt-1 space-y-1.5">
                {filtered.map((p) => {
                  const startIdx = Math.max(0, monthIndex(p.startDate));
                  const endIdx = Math.min(months.length - 1, Math.max(startIdx, monthIndex(p.endDate || p.startDate)));
                  return (
                    <div key={p.id} className="grid items-center" style={{ gridTemplateColumns: `minmax(180px,1fr) repeat(${months.length}, minmax(40px,1fr))` }}>
                      <div className="truncate pr-2 text-[11px] font-medium text-slate-700">{p.code} · {p.name}</div>
                      <div className="relative col-span-full" style={{ gridColumn: `2 / ${months.length + 2}` }}>
                        <div className="h-4 rounded-full bg-slate-100" />
                        <div className={`absolute top-0 h-4 rounded-full ${p.status === 'completed' ? 'bg-emerald-400' : p.status === 'on_hold' ? 'bg-rose-300' : 'bg-brand-500/80'}`} style={{ left: `${(startIdx / months.length) * 100}%`, width: `${Math.max(2, ((endIdx - startIdx + 1) / months.length) * 100)}%` }} title={`${p.startDate} → ${p.endDate}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resources — allocations & capacity                                  */
/* ------------------------------------------------------------------ */

function ResourcesTab({ departmentId }: { departmentId: string }) {
  const state = useScopedState();
  const department = state.departments.find((d) => d.id === departmentId);
  const people = state.employees.filter((e) => e.departmentId === departmentId && e.status !== 'inactive');
  const projectIds = new Set(state.projects.filter((p) => p.departmentId === departmentId).map((p) => p.id));

  const rows = useMemo(() => people.map((person) => {
    const assignedItems = state.workItems.filter((i) => i.assigneeId === person.id && i.departmentId === departmentId);
    const estimate = assignedItems.reduce((n, i) => n + i.estimateHours, 0);
    const projectNames = [...new Set(assignedItems.map((i) => i.projectId).filter((id): id is string => !!id && projectIds.has(id)).map((id) => state.projects.find((p) => p.id === id)?.code).filter(Boolean))];
    const managed = state.projects.filter((p) => p.departmentId === departmentId && p.managerId === person.id).map((p) => p.code);
    const planned = state.activities.filter((a) => a.assigneeId === person.id && a.departmentId === departmentId).reduce((n, a) => n + a.plannedHours, 0);
    const logged = state.timeEntries.filter((entry) => entry.employeeId === person.id).reduce((n, e) => n + e.hours, 0);
    const capacity = person.weeklyHours * 4; // rough monthly capacity
    return { person, estimate, projectNames, managed, planned, logged, capacity, utilisation: capacity ? Math.min(999, Math.round((logged / capacity) * 100)) : 0 };
  }), [people, state.workItems, state.projects, state.activities, state.timeEntries, departmentId, projectIds]);

  return (
    <div className="space-y-3">
      <SectionHeader title="Resource allocations & capacity" subtitle={`${department?.name ?? 'IT'} · estimates come from project work items; planned/logged from calendar & timesheets · capacity ≈ 4 weeks × weekly hours`} />
      {!rows.length ? <EmptyState title="No resources in this department" icon={<Users className="h-5 w-5" />} /> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              {['Resource', 'Role', 'Projects (assigned)', 'PM of', 'Est. hours', 'Planned', 'Logged', 'Monthly capacity', 'Utilisation'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold first:pl-4">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.person.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="px-3 py-2.5 pl-4"><div className="flex items-center gap-2"><Avatar name={row.person.name} color={row.person.avatarColor} size={24} /><span className="font-medium text-slate-700">{row.person.name}</span></div></td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500">{employeeTitle(row.person)}</td>
                  <td className="max-w-[200px] px-3 py-2.5"><div className="flex flex-wrap gap-1">{row.projectNames.length ? row.projectNames.map((code) => <Badge key={code} tone="info">{code}</Badge>) : <span className="text-[11px] text-slate-400">—</span>}</div></td>
                  <td className="max-w-[160px] px-3 py-2.5"><div className="flex flex-wrap gap-1">{row.managed.length ? row.managed.map((code) => <Badge key={code} tone="purple">{code}</Badge>) : <span className="text-[11px] text-slate-400">—</span>}</div></td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600">{hoursLabel(row.estimate)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600">{hoursLabel(row.planned)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-800">{hoursLabel(row.logged)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{hoursLabel(row.capacity)}</td>
                  <td className="px-3 py-2.5"><Badge tone={row.utilisation > 100 ? 'danger' : row.utilisation > 80 ? 'warn' : 'good'}>{row.utilisation}%</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500"><Wallet className="h-3.5 w-3.5 text-slate-400" /> Vendors and consultants are registered per project in Stakeholders, then planned in Resource planning when their engagement starts.</p>
    </div>
  );
}
