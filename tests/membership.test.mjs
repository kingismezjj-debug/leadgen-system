import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('membership registers first user as super admin and creates sessions', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-membership-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const { registerUser, loginUser, findUserBySessionToken } = await import('../server/membership.mjs');

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  const user = await registerUser({ name: 'Owner', email: 'owner@example.test', password: 'password123' });
  assert.equal(user.role, 'super_admin');
  assert.equal(user.plan, 'business');
  assert.equal(user.passwordHash, undefined);

  const session = await loginUser({ email: 'owner@example.test', password: 'password123' });
  assert.ok(session.token);
  const sessionUser = await findUserBySessionToken(session.token);
  assert.equal(sessionUser.email, 'owner@example.test');
});

test('membership usage limits are enforced per plan', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leadgen-membership-usage-'));
  process.env.LEADGEN_STORE_PATH = join(directory, 'store.json');
  const { consumeUsage, registerUser, updateUserAdmin } = await import('../server/membership.mjs');

  t.after(async () => {
    delete process.env.LEADGEN_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  const owner = await registerUser({ email: 'owner@example.test', password: 'password123' });
  const member = await registerUser({ email: 'member@example.test', password: 'password123' });
  await updateUserAdmin(member.id, { plan: 'free' });

  await consumeUsage(member, 'search_places', 10);
  await assert.rejects(() => consumeUsage(member, 'search_places', 1), /Usage limit exceeded/);
  await consumeUsage(owner, 'search_places', 10000);
});
