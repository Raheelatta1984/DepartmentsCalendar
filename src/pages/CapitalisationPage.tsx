import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeDollarSign,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  Landmark,
  Lock,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { CapitalisationApproval } from '../types';
import {
  EXCLUSION_LABELS,
  PROJECT_CATEGORY_LABELS,
  PROJECT_STAGE_LABELS,
  capitalisationReport,
  currency,
  monthKey,
  monthScope,
} from '../lib/capitalisation';
import { capitalisationBoardPackCSV, capitalisationDetailCSV, downloadCSV } from '../lib/export';
import { humanHours } from '../lib/dates';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
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

const statusTone: Record<CapitalisationApproval['status'], 'neutral' | 'warn' | 'good' | 'danger'> = {
  draft: 'neutral',
  submitted: 'warn',
  approved: 'good',
  rejected: 'danger',
};

export function CapitalisationPage() {
  const { state, scope, submitCapitalisation, decideCapitalisation, loadRetailSample } = useStore();
  const toast = useToast();
  const retailEntity = useMemo(
    () => state.entities.find((entity) => entity.name.startsWith('Harbourline') && entity.type === 'company'),
    [state.entities],
  );
  const [entityId, setEntityId] = useState<string>(retailEntity?.id ?? scope.user.entityId ?? state.entities[0]?.id ?? 'all');
  const [month, setMonth] = useState(monthKey(new Date()));
  const departments = useMemo(
    () => state.departments.filter((dept) => entityId === 'all' || dept.entityId === entityId),
    [state.departments, entityId],
  );
  const itDepartment = departments.find((dept) => dept.code === 'RIT');
  const [departmentId, setDepartmentId] = useState<string>(itDepartment?.id ?? 'all');

  const scopeRange = monthScope(month);
  const report = useMemo(
    () => capitalisationReport(state, { entityId, departmentId, ...scopeRange }),
    [state, entityId, departmentId, scopeRange.start, scopeRange.end],
  );

  const selectedEntity = state.entities.find((entity) => entity.id === entityId);
  const entityCurrency = selectedEntity?.currency ?? report.currency;
  const approval = state.capitalisationApprovals.find(
    (row) => row.entityId === entityId && row.period === month,
  );
  const canDecide = scope.canManageMaster;
  const hasCapitalProjects = report.capitalProjectsInScope > 0;
  const shares = [
    { label: 'Capitalised', hours: report.capitalHours, tone: 'bg-emerald-500' },
    { label: 'Capital project — excluded', hours: report.excludedProjectHours, tone: 'bg-amber-400' },
    { label: 'Non-project / BAU', hours: report.nonProjectHours, tone: 'bg-slate-300' },
  ];
  const shareTotal = Math.max(1, report.totalHours);

  const submit = () => {
    const created = submitCapitalisation(entityId, departmentId, month);
    toast.push({
      tone: 'success',
      title: 'Board pack submitted',
      description: `${month}: ${created.capitalisedHours.toLocaleString('en-AU')}h · ${currency(created.capitalisedCostAUD)}`,
    });
  };

  const decide = (status: 'approved' | 'rejected') => {
    if (!approval) return;
    decideCapitalisation(approval.id, status, approval.note);
    toast.push({
      tone: status === 'approved' ? 'success' : 'error',
      title: status === 'approved' ? 'Board approval recorded' : 'Pack rejected',
      description: `${month} capitalisation pack ${status}.`,
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow="PMO governance · AASB 138"
        title="IT capitalisation pack for board approval"
        description="Effort captured on IT project tasks, split into capitalisable development work and expensed run activity. Only eligible capital-project tasks reach this pack; non-capital effort remains in the standard team utilisation report."
        actions={
          <>
            <Button
              size="sm"
              disabled={!report.lines.length}
              onClick={() => {
                downloadCSV(capitalisationBoardPackCSV(report), `capitalisation-board-pack-${entityId}-${month}.csv`);
                toast.push({ tone: 'success', title: 'Board pack exported', description: 'Summary, resources, projects and policy reconciliation.' });
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Board pack CSV
            </Button>
            <Button
              size="sm"
              disabled={!report.lines.length}
              onClick={() => {
                downloadCSV(capitalisationDetailCSV(report), `capitalisation-audit-trail-${entityId}-${month}.csv`);
                toast.push({ tone: 'success', title: 'Timesheet audit trail exported', description: 'Line-level evidence for the auditors.' });
              }}
            >
              <Download className="h-3.5 w-3.5" /> Line-level evidence
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Entity" hint="Each legal entity reports separately">
            <Select
              value={entityId}
              onChange={(e) => {
                setEntityId(e.target.value);
                setDepartmentId('all');
              }}
            >
              <option value="all">All entities (group)</option>
              {state.entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name} · {entity.currency ?? '—'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department" hint="Board pack is normally the IT department">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="all">All departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} ({dept.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Capitalisation month" hint="Calendar month, local time">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-400">
              <Landmark className="h-3 w-3" /> Reporting basis
            </div>
            <div className="mt-1 leading-relaxed">
              {state.capitalisation.standard}
              <br />
              Currency <strong>{entityCurrency}</strong> · {report.headcount} resources in scope · month-to-date cut-off {report.effectiveEnd}
            </div>
          </div>
        </div>
      </Card>

      {!hasCapitalProjects ? (
        <Card>
          <EmptyState
            icon={<Landmark className="h-5 w-5" />}
            title="No capital projects for this selection"
            description="Capitalisation only applies to capital-portfolio projects. Choose Harbourline Retail Australia, or add the retail programme to this workspace."
            action={
              state.projects.length === 0 ? (
                <Button size="sm" variant="primary" onClick={loadRetailSample}>
                  Load Harbourline retail sample
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Capitalised hours"
              value={humanHours(report.capitalisedHours)}
              hint={`${humanHours(report.capitalHours)} eligible at ${Math.round((report.capitalisedHours / Math.max(1, report.capitalHours)) * 100)}% blended project rate`}
              icon={<Clock3 className="h-4 w-4" />}
              tone="good"
            />
            <StatCard
              label={`Capitalised cost (${entityCurrency})`}
              value={currency(report.capitalisedCost)}
              hint="Fully-loaded internal cost, not external spend"
              icon={<BadgeDollarSign className="h-4 w-4" />}
              tone="brand"
            />
            <StatCard
              label="Capitalisation rate"
              value={`${report.capitalisationRate}%`}
              hint={`of ${humanHours(report.totalHours)} total IT effort this month`}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Team utilisation"
              value={`${report.utilisation}%`}
              hint={`${humanHours(report.totalHours)} logged of ${humanHours(report.capacityHours)} capacity`}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="Expensed effort"
              value={humanHours(report.excludedProjectHours + report.nonProjectHours)}
              hint={`${humanHours(report.excludedProjectHours)} on capital projects + ${humanHours(report.nonProjectHours)} BAU`}
              icon={<ShieldCheck className="h-4 w-4" />}
              tone="warn"
            />
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Card>
              <SectionHeader
                title="Where the month went"
                subtitle="Every logged hour stays in the utilisation report; only eligible capital-project phases are capitalised."
              />
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
                {shares.map((share) => (
                  <div
                    key={share.label}
                    className={share.tone}
                    style={{ width: `${(share.hours / shareTotal) * 100}%` }}
                    title={`${share.label}: ${humanHours(share.hours)}`}
                  />
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {shares.map((share) => (
                  <div key={share.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <span className={`h-2 w-2 rounded-full ${share.tone}`} /> {share.label}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-slate-800">{humanHours(share.hours)}</div>
                    <div className="text-[10px] text-slate-400">
                      {Math.round((share.hours / shareTotal) * 100)}% of logged effort
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                <strong>Reconciliation:</strong> {humanHours(report.capitalHours)} capitalised-eligible +{' '}
                {humanHours(report.excludedProjectHours)} excluded project effort + {humanHours(report.nonProjectHours)} non-project ={' '}
                {humanHours(report.totalHours)} logged. {report.approvedEntries} of {report.entriesCount} timesheet entries are approved.
              </div>
            </Card>

            <Card>
              <SectionHeader title="Board approval" subtitle={`${month} · ${report.entityName}`} />
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    {approval ? `Pack ${approval.period}` : 'No pack submitted yet'}
                  </span>
                  {approval ? <Badge tone={statusTone[approval.status]}>{approval.status}</Badge> : <Badge tone="neutral">draft</Badge>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div>
                    <div className="text-slate-400">Hours requested</div>
                    <div className="text-sm font-semibold tabular-nums text-slate-800">
                      {humanHours(approval?.capitalisedHours ?? report.capitalisedHours)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Value ({entityCurrency})</div>
                    <div className="text-sm font-semibold tabular-nums text-slate-800">
                      {currency(approval?.capitalisedCostAUD ?? report.capitalisedCost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Utilisation</div>
                    <div className="text-sm font-semibold tabular-nums text-slate-800">{approval?.utilisation ?? report.utilisation}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Projects</div>
                    <div className="text-sm font-semibold tabular-nums text-slate-800">{report.capitalProjectsInScope}</div>
                  </div>
                </div>
                {approval?.note ? <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{approval.note}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" disabled={!canDecide || approval?.status === 'approved'} onClick={submit}>
                    <Send className="h-3.5 w-3.5" />
                    {approval?.status === 'approved' ? 'Approved' : approval?.status === 'submitted' ? 'Refresh submission' : 'Submit to board'}
                  </Button>
                  {approval?.status === 'submitted' ? (
                    <>
                      <Button size="sm" disabled={!canDecide} onClick={() => decide('approved')}>
                        <Check className="h-3.5 w-3.5" /> Record approval
                      </Button>
                      <Button size="sm" variant="danger" disabled={!canDecide} onClick={() => decide('rejected')}>
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </>
                  ) : null}
                </div>
                {!canDecide ? (
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                    <Lock className="h-3 w-3" /> Your role can view the pack but not submit it to the board.
                  </p>
                ) : null}
              </div>
              <div className="mt-3 space-y-1.5">
                {state.capitalisationApprovals.slice(0, 4).map((row) => {
                  const entity = state.entities.find((item) => item.id === row.entityId);
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-[11px]">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-700">{row.period} · {entity?.code ?? row.entityId}</div>
                        <div className="truncate text-[10px] text-slate-400">
                          {humanHours(row.capitalisedHours)} · {currency(row.capitalisedCostAUD)}
                        </div>
                      </div>
                      <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card padded={false} className="mb-4">
            <div className="p-4">
              <SectionHeader
                title="Resource capitalisation — hours to approve"
                subtitle="Daily timesheet effort by person. Cost rate is fully loaded AUD per hour; only capital-project development phases are capitalised."
                action={<Badge tone="brand">{report.byResource.length} resources</Badge>}
              />
            </div>
            <TableShell minWidth={1040}>
              <thead>
                <tr>
                  {['Resource', 'Role / cost centre', 'Rate', 'Capital hours', 'Capitalised hours', 'Capitalised cost', 'Excluded hours', 'Total hours', 'Capital share', 'Utilisation'].map((head) => (
                    <Th key={head}>{head}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.byResource.map((row) => {
                  const dept = state.departments.find((item) => item.id === row.departmentId);
                  return (
                    <tr key={row.employeeId} className="hover:bg-slate-50/70">
                      <Td>
                        <div className="text-xs font-semibold text-slate-800">{row.name}</div>
                        <div className="text-[10px] text-slate-400">{row.projects} capital projects</div>
                      </Td>
                      <Td>
                        <div className="text-[11px] capitalize text-slate-600">{row.role.replace('_', ' ')}</div>
                        <div className="text-[10px] text-slate-400">{dept?.code} · {row.costCentre}</div>
                      </Td>
                      <Td className="tabular-nums text-slate-600">{currency(row.costRate)}</Td>
                      <Td className="tabular-nums font-medium text-slate-800">{humanHours(row.capitalHours)}</Td>
                      <Td className="tabular-nums font-semibold text-emerald-700">{humanHours(row.capitalisedHours)}</Td>
                      <Td className="tabular-nums text-slate-700">{currency(row.capitalisedCost)}</Td>
                      <Td className="tabular-nums text-amber-700">{humanHours(row.excludedHours)}</Td>
                      <Td className="tabular-nums text-slate-700">{humanHours(row.totalHours)}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <div className="w-14">
                            <Progress value={row.capitalShare} tone={row.capitalShare >= 40 ? 'good' : row.capitalShare >= 20 ? 'warn' : 'danger'} />
                          </div>
                          <span className="text-[10px] tabular-nums text-slate-500">{row.capitalShare}%</span>
                        </div>
                      </Td>
                      <Td className="tabular-nums text-slate-600">{row.utilisation}%</Td>
                    </tr>
                  );
                })}
                {report.byResource.length === 0 ? (
                  <tr>
                    <Td className="text-slate-400">No effort logged for this scope.</Td>
                  </tr>
                ) : null}
              </tbody>
            </TableShell>
          </Card>

          <div className="mb-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Card padded={false}>
              <div className="p-4">
                <SectionHeader
                  title="Capital projects in the pack"
                  subtitle="Capex budget, capitalisation rate and development effort. Pipeline projects are funded but not yet capitalising."
                  action={<Badge tone="info">{currency(report.approvedCapexAUD)} capex</Badge>}
                />
              </div>
              <TableShell minWidth={980}>
                <thead>
                  <tr>
                    {['Project', 'Category / stage', 'Capex', 'Rate', 'Capital hours', 'Capitalised hours', 'Value', 'Resources', 'Delivery'].map((head) => (
                      <Th key={head}>{head}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.byProject.map((row) => (
                    <tr key={row.projectId} className="hover:bg-slate-50/70">
                      <Td>
                        <div className="text-xs font-semibold text-slate-800">{row.name}</div>
                        <div className="text-[10px] text-slate-400">{row.code} · {row.wbsCode}</div>
                      </Td>
                      <Td>
                        <div className="text-[11px] text-slate-600">{PROJECT_CATEGORY_LABELS[row.category] ?? row.category}</div>
                        <div className="text-[10px] text-slate-400">{PROJECT_STAGE_LABELS[row.stage] ?? row.stage}</div>
                      </Td>
                      <Td className="tabular-nums text-slate-600">{currency(row.capexAUD)}</Td>
                      <Td className="tabular-nums text-slate-600">{Math.round(row.rate * 100)}%</Td>
                      <Td className="tabular-nums text-slate-800">{humanHours(row.hours)}</Td>
                      <Td className="tabular-nums font-semibold text-emerald-700">{humanHours(row.capitalisedHours)}</Td>
                      <Td className="tabular-nums text-slate-700">{currency(row.capitalisedCost)}</Td>
                      <Td className="tabular-nums text-slate-600">{row.resources}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <div className="w-14"><Progress value={row.deliveryProgress} tone={row.deliveryProgress >= 70 ? 'good' : row.deliveryProgress >= 40 ? 'warn' : 'danger'} /></div>
                          <span className="text-[10px] tabular-nums text-slate-500">{row.deliveryProgress}%</span>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </Card>

            <div className="space-y-4">
              <Card>
                <SectionHeader title="Excluded effort" subtitle="Auditable reasons why hours are not capitalised" />
                <div className="mt-3 space-y-1.5">
                  {Object.entries(
                    report.exclusions.reduce<Record<string, { hours: number; cost: number }>>((acc, line) => {
                      const key = EXCLUSION_LABELS[line.reason];
                      const current = acc[key] ?? { hours: 0, cost: 0 };
                      acc[key] = { hours: current.hours + line.hours, cost: current.cost + line.hours * line.costRate };
                      return acc;
                    }, {}),
                  )
                    .sort((a, b) => b[1].hours - a[1].hours)
                    .map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-[11px]">
                        <span className="text-slate-600">{label}</span>
                        <span className="tabular-nums font-medium text-slate-800">{humanHours(value.hours)}</span>
                      </div>
                    ))}
                  {report.exclusions.length === 0 ? <p className="text-[11px] text-slate-400">No excluded effort in this scope.</p> : null}
                </div>
              </Card>

              <Card>
                <SectionHeader title="Evidence in the pack" subtitle={`Approver: ${state.capitalisation.approverRole}`} />
                <ul className="mt-3 space-y-2">
                  {state.capitalisation.evidence.map((item) => (
                    <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-1">
                  {state.capitalisation.eligiblePhases.map((phase) => (
                    <Badge key={phase} tone="good">{phase}</Badge>
                  ))}
                  {state.capitalisation.excludedPhases.map((phase) => (
                    <Badge key={phase} tone="danger">{phase}</Badge>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {report.projectsAtRisk > 0 ? (
            <Card className="border-amber-200 bg-amber-50/40">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                <div>
                  <div className="text-xs font-semibold text-amber-800">
                    {report.projectsAtRisk} capital {report.projectsAtRisk === 1 ? 'project needs' : 'projects need'} PMO attention
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700">
                    Delivery progress is behind the funded window. The board pack still reports actual capitalisable hours; the PMO action is to
                    re-baseline scope or extend the capitalisation window before the next month-end.
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
