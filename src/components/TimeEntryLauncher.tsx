import React, { useState } from 'react';
import { Clock3, Plus } from 'lucide-react';
import { useStore } from '../store';
import type { TimeEntry } from '../types';
import { canLogForEmployee } from '../lib/permissions';
import { Button, EmptyState, Modal } from './ui';
import { TimeEntryModal } from './TimeEntryModal';

/** Available above every tab: add a row or edit an existing ledger entry. */
export function TimeEntryLauncher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, scope } = useStore();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const entries = state.timeEntries
    .filter((entry) => canLogForEmployee(state, scope.user.id, entry.employeeId))
    .slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
  const startEdit = (entry: TimeEntry | null) => { setEditing(entry); setEditorOpen(true); };
  return <>
    <Modal open={open && !editorOpen} onClose={onClose} title="Log or update time" subtitle="The same timesheet ledger is available from every tab." width="max-w-2xl"
      footer={<><Button size="sm" onClick={onClose}>Close</Button><Button size="sm" variant="primary" onClick={() => startEdit(null)}><Plus className="h-3.5 w-3.5" /> Log time</Button></>}>
      <div className="max-h-[380px] space-y-1 overflow-y-auto">
        {entries.map((entry) => {
          const activity = state.activities.find((row) => row.id === entry.activityId);
          const employee = state.employees.find((row) => row.id === entry.employeeId);
          return <button key={entry.id} type="button" onClick={() => startEdit(entry)} className="flex w-full items-center gap-3 rounded-lg border border-slate-100 p-2 text-left hover:bg-slate-50">
            <Clock3 className="h-4 w-4 text-brand-600" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{activity?.title ?? 'Activity'}</span><span className="text-[10px] text-slate-500">{entry.date} · {employee?.name ?? 'Employee'}</span></span><span className="text-xs font-semibold">{entry.hours}h</span><span className="text-xs text-brand-700">Edit</span>
          </button>;
        })}
        {!entries.length ? <EmptyState title="No time entries yet" description="Log actual effort against one of your activities." /> : null}
      </div>
      {entries.length === 100 ? <p className="mt-2 text-[10px] text-slate-500">Showing the latest 100 entries. Older entries are available in Timesheets.</p> : null}
    </Modal>
    <TimeEntryModal open={open && editorOpen} entry={editing} onClose={() => { setEditorOpen(false); setEditing(null); }} />
  </>;
}
