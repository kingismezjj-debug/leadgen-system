import { emailHtmlToText, sanitizeEmailHtml } from './emailHtml.mjs';

const targetLanguagePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const templateTokenPattern = /{{\s*[\w.-]+\s*}}/g;
const maxSubjectLength = 300;
const maxBodyLength = 30_000;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function validateTargetLanguage(value) {
  const targetLanguage = String(value || '').trim();
  if (!targetLanguage || !targetLanguagePattern.test(targetLanguage)) {
    throw badRequest('targetLanguage 格式无效。');
  }
  return targetLanguage;
}

function trimLimited(value, maxLength, fieldName) {
  const text = String(value || '').trim();
  if (text.length > maxLength) {
    throw badRequest(`${fieldName} 超出长度限制。`);
  }
  return text;
}

function readGoogleTranslations(payload, expectedLength) {
  const translations = payload?.data?.translations;
  if (!Array.isArray(translations) || translations.length < expectedLength) {
    throw Object.assign(new Error('Google Translate 返回内容不完整。'), { status: 502 });
  }
  return translations.map((item) => String(item?.translatedText || ''));
}

function protectTemplateTokens(value) {
  const tokens = [];
  const text = String(value || '').replace(templateTokenPattern, (token) => {
    const placeholder = `__LEADGEN_TEMPLATE_${tokens.length}__`;
    tokens.push([placeholder, token]);
    return placeholder;
  });
  return {
    text,
    restore(translated) {
      return tokens.reduce((result, [placeholder, token]) => result.replaceAll(placeholder, token), String(translated || ''));
    }
  };
}

export async function translateWithGoogle({
  values,
  targetLanguage,
  apiKey,
  format = 'text',
  fetchImpl = fetch
}) {
  if (!apiKey) {
    throw badRequest('缺少 GOOGLE_TRANSLATE_API_KEY，请先在 .env 中配置 Google Translate API key。');
  }

  const protectedValues = values.map(protectTemplateTokens);
  const q = protectedValues.map((value) => value.text);
  if (!q.some(Boolean)) return q;

  const response = await fetchImpl(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q,
      target: targetLanguage,
      format
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'Google Translate 请求失败。';
    throw Object.assign(new Error(message), { status: response.status >= 400 && response.status < 500 ? 400 : 502 });
  }

  return readGoogleTranslations(payload, q.length).map((translation, index) => protectedValues[index].restore(translation));
}

export async function translateEmailCampaign({
  subject,
  body,
  htmlBody,
  targetLanguage,
  apiKey,
  fetchImpl = fetch
}) {
  const target = validateTargetLanguage(targetLanguage);
  const sourceSubject = trimLimited(subject, maxSubjectLength, 'subject');
  const sourceBody = trimLimited(body, maxBodyLength, 'body');
  const sourceHtml = trimLimited(htmlBody, maxBodyLength, 'htmlBody');
  const sanitizedHtml = sourceHtml ? sanitizeEmailHtml(sourceHtml) : '';

  const [translatedSubject] = await translateWithGoogle({
    values: [sourceSubject],
    targetLanguage: target,
    apiKey,
    format: 'text',
    fetchImpl
  });

  if (sanitizedHtml) {
    const [translatedHtml] = await translateWithGoogle({
      values: [sanitizedHtml],
      targetLanguage: target,
      apiKey,
      format: 'html',
      fetchImpl
    });
    const cleanHtml = sanitizeEmailHtml(translatedHtml);
    return {
      targetLanguage: target,
      subject: translatedSubject || sourceSubject,
      body: emailHtmlToText(cleanHtml),
      htmlBody: cleanHtml
    };
  }

  const [translatedBody] = await translateWithGoogle({
    values: [sourceBody],
    targetLanguage: target,
    apiKey,
    format: 'text',
    fetchImpl
  });

  return {
    targetLanguage: target,
    subject: translatedSubject || sourceSubject,
    body: translatedBody || sourceBody,
    htmlBody: ''
  };
}
