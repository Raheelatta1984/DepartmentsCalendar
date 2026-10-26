import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_SECONDS = 12 * 60 * 60;
const digest = (value) => createHash('sha256').update(value).digest();
export const passwordsMatch = (input, expected) => timingSafeEqual(digest(input), digest(expected));
const sign = (value, config) => createHmac('sha256', config.sessionSecret)
  .update(value).update('\0').update(config.password).digest('base64url');
const cookieName = (config) => config.secureCookies ? '__Host-orbit_session' : 'orbit_session';

export function sessionCookie(config, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(18).toString('base64url')}`;
  return cookie(`${payload}.${sign(payload, config)}`, config, SESSION_SECONDS);
}

export const clearSessionCookie = (config) => cookie('', config, 0);

function cookie(value, config, maxAge) {
  return `${cookieName(config)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies ? '; Secure' : ''}`;
}

export function authenticated(request, config, now = Date.now()) {
  if (config.mode !== 'shared') return false;
  const value = (request.headers.cookie ?? '').split(';').map((s) => s.trim())
    .find((part) => part.startsWith(`${cookieName(config)}=`))?.split('=').slice(1).join('=');
  if (!value || value.length > 256) return false;
  const [expiry, nonce, signature, extra] = value.split('.');
  if (!expiry || !nonce || !signature || extra) return false;
  const seconds = Math.floor(now / 1000);
  if (!/^\d+$/.test(expiry) || Number(expiry) <= seconds || Number(expiry) > seconds + SESSION_SECONDS) return false;
  const expected = sign(`${expiry}.${nonce}`, config);
  return passwordsMatch(signature, expected);
}

export function rateLimitKey(request, config) {
  // Vercel supplies x-vercel-forwarded-for. Do not trust arbitrary forwarded-for
  // headers from a direct local request. Store only an HMAC, not the raw address.
  const ip = config.onVercel
    ? String(request.headers['x-vercel-forwarded-for'] ?? request.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim()
    : request.socket?.remoteAddress ?? 'local';
  // Fallback keeps the API responsive if a partial config ever reaches here;
  // readConfig() normally supplies the secret (or the demo placeholder).
  return createHmac('sha256', config.sessionSecret ?? DEMO_SESSION_PLACEHOLDER).update(ip).digest('hex');
}

// Fixed, non-secret placeholder for browser-only demo mode. It keeps HMAC-based
// helpers (per-client rate-limit keys) working without a configured secret, and
// it can never authenticate a session: authenticated() and every shared-storage
// route require mode === 'shared' and a real SESSION_SECRET.
const DEMO_SESSION_PLACEHOLDER = 'orbit-demo-mode-placeholder';

export function readConfig(env) {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    if (env.WORKSPACE_PASSWORD || env.SESSION_SECRET) throw new Error('DATABASE_URL is required when workspace authentication is configured.');
    return { mode: 'demo', sessionSecret: DEMO_SESSION_PLACEHOLDER };
  }
  let database;
  try { database = new URL(url); } catch { throw new Error('DATABASE_URL must be a Neon PostgreSQL connection string.'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname.endsWith('.neon.tech') || database.searchParams.get('sslmode') !== 'require') {
    throw new Error('Use a Neon PostgreSQL connection string with sslmode=require.');
  }
  if (!env.WORKSPACE_PASSWORD || env.WORKSPACE_PASSWORD.length < 16) throw new Error('WORKSPACE_PASSWORD must contain at least 16 characters.');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  if (env.PUBLIC_ORIGIN) {
    const origin = new URL(env.PUBLIC_ORIGIN);
    if (origin.origin !== env.PUBLIC_ORIGIN || !['https:', 'http:'].includes(origin.protocol)) throw new Error('PUBLIC_ORIGIN must be an origin without a path or trailing slash.');
    if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('PUBLIC_ORIGIN must use HTTPS in production.');
  }
  return {
    mode: 'shared', databaseUrl: url, password: env.WORKSPACE_PASSWORD,
    sessionSecret: env.SESSION_SECRET, secureCookies: env.NODE_ENV === 'production' || env.VERCEL === '1',
    publicOrigin: env.PUBLIC_ORIGIN, onVercel: env.VERCEL === '1',
  };
}
