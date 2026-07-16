import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCampaignInput, validateLeadPatch } from '../server/validation.mjs';

test('validateLeadPatch rejects malformed persisted field types', () => {
  assert.throws(() => validateLeadPatch({ emails: 'not-an-array' }), /emails/);
  assert.throws(() => validateLeadPatch({ emails: ['not-an-email'] }), /格式无效/);
  assert.throws(() => validateLeadPatch({ tags: [42] }), /tags/);
  assert.throws(() => validateLeadPatch({ status: 'contains spaces' }), /status/);
});

test('validateLeadPatch normalizes valid emails and tags', () => {
  assert.deepEqual(validateLeadPatch({
    emails: [' Owner@Acme.test ', 'owner@acme.test'],
    tags: [' priority ', 'priority']
  }), {
    emails: ['owner@acme.test'],
    tags: ['priority']
  });
});

test('validateCampaignInput rejects invalid flags and lead IDs', () => {
  assert.throws(() => validateCampaignInput({ subject: 'Hi', body: 'Body', dryRun: 'false' }), /dryRun/);
  assert.throws(() => validateCampaignInput({ subject: 'Hi', body: 'Body', leadIds: 'lead-1' }), /leadIds/);
  assert.equal(validateCampaignInput({ subject: 'Hi', body: 'Body' }).dryRun, true);
});

test('validateCampaignInput normalizes recipients and sanitizes html body', () => {
  const campaign = validateCampaignInput({
    subject: 'Hi',
    body: '',
    htmlBody: '<p>Hello</p><img src="x" onerror="alert(1)"><script>alert(1)</script>',
    recipients: [' OWNER@Acme.test ', 'owner@acme.test']
  });

  assert.deepEqual(campaign.recipients, ['owner@acme.test']);
  assert.match(campaign.htmlBody, /<p>Hello<\/p>/);
  assert.doesNotMatch(campaign.htmlBody, /script|onerror/);
  assert.equal(campaign.body, 'Hello');
});
