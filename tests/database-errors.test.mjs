import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyDatabaseError } from '../server/database-errors.mjs';

test('schema and permission failures stop automatic retries and provide Neon-specific repair steps', () => {
  const error = Object.assign(new Error('relation public.orbit_workspace does not exist'), { code: '42P01' });
  const result = classifyDatabaseError(error);

  assert.equal(result.retryable, false);
  assert.equal(result.code, 'DATABASE_SCHEMA_OR_PERMISSION');
  assert.match(result.message, /npm run db:init/);
  assert.doesNotMatch(result.message, /orbit_workspace|relation/);
});

test('Neon authentication and missing-endpoint failures are permanent until configuration changes', () => {
  const authentication = classifyDatabaseError(Object.assign(new Error('authentication failed'), { code: '28P01' }));
  const endpoint = classifyDatabaseError(Object.assign(new Error('not found'), { statusCode: 404 }));

  assert.equal(authentication.retryable, false);
  assert.equal(authentication.code, 'DATABASE_CREDENTIALS');
  assert.equal(endpoint.retryable, false);
  assert.equal(endpoint.code, 'DATABASE_ENDPOINT_NOT_FOUND');
});

test('connection errors, provider throttling and transient SQL states remain retryable', () => {
  const network = classifyDatabaseError(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));
  const timeout = classifyDatabaseError({ message: 'request failed', cause: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) });
  const throttled = classifyDatabaseError({ statusCode: 429 });
  const transaction = classifyDatabaseError(Object.assign(new Error('serialization failure'), { code: '40001' }));

  for (const result of [network, timeout, throttled, transaction]) {
    assert.equal(result.retryable, true);
    assert.equal(result.code, 'DATABASE_UNAVAILABLE');
  }
});

test('unknown provider errors are safe and do not trigger an automatic retry loop', () => {
  const result = classifyDatabaseError(new Error('private database URL and password must not escape'));

  assert.equal(result.retryable, false);
  assert.equal(result.code, 'DATABASE_ERROR');
  assert.doesNotMatch(result.message, /private database URL and password must not escape/);
});
