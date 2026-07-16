import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmailReadiness, isPublicHttpsUnsubscribeUrl } from '../server/emailReadiness.mjs';

test('public unsubscribe validation rejects placeholders and local addresses', () => {
  assert.equal(isPublicHttpsUnsubscribeUrl('https://example.com/unsubscribe'), false);
  assert.equal(isPublicHttpsUnsubscribeUrl('http://mail.acme.test/unsubscribe'), false);
  assert.equal(isPublicHttpsUnsubscribeUrl('https://localhost/unsubscribe'), false);
  assert.equal(isPublicHttpsUnsubscribeUrl('https://127.0.0.1/unsubscribe'), false);
  assert.equal(isPublicHttpsUnsubscribeUrl('https://mail.acme.test/unsubscribe'), true);
});

test('real email readiness requires a provider and public unsubscribe URL', () => {
  assert.equal(getEmailReadiness({ smtp: {}, unsubscribeUrl: 'https://example.com/unsubscribe' }).readyForRealSend, false);
  assert.deepEqual(getEmailReadiness({
    smtp: { host: 'smtp.acme.test', from: 'sender@acme.test', user: '', pass: '' },
    unsubscribeUrl: 'https://mail.acme.test/unsubscribe'
  }), {
    mode: 'smtp',
    readyForRealSend: true,
    issues: []
  });
});
