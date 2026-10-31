import React, { useState } from 'react';
import { Check, CheckCheck, Mail, MessageSquare, Plus } from 'lucide-react';
import { emptyEscalation, useStore } from '../store';
import { canViewEscalation, escalationChain } from '../lib/people-workflows';
import type { Escalation } from '../types';
import { Badge, Button, Card, EmptyState, Field, Modal, SectionHeader, Select, Textarea } from './ui';
import { useToast } from './toast';

export function EscalationPanel({ createOpen, onCreateChange, onEmail }: { createOpen: boolean; onCreateChange: (open: boolean) => void; onEmail: (row: Escalation) => void }) {
  const { state, scope, upsertEscalation, setEscalationStatus, addEscalationFollowUp } = useStore();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [followNote, setFollowNote] = useState('');
  const [targetId, setTargetId] = useState('');
  const [createTask, setCreateTask] = useState(true);
  const manager = state.employees.find((person) => person.id === scope.user.managerId);
  const escalations = state.escalations.filter((row) => canViewEscalation(state, scope.user.id, row)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = escalations.find((row) => row.id === activeId);
  const chain = active ? escalationChain(state, active) : [];
  const personName = (id: string | undefined) => state.employees.find((person) => person.id === id)?.name ?? 'Unknown';
  const startFollowUp = (row: Escalation) => { setActiveId(row.id); setFollowNote(''); setTargetId(row.raisedById ?? ''); setCreateTask(true); };
  const raise = () => {
    const draft = emptyEscalation(state, scope.user.departmentId);
    const error = upsertEscalation({ ...draft, note });
    if (error) { toast.push({ tone: 'error', title: 'Escalation not raised', description: error }); return; }
    setNote(''); onCreateChange(false);
    toast.push({ tone: 'success', title: 'Escalation raised', description: `An urgent follow-up activity was assigned to ${manager?.name ?? 'your reporting lead'}.` });
  };
  return <>
    <Card padded={false}>
      <div className="px-4 pt-4"><SectionHeader title="Reporting-line escalations" subtitle="Visible to the reporter and their leadership chain" action={<Button size="sm" onClick={() => onCreateChange(true)}><Plus className="h-3.5 w-3.5" /> Raise escalation</Button>} /></div>
      <div className="mt-2 max-h-[450px] divide-y divide-slate-100 overflow-y-auto">
        {escalations.map((row) => <div key={row.id} className="p-3">
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-800">{row.raisedById ? `${personName(row.raisedById)} → ${personName(row.recipients[0])}` : `Legacy · ${personName(row.recipients[0])}`}</span><Badge tone={row.status === 'open' ? 'danger' : row.status === 'acknowledged' ? 'warn' : 'good'}>{row.status}</Badge></div>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-600">{row.note}</p>
          <div className="mt-1 text-[10px] text-slate-400">{new Date(row.createdAt).toLocaleString()} · {row.followUps?.length ?? 0} follow-ups {row.followUpActivityId ? '· urgent follow-up created' : ''}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.raisedById ? <Button size="sm" onClick={() => onEmail(row)}><Mail className="h-3 w-3" /> Email preview</Button> : null}
            <Button size="sm" onClick={() => startFollowUp(row)}><MessageSquare className="h-3 w-3" /> Follow-up thread</Button>
            {row.status === 'open' ? <Button size="sm" onClick={() => setEscalationStatus(row.id, 'acknowledged')}><CheckCheck className="h-3 w-3" /> Acknowledge</Button> : null}
            {row.status !== 'closed' ? <Button size="sm" onClick={() => setEscalationStatus(row.id, 'closed')}><Check className="h-3 w-3" /> Close</Button> : null}
          </div>
        </div>)}
        {!escalations.length ? <div className="p-4"><EmptyState title="No reporting-line escalations" description="Raise a concern directly to your reporting lead." /></div> : null}
      </div>
    </Card>
    <Modal open={createOpen} onClose={() => onCreateChange(false)} title="Raise an escalation" subtitle="Escalations always go to your immediate reporting lead, not an arbitrary recipient." width="max-w-xl"
      footer={<><Button size="sm" onClick={() => onCreateChange(false)}>Cancel</Button><Button size="sm" variant="primary" disabled={!manager || !note.trim()} onClick={raise}>Raise urgent follow-up</Button></>}>
      <div className="space-y-3"><div className="rounded-lg bg-brand-50 p-3 text-xs text-brand-800">To: <strong>{manager?.name ?? 'No reporting lead configured'}</strong><br />An urgent follow-up activity is automatically assigned to this person. Their leadership chain can follow up.</div>
      <Field label="What needs attention?"><Textarea aria-label="Escalation concern" value={note} maxLength={10000} onChange={(event) => setNote(event.target.value)} placeholder="Describe the concern and the support needed…" /></Field>
      {!manager ? <p className="text-xs text-amber-700">Ask an administrator to set your reporting lead in Organisation before escalating.</p> : null}</div>
    </Modal>
    <Modal open={Boolean(active)} onClose={() => setActiveId(null)} title="Escalation follow-up" subtitle="Notes and optional urgent actions stay on this reporting line." width="max-w-2xl"
      footer={<><Button size="sm" onClick={() => setActiveId(null)}>Close</Button>{chain.length ? <Button size="sm" variant="primary" disabled={!targetId || !followNote.trim()} onClick={() => {
        if (!active) return; const error = addEscalationFollowUp(active.id, targetId, followNote, createTask);
        if (error) toast.push({ tone: 'error', title: 'Follow-up not saved', description: error });
        else { setFollowNote(''); toast.push({ tone: 'success', title: createTask ? 'Follow-up and activity created' : 'Follow-up saved' }); }
      }}>Add follow-up</Button> : null}</>}>
      {active ? <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase text-slate-500">Top-to-bottom reporting line</div><p className="mt-1 text-xs text-slate-700">{chain.length ? [...chain].reverse().map((person) => person.name).join(' → ') : 'This legacy escalation does not record a reporter or reporting chain.'}</p></div>
        <p className="whitespace-pre-wrap text-xs text-slate-700">{active.note}</p>
        {(active.followUps ?? []).map((follow) => <div key={follow.id} className="rounded-lg border border-slate-200 p-2.5"><div className="text-[10px] font-semibold text-brand-700">{personName(follow.authorId)} → {personName(follow.targetId)} · {new Date(follow.createdAt).toLocaleString()}</div><p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{follow.note}</p>{follow.activityId ? <span className="text-[10px] text-rose-600">Urgent follow-up activity created</span> : null}</div>)}
        {chain.length ? <><Field label="Follow up with"><Select aria-label="Follow-up recipient" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{[...chain].reverse().map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></Field><Field label="Note or action"><Textarea aria-label="Follow-up note or action" value={followNote} maxLength={10000} onChange={(event) => setFollowNote(event.target.value)} placeholder="Record a decision, support request or action…" /></Field><label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={createTask} onChange={(event) => setCreateTask(event.target.checked)} /> Create an urgent follow-up activity for this person</label></> : null}
      </div> : null}
    </Modal>
  </>;
}
