import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('unsubscribe routes require confirmation and add one suppression', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-unsubscribe-'));
  const storePath = join(directory, 'store.json');
  const token = 'valid-test-token';
  process.env.LEADGEN_STORE_PATH = storePath;

  await writeFile(storePath, JSON.stringify({
    leads: [],
    searches: [],
    campaigns: [],
    suppressions: [],
    unsubscribeTokens: [{
      email: 'Owner@Acme.test',
      token,
      createdAt: new Date().toISOString()
    }],
    sendLog: []
  }, null, 2));

  const { app } = await import('../server/index.mjs');
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  const confirmation = await fetch(`${baseUrl}/unsubscribe/${token}`);
  assert.equal(confirmation.status, 200);
  assert.match(confirmation.headers.get('content-type'), /^text\/html/);
  assert.equal(confirmation.headers.get('cache-control'), 'no-store');
  assert.equal(confirmation.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(confirmation.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(await confirmation.text(), /确认退订/);

  let store = JSON.parse(await readFile(storePath, 'utf8'));
  assert.deepEqual(store.suppressions, []);

  const completed = await fetch(`${baseUrl}/unsubscribe/${token}`, { method: 'POST' });
  assert.equal(completed.status, 200);
  assert.match(await completed.text(), /退订成功/);

  const repeated = await fetch(`${baseUrl}/unsubscribe/${token}`, { method: 'POST' });
  assert.equal(repeated.status, 200);

  store = JSON.parse(await readFile(storePath, 'utf8'));
  assert.deepEqual(store.suppressions, [{
    email: 'owner@acme.test',
    reason: 'unsubscribe',
    createdAt: store.suppressions[0].createdAt
  }]);

  const invalid = await fetch(`${baseUrl}/unsubscribe/invalid-token`);
  assert.equal(invalid.status, 404);
  assert.match(await invalid.text(), /退订链接无效/);
});
