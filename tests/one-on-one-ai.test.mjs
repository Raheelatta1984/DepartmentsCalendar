import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateOneOnOneSummary, oneOnOneSummarySchema } from '../server/one-on-one-ai.mjs';
import { createHandler } from '../server/app.mjs';
import { readConfig, sessionCookie } from '../server/auth.mjs';

const input = { feeling: 2, workLifeBalance: 'Workload is high.', support: 'Needs pairing.', escalation: '', discussion: 'Discussed milestones.', improvement: '', careerProgression: 'Pair on architecture.' };

test('summary uses a real provider request, sends only selected notes, and never returns the server key', async () => {
  let request;
  const result = await generateOneOnOneSummary(input, { apiKey: 'private-test-key', model: 'test-model', fetchImpl: async (url, options) => {
    request = { url, options };
    return Response.json({ choices: [{ message: { content: ' Workload and agreed pairing. ' } }] });
  } });
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, 'Bearer private-test-key');
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model, 'test-model');
  assert.deepEqual(JSON.parse(payload.messages[1].content), input);
  assert.match(payload.messages[0].content, /Do not invent/);
  assert.deepEqual(result, { summary: 'Workload and agreed pairing.', model: 'test-model' });
  assert.doesNotMatch(JSON.stringify(result), /private-test-key/);
});

test('missing provider, invalid input, provider failures, and empty results fail safely', async () => {
  await assert.rejects(() => generateOneOnOneSummary(input), /not configured/);
  assert.equal(oneOnOneSummarySchema.safeParse({ ...input, feeling: 6 }).success, false);
  assert.equal(oneOnOneSummarySchema.safeParse({ ...input, unrelatedField: 'private' }).success, false);
  assert.equal(oneOnOneSummarySchema.safeParse({ ...input, support: 'x'.repeat(4001) }).success, false);
  await assert.rejects(() => generateOneOnOneSummary(input, { apiKey: 'a', fetchImpl: async () => new Response('secret detail', { status: 403 }) }), (error) => error.status === 502 && !error.message.includes('secret detail'));
  await assert.rejects(() => generateOneOnOneSummary(input, { apiKey: 'a', fetchImpl: async () => { throw new Error('secret detail'); } }), (error) => error.status === 502 && !error.message.includes('secret detail'));
  await assert.rejects(() => generateOneOnOneSummary(input, { apiKey: 'a', fetchImpl: async () => Response.json({ choices: [{ message: { content: '' } }] }) }), /empty or oversized/);
});

test('summary API requires a shared session, same origin and valid body; missing configuration never generates a fake summary', async () => {
  const env = { DATABASE_URL: 'postgresql://u:p@host-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require', WORKSPACE_PASSWORD: 'test-password-1234', SESSION_SECRET: 'test-session-secret-12345678901234567890' };
  const handler = createHandler({ env, repository: {}, logger: { error() {} } });
  const cookie = sessionCookie(readConfig(env)).split(';')[0];
  const request = { url: '/api/one-on-one-summary', method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost', 'sec-fetch-site': 'same-origin' }, body: input, socket: { remoteAddress: '127.0.0.1' } };
  const invoke = async (overrides = {}) => {
    let body;
    const response = { setHeader() {}, end(value) { body = value; } };
    await handler({ ...request, ...overrides, headers: { ...request.headers, ...overrides.headers } }, response);
    return { status: response.statusCode, body: JSON.parse(body) };
  };
  assert.equal((await invoke()).status, 401);
  assert.equal((await invoke({ headers: { cookie, origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await invoke({ headers: { cookie }, body: { ...input, feeling: 8 } })).status, 400);
  const missing = await invoke({ headers: { cookie } });
  assert.equal(missing.status, 503);
  assert.match(missing.body.error, /not configured/);
  assert.equal(missing.body.summary, undefined);
  const demo = createHandler({ env: {}, logger: { error() {} } });
  let demoBody; const demoResponse = { setHeader() {}, end(value) { demoBody = value; } };
  await demo(request, demoResponse);
  assert.equal(demoResponse.statusCode, 503);
  assert.doesNotMatch(demoBody, /summary.*generated/i);
});
