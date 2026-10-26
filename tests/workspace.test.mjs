import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createHandler, MAX_BODY_BYTES } from '../server/app.mjs';
import { authenticated, readConfig, sessionCookie, SESSION_SECONDS } from '../server/auth.mjs';
import { createRepository } from '../server/repository.mjs';

const env = {
  DATABASE_URL: 'postgresql://pilot:private-db-password@pilot-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  WORKSPACE_PASSWORD: 'a-private-workspace-password', SESSION_SECRET: 'a-different-private-session-secret-for-tests',
};
const state = {
  entities: [{ id: 'group', name: 'Group', code: 'G', type: 'group', parentId: null, countryCode: 'AU', timezone: 'Australia/Sydney' }],
  departments: [{ id: 'dept', entityId: 'group', name: 'Finance', code: 'FIN', headId: null, opsOwnerId: null, costCenter: '', color: '#333333' }],
  employees: [{ id: 'employee', name: 'Pilot', email: 'pilot@example.com', code: 'P1', entityId: 'group', departmentId: 'dept', role: 'ceo', managerId: null, countryCode: 'AU', weeklyHours: 40, joinDate: '2026-10-21', status: 'active', avatarColor: '#333333' }],
  activities: [], timeEntries: [], holidays: [],
  countries: [{ code: 'AU', name: 'Australia', flag: 'AU', weeklyOff: [0, 6], timezone: 'Australia/Sydney' }],
  escalations: [], connections: [], syncJobs: [], auditLog: [],
  standups: [
    {
      id: 'std-1', date: '2026-10-21', departmentId: 'dept', employeeId: 'employee',
      lastDayUpdate: 'Closed the reconciliations.', progressUpdate: 'Month-end pack at 60%.', blockers: '',
      actionItems: [{ id: 'sact-1', title: 'File the pack', ownerId: 'employee', dueDate: '2026-10-22', status: 'open' }],
      supportRequests: [
        { id: 'ssup-1', description: 'Need reviewer access', type: 'internal', targetDepartmentId: null, status: 'open', createdAt: '2026-10-21T08:40:00.000Z', resolvedAt: null },
      ],
      status: 'submitted', submittedAt: '2026-10-21T08:40:00.000Z', createdAt: '2026-10-21T08:40:00.000Z', updatedAt: '2026-10-21T08:40:00.000Z',
    },
  ],
  settings: { groupName: 'Pilot', workingDayStart: '09:00', workingDayEnd: '17:00', holidayHorizonYears: 5, performanceThreshold: 70, weekStartsOn: 1 },
};
let pg, repository, server, base, cookie;

