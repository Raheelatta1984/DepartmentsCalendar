import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock3, Trash2, UserCheck } from 'lucide-react';
import { newId, useStore } from '../store';
import type { TimeEntry } from '../types';
import { TYPE_LABELS } from '../lib/analytics';
import { workingDays } from '../lib/dates';
import { workItemPath } from '../lib/delivery';
import { canLogForEmployee } from '../lib/permissions';
import { addHoursToTime, elapsedHours, timeWindowError } from '../lib/time';
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
  const [draft, setDraft] = useState<TimeEntry>(() => ({
    id: newId('te'),
    employeeId: state.settings.activeUserId,
    activityId: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: state.settings.workingDayStart,
    endTime: addHoursToTime(state.settings.workingDayStart, 2),
    hours: 2,
    note: '',
    billable: true,
    approved: false,
  }));
  const [error, setError] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    const openingActivityId = entry?.activityId ?? defaults?.activityId ?? '';
    const openingActivity = state.activities.find((activity) => activity.id === openingActivityId);
    setProjectFilter(openingActivity?.projectId ?? '');

    const requestedHours = entry?.hours ?? defaults?.hours ?? openingActivity?.plannedHours ?? 2;
    const startTime = entry?.startTime ?? defaults?.startTime ?? openingActivity?.startTime ?? state.settings.workingDayStart;
    const endTime = entry?.endTime ?? defaults?.endTime ?? openingActivity?.endTime ?? addHoursToTime(startTime, requestedHours);
    setDraft({
      id: entry?.id ?? newId('te'),
      employeeId: entry?.employeeId ?? defaults?.employeeId ?? state.settings.activeUserId,
      activityId: openingActivityId,
      date: entry?.date ?? defaults?.date ?? new Date().toISOString().slice(0, 10),
      startTime,
      endTime,
      hours: entry?.hours ?? elapsedHours(startTime, endTime) ?? requestedHours,
      note: entry?.note ?? defaults?.note ?? '',
      billable: entry?.billable ?? defaults?.billable ?? true,
      approved: entry?.approved ?? false,
      loggedById: entry?.loggedById,
      createdAt: entry?.createdAt,
      updatedAt: entry?.updatedAt,
    });
    // The modal deliberately initialises only when opened or its target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id, defaults?.date, defaults?.employeeId, defaults?.activityId]);

  /* Shared calendars remain read-only here. Only self and the actual reporting
     team are valid targets, even when a colleague shared their calendar. */
  const employees = state.employees.filter(
    (employee) => canLogForEmployee(state, scope.user.id, employee.id) && employee.status !== 'inactive',
  );
  const employee = state.employees.find((row) => row.id === draft.employeeId) ?? employees[0];
  const activities = useMemo(
    () => state.activities
      .filter((activity) => activity.assigneeId === draft.employeeId || Boolean(
        entry && activity.id === entry.activityId && draft.employeeId === entry.employeeId,
      ))
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [state.activities, draft.employeeId, entry],
  );

  const projects = useMemo(
    () => state.projects
      .filter((project) => project.departmentId === employee?.departmentId || project.entityId === employee?.entityId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [state.projects, employee?.departmentId, employee?.entityId],
  );

  const visibleActivities = useMemo(
    () => projectFilter ? activities.filter((activity) => activity.projectId === projectFilter) : activities,
    [activities, projectFilter],
  );

  useEffect(() => {
    if (!visibleActivities.some((activity) => activity.id === draft.activityId)) {
      setDraft((current) => ({ ...current, activityId: visibleActivities[0]?.id ?? '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.employeeId, visibleActivities.length, projectFilter]);

  const activity = state.activities.find((row) => row.id === draft.activityId);
  const existingSameDay = state.timeEntries
    .filter((time) => time.employeeId === draft.employeeId && time.date === draft.date && time.id !== draft.id)
    .reduce((sum, time) => sum + time.hours, 0);
  const cfg = state.countries.find((country) => country.code === employee?.countryCode);
  const holiday = state.holidays.find((row) => row.countryCode === employee?.countryCode && row.date === draft.date && row.type !== 'weekly_off');
  const dailyCapacity = (employee?.weeklyHours ?? 45) / 5;
  const projected = existingSameDay + Number(draft.hours || 0);
  const calculatedHours = elapsedHours(draft.startTime, draft.endTime);
  const mismatch = timeWindowError(draft.hours, draft.startTime, draft.endTime, { requireWindow: true });
  const canManageEntry = employee ? canLogForEmployee(state, scope.user.id, employee.id) : false;

  const setWindow = (startTime: string, endTime: string) => {
    const hours = elapsedHours(startTime, endTime);
    setError('');
    setDraft((current) => ({ ...current, startTime, endTime, ...(hours !== null ? { hours } : {}) }));
  };

  const save = () => {
    if (!employee || !canManageEntry) return setError('You can log time only for yourself or your reporting team.');
    if (!draft.activityId) return setError('Pick the activity this time belongs to.');
    if (!draft.date) return setError('Select a date.');
    if (draft.hours <= 0) return setError('Hours must be greater than zero.');
    if (mismatch) return setError(mismatch);
    const result = addTimeEntry({ ...draft, hours: Number(draft.hours), employeeId: employee.id });
    if (result) return setError(result);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit time entry' : 'Log time'}
      subtitle="Start and end times calculate actual hours. A manually edited duration must still match before the entry can be saved."
      width="max-w-2xl"
      footer={
        <>
          {entry && canManageEntry ? (
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
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={save}>
            <Check className="h-3.5 w-3.5" /> {entry ? 'Save' : 'Log time'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
        {employee && employee.id !== scope.user.id ? (
          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
            <UserCheck className="mt-0.5 h-3.5 w-3.5 flex-none" />
            Logging on behalf of <strong>{employee.name}</strong> as their reporting lead. Your identity is retained on the entry and in the audit trail.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee" hint="self or reporting team only">
            <Select
              value={draft.employeeId}
              onChange={(event) => setDraft((current) => ({ ...current, employeeId: event.target.value, activityId: '' }))}
            >
              {employees.map((row) => <option key={row.id} value={row.id}>{row.name}{row.id === scope.user.id ? ' (you)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
          </Field>
        </div>

        <Field label="Project" hint="Optional — link the effort to an IT project for capitalisation">
          <Select
            value={projectFilter}
            onChange={(event) => {
              const next = event.target.value;
              setProjectFilter(next);
              const first = next ? activities.find((row) => row.projectId === next) : undefined;
              if (first) setDraft((current) => ({ ...current, activityId: first.id }));
            }}
          >
            <option value="">No project / department activity</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name} {project.portfolio === 'capital' ? '(capital)' : '(operational)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Project task / activity" hint={activity ? `${TYPE_LABELS[activity.type]} · ${activity.plannedHours}h planned · current assignee` : undefined}>
          <Select value={draft.activityId} onChange={(event) => setDraft((current) => ({ ...current, activityId: event.target.value }))}>
            <option value="">Select activity…</option>
            {visibleActivities.map((row) => (
              <option key={row.id} value={row.id}>
                {row.projectPhase ? `[${row.projectPhase}] ` : ''}{row.title} · {row.startDate}{row.assigneeId !== draft.employeeId ? ' · historical assignment' : ''}
              </option>
            ))}
          </Select>
        </Field>

        {activity?.workItemId ? (
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2 text-[10px] text-indigo-700">
            <span className="font-semibold">Effort rolls up to</span>
            {workItemPath(state.workItems, activity.workItemId).map((item) => <Badge key={item.id} tone="info">{item.kind} · {item.title}</Badge>)}
          </div>
        ) : null}

        {activity?.projectId ? (
          <div className={`rounded-lg px-3 py-2 text-[11px] ${activity.capitalisable ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>
            <strong>{activity.capitalisable ? 'Capitalisable effort' : 'Expensed effort'}</strong> · {state.projects.find((project) => project.id === activity.projectId)?.code} · phase <span className="capitalize">{activity.projectPhase ?? 'support'}</span>.
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Start time">
              <Input
                type="time"
                value={draft.startTime ?? ''}
                onChange={(event) => setWindow(event.target.value, draft.endTime ?? '')}
                required
              />
            </Field>
            <Field label="End time">
              <Input
                type="time"
                value={draft.endTime ?? ''}
                onChange={(event) => setWindow(draft.startTime ?? '', event.target.value)}
                required
              />
            </Field>
            <Field label="Actual hours" hint={calculatedHours !== null ? `window = ${calculatedHours}h` : 'check times'}>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                max={24}
                value={draft.hours}
                onChange={(event) => {
                  setError('');
                  setDraft((current) => ({ ...current, hours: Number(event.target.value) }));
                }}
                aria-describedby="time-window-status"
                required
              />
            </Field>
          </div>
          <div id="time-window-status" aria-live="polite" className={`mt-2 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px] ${mismatch ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
            {mismatch ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> : <Check className="mt-0.5 h-3.5 w-3.5 flex-none" />}
            <span>{mismatch ?? `Time window and hours match (${calculatedHours}h). Changing either time recalculates hours automatically.`}</span>
          </div>
        </div>

        <Toggle
          checked={draft.billable}
          onChange={(value) => setDraft((current) => ({ ...current, billable: value }))}
          label="Billable to client / project"
          description="Non-billable time still counts for utilization."
        />

        <Field label="What did you do?" hint="optional">
          <Textarea
            value={draft.note}
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            placeholder="Outcome, blockers, decisions taken…"
            className="min-h-[64px]"
          />
        </Field>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <Clock3 className="h-3 w-3 text-slate-400" />
            <span>Daily capacity <strong>{dailyCapacity}h</strong> · already logged <strong>{existingSameDay}h</strong> · with this entry <strong className={projected > dailyCapacity ? 'text-rose-600' : 'text-slate-800'}>{projected}h</strong></span>
            {projected > dailyCapacity ? <Badge tone="warn">over capacity</Badge> : null}
          </div>
          {holiday ? <div className="mt-1 text-rose-600">{holiday.date} is a public holiday ({holiday.name}) in {employee?.countryCode}.</div> : null}
          {!holiday && cfg && workingDays(draft.date, draft.date, cfg.weeklyOff, state.holidays, cfg.code) === 0 ? (
            <div className="mt-1 text-amber-600">This is a weekly off day for {employee?.countryCode}.</div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
