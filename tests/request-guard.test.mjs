import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BloomFilter, NegativeCache, RateLimiter, SingleFlight, createRequestGuard, readGuardConfig } from '../server/request-guard.mjs';
import { createHandler } from '../server/app.mjs';
import { sessionCookie, readConfig } from '../server/auth.mjs';

const env = {
  DATABASE_URL: 'postgresql://pilot:private-db-password@pilot-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  WORKSPACE_PASSWORD: 'a-private-workspace-password', SESSION_SECRET: 'a-different-private-session-secret-for-tests',
};
const config = readConfig(env);
const state = {
  entities: [{ id: 'group', name: 'Group', code: 'G', type: 'group', parentId: null, countryCode: 'AU', timezone: 'Australia/Sydney' }],
  departments: [{ id: 'dept', entityId: 'group', name: 'Finance', code: 'FIN', headId: null, opsOwnerId: null, costCenter: '', color: '#333333' }],
  employees: [{ id: 'employee', name: 'Pilot', email: 'pilot@example.com', code: 'P1', entityId: 'group', departmentId: 'dept', role: 'ceo', managerId: null, countryCode: 'AU', weeklyHours: 40, joinDate: '2026-10-21', status: 'active', avatarColor: '#333333' }],
  activities: [], timeEntries: [], holidays: [],
  countries: [{ code: 'AU', name: 'Australia', flag: 'AU', weeklyOff: [0, 6], timezone: 'Australia/Sydney' }],
  escalations: [], connections: [], syncJobs: [], auditLog: [], standups: [],
  settings: { groupName: 'Pilot', workingDayStart: '09:00', workingDayEnd: '17:00', holidayHorizonYears: 5, performanceThreshold: 70, weekStartsOn: 1 },
};

test('Bloom filter has no false negatives and a bounded false-positive rate', () => {
  const filter = new BloomFilter({ expectedItems: 1_000, falsePositiveRate: 0.01 });
  for (let i = 0; i < 1_000; i++) filter.add(`member-${i}`);
  for (let i = 0; i < 1_000; i++) assert.equal(filter.has(`member-${i}`), true);
  let falsePositives = 0;
  for (let i = 0; i < 10_000; i++) if (filter.has(`stranger-${i}`)) falsePositives++;
  assert.ok(falsePositives / 10_000 < 0.03, `false positive rate too high: ${falsePositives / 10_000}`);
  filter.reset();
  assert.equal(filter.has('member-1'), false);
});

test('negative cache expires entries and skips lookups the Bloom filter rules out', () => {
  const cache = new NegativeCache({ defaultTtlMs: 1_000 });
  const now = 1_000_000;
  assert.equal(cache.has('missing', now), false);
  assert.equal(cache.stats.bloomSkips, 1);
  cache.remember('missing', true, 1_000, now);
  assert.equal(cache.has('missing', now + 999), true);
  assert.equal(cache.has('missing', now + 1_000), false);
});

test('rate limiter uses a sliding window and recovers after the window', () => {
  const limiter = new RateLimiter();
  const policy = { limit: 5, windowMs: 60_000 };
  const start = 60_000 * 100;
  for (let i = 0; i < 5; i++) assert.equal(limiter.consume('c', policy, start + i).allowed, true);
  const blocked = limiter.consume('c', policy, start + 10);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
  // Halfway through the next window roughly half of the previous window still counts.
  assert.equal(limiter.consume('c', policy, start + 60_000 + 1_000).allowed, false);
  assert.equal(limiter.consume('c', policy, start + 60_000 + 59_000).allowed, true);
  assert.equal(limiter.consume('other', policy, start + 10).allowed, true);
});

test('single flight coalesces concurrent identical work', async () => {
  const flights = new SingleFlight();
  let calls = 0;
  const work = () => new Promise((resolve) => setTimeout(() => resolve(++calls), 5));
  const results = await Promise.all([flights.run('k', work), flights.run('k', work), flights.run('k', work)]);
  assert.deepEqual(results, [1, 1, 1]);
  assert.equal(await flights.run('k', work), 2);
});

test('guard config honours environment overrides and the kill switch', () => {
  assert.equal(readGuardConfig({}).enabled, true);
  assert.equal(readGuardConfig({ REQUEST_GUARD_DISABLED: '1' }).enabled, false);
  assert.equal(readGuardConfig({ RATE_LIMIT_WORKSPACE_READ_PER_MINUTE: '7' }).policies['workspace:read'].limit, 7);
  assert.equal(readGuardConfig({ WORKSPACE_READ_CACHE_MS: '250' }).ttls.readCacheMs, 250);
});

