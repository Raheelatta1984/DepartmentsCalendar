import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Globe2, Loader2, LockKeyhole, RefreshCw, RotateCw } from 'lucide-react';
import { StoreProvider } from '../store';
import { createSeedState } from '../data/seed';
import { ApiError, getWorkspaceConfig, readWorkspace, signIn, signOut, toSharedState, writeWorkspace } from '../lib/workspace-api';
import { isRetryable, retryDelayMs, useRetryCountdown } from '../lib/retry';
import type { SharedConnection } from '../lib/useWorkspacePersistence';
import { Button, Input } from './ui';

type BootState =
  | { phase: 'loading' }
  | { phase: 'login'; error?: string }
  | { phase: 'error'; error: string; retryable: boolean; retryAfterSeconds: number }
  | { phase: 'ready'; shared?: SharedConnection };

export function WorkspaceGateway({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retryAt, setRetryAt] = useState<number>();
  const autoRetries = useRef(0);
  const countdown = useRetryCountdown(retryAt);

  const logOut = useCallback(async () => {
    await signOut();
    setPassword('');
    setBoot({ phase: 'login' });
  }, []);

  // One boot attempt: config -> snapshot -> (first visitor) seed. The seed is
  // what initiates an empty database, so a boot that recovers from a sleeping
  // Neon instance also completes the initialisation.
  useEffect(() => {
    let cancelled = false;
    setBoot({ phase: 'loading' });
    const load = async () => {
      try {
        const config = await getWorkspaceConfig();
        if (cancelled) return;
        if (config.mode === 'demo') { autoRetries.current = 0; return setBoot({ phase: 'ready' }); }
        if (!config.authenticated) { autoRetries.current = 0; return setBoot({ phase: 'login' }); }
        let snapshot = await readWorkspace();
        if (cancelled) return;
        if (!snapshot.state) {
          const state = toSharedState(createSeedState());
          try {
            const saved = await writeWorkspace(0, state);
            snapshot = { state, version: saved.version };
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
            // Two first-time visitors may initialize together; use the winner.
            snapshot = await readWorkspace();
          }
        }
        if (!snapshot.state) throw new Error('The workspace could not be initialized. Please retry.');
        if (cancelled) return;
        autoRetries.current = 0;
        setBoot({ phase: 'ready', shared: { snapshot: { state: snapshot.state, version: snapshot.version }, onSignOut: logOut } });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) return setBoot({ phase: 'login' });
        setBoot({
          phase: 'error',
          error: error instanceof Error ? error.message : 'Unable to load the workspace.',
          retryable: isRetryable(error),
          retryAfterSeconds: error instanceof ApiError ? error.retryAfterSeconds : 0,
        });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [attempt, logOut]);

  /**
   * Auto-refresh while the workspace cannot be opened: a suspended Neon database
   * wakes on the first request, so retrying by itself is usually all that is
   * needed. Backoff is short and capped, a non-retryable failure is never
   * retried, and a background tab waits for the visitor to return instead of
   * polling (which would keep the database awake for nobody).
   */
  useEffect(() => {
    if (boot.phase !== 'error' || !boot.retryable) { setRetryAt(undefined); return; }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      const wake = () => {
        if (document.visibilityState === 'hidden') return;
        cleanup();
        setRetryAt(undefined);
        setAttempt((value) => value + 1);
      };
      const cleanup = () => {
        document.removeEventListener('visibilitychange', wake);
        window.removeEventListener('focus', wake);
      };
      document.addEventListener('visibilitychange', wake);
      window.addEventListener('focus', wake);
      return cleanup;
    }
    const delay = retryDelayMs(boot.retryAfterSeconds, autoRetries.current);
    autoRetries.current += 1;
    setRetryAt(Date.now() + delay);
    const timer = window.setTimeout(() => {
      setRetryAt(undefined);
      setAttempt((value) => value + 1);
    }, delay);
    return () => { window.clearTimeout(timer); };
  }, [boot]);

  if (boot.phase === 'ready') return <StoreProvider shared={boot.shared}>{children}</StoreProvider>;

  const retryNow = () => {
    autoRetries.current = 0;
    setRetryAt(undefined);
    setAttempt((value) => value + 1);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await signIn(password);
      setPassword('');
      setAttempt((value) => value + 1);
    } catch (error) {
      setBoot({ phase: 'login', error: error instanceof Error ? error.message : 'Unable to sign in.' });
    } finally { setSubmitting(false); }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm" aria-labelledby="workspace-title">
        <div className="mb-5 flex items-center gap-3 text-brand-700">
          <div className="rounded-xl bg-brand-50 p-3"><Database className="h-6 w-6" /></div>
          <div><p className="text-sm font-semibold">Orbit</p><p className="text-xs text-slate-500">Shared department workspace</p></div>
        </div>
        <h1 id="workspace-title" className="text-xl font-semibold text-slate-900">
          {boot.phase === 'loading' ? 'Opening your workspace' : boot.phase === 'error' ? 'Workspace unavailable' : 'One workspace. Any device.'}
        </h1>
        {boot.phase === 'loading' ? (
          <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Connecting securely…</p>
        ) : boot.phase === 'error' ? (
          <div className="mt-4 space-y-3">
            <p role="alert" className="text-sm text-rose-700">{boot.error}</p>
            {boot.retryable ? (
              <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
                <RefreshCw className={`mt-0.5 h-3.5 w-3.5 flex-none ${countdown > 0 ? 'animate-spin' : ''}`} />
                <span>
                  {countdown > 0
                    ? `Refreshing automatically in ${countdown}s. A sleeping database wakes on its first request, so this usually clears itself — no reload needed.`
                    : 'Refreshing automatically…'}
                </span>
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-slate-500">This will not fix itself: check the workspace configuration, then retry.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={retryNow}><RefreshCw className="h-4 w-4" /> {boot.retryable ? 'Refresh now' : 'Try again'}</Button>
              <Button onClick={() => window.location.reload()} title="Reload the page and open the workspace again"><RotateCw className="h-4 w-4" /> Reload page</Button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {boot.retryable
                ? 'Unsaved changes stay in this tab. Automatic refresh pauses while the tab is in the background and resumes when you return.'
                : 'Unsaved changes stay in this tab. Fixing the configuration and redeploying is the only way forward.'}
            </p>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
            <p className="text-sm leading-relaxed text-slate-500">Enter the password supplied by your workspace owner. Your team’s changes are stored in Neon, not on this computer.</p>
            <div>
              <label htmlFor="workspace-password" className="mb-1 block text-xs font-medium text-slate-700">Workspace password</label>
              <Input id="workspace-password" type="password" autoComplete="current-password" required autoFocus value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} />
            </div>
            {boot.error ? <p role="alert" className="text-sm text-rose-700">{boot.error}</p> : null}
            <Button type="submit" variant="primary" className="w-full" disabled={submitting || !password}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Open workspace
            </Button>
            <p className="flex gap-2 text-[11px] leading-relaxed text-slate-400"><Globe2 className="mt-0.5 h-3.5 w-3.5 flex-none" /> Anyone with this password has full workspace access. Persona switching is a preview, not individual employee authentication.</p>
          </form>
        )}
      </section>
    </main>
  );
}
