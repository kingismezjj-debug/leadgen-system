import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('optional admin token keeps health public and protects API data', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-auth-'));
  const storePath = join(directory, 'store.json');
  const settingsPath = join(directory, 'settings.json');
  const token = 'test-admin-token';

  await writeFile(storePath, JSON.stringify({
    leads: [],
    searches: [],
    campaigns: [],
    suppressions: [],
    unsubscribeTokens: [],
    sendLog: []
  }));
  await writeFile(settingsPath, JSON.stringify({}));

  const child = fork(new URL('./fixtures/auth-server.mjs', import.meta.url), {
    env: {
      ...process.env,
      LEADGEN_ADMIN_TOKEN: token,
      LEADGEN_STORE_PATH: storePath,
      LEADGEN_SETTINGS_PATH: settingsPath
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  t.after(async () => {
    if (child.connected) child.send('close');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => {
        child.kill();
        resolve();
      }, 2000).unref();
    });
    await rm(directory, { recursive: true, force: true });
  });

  const port = await new Promise((resolve, reject) => {
    child.once('message', (message) => resolve(message.port));
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Auth fixture exited before startup (${code})`)));
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.authRequired, true);

  const anonymousResponse = await fetch(`${baseUrl}/api/leads`);
  assert.equal(anonymousResponse.status, 401);
  assert.equal(anonymousResponse.headers.get('www-authenticate'), 'Bearer');

  const invalidResponse = await fetch(`${baseUrl}/api/leads`, {
    headers: { Authorization: 'Bearer wrong-token' }
  });
  assert.equal(invalidResponse.status, 401);

  const authorizedResponse = await fetch(`${baseUrl}/api/leads`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(authorizedResponse.status, 200);
  const payload = await authorizedResponse.json();
  assert.deepEqual(payload.leads, []);
});
