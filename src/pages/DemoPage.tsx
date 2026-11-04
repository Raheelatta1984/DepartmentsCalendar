import React, { useMemo, useState } from 'react';
import { BadgeCheck, Download, GanttChartSquare, Play, Sparkles, Star, Smartphone, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import type { AppFilters, StoreState, ViewKey } from '../types';
import { entitySubtreeIds } from '../lib/entities';
import { scopeStateToTenant } from '../lib/tenants';
import { buildDemoModel, demoEntityOptions, type DemoModel, type DemoScreenshot } from '../lib/demo-content';
import { exportDemoPDF } from '../lib/demo-pdf';
import { toISO } from '../lib/dates';
import { RealScreen, ScaledFrame } from '../components/RealScreen';
import { DemoVideo } from '../components/DemoVideo';
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
  const { fullState, tenants, tenant, setActiveTenant, state } = useStore();
  const toast = useToast();
  const [tenantId, setTenantId] = useState(tenant?.id ?? tenants[0]?.id ?? '');
  const [entityId, setEntityId] = useState('');
  const [videoOpen, setVideoOpen] = useState(false);
  const activeTenant = tenants.find((t) => t.id === tenantId);

  const entityOptions = useMemo(() => demoEntityOptions(fullState, tenantId), [fullState, tenantId]);
  const selectedEntityId = entityOptions.some((o) => o.entity.id === entityId) ? entityId : entityOptions[0]?.entity.id ?? '';
  const model = useMemo(
    () => buildDemoModel(fullState, activeTenant, selectedEntityId),
    [fullState, activeTenant, selectedEntityId],
  );

  /* The demo tenant selection drives the workspace itself, so the real
     screens below render exactly the selected tenant's data. */
  const pickTenant = (id: string) => {
    setTenantId(id);
    setEntityId('');
    setActiveTenant(id);
  };

  const demoFilters: AppFilters = useMemo(
    () => ({ entityId: selectedEntityId, departmentId: 'all', employeeId: 'all', period: 'week', anchor: toISO(new Date()) }),
    [selectedEntityId],
  );

  const scoped = useMemo(() => scopeStateToTenant(fullState, tenantId), [fullState, tenantId]);
  const entityIds = useMemo(() => entitySubtreeIds(scoped.entities, selectedEntityId), [scoped.entities, selectedEntityId]);
  void state;

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
        actions={<>
          <Button size="sm" variant="primary" onClick={() => setVideoOpen(true)}><Play className="h-3.5 w-3.5" /> Watch demo video</Button>
          <Button size="sm" onClick={exportPdf}><Download className="h-3.5 w-3.5" /> Export demo PDF</Button>
        </>}
      />

      {/* Tenant + entity selection drives the whole demo */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Tenant"><Select value={tenantId} onChange={(e) => pickTenant(e.target.value)}>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
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

      {/* Demo video — prominent banner so it is easy to find */}
      <button
        type="button"
        onClick={() => setVideoOpen(true)}
        data-demo-video-cta
        className="group mb-6 block w-full overflow-hidden rounded-2xl bg-slate-950 text-left shadow-xl ring-1 ring-slate-800 transition-transform hover:-translate-y-0.5"
      >
        <div className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-8">
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full text-white shadow-lg transition-transform group-hover:scale-110" style={{ background: model.brandColor }}>
            <Play className="ml-1 h-6 w-6 fill-white" />
          </span>
          <span className="min-w-0 flex-1 basis-64">
            <span className="block text-lg font-bold text-white">Watch the demo video</span>
            <span className="mt-0.5 block text-sm text-slate-300">
              A guided tour of all {model.screenshots.length} screens with AI voiceover — follows the tenant &amp; entity selected above ({model.entityName}).
            </span>
          </span>
          <span className="rounded-full border border-white/25 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white group-hover:bg-white/10">
            Play · {model.screenshots.length} scenes
          </span>
        </div>
      </button>

      {/* Screenshots — one detailed 20" screen per portal tab, one per page block */}
      <SectionHeader title={`Screenshots · ${model.screenshots.length} screens`} subtitle={`${model.entityName} · 20" display view, live from the workspace with AI briefs — not stock images`} className="mb-3" />
      <div className="mb-6 space-y-8">
        {model.screenshots.map((shot, index) => (
          <section key={shot.id} data-demo-shot={shot.id} className="scroll-mt-4">
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: model.brandColor }}>{index + 1} / {model.screenshots.length}</span>
              <h3 className="text-sm font-bold text-slate-900">{shot.title}</h3>
              <span className="text-xs text-slate-500">{shot.caption}</span>
            </div>
            <div className="flex flex-col gap-4 xl:flex-row">
              {/* 20" monitor frame — the real screen, auto-adjusted to fit */}
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden rounded-xl border-[10px] border-slate-900 bg-white shadow-2xl">
                  <ScaledFrame>
                    <div className="h-full overflow-y-auto bg-slate-100/70" style={{ width: 1440, height: 810 }}>
                      <RealScreen view={shot.kind} filters={demoFilters} />
                    </div>
                  </ScaledFrame>
                </div>
                {/* monitor stand */}
                <div className="mx-auto h-3 w-24 rounded-b-lg bg-slate-800" />
                <div className="mx-auto h-1.5 w-40 rounded-full bg-slate-700" />
              </div>
              {/* AI-generated brief */}
              <Card className="w-full xl:w-[340px] xl:flex-none">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: model.brandColor }}>
                  <Sparkles className="h-3.5 w-3.5" /> AI brief
                </div>
                <dl className="mt-2.5 space-y-2 text-[11px] leading-relaxed">
                  <div><dt className="font-bold text-slate-800">Purpose</dt><dd className="text-slate-600">{shot.brief.purpose}</dd></div>
                  <div><dt className="font-bold text-slate-800">Impact</dt><dd className="text-slate-600">{shot.brief.impact}</dd></div>
                  <div><dt className="font-bold text-slate-800">Outcome</dt><dd className="text-slate-600">{shot.brief.outcome}</dd></div>
                </dl>
                <div className="mt-3 border-t border-slate-100 pt-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">By industry</div>
                  <ul className="mt-1.5 space-y-1.5">
                    {shot.brief.examples.map((e) => (
                      <li key={e.industry} className="text-[11px] leading-snug text-slate-600">
                        <span className="font-semibold text-slate-800">{e.industry}:</span> {e.example}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {shot.points.map((p, i) => <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{p}</span>)}
                </div>
              </Card>
            </div>
          </section>
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
      <DemoVideo open={videoOpen} model={model} filters={demoFilters} onClose={() => setVideoOpen(false)} />
    </div>
  );
}
