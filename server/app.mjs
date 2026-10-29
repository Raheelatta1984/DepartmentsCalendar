import { createHmac } from 'node:crypto';
import { authenticated, clearSessionCookie, passwordsMatch, rateLimitKey, readConfig, sessionCookie } from './auth.mjs';
import { classifyDatabaseError } from './database-errors.mjs';
import { createNeonRepository } from './repository.mjs';
import { createRequestGuard, etagFor } from './request-guard.mjs';
import { applyHeaders, apiSecurityHeaders } from './security-headers.mjs';
import { loginSchema, saveSchema } from './validation.mjs';

export const MAX_BODY_BYTES = 3 * 1024 * 1024;
// `extra` carries the retry contract the browser uses to decide between an
// automatic refresh and a message that needs a human: { retryable, retryAfter }.
const fail = (status, message, extra) => Object.assign(new Error(message), { status }, extra);

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function jsonBody(request, limit = MAX_BODY_BYTES) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw fail(415, 'Send application/json.');
  }
  // Vercel may have parsed the body already; the local dev server supplies a stream.
  let raw = request.body;
  if (raw === undefined) {
    raw = await new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size <= limit) chunks.push(chunk);
      });
      request.on('end', () => size > limit ? reject(fail(413, 'Workspace exceeds the 3 MB pilot limit. Export a backup and migrate to record-level storage.')) : resolve(Buffer.concat(chunks)));
      request.on('error', reject);
    });
  }
  if (typeof raw === 'object' && raw !== null && !Buffer.isBuffer(raw)) {
    if (Buffer.byteLength(JSON.stringify(raw)) > limit) throw fail(413, 'Request body is too large.');
    return raw;
  }
  if (Buffer.byteLength(raw ?? '') > limit) throw fail(413, 'Request body is too large.');
  try { return JSON.parse(String(raw)); } catch { throw fail(400, 'Invalid JSON.'); }
}

function checkOrigin(request, config) {
  const origin = request.headers.origin;
  const expected = config.publicOrigin ?? `${config.secureCookies || request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${request.headers.host}`;
  if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && origin !== expected)) {
    throw fail(403, 'Cross-origin requests are not allowed.');
  }
}

const ROUTES = {
  '/api/config': { GET: 'config' },
  '/api/session': { POST: 'session:login', DELETE: 'session:logout' },
  '/api/workspace': { GET: 'workspace:read', PUT: 'workspace:write' },
};

const fingerprint = (config, label, value) => createHmac('sha256', config.sessionSecret).update(label).update('\0').update(value).digest('base64url');

function setRateLimitHeaders(response, verdict) {
  if (!Number.isFinite(verdict.limit)) return;
  response.setHeader('RateLimit-Limit', String(verdict.limit));
  response.setHeader('RateLimit-Remaining', String(verdict.remaining));
  response.setHeader('RateLimit-Reset', String(verdict.resetSeconds));
}

