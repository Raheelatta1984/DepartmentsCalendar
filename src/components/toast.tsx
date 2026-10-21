import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'info' | 'error';

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const ToastContext = createContext<{ push: (t: Omit<Toast, 'id'>) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4800);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  const toneStyle: Record<ToastTone, string> = {
    success: 'border-emerald-200 bg-white',
    info: 'border-slate-200 bg-white',
    error: 'border-rose-200 bg-white',
  };
  const toneIcon: Record<ToastTone, React.ReactNode> = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    info: <Info className="h-4 w-4 text-brand-500" />,
    error: <AlertTriangle className="h-4 w-4 text-rose-500" />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-lg ${toneStyle[t.tone]}`}
          >
            <span className="mt-0.5">{toneIcon[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-800">{t.title}</div>
              {t.description ? <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{t.description}</div> : null}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { push: () => undefined };
  return ctx;
}
