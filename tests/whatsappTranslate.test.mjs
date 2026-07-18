import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('WhatsApp translation uses its own usage feature and task kind', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-whatsapp-translate-'));
  const storePath = join(directory, 'store.json');
  const settingsPath = join(directory, 'settings.json');
  const now = new Date().toISOString();
  const previousFetch = global.fetch;

  process.env.LEADGEN_STORE_PATH = storePath;
  process.env.LEADGEN_SETTINGS_PATH = settingsPath;
  delete process.env.LEADGEN_ADMIN_TOKEN;

  await writeFile(storePath, JSON.stringify({
    leads: [],
    searches: [],
    campaigns: [],
    tasks: [],
    suppressions: [],
    unsubscribeTokens: [],
    sendLog: [],
    users: [{
      id: 'user-1',
      email: 'owner@example.test',
      name: 'Owner',
      role: 'super_admin',
      plan: 'business',
      status: 'active'
    }],
    sessions: [{
      token: 'session-token',
      userId: 'user-1',
      createdAt: now,
      lastSeenAt: now,
      expiresAt: '2999-01-01T00:00:00.000Z'
    }],
    usageRecords: []
  }, null, 2));
  await writeFile(settingsPath, JSON.stringify({
    googleTranslateApiKey: 'test-google-key'
  }, null, 2));

  global.fetch = async (url, init) => {
    if (!String(url).startsWith('https://translation.googleapis.com/')) {
      return previousFetch(url, init);
    }
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify({
      data: {
        translations: body.q.map((value) => ({
          translatedText: String(value).replace('Hello', 'Hola')
        }))
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const { app } = await import('../server/index.mjs');
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    global.fetch = previousFetch;
    delete process.env.LEADGEN_STORE_PATH;
    delete process.env.LEADGEN_SETTINGS_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  const response = await fetch(`${baseUrl}/api/whatsapp/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Leadgen-Session-Token': 'session-token'
    },
    body: JSON.stringify({ body: 'Hello {name}', targetLanguage: 'es' })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.body, 'Hola {name}');
  assert.equal(payload.targetLanguage, 'es');
  assert.equal(payload.task.kind, 'whatsapp-translate');

  const store = JSON.parse(await readFile(storePath, 'utf8'));
  assert.equal(store.usageRecords.length, 1);
  assert.equal(store.usageRecords[0].feature, 'translate_whatsapp');
  assert.equal(store.tasks.length, 1);
  assert.equal(store.tasks[0].kind, 'whatsapp-translate');
  assert.equal(store.tasks[0].userId, 'user-1');
});
