import nodemailer from 'nodemailer';
import { config, getMailerMode } from './config.mjs';
import { sanitizeEmailHtml } from './emailHtml.mjs';
import { getRuntimeSettings } from './settings.mjs';
import { ensureUnsubscribeToken, normalizeEmail } from './store.mjs';

function renderTemplate(template, lead) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return String(lead[key] ?? '');
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtmlTemplate(template, lead) {
  const rendered = String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return escapeHtml(lead[key] ?? '');
  });
  return sanitizeEmailHtml(rendered);
}

export function buildUnsubscribeUrl(settings, token) {
  const configured = String(settings.unsubscribeUrl || '').trim().replace(/\/+$/, '');
  const fallback = `http://${config.host}:${config.port}/unsubscribe`;
  const base = !configured || configured.includes('example.com') ? fallback : configured;
  return `${base}/${encodeURIComponent(token)}`;
}

function complianceFooter(lead) {
  const unsubscribeUrl = lead.unsubscribeUrl || '退订链接将在发送时自动生成';
  return `\n\n--\n如果你不希望再收到类似邮件，可以点击这里退订：${unsubscribeUrl}`;
}

function complianceFooterHtml(lead) {
  const unsubscribeUrl = lead.unsubscribeUrl || '';
  if (!unsubscribeUrl) {
    return '<hr><p>退订链接将在发送时自动生成。</p>';
  }
  const safeUrl = escapeHtml(unsubscribeUrl);
  return `<hr><p>如果你不希望再收到类似邮件，可以<a href="${safeUrl}">点击这里退订</a>。</p>`;
}

async function sendViaJarvis(message, settings) {
  const response = await fetch(settings.jarvisEmailEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.jarvisEmailToken ? { Authorization: `Bearer ${settings.jarvisEmailToken}` } : {})
    },
    body: JSON.stringify(message)
  });
  if (!response.ok) {
    throw new Error(`Jarvis 邮件接口失败：${response.status} ${await response.text()}`);
  }
  return { provider: 'jarvis', accepted: [message.to] };
}

function createSmtpTransport(settings) {
  return nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    auth: settings.smtp.user ? { user: settings.smtp.user, pass: settings.smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  });
}

export async function verifySmtpSettings(settings) {
  if (!settings.smtp?.host || !settings.smtp?.from) {
    throw Object.assign(new Error('请先配置 SMTP Host 和发件地址。'), { status: 400 });
  }
  const transporter = createSmtpTransport(settings);
  try {
    await transporter.verify();
    return { ok: true };
  } finally {
    transporter.close();
  }
}

async function sendViaSmtp(message, settings) {
  const transporter = createSmtpTransport(settings);
  try {
    const result = await transporter.sendMail({
      from: settings.smtp.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachDataUrls: true,
      headers: message.headers
    });
    return { provider: 'smtp', messageId: result.messageId, accepted: result.accepted };
  } finally {
    transporter.close();
  }
}

export function previewCampaign({ subject, body, htmlBody = '' }, lead) {
  const message = {
    to: (lead.emails || [])[0] || '',
    subject: renderTemplate(subject, lead),
    text: `${renderTemplate(body, lead)}${complianceFooter(lead)}`,
    ...(htmlBody ? { html: `${renderHtmlTemplate(htmlBody, lead)}${complianceFooterHtml(lead)}` } : {}),
    unsubscribeUrl: lead.unsubscribeUrl
  };

  if (lead.unsubscribeUrl) {
    message.headers = {
      'List-Unsubscribe': `<${lead.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    };
  }

  return message;
}

export async function sendCampaign({ subject, body, htmlBody = '', leads, suppressions = [], dryRun = false, onProgress = null }) {
  const suppressionSet = new Set(suppressions.map((item) => normalizeEmail(item.email || item)));
  const settings = await getRuntimeSettings();
  const mode = dryRun ? 'dry-run' : getMailerMode(settings);
  const results = [];

  for (const [index, lead] of leads.entries()) {
    const to = normalizeEmail(Array.isArray(lead.emails) ? lead.emails[0] : '');
    if (!to) {
      results.push({ leadId: lead.id, status: 'skipped', reason: 'missing-email' });
      if (typeof onProgress === 'function') {
        await onProgress({ completed: results.length, total: leads.length, lead, result: results[results.length - 1], index });
      }
      continue;
    }
    if (suppressionSet.has(to)) {
      results.push({ leadId: lead.id, to, status: 'skipped', reason: 'suppressed' });
      if (typeof onProgress === 'function') {
        await onProgress({ completed: results.length, total: leads.length, lead, result: results[results.length - 1], index });
      }
      continue;
    }

    const token = await ensureUnsubscribeToken(to);
    const unsubscribeUrl = buildUnsubscribeUrl(settings, token);
    const message = previewCampaign({ subject, body, htmlBody }, { ...lead, emails: [to], unsubscribeUrl });
    if (mode === 'dry-run') {
      results.push({ leadId: lead.id, to, status: 'dry-run', message });
      if (typeof onProgress === 'function') {
        await onProgress({ completed: results.length, total: leads.length, lead, result: results[results.length - 1], index });
      }
      continue;
    }

    try {
      const delivery = mode === 'jarvis' ? await sendViaJarvis(message, settings) : await sendViaSmtp(message, settings);
      results.push({ leadId: lead.id, to, status: 'sent', delivery });
    } catch (error) {
      results.push({ leadId: lead.id, to, status: 'failed', reason: error.message });
    }
    if (typeof onProgress === 'function') {
      await onProgress({ completed: results.length, total: leads.length, lead, result: results[results.length - 1], index });
    }
  }

  return { mode, results };
}

export { renderTemplate };
