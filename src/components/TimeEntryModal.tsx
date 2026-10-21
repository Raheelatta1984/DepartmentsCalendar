import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Trash2 } from 'lucide-react';
import { newId, useStore } from '../store';
import type { TimeEntry } from '../types';
import { TYPE_LABELS, capacityHoursFor } from '../lib/analytics';
import { workingDays } from '../lib/dates';
import { Badge, Button, Field, Input, Modal, Select, Textarea, Toggle } from './ui';

export function TimeEntryModal({
  open,
  onClose,
  entry,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  entry?: TimeEntry | null;
  defaults?: Partial<TimeEntry>;
}) {
  const { state, scope, addTimeEntry, deleteTimeEntry } = useStore();
  const [draft, setDraft] = useState<TimeEntry>({
    id: newId('te'),
    employeeId: state.settings.activeUserId,
    activityId: state.activities[0]?.id ?? '',
    date: new Date().toISOString().slice(0, 10),
    hours: 2,
    note: '',
    billable: true,
    approved: false,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setDraft(
      entry ?? {
        id: newId('te'),
        employeeId: defaults?.employeeId ?? state.settings.activeUserId,
        activityId: defaults?.activityId ?? '',
        date: defaults?.date ?? new Date().toISOString().slice(0, 10),
        hours: defaults?.hours ?? 2,
        note: '',
        billable: true,
        approved: false,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id, defaults?.date, defaults?.employeeId]);

  const employees = state.employees.filter(
    (e) => scope.visibleEmployeeIds.includes(e.id) && e.status !== 'inactive',
  );
  const employee = state.employees.find((e) => e.id === draft.employeeId) ?? employees[0];
  const activities = useMemo(
    () =>
      state.activities
        .filter((a) => a.assigneeId === draft.employeeId)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [state.activities, draft.employeeId],
  );

  useEffect(() => {
    if (!activities.some((a) => a.id === draft.activityId)) {
      setDraft((d) => ({ ...d, activityId: activities[0]?.id ?? '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.employeeId, activities.length]);

  const activity = state.activities.find((a) => a.id === draft.activityId);
  const existingSameDay = state.timeEntries
    .filter((t) => t.employeeId === draft.employeeId && t.date === draft.date && t.id !== draft.id)
    .reduce((s, t) => s + t.hours, 0);
  const cfg = state.countries.find((c) => c.code === employee?.countryCode);
  const holiday = state.holidays.find((h) => h.countryCode === employee?.countryCode && h.date === draft.date && h.type !== 'weekly_off');
  const dailyCapacity = (employee?.weeklyHours ?? 45) / 5;
  const projected = existingSameDay + Number(draft.hours || 0);

  const save = () => {
    if (!employee) return setError('Select an employee.');
    if (!draft.activityId) return setError('Pick the activity this time belongs to.');
    if (draft.hours <= 0) return setError('Hours must be greater than zero.');
    if (!draft.date) return setError('Select a date.');
    addTimeEntry({ ...draft, hours: Number(draft.hours), activityId: draft.activityId, employeeId: employee.id });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit time entry' : 'Log time'}
      subtitle="Timesheet rows are what performance is measured on — planned hours alone do not prove delivery."
      width="max-w-xl"
      footer={
        <>
          {entry ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('Delete this time entry?')) {
                  deleteTimeEntry(entry.id);
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
          <Button size="sm" variant="primary" onClick={save}>
            <Check className="h-3.5 w-3.5" /> {entry ? 'Save' : 'Log time'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee">
            <Select
              value={draft.employeeId}
              onChange={(e) => setDraft((d) => ({ ...d, employeeId: e.target.value, activityId: '' }))}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
          </Field>
        </div>

        <Field label="Activity" hint={activity ? `${TYPE_LABELS[activity.type]} · ${activity.plannedHours}h planned` : undefined}>
          <Select value={draft.activityId} onChange={(e) => setDraft((d) => ({ ...d, activityId: e.target.value }))}>
            <option value="">Select activity…</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {a.startDate}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hours" hint="0.5 steps">
            <Input
              type="number"
              min={0.5}
              step={0.5}
              max={16}
              value={draft.hours}
              onChange={(e) => setDraft((d) => ({ ...d, hours: Number(e.target.value) }))}
            />
          </Field>
          <div className="flex flex-col justify-end pb-1">
            <Toggle
              checked={draft.billable}
              onChange={(v) => setDraft((d) => ({ ...d, billable: v }))}
              label="Billable to client / project"
              description="Non-billable time still counts for utilization."
            />
          </div>
        </div>

        <Field label="What did you do?" hint="optional">
          <Textarea
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            placeholder="Outcome, blockers, decisions taken…"
            className="min-h-[64px]"
          />
        </Field>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <Clock3 className="h-3 w-3 text-slate-400" />
            <span>
              Daily capacity <strong>{dailyCapacity}h</strong> · already logged <strong>{existingSameDay}h</strong> · with this entry{' '}
              <strong className={projected > dailyCapacity ? 'text-rose-600' : 'text-slate-800'}>{projected}h</strong>
            </span>
            {projected > dailyCapacity ? <Badge tone="warn">over capacity</Badge> : null}
          </div>
          {holiday ? (
            <div className="mt-1 text-rose-600">
              {holiday.date} is a public holiday ({holiday.name}) in {employee?.countryCode} — logging time will reduce the utilization score.
            </div>
          ) : null}
          {!holiday && cfg && workingDays(draft.date, draft.date, cfg.weeklyOff, state.holidays, cfg.code) === 0 && !holiday ? (
            <div className="mt-1 text-amber-600">This is a weekly off day for {employee?.countryCode}.</div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
