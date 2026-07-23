import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAILTO_PATTERN = /href\s*=\s*["']mailto:([^"'?#]+)(?:\?[^"']*)?["']/gi;
const CLOUDFLARE_EMAIL_PATTERN = /(?:data-cfemail=["']|email-protection#)([a-f0-9]{6,})/gi;
const JSON_LD_PATTERN = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const LINK_PATTERN = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const WHATSAPP_TEXT_URL_PATTERN = /https?:\\?\/\\?\/(?:wa\.me|wa\.link|api\.whatsapp\.com|web\.whatsapp\.com|(?:www\.)?whatsapp\.com)\/[^\s"'<>)]*/gi;
const BLOCKED_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|pdf|zip|mp4|mov|avi|wmv|doc|docx|xls|xlsx)$/i;
const MAX_PAGES = 20;
const MAX_DISCOVERY_DEPTH = 3;
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_EMAILS_PER_SITE = 25;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 12000;
const RETRY_DISCOVERY_TIMEOUT_MS = 18000;
const DISCOVERY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
};
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'hotmail.de',
  'hotmail.it',
  'hotmail.es',
  'hotmail.com.br',
  'outlook.com',
  'outlook.co.uk',
  'outlook.fr',
  'outlook.de',
  'live.com',
  'live.co.uk',
  'live.fr',
  'live.de',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.ca',
  'yahoo.com.au',
  'yahoo.com.br',
  'yahoo.com.mx',
  'yahoo.co.jp',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.es',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'zoho.com',
  'zohomail.com',
  'mail.com',
  'email.com',
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'web.de',
  't-online.de',
  'aol.com',
  'fastmail.com',
  'hey.com',
  'tutanota.com',
  'tuta.io',
  'yandex.com',
  'yandex.ru',
  'ya.ru',
  'mail.ru',
  'bk.ru',
  'inbox.ru',
  'list.ru',
  'rambler.ru',
  'qq.com',
  'foxmail.com',
  '163.com',
  '126.com',
  'yeah.net',
  'sina.com',
  'sina.cn',
  'sohu.com',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'kakao.com',
  'rediffmail.com',
  'uol.com.br',
  'bol.com.br',
  'terra.com.br',
  'orange.fr',
  'free.fr',
  'wanadoo.fr',
  'laposte.net',
  'libero.it',
  'virgilio.it',
  'seznam.cz',
  'centrum.cz',
  'wp.pl',
  'onet.pl',
  'interia.pl',
  'o2.pl',
  'abv.bg',
  'mail.bg',
  'ukr.net'
]);
const CONTACT_LINK_HINTS = [
  'contact',
  'contact-us',
  'about',
  'about-us',
  'team',
  'staff',
  'locations',
  'support',
  'help',
  'privacy',
  'legal',
  'impressum',
  'kontakt',
  'contatti',
  'contacto',
  'contato',
  'お問い合わせ',
  '联系',
  '聯絡'
];

const CANDIDATE_PATHS = [
  '/',
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/staff',
  '/locations',
  '/support',
  '/help',
  '/privacy-policy',
  '/privacy',
  '/legal',
  '/impressum',
  '/kontakt',
  '/contatti',
  '/contacto',
  '/contato'
];

const discoveryReasonLabels = {
  missing_website: '官网为空',
  invalid_url: '官网地址无效',
  blocked_extension: '官网不是网页',
  unsafe_url: '官网地址不安全',
  website_unreachable: '官网打不开',
  timeout: '官网访问超时',
  http_error: '官网返回错误',
  non_html: '官网不是 HTML 页面',
  too_large: '官网页面过大',
  cloudflare_blocked: '被 Cloudflare 或防护墙阻挡',
  contact_form_only: '只发现联系表单，未公开邮箱',
  no_email_found: '官网无公开邮箱'
};

function normalizeDiscoveryDepth(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 1;
  return Math.max(0, Math.min(MAX_DISCOVERY_DEPTH, Math.floor(numberValue)));
}

