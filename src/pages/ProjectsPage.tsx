import React, { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Download,
  FolderKanban,
  Landmark,
  Layers,
  Search,
  ShieldCheck,
  Timer,
  Wallet,
} from 'lucide-react';
import { useScopedState, useStore } from '../store';
import type { Project, ProjectPortfolio } from '../types';
import {
  PROJECT_CATEGORY_LABELS,
  PROJECT_STAGE_LABELS,
  currency,
  hoursLabel,
  projectLoggedStats,
} from '../lib/capitalisation';
import { downloadCSV } from '../lib/export';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  SectionHeader,
  Select,
  StatCard,
  TableShell,
  Td,
  Th,
} from '../components/ui';
import { useToast } from '../components/toast';

const portfolioTone: Record<ProjectPortfolio, 'good' | 'neutral'> = { capital: 'good', operational: 'neutral' };

const statusTone: Record<string, 'good' | 'warn' | 'neutral' | 'danger' | 'info'> = {
  active: 'info',
  pipeline: 'warn',
  completed: 'good',
  on_hold: 'danger',
  cancelled: 'neutral',
};

export function ProjectsPage() {
  const { loadRetailSample  } = useStore();
  /* Operational rows come from the active tenant, cut down to the departments
     the calendar is implemented for (master setting: one / several / all). */
  const state = useScopedState();
  const toast = useToast();
  const [portfolio, setPortfolio] = useState<'all' | ProjectPortfolio>('all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [entityId, setEntityId] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Project | null>(null);

  const projectStats = useMemo(
    () => new Map(state.projects.map((project) => [project.id, projectLoggedStats(state, project)])),
    [state.projects, state.timeEntries, state.activities],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.projects
      .filter((project) => (portfolio === 'all' ? true : project.portfolio === portfolio))
      .filter((project) => (category === 'all' ? true : project.category === category))
      .filter((project) => (status === 'all' ? true : project.status === status))
      .filter((project) => (entityId === 'all' ? true : project.entityId === entityId))
      .filter((project) => (q ? `${project.name} ${project.code} ${project.description}`.toLowerCase().includes(q) : true))
      .sort((a, b) => (a.portfolio === b.portfolio ? b.capexAUD - a.capexAUD : a.portfolio === 'capital' ? -1 : 1));
  }, [state.projects, portfolio, category, status, entityId, query]);

  const totals = useMemo(() => {
    const capital = state.projects.filter((project) => project.portfolio === 'capital');
    const pipeline = capital.filter((project) => project.status === 'pipeline');
    const logged = Array.from(projectStats.values()).reduce((sum, row) => sum + row.hours, 0);
    return {
      total: state.projects.length,
      capital: capital.length,
      operational: state.projects.length - capital.length,
      pipeline: pipeline.length,
      pipelineCapex: pipeline.reduce((sum, project) => sum + project.capexAUD, 0),
      capex: capital.reduce((sum, project) => sum + project.capexAUD, 0),
      logged,
    };
  }, [state.projects, projectStats]);

  const exportRegister = () => {
    downloadCSV(
      [
        ['Code', 'Project', 'Entity', 'Portfolio', 'Category', 'Stage', 'Status', 'Priority', 'Start', 'End', 'Budget AUD', 'Capex AUD', 'Opex AUD', 'Capitalisation rate', 'WBS', 'PM', 'Sponsor', 'Logged hours', 'Capitalisable hours', 'Planned hours', 'Resources'],
        ...filtered.map((project) => {
          const stats = projectStats.get(project.id);
          return [
            project.code,
            project.name,
            state.entities.find((entity) => entity.id === project.entityId)?.name ?? project.entityId,
            project.portfolio,
            PROJECT_CATEGORY_LABELS[project.category] ?? project.category,
            PROJECT_STAGE_LABELS[project.stage] ?? project.stage,
            project.status,
            project.priority,
            project.startDate,
            project.endDate,
            project.budgetAUD,
            project.capexAUD,
            project.opexAUD,
            project.capitalisationRate,
            project.wbsCode,
            state.employees.find((employee) => employee.id === project.managerId)?.name ?? '',
            state.employees.find((employee) => employee.id === project.sponsorId)?.name ?? '',
            stats?.hours ?? 0,
            stats?.capitalHours ?? 0,
            stats?.planned ?? 0,
            stats?.resources ?? 0,
          ];
        }),
      ],
      'it-project-register.csv',
    );
    toast.push({ tone: 'success', title: 'Project register exported', description: `${filtered.length} projects including capex and operational run.` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="IT PMO · project portfolio"
        title="Projects, capex pipeline and delivery effort"
        description="Every IT initiative across delivery, operations, security, data, infrastructure and digital. Capital projects drive the board capitalisation pack; operational projects stay in the team utilisation report."
        actions={
          <Button size="sm" onClick={exportRegister}>
            <Download className="h-3.5 w-3.5" /> Export register
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="IT projects" value={totals.total} hint={`${totals.capital} capital · ${totals.operational} operational`} icon={<FolderKanban className="h-4 w-4" />} />
        <StatCard label="Capital projects" value={totals.capital} hint="AASB 138 eligible delivery work" icon={<Landmark className="h-4 w-4" />} tone="good" />
        <StatCard label="Capex approved" value={currency(totals.capex)} hint="Board-funded capital value" icon={<Wallet className="h-4 w-4" />} tone="purple" />
        <StatCard label="Pipeline awaiting approval" value={totals.pipeline} hint={`${currency(totals.pipelineCapex)} capex in business case`} icon={<BadgeCheck className="h-4 w-4" />} tone="warn" />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Project, code, keyword…" className="pl-8" />
            </div>
          </Field>
          <Field label="Portfolio">
            <Select value={portfolio} onChange={(e) => setPortfolio(e.target.value as 'all' | ProjectPortfolio)}>
              <option value="all">All portfolios</option>
              <option value="capital">Capital (capitalised)</option>
              <option value="operational">Operational (expensed)</option>
            </Select>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {Object.entries(PROJECT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {['pipeline', 'active', 'on_hold', 'completed', 'cancelled'].map((value) => (
                <option key={value} value={value}>{value.replace('_', ' ')}</option>
              ))}
            </Select>
          </Field>
          <Field label="Entity">
            <Select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="all">All entities</option>
              {state.entities.map((entity) => (
                <option key={entity.id} value={entity.id}>{entity.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-4">
          <SectionHeader
            title={`${filtered.length} projects`}
            subtitle={`${hoursLabel(totals.logged)} logged against project tasks across the portfolio`}
            action={
              <div className="flex flex-wrap gap-1">
                <Badge tone="good"><ShieldCheck className="h-3 w-3" /> {totals.capital} capital</Badge>
                <Badge tone="neutral"><Layers className="h-3 w-3" /> {totals.operational} operational</Badge>
              </div>
            }
          />
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 pb-4">
            <EmptyState
              title="No projects match the filters"
              description="Adjust the filters, or add the Harbourline Retail Australia IT programme to the workspace."
              action={state.projects.length === 0 ? <Button size="sm" variant="primary" onClick={loadRetailSample}>Load retail sample</Button> : undefined}
            />
          </div>
        ) : (
          <TableShell minWidth={1180}>
            <thead>
              <tr>
                {['Project', 'Portfolio', 'Category', 'Stage', 'Status', 'Owner', 'Capex', 'Capex rate', 'Logged effort', 'Delivery', 'Dates'].map((head) => (
                  <Th key={head}>{head}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const stats = projectStats.get(project.id);
                const manager = state.employees.find((employee) => employee.id === project.managerId);
                const entity = state.entities.find((item) => item.id === project.entityId);
                return (
                  <tr key={project.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setSelected(project)}>
                    <Td>
                      <div className="text-xs font-semibold text-slate-800">{project.name}</div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Building2 className="h-2.5 w-2.5" /> {entity?.code ?? '—'} · {project.code} · {project.wbsCode}
                      </div>
                    </Td>
                    <Td><Badge tone={portfolioTone[project.portfolio]}>{project.portfolio}</Badge></Td>
                    <Td className="text-[11px] text-slate-600">{PROJECT_CATEGORY_LABELS[project.category] ?? project.category}</Td>
                    <Td className="text-[11px] text-slate-600">{PROJECT_STAGE_LABELS[project.stage] ?? project.stage}</Td>
                    <Td><Badge tone={statusTone[project.status] ?? 'neutral'}>{project.status.replace('_', ' ')}</Badge></Td>
                    <Td className="text-[11px] text-slate-600">{manager?.name ?? '—'}</Td>
                    <Td className="tabular-nums text-slate-700">{project.capexAUD ? currency(project.capexAUD) : '—'}</Td>
                    <Td className="tabular-nums text-slate-600">{project.portfolio === 'capital' ? `${Math.round(project.capitalisationRate * 100)}%` : '—'}</Td>
                    <Td>
                      <div className="text-[11px] tabular-nums text-slate-700">{hoursLabel(stats?.hours ?? 0)}</div>
                      <div className="text-[10px] text-emerald-600">{hoursLabel(stats?.capitalHours ?? 0)} capitalisable</div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <div className="w-14"><Progress value={stats?.progress ?? 0} tone={(stats?.progress ?? 0) >= 70 ? 'good' : (stats?.progress ?? 0) >= 35 ? 'warn' : 'danger'} /></div>
                        <span className="text-[10px] tabular-nums text-slate-500">{stats?.progress ?? 0}%</span>
                      </div>
                    </Td>
                    <Td className="text-[10px] text-slate-500">{project.startDate} → {project.endDate}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Project'}
        subtitle={selected ? `${selected.code} · ${PROJECT_STAGE_LABELS[selected.stage] ?? selected.stage} · ${selected.wbsCode}` : undefined}
        width="max-w-4xl"
      >
        {selected ? (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-600">{selected.description}</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: 'Portfolio', value: selected.portfolio },
                { label: 'Category', value: PROJECT_CATEGORY_LABELS[selected.category] ?? selected.category },
                { label: 'Budget', value: currency(selected.budgetAUD) },
                { label: 'Capex', value: currency(selected.capexAUD) },
                { label: 'Capitalisation rate', value: selected.portfolio === 'capital' ? `${Math.round(selected.capitalisationRate * 100)}%` : 'Not applicable' },
                { label: 'Asset class', value: selected.assetClass },
                { label: 'Useful life', value: selected.usefulLifeYears ? `${selected.usefulLifeYears} years` : '—' },
                { label: 'Capitalisation window', value: `${selected.capitalisationStart} → ${selected.capitalisationEnd}` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">{item.label}</div>
                  <div className="mt-0.5 text-[11px] font-medium capitalize text-slate-700">{item.value}</div>
                </div>
              ))}
            </div>
            <div>
              <SectionHeader
                title="Project tasks"
                subtitle="Resources log daily timesheet effort against these tasks. Only green tasks feed capitalisation."
                action={<Badge tone="good">{selected.tasks.filter((task) => task.capitalisable).length} capitalisable</Badge>}
              />
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/80">
                      {['Task', 'Phase', 'Capitalised', 'Planned', 'Logged', 'Status'].map((head) => (
                        <th key={head} className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.tasks.map((task) => {
                      const activity = state.activities.find((item) => item.id === task.activityId);
                      const logged = state.timeEntries
                        .filter((entry) => entry.activityId === task.activityId)
                        .reduce((sum, entry) => sum + entry.hours, 0);
                      const assignee = state.employees.find((employee) => employee.id === activity?.assigneeId);
                      return (
                        <tr key={task.id} className="border-t border-slate-100">
                          <td className="px-2.5 py-2">
                            <div className="font-medium text-slate-700">{task.title}</div>
                            <div className="text-[10px] text-slate-400">{assignee?.name ?? 'Unassigned'} · {task.startDate} → {task.endDate}</div>
                          </td>
                          <td className="px-2.5 py-2 capitalize text-slate-600">{task.phase}</td>
                          <td className="px-2.5 py-2">
                            {task.capitalisable ? <Badge tone="good">capital</Badge> : <Badge tone="neutral">expensed</Badge>}
                          </td>
                          <td className="px-2.5 py-2 tabular-nums text-slate-600">{task.plannedHours}h</td>
                          <td className="px-2.5 py-2 tabular-nums text-slate-700">{hoursLabel(logged)}</td>
                          <td className="px-2.5 py-2">
                            <div className="flex items-center gap-1.5">
                              <Timer className="h-3 w-3 text-slate-300" />
                              <span className="capitalize text-slate-600">{activity?.status.replace('_', ' ') ?? 'not started'}</span>
                              <span className="text-[10px] text-slate-400">{activity?.progress ?? 0}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
