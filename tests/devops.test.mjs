import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupDevopsWorkItem, parseWorkItemUrl } from '../server/devops.mjs';
import { createHandler } from '../server/app.mjs';

const url = 'https://dev.azure.com/contoso/Retail/_workitems/edit/30';
const item = (id, type, title, parent) => ({ id, fields: { 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.Description': '<p>Build &amp; test</p>', 'Microsoft.VSTS.Scheduling.OriginalEstimate': 8 }, relations: parent ? [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/contoso/Retail/_apis/wit/workItems/${parent}` }] : [] });

test('Azure URL parsing accepts direct work items and rejects SSRF / credential tricks', () => {
  assert.deepEqual(parseWorkItemUrl(url), { organization: 'contoso', project: 'Retail', id: '30' });
  assert.equal(parseWorkItemUrl('https://contoso.visualstudio.com/Retail/_workitems/edit/30').organization, 'contoso');
  for (const bad of ['http://dev.azure.com/a/b/_workitems/edit/1', 'https://dev.azure.com.evil.example/a/b/_workitems/edit/1', 'https://user:pass@dev.azure.com/a/b/_workitems/edit/1', 'https://dev.azure.com:444/a/b/_workitems/edit/1', 'https://dev.azure.com/a/b/_workitems/edit/1?x=2', 'https://dev.azure.com/a/b/_queries']) assert.throws(() => parseWorkItemUrl(bad));
});

test('read-only lookup resolves ancestors, strips HTML and never returns the PAT', async () => {
  const calls = [];
  const result = await lookupDevopsWorkItem(url, { pat: 'secret-pat', fetchImpl: async (input, options) => {
    calls.push({ input, options });
    const id = Number(input.match(/workitems\/(\d+)/)[1]);
    return Response.json(id === 30 ? item(30, 'Task', 'Adapter', 20) : id === 20 ? item(20, 'Feature', 'Payments', 10) : item(10, 'Epic', 'Modernisation'));
  } });
  assert.deepEqual(result.items.map((i) => i.externalId), ['10', '20', '30']);
  assert.equal(result.items[2].parentExternalId, '20');
  assert.equal(result.items[2].description, 'Build & test');
  assert.equal(result.readOnly, true);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.input.startsWith('https://dev.azure.com/contoso/Retail/') && c.options.redirect === 'error'));
  assert.doesNotMatch(JSON.stringify(result), /secret-pat/);
});

test('missing credentials, denied access and incomplete hierarchy fail safely', async () => {
  await assert.rejects(() => lookupDevopsWorkItem(url), /not configured/);
  await assert.rejects(() => lookupDevopsWorkItem(url, { pat: 'x', fetchImpl: async () => new Response('secret provider detail', { status: 403 }) }), /Work Items \(Read\)/);
  await assert.rejects(() => lookupDevopsWorkItem(url, { pat: 'x', fetchImpl: async () => Response.json(item(30, 'Task', 'Orphan')) }), /feature and epic ancestors/);
});

test('DevOps API requires shared authentication, JSON and same-origin before external lookup', async () => {
  const handler = createHandler({ env: { DATABASE_URL: 'postgresql://u:p@host-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require', WORKSPACE_PASSWORD: 'test-password-1234', SESSION_SECRET: 'test-session-secret-12345678901234567890', AZURE_DEVOPS_PAT: 'never-use' }, repository: { initialize: async () => {}, read: async () => ({ state: null, version: 0 }) }, logger: { error() {} } });
  const request = { url: '/api/devops', method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost', 'sec-fetch-site': 'same-origin' }, body: { url }, socket: { remoteAddress: '127.0.0.1' } };
  let status; let body;
  const response = { setHeader() {}, end(value) { body = value; } };
  await handler(request, response);
  assert.equal(response.statusCode, 401);
  assert.match(body, /session/);
});
