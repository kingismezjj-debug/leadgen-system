import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('API rejects malformed lead updates, enforces campaign limits, and blocks unready real sends', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-api-'));
  const storePath = join(directory, 'store.json');
  const settingsPath = join(directory, 'settings.json');
  const today = new Date().toISOString();
  const previousTranslateKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  process.env.LEADGEN_STORE_PATH = storePath;
  process.env.LEADGEN_SETTINGS_PATH = settingsPath;
  delete process.env.GOOGLE_TRANSLATE_API_KEY;

  await writeFile(storePath, JSON.stringify({
    leads: Array.from({ length: 5 }, (_, index) => ({
      id: `lead-${index}`,
      name: `Lead ${index}`,
      address: 'Test address',
      emails: [`lead-${index}@example.test`],
      status: 'new'
    })),
    searches: [],
    campaigns: [],
    suppressions: [],
    unsubscribeTokens: [],
    sendLog: [
      { id: 'sent-1', status: 'sent', at: today },
      { id: 'failed-1', status: 'failed', at: today }
    ]
  }, null, 2));
  await writeFile(settingsPath, JSON.stringify({ emailDailyLimit: '3' }, null, 2));

  const { app } = await import('../server/index.mjs');
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete process.env.LEADGEN_STORE_PATH;
    delete process.env.LEADGEN_SETTINGS_PATH;
    if (previousTranslateKey === undefined) delete process.env.GOOGLE_TRANSLATE_API_KEY;
    else process.env.GOOGLE_TRANSLATE_API_KEY = previousTranslateKey;
    await rm(directory, { recursive: true, force: true });
  });

  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.test', password: 'password123' })
  });
  assert.equal(registerResponse.status, 200);
  const registered = await registerResponse.json();
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Leadgen-Session-Token': registered.token
  };

  const invalidUpdate = await fetch(`${baseUrl}/api/leads/lead-0`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ emails: 'not-an-array' })
  });
  assert.equal(invalidUpdate.status, 400);

  let store = JSON.parse(await readFile(storePath, 'utf8'));
  assert.deepEqual(store.leads[0].emails, ['lead-0@example.test']);

  const previewResponseOnly = await fetch(`${baseUrl}/api/campaigns/preview`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ subject: 'Preview', body: 'Preview body' })
  });
  assert.equal(previewResponseOnly.status, 200);
  const previewOnly = await previewResponseOnly.json();
  assert.match(previewOnly.preview.text, /unsubscribe\/preview-token/);
  store = JSON.parse(await readFile(storePath, 'utf8'));
  assert.equal(store.campaigns.length, 0);
  assert.equal(store.sendLog.length, 2);
  assert.equal(store.unsubscribeTokens.length, 0);

  const translateResponse = await fetch(`${baseUrl}/api/email/translate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ subject: 'Hi', body: 'Body', targetLanguage: 'en' })
  });
  const translatePayload = await translateResponse.json();
  assert.equal(translateResponse.status, 400);
  assert.match(translatePayload.error, /GOOGLE_TRANSLATE_API_KEY/);

  const leadIds = store.leads.map((lead) => lead.id);
  const previewResponse = await fetch(`${baseUrl}/api/campaigns/send`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ subject: 'Test', body: 'Test', dryRun: true, leadIds })
  });
  const preview = await previewResponse.json();
  assert.equal(previewResponse.status, 200);
  assert.equal(preview.results.length, 3);
  assert.equal(preview.limit.selected, 3);

  const deliveryResponse = await fetch(`${baseUrl}/api/campaigns/send`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ subject: 'Test', body: 'Test', dryRun: false, leadIds })
  });
  const delivery = await deliveryResponse.json();
  assert.equal(deliveryResponse.status, 400);
  assert.match(delivery.error, /SMTP|Jarvis|HTTPS|发送/);
});

test('search API queues long-running searches and exposes task progress', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-api-search-'));
  const storePath = join(directory, 'store.json');
  const settingsPath = join(directory, 'settings.json');
  const previousStorePath = process.env.LEADGEN_STORE_PATH;
  const previousSettingsPath = process.env.LEADGEN_SETTINGS_PATH;
  const previousFetch = global.fetch;
  process.env.LEADGEN_STORE_PATH = storePath;
  process.env.LEADGEN_SETTINGS_PATH = settingsPath;
  await writeFile(storePath, JSON.stringify({ leads: [], searches: [], tasks: [] }, null, 2));
  await writeFile(settingsPath, JSON.stringify({ googleMapsApiKey: 'test-key', googleTranslateApiKey: 'translate-key' }, null, 2));

  global.fetch = async (url, init) => {
    if (String(url).startsWith('https://places.googleapis.com/')) {
      return new Response(JSON.stringify({
        places: [{
          id: 'place-queued-1',
          displayName: { text: 'Queued Lead' },
          primaryTypeDisplayName: { text: 'Магазин' },
          formattedAddress: '1 Queue St',
          websiteUri: 'https://queued.example',
          nationalPhoneNumber: '555 0100'
        }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (String(url).startsWith('https://translation.googleapis.com/')) {
      const body = JSON.parse(init.body);
      const dictionary = new Map([
        ['Магазин', '商店'],
        ['dentist', '牙医']
      ]);
      return new Response(JSON.stringify({
        data: {
          translations: body.q.map((value) => ({ translatedText: dictionary.get(value) || value }))
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return previousFetch(url, init);
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
    if (previousStorePath === undefined) delete process.env.LEADGEN_STORE_PATH;
    else process.env.LEADGEN_STORE_PATH = previousStorePath;
    if (previousSettingsPath === undefined) delete process.env.LEADGEN_SETTINGS_PATH;
    else process.env.LEADGEN_SETTINGS_PATH = previousSettingsPath;
    await rm(directory, { recursive: true, force: true });
  });

  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'searcher@example.test', password: 'password123' })
  });
  const registered = await registerResponse.json();
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Leadgen-Session-Token': registered.token
  };

  const searchResponse = await fetch(`${baseUrl}/api/searches`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      keyword: 'dentist',
      area: 'Toronto',
      maxResults: 1,
      includeEmailDiscovery: false
    })
  });
  const queued = await searchResponse.json();
  assert.equal(searchResponse.status, 202);
  assert.equal(queued.queued, true);
  assert.equal(queued.task.status, 'queued');

  let finishedTask = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const taskResponse = await fetch(`${baseUrl}/api/tasks/${queued.task.id}`, { headers: authHeaders });
    const taskPayload = await taskResponse.json();
    if (taskPayload.task.status === 'done') {
      finishedTask = taskPayload.task;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.equal(finishedTask?.status, 'done');
  assert.equal(finishedTask.result.created, 1);

  const leadsResponse = await fetch(`${baseUrl}/api/leads`, { headers: authHeaders });
  const storePayload = await leadsResponse.json();
  assert.equal(storePayload.leads.length, 1);
  assert.equal(storePayload.leads[0].name, 'Queued Lead');
  assert.equal(storePayload.leads[0].companyTypeZh, '商店');
  assert.deepEqual(storePayload.leads[0].sourceKeywordsZh, ['牙医']);
});