export function createHandler({ env = process.env, repository, logger = console, guard = createRequestGuard({ env }) } = {}) {
  let config;
  try { config = readConfig(env); } catch { /* report a safe setup error, never connection-string details */ }
  let database = repository;
  const databaseFailure = (error) => {
    const diagnosis = classifyDatabaseError(error);
    if (diagnosis.retryable) guard.rememberDatabaseDown();
    else guard.forgetDatabaseDown();
    guard.invalidateWorkspace();
    // Log only a fixed diagnostic code. Neon error messages can contain SQL,
    // database names, or connection details and must never be copied to logs.
    if (typeof logger.error === 'function') logger.error('Neon workspace database operation failed.', { code: diagnosis.code });
    return fail(diagnosis.status, diagnosis.message, {
      databaseFailure: true,
      databaseCode: diagnosis.code,
      retryable: diagnosis.retryable,
      ...(diagnosis.retryable ? { retryAfter: Math.ceil(guard.config.ttls.databaseDownMs / 1000) } : {}),
    });
  };
  const runDatabase = async (operation) => {
    try { return await operation(); }
    catch (error) { throw databaseFailure(error); }
  };
  const getDatabase = async () => {
    // Circuit breaker: while Neon is known to be down, fail fast instead of
    // queueing more connection attempts behind a dead endpoint.
    const downUntil = guard.databaseDownUntil();
    if (downUntil) throw fail(503, 'The shared database is temporarily unavailable. Your unsaved changes have not been discarded. Please retry.', {
      retryAfter: Math.max(1, Math.ceil((downUntil - Date.now()) / 1000)),
      circuitOpen: true,
      databaseCode: 'DATABASE_UNAVAILABLE',
      retryable: true,
    });
    database ??= createNeonRepository(config.databaseUrl);
    await runDatabase(() => database.initialize());
    // Reaching the database closes the breaker, so the next request is a real
    // attempt instead of another fast failure.
    guard.forgetDatabaseDown();
    return database;
  };

  return async (request, response) => {
    // Every response — including errors and 404s — carries the shared security
    // header set. Sessions are HttpOnly cookies, so these headers (no framing,
    // no MIME sniffing, no cross-origin reads) are what keeps an XSS bug from
    // being able to act on that cookie in the first place.
    response.setHeader('Cache-Control', 'no-store');
    applyHeaders(response, apiSecurityHeaders({ https: config?.secureCookies === true }));
    try {
      if (!config) throw fail(503, 'Workspace setup is incomplete. Check DATABASE_URL, WORKSPACE_PASSWORD and SESSION_SECRET in the server environment.', { retryable: false });
      const path = new URL(request.url, 'http://api.internal').pathname.replace(/\/$/, '');
      const clientKey = rateLimitKey(request, config);

      // --- Unknown routes: negative-cached, tightly rate limited, no DB. -------
      const route = ROUTES[path];
      if (!route) {
        const known = guard.isUnknownRoute(path);
        if (!known) guard.rememberUnknownRoute(path);
        const verdict = guard.rateLimit(clientKey, 'unknown');
        setRateLimitHeaders(response, verdict);
        if (!verdict.allowed) { response.setHeader('Retry-After', String(verdict.retryAfterSeconds)); throw fail(429, 'Too many requests.', { retryAfter: verdict.retryAfterSeconds, retryable: true }); }
        throw fail(404, 'API endpoint not found.');
      }
      const routeClass = route[request.method];
      if (!routeClass) {
        response.setHeader('Allow', Object.keys(route).join(', '));
        throw fail(405, 'Method not allowed.');
      }

      // --- Per-client, per-route sliding-window rate limit. -------------------
      const verdict = guard.rateLimit(clientKey, routeClass);
      setRateLimitHeaders(response, verdict);
      if (!verdict.allowed) {
        response.setHeader('Retry-After', String(verdict.retryAfterSeconds));
        throw fail(429, `Too many requests. Try again in ${verdict.retryAfterSeconds} second${verdict.retryAfterSeconds === 1 ? '' : 's'}.`, { retryAfter: verdict.retryAfterSeconds, retryable: true });
      }

      if (routeClass === 'config') {
        return send(response, 200, { mode: config.mode, authenticated: isAuthenticated(request) });
      }
      if (config.mode !== 'shared') throw fail(503, 'Shared storage is not configured. Add Neon and the workspace secrets in Vercel.', { retryable: false });
      if (request.method !== 'GET') checkOrigin(request, config);

      if (routeClass === 'session:logout') {
        response.setHeader('Set-Cookie', clearSessionCookie(config));
        return send(response, 204);
      }

      if (routeClass === 'session:login') {
        const parsed = loginSchema.safeParse(await jsonBody(request, 4096));
        if (!parsed.success) throw fail(400, 'Enter a valid workspace password.');

        // Negative cache: this client already exhausted the persisted login
        // window. Answer 429 from memory instead of two DB statements per guess.
        const blockedUntil = guard.isLoginBlocked(clientKey);
        if (blockedUntil) {
          response.setHeader('Retry-After', String(Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000))));
          throw fail(429, 'Too many sign-in attempts. Try again in 15 minutes.', { retryAfter: 900, retryable: false });
        }

        const correct = passwordsMatch(parsed.data.password, config.password);
        const guess = fingerprint(config, 'password', parsed.data.password);
        // Bloom filter: a wrong password we have (probably) rejected before does
        // not need to touch the database again – it is still counted by the
        // in-memory limiter above. A correct password always proceeds.
        if (!correct && guard.hasRejectedPassword(guess)) throw fail(401, 'Incorrect workspace password.');

        const db = await getDatabase();
        if (!await runDatabase(() => db.consumeLoginAttempt(clientKey))) {
          guard.rememberLoginBlocked(clientKey);
          response.setHeader('Retry-After', '900');
          throw fail(429, 'Too many sign-in attempts. Try again in 15 minutes.', { retryAfter: 900, retryable: false });
        }
        if (!correct) { guard.rememberRejectedPassword(guess); throw fail(401, 'Incorrect workspace password.'); }
        response.setHeader('Set-Cookie', sessionCookie(config));
        return send(response, 200, { authenticated: true });
      }

      if (!isAuthenticated(request)) throw fail(401, 'Your session has expired. Sign in again; export any unsaved changes first.');

      if (routeClass === 'workspace:read') {
        // Negative cache: nobody has created the workspace yet.
        if (guard.isEmptyWorkspace()) return send(response, 200, { state: null, version: 0, updated_at: null });
        const snapshot = await guard.readWorkspace(async () => {
          const db = await getDatabase();
          return runDatabase(() => db.read());
        });
        if (!snapshot.state) { guard.rememberEmptyWorkspace(); return send(response, 200, snapshot); }
        const etag = etagFor(snapshot.version, snapshot.updated_at);
        response.setHeader('ETag', etag);
        if (request.headers['if-none-match'] === etag) {
          response.statusCode = 304;
          return response.end();
        }
        return send(response, 200, snapshot);
      }

      // workspace:write
      const parsed = saveSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw fail(422, 'Invalid workspace data. Check required master records, field values and unique IDs.');
      const db = await getDatabase();
      const saved = await runDatabase(() => db.save(parsed.data.version, parsed.data.state));
      guard.invalidateWorkspace();
      if (!saved) throw fail(409, 'Another device saved a newer version. Export your unsaved changes, then load the latest data.');
      // Prime the read cache with what we just stored so the next GET (or the
      // other device's conflict refresh) is served from memory.
      guard.primeWorkspace({ state: parsed.data.state, version: saved.version, updated_at: saved.updated_at });
      response.setHeader('ETag', etagFor(saved.version, saved.updated_at));
      return send(response, 200, saved);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      const retryable = typeof error?.retryable === 'boolean' ? error.retryable : false;
      const hintedRetry = Number(error?.retryAfter);
      const retryAfterSeconds = Number.isFinite(hintedRetry) && hintedRetry > 0
        ? Math.ceil(hintedRetry)
        : 0;
      if (retryAfterSeconds > 0) response.setHeader('Retry-After', String(retryAfterSeconds));
      if (!Number.isInteger(error?.status) && typeof logger.error === 'function') {
        // Do not log the exception: unexpected errors can carry user input or
        // provider details. Database failures are logged with a safe fixed code.
        logger.error('Unhandled workspace API error.');
      }
      return send(response, status, {
        error: error?.status && typeof error.message === 'string'
          ? error.message
          : 'The server could not complete this request. Check the server configuration and try again.',
        retryable,
        ...(error?.databaseCode ? { code: error.databaseCode } : {}),
        ...(retryable && retryAfterSeconds > 0 ? { retryAfterSeconds } : {}),
      });
    }

    /**
     * Session check with a negative cache in front of the HMAC verification:
     * a cookie that already failed keeps failing until its fingerprint expires.
     */
    function isAuthenticated(request) {
      const cookie = request.headers.cookie;
      if (!cookie || config.mode !== 'shared') return false;
      const key = fingerprint(config, 'cookie', cookie);
      if (guard.isInvalidSession(key)) return false;
      const ok = authenticated(request, config);
      if (!ok) guard.rememberInvalidSession(key);
      return ok;
    }
  };
}

export default createHandler();
