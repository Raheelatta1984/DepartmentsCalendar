import React, { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfWeek,
} from 'date-fns';
import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  Plus,
  ThumbsUp,
  Trash2,
  Users,
} from 'lucide-react';
import { useScopedState, useStore } from '../store';
import type { AppFilters, TimeEntry } from '../types';
import { TYPE_LABELS, capacityHoursFor, filterEntries, inRange } from '../lib/analytics';
import { buildDayMeta, fromISO, humanHours, toISO, workingDays } from '../lib/dates';
import { timeEntriesToCSV } from '../lib/export';
import { canApproveEmployeeTime, canLogForEmployee, compareOrganisationEmployees, ORGANISATION_BAND_LABELS, organisationBand } from '../lib/permissions';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Progress, SearchInput, SectionHeader, Select, Tabs } from '../components/ui';
import { TimeEntryModal } from '../components/TimeEntryModal';
import { useToast } from '../components/toast';

type Tab = 'grid' | 'entries' | 'approvals';

export function TimesheetPage({
  filters,
  setFilters,
  onNewActivity,
}: {
  filters: AppFilters;
  setFilters: (patch: Partial<AppFilters>) => void;
  onNewActivity: () => void;
}) {
  const { scope, deleteTimeEntry, toggleEntryApproved  } = useStore();
  /* Operational rows come from the active tenant, cut down to the departments
     the calendar is implemented for (master setting: one / several / all). */
  const state = useScopedState();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('grid');
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [defaults, setDefaults] = useState<Partial<TimeEntry>>({});
  const [selectedEmployee, setSelectedEmployee] = useState(filters.employeeId);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(() => new Set());

  const toggleEmployeeActivities = (employeeId: string) => {
    setExpandedEmployees((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekAnchor, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const deptMap = useMemo(() => new Map(state.departments.map((d) => [d.id, d])), [state.departments]);
  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);
  const activityMap = useMemo(() => new Map(state.activities.map((a) => [a.id, a])), [state.activities]);

  const team = useMemo(
    () =>
      state.employees
        .filter((e) => scope.visibleEmployeeIds.includes(e.id) && e.status !== 'inactive')
        .filter((e) => filters.departmentId === 'all' || e.departmentId === filters.departmentId)
        .filter((e) => (query ? `${e.name} ${e.code}`.toLowerCase().includes(query.toLowerCase()) : true))
        .sort((a, b) => compareOrganisationEmployees(a, b, state.departments, state.deliveryStreams)),
    [state.employees, scope.visibleEmployeeIds, filters.departmentId, query, state.departments, state.deliveryStreams],
  );

  const weekEntries = useMemo(
    () =>
      state.timeEntries.filter(
        (t) => t.date >= toISO(weekStart) && t.date <= toISO(weekEnd) && scope.visibleEmployeeIds.includes(t.employeeId),
      ),
    [state.timeEntries, weekStart, weekEnd, scope.visibleEmployeeIds],
  );

  const monthEntries = useMemo(
    () =>
      filterEntries(state, {
        employeeIds: scope.visibleEmployeeIds,
        departmentIds: filters.departmentId === 'all' ? undefined : [filters.departmentId],
        start: toISO(new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), 1)),
        end: toISO(endOfMonth(weekAnchor)),
      }),
    [state, scope.visibleEmployeeIds, filters.departmentId, weekAnchor],
  );

  const pending = useMemo(
    () =>
      state.timeEntries
        .filter((t) => !t.approved && scope.visibleEmployeeIds.includes(t.employeeId))
        .filter((t) => (filters.departmentId === 'all' ? true : empMap.get(t.employeeId)?.departmentId === filters.departmentId))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.timeEntries, scope.visibleEmployeeIds, filters.departmentId, empMap],
  );

  const approvablePending = useMemo(
    () => pending.filter((entry) => canApproveEmployeeTime(state, scope.user.id, entry.employeeId)),
    [pending, state, scope.user.id],
  );

  const entriesForSelected = useMemo(
    () =>
      state.timeEntries
        .filter((t) => scope.visibleEmployeeIds.includes(t.employeeId))
        .filter((t) => (filters.departmentId === 'all' ? true : empMap.get(t.employeeId)?.departmentId === filters.departmentId))
        .filter((t) => (selectedEmployee === 'all' ? true : t.employeeId === selectedEmployee))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 120),
    [state.timeEntries, scope.visibleEmployeeIds, filters.departmentId, selectedEmployee, empMap],
  );

  const totalWeek = weekEntries.reduce((a, b) => a + b.hours, 0);
  const billableWeek = weekEntries.filter((e) => e.billable).reduce((a, b) => a + b.hours, 0);
  const approvedWeek = weekEntries.filter((e) => e.approved).reduce((a, b) => a + b.hours, 0);
  const employeesLogged = new Set(weekEntries.map((e) => e.employeeId)).size;

  const openNew = (prefill: Partial<TimeEntry> = {}) => {
    setEditing(null);
    setDefaults(prefill);
    setModalOpen(true);
  };

  const holidayFor = (empCountry: string, iso: string) =>
    state.holidays.find((h) => h.countryCode === empCountry && h.date === iso && h.type !== 'weekly_off');

  return (
    <div>
      <PageHeader
        eyebrow="Timesheets"
        title="Time logged by activity, not just attendance"
        description="Employees record effort against the exact activity on their calendar. Supervisors approve, the PMO compares plan vs actual, and every hour feeds the department workload score."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => {
                timeEntriesToCSV(selectedEmployee === 'all' ? monthEntries : monthEntries.filter((e) => e.employeeId === selectedEmployee), state);
                toast.push({ tone: 'success', title: 'Timesheet exported', description: 'CSV ready for payroll or client billing.' });
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export month
            </Button>
            <Button size="sm" variant="primary" onClick={() => openNew({ date: toISO(new Date()) })}>
              <Plus className="h-3.5 w-3.5" /> Log time
            </Button>
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="!py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Logged this week</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{humanHours(totalWeek)}</div>
          <div className="text-[10px] text-slate-400">
            {employeesLogged} of {team.length} people logged time
          </div>
        </Card>
        <Card className="!py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Billable share</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600">
            {totalWeek ? Math.round((billableWeek / totalWeek) * 100) : 0}%
          </div>
          <div className="text-[10px] text-slate-400">{humanHours(billableWeek)} billable</div>
        </Card>
        <Card className="!py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Pending approval</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-amber-600">{pending.length}</div>
          <div className="text-[10px] text-slate-400">{humanHours(pending.reduce((a, b) => a + b.hours, 0))} awaiting supervisor</div>
        </Card>
        <Card className="!py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Approved</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{humanHours(approvedWeek)}</div>
          <div className="text-[10px] text-slate-400">of {humanHours(totalWeek)} logged this week</div>
        </Card>
      </div>

      <Card className="mb-3 !py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[168px] text-center text-xs font-semibold text-slate-800">
              {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
            </span>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-50" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Tabs<Tab>
            tabs={[
              { id: 'grid', label: 'Team week', count: team.length },
              { id: 'entries', label: 'Entry history', count: entriesForSelected.length },
              { id: 'approvals', label: 'Approvals', count: pending.length },
            ]}
            value={tab}
            onChange={setTab}
          />
            <div className="w-full sm:w-[180px]">
            <Select value={filters.departmentId} onChange={(e) => setFilters({ departmentId: e.target.value })}>
              <option value="all">All departments</option>
              {scope.visibleDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          {tab === 'entries' ? (
            <div className="w-full sm:w-[200px]">
              <Select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
                <option value="all">All employees</option>
                {team.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {tab === 'grid' ? <SearchInput value={query} onChange={setQuery} placeholder="Filter people…" className="w-full sm:ml-auto sm:w-[220px] sm:min-w-[170px]" /> : null}
        </div>
      </Card>

      {tab === 'grid' ? (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Employee
                  </th>
                  {weekDays.map((d) => {
                    const iso = toISO(d);
                    return (
                      <th key={iso} className="border-b border-l border-slate-200 bg-slate-50/95 px-1.5 py-2 text-center">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{format(d, 'EEE')}</div>
                        <div className={`text-[11px] font-semibold ${iso === toISO(new Date()) ? 'text-brand-700' : 'text-slate-700'}`}>
                          {format(d, 'dd MMM')}
                        </div>
                      </th>
                    );
                  })}
                  <th className="border-b border-l border-slate-200 bg-slate-50/95 px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Activities
                  </th>
                  <th className="border-b border-l border-slate-200 bg-slate-50/95 px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Week
                  </th>
                  <th className="border-b border-slate-200 bg-slate-50/95 px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Capacity
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map((emp, employeeIndex) => {
                  const cfg = state.countries.find((c) => c.code === emp.countryCode);
                  const capacity = capacityHoursFor(emp, toISO(weekStart), toISO(weekEnd), state.holidays, state.countries);
                  const myEntries = weekEntries.filter((t) => t.employeeId === emp.id);
                  const total = myEntries.reduce((a, b) => a + b.hours, 0);
                  const pct = capacity ? Math.round((total / capacity) * 100) : 0;
                  const department = deptMap.get(emp.departmentId);
                  const band = organisationBand(emp, department, state.deliveryStreams);
                  const previous = employeeIndex > 0 ? team[employeeIndex - 1] : undefined;
                  const previousBand = previous ? organisationBand(previous, deptMap.get(previous.departmentId), state.deliveryStreams) : undefined;
                  const showGroup = !previous || previous.departmentId !== emp.departmentId || previousBand !== band;
                  const assignedActivities = state.activities
                    .filter((activity) => activity.assigneeId === emp.id && inRange(activity, toISO(weekStart), toISO(weekEnd)))
                    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
                  const isExpanded = expandedEmployees.has(emp.id);
                  const canLog = canLogForEmployee(state, scope.user.id, emp.id);
                  return (
                    <React.Fragment key={emp.id}>
                      {showGroup ? (
                        <tr className="bg-slate-100/80">
                          <td colSpan={11} className="border-b border-slate-200 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            <span style={{ color: department?.color }}>{department?.name}</span>
                            <span className="mx-2 text-slate-300">/</span>{ORGANISATION_BAND_LABELS[band]}
                          </td>
                        </tr>
                      ) : null}
                    <tr className="hover:bg-slate-50/40">
                      <td className="sticky left-0 z-[5] border-b border-slate-100 bg-white/95 px-3 py-2 backdrop-blur">
                        <button
                          onClick={() => toggleEmployeeActivities(emp.id)}
                          aria-expanded={isExpanded}
                          className="flex w-full items-center gap-2 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-brand-200"
                          title={`${isExpanded ? 'Hide' : 'Show'} activities for ${emp.name}`}
                        >
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 flex-none text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 flex-none text-slate-400" />}
                          <Avatar name={emp.name} color={emp.avatarColor} size={24} />
                          <div className="min-w-0">
                            <div className="max-w-[130px] truncate text-[11px] font-medium text-slate-800">{emp.name}</div>
                            <div className="text-[9px] text-slate-400">
                              {deptMap.get(emp.departmentId)?.code} · {emp.countryCode}
                            </div>
                          </div>
                        </button>
                      </td>
                      {weekDays.map((d) => {
                        const iso = toISO(d);
                        const dayEntries = myEntries.filter((t) => t.date === iso);
                        const hours = dayEntries.reduce((a, b) => a + b.hours, 0);
                        const holiday = holidayFor(emp.countryCode, iso);
                        const isWeekend = cfg?.weeklyOff.includes(d.getDay());
                        const over = hours > emp.weeklyHours / 5;
                        return (
                          <td
                            key={`${emp.id}-${iso}`}
                            className={`border-b border-l border-slate-100 p-1 text-center align-middle ${
                              holiday ? 'bg-rose-50/60' : isWeekend ? 'bg-slate-50/80' : ''
                            }`}
                          >
                            <button
                              disabled={!canLog}
                              onClick={() => { if (canLog) openNew({ employeeId: emp.id, date: iso, hours: 2 }); }}
                              className={`mx-auto flex h-11 w-full max-w-[76px] flex-col items-center justify-center rounded-lg border text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                                hours
                                  ? over
                                    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                    : 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
                                  : 'border-dashed border-slate-200 text-slate-300 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                              title={`${emp.name} · ${iso}${holiday ? ` · ${holiday.name}` : ''}${canLog ? '' : ' · shared read-only calendar'}`}
                            >
                              {hours ? (
                                <span className="font-semibold tabular-nums">{hours}h</span>
                              ) : canLog ? (
                                <Plus className="h-3 w-3" />
                              ) : (
                                <span className="text-[9px] text-slate-300">—</span>
                              )}
                              {holiday ? <span className="max-w-[68px] truncate text-[7px] leading-none opacity-80">{holiday.name}</span> : null}
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-b border-l border-slate-100 px-2 py-2 text-right text-[11px] font-semibold tabular-nums text-slate-600" title="Expand the current activities assigned to this employee in the displayed week">
                        <button onClick={() => toggleEmployeeActivities(emp.id)} className="rounded px-1.5 py-1 hover:bg-brand-50 hover:text-brand-700" aria-label={`Toggle ${emp.name} activities`}>
                          {assignedActivities.length}
                        </button>
                      </td>
                      <td className="border-b border-l border-slate-100 px-2 py-2 text-right">
                        <div className="text-xs font-semibold tabular-nums text-slate-800">{total}h</div>
                        <div className="mt-1 w-16">
                          <Progress value={pct} tone={pct > 110 ? 'danger' : pct < 50 ? 'warn' : 'good'} height={3} />
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 text-right text-[11px] tabular-nums text-slate-500">{capacity}h</td>
                    </tr>
                    {isExpanded ? assignedActivities.map((activity) => {
                      const activityEntries = myEntries.filter((entry) => entry.activityId === activity.id);
                      const activityTotal = activityEntries.reduce((sum, entry) => sum + entry.hours, 0);
                      return (
                        <tr key={`${emp.id}-${activity.id}`} className="bg-slate-50/45">
                          <td className="sticky left-0 z-[5] border-b border-slate-100 bg-slate-50/95 px-3 py-1.5 backdrop-blur">
                            <div className="flex items-center gap-2 pl-7">
                              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: department?.color ?? '#94a3b8' }} />
                              <div className="min-w-0">
                                <div className="max-w-[165px] truncate text-[10px] font-medium text-slate-700" title={activity.title}>{activity.title}</div>
                                <div className="text-[8px] text-slate-400">{TYPE_LABELS[activity.type]} · {activity.startDate}{activity.endDate !== activity.startDate ? ` → ${activity.endDate}` : ''}</div>
                              </div>
                            </div>
                          </td>
                          {weekDays.map((day) => {
                            const iso = toISO(day);
                            const hours = activityEntries.filter((entry) => entry.date === iso).reduce((sum, entry) => sum + entry.hours, 0);
                            return (
                              <td key={`${activity.id}-${iso}`} className="border-b border-l border-slate-100 p-1 text-center">
                                <button
                                  disabled={!canLog}
                                  onClick={() => { if (canLog) openNew({ employeeId: emp.id, activityId: activity.id, date: iso, hours: 2 }); }}
                                  className="mx-auto flex h-8 w-full max-w-[76px] items-center justify-center rounded-md border border-transparent text-[10px] tabular-nums text-slate-500 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-slate-300"
                                  title={`${activity.title} · ${iso}${canLog ? '' : ' · shared read-only calendar'}`}
                                >
                                  {hours ? `${hours}h` : canLog ? <Plus className="h-3 w-3 text-slate-300" /> : '—'}
                                </button>
                              </td>
                            );
                          })}
                          <td className="border-b border-l border-slate-100 px-2 py-1.5 text-right text-[9px] tabular-nums text-slate-400">{activity.plannedHours}h plan</td>
                          <td className="border-b border-l border-slate-100 px-2 py-1.5 text-right text-[10px] font-semibold tabular-nums text-slate-600">{activityTotal}h</td>
                          <td className="border-b border-slate-100 px-2 py-1.5 text-right text-[9px] capitalize text-slate-400">{activity.status.replace('_', ' ')}</td>
                        </tr>
                      );
                    }) : null}
                    {isExpanded && !assignedActivities.length ? (
                      <tr className="bg-slate-50/45">
                        <td colSpan={11} className="border-b border-slate-100 px-10 py-2 text-[10px] text-slate-400">No activities assigned in this week.</td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {team.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No employees in scope" description="Adjust the department filter or switch to a wider role." />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
            <span>Expand a person to drill into their activities. Click a permitted cell to log time; weekend and public-holiday cells use the country calendar.</span>
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-400" /> within capacity</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> above daily capacity</span>
            </span>
          </div>
        </Card>
      ) : null}

      {tab === 'entries' ? (
        <Card padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader
              title="Entry history"
              subtitle={`Most recent ${entriesForSelected.length} entries · click to edit or approve`}
              action={
                <Button size="sm" onClick={() => openNew({})}>
                  <Plus className="h-3.5 w-3.5" /> New entry
                </Button>
              }
            />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Date', 'Employee', 'Activity', 'Type', 'Hours', 'Billable', 'Approval', 'Note', ''].map((h) => (
                    <th key={h} className="border-b border-slate-200 bg-slate-50/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entriesForSelected.map((t) => {
                  const emp = empMap.get(t.employeeId);
                  const act = activityMap.get(t.activityId);
                  const canEdit = emp ? canLogForEmployee(state, scope.user.id, emp.id) : false;
                  const canApprove = emp ? canApproveEmployeeTime(state, scope.user.id, emp.id) : false;
                  const logger = t.loggedById ? empMap.get(t.loggedById) : undefined;
                  return (
                    <tr key={t.id} className="group hover:bg-slate-50/70">
                      <td className="border-b border-slate-100 py-2 pl-4 pr-3 text-[11px] tabular-nums text-slate-600">{t.date}</td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Avatar name={emp?.name ?? ''} color={emp?.avatarColor} size={20} />
                          <span className="text-[11px] text-slate-700">{emp?.name}</span>
                          {logger && logger.id !== emp?.id ? <span className="text-[9px] text-slate-400">by {logger.name}</span> : null}
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        <div className="max-w-[240px] truncate text-[11px] font-medium text-slate-800">{act?.title ?? '—'}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">{act ? TYPE_LABELS[act.type] : '—'}</td>
                      <td className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold tabular-nums text-slate-800">
                        {t.hours}h
                        {t.startTime && t.endTime ? <div className="text-[9px] font-normal text-slate-400">{t.startTime}–{t.endTime}</div> : null}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        <Badge tone={t.billable ? 'good' : 'neutral'}>{t.billable ? 'billable' : 'internal'}</Badge>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        {canApprove ? (
                          <button
                            onClick={() => toggleEntryApproved(t.id)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                              t.approved ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'
                            }`}
                            title="Toggle approval"
                          >
                            {t.approved ? <BadgeCheck className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                            {t.approved ? 'approved' : 'pending'}
                          </button>
                        ) : <Badge tone={t.approved ? 'good' : 'warn'}>{t.approved ? 'approved' : 'pending'}</Badge>}
                      </td>
                      <td className="max-w-[220px] truncate border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">{t.note || '—'}</td>
                      <td className="border-b border-slate-100 py-2 pl-2 pr-4 text-right">
                        <div className="flex justify-end gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                          {canEdit ? (
                            <>
                              <button
                                onClick={() => {
                                  setEditing(t);
                                  setModalOpen(true);
                                }}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Edit entry"
                              >
                                <FileSpreadsheet className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deleteTimeEntry(t.id)}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Delete entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {entriesForSelected.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Clock3 className="h-5 w-5" />}
                title="No time logged yet"
                description="Log time against an activity so workload and client billing can be proven."
                action={<Button size="sm" variant="primary" onClick={() => openNew({})}>Log time</Button>}
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === 'approvals' ? (
        <div className="grid gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2" padded={false}>
            <div className="px-4 pt-4">
              <SectionHeader
                title="Approval queue"
                subtitle={`${pending.length} entries · ${humanHours(pending.reduce((a, b) => a + b.hours, 0))} pending in your scope`}
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      approvablePending.forEach((entry) => toggleEntryApproved(entry.id));
                      toast.push({ tone: 'success', title: 'Timesheets approved', description: `${approvablePending.length} entries approved.` });
                    }}
                    disabled={!approvablePending.length}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve all
                  </Button>
                }
              />
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {pending.slice(0, 40).map((t) => {
                const emp = empMap.get(t.employeeId);
                const act = activityMap.get(t.activityId);
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60">
                    <Avatar name={emp?.name ?? ''} color={emp?.avatarColor} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[11px] font-medium text-slate-800">{emp?.name}</span>
                        <span className="text-[10px] text-slate-400">· {t.date}</span>
                      </div>
                      <div className="truncate text-[10px] text-slate-500">
                        {act?.title ?? 'Activity removed'} {t.note ? `— ${t.note}` : ''}
                      </div>
                    </div>
                    <Badge tone={t.billable ? 'good' : 'neutral'}>{t.hours}h</Badge>
                    {canApproveEmployeeTime(state, scope.user.id, t.employeeId) ? (
                      <Button size="sm" variant="subtle" onClick={() => toggleEntryApproved(t.id)} className="!px-2 !py-1 !text-[10px]">
                        <ThumbsUp className="h-3 w-3" /> Approve
                      </Button>
                    ) : <span className="text-[9px] text-slate-400">Awaiting reporting lead</span>}
                  </div>
                );
              })}
              {pending.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={<BadgeCheck className="h-5 w-5" />} title="Nothing awaiting approval" description="Every entry in your scope has been reviewed." />
                </div>
              ) : null}
            </div>
          </Card>
          <div className="space-y-3">
            <Card>
              <SectionHeader title="Plan vs actual" subtitle="This week · team totals" />
              <div className="mt-3 space-y-3">
                {(() => {
                  const planned = state.activities
                    .filter((a) => scope.visibleEmployeeIds.includes(a.assigneeId) && inRange(a, toISO(weekStart), toISO(weekEnd)))
                    .reduce((a, b) => a + b.plannedHours, 0);
                  const max = Math.max(planned, approvedWeek, totalWeek - approvedWeek, 1);
                  return (
                    <>
                      <PlanRow label="Planned on calendar" value={planned} max={max} color="#3a63f0" />
                      <PlanRow label="Approved timesheets" value={approvedWeek} max={max} color="#10b981" />
                      <PlanRow label="Awaiting approval" value={totalWeek - approvedWeek} max={max} color="#f59e0b" />
                    </>
                  );
                })()}
              </div>
              <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-500">
                A persistent gap between planned and logged hours is the first sign of unrecorded work. The department score penalises both
                under-logging and genuine over-capacity.
              </p>
            </Card>
            <Card>
              <SectionHeader title="Approval policy" subtitle="Group governance" />
              <ul className="mt-2 space-y-2 text-[11px] text-slate-600">
                <li className="flex gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 flex-none text-emerald-500" /> Employees submit daily; supervisors approve weekly.
                </li>
                <li className="flex gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 flex-none text-emerald-500" /> Department heads review plan vs actual before the weekly escalation run.
                </li>
                <li className="flex gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 flex-none text-emerald-500" /> Head of Operations receives the portfolio view with every department's score.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      ) : null}

      <TimeEntryModal open={modalOpen} onClose={() => setModalOpen(false)} entry={editing} defaults={defaults} />
    </div>
  );
}

function PlanRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-slate-800">{humanHours(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}
