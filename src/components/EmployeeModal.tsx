import React, { useMemo } from 'react';
import { addDays, format, startOfWeek } from 'date-fns';
import {
  Briefcase,
  CalendarCheck2,
  CalendarDays,
  CalendarX2,
  Clock3,
  Mail,
  MapPin,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useStore } from '../store';
import type { Activity } from '../types';
import { capacityHoursFor, employeeScore, scoreSeries, workloadBand } from '../lib/analytics';
import { canLogForEmployee, employeeTitle, ROLE_LABELS } from '../lib/permissions';
import { fromISO, humanHours, toISO } from '../lib/dates';
import { Avatar, Badge, Button, Modal, Progress, SectionHeader } from './ui';
import { LEAVE_TYPE_SHORT, leaveOnDate, nextResponsible, ptoSummary } from '../lib/leave';
import { ActivityLine, StatusBadge, SyncPips, TypeIcon, TYPE_COLORS } from './activity-ui';
import { HeatGrid, ScoreRing, Sparkline } from './charts';

export function EmployeeModal({
  employeeId,
  onClose,
  onOpenActivity,
  onNewActivity,
}: {
  employeeId: string | null;
  onClose: () => void;
  onOpenActivity: (id: string) => void;
  onNewActivity: () => void;
}) {
  const { state, scope, tenant } = useStore();
  const employee = state.employees.find((e) => e.id === employeeId);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const monthStart = new Date();
  monthStart.setDate(monthStart.getDate() - 27);

  const score = useMemo(
    () => (employee ? employeeScore(state, employee, toISO(weekStart), toISO(weekEnd)) : null),
    [employee, state, weekStart, weekEnd],
  );
  const monthScore = useMemo(
    () => (employee ? employeeScore(state, employee, toISO(monthStart), toISO(weekEnd)) : null),
    [employee, state, monthStart, weekEnd],
  );
  const trend = useMemo(() => {
    if (!employee) return [];
    return Array.from({ length: 8 }, (_, i) => {
      const start = addDays(weekStart, (i - 7) * 7);
      return employeeScore(state, employee, toISO(start), toISO(addDays(start, 6))).loggedHours;
    });
  }, [employee, state, weekStart]);

  const activities = useMemo(
    () =>
      employee
        ? state.activities
            .filter((a) => a.assigneeId === employee.id)
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
        : [],
    [state.activities, employee],
  );
  const current = activities.filter((a) => a.endDate >= toISO(new Date()));
  const recent = activities.filter((a) => a.endDate < toISO(new Date())).reverse().slice(0, 4);

  const heatCells = useMemo(() => {
    if (!employee) return [];
    const cfg = state.countries.find((c) => c.code === employee.countryCode);
    const cells = [];
    for (let i = 27; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const iso = toISO(d);
      const entries = state.timeEntries.filter((t) => t.employeeId === employee.id && t.date === iso);
      const holiday = state.holidays.find((h) => h.countryCode === employee.countryCode && h.date === iso && h.type !== 'weekly_off');
      cells.push({
        iso,
        day: d.getDate(),
        value: entries.reduce((a, b) => a + b.hours, 0),
        isWeekend: cfg?.weeklyOff.includes(d.getDay()) ?? false,
        holiday: holiday ?? null,
        entries: entries.length,
      });
    }
    return cells;
  }, [employee, state.timeEntries, state.holidays, state.countries]);

  if (!employee) return null;

  const dept = state.departments.find((d) => d.id === employee.departmentId);
  const entity = state.entities.find((e) => e.id === employee.entityId);
  const manager = state.employees.find((e) => e.id === employee.managerId);
  const connections = state.connections.filter((c) => c.employeeId === employee.id);
  const capacity = capacityHoursFor(employee, toISO(weekStart), toISO(weekEnd), state.holidays, state.countries);
  const band = workloadBand(score?.utilization ?? 0);
  const pto = ptoSummary(state, employee, tenant, new Date().getFullYear());
  const todayISO = toISO(new Date());
  const leaveToday = leaveOnDate(state, employee.id, todayISO);
  const cover = nextResponsible(state, employee.id, todayISO);
  const canReview = scope.visibleEmployeeIds.includes(employee.id);
  const canSchedule = canLogForEmployee(state, scope.user.id, employee.id);

  return (
    <Modal
      open
      onClose={onClose}
      title="Employee 360"
      subtitle={canReview ? 'You can review this calendar because of your role or reporting line.' : 'Limited view'}
      width="max-w-4xl"
      footer={
        <>
          <Button size="sm" onClick={onClose}>Close</Button>
          {canSchedule ? (
            <Button size="sm" variant="primary" onClick={onNewActivity}>
              <CalendarDays className="h-3.5 w-3.5" /> Schedule for {employee.name.split(' ')[0]}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
          <Avatar name={employee.name} color={employee.avatarColor} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-base font-semibold text-slate-900">{employee.name}</h3>
              <Badge tone={employee.role === 'ceo' ? 'purple' : 'brand'}>{employeeTitle(employee)}</Badge>
              <Badge tone="neutral">{ROLE_LABELS[employee.role]} access</Badge>
              <Badge tone={employee.status === 'active' ? 'good' : 'warn'}>{employee.status.replace('_', ' ')}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-slate-500">
              <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {dept?.name} · {entity?.code}</span>
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Reports to {manager?.name ?? '—'}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {state.countries.find((c) => c.code === employee.countryCode)?.name}</span>
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {employee.email}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {connections.map((c) => (
                <Badge key={c.id} tone={c.status === 'connected' ? 'good' : 'neutral'}>
                  {c.status === 'connected' ? <CalendarCheck2 className="h-2.5 w-2.5" /> : <CalendarX2 className="h-2.5 w-2.5" />}
                  {c.provider === 'outlook' ? 'Outlook' : 'Google'} · {c.status}
                </Badge>
              ))}
              {employee.employmentType === 'contractor' ? <Badge tone="warn">Contractor</Badge> : null}
              {employee.workLocation === 'remote' ? <Badge tone="info">Remote</Badge> : employee.workLocation === 'hybrid' ? <Badge tone="neutral">Hybrid</Badge> : employee.workLocation === 'on_site' ? <Badge tone="neutral">On site</Badge> : null}
              <Badge tone="neutral">{employee.weeklyHours}h/week contracted</Badge>
              <Badge tone="neutral">Joined {employee.joinDate}</Badge>
            </div>
            {employee.leadershipPortfolio || employee.collaborationNotes ? (
              <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                {employee.leadershipPortfolio ? <p><span className="font-semibold text-slate-600">Leadership portfolio:</span> {employee.leadershipPortfolio}</p> : null}
                {employee.collaborationNotes ? <p><span className="font-semibold text-slate-600">Cross-functional:</span> {employee.collaborationNotes}</p> : null}
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wider text-slate-400">Week score</div>
              <div className="mt-1 flex items-center justify-center">
                <ScoreRing value={score?.score ?? 0} size={44} stroke={5} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wider text-slate-400">Utilization</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{score?.utilization ?? 0}%</div>
              <div className="text-[9px] text-slate-400">{band.label}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {[
            { label: 'Planned this week', value: humanHours(score?.plannedHours ?? 0), icon: <CalendarDays className="h-3.5 w-3.5" /> },
            { label: 'Logged this week', value: humanHours(score?.loggedHours ?? 0), icon: <Clock3 className="h-3.5 w-3.5" /> },
            { label: 'Capacity', value: humanHours(capacity), icon: <TrendingUp className="h-3.5 w-3.5" /> },
            { label: '4-week score', value: `${monthScore?.score ?? 0}`, icon: <ShieldCheck className="h-3.5 w-3.5" /> },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-slate-400">
                {s.icon} {s.label}
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <SectionHeader title="Logged effort — last 4 weeks" subtitle="Click a day to see the detail in Timesheets" />
            <div className="mt-2">
              <HeatGrid cells={heatCells} columns={7} cellSize={34} />
            </div>
            <div className="mt-2 rounded-lg border border-slate-200 p-2">
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Weekly logged hours</span>
                <span className="font-medium text-slate-700">{humanHours(trend[trend.length - 1] ?? 0)}</span>
              </div>
              <Sparkline data={trend} color="#3a63f0" height={38} />
              <div className="flex justify-between text-[8px] text-slate-400">
                <span>8 weeks ago</span>
                <span>this week</span>
              </div>
            </div>
          </div>

          <div>
            <SectionHeader title="Current & upcoming activities" subtitle={`${current.length} items in the pipeline`} />
            <div className="mt-2 max-h-[220px] space-y-1 overflow-y-auto">
              {current.slice(0, 8).map((a) => (
                <ActivityLine
                  key={a.id}
                  activity={a}
                  departmentCode={dept?.code}
                  departmentColor={dept?.color}
                  onOpen={() => onOpenActivity(a.id)}
                  compact
                />
              ))}
              {current.length === 0 ? <p className="py-3 text-center text-[11px] text-slate-400">No upcoming activities.</p> : null}
            </div>
            <div className="mt-3">
              <SectionHeader title="Time distribution by activity" subtitle="Last 4 weeks" />
              <div className="mt-2 space-y-1.5">
                {(() => {
                  const map = new Map<string, { title: string; hours: number; type: Activity['type'] }>();
                  state.timeEntries
                    .filter((t) => t.employeeId === employee.id && t.date >= toISO(monthStart))
                    .forEach((t) => {
                      const act = state.activities.find((a) => a.id === t.activityId);
                      if (!act) return;
                      const cur = map.get(act.id) ?? { title: act.title, hours: 0, type: act.type };
                      cur.hours += t.hours;
                      map.set(act.id, cur);
                    });
                  const list = Array.from(map.values()).sort((a, b) => b.hours - a.hours).slice(0, 5);
                  const max = Math.max(...list.map((l) => l.hours), 1);
                  return list.map((l) => (
                    <div key={l.title} className="flex items-center gap-2">
                      <span className="flex h-5 w-5 flex-none items-center justify-center rounded" style={{ background: `${TYPE_COLORS[l.type].solid}1a`, color: TYPE_COLORS[l.type].solid }}>
                        <TypeIcon type={l.type} className="h-3 w-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] text-slate-700">{l.title}</span>
                        <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-slate-100">
                          <span className="block h-full rounded-full bg-brand-400" style={{ width: `${(l.hours / max) * 100}%` }} />
                        </span>
                      </span>
                      <span className="flex-none text-[10px] font-semibold tabular-nums text-slate-600">{l.hours}h</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>

        <div>
          <SectionHeader title="Leave, PTO & public holidays" subtitle="Approved PTO is on every calendar in the tenant; public holidays are excluded" />
          <div className="mt-1.5 grid gap-2 text-[11px] sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-wider text-slate-400">PTO remaining</div>
              <div className="font-semibold tabular-nums text-slate-900">{pto.remainingPtoHours}h</div>
              <div className="text-[9px] text-slate-500">of {pto.entitlementHours}h</div>
            </div>
            <div className="rounded-lg bg-violet-50 px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-wider text-violet-500">Approved PTO</div>
              <div className="font-semibold tabular-nums text-violet-800">{pto.approvedPtoHours}h</div>
              <div className="text-[9px] text-violet-600">{pto.approvedRequests} request(s)</div>
            </div>
            <div className="rounded-lg bg-amber-50 px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-wider text-amber-600">Pending</div>
              <div className="font-semibold tabular-nums text-amber-800">{pto.pendingPtoHours}h</div>
              <div className="text-[9px] text-amber-700">{pto.pendingRequests} tentative</div>
            </div>
            <div className="rounded-lg bg-rose-50 px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-wider text-rose-500">PH excluded</div>
              <div className="font-semibold tabular-nums text-rose-800">{pto.publicHolidayHoursExcluded}h</div>
              <div className="text-[9px] text-rose-600">never PTO</div>
            </div>
          </div>
          {leaveToday ? (
            <p className="mt-1.5 rounded bg-violet-50 px-2 py-1 text-[10px] text-violet-700">
              On {LEAVE_TYPE_SHORT[leaveToday.type]} now ({leaveToday.startDate} → {leaveToday.endDate}). Next responsible:{' '}
              <span className="font-semibold">{cover?.employee.name ?? 'department head'}</span>
              {cover ? ` (${cover.reason})` : ''}.
            </p>
          ) : pto.upcomingLeave ? (
            <p className="mt-1.5 text-[10px] text-slate-500">
              Next leave: {LEAVE_TYPE_SHORT[pto.upcomingLeave.type]} {pto.upcomingLeave.startDate} → {pto.upcomingLeave.endDate} ({pto.upcomingLeave.hours}h
              PTO{pto.upcomingLeave.publicHolidayDays ? `, ${pto.upcomingLeave.publicHolidayDays} PH excluded` : ''}).
            </p>
          ) : null}
        </div>

        <div>
          <SectionHeader title="Recent completions" subtitle="Delivered items in the last weeks" />
          <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
            {recent.map((a) => (
              <button key={a.id} onClick={() => onOpenActivity(a.id)} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-left hover:border-slate-200 hover:bg-slate-50">
                <StatusBadge status={a.status} />
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-700">{a.title}</span>
                <span className="flex-none text-[9px] text-slate-400">{a.endDate}</span>
                <SyncPips activity={a} />
              </button>
            ))}
            {recent.length === 0 ? <p className="text-[11px] text-slate-400">No completed activities yet.</p> : null}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-500" />
          Aggregated numbers are visible to the CEO and Head of Operations for portfolio reporting. Written notes and individual time entries remain
          restricted to the employee, their supervisor chain and the department head.
        </div>
      </div>
    </Modal>
  );
}
