import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, Sparkles, X } from 'lucide-react';
import type { ViewKey } from '../types';
import { AI_GUIDE, matchGuideRule, type GuideEntry } from '../lib/ai-guide';
import { IconButton } from './ui';

/* ------------------------------------------------------------------ */
/* AI guide sticky note                                                */
/*                                                                     */
/* A contextual sticky note that follows the user across every tab,    */
/* section and sub-section. It auto-adjusts its width and height to    */
/* the content and can be enabled / disabled from the note itself or   */
/* the top bar toggle. Everything runs locally in the browser.         */
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

export function AiGuide({ view }: { view: ViewKey }) {
  const [enabled, setEnabled] = useAiGuideEnabled();
  const [context, setContext] = useState<GuideContext>(EMPTY_CONTEXT);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [maxWidth, setMaxWidth] = useState(() => (typeof window !== 'undefined' ? Math.min(360, window.innerWidth - 24) : 360));
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const viewGuide = AI_GUIDE[view] ?? AI_GUIDE.dashboard;

  /* ---- Track the active section / sub-section on this tab ---------- */
  useEffect(() => {
    let raf = 0;

    const refresh = () => {
      raf = 0;
      const scope = document.querySelector('main') ?? document.body;

      // Section + sub-section headings (h2 = SectionHeader titles and card headings).
      let section = '';
      const threshold = window.innerHeight * 0.35;
      for (const el of Array.from(scope.querySelectorAll<HTMLElement>('h2'))) {
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

      // Active sub-tab chips (see the Tabs primitive).
      const subTabs = Array.from(scope.querySelectorAll<HTMLElement>('[data-guide-tab][data-guide-active="true"]'))
        .map((el) => (el.getAttribute('data-guide-label') || el.textContent || '').trim())
        .filter(Boolean);

      setContext((prev) => (prev.section === section && prev.subTabs.join('|') === subTabs.join('|') ? prev : { section, subTabs }));
    };

    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(refresh);
    };

    const scope = document.querySelector('main') ?? document.body;
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    observer?.observe(scope, { childList: true, subtree: true });
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
  const guide = useMemo<{ entry: GuideEntry; kind: string; label: string }>(() => {
    const sectionEntry = context.section ? matchGuideRule(viewGuide.sections, context.section) : null;
    if (sectionEntry) return { entry: sectionEntry, kind: 'Section', label: context.section };

    for (const tab of context.subTabs) {
      const subEntry = matchGuideRule(viewGuide.subTabs, tab);
      if (subEntry) return { entry: subEntry, kind: 'Sub-section', label: tab };
    }

    if (context.section) {
      // Known sub-section without its own catalog entry: keep tab guidance,
      // but still name where the user is.
      return {
        entry: { title: context.section, blurb: viewGuide.blurb, tips: viewGuide.tips },
        kind: 'Section',
        label: context.section,
      };
    }
    if (context.subTabs.length) {
      const tab = context.subTabs[0];
      return { entry: { title: tab, blurb: viewGuide.blurb, tips: viewGuide.tips }, kind: 'Sub-section', label: tab };
    }
    return { entry: { title: viewGuide.title, blurb: viewGuide.blurb, tips: viewGuide.tips }, kind: 'Tab', label: '' };
  }, [viewGuide, context]);

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
      const maxW = Math.min(360, window.innerWidth - 24);
      const minW = Math.min(248, maxW);
      const maxH = Math.min(520, window.innerHeight - 110);
      const minH = Math.min(176, maxH);
      setMaxWidth((prev) => (prev === maxW ? prev : maxW));
      const width = Math.round(Math.min(maxW, Math.max(minW, content.scrollWidth + 28)));
      const desired = content.scrollHeight + header.offsetHeight + 22;
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
  }, [enabled, guide]);

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={() => setEnabled(true)}
        title="Enable AI guide"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-400 px-3.5 py-2.5 text-xs font-semibold text-amber-950 shadow-[0_14px_30px_-12px_rgba(15,23,42,0.5)] transition-colors hover:bg-amber-300"
      >
        <Sparkles className="h-4 w-4" />
        AI guide
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)]">
      <div
        role="complementary"
        aria-label="AI guide"
        className="flex flex-col overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-[0_22px_50px_-18px_rgba(15,23,42,0.5)]"
        style={{
          width: size?.width ?? 300,
          height: size?.height ?? 220,
          visibility: size ? 'visible' : 'hidden',
          transition: 'width 220ms ease, height 220ms ease',
        }}
      >
        <div ref={headerRef} className="flex-none bg-gradient-to-b from-amber-100 via-amber-50 to-amber-50/40 px-3.5 pt-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-xl bg-amber-400/80 text-amber-950">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold tracking-tight text-amber-950">AI guide</span>
                <span className="truncate text-[10px] text-amber-800/70">{viewGuide.title}</span>
              </div>
              <div className="truncate text-[10px] text-amber-800/60">{guide.entry.title}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={true}
              aria-label="Disable AI guide"
              title="Enable or disable the AI guide on every tab, section and sub-section"
              onClick={() => setEnabled(false)}
              className="inline-flex h-5 w-9 flex-none items-center rounded-full bg-amber-900/80 p-0.5 transition-colors hover:bg-amber-900"
            >
              <span className="h-4 w-4 translate-x-4 rounded-full bg-white shadow transition-transform" />
            </button>
            <button
              type="button"
              aria-label="Hide AI guide"
              title="Hide AI guide"
              onClick={() => setEnabled(false)}
              className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-amber-800/70 transition-colors hover:bg-amber-200/70 hover:text-amber-950"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {(context.subTabs.length > 0 || context.section) && (
            <div className="mt-2 flex flex-wrap gap-1 pb-2">
              {context.subTabs.map((tab) => (
                <span
                  key={tab}
                  title={`Sub-section · ${tab}`}
                  className="max-w-[130px] truncate rounded-full bg-amber-200/70 px-2 py-0.5 text-[9px] font-medium text-amber-900/80"
                >
                  {tab}
                </span>
              ))}
              {context.section ? (
                <span
                  title={`Section · ${context.section}`}
                  className="max-w-[160px] truncate rounded-full bg-amber-900/10 px-2 py-0.5 text-[9px] font-medium text-amber-900/80"
                >
                  {context.section}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3.5 pt-2.5">
          <div ref={contentRef} style={{ width: 'max-content', maxWidth: Math.max(120, maxWidth - 28) }}>
            <div className="text-[11px] font-semibold leading-snug text-slate-900">{guide.entry.title}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{guide.entry.blurb}</p>
            <ul className="mt-2 space-y-1.5">
              {guide.entry.tips.map((tip) => (
                <li key={tip} className="flex gap-1.5 text-[11px] leading-snug text-slate-600">
                  <Lightbulb className="mt-0.5 h-3 w-3 flex-none text-amber-500" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 border-t border-amber-100 pt-2 text-[10px] leading-relaxed text-slate-400">
              Contextual guide · runs locally in your browser · auto-fits as you move between tabs, sections and sub-sections.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
