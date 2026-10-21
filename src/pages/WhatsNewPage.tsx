import React from 'react';
import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, Palette, Sparkles, WandSparkles } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '../components/ui';

const updates = [
  {
    label: 'Just added',
    date: 'October 2026',
    title: 'A guide that reads like a note, and a dashboard that stays on one entity',
    description:
      'The AI guide is now a taped sticky note: a GUIDE badge, a one-line promise, the prose that explains the screen, a short numbered “Do this” list, one “Watch” caution and a collapsible Live context block built from the figures on screen. The command centre also gained an entity picker, so every card, score, queue and the day board read one legal entity and its companies at a time — all entities in scope is still one click away.',
    icon: <Sparkles className="h-4 w-4" />,
    tone: 'brand' as const,
    bullets: [
      'Sticky-note guide with Do this, Watch and Live context',
      'Live context computed from the same snapshot as the screen',
      'Entity picker scopes the whole command centre',
      'Entity focus narrows role scope — it never widens it',
    ],
  },
  {
    label: 'Earlier',
    date: 'October 2026',
    title: 'AI guide and entity-scoped profile selection',
    description:
      'A contextual AI guide sticky note now follows you across every tab, section and sub-section, auto-adjusting its width and height to the content, with an enable/disable toggle in the note and the top bar. Profile switching now flows through group of company → entity, so only the selected company’s employees are listed.',
    icon: <WandSparkles className="h-4 w-4" />,
    tone: 'brand' as const,
    bullets: ['AI guide on every screen, auto-fitted to its content', 'One-click enable/disable toggle everywhere', 'Profiles scoped to the selected entity’s employees'],
  },
  {
    label: 'Just added',
    date: 'October 2026',
    title: 'A portal that feels like your brand',
    description: 'Set a logo, header and footer for each entity, then tune accent and background colours plus body and heading fonts. Preview changes and apply them to the entity in Theme Studio.',
    icon: <Palette className="h-4 w-4" />,
    tone: 'brand' as const,
    bullets: ['Per-entity portal identity', 'Live preview before applying', 'Prompt-guided theme suggestions'],
  },
  {
    label: 'New workspace',
    date: 'October 2026',
    title: 'A dedicated place for portal updates',
    description: 'The What’s new area keeps recent improvements and useful release highlights separate from day-to-day calendar work.',
    icon: <Sparkles className="h-4 w-4" />,
    tone: 'good' as const,
    bullets: ['Find new capabilities quickly', 'See the latest portal improvements'],
  },
  {
    label: 'Available',
    date: 'Recently added',
    title: 'Projects and capitalisation workflow',
    description: 'Keep delivery milestones, project effort and capitalisation approvals connected to the wider department activity picture.',
    icon: <CalendarDays className="h-4 w-4" />,
    tone: 'info' as const,
    bullets: ['Project portfolio visibility', 'Capitalisation review and approval'],
  },
];

export function WhatsNewPage({ onOpenThemeStudio }: { onOpenThemeStudio: () => void }) {
  return (
    <div>
      <PageHeader eyebrow="Portal updates" title="What’s new" description="A quick look at recent improvements to your department calendar portal." actions={<Badge tone="good"><CheckCircle2 className="h-3 w-3" /> You’re up to date</Badge>} />
      <Card className="mb-4 overflow-hidden !p-0">
        <div className="relative overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 px-5 py-6 text-white sm:px-7">
          <div className="absolute -right-8 -top-12 h-48 w-48 rounded-full border border-white/10" /><div className="absolute -right-1 -top-5 h-32 w-32 rounded-full border border-white/10" />
          <div className="relative max-w-2xl"><Badge tone="brand" className="!bg-white/10 !text-blue-100 !ring-white/10"><WandSparkles className="h-3 w-3" /> New · Theme Studio</Badge><h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">Make the portal unmistakably yours.</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">Create an entity-specific look with its own logo, colours and typography. Generate a theme concept, preview it, and apply it when you’re ready.</p><Button className="mt-4 !border-white/15 !bg-white !text-slate-900 hover:!bg-slate-100" onClick={onOpenThemeStudio}><Palette className="h-3.5 w-3.5" /> Open Theme Studio <ArrowUpRight className="h-3.5 w-3.5" /></Button></div>
        </div>
      </Card>
      <div className="mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" /><h2 className="text-sm font-semibold text-slate-800">Recent updates</h2></div>
      <div className="space-y-3">
        {updates.map((update) => <Card key={update.title}>
          <div className="flex gap-3"><div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-600">{update.icon}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-900">{update.title}</h3><Badge tone={update.tone}>{update.label}</Badge><span className="text-[10px] text-slate-400">{update.date}</span></div><p className="mt-1 text-xs leading-relaxed text-slate-500">{update.description}</p><ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{update.bullets.map((bullet) => <li key={bullet} className="flex items-center gap-1.5 text-[11px] text-slate-600"><CheckCircle2 className="h-3 w-3 text-emerald-500" />{bullet}</li>)}</ul></div></div>
        </Card>)}
      </div>
    </div>
  );
}
