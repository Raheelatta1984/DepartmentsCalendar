import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  Filter,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Send,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { AppFilters, TaskStatus } from '../types';
import { TYPE_LABELS, filterActivities, inRange } from '../lib/analytics';
import { periodLabel, periodRange, toISO, fromISO, humanHours, shortDate } from '../lib/dates';
import { activitiesToCSV, downloadICS } from '../lib/export';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Progress, SearchInput, Select, Tabs } from '../components/ui';
import { PriorityBadge, STATUS_META, StatusBadge, SyncPips, TypeIcon, TYPE_COLORS } from '../components/activity-ui';
import { useToast } from '../components/toast';

const PAGE_SIZE = 20;

export function ActivitiesPage({
  filters,
  setFilters,
  onOpenActivity,
  onNewActivity,
}: {
  filters: AppFilters;
  setFilters: (patch: Partial<AppFilters>) => void;
  onOpenActivity: (id: string) => void;
  onNewActivity: () => void;
}) {
  const { state, scope, updateActivityStatus, pushToCalendars } = useStore();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | TaskStatus>('all');
  const [type, setType] = useState('all');
  const [priority, setPriority] = useState('all');
  const [scopeMode, setScopeMode] = useState<'period' | 'open' | 'all'>('all');
  const [assignee, setAssignee] = useState(filters.employeeId);
  const [page, setPage] = useState(1);

  const anchor = fromISO(filters.anchor);
  const range = periodRange(anchor, filters.period, state.settings.weekStartsOn);
  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);
  const deptMap = useMemo(() => new Map(state.departments.map((d) => [d.id, d])), [state.departments]);

  const scoped = useMemo(
    () =>
      state.activities.filter(
        (a) =>
          scope.visibleDepartmentIds.includes(a.departmentId) &&
          scope.visibleEmployeeIds.includes(a.assigneeId) &&
          (filters.departmentId === 'all' || a.departmentId === filters.departmentId),
      ),
    [state.activities, scope.visibleDepartmentIds, scope.visibleEmployeeIds, filters.departmentId],
  );

  const inScopeMode = useMemo(() => {
    if (scopeMode === 'period') {
      return scoped.filter((a) => inRange(a, toISO(range.start), toISO(range.end)));
    }
    if (scopeMode === 'open') return scoped.filter((a) => a.status !== 'completed' && a.status !== 'cancelled');
    return scoped;
  }, [scoped, scopeMode, range]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScopeMode
      .filter((a) => (status === 'all' ? true : a.status === status))
      .filter((a) => (type === 'all' ? true : a.type === type))
      .filter((a) => (priority === 'all' ? true : a.priority === priority))
      .filter((a) => (assignee === 'all' ? true : a.assigneeId === assignee))
      .filter((a) =>
        q
          ? `${a.title} ${a.description} ${empMap.get(a.assigneeId)?.name ?? ''} ${deptMap.get(a.departmentId)?.name ?? ''}`
              .toLowerCase()
              .includes(q)
          : true,
      )
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [inScopeMode, status, type, priority, assignee, query, empMap, deptMap]);

  const today = toISO(new Date());
  const stats = useMemo(
    () => ({
      total: inScopeMode.length,
      inProgress: inScopeMode.filter((a) => a.status === 'in_progress').length,
      blocked: inScopeMode.filter((a) => a.status === 'blocked').length,
      overdue: inScopeMode.filter((a) => a.status !== 'completed' && a.status !== 'cancelled' && a.endDate < today).length,
      planned: inScopeMode.reduce((a, b) => a + b.plannedHours, 0),
      logged: state.timeEntries
        .filter((t) => scope.visibleEmployeeIds.includes(t.employeeId))
        .filter((t) => inScopeMode.some((a) => a.id === t.activityId))
        .reduce((a, b) => a + b.hours, 0),
    }),
    [inScopeMode, state.timeEntries, scope.visibleEmployeeIds, today],
  );

  const visibleRows = rows.slice(0, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        eyebrow="Activity register"
        title="Every task, meeting, seminar and follow-up"
        description="The single register behind all calendars. Each row carries an owner, a department, planned hours and calendar-sync state so workload and audit stay traceable."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => {
                activitiesToCSV(rows, state);
                toast.push({ tone: 'success', title: 'Register exported', description: `${rows.length} activities written to CSV.` });
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button
              size="sm"
              onClick={() => {
                downloadICS(rows, state.employees, 'orbit-register.ics');
                toast.push({
                  tone: 'info',
                  title: 'iCalendar file generated',
                  description: 'Import the .ics into Outlook or Google Calendar to verify the event mapping.',
                });
              }}
            >
              <CalendarClock className="h-3.5 w-3.5" /> .ics
            </Button>
            <Button size="sm" variant="primary" onClick={onNewActivity}>
              <Plus className="h-3.5 w-3.5" /> New activity
            </Button>
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'In register', value: stats.total, tone: 'text-slate-900' },
          { label: 'In progress', value: stats.inProgress, tone: 'text-sky-600' },
          { label: 'Blocked', value: stats.blocked, tone: 'text-rose-600' },
          { label: 'Overdue', value: stats.overdue, tone: 'text-rose-600' },
          { label: 'Planned hours', value: `${stats.planned}h`, tone: 'text-slate-900' },
          { label: 'Logged hours', value: `${Math.round(stats.logged)}h`, tone: 'text-emerald-600' },
        ].map((s) => (
          <Card key={s.label} className="!px-3 !py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{s.label}</div>
            <div className={`mt-0.5 text-lg font-semibold tabular-nums ${s.tone}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="mb-3 !py-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search title, owner, department…" className="min-w-[220px] flex-1" />
          <div className="w-[170px]">
            <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
              <option value="all">All types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[150px]">
            <Select value={status} onChange={(e) => { setStatus(e.target.value as TaskStatus | 'all'); setPage(1); }}>
              <option value="all">Any status</option>
              {Object.entries(STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[140px]">
            <Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              <option value="all">Any priority</option>
              {['critical', 'high', 'medium', 'low'].map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[190px]">
            <Select value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1); }}>
              <option value="all">Any employee</option>
              {state.employees
                .filter((e) => scope.visibleEmployeeIds.includes(e.id))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </Select>
          </div>
          <Tabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'open', label: 'Open' },
              { id: 'period', label: 'This period' },
            ]}
            value={scopeMode}
            onChange={(v) => {
              setScopeMode(v as typeof scopeMode);
              setPage(1);
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <span>
            {rows.length} of {scoped.length} activities · period {periodLabel(anchor, filters.period)} ({toISO(range.start)} → {toISO(range.end)})
          </span>
          {(status !== 'all' || type !== 'all' || priority !== 'all' || assignee !== 'all' || query) && (
            <button
              onClick={() => {
                setStatus('all');
                setType('all');
                setPriority('all');
                setAssignee('all');
                setQuery('');
                setFilters({ employeeId: 'all' });
              }}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-200"
            >
              <X className="h-2.5 w-2.5" /> clear filters
            </button>
          )}
        </div>
      </Card>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {['Activity', 'Type', 'Department', 'Owner', 'Schedule', 'Planned', 'Progress', 'Status', 'Sync', ''].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-200 bg-slate-50/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((a) => {
                const dept = deptMap.get(a.departmentId);
                const emp = empMap.get(a.assigneeId);
                const overdue = a.status !== 'completed' && a.status !== 'cancelled' && a.endDate < today;
                const logged = state.timeEntries.filter((t) => t.activityId === a.id).reduce((s, t) => s + t.hours, 0);
                return (
                  <tr key={a.id} className="group transition-colors hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 py-2.5 pl-4 pr-3">
                      <button onClick={() => onOpenActivity(a.id)} className="block max-w-[280px] text-left">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-slate-800 group-hover:text-brand-700">{a.title}</span>
                          {a.priority === 'critical' ? <Badge tone="danger">critical</Badge> : null}
                          {overdue ? <Badge tone="danger">overdue</Badge> : null}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                          {a.subtasks.length ? (
                            <>
                              {a.subtasks.filter((s) => s.done).length}/{a.subtasks.length} subtasks
                            </>
                          ) : (
                            'no subtasks'
                          )}
                          {a.location ? <> · {a.location}</> : null}
                        </span>
                      </button>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[a.type].bg} ${TYPE_COLORS[a.type].text}`}>
                        <TypeIcon type={a.type} className="h-3 w-3" />
                        {TYPE_LABELS[a.type]}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-4 w-1 rounded-full" style={{ background: dept?.color }} />
                        <div className="min-w-0">
                          <div className="max-w-[140px] truncate text-[11px] font-medium text-slate-700">{dept?.name}</div>
                          <div className="text-[9px] text-slate-400">{dept?.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {emp ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={emp.name} color={emp.avatarColor} size={22} />
                          <div className="min-w-0">
                            <div className="max-w-[110px] truncate text-[11px] text-slate-700">{emp.name}</div>
                            <div className="text-[9px] capitalize text-slate-400">{emp.role.replace('_', ' ')}</div>
                          </div>
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <div className="text-[11px] text-slate-700">
                        {shortDate(a.startDate)}
                        {a.endDate !== a.startDate ? ` → ${shortDate(a.endDate)}` : ''}
                      </div>
                      <div className="text-[9px] text-slate-400">{a.startTime ? `${a.startTime}–${a.endTime}` : 'all day'}</div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <div className="text-[11px] font-medium tabular-nums text-slate-700">{a.plannedHours}h</div>
                      <div className={`text-[9px] tabular-nums ${logged > a.plannedHours ? 'text-rose-500' : 'text-slate-400'}`}>{logged}h logged</div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <div className="w-24">
                        <Progress
                          value={a.progress}
                          showLabel
                          tone={a.status === 'completed' ? 'good' : a.status === 'blocked' ? 'danger' : 'brand'}
                          height={5}
                        />
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <select
                        value={a.status}
                        onChange={(e) => updateActivityStatus(a.id, e.target.value as TaskStatus)}
                        className={`rounded-md border-0 py-1 pl-1.5 pr-6 text-[10px] font-medium focus:ring-1 focus:ring-brand-300 ${
                          a.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : a.status === 'blocked'
                              ? 'bg-rose-50 text-rose-700'
                              : a.status === 'in_progress'
                                ? 'bg-sky-50 text-sky-700'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {Object.entries(STATUS_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <SyncPips activity={a} />
                        <button
                          onClick={() => {
                            pushToCalendars(a.id);
                            toast.push({ tone: 'success', title: 'Pushed to calendars', description: `${a.title} was sent to the connected calendar providers.` });
                          }}
                          title="Push to connected calendars"
                          className="rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-brand-600"
                        >
                          <Send className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 py-2.5 pl-2 pr-4 text-right">
                      <button onClick={() => onOpenActivity(a.id)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit activity">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ListChecks className="h-5 w-5" />}
              title="No activities match the filters"
              description="Try clearing filters, widening the period or creating the first activity for this department."
              action={<Button size="sm" variant="primary" onClick={onNewActivity}>Create activity</Button>}
            />
          </div>
        ) : null}
        {visibleRows.length < rows.length ? (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button size="sm" onClick={() => setPage((p) => p + 1)}>
              Load {Math.min(PAGE_SIZE, rows.length - visibleRows.length)} more of {rows.length}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
