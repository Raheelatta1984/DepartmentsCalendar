import React, { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Globe2,
  MapPin,
  Plus,
  Search,
  Users,
  Wand2,
} from 'lucide-react';
import { useStore } from '../store';
import type { AppFilters, TimeEntry } from '../types';
import { TYPE_LABELS, filterActivities, typeDistribution } from '../lib/analytics';
import { WEEKDAY_LABELS, buildDayMeta, fromISO, humanHours, monthName, toISO } from '../lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, IconButton, PageHeader, Progress, SectionHeader, Select, Tabs } from '../components/ui';
import { ActivityLine, StatusBadge, SyncPips, TypeBadge, TypeIcon, TYPE_COLORS } from '../components/activity-ui';

type Mode = 'month' | 'week' | 'day';

export function CalendarPage({
  filters,
  setFilters,
  onOpenActivity,
  onNewActivity,
  onOpenEmployee,
}: {
  filters: AppFilters;
  setFilters: (patch: Partial<AppFilters>) => void;
  onOpenActivity: (id: string) => void;
  onNewActivity: () => void;
  onOpenEmployee: (id: string) => void;
}) {
  const { state, scope } = useStore();
  const [mode, setMode] = useState<Mode>('month');
  const [selectedDay, setSelectedDay] = useState<string>(toISO(new Date()));
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [showHolidays, setShowHolidays] = useState(true);

  const anchor = fromISO(filters.anchor);
  const deptMap = useMemo(() => new Map(state.departments.map((d) => [d.id, d])), [state.departments]);
  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);

  const people = useMemo(
    () =>
      state.employees
        .filter((e) => scope.visibleEmployeeIds.includes(e.id))
        .filter((e) => filters.departmentId === 'all' || e.departmentId === filters.departmentId)
        .filter((e) => (filters.employeeId === 'all' ? true : e.id === filters.employeeId))
        .filter((e) => (peopleQuery ? `${e.name} ${e.code} ${e.email}`.toLowerCase().includes(peopleQuery.toLowerCase()) : true))
        .sort((a, b) => {
          const da = deptMap.get(a.departmentId)?.name ?? '';
          const db = deptMap.get(b.departmentId)?.name ?? '';
          return da.localeCompare(db) || a.name.localeCompare(b.name);
        }),
    [state.employees, scope.visibleEmployeeIds, filters.departmentId, filters.employeeId, peopleQuery, deptMap],
  );
  const peopleIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);

  const gridRange = useMemo(() => {
    if (mode === 'day') return { start: anchor, end: anchor };
    if (mode === 'week') {
      return {
        start: startOfWeek(anchor, { weekStartsOn: Number(state.settings.weekStartsOn) as 0 | 1 | 6 }),
        end: endOfWeek(anchor, { weekStartsOn: Number(state.settings.weekStartsOn) as 0 | 1 | 6 }),
      };
    }
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    return {
      start: startOfWeek(monthStart, { weekStartsOn: Number(state.settings.weekStartsOn) as 0 | 1 | 6 }),
      end: endOfWeek(monthEnd, { weekStartsOn: Number(state.settings.weekStartsOn) as 0 | 1 | 6 }),
    };
  }, [anchor, mode, state.settings.weekStartsOn]);

  const selectedEmp = filters.employeeId !== 'all' ? empMap.get(filters.employeeId) : undefined;
  const countryCode = selectedEmp?.countryCode;
  const scopeCountries = useMemo(() => new Set(people.map((p) => p.countryCode)), [people]);
  const countryHolidays = useMemo(
    () =>
      state.holidays.filter(
        (h) =>
          h.type !== 'weekly_off' &&
          (countryCode ? h.countryCode === countryCode : scopeCountries.has(h.countryCode)),
      ),
    [state.holidays, countryCode, scopeCountries],
  );

  const days = useMemo(
    () =>
      buildDayMeta(
        gridRange.start,
        gridRange.end,
        [0, 6],
        showHolidays ? countryHolidays : [],
        countryCode,
      ),
    [gridRange, countryHolidays, showHolidays, countryCode],
  );

  const activitiesInGrid = useMemo(
    () =>
      filterActivities(state, {
        employeeIds: Array.from(peopleIds),
        start: toISO(gridRange.start),
        end: toISO(gridRange.end),
        type: typeFilter === 'all' ? 'all' : (typeFilter as never),
      }),
    [state, peopleIds, gridRange, typeFilter],
  );

  const activityDays = useMemo(() => {
    const map = new Map<string, typeof activitiesInGrid>();
    activitiesInGrid.forEach((a) => {
      let cursor = fromISO(a.startDate) < gridRange.start ? gridRange.start : fromISO(a.startDate);
      const last = fromISO(a.endDate) > gridRange.end ? gridRange.end : fromISO(a.endDate);
      while (cursor <= last) {
        const key = toISO(cursor);
        const list = map.get(key) ?? [];
        list.push(a);
        map.set(key, list);
        cursor = addDays(cursor, 1);
      }
    });
    return map;
  }, [activitiesInGrid, gridRange]);

  const entriesInGrid = useMemo(() => {
    const startISO = toISO(gridRange.start);
    const endISO = toISO(gridRange.end);
    return state.timeEntries.filter(
      (t) => peopleIds.has(t.employeeId) && t.date >= startISO && t.date <= endISO,
    );
  }, [state.timeEntries, peopleIds, gridRange]);

  const selectedActivities = (activityDays.get(selectedDay) ?? []).slice().sort((a, b) => (a.startTime ?? '23:59').localeCompare(b.startTime ?? '23:59'));
  const selectedEntries = state.timeEntries.filter((t) => t.date === selectedDay && peopleIds.has(t.employeeId));
  const loggedOnSelected = selectedEntries.reduce((a, b) => a + b.hours, 0);

  const holidayForDay = (iso: string) =>
    countryHolidays.find((h) => h.date === iso && (countryCode ? h.countryCode === countryCode : true));

  /** Multiple countries may share a date; label which country's calendar it is. */
  const holidayLabel = (holiday?: { name: string; countryCode: string }) =>
    holiday ? (countryCode ? holiday.name : `${holiday.name} (${holiday.countryCode})`) : '';

  const shift = (dir: -1 | 1) => {
    if (mode === 'day') setFilters({ anchor: toISO(addDays(anchor, dir)) });
    else if (mode === 'week') setFilters({ anchor: toISO(addDays(anchor, dir * 7)) });
    else setFilters({ anchor: toISO(addMonths(anchor, dir)) });
  };

  const monthGrid = useMemo(() => {
    const cells = [];
    for (let i = 0; i < days.length; i += 7) cells.push(days.slice(i, i + 7));
    return cells;
  }, [days]);

  const workloadByDay = useMemo(() => {
    const map = new Map<string, number>();
    const entriesByEmpDay = new Map<string, number>();
    entriesInGrid.forEach((t) => {
      entriesByEmpDay.set(`${t.employeeId}|${t.date}`, (entriesByEmpDay.get(`${t.employeeId}|${t.date}`) ?? 0) + t.hours);
    });
    entriesByEmpDay.forEach((v, k) => {
      const day = k.split('|')[1];
      map.set(day, (map.get(day) ?? 0) + v);
    });
    return map;
  }, [entriesInGrid]);

  const empUtil = (employeeId: string) => {
    const emp = empMap.get(employeeId);
    if (!emp) return { planned: 0, logged: 0, pct: 0 };
    const planned = activitiesInGrid.filter((a) => a.assigneeId === employeeId).reduce((s, a) => s + a.plannedHours, 0);
    const logged = entriesInGrid.filter((t) => t.employeeId === employeeId).reduce((s, t) => s + t.hours, 0);
    const capacity = emp.weeklyHours * (mode === 'week' ? 1 : mode === 'day' ? 0.2 : 4.3);
    return { planned, logged, pct: Math.round((logged / Math.max(1, capacity)) * 100) };
  };

  const dayTotalHours = (iso: string) => {
    const acts = activityDays.get(iso) ?? [];
    return acts.reduce((sum, a) => sum + a.plannedHours / Math.max(1, daysBetween(a.startDate, a.endDate)), 0);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Central calendar"
        title="Department & employee calendar"
        description="One shared calendar per department, per employee and per entity. Managers can open any report's calendar, compare against approved timesheets and spot clashes instantly."
        actions={
          <>
            <Button size="sm" onClick={() => setFilters({ anchor: toISO(new Date()), employeeId: 'all', departmentId: 'all' })}>
              Today
            </Button>
            <Button size="sm" variant="primary" onClick={onNewActivity}>
              <Plus className="h-3.5 w-3.5" /> New activity
            </Button>
          </>
        }
      />

      <Card className="mb-3 !py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[150px] text-center text-xs font-semibold text-slate-800">
              {mode === 'day' ? format(anchor, 'EEE dd MMM yyyy') : mode === 'week' ? `Week of ${format(gridRange.start, 'dd MMM yyyy')}` : monthName(anchor)}
            </span>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Tabs<Mode>
            tabs={[
              { id: 'month', label: 'Month' },
              { id: 'week', label: 'Team week' },
              { id: 'day', label: 'Day' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setSelectedDay(toISO(anchor));
            }}
          />
          <div className="min-w-[170px]">
            <Select value={filters.departmentId} onChange={(e) => setFilters({ departmentId: e.target.value, employeeId: 'all' })}>
              <option value="all">All departments</option>
              {scope.visibleDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[190px]">
            <Select value={filters.employeeId} onChange={(e) => setFilters({ employeeId: e.target.value })}>
              <option value="all">Everyone in scope ({people.length})</option>
              {state.employees
                .filter((e) => scope.visibleEmployeeIds.includes(e.id) && (filters.departmentId === 'all' || e.departmentId === filters.departmentId))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {deptMap.get(e.departmentId)?.code}
                  </option>
                ))}
            </Select>
          </div>
          <div className="min-w-[150px]">
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All activity types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <button
            onClick={() => setShowHolidays((v) => !v)}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              showHolidays ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" />
            {showHolidays ? 'Public holidays on' : 'Holidays hidden'}
          </button>
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
        <Card padded={false} className="overflow-hidden">
          {mode === 'month' ? (
            <div>
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
                {WEEKDAY_LABELS.map((d, i) => (
                  <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {d}
                    {i === 0 || i === 6 ? '' : ''}
                  </div>
                ))}
              </div>
              <div>
                {monthGrid.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
                    {week.map((day) => {
                      const holiday = holidayForDay(day.iso);
                      const acts = activityDays.get(day.iso) ?? [];
                      const inMonth = day.date.getMonth() === anchor.getMonth();
                      const totalHours = acts.reduce((s, a) => s + a.plannedHours / Math.max(1, daysBetween(a.startDate, a.endDate)), 0);
                      return (
                        <div
                          key={day.iso}
                          onClick={() => setSelectedDay(day.iso)}
                          className={`min-h-[112px] cursor-pointer border-r border-slate-100 p-1.5 transition-colors last:border-r-0 ${
                            selectedDay === day.iso ? 'bg-brand-50/60 ring-1 ring-inset ring-brand-300' : 'hover:bg-slate-50/70'
                          } ${!inMonth ? 'bg-slate-50/40' : ''}`}
                        >
                          <div className="mb-1 flex items-start justify-between">
                            <span
                              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                                day.iso === toISO(new Date())
                                  ? 'bg-brand-600 text-white'
                                  : inMonth
                                    ? 'text-slate-700'
                                    : 'text-slate-300'
                              }`}
                            >
                              {day.date.getDate()}
                            </span>
                            {totalHours > 0 ? (
                              <span className="text-[9px] font-medium tabular-nums text-slate-400">{Math.round(totalHours)}h</span>
                            ) : null}
                          </div>
                          {holiday ? (
                            <div className="mb-1 truncate rounded bg-rose-50 px-1 py-0.5 text-[9px] font-medium text-rose-600" title={holidayLabel(holiday)}>
                              {holidayLabel(holiday)}
                            </div>
                          ) : null}
                          {day.isWeekend && !holiday ? (
                            <div className="mb-1 truncate rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-400">Weekly off</div>
                          ) : null}
                          <div className="space-y-0.5">
                            {acts.slice(0, 3).map((a) => {
                              const dept = deptMap.get(a.departmentId);
                              return (
                                <button
                                  key={`${day.iso}-${a.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenActivity(a.id);
                                  }}
                                  title={`${a.title} · ${empMap.get(a.assigneeId)?.name} · ${a.plannedHours}h`}
                                  className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[9.5px] font-medium hover:brightness-95"
                                  style={{ background: `${dept?.color ?? '#3b82f6'}14`, color: dept?.color ?? '#3b82f6' }}
                                >
                                  <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: dept?.color ?? '#3b82f6' }} />
                                  <span className="truncate">{a.title}</span>
                                </button>
                              );
                            })}
                            {acts.length > 3 ? (
                              <div className="pl-1 text-[9px] font-medium text-slate-400">+{acts.length - 3} more</div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {mode === 'week' ? (
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="sticky top-0 z-10 grid border-b border-slate-200 bg-slate-50/95" style={{ gridTemplateColumns: '180px repeat(7, minmax(0,1fr))' }}>
                  <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Employee</div>
                  {days.slice(0, 7).map((d) => {
                    const holiday = holidayForDay(d.iso);
                    return (
                      <div key={d.iso} className={`border-l border-slate-200 px-1.5 py-1.5 text-center ${holiday ? 'bg-rose-50/70' : ''}`}>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{format(d.date, 'EEE')}</div>
                        <div className="text-xs font-semibold text-slate-800">{format(d.date, 'dd MMM')}</div>
                        <div className="truncate text-[9px] text-rose-500" title={holidayLabel(holiday)}>{holiday ? holidayLabel(holiday) : d.isWeekend ? 'weekly off' : ''}</div>
                        <div className="mt-0.5 text-[9px] text-slate-400">{workloadByDay.get(d.iso) ?? 0}h logged</div>
                      </div>
                    );
                  })}
                </div>
                <div className="max-h-[560px] overflow-y-auto">
                  {people.map((emp) => {
                    const util = empUtil(emp.id);
                    return (
                      <div
                        key={emp.id}
                        className="grid border-b border-slate-100 hover:bg-slate-50/40"
                        style={{ gridTemplateColumns: '180px repeat(7, minmax(0,1fr))' }}
                      >
                        <div className="sticky left-0 z-[5] flex items-center gap-2 bg-white/95 px-2 py-2 backdrop-blur">
                          <Avatar name={emp.name} color={emp.avatarColor} size={24} />
                          <div className="min-w-0 flex-1">
                            <button onClick={() => onOpenEmployee(emp.id)} className="block w-full truncate text-left text-[11px] font-medium text-slate-800 hover:text-brand-700">
                              {emp.name}
                            </button>
                            <div className="truncate text-[9px] text-slate-400">
                              {deptMap.get(emp.departmentId)?.code} · {emp.role.replace('_', ' ')}
                            </div>
                          </div>
                          <span
                            className={`rounded px-1 py-0.5 text-[9px] font-semibold ${
                              util.pct > 110 ? 'bg-rose-50 text-rose-600' : util.pct < 50 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {util.pct}%
                          </span>
                        </div>
                        {days.slice(0, 7).map((d) => {
                          const acts = (activityDays.get(d.iso) ?? []).filter((a) => a.assigneeId === emp.id);
                          const holiday = holidayForDay(d.iso);
                          return (
                            <div
                              key={`${emp.id}-${d.iso}`}
                              onClick={() => setSelectedDay(d.iso)}
                              className={`min-h-[58px] cursor-pointer space-y-0.5 border-l border-slate-100 p-1 ${holiday ? 'bg-rose-50/40' : d.isWeekend ? 'bg-slate-50/60' : ''}`}
                            >
                              {acts.slice(0, 3).map((a) => (
                                <button
                                  key={a.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenActivity(a.id);
                                  }}
                                  className="block w-full truncate rounded px-1 py-0.5 text-left text-[9px] font-medium leading-tight hover:brightness-95"
                                  style={{ background: `${deptMap.get(a.departmentId)?.color}18`, color: deptMap.get(a.departmentId)?.color }}
                                  title={`${a.title} · ${a.status} · ${a.plannedHours}h`}
                                >
                                  <span className="mr-0.5 opacity-70">{a.startTime ?? '·'}</span>
                                  {a.title}
                                </button>
                              ))}
                              {acts.length > 3 ? <div className="pl-1 text-[8px] text-slate-400">+{acts.length - 3}</div> : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {people.length === 0 ? (
                    <div className="p-6">
                      <EmptyState title="No people match this filter" description="Widen the department filter or clear the employee selection." />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {mode === 'day' ? (
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-3 py-2">
                <div className="text-xs font-semibold text-slate-700">{format(anchor, 'EEEE dd MMMM yyyy')}</div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span>{selectedActivities.length} activities</span>
                  <span>·</span>
                  <span>{loggedOnSelected}h logged</span>
                  {holidayForDay(toISO(anchor)) ? <Badge tone="danger">{holidayLabel(holidayForDay(toISO(anchor)))}</Badge> : null}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {people.map((emp) => {
                  const acts = (activityDays.get(toISO(anchor)) ?? [])
                    .filter((a) => a.assigneeId === emp.id)
                    .sort((a, b) => (a.startTime ?? '23:59').localeCompare(b.startTime ?? '23:59'));
                  if (!acts.length) return null;
                  const util = empUtil(emp.id);
                  return (
                    <div key={emp.id} className="p-2.5">
                      <div className="mb-1.5 flex items-center gap-2">
                        <Avatar name={emp.name} color={emp.avatarColor} size={22} />
                        <button onClick={() => onOpenEmployee(emp.id)} className="text-[11px] font-semibold text-slate-800 hover:text-brand-700">
                          {emp.name}
                        </button>
                        <span className="text-[10px] text-slate-400">{deptMap.get(emp.departmentId)?.name}</span>
                        <Badge tone={util.pct > 110 ? 'danger' : 'neutral'}>{util.pct}% of weekly capacity</Badge>
                      </div>
                      <div className="space-y-1 pl-7">
                        {acts.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => onOpenActivity(a.id)}
                            className="flex w-full items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-left hover:border-slate-200 hover:bg-slate-50"
                          >
                            <span className="w-20 flex-none text-[10px] font-medium tabular-nums text-slate-500">
                              {a.startTime ? `${a.startTime}–${a.endTime}` : 'All day'}
                            </span>
                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded" style={{ background: `${deptMap.get(a.departmentId)?.color}18`, color: deptMap.get(a.departmentId)?.color }}>
                              <TypeIcon type={a.type} className="h-3 w-3" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-800">{a.title}</span>
                            <span className="hidden text-[9px] text-slate-400 sm:block">{a.plannedHours}h</span>
                            <StatusBadge status={a.status} />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {(activityDays.get(toISO(anchor)) ?? []).length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={<CalendarDays className="h-5 w-5" />}
                      title={holidayForDay(toISO(anchor)) ? 'Public holiday — no activities' : 'Nothing scheduled for this day'}
                      description={holidayLabel(holidayForDay(toISO(anchor))) || 'Add an activity or move to another day.'}
                      action={<Button size="sm" onClick={onNewActivity}>Schedule activity</Button>}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        {/* Right rail */}
        <div className="space-y-3">
          <Card>
            <SectionHeader
              title={selectedDay === toISO(new Date()) ? 'Today' : format(fromISO(selectedDay), 'EEE dd MMM')}
              subtitle={`${selectedActivities.length} activities · ${loggedOnSelected}h logged`}
              action={<Badge tone="brand">{holidayForDay(selectedDay) ? 'holiday' : `${humanHours(selectedActivities.reduce((a, b) => a + b.plannedHours, 0))} plan`}</Badge>}
            />
            {holidayForDay(selectedDay) ? (
              <div className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
                <Globe2 className="mr-1 inline h-3 w-3" />
                {holidayForDay(selectedDay)?.name} — marked as a public holiday in {holidayForDay(selectedDay)?.countryCode}.
              </div>
            ) : null}
            <div className="mt-2 max-h-[300px] space-y-1 overflow-y-auto">
              {selectedActivities.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-slate-400">No activities on this day.</p>
              ) : (
                selectedActivities.map((a) => (
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
            {selectedEntries.length ? (
              <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Timesheet on this day</div>
                <div className="space-y-1">
                  {selectedEntries.slice(0, 4).map((t) => {
                    const act = state.activities.find((a) => a.id === t.activityId);
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="truncate text-slate-600">{act?.title ?? 'General work'}</span>
                        <span className="flex-none font-medium tabular-nums text-slate-800">{t.hours}h</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <SectionHeader
              title="Review an employee"
              subtitle="Supervisors see their reporting line, heads see the department"
              action={<Users className="h-4 w-4 text-slate-300" />}
            />
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                placeholder="Find a person"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div className="mt-2 max-h-[260px] space-y-0.5 overflow-y-auto">
              {people.slice(0, 40).map((emp) => {
                const util = empUtil(emp.id);
                return (
                  <button
                    key={emp.id}
                    onClick={() => {
                      setFilters({ employeeId: emp.id });
                      onOpenEmployee(emp.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-50"
                  >
                    <Avatar name={emp.name} color={emp.avatarColor} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-slate-800">{emp.name}</span>
                      <span className="block truncate text-[9px] text-slate-400">
                        {deptMap.get(emp.departmentId)?.code} · {emp.role.replace('_', ' ')}
                      </span>
                    </span>
                    <span className={`text-[9px] font-semibold tabular-nums ${util.pct > 110 ? 'text-rose-600' : util.pct < 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {util.pct}%
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="Upcoming non-working days"
              subtitle={countryCode ? `Country calendar · ${countryCode}` : 'All countries represented in scope'}
              action={<Globe2 className="h-4 w-4 text-slate-300" />}
            />
            <div className="mt-2 space-y-1">
              {countryHolidays
                .filter((h) => h.date >= toISO(new Date()))
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, 6)
                .map((h) => (
                  <div key={h.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50">
                    <div className="flex h-7 w-7 flex-none flex-col items-center justify-center rounded bg-rose-50 text-rose-600">
                      <span className="text-[10px] font-bold leading-none">{format(fromISO(h.date), 'dd')}</span>
                      <span className="text-[7px] uppercase leading-none">{format(fromISO(h.date), 'MMM')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-slate-700">{h.name}</div>
                      <div className="text-[9px] text-slate-400">
                        {h.countryCode} · {format(fromISO(h.date), 'EEEE')}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            <Button size="sm" variant="ghost" className="mt-1 w-full !justify-start !text-[10px]" onClick={() => setFilters({ anchor: toISO(new Date()) })}>
              <Filter className="h-3 w-3" /> Holiday calendars are configurable in Master setup
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function daysBetween(a: string, b: string) {
  const start = fromISO(a) <= fromISO(b) ? fromISO(a) : fromISO(b);
  const end = fromISO(a) <= fromISO(b) ? fromISO(b) : fromISO(a);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
