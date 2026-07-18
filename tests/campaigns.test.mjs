import test from 'node:test';
import assert from 'node:assert/strict';
import { countDailySendAttempts, selectCampaignLeads } from '../server/campaigns.mjs';

test('countDailySendAttempts counts real delivery attempts for the current UTC day', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');
  const sendLog = [
    { status: 'sent', at: '2026-07-11T01:00:00.000Z' },
    { status: 'failed', at: '2026-07-11T02:00:00.000Z' },
    { status: 'dry-run', at: '2026-07-11T03:00:00.000Z' },
    { status: 'sent', at: '2026-07-10T23:59:59.000Z' }
  ];
  assert.equal(countDailySendAttempts(sendLog, now), 2);
});

test('countDailySendAttempts can scope attempts to one owner', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');
  const sendLog = [
    { status: 'sent', at: '2026-07-11T01:00:00.000Z', userId: 'owner-a' },
    { status: 'failed', at: '2026-07-11T02:00:00.000Z', userId: 'owner-b' },
    { status: 'sent', at: '2026-07-11T03:00:00.000Z', userId: 'owner-a' }
  ];
  assert.equal(countDailySendAttempts(sendLog, now, 'owner-a'), 2);
  assert.equal(countDailySendAttempts(sendLog, now, 'owner-b'), 1);
});

test('selected lead IDs cannot bypass batch or remaining daily limits', () => {
  const leads = Array.from({ length: 30 }, (_, index) => ({ id: `lead-${index}`, emails: [`lead-${index}@example.test`] }));
  const leadIds = leads.map((lead) => lead.id);

  assert.equal(selectCampaignLeads({ leads, leadIds, batchLimit: 25, dailyRemaining: 25, dryRun: true }).length, 25);
  assert.equal(selectCampaignLeads({ leads, leadIds, batchLimit: 25, dailyRemaining: 4, dryRun: false }).length, 4);
  assert.equal(selectCampaignLeads({ leads, leadIds, batchLimit: 25, dailyRemaining: 0, dryRun: false }).length, 0);
});