async function call(path, { method = 'GET', body, session = cookie, origin = base, headers = {} } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { ...(session ? { Cookie: session } : {}), ...(method !== 'GET' ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

before(async () => {
  pg = new PGlite();
  repository = createRepository(async (sql, parameters = []) => (await pg.query(sql, parameters)).rows);
  server = createServer(createHandler({ env, repository }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await pg.close();
});

test('missing database is an explicit demo; partially configured workspaces fail closed', async () => {
  assert.equal(readConfig({}).mode, 'demo');
  assert.throws(() => readConfig({ DATABASE_URL: env.DATABASE_URL }), /WORKSPACE_PASSWORD/);
  assert.throws(() => readConfig({ ...env, SESSION_SECRET: 'short' }), /SESSION_SECRET/);
  assert.throws(() => readConfig({ ...env, DATABASE_URL: 'postgresql://user:pass@other.example/db?sslmode=disable' }), /Neon/);
  assert.throws(() => readConfig({ ...env, NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://example.com' }), /HTTPS/);
  const response = await call('/api/config', { session: '' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { mode: 'shared', authenticated: false });
});

test('database reads and writes require a signed session', async () => {
  assert.equal((await call('/api/workspace', { session: '' })).status, 401);
  assert.equal((await call('/api/workspace', { method: 'PUT', body: { version: 0, state }, session: '' })).status, 401);
  assert.equal((await call('/api/workspace', { session: 'orbit_session=forged' })).status, 401);
});

test('login enforces JSON, same origin and the password, then issues an HttpOnly cookie', async () => {
  assert.equal((await call('/api/session', { method: 'POST', body: { password: env.WORKSPACE_PASSWORD }, origin: 'https://attacker.example' })).status, 403);
  assert.equal((await call('/api/session', { method: 'POST', body: { password: 'wrong' } })).status, 401);
  assert.equal((await call('/api/session', { method: 'POST', body: 'not json' })).status, 400);
  assert.equal((await call('/api/session', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const response = await call('/api/session', { method: 'POST', body: { password: env.WORKSPACE_PASSWORD } });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  cookie = setCookie.split(';')[0];
  assert.doesNotMatch(await response.text(), /private/);
  assert.deepEqual(await (await call('/api/config')).json(), { mode: 'shared', authenticated: true });
});

test('sessions expire, resist tampering, and invalidate on secret or password rotation', () => {
  const config = readConfig(env);
  const now = Date.now();
  const token = sessionCookie(config, now).split(';')[0];
  assert.equal(authenticated({ headers: { cookie: token } }, config, now), true);
  assert.equal(authenticated({ headers: { cookie: token + 'tamper' } }, config, now), false);
  assert.equal(authenticated({ headers: { cookie: token } }, config, now + SESSION_SECONDS * 1000), false);
  assert.equal(authenticated({ headers: { cookie: token } }, { ...config, password: 'rotated' }, now), false);
  assert.equal(authenticated({ headers: { cookie: token } }, { ...config, sessionSecret: 'rotated' }, now), false);
  assert.match(sessionCookie(readConfig({ ...env, NODE_ENV: 'production' })), /^__Host-orbit_session=.*; Secure$/);
});

test('first login initializes a workspace only once and another device sees its data', async () => {
  assert.deepEqual(await (await call('/api/workspace')).json(), { state: null, version: 0, updated_at: null });
  const saved = await call('/api/workspace', { method: 'PUT', body: { version: 0, state } });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).version, 1);
  assert.equal((await call('/api/workspace', { method: 'PUT', body: { version: 0, state } })).status, 409);
  const remote = await (await call('/api/workspace')).json();
  assert.equal(remote.version, 1);
  assert.deepEqual(remote.state, state);
  assert.equal('activeUserId' in remote.state.settings, false);
});

test('concurrent writes use a Postgres compare-and-swap, never last-writer-wins', async () => {
  const edit = (name) => ({ ...state, settings: { ...state.settings, groupName: name } });
  const results = await Promise.all(['Device A', 'Device B'].map((name) => call('/api/workspace', { method: 'PUT', body: { version: 1, state: edit(name) } })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const remote = await (await call('/api/workspace')).json();
  assert.equal(remote.version, 2);
  assert.ok(['Device A', 'Device B'].includes(remote.state.settings.groupName));
  const stale = await call('/api/workspace', { method: 'PUT', body: { version: 1, state } });
  assert.equal(stale.status, 409);
  assert.equal((await (await call('/api/workspace')).json()).state.settings.groupName, remote.state.settings.groupName);
});

test('invalid or oversized snapshots cannot replace the workspace', async () => {
  for (const invalid of [
    { ...state, employees: [] },
    { ...state, employees: [...state.employees, ...state.employees] },
    { ...state, settings: { ...state.settings, activeUserId: 'employee' } },
    { ...state, refreshToken: 'never-allowed' },
    { ...state, standups: [{ ...state.standups[0], status: 'not-a-real-status' }] },
    { ...state, standups: [{ ...state.standups[0], supportRequests: [{ ...state.standups[0].supportRequests[0], type: 'side-channel' }] }] },
  ]) {
    assert.equal((await call('/api/workspace', { method: 'PUT', body: { version: 2, state: invalid } })).status, 422);
  }
  const tooLarge = JSON.stringify({ version: 2, state, padding: 'x'.repeat(MAX_BODY_BYTES) });
  assert.equal((await call('/api/workspace', { method: 'PUT', body: tooLarge })).status, 413);
  assert.equal((await (await call('/api/workspace')).json()).version, 2);
  assert.equal((await call('/api/workspace', { method: 'PUT', body: { version: 2, state }, origin: 'https://attacker.example' })).status, 403);
});

test('login limiting is persisted across function instances and expires after 15 minutes', async () => {
  const now = new Date('2026-10-21T00:00:00Z');
  for (let attempt = 0; attempt < 20; attempt++) assert.equal(await repository.consumeLoginAttempt('test-ip', now), true);
  const anotherInstance = createRepository(async (sql, parameters = []) => (await pg.query(sql, parameters)).rows);
  assert.equal(await anotherInstance.consumeLoginAttempt('test-ip', now), false);
  assert.equal(await anotherInstance.consumeLoginAttempt('test-ip', new Date(now.getTime() + 15 * 60_000)), true);
  const limited = createHandler({ env, repository: { initialize: async () => {}, consumeLoginAttempt: async () => false } });
  const response = await invoke(limited, '/api/session', 'POST', { password: env.WORKSPACE_PASSWORD });
  assert.equal(response.status, 429);
  assert.equal(response.headers['Retry-After'], '900');
});

test('Vercel pre-parsed bodies work; database errors never leak credentials', async () => {
  const handler = createHandler({ env, repository, logger: { error() {} } });
  const login = await invoke(handler, '/api/session', 'POST', { password: env.WORKSPACE_PASSWORD });
  assert.equal(login.status, 200);
  const broken = createHandler({ env, repository: { initialize() { throw new Error(env.DATABASE_URL); } }, logger: { error() {} } });
  const error = await invoke(broken, '/api/session', 'POST', { password: env.WORKSPACE_PASSWORD });
  assert.equal(error.status, 503);
  assert.doesNotMatch(error.body, /private|postgresql|neon\.tech/);
  const incomplete = await invoke(createHandler({ env: { DATABASE_URL: env.DATABASE_URL } }), '/api/config', 'GET');
  assert.equal(incomplete.status, 503);
  assert.doesNotMatch(incomplete.body, /private-db-password/);
  assert.equal(JSON.parse(incomplete.body).retryable, false, 'a broken setup must not be retried automatically');
});

test('API method guards and sign out behave correctly', async () => {
  const invalidMethod = await call('/api/config', { method: 'POST', body: {} });
  assert.equal(invalidMethod.status, 405);
  assert.equal(invalidMethod.headers.get('allow'), 'GET');
  assert.equal((await call('/api/not-real')).status, 404);
  const logout = await call('/api/session', { method: 'DELETE' });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

async function invoke(handler, path, method, body) {
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name] = value; },
    end(text = '') { this.body = text; },
  };
  await handler({ url: path, method, body, headers: { host: 'localhost', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.2' } }, response);
  return { status: response.statusCode, headers, body: response.body };
}
