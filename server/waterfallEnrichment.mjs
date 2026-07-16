import { resolveMx, resolveNs } from 'node:dns/promises';
import { URL } from 'node:url';
import {
  discoverContactLinks,
  discoverEmailDetails,
  extractEmailsFromHtml,
  fetchHtmlDetails
} from './emailDiscovery.mjs';

const socialDomains = [
  ['linkedin', /(^|\.)linkedin\.com$/i],
  ['facebook', /(^|\.)facebook\.com$/i],
  ['instagram', /(^|\.)instagram\.com$/i],
  ['x', /(^|\.)twitter\.com$|(^|\.)x\.com$/i]
];

const directoryDomains = [
  ['yelp', /(^|\.)yelp\./i],
  ['yellowpages', /(^|\.)yellowpages\./i],
  ['tripadvisor', /(^|\.)tripadvisor\./i],
  ['trustpilot', /(^|\.)trustpilot\./i],
  ['foursquare', /(^|\.)foursquare\./i]
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function mergeEmailSources(items = []) {
  return Array.from(new Map(
    items
      .filter((item) => item?.email && item?.url)
      .map((item) => [`${normalizeEmail(item.email)}|${item.url}`, { ...item, email: normalizeEmail(item.email) }])
  ).values());
}

function normalizeWebsite(website) {
  if (!website) return null;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return null;
  }
}

function rootDomainFromUrl(website) {
  const url = normalizeWebsite(website);
  if (!url) return '';
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      links.push({ url: url.href, hostname: url.hostname.toLowerCase().replace(/^www\./, ''), text: match[2].replace(/<[^>]+>/g, ' ').trim() });
    } catch {
      continue;
    }
  }
  return links;
}

function classifyExternalProfiles(links) {
  const socialProfiles = [];
  const directoryProfiles = [];
  for (const link of links) {
    const social = socialDomains.find(([, pattern]) => pattern.test(link.hostname));
    if (social && !socialProfiles.some((item) => item.url === link.url)) {
      socialProfiles.push({ source: social[0], url: link.url });
    }
    const directory = directoryDomains.find(([, pattern]) => pattern.test(link.hostname));
    if (directory && !directoryProfiles.some((item) => item.url === link.url)) {
      directoryProfiles.push({ source: directory[0], url: link.url });
    }
  }
  return { socialProfiles, directoryProfiles };
}

function step(name, status, details = {}) {
  return {
    name,
    status,
    checkedAt: new Date().toISOString(),
    ...details
  };
}

async function discoverFromWebsite(lead, options) {
  const result = await discoverEmailDetails(lead.website, {
    maxDepth: options.emailDiscoveryDepth ?? 1,
    timeoutMs: options.timeoutMs ?? 7000
  });
  return {
    result,
    step: step('official_website', result.emails?.length ? 'found' : result.status || 'empty', {
      emailsFound: result.emails?.length || 0,
      pagesScanned: result.pagesScanned || 0,
      reason: result.reason?.label || ''
    })
  };
}

async function discoverProfilesFromWebsite(lead, options) {
  const url = normalizeWebsite(lead.website);
  if (!url) return { socialProfiles: [], directoryProfiles: [], emails: [], emailSources: [], step: step('social_and_directory_links', 'skipped', { reason: 'missing_website' }) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 7000);
  try {
    const fetched = await fetchHtmlDetails(url.href, controller.signal);
    if (!fetched.ok) return { socialProfiles: [], directoryProfiles: [], emails: [], emailSources: [], step: step('social_and_directory_links', 'failed', { reason: fetched.reason?.label || 'fetch_failed' }) };
    const links = extractLinks(fetched.html, url.href);
    const profiles = classifyExternalProfiles(links);
    const emails = extractEmailsFromHtml(fetched.html, url.hostname, { allowPublicProvider: false });
    return {
      ...profiles,
      emails,
      emailSources: emails.map((email) => ({ email, url: url.href, foundAt: new Date().toISOString(), source: 'official_website_homepage' })),
      step: step('social_and_directory_links', profiles.socialProfiles.length || profiles.directoryProfiles.length ? 'found' : 'empty', {
        socialCount: profiles.socialProfiles.length,
        directoryCount: profiles.directoryProfiles.length,
        contactLinks: discoverContactLinks(fetched.html, url.href).slice(0, 10)
      })
    };
  } catch (error) {
    return { socialProfiles: [], directoryProfiles: [], emails: [], emailSources: [], step: step('social_and_directory_links', 'failed', { reason: error instanceof Error ? error.message : 'failed' }) };
  } finally {
    clearTimeout(timer);
  }
}

