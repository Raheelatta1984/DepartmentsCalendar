import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gauge,
  Layers,
  LifeBuoy,
  Mail,
  Megaphone,
  MessagesSquare,
  Plus,
  RefreshCw,
  Building2,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useStore } from '../store';
import type { AppFilters, Department, Employee, PeriodKey, ViewKey } from '../types';
import {
  TYPE_LABELS,
  capacityHoursFor,
  departmentScore,
  employeeScore,
  filterActivities,
  groupScore,
  inRange,
  scoreSeries,
  scoreTone,
  shiftAnchor,
  typeDistribution,
  workloadBand,
} from '../lib/analytics';
import { fromISO, humanHours, periodLabel, periodRange, prettyDate, toISO } from '../lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Progress, SectionHeader, Select, StatCard, Tabs } from '../components/ui';
import { BarList, Donut, LineChart, ScoreRing, Sparkline } from '../components/charts';
import { ActivityLine, TYPE_COLORS, TypeIcon } from '../components/activity-ui';
import { useToast } from '../components/toast';
import { buildStandupPulses, entryFor } from '../lib/standups';
import { canViewStandupBoard } from '../lib/permissions';
import {
  departmentsInEntityScope,
  entityScopeLabel,
  scopeEntityOptions,
} from '../lib/entities';

