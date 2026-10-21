import { authenticated, clearSessionCookie, passwordsMatch, rateLimitKey, readConfig, sessionCookie } from './auth.mjs';
import { createNeonRepository } from './repository.mjs';
import { loginSchema, saveSchema } from './validation.mjs';

export const MAX_BODY_BYTES = 3 * 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });

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

export function createHandler({ env = process.env, repository, logger = console } = {}) {
  let config;
  try { config = readConfig(env); } catch { /* report a safe setup error, never connection-string details */ }
  let database = repository;
  const getDatabase = async () => {
    database ??= createNeonRepository(config.databaseUrl);
    await database.initialize();
    return database;
  };

  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    try {
      if (!config) throw fail(503, 'Workspace setup is incomplete. Check DATABASE_URL, WORKSPACE_PASSWORD and SESSION_SECRET in the server environment.');
      const path = new URL(request.url, 'http://api.internal').pathname.replace(/\/$/, '');
      const methods = {
        '/api/config': ['GET'], '/api/session': ['POST', 'DELETE'], '/api/workspace': ['GET', 'PUT'],
      };
      if (!methods[path]) throw fail(404, 'API endpoint not found.');
      if (!methods[path].includes(request.method)) {
        response.setHeader('Allow', methods[path].join(', '));
        throw fail(405, 'Method not allowed.');
      }
      if (path === '/api/config') {
        return send(response, 200, { mode: config.mode, authenticated: authenticated(request, config) });
      }
      if (config.mode !== 'shared') throw fail(503, 'Shared storage is not configured. Add Neon and the workspace secrets in Vercel.');
      if (request.method !== 'GET') checkOrigin(request, config);
      if (path === '/api/session') {
        if (request.method === 'DELETE') {
          response.setHeader('Set-Cookie', clearSessionCookie(config));
          return send(response, 204);
        }
        const parsed = loginSchema.safeParse(await jsonBody(request, 4096));
        if (!parsed.success) throw fail(400, 'Enter a valid workspace password.');
        const db = await getDatabase();
        if (!await db.consumeLoginAttempt(rateLimitKey(request, config))) {
          response.setHeader('Retry-After', '900');
          throw fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
        }
        if (!passwordsMatch(parsed.data.password, config.password)) throw fail(401, 'Incorrect workspace password.');
        response.setHeader('Set-Cookie', sessionCookie(config));
        return send(response, 200, { authenticated: true });
      }
      if (!authenticated(request, config)) throw fail(401, 'Your session has expired. Sign in again; export any unsaved changes first.');
      const db = await getDatabase();
      if (request.method === 'GET') return send(response, 200, await db.read());
      const parsed = saveSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw fail(422, 'Invalid workspace data. Check required master records, field values and unique IDs.');
      const saved = await db.save(parsed.data.version, parsed.data.state);
      if (!saved) throw fail(409, 'Another device saved a newer version. Export your unsaved changes, then load the latest data.');
      return send(response, 200, saved);
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 503;
      if (status === 503 && !error.status) logger.error('Neon workspace request failed; check database availability and server environment.');
      return send(response, status, { error: error.status ? error.message : 'The shared database is temporarily unavailable. Your unsaved changes have not been discarded. Please retry.' });
    }
  };
}

export default createHandler();