async function discoverDomainInfo(lead) {
  const domain = rootDomainFromUrl(lead.website);
  if (!domain) return { domainInfo: null, step: step('domain_info', 'skipped', { reason: 'missing_domain' }) };
  const [mx, ns] = await Promise.all([
    resolveMx(domain).catch(() => []),
    resolveNs(domain).catch(() => [])
  ]);
  const rdapResponse = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    headers: { Accept: 'application/rdap+json, application/json' }
  }).catch(() => null);
  const rdap = rdapResponse?.ok ? await rdapResponse.json().catch(() => null) : null;
  return {
    domainInfo: {
      domain,
      mx: mx.map((item) => item.exchange).filter(Boolean),
      ns,
      rdap: rdap ? {
        handle: rdap.handle || '',
        registrar: rdap.entities?.find((entity) => (entity.roles || []).includes('registrar'))?.vcardArray?.[1]?.find((item) => item[0] === 'fn')?.[3] || '',
        events: (rdap.events || []).map((event) => ({ action: event.eventAction, date: event.eventDate })).filter((event) => event.action || event.date)
      } : null
    },
    step: step('domain_info', mx.length || ns.length || rdap ? 'found' : 'empty', { domain, mxCount: mx.length, nsCount: ns.length, rdapFound: Boolean(rdap) })
  };
}

async function searchYelpDirectory(lead, settings = {}) {
  return { directoryProfiles: [], step: step('yelp_places', 'skipped', { reason: 'disabled_to_control_cost' }) };
}

async function searchFoursquarePlaces(lead, settings = {}) {
  const apiKey = String(settings.foursquareApiKey || '').trim();
  if (!apiKey) return { directoryProfiles: [], step: step('foursquare_places', 'skipped', { reason: 'api_key_not_configured' }) };
  const near = lead.address || lead.area || '';
  if (!lead.name || !near) return { directoryProfiles: [], step: step('foursquare_places', 'skipped', { reason: 'missing_name_or_location' }) };
  const url = new URL('https://api.foursquare.com/v3/places/search');
  url.searchParams.set('query', lead.name);
  url.searchParams.set('near', near);
  url.searchParams.set('limit', '3');
  url.searchParams.set('fields', 'fsq_id,name,location,website,tel,categories');
  const response = await fetch(url, {
    headers: { Authorization: apiKey, Accept: 'application/json' }
  }).catch(() => null);
  if (!response?.ok) return { directoryProfiles: [], step: step('foursquare_places', 'failed', { status: response?.status || 0 }) };
  const payload = await response.json().catch(() => ({}));
  const directoryProfiles = (payload.results || []).map((item) => ({
    source: 'foursquare',
    url: item.website || (item.fsq_id ? `https://foursquare.com/v/${item.fsq_id}` : ''),
    name: item.name || '',
    phone: item.tel || '',
    address: item.location?.formatted_address || '',
    categories: (item.categories || []).map((category) => category.name).filter(Boolean)
  })).filter((item) => item.url || item.name);
  return { directoryProfiles, step: step('foursquare_places', directoryProfiles.length ? 'found' : 'empty', { resultCount: directoryProfiles.length }) };
}

async function discoverFromHunter(lead, settings = {}) {
  const apiKey = String(settings.hunterApiKey || '').trim();
  if (!apiKey) return { emails: [], emailSources: [], step: step('hunter_domain_search', 'skipped', { reason: 'api_key_not_configured' }) };
  const domain = rootDomainFromUrl(lead.website);
  if (!domain) return { emails: [], emailSources: [], step: step('hunter_domain_search', 'skipped', { reason: 'missing_domain' }) };
  const url = new URL('https://api.hunter.io/v2/domain-search');
  url.searchParams.set('domain', domain);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('limit', '10');
  const response = await fetch(url, { headers: { Accept: 'application/json' } }).catch(() => null);
  if (!response?.ok) return { emails: [], emailSources: [], step: step('hunter_domain_search', 'failed', { status: response?.status || 0 }) };
  const payload = await response.json().catch(() => ({}));
  const emails = Array.from(new Set((payload.data?.emails || []).map((item) => normalizeEmail(item.value || item.email)).filter(Boolean)));
  return {
    emails,
    emailSources: emails.map((email) => ({ email, url: `https://hunter.io/search/${domain}`, foundAt: new Date().toISOString(), source: 'hunter_domain_search' })),
    step: step('hunter_domain_search', emails.length ? 'found' : 'empty', { emailsFound: emails.length, domain })
  };
}

async function discoverFromThirdPartyApi(lead, settings = {}) {
  const endpoint = String(settings.enrichmentEmailApiEndpoint || '').trim();
  const apiKey = String(settings.enrichmentEmailApiKey || '').trim();
  if (!endpoint) return { emails: [], emailSources: [], step: step('third_party_email_api', 'skipped', { reason: 'endpoint_not_configured' }) };
  const url = new URL(endpoint);
  url.searchParams.set('domain', rootDomainFromUrl(lead.website));
  url.searchParams.set('website', lead.website || '');
  url.searchParams.set('name', lead.name || '');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'X-API-Key': apiKey } : {})
    }
  });
  if (!response.ok) return { emails: [], emailSources: [], step: step('third_party_email_api', 'failed', { status: response.status }) };
  const payload = await response.json().catch(() => ({}));
  const rawEmails = Array.isArray(payload.emails)
    ? payload.emails
    : Array.isArray(payload.data?.emails)
      ? payload.data.emails
      : [];
  const emails = Array.from(new Set(rawEmails.map((item) => normalizeEmail(typeof item === 'string' ? item : item.email)).filter(Boolean)));
  return {
    emails,
    emailSources: emails.map((email) => ({ email, url: endpoint, foundAt: new Date().toISOString(), source: 'third_party_email_api' })),
    step: step('third_party_email_api', emails.length ? 'found' : 'empty', { emailsFound: emails.length })
  };
}

