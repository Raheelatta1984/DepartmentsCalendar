import { ApiError, readWorkspace, writeWorkspace, type SharedState, type Snapshot } from './workspace-api';
import { RETRY_DELAYS_MS, isRetryable, permanentError, retryDelayForError } from './retry';

export type SyncStatus = 'saved' | 'pending' | 'saving' | 'refreshing' | 'error' | 'conflict';
export interface SyncInfo {
  status: SyncStatus;
  message: string;
  dirty: boolean;
  /** Epoch ms of the next automatic retry; undefined when none is scheduled. */
  retryAt?: number;
}
interface Transport {
  read: typeof readWorkspace;
  write: typeof writeWorkspace;
}

// A small, serial write queue. It never retries a stale version by overwriting
// someone else's changes, and never replaces local unsaved data on a failed read.
export class WorkspaceSync {
  private version: number;
  private saved: string;
  private latest: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryAt: number | undefined;
  private attempts = 0;
  private busy = false;
  private blocked = false;
  private disposed = false;
  private paused = false;
  private status: SyncStatus = 'saved';
  private lastContact = Date.now();

  constructor(
    snapshot: Snapshot,
    private onStatus: (info: SyncInfo) => void,
    private onRemote: (state: SharedState) => void,
    private transport: Transport = { read: readWorkspace, write: writeWorkspace },
    private debounceMs = 600,
    private retryDelays: number[] = RETRY_DELAYS_MS,
  ) {
    this.version = snapshot.version;
    this.saved = this.latest = JSON.stringify(snapshot.state);
  }

  get dirty() { return this.latest !== this.saved; }

  private notify(status: SyncStatus, message = '') {
    this.status = status;
    if (!this.disposed) this.onStatus({ status, message, dirty: this.dirty, retryAt: this.retryAt });
  }

  /** Cancel a scheduled automatic retry without touching the current status. */
  private clearRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryAt = undefined;
  }

  /**
   * Transient failures (sleeping database, dropped connection, throttle) retry
   * themselves so the workspace finishes opening - and a pending edit finishes
   * saving - without the visitor reloading the page. Unsaved edits stay in the
   * tab throughout because `flush`/`refresh` never discard local state on error.
   */
  private scheduleRetry(error: unknown) {
    this.clearRetry();
    if (this.disposed || this.paused || !isRetryable(error)) { this.attempts = 0; return; }
    const delay = retryDelayForError(error, this.attempts++, this.retryDelays);
    this.retryAt = Date.now() + delay;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.retryAt = undefined;
      if (this.disposed || this.paused) return;
      this.blocked = false;
      if (this.dirty) void this.flush(); else void this.refresh();
    }, delay);
  }

  private succeeded() {
    this.clearRetry();
    this.attempts = 0;
    this.blocked = false;
    this.lastContact = Date.now();
  }

  update(state: SharedState) {
    if (this.disposed) return;
    this.latest = JSON.stringify(state);
    if (this.blocked || this.busy || this.paused) return;
    clearTimeout(this.timer);
    if (!this.dirty) return this.notify('saved');
    this.notify('pending');
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  async flush() {
    if (this.disposed || this.busy || this.paused || this.blocked || !this.dirty) return;
    clearTimeout(this.timer);
    this.busy = true;
    const sent = this.latest;
    this.notify('saving');
    try {
      const response = await this.transport.write(this.version, JSON.parse(sent));
      this.version = response.version;
      this.saved = sent;
      this.succeeded();
      this.notify(this.dirty ? 'pending' : 'saved');
    } catch (error) {
      this.blocked = true;
      this.scheduleRetry(error);
      this.notify(error instanceof ApiError && error.status === 409 ? 'conflict' : 'error',
        error instanceof Error ? error.message : 'Unable to save. Your changes remain in this tab.');
    } finally {
      this.busy = false;
      if (!this.disposed && !this.paused && !this.blocked && this.dirty) this.timer = setTimeout(() => void this.flush(), this.debounceMs);
    }
  }

  async refresh(discard = false) {
    if (this.disposed || this.busy || this.paused || (this.dirty && !discard)) return;
    clearTimeout(this.timer);
    this.busy = true;
    this.notify('refreshing');
    try {
      const snapshot = await this.transport.read();
      if (!snapshot.state || snapshot.version < 1) throw permanentError('The shared workspace is missing. Restore a database backup before continuing.');
      // No UI edits should be accepted during a refresh (the app is inert). This
      // extra guard still protects edits queued just before React rendered it.
      if (this.dirty && !discard) return;
      this.version = snapshot.version;
      this.saved = this.latest = JSON.stringify(snapshot.state);
      this.succeeded();
      if (!this.disposed) this.onRemote(snapshot.state);
      this.notify('saved');
    } catch (error) {
      this.blocked = true;
      this.scheduleRetry(error);
      this.notify('error', error instanceof Error ? error.message : 'Unable to load the shared workspace.');
    } finally {
      this.busy = false;
      // Edits queued while a background read was in flight must still be saved.
      if (!this.disposed && !this.paused && !this.blocked && this.dirty) {
        this.notify('pending');
        this.timer = setTimeout(() => void this.flush(), this.debounceMs);
      }
    }
  }

  refreshOnFocus() {
    if (!this.dirty && !this.blocked && Date.now() - this.lastContact >= 60_000) void this.refresh();
  }

  /** Manual retry: an explicit click (or a reconnect) restarts the backoff. */
  retry() {
    if (this.status === 'conflict') return; // requires an explicit discard / reload
    this.clearRetry();
    this.attempts = 0;
    this.blocked = false;
    if (this.dirty) void this.flush(); else void this.refresh();
  }

  /** The browser came back online: retry immediately, but only if we were stuck. */
  retryIfBlocked() {
    if (this.blocked) this.retry();
  }

  pause() { this.paused = true; this.clearRetry(); clearTimeout(this.timer); }

  resume() { this.paused = false; this.update(JSON.parse(this.latest)); }

  dispose() { this.disposed = true; this.clearRetry(); clearTimeout(this.timer); }
}
