import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHandler } from '../server/app.mjs';
import { clearSessionCookie, readConfig, sessionCookie } from '../server/auth.mjs';
import {
  API_CONTENT_SECURITY_POLICY,
  CONTENT_SECURITY_POLICY,
  STRICT_TRANSPORT_SECURITY,
  apiSecurityHeaders,
  pageSecurityHeaders,
} from '../server/security-headers.mjs';

/* ------------------------------------------------------------------------ */
/* The policy itself                                                        */
/* ------------------------------------------------------------------------ */

test('the page policy never allows inline or evaluated script', () => {
  const script = CONTENT_SECURITY_POLICY.split('; ').find((directive) => directive.startsWith('script-src'));
  assert.equal(script, "script-src 'self'");
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /script-src[^;]*(unsafe-inline|unsafe-eval)/);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /(^|; )(default-src|script-src|connect-src|frame-src|object-src)[^;]*\*/);
  for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"]) {
    assert.ok(CONTENT_SECURITY_POLICY.includes(directive), `missing ${directive}`);
  }
});

test('local development reports the policy while every deployed surface enforces it', () => {
  const dev = pageSecurityHeaders({ enforceCsp: false });
  assert.ok(dev['Content-Security-Policy-Report-Only'], 'the dev server must not enforce the policy it cannot satisfy');
  assert.equal(dev['Content-Security-Policy'], undefined);
  assert.equal(dev['Strict-Transport-Security'], undefined, 'HSTS has no meaning on a plain-HTTP dev port');

  const preview = pageSecurityHeaders({ enforceCsp: true });
  assert.equal(preview['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  assert.equal(preview['Strict-Transport-Security'], undefined, 'the preview port is plain HTTP');
  assert.doesNotMatch(preview['Content-Security-Policy'], /upgrade-insecure-requests/);

  const production = pageSecurityHeaders({ https: true });
  assert.match(production['Content-Security-Policy'], /upgrade-insecure-requests$/);
  assert.equal(production['Strict-Transport-Security'], STRICT_TRANSPORT_SECURITY);
  assert.equal(production['X-Frame-Options'], 'DENY');
});

test('the deployed static headers in vercel.json match the shared module', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const entry = config.headers.find((group) => group.source === '/(.*)');
  assert.ok(entry, 'vercel.json must serve a header group for every path');
  const headers = Object.fromEntries(entry.headers.map((header) => [header.key, header.value]));

  assert.equal(headers['Content-Security-Policy'], `${CONTENT_SECURITY_POLICY}; upgrade-insecure-requests`);
  assert.equal(headers['Strict-Transport-Security'], STRICT_TRANSPORT_SECURITY);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Permissions-Policy'], pageSecurityHeaders()['Permissions-Policy']);
  assert.equal(headers['Access-Control-Allow-Origin'], undefined, 'the app is same-origin only');

  // API responses must stay uncacheable.
  const api = config.headers.find((group) => group.source === '/api/(.*)');
  assert.deepEqual(api.headers, [{ key: 'Cache-Control', value: 'no-store' }]);
});

/* ------------------------------------------------------------------------ */
/* The API surface                                                          */
/* ------------------------------------------------------------------------ */

const sharedEnv = {
  DATABASE_URL: 'postgresql://pilot:private-db-password@pilot-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  WORKSPACE_PASSWORD: 'a-private-workspace-password',
  SESSION_SECRET: 'a-different-private-session-secret-for-tests',
};

async function invoke(handler, path, method, { body, origin, headers = {} } = {}) {
  const sent = {};
  const response = {
    setHeader(name, value) { sent[name] = value; },
    end(text = '') { this.body = text; },
  };
  await handler({
    url: path,
    method,
    body,
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
      ...headers,
    },
    socket: { remoteAddress: '127.0.0.3' },
  }, response);
  return { status: response.statusCode, headers: sent, body: response.body };
}

test('every API response carries hardening headers and never a CORS grant', async () => {
  const handler = createHandler({ env: {}, logger: { error() {} } });
  const ok = await invoke(handler, '/api/config', 'GET');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['Content-Security-Policy'], API_CONTENT_SECURITY_POLICY);
  assert.equal(ok.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(ok.headers['X-Frame-Options'], 'DENY');
  assert.equal(ok.headers['Referrer-Policy'], 'same-origin');
  assert.equal(ok.headers['Cache-Control'], 'no-store');
  assert.match(ok.headers['Permissions-Policy'], /camera=\(\)/);
  for (const name of Object.keys(ok.headers)) assert.doesNotMatch(name, /^Access-Control-Allow-/);

  // Error paths carry the same headers, so a 401/404/500 cannot be sniffed or framed.
  const missing = await invoke(handler, '/api/does-not-exist', 'GET');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers['Content-Security-Policy'], API_CONTENT_SECURITY_POLICY);
  assert.equal(missing.headers['X-Frame-Options'], 'DENY');
});

