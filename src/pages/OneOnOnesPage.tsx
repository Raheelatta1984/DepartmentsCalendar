import React, { useState } from 'react';
import { CalendarPlus, MessageSquare, Plus, Sparkles } from 'lucide-react';
import { newId, useStore } from '../store';
import type { OneOnOneSession } from '../types';
import { canReadOneOnOneNotes, canViewOneOnOne, feelingScale } from '../lib/people-workflows';
import { orgChain } from '../lib/org';
import { toISO } from '../lib/dates';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SectionHeader, Select, Textarea } from '../components/ui';
import { useToast } from '../components/toast';

const TOPICS = [
  ['workLifeBalance', 'Work-life balance'], ['support', 'Support needed'], ['escalation', 'Escalations'],
  ['discussion', 'Discussion'], ['improvement', 'Improvement area feedback'], ['careerProgression', 'Career progression tasks & advice'],
] as const;
type Topic = typeof TOPICS[number][0];

export function OneOnOnesPage({ onNewActivity }: { onNewActivity: (defaults: Record<string, unknown>) => void }) {
  const { state, scope, tenant, upsertOneOnOne } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<OneOnOneSession | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const candidates = state.employees.filter((person) => person.status !== 'inactive' && (person.id === scope.user.id ? Boolean(person.managerId) : person.managerId === scope.user.id));
  const sessions = state.oneOnOnes.filter((row) => canViewOneOnOne(state, scope.user.id, row)).slice().sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const viewing = sessions.find((row) => row.id === viewId);
  const personName = (id: string) => state.employees.find((person) => person.id === id)?.name ?? 'Unknown';
  const newSession = () => {
    const person = candidates.find((row) => row.id === scope.user.id) ?? candidates[0];
    if (!person?.managerId) return;
    const now = new Date().toISOString();
    setError(''); setDraft({ id: newId('one'), employeeId: person.id, managerId: person.managerId, departmentId: person.departmentId,
      date: toISO(new Date(now)), feeling: null, workLifeBalance: '', support: '', escalation: '', discussion: '', improvement: '', careerProgression: '',
      summary: '', summaryModel: '', summaryGeneratedAt: null, createdAt: now, updatedAt: now });
  };
  const patch = (part: Partial<OneOnOneSession>) => setDraft((row) => row ? { ...row, ...part } : row);
  const saveDraft = () => {
    if (!draft) return;
    const result = upsertOneOnOne(draft);
    if (result) { setError(result); return; }
    setDraft(null); toast.push({ tone: 'success', title: 'One-on-one saved', description: 'Only a generated summary is shown to leadership in the portal.' });
  };
  const generate = async () => {
    if (!draft || generating) return;
    if (!TOPICS.some(([key]) => draft[key].trim())) { setError('Add at least one discussion note before requesting an AI summary.'); return; }
    if (!confirm('Send these discussion notes to the configured AI provider? The generated summary will be shared with the reporting lead and their leadership chain.')) return;
    setError(''); setGenerating(true);
    try {
      const body: Record<string, string | number | null> = { feeling: draft.feeling };
      TOPICS.forEach(([key]) => { body[key] = draft[key]; });
      const response = await fetch('/api/one-on-one-summary', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(25_000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.summary !== 'string' || !result.summary.trim() || typeof result.model !== 'string') {
        throw new Error(result.message ?? result.error ?? 'AI summaries require a signed-in shared workspace and a configured server-side provider.');
      }
      const session = { ...draft, summary: result.summary, summaryModel: result.model, summaryGeneratedAt: new Date().toISOString() };
      const saveError = upsertOneOnOne(session);
      if (saveError) throw new Error(saveError);
      setDraft(null);
      toast.push({ tone: 'success', title: 'AI summary shared with the reporting leadership chain', description: 'Participants can review it in the session.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a summary. Your notes remain in this form.');
    } finally { setGenerating(false); }
  };

  return <div>
    <PageHeader eyebrow="People & wellbeing" title="One-on-one sessions" description="A structured check-in with your direct reporting lead, with a provider-generated summary for the leadership chain." actions={<Button size="sm" variant="primary" disabled={!candidates.length} onClick={newSession}><Plus className="h-3.5 w-3.5" /> New one-on-one</Button>} />
    <Card className="mb-4"><SectionHeader title="How sharing works" subtitle="Discuss balance, wellbeing, support, escalations, feedback and career development." />
      <p className="mt-2 text-xs leading-relaxed text-slate-600">The employee and direct lead can view and edit notes in the portal. Once requested, the AI summary is shown to that lead and their reporting ancestors; drafts are not shown to higher leaders. Generating sends the notes to the configured AI provider. This pilot uses a shared workspace password and switchable profiles, not individual sign-in; it is not suitable for confidential personnel information until per-user access controls are added.</p>
    </Card>
    <Card padded={false}><div className="px-4 pt-4"><SectionHeader title="Sessions" subtitle="Your sessions and summaries shared through your reporting line" action={<Badge>{sessions.length}</Badge>} /></div>
      <div className="divide-y divide-slate-100 p-2">{sessions.map((row) => {
        const participant = canReadOneOnOneNotes(row, scope.user.id);
        return <div key={row.id} className="flex flex-wrap items-center gap-2 p-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><MessageSquare className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-800">{personName(row.employeeId)} · {personName(row.managerId)}</div><div className="text-[10px] text-slate-500">{row.date} · {participant ? 'Participant' : 'Leadership summary'}</div></div>
          <Badge tone={row.summaryGeneratedAt ? 'good' : 'warn'}>{row.summaryGeneratedAt ? 'AI summary shared' : 'Draft · not shared upward'}</Badge>
          <Button size="sm" onClick={() => setViewId(row.id)}>View</Button>
          {participant ? <Button size="sm" onClick={() => { setError(''); setDraft({ ...row }); }}>Edit</Button> : null}
          {participant && row.careerProgression.trim() ? <Button size="sm" onClick={() => onNewActivity({ title: `Career progression · ${personName(row.employeeId)}`, description: row.careerProgression, assigneeId: row.employeeId, departmentId: row.departmentId, type: 'task' })}><CalendarPlus className="h-3 w-3" /> Create career task</Button> : null}
        </div>;
      })}{!sessions.length ? <div className="p-4"><EmptyState title="No one-on-ones yet" description={candidates.length ? 'Create a session with your reporting lead or direct report.' : 'A direct reporting line is needed to start a session.'} /></div> : null}</div>
    </Card>
    <Modal open={Boolean(draft)} onClose={() => { if (!generating) setDraft(null); }} title="One-on-one discussion" subtitle="Only the employee and direct reporting lead can edit the discussion." width="max-w-3xl"
      footer={<><Button size="sm" disabled={generating} onClick={() => setDraft(null)}>Cancel</Button><Button size="sm" disabled={generating} onClick={saveDraft}>Save draft</Button><Button size="sm" variant="primary" disabled={generating} onClick={generate}><Sparkles className="h-3.5 w-3.5" /> {generating ? 'Generating…' : 'Generate AI summary & share'}</Button></>}>
      {draft ? <div className="space-y-3">
        {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Employee"><Select aria-label="Session employee" disabled={state.oneOnOnes.some((row) => row.id === draft.id)} value={draft.employeeId} onChange={(event) => { const person = candidates.find((row) => row.id === event.target.value); if (person?.managerId) patch({ employeeId: person.id, managerId: person.managerId, departmentId: person.departmentId }); }}>{candidates.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></Field><Field label="Session date"><Input aria-label="Session date" type="date" value={draft.date} onChange={(event) => patch({ date: event.target.value })} /></Field></div>
        <div className="rounded-lg bg-brand-50 p-2 text-xs text-brand-800">Reporting lead: {personName(draft.managerId)} · Summary audience: {orgChain(state.employees, draft.managerId).map((person) => person.name).join(' → ') || 'none'}</div>
        <Field label="Feeling check-in"><Select aria-label="Session feeling" value={draft.feeling ?? ''} onChange={(event) => patch({ feeling: event.target.value ? Number(event.target.value) as OneOnOneSession['feeling'] : null })}><option value="">Not recorded</option>{feelingScale(tenant).map((option) => <option key={option.value} value={option.value}>{option.value} · {option.label}</option>)}</Select></Field>
        {TOPICS.map(([key, label]) => <Field key={key} label={label}><Textarea aria-label={label} maxLength={4000} value={draft[key as Topic]} onChange={(event) => patch({ [key]: event.target.value })} placeholder={`Discuss ${label.toLowerCase()}…`} /></Field>)}
        {draft.summaryGeneratedAt ? <p className="text-[10px] text-amber-700">Editing notes and saving without regenerating removes the old leadership summary until a new one is generated.</p> : null}
      </div> : null}
    </Modal>
    <Modal open={Boolean(viewing)} onClose={() => setViewId(null)} title="One-on-one session" subtitle={viewing ? `${personName(viewing.employeeId)} · ${viewing.date}` : ''} width="max-w-2xl" footer={<Button size="sm" onClick={() => setViewId(null)}>Close</Button>}>
      {viewing ? <div className="space-y-3">
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3"><div className="text-xs font-semibold text-brand-800">AI-generated leadership summary</div><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{viewing.summary || 'Not yet generated or shared.'}</p>{viewing.summaryGeneratedAt ? <div className="mt-2 text-[10px] text-slate-500">{viewing.summaryModel} · {new Date(viewing.summaryGeneratedAt).toLocaleString()}</div> : null}</div>
        {canReadOneOnOneNotes(viewing, scope.user.id) ? <><div className="text-xs text-slate-600">Feeling: {viewing.feeling ? feelingScale(tenant).find((option) => option.value === viewing.feeling)?.label : 'Not recorded'}</div>{TOPICS.map(([key, label]) => viewing[key] ? <div key={key}><div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div><p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{viewing[key]}</p></div> : null)}</> : <p className="text-xs text-slate-500">Discussion notes are shown only to the employee and direct lead in the portal.</p>}
      </div> : null}
    </Modal>
  </div>;
}
