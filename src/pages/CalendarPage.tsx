import React, { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  addQuarters,
  addYears,
  eachMonthOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Globe2, Plus, Search, Users } from 'lucide-react';
import { useStore } from '../store';
import type { Activity, AppFilters, Department, Holiday } from '../types';
import { TYPE_LABELS, filterActivities } from '../lib/analytics';
import { WEEKDAY_LABELS, buildDayMeta, fromISO, humanHours, isoWeek, monthName, quarterOf, toISO, type DayMeta } from '../lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, SectionHeader, Select, Tabs } from '../components/ui';
import { ActivityLine, StatusBadge, TypeIcon } from '../components/activity-ui';

type Mode = 'year' | 'quarter' | 'month' | 'week' | 'day';

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: 'year', label: 'Year' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
];

/** How many chips a day cell shows before it offers an inline “+N more”. */
const CELL_LIMIT: Record<'full' | 'dense', number> = { full: 4, dense: 3 };
/** How many chips an expanded cell renders before handing off to the day panel. */
const EXPAND_LIMIT = 12;

type MonthPanelData = { month: Date; weeks: DayMeta[][] };

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
  onNewActivity: (defaults?: Record<string, unknown>) => void;
  onOpenEmployee: (id: string) => void;
}) {
  const { state, scope } = useStore();
  /* The grain is also the shared period filter: Year → Quarter → Month →
     Week → Day, so the guide's live context and every other screen agree
     with the grid on show. The calendar opens on a month unless a coarser
     grain was already selected elsewhere. */
  const [mode, setModeState] = useState<Mode>(
    filters.period === 'year' || filters.period === 'quarter' ? filters.period : 'month',
  );
  const [selectedDay, setSelectedDay] = useState<string>(toISO(new Date()));
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [showHolidays, setShowHolidays] = useState(true);
  const [expandedCells, setExpandedCells] = useState<string[]>([]);

  const weekStartsOn = Number(state.settings.weekStartsOn) as 0 | 1 | 6;
  const anchor = fromISO(filters.anchor);
  const today = toISO(new Date());
  const deptMap = useMemo(() => new Map(state.departments.map((d) => [d.id, d])), [state.departments]);
  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);

  const setMode = (next: Mode) => {
    setModeState(next);
    setExpandedCells([]);
  };

  /* Keep the shared period in step with the grid the reader is looking at. */
  useEffect(() => {
    if (filters.period !== mode) setFilters({ period: mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
      return { start: startOfWeek(anchor, { weekStartsOn }), end: endOfWeek(anchor, { weekStartsOn }) };
    }
    if (mode === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    if (mode === 'quarter') return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
    return { start: startOfYear(anchor), end: endOfYear(anchor) };
  }, [anchor, mode, weekStartsOn]);

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
    () => buildDayMeta(gridRange.start, gridRange.end, [0, 6], showHolidays ? countryHolidays : [], countryCode),
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
    const map = new Map<string, Activity[]>();
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
    // A day can hold many activities: order them by start time so the cell
    // reads like a schedule, all-day items first.
    map.forEach((list) => list.sort((a, b) => (a.startTime ?? '00:00').localeCompare(b.startTime ?? '00:00')));
    return map;
  }, [activitiesInGrid, gridRange]);

  const entriesInGrid = useMemo(() => {
    const startISO = toISO(gridRange.start);
    const endISO = toISO(gridRange.end);
    return state.timeEntries.filter(
      (t) => peopleIds.has(t.employeeId) && t.date >= startISO && t.date <= endISO,
    );
  }, [state.timeEntries, peopleIds, gridRange]);

  const selectedActivities = (activityDays.get(selectedDay) ?? []).slice();
  const selectedEntries = state.timeEntries.filter((t) => t.date === selectedDay && peopleIds.has(t.employeeId));
  const loggedOnSelected = selectedEntries.reduce((a, b) => a + b.hours, 0);

  const holidayForDay = (iso: string) =>
    countryHolidays.find((h) => h.date === iso && (countryCode ? h.countryCode === countryCode : true));

  /** Multiple countries may share a date; label which country's calendar it is. */
  const holidayLabel = (holiday?: { name: string; countryCode: string }) =>
    holiday ? (countryCode ? holiday.name : `${holiday.name} (${holiday.countryCode})`) : '';

  const shift = (dir: -1 | 1) => {
    const next =
      mode === 'year'
        ? addYears(anchor, dir)
        : mode === 'quarter'
          ? addQuarters(anchor, dir)
          : mode === 'month'
            ? addMonths(anchor, dir)
            : mode === 'week'
              ? addDays(anchor, dir * 7)
              : addDays(anchor, dir);
    setFilters({ anchor: toISO(next) });
  };

  /* ---- Month panels: one for Month, three for Quarter, twelve for Year -- */
  const monthStarts = useMemo(() => {
    if (mode === 'year') return eachMonthOfInterval({ start: startOfYear(anchor), end: endOfYear(anchor) });
    if (mode === 'quarter') return eachMonthOfInterval({ start: startOfQuarter(anchor), end: endOfQuarter(anchor) });
    if (mode === 'month') return [startOfMonth(anchor)];
    return [];
  }, [mode, anchor]);

  const monthPanels = useMemo<MonthPanelData[]>(
    () =>
      monthStarts.map((month) => {
        const start = startOfWeek(startOfMonth(month), { weekStartsOn });
        const end = endOfWeek(endOfMonth(month), { weekStartsOn });
        const meta = buildDayMeta(start, end, [0, 6], showHolidays ? countryHolidays : [], countryCode);
        const weeks: DayMeta[][] = [];
        for (let i = 0; i < meta.length; i += 7) weeks.push(meta.slice(i, i + 7));
        return { month, weeks };
      }),
    [monthStarts, weekStartsOn, countryHolidays, showHolidays, countryCode],
  );

  const workloadByDay = useMemo(() => {
    const map = new Map<string, number>();
    entriesInGrid.forEach((t) => map.set(t.date, (map.get(t.date) ?? 0) + t.hours));
    return map;
  }, [entriesInGrid]);

  const plannedHoursOn = (iso: string) =>
    (activityDays.get(iso) ?? []).reduce((sum, a) => sum + a.plannedHours / Math.max(1, daysBetween(a.startDate, a.endDate)), 0);

  const empUtil = (employeeId: string) => {
    const emp = empMap.get(employeeId);
    if (!emp) return { planned: 0, logged: 0, pct: 0 };
    const planned = activitiesInGrid.filter((a) => a.assigneeId === employeeId).reduce((s, a) => s + a.plannedHours, 0);
    const logged = entriesInGrid.filter((t) => t.employeeId === employeeId).reduce((s, t) => s + t.hours, 0);
    const weekMultiplier = mode === 'year' ? 52 : mode === 'quarter' ? 13 : mode === 'month' ? 4.3 : mode === 'week' ? 1 : 0.2;
    const capacity = emp.weeklyHours * weekMultiplier;
    return { planned, logged, pct: Math.round((logged / Math.max(1, capacity)) * 100) };
  };

  const toggleCell = (key: string) =>
    setExpandedCells((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));

  const rangeLabel =
    mode === 'year'
      ? format(anchor, 'yyyy')
      : mode === 'quarter'
        ? `Q${quarterOf(anchor)} ${format(anchor, 'yyyy')}`
        : mode === 'month'
          ? monthName(anchor)
          : mode === 'week'
            ? `Week ${isoWeek(gridRange.start)} · ${format(gridRange.start, 'dd MMM')} – ${format(gridRange.end, 'dd MMM yyyy')}`
            : format(anchor, 'EEE dd MMM yyyy');

  /** New activity inherits the day on screen and whoever the filters point at. */
  const addOnDay = (iso: string) => {
    const person = filters.employeeId !== 'all' ? empMap.get(filters.employeeId) : undefined;
    const department = filters.departmentId !== 'all' ? deptMap.get(filters.departmentId) : undefined;
    const scopeDefaults = person
      ? { assigneeId: person.id, departmentId: person.departmentId, entityId: person.entityId }
      : department
        ? { departmentId: department.id, entityId: department.entityId }
        : {};
    onNewActivity({ startDate: iso, endDate: iso, ...scopeDefaults });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Central calendar"
        title="Department & employee calendar"
        description="One shared calendar per department, per person and per entity. Choose the grain — year, quarter, month, week or day — and every day cell holds as many activities as it needs, with an inline “+N more” instead of a hidden pile."
        actions={
          <>
            <Button size="sm" onClick={() => setFilters({ anchor: today, employeeId: 'all', departmentId: 'all' })}>
              Today
            </Button>
            <Button size="sm" variant="primary" onClick={() => addOnDay(selectedDay)}>
              <Plus className="h-3.5 w-3.5" /> New activity
            </Button>
          </>
        }
      />

      <Card className="mb-3 !py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => shift(-1)} aria-label="Previous period">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[190px] text-center text-xs font-semibold text-slate-800" aria-live="polite">
              {rangeLabel}
            </span>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => shift(1)} aria-label="Next period">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Tabs<Mode>
            tabs={MODE_TABS}
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
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
          <span>
            {activitiesInGrid.length} activities · {humanHours(activitiesInGrid.reduce((sum, a) => sum + a.plannedHours, 0))} planned
          </span>
          <span>{people.length} people in scope</span>
          <span>{mode === 'year' || mode === 'quarter' ? 'Click a day to read it in the day panel, or open the Day grain for the full schedule.' : 'Every cell shows every task; “+N more” expands a crowded day in place.'}</span>
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          {mode === 'year' ? (
            <Card padded={false} className="overflow-hidden">
              <div className="grid gap-2 bg-slate-50/60 p-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {monthPanels.map((panel) => (
                  <MonthGrid
                    key={toISO(panel.month)}
                    panel={panel}
                    variant="compact"
                    activityDays={activityDays}
                    selectedDay={selectedDay}
                    expandedCells={expandedCells}
                    onSelectDay={setSelectedDay}
                    onOpenDay={(iso) => {
                      setSelectedDay(iso);
                      setFilters({ anchor: iso });
                      setMode('day');
                    }}
                    onToggleCell={toggleCell}
                    onOpenActivity={onOpenActivity}
                    deptMap={deptMap}
                    holidayForDay={holidayForDay}
                    holidayLabel={holidayLabel}
                    today={today}
                    plannedHoursOn={plannedHoursOn}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-3 py-2 text-[10px] text-slate-500">
                <span>Twelve months at a glance. Dots are activities (3 per day max; the number badge is the day’s total).</span>
                <span>Double-click a day to open it in the Day grain.</span>
              </div>
            </Card>
          ) : null}

          {mode === 'quarter' ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {monthPanels.map((panel) => (
                <Card key={toISO(panel.month)} padded={false} className="overflow-hidden">
                  <MonthGrid
                    panel={panel}
                    variant="dense"
                    activityDays={activityDays}
                    selectedDay={selectedDay}
                    expandedCells={expandedCells}
                    onSelectDay={setSelectedDay}
                    onOpenDay={(iso) => {
                      setSelectedDay(iso);
                      setFilters({ anchor: iso });
                      setMode('day');
                    }}
                    onToggleCell={toggleCell}
                    onOpenActivity={onOpenActivity}
                    deptMap={deptMap}
                    holidayForDay={holidayForDay}
                    holidayLabel={holidayLabel}
                    today={today}
                    plannedHoursOn={plannedHoursOn}
                  />
                </Card>
              ))}
            </div>
          ) : null}

          {mode === 'month' ? (
            <Card padded={false} className="overflow-hidden">
              {monthPanels.map((panel) => (
                <MonthGrid
                  key={toISO(panel.month)}
                  panel={panel}
                  variant="full"
                  activityDays={activityDays}
                  selectedDay={selectedDay}
                  expandedCells={expandedCells}
                  onSelectDay={setSelectedDay}
                  onOpenDay={(iso) => {
                    setSelectedDay(iso);
                    setFilters({ anchor: iso });
                    setMode('day');
                  }}
                  onToggleCell={toggleCell}
                  onOpenActivity={onOpenActivity}
                  deptMap={deptMap}
                  holidayForDay={holidayForDay}
                  holidayLabel={holidayLabel}
                  today={today}
                  plannedHoursOn={plannedHoursOn}
                />
              ))}
            </Card>
          ) : null}

          {mode === 'week' ? (
            <Card padded={false} className="overflow-hidden">
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
                  <div className="max-h-[620px] overflow-y-auto">
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
                            const cellKey = `${emp.id}|${d.iso}`;
                            const expanded = expandedCells.includes(cellKey);
                            const visible = expanded ? acts : acts.slice(0, 4);
                            return (
                              <div
                                key={`${emp.id}-${d.iso}`}
                                onClick={() => setSelectedDay(d.iso)}
                                className={`min-h-[62px] cursor-pointer space-y-0.5 border-l border-slate-100 p-1 ${holiday ? 'bg-rose-50/40' : d.isWeekend ? 'bg-slate-50/60' : ''} ${
                                  selectedDay === d.iso ? 'ring-1 ring-inset ring-brand-300' : ''
                                }`}
                              >
                                {visible.map((a) => (
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
                                {acts.length > 4 ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleCell(cellKey);
                                    }}
                                    className="w-full rounded px-1 text-left text-[8px] font-semibold text-slate-500 hover:bg-slate-100"
                                  >
                                    {expanded ? 'Show less' : `+${acts.length - 4} more this day`}
                                  </button>
                                ) : null}
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
            </Card>
          ) : null}

          {mode === 'day' ? (
            <Card padded={false} className="overflow-hidden">
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
                        <span className="ml-auto text-[10px] text-slate-400">{acts.length} on this day</span>
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
                {selectedActivities.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={<CalendarDays className="h-5 w-5" />}
                      title={holidayForDay(toISO(anchor)) ? 'Public holiday — no activities' : 'Nothing scheduled for this day'}
                      description={holidayLabel(holidayForDay(toISO(anchor))) || 'Add an activity or move to another day.'}
                      action={<Button size="sm" onClick={() => addOnDay(toISO(anchor))}>Schedule activity</Button>}
                    />
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Grain: <span className="font-semibold text-slate-700">{MODE_TABS.find((m) => m.id === mode)?.label}</span></span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-200" /> public holiday</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-200" /> weekly off</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" /> today</span>
            </span>
            <span>
              {mode === 'week'
                ? 'Each cell stacks every task for that person and day; “+N more” expands it in place.'
                : mode === 'day'
                  ? 'Click any task to open its detail, subtasks and calendar sync.'
                  : 'Days hold as many tasks as they need — click “+N more” to expand a crowded day.'}
            </span>
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-3">
          <Card>
            <SectionHeader
              title={selectedDay === today ? 'Today' : format(fromISO(selectedDay), 'EEE dd MMM')}
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
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="primary" className="flex-1 !justify-center" onClick={() => addOnDay(selectedDay)}>
                <Plus className="h-3 w-3" /> Add task
              </Button>
              <Button
                size="sm"
                className="flex-1 !justify-center"
                onClick={() => {
                  setFilters({ anchor: selectedDay });
                  setMode('day');
                }}
              >
                <CalendarDays className="h-3 w-3" /> Open day
              </Button>
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
                .filter((h) => h.date >= today)
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
            <Button size="sm" variant="ghost" className="mt-1 w-full !justify-start !text-[10px]" onClick={() => setFilters({ anchor: today })}>
              <Filter className="h-3 w-3" /> Holiday calendars are configurable in Master setup
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Month grid — one component for Month, Quarter and Year grains       */
/* ------------------------------------------------------------------ */

function MonthGrid({
  panel,
  variant,
  activityDays,
  selectedDay,
  expandedCells,
  onSelectDay,
  onOpenDay,
  onToggleCell,
  onOpenActivity,
  deptMap,
  holidayForDay,
  holidayLabel,
  today,
  plannedHoursOn,
}: {
  panel: MonthPanelData;
  variant: 'full' | 'dense' | 'compact';
  activityDays: Map<string, Activity[]>;
  selectedDay: string;
  expandedCells: string[];
  onSelectDay: (iso: string) => void;
  onOpenDay: (iso: string) => void;
  onToggleCell: (key: string) => void;
  onOpenActivity: (id: string) => void;
  deptMap: Map<string, Department>;
  holidayForDay: (iso: string) => Holiday | undefined;
  holidayLabel: (holiday?: { name: string; countryCode: string }) => string;
  today: string;
  plannedHoursOn: (iso: string) => number;
}) {
  const month = panel.month.getMonth();
  const compact = variant === 'compact';
  const limit = variant === 'full' ? CELL_LIMIT.full : CELL_LIMIT.dense;

  return (
    <div className={compact ? 'rounded-lg border border-slate-200 bg-white p-1.5' : ''}>
      <div className={`flex items-center justify-between gap-2 px-1 pb-1 ${compact ? '' : 'border-b border-slate-200 px-2 py-2'}`}>
        <span className={`font-semibold text-slate-700 ${compact ? 'text-[10px] uppercase tracking-wider' : 'text-xs'}`}>
          {format(panel.month, compact ? 'MMM yyyy' : 'MMMM yyyy')}
        </span>
        <span className="text-[9px] text-slate-400">
          {panel.weeks.reduce((sum, week) => sum + week.reduce((s, d) => s + (d.date.getMonth() === month ? (activityDays.get(d.iso)?.length ?? 0) : 0), 0), 0)} tasks
        </span>
      </div>

      <div className={`grid grid-cols-7 ${compact ? '' : 'border-b border-slate-200 bg-slate-50/80'}`}>
        {(weekStartsOnLabels(panel)).map((label) => (
          <div
            key={label}
            className={`text-center font-semibold uppercase tracking-wider text-slate-500 ${compact ? 'py-0.5 text-[8px]' : 'px-1 py-1.5 text-[10px]'}`}
          >
            {compact ? label.slice(0, 1) : label}
          </div>
        ))}
      </div>

      <div>
        {panel.weeks.map((week, wi) => (
          <div key={wi} className={`grid grid-cols-7 ${compact ? '' : 'border-b border-slate-100 last:border-b-0'}`}>
            {week.map((day) => {
              const acts = activityDays.get(day.iso) ?? [];
              const holiday = holidayForDay(day.iso);
              const inMonth = day.date.getMonth() === month;
              const cellKey = `day|${day.iso}`;
              const expanded = expandedCells.includes(cellKey);
              const visible = expanded ? acts.slice(0, EXPAND_LIMIT) : acts.slice(0, limit);
              const totalHours = plannedHoursOn(day.iso);
              const isToday = day.iso === today;

              if (compact) {
                const dotActs = acts.slice(0, 3);
                return (
                  <button
                    type="button"
                    key={day.iso}
                    onClick={() => onSelectDay(day.iso)}
                    onDoubleClick={() => onOpenDay(day.iso)}
                    title={`${format(day.date, 'EEE dd MMM yyyy')} · ${acts.length} activities${holiday ? ` · ${holidayLabel(holiday)}` : ''}`}
                    className={`relative flex h-9 cursor-pointer flex-col items-center justify-start rounded px-0.5 pt-0.5 transition-colors ${
                      selectedDay === day.iso ? 'bg-brand-100/80 ring-1 ring-inset ring-brand-400' : inMonth ? 'hover:bg-slate-100' : 'opacity-40 hover:bg-slate-50'
                    } ${holiday ? 'bg-rose-50/70' : ''}`}
                  >
                    <span
                      className={`flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold leading-none ${
                        isToday ? 'bg-brand-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      {day.date.getDate()}
                    </span>
                    <span className="mt-0.5 flex h-1.5 items-center justify-center gap-0.5">
                      {dotActs.map((a) => (
                        <span
                          key={a.id}
                          className="h-1 w-1 rounded-full"
                          style={{ background: deptMap.get(a.departmentId)?.color ?? '#3b82f6' }}
                        />
                      ))}
                    </span>
                    {acts.length > 3 ? (
                      <span className="absolute right-0.5 top-0.5 rounded-full bg-slate-800/70 px-1 text-[7px] font-bold leading-[10px] text-white">
                        {acts.length}
                      </span>
                    ) : null}
                  </button>
                );
              }

              return (
                <div
                  key={day.iso}
                  onClick={() => onSelectDay(day.iso)}
                  onDoubleClick={() => onOpenDay(day.iso)}
                  className={`min-h-[112px] cursor-pointer border-r border-slate-100 p-1.5 transition-colors last:border-r-0 ${
                    selectedDay === day.iso ? 'bg-brand-50/60 ring-1 ring-inset ring-brand-300' : 'hover:bg-slate-50/70'
                  } ${!inMonth ? 'bg-slate-50/40' : ''}`}
                >
                  <div className="mb-1 flex items-start justify-between gap-1">
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                        isToday ? 'bg-brand-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      {day.date.getDate()}
                    </span>
                    <span className="flex items-center gap-1">
                      {acts.length ? (
                        <span className="rounded-full bg-slate-900/5 px-1 text-[9px] font-semibold tabular-nums text-slate-500" title={`${acts.length} activities on this day`}>
                          {acts.length}
                        </span>
                      ) : null}
                      {totalHours > 0 ? (
                        <span className="text-[9px] font-medium tabular-nums text-slate-400">{Math.round(totalHours)}h</span>
                      ) : null}
                    </span>
                  </div>
                  {holiday ? (
                    <div className="mb-1 truncate rounded bg-rose-50 px-1 py-0.5 text-[9px] font-medium text-rose-600" title={holidayLabel(holiday)}>
                      {holidayLabel(holiday)}
                    </div>
                  ) : day.isWeekend ? (
                    <div className="mb-1 truncate rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-400">Weekly off</div>
                  ) : null}
                  <div className="space-y-0.5">
                    {visible.map((a) => {
                      const dept = deptMap.get(a.departmentId);
                      return (
                        <button
                          key={`${day.iso}-${a.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenActivity(a.id);
                          }}
                          title={`${a.title} · ${a.status} · ${a.plannedHours}h`}
                          className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[9.5px] font-medium hover:brightness-95"
                          style={{ background: `${dept?.color ?? '#3b82f6'}14`, color: dept?.color ?? '#3b82f6' }}
                        >
                          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: dept?.color ?? '#3b82f6' }} />
                          {a.startTime ? <span className="flex-none tabular-nums opacity-70">{a.startTime}</span> : null}
                          <span className="truncate">{a.title}</span>
                        </button>
                      );
                    })}
                    {acts.length > limit ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCell(cellKey);
                        }}
                        className="w-full rounded px-1 py-0.5 text-left text-[9px] font-semibold text-slate-500 hover:bg-slate-100"
                      >
                        {expanded ? 'Show less' : `+${acts.length - limit} more`}
                      </button>
                    ) : null}
                    {expanded && acts.length > EXPAND_LIMIT ? (
                      <p className="px-1 text-[8.5px] leading-tight text-slate-400">
                        Showing {EXPAND_LIMIT} of {acts.length} — the day panel lists them all.
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Weekday headers for a panel, respecting the workspace week start. */
function weekStartsOnLabels(panel: MonthPanelData): string[] {
  const first = panel.weeks[0]?.[0]?.date;
  const start = first ? first.getDay() : 1;
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(start + i) % 7]);
}

function daysBetween(a: string, b: string) {
  const start = fromISO(a) <= fromISO(b) ? fromISO(a) : fromISO(b);
  const end = fromISO(a) <= fromISO(b) ? fromISO(b) : fromISO(a);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
