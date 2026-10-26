import React, { useMemo, useState } from 'react';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  Plane,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useScopedState, useStore } from '../store';
import type { AppFilters, LeaveRequest, LeaveStatus, LeaveType } from '../types';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPE_SHORT,
  approvalQueue,
  awayOnDate,
  coverOptions,
  leaveBreakdown,
  leaveOnDate,
  leavesFor,
  nextResponsible,
  publicHolidaysInRange,
  ptoSummary,
} from '../lib/leave';
import { fromISO, prettyDate, shortDate, toISO } from '../lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, PageHeader, SectionHeader, Select, StatCard, Tabs, Textarea } from '../components/ui';
import { useToast } from '../components/toast';
import { ROLE_LABELS } from '../lib/permissions';

type LeaveTab = 'mine' | 'approvals' | 'team';

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const statusTone = (status: LeaveStatus) => LEAVE_STATUS_TONES[status];

function StatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge tone={statusTone(status)}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

function TypeBadge({ type }: { type: LeaveType }) {
  const tone = type === 'annual' ? 'brand' : type === 'sick' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{LEAVE_TYPE_SHORT[type]}</Badge>;
}

/** Leave calendar month grid: PTO chips, PH badges and pending requests. */
function MonthGrid({
  month,
  employees,
  leaves,
  holidays,
  onSelectDay,
  selectedDay,
}: {
  month: Date;
  employees: { id: string; name: string; avatarColor: string }[];
  leaves: LeaveRequest[];
  holidays: { date: string; name: string; countryCode: string }[];
  onSelectDay: (iso: string) => void;
  selectedDay: string;
}) {
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let day = gridStart; day <= gridEnd; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    days.push(day);
  }
  const nameOf = new Map(employees.map((employee) => [employee.id, employee]));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="px-2 py-1.5 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const iso = toISO(day);
          const inMonth = day.getMonth() === month.getMonth();
          const holiday = holidays.find((row) => row.date === iso);
          const onLeave = leaves.filter(
            (leave) => leave.status === 'approved' && leave.startDate <= iso && leave.endDate >= iso,
          );
          const pending = leaves.filter(
            (leave) => leave.status === 'pending' && leave.startDate <= iso && leave.endDate >= iso,
          );
          const isToday = iso === toISO(new Date());
          return (
            <button
              key={iso}
              onClick={() => onSelectDay(iso)}
              className={`min-h-[92px] border-b border-l border-slate-100 p-1.5 text-left align-top transition-colors hover:bg-slate-50/80 ${
                inMonth ? 'bg-white' : 'bg-slate-50/40 text-slate-400'
              } ${iso === selectedDay ? 'ring-2 ring-inset ring-brand-400' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-semibold ${
                    isToday ? 'rounded bg-brand-600 px-1 text-white' : holiday ? 'text-rose-600' : 'text-slate-600'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                {holiday ? (
                  <span className="rounded bg-rose-50 px-1 text-[9px] font-semibold text-rose-600" title={holiday.name}>
                    PH
                  </span>
                ) : null}
              </div>
              {holiday ? (
                <div className="mt-0.5 truncate text-[9px] text-rose-500" title={`${holiday.name} (${holiday.countryCode})`}>
                  {holiday.name}
                </div>
              ) : null}
              <div className="mt-1 space-y-0.5">
                {onLeave.slice(0, 3).map((leave) => {
                  const person = nameOf.get(leave.employeeId);
                  return (
                    <div
                      key={leave.id}
                      title={`${person?.name ?? 'Team member'} · ${LEAVE_TYPE_LABELS[leave.type]} · ${leave.hours}h PTO`}
                      className="flex items-center gap-1 truncate rounded bg-violet-50 px-1 py-0.5 text-[9px] font-medium text-violet-700"
                    >
                      <span className="h-1.5 w-1.5 flex-none rounded-full bg-violet-500" />
                      <span className="truncate">{person?.name ?? 'On leave'}</span>
                    </div>
                  );
                })}
                {onLeave.length > 3 ? (
                  <div className="px-1 text-[9px] text-slate-400">+{onLeave.length - 3} more</div>
                ) : null}
                {pending.slice(0, 1).map((leave) => {
                  const person = nameOf.get(leave.employeeId);
                  return (
                    <div
                      key={leave.id}
                      className="truncate rounded border border-dashed border-amber-300 px-1 py-0.5 text-[9px] text-amber-700"
                      title="Tentative — waiting for line-manager approval"
                    >
                      ? {person?.name ?? 'Pending'}
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LeavePage({ filters }: { filters: AppFilters }) {
  const { state, scope, tenant, calendarDepartmentIds, submitLeave, decideLeave, cancelLeave, deleteLeave } = useStore();
  const scopedState = useScopedState();
  const toast = useToast();

  const [tab, setTab] = useState<LeaveTab>('mine');
  const [month, setMonth] = useState<Date>(() => fromISO(filters.anchor));
  const [selectedDay, setSelectedDay] = useState<string>(toISO(new Date()));

  const me = scope.user;
  const today = toISO(new Date());
  const year = new Date().getFullYear();

  /* ---- Draft request ---------------------------------------------- */
  const [type, setType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [delegateId, setDelegateId] = useState<string>('');
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});

  const business = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;

  const myLeaves = useMemo(() => leavesFor(state, me.id), [state, me.id]);
  const mySummary = useMemo(() => ptoSummary(state, me, tenant, year), [state, me, tenant, year]);
  const preview = useMemo(() => leaveBreakdown(state, me, startDate, endDate), [state, me, startDate, endDate]);
  const cover = useMemo(() => coverOptions(state, me), [state, me]);

  const overlapping = useMemo(
    () =>
      myLeaves.filter(
        (leave) =>
          (leave.status === 'pending' || leave.status === 'approved') &&
          leave.startDate <= endDate &&
          leave.endDate >= startDate,
      ),
    [myLeaves, startDate, endDate],
  );

  const teamEmployees = useMemo(
    () => scopedState.employees.filter((employee) => employee.status !== 'inactive'),
    [scopedState.employees],
  );
  const pendingForMe = useMemo(() => approvalQueue(state, scope), [state, scope]);
  const teamLeaves = useMemo(
    () => (state.leaves ?? []).filter((leave) => calendarDepartmentIds.includes(leave.departmentId)),
    [state.leaves, calendarDepartmentIds],
  );
  const awayToday = useMemo(
    () => awayOnDate(state, calendarDepartmentIds, today),
    [state, calendarDepartmentIds, today],
  );
  const monthHolidays = useMemo(
    () =>
      publicHolidaysInRange(
        state,
        toISO(startOfMonth(month)),
        toISO(endOfMonth(month)),
        Array.from(new Set(teamEmployees.map((employee) => employee.countryCode))),
      ),
    [state, month, teamEmployees],
  );

  const resetForm = () => {
    setType('annual');
    setStartDate(today);
    setEndDate(today);
    setReason('');
    setDelegateId('');
  };

  const submit = () => {
    if (!startDate || !endDate) return;
    if (fromISO(endDate) < fromISO(startDate)) {
      toast.push({ tone: 'error', title: 'End date is before the start date', description: 'Pick a valid range and try again.' });
      return;
    }
    if (preview.hours <= 0) {
      toast.push({
        tone: 'error',
        title: 'Nothing to book',
        description: 'The whole span is a weekend or a public holiday, so no PTO hours would be recorded.',
      });
      return;
    }
    if (overlapping.length) {
      toast.push({
        tone: 'error',
        title: 'Dates overlap an existing request',
        description: `${overlapping[0].startDate} → ${overlapping[0].endDate} already ${LEAVE_STATUS_LABELS[overlapping[0].status].toLowerCase()}.`,
      });
      return;
    }
    const created = submitLeave({ employeeId: me.id, startDate, endDate, type, reason, delegateId: delegateId || null });
    if (!created) return;
    toast.push({
      tone: 'success',
      title: 'Tentative date logged',
      description: `${prettyDate(startDate)} → ${prettyDate(endDate)} · ${created.hours}h PTO (${created.publicHolidayDays} public holiday day(s) excluded). Sent to your line manager for approval.`,
    });
    resetForm();
    setTab('mine');
  };

  const decide = (leave: LeaveRequest, decision: 'approved' | 'rejected') => {
    decideLeave(leave.id, decision, decisionNote[leave.id] ?? '');
    toast.push({
      tone: decision === 'approved' ? 'success' : 'info',
      title: decision === 'approved' ? 'PTO approved' : 'Request rejected',
      description: `${prettyDate(leave.startDate)} → ${prettyDate(leave.endDate)} · ${leave.hours}h. The calendar and PTO balance update immediately.`,
    });
    setDecisionNote((prev) => ({ ...prev, [leave.id]: '' }));
  };

  const phHours = mySummary.publicHolidayHoursExcluded;

  return (
    <div>
      <PageHeader
        eyebrow="Leave & PTO"
        title="Holidays plan, PTO and public holidays"
        description={`Log a tentative date, let your line manager approve it, and it becomes approved holidays on every calendar in ${tenant?.name ?? 'the tenant'}. PTO hours exclude public holidays (shown as PH) and are counted in their own bucket.`}
        actions={
          <>
            <Badge tone="brand" className="!py-1">
              <ShieldCheck className="h-3 w-3" /> {tenant?.name ?? 'Tenant'} only
            </Badge>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setTab('mine');
                document.getElementById('leave-request-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              <CalendarPlus className="h-3.5 w-3.5" /> Plan a holiday
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="PTO entitlement"
          value={mySummary.entitlementHours}
          suffix="h"
          hint={`${mySummary.entitlementDays} working days · PH excluded`}
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard
          label="Approved PTO"
          value={mySummary.approvedPtoHours}
          suffix="h"
          hint={`${mySummary.approvedRequests} approved request(s)`}
          icon={<Plane className="h-4 w-4" />}
          tone="purple"
        />
        <StatCard
          label="Pending approval"
          value={mySummary.pendingPtoHours}
          suffix="h"
          hint={`${mySummary.pendingRequests} tentative date(s)`}
          icon={<Clock3 className="h-4 w-4" />}
          tone="warn"
        />
        <StatCard
          label="PTO remaining"
          value={mySummary.remainingPtoHours}
          suffix="h"
          hint={`${year} balance after approved leave`}
          icon={<CalendarCheck2 className="h-4 w-4" />}
          tone="good"
        />
        <StatCard
          label="PH excluded"
          value={phHours}
          suffix="h"
          hint="Public holidays inside your leave — never counted as PTO"
          icon={<Globe2 className="h-4 w-4" />}
          tone="danger"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs<LeaveTab>
          tabs={[
            { id: 'mine', label: 'My leave & PTO', count: myLeaves.length },
            { id: 'approvals', label: 'Approvals', count: pendingForMe.length },
            { id: 'team', label: 'Team calendar', count: awayToday.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {mySummary.otherApprovedHours ? (
            <Badge tone="neutral">
              <Stethoscope className="h-3 w-3" /> other approved absence {mySummary.otherApprovedHours}h (outside PTO)
            </Badge>
          ) : null}
          <Badge tone="neutral">{myLeaves.filter((leave) => leave.status === 'approved').length} approved</Badge>
        </div>
      </div>

      {tab === 'mine' ? (
        <div className="grid gap-3 xl:grid-cols-3">
          <div id="leave-request-form" className="xl:col-span-2">
          <Card>
            <SectionHeader
              title="Plan a holiday"
              subtitle="Pick a tentative date — nothing reaches the calendar until your line manager approves it."
              action={<Badge tone="warn">tentative until approved</Badge>}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Leave type">
                <Select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
                  {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((value) => (
                    <option key={value} value={value}>
                      {LEAVE_TYPE_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Who covers your work" hint="optional">
                <Select value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
                  <option value="">No named delegate</option>
                  {cover.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} · {ROLE_LABELS[employee.role]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="From">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value || today);
                    if (e.target.value > endDate) setEndDate(e.target.value);
                  }}
                />
              </Field>
              <Field label="To">
                <Input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value || startDate)} />
              </Field>
              <Field label="Reason / note" className="sm:col-span-2" hint="visible to your approver">
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Family holiday, medical appointment, exam…" />
              </Field>
            </div>

            <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-[11px] text-slate-600 sm:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Counting as PTO</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{preview.hours}h</div>
                <div className="text-[10px] text-slate-500">{business(preview.workingDays)} working</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">PH excluded</div>
                <div className="mt-0.5 text-sm font-semibold text-rose-600">{preview.publicHolidayDays} day(s)</div>
                <div className="text-[10px] text-slate-500">{preview.publicHolidayHours}h not counted</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Weekly off</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-700">{preview.weeklyOffDays} day(s)</div>
                <div className="text-[10px] text-slate-500">inside the range</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Balance after</div>
                <div className="mt-0.5 text-sm font-semibold text-emerald-600">
                  {Math.max(0, Math.round((mySummary.remainingPtoHours - (type === 'annual' ? preview.hours : 0)) * 10) / 10)}h
                </div>
                <div className="text-[10px] text-slate-500">of {mySummary.entitlementHours}h PTO</div>
              </div>
            </div>

            {overlapping.length ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
                These dates overlap an existing request ({overlapping[0].startDate} → {overlapping[0].endDate}). Cancel it first or choose
                another range.
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={submit} disabled={!startDate || !endDate || preview.hours <= 0}>
                <CalendarPlus className="h-3.5 w-3.5" /> Log tentative date
              </Button>
              <Button onClick={resetForm}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
              <span className="text-[10px] text-slate-400">
                Goes to your line manager for approval · public holidays are never counted as PTO
              </span>
            </div>
          </Card>
          </div>

          <Card>
            <SectionHeader title="How PTO is counted" subtitle="Straight from the workspace rules" />
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
              <li>
                <span className="font-semibold text-slate-800">PTO hours</span> = working days in the approved range × contracted daily
                hours ({Math.round((me.weeklyHours / 5) * 10) / 10}h/day for {me.weeklyHours}h/week).
              </li>
              <li>
                <span className="font-semibold text-slate-800">PH</span> = public holidays for {me.countryCode}. They show as PH on the
                calendar and are excluded from the PTO hours.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Weekly off</span> days are excluded too, so a Monday-to-Sunday break counts
                five working days.
              </li>
              <li>Sick, unpaid, parental and study leave are tracked but never draw down the PTO balance.</li>
              <li>Approved PTO is visible to your line manager, up to hire management, and to colleagues who need cover.</li>
            </ul>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-[11px] text-slate-600">
              <div className="font-semibold text-slate-800">Away today in your calendar scope</div>
              {awayToday.length === 0 ? (
                <div className="mt-1 text-slate-500">Nobody is on approved PTO today.</div>
              ) : (
                awayToday.slice(0, 4).map(({ employee, leave }) => {
                  const cover = nextResponsible(state, employee.id, today);
                  return (
                    <div key={leave.id} className="mt-1 flex items-center gap-1.5">
                      <Avatar name={employee.name} color={employee.avatarColor} size={18} />
                      <span className="truncate font-medium text-slate-700">{employee.name}</span>
                      <span className="text-slate-400">→</span>
                      <span className="truncate">{cover?.employee.name ?? 'no cover assigned'}</span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="xl:col-span-3" padded={false}>
            <div className="px-4 pt-3">
              <SectionHeader
                title="My leave requests"
                subtitle="Approved rows are PTO on the calendar for you and your management chain"
                action={<Badge tone="neutral">{myLeaves.length} record(s)</Badge>}
              />
            </div>
            {myLeaves.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No leave logged yet" description="Plan a tentative date above; it appears here as pending until your line manager decides." />
              </div>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[840px] border-separate border-spacing-0 text-left">
                  <thead>
                    <tr>
                      {['Dates', 'Type', 'PTO hours', 'PH excluded', 'Delegate', 'Status', 'Decision', ''].map((heading) => (
                        <th
                          key={heading}
                          className="border-b border-slate-200 bg-slate-50/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {myLeaves.map((leave) => {
                      const delegate = state.employees.find((employee) => employee.id === leave.delegateId);
                      const decider = state.employees.find((employee) => employee.id === leave.decidedById);
                      return (
                        <tr key={leave.id} className="hover:bg-slate-50/70">
                          <td className="border-b border-slate-100 py-2 pl-4 pr-3">
                            <div className="text-[11px] font-medium text-slate-800">
                              {shortDate(leave.startDate)} – {shortDate(leave.endDate)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {leave.workingDays} working day(s){leave.publicHolidayDays ? ` · ${leave.publicHolidayDays} PH` : ''}
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <TypeBadge type={leave.type} />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold tabular-nums text-slate-800">{leave.hours}h</td>
                          <td className="border-b border-slate-100 px-3 py-2 text-[11px] tabular-nums text-rose-600">
                            {leave.publicHolidayDays ? `${leave.publicHolidayHours}h` : '—'}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-600">{delegate?.name ?? '—'}</td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <StatusBadge status={leave.status} />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">
                            {decider ? `${decider.name} · ${leave.decidedAt ? shortDate(leave.decidedAt.slice(0, 10)) : ''}` : 'awaiting line manager'}
                            {leave.decisionNote ? <div className="text-slate-400">{leave.decisionNote}</div> : null}
                          </td>
                          <td className="border-b border-slate-100 py-2 pl-2 pr-4 text-right">
                            {leave.status === 'pending' || leave.status === 'approved' ? (
                              <button
                                onClick={() => {
                                  cancelLeave(leave.id);
                                  toast.push({ tone: 'info', title: 'Leave cancelled', description: 'It no longer appears as PTO on any calendar.' });
                                }}
                                className="rounded px-1.5 py-1 text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                              >
                                Cancel
                              </button>
                            ) : (
                              <button
                                onClick={() => deleteLeave(leave.id)}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Delete record"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'approvals' ? (
        <div className="grid gap-3">
          <Card padded={false}>
            <div className="px-4 pt-3">
              <SectionHeader
                title="Approval queue"
                subtitle="Tentative dates waiting on you — approving turns them into PTO for the whole management chain"
                action={<Badge tone={pendingForMe.length ? 'warn' : 'good'}>{pendingForMe.length} waiting</Badge>}
              />
            </div>
            {pendingForMe.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Nothing waiting on you"
                  description="Requests from your line, your department or the group appear here. Approvers see only the departments in their scope."
                  icon={<CheckCircle2 className="h-5 w-5" />}
                />
              </div>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {pendingForMe.map((leave) => {
                  const employee = state.employees.find((row) => row.id === leave.employeeId);
                  const department = state.departments.find((row) => row.id === leave.departmentId);
                  const delegate = state.employees.find((row) => row.id === leave.delegateId);
                  const clashes = awayOnDate(state, [leave.departmentId], leave.startDate).filter(
                    (row) => row.employee.id !== leave.employeeId,
                  );
                  return (
                    <div key={leave.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <Avatar name={employee?.name ?? 'Employee'} color={employee?.avatarColor} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-800">{employee?.name}</span>
                          <Badge tone="neutral">{department?.code}</Badge>
                          <TypeBadge type={leave.type} />
                          <StatusBadge status={leave.status} />
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-600">
                          <CalendarDays className="mr-1 inline h-3 w-3" /> {prettyDate(leave.startDate)} → {prettyDate(leave.endDate)} ·{' '}
                          <span className="font-semibold">{leave.hours}h PTO</span>
                          {leave.publicHolidayDays ? (
                            <span className="text-rose-600"> · {leave.publicHolidayDays} PH day(s) excluded</span>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {leave.reason || 'No reason given'} · delegate {delegate?.name ?? 'not set'} · submitted{' '}
                          {shortDate(leave.submittedAt.slice(0, 10))}
                        </div>
                        {clashes.length ? (
                          <div className="mt-1 text-[10px] text-amber-700">
                            Also away in {department?.code} on {shortDate(leave.startDate)}: {clashes.map((row) => row.employee.name).join(', ')} — check
                            cover before approving.
                          </div>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Input
                            value={decisionNote[leave.id] ?? ''}
                            onChange={(e) => setDecisionNote((prev) => ({ ...prev, [leave.id]: e.target.value }))}
                            placeholder="Decision note (optional)"
                            className="!w-[240px] !py-1 text-[11px]"
                          />
                          <Button size="sm" variant="primary" onClick={() => decide(leave, 'approved')}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve PTO
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => decide(leave, 'rejected')}>
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="px-4 pt-3">
              <SectionHeader title="Recently decided in your scope" subtitle="The audit trail behind the PTO balance" />
            </div>
            <div className="mt-2 divide-y divide-slate-100">
              {state.leaves
                .filter(
                  (leave) =>
                    leave.status !== 'pending' &&
                    scope.visibleDepartmentIds.includes(leave.departmentId) &&
                    scope.visibleEmployeeIds.includes(leave.employeeId),
                )
                .slice(0, 8)
                .map((leave) => {
                  const employee = state.employees.find((row) => row.id === leave.employeeId);
                  const decider = state.employees.find((row) => row.id === leave.decidedById);
                  return (
                    <div key={leave.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[11px]">
                      <Avatar name={employee?.name ?? ''} color={employee?.avatarColor} size={22} />
                      <span className="font-medium text-slate-800">{employee?.name}</span>
                      <span className="text-slate-500">
                        {shortDate(leave.startDate)} – {shortDate(leave.endDate)} · {leave.hours}h
                      </span>
                      <StatusBadge status={leave.status} />
                      <span className="ml-auto text-[10px] text-slate-400">
                        {decider ? `${decider.name} · ${leave.decidedAt ? shortDate(leave.decidedAt.slice(0, 10)) : ''}` : '—'}
                      </span>
                    </div>
                  );
                })}
              {state.leaves.filter((leave) => leave.status !== 'pending' && scope.visibleDepartmentIds.includes(leave.departmentId)).length ===
              0 ? (
                <div className="px-4 py-4 text-center text-[11px] text-slate-400">No decisions recorded yet.</div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'team' ? (
        <div className="grid gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2" padded={false}>
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
              <SectionHeader
                title="Team leave calendar"
                subtitle={`Approved PTO for everyone in the calendar scope · ${teamEmployees.length} people · public holidays shown as PH`}
              />
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" onClick={() => setMonth(addMonths(month, -1))} title="Previous month">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="min-w-[130px] text-center text-xs font-semibold text-slate-700">{format(month, 'MMMM yyyy')}</span>
                <Button size="sm" onClick={() => setMonth(addMonths(month, 1))} title="Next month">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-3 px-4 pb-4">
              <MonthGrid
                month={month}
                employees={teamEmployees}
                leaves={teamLeaves}
                holidays={monthHolidays}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-violet-500" /> approved PTO
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm border border-dashed border-amber-400 bg-amber-50" /> tentative (pending)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-rose-200" /> PH public holiday
                </span>
                <span className="ml-auto">
                  Selected day: <span className="font-medium text-slate-700">{prettyDate(selectedDay)}</span>
                </span>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <Card>
              <SectionHeader
                title="On leave today"
                subtitle="So anyone can see who is away and who to ask instead"
                action={<Badge tone="purple">{awayToday.length}</Badge>}
              />
              <div className="mt-2 space-y-2">
                {awayToday.length === 0 ? (
                  <p className="text-[11px] text-slate-500">Everybody in the calendar scope is available today.</p>
                ) : (
                  awayToday.map(({ employee, leave }) => {
                    const cover = nextResponsible(state, employee.id, today);
                    const department = state.departments.find((row) => row.id === employee.departmentId);
                    return (
                      <div key={leave.id} className="rounded-lg border border-slate-200 p-2">
                        <div className="flex items-center gap-1.5">
                          <Avatar name={employee.name} color={employee.avatarColor} size={22} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-medium text-slate-800">{employee.name}</div>
                            <div className="text-[10px] text-slate-500">
                              {department?.code} · {LEAVE_TYPE_LABELS[leave.type]}
                            </div>
                          </div>
                          <Badge tone="purple">{LEAVE_TYPE_SHORT[leave.type]}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-600">
                          <UserCheck className="h-3 w-3 text-emerald-600" />
                          Next responsible:
                          <span className="font-medium text-slate-800">{cover?.employee.name ?? 'no cover — ask the department head'}</span>
                          {cover ? <span className="text-slate-400">({cover.reason})</span> : null}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Back {prettyDate(toISO(new Date(new Date(`${leave.endDate}T00:00:00`).getTime() + 86_400_000)))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card>
              <SectionHeader title="Public holidays this month" subtitle="Excluded from every PTO calculation" />
              {monthHolidays.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-500">No public holiday in {format(month, 'MMMM yyyy')} for this team’s countries.</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {monthHolidays.map((holiday) => (
                    <div key={holiday.id} className="flex items-center gap-2 text-[11px]">
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">PH</span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">{holiday.name}</span>
                      <span className="text-slate-400">
                        {shortDate(holiday.date)} · {holiday.countryCode}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionHeader title="PTO by person" subtitle="Approved hours this year, public holidays excluded" />
              <div className="mt-2 max-h-[260px] space-y-1 overflow-y-auto pr-1">
                {teamEmployees
                  .map((employee) => ({ employee, summary: ptoSummary(state, employee, tenant, year) }))
                  .sort((a, b) => b.summary.approvedPtoHours - a.summary.approvedPtoHours)
                  .slice(0, 14)
                  .map(({ employee, summary }) => (
                    <div key={employee.id} className="flex items-center gap-1.5 text-[11px]">
                      <Avatar name={employee.name} color={employee.avatarColor} size={18} />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{employee.name}</span>
                      {summary.pendingRequests ? <Badge tone="warn">{summary.pendingRequests} pending</Badge> : null}
                      <span className="tabular-nums text-slate-500">
                        {summary.approvedPtoHours}h / {summary.entitlementHours}h
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          </div>

          <Card className="xl:col-span-3">
            <SectionHeader
              title={`Everyone visible on ${prettyDate(selectedDay)}`}
              subtitle="Approved PTO is visible to colleagues across the calendar scope so blockers and assistance are known in advance"
              action={<Badge tone="neutral">{teamEmployees.length} people · {leavesOnDay(teamLeaves, selectedDay).length} away</Badge>}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {teamEmployees.map((employee) => {
                const leave = leaveOnDate({ leaves: teamLeaves }, employee.id, selectedDay);
                const department = state.departments.find((row) => row.id === employee.departmentId);
                return (
                  <span
                    key={employee.id}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] ring-1 ring-inset ${
                      leave ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-white text-slate-600 ring-slate-200'
                    }`}
                  >
                    <Avatar name={employee.name} color={employee.avatarColor} size={16} />
                    {employee.name}
                    <span className="text-slate-400">{department?.code}</span>
                    {leave ? <span className="font-semibold">PTO</span> : null}
                  </span>
                );
              })}
            </div>
            <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
              <Users className="h-3 w-3" /> Only this tenant’s people appear here — no cross-tenant resources are ever shown.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function leavesOnDay(leaves: LeaveRequest[], iso: string) {
  return leaves.filter((leave) => leave.status === 'approved' && leave.startDate <= iso && leave.endDate >= iso);
}