async function runAiResearch(lead, context, settings = {}) {
  if (!settings.openAiApiKey) return { aiResearch: null, step: step('ai_web_research', 'skipped', { reason: 'openai_not_configured' }) };
  const prompt = [
    'You are helping qualify a business lead. Do not invent email addresses.',
    'Summarize what the available evidence says and suggest the next best public sources to inspect.',
    JSON.stringify({
      name: lead.name,
      website: lead.website,
      address: lead.address,
      phone: lead.phone,
      emails: context.emails,
      socialProfiles: context.socialProfiles,
      directoryProfiles: context.directoryProfiles,
      domainInfo: context.domainInfo
    })
  ].join('\n');
  const baseUrl = String(settings.openAiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openAiApiKey}`
    },
    body: JSON.stringify({
      model: settings.openAiModel || 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'Return concise JSON with keys summary, nextSources, risks.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });
  if (!response.ok) return { aiResearch: null, step: step('ai_web_research', 'failed', { status: response.status }) };
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content || '';
  return {
    aiResearch: { summary: text.slice(0, 4000), checkedAt: new Date().toISOString() },
    step: step('ai_web_research', text ? 'found' : 'empty')
  };
}

export async function enrichLeadWaterfall(lead, { settings = {}, emailDiscoveryDepth = 1, timeoutMs = 7000, enableAiResearch = false } = {}) {
  const steps = [];
  const allEmails = new Set((lead.emails || []).map(normalizeEmail).filter(Boolean));
  const allSources = [...(lead.emailSources || [])];

  const website = await discoverFromWebsite(lead, { emailDiscoveryDepth, timeoutMs });
  steps.push(website.step);
  for (const email of website.result.emails || []) allEmails.add(normalizeEmail(email));
  allSources.push(...(website.result.emailSources || []));

  const profiles = await discoverProfilesFromWebsite(lead, { timeoutMs });
  steps.push(profiles.step);
  for (const email of profiles.emails || []) allEmails.add(normalizeEmail(email));
  allSources.push(...(profiles.emailSources || []));

  const domain = await discoverDomainInfo(lead);
  steps.push(domain.step);

  const yelp = await searchYelpDirectory(lead, settings);
  steps.push(yelp.step);

  const foursquare = await searchFoursquarePlaces(lead, settings);
  steps.push(foursquare.step);

  const hunter = await discoverFromHunter(lead, settings);
  steps.push(hunter.step);
  for (const email of hunter.emails || []) allEmails.add(normalizeEmail(email));
  allSources.push(...(hunter.emailSources || []));

  const thirdParty = await discoverFromThirdPartyApi(lead, settings);
  steps.push(thirdParty.step);
  for (const email of thirdParty.emails || []) allEmails.add(normalizeEmail(email));
  allSources.push(...(thirdParty.emailSources || []));

  const emails = Array.from(allEmails);
  const ai = enableAiResearch
    ? await runAiResearch(lead, {
        emails,
        socialProfiles: profiles.socialProfiles,
        directoryProfiles: profiles.directoryProfiles,
        domainInfo: domain.domainInfo
      }, settings)
    : { aiResearch: lead.aiResearch || null, step: step('ai_web_research', 'skipped', { reason: 'disabled' }) };
  steps.push(ai.step);

  const failedReason = website.result.reason?.label || steps.find((item) => item.status === 'failed')?.reason || '';
  return {
    ...lead,
    emails,
    emailSources: mergeEmailSources(allSources),
    socialProfiles: Array.from(new Map([...(lead.socialProfiles || []), ...profiles.socialProfiles].map((item) => [`${item.source}|${item.url}`, item])).values()),
    directoryProfiles: Array.from(new Map([...(lead.directoryProfiles || []), ...profiles.directoryProfiles, ...yelp.directoryProfiles, ...foursquare.directoryProfiles].map((item) => [`${item.source}|${item.url || item.name}`, item])).values()),
    domainInfo: domain.domainInfo || lead.domainInfo || null,
    aiResearch: ai.aiResearch || lead.aiResearch || null,
    enrichmentStatus: emails.length ? 'found' : 'empty',
    enrichmentCheckedAt: new Date().toISOString(),
    enrichmentSteps: steps,
    emailDiscoveryStatus: emails.length ? 'found' : website.result.status || 'empty',
    emailDiscoveryReason: emails.length ? '' : failedReason || '瀑布式补全未找到公开邮箱',
    emailDiscoveryReasonCode: emails.length ? '' : website.result.reason?.code || 'waterfall_empty',
    emailDiscoveryPagesScanned: website.result.pagesScanned || 0,
    emailDiscoveryPagesAttempted: website.result.pagesAttempted || 0,
    emailDiscoveryDepth: website.result.depth ?? emailDiscoveryDepth
  };
}
