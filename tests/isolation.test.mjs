import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('membership users only see their own leads, searches, tasks, campaigns, and send log', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-isolation-'));
  const storePath = join(directory, 'store.json');
  const settingsPath = join(directory, 'settings.json');
  const now = new Date().toISOString();

  const superUser = {
    id: 'user-super',
    email: 'super@example.test',
    name: 'Super',
    role: 'super_admin',
    plan: 'business',
    status: 'active'
  };
  const memberUser = {
    id: 'user-member',
    email: 'member@example.test',
    name: 'Member',
    role: 'member',
    plan: 'free',
    status: 'active'
  };

  await writeFile(storePath, JSON.stringify({
    leads: [
      { id: 'lead-super', userId: superUser.id, name: 'Super Lead', address: 'A', emails: ['super@example.test'], status: 'new' },
      { id: 'lead-member', userId: memberUser.id, name: 'Member Lead', address: 'B', emails: ['member@example.test'], status: 'new' }
    ],
    searches: [
      { id: 'search-super', userId: superUser.id, keyword: 'super', area: 'US', created: 1, updated: 1, createdAt: now },
      { id: 'search-member', userId: memberUser.id, keyword: 'member', area: 'US', created: 1, updated: 1, createdAt: now }
    ],
    campaigns: [
      { id: 'campaign-super', userId: superUser.id, subject: 'Super', dryRun: true, mode: 'dry-run', leadCount: 1, createdAt: now },
      { id: 'campaign-member', userId: memberUser.id, subject: 'Member', dryRun: true, mode: 'dry-run', leadCount: 1, createdAt: now }
    ],
    tasks: [
      { id: 'task-super', userId: superUser.id, kind: 'search', title: 'Super Task', status: 'done', progress: 100, createdAt: now, updatedAt: now },
      { id: 'task-member', userId: memberUser.id, kind: 'search', title: 'Member Task', status: 'done', progress: 100, createdAt: now, updatedAt: now }
    ],
    suppressions: [{ email: 'blocked@example.test', reason: 'manual', createdAt: now }],
    unsubscribeTokens: [],
    sendLog: [
      { id: 'log-super', userId: superUser.id, status: 'sent', at: now, to: 'super@example.test' },
      { id: 'log-member', userId: memberUser.id, status: 'sent', at: now, to: 'member@example.test' }
    ],
    users: [superUser, memberUser],
    sessions: [
      { token: 'super-token', userId: superUser.id, createdAt: now, lastSeenAt: now, expiresAt: '2999-01-01T00:00:00.000Z' },
      { token: 'member-token', userId: memberUser.id, createdAt: now, lastSeenAt: now, expiresAt: '2999-01-01T00:00:00.000Z' }
    ],
    usageRecords: []
  }, null, 2));
  await writeFile(settingsPath, JSON.stringify({
    googleMapsApiKey: 'maps-secret',
    googleTranslateApiKey: 'translate-secret',
    openAiApiKey: 'openai-secret',
    openAiBaseUrl: 'https://ai.example.test/v1',
    openAiModel: 'test-model',
    smtp: {
      host: 'smtp.example.test',
      port: '465',
      secure: true,
      user: 'smtp-user',
      pass: 'smtp-secret',
      from: 'sender@example.test'
    },
    unsubscribeUrl: 'https://leads.example.test/unsubscribe'
  }, null, 2));

  process.env.LEADGEN_STORE_PATH = storePath;
  process.env.LEADGEN_SETTINGS_PATH = settingsPath;
  delete process.env.LEADGEN_ADMIN_TOKEN;

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
    await rm(directory, { recursive: true, force: true });
  });

  const memberHeaders = {
    'X-Leadgen-Session-Token': 'member-token'
  };
  const superHeaders = {
    'X-Leadgen-Session-Token': 'super-token'
  };

  const memberResponse = await fetch(`${baseUrl}/api/leads`, { headers: memberHeaders });
  assert.equal(memberResponse.status, 200);
  const memberPayload = await memberResponse.json();
  assert.equal(memberPayload.leads.length, 1);
  assert.equal(memberPayload.searches.length, 1);
  assert.equal(memberPayload.campaigns.length, 1);
  assert.equal(memberPayload.tasks.length, 1);
  assert.equal(memberPayload.sendLog.length, 1);
  assert.equal(memberPayload.suppressions.length, 0);
  assert.equal(memberPayload.leads[0].id, 'lead-member');

  const superResponse = await fetch(`${baseUrl}/api/leads`, { headers: superHeaders });
  assert.equal(superResponse.status, 200);
  const superPayload = await superResponse.json();
  assert.equal(superPayload.leads.length, 2);
  assert.equal(superPayload.searches.length, 2);
  assert.equal(superPayload.campaigns.length, 2);
  assert.equal(superPayload.tasks.length, 2);
  assert.equal(superPayload.sendLog.length, 2);
  assert.equal(superPayload.suppressions.length, 1);

  const memberSettingsResponse = await fetch(`${baseUrl}/api/settings`, { headers: memberHeaders });
  assert.equal(memberSettingsResponse.status, 200);
  const memberSettings = (await memberSettingsResponse.json()).settings;
  assert.equal(memberSettings.googleMapsApiKey, '');
  assert.equal(memberSettings.googleTranslateApiKey, '');
  assert.equal(memberSettings.openAiBaseUrl, '');
  assert.equal(memberSettings.openAiModel, '');
  assert.equal(memberSettings.smtp.host, '');
  assert.equal(memberSettings.hasOpenAiApiKey, false);
  assert.equal(memberSettings.hasSmtpPass, false);

  const superSettingsResponse = await fetch(`${baseUrl}/api/settings`, { headers: superHeaders });
  assert.equal(superSettingsResponse.status, 200);
  const superSettings = (await superSettingsResponse.json()).settings;
  assert.equal(superSettings.googleMapsApiKey, 'maps-secret');
  assert.equal(superSettings.googleTranslateApiKey, 'translate-secret');
  assert.equal(superSettings.openAiBaseUrl, 'https://ai.example.test/v1');
  assert.equal(superSettings.smtp.host, 'smtp.example.test');
  assert.equal(superSettings.hasOpenAiApiKey, true);
  assert.equal(superSettings.hasSmtpPass, true);

  const blockedSettingsUpdate = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers: { ...memberHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleMapsApiKey: 'member-maps',
      openAiBaseUrl: 'https://member.example.test/v1',
      smtp: { host: 'member-smtp.test', secure: false, pass: 'member-pass' }
    })
  });
  assert.equal(blockedSettingsUpdate.status, 200);
  const settingsAfterBlockedUpdate = JSON.parse(await readFile(settingsPath, 'utf8'));
  assert.equal(settingsAfterBlockedUpdate.googleMapsApiKey, 'maps-secret');
  assert.equal(settingsAfterBlockedUpdate.openAiBaseUrl, 'https://ai.example.test/v1');
  assert.equal(settingsAfterBlockedUpdate.smtp.host, 'smtp.example.test');
  assert.equal(settingsAfterBlockedUpdate.smtp.secure, true);
  assert.equal(settingsAfterBlockedUpdate.smtp.pass, 'smtp-secret');

  const deleteSendLogResponse = await fetch(`${baseUrl}/api/send-log`, {
    method: 'DELETE',
    headers: memberHeaders
  });
  assert.equal(deleteSendLogResponse.status, 200);

  const storeAfterDelete = JSON.parse(await readFile(storePath, 'utf8'));
  assert.equal(storeAfterDelete.sendLog.length, 1);
  assert.equal(storeAfterDelete.sendLog[0].userId, superUser.id);
});
