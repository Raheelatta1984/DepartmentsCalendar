import { ApiError, readWorkspace, writeWorkspace, type SharedState, type Snapshot } from './workspace-api';
import { MAX_AUTO_RETRIES, RETRY_DELAYS_MS, isRetryable, permanentError, retryDelayForError } from './retry';

export type SyncStatus = 'saved' | 'pending' | 'saving' | 'refreshing' | 'error' | 'conflict';
export interface SyncInfo {
  status: SyncStatus;
  message: string;
  dirty: boolean;
  /** Epoch ms of the next automatic retry; undefined when none is scheduled. */
  retryAt?: number;
  /** True once the bounded automatic retry budget has been used up. */
  autoRetryExhausted?: boolean;
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
  private blockedRetryable = false;
  private disposed = false;
  private paused = false;
  private autoRetryExhausted = false;
  private status: SyncStatus = 'saved';
  private message = '';
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
    this.message = message;
    this.publishStatus();
  }

  private publishStatus() {
    if (!this.disposed) this.onStatus({
      status: this.status,
      message: this.message,
      dirty: this.dirty,
      retryAt: this.retryAt,
      autoRetryExhausted: this.autoRetryExhausted,
    });
  }

  /** Cancel a scheduled automatic retry without touching the current status. */
  private clearRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryAt = undefined;
  }

  private isHidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  /**
   * Transient failures retry with bounded backoff. After five automatic retries
   * the sync pauses and asks for a manual retry, rather than polling forever.
   * A hidden tab also parks the retry until the user returns.
   */
  private scheduleRetry(error: unknown) {
    this.clearRetry();
    this.autoRetryExhausted = false;
    this.blockedRetryable = isRetryable(error);
    if (this.disposed || this.paused || !this.blockedRetryable) { this.attempts = 0; return; }
    if (this.attempts >= MAX_AUTO_RETRIES) {
      this.autoRetryExhausted = true;
      return;
    }
    if (this.isHidden()) return;
    const delay = retryDelayForError(error, this.attempts++, this.retryDelays);
    this.retryAt = Date.now() + delay;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.retryAt = undefined;
      if (this.disposed || this.paused) return;
      if (this.isHidden()) { this.publishStatus(); return; }
      this.blocked = false;
      if (this.dirty) void this.flush(); else void this.refresh();
    }, delay);
  }

  private succeeded() {
    this.clearRetry();
    this.attempts = 0;
    this.blocked = false;
    this.blockedRetryable = false;
    this.autoRetryExhausted = false;
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

  /** Manual retry: an explicit click starts a fresh, bounded retry budget. */
  retry() {
    if (this.status === 'conflict') return; // requires an explicit discard / reload
    this.clearRetry();
    this.attempts = 0;
    this.autoRetryExhausted = false;
    this.blocked = false;
    this.blockedRetryable = false;
    if (this.dirty) void this.flush(); else void this.refresh();
  }

  /** The browser came back online or visible: resume without resetting the budget. */
  retryIfBlocked() {
    if (!this.blocked || !this.blockedRetryable || this.status === 'conflict' || this.autoRetryExhausted || this.isHidden()) return;
    this.clearRetry();
    this.blocked = false;
    if (this.dirty) void this.flush(); else void this.refresh();
  }

  /** Park a pending retry when the tab is backgrounded; resume when it returns. */
  pauseRetryForHidden() {
    if (!this.isHidden() || !this.retryTimer) return;
    this.clearRetry();
    this.publishStatus();
  }

  pause() { this.paused = true; this.clearRetry(); clearTimeout(this.timer); }

  resume() { this.paused = false; this.update(JSON.parse(this.latest)); }

  dispose() { this.disposed = true; this.clearRetry(); clearTimeout(this.timer); }
}
