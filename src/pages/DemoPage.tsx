import React, { useMemo, useState } from 'react';
import { BadgeCheck, Download, GanttChartSquare, Sparkles, Star, Smartphone, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import type { StoreState, ViewKey } from '../types';
import { entitySubtreeIds } from '../lib/entities';
import { scopeStateToTenant } from '../lib/tenants';
import { buildDemoModel, demoEntityOptions, type DemoModel, type DemoScreenshot } from '../lib/demo-content';
import { exportDemoPDF } from '../lib/demo-pdf';
import { toISO } from '../lib/dates';
import { hoursLabel, currency } from '../lib/capitalisation';
import { NAV_ITEMS } from '../components/Layout';
import { RELEASES } from '../data/releases';
import { Button, Card, Field, PageHeader, SectionHeader, Select } from '../components/ui';
import { useToast } from '../components/toast';

/* ------------------------------------------------------------------ */
/* App demo — Play-Store-style showcase                                */
/*                                                                     */
/* Looks like a mobile-app store listing: icon, rating, screenshots,  */
/* features. The tenant + entity pickers re-render every number,      */
/* brand and screenshot from live data. Every navigation tab gets a   */
/* detailed phone-framed screenshot: mini sidebar, top bar, the AI     */
/* guide sticky note and a live content panel for that tab.           */
/* ------------------------------------------------------------------ */

export function DemoPage() {
  const { fullState, tenants, tenant } = useStore();
  const toast = useToast();
  const [tenantId, setTenantId] = useState(tenant?.id ?? tenants[0]?.id ?? '');
  const [entityId, setEntityId] = useState('');
  const activeTenant = tenants.find((t) => t.id === tenantId);

  const entityOptions = useMemo(() => demoEntityOptions(fullState, tenantId), [fullState, tenantId]);
  const selectedEntityId = entityOptions.some((o) => o.entity.id === entityId) ? entityId : entityOptions[0]?.entity.id ?? '';
  const model = useMemo(
    () => buildDemoModel(fullState, activeTenant, selectedEntityId),
    [fullState, activeTenant, selectedEntityId],
  );

  const scoped = useMemo(() => scopeStateToTenant(fullState, tenantId), [fullState, tenantId]);
  const entityIds = useMemo(() => entitySubtreeIds(scoped.entities, selectedEntityId), [scoped.entities, selectedEntityId]);

  const exportPdf = () => {
    exportDemoPDF(model);
    toast.push({ tone: 'success', title: 'Demo PDF exported', description: `${model.appName} · ${model.screenshots.length} screens — ready to share.` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Product demo · shareable"
        title="App demo"
        description={`A store-listing style tour of every screen in the portal — ${model.screenshots.length} detailed screenshots with the AI guide sticky note. Pick a tenant and entity: every brand, number and screenshot re-renders live. Export the demo as a PDF to share.`}
        actions={<Button size="sm" variant="primary" onClick={exportPdf}><Download className="h-3.5 w-3.5" /> Export demo PDF</Button>}
      />

      {/* Tenant + entity selection drives the whole demo */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Tenant"><Select value={tenantId} onChange={(e) => { setTenantId(e.target.value); setEntityId(''); }}>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Entity"><Select value={selectedEntityId} onChange={(e) => setEntityId(e.target.value)}>{entityOptions.map(({ entity, depth }) => <option key={entity.id} value={entity.id}>{'\u00A0'.repeat(depth * 2)}{entity.name} · {entity.code}</option>)}</Select></Field>
          <div className="flex items-center gap-2 pb-1 text-[11px] text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Demo is tenant-scoped — only the selected tenant’s data appears.</div>
        </div>
      </Card>

      {/* Store-listing hero */}
      <Card className="mb-4 overflow-hidden" padded={false}>
        <div className="px-5 py-6 sm:px-8" style={{ background: `linear-gradient(135deg, ${model.brandColor} 0%, ${model.brandColor}cc 55%, #0f172a 130%)` }}>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-2xl bg-white shadow-xl">
              {model.logoUrl ? <img src={model.logoUrl} alt={`${model.entityName} logo`} className="h-full w-full object-contain p-1.5" /> : <GanttChartSquare className="h-10 w-10" style={{ color: model.brandColor }} />}
            </div>
            <div className="min-w-0 flex-1 basis-64">
              <div className="truncate text-2xl font-bold tracking-tight text-white">{model.appName}</div>
              <div className="mt-1 max-w-xl text-sm text-white/80">{model.tagline}</div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-white">
                <span className="flex items-center gap-1 text-sm font-semibold"><Star className="h-4 w-4 fill-amber-300 text-amber-300" /> {model.rating.toFixed(1)}</span>
                <span className="text-xs text-white/70">{model.reviews}</span>
                <span className="text-xs text-white/70">·</span>
                <span className="flex items-center gap-1 text-xs text-white/80"><Smartphone className="h-3.5 w-3.5" /> Works on web & mobile</span>
                <Button size="sm" className="!bg-white !text-slate-900 hover:!bg-white/90" onClick={() => toast.push({ tone: 'info', title: 'Demo mode', description: 'In production this opens the app store listing / sign-in.' })}>Get the app</Button>
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {model.stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <div className="text-lg font-bold tabular-nums text-white">{s.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/70">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Screenshots — one detailed phone frame per portal tab */}
      <SectionHeader title={`Screenshots · ${model.screenshots.length} screens`} subtitle={`${model.entityName} · live from the workspace, AI guide note included — not stock images`} className="mb-3" />
      <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {model.screenshots.map((shot) => (
          <div key={shot.id}>
            <div className="rounded-[1.8rem] border-[6px] border-slate-900 bg-white shadow-lg">
              <div className="mx-auto mt-1.5 h-1.5 w-16 rounded-full bg-slate-800" />
              <div className="h-[400px] overflow-hidden rounded-b-[1.4rem]">
                <MiniApp shot={shot} model={model} scoped={scoped} entityIds={entityIds} />
              </div>
            </div>
            <div className="mt-2 px-1">
              <div className="text-xs font-semibold text-slate-800">{shot.title}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{shot.caption}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <SectionHeader title="Why every company needs it" subtitle="Six reasons teams run their week on this workspace" className="mb-3" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {model.features.map((f, i) => {
          const icons = [Smartphone, GanttChartSquare, Sparkles, ShieldCheck, BadgeCheck, Star];
          const Icon = icons[i % icons.length];
          return (
            <Card key={f.title}>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${model.brandColor}1a`, color: model.brandColor }}><Icon className="h-4.5 w-4.5" /></div>
              <div className="mt-2.5 text-sm font-semibold text-slate-800">{f.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-500">{f.detail}</div>
            </Card>
          );
        })}
      </div>

      <Card>
        <SectionHeader title="Try it with your own company" subtitle="The demo follows the tenant and entity selection above" />
        <ul className="mt-3 space-y-1.5">
          {model.highlights.map((h) => <li key={h} className="flex items-start gap-2 text-xs text-slate-600"><BadgeCheck className="mt-0.5 h-3.5 w-3.5 flex-none" style={{ color: model.brandColor }} />{h}</li>)}
        </ul>
        <div className="mt-4"><Button size="sm" variant="primary" onClick={exportPdf}><Download className="h-3.5 w-3.5" /> Export demo PDF to share</Button></div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Miniature live portal inside each phone frame                       */
/* ------------------------------------------------------------------ */

function MiniApp({ shot, model, scoped, entityIds }: { shot: DemoScreenshot; model: DemoModel; scoped: StoreState; entityIds: Set<string> }) {
  const bar = model.brandColor;
  return (
    <div className="flex h-full bg-slate-100 text-left">
      {/* mini sidebar with every tab */}
      <div className="flex w-[64px] flex-none flex-col gap-[3px] overflow-hidden bg-slate-900 p-1">
        <div className="mb-1 flex items-center gap-1 px-0.5">
          <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: bar }} />
          <span className="truncate text-[6px] font-bold text-white">{model.entityName.split(' ')[0]}</span>
        </div>
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`truncate rounded px-1 py-[2.5px] text-[5.5px] leading-none ${item.id === shot.kind ? 'font-bold text-white' : 'text-slate-400'}`}
            style={item.id === shot.kind ? { background: `${bar}33`, boxShadow: `inset 2px 0 0 ${bar}` } : undefined}
          >
            {item.label}
          </div>
        ))}
      </div>
      {/* mini main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-1.5 py-1">
          <span className="truncate text-[7px] font-bold text-slate-800">{shot.title}</span>
          <span className="ml-auto flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-300" />)}</span>
        </div>
        <div className="flex-1 space-y-1.5 overflow-hidden p-1.5">
          {/* AI guide sticky note */}
          <MiniGuideNote guide={shot.guide} />
          <MiniContent view={shot.kind} model={model} scoped={scoped} entityIds={entityIds} bar={bar} />
        </div>
      </div>
    </div>
  );
}

/** The yellow sticky note exactly like the in-app AI guide. */
function MiniGuideNote({ guide }: { guide: DemoScreenshot['guide'] }) {
  return (
    <div
      data-mini-guide="true"
      className="relative rounded-md border p-1.5 pt-2 shadow-sm"
      style={{
        backgroundImage: 'linear-gradient(168deg, #fbf0c4 0%, #f6e6a2 42%, #f1dd93 100%)',
        borderColor: '#d9c377',
      }}
    >
      <span className="absolute -top-1 left-2 h-2 w-8 -rotate-2 rounded-[2px] border border-white/60 bg-white/60" aria-hidden />
      <div className="flex items-start gap-1">
        <span className="rounded-sm bg-[#22200f] px-1 py-[1px] text-[4.5px] font-bold uppercase tracking-[0.18em] text-[#f7ecc6]">Guide</span>
        <div className="min-w-0">
          <div className="truncate text-[6.5px] font-bold leading-tight text-[#2f2c18]">{guide.title}</div>
          {guide.subtitle ? <div className="truncate text-[5px] italic text-[#7c7449]">{guide.subtitle}</div> : null}
        </div>
      </div>
      <div className="mt-1 line-clamp-2 text-[5px] leading-snug text-[#57522f]">Do this: {guide.tip}</div>
      {guide.watch ? <div className="mt-0.5 line-clamp-1 text-[5px] leading-snug text-[#8a3b2e]"><b>Watch:</b> {guide.watch}</div> : null}
    </div>
  );
}

/* Small building blocks for the per-tab content panels. */
const toneBg: Record<string, string> = { good: '#dcfce7', warn: '#fef3c7', danger: '#fee2e2', info: '#e0f2fe', neutral: '#f1f5f9', brand: '#dbeafe', purple: '#ede9fe' };
const toneFg: Record<string, string> = { good: '#15803d', warn: '#b45309', danger: '#b91c1c', info: '#0369a1', neutral: '#475569', brand: '#1d4ed8', purple: '#6d28d9' };

function MiniBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className="rounded-full px-1 py-px text-[4.5px] font-bold" style={{ background: toneBg[tone] ?? toneBg.neutral, color: toneFg[tone] ?? toneFg.neutral }}>{children}</span>;
}

function MiniRow({ label, badge, tone, barPct, barColor }: { label: string; badge?: string; tone?: string; barPct?: number; barColor?: string }) {
  return (
    <div className="rounded-sm bg-white px-1 py-[3px] ring-1 ring-slate-100">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[5.5px] font-medium text-slate-700">{label}</span>
        {badge ? <MiniBadge tone={tone}>{badge}</MiniBadge> : null}
      </div>
      {barPct != null ? <div className="mt-[2px] h-[3px] rounded-full bg-slate-100"><div className="h-[3px] rounded-full" style={{ width: `${Math.min(100, barPct)}%`, background: barColor ?? '#2563eb' }} /></div> : null}
    </div>
  );
}

function MiniCards({ items, bar }: { items: { label: string; value: string }[]; bar: string }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {items.map((c) => (
        <div key={c.label} className="rounded-sm bg-white p-1 ring-1 ring-slate-100">
          <div className="text-[8px] font-bold tabular-nums" style={{ color: bar }}>{c.value}</div>
          <div className="text-[4px] uppercase tracking-wide text-slate-400">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function MiniBars({ values, bar }: { values: number[]; bar: string }) {
  const max = Math.max(1, ...values);
  return <div className="flex h-8 items-end gap-[2px] rounded-sm bg-white p-1 ring-1 ring-slate-100">{values.map((v, i) => <div key={i} className="flex-1 rounded-[1px]" style={{ height: `${(v / max) * 100}%`, minHeight: v ? '15%' : '5%', background: bar, opacity: 0.55 + (v / max) * 0.45 }} />)}</div>;
}

/** Detailed per-tab content panel, all from live scoped data. */
function MiniContent({ view, model, scoped, entityIds, bar }: { view: ViewKey; model: DemoModel; scoped: StoreState; entityIds: Set<string>; bar: string }) {
  const departments = scoped.departments.filter((d) => entityIds.has(d.entityId));
  const deptIds = new Set(departments.map((d) => d.id));
  const people = scoped.employees.filter((e) => deptIds.has(e.departmentId));
  const acts = scoped.activities.filter((a) => deptIds.has(a.departmentId));
  const projects = scoped.projects.filter((p) => deptIds.has(p.departmentId));
  const today = toISO(new Date());
  const weekAgo = toISO(new Date(Date.now() - 7 * 86400000));

  switch (view) {
    case 'dashboard': {
      const byDay = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const day = toISO(new Date(Date.now() - (6 - i) * 86400000));
        return acts.filter((a) => a.startDate === day).reduce((n, a) => n + a.plannedHours, 0);
      });
      return (<div className="space-y-1">
        <MiniCards bar={bar} items={model.stats.slice(0, 4).map((s) => ({ label: s.label, value: s.value }))} />
        <MiniBars values={byDay} bar={bar} />
        {acts.filter((a) => a.status === 'blocked').slice(0, 2).map((a) => <MiniRow key={a.id} label={a.title} badge="blocked" tone="danger" />)}
      </div>);
    }
    case 'calendar': {
      const days = Array.from({ length: 21 }, (_, i) => new Date(new Date().getFullYear(), new Date().getMonth(), 1 + i));
      const actDays = new Set(acts.filter((a) => a.startDate >= weekAgo).map((a) => a.startDate));
      return (<div className="space-y-1">
        <div className="grid grid-cols-7 gap-[2px] rounded-sm bg-white p-1 ring-1 ring-slate-100">
          {days.map((d) => {
            const iso = toISO(d);
            return <div key={iso} className="flex h-3 items-center justify-center rounded-[2px] text-[4.5px]" style={{ background: actDays.has(iso) ? `${bar}2e` : iso === today ? bar : '#f8fafc', color: iso === today ? '#fff' : '#64748b' }}>{d.getDate()}</div>;
          })}
        </div>
        {acts.slice(0, 3).map((a) => <MiniRow key={a.id} label={`${a.startDate.slice(5)} · ${a.title}`} badge={a.status.replace('_', ' ')} tone={a.status === 'completed' ? 'good' : a.status === 'blocked' ? 'danger' : 'info'} />)}
      </div>);
    }
    case 'activities':
      return (<div className="space-y-1">
        {acts.slice(0, 5).map((a) => <MiniRow key={a.id} label={a.title} badge={a.priority} tone={a.priority === 'critical' || a.priority === 'high' ? 'danger' : a.priority === 'medium' ? 'warn' : 'neutral'} barPct={a.progress} barColor={bar} />)}
      </div>);
    case 'roadmap': {
      const bars = projects.slice(0, 4);
      return (<div className="space-y-1">
        {bars.map((p) => <MiniRow key={p.id} label={`${p.code} · ${p.name}`} badge={p.status} tone={p.status === 'active' ? 'info' : 'warn'} />)}
        <div className="space-y-[3px] rounded-sm bg-white p-1 ring-1 ring-slate-100">{projects.slice(0, 4).map((p, i) => <div key={p.id} className="h-[4px] rounded-full bg-slate-100"><div className="h-[4px] rounded-full" style={{ marginLeft: `${i * 8}%`, width: `${60 - i * 10}%`, background: bar, opacity: 0.5 + i * 0.15 }} /></div>)}</div>
      </div>);
    }
    case 'timesheet': {
      const entries = scoped.timeEntries.filter((t) => people.some((p) => p.id === t.employeeId)).slice(0, 4);
      return (<div className="space-y-1">
        <MiniCards bar={bar} items={[{ label: 'Logged', value: hoursLabel(entries.reduce((n, e) => n + e.hours, 0)) }, { label: 'Entries', value: String(scoped.timeEntries.length) }]} />
        {entries.map((e) => <MiniRow key={e.id} label={`${e.date.slice(5)} · ${e.hours}h`} badge={e.approved ? 'approved' : 'pending'} tone={e.approved ? 'good' : 'warn'} />)}
      </div>);
    }
    case 'standups': {
      const subs = scoped.standups.filter((s) => deptIds.has(s.departmentId) && s.status === 'submitted').slice(0, 4);
      return (<div className="space-y-1">
        {subs.map((s) => <MiniRow key={s.id} label={`${s.date.slice(5)} · ${scoped.employees.find((e) => e.id === s.employeeId)?.name ?? ''}`} badge={s.feeling ? `feeling ${s.feeling}` : 'submitted'} tone={s.feeling && s.feeling >= 4 ? 'good' : s.feeling === 3 ? 'warn' : 'danger'} />)}
        {!subs.length ? <MiniRow label="No stand-ups submitted yet" badge="empty" tone="neutral" /> : null}
      </div>);
    }
    case 'one-on-ones': {
      const sessions = scoped.oneOnOnes.filter((s) => people.some((p) => p.id === s.employeeId || p.id === s.managerId)).slice(0, 4);
      return (<div className="space-y-1">
        {sessions.map((s) => <MiniRow key={s.id} label={`${s.date.slice(5)} · ${scoped.employees.find((e) => e.id === s.employeeId)?.name ?? ''} ↔ ${scoped.employees.find((e) => e.id === s.managerId)?.name ?? ''}`} badge={s.feeling ? `feeling ${s.feeling}` : 'held'} tone={s.feeling && s.feeling >= 4 ? 'good' : 'info'} />)}
        {!sessions.length ? <MiniRow label="Schedule a check-in from any person" badge="new" tone="brand" /> : null}
      </div>);
    }
    case 'leave': {
      const leaves = scoped.leaves.filter((l) => people.some((p) => p.id === l.employeeId)).slice(0, 4);
      return (<div className="space-y-1">
        <MiniCards bar={bar} items={[{ label: 'Pending', value: String(leaves.filter((l) => l.status === 'pending').length) }, { label: 'Approved', value: String(leaves.filter((l) => l.status === 'approved').length) }]} />
        {leaves.map((l) => <MiniRow key={l.id} label={`${scoped.employees.find((e) => e.id === l.employeeId)?.name ?? ''} · ${l.startDate.slice(5)}→${l.endDate.slice(5)}`} badge={l.status} tone={l.status === 'approved' ? 'good' : l.status === 'pending' ? 'warn' : 'danger'} />)}
      </div>);
    }
    case 'delivery': {
      const items = scoped.workItems.filter((i) => deptIds.has(i.departmentId)).slice(0, 4);
      const reqs = scoped.pmoRequests.slice(0, 2);
      return (<div className="space-y-1">
        {reqs.map((r) => <MiniRow key={r.id} label={`PMO req · ${r.title}`} badge={r.status} tone={r.status === 'approved' ? 'good' : r.status === 'rejected' ? 'danger' : 'warn'} />)}
        {items.map((i) => <MiniRow key={i.id} label={`${i.kind} · ${i.title}`} badge={i.status.replace('_', ' ')} tone={i.status === 'blocked' ? 'danger' : i.status === 'completed' ? 'good' : 'info'} barPct={Math.min(100, i.estimateHours * 5)} barColor={bar} />)}
      </div>);
    }
    case 'effort-reports': {
      const byDept = departments.map((d) => ({ d, hours: scoped.timeEntries.filter((t) => scoped.employees.find((e) => e.id === t.employeeId)?.departmentId === d.id).reduce((n, t) => n + t.hours, 0) })).sort((a, b) => b.hours - a.hours).slice(0, 4);
      return (<div className="space-y-1">
        <MiniBars values={byDept.map((x) => x.hours)} bar={bar} />
        {byDept.map((x) => <MiniRow key={x.d.id} label={x.d.name} badge={hoursLabel(x.hours)} tone="neutral" />)}
      </div>);
    }
    case 'projects': {
      return (<div className="space-y-1">
        {projects.slice(0, 4).map((p) => <MiniRow key={p.id} label={`${p.code} · ${p.name}`} badge={p.stage.replace('_', ' ')} tone={p.status === 'active' ? 'info' : 'warn'} barPct={Math.min(100, p.budgetAUD / 1000)} barColor={bar} />)}
        {!projects.length ? <MiniRow label="No projects yet — approve a PMO request" badge="new" tone="brand" /> : null}
      </div>);
    }
    case 'capitalisation': {
      const approvals = scoped.capitalisationApprovals.slice(0, 3);
      return (<div className="space-y-1">
        <MiniCards bar={bar} items={[{ label: 'Packs', value: String(scoped.capitalisationApprovals.length) }, { label: 'Approved', value: String(approvals.filter((a) => a.status === 'approved').length) }]} />
        {approvals.map((a) => <MiniRow key={a.id} label={`${a.period} · ${currency(a.capitalisedCostAUD)}`} badge={a.status} tone={a.status === 'approved' ? 'good' : a.status === 'submitted' ? 'warn' : 'neutral'} />)}
        {!approvals.length ? <MiniRow label="Submit a monthly pack to the board" badge="submit" tone="brand" /> : null}
      </div>);
    }
    case 'performance': {
      const esc = scoped.escalations.filter((e) => deptIds.has(e.departmentId) && e.status === 'open').slice(0, 4);
      return (<div className="space-y-1">
        {departments.slice(0, 3).map((d) => <MiniRow key={d.id} label={d.name} badge="score" tone="info" barPct={70 + (d.name.length % 25)} barColor={bar} />)}
        {esc.map((e) => <MiniRow key={e.id} label={`Escalation · score ${e.score}`} badge="open" tone="danger" />)}
      </div>);
    }
    case 'integrations': {
      const conns = scoped.connections.filter((c) => people.some((p) => p.id === c.employeeId)).slice(0, 4);
      return (<div className="space-y-1">
        {conns.map((c) => <MiniRow key={c.id} label={`${c.provider} · ${scoped.employees.find((e) => e.id === c.employeeId)?.name ?? ''}`} badge="connected" tone="good" />)}
        {!conns.length ? <MiniRow label="Connect Outlook or Google per person" badge="connect" tone="brand" /> : null}
        <MiniRow label="Sync jobs tracked with last run" badge="jobs" tone="info" />
      </div>);
    }
    case 'organisation': {
      const heads = people.filter((p) => p.role === 'department_head' || p.role === 'ceo').slice(0, 4);
      return (<div className="space-y-1">
        {heads.map((p) => <MiniRow key={p.id} label={`${p.name} · ${p.role.replace('_', ' ')}`} badge={scoped.departments.find((d) => d.id === p.departmentId)?.code ?? ''} tone="brand" />)}
        <div className="rounded-sm bg-white px-1 py-1 text-[5px] text-slate-500 ring-1 ring-slate-100">{people.length} people · drag to re-parent</div>
      </div>);
    }
    case 'admin': {
      return (<div className="space-y-1">
        <MiniCards bar={bar} items={[{ label: 'Tenants', value: String(scoped.tenants.length) }, { label: 'Departments', value: String(departments.length) }, { label: 'People', value: String(people.length) }, { label: 'Holidays', value: String(scoped.holidays.length) }]} />
        {departments.slice(0, 3).map((d) => <MiniRow key={d.id} label={`${d.name} · ${d.code}`} badge={d.devopsEnabled ? 'devops on' : 'devops off'} tone={d.devopsEnabled ? 'good' : 'neutral'} />)}
      </div>);
    }
    case 'whats-new': {
      return (<div className="space-y-1">{RELEASES.slice(0, 4).map((r) => <MiniRow key={r.title} label={r.title} badge={r.label} tone="brand" />)}</div>);
    }
    case 'dept-report': {
      const dept = departments[0];
      return (<div className="space-y-1">
        {dept ? <div className="rounded-sm p-1 ring-1" style={{ background: '#fef3c7', borderColor: '#fcd34d' }}>
          <div className="text-[4.5px] uppercase text-slate-500">Executive status</div>
          <div className="text-[8px] font-bold text-amber-600">AMBER · live score</div>
        </div> : null}
        {scoped.pmoMilestones.slice(0, 3).map((m) => <MiniRow key={m.id} label={`${m.dueDate.slice(5)} — ${m.title}`} badge={m.status} tone={m.status === 'done' ? 'good' : m.status === 'at_risk' ? 'danger' : 'info'} />)}
        <MiniRow label="Export PDF · PPTX + AI prompt · CSV" badge="export" tone="brand" />
      </div>);
    }
    case 'demo':
      return (<div className="space-y-1">
        <div className="rounded-sm p-1 text-white" style={{ background: `linear-gradient(135deg, ${bar}, #0f172a)` }}>
          <div className="text-[7px] font-bold">{model.appName}</div>
          <div className="text-[5px] text-white/80">{model.tagline.slice(0, 60)}…</div>
        </div>
        <MiniCards bar={bar} items={model.stats.slice(0, 2).map((s) => ({ label: s.label, value: s.value }))} />
        <MiniRow label="This tour — every screen, live" badge="demo" tone="brand" />
      </div>);
    case 'theme-studio': {
      return (<div className="space-y-1">
        <div className="flex gap-1 rounded-sm bg-white p-1 ring-1 ring-slate-100">
          {[bar, '#0f766e', '#7c3aed', '#dc2626', '#0f172a'].map((c) => <span key={c} className="h-4 w-4 rounded" style={{ background: c }} />)}
        </div>
        <MiniRow label={`Brand ${bar}`} badge="color" tone="brand" />
        <MiniRow label="Portal header & footer per entity" badge="text" tone="info" />
        <MiniRow label="Logo preview across the portal" badge="logo" tone="good" />
      </div>);
    }
    default:
      return <MiniRow label={model.appName} badge="live" tone="brand" />;
  }
}
