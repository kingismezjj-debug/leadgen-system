import { normalizeEmail } from './store.mjs';
import { emailHtmlToText, sanitizeEmailHtml } from './emailHtml.mjs';

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function isValidEmail(email) {
  return email.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)
    && !/[\r\n]/.test(email);
}

export function validateEmail(value, fieldName = 'email') {
  if (typeof value !== 'string') throw badRequest(`${fieldName} 必须是字符串。`);
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) throw badRequest(`${fieldName} 格式无效。`);
  return email;
}

export function validateLeadPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('请求体必须是对象。');
  }

  const patch = {};
  if ('emails' in input) {
    if (!Array.isArray(input.emails) || input.emails.length > 20) {
      throw badRequest('emails 必须是最多包含 20 项的数组。');
    }
    patch.emails = Array.from(new Set(input.emails.map((email, index) => validateEmail(email, `emails[${index}]`))));
  }

  if ('status' in input) {
    if (typeof input.status !== 'string' || !/^[a-z0-9_-]{1,50}$/i.test(input.status)) {
      throw badRequest('status 必须是 1 到 50 个字母、数字、下划线或连字符。');
    }
    patch.status = input.status;
  }

  if ('notes' in input) {
    if (typeof input.notes !== 'string' || input.notes.length > 10_000) {
      throw badRequest('notes 必须是最多 10000 个字符的字符串。');
    }
    patch.notes = input.notes;
  }

  if ('tags' in input) {
    if (!Array.isArray(input.tags) || input.tags.length > 50) {
      throw badRequest('tags 必须是最多包含 50 项的数组。');
    }
    patch.tags = Array.from(new Set(input.tags.map((tag, index) => {
      if (typeof tag !== 'string' || !tag.trim() || tag.trim().length > 100) {
        throw badRequest(`tags[${index}] 必须是 1 到 100 个字符的字符串。`);
      }
      return tag.trim();
    })));
  }

  if (!Object.keys(patch).length) throw badRequest('没有可更新的字段。');
  return patch;
}

export function validateCampaignInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('请求体必须是对象。');
  }

  if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 500) {
    throw badRequest('subject 必须是 1 到 500 个字符的字符串。');
  }
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (typeof input.body !== 'string' || input.body.length > 100_000) {
    throw badRequest('body 必须是最多 100000 个字符的字符串。');
  }
  if (input.htmlBody != null && (typeof input.htmlBody !== 'string' || input.htmlBody.length > 6_000_000)) {
    throw badRequest('htmlBody 必须是最多 6000000 个字符的字符串。');
  }
  const htmlBody = sanitizeEmailHtml(input.htmlBody || '');
  const htmlText = emailHtmlToText(htmlBody);
  if (!body && !htmlText && !/<img\b/i.test(htmlBody)) {
    throw badRequest('邮件正文不能为空。');
  }
  if (input.dryRun != null && typeof input.dryRun !== 'boolean') {
    throw badRequest('dryRun 必须是布尔值。');
  }

  const leadIds = input.leadIds ?? [];
  if (!Array.isArray(leadIds) || leadIds.length > 1000 || leadIds.some((id) => typeof id !== 'string' || !id || id.length > 100)) {
    throw badRequest('leadIds 必须是最多包含 1000 个有效 ID 的数组。');
  }

  const recipients = input.recipients ?? [];
  if (!Array.isArray(recipients) || recipients.length > 100) {
    throw badRequest('recipients 必须是最多包含 100 个邮箱的数组。');
  }
  const normalizedRecipients = Array.from(new Set(
    recipients.map((email, index) => validateEmail(email, `recipients[${index}]`))
  ));

  return {
    subject: input.subject,
    body: body || htmlText || 'HTML email',
    htmlBody,
    dryRun: input.dryRun ?? true,
    leadIds: Array.from(new Set(leadIds)),
    recipients: normalizedRecipients
  };
}
