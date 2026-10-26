import React, { useState } from 'react';
import { Cloud, Download, LogOut, RefreshCw, RotateCw } from 'lucide-react';
import { useStore } from '../store';
import { downloadWorkspace } from '../lib/workspace-api';
import { useRetryCountdown } from '../lib/retry';
import { Button } from './ui';

export function WorkspaceStatus() {
  const { state, workspace } = useStore();
  const [logoutError, setLogoutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const retryIn = useRetryCountdown(workspace.retryAt);
  if (workspace.mode === 'demo') {
    return (
      <aside className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>Browser-only demo.</strong> Changes are not shared with other devices. Configure Neon and the workspace secrets in Vercel to enable shared storage. No database password belongs in browser code.
      </aside>
    );
  }
  const busy = workspace.status === 'saving' || workspace.status === 'refreshing';
  const problem = workspace.status === 'error' || workspace.status === 'conflict';
  const labels = { saved: 'Saved to Neon', pending: 'Unsaved changes', saving: 'Saving to Neon…', refreshing: 'Loading latest data…', error: 'Connection or save problem', conflict: 'Newer changes on another device' };
  return (
    <aside className={`mb-4 rounded-lg border px-3 py-2.5 ${problem ? 'border-rose-200 bg-rose-50' : 'border-sky-200 bg-sky-50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" aria-live="polite" className={`mr-auto flex items-center gap-2 text-xs font-semibold ${problem ? 'text-rose-800' : 'text-sky-900'}`}>
          <Cloud className="h-4 w-4" /> Shared workspace · {labels[workspace.status]}
        </p>
        {problem && workspace.status !== 'conflict' ? (
          <Button size="sm" disabled={busy} onClick={workspace.retry} title="Retry the database request immediately instead of waiting for the next automatic attempt">
            <RefreshCw className="h-3.5 w-3.5" /> Retry now
          </Button>
        ) : null}
        {workspace.dirty || problem ? <Button size="sm" onClick={() => downloadWorkspace(state)}><Download className="h-3.5 w-3.5" /> Export backup</Button> : null}
        <Button size="sm" disabled={busy} onClick={() => {
          if (workspace.dirty && !window.confirm('Discard unsaved changes and load the latest shared data? Export a backup first if you need to keep your edits.')) return;
          workspace.refresh(workspace.dirty);
        }}><RefreshCw className={`h-3.5 w-3.5 ${workspace.status === 'refreshing' ? 'animate-spin' : ''}`} /> {workspace.dirty ? 'Discard & load latest' : 'Refresh'}</Button>
        <Button size="sm" disabled={busy || signingOut} onClick={() => {
          if (workspace.dirty && !window.confirm('Sign out and discard unsaved changes? Export a backup first.')) return;
          setSigningOut(true);
          setLogoutError('');
          void workspace.signOut().catch((error: unknown) => setLogoutError(error instanceof Error ? error.message : 'Could not sign out.')).finally(() => setSigningOut(false));
        }}><LogOut className="h-3.5 w-3.5" /> Sign out</Button>
      </div>
      {retryIn > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
          <RotateCw className="h-3.5 w-3.5 animate-spin" /> Retrying automatically in {retryIn}s — the database wakes on the next request. Your edits stay in this tab.
        </p>
      ) : null}
      {workspace.message ? <p role="alert" className="mt-2 text-xs text-rose-800">{workspace.message}</p> : null}
      {logoutError ? <p role="alert" className="mt-2 text-xs text-rose-800">{logoutError}</p> : null}
      <p className="mt-1.5 text-[11px] text-slate-500">All password holders can edit all data. Personas are previews, not access control. Refresh to see other devices’ changes; clean tabs also refresh when refocused after a minute.</p>
    </aside>
  );
}