export function Dashboard({
  filters,
  setFilters,
  onNavigate,
  onOpenActivity,
  onNewActivity,
  onOpenEmployee,
}: {
  filters: AppFilters;
  setFilters: (patch: Partial<AppFilters>) => void;
  onNavigate: (v: ViewKey) => void;
  onOpenActivity: (id: string) => void;
  onNewActivity: () => void;
  onOpenEmployee: (id: string) => void;
}) {
  const { state, scope, upsertEscalation } = useStore();
  const toast = useToast();
  const [escalating, setEscalating] = useState<string | null>(null);
  const today = toISO(new Date());

  const anchor = fromISO(filters.anchor);
  const range = useMemo(() => periodRange(anchor, filters.period, state.settings.weekStartsOn), [anchor, filters.period, state.settings.weekStartsOn]);
  const rangeISO = { start: toISO(range.start), end: toISO(range.end) };

  /* ---- Entity focus -------------------------------------------------
     The command centre reads one legal entity at a time. The selection
     covers the entity plus every company beneath it, and it never widens
     the permission scope: role visibility is applied first. */
  const entityOptions = useMemo(
    () => scopeEntityOptions(state.entities, scope.visibleDepartments),
    [state.entities, scope.visibleDepartments],
  );
  const selectedEntityId = filters.entityId ?? 'all';
  const selectedEntity = useMemo(
    () => state.entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [state.entities, selectedEntityId],
  );
  const entityScopeName = entityScopeLabel(state.entities, selectedEntityId);

  const entityDepartments = useMemo(
    () => departmentsInEntityScope(state.entities, scope.visibleDepartments, selectedEntityId),
    [state.entities, scope.visibleDepartments, selectedEntityId],
  );
  const scopedDepartments = useMemo(
    () => entityDepartments.filter((d) => filters.departmentId === 'all' || d.id === filters.departmentId),
    [entityDepartments, filters.departmentId],
  );

  /* A department carried over from another entity must not silently empty
     the board — reset that one filter, never the entity the user chose. */
  useEffect(() => {
    if (filters.departmentId === 'all') return;
    if (entityDepartments.some((d) => d.id === filters.departmentId)) return;
    setFilters({ departmentId: 'all' });
  }, [entityDepartments, filters.departmentId, setFilters]);
  const deptIds = scopedDepartments.map((d) => d.id);
  const scopedEmployees = useMemo(
    () => state.employees.filter((e) => deptIds.includes(e.departmentId) && e.status !== 'inactive'),
    [state.employees, deptIds],
  );

  const summary = useMemo(() => groupScore(state, deptIds, filters.period, anchor), [state, deptIds, filters.period, anchor]);
  const prevAnchor = useMemo(() => shiftAnchor(anchor, filters.period, -1), [anchor, filters.period]);
  const prevSummary = useMemo(() => groupScore(state, deptIds, filters.period, prevAnchor), [state, deptIds, filters.period, prevAnchor]);
  const series = useMemo(() => scoreSeries(state, deptIds, filters.period, anchor, 8), [state, deptIds, filters.period, anchor]);

  const activities = useMemo(
    () => filterActivities(state, { departmentIds: deptIds, start: rangeISO.start, end: rangeISO.end }),
    [state, deptIds, rangeISO.start, rangeISO.end],
  );
  const todaysActivities = useMemo(
    () =>
      filterActivities(state, { departmentIds: deptIds, start: today, end: today }).sort((a, b) =>
        (a.startTime ?? '23:59').localeCompare(b.startTime ?? '23:59'),
      ),
    [state, deptIds, today],
  );
  const mix = useMemo(() => typeDistribution(activities), [activities]);

  const peopleLoad = useMemo(
    () =>
      scopedEmployees
        .map((e) => ({ employee: e, score: employeeScore(state, e, rangeISO.start, rangeISO.end) }))
        .sort((a, b) => b.score.utilization - a.score.utilization),
    [scopedEmployees, state, rangeISO.start, rangeISO.end],
  );
  const overloaded = peopleLoad.filter((p) => p.score.utilization > 110);
  const idle = peopleLoad.filter((p) => p.score.utilization < 45);

  const deptScores = summary.departments.slice().sort((a, b) => a.score - b.score);
  const belowThreshold = deptScores.filter((d) => d.score < state.settings.performanceThreshold);
  const threshold = state.settings.performanceThreshold;

  const deptMap = useMemo(() => new Map(state.departments.map((d) => [d.id, d])), [state.departments]);
  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);
  const entityMap = useMemo(() => new Map(state.entities.map((e) => [e.id, e])), [state.entities]);

  /* ---- Daily stand-up pulse (today) --------------------------------
     High-level department summary with support callouts. Leadership
     sees every department in scope; the CEO/COO drill from this summary
     into the full top-to-bottom board on the Daily stand-up tab.       */
  const isStandupViewer = canViewStandupBoard(scope);
  const standupPulses = useMemo(
    () => (isStandupViewer ? buildStandupPulses(state, deptIds, today) : []),
    [isStandupViewer, state, deptIds, today],
  );
  const myStandup = entryFor(state.standups, today, scope.user.id);
  const openStandupDepartment = (departmentId: string) => {
    window.location.hash = `#/standups?department=${encodeURIComponent(departmentId)}`;
  };

  /* Connector health follows the same entity focus as every other card. */
  const scopedEmployeeIds = useMemo(() => new Set(scopedEmployees.map((e) => e.id)), [scopedEmployees]);
  const outlook = state.connections.filter(
    (c) => c.provider === 'outlook' && c.status === 'connected' && scopedEmployeeIds.has(c.employeeId),
  ).length;
  const google = state.connections.filter(
    (c) => c.provider === 'google' && c.status === 'connected' && scopedEmployeeIds.has(c.employeeId),
  ).length;
  const failedSyncs = state.syncJobs.filter(
    (j) => j.status === 'failed' && deptIds.includes(state.activities.find((a) => a.id === j.activityId)?.departmentId ?? ''),
  ).length;

  const raiseEscalation = (department: Department) => {
    const score = departmentScore(state, department, filters.period, anchor);
    const head = empMap.get(department.headId ?? '');
    const coo = state.employees.find((e) => e.role === 'head_operations');
    setEscalating(department.id);
    upsertEscalation({
      id: `esc-${Math.random().toString(36).slice(2, 9)}`,
      departmentId: department.id,
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
      note:
        score.overdueActivities > 0
          ? `${score.overdueActivities} overdue activities and utilization at ${score.utilization}%. Review required.`
          : `Performance score ${score.score} is below the ${threshold} threshold for this ${filters.period}.`,
    });
    setEscalating(null);
    toast.push({
      tone: 'success',
      title: `Escalation raised for ${department.name}`,
      description: head
        ? `Notified ${head.name}${coo ? ` · CC ${coo.name} (Head of Operations)` : ''}. The record is in Performance & escalation.`
        : 'Recorded in the escalation log.',
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Command centre"
        title={selectedEntity ? `${selectedEntity.name} overview` : `${state.settings.groupName} activity overview`}
        description={
          selectedEntity
            ? `Workload, delivery performance and schedule flow for ${selectedEntity.name} and its companies only — ${scope.visibleDepartments.length} departments are visible to your role, ${entityDepartments.length} sit in this entity.`
            : 'Collective workload, delivery performance and schedule flow for every department you are responsible for — from the shop floor to the CEO.'
        }
        actions={
          <>
            <Button size="sm" onClick={() => setFilters({ anchor: today, period: 'week' })}>
              <CalendarClock className="h-3.5 w-3.5" /> This week
            </Button>
            <Button size="sm" variant="primary" onClick={onNewActivity}>
              <Plus className="h-3.5 w-3.5" /> Schedule activity
            </Button>
          </>
        }
      />

      {/* Filter bar */}
      <Card className="mb-4 !py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs<PeriodKey>
            guideSkip
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
            <button
              className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              onClick={() => setFilters({ anchor: toISO(shiftAnchor(anchor, filters.period, -1)) })}
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[152px] text-center text-xs font-medium text-slate-700">{periodLabel(anchor, filters.period)}</span>
            <button
              className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              onClick={() => setFilters({ anchor: toISO(shiftAnchor(anchor, filters.period, 1)) })}
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="min-w-[230px]">
            <Select
              aria-label="Entity"
              title="Focus the command centre on one legal entity"
              value={selectedEntityId}
              onChange={(e) => setFilters({ entityId: e.target.value, departmentId: 'all', employeeId: 'all' })}
            >
              <option value="all">All entities in my scope</option>
              {entityOptions.map(({ entity, depth }) => (
                <option key={entity.id} value={entity.id}>
                  {`${'\u00a0\u00a0'.repeat(depth)}${depth ? '↳ ' : ''}${entity.name} · ${entity.code}`}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[190px]">
            <Select
              aria-label="Department"
              value={filters.departmentId}
              onChange={(e) => setFilters({ departmentId: e.target.value, employeeId: 'all' })}
            >
              <option value="all">{selectedEntity ? `All departments in ${selectedEntity.code}` : 'All departments in my scope'}</option>
              {entityDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-500">
            <Building2 className="h-3 w-3 text-slate-400" />
            <span className="font-medium text-slate-700">{selectedEntity ? selectedEntity.code : 'Group'}</span>
            <span className="text-slate-300">·</span>
            <span>{entityDepartments.length} departments</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {summary.headcount} people
            </span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" /> {scopedDepartments.length} departments
            </span>
            <span className="text-slate-300">·</span>
            <span className="max-w-[160px] truncate">{entityScopeName}</span>
            <span className="text-slate-300">·</span>
            <span>
              {rangeISO.start} → {rangeISO.end}
            </span>
          </div>
        </div>
      </Card>

      {/* KPI row */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Delivery score"
          value={summary.score}
          suffix="/ 100"
          delta={summary.score - prevSummary.score}
          hint={`${belowThreshold.length} dept${belowThreshold.length === 1 ? '' : 's'} below the ${threshold} threshold`}
          icon={<Gauge className="h-4 w-4" />}
          tone={scoreTone(summary.score, threshold) === 'good' ? 'good' : scoreTone(summary.score, threshold) === 'warn' ? 'warn' : 'danger'}
        />
        <StatCard
          label="Logged vs capacity"
          value={summary.loggedHours}
          suffix={`h / ${summary.capacityHours}h`}
          hint={`${summary.plannedHours}h planned across ${activities.length} activities`}
          icon={<Clock3 className="h-4 w-4" />}
          tone="brand"
        />
        <StatCard
          label="Utilization"
          value={`${summary.utilization}%`}
          delta={summary.trend}
          hint={workloadBand(summary.utilization).label}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={summary.utilization > 110 ? 'danger' : summary.utilization < 55 ? 'warn' : 'good'}
        />
        <StatCard
          label="On-time delivery"
          value={`${summary.onTimeRate}%`}
          hint={`${summary.completionRate}% of in-period activities completed`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone={summary.onTimeRate >= 75 ? 'good' : 'warn'}
        />
        <StatCard
          label="Escalations open"
          value={state.escalations.filter((e) => e.status === 'open' && deptIds.includes(e.departmentId)).length}
          hint={`${summary.overdueActivities} overdue activities · ${overloaded.length} people over capacity`}
          icon={<BellRing className="h-4 w-4" />}
          tone="danger"
        />
      </div>

      {/* Daily stand-up pulse — high-level department summary + callouts */}
      <Card className="mb-4" padded={false}>
        <div className="px-4 pt-4">
          <SectionHeader
            title="Daily stand-up pulse"
            subtitle={`Department check-ins, blockers and support callouts for ${prettyDate(today)}`}
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigate('standups')}>
                Open stand-up tab <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            }
          />
        </div>
        {isStandupViewer ? (
          <div className="max-h-[340px] overflow-y-auto px-2 pb-3 pt-2">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Department', 'Head', 'Submission today', 'Pending', 'Blockers', 'Support callouts', ''].map((h) => (
                    <th
                      key={h}
                      className="border-b border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standupPulses.map((pulse) => {
                  const dept = deptMap.get(pulse.departmentId);
                  if (!dept) return null;
                  const head = empMap.get(dept.headId ?? '');
                  const pending = pulse.pendingCount + pulse.draftCount;
                  return (
                    <tr
                      key={dept.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80"
                      onClick={() => openStandupDepartment(dept.id)}
                    >
                      <td className="border-b border-slate-100 py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-1 rounded-full" style={{ background: dept.color }} />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-slate-800">{dept.name}</div>
                            <div className="text-[10px] text-slate-400">{dept.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        {head ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar name={head.name} color={head.avatarColor} size={22} />
                            <span className="max-w-[110px] truncate text-[11px] text-slate-600">{head.name}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-28">
                            <Progress
                              value={pulse.submissionRate}
                              tone={pulse.submissionRate >= 80 ? 'good' : pulse.submissionRate >= 50 ? 'warn' : 'danger'}
                              height={5}
                            />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums text-slate-700">
                            {pulse.submittedCount}/{pulse.memberCount}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5 text-xs tabular-nums">
                        {pending > 0 ? <Badge tone="warn">{pending} pending</Badge> : <Badge tone="good">All in</Badge>}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        {pulse.blockerCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">
                            <AlertTriangle className="h-3 w-3" /> {pulse.blockerCount}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        {pulse.openSupportCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-600">
                              <LifeBuoy className="h-3 w-3" /> {pulse.openSupportCount}
                            </span>
                            {pulse.crossFunctionalCount > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                                <Megaphone className="h-3 w-3" /> {pulse.crossFunctionalCount} cross
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 py-2.5 pl-2 pr-4 text-right">
                        <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {standupPulses.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<MessagesSquare className="h-5 w-5" />}
                  title="No stand-up data in this entity"
                  description="No department your role can track sits in the selected entity focus."
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="px-4 pb-4 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('standups')}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/50"
            >
              <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
                <MessagesSquare className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800">Your stand-up for {prettyDate(today)}</div>
                <div className="text-[11px] text-slate-500">
                  {myStandup?.status === 'submitted'
                    ? 'Submitted — leadership can see your update, blockers and action items.'
                    : myStandup
                      ? 'You have a draft — finish and submit your daily stand-up.'
                      : 'Share yesterday’s work, progress, blockers and the action items for the day.'}
                </div>
              </div>
              <Badge tone={myStandup?.status === 'submitted' ? 'good' : myStandup ? 'warn' : 'neutral'}>
                {myStandup?.status === 'submitted' ? 'Submitted' : myStandup ? 'Draft' : 'Not started'}
              </Badge>
            </button>
          </div>
        )}
      </Card>

      {/* Trend + mix */}
      <div className="mb-4 grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionHeader
            title="Group performance trend"
            subtitle={`Delivery score, utilization and on-time rate by ${filters.period} · last 8 periods`}
            action={
              <div className="flex items-center gap-1.5">
                <Badge tone="brand">score {summary.score}</Badge>
                <Badge tone={summary.trend >= 0 ? 'good' : 'danger'}>
                  {summary.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(summary.trend)}% util vs prev
                </Badge>
              </div>
            }
          />
          <div className="mt-3">
            <LineChart
              labels={series.map((s) => s.label)}
              series={[
                { label: 'Delivery score', color: '#3a63f0', data: series.map((s) => s.score) },
                { label: 'Utilization', color: '#10b981', data: series.map((s) => s.utilization) },
                { label: 'On-time', color: '#f59e0b', data: series.map((s) => s.onTime), dashed: true },
              ]}
              height={214}
              yMax={120}
            />
          </div>
        </Card>

        <Card>
          <SectionHeader title="Where effort goes" subtitle="Planned hours by activity type in the selected period" />
          <div className="mt-4">
            <Donut
              segments={mix.slice(0, 7).map((m) => ({
                label: TYPE_LABELS[m.type],
                value: m.hours,
                color: TYPE_COLORS[m.type].solid,
              }))}
              centerValue={`${activities.length}`}
              centerLabel="activities"
              size={140}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Meetings & sessions</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-800">
                {humanHours(
                  mix.filter((m) => ['meeting', 'session', 'seminar'].includes(m.type)).reduce((a, b) => a + b.hours, 0),
                )}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Execution tasks</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-800">
                {humanHours(
                  mix.filter((m) => ['task', 'follow_up', 'audit', 'site_visit'].includes(m.type)).reduce((a, b) => a + b.hours, 0),
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Department scorecard + attention */}
      <div className="mb-4 grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader
              title="Department scorecard"
              subtitle={`Collective workload and performance · ${periodLabel(anchor, filters.period)}`}
              action={
                <Button size="sm" variant="ghost" onClick={() => onNavigate('performance')}>
                  Full performance view <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              }
            />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Department', 'Head', 'People', 'Workload (logged / capacity)', 'Utilization', 'On-time', 'Score', ''].map((h) => (
                    <th
                      key={h}
                      className="border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptScores.map((score) => {
                  const dept = deptMap.get(score.departmentId)!;
                  const head = empMap.get(dept.headId ?? '');
                  const tone = scoreTone(score.score, threshold);
                  return (
                    <tr
                      key={dept.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80"
                      onClick={() => {
                        setFilters({ departmentId: dept.id });
                        onNavigate('calendar');
                      }}
                    >
                      <td className="border-b border-slate-100 py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-1 rounded-full" style={{ background: dept.color }} />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-slate-800">{dept.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {dept.code} · {entityMap.get(dept.entityId)?.code}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        {head ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar name={head.name} color={head.avatarColor} size={22} />
                            <span className="max-w-[110px] truncate text-[11px] text-slate-600">{head.name}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5 text-xs tabular-nums text-slate-600">{score.headcount}</td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        <div className="text-[11px] tabular-nums text-slate-600">
                          {score.loggedHours}h <span className="text-slate-300">/</span> {score.capacityHours}h
                        </div>
                        <div className="mt-1 w-28">
                          <Progress value={score.utilization} tone={score.utilization > 110 ? 'danger' : score.utilization < 55 ? 'warn' : 'good'} height={4} />
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-9 text-xs font-semibold tabular-nums text-slate-700">{score.utilization}%</span>
                          <span
                            className={`rounded px-1 py-0.5 text-[9px] font-medium ${
                              workloadBand(score.utilization).tone === 'good'
                                ? 'bg-emerald-50 text-emerald-600'
                                : workloadBand(score.utilization).tone === 'warn'
                                  ? 'bg-amber-50 text-amber-600'
                                  : 'bg-rose-50 text-rose-600'
                            }`}
                          >
                            {workloadBand(score.utilization).label}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        <div className="flex items-center gap-1 text-xs tabular-nums text-slate-600">
                          {score.onTimeRate}%
                          {score.overdueActivities > 0 ? (
                            <span className="rounded bg-rose-50 px-1 text-[9px] font-medium text-rose-600">{score.overdueActivities} late</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <ScoreRing value={score.score} size={34} stroke={4} />
                          <span className={`text-[10px] font-semibold ${tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-rose-600'}`}>
                            {tone === 'good' ? 'Healthy' : tone === 'warn' ? 'Watch' : 'At risk'}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 py-2.5 pl-2 pr-4 text-right">
                        <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {deptScores.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No departments in this entity"
                description="This entity holds no department your role can see. Pick another entity, or switch persona to widen the scope."
              />
            </div>
          ) : null}
        </Card>

        <div className="space-y-3">
          <Card>
            <SectionHeader
              title="Attention queue"
              subtitle={`Departments under the ${threshold} threshold`}
              action={<Badge tone="danger">{belowThreshold.length}</Badge>}
            />
            <div className="mt-3 space-y-2">
              {belowThreshold.length === 0 ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-4 text-center">
                  <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
                  <div className="text-xs font-medium text-emerald-800">All departments above threshold</div>
                  <div className="mt-0.5 text-[10px] text-emerald-600">Nothing needs the Head of Operations' attention this period.</div>
                </div>
              ) : (
                belowThreshold.slice(0, 4).map((score) => {
                  const dept = deptMap.get(score.departmentId)!;
                  const head = empMap.get(dept.headId ?? '');
                  const coo = state.employees.find((e) => e.role === 'head_operations');
                  return (
                    <div key={dept.id} className="rounded-lg border border-rose-100 bg-rose-50/40 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-800">{dept.name}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            Score <span className="font-semibold text-rose-600">{score.score}</span> · utilization {score.utilization}% ·{' '}
                            {score.overdueActivities} overdue
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                            <Mail className="h-2.5 w-2.5" />
                            To {head?.name ?? 'Dept head'}
                            {coo ? ` · CC ${coo.name}` : ''}
                          </div>
                        </div>
                        <ScoreRing value={score.score} size={32} stroke={4} />
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        <Button
                          size="sm"
                          variant="primary"
                          className="!px-2 !py-1 !text-[10px]"
                          onClick={() => raiseEscalation(dept)}
                          disabled={escalating === dept.id}
                        >
                          <Mail className="h-3 w-3" /> Escalate
                        </Button>
                        <Button
                          size="sm"
                          className="!px-2 !py-1 !text-[10px]"
                          onClick={() => {
                            setFilters({ departmentId: dept.id });
                            onNavigate('calendar');
                          }}
                        >
                          Review calendar
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Workload outliers" subtitle="Utilization against country-aware capacity" />
            <div className="mt-2 divide-y divide-slate-100">
              {overloaded.slice(0, 3).map(({ employee, score }) => (
                <button
                  key={employee.id}
                  onClick={() => onOpenEmployee(employee.id)}
                  className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50"
                >
                  <Avatar name={employee.name} color={employee.avatarColor} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-slate-800">{employee.name}</div>
                    <div className="text-[10px] text-slate-400">{deptMap.get(employee.departmentId)?.code} · over capacity</div>
                  </div>
                  <Badge tone="danger">{score.utilization}%</Badge>
                </button>
              ))}
              {idle.slice(0, 3).map(({ employee, score }) => (
                <button
                  key={employee.id}
                  onClick={() => onOpenEmployee(employee.id)}
                  className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50"
                >
                  <Avatar name={employee.name} color={employee.avatarColor} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-slate-800">{employee.name}</div>
                    <div className="text-[10px] text-slate-400">{deptMap.get(employee.departmentId)?.code} · low logged effort</div>
                  </div>
                  <Badge tone="warn">{score.utilization}%</Badge>
                </button>
              ))}
              {overloaded.length === 0 && idle.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-slate-400">Workload balanced across the team.</p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Today + workload bars */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader
              title={`Today across ${entityScopeName}`}
              subtitle={`${todaysActivities.length} activities · ${humanHours(todaysActivities.reduce((a, b) => a + b.plannedHours, 0))} planned on ${prettyDate(today)}`}
              action={
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('calendar')}>
                    Calendar <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="primary" onClick={onNewActivity}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
              }
            />
          </div>
          <div className="mt-2 max-h-[360px] overflow-y-auto px-2 pb-3">
            {todaysActivities.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="Nobody scheduled for today"
                  description="Either the team is on a public holiday / weekly off, or the plan has not been entered yet."
                  action={<Button size="sm" onClick={onNewActivity}>Schedule an activity</Button>}
                />
              </div>
            ) : (
              todaysActivities.map((a) => (
                <ActivityLine
                  key={a.id}
                  activity={a}
                  showDate={false}
                  employeeName={empMap.get(a.assigneeId)?.name}
                  departmentCode={deptMap.get(a.departmentId)?.code}
                  departmentColor={deptMap.get(a.departmentId)?.color}
                  onOpen={() => onOpenActivity(a.id)}
                />
              ))
            )}
          </div>
        </Card>

        <div className="space-y-3">
          <Card>
            <SectionHeader title="Logged effort by department" subtitle="Hours recorded in the selected period" />
            <div className="mt-3">
              <BarList
                items={deptScores
                  .slice()
                  .sort((a, b) => b.loggedHours - a.loggedHours)
                  .slice(0, 6)
                  .map((s) => ({
                    label: deptMap.get(s.departmentId)?.name ?? '',
                    value: s.loggedHours,
                    color: deptMap.get(s.departmentId)?.color,
                    sublabel: `${s.utilization}%`,
                  }))}
                formatter={(v) => `${v}h`}
              />
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="Calendar sync health"
              subtitle="Outlook (Graph) and Google Calendar connectors"
              action={
                <button onClick={() => onNavigate('integrations')} className="text-[11px] font-medium text-brand-600 hover:text-brand-700">
                  Manage
                </button>
              }
            />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-sky-50/70 px-2 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-sky-700/70">Outlook</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-sky-800">{outlook}</div>
                <div className="text-[9px] text-sky-600/70">connected</div>
              </div>
              <div className="rounded-lg bg-emerald-50/70 px-2 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-700/70">Google</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-800">{google}</div>
                <div className="text-[9px] text-emerald-600/70">connected</div>
              </div>
              <div className="rounded-lg bg-rose-50/70 px-2 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-rose-700/70">Failed</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-rose-800">{failedSyncs}</div>
                <div className="text-[9px] text-rose-600/70">need retry</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Last queue run
              </span>
              <span>{state.syncJobs[0] ? new Date(state.syncJobs[0].at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            </div>
          </Card>

          <Card>
            <SectionHeader title="Activity mix this period" subtitle="By type" />
            <div className="mt-2 space-y-1.5">
              {mix.slice(0, 5).map((m) => (
                <div key={m.type} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded" style={{ background: `${TYPE_COLORS[m.type].solid}1a`, color: TYPE_COLORS[m.type].solid }}>
                    <TypeIcon type={m.type} className="h-3 w-3" />
                  </span>
                  <span className="flex-1 text-[11px] text-slate-600">{TYPE_LABELS[m.type]}</span>
                  <span className="text-[10px] tabular-nums text-slate-400">{m.count}</span>
                  <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-slate-700">{Math.round(m.hours)}h</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
