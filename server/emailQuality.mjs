import { resolveMx } from 'node:dns/promises';

const publicEmailDomains = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me', 'zoho.com', 'zohomail.com', 'mail.com',
  'gmx.com', 'gmx.net', 'web.de', 'aol.com', 'fastmail.com', 'hey.com', 'tutanota.com',
  'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', 'foxmail.com', '163.com', '126.com',
  'sina.com', 'sohu.com', 'naver.com', 'daum.net', 'kakao.com', 'rediffmail.com',
  'orange.fr', 'free.fr', 'libero.it', 'seznam.cz', 'wp.pl', 'onet.pl', 'ukr.net'
]);

const roleLocalParts = new Set([
  'admin', 'administrator', 'billing', 'bookings', 'contact', 'customerservice', 'enquiry',
  'enquiries', 'hello', 'help', 'info', 'mail', 'office', 'orders', 'reception',
  'sales', 'service', 'support', 'team'
]);

const disposableDomains = new Set([
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.com', 'temp-mail.org',
  'throwawaymail.com', 'yopmail.com'
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

function getDomainFromUrl(value) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function getEmailParts(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const [localPart = '', domain = ''] = normalized.split('@');
  return { normalized, localPart, domain };
}

function getStatus(score, mxValid) {
  if (!mxValid || score < 40) return 'invalid';
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  return 'low';
}

export async function assessEmailQuality(email, { website = '', resolver = resolveMx } = {}) {
  const { normalized, localPart, domain } = getEmailParts(email);
  const reasons = [];
  let score = 100;

  if (!emailPattern.test(normalized)) {
    return { email: normalized, status: 'invalid', score: 0, reasons: ['格式无效'], checkedAt: new Date().toISOString() };
  }

  if (disposableDomains.has(domain)) {
    score -= 70;
    reasons.push('临时邮箱域名');
  }

  if (roleLocalParts.has(localPart) || /^(info|sales|support|contact|hello)[._-]/i.test(localPart)) {
    score -= 12;
    reasons.push('角色邮箱');
  }

  if (publicEmailDomains.has(domain)) {
    score -= 10;
    reasons.push('公共邮箱');
  }

  const websiteDomain = getDomainFromUrl(website);
  if (websiteDomain && domain !== websiteDomain && !websiteDomain.endsWith(`.${domain}`) && !domain.endsWith(`.${websiteDomain}`)) {
    score -= publicEmailDomains.has(domain) ? 5 : 18;
    reasons.push('邮箱域名与官网不一致');
  } else if (websiteDomain) {
    reasons.push('邮箱域名匹配官网');
  }

  let mxValid = true;
  try {
    const records = await resolver(domain);
    mxValid = Array.isArray(records) && records.length > 0;
    if (mxValid) reasons.push('MX 记录有效');
    else reasons.push('缺少 MX 记录');
  } catch {
    mxValid = false;
    reasons.push('MX 记录不可用');
  }

  if (!mxValid) score -= 55;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    email: normalized,
    status: getStatus(score, mxValid),
    score,
    reasons,
    checkedAt: new Date().toISOString()
  };
}

export async function assessLeadEmails(emails, { website = '', resolver = resolveMx } = {}) {
  const uniqueEmails = Array.from(new Set((emails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)));
  return Promise.all(uniqueEmails.map((email) => assessEmailQuality(email, { website, resolver })));
}
