import { useEffect, useState } from 'react';
import { ApiError } from './workspace-api';

/**
 * One retry policy for the whole shared workspace.
 *
 * A Neon free-tier database suspends when idle and wakes on the first request,
 * so "The shared database is temporarily unavailable" is usually a transient
 * cold start rather than an outage. Every place that talks to the API therefore
 * retries itself with a short, capped backoff *and* keeps a manual refresh one
 * click away — the visitor never has to know which one is needed.
 *
 * The server can override the wait with `Retry-After` (circuit breaker, rate
 * limit); otherwise we walk these delays. Non-retryable verdicts (bad setup,
 * expired session, version conflict) never retry on their own — hammering a
 * broken configuration only hides the real message.
 */
export const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];
export const MIN_RETRY_DELAY_MS = 1_000;
export const MAX_RETRY_DELAY_MS = 60_000;

/** An error that retrying cannot fix, flagged by client-side logic. */
export function permanentError(message: string): Error & { retryable: false } {
  return Object.assign(new Error(message), { retryable: false as const });
}

/** A retry is worth attempting unless the API or the caller explicitly said otherwise. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.retryable;
  if (error && typeof error === 'object' && 'retryable' in error) return (error as { retryable?: boolean }).retryable !== false;
  return true;
}

/** Clamp a delay into a range that feels responsive without hammering Neon. */
export function retryDelayMs(hintSeconds = 0, attempt = 0, delays: number[] = RETRY_DELAYS_MS): number {
  const backoff = delays[Math.min(Math.max(attempt, 0), delays.length - 1)] ?? delays[delays.length - 1] ?? MIN_RETRY_DELAY_MS;
  const hinted = Number(hintSeconds) > 0 ? Number(hintSeconds) * 1000 : 0;
  return Math.min(Math.max(hinted || backoff, MIN_RETRY_DELAY_MS), MAX_RETRY_DELAY_MS);
}

export function retryDelayForError(error: unknown, attempt = 0, delays: number[] = RETRY_DELAYS_MS): number {
  return retryDelayMs(error instanceof ApiError ? error.retryAfterSeconds : 0, attempt, delays);
}

/**
 * Seconds left before a scheduled retry, refreshed once a second. Returns 0
 * when no retry is scheduled, so callers can render "Retrying in 4s" and fall
 * back to "Retrying…" without keeping their own timer.
 */
export function useRetryCountdown(retryAt?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [retryAt]);
  return retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
}
