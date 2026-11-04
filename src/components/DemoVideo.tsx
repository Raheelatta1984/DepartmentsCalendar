import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import type { AppFilters } from '../types';
import type { DemoModel } from '../lib/demo-content';
import { DEMO_SCENES, DEMO_VIDEO_TITLE } from '../data/demo-script';
import { RealScreen, ScaledFrame } from './RealScreen';

/* ------------------------------------------------------------------ */
/* Demo video — cinematic player over the real screens                 */
/*                                                                     */
/* Auto-plays a scene per portal tab (real rendered screens), with    */
/* the AI voiceover narration per scene and live tenant/entity        */
/* captions from the current demo selection.                           */
/* ------------------------------------------------------------------ */

const SCENE_SECONDS = 12;

export function DemoVideo({ open, model, filters, onClose }: { open: boolean; model: DemoModel; filters: AppFilters; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<number | null>(null);

  const scene = DEMO_SCENES[index];

  const clearTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const advance = useCallback((next: number) => {
    setIndex(((next % DEMO_SCENES.length) + DEMO_SCENES.length) % DEMO_SCENES.length);
  }, []);

  // Play the scene's narration; advance when it ends, with a timed fallback.
  useEffect(() => {
    if (!open) return;
    clearTimer();
    const audio = audioRef.current;
    if (audio && playing && !muted) {
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
      const onEnded = () => advance(index + 1);
      audio.addEventListener('ended', onEnded);
      timerRef.current = window.setTimeout(() => advance(index + 1), SCENE_SECONDS * 1000);
      return () => {
        audio.removeEventListener('ended', onEnded);
        clearTimer();
        audio.pause();
      };
    }
    if (playing) timerRef.current = window.setTimeout(() => advance(index + 1), SCENE_SECONDS * 1000);
    return clearTimer;
  }, [open, index, playing, muted, advance]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') advance(index + 1);
      if (e.key === 'ArrowLeft') advance(index - 1);
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, advance, onClose]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.muted = muted;
  }, [muted]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal aria-label="Demo video">
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: model.brandColor }}>
            <Play className="h-3.5 w-3.5 fill-white" />
          </span>
          <div>
            <div className="text-sm font-bold leading-none">{DEMO_VIDEO_TITLE}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">{model.appName} · {model.tenantName} · {model.entityName}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] tabular-nums text-slate-400 sm:block">{index + 1} / {DEMO_SCENES.length}</span>
          <button onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} className="rounded-lg p-2 hover:bg-white/10">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button onClick={onClose} aria-label="Close demo video" className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* stage */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-2">
        <div className="w-full max-w-6xl">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl" key={scene.view}>
            <div className="animate-demo-zoom">
              <ScaledFrame>
                <div className="h-full overflow-y-auto bg-slate-100/70" style={{ width: 1440, height: 810 }}>
                  <RealScreen view={scene.view} filters={filters} />
                </div>
              </ScaledFrame>
            </div>
          </div>
          {/* caption */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: model.brandColor }}>{scene.caption}</span>
            <span className="text-xs text-slate-300">{scene.narration}</span>
          </div>
        </div>
      </div>

      {/* controls + progress */}
      <div className="px-4 pb-4">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <button onClick={() => advance(index - 1)} aria-label="Previous scene" className="rounded-lg p-2 hover:bg-white/10"><SkipBack className="h-4 w-4" /></button>
          <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'} className="rounded-lg p-2 hover:bg-white/10">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={() => advance(index + 1)} aria-label="Next scene" className="rounded-lg p-2 hover:bg-white/10"><SkipForward className="h-4 w-4" /></button>
          <div className="ml-2 flex flex-1 items-center gap-1">
            {DEMO_SCENES.map((s, i) => (
              <button
                key={s.view}
                onClick={() => setIndex(i)}
                aria-label={`Scene ${i + 1}: ${s.caption}`}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{ background: i === index ? model.brandColor : i < index ? `${model.brandColor}66` : 'rgba(255,255,255,0.15)' }}
              />
            ))}
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={scene.audio} preload="auto" />
    </div>
  );
}
