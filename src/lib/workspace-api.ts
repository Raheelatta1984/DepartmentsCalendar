import type { Settings, StoreState } from '../types';

export type SharedState = Omit<StoreState, 'settings'> & { settings: Omit<Settings, 'activeUserId'> };
export interface Snapshot { state: SharedState; version: number }
export interface WorkspaceConfig { mode: 'demo' | 'shared'; authenticated: boolean }

export function toSharedState(state: StoreState): SharedState {
  const { activeUserId: _localPersona, ...settings } = state.settings;
  return { ...state, settings };
}

const PERSONA_KEY = 'orbit.portal.persona.v1';
export function fromSharedState(state: SharedState, activeUserId?: string): StoreState {
  if (!activeUserId) {
    try { activeUserId = localStorage.getItem(PERSONA_KEY) ?? undefined; } catch { /* private storage unavailable */ }
  }
  const user = state.employees.find((employee) => employee.id === activeUserId) ?? state.employees[0];
  return { ...state, settings: { ...state.settings, activeUserId: user.id } };
}

export function rememberPersona(activeUserId: string) {
  try { localStorage.setItem(PERSONA_KEY, activeUserId); } catch { /* preference only */ }
}

/** Statuses that a retry can plausibly fix on its own (sleeping database, blip, throttle). */
const RETRYABLE_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number) { return RETRYABLE_STATUS.has(status); }

export interface ApiErrorOptions {
  /** Server verdict when it knows a retry cannot help (bad setup, stale session, conflict). */
  retryable?: boolean;
  /** Seconds the server asked us to wait before trying again. */
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly retryable: boolean;
  readonly retryAfterSeconds: number;

  constructor(public status: number, message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.retryable = options.retryable ?? isRetryableStatus(status);
    const wait = Number(options.retryAfterSeconds);
    this.retryAfterSeconds = Number.isFinite(wait) && wait > 0 ? wait : 0;
  }
}

// Last known workspace snapshot + validator. The server answers 304 Not
// Modified when nothing changed, which avoids re-downloading a multi-megabyte
// workspace on every focus refresh and skips the database read entirely.
let lastSnapshot: { etag: string; body: WorkspaceResponse } | undefined;
type WorkspaceResponse = { state: SharedState | null; version: number };

async function request<T>(path: string, options: RequestInit & { etag?: string } = {}): Promise<{ data: T; response: Response }> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(25_000),
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.etag ? { 'If-None-Match': options.etag } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and retry. Unsaved changes are still in this tab.', { retryable: true });
  }
  const contentType = response.headers.get('content-type') ?? '';
  // Explicitly support the static demo (GitHub Pages / vite preview). An API
  // outage or incomplete Neon setup must never silently become a local demo.
  if (path === '/api/config' && (response.status === 404 || (response.ok && !contentType.includes('application/json')))) {
    return { data: { mode: 'demo', authenticated: false } as T, response };
  }
  if (response.status === 304) return { data: undefined as T, response };
  let data;
  try { data = response.status === 204 ? undefined : await response.json(); } catch {
    throw new ApiError(response.status, 'The server returned an invalid response. Please retry.', { retryable: true });
  }
  if (!response.ok) {
    const retryAfterHeader = Number(response.headers.get('retry-after'));
    const retryAfterSeconds = Number(data?.retryAfterSeconds) > 0
      ? Number(data.retryAfterSeconds)
      : Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : 0;
    const hint = response.status === 429 && retryAfterSeconds > 0 ? ` Wait ${retryAfterSeconds}s before retrying.` : '';
    const message = data?.error ?? 'The shared workspace request failed.';
    throw new ApiError(response.status, message + (message.includes('second') ? '' : hint), {
      retryable: typeof data?.retryable === 'boolean' ? data.retryable : undefined,
      retryAfterSeconds,
    });
  }
  return { data: data as T, response };
}

export const getWorkspaceConfig = async () => (await request<WorkspaceConfig>('/api/config')).data;
export const signIn = async (password: string) => (await request('/api/session', { method: 'POST', body: JSON.stringify({ password }) })).data;
export const signOut = async () => { lastSnapshot = undefined; return (await request('/api/session', { method: 'DELETE' })).data; };
export async function readWorkspace(): Promise<WorkspaceResponse> {
  const { data, response } = await request<WorkspaceResponse>('/api/workspace', { etag: lastSnapshot?.etag });
  if (response.status === 304 && lastSnapshot) return lastSnapshot.body;
  const etag = response.headers.get('etag');
  if (etag && data?.state) lastSnapshot = { etag, body: data };
  return data;
}
export async function writeWorkspace(version: number, state: SharedState) {
  const { data, response } = await request<{ version: number }>('/api/workspace', { method: 'PUT', body: JSON.stringify({ version, state }) });
  const etag = response.headers.get('etag');
  if (etag) lastSnapshot = { etag, body: { state, version: data.version } };
  return data;
}

export function downloadWorkspace(state: StoreState) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
