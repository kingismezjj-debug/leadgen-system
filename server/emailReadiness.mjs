import { isIP } from 'node:net';
import { getMailerMode } from './config.mjs';
import { isBlockedIpAddress } from './emailDiscovery.mjs';

export function isPublicHttpsUnsubscribeUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false;
  if (hostname === 'example.com' || hostname.endsWith('.example.com') || hostname.endsWith('.example')) return false;
  if (isIP(hostname) && isBlockedIpAddress(hostname)) return false;
  return hostname.includes('.') || isIP(hostname) > 0;
}

export function getEmailReadiness(settings) {
  const mode = getMailerMode(settings);
  const issues = [];

  if (mode === 'dry-run') issues.push('尚未配置可用的 SMTP 或 Jarvis 邮件服务。');
  if (mode === 'smtp') {
    if (!settings.smtp?.host) issues.push('缺少 SMTP Host。');
    if (!settings.smtp?.from) issues.push('缺少 SMTP 发件地址。');
    if (settings.smtp?.user && !settings.smtp?.pass) issues.push('SMTP 用户已配置，但缺少密码。');
  }
  if (!isPublicHttpsUnsubscribeUrl(settings.unsubscribeUrl)) {
    issues.push('退订地址必须是收件人可访问的公网 HTTPS 地址，不能使用 example.com、localhost 或私网 IP。');
  }

  return {
    mode,
    readyForRealSend: mode !== 'dry-run' && issues.length === 0,
    issues
  };
}
