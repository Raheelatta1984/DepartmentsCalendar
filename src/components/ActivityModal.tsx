import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CalendarX2, Check, Plus, Send, Trash2, X } from 'lucide-react';
import { emptyActivity, newId, useScopedState, useStore } from '../store';
import type { Activity, ActivityType, Priority, TaskStatus } from '../types';
import { TYPE_LABELS } from '../lib/analytics';
import { Badge, Button, Field, Input, Label, Modal, Select, Textarea, Toggle } from './ui';

const TYPES = Object.keys(TYPE_LABELS) as ActivityType[];
const STATUSES: { id: TaskStatus; label: string }[] = [
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];
const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export function ActivityModal({
  open,
  onClose,
  activity,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  activity?: Activity | null;
  defaults?: Partial<Activity>;
}) {
  const { scope, upsertActivity, deleteActivity, pushToCalendars } = useStore();
  /* Resources are only assignable inside the tenant's calendar scope. */
  const state = useScopedState();
  const [draft, setDraft] = useState<Activity>(() => emptyActivity(state, defaults));
  const [newSubtask, setNewSubtask] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setNewSubtask('');
    setDraft(activity ? { ...activity } : emptyActivity(state, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id]);

  const assignable = useMemo(() => {
    const rows = state.employees.filter((e) => scope.visibleEmployeeIds.includes(e.id) && e.status !== 'inactive');
    // Never silently re-assign an existing activity whose owner is no longer
    // in the calendar scope.
    const current = activity ? state.employees.find((e) => e.id === activity.assigneeId) : undefined;
    return current && !rows.some((e) => e.id === current.id) ? [current, ...rows] : rows;
  }, [state.employees, scope.visibleEmployeeIds, activity]);
  const assignee = state.employees.find((e) => e.id === draft.assigneeId) ?? assignable[0] ?? state.employees[0];
  const department = state.departments.find((d) => d.id === assignee?.departmentId);
  const entity = state.entities.find((e) => e.id === assignee?.entityId);
  const outlookConn = state.connections.find((c) => c.employeeId === assignee?.id && c.provider === 'outlook');
  const googleConn = state.connections.find((c) => c.employeeId === assignee?.id && c.provider === 'google');

  const patch = (p: Partial<Activity>) => setDraft((prev) => ({ ...prev, ...p }));

  const setAssignee = (id: string) => {
    const emp = state.employees.find((e) => e.id === id);
    if (!emp) return;
    patch({ assigneeId: id, departmentId: emp.departmentId, entityId: emp.entityId });
  };

  const handleSave = () => {
    if (!draft.title.trim()) {
      setError('Give the activity a title so it can be reviewed on the calendar.');
      return;
    }
    if (draft.endDate < draft.startDate) {
      setError('The end date cannot be before the start date.');
      return;
    }
    if (draft.plannedHours <= 0) {
      setError('Planned hours must be greater than zero for workload calculations.');
      return;
    }
    upsertActivity({
      ...draft,
      title: draft.title.trim(),
      progress: draft.status === 'completed' ? 100 : draft.progress,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={activity ? 'Edit activity' : 'Schedule new activity'}
      subtitle="Anything saved here appears on the department calendar, the roadmap and — when enabled — the assignee's Outlook / Google calendar."
      width="max-w-3xl"
      footer={
        <>
          {activity ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('Delete this activity and all of its logged time?')) {
                  deleteActivity(activity.id);
                  onClose();
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          {activity ? (
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                pushToCalendars(activity.id);
                onClose();
              }}
            >
              <Send className="h-3.5 w-3.5" /> Push to calendars
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={handleSave}>
            <Check className="h-3.5 w-3.5" /> {activity ? 'Save changes' : 'Create activity'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Activity title" className="sm:col-span-4">
            <Input
              value={draft.title}
              autoFocus
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="e.g. Month-end close review with finance"
            />
          </Field>
          <Field label="Type" className="sm:col-span-2">
            <Select value={draft.type} onChange={(e) => patch({ type: e.target.value as ActivityType })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description / expected outcome" hint="optional">
          <Textarea
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="What needs to be delivered, who is involved, and what does done look like?"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Assigned to">
            <Select value={draft.assigneeId} onChange={(e) => setAssignee(e.target.value)}>
              {assignable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {state.departments.find((d) => d.id === e.departmentId)?.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Input value={department?.name ?? '—'} disabled readOnly />
          </Field>
          <Field label="Legal entity">
            <Input value={entity?.name ?? '—'} disabled readOnly />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Start date">
            <Input type="date" value={draft.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
          </Field>
          <Field label="End date">
            <Input type="date" value={draft.endDate} onChange={(e) => patch({ endDate: e.target.value })} />
          </Field>
          <Field label="Start time" hint="optional">
            <Input type="time" value={draft.startTime ?? ''} onChange={(e) => patch({ startTime: e.target.value })} />
          </Field>
          <Field label="End time" hint="optional">
            <Input type="time" value={draft.endTime ?? ''} onChange={(e) => patch({ endTime: e.target.value })} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Planned hours" hint="drives workload">
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={draft.plannedHours}
              onChange={(e) => patch({ plannedHours: Number(e.target.value) })}
            />
          </Field>
          <Field label="Priority">
            <Select value={draft.priority} onChange={(e) => patch({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => patch({ status: e.target.value as TaskStatus })}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Progress" hint="%">
            <Input
              type="number"
              min={0}
              max={100}
              step={5}
              value={draft.progress}
              onChange={(e) => patch({ progress: Math.min(100, Math.max(0, Number(e.target.value))) })}
            />
          </Field>
        </div>

        <Field label="Location / channel" hint="optional">
          <Input value={draft.location ?? ''} onChange={(e) => patch({ location: e.target.value })} placeholder="Teams, Boardroom 2, client site…" />
        </Field>

        <div className="rounded-lg border border-slate-200 p-3">
          <Label hint={`${draft.subtasks.filter((s) => s.done).length}/${draft.subtasks.length} complete`}>Subtasks</Label>
          <div className="space-y-1.5">
            {draft.subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5">
                <button
                  onClick={() =>
                    patch({ subtasks: draft.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })
                  }
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${
                    s.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                  }`}
                  aria-label="Toggle subtask"
                >
                  {s.done ? <Check className="h-3 w-3" /> : null}
                </button>
                <span className={`flex-1 text-xs ${s.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{s.title}</span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={s.plannedHours}
                  onChange={(e) =>
                    patch({
                      subtasks: draft.subtasks.map((x) => (x.id === s.id ? { ...x, plannedHours: Number(e.target.value) } : x)),
                    })
                  }
                  className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[11px] tabular-nums"
                />
                <span className="text-[10px] text-slate-400">h</span>
                <button
                  onClick={() => patch({ subtasks: draft.subtasks.filter((x) => x.id !== s.id) })}
                  className="text-slate-300 hover:text-rose-500"
                  aria-label="Remove subtask"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {draft.subtasks.length === 0 ? (
              <p className="py-1 text-[11px] text-slate-400">No subtasks. Break work down so timesheet entries map to real deliverables.</p>
            ) : null}
          </div>
          <div className="mt-2 flex gap-1.5">
            <Input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Add a subtask and press Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSubtask.trim()) {
                  e.preventDefault();
                  patch({
                    subtasks: [...draft.subtasks, { id: newId('sub'), title: newSubtask.trim(), done: false, plannedHours: 1 }],
                  });
                  setNewSubtask('');
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                if (!newSubtask.trim()) return;
                patch({
                  subtasks: [...draft.subtasks, { id: newId('sub'), title: newSubtask.trim(), done: false, plannedHours: 1 }],
                });
                setNewSubtask('');
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <Label>Calendar sync</Label>
            <span className="text-[10px] text-slate-400">Events are mirrored on save</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <Toggle
                checked={draft.sync.outlook}
                onChange={(v) => patch({ sync: { ...draft.sync, outlook: v } })}
                label="Outlook / Microsoft 365"
                description={outlookConn?.status === 'connected' ? `Connected · ${outlookConn.accountEmail}` : 'Not connected for this employee'}
              />
              {outlookConn?.status === 'connected' ? (
                <CalendarCheck2 className="h-4 w-4 flex-none text-emerald-500" />
              ) : (
                <CalendarX2 className="h-4 w-4 flex-none text-slate-300" />
              )}
            </div>
            <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <Toggle
                checked={draft.sync.google}
                onChange={(v) => patch({ sync: { ...draft.sync, google: v } })}
                label="Google Calendar"
                description={googleConn?.status === 'connected' ? `Connected · ${googleConn.accountEmail}` : 'Not connected for this employee'}
              />
              {googleConn?.status === 'connected' ? (
                <CalendarCheck2 className="h-4 w-4 flex-none text-emerald-500" />
              ) : (
                <CalendarX2 className="h-4 w-4 flex-none text-slate-300" />
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
            <Badge tone="info">{department?.code}</Badge>
            {draft.startTime ? <Badge tone="neutral">{draft.startTime}–{draft.endTime}</Badge> : null}
            {draft.endDate > draft.startDate ? (
              <Badge tone="purple">multi-day · ends {draft.endDate}</Badge>
            ) : null}
            {draft.sync.outlook || draft.sync.google ? (
              <span>This activity will be written to the selected calendars for {assignee?.name}.</span>
            ) : (
              <span>Calendar sync is off — the activity stays inside Orbit only.</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