function discoveryReason(code, details = {}) {
  return {
    code,
    label: discoveryReasonLabels[code] || '邮箱发现失败',
    ...details
  };
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeWhatsAppPhone(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.replace(/[^\d+]/g, '');
  const digits = normalized.startsWith('+')
    ? normalized.slice(1)
    : normalized.startsWith('00')
      ? normalized.slice(2)
      : normalized;
  return /^\d{7,16}$/.test(digits) ? digits : '';
}

export function parseWhatsAppContactUrl(value, baseUrl = 'https://example.com') {
  const raw = String(value || '').trim().replace(/\\\//g, '/').replace(/&amp;/gi, '&');
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw, baseUrl);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const protocol = url.protocol.toLowerCase();
  let phone = '';
  let confirmed = false;

  if (protocol === 'whatsapp:') {
    phone = normalizeWhatsAppPhone(url.searchParams.get('phone') || url.searchParams.get('number') || '');
    confirmed = true;
  } else if (['wa.me', 'wa.link'].includes(hostname)) {
    phone = normalizeWhatsAppPhone(url.pathname.split('/').filter(Boolean)[0] || '');
    confirmed = true;
  } else if (hostname === 'whatsapp.com' || hostname.endsWith('.whatsapp.com')) {
    phone = normalizeWhatsAppPhone(url.searchParams.get('phone') || url.searchParams.get('number') || '');
    confirmed = /\/send\b|\/message\b|\/channel\b/i.test(url.pathname) || Boolean(phone);
  }

  if (!confirmed) return null;
  return {
    url: protocol === 'whatsapp:' ? raw : url.href,
    phone
  };
}

function ipv4ToNumber(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
}

function isIpv4InRange(address, base, prefixLength) {
  const value = ipv4ToNumber(address);
  const baseValue = ipv4ToNumber(base);
  if (value == null || baseValue == null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
];

function parseIpv6(address) {
  let input = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':');
    const ipv4 = ipv4ToNumber(input.slice(lastColon + 1));
    if (ipv4 == null) return null;
    input = `${input.slice(0, lastColon)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = input.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = halves.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce((value, part) => (value << 16n) | BigInt(parseInt(part, 16)), 0n);
}

function isIpv6InRange(value, base, prefixLength) {
  const baseValue = parseIpv6(base);
  if (value == null || baseValue == null) return false;
  const shift = BigInt(128 - prefixLength);
  return (value >> shift) === (baseValue >> shift);
}

export function isBlockedIpAddress(address) {
  const version = isIP(address.replace(/^\[|\]$/g, ''));
  if (version === 4) {
    return BLOCKED_IPV4_RANGES.some(([base, prefix]) => isIpv4InRange(address, base, prefix));
  }
  if (version !== 6) return true;

  const value = parseIpv6(address);
  if (value == null) return true;
  if (isIpv6InRange(value, '::ffff:0:0', 96)) {
    const mapped = Number(value & 0xffffffffn);
    const ipv4 = [24, 16, 8, 0].map((shift) => (mapped >>> shift) & 255).join('.');
    return isBlockedIpAddress(ipv4);
  }

  return [
    ['::', 128],
    ['::1', 128],
    ['100::', 64],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
    ['2001:2::', 48],
    ['2001:db8::', 32]
  ].some(([base, prefix]) => isIpv6InRange(value, base, prefix));
}

async function assertSafePublicUrl(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported website protocol');
  if (url.username || url.password) throw new Error('Website URL credentials are not allowed');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Website port is not allowed');

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Private website hostname is not allowed');
  }

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) throw new Error('Private or reserved website address is not allowed');
    return;
  }
  if (!hostname.includes('.')) throw new Error('Single-label website hostname is not allowed');

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedIpAddress(address))) {
    throw new Error('Website hostname resolves to a private or reserved address');
  }
}

function cleanEmail(email) {
  return email
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^\\u00(?:3c|3e)/i, '')
    .replace(/^["'<(\[]+/, '')
    .replace(/[),.;:'"`>\]]+$/, '')
    .toLowerCase();
}

function isLikelyBusinessEmail(email, hostname, { allowPublicProvider = false } = {}) {
  if (!email.includes('@')) return false;
  if (email.endsWith('@example.com') || email.endsWith('@domain.com')) return false;
  const domain = email.split('@')[1] || '';
  const localPart = email.split('@')[0] || '';
  if (allowPublicProvider && PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase())) {
    return /^[a-z0-9][a-z0-9._%+-]{1,80}$/i.test(localPart);
  }
  const normalizedHostname = hostname.toLowerCase().replace(/^www\./, '');
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  return normalizedDomain === normalizedHostname
    || normalizedHostname.endsWith(`.${normalizedDomain}`)
    || normalizedDomain.endsWith(`.${normalizedHostname}`);
}

function addEmails(target, emails, hostname, options) {
  for (const match of emails.map(cleanEmail)) {
    if (isLikelyBusinessEmail(match, hostname, options)) target.add(match);
  }
}

export function extractEmailsFromText(text, hostname, options) {
  const found = new Set();
  const normalizedText = String(text || '')
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0040/gi, '@');
  addEmails(found, normalizedText.match(EMAIL_PATTERN) || [], hostname, options);
  return Array.from(found);
}

