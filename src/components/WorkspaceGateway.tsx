import React, { useCallback, useEffect, useState } from 'react';
import { Database, Globe2, Loader2, LockKeyhole } from 'lucide-react';
import { StoreProvider } from '../store';
import { createSeedState } from '../data/seed';
import { ApiError, getWorkspaceConfig, readWorkspace, signIn, signOut, toSharedState, writeWorkspace } from '../lib/workspace-api';
import type { SharedConnection } from '../lib/useWorkspacePersistence';
import { Button, Input } from './ui';

type BootState =
  | { phase: 'loading' }
  | { phase: 'login'; error?: string }
  | { phase: 'error'; error: string }
  | { phase: 'ready'; shared?: SharedConnection };

export function WorkspaceGateway({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const logOut = useCallback(async () => {
    await signOut();
    setPassword('');
    setBoot({ phase: 'login' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBoot({ phase: 'loading' });
    const load = async () => {
      try {
        const config = await getWorkspaceConfig();
        if (cancelled) return;
        if (config.mode === 'demo') return setBoot({ phase: 'ready' });
        if (!config.authenticated) return setBoot({ phase: 'login' });
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
        if (!cancelled) setBoot({ phase: 'ready', shared: { snapshot: { state: snapshot.state, version: snapshot.version }, onSignOut: logOut } });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) return setBoot({ phase: 'login' });
        setBoot({ phase: 'error', error: error instanceof Error ? error.message : 'Unable to load the workspace.' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [attempt, logOut]);

  if (boot.phase === 'ready') return <StoreProvider shared={boot.shared}>{children}</StoreProvider>;

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
          <><p role="alert" className="my-4 text-sm text-rose-700">{boot.error}</p><Button onClick={() => setAttempt((v) => v + 1)}>Try again</Button></>
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
