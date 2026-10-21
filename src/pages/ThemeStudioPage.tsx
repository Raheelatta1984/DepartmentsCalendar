import React, { useEffect, useMemo, useState } from 'react';
import { Check, ImagePlus, Palette, Sparkles, WandSparkles } from 'lucide-react';
import { useStore } from '../store';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import { useToast } from '../components/toast';
import { detectLogoColor, FONT_OPTIONS, fontStack, generateThemeSuggestion, getEntityTheme, type ThemeDraft } from '../lib/portal-theme';

const THEME_KEYS: (keyof ThemeDraft)[] = ['logoUrl', 'portalHeader', 'portalFooter', 'brandColor', 'backgroundColor', 'fontFamily', 'headingFont'];

export function ThemeStudioPage() {
  const { state, scope, upsertEntity } = useStore();
  const toast = useToast();
  const entities = state.entities;
  const defaultEntity = entities.find((entity) => entity.id === scope.user.entityId) ?? entities[0] ?? state.entities[0];
  const [entityId, setEntityId] = useState(defaultEntity?.id ?? '');
  const entity = state.entities.find((item) => item.id === entityId) ?? defaultEntity;
  const [draft, setDraft] = useState<ThemeDraft>(() => getEntityTheme(defaultEntity));
  const [brief, setBrief] = useState('Calm, modern and accessible; ocean tones with a clear executive feel');
  const [busy, setBusy] = useState(false);
  const canEdit = scope.canManageMaster;

  useEffect(() => {
    setDraft(getEntityTheme(entity));
  }, [entity?.id, entity?.logoUrl, entity?.portalHeader, entity?.portalFooter, entity?.brandColor, entity?.backgroundColor, entity?.fontFamily, entity?.headingFont]);

  const entityLabel = entity?.name ?? 'Your entity';
  const previewStyle = useMemo(() => ({
    backgroundColor: draft.backgroundColor,
    fontFamily: fontStack(draft.fontFamily),
    '--preview-brand': draft.brandColor,
  }) as React.CSSProperties, [draft]);

  const update = <K extends keyof ThemeDraft>(key: K, value: ThemeDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const saveTheme = () => {
    if (!entity || !canEdit) return;
    const changed: Partial<typeof entity> = {};
    for (const key of THEME_KEYS) changed[key] = draft[key] as never;
    upsertEntity({ ...entity, ...changed });
    toast.push({ tone: 'success', title: 'Portal brand applied', description: `${entity.name} now uses this logo, colour palette and typography.` });
  };

  const generate = async () => {
    if (!entity) return;
    setBusy(true);
    // The local design engine samples an uploaded logo when the browser permits it,
    // then combines the colour with the creative brief to propose a cohesive theme.
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const logoColor = await detectLogoColor(draft.logoUrl ?? '');
    setDraft(generateThemeSuggestion({ ...entity, logoUrl: draft.logoUrl, portalHeader: draft.portalHeader, portalFooter: draft.portalFooter }, brief, logoColor));
    setBusy(false);
    toast.push({ tone: 'success', title: 'Theme concept generated', description: logoColor ? 'The palette incorporates a sampled colour from your logo.' : 'Review the prompt-guided palette and live preview, then apply it to this entity.' });
  };

  const uploadLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.push({ tone: 'error', title: 'Choose an image file', description: 'Use PNG, JPEG, SVG or WebP.' });
      return;
    }
    if (file.size > 350_000) {
      toast.push({ tone: 'error', title: 'Logo is too large', description: 'Choose an image smaller than 350 KB so shared workspaces stay lightweight.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update('logoUrl', String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Configuration · Brand experience"
        title="Portal theme studio"
        description="Create a distinct portal identity for each company. Preview the logo, header, footer, colours and typography before applying it."
        actions={<Badge tone="brand"><Sparkles className="h-3 w-3" /> Entity-aware branding</Badge>}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2"><span className="rounded-lg bg-brand-50 p-2 text-brand-600"><WandSparkles className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-slate-900">Generate a theme concept</h2><p className="text-xs text-slate-500">Describe the look and feel you want for this entity.</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Entity">
                <Select value={entity?.id ?? ''} onChange={(event) => setEntityId(event.target.value)}>
                  {entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>
              <Field label="Entity logo" hint="Upload a small image or paste a hosted image URL">
                <div className="flex gap-2">
                  <Input value={draft.logoUrl} onChange={(event) => update('logoUrl', event.target.value)} placeholder="https://…" />
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 px-3 text-slate-600 hover:bg-slate-50" title="Upload logo">
                    <ImagePlus className="h-4 w-4" /><input className="sr-only" type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} />
                  </label>
                </div>
              </Field>
              <Field label="Creative direction" className="sm:col-span-2" hint="Try: ocean, forest, warm, sunset, violet, bold, calm or minimal. Add an industry or brand personality too.">
                <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" placeholder="e.g. A warm, confident healthcare portal…" />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={!entity || busy} onClick={generate}><Sparkles className="h-3.5 w-3.5" />{busy ? 'Generating…' : 'Generate theme'}</Button>
              <span className="text-[11px] text-slate-400">Local AI-style generator · no entity data is sent externally</span>
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">This demo uses a prompt-guided local design engine, not a connected third-party AI model. It creates a safe, immediate palette suggestion without requiring an API key; generated values remain editable below.</p>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-slate-900">Fine-tune your portal</h2><p className="text-xs text-slate-500">These settings are stored on the selected entity.</p></div><Palette className="h-4 w-4 text-slate-400" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Portal header"><Input value={draft.portalHeader} onChange={(event) => update('portalHeader', event.target.value)} /></Field>
              <Field label="Portal footer"><Input value={draft.portalFooter} onChange={(event) => update('portalFooter', event.target.value)} /></Field>
              <Field label="Accent colour" hint="Navigation highlights and key actions"><div className="flex gap-2"><input aria-label="Accent colour" type="color" value={draft.brandColor} onChange={(event) => update('brandColor', event.target.value)} className="h-10 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1"/><Input value={draft.brandColor} onChange={(event) => update('brandColor', event.target.value)} /></div></Field>
              <Field label="Page background"><div className="flex gap-2"><input aria-label="Page background" type="color" value={draft.backgroundColor} onChange={(event) => update('backgroundColor', event.target.value)} className="h-10 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1"/><Input value={draft.backgroundColor} onChange={(event) => update('backgroundColor', event.target.value)} /></div></Field>
              <Field label="Body font"><Select value={draft.fontFamily} onChange={(event) => update('fontFamily', event.target.value as ThemeDraft['fontFamily'])}>{FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</Select></Field>
              <Field label="Heading font"><Select value={draft.headingFont} onChange={(event) => update('headingFont', event.target.value as ThemeDraft['headingFont'])}>{FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</Select></Field>
            </div>
            {!canEdit ? <p className="mt-3 text-xs text-amber-700">Your role has read-only access to entity configuration.</p> : null}
            <div className="mt-4 flex justify-end"><Button variant="primary" disabled={!canEdit || !entity} onClick={saveTheme}><Check className="h-3.5 w-3.5" /> Apply theme to {entityLabel}</Button></div>
          </Card>
        </div>

        <Card className="!p-3">
          <div className="mb-2 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Live preview</h2><p className="text-xs text-slate-500">Changes appear here before you apply them.</p></div><Badge tone="neutral">{entityLabel}</Badge></div>
          <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm" style={previewStyle}>
            <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: draft.brandColor }}>
              {draft.logoUrl ? <img src={draft.logoUrl} alt={`${entityLabel} logo`} className="h-9 w-9 rounded-lg bg-white object-contain p-1" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">{entityLabel.slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0"><div className="truncate text-sm font-semibold">{draft.portalHeader || entityLabel}</div><div className="text-[10px] text-white/75">{entityLabel} · Department Calendar</div></div>
              <div className="ml-auto rounded-md bg-white/15 px-2 py-1 text-[10px]">Workspace</div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-xl bg-white p-4 shadow-sm"><div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: draft.brandColor }}>Welcome back</div><h3 className="mt-2 text-lg font-semibold text-slate-900" style={{ fontFamily: fontStack(draft.headingFont) }}>Your work, in focus.</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">A clear view of team activity, capacity and what comes next.</p><button className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: draft.brandColor }}>View dashboard</button></div>
              <div className="space-y-2"><div className="rounded-xl border border-white bg-white/75 p-3"><div className="text-[10px] text-slate-500">Team workload</div><div className="mt-2 h-2 rounded-full bg-slate-200"><div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: draft.brandColor }} /></div><div className="mt-2 text-xs font-semibold text-slate-800">68% capacity</div></div><div className="rounded-xl border border-white bg-white/75 p-3"><div className="text-[10px] text-slate-500">Upcoming</div><div className="mt-1 text-xs font-semibold text-slate-800">Department planning · 10:30</div></div></div>
            </div>
            <div className="border-t border-slate-200/70 px-4 py-3 text-[10px] text-slate-500">{draft.portalFooter || `© ${entityLabel}`}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