test('HSTS is only advertised by an HTTPS deployment', () => {
  assert.equal(apiSecurityHeaders()['Strict-Transport-Security'], undefined);
  assert.equal(apiSecurityHeaders({ https: true })['Strict-Transport-Security'], STRICT_TRANSPORT_SECURITY);
});

test('the session cookie is HttpOnly, SameSite and __Host- scoped, and logout matches it', () => {
  const config = readConfig({ ...sharedEnv, NODE_ENV: 'production' });
  const cookie = sessionCookie(config);
  const [pair] = cookie.split('; ');
  assert.match(pair, /^__Host-orbit_session=[A-Za-z0-9._-]+$/);
  for (const attribute of ['Path=/', 'HttpOnly', 'SameSite=Strict', 'Secure']) {
    assert.ok(cookie.includes(attribute), `session cookie is missing ${attribute}`);
  }
  assert.match(cookie, /Max-Age=43200/);
  assert.doesNotMatch(cookie, /Domain=/i, 'a __Host- cookie must not set Domain');

  const cleared = clearSessionCookie(config);
  assert.match(cleared, /^__Host-orbit_session=;/);
  assert.match(cleared, /Max-Age=0/);
  assert.ok(cleared.includes('HttpOnly') && cleared.includes('Secure') && cleared.includes('SameSite=Strict'));

  // Plain-HTTP local development cannot use the __Host- prefix (it requires
  // Secure), so the name is unprefixed there and no Secure flag is invented.
  const local = sessionCookie(readConfig(sharedEnv));
  assert.match(local, /^orbit_session=/);
  assert.doesNotMatch(local, /; Secure/);
});

test('an unsafe request from a foreign origin is rejected before any work happens', async () => {
  const handler = createHandler({ env: sharedEnv, repository: {}, logger: { error() {} } });
  const foreign = await invoke(handler, '/api/session', 'POST', {
    body: { password: sharedEnv.WORKSPACE_PASSWORD },
    origin: 'https://evil.example',
  });
  assert.equal(foreign.status, 403);

  const crossSite = await invoke(handler, '/api/session', 'POST', {
    body: { password: sharedEnv.WORKSPACE_PASSWORD },
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  assert.equal(crossSite.status, 403);

  // The same request from the application's own origin is not blocked by the
  // guard (it stops later, at the JSON validation / database layer).
  const same = await invoke(handler, '/api/session', 'POST', { body: 'not-json', origin: 'http://localhost' });
  assert.equal(same.status, 400);

  // A GET is not a state-changing request, so it is not origin-checked.
  assert.equal((await invoke(handler, '/api/config', 'GET', { origin: 'https://evil.example' })).status, 200);
});

/* ------------------------------------------------------------------------ */
/* Regression guard: no credentials in anything JavaScript can read          */
/* ------------------------------------------------------------------------ */

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|jsx|mjs|html)$/.test(entry)) found.push(path);
  }
  return found;
}

const clientSource = sourceFiles(new URL('../src', import.meta.url).pathname)
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }));

test('no client code persists a credential or writes a cookie from JavaScript', () => {
  const storageWithCredential = /(?:localStorage|sessionStorage)\s*(?:\.\s*(?:setItem|getItem|removeItem)|\[)[\s\S]{0,80}?(?:token|jwt|bearer|secret|api[_-]?key|credential|password|refresh)/i;
  const writesCookie = /document\.cookie\s*=/;
  const sendsAuthHeader = /headers\s*:\s*\{[^}]*['"`]?authorization['"`]?\s*:/i;

  for (const { path, text } of clientSource) {
    assert.doesNotMatch(text, storageWithCredential, `${path} must not keep credentials in web storage`);
    assert.doesNotMatch(text, writesCookie, `${path} must not set document.cookie (it can never be HttpOnly)`);
    assert.doesNotMatch(text, sendsAuthHeader, `${path} must rely on the session cookie, not a bearer header`);
  }
});

test('web storage holds only per-device preferences and the demo-mode cache', () => {
  const literals = new Set();
  for (const { text } of clientSource) {
    for (const match of text.matchAll(/'(orbit\.[a-z.-]+\.v\d)'/gi)) literals.add(match[1]);
  }
  assert.deepEqual([...literals].sort(), [
    'orbit.ai-guide.enabled.v1',
    'orbit.ai-guide.open.v1',
    'orbit.portal.persona.v1',
    'orbit.portal.state.v1',
    'orbit.portal.tenant.v1',
  ]);
  // The shared workspace snapshot is never written to localStorage; only the
  // explicitly labelled browser-only demo cache uses that key.
  const store = readFileSync(new URL('../src/store.tsx', import.meta.url), 'utf8');
  assert.match(store, /if \(shared\) \{[\s\S]{0,400}?return;/);
  assert.match(store, /if \(shared\) return; \/\/ never replace the shared database with demo data/);
});
