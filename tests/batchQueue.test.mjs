import test from 'node:test';
import assert from 'node:assert/strict';
import { runBatchQueue } from '../server/batchQueue.mjs';
import { enrichLeadsWithEmails } from '../server/leadEmailEnrichment.mjs';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('runBatchQueue limits concurrency and preserves result order', async () => {
  let active = 0;
  let maxActive = 0;
  const results = await runBatchQueue([1, 2, 3, 4, 5], async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await wait(10);
    active -= 1;
    return item * 2;
  }, { concurrency: 2 });

  assert.deepEqual(results, [2, 4, 6, 8, 10]);
  assert.equal(maxActive, 2);
});

test('runBatchQueue retries retryable results and thrown failures', async () => {
  const attempts = new Map();
  const results = await runBatchQueue(['empty-once', 'throws-once'], async (item) => {
    const attempt = attempts.get(item) || 0;
    attempts.set(item, attempt + 1);
    if (item === 'throws-once' && attempt === 0) throw new Error('temporary');
    if (item === 'empty-once' && attempt === 0) return { item, status: 'empty' };
    return { item, status: 'ok' };
  }, {
    concurrency: 2,
    retries: 1,
    retryDelayMs: 1,
    shouldRetry: (result) => result.status === 'empty'
  });

  assert.deepEqual(results, [
    { item: 'empty-once', status: 'ok' },
    { item: 'throws-once', status: 'ok' }
  ]);
  assert.equal(attempts.get('empty-once'), 2);
  assert.equal(attempts.get('throws-once'), 2);
});

test('enrichLeadsWithEmails discovers and scores emails through the queue', async () => {
  const leads = [
    { id: '1', website: 'https://alpha.test', emails: [] },
    { id: '2', website: 'https://beta.test', emails: ['owner@beta.test'] }
  ];
  const enriched = await enrichLeadsWithEmails(leads, {
    concurrency: 1,
    retries: 0,
    discover: async (website) => website.includes('alpha') ? ['hello@alpha.test'] : [],
    assess: async (emails) => emails.map((email) => ({ email, status: 'high', score: 100, reasons: ['test'] }))
  });

  assert.deepEqual(enriched.map((lead) => lead.emails), [['hello@alpha.test'], ['owner@beta.test']]);
  assert.deepEqual(enriched.map((lead) => lead.emailDiscoveryStatus), ['found', 'found']);
  assert.equal(enriched[0].emailQuality[0].score, 100);
});

test('enrichLeadsWithEmails stores structured no-email reasons', async () => {
  const [lead] = await enrichLeadsWithEmails([
    { id: '1', website: 'https://forms-only.test', emails: [] }
  ], {
    concurrency: 1,
    retries: 0,
    emailDiscoveryDepth: 2,
    discover: async () => ({
      emails: [],
      emailSources: [],
      status: 'empty',
      reason: { code: 'contact_form_only', label: '只发现联系表单，未公开邮箱' },
      pagesScanned: 2,
      pagesAttempted: 3,
      depth: 2,
      contactFormFound: true
    }),
    assess: async () => []
  });

  assert.equal(lead.emailDiscoveryStatus, 'empty');
  assert.equal(lead.emailDiscoveryReasonCode, 'contact_form_only');
  assert.equal(lead.emailDiscoveryReason, '只发现联系表单，未公开邮箱');
  assert.equal(lead.emailDiscoveryPagesScanned, 2);
  assert.equal(lead.emailDiscoveryDepth, 2);
  assert.equal(lead.emailDiscoveryContactFormOnly, true);
});
