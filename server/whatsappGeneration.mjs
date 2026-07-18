const defaultOpenAiBaseUrl = 'https://api.openai.com/v1';
const maxPromptLength = 1200;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeText(value, maxLength = 1200) {
  return String(value || '').trim().slice(0, maxLength);
}

function extractOutputText(payload) {
  const chatContent = payload.choices?.[0]?.message?.content;
  if (typeof chatContent === 'string') return chatContent;
  if (Array.isArray(chatContent)) {
    return chatContent.map((item) => item.text || '').join('').trim();
  }
  if (typeof payload.output_text === 'string') return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return '';
}

function parseJsonObject(text) {
  const normalized = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(normalized.slice(start, end + 1));
    throw new Error('AI WhatsApp generation returned invalid JSON.');
  }
}

function normalizeDrafts(payload) {
  const drafts = Array.isArray(payload?.drafts) ? payload.drafts : [];
  return drafts.map((draft, index) => ({
    id: `draft-${index + 1}`,
    angle: normalizeText(draft.angle || `版本 ${index + 1}`, 120),
    message: normalizeText(draft.message || draft.body || '', 800),
    followUp: normalizeText(draft.followUp || '', 300)
  })).filter((draft) => draft.message).slice(0, 5);
}

export async function generateWhatsAppDrafts({
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
  if (!apiKey) throw badRequest('缺少 OpenAI API Key，请先在 AI 设置中配置。');

  const normalizedBaseUrl = String(baseUrl || defaultOpenAiBaseUrl).trim().replace(/\/+$/, '');
  const response = await fetchImpl(`${normalizedBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: [
            'You write concise first-contact WhatsApp outreach messages for B2B leads.',
            'Return only compact JSON, without markdown fences.',
            'Return an object with one key named drafts.',
            'Generate 3 distinct versions.',
            'Each draft must contain angle, message, and followUp.',
            'Use {{name}} as the recipient placeholder when useful.',
            'Keep each message short, conversational, and not spammy.',
            'The message should introduce the offer and invite a reply.'
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify({
            keywords: prompt,
            country: normalizeText(country, 120),
            region: normalizeText(region, 160),
            audience: normalizeText(audience, 300)
          })
        }
      ],
      temperature: 0.4
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'AI WhatsApp 文案生成请求失败。';
    throw Object.assign(new Error(message), { status: response.status >= 400 && response.status < 500 ? 400 : 502 });
  }

  const outputText = extractOutputText(payload);
  if (!outputText) throw Object.assign(new Error('AI WhatsApp 文案生成返回内容为空。'), { status: 502 });
  const drafts = normalizeDrafts(parseJsonObject(outputText));
  if (!drafts.length) throw Object.assign(new Error('AI WhatsApp 文案生成没有返回可用版本。'), { status: 502 });
  return drafts;
}
