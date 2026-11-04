import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, FileSpreadsheet, MonitorDown, Presentation, Users } from 'lucide-react';
import { useScopedState, useStore } from '../store';
import type { PeriodKey } from '../types';
import { buildDepartmentReports, type DeptReportModel } from '../lib/dept-report';
import { exportReportCSV, exportReportPPTX } from '../lib/dept-report-export';
import { hoursLabel } from '../lib/capitalisation';
import { Badge, Button, Card, EmptyState, Field, PageHeader, SectionHeader, Select } from '../components/ui';
import { useToast } from '../components/toast';

const RAG_STYLE: Record<DeptReportModel['rag'], { dot: string; text: string; bg: string }> = {
  green: { dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' },
  red: { dot: 'bg-rose-500', text: 'text-rose-600', bg: 'bg-rose-50' },
};

const FEELING_FACE: Record<number, string> = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

export function DeptReportPage() {
  const state = useScopedState();
  const { tenant, scope } = useStore();
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodKey>('week');
  /* The scoped state is already cut to the tenant + calendar scope; the
     department chips additionally respect the viewer's visibility. */
  const departments = useMemo(
    () => state.departments.filter((d) => scope.visibleDepartmentIds.includes(d.id)),
    [state, scope.visibleDepartmentIds],
  );
  const [selected, setSelected] = useState<string[] | null>(null); // null = all
  const chosenIds = selected ?? departments.map((d) => d.id);
  const chosen = departments.filter((d) => chosenIds.includes(d.id));
  const reports = useMemo(() => buildDepartmentReports(state, chosen, period, new Date()), [state, chosen, period]);

  const toggle = (id: string) => {
    const base = selected ?? departments.map((d) => d.id);
    setSelected(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  const exportPptx = async () => {
    if (!reports.length) return;
    await exportReportPPTX(reports, tenant?.name ?? state.settings.groupName);
    toast.push({ tone: 'success', title: 'PPTX exported', description: `${reports.length} department slide${reports.length === 1 ? '' : 's'}.` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Reporting · high-level status pack"
        title="Department status pack"
        description="A weekly attachment-style overview per department: executive RAG, feeling, workload, support need, priority clusters, delivered outcomes, key milestones, risks and governance commitments. Select all, multiple or a single department below, then export the pack."
        actions={
          <>
            <Button size="sm" onClick={() => exportReportCSV(reports)} disabled={!reports.length}><FileSpreadsheet className="h-3.5 w-3.5" /> CSV</Button>
            <Button size="sm" onClick={() => window.print()} disabled={!reports.length}><MonitorDown className="h-3.5 w-3.5" /> PDF (print)</Button>
            <Button size="sm" variant="primary" onClick={exportPptx} disabled={!reports.length}><Presentation className="h-3.5 w-3.5" /> Export PPTX</Button>
          </>
        }
      />

      {/* Separate section: department + period selection */}
      <Card className="mb-4">
        <SectionHeader
          title="Choose departments"
          subtitle={`${chosen.length} of ${departments.length} selected · ${period === 'week' ? 'weekly' : 'monthly'} pack`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setSelected(departments.map((d) => d.id))}><Check className="h-3.5 w-3.5" /> All</Button>
              <Button size="sm" onClick={() => setSelected([])}>None</Button>
              <Field label="Period"><Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}><option value="week">Week</option><option value="month">Month</option></Select></Field>
            </div>
          }
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {departments.map((d) => {
            const on = chosenIds.includes(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggle(d.id)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  on ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                {d.name} · {d.code}
              </button>
            );
          })}
          {!departments.length ? <p className="text-xs text-slate-400">No departments in this calendar scope.</p> : null}
        </div>
      </Card>

      {!reports.length ? (
        <Card><EmptyState title="No departments selected" description="Pick at least one department above to render its status pack." icon={<Presentation className="h-5 w-5" />} /></Card>
      ) : (
        <div className="space-y-6">
          {reports.map((report) => <DepartmentReportCard key={report.departmentId} report={report} />)}
        </div>
      )}
    </div>
  );
}

function DepartmentReportCard({ report }: { report: DeptReportModel }) {
  const rag = RAG_STYLE[report.rag];
  const feelingFace = report.feeling != null ? FEELING_FACE[Math.min(5, Math.max(1, Math.round(report.feeling)))] : '😐';
  return (
    <Card padded={false} className="overflow-hidden print:shadow-none print:ring-1 print:ring-slate-200">
      {/* Header band */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{report.name} · status pack</div>
            <div className="mt-0.5 text-xs text-slate-500">Update {report.updateDate} &nbsp;|&nbsp; Action tracker {report.actionTrackerDate}</div>
          </div>
          <Badge tone="neutral">{report.periodLabel}</Badge>
        </div>
        {/* KPI row */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={`rounded-lg p-3 ${rag.bg}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Executive status</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-3.5 w-3.5 rounded-full ${rag.dot}`} />
              <span className={`text-lg font-bold ${rag.text}`}>{report.ragLabel}</span>
            </div>
            <div className={`text-[11px] font-medium ${rag.text}`}>{report.ragHint} · score {report.score}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Feeling</div>
            <div className="mt-1 text-lg">{feelingFace}</div>
            <div className="text-[11px] font-medium text-slate-600">{report.feelingLabel}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workload</div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-rose-400">
              <div className="h-full bg-slate-900/70" style={{ width: `${Math.min(100, report.utilization)}%` }} />
            </div>
            <div className="mt-1 text-[11px] font-medium text-slate-600">{report.workloadLabel} · {Math.round(report.utilization)}%</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Support need</div>
            <div className="mt-1 text-sm">🤝</div>
            <div className="mt-0.5 line-clamp-2 text-[11px] font-medium text-slate-600">{report.supportNeed}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-4 p-5 lg:grid-cols-3">
        <div>
          <SectionHeader title={`Immediate priority clusters · ${report.periodLabel}`} />
          <ul className="mt-3 space-y-2">
            {report.priorities.map((p, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-slate-100 bg-white p-2.5">
                <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-sm bg-brand-500" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-800">{p.title}</div>
                  <div className="truncate text-[10px] text-slate-500">{p.detail}</div>
                </div>
              </li>
            ))}
            {!report.priorities.length ? <li className="text-[11px] text-slate-400">Nothing open right now.</li> : null}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-500">
            <Badge tone="neutral"><Users className="h-3 w-3" /> {report.headcount} people</Badge>
            <Badge tone="info">{report.openActivities} open</Badge>
            {report.overdueActivities ? <Badge tone="danger">{report.overdueActivities} overdue</Badge> : null}
            <Badge tone="neutral">{hoursLabel(report.plannedHours)} planned · {hoursLabel(report.loggedHours)} logged</Badge>
          </div>
        </div>
        <div>
          <SectionHeader title="Delivered outcomes" />
          <ul className="mt-3 space-y-2">
            {report.outcomes.map((o, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50/70 p-2.5 text-xs text-emerald-900">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-600" /> {o}
              </li>
            ))}
            {!report.outcomes.length ? <li className="text-[11px] text-slate-400">No completed items recorded this period.</li> : null}
          </ul>
        </div>
        <div>
          <SectionHeader title="Key milestones" />
          <ul className="mt-3 space-y-1.5">
            {report.milestones.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="flex h-9 w-10 flex-none flex-col items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-[9px] font-bold leading-tight text-brand-700">
                  <CalendarDays className="h-2.5 w-2.5" /> {m.date}
                </span>
                <span className="pt-1 text-slate-700">{m.label}</span>
              </li>
            ))}
            {!report.milestones.length ? <li className="text-[11px] text-slate-400">No upcoming milestones.</li> : null}
          </ul>
        </div>
      </div>

      {/* Risks + governance */}
      <div className="grid gap-4 border-t border-slate-100 bg-rose-50/40 p-5 lg:grid-cols-2">
        <div>
          <SectionHeader title="Critical risks and dependencies" />
          <ul className="mt-3 space-y-1.5">
            {report.risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-rose-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-rose-500" /> {r}
              </li>
            ))}
            {!report.risks.length ? <li className="text-[11px] text-slate-400">No open risks.</li> : null}
          </ul>
        </div>
        <div>
          <SectionHeader title="Governance commitments" />
          <ul className="mt-3 space-y-1.5">
            {report.governance.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-amber-500" /> {g}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
