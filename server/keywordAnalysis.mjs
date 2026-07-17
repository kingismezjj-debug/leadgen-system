import { normalizePlaceType } from './places.mjs';

const maxKeywordInputLength = 1200;
const defaultOpenAiBaseUrl = 'https://api.openai.com/v1';

const supportedPlaceTypes = [
  'cell_phone_store',
  'phone_repair_shop',
  'electronics_store',
  'computer_repair_service',
  'car_dealer',
  'car_repair',
  'dentist',
  'plumber',
  'roofing_contractor',
  'electrician',
  'beauty_salon',
  'hair_care',
  'real_estate_agency',
  'lawyer',
  'doctor',
  'restaurant',
  'gym',
  'veterinary_care',
  'insurance_agency'
];

const fallbackProfiles = [
  {
    pattern: /\b(?:lcd|screen|phone|mobile|iphone|samsung|repair|parts)\b/i,
    strategy: {
      customerProfile: '手机维修店、手机配件零售商和电子维修服务商',
      productIntent: '采购手机 LCD 屏幕、屏幕总成或维修备件',
      recommendedMode: 'smart',
      primaryPlaceType: 'cell_phone_store',
      placeTypes: ['cell_phone_store', 'electronics_store', 'computer_repair_service'],
      searchKeywords: [
        'phone repair store',
        'cell phone repair',
        'mobile phone repair',
        'iPhone repair',
        'Samsung repair',
        'phone accessories store',
        'mobile phone parts'
      ],
      negativeKeywords: ['LCD TV', 'screen printing', 'digital signage', 'TV repair'],
      searchBatches: [
        { label: '手机维修店', keyword: 'phone repair store', placeType: 'cell_phone_store', mode: 'smart' },
        { label: '手机配件店', keyword: 'phone accessories store', placeType: 'cell_phone_store', mode: 'smart' },
        { label: '电子维修', keyword: 'electronics repair', placeType: 'electronics_store', mode: 'smart' }
      ],
      notes: ['LCD 本身不是稳定的地图商户类别，应该搜索会采购手机屏幕备件的维修和配件商户。']
    }
  }
];
const supportedPlaceTypeSet = new Set(supportedPlaceTypes);

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeKeywords(value) {
  const text = String(value || '').trim();
  if (!text) throw badRequest('keywords 是必填项。');
  if (text.length > maxKeywordInputLength) throw badRequest('keywords 超出长度限制。');
  return Array.from(new Set(text.split(/[,;\n，；]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 20);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(/[,;\n，；]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeStrategy(strategy) {
  const normalizeSupportedPlaceType = (value) => {
    const normalized = normalizePlaceType(value);
    return supportedPlaceTypeSet.has(normalized) ? normalized : '';
  };
  const placeTypes = Array.from(new Set(normalizeList(strategy.placeTypes)
    .map(normalizeSupportedPlaceType)
    .filter(Boolean)))
    .slice(0, 6);
  const primaryPlaceType = normalizeSupportedPlaceType(strategy.primaryPlaceType) || placeTypes[0] || '';
  const searchKeywords = Array.from(new Set(normalizeList(strategy.searchKeywords)
    .map((item) => String(item || '').trim())
    .filter(Boolean)))
    .slice(0, 12);
  const searchBatches = normalizeList(strategy.searchBatches).map((batch, index) => ({
    label: String(batch.label || searchKeywords[index] || `策略 ${index + 1}`).trim().slice(0, 80),
    keyword: String(batch.keyword || searchKeywords[index] || '').trim().slice(0, 120),
    placeType: normalizeSupportedPlaceType(batch.placeType) || primaryPlaceType,
    mode: ['keyword', 'type', 'smart'].includes(batch.mode) ? batch.mode : 'smart'
  })).filter((batch) => batch.keyword).slice(0, 8);

  return {
    customerProfile: String(strategy.customerProfile || '').trim().slice(0, 500),
    productIntent: String(strategy.productIntent || '').trim().slice(0, 500),
    recommendedMode: ['keyword', 'type', 'smart'].includes(strategy.recommendedMode) ? strategy.recommendedMode : 'smart',
    primaryPlaceType,
    placeTypes,
    searchKeywords,
    negativeKeywords: Array.from(new Set(normalizeList(strategy.negativeKeywords)
      .map((item) => String(item || '').trim())
      .filter(Boolean))).slice(0, 12),
    searchBatches,
    notes: normalizeList(strategy.notes).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
  };
}

function fallbackKeywordStrategy(keywords) {
  const text = keywords.join(', ');
  const matched = fallbackProfiles.find((profile) => profile.pattern.test(text));
  if (matched) return normalizeStrategy(matched.strategy);
  return normalizeStrategy({
    customerProfile: '与输入关键词相关的本地商户',
    productIntent: '根据输入关键词寻找可能有采购需求的商户',
    recommendedMode: 'smart',
    primaryPlaceType: '',
    placeTypes: [],
    searchKeywords: keywords,
    negativeKeywords: [],
    searchBatches: keywords.map((keyword) => ({ label: keyword, keyword, placeType: '', mode: 'smart' })),
    notes: ['未配置 AI key 时使用基础策略。']
  });
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
    throw new Error('AI keyword analysis returned invalid JSON.');
  }
}

export async function analyzeKeywords({
  keywords,
  country = '',
  region = '',
  apiKey = '',
  baseUrl = defaultOpenAiBaseUrl,
  model = 'gpt-4.1-mini',
  fetchImpl = fetch
}) {
  const keywordList = normalizeKeywords(keywords);
  if (!apiKey) {
    return { ...fallbackKeywordStrategy(keywordList), source: 'fallback' };
  }

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
            'You generate lead-search strategy for Google Maps/Places.',
            'Do not execute searches. Return only compact JSON, without markdown fences.',
            `Use only these Google place types when possible: ${supportedPlaceTypes.join(', ')}.`,
            'If the input is a product, infer likely buyers and avoid literal product-only keywords.',
            'Return an object with exactly these keys: customerProfile, productIntent, recommendedMode, primaryPlaceType, placeTypes, searchKeywords, negativeKeywords, searchBatches, notes.',
            'recommendedMode must be one of keyword, type, smart.',
            'Each searchBatches item must contain label, keyword, placeType, mode.'
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify({ keywords: keywordList, country, region })
        }
      ],
      temperature: 0.2
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'AI 关键词分析请求失败。';
    throw Object.assign(new Error(message), { status: response.status >= 400 && response.status < 500 ? 400 : 502 });
  }

  const outputText = extractOutputText(payload);
  if (!outputText) throw Object.assign(new Error('AI 关键词分析返回内容为空。'), { status: 502 });
  return { ...normalizeStrategy(parseJsonObject(outputText)), source: 'openai' };
}
