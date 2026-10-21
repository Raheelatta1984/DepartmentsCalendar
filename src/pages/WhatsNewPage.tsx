import React from 'react';
import { ArrowUpRight, CalendarDays, Palette, Sparkles } from 'lucide-react';
import { Card, PageHeader } from '../components/ui';

const updates = [
  { date: 'Just shipped', title: 'Your portal, your brand', text: 'Build an entity-aware visual identity with a logo, colours, typography, and branded header and footer.', icon: <Palette className="h-4 w-4" />, tone: 'bg-violet-50 text-violet-700' },
  { date: 'Just shipped', title: 'AI-assisted theme generation', text: 'Describe the feel you want and generate a complete theme proposal. Review it, tweak it, and apply it when you are ready.', icon: <Sparkles className="h-4 w-4" />, tone: 'bg-amber-50 text-amber-700' },
  { date: 'In your workspace', title: 'A clearer view of what matters', text: 'Use the command centre, department calendar, activity register, and roadmap to stay aligned across teams.', icon: <CalendarDays className="h-4 w-4" />, tone: 'bg-sky-50 text-sky-700' },
];

export function WhatsNewPage({ onOpenTheme }: { onOpenTheme: () => void }) {
  return <div><PageHeader eyebrow="Product updates" title="What's new" description="A quick look at the latest improvements to your Departments Calendar portal." />
    <div className="grid gap-3 lg:grid-cols-3">{updates.map((item) => <Card key={item.title} className="flex min-h-52 flex-col"><div className="flex items-center justify-between"><span className={`rounded-lg p-2 ${item.tone}`}>{item.icon}</span><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.date}</span></div><h2 className="mt-5 text-sm font-semibold text-slate-900">{item.title}</h2><p className="mt-2 flex-1 text-xs leading-5 text-slate-500">{item.text}</p>{item.title.includes('theme') ? <button onClick={onOpenTheme} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">Open theme studio <ArrowUpRight className="h-3 w-3" /></button> : null}</Card>)}</div>
    <p className="mt-5 text-[11px] text-slate-400">Updates will appear here as new capabilities are released.</p>
  </div>;
}
