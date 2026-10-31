import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  Mail,
  Play,
  Radar,
  Send,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { useScopedState, useStore } from '../store';
import type { AppFilters, Escalation, PeriodKey } from '../types';
import {
  capacityHoursFor,
  departmentScore,
  employeeScore,
  groupScore,
  inRange,
  scoreSeries,
  scoreTone,
  shiftAnchor,
  workloadBand,
} from '../lib/analytics';
import { employeeTitle } from '../lib/permissions';
import { fromISO, humanHours, periodLabel, periodRange, toISO } from '../lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, Modal, PageHeader, Progress, SearchInput, SectionHeader, Select, Tabs } from '../components/ui';
import { BarList, LineChart, ScoreRing, Sparkline } from '../components/charts';
import { useToast } from '../components/toast';
import { EscalationPanel } from '../components/EscalationPanel';
import { canViewEscalation } from '../lib/people-workflows';

export function PerformancePage({
  filters,
  setFilters,
  onOpenEmployee,
}: {
  filters: AppFilters;
  setFilters: (patch: Partial<AppFilters>) => void;
  onOpenEmployee: (id: string) => void;
}) {
  const { scope, state: tenantState, upsertEscalation } = useStore();
  /* Operational rows come from the active tenant, cut down to the departments
     the calendar is implemented for (master setting: one / several / all). */
  const state = useScopedState();
  const toast = useToast();
  const [drillDept, setDrillDept] = useState<string | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [emailPreview, setEmailPreview] = useState<Escalation | null>(null);
  const [createEscalationOpen, setCreateEscalationOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ created: number; checked: number } | null>(null);

  const anchor = fromISO(filters.anchor);
  const scopedDepts = useMemo(
    () => scope.visibleDepartments.filter((d) => filters.departmentId === 'all' || d.id === filters.departmentId),
    [scope.visibleDepartments, filters.departmentId],
  );
  const deptIds = scopedDepts.map((d) => d.id);
  const deptMap = useMemo(() => new Map(state.departments.map((d) => [d.id, d])), [state.departments]);
  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);
  const range = periodRange(anchor, filters.period, state.settings.weekStartsOn);
  const threshold = state.settings.performanceThreshold;
  const metricsState = useMemo(() => ({
    ...state,
    employees: state.employees.filter((employee) => scope.visibleEmployeeIds.includes(employee.id)),
    activities: state.activities.filter((activity) => scope.visibleEmployeeIds.includes(activity.assigneeId)),
    timeEntries: state.timeEntries.filter((entry) => scope.visibleEmployeeIds.includes(entry.employeeId)),
  }), [state, scope.visibleEmployeeIds]);

  const scores = useMemo(
    () => scopedDepts.map((d) => ({ dept: d, score: departmentScore(metricsState, d, filters.period, anchor) })).sort((a, b) => a.score.score - b.score.score),
    [scopedDepts, metricsState, filters.period, anchor],
  );
  const summary = useMemo(() => groupScore(metricsState, deptIds, filters.period, anchor), [metricsState, deptIds, filters.period, anchor]);
  const series = useMemo(() => scoreSeries(metricsState, deptIds, filters.period, anchor, 8), [metricsState, deptIds, filters.period, anchor]);
  const below = scores.filter((s) => s.score.score < threshold);

  const activeDrill = drillDept ?? scopedDepts[0]?.id ?? null;
  const drillDepartment = activeDrill ? deptMap.get(activeDrill) : undefined;
  const drillMembers = useMemo(
    () =>
      metricsState.employees
        .filter((e) => e.departmentId === activeDrill && e.status !== 'inactive')
        .map((e) => ({ emp: e, score: employeeScore(metricsState, e, toISO(range.start), toISO(range.end)) }))
        .filter((x) => (employeeQuery ? x.emp.name.toLowerCase().includes(employeeQuery.toLowerCase()) : true))
        .sort((a, b) => b.score.utilization - a.score.utilization),
    [metricsState, activeDrill, range, employeeQuery],
  );

  const escalationList = useMemo(
    () =>
      state.escalations
        .filter((e) => canViewEscalation(tenantState, scope.user.id, e))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.escalations, tenantState, scope.user.id],
  );
  const openEscalations = escalationList.filter((e) => e.status === 'open').length;

  const scan = () => {
    if (!scope.user.managerId) { toast.push({ tone: 'error', title: 'Reporting lead required', description: 'Set a reporting lead before raising escalations.' }); return; }
    let created = 0;
    let failed: string | null = null;
    below.forEach(({ dept, score }) => {
      const existing = state.escalations.find(
        (e) => (e.sourceDepartmentId ?? e.departmentId) === dept.id && e.raisedById === scope.user.id && e.periodStart === score.periodStart && e.periodEnd === score.periodEnd,
      );
      if (existing) return;
      const error = upsertEscalation({
        id: `esc-${Math.random().toString(36).slice(2, 9)}`,
        departmentId: dept.id,
        sourceDepartmentId: dept.id,
        period: filters.period,
        periodStart: score.periodStart,
        periodEnd: score.periodEnd,
        score: score.score,
        threshold,
        utilization: score.utilization,
        onTimeRate: score.onTimeRate,
        recipients: [],
        cc: [],
        createdAt: new Date().toISOString(),
        status: 'open',
        note: `${dept.name}: ${score.overdueActivities} overdue · ${score.openActivities} open activities · attendance ${score.attendanceRate}%`,
      });
      if (error) failed = error;
      else created += 1;
    });
    setScanResult({ created, checked: below.length });
    if (failed) { toast.push({ tone: 'error', title: 'Some escalations could not be raised', description: failed }); return; }
    toast.push({
      tone: created ? 'success' : 'info',
      title: created ? `${created} escalation${created === 1 ? '' : 's'} created` : 'No new escalations needed',
      description: created
        ? `Routed to your reporting lead with urgent follow-up activities. ${below.length} departments were below threshold.`
        : 'Every department below threshold already has an escalation for this period.',
    });
  };

  const preview = emailPreview ? {
    to: tenantState.employees.find((person) => person.id === emailPreview.recipients[0])?.email ?? '',
    subject: `Urgent follow-up · ${tenantState.employees.find((person) => person.id === emailPreview.raisedById)?.name ?? 'Reporting-line escalation'}`,
    body: `Hello ${tenantState.employees.find((person) => person.id === emailPreview.recipients[0])?.name ?? 'reporting lead'},\n\n${emailPreview.note}\n\nAn urgent follow-up activity has been recorded in the portal. Please use the escalation thread to coordinate next steps.`,
  } : null;

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Department performance & escalation"
        description="Country-aware delivery scores and reporting-line escalations. Every new concern goes to your reporting lead with an urgent follow-up activity."
        actions={
          <>
            <Button size="sm" onClick={scan}>
              <Play className="h-3.5 w-3.5" /> Run performance scan
            </Button>
            <Button size="sm" variant="primary" onClick={() => setCreateEscalationOpen(true)}>
              <Mail className="h-3.5 w-3.5" /> Raise escalation
            </Button>
          </>
        }
      />

      <Card className="mb-3 !py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs<PeriodKey>
            tabs={[
              { id: 'day', label: 'Daily' },
              { id: 'week', label: 'Weekly' },
              { id: 'month', label: 'Monthly' },
              { id: 'quarter', label: 'Quarterly' },
              { id: 'year', label: 'Annual' },
            ]}
            value={filters.period}
            onChange={(p) => setFilters({ period: p })}
          />
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => setFilters({ anchor: toISO(shiftAnchor(anchor, filters.period, -1)) })}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[150px] text-center text-xs font-medium text-slate-700">{periodLabel(anchor, filters.period)}</span>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => setFilters({ anchor: toISO(shiftAnchor(anchor, filters.period, 1)) })}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="w-[200px]">
            <Select value={filters.departmentId} onChange={(e) => setFilters({ departmentId: e.target.value })}>
              <option value="all">All departments</option>
              {scope.visibleDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
            <span className="rounded-md bg-slate-100 px-2 py-1">Threshold {threshold}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1">
              Range {toISO(range.start)} → {toISO(range.end)}
            </span>
          </div>
        </div>
      </Card>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Portfolio score</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{summary.score}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {summary.score >= 85 ? 'Healthy portfolio' : summary.score >= threshold ? 'Acceptable, watch weak units' : 'Below governance threshold'}
              </div>
            </div>
            <ScoreRing value={summary.score} size={48} stroke={5} />
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Below threshold</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-600">{below.length}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">of {scores.length} departments in scope</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {below.slice(0, 3).map((b) => (
              <Badge key={b.dept.id} tone="danger">
                {b.dept.code} {b.score.score}
              </Badge>
            ))}
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Average utilization</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{summary.utilization}%</div>
          <div className="mt-0.5 text-[10px] text-slate-500">{workloadBand(summary.utilization).label} · target 85%</div>
          <div className="mt-2">
            <Progress value={summary.utilization} tone={summary.utilization > 110 ? 'danger' : summary.utilization < 60 ? 'warn' : 'good'} height={5} />
          </div>
        </Card>
        <Card>
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Open escalations</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">{openEscalations}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">{escalationList.length} logged in total</div>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">
            <Mail className="h-3 w-3" /> Routed to your reporting lead
          </div>
        </Card>
      </div>

      <div className="mb-3 grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionHeader
            title="Portfolio trend"
            subtitle={`Score, utilization and on-time delivery by ${filters.period}`}
            action={
              <Badge tone={summary.score >= threshold ? 'good' : 'danger'}>
                {summary.score >= threshold ? 'within tolerance' : 'attention required'}
              </Badge>
            }
          />
          <div className="mt-3">
            <LineChart
              labels={series.map((s) => s.label)}
              series={[
                { label: 'Score', color: '#3a63f0', data: series.map((s) => s.score) },
                { label: 'Utilization', color: '#10b981', data: series.map((s) => s.utilization) },
                { label: 'On-time', color: '#f59e0b', data: series.map((s) => s.onTime), dashed: true },
              ]}
              yMax={130}
              height={210}
            />
          </div>
        </Card>
        <Card>
          <SectionHeader title="Capacity pressure" subtitle="Planned workload vs available capacity" />
          <div className="mt-3">
            <BarList
              items={scores
                .slice()
                .sort((a, b) => b.score.workloadIndex - a.score.workloadIndex)
                .map(({ dept, score }) => ({
                  label: dept.code,
                  sublabel: `${score.headcount} ppl`,
                  value: score.workloadIndex,
                  color: score.workloadIndex > 115 ? '#ef4444' : score.workloadIndex > 95 ? '#f59e0b' : '#10b981',
                }))}
              formatter={(v) => `${v}%`}
              max={Math.max(140, ...scores.map((s) => s.score.workloadIndex))}
            />
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-500">
            Above 115% means the plan cannot be delivered inside contracted hours — either re-plan or approve overtime before it becomes
            missed commitments.
          </p>
        </Card>
      </div>

      <Card className="mb-3" padded={false}>
        <div className="px-4 pt-4">
          <SectionHeader
            title="Department performance matrix"
            subtitle="Daily, weekly, monthly, quarterly and annual scores use identical formulas, so the number always reconciles"
            action={
              <div className="flex gap-1.5">
                <Button size="sm" onClick={scan}>
                  <Sparkles className="h-3.5 w-3.5" /> Rule engine
                </Button>
              </div>
            }
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {['Department', 'Head', 'People', 'Capacity', 'Logged', 'Utilization', 'On-time', 'Completion', 'Attendance', 'Workload', 'Score', 'Trend', 'Action'].map((h) => (
                  <th key={h} className="border-b border-slate-200 bg-slate-50/90 px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.map(({ dept, score }) => {
                const head = empMap.get(dept.headId ?? '');
                const tone = scoreTone(score.score, threshold);
                const spark = scoreSeries(state, [dept.id], filters.period, anchor, 6).map((s) => s.score);
                return (
                  <tr
                    key={dept.id}
                    className={`cursor-pointer transition-colors hover:bg-slate-50/70 ${activeDrill === dept.id ? 'bg-brand-50/40' : ''}`}
                    onClick={() => setDrillDept(dept.id)}
                  >
                    <td className="border-b border-slate-100 py-2.5 pl-4 pr-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-1 rounded-full" style={{ background: dept.color }} />
                        <div>
                          <div className="text-[11px] font-semibold text-slate-800">{dept.name}</div>
                          <div className="text-[9px] text-slate-400">{dept.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5">
                      {head ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={head.name} color={head.avatarColor} size={20} />
                          <span className="max-w-[90px] truncate text-[10px] text-slate-600">{head.name}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-[11px] tabular-nums text-slate-600">{score.headcount}</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-[11px] tabular-nums text-slate-600">{score.capacityHours}h</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-[11px] tabular-nums text-slate-600">{score.loggedHours}h</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-8 text-[11px] font-semibold tabular-nums text-slate-800">{score.utilization}%</span>
                        <div className="w-16">
                          <Progress value={score.utilization} tone={score.utilization > 110 ? 'danger' : score.utilization < 55 ? 'warn' : 'good'} height={4} />
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-[11px] tabular-nums text-slate-600">{score.onTimeRate}%</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-[11px] tabular-nums text-slate-600">{score.completionRate}%</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-[11px] tabular-nums text-slate-600">{score.attendanceRate}%</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5">
                      <Badge tone={score.workloadIndex > 115 ? 'danger' : score.workloadIndex > 95 ? 'warn' : 'good'}>{score.workloadIndex}%</Badge>
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <ScoreRing value={score.score} size={30} stroke={4} />
                        <span className={`text-[9px] font-semibold ${tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-rose-600'}`}>
                          {tone === 'good' ? 'ok' : tone === 'warn' ? 'watch' : 'at risk'}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-14">
                          <Sparkline data={spark} color={tone === 'good' ? '#10b981' : tone === 'warn' ? '#f59e0b' : '#ef4444'} height={20} />
                        </div>
                        <span className={`text-[10px] font-medium ${score.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {score.trend >= 0 ? '+' : ''}
                          {score.trend}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 py-2.5 pl-2 pr-4">
                      {score.score < threshold ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const error = upsertEscalation({
                              id: `esc-${Math.random().toString(36).slice(2, 9)}`,
                              departmentId: dept.id,
                              sourceDepartmentId: dept.id,
                              period: filters.period,
                              periodStart: score.periodStart,
                              periodEnd: score.periodEnd,
                              score: score.score,
                              threshold,
                              utilization: score.utilization,
                              onTimeRate: score.onTimeRate,
                              recipients: [],
                              cc: [],
                              createdAt: new Date().toISOString(),
                              status: 'open',
                              note: `${dept.name}: ${score.overdueActivities} overdue · attendance ${score.attendanceRate}%`,
                            });
                            if (error) toast.push({ tone: 'error', title: 'Escalation not raised', description: error });
                            else toast.push({ tone: 'success', title: `${dept.name} escalated`, description: `Routed to your reporting lead with an urgent follow-up activity.` });
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-1 text-[9px] font-semibold text-rose-600 hover:bg-rose-100"
                        >
                          <Mail className="h-2.5 w-2.5" /> escalate
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600">
                          <Check className="h-2.5 w-2.5" /> compliant
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {scanResult ? (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
            Last scan: {scanResult.checked} department(s) below threshold · {scanResult.created} new escalation(s) created.
          </div>
        ) : null}
      </Card>

      <div className="mb-3 grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader
              title={`Employee scorecard · ${drillDepartment?.name ?? 'select a department'}`}
              subtitle={`${drillMembers.length} people · ${periodLabel(anchor, filters.period)}`}
              action={<SearchInput value={employeeQuery} onChange={setEmployeeQuery} placeholder="Find employee" className="w-[170px]" />}
            />
          </div>
          <div className="mt-3 max-h-[360px] overflow-auto">
            <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Employee', 'Role', 'Planned', 'Logged', 'Utilization', 'On-time', 'Score', ''].map((h) => (
                    <th key={h} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drillMembers.map(({ emp, score }) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 py-2 pl-4 pr-2.5">
                      <div className="flex items-center gap-1.5">
                        <Avatar name={emp.name} color={emp.avatarColor} size={22} />
                        <div className="min-w-0">
                          <div className="max-w-[130px] truncate text-[11px] font-medium text-slate-800">{emp.name}</div>
                          <div className="text-[9px] text-slate-400">{emp.code} · {emp.countryCode}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2 text-[10px] text-slate-500">{employeeTitle(emp)}</td>
                    <td className="border-b border-slate-100 px-2.5 py-2 text-[11px] tabular-nums text-slate-600">{score.plannedHours}h</td>
                    <td className="border-b border-slate-100 px-2.5 py-2 text-[11px] tabular-nums text-slate-600">{score.loggedHours}h</td>
                    <td className="border-b border-slate-100 px-2.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-8 text-[11px] font-semibold tabular-nums ${score.utilization > 110 ? 'text-rose-600' : score.utilization < 50 ? 'text-amber-600' : 'text-slate-800'}`}>
                          {score.utilization}%
                        </span>
                        <div className="w-14">
                          <Progress value={score.utilization} tone={score.utilization > 110 ? 'danger' : score.utilization < 55 ? 'warn' : 'good'} height={3} />
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2 text-[11px] tabular-nums text-slate-600">{score.onTimeRate}%</td>
                    <td className="border-b border-slate-100 px-2.5 py-2">
                      <ScoreRing value={score.score} size={28} stroke={4} />
                    </td>
                    <td className="border-b border-slate-100 py-2 pl-2 pr-4 text-right">
                      <button onClick={() => onOpenEmployee(emp.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Open 360 view">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {drillMembers.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No employees match" description="Clear the search or choose another department." />
              </div>
            ) : null}
          </div>
        </Card>

        <EscalationPanel createOpen={createEscalationOpen} onCreateChange={setCreateEscalationOpen} onEmail={setEmailPreview} />
      </div>

      <Modal
        open={!!emailPreview}
        onClose={() => setEmailPreview(null)}
        title="Escalation email"
        subtitle="Generated from live metrics — paste into Outlook, or copy and send from your own mailbox."
        width="max-w-2xl"
        footer={
          <>
            <Button size="sm" onClick={() => setEmailPreview(null)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!preview) return;
                navigator.clipboard?.writeText(`To: ${preview.to}\nSubject: ${preview.subject}\n\n${preview.body}`);
                toast.push({ tone: 'success', title: 'Email copied', description: 'Paste into Outlook or Google Mail.' });
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (!preview) return;
                window.location.href = `mailto:${preview.to}?subject=${encodeURIComponent(preview.subject)}&body=${encodeURIComponent(preview.body)}`;
              }}
            >
              <Send className="h-3.5 w-3.5" /> Open in mail app
            </Button>
          </>
        }
      >
        {preview ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200">
              <div className="grid grid-cols-[56px_1fr] gap-x-2 gap-y-1 border-b border-slate-100 px-3 py-2 text-[11px]">
                <span className="text-slate-400">To</span>
                <span className="text-slate-800">{preview.to || '—'}</span>
                <span className="text-slate-400">Subject</span>
                <span className="font-medium text-slate-900">{preview.subject}</span>
              </div>
              <pre className="whitespace-pre-wrap px-3 py-3 text-[11px] leading-relaxed text-slate-700">{preview.body}</pre>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[10px] text-brand-800">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" />
              This sandbox does not send email. In production the same payload is delivered through Microsoft Graph <code>sendMail</code> or a
              transactional provider (Resend / SendGrid) from a serverless function — see docs/ARCHITECTURE.md.
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
