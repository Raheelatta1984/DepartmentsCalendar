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
import { useStore } from '../store';
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
import { buildEscalationEmail } from '../lib/export';
import { fromISO, humanHours, periodLabel, periodRange, toISO } from '../lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, Modal, PageHeader, Progress, SearchInput, SectionHeader, Select, Tabs } from '../components/ui';
import { BarList, LineChart, ScoreRing, Sparkline } from '../components/charts';
import { useToast } from '../components/toast';

export function PerformancePage({
  filters,
  setFilters,
  onOpenEmployee,
}: {
  filters: AppFilters;
  setFilters: (patch: Partial<AppFilters>) => void;
  onOpenEmployee: (id: string) => void;
}) {
  const { state, scope, upsertEscalation, setEscalationStatus } = useStore();
  const toast = useToast();
  const [drillDept, setDrillDept] = useState<string | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [emailPreview, setEmailPreview] = useState<Escalation | null>(null);
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

  const scores = useMemo(
    () => scopedDepts.map((d) => ({ dept: d, score: departmentScore(state, d, filters.period, anchor) })).sort((a, b) => a.score.score - b.score.score),
    [scopedDepts, state, filters.period, anchor],
  );
  const summary = useMemo(() => groupScore(state, deptIds, filters.period, anchor), [state, deptIds, filters.period, anchor]);
  const series = useMemo(() => scoreSeries(state, deptIds, filters.period, anchor, 8), [state, deptIds, filters.period, anchor]);
  const below = scores.filter((s) => s.score.score < threshold);

  const activeDrill = drillDept ?? scopedDepts[0]?.id ?? null;
  const drillDepartment = activeDrill ? deptMap.get(activeDrill) : undefined;
  const drillMembers = useMemo(
    () =>
      state.employees
        .filter((e) => e.departmentId === activeDrill && e.status !== 'inactive')
        .map((e) => ({ emp: e, score: employeeScore(state, e, toISO(range.start), toISO(range.end)) }))
        .filter((x) => (employeeQuery ? x.emp.name.toLowerCase().includes(employeeQuery.toLowerCase()) : true))
        .sort((a, b) => b.score.utilization - a.score.utilization),
    [state, activeDrill, range, employeeQuery],
  );

  const escalationList = useMemo(
    () =>
      state.escalations
        .filter((e) => scope.visibleDepartmentIds.includes(e.departmentId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.escalations, scope.visibleDepartmentIds],
  );
  const openEscalations = escalationList.filter((e) => e.status === 'open').length;

  const scan = () => {
    let created = 0;
    below.forEach(({ dept, score }) => {
      const existing = state.escalations.find(
        (e) => e.departmentId === dept.id && e.periodStart === score.periodStart && e.periodEnd === score.periodEnd,
      );
      if (existing) return;
      const head = empMap.get(dept.headId ?? '');
      const coo = state.employees.find((e) => e.role === 'head_operations');
      upsertEscalation({
        id: `esc-${Math.random().toString(36).slice(2, 9)}`,
        departmentId: dept.id,
        period: filters.period,
        periodStart: score.periodStart,
        periodEnd: score.periodEnd,
        score: score.score,
        threshold,
        utilization: score.utilization,
        onTimeRate: score.onTimeRate,
        recipients: head ? [head.id] : [],
        cc: coo ? [coo.id] : [],
        createdAt: new Date().toISOString(),
        status: 'open',
        note: `${score.overdueActivities} overdue · ${score.openActivities} open activities · attendance ${score.attendanceRate}%`,
      });
      created += 1;
    });
    setScanResult({ created, checked: below.length });
    toast.push({
      tone: created ? 'success' : 'info',
      title: created ? `${created} escalation${created === 1 ? '' : 's'} created` : 'No new escalations needed',
      description: created
        ? `Department heads notified, Head of Operations copied. ${below.length} departments were below threshold.`
        : 'Every department below threshold already has an escalation for this period.',
    });
  };

  const preview = emailPreview
    ? buildEscalationEmail({
        departmentName: deptMap.get(emailPreview.departmentId)?.name ?? '',
        periodLabel: `${emailPreview.period} · ${emailPreview.periodStart} → ${emailPreview.periodEnd}`,
        score: emailPreview.score,
        threshold: emailPreview.threshold,
        utilization: emailPreview.utilization,
        onTimeRate: emailPreview.onTimeRate,
        overdue: state.activities.filter(
          (a) =>
            a.departmentId === emailPreview.departmentId &&
            a.status !== 'completed' &&
            a.status !== 'cancelled' &&
            a.endDate < toISO(new Date()),
        ).length,
        headName: empMap.get(emailPreview.recipients[0] ?? '')?.name,
        headEmail: empMap.get(emailPreview.recipients[0] ?? '')?.email,
        cooName: empMap.get(emailPreview.cc[0] ?? '')?.name,
        cooEmail: empMap.get(emailPreview.cc[0] ?? '')?.email,
        note: emailPreview.note,
      })
    : null;

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Department performance & escalation"
        description="Country-aware capacity, logged effort, on-time delivery and attendance rolled into one score per department. Anything under threshold is routed to the department head with the Head of Operations in copy."
        actions={
          <>
            <Button size="sm" onClick={scan}>
              <Play className="h-3.5 w-3.5" /> Run performance scan
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (below[0]) {
                  const dept = below[0].dept;
                  const s = below[0].score;
                  const head = empMap.get(dept.headId ?? '');
                  const coo = state.employees.find((e) => e.role === 'head_operations');
                  upsertEscalation({
                    id: `esc-${Math.random().toString(36).slice(2, 9)}`,
                    departmentId: dept.id,
                    period: filters.period,
                    periodStart: s.periodStart,
                    periodEnd: s.periodEnd,
                    score: s.score,
                    threshold,
                    utilization: s.utilization,
                    onTimeRate: s.onTimeRate,
                    recipients: head ? [head.id] : [],
                    cc: coo ? [coo.id] : [],
                    createdAt: new Date().toISOString(),
                    status: 'open',
                    note: `${s.overdueActivities} overdue activities · attendance ${s.attendanceRate}%`,
                  });
                  toast.push({
                    tone: 'success',
                    title: `Escalated ${dept.name}`,
                    description: `To ${head?.name ?? 'department head'}${coo ? ` · CC ${coo.name}` : ''}`,
                  });
                } else {
                  toast.push({ tone: 'info', title: 'Nothing to escalate', description: 'All departments are at or above the threshold.' });
                }
              }}
            >
              <Mail className="h-3.5 w-3.5" /> Escalate weakest department
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
            <Mail className="h-3 w-3" /> Dept head + CC Head of Operations
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
                            const head = empMap.get(dept.headId ?? '');
                            const coo = state.employees.find((x) => x.role === 'head_operations');
                            upsertEscalation({
                              id: `esc-${Math.random().toString(36).slice(2, 9)}`,
                              departmentId: dept.id,
                              period: filters.period,
                              periodStart: score.periodStart,
                              periodEnd: score.periodEnd,
                              score: score.score,
                              threshold,
                              utilization: score.utilization,
                              onTimeRate: score.onTimeRate,
                              recipients: head ? [head.id] : [],
                              cc: coo ? [coo.id] : [],
                              createdAt: new Date().toISOString(),
                              status: 'open',
                              note: `${score.overdueActivities} overdue · attendance ${score.attendanceRate}%`,
                            });
                            toast.push({ tone: 'success', title: `${dept.name} escalated`, description: `To ${head?.name} · CC ${coo?.name}` });
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
                    <td className="border-b border-slate-100 px-2.5 py-2 text-[10px] capitalize text-slate-500">{emp.role.replace('_', ' ')}</td>
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

        <Card padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader title="Escalation log" subtitle="Audit trail with recipients and status" action={<Badge tone="warn">{escalationList.length}</Badge>} />
          </div>
          <div className="mt-2 max-h-[380px] divide-y divide-slate-100 overflow-y-auto">
            {escalationList.map((esc) => {
              const dept = deptMap.get(esc.departmentId);
              const head = empMap.get(esc.recipients[0] ?? '');
              const coo = empMap.get(esc.cc[0] ?? '');
              return (
                <div key={esc.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[11px] font-semibold text-slate-800">{dept?.name}</span>
                        <Badge tone={esc.status === 'open' ? 'danger' : esc.status === 'acknowledged' ? 'warn' : 'good'}>{esc.status}</Badge>
                      </div>
                      <div className="mt-0.5 text-[9px] text-slate-400">
                        {esc.period} · {esc.periodStart} → {esc.periodEnd}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-600">
                        Score <strong className="text-rose-600">{esc.score}</strong> vs threshold {esc.threshold} · utilization {esc.utilization}%
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[9px] text-slate-500">
                        <span className="flex items-center gap-0.5">
                          <Mail className="h-2.5 w-2.5" /> {head?.name ?? 'unassigned'}
                        </span>
                        <span>CC {coo?.name ?? 'Head of Operations'}</span>
                      </div>
                      {esc.note ? <p className="mt-1 line-clamp-2 text-[9.5px] leading-snug text-slate-500">{esc.note}</p> : null}
                    </div>
                    <ScoreRing value={esc.score} size={30} stroke={4} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button onClick={() => setEmailPreview(esc)} className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 hover:bg-slate-50">
                      <Mail className="h-2.5 w-2.5" /> Email
                    </button>
                    {esc.status === 'open' ? (
                      <button onClick={() => setEscalationStatus(esc.id, 'acknowledged')} className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 hover:bg-amber-100">
                        <CheckCheck className="h-2.5 w-2.5" /> Acknowledge
                      </button>
                    ) : null}
                    {esc.status !== 'closed' ? (
                      <button onClick={() => setEscalationStatus(esc.id, 'closed')} className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 hover:bg-emerald-100">
                        <Check className="h-2.5 w-2.5" /> Close
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {escalationList.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Radar className="h-5 w-5" />} title="No escalations" description="Run the performance scan to find departments under threshold." />
              </div>
            ) : null}
          </div>
        </Card>
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
                navigator.clipboard?.writeText(`To: ${preview.to}\nCc: ${preview.cc}\nSubject: ${preview.subject}\n\n${preview.body}`);
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
                window.location.href = `mailto:${preview.to}?cc=${preview.cc}&subject=${encodeURIComponent(preview.subject)}&body=${encodeURIComponent(preview.body)}`;
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
                <span className="text-slate-400">Cc</span>
                <span className="text-slate-800">{preview.cc || '—'}</span>
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