function fakeRepository() {
  const calls = { read: 0, save: 0, login: 0, initialize: 0 };
  let version = 1;
  let stored = state;
  let loginAllowed = true;
  return {
    calls,
    setLoginAllowed(value) { loginAllowed = value; },
    async initialize() { calls.initialize++; },
    async read() { calls.read++; return { state: stored, version, updated_at: '2026-10-24T00:00:00.000Z' }; },
    async save(expected, next) { calls.save++; if (expected !== version) return null; stored = next; version++; return { version, updated_at: '2026-10-24T00:00:01.000Z' }; },
    async consumeLoginAttempt() { calls.login++; return loginAllowed; },
  };
}

async function invoke(handler, path, method, { body, headers = {}, ip = '10.0.0.1' } = {}) {
  const out = { headers: {} };
  const response = { setHeader(name, value) { out.headers[name] = value; }, end(text = '') { out.body = text; } };
  await handler({ url: path, method, body, headers: { host: 'localhost', 'content-type': 'application/json', ...headers }, socket: { remoteAddress: ip } }, response);
  return { status: response.statusCode, headers: out.headers, body: out.body ? JSON.parse(out.body) : undefined };
}

test('workspace reads are micro-cached, coalesced and answer 304 to matching ETags', async () => {
  const repository = fakeRepository();
  const handler = createHandler({ env, repository, guard: createRequestGuard({ env }) });
  const cookie = sessionCookie(config).split(';')[0];
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => invoke(handler, '/api/workspace', 'GET', { headers: { cookie } })));
  assert.equal(a.status, 200);
  assert.equal(repository.calls.read, 1, 'concurrent reads share one query');
  assert.ok(a.headers.ETag && a.headers.ETag === b.headers.ETag && b.headers.ETag === c.headers.ETag);
  const notModified = await invoke(handler, '/api/workspace', 'GET', { headers: { cookie, 'if-none-match': a.headers.ETag } });
  assert.equal(notModified.status, 304);
  assert.equal(repository.calls.read, 1, 'cached reads never touch the database');

  const saved = await invoke(handler, '/api/workspace', 'PUT', { headers: { cookie, origin: 'http://localhost' }, body: { version: 1, state } });
  assert.equal(saved.status, 200);
  assert.notEqual(saved.headers.ETag, a.headers.ETag);
  const after = await invoke(handler, '/api/workspace', 'GET', { headers: { cookie } });
  assert.equal(after.body.version, 2);
  assert.equal(repository.calls.read, 1, 'a save primes the cache with the stored state');
  assert.ok(Number(after.headers['RateLimit-Remaining']) < 60);
});

test('per-route rate limits return 429 with Retry-After and never reach the database', async () => {
  const repository = fakeRepository();
  const guard = createRequestGuard({ env });
  guard.config.policies['workspace:read'] = { limit: 3, windowMs: 60_000 };
  const handler = createHandler({ env, repository, guard });
  const cookie = sessionCookie(config).split(';')[0];
  guard.invalidateWorkspace();
  for (let i = 0; i < 3; i++) { guard.invalidateWorkspace(); assert.equal((await invoke(handler, '/api/workspace', 'GET', { headers: { cookie } })).status, 200); }
  guard.invalidateWorkspace();
  const limited = await invoke(handler, '/api/workspace', 'GET', { headers: { cookie } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers['Retry-After']) >= 1);
  assert.equal(limited.headers['RateLimit-Remaining'], '0');
  assert.equal(repository.calls.read, 3);
  // Another client is unaffected.
  assert.equal((await invoke(handler, '/api/workspace', 'GET', { headers: { cookie }, ip: '10.0.0.2' })).status, 200);
});

test('repeated wrong passwords are short-circuited by the Bloom filter; the right one still signs in', async () => {
  const repository = fakeRepository();
  const handler = createHandler({ env, repository, guard: createRequestGuard({ env }) });
  const origin = 'http://localhost';
  assert.equal((await invoke(handler, '/api/session', 'POST', { headers: { origin }, body: { password: 'wrong-password-guess' } })).status, 401);
  assert.equal(repository.calls.login, 1);
  assert.equal((await invoke(handler, '/api/session', 'POST', { headers: { origin }, body: { password: 'wrong-password-guess' } })).status, 401);
  assert.equal(repository.calls.login, 1, 'a known-rejected guess does not hit the database');
  const ok = await invoke(handler, '/api/session', 'POST', { headers: { origin }, body: { password: env.WORKSPACE_PASSWORD } });
  assert.equal(ok.status, 200);
  assert.equal(repository.calls.login, 2);
});

test('a client blocked by the persisted login limiter is negative-cached in memory', async () => {
  const repository = fakeRepository();
  repository.setLoginAllowed(false);
  const handler = createHandler({ env, repository, guard: createRequestGuard({ env }) });
  const origin = 'http://localhost';
  const first = await invoke(handler, '/api/session', 'POST', { headers: { origin }, body: { password: env.WORKSPACE_PASSWORD } });
  assert.equal(first.status, 429);
  assert.equal(first.headers['Retry-After'], '900');
  const second = await invoke(handler, '/api/session', 'POST', { headers: { origin }, body: { password: env.WORKSPACE_PASSWORD } });
  assert.equal(second.status, 429);
  assert.equal(repository.calls.login, 1, 'the second attempt is answered from the negative cache');
});

