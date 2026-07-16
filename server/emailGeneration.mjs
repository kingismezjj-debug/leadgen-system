import { emailHtmlToText, sanitizeEmailHtml } from './emailHtml.mjs';

const defaultOpenAiBaseUrl = 'https://api.openai.com/v1';
const maxPromptLength = 1200;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeText(value, maxLength = 1200) {
  return String(value || '').trim().slice(0, maxLength);
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return '';
}

function normalizeDrafts(payload) {
  const drafts = Array.isArray(payload?.drafts) ? payload.drafts : [];
  return drafts.map((draft, index) => {
    const htmlBody = sanitizeEmailHtml(draft.htmlBody || '');
    const body = normalizeText(draft.body || emailHtmlToText(htmlBody), 5000);
    return {
      id: `draft-${index + 1}`,
      angle: normalizeText(draft.angle || `版本 ${index + 1}`, 120),
      subject: normalizeText(draft.subject, 180),
      body,
      htmlBody
    };
  }).filter((draft) => draft.subject && (draft.body || draft.htmlBody)).slice(0, 5);
}

export async function generateEmailDrafts({
  keywords,
  country = '',
  region = '',
  audience = '',
  apiKey = '',
  baseUrl = defaultOpenAiBaseUrl,
  model = 'gpt-4.1-mini',
  fetchImpl = fetch
}) {
  const prompt = normalizeText(keywords, maxPromptLength);
  if (!prompt) throw badRequest('keywords 是必填项。');
  if (!apiKey) throw badRequest('缺少 OpenAI API Key，请先在“AI关键词分析”设置中配置。');

  const normalizedBaseUrl = String(baseUrl || defaultOpenAiBaseUrl).trim().replace(/\/+$/, '');
  const response = await fetchImpl(`${normalizedBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: [
              'You write concise B2B cold outreach email drafts.',
              'Return only compact JSON matching the schema.',
              'Generate 3 distinct versions.',
              'Use {{name}} as the recipient business placeholder when useful.',
              'Do not include unsubscribe text; the system appends compliance footer separately.',
              'Keep the tone professional, specific, and not spammy.'
            ].join('\n')
          }]
        },
        {
          role: 'user',
          content: [{
            type: 'input_text',
            text: JSON.stringify({
              keywords: prompt,
              country: normalizeText(country, 120),
              region: normalizeText(region, 160),
              audience: normalizeText(audience, 300)
            })
          }]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'email_drafts',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              drafts: {
                type: 'array',
                minItems: 3,
                maxItems: 5,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    angle: { type: 'string' },
                    subject: { type: 'string' },
                    body: { type: 'string' },
                    htmlBody: { type: 'string' }
                  },
                  required: ['angle', 'subject', 'body', 'htmlBody']
                }
              }
            },
            required: ['drafts']
          }
        }
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'AI 邮件生成请求失败。';
    throw Object.assign(new Error(message), { status: response.status >= 400 && response.status < 500 ? 400 : 502 });
  }

  const outputText = extractOutputText(payload);
  if (!outputText) throw Object.assign(new Error('AI 邮件生成返回内容为空。'), { status: 502 });
  const drafts = normalizeDrafts(JSON.parse(outputText));
  if (!drafts.length) throw Object.assign(new Error('AI 邮件生成没有返回可用版本。'), { status: 502 });
  return drafts;
}
