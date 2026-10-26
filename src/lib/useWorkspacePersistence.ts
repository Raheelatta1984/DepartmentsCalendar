import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { StoreState } from '../types';
import { fromSharedState, toSharedState, type Snapshot } from './workspace-api';
import { WorkspaceSync, type SyncInfo } from './workspace-sync';

export interface SharedConnection { snapshot: Snapshot; onSignOut: () => Promise<void> }
export interface WorkspacePersistence extends SyncInfo {
  mode: 'demo' | 'shared';
  retry: () => void;
  refresh: (discard?: boolean) => void;
  signOut: () => Promise<void>;
}

export function useWorkspacePersistence(
  state: StoreState,
  setState: Dispatch<SetStateAction<StoreState>>,
  shared?: SharedConnection,
): WorkspacePersistence {
  const [info, setInfo] = useState<SyncInfo>({ status: 'saved', message: '', dirty: false, autoRetryExhausted: false });
  const current = useRef(state);
  current.current = state;
  const sync = useRef<WorkspaceSync | null>(null);

  useEffect(() => {
    if (!shared) return;
    const controller = new WorkspaceSync(shared.snapshot, setInfo,
      (remote) => setState((prev) => fromSharedState(remote, prev.settings.activeUserId)));
    sync.current = controller;
    controller.update(toSharedState(current.current));
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      // Do not refresh underneath an open editor or a focused form field.
      if (document.querySelector('[role="dialog"]') ||
        document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
      // A blocked request may have been waiting for the browser to reconnect or
      // the tab to return. Resume within the same bounded retry budget.
      controller.retryIfBlocked();
      controller.refreshOnFocus();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') controller.pauseRetryForHidden();
      else onFocus();
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (controller.dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    // A reconnect is exactly when a queued edit or a stuck read can finally go
    // through, so retry immediately instead of waiting for the next backoff.
    const onOnline = () => controller.retryIfBlocked();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      controller.dispose();
      sync.current = null;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [shared, setState]);

  useEffect(() => { sync.current?.update(toSharedState(state)); }, [state]);

  return {
    ...info, mode: shared ? 'shared' : 'demo',
    retry: () => sync.current?.retry(),
    refresh: (discard = false) => { void sync.current?.refresh(discard); },
    signOut: async () => {
      sync.current?.pause();
      try { await shared?.onSignOut(); } catch (error) { sync.current?.resume(); throw error; }
    },
  };
}