test('invalid sessions, unknown routes and database outages are negative-cached', async () => {
  const repository = fakeRepository();
  const guard = createRequestGuard({ env });
  const handler = createHandler({ env, repository, guard });
  const badCookie = 'orbit_session=1.2.3';
  assert.equal((await invoke(handler, '/api/workspace', 'GET', { headers: { cookie: badCookie } })).status, 401);
  assert.equal((await invoke(handler, '/api/workspace', 'GET', { headers: { cookie: badCookie } })).status, 401);
  assert.equal(guard.negative.stats.hits >= 1, true);

  guard.config.policies.unknown = { limit: 2, windowMs: 60_000 };
  assert.equal((await invoke(handler, '/api/nope', 'GET')).status, 404);
  assert.equal((await invoke(handler, '/api/nope', 'GET')).status, 404);
  assert.equal((await invoke(handler, '/api/nope', 'GET')).status, 429);

  const broken = createHandler({ env, repository: { async initialize() { throw new Error('connect ECONNREFUSED'); } }, logger: { error() {} }, guard: createRequestGuard({ env }) });
  const cookie = sessionCookie(config).split(';')[0];
  const outage = await invoke(broken, '/api/workspace', 'GET', { headers: { cookie } });
  assert.equal(outage.status, 503);
  assert.equal(outage.headers['Retry-After'], '5');
  assert.equal(outage.body.retryable, true, 'the browser must know a database outage is worth retrying');
  assert.equal(outage.body.retryAfterSeconds, 5);
  assert.doesNotMatch(outage.body.error, /postgresql|private-db-password/);
  const tripped = await invoke(broken, '/api/workspace', 'GET', { headers: { cookie } });
  assert.equal(tripped.status, 503, 'circuit stays open without a new connection attempt');
  assert.ok(Number(tripped.headers['Retry-After']) >= 1);
  assert.equal(tripped.body.retryable, true);
});

test('persistent Neon schema errors stop auto-retries and do not trip the transient outage breaker', async () => {
  const guard = createRequestGuard({ env });
  let initializeCalls = 0;
  const repository = {
    async initialize() {
      initializeCalls++;
      throw Object.assign(new Error('relation public.orbit_workspace does not exist'), { code: '42P01' });
    },
  };
  const handler = createHandler({ env, repository, guard, logger: { error() {} } });
  const cookie = sessionCookie(config).split(';')[0];

  const first = await invoke(handler, '/api/workspace', 'GET', { headers: { cookie } });
  assert.equal(first.status, 503);
  assert.equal(first.body.retryable, false);
  assert.equal(first.body.code, 'DATABASE_SCHEMA_OR_PERMISSION');
  assert.match(first.body.error, /npm run db:init/);
  assert.equal(first.headers['Retry-After'], undefined);
  assert.equal(guard.databaseDownUntil(), undefined);

  // A later manual retry reaches Neon again, but the browser will not poll this
  // permanent schema error automatically.
  const second = await invoke(handler, '/api/workspace', 'GET', { headers: { cookie } });
  assert.equal(second.body.retryable, false);
  assert.equal(initializeCalls, 2);
});

test('the breaker reopens for business once a database call succeeds again', async () => {
  let down = true;
  const guard = createRequestGuard({ env });
  const repository = {
    async initialize() { if (down) throw new Error('connect ETIMEDOUT'); },
    async read() { return { state, version: 1, updated_at: '2026-10-24T00:00:00.000Z' }; },
  };
  const handler = createHandler({ env, repository, guard, logger: { error() {} } });
  const cookie = sessionCookie(config).split(';')[0];
  assert.equal((await invoke(handler, '/api/workspace', 'GET', { headers: { cookie } })).status, 503);
  // The breaker is short-lived, so an automatic browser refresh lands here after
  // it expires: the database has woken up and the same request now succeeds.
  guard.forgetDatabaseDown();
  down = false;
  const recovered = await invoke(handler, '/api/workspace', 'GET', { headers: { cookie } });
  assert.equal(recovered.status, 200, 'a recovered database serves the workspace again');
  assert.equal(guard.databaseDownUntil(), undefined, 'a successful call clears the outage memory');
});

test('REQUEST_GUARD_DISABLED=1 turns rate limiting off', async () => {
  const repository = fakeRepository();
  const guard = createRequestGuard({ env: { ...env, REQUEST_GUARD_DISABLED: '1' } });
  const handler = createHandler({ env, repository, guard });
  for (let i = 0; i < 50; i++) assert.equal((await invoke(handler, '/api/nope', 'GET')).status, 404);
});
