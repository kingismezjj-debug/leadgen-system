import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverEmails, isBlockedIpAddress } from '../server/emailDiscovery.mjs';

test('email discovery blocks private and reserved IP ranges', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.2', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isBlockedIpAddress(address), true, address);
  }
  assert.equal(isBlockedIpAddress('8.8.8.8'), false);
  assert.equal(isBlockedIpAddress('2606:4700:4700::1111'), false);
});

test('email discovery rejects local URLs before making a request', async () => {
  assert.deepEqual(await discoverEmails('http://127.0.0.1:8790'), []);
  assert.deepEqual(await discoverEmails('http://localhost'), []);
  assert.deepEqual(await discoverEmails('file:///etc/passwd'), []);
});