export function extractMailtoEmails(html, hostname) {
  const found = new Set();
  for (const match of html.matchAll(MAILTO_PATTERN)) {
    try {
      addEmails(found, [decodeURIComponent(match[1])], hostname, { allowPublicProvider: true });
    } catch {
      continue;
    }
  }
  return Array.from(found);
}

function decodeCloudflareEmail(encoded) {
  const hex = String(encoded || '').trim();
  if (!/^[a-f0-9]{6,}$/i.test(hex) || hex.length % 2 !== 0) return '';
  const key = parseInt(hex.slice(0, 2), 16);
  let email = '';
  for (let index = 2; index < hex.length; index += 2) {
    email += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16) ^ key);
  }
  return email;
}

export function extractCloudflareProtectedEmails(html, hostname) {
  const found = new Set();
  for (const match of String(html || '').matchAll(CLOUDFLARE_EMAIL_PATTERN)) {
    addEmails(found, [decodeCloudflareEmail(match[1])], hostname, { allowPublicProvider: true });
  }
  return Array.from(found);
}

function collectJsonEmailValues(value, emails = []) {
  if (!value) return emails;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonEmailValues(item, emails);
    return emails;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key.toLowerCase() === 'email' && typeof item === 'string') {
        emails.push(item);
      } else {
        collectJsonEmailValues(item, emails);
      }
    }
  }
  return emails;
}

export function extractJsonLdEmails(html, hostname) {
  const found = new Set();
  for (const match of html.matchAll(JSON_LD_PATTERN)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      addEmails(found, collectJsonEmailValues(parsed), hostname, { allowPublicProvider: true });
    } catch {
      continue;
    }
  }
  return Array.from(found);
}

export function discoverContactLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = new Set();

  for (const match of html.matchAll(LINK_PATTERN)) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

    let url;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }

    if (url.hostname !== base.hostname || BLOCKED_EXTENSIONS.test(url.pathname)) continue;

    const haystack = `${url.pathname} ${stripTags(match[2])}`.toLowerCase();
    if (CONTACT_LINK_HINTS.some((hint) => haystack.includes(hint.toLowerCase()))) {
      links.add(`${url.pathname}${url.search}` || '/');
    }
  }

  return Array.from(links);
}

export function extractWhatsAppContactsFromHtml(html, baseUrl = 'https://example.com') {
  const contacts = new Map();
  const addContact = (candidate, label = '') => {
    const contact = parseWhatsAppContactUrl(candidate, baseUrl);
    if (!contact) return;
    const key = contact.phone || contact.url;
    if (!contacts.has(key)) {
      contacts.set(key, {
        ...contact,
        label: stripTags(label || '').slice(0, 120)
      });
    }
  };

  for (const match of String(html || '').matchAll(LINK_PATTERN)) {
    addContact(match[1], match[2]);
  }
  for (const match of String(html || '').matchAll(WHATSAPP_TEXT_URL_PATTERN)) {
    addContact(match[0]);
  }

  return Array.from(contacts.values());
}

function isContactLikePath(path) {
  const normalizedPath = String(path || '/').toLowerCase();
  return normalizedPath !== '/' && CONTACT_LINK_HINTS.some((hint) => normalizedPath.includes(hint.toLowerCase()));
}

function hasContactForm(html) {
  const text = String(html || '').toLowerCase();
  return /<form\b/i.test(text) && /(contact|enquiry|inquiry|message|support|quote|callback|联系|聯絡|お問い合わせ)/i.test(text);
}

function isLikelyCloudflareBlocked(response, html = '') {
  const server = response.headers.get('server') || '';
  const cfRay = response.headers.get('cf-ray') || '';
  const text = String(html || '').slice(0, 50000).toLowerCase();
  return Boolean(cfRay)
    || server.toLowerCase().includes('cloudflare')
    || text.includes('cf-browser-verification')
    || text.includes('cloudflare ray id')
    || text.includes('checking your browser')
    || text.includes('attention required! | cloudflare');
}

export function extractEmailsFromHtml(html, hostname, options) {
  return Array.from(new Set([
    ...extractEmailsFromText(html, hostname, options),
    ...extractMailtoEmails(html, hostname),
    ...extractCloudflareProtectedEmails(html, hostname),
    ...extractJsonLdEmails(html, hostname)
  ]));
}

