import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, X } from 'lucide-react';
import type { AppFilters, ViewKey } from '../types';
import { AI_GUIDE, matchGuideRule, type GuideEntry } from '../lib/ai-guide';
import { buildLiveFacts } from '../lib/ai-guide-live';
import { useStore } from '../store';
import { IconButton } from './ui';

/* ------------------------------------------------------------------ */
/* AI guide panel — top of every tab and section                       */
/*                                                                     */
/* A paper note pinned to the top of the content area, not a floating  */
/* bubble in the corner: GUIDE badge, a one-line promise, the prose    */
/* that explains the screen, a short “Do this” list, one “Watch”       */
/* caution and a collapsible “Live context” block computed from the    */
/* same snapshot the screen above it is reading. It follows the        */
/* section / sub-tab in focus, sits at the top of the tab, and folds   */
/* down to a single line when the reader wants the screen back.        */
/* Everything runs locally.                                            */
/* ------------------------------------------------------------------ */

const ENABLED_KEY = 'orbit.ai-guide.enabled.v1';
const OPEN_KEY = 'orbit.ai-guide.open.v1';

const enabledListeners = new Set<(v: boolean) => void>();

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) !== false : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the session toggle still works in memory */
  }
}

/** Shared enable/disable state, persisted and synced across consumers. */
export function useAiGuideEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(() => readStoredBoolean(ENABLED_KEY, true));

  useEffect(() => {
    const sync = (v: boolean) => setEnabledState(v);
    enabledListeners.add(sync);
    return () => {
      enabledListeners.delete(sync);
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    writeStoredBoolean(ENABLED_KEY, v);
    enabledListeners.forEach((fn) => fn(v));
  }, []);

  return [enabled, setEnabled];
}

/** Top-bar toggle, available on every tab. */
export function AiGuideToggle({ className = '' }: { className?: string }) {
  const [enabled, setEnabled] = useAiGuideEnabled();
  return (
    <IconButton
      title={enabled ? 'Hide AI guide' : 'Show AI guide'}
      active={enabled}
      onClick={() => setEnabled(!enabled)}
      className={className}
    >
      <Sparkles className="h-4 w-4" />
    </IconButton>
  );
}

interface GuideContext {
  section: string;
  subTabs: string[];
}

const EMPTY_CONTEXT: GuideContext = { section: '', subTabs: [] };

/* Sticky-note palette, kept in one place so the paper, tape and ink
   stay consistent wherever the note lands. */
const PAPER = '#f6e6a2';
const PAPER_EDGE = '#d9c377';
const INK = '#2f2c18';
const INK_SOFT = '#57522f';
const INK_MUTED = '#7c7449';
const WATCH = '#9d3a17';

