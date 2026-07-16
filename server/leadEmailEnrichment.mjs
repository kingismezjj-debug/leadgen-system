import { runBatchQueue } from './batchQueue.mjs';
import { discoverEmailDetails } from './emailDiscovery.mjs';
import { assessLeadEmails } from './emailQuality.mjs';
import { enrichLeadWaterfall } from './waterfallEnrichment.mjs';

export async function enrichLeadEmails(lead, {
  discover = discoverEmailDetails,
  assess = assessLeadEmails,
  retryEmpty = true,
  emailDiscoveryDepth = 1,
  settings = {},
  enableWaterfall = true
} = {}) {
  if (enableWaterfall && discover === discoverEmailDetails) {
    const enriched = await enrichLeadWaterfall(lead, { settings, emailDiscoveryDepth });
    return {
      ...enriched,
      emailQuality: await assess(enriched.emails || [], { website: lead.website }),
      emailDiscoveryAttempts: (lead.emailDiscoveryAttempts || 0) + 1
    };
  }

  const discoveryResult = await discover(lead.website, { maxDepth: emailDiscoveryDepth });
  const discoveredEmails = Array.isArray(discoveryResult) ? discoveryResult : discoveryResult.emails || [];
  const discoveredSources = Array.isArray(discoveryResult) ? [] : discoveryResult.emailSources || [];
  const discoveryReason = Array.isArray(discoveryResult) ? null : discoveryResult.reason || null;
  const emails = Array.from(new Set([...(lead.emails || []), ...discoveredEmails]));
  const emailQuality = await assess(emails, { website: lead.website });
  const emailSources = Array.from(new Map([
    ...(lead.emailSources || []),
    ...discoveredSources
  ].filter((item) => item?.email && item?.url).map((item) => [`${item.email.toLowerCase()}|${item.url}`, item])).values());

  return {
    ...lead,
    emails,
    emailQuality,
    emailSources,
    emailDiscoveryStatus: emails.length ? 'found' : (discoveryResult.status || 'empty'),
    emailDiscoveryAttempts: (lead.emailDiscoveryAttempts || 0) + 1,
    emailDiscoveryCheckedAt: new Date().toISOString(),
    emailDiscoveryError: emails.length ? '' : discoveryReason?.label || '',
    emailDiscoveryReason: emails.length ? '' : discoveryReason?.label || '',
    emailDiscoveryReasonCode: emails.length ? '' : discoveryReason?.code || '',
    emailDiscoveryPagesScanned: discoveryResult.pagesScanned || 0,
    emailDiscoveryPagesAttempted: discoveryResult.pagesAttempted || 0,
    emailDiscoveryDepth: discoveryResult.depth ?? emailDiscoveryDepth,
    emailDiscoveryContactFormOnly: Boolean(discoveryResult.contactFormFound && !emails.length)
  };
}

export async function enrichLeadsWithEmails(leads, {
  concurrency = 4,
  retries = 1,
  retryEmpty = true,
  emailDiscoveryDepth = 1,
  settings = {},
  enableWaterfall = true,
  discover = discoverEmailDetails,
  assess = assessLeadEmails,
  onProgress = null
} = {}) {
  return runBatchQueue(
    leads,
    (lead) => enrichLeadEmails(lead, { discover, assess, retryEmpty, emailDiscoveryDepth, settings, enableWaterfall }),
    {
      concurrency,
      retries,
      shouldRetry: (result) => retryEmpty && result.emailDiscoveryStatus === 'empty' && Boolean(result.website),
      onProgress,
      onError: (error, lead) => ({
        ...lead,
        emailDiscoveryStatus: 'failed',
        emailDiscoveryAttempts: (lead.emailDiscoveryAttempts || 0) + retries + 1,
        emailDiscoveryCheckedAt: new Date().toISOString(),
        emailDiscoveryError: error instanceof Error ? error.message : 'Email discovery failed',
        emailDiscoveryReason: error instanceof Error ? error.message : 'Email discovery failed',
        emailDiscoveryReasonCode: 'website_unreachable',
        emailDiscoveryPagesScanned: 0,
        emailDiscoveryPagesAttempted: 0,
        emailDiscoveryDepth
      })
    }
  );
}
