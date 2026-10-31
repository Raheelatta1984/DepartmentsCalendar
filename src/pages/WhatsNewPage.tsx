import React from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cloud,
  Database,
  GitBranch,
  LayoutGrid,
  LifeBuoy,
  LockKeyhole,
  MessagesSquare,
  Newspaper,
  Package,
  Palette,
  Plane,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '../components/ui';
import { RELEASES_NEWEST_FIRST, type ReleaseIcon } from '../data/releases';
import type { ViewKey } from '../types';

/* Release content lives in src/data/releases.ts — this page only owns the
   presentation. Adding a release means editing that one file; the screen and
   docs/CHANGELOG.md are generated from it and cannot drift apart. */
const ICONS: Record<ReleaseIcon, React.ReactNode> = {
  lock: <LockKeyhole className="h-4 w-4" />,
  building: <Building2 className="h-4 w-4" />,
  branch: <GitBranch className="h-4 w-4" />,
  package: <Package className="h-4 w-4" />,
  shield: <ShieldCheck className="h-4 w-4" />,
  zap: <Zap className="h-4 w-4" />,
  server: <Server className="h-4 w-4" />,
  plane: <Plane className="h-4 w-4" />,
  refresh: <RefreshCw className="h-4 w-4" />,
  standup: <MessagesSquare className="h-4 w-4" />,
  layout: <LayoutGrid className="h-4 w-4" />,
  sparkles: <Sparkles className="h-4 w-4" />,
  wand: <WandSparkles className="h-4 w-4" />,
  palette: <Palette className="h-4 w-4" />,
  news: <Newspaper className="h-4 w-4" />,
  calendar: <CalendarDays className="h-4 w-4" />,
  cloud: <Cloud className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  lifebuoy: <LifeBuoy className="h-4 w-4" />,
};

export function WhatsNewPage({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  /* Rendered from the date-sorted list, so the screen stays newest-first even
     if an entry is appended out of order (npm test fails in that case too). */
  const releases = RELEASES_NEWEST_FIRST;
  const latest = releases[0];
  const justAdded = releases.filter((release) => release.label === 'Just added').length;

  return (
    <div>
      <PageHeader
        eyebrow="Portal updates"
        title="What’s new"
        description="Every user-visible change since the portal went live, newest first — including the work that ships under the surface."
        actions={<Badge tone="good"><CheckCircle2 className="h-3 w-3" /> You’re up to date</Badge>}
      />

      <Card className="mb-4 overflow-hidden !p-0">
        <div className="relative overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 px-5 py-6 text-white sm:px-7">
          <div className="absolute -right-8 -top-12 h-48 w-48 rounded-full border border-white/10" />
          <div className="absolute -right-1 -top-5 h-32 w-32 rounded-full border border-white/10" />
          <div className="relative max-w-2xl">
            <Badge tone="brand" className="!bg-white/10 !text-blue-100 !ring-white/10">
              <MessagesSquare className="h-3 w-3" /> New · People & reporting lines
            </Badge>
            <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">Check in, log time and follow up together.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              See stand-ups within your reporting line, share leadership updates, log actual time from any tab and raise urgent
              follow-ups. Structured one-on-ones bring wellbeing and career conversations together with AI summaries for leadership.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button className="!border-white/15 !bg-white !text-slate-900 hover:!bg-slate-100" onClick={() => onNavigate('standups')}>
                <CalendarDays className="h-3.5 w-3.5" /> Open daily stand-ups <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
              <Button className="!border-white/15 !bg-white/10 !text-white hover:!bg-white/20" onClick={() => onNavigate('one-on-ones')}>
                <GitBranch className="h-3.5 w-3.5" /> Explore one-on-ones
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-300">
              <span><strong className="font-semibold text-white">{releases.length}</strong> release notes</span>
              <span><strong className="font-semibold text-white">{justAdded}</strong> in the last few days</span>
              <span>Last updated <strong className="font-semibold text-white">{latest.released}</strong></span>
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" /><h2 className="text-sm font-semibold text-slate-800">Recent updates</h2></div>
        <Badge tone="neutral">{releases.length} notes · newest first</Badge>
      </div>
      <div className="space-y-3">
        {releases.map((release) => (
          <Card key={release.title}>
            <div className="flex gap-3">
              <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${release.tone === 'brand' ? 'bg-brand-50 text-brand-600' : release.tone === 'info' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-600'}`}>
                {ICONS[release.icon]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{release.title}</h3>
                  <Badge tone={release.tone}>{release.label}</Badge>
                  <span className="text-[10px] text-slate-400">{release.released}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{release.description}</p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {release.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />{bullet}
                    </li>
                  ))}
                </ul>
                {release.link ? (
                  <Button size="sm" className="mt-3" onClick={() => onNavigate(release.link!.view)}>
                    {release.link.label} <ArrowUpRight className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
