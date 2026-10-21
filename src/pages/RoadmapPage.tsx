import React, { useMemo, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Download,
  Flag,
  Minus,
  Plus,
  Rows3,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useStore } from '../store';
import type { AppFilters } from '../types';
import { filterActivities, scoreTone } from '../lib/analytics';
import { fromISO, humanHours, isoWeek, quarterOf, toISO } from '../lib/dates';
import { activitiesToCSV, downloadICS } from '../lib/export';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Select, Tabs } from '../components/ui';
import { StatusBadge, TypeIcon, TYPE_COLORS } from '../components/activity-ui';
import { useToast } from '../components/toast';

const HORIZONS = [
  { id: 'quarter', label: 'Quarter · 13 weeks', weeks: 13 },
  { id: 'half', label: 'Half year · 26 weeks', weeks: 26 },
  { id: 'year', label: 'Full year · 52 weeks', weeks: 52 },
] as const;

type Horizon = (typeof HORIZONS)[number]['id'];

export function RoadmapPage({
  filters,
  setFilters,
  onOpenActivity,
}: {
  filters: AppFilters;
  setFilters: (patch: Partial<AppFilters>) => void;
  onOpenActivity: (id: string) => void;
}) {
  const { state, scope, toggleSubtask } = useStore();
  const toast = useToast();
  const [horizon, setHorizon] = useState<Horizon>('quarter');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [collapsedDepts, setCollapsedDepts] = useState<string[]>([]);
  const [collapsedEmps, setCollapsedEmps] = useState<string[]>([]);
  const [expandedActivity, setExpandedActivity] = useState<string[]>([]);
  const [showWeekends, setShowWeekends] = useState(true);

  const weeks = HORIZONS.find((h) => h.id === horizon)!.weeks;
  const cellW = density === 'compact' ? 22 : 30;
  const anchor = fromISO(filters.anchor);
  const timelineStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const totalDays = weeks * 7;
  const timelineEnd = addDays(timelineStart, totalDays - 1);
  const days = useMemo(() => eachDayOfInterval({ start: timelineStart, end: timelineEnd }), [timelineStart, timelineEnd]);

  const deptMap = useMemo(() => new Map(state.departments.map((d) => [d.id, d])), [state.departments]);
  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);

  const depts = useMemo(
    () => scope.visibleDepartments.filter((d) => filters.departmentId === 'all' || d.id === filters.departmentId),
    [scope.visibleDepartments, filters.departmentId],
  );

  const activities = useMemo(
    () =>
      filterActivities(state, {
        departmentIds: depts.map((d) => d.id),
        employeeIds: filters.employeeId === 'all' ? scope.visibleEmployeeIds : [filters.employeeId],
        start: toISO(timelineStart),
        end: toISO(timelineEnd),
      }),
    [state, depts, filters.employeeId, scope.visibleEmployeeIds, timelineStart, timelineEnd],
  );

  const dayIndex = (iso: string) =>
    Math.max(0, Math.min(totalDays - 1, differenceInCalendarDays(fromISO(iso), timelineStart)));

  const scopeCountries = useMemo(
    () => new Set(state.employees.filter((e) => scope.visibleEmployeeIds.includes(e.id)).map((e) => e.countryCode)),
    [state.employees, scope.visibleEmployeeIds],
  );
  const holidays = useMemo(() => {
    const map = new Map<string, string>();
    state.holidays
      .filter(
        (h) =>
          h.type !== 'weekly_off' &&
          scopeCountries.has(h.countryCode) &&
          h.date >= toISO(timelineStart) &&
          h.date <= toISO(timelineEnd),
      )
      .forEach((h) => {
        if (!map.has(h.date)) map.set(h.date, `${h.name} (${h.countryCode})`);
      });
    return map;
  }, [state.holidays, scopeCountries, timelineStart, timelineEnd]);

  // Header groups
  const groups = useMemo(() => {
    const build = (key: (d: Date) => string, label: (d: Date) => string) => {
      const out: { label: string; span: number; key: string }[] = [];
      days.forEach((d) => {
        const k = key(d);
        const last = out[out.length - 1];
        if (last && last.key === k) last.span += 1;
        else out.push({ label: label(d), span: 1, key: k });
      });
      return out;
    };
    return {
      years: build((d) => String(d.getFullYear()), (d) => String(d.getFullYear())),
      quarters: build((d) => `${d.getFullYear()}-Q${quarterOf(d)}`, (d) => `Q${quarterOf(d)}`),
      months: build((d) => `${d.getFullYear()}-${d.getMonth()}`, (d) => format(d, 'MMM yy')),
      weekNums: build((d) => `${d.getFullYear()}-${isoWeek(d)}`, (d) => `W${isoWeek(d)}`),
    };
  }, [days]);

  const totalPlanned = activities.reduce((a, b) => a + b.plannedHours, 0);
  const deptRows = depts
    .map((dept) => {
      const deptActs = activities
        .filter((a) => a.departmentId === dept.id)
        .filter((a) => (filters.employeeId === 'all' ? true : a.assigneeId === filters.employeeId));
      const empIds = Array.from(new Set(deptActs.map((a) => a.assigneeId)));
      const employees = state.employees
        .filter((e) => empIds.includes(e.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { dept, acts: deptActs, employees };
    })
    .filter((d) => d.acts.length > 0 || d.employees.length > 0);

  const todayIdx = differenceInCalendarDays(new Date(), timelineStart);
  const showToday = todayIdx >= 0 && todayIdx < totalDays;

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const cellStyle = (d: Date) => {
    const iso = toISO(d);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const holiday = holidays.get(iso);
    if (holiday) return 'bg-rose-50';
    if (isWeekend) return showWeekends ? 'bg-slate-50' : 'bg-white';
    return 'bg-white';
  };

  const rowBg = (rows: number) => (
    <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
      {days.map((d) => (
        <div key={toISO(d)} className={`h-full flex-none border-r border-slate-100 last:border-r-0 ${cellStyle(d)}`} style={{ width: cellW }} />
      ))}
    </div>
  );

  const spanStyle = (start: string, end: string) => {
    const s = dayIndex(start);
    const e = dayIndex(end);
    const widthDays = Math.max(1, e - s + 1);
    return {
      left: `${(s / totalDays) * 100}%`,
      width: `${Math.max(0.6, (widthDays / totalDays) * 100)}%`,
    };
  };

  const bar = (start: string, end: string, color: string) => ({
    ...spanStyle(start, end),
    background: color,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Roadmap"
        title="Group roadmap timeline"
        description="Departments, employees, activities and subtasks on the left; year, quarter, month, ISO week and day across the top. Public holidays and country weekends are shaded so slippage is never blamed on the calendar."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => {
                activitiesToCSV(activities, state);
                toast.push({ tone: 'success', title: 'Roadmap exported', description: `${activities.length} activities in view.` });
              }}
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button
              size="sm"
              onClick={() => {
                downloadICS(activities, state.employees, 'orbit-roadmap.ics');
                toast.push({ tone: 'info', title: 'iCalendar generated', description: 'Import into Outlook / Google to mirror this roadmap.' });
              }}
            >
              <CalendarRange className="h-3.5 w-3.5" /> .ics
            </Button>
          </>
        }
      />

      <Card className="mb-3 !py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => setFilters({ anchor: toISO(addDays(anchor, -weeks * 3)) })} aria-label="Scroll back">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[170px] text-center text-xs font-semibold text-slate-800">
              {format(timelineStart, 'dd MMM yyyy')} → {format(timelineEnd, 'dd MMM yyyy')}
            </span>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => setFilters({ anchor: toISO(addDays(anchor, weeks * 3)) })} aria-label="Scroll forward">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="w-[170px]">
            <Select value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
              {HORIZONS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[190px]">
            <Select value={filters.departmentId} onChange={(e) => setFilters({ departmentId: e.target.value, employeeId: 'all' })}>
              <option value="all">All departments</option>
              {scope.visibleDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[190px]">
            <Select value={filters.employeeId} onChange={(e) => setFilters({ employeeId: e.target.value })}>
              <option value="all">All employees</option>
              {state.employees
                .filter((e) => scope.visibleEmployeeIds.includes(e.id))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
            >
              {density === 'compact' ? <ZoomIn className="h-3 w-3" /> : <ZoomOut className="h-3 w-3" />}
              {density === 'compact' ? 'Zoom in' : 'Zoom out'}
            </button>
            <button
              onClick={() => setShowWeekends((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <Rows3 className="h-3 w-3" /> Weekends {showWeekends ? 'on' : 'off'}
            </button>
            <button
              onClick={() => {
                setCollapsedDepts(collapsedDepts.length ? [] : depts.map((d) => d.id));
                setCollapsedEmps([]);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <ChevronsUpDown className="h-3 w-3" /> {collapsedDepts.length ? 'Expand all' : 'Collapse all'}
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
          <span>{deptRows.length} departments</span>
          <span>{activities.length} activities</span>
          <span>{humanHours(totalPlanned)} planned</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-200" /> public holiday ({holidays.size} in view)</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-200" /> weekly off</span>
          {showToday ? <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" /> today</span> : null}
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <div className="relative" style={{ minWidth: 300 + totalDays * cellW }}>
            {/* Header rows */}
            <div className="sticky top-0 z-30 bg-white">
              <HeaderRow label="Year" groups={groups.years} cellW={cellW} height={22} labelWidth={300} className="bg-slate-100/90 font-semibold text-slate-600" />
              <HeaderRow label="Quarter" groups={groups.quarters} cellW={cellW} height={20} labelWidth={300} className="bg-slate-50 text-brand-700" />
              <HeaderRow label="Month" groups={groups.months} cellW={cellW} height={20} labelWidth={300} className="bg-slate-50 text-slate-600" />
              <HeaderRow label="ISO week" groups={groups.weekNums} cellW={cellW} height={18} labelWidth={300} className="bg-white text-[9px] text-slate-400" />
              <div className="flex border-b border-slate-200 bg-white">
                <div className="sticky left-0 z-20 flex flex-none items-center border-r border-slate-200 bg-white px-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400" style={{ width: 300 }}>
                  Day / date
                </div>
                <div className="flex">
                  {days.map((d) => {
                    const iso = toISO(d);
                    const holiday = holidays.get(iso);
                    const isToday = iso === toISO(new Date());
                    return (
                      <div
                        key={iso}
                        title={`${format(d, 'EEE dd MMM yyyy')}${holiday ? ` · ${holiday}` : ''}`}
                        className={`flex flex-none flex-col items-center justify-center border-r border-slate-100 py-0.5 ${
                          holiday ? 'bg-rose-50' : d.getDay() === 0 || d.getDay() === 6 ? 'bg-slate-50' : 'bg-white'
                        }`}
                        style={{ width: cellW }}
                      >
                        <span className={`text-[8px] uppercase ${isToday ? 'font-bold text-brand-600' : 'text-slate-400'}`}>{format(d, 'EEEEE')}</span>
                        <span className={`text-[9px] tabular-nums ${isToday ? 'font-bold text-brand-700' : 'text-slate-600'}`}>{format(d, 'd')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Rows */}
            {deptRows.map(({ dept, acts, employees }) => {
              const deptCollapsed = collapsedDepts.includes(dept.id);
              const deptScoreColor = dept.color;
              return (
                <div key={dept.id}>
                  {/* Department row */}
                  <div className="group relative flex border-b border-slate-200 bg-slate-50/90">
                    {rowBg(1)}
                    <button
                      onClick={() => toggle(collapsedDepts, setCollapsedDepts, dept.id)}
                      className="sticky left-0 z-20 flex w-[300px] flex-none items-center gap-1.5 border-r border-slate-200 bg-slate-50/95 px-2 py-1.5 text-left backdrop-blur"
                    >
                      {deptCollapsed ? <ChevronRight className="h-3 w-3 flex-none text-slate-400" /> : <ChevronDown className="h-3 w-3 flex-none text-slate-400" />}
                      <span className="h-4 w-1 flex-none rounded-full" style={{ background: dept.color }} />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-800">{dept.name}</span>
                      <span className="flex-none text-[9px] text-slate-400">{employees.length} people</span>
                      <Badge tone="neutral" className="!bg-white">{humanHours(acts.reduce((a, b) => a + b.plannedHours, 0))}</Badge>
                    </button>
                    <div className="relative flex-1">
                      {acts.slice(0, 40).map((a) => (
                        <div
                          key={a.id}
                          title={`${a.title} · ${humanHours(a.plannedHours)}`}
                          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-70"
                          style={{ ...bar(a.startDate, a.endDate, deptScoreColor), minWidth: 3 }}
                        />
                      ))}
                    </div>
                  </div>

                  {!deptCollapsed &&
                    employees.map((emp) => {
                      const empActs = acts.filter((a) => a.assigneeId === emp.id);
                      const empCollapsed = collapsedEmps.includes(emp.id);
                      const planned = empActs.reduce((a, b) => a + b.plannedHours, 0);
                      return (
                        <div key={emp.id}>
                          <div className="relative flex border-b border-slate-100">
                            {rowBg(1)}
                            <button
                              onClick={() => toggle(collapsedEmps, setCollapsedEmps, emp.id)}
                              className="sticky left-0 z-20 flex w-[300px] flex-none items-center gap-1.5 border-r border-slate-200 bg-white/95 py-1 pl-4 pr-2 text-left backdrop-blur"
                            >
                              {empCollapsed ? <ChevronRight className="h-3 w-3 flex-none text-slate-300" /> : <ChevronDown className="h-3 w-3 flex-none text-slate-300" />}
                              <Avatar name={emp.name} color={emp.avatarColor} size={18} />
                              <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-slate-700">{emp.name}</span>
                              <span className="flex-none text-[9px] text-slate-400">{planned}h</span>
                            </button>
                            <div className="relative flex-1">
                              {empActs.map((a) => (
                                <button
                                  key={a.id}
                                  onClick={() => onOpenActivity(a.id)}
                                  title={`${a.title} · ${a.startDate} → ${a.endDate} · ${a.plannedHours}h · ${a.status}`}
                                  className="absolute top-1/2 h-3 -translate-y-1/2 truncate rounded px-0.5 text-left text-[8px] font-medium text-white shadow-sm hover:brightness-110"
                                  style={{ ...bar(a.startDate, a.endDate, TYPE_COLORS[a.type].solid), minWidth: 4 }}
                                >
                                  {density === 'comfortable' ? a.title : ''}
                                </button>
                              ))}
                            </div>
                          </div>

                          {!empCollapsed &&
                            empActs.map((a) => {
                              const expanded = expandedActivity.includes(a.id);
                              return (
                                <div key={a.id}>
                                  <div className="group relative flex border-b border-slate-100">
                                    {rowBg(1)}
                                    <div className="sticky left-0 z-20 flex w-[300px] flex-none items-center gap-1 border-r border-slate-200 bg-white/95 py-1 pl-9 pr-2 backdrop-blur">
                                      <button
                                        onClick={() => toggle(expandedActivity, setExpandedActivity, a.id)}
                                        className="flex-none rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                                        aria-label="Toggle subtasks"
                                      >
                                        {a.subtasks.length ? (
                                          expanded ? <Minus className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5" />
                                        ) : (
                                          <Circle className="h-1.5 w-1.5" />
                                        )}
                                      </button>
                                      <span
                                        className="flex h-4 w-4 flex-none items-center justify-center rounded"
                                        style={{ background: `${TYPE_COLORS[a.type].solid}18`, color: TYPE_COLORS[a.type].solid }}
                                      >
                                        <TypeIcon type={a.type} className="h-2.5 w-2.5" />
                                      </span>
                                      <button onClick={() => onOpenActivity(a.id)} className="min-w-0 flex-1 truncate text-left text-[10px] text-slate-700 hover:text-brand-700">
                                        {a.title}
                                      </button>
                                      <span className="flex-none text-[8.5px] tabular-nums text-slate-400">{a.plannedHours}h</span>
                                    </div>
                                    <div className="relative flex-1">
                                      <button
                                        onClick={() => onOpenActivity(a.id)}
                                        title={`${a.title} · ${a.startDate} → ${a.endDate}`}
                                        className="absolute top-1/2 flex h-3.5 -translate-y-1/2 items-center gap-1 overflow-hidden rounded px-1 text-left text-[8px] font-medium text-white shadow-sm hover:brightness-110"
                                        style={{ ...bar(a.startDate, a.endDate, TYPE_COLORS[a.type].solid), minWidth: 4 }}
                                      >
                                        {density === 'comfortable' && a.progress > 0 ? (
                                          <span className="absolute inset-y-0 left-0 rounded bg-white/25" style={{ width: `${a.progress}%` }} />
                                        ) : null}
                                        <span className="relative truncate">{density === 'comfortable' ? `${a.progress}%` : ''}</span>
                                      </button>
                                      {a.endDate < toISO(new Date()) && a.status !== 'completed' && a.status !== 'cancelled' ? (
                                        <span
                                          className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-rose-500"
                                          style={{ left: `calc(${((dayIndex(a.endDate) + 1) / totalDays) * 100}% - 2px)` }}
                                          title="Overdue"
                                        />
                                      ) : null}
                                    </div>
                                  </div>
                                  {expanded &&
                                    a.subtasks.map((s) => (
                                      <div key={s.id} className="relative flex border-b border-slate-50 last:border-b">
                                        {rowBg(1)}
                                        <button
                                          onClick={() => toggleSubtask(a.id, s.id)}
                                          className="sticky left-0 z-20 flex w-[300px] flex-none items-center gap-1.5 border-r border-slate-200 bg-slate-50/80 py-0.5 pl-16 pr-2 text-left backdrop-blur"
                                        >
                                          <span
                                            className={`flex h-2.5 w-2.5 flex-none items-center justify-center rounded-[3px] border ${
                                              s.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                                            }`}
                                          >
                                            {s.done ? <Flag className="h-2 w-2" /> : null}
                                          </span>
                                          <span className={`min-w-0 flex-1 truncate text-[9px] ${s.done ? 'text-slate-400 line-through' : 'text-slate-500'}`}>{s.title}</span>
                                          <span className="flex-none text-[8px] tabular-nums text-slate-400">{s.plannedHours}h</span>
                                        </button>
                                        <div className="relative flex-1">
                                          <div
                                            className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-full ${s.done ? 'bg-emerald-200' : 'bg-slate-200'}`}
                                            style={spanStyle(a.startDate, a.endDate)}
                                            title={`${s.title} · ${s.plannedHours}h · ${s.done ? 'done' : 'open'}`}
                                          />
                                          <div
                                            className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-full ${s.done ? 'bg-emerald-400' : 'bg-slate-400/70'}`}
                                            style={{
                                              ...spanStyle(a.startDate, a.endDate),
                                              width: `${Math.max(0.8, ((dayIndex(a.endDate) - dayIndex(a.startDate) + 1) / totalDays) * 100 * (s.plannedHours / Math.max(1, a.plannedHours)))}%`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {deptRows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<CalendarRange className="h-5 w-5" />}
                  title="Nothing on the roadmap in this window"
                  description="Move the timeline, change the department filter or create an activity."
                />
              </div>
            ) : null}

            {/* Today marker overlay */}
            {showToday ? (
              <div
                className="pointer-events-none absolute bottom-0 z-10 w-px bg-brand-500/70"
                style={{ left: 300 + (todayIdx + 0.5) * cellW, top: 112 }}
                aria-hidden
              >
                <span className="absolute -left-[3px] top-0 h-1.5 w-1.5 rounded-full bg-brand-600" />
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-3 py-2 text-[10px] text-slate-500">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status="completed" /> delivered
            <StatusBadge status="in_progress" /> in flight
            <StatusBadge status="blocked" /> blocked
            <span className="flex items-center gap-1"><span className="h-2.5 w-0.5 rounded bg-rose-500" /> overdue marker</span>
          </span>
          <span>Scroll horizontally · the label column stays pinned. Click any bar to edit the activity.</span>
        </div>
      </Card>
    </div>
  );
}

function HeaderRow({
  label,
  groups,
  cellW,
  height,
  labelWidth,
  className = '',
}: {
  label: string;
  groups: { label: string; span: number }[];
  cellW: number;
  height: number;
  labelWidth: number;
  className?: string;
}) {
  return (
    <div className={`flex border-b border-slate-200 ${className}`} style={{ height }}>
      <div
        className="sticky left-0 z-20 flex flex-none items-center border-r border-slate-200 bg-inherit px-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400"
        style={{ width: labelWidth }}
      >
        {label}
      </div>
      <div className="flex">
        {groups.map((g, i) => (
          <div
            key={`${g.label}-${i}`}
            className="flex flex-none items-center justify-center overflow-hidden border-r border-slate-200/70 text-[9px]"
            style={{ width: g.span * cellW }}
            title={g.label}
          >
            <span className="truncate px-0.5">{g.span * cellW > 26 ? g.label : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
