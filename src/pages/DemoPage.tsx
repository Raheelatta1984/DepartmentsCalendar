import React, { useMemo, useState } from 'react';
import { BadgeCheck, Download, GanttChartSquare, Star, Smartphone, CalendarDays, Presentation, GitBranch, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import type { StoreState } from '../types';
import { entitySubtreeIds } from '../lib/entities';
import { scopeStateToTenant } from '../lib/tenants';
import { buildDemoModel, demoEntityOptions, type DemoModel, type DemoScreenshotKind } from '../lib/demo-content';
import { exportDemoPDF } from '../lib/demo-pdf';
import { toISO } from '../lib/dates';
import { Button, Card, EmptyState, Field, PageHeader, SectionHeader, Select } from '../components/ui';
import { useToast } from '../components/toast';

/* ------------------------------------------------------------------ */
/* App demo — Play-Store-style showcase                                */
/*                                                                     */
/* Looks like a mobile-app store listing: icon, rating, screenshots,  */
/* features. The tenant + entity pickers re-render every number,      */
/* brand and screenshot from live data, and the whole demo exports    */
/* to a shareable PDF.                                                 */
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

  // Live scoped state behind the mini screenshots.
  const scoped = useMemo(() => scopeStateToTenant(fullState, tenantId), [fullState, tenantId]);
  const entityIds = useMemo(() => entitySubtreeIds(scoped.entities, selectedEntityId), [scoped.entities, selectedEntityId]);
  const departments = scoped.departments.filter((d) => entityIds.has(d.entityId));
  const weekActivities = useMemo(() => {
    const today = toISO(new Date());
    const weekAgo = toISO(new Date(Date.now() - 7 * 86400000));
    return scoped.activities.filter((a) => departments.some((d) => d.id === a.departmentId) && a.startDate >= weekAgo && a.startDate <= today);
  }, [scoped.activities, departments]);

  const exportPdf = () => {
    exportDemoPDF(model);
    toast.push({ tone: 'success', title: 'Demo PDF exported', description: `${model.appName} · ${model.screenshots.length} screens — ready to share.` });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Product demo · shareable"
        title="App demo"
        description="A store-listing style tour of the portal. Pick a tenant and entity — every brand, number and screenshot re-renders live — then export the demo as a PDF to share with the wider audience."
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

      {/* Screenshots */}
      <SectionHeader title="Screenshots" subtitle={`${model.entityName} · live from the workspace — not stock images`} className="mb-3" />
      <div className="mb-6 flex snap-x gap-4 overflow-x-auto pb-2">
        {model.screenshots.map((shot) => (
          <div key={shot.id} className="w-[240px] flex-none snap-start">
            <div className="rounded-[1.8rem] border-[6px] border-slate-900 bg-white shadow-lg">
              <div className="mx-auto mt-1.5 h-1.5 w-16 rounded-full bg-slate-800" />
              <div className="h-[380px] overflow-hidden rounded-b-[1.4rem] p-2.5">
                <MiniScreen kind={shot.kind} model={model} scoped={scoped} entityIds={entityIds} weekActivities={weekActivities} />
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
          const icons = [CalendarDays, LayoutDashboard, Presentation, GitBranch, BadgeCheck, ShieldCheck];
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
/* Miniature live "screenshots" inside the phone frames                */
/* ------------------------------------------------------------------ */

function MiniScreen({ kind, model, scoped, entityIds, weekActivities }: { kind: DemoScreenshotKind; model: DemoModel; scoped: StoreState; entityIds: Set<string>; weekActivities: { startDate: string; plannedHours: number; status: string; priority: string }[] }) {
  const bar = model.brandColor;
  if (kind === 'dashboard') {
    const byDay = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((_, i) => {
      const day = toISO(new Date(Date.now() - (6 - i) * 86400000));
      return weekActivities.filter((a) => a.startDate === day).reduce((n, a) => n + a.plannedHours, 0);
    });
    const max = Math.max(1, ...byDay);
    return (
      <div className="flex h-full flex-col gap-2">
        <div className="rounded-md px-2 py-1.5 text-[9px] font-bold text-white" style={{ background: bar }}>Command centre · {model.entityName}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {model.stats.map((s) => (
            <div key={s.label} className="rounded-md bg-slate-50 p-1.5 ring-1 ring-slate-100">
              <div className="text-[11px] font-bold tabular-nums" style={{ color: bar }}>{s.value}</div>
              <div className="text-[6px] uppercase text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-1 items-end gap-1 rounded-md bg-slate-50 p-1.5 ring-1 ring-slate-100">
          {byDay.map((v, i) => <div key={i} className="flex-1 rounded-sm" style={{ height: `${(v / max) * 100}%`, minHeight: v ? '12%' : '4%', background: bar }} />)}
        </div>
        <div className="rounded-md bg-slate-50 p-1.5 text-[7px] text-slate-500 ring-1 ring-slate-100">{weekActivities.length} activities this week · synced</div>
      </div>
    );
  }
  if (kind === 'calendar') {
    const today = new Date();
    const days = Array.from({ length: 28 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), 1 + i));
    const actDays = new Set(weekActivities.map((a) => a.startDate));
    return (
      <div className="flex h-full flex-col gap-2">
        <div className="rounded-md px-2 py-1.5 text-[9px] font-bold text-white" style={{ background: bar }}>Department calendar</div>
        <div className="grid flex-1 grid-cols-7 gap-0.5">
          {days.map((d) => {
            const iso = toISO(d);
            const has = actDays.has(iso);
            const isToday = iso === toISO(today);
            return (
              <div key={iso} className={`flex items-center justify-center rounded-sm text-[6px] ${isToday ? 'font-bold text-white' : 'text-slate-500'} ${has ? 'ring-1' : ''}`} style={{ background: isToday ? bar : has ? `${bar}26` : '#f8fafc', ...(has ? { boxShadow: `inset 0 0 0 1px ${bar}55` } : {}) }}>
                {d.getDate()}
              </div>
            );
          })}
        </div>
        <div className="space-y-1">
          {weekActivities.slice(0, 3).map((a, i) => <div key={i} className="rounded-sm px-1.5 py-1 text-[7px] text-white" style={{ background: i === 0 ? bar : `${bar}bb` }}>{a.startDate.slice(5)} · {a.plannedHours}h planned</div>)}
        </div>
      </div>
    );
  }
  if (kind === 'status') {
    const shot = model.screenshots.find((s) => s.kind === 'status')!;
    return (
      <div className="flex h-full flex-col gap-2">
        <div className="rounded-md px-2 py-1.5 text-[9px] font-bold text-white" style={{ background: bar }}>Status pack · {model.entityName}</div>
        <div className="rounded-md bg-amber-50 p-1.5 ring-1 ring-amber-200">
          <div className="text-[6px] uppercase text-slate-400">Executive status</div>
          <div className="text-[11px] font-bold text-amber-600">AMBER · score live</div>
        </div>
        {shot.points.slice(0, 4).map((p, i) => <div key={i} className="rounded-sm bg-slate-50 px-1.5 py-1 text-[7px] leading-snug text-slate-600 ring-1 ring-slate-100">{p}</div>)}
      </div>
    );
  }
  // pmo
  const requests = scoped.pmoRequests.slice(0, 3);
  const items = scoped.workItems.filter((i) => i.departmentId && [...entityIds].some((eid) => scoped.departments.find((d) => d.id === i.departmentId)?.entityId === eid)).slice(0, 3);
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-md px-2 py-1.5 text-[9px] font-bold text-white" style={{ background: bar }}>PMO tool · {model.entityName}</div>
      {requests.length ? requests.map((r) => (
        <div key={r.id} className="flex items-center gap-1 rounded-sm bg-slate-50 px-1.5 py-1 ring-1 ring-slate-100">
          <span className={`h-1.5 w-1.5 rounded-full ${r.status === 'approved' ? 'bg-emerald-500' : r.status === 'rejected' ? 'bg-rose-500' : 'bg-amber-500'}`} />
          <span className="truncate text-[7px] text-slate-600">{r.title}</span>
        </div>
      )) : <div className="rounded-sm bg-slate-50 px-1.5 py-1 text-[7px] text-slate-400 ring-1 ring-slate-100">New request → PMO review → project</div>}
      {items.map((item, i) => (
        <div key={item.id} className="rounded-sm bg-slate-50 px-1.5 py-1 ring-1 ring-slate-100">
          <div className="truncate text-[7px] font-medium text-slate-700">{item.title}</div>
          <div className="mt-0.5 h-1 rounded-full bg-slate-200"><div className="h-1 rounded-full" style={{ width: `${Math.min(100, item.estimateHours * 5)}%`, background: bar }} /></div>
        </div>
      ))}
      <div className="mt-auto rounded-sm px-1.5 py-1 text-center text-[7px] font-semibold text-white" style={{ background: bar }}>Export PPTX + AI prompt</div>
    </div>
  );
}