export function AiGuide({ view, filters }: { view: ViewKey; filters: AppFilters }) {
  const { state, scope } = useStore();
  const [enabled, setEnabled] = useAiGuideEnabled();
  const [open, setOpen] = useState<boolean>(() => readStoredBoolean(OPEN_KEY, true));
  const [context, setContext] = useState<GuideContext>(EMPTY_CONTEXT);
  const [liveOpen, setLiveOpen] = useState(false);

  const viewGuide = AI_GUIDE[view] ?? AI_GUIDE.dashboard;

  const setOpenState = useCallback((v: boolean) => {
    setOpen(v);
    writeStoredBoolean(OPEN_KEY, v);
  }, []);

  /* ---- Track the active section / sub-section on this tab ---------- */
  useEffect(() => {
    let raf = 0;

    const refresh = () => {
      raf = 0;
      const scopeEl = document.querySelector('main') ?? document.body;

      // Section + sub-section headings (h2 = SectionHeader titles and card headings).
      // The guide's own heading opts out with data-guide-ignore. At the top of
      // a screen the note stays on the page overview; the scroll-spy only
      // takes over once the reader has actually moved.
      let section = '';
      const threshold = window.innerHeight * 0.35;
      const scrolled = (window.scrollY || document.documentElement?.scrollTop || 0) > 96;
      for (const el of scrolled ? Array.from(scopeEl.querySelectorAll<HTMLElement>('h2:not([data-guide-ignore])')) : []) {
        const rect = el.getBoundingClientRect();
        // Skip detached/hidden headings (zero boxes) so jsdom and collapsed
        // panels never win the scroll-spy.
        if (rect.top === 0 && rect.bottom === 0) continue;
        if (rect.top <= threshold) {
          section = (el.textContent ?? '').trim();
        } else {
          break;
        }
      }

      // Active sub-tab chips (see the Tabs primitive). Filter chips opt out
      // with data-guide-skip: a period grain is not a sub-section.
      const subTabs = Array.from(scopeEl.querySelectorAll<HTMLElement>('[data-guide-tab][data-guide-active="true"]'))
        .map((el) => (el.getAttribute('data-guide-label') || el.textContent || '').trim())
        .filter(Boolean);

      setContext((prev) => (prev.section === section && prev.subTabs.join('|') === subTabs.join('|') ? prev : { section, subTabs }));
    };

    let timer = 0;
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(refresh);
      // Follow-up pass after React has committed the interaction: a tab click
      // can land after the animation frame has already read the old DOM.
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 90);
    };

    const scopeEl = document.querySelector('main') ?? document.body;
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    // Watch the active-tab flag as well as node changes: switching a sub-tab
    // often only patches attributes, and the note must follow immediately.
    observer?.observe(scopeEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-guide-active'],
    });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // A tab or filter click changes the active section without necessarily
    // inserting nodes, so listen for it directly as well as watching the DOM.
    document.addEventListener('click', schedule, true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key === 'Enter' || event.key.startsWith('Arrow')) schedule();
    };
    document.addEventListener('keydown', onKey, true);
    schedule();
    const late = window.setTimeout(refresh, 700); // catch async page renders

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('click', schedule, true);
      document.removeEventListener('keydown', onKey, true);
      window.clearTimeout(late);
    };
  }, [view]);

  /* ---- Resolve the most specific guide entry ----------------------- */
  const guide = useMemo<{ entry: GuideEntry; kind: string; label: string; subtitle: string }>(() => {
    const fallbackSubtitle = (kind: string, label: string) => `${kind}${label ? ` · ${label}` : ''} in ${viewGuide.title}`;

    const sectionEntry = context.section ? matchGuideRule(viewGuide.sections, context.section) : null;
    // A section keeps the screen's caution and notes unless it has its own,
    // so the note never loses the Watch line or Live context on drill-down.
    const withScreenContext = (entry: GuideEntry): GuideEntry => ({
      ...entry,
      watch: entry.watch ?? viewGuide.watch,
      context: entry.context ?? viewGuide.context,
    });

    if (sectionEntry) {
      return {
        entry: withScreenContext(sectionEntry),
        kind: 'Section',
        label: context.section,
        subtitle: sectionEntry.subtitle ?? fallbackSubtitle('Section', context.section),
      };
    }

    for (const tab of context.subTabs) {
      const subEntry = matchGuideRule(viewGuide.subTabs, tab);
      if (subEntry) {
        return {
          entry: withScreenContext(subEntry),
          kind: 'Sub-section',
          label: tab,
          subtitle: subEntry.subtitle ?? fallbackSubtitle('Sub-section', tab),
        };
      }
    }

    if (context.section) {
      // Known sub-section without its own catalog entry: keep tab guidance,
      // but still name where the user is.
      return {
        entry: { title: context.section, blurb: viewGuide.blurb, tips: viewGuide.tips, watch: viewGuide.watch, context: viewGuide.context },
        kind: 'Section',
        label: context.section,
        subtitle: fallbackSubtitle('Section', context.section),
      };
    }
    if (context.subTabs.length) {
      const tab = context.subTabs[0];
      return {
        entry: { title: tab, blurb: viewGuide.blurb, tips: viewGuide.tips, watch: viewGuide.watch, context: viewGuide.context },
        kind: 'Sub-section',
        label: tab,
        subtitle: fallbackSubtitle('Sub-section', tab),
      };
    }
    return {
      entry: { title: viewGuide.title, blurb: viewGuide.blurb, tips: viewGuide.tips, watch: viewGuide.watch, context: viewGuide.context },
      kind: 'Tab',
      label: '',
      subtitle: viewGuide.subtitle ?? viewGuide.blurb,
    };
  }, [viewGuide, context]);

  /* ---- Live context: the engine's own figures for this screen ------ */
  const liveFacts = useMemo(
    () => buildLiveFacts({ view, state, scope, filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, state, scope, filters.entityId, filters.period, filters.anchor, filters.departmentId],
  );
  const notes = guide.entry.context ?? [];
  const liveCount = liveFacts.length + notes.length;

  if (!enabled) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#d9c377] bg-[#f6e6a2]/70 px-3 py-2">
        <Sparkles className="h-4 w-4" style={{ color: INK }} />
        <span className="text-[11px] font-semibold" style={{ color: INK }}>
          AI guide is off.
        </span>
        <span className="text-[11px]" style={{ color: INK_MUTED }}>
          The guidance panel sits at the top of every tab when it is on.
        </span>
        <button
          type="button"
          onClick={() => setEnabled(true)}
          className="ml-auto rounded-full border border-[#4a442a]/45 px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-[#e6d189]/60"
          style={{ color: INK }}
        >
          Show AI guide
        </button>
      </div>
    );
  }

  return (
    <section className="mb-3">
      <div
        role="complementary"
        aria-label="AI guide"
        className="relative overflow-hidden rounded-2xl shadow-[0_14px_34px_-26px_rgba(15,23,42,0.55)]"
        style={{
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          backgroundColor: PAPER,
          backgroundImage: `linear-gradient(168deg, #fbf0c4 0%, ${PAPER} 42%, #f1dd93 100%)`,
          border: `1px solid ${PAPER_EDGE}`,
        }}
      >
        {/* A strip of tape pinning the note to the top of the section. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-2 left-6 h-5 w-24 -rotate-2 rounded-[2px] border border-white/55 bg-white/60 shadow-[0_3px_8px_rgba(15,23,42,0.14)]"
        />

        <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 pb-2 pt-2.5 sm:px-4">
          <span className="mt-0.5 rounded-md bg-[#22200f] px-2 py-1 text-[9px] font-bold uppercase leading-none tracking-[0.2em] text-[#f7ecc6]">
            Guide
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 data-guide-ignore className="text-[15px] font-bold leading-tight tracking-tight" style={{ color: INK }}>
                {guide.entry.title}
              </h2>
              <span className="text-[11px] italic leading-tight" style={{ color: INK_MUTED }}>
                {guide.subtitle}
              </span>
            </div>
            {open ? (
              <p className="mt-1 max-w-4xl text-[12.5px] leading-relaxed" style={{ color: INK_SOFT }}>
                {guide.entry.blurb}
              </p>
            ) : null}
          </div>
          <div className="flex flex-none items-center gap-1">
            {liveCount ? (
              <button
                type="button"
                onClick={() => setLiveOpen((v) => !v)}
                aria-expanded={liveOpen}
                className="flex items-center gap-1 rounded-full border border-[#4a442a]/35 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] transition-colors hover:bg-[#e6d189]/60"
                style={{ color: '#4e4a2b' }}
              >
                <ChevronRight className="h-3 w-3 transition-transform" style={{ transform: liveOpen ? 'rotate(90deg)' : 'none' }} />
                Live context ({liveCount})
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpenState(!open)}
              aria-expanded={open}
              aria-label={open ? 'Collapse AI guide' : 'Expand AI guide'}
              title={open ? 'Collapse the guide' : 'Expand the guide'}
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[#4a442a]/45 transition-colors hover:bg-[#e6d189]/60"
              style={{ color: '#3b3721' }}
            >
              <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
            </button>
            <button
              type="button"
              aria-label="Hide AI guide"
              title="Hide AI guide"
              onClick={() => setEnabled(false)}
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[#4a442a]/45 transition-colors hover:bg-[#e6d189]/60"
              style={{ color: '#3b3721' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {open ? (
          <div className="grid gap-x-6 gap-y-2 border-t px-3 pb-2.5 pt-2 sm:px-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" style={{ borderColor: 'rgba(133,118,58,0.28)' }}>
            <div>
              {guide.entry.tips.length ? (
                <>
                  <p className="text-[12px] font-bold leading-none" style={{ color: INK }}>
                    Do this:
                  </p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-[19px] text-[12.5px] leading-snug marker:font-semibold" style={{ color: INK_SOFT }}>
                    {guide.entry.tips.map((tip) => (
                      <li key={tip} className="pl-0.5">
                        {tip}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
            </div>

            <div className="space-y-1.5">
              {guide.entry.watch ? (
                <p className="text-[12.5px] leading-snug" style={{ color: WATCH }}>
                  <span className="font-bold">Watch: </span>
                  {guide.entry.watch}
                </p>
              ) : null}

              {liveOpen && liveCount ? (
                <div className="rounded-lg border px-2 py-1.5" style={{ borderColor: 'rgba(133,118,58,0.28)' }}>
                  {liveFacts.length ? (
                    <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                      {liveFacts.map((fact) => (
                        <div key={fact.label} className="flex items-baseline gap-1.5 text-[11px] leading-snug">
                          <dt className="flex-none" style={{ color: INK_MUTED }}>
                            {fact.label}
                          </dt>
                          <dd className="min-w-0 truncate font-semibold" style={{ color: INK }} title={fact.value}>
                            {fact.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {notes.length ? (
                    <ul className="mt-1 space-y-0.5 border-t pt-1 text-[11px] leading-snug" style={{ borderColor: 'rgba(133,118,58,0.28)', color: INK_SOFT }}>
                      {notes.map((note) => (
                        <li key={note} className="flex gap-1.5">
                          <span aria-hidden="true" style={{ color: INK_MUTED }}>
                            ·
                          </span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <p className="border-t pt-1.5 text-[10px] leading-relaxed" style={{ borderColor: 'rgba(133,118,58,0.3)', color: INK_MUTED }}>
                The notes are written by the people who built the screens and refreshed with the engine’s own figures; they
                are guidance, not advice, and they never override a rule the engine enforces.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
