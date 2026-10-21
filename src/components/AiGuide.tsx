import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Sparkles, X } from 'lucide-react';
import type { AppFilters, ViewKey } from '../types';
import { AI_GUIDE, matchGuideRule, type GuideEntry } from '../lib/ai-guide';
import { buildLiveFacts } from '../lib/ai-guide-live';
import { useStore } from '../store';
import { IconButton } from './ui';

/* ------------------------------------------------------------------ */
/* AI guide sticky note                                                */
/*                                                                     */
/* A taped paper note that follows the user across every tab, section  */
/* and sub-section: GUIDE badge, a one-line promise, the prose that    */
/* explains the screen, a short “Do this” list, one “Watch” caution    */
/* and a collapsible “Live context” block computed from the same       */
/* snapshot the screen above it is reading. Everything runs locally.   */
/* ------------------------------------------------------------------ */

const ENABLED_KEY = 'orbit.ai-guide.enabled.v1';

const enabledListeners = new Set<(v: boolean) => void>();

function readEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(ENABLED_KEY);
    return raw ? JSON.parse(raw) !== false : true;
  } catch {
    return true;
  }
}

/** Shared enable/disable state, persisted and synced across consumers. */
export function useAiGuideEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(() => readEnabled());

  useEffect(() => {
    const sync = (v: boolean) => setEnabledState(v);
    enabledListeners.add(sync);
    return () => {
      enabledListeners.delete(sync);
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(ENABLED_KEY, JSON.stringify(v));
    } catch {
      /* storage unavailable — the session toggle still works in memory */
    }
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
  const [context, setContext] = useState<GuideContext>(EMPTY_CONTEXT);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [maxWidth, setMaxWidth] = useState(() => (typeof window !== 'undefined' ? Math.min(372, window.innerWidth - 24) : 372));
  const [liveOpen, setLiveOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const viewGuide = AI_GUIDE[view] ?? AI_GUIDE.dashboard;

  /* ---- Track the active section / sub-section on this tab ---------- */
  useEffect(() => {
    let raf = 0;

    const refresh = () => {
      raf = 0;
      const scopeEl = document.querySelector('main') ?? document.body;

      // Section + sub-section headings (h2 = SectionHeader titles and card headings).
      // At the top of a screen the note stays on the page overview; the
      // scroll-spy only takes over once the reader has actually moved.
      let section = '';
      const threshold = window.innerHeight * 0.35;
      const scrolled = (window.scrollY || document.documentElement?.scrollTop || 0) > 96;
      for (const el of scrolled ? Array.from(scopeEl.querySelectorAll<HTMLElement>('h2')) : []) {
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

    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(refresh);
    };

    const scopeEl = document.querySelector('main') ?? document.body;
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    observer?.observe(scopeEl, { childList: true, subtree: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    const late = window.setTimeout(refresh, 700); // catch async page renders

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
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

  /* ---- Auto width & height: measure the content, clamp to viewport -- */
  useLayoutEffect(() => {
    if (!enabled) {
      setSize(null);
      return;
    }
    const measure = () => {
      const content = contentRef.current;
      const header = headerRef.current;
      if (!content || !header) return;
      const maxW = Math.min(372, window.innerWidth - 24);
      const minW = Math.min(252, maxW);
      const maxH = Math.min(560, window.innerHeight - 96);
      const minH = Math.min(196, maxH);
      setMaxWidth((prev) => (prev === maxW ? prev : maxW));
      const width = Math.round(Math.min(maxW, Math.max(minW, content.scrollWidth + 34)));
      const desired = content.scrollHeight + header.offsetHeight + 26;
      const height = Math.round(Math.min(maxH, Math.max(minH, desired)));
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };

    measure();
    const ro =
      typeof ResizeObserver !== 'undefined' && contentRef.current && headerRef.current
        ? new ResizeObserver(measure)
        : null;
    if (ro && contentRef.current && headerRef.current) {
      ro.observe(contentRef.current);
      ro.observe(headerRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled, guide, liveOpen, liveFacts]);

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={() => setEnabled(true)}
        title="Enable AI guide"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-[#d9c377] bg-[#f6e6a2] px-3.5 py-2.5 text-xs font-semibold text-[#2f2c18] shadow-[0_14px_30px_-12px_rgba(15,23,42,0.5)] transition-colors hover:bg-[#f2dc86]"
      >
        <Sparkles className="h-4 w-4" />
        AI guide
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)]">
      <div className="relative">
        {/* A strip of tape holding the note to the screen. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-3 left-7 z-10 h-6 w-28 -rotate-2 rounded-[2px] border border-white/55 bg-white/60 shadow-[0_3px_8px_rgba(15,23,42,0.2)] backdrop-blur-[1px]"
        />
        <div
          role="complementary"
          aria-label="AI guide"
          className="flex flex-col overflow-hidden rounded-[18px] shadow-[0_24px_54px_-20px_rgba(15,23,42,0.55)]"
          style={{
            fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
            width: size?.width ?? 308,
            height: size?.height ?? 232,
            visibility: size ? 'visible' : 'hidden',
            backgroundColor: PAPER,
            backgroundImage: `linear-gradient(168deg, #fbf0c4 0%, ${PAPER} 42%, #f1dd93 100%)`,
            border: `1px solid ${PAPER_EDGE}`,
            transition: 'width 220ms ease, height 220ms ease',
          }}
        >
          <div ref={headerRef} className="flex-none px-4 pb-1.5 pt-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="rounded-md bg-[#22200f] px-2 py-1 text-[9px] font-bold uppercase leading-none tracking-[0.2em] text-[#f7ecc6]">
                Guide
              </span>
              <button
                type="button"
                aria-label="Hide AI guide"
                title="Hide AI guide"
                onClick={() => setEnabled(false)}
                className="-mt-0.5 flex h-8 w-7 flex-none items-center justify-center rounded-[999px] border border-[#4a442a]/45 text-[#3b3721] transition-colors hover:bg-[#e6d189]/60 hover:text-[#221f10]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3.5 pt-1">
            <div ref={contentRef} style={{ width: 'max-content', maxWidth: Math.max(120, maxWidth - 34) }}>
              <h2 className="text-[16px] font-bold leading-tight tracking-tight" style={{ color: INK }}>
                {guide.entry.title}
              </h2>
              <p className="mt-0.5 text-[12px] italic leading-snug" style={{ color: INK_MUTED }}>
                {guide.subtitle}
              </p>

              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: INK_SOFT }}>
                {guide.entry.blurb}
              </p>

              {guide.entry.tips.length ? (
                <>
                  <p className="mt-2.5 text-[12.5px] font-bold leading-none" style={{ color: INK }}>
                    Do this:
                  </p>
                  <ol
                    className="mt-1.5 list-decimal space-y-1 pl-[19px] text-[12.5px] leading-snug marker:font-semibold"
                    style={{ color: INK_SOFT }}
                  >
                    {guide.entry.tips.map((tip) => (
                      <li key={tip} className="pl-0.5">
                        {tip}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}

              {guide.entry.watch ? (
                <p className="mt-2.5 text-[12.5px] leading-snug" style={{ color: WATCH }}>
                  <span className="font-bold">Watch: </span>
                  {guide.entry.watch}
                </p>
              ) : null}

              {liveCount ? (
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => setLiveOpen((open) => !open)}
                    aria-expanded={liveOpen}
                    className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] transition-opacity hover:opacity-70"
                    style={{ color: '#4e4a2b' }}
                  >
                    <ChevronRight
                      className="h-3 w-3 transition-transform"
                      style={{ transform: liveOpen ? 'rotate(90deg)' : 'none' }}
                    />
                    Live context ({liveCount})
                  </button>
                  {liveOpen ? (
                    <div className="mt-1.5 space-y-1.5">
                      {liveFacts.length ? (
                        <dl className="space-y-1">
                          {liveFacts.map((fact) => (
                            <div key={fact.label} className="flex items-baseline gap-2 text-[11px] leading-snug">
                              <dt className="w-[104px] flex-none" style={{ color: INK_MUTED }}>
                                {fact.label}
                              </dt>
                              <dd className="font-semibold" style={{ color: INK }}>
                                {fact.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {notes.length ? (
                        <ul className="space-y-1 border-t pt-1.5 text-[11px] leading-snug" style={{ borderColor: 'rgba(133,118,58,0.28)', color: INK_SOFT }}>
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
                </div>
              ) : null}

              <p
                className="mt-2.5 border-t pt-2 text-[10px] leading-relaxed"
                style={{ borderColor: 'rgba(133,118,58,0.3)', color: INK_MUTED }}
              >
                The notes are written by the people who built the screens and refreshed with the engine’s own figures; they
                are guidance, not advice, and they never override a rule the engine enforces.
              </p>
            </div>
          </div>
        </div>

        {/* Hand-drawn tick, like a note someone signed off on. */}
        <Check
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-3 -left-2.5 h-7 w-7 -rotate-6 opacity-60"
          style={{ color: '#b9932f' }}
        />
      </div>
    </div>
  );
}
