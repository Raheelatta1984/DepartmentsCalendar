import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  LifeBuoy,
  Megaphone,
  MessagesSquare,
  Plus,
  Send,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { addDays } from 'date-fns';
import { useStore, emptyStandup, newId } from '../store';
import type { StandupActionItem, StandupEntry, SupportRequest, SupportRequestStatus } from '../types';
import {
  ROLE_LABELS,
  canEditStandupEntry,
  canResolveSupportRequest,
  canViewStandupBoard,
} from '../lib/permissions';
import {
  buildDepartmentPulse,
  buildStandupPulses,
  entryFor,
  isWorkingDay,
  openActions,
  openSupport,
  standupLayers,
  type DepartmentStandupPulse,
} from '../lib/standups';
import { fromISO, prettyDate, toISO } from '../lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Progress, SectionHeader, Select, Tabs, Textarea } from '../components/ui';
import { useToast } from '../components/toast';

type StandupTab = 'mine' | 'board' | 'pulse';

/** Reads an optional ?department= pre-selection handed over from the dashboard. */
function departmentFromHash(): string | null {
  const query = window.location.hash.split('?')[1] ?? '';
  const value = new URLSearchParams(query).get('department');
  return value && value !== 'all' ? value : null;
}

function DateNavigator({ date, onChange }: { date: string; onChange: (iso: string) => void }) {
  const today = toISO(new Date());
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
      <button
        className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
        onClick={() => onChange(toISO(addDays(fromISO(date), -1)))}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <Input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="!w-[158px] !border-0 !py-1 !shadow-none"
        aria-label="Stand-up date"
      />
      <button
        className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => onChange(toISO(addDays(fromISO(date), 1)))}
        disabled={date >= today}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My stand-up — every member's daily check-in form                    */
/* ------------------------------------------------------------------ */

