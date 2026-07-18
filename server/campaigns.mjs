export function countDailySendAttempts(sendLog, now = new Date(), ownerId = '') {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 24 * 60 * 60 * 1000;
  return sendLog.filter((entry) => {
    if (!['sent', 'failed'].includes(entry.status)) return false;
    if (ownerId && entry.userId && entry.userId !== ownerId) return false;
    if (ownerId && !entry.userId) return false;
    const timestamp = Date.parse(entry.at);
    return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
  }).length;
}

export function selectCampaignLeads({ leads, leadIds = [], batchLimit, dailyRemaining, dryRun }) {
  const requested = leadIds.length
    ? leads.filter((lead) => leadIds.includes(lead.id))
    : leads.filter((lead) => Array.isArray(lead.emails) && lead.emails.length);
  const effectiveLimit = dryRun ? batchLimit : Math.min(batchLimit, dailyRemaining);
  return requested.slice(0, Math.max(0, effectiveLimit));
}
