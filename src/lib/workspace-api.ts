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

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(25_000),
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and retry. Unsaved changes are still in this tab.');
  }
  const contentType = response.headers.get('content-type') ?? '';
  // Explicitly support the static demo (GitHub Pages / vite preview). An API
  // outage or incomplete Neon setup must never silently become a local demo.
  if (path === '/api/config' && (response.status === 404 || (response.ok && !contentType.includes('application/json')))) {
    return { mode: 'demo', authenticated: false } as T;
  }
  let data;
  try { data = response.status === 204 ? undefined : await response.json(); } catch { throw new ApiError(response.status, 'The server returned an invalid response. Please retry.'); }
  if (!response.ok) throw new ApiError(response.status, data?.error ?? 'The shared workspace request failed.');
  return data as T;
}

export const getWorkspaceConfig = () => request<WorkspaceConfig>('/api/config');
export const signIn = (password: string) => request('/api/session', { method: 'POST', body: JSON.stringify({ password }) });
export const signOut = () => request('/api/session', { method: 'DELETE' });
export const readWorkspace = () => request<{ state: SharedState | null; version: number }>('/api/workspace');
export const writeWorkspace = (version: number, state: SharedState) =>
  request<{ version: number }>('/api/workspace', { method: 'PUT', body: JSON.stringify({ version, state }) });

export function downloadWorkspace(state: StoreState) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