function addEmailSources(sourceMap, emails, sourceUrl) {
  for (const email of emails) {
    const normalizedEmail = cleanEmail(email);
    if (!normalizedEmail) continue;
    const existing = sourceMap.get(normalizedEmail) || [];
    if (!existing.some((item) => item.url === sourceUrl)) {
      existing.push({ url: sourceUrl, foundAt: new Date().toISOString() });
    }
    sourceMap.set(normalizedEmail, existing);
  }
}

async function readLimitedText(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    return { ok: false, html: '', reason: discoveryReason('too_large') };
  }
  if (!response.body) return { ok: false, html: '', reason: discoveryReason('website_unreachable') };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      return { ok: false, html: '', reason: discoveryReason('too_large') };
    }
    text += decoder.decode(value, { stream: true });
  }
  return { ok: true, html: text + decoder.decode() };
}

async function fetchHtml(url, signal) {
  const result = await fetchHtmlDetails(url, signal);
  return result.ok ? result.html : '';
}

export async function fetchHtmlDetails(url, signal) {
  let currentUrl = new URL(url);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    try {
      await assertSafePublicUrl(currentUrl);
    } catch (error) {
      return {
        ok: false,
        url: currentUrl.href,
        reason: discoveryReason('unsafe_url', { detail: error instanceof Error ? error.message : '' })
      };
    }
    const response = await fetch(currentUrl, {
      signal,
      redirect: 'manual',
      headers: DISCOVERY_HEADERS
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectCount === MAX_REDIRECTS) {
        return {
          ok: false,
          url: currentUrl.href,
          status: response.status,
          reason: discoveryReason('website_unreachable', { detail: 'Too many redirects' })
        };
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const blockedText = await response.text().catch(() => '');
      return {
        ok: false,
        url: currentUrl.href,
        status: response.status,
        reason: isLikelyCloudflareBlocked(response, blockedText)
          ? discoveryReason('cloudflare_blocked', { status: response.status })
          : discoveryReason('http_error', { status: response.status })
      };
    }
    if (!contentType.toLowerCase().includes('text/html')) {
      return {
        ok: false,
        url: currentUrl.href,
        status: response.status,
        reason: discoveryReason('non_html', { contentType })
      };
    }
    const limited = await readLimitedText(response);
    if (!limited.ok) return { ...limited, url: currentUrl.href, status: response.status };
    if (isLikelyCloudflareBlocked(response, limited.html)) {
      return {
        ok: false,
        html: limited.html,
        url: currentUrl.href,
        status: response.status,
        reason: discoveryReason('cloudflare_blocked', { status: response.status })
      };
    }
    return { ok: true, html: limited.html, url: currentUrl.href, status: response.status };
  }
  return { ok: false, url: currentUrl.href, reason: discoveryReason('website_unreachable') };
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

async function fetchHtmlDetailsWithTimeout(url, timeoutMs) {
  const attempts = [timeoutMs, Math.max(RETRY_DISCOVERY_TIMEOUT_MS, timeoutMs)];
  let lastError = null;
  for (const attemptTimeout of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeout);
    try {
      return await fetchHtmlDetails(url, controller.signal);
    } catch (error) {
      lastError = error;
      if (!isAbortError(error)) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || Object.assign(new Error('aborted'), { name: 'AbortError' });
}

function buildEmailDiscoveryResult({
  emails,
  sourceMap,
  whatsappContacts = [],
  status,
  reason,
  pagesScanned,
  pagesAttempted,
  depth,
  contactFormFound,
  checkedUrls
}) {
  const normalizedEmails = Array.from(emails || []);
  return {
    emails: normalizedEmails,
    emailSources: normalizedEmails.flatMap((email) => (sourceMap.get(email) || []).map((source) => ({ email, ...source }))),
    whatsappContacts,
    status,
    reason,
    pagesScanned,
    pagesAttempted,
    depth,
    contactFormFound,
    checkedUrls
  };
}

export async function discoverEmailDetails(website, { timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS, maxDepth = 1, maxPages = MAX_PAGES } = {}) {
  const depth = normalizeDiscoveryDepth(maxDepth);
  if (!website) {
    return buildEmailDiscoveryResult({
      emails: [],
      sourceMap: new Map(),
      status: 'empty',
      reason: discoveryReason('missing_website'),
      pagesScanned: 0,
      pagesAttempted: 0,
      depth,
      contactFormFound: false,
      checkedUrls: []
    });
  }
  if (BLOCKED_EXTENSIONS.test(website)) {
    return buildEmailDiscoveryResult({
      emails: [],
      sourceMap: new Map(),
      status: 'empty',
      reason: discoveryReason('blocked_extension'),
      pagesScanned: 0,
      pagesAttempted: 0,
      depth,
      contactFormFound: false,
      checkedUrls: []
    });
  }
  let base;
  try {
    base = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return buildEmailDiscoveryResult({
      emails: [],
      sourceMap: new Map(),
      status: 'failed',
      reason: discoveryReason('invalid_url'),
      pagesScanned: 0,
      pagesAttempted: 0,
      depth,
      contactFormFound: false,
      checkedUrls: []
    });
  }

  const found = new Set();
  const whatsappContacts = new Map();
  const sourceMap = new Map();
  const visited = new Set();
  const queued = new Set();
  const queue = [];
  const pageLimit = Math.max(1, Math.min(MAX_PAGES, Number(maxPages) || MAX_PAGES));
  const checkedUrls = [];
  let contactFormFound = false;
  let lastReason = null;
  let pagesScanned = 0;
  let pagesAttempted = 0;
  const enqueue = (path, linkDepth) => {
    if (linkDepth > depth) return;
    const key = String(path || '/');
    if (queued.has(key) || visited.has(key) || BLOCKED_EXTENSIONS.test(key)) return;
    queued.add(key);
    queue.push({ path: key, depth: linkDepth });
  };
  enqueue('/', 0);
  if (depth >= 1) {
    for (const path of CANDIDATE_PATHS.filter((item) => item !== '/')) enqueue(path, 1);
  }
  try {
    while (queue.length && visited.size < pageLimit) {
      const { path, depth: currentDepth } = queue.shift();
      const url = new URL(path, base);
      const visitKey = `${url.pathname}${url.search}`;
      if (visited.has(visitKey) || BLOCKED_EXTENSIONS.test(url.pathname)) continue;
      visited.add(visitKey);
      pagesAttempted += 1;
      checkedUrls.push(url.href);

      let fetched;
      try {
        fetched = await fetchHtmlDetailsWithTimeout(url, timeoutMs);
      } catch (error) {
        lastReason = isAbortError(error)
          ? discoveryReason('timeout', { url: url.href })
          : discoveryReason('website_unreachable', { detail: error instanceof Error ? error.message : '', url: url.href });
        continue;
      }
      if (!fetched.ok) {
        lastReason = fetched.reason || lastReason;
        continue;
      }
      const html = fetched.html;
      pagesScanned += 1;
      if (hasContactForm(html)) contactFormFound = true;

      const pageEmails = extractEmailsFromHtml(html, base.hostname, { allowPublicProvider: isContactLikePath(visitKey) });
      addEmailSources(sourceMap, pageEmails, url.href);
      for (const email of pageEmails) {
        found.add(email);
      }
      for (const contact of extractWhatsAppContactsFromHtml(html, url.href)) {
        const key = contact.phone || contact.url;
        if (!whatsappContacts.has(key)) {
          whatsappContacts.set(key, {
            ...contact,
            source: 'website',
            foundAt: new Date().toISOString(),
            pageUrl: url.href
          });
        }
      }
      if (currentDepth < depth) {
        for (const link of discoverContactLinks(html, base)) {
          if (!visited.has(link) && queue.length < pageLimit * 2) enqueue(link, currentDepth + 1);
        }
      }

      if (found.size >= MAX_EMAILS_PER_SITE) break;
    }
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? discoveryReason('timeout')
      : discoveryReason('website_unreachable', { detail: error instanceof Error ? error.message : '' });
    return buildEmailDiscoveryResult({
      emails: found,
      sourceMap,
      whatsappContacts: Array.from(whatsappContacts.values()),
      status: found.size || whatsappContacts.size ? 'found' : 'failed',
      reason: found.size || whatsappContacts.size ? null : reason,
      pagesScanned,
      pagesAttempted,
      depth,
      contactFormFound,
      checkedUrls
    });
  }

  const reason = found.size
    ? null
    : (contactFormFound
        ? discoveryReason('contact_form_only')
        : (pagesScanned ? discoveryReason('no_email_found') : lastReason || discoveryReason('website_unreachable')));
  return buildEmailDiscoveryResult({
    emails: found,
    sourceMap,
    whatsappContacts: Array.from(whatsappContacts.values()),
    status: found.size || whatsappContacts.size ? 'found' : (pagesScanned || contactFormFound ? 'empty' : 'failed'),
    reason,
    pagesScanned,
    pagesAttempted,
    depth,
    contactFormFound,
    checkedUrls
  });
}

export async function discoverEmails(website, options = {}) {
  const details = await discoverEmailDetails(website, options);
  return details.emails;
}
