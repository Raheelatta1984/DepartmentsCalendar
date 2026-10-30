import React, { useMemo, useState } from 'react';
import { endOfMonth, startOfMonth } from 'date-fns';
import { CalendarDays, ChartNoAxesCombined, Clock3, Download, Filter, Landmark, Users } from 'lucide-react';
import { useScopedState } from '../store';
import type { EffortDimension, EffortFilters, EffortGroup } from '../lib/delivery';
import { deliveryDepartments, effortReport, streamDescendants, streamPath, workItemDescendants } from '../lib/delivery';
import { currency, hoursLabel } from '../lib/capitalisation';
import { fromISO, toISO, weekRange } from '../lib/dates';
import { downloadCSV } from '../lib/export';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Progress, SectionHeader, Select, StatCard, Tabs, Toggle } from '../components/ui';

const DIMENSIONS: { id: EffortDimension; label: string }[] = [
  { id: 'epic', label: 'By epic' }, { id: 'feature', label: 'By feature' }, { id: 'ticket', label: 'By ticket' },
  { id: 'resource', label: 'By resource' }, { id: 'department', label: 'By department' }, { id: 'stream', label: 'By stream' }, { id: 'funding', label: 'By funding' },
];
export function EffortReportsPage() {
  const state = useScopedState();
  const initialWeek = weekRange(new Date(), state.settings.weekStartsOn);
  const [filters, setFilters] = useState<EffortFilters>({ start: toISO(initialWeek.start), end: toISO(initialWeek.end), departmentId: 'all', employeeId: 'all', streamId: 'all', epicId: 'all', featureId: 'all', ticketId: 'all', funding: 'all', approvedOnly: false });
  const [dimension, setDimension] = useState<EffortDimension>('epic');
  const [selected, setSelected] = useState<string | null>(null);
  const patch = (p: Partial<EffortFilters>) => { setFilters((prev) => ({ ...prev, ...p })); setSelected(null); };
  const departments = deliveryDepartments(state);
  const enabled = new Set(departments.map((d) => d.id));
  const items = state.workItems.filter((i) => enabled.has(i.departmentId));
  const report = useMemo(() => effortReport(state, filters), [state, filters]);
  const groups = useMemo(() => report.group(dimension), [report, dimension]);
  const selectedGroup = groups.find((g) => g.id === selected);
  const ledger = selectedGroup?.lines ?? report.lines;
  const invalidRange = !filters.start || !filters.end || filters.start > filters.end;
  const maxHours = Math.max(1, ...groups.map((g) => g.hours));
  const featureOptions = items.filter((i) => i.kind === 'feature' && (filters.epicId === 'all' || workItemDescendants(items, filters.epicId).has(i.id)));
  const ticketOptions = items.filter((i) => i.kind === 'ticket' && (filters.epicId === 'all' || workItemDescendants(items, filters.epicId).has(i.id)) && (filters.featureId === 'all' || workItemDescendants(items, filters.featureId).has(i.id)));
  const streamIds = filters.streamId === 'all' ? null : streamDescendants(state.deliveryStreams, filters.streamId);
  const resources = state.employees.filter((e) => enabled.has(e.departmentId) && (filters.departmentId === 'all' || e.departmentId === filters.departmentId) && (!streamIds || streamIds.has(e.streamId ?? '')));
  const setPeriod = (period: string) => {
    const today = new Date();
    const range = period === 'week' ? weekRange(today, state.settings.weekStartsOn) : { start: startOfMonth(today), end: endOfMonth(today) };
    patch({ start: toISO(range.start), end: toISO(range.end) });
  };
  const exportSummary = () => {
    const rows: (string | number)[][] = [
      ['Delivery effort summary', `${filters.start} to ${filters.end}`],
      ['Grouping', dimension], ['Approved actuals only', filters.approvedOnly ? 'Yes' : 'No'],
      ['Note', 'Ancestor rollups overlap. Do not add different grouping totals together. Plans are working-day prorated.'], [],
      ['Group', 'Context', 'Planned hours', 'Logged hours', 'Approved hours', 'Capex-tagged hours', 'Policy-eligible hours', 'Capitalised cost AUD', 'Contributing resources', 'Contributing departments'],
      ...groups.map((g) => [g.label, g.subtitle, g.plannedHours, g.hours, g.approvedHours, g.capexHours, g.eligibleHours, g.capitalisedCost, g.resources, g.departments]),
    ];
    downloadCSV(rows, `effort-by-${dimension}-${filters.start}.csv`);
  };
  const exportLedger = () => downloadCSV([
    ['Date / plan start', 'Resource', 'Home department', 'Executing stream', 'Activity', 'Epic', 'Feature', 'Ticket', 'Funding', 'Logged hours', 'Period planned hours', 'Approved', 'Policy eligible', 'Capitalised cost AUD', 'Row type'],
    ...ledger.map((l) => [l.date, l.employeeName, state.departments.find((d) => d.id === l.departmentId)?.name ?? '', streamPath(state.deliveryStreams, l.streamId).map((s) => s.name).join(' / '), l.activityTitle, items.find((i) => i.id === l.epicId)?.title ?? '', items.find((i) => i.id === l.featureId)?.title ?? '', items.find((i) => i.id === l.ticketId)?.title ?? '', l.funding, l.hours, Math.round(l.plannedHours * 100) / 100, l.approved ? 'Yes' : 'No', l.capexEligible ? 'Yes' : 'No', Math.round(l.capitalisedCost * 100) / 100, l.id.startsWith('plan-') ? 'Plan only' : 'Actual']),
  ], `effort-ledger-${filters.start}.csv`);
  return <div>
    <PageHeader eyebrow="Delivery intelligence · separate reporting workspace" title="Where the hours go" description="One actual-timesheet ledger, viewed by epic, feature, ticket, resource, department, stream or funding. See which teams contribute to shared outcomes without counting the same hour twice." actions={<><Button size="sm" onClick={exportLedger}><Download className="h-3.5 w-3.5" /> Export ledger</Button><Button size="sm" variant="primary" onClick={exportSummary} disabled={invalidRange}><ChartNoAxesCombined className="h-3.5 w-3.5" /> Export summary</Button></>} />
    {!departments.length ? <Card><EmptyState title="No delivery-enabled department in scope" description="Enable DevOps delivery in Master setup. Reports respect the tenant and calendar department scope." /></Card> : <>
      <Card className="mb-4"><div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionHeader title="Reporting filters" subtitle="Actuals use the timesheet date. Plans use the overlap with the activity’s working days." /><div className="flex gap-1"><Button size="sm" onClick={() => setPeriod('week')}>This week</Button><Button size="sm" onClick={() => setPeriod('month')}>This month</Button></div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Field label="From"><Input type="date" value={filters.start} onChange={(e) => patch({ start: e.target.value })} /></Field><Field label="To"><Input type="date" value={filters.end} onChange={(e) => patch({ end: e.target.value })} /></Field>
          <Field label="Resource department"><Select value={filters.departmentId} onChange={(e) => patch({ departmentId: e.target.value, employeeId: 'all', streamId: 'all' })}><option value="all">All contributing departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Resource"><Select value={filters.employeeId} onChange={(e) => patch({ employeeId: e.target.value })}><option value="all">All resources</option>{resources.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
          <Field label="Executing stream"><Select value={filters.streamId} onChange={(e) => patch({ streamId: e.target.value, employeeId: 'all' })}><option value="all">All streams + sub-streams</option>{state.deliveryStreams.filter((s) => enabled.has(s.departmentId) && (filters.departmentId === 'all' || s.departmentId === filters.departmentId)).map((s) => <option key={s.id} value={s.id}>{streamPath(state.deliveryStreams, s.id).map((x) => x.name).join(' / ')}</option>)}</Select></Field>
          <Field label="Funding"><Select value={filters.funding} onChange={(e) => patch({ funding: e.target.value as EffortFilters['funding'] })}><option value="all">All effort</option><option value="capex">Capex tagged</option><option value="opex">Opex tagged</option><option value="unclassified">Unclassified backlog</option><option value="unlinked">Unlinked / BAU</option></Select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Epic"><Select value={filters.epicId} onChange={(e) => patch({ epicId: e.target.value, featureId: 'all', ticketId: 'all' })}><option value="all">All epics</option>{items.filter((i) => i.kind === 'epic').map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</Select></Field><Field label="Feature"><Select value={filters.featureId} onChange={(e) => patch({ featureId: e.target.value, ticketId: 'all' })}><option value="all">All features</option>{featureOptions.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</Select></Field><Field label="Ticket"><Select value={filters.ticketId} onChange={(e) => patch({ ticketId: e.target.value })}><option value="all">All tickets</option>{ticketOptions.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</Select></Field></div>
        <div className="flex flex-wrap items-center justify-between gap-3"><Toggle checked={filters.approvedOnly} onChange={(v) => patch({ approvedOnly: v })} label="Approved actuals only" description="Plans remain visible; unapproved actuals are excluded." /><span className="text-[10px] text-slate-400">{filters.start} → {filters.end} · {report.lines.filter((l) => l.hours > 0).length} time entries</span></div>
        {invalidRange ? <p role="alert" className="text-xs text-rose-600">Choose a valid date range with the end on or after the start.</p> : null}
      </div></Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Logged effort" value={hoursLabel(report.totals.hours)} hint={`${hoursLabel(report.totals.approvedHours)} approved · ${report.totals.resources} resources`} icon={<Clock3 className="h-4 w-4" />} /><StatCard label="Planned effort" value={hoursLabel(report.totals.plannedHours)} hint="Working-day allocation in this period" icon={<CalendarDays className="h-4 w-4" />} tone="purple" /><StatCard label="Capex-tagged effort" value={hoursLabel(report.totals.capexHours)} hint={`${hoursLabel(report.totals.eligibleHours)} meets capitalisation policy`} icon={<Landmark className="h-4 w-4" />} tone="good" /><StatCard label="Capitalised cost" value={currency(report.totals.capitalisedCost)} hint="After project rate × resource cost · AUD" icon={<Users className="h-4 w-4" />} tone="warn" /></div>
      <div className="mb-4"><Tabs tabs={DIMENSIONS} value={dimension} onChange={(v) => { setDimension(v); setSelected(null); }} /></div>
      <Card padded={false} className="mb-4"><div className="p-4"><SectionHeader title={`${groups.length} ${dimension === 'resource' ? 'resources' : dimension === 'department' ? 'departments' : 'groups'}`} subtitle="Click a row to inspect its underlying effort. Epic/feature rollups include all descendant tickets." action={<Badge tone="neutral">{report.totals.departments} contributing departments</Badge>} /></div>
        {!groups.length ? <div className="p-4"><EmptyState title="No effort matches this period and filter" description="Try a wider date range, include unapproved time, or plan and log activities against delivery items." /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-xs"><thead><tr className="border-y border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">{[DIMENSIONS.find((d) => d.id === dimension)!.label.replace('By ', ''), 'Logged / share', 'Planned', 'Variance', 'Capex tagged', 'Policy eligible', 'Resources', 'Departments'].map((h) => <th key={h} className="px-3 py-3 font-semibold first:pl-4">{h}</th>)}</tr></thead><tbody>{groups.map((g) => <tr key={g.id} className={`cursor-pointer border-b border-slate-100 hover:bg-brand-50/40 ${selected === g.id ? 'bg-brand-50/60' : ''}`} onClick={() => setSelected(selected === g.id ? null : g.id)}>
          <td className="max-w-[340px] px-3 py-3 first:pl-4"><button className="text-left font-semibold text-slate-800 hover:text-brand-700" onClick={(e) => { e.stopPropagation(); setSelected(selected === g.id ? null : g.id); }}>{g.label}</button><div className="mt-1 text-[10px] text-slate-400">{g.subtitle}</div></td><td className="w-40 px-3 py-3"><div className="mb-1 font-semibold tabular-nums">{hoursLabel(g.hours)}</div><Progress value={g.hours / maxHours * 100} height={4} /></td><td className="px-3 py-3 tabular-nums text-slate-500">{hoursLabel(g.plannedHours)}</td><td className={`px-3 py-3 tabular-nums ${g.hours > g.plannedHours ? 'text-amber-700' : 'text-slate-500'}`}>{g.hours > g.plannedHours ? '+' : ''}{hoursLabel(g.hours - g.plannedHours)}</td><td className="px-3 py-3 tabular-nums">{hoursLabel(g.capexHours)}</td><td className="px-3 py-3 tabular-nums text-emerald-700">{hoursLabel(g.eligibleHours)}</td><td className="px-3 py-3 tabular-nums">{g.resources}</td><td className="px-3 py-3 tabular-nums">{g.departments}</td>
        </tr>)}</tbody></table></div>}
      </Card>
      <Card><SectionHeader title={selectedGroup ? `Contributions · ${selectedGroup.label}` : 'Underlying effort ledger'} subtitle="A resource’s home department owns the effort attribution. The executing stream can be a sub-stream. Plan-only rows have zero actual hours." action={selectedGroup ? <Button size="sm" onClick={() => setSelected(null)}>Show all rows</Button> : <Badge tone="info">{ledger.length} rows</Badge>} />
        <div className="mt-3 max-h-[440px] overflow-auto"><table className="w-full min-w-[900px] text-left text-[11px]"><thead className="sticky top-0 bg-slate-50"><tr>{['Date', 'Resource', 'Department', 'Activity / backlog', 'Funding', 'Planned', 'Logged', 'Approval'].map((h) => <th key={h} className="px-3 py-2 text-[10px] font-semibold text-slate-500">{h}</th>)}</tr></thead><tbody>{ledger.slice(0, 250).map((l) => <tr key={l.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-2 text-slate-500">{l.date}</td><td className="px-3 py-2 font-medium">{l.employeeName}</td><td className="px-3 py-2 text-slate-500">{state.departments.find((d) => d.id === l.departmentId)?.code}</td><td className="max-w-[320px] px-3 py-2"><div>{l.activityTitle}</div><div className="mt-0.5 text-[9px] text-slate-400">{items.find((i) => i.id === l.epicId)?.title ?? 'No epic linkage'}</div></td><td className="px-3 py-2"><Badge tone={l.funding === 'capex' ? 'good' : 'neutral'}>{l.funding}</Badge></td><td className="px-3 py-2 tabular-nums">{hoursLabel(l.plannedHours)}</td><td className="px-3 py-2 font-semibold tabular-nums">{hoursLabel(l.hours)}</td><td className="px-3 py-2"><Badge tone={l.id.startsWith('plan-') ? 'neutral' : l.approved ? 'good' : 'warn'}>{l.id.startsWith('plan-') ? 'Plan only' : l.approved ? 'Approved' : 'Pending'}</Badge></td></tr>)}</tbody></table></div>
        {ledger.length > 250 ? <p className="mt-2 text-[10px] text-slate-400">Showing the first 250 rows. Export the ledger for every matching row.</p> : null}
      </Card>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-[11px] leading-relaxed text-slate-500"><strong className="text-slate-700">How to read these numbers.</strong> Each actual hour is counted once within a grouping. Epic and feature rollups intentionally overlap, so do not add totals across tabs. Planned hours are spread over working days using the resource’s country calendar; actuals are counted on their entry date. Capex-tagged effort is a funding label, while policy-eligible effort also passes the existing project/phase/window rules. Reports use the tenant and calendar departments in scope, not a security boundary against shared-password holders.</div>
    </>}
  </div>;
}