function MyStandupTab({ date }: { date: string }) {
  const { state, scope, upsertStandup } = useStore();
  const toast = useToast();
  const me = scope.user;
  const existing = entryFor(state.standups, date, me.id);
  const workingDay = isWorkingDay(state, date, me.countryCode);

  const [draft, setDraft] = useState<StandupEntry>(() => existing ?? emptyStandup(state, date));

  useEffect(() => {
    setDraft(existing ?? emptyStandup(state, date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, me.id, existing?.updatedAt]);

  const patch = (part: Partial<StandupEntry>) => setDraft((prev) => ({ ...prev, ...part }));

  const updateAction = (actionId: string, part: Partial<StandupActionItem>) =>
    patch({ actionItems: draft.actionItems.map((a) => (a.id === actionId ? { ...a, ...part } : a)) });
  const removeAction = (actionId: string) => patch({ actionItems: draft.actionItems.filter((a) => a.id !== actionId) });
  const addAction = () =>
    patch({
      actionItems: [
        ...draft.actionItems,
        { id: newId('sact'), title: '', ownerId: me.id, dueDate: date, status: 'open' },
      ],
    });

  const updateRequest = (requestId: string, part: Partial<SupportRequest>) =>
    patch({ supportRequests: draft.supportRequests.map((r) => (r.id === requestId ? { ...r, ...part } : r)) });
  const removeRequest = (requestId: string) =>
    patch({ supportRequests: draft.supportRequests.filter((r) => r.id !== requestId) });
  const addRequest = () =>
    patch({
      supportRequests: [
        ...draft.supportRequests,
        {
          id: newId('ssup'),
          description: '',
          type: 'internal',
          targetDepartmentId: null,
          status: 'open',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        },
      ],
    });

  const cleanEntry = (status: StandupEntry['status']): StandupEntry => ({
    ...draft,
    departmentId: me.departmentId,
    employeeId: me.id,
    actionItems: draft.actionItems.filter((a) => a.title.trim().length > 0),
    supportRequests: draft.supportRequests.filter((r) => r.description.trim().length > 0),
    status,
    submittedAt: status === 'submitted' ? existing?.submittedAt ?? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  });

  const save = (status: StandupEntry['status']) => {
    const entry = cleanEntry(status);
    if (status === 'submitted') {
      if (!entry.lastDayUpdate.trim() || !entry.progressUpdate.trim()) {
        toast.push({ tone: 'error', title: 'Stand-up needs both updates', description: 'Share your last working day update and a progress update before submitting.' });
        return;
      }
    }
    upsertStandup(entry);
    toast.push({
      tone: 'success',
      title: status === 'submitted' ? `Stand-up submitted for ${prettyDate(date)}` : 'Draft saved',
      description: status === 'submitted' ? 'Your department leadership can now track today’s update.' : 'Only you can see this until it is submitted.',
    });
  };

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <SectionHeader
          title="My daily stand-up"
          subtitle={`${prettyDate(date)} · ${state.departments.find((d) => d.id === me.departmentId)?.name ?? 'Your department'}`}
          action={
            existing?.status === 'submitted' ? (
              <Badge tone="good" dot>
                Submitted {existing.submittedAt ? new Date(existing.submittedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
              </Badge>
            ) : existing ? (
              <Badge tone="warn" dot>
                Draft
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Not started
              </Badge>
            )
          }
        />
        {!workingDay ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            {prettyDate(date)} is a weekly off or public holiday in your country. Stand-ups are normally only recorded on working days.
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          <Field label="Last working day — what did you complete?" hint="Share the activity and outcomes from the previous working day">
            <Textarea
              value={draft.lastDayUpdate}
              onChange={(e) => patch({ lastDayUpdate: e.target.value })}
              placeholder="e.g. Closed the vendor reconciliation and circulated the monthly close checklist…"
            />
          </Field>
          <Field label="Progress update" hint="Where your current deliverables stand against plan">
            <Textarea
              value={draft.progressUpdate}
              onChange={(e) => patch({ progressUpdate: e.target.value })}
              placeholder="e.g. Payment run preparation is 70% complete; on track for the Thursday cut-off…"
            />
          </Field>
          <Field label="Blockers" hint="Leave empty if nothing is blocking you">
            <Textarea
              value={draft.blockers}
              onChange={(e) => patch({ blockers: e.target.value })}
              placeholder="e.g. Waiting on IT access approval before the next task can start…"
            />
          </Field>

          {/* Action items of the day */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">Action items for the day</span>
              <Button size="sm" variant="ghost" onClick={addAction} className="!px-2 !py-1">
                <Plus className="h-3.5 w-3.5" /> Add action
              </Button>
            </div>
            <div className="space-y-2">
              {draft.actionItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[11px] text-slate-400">
                  No action items yet — add what you commit to close today.
                </p>
              ) : null}
              {draft.actionItems.map((action) => (
                <div key={action.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                  <Input
                    value={action.title}
                    onChange={(e) => updateAction(action.id, { title: e.target.value })}
                    placeholder="Action item — what will be done and by when"
                    className="!py-1.5 text-xs"
                  />
                  <Input
                    type="date"
                    value={action.dueDate ?? ''}
                    onChange={(e) => updateAction(action.id, { dueDate: e.target.value || null })}
                    className="!w-[140px] !py-1.5 text-xs"
                    aria-label="Due date"
                  />
                  <IconX onClick={() => removeAction(action.id)} label="Remove action item" />
                </div>
              ))}
            </div>
          </div>

          {/* Support requests / callouts */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">Support requests &amp; callouts</span>
              <Button size="sm" variant="ghost" onClick={addRequest} className="!px-2 !py-1">
                <LifeBuoy className="h-3.5 w-3.5" /> Raise support
              </Button>
            </div>
            <div className="space-y-2">
              {draft.supportRequests.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[11px] text-slate-400">
                  No support raised. Use this for help inside your department or a cross-functional callout to another team.
                </p>
              ) : null}
              {draft.supportRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={request.description}
                      onChange={(e) => updateRequest(request.id, { description: e.target.value })}
                      placeholder="Describe the support you need…"
                      className="min-h-[56px] !py-1.5 text-xs"
                    />
                    <IconX onClick={() => removeRequest(request.id)} label="Remove support request" />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Select
                      value={request.type}
                      onChange={(e) =>
                        updateRequest(request.id, {
                          type: e.target.value as SupportRequest['type'],
                          targetDepartmentId: e.target.value === 'internal' ? null : request.targetDepartmentId,
                        })
                      }
                      aria-label="Support type"
                    >
                      <option value="internal">Within my department</option>
                      <option value="cross_functional">Cross-functional support</option>
                    </Select>
                    {request.type === 'cross_functional' ? (
                      <Select
                        value={request.targetDepartmentId ?? ''}
                        onChange={(e) => updateRequest(request.id, { targetDepartmentId: e.target.value || null })}
                        aria-label="Target department"
                      >
                        <option value="">Which department?</option>
                        {state.departments
                          .filter((dept) => dept.id !== me.departmentId)
                          .map((dept) => (
                            <option key={dept.id} value={dept.id}>
                              {dept.name} · {dept.code}
                            </option>
                          ))}
                      </Select>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={() => save('draft')}>
            Save draft
          </Button>
          <Button variant="primary" onClick={() => save('submitted')}>
            <CheckCircle2 className="h-4 w-4" /> Submit stand-up
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <Card>
          <SectionHeader title="How the daily stand-up works" subtitle="The same rhythm in every department" />
          <ol className="mt-3 space-y-2.5 text-[11px] leading-snug text-slate-600">
            {[
              'Share what you completed on the last working day.',
              'Give a progress update against your current deliverables.',
              'Flag blockers, or state clearly that you are unblocked.',
              'Raise support — internal help or a cross-functional callout.',
              'List the action items you commit to for the day.',
            ].map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <SectionHeader title="Who sees this" subtitle="Role-based, department-scoped visibility" />
          <ul className="mt-3 space-y-2 text-[11px] leading-snug text-slate-600">
            <li className="flex gap-2">
              <UserCheck className="mt-0.5 h-3.5 w-3.5 flex-none text-brand-500" />
              Your supervisor, manager and department head track the whole department.
            </li>
            <li className="flex gap-2">
              <Users className="mt-0.5 h-3.5 w-3.5 flex-none text-brand-500" />
              The CEO and COO see the high-level pulse and drill in department by department.
            </li>
            <li className="flex gap-2">
              <MessagesSquare className="mt-0.5 h-3.5 w-3.5 flex-none text-brand-500" />
              Other team members only see their own stand-up form.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function IconX({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex-none rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pulse strip used on the board and executive summary         */
/* ------------------------------------------------------------------ */

function PulseTiles({ pulse }: { pulse: DepartmentStandupPulse }) {
  const tiles = [
    { label: 'Submitted', value: `${pulse.submittedCount}/${pulse.memberCount}`, tone: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Pending', value: String(pulse.pendingCount + pulse.draftCount), tone: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Blockers', value: String(pulse.blockerCount), tone: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Open support', value: String(pulse.openSupportCount), tone: 'text-sky-600', bg: 'bg-sky-50' },
    { label: 'Open actions', value: String(pulse.openActionCount), tone: 'text-brand-700', bg: 'bg-brand-50' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className={`rounded-lg ${tile.bg} px-3 py-2.5`}>
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{tile.label}</div>
          <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tile.tone}`}>{tile.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One member's stand-up, expanded top-to-bottom on the board          */
/* ------------------------------------------------------------------ */

function StandupDetail({ entry, departmentId }: { entry: StandupEntry; departmentId: string }) {
  const { state, scope, setSupportRequestStatus, toggleStandupAction } = useStore();
  const canResolve = canResolveSupportRequest(scope, departmentId);
  const canToggle = canResolve || canEditStandupEntry(scope, entry.employeeId);
  const deptMap = new Map(state.departments.map((d) => [d.id, d]));

  const nextStatus = (status: SupportRequestStatus): SupportRequestStatus =>
    status === 'open' ? 'acknowledged' : status === 'acknowledged' ? 'resolved' : 'open';

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <DetailBlock label="Last working day">{entry.lastDayUpdate}</DetailBlock>
        <DetailBlock label="Progress update">{entry.progressUpdate}</DetailBlock>
      </div>
      {entry.blockers.trim() ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700">
            <AlertTriangle className="h-3 w-3" /> Blocker
          </div>
          <p className="mt-1 text-[11px] leading-snug text-rose-900">{entry.blockers}</p>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] font-medium text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" /> No blockers raised
        </div>
      )}

      {entry.actionItems.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <ClipboardList className="h-3 w-3" /> Action items
          </div>
          <ul className="space-y-1">
            {entry.actionItems.map((action) => (
              <li key={action.id} className="flex items-center gap-2 text-[11px] text-slate-700">
                <button
                  type="button"
                  disabled={!canToggle}
                  onClick={() => toggleStandupAction(entry.id, action.id)}
                  className="flex-none disabled:cursor-default"
                  aria-label={action.status === 'done' ? 'Mark action open' : 'Mark action done'}
                >
                  {action.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-300" />
                  )}
                </button>
                <span className={action.status === 'done' ? 'text-slate-400 line-through' : ''}>{action.title}</span>
                {action.dueDate ? <span className="ml-auto flex-none text-[10px] text-slate-400">due {action.dueDate}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {entry.supportRequests.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <LifeBuoy className="h-3 w-3" /> Support callouts
          </div>
          <ul className="space-y-1.5">
            {entry.supportRequests.map((request) => (
              <li key={request.id} className="rounded-lg border border-sky-200 bg-sky-50/60 px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-700">{request.description}</p>
                  <Badge tone={request.type === 'cross_functional' ? 'purple' : 'info'}>
                    {request.type === 'cross_functional'
                      ? `Cross-functional → ${deptMap.get(request.targetDepartmentId ?? '')?.code ?? 'team'}`
                      : 'Internal'}
                  </Badge>
                  <Badge tone={request.status === 'resolved' ? 'good' : request.status === 'acknowledged' ? 'warn' : 'danger'}>
                    {request.status.replace('_', ' ')}
                  </Badge>
                </div>
                {canResolve && request.status !== 'resolved' ? (
                  <div className="mt-1.5 flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="!px-2 !py-1 !text-[10px]"
                      onClick={() => setSupportRequestStatus(entry.id, request.id, nextStatus(request.status))}
                    >
                      {request.status === 'open' ? 'Acknowledge' : 'Mark resolved'}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <p className="mt-1 text-[11px] leading-snug text-slate-700">{children || <span className="text-slate-300">Not provided</span>}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Department board — leadership only, top-to-bottom employee layers   */
/* ------------------------------------------------------------------ */

function DepartmentBoardTab({
  date,
  departmentId,
  onDepartmentChange,
  onDateChange,
}: {
  date: string;
  departmentId: string;
  onDepartmentChange: (id: string) => void;
  onDateChange: (iso: string) => void;
}) {
  const { state, scope } = useStore();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const department = state.departments.find((d) => d.id === departmentId) ?? scope.visibleDepartments[0];
  const pulse = useMemo(
    () => (department ? buildDepartmentPulse(state, department.id, date) : null),
    [state, department, date],
  );
  const layers = useMemo(
    () => (department ? standupLayers(state, department, date) : []),
    [state, department, date],
  );
  const head = state.employees.find((e) => e.id === department?.headId);

  if (!department || !pulse) {
    return (
      <Card>
        <EmptyState
          icon={<MessagesSquare className="h-5 w-5" />}
          title="No department in your scope"
          description="Your role does not currently track any department. Switch profile from the avatar menu to a supervisor, manager or department head persona."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="!py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[240px] flex-1">
            <Select value={department.id} onChange={(e) => onDepartmentChange(e.target.value)} aria-label="Department">
              {scope.visibleDepartments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} · {dept.code}
                </option>
              ))}
            </Select>
          </div>
          <DateNavigator date={date} onChange={onDateChange} />
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-500">
            <Avatar name={head?.name ?? 'Unassigned'} color={head?.avatarColor ?? '#94a3b8'} size={22} />
            <span>Head: <span className="font-medium text-slate-700">{head?.name ?? 'Unassigned'}</span></span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          title={`Stand-up pulse · ${department.name}`}
          subtitle={prettyDate(date)}
          action={
            <div className="w-44">
              <Progress value={pulse.submissionRate} tone={pulse.submissionRate >= 80 ? 'good' : pulse.submissionRate >= 50 ? 'warn' : 'danger'} showLabel height={6} />
            </div>
          }
        />
        <div className="mt-3">
          <PulseTiles pulse={pulse} />
        </div>
        {pulse.crossFunctionalCount > 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2 text-[11px] text-violet-800">
            <Megaphone className="h-3.5 w-3.5 flex-none" />
            {pulse.crossFunctionalCount} cross-functional support callout{pulse.crossFunctionalCount === 1 ? '' : 's'} need another department’s attention today.
          </div>
        ) : null}
      </Card>

      {layers.map((layer) => (
        <Card key={layer.role} padded={false}>
          <div className="flex items-center justify-between px-4 pt-4">
            <SectionHeader title={layer.label} subtitle={`${layer.members.length} ${layer.members.length === 1 ? 'person' : 'people'}`} />
            <Badge tone="neutral">{ROLE_LABELS[layer.role]}</Badge>
          </div>
          <div className="divide-y divide-slate-100 px-2 pb-2 pt-1">
            {layer.members.map(({ employee, entry }) => {
              const open = openId === employee.id;
              const working = isWorkingDay(state, date, employee.countryCode);
              const status = !working ? (
                <Badge tone="neutral">Non-working day</Badge>
              ) : entry?.status === 'submitted' ? (
                <Badge tone="good" dot>
                  Submitted
                </Badge>
              ) : entry ? (
                <Badge tone="warn" dot>
                  Draft
                </Badge>
              ) : (
                <Badge tone="danger" dot>
                  Pending
                </Badge>
              );
              const toggleRow = () => setOpenId(open ? null : employee.id);
              return (
                <div key={employee.id} className="rounded-lg">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={toggleRow}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleRow();
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    <Avatar name={employee.name} color={employee.avatarColor} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-slate-800">{employee.name}</div>
                      <div className="truncate text-[10px] text-slate-400">{employee.code} · {ROLE_LABELS[employee.role]}</div>
                    </div>
                    {entry ? (
                      <span className="hidden items-center gap-2 sm:flex">
                        {entry.blockers.trim() ? (
                          <span className="flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-medium text-rose-600">
                            <AlertTriangle className="h-2.5 w-2.5" /> {entry.blockers.trim() ? '1 blocker' : ''}
                          </span>
                        ) : null}
                        {openSupport(entry).length ? (
                          <span className="flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-medium text-sky-600">
                            <LifeBuoy className="h-2.5 w-2.5" /> {openSupport(entry).length} support
                          </span>
                        ) : null}
                        {openActions(entry).length ? (
                          <span className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                            <ClipboardList className="h-2.5 w-2.5" /> {openActions(entry).length} actions
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {status}
                    {!entry && working ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toast.push({ tone: 'info', title: `Reminder queued for ${employee.name}`, description: 'A stand-up reminder will be sent through the workspace notification channel.' });
                        }}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-white hover:text-slate-800"
                      >
                        <Send className="h-3 w-3" /> Remind
                      </button>
                    ) : null}
                    <ChevronDown className={`h-4 w-4 flex-none text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                  {open && entry ? (
                    <div className="px-2 pb-3">
                      <StandupDetail entry={entry} departmentId={department.id} />
                    </div>
                  ) : null}
                  {open && !entry && working ? (
                    <div className="px-2 pb-3">
                      <EmptyState
                        icon={<Circle className="h-4 w-4" />}
                        title="No stand-up submitted"
                        description={`${employee.name} has not recorded a stand-up for ${prettyDate(date)} yet.`}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Executive pulse — CEO / COO high-level department summary           */
/* ------------------------------------------------------------------ */

function ExecutivePulseTab({ date, onOpenDepartment }: { date: string; onOpenDepartment: (id: string) => void }) {
  const { state, scope } = useStore();
  const pulses = useMemo(
    () => buildStandupPulses(state, scope.visibleDepartments.map((d) => d.id), date),
    [state, scope.visibleDepartments, date],
  );
  const totals = pulses.reduce(
    (acc, pulse) => {
      acc.members += pulse.memberCount;
      acc.submitted += pulse.submittedCount;
      acc.blockers += pulse.blockerCount;
      acc.support += pulse.openSupportCount;
      acc.cross += pulse.crossFunctionalCount;
      acc.pending += pulse.pendingCount + pulse.draftCount;
      return acc;
    },
    { members: 0, submitted: 0, blockers: 0, support: 0, cross: 0, pending: 0 },
  );
  const rate = totals.members ? Math.round((totals.submitted / totals.members) * 100) : 0;
  const deptMap = new Map(state.departments.map((d) => [d.id, d]));
  const empMap = new Map(state.employees.map((e) => [e.id, e]));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile label="Group submission" value={`${rate}%`} hint={`${totals.submitted} of ${totals.members} people`} tone="brand" />
        <SummaryTile label="Pending check-ins" value={String(totals.pending)} hint="Draft or not started" tone="warn" />
        <SummaryTile label="Blockers raised" value={String(totals.blockers)} hint="Across submitted stand-ups" tone="danger" />
        <SummaryTile label="Open support" value={String(totals.support)} hint={`${totals.cross} cross-functional`} tone="info" />
        <SummaryTile label="Departments" value={String(pulses.length)} hint="In your responsibility scope" tone="neutral" />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4">
          <SectionHeader
            title="Department stand-up summary"
            subtitle={`High-level callouts for ${prettyDate(date)} — open a department to read every layer, top to bottom`}
          />
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {pulses.map((pulse) => {
            const dept = deptMap.get(pulse.departmentId);
            if (!dept) return null;
            const head = empMap.get(dept.headId ?? '');
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => onOpenDepartment(dept.id)}
                className="rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                <div className="flex items-center gap-2">
                  <span className="h-8 w-1 rounded-full" style={{ background: dept.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-slate-800">{dept.name}</div>
                    <div className="truncate text-[10px] text-slate-400">
                      {dept.code} · {head?.name ?? 'Unassigned head'}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Submission</span>
                    <span className="font-semibold tabular-nums text-slate-700">{pulse.submissionRate}%</span>
                  </div>
                  <Progress value={pulse.submissionRate} tone={pulse.submissionRate >= 80 ? 'good' : pulse.submissionRate >= 50 ? 'warn' : 'danger'} height={5} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Pill active={pulse.pendingCount + pulse.draftCount > 0} tone="amber">
                    {pulse.pendingCount + pulse.draftCount} pending
                  </Pill>
                  <Pill active={pulse.blockerCount > 0} tone="rose">
                    <AlertTriangle className="h-2.5 w-2.5" /> {pulse.blockerCount} blockers
                  </Pill>
                  <Pill active={pulse.openSupportCount > 0} tone="sky">
                    <LifeBuoy className="h-2.5 w-2.5" /> {pulse.openSupportCount} support
                  </Pill>
                  <Pill active={pulse.crossFunctionalCount > 0} tone="violet">
                    <Megaphone className="h-2.5 w-2.5" /> {pulse.crossFunctionalCount} cross
                  </Pill>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'brand' | 'warn' | 'danger' | 'info' | 'neutral' }) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    warn: 'bg-amber-50 text-amber-700',
    danger: 'bg-rose-50 text-rose-700',
    info: 'bg-sky-50 text-sky-700',
    neutral: 'bg-slate-100 text-slate-700',
  };
  return (
    <Card>
      <div className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${tones[tone]}`}>{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>
    </Card>
  );
}

function Pill({ children, active, tone }: { children: React.ReactNode; active: boolean; tone: 'amber' | 'rose' | 'sky' | 'violet' }) {
  if (!active) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">All clear</span>;
  const tones: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

export function StandupsPage() {
  const { scope } = useStore();
  const today = toISO(new Date());
  const [date, setDate] = useState(today);
  const isBoardViewer = canViewStandupBoard(scope);
  const isExecutive = scope.isGroupExecutive;

  const validDepartments = new Set(scope.visibleDepartments.map((d) => d.id));
  const hashDept = departmentFromHash();
  const [departmentId, setDepartmentId] = useState<string>(
    hashDept && validDepartments.has(hashDept) ? hashDept : scope.visibleDepartments[0]?.id ?? '',
  );
  useEffect(() => {
    if (departmentId && validDepartments.has(departmentId)) return;
    setDepartmentId(scope.visibleDepartments[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.user.id]);

  const defaultTab: StandupTab = isExecutive ? 'pulse' : isBoardViewer ? 'board' : 'mine';
  const [tab, setTab] = useState<StandupTab>(defaultTab);

  /* Profile switching changes which tabs exist — reset to the persona's
     landing tab so a CEO's pulse never stays active for an employee. */
  useEffect(() => {
    setTab(defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.user.id]);

  const tabs = [
    { id: 'mine' as const, label: 'My stand-up' },
    ...(isExecutive ? [{ id: 'pulse' as const, label: 'Executive pulse' }] : []),
    ...(isBoardViewer ? [{ id: 'board' as const, label: 'Department board' }] : []),
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Daily stand-up"
        title="Department stand-up & support callouts"
        description="A daily check-in per department: last working day updates, progress, blockers, support requests and the day's action items — visible to authorised department leadership and the CEO/COO only."
        actions={<DateNavigator date={date} onChange={setDate} />}
      />

      <Card className="mb-4 !py-3">
        <Tabs<StandupTab> guideSkip tabs={tabs} value={tab} onChange={setTab} />
      </Card>

      {tab === 'mine' ? <MyStandupTab date={date} /> : null}
      {tab === 'pulse' && isExecutive ? (
        <ExecutivePulseTab
          date={date}
          onOpenDepartment={(id) => {
            setDepartmentId(id);
            setTab('board');
          }}
        />
      ) : null}
      {tab === 'board' && isBoardViewer ? (
        <DepartmentBoardTab
          date={date}
          departmentId={departmentId}
          onDepartmentChange={setDepartmentId}
          onDateChange={setDate}
        />
      ) : null}
    </div>
  );
}
