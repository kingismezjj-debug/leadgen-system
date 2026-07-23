import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Download,
  Check,
  Eraser,
  Copy,
  Globe2,
  ImagePlus,
  Italic,
  Languages,
  Link,
  List,
  ListOrdered,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Redo2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Underline,
  Undo2,
  X
} from 'lucide-react';
import './styles.css';

type Lead = {
  id: string;
  name: string;
  companyType: string;
  phone: string;
  whatsappContacts?: Array<{ url: string; phone?: string; source?: string; foundAt?: string; pageUrl?: string; label?: string }>;
  whatsappVerified?: boolean;
  emails: string[];
  emailQuality?: Array<{
    email: string;
    status: 'high' | 'medium' | 'low' | 'invalid';
    score: number;
    reasons: string[];
    checkedAt: string;
  }>;
  emailSources?: Array<{ email: string; url: string; foundAt?: string }>;
  emailDiscoveryStatus?: 'found' | 'empty' | 'failed';
  emailDiscoveryAttempts?: number;
  emailDiscoveryError?: string;
  emailDiscoveryReason?: string;
  emailDiscoveryReasonCode?: string;
  emailDiscoveryPagesScanned?: number;
  emailDiscoveryPagesAttempted?: number;
  emailDiscoveryDepth?: number;
  emailDiscoveryContactFormOnly?: boolean;
  enrichmentStatus?: 'found' | 'empty' | 'failed';
  enrichmentCheckedAt?: string;
  enrichmentSteps?: Array<{ name: string; status: string; reason?: string; emailsFound?: number; socialCount?: number; directoryCount?: number; pagesScanned?: number }>;
  socialProfiles?: Array<{ source: string; url: string }>;
  directoryProfiles?: Array<{ source: string; url: string }>;
  domainInfo?: { domain?: string; mx?: string[]; ns?: string[] } | null;
  aiResearch?: { summary: string; checkedAt?: string } | null;
  website: string;
  address: string;
  googleMapsUrl: string;
  rating: number | null;
  reviewCount: number;
  status: string;
  source: string;
  searchSources?: string[];
  sourceKeyword?: string;
  sourceKeywords?: string[];
  matchStrategy?: string;
  matchStrategies?: string[];
  createdAt?: string;
  updatedAt?: string;
};

type Health = {
  ok: boolean;
  googleConfigured: boolean;
  mailerMode: 'dry-run' | 'smtp' | 'jarvis';
  authRequired?: boolean;
  emailReady?: boolean;
  emailIssues?: string[];
};

type StorePayload = {
  leads: Lead[];
  searches: Array<{ id: string; keyword: string; area: string; created: number; updated: number; createdAt: string }>;
  campaigns: Array<{ id: string; subject: string; dryRun: boolean; mode: string; leadCount: number; createdAt: string }>;
  tasks: Array<{
    id: string;
    kind: string;
    title: string;
    status: 'queued' | 'running' | 'done' | 'failed';
    progress: number;
    detail?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    context?: Record<string, unknown>;
  }>;
  sendLog: Array<{ id: string; leadId?: string; status: string; to?: string; reason?: string; at: string }>;
};

type SettingsView = 'workspace' | 'google' | 'translate' | 'ai' | 'email' | 'members' | 'tasks' | 'delivery' | 'legal';
type MembershipUser = {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'manager' | 'member';
  plan: 'free' | 'starter' | 'pro' | 'business';
  status: 'active' | 'disabled';
  createdAt?: string;
  updatedAt?: string;
};
type MembershipPlan = {
  key: string;
  name: string;
  limits: Record<string, number | null>;
  maxEmailDiscoveryDepth: number;
  maxTeamMembers: number;
};
type UsageSummary = { feature: string; used: number; limit: number | null; remaining: number | null };
type AuthState = {
  membershipEnabled: boolean;
  user: MembershipUser | null;
  plans: Record<string, MembershipPlan>;
  usage: UsageSummary[];
};

type LegalDocumentKey = 'about' | 'privacy' | 'terms' | 'antiSpam' | 'guide';
type LegalDocument = {
  title: string;
  subtitle: string;
  updatedAt: string;
  sections: Array<{
    heading: string;
    items: string[];
  }>;
};

const legalDocuments: Record<LegalDocumentKey, LegalDocument> = {
  about: {
    title: '关于 IZYLEADS',
    subtitle: 'IZYLEADS 是面向外贸、B2B 销售和本地服务拓展团队的获客工作台。',
    updatedAt: '2026-07-18',
    sections: [
      {
        heading: '我们提供什么',
        items: [
          '帮助用户围绕目标行业、地区和关键词整理潜在线索，并集中管理商户名称、网站、电话、邮箱、地址和联系状态。',
          '提供邮件活动、WhatsApp 活动、线索导出、搜索策略分析、邮件内容生成、消息翻译和任务记录等工作流工具。',
          '系统面向合法商业开发场景，用户应自行判断目标客户适配度、沟通频率和当地合规要求。'
        ]
      },
      {
        heading: '我们不做什么',
        items: [
          '我们不出售垃圾邮件名单，不承诺每条线索都能联系成功，也不保证公开资料在任何时间都完整或最新。',
          '我们不代表用户发送违法、欺骗性、骚扰性或侵犯第三方权益的内容。'
        ]
      },
      {
        heading: '联系方式',
        items: [
          '如需处理账号、数据删除、合规或服务问题，请通过网站管理员提供的官方联系方式联系我们。'
        ]
      }
    ]
  },
  privacy: {
    title: '隐私政策',
    subtitle: '本政策说明 IZYLEADS 如何处理账号信息、线索数据、发送记录和用户配置。',
    updatedAt: '2026-07-18',
    sections: [
      {
        heading: '我们可能处理的数据',
        items: [
          '账号资料：邮箱、名称、角色、会员等级、登录会话、使用额度和操作时间。',
          '线索资料：用户搜索或导入产生的商户名称、网站、电话、公开邮箱、地址、标签、来源页面和补全状态。',
          '活动资料：邮件收件人、主题、正文、预览、发送结果、退订状态、WhatsApp 队列和消息模板。',
          '系统配置：仅管理员可维护的服务密钥、发信配置、退订地址和额度设置。敏感密钥不会在普通用户界面展示。'
        ]
      },
      {
        heading: '数据用途',
        items: [
          '用于提供线索整理、联系信息发现、消息草稿、发送记录、退订处理、权限控制和安全审计。',
          '用于排查错误、限制滥用、维护系统稳定性，以及根据用户要求删除或导出数据。',
          '不会将用户账号数据或私有业务数据出售给第三方。'
        ]
      },
      {
        heading: '数据来源与责任',
        items: [
          '线索信息可能来自用户输入、用户导入、公开网页、商户公开联系方式或用户授权使用的外部数据服务。',
          '用户应确保其搜索、保存、导出和触达行为符合目标地区关于隐私、营销、数据抓取和反骚扰的规定。',
          '如果某条公开联系信息不准确或不应继续使用，用户应及时删除、标记或停止触达。'
        ]
      },
      {
        heading: '保存与删除',
        items: [
          '线索、发送记录和任务记录会保存在当前账号对应的数据空间中；super admin 可进行全局管理。',
          '用户可以删除自己的线索、标签、发送记录和任务记录；管理员可根据服务运营需要处理异常或违规数据。',
          '退订记录会保留用于避免继续向已退订邮箱发送商业邮件。'
        ]
      },
      {
        heading: '安全',
        items: [
          '系统通过账号登录、角色权限和用户数据隔离限制普通用户访问其他账号的数据。',
          '管理员配置的服务密钥仅用于系统功能调用，不会展示给普通用户。',
          '用户仍应妥善保管账号密码，避免共享账号或在不可信设备上长期登录。'
        ]
      }
    ]
  },
  terms: {
    title: '服务条款',
    subtitle: '使用 IZYLEADS 即表示用户同意以合法、克制、透明的方式开展商业沟通。',
    updatedAt: '2026-07-18',
    sections: [
      {
        heading: '允许的用途',
        items: [
          '用于合法的 B2B 客户开发、市场研究、公开商户资料整理、销售跟进和客户关系管理。',
          '用户可以基于真实业务需求创建搜索策略、整理线索、生成草稿、导出数据并进行人工确认后的触达。'
        ]
      },
      {
        heading: '禁止的用途',
        items: [
          '不得发送欺骗性、违法、仿冒、恶意、骚扰、歧视、侵权或明显无关的推广内容。',
          '不得规避退订、频率限制、账号权限、发送限制或系统安全机制。',
          '不得上传、保存或处理明知来自非法来源的数据。'
        ]
      },
      {
        heading: '用户责任',
        items: [
          '用户负责确认线索适用性、联系理由、消息内容、发送频率和目标地区合规要求。',
          '用户负责维护自己的账号安全，并对账号下的搜索、导出、发送和删除行为负责。',
          '如果用户违反条款或造成投诉、滥用、法律风险，管理员可限制、暂停或停用账号。'
        ]
      },
      {
        heading: '服务限制',
        items: [
          '公开网页和商户资料可能变更、缺失、阻断或不可访问，系统不保证所有线索都能发现邮箱或电话。',
          'AI 生成内容仅供参考，正式发送前用户必须自行审核事实、语气、合规性和目标客户适配度。',
          '系统可能因网络、第三方服务、发信服务、浏览器策略或目标网站限制而出现延迟或失败。'
        ]
      }
    ]
  },
  antiSpam: {
    title: '反垃圾邮件政策',
    subtitle: 'IZYLEADS 只支持合法、透明、可退订的商业触达。',
    updatedAt: '2026-07-18',
    sections: [
      {
        heading: '基本原则',
        items: [
          '发送内容必须真实反映发件人身份、业务目的和联系方式，不得伪装来源或误导收件人。',
          '主题应与正文内容一致，不得使用夸大、欺骗、诱导点击或与业务无关的标题。',
          '每封商业邮件都应包含有效退订方式，并尊重收件人的退订、拒绝或停止联系请求。'
        ]
      },
      {
        heading: '发送规范',
        items: [
          '优先联系与用户业务有合理相关性的目标客户，避免无差别群发。',
          '控制发送频率和批量规模，避免重复轰炸同一联系人、公司或域名。',
          '不得向已退订、投诉、明确拒绝或明显不相关的联系人继续发送推广内容。'
        ]
      },
      {
        heading: '平台措施',
        items: [
          '系统支持退订链接、发送记录、每日发送限制、跳过已退订邮箱和失败记录追踪。',
          '管理员可根据投诉、异常发送、滥用行为或法律风险限制账号使用。',
          '用户应保留必要的业务背景和联系依据，以便处理收件人的疑问或投诉。'
        ]
      }
    ]
  },
  guide: {
    title: '使用说明',
    subtitle: '从搜索线索到邮件/WhatsApp 触达的基础工作流。',
    updatedAt: '2026-07-18',
    sections: [
      {
        heading: '搜索商户',
        items: [
          '输入目标行业关键词、地区和国家后开始搜索；如果关键词比较宽泛，可以先使用 AI 搜索策略生成更具体的搜索组合。',
          '国家选择会影响电话区号、语言建议和地区输入体验；地区可以手动输入，也可以使用内置地区选择器。',
          '官网抓取深度越高，越可能发现联系页、关于页、页脚或隐私页中的邮箱，但耗时也会增加。'
        ]
      },
      {
        heading: '管理线索库',
        items: [
          '线索会按搜索关键词形成标签，便于区分不同搜索批次；“全部”标签保留全部当前账号线索。',
          '可以删除某个标签、删除标签内独有线索，或清空当前账号全部线索。',
          '导出 CSV 前建议先筛选目标标签，并确认邮箱来源页面和无邮箱原因。'
        ]
      },
      {
        heading: '邮件活动',
        items: [
          '可以从线索库把邮箱加入收件人，也可以手动输入多个邮箱；多个邮箱用逗号或换行分隔。',
          '正文编辑器支持基础排版和本地图片插入；AI 邮件草稿需要人工确认后再替换正文。',
          '真实发送前必须保证发信服务和公网退订地址可用；发送记录会保留用于排查失败原因。'
        ]
      },
      {
        heading: 'WhatsApp 活动',
        items: [
          '可以把线索中的手机号加入 WhatsApp 队列，系统会按国家区号整理号码。',
          '消息框支持模板变量，例如 {name}、{company}、{phone}、{address}、{website}。',
          '打开聊天后仍需用户在 WhatsApp 中手动确认发送，系统不会绕过客户端确认。'
        ]
      },
      {
        heading: '账号与数据',
        items: [
          '普通用户只能看到自己账号产生的线索、任务、邮件记录和 WhatsApp 队列。',
          '管理员可管理成员、额度和全局服务配置；普通用户不应看到或修改管理员密钥。',
          '如发现数据异常、邮箱识别失败或发送失败，可先查看任务记录和失败原因。'
        ]
      }
    ]
  }
};

const legalLinkItems: Array<{ key: LegalDocumentKey; label: string }> = [
  { key: 'about', label: '关于我们' },
  { key: 'privacy', label: '隐私政策' },
  { key: 'terms', label: '服务条款' },
  { key: 'antiSpam', label: '反垃圾邮件政策' },
  { key: 'guide', label: '使用说明' }
];

type SettingsPayload = {
  googleMapsApiKey: string;
  googleTranslateApiKey: string;
  openAiApiKey: string;
  openAiBaseUrl: string;
  openAiModel: string;
  enrichmentEmailApiEndpoint: string;
  enrichmentEmailApiKey: string;
  yelpApiKey: string;
  foursquareApiKey: string;
  hunterApiKey: string;
  placesLanguageCode: string;
  placesRegionCode: string;
  smtp: {
    host: string;
    port: number | string;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
  jarvisEmailEndpoint: string;
  jarvisEmailToken: string;
  unsubscribeUrl: string;
  emailDailyLimit: number | string;
  hasSmtpPass?: boolean;
  hasJarvisEmailToken?: boolean;
  hasOpenAiApiKey?: boolean;
  hasEnrichmentEmailApiKey?: boolean;
  hasYelpApiKey?: boolean;
  hasFoursquareApiKey?: boolean;
  hasHunterApiKey?: boolean;
  mailerMode?: 'dry-run' | 'smtp' | 'jarvis';
  emailReady?: boolean;
  emailIssues?: string[];
};

type CountryOption = {
  code: string;
  language: string;
};

type AreaCity = {
  name: string;
  districts?: string[];
};

type AreaProvince = {
  name: string;
  code?: string;
  cities: AreaCity[];
};

type SearchResponse = {
  created: number;
  updated: number;
  leads: Lead[];
  search: { keyword: string; area: string; nextPageToken?: string };
};

type SearchPageTarget = { area: string; token: string };
type SearchMode = 'keyword' | 'type' | 'smart';

type EmailPreview = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type EmailTranslation = {
  targetLanguage: string;
  subject: string;
  body: string;
  htmlBody: string;
};

type EmailDraft = {
  id: string;
  angle: string;
  subject: string;
  body: string;
  htmlBody: string;
};

type WhatsAppDraft = {
  id: string;
  angle: string;
  message: string;
  followUp: string;
};

type WhatsAppQueueItem = {
  id: string;
  leadId?: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  source?: string;
};

type WhatsAppMessageContext = {
  name?: string;
  companyType?: string;
  phone?: string;
  website?: string;
  address?: string;
  source?: string;
};

type KeywordStrategy = {
  customerProfile: string;
  productIntent: string;
  recommendedMode: SearchMode;
  primaryPlaceType: string;
  placeTypes: string[];
  searchKeywords: string[];
  negativeKeywords: string[];
  searchBatches: Array<{ label: string; keyword: string; placeType: string; mode: SearchMode }>;
  notes: string[];
  source?: 'openai' | 'fallback';
};

const normalizeSearchKeyword = (value: string) => value.trim().toLocaleLowerCase();
const buildSearchSource = (keyword: string, area: string) => `google-places:${keyword}:${area}`;
const businessTypeProfiles: Record<string, { types: string[]; expansions: string[] }> = {
  dentist: { types: ['dentist'], expansions: ['dental clinic', 'orthodontist', 'cosmetic dentist', 'emergency dentist'] },
  plumber: { types: ['plumber'], expansions: ['plumbing contractor', 'drain cleaning', 'emergency plumber'] },
  roofing: { types: ['roofing_contractor'], expansions: ['roofer', 'roof repair', 'roofing company'] },
  electrician: { types: ['electrician'], expansions: ['electrical contractor', 'emergency electrician'] },
  salon: { types: ['beauty_salon', 'hair_care'], expansions: ['hair salon', 'beauty salon', 'nail salon'] },
  lawyer: { types: ['lawyer'], expansions: ['law firm', 'attorney'] },
  realtor: { types: ['real_estate_agency'], expansions: ['real estate agent', 'property management'] },
  restaurant: { types: ['restaurant'], expansions: ['cafe', 'bar'] },
  gym: { types: ['gym'], expansions: ['fitness center', 'personal trainer'] },
  veterinary: { types: ['veterinary_care'], expansions: ['veterinarian', 'animal hospital'] },
  auto: { types: ['car_repair', 'car_dealer'], expansions: ['auto repair', 'car dealership', 'used car dealer'] },
  insurance: { types: ['insurance_agency'], expansions: ['insurance agency', 'insurance broker'] },
  doctor: { types: ['doctor'], expansions: ['medical clinic', 'family doctor', 'urgent care'] }
};
const commonPlaceTypes = [
  'dentist',
  'plumber',
  'roofing_contractor',
  'electrician',
  'beauty_salon',
  'hair_care',
  'car_repair',
  'car_dealer',
  'real_estate_agency',
  'lawyer',
  'doctor',
  'restaurant',
  'gym',
  'veterinary_care',
  'insurance_agency'
];
const placeTypeAliases: Record<string, string> = {
  auto: 'car_repair',
  automotive: 'car_repair',
  mechanic: 'car_repair',
  auto_repair: 'car_repair',
  car_repair_shop: 'car_repair',
  dealership: 'car_dealer',
  dealer: 'car_dealer',
  used: 'car_dealer',
  used_car: 'car_dealer',
  used_car_dealer: 'car_dealer',
  car_dealership: 'car_dealer'
};
function inferClientBusinessProfile(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return businessTypeProfiles[normalized]
    || Object.entries(businessTypeProfiles).find(([key, profile]) => normalized.includes(key) || profile.expansions.some((item) => normalized.includes(item)))?.[1]
    || { types: [], expansions: [] };
}
function normalizeClientPlaceType(value: string, keywordValue = '') {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized === 'auto' && /\b(?:used|dealer|dealership|sales)\b/.test(keywordValue.toLowerCase())) return 'car_dealer';
  return placeTypeAliases[normalized] || normalized;
}
const parseRecipientEmails = (value: string) => Array.from(new Set(
  value
    .split(/[,;\n，；]+/)
    .map((email) => email.trim())
    .filter(Boolean)
));

function normalizeWhatsAppPhone(phone: string) {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/[^\d+]/g, '');
  if (!normalized) return '';
  if (normalized.startsWith('+')) return normalized.slice(1);
  if (normalized.startsWith('00')) return normalized.slice(2);
  return normalized;
}

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildWhatsAppUrl(phone: string, message = '') {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return '';
  const encodedMessage = message.trim() ? `text=${encodeURIComponent(message.trim())}` : '';
  const mobile = isMobileBrowser();
  const base = mobile
    ? `https://wa.me/${normalizedPhone}`
    : `https://web.whatsapp.com/send?phone=${normalizedPhone}`;
  return encodedMessage ? `${base}${mobile ? '?' : '&'}${encodedMessage}` : base;
}

function renderWhatsAppMessage(template: string, context: WhatsAppMessageContext = {}) {
  const values = {
    name: context.name || '',
    company: context.companyType || '',
    companyType: context.companyType || '',
    phone: context.phone || '',
    website: context.website || '',
    address: context.address || '',
    source: context.source || ''
  };

  return template.replace(/\{(name|company|companyType|phone|website|address|source)\}/g, (_, key: keyof typeof values) => values[key] || '');
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(text);
  return true;
}

function quoteCsvValue(value: unknown) {
  const original = value == null ? '' : String(value);
  const safe = /^[\s]*[=+\-@]/.test(original) ? `'${original}` : original;
  return `"${safe.replace(/"/g, '""')}"`;
}

function leadsToClientCsv(leads: Lead[]) {
  const headers = [
    'name',
    'companyType',
    'phone',
    'sourceKeywords',
    'sourceKeyword',
    'matchStrategies',
    'whatsappContactUrls',
    'whatsappContactPhones',
    'emails',
  'emailSourceUrls',
  'emailDiscoveryReason',
  'emailDiscoveryReasonCode',
  'emailDiscoveryPagesScanned',
  'socialProfileUrls',
  'directoryProfileUrls',
  'enrichmentSteps',
  'website',
    'address',
    'googleMapsUrl',
    'rating',
    'reviewCount',
    'status',
    'source'
  ];
  const rows = leads.map((lead) => [
    lead.name,
    lead.companyType,
    lead.phone,
    getLeadSourceKeywords(lead).join('; '),
    lead.sourceKeyword || getLeadSourceKeywords(lead)[0] || '',
    (lead.matchStrategies || (lead.matchStrategy ? [lead.matchStrategy] : [])).join('; '),
    (lead.whatsappContacts || []).map((item) => item.url).filter(Boolean).join('; '),
    (lead.whatsappContacts || []).map((item) => item.phone).filter(Boolean).join('; '),
    (lead.emails || []).join('; '),
    (lead.emailSources || []).map((item) => item.url).filter(Boolean).join('; '),
    lead.emailDiscoveryReason || lead.emailDiscoveryError || '',
    lead.emailDiscoveryReasonCode || '',
    lead.emailDiscoveryPagesScanned ?? '',
    (lead.socialProfiles || []).map((item) => item.url).filter(Boolean).join('; '),
    (lead.directoryProfiles || []).map((item) => item.url).filter(Boolean).join('; '),
    (lead.enrichmentSteps || []).map((item) => `${item.name}:${item.status}`).join('; '),
    lead.website,
    lead.address,
    lead.googleMapsUrl,
    lead.rating ?? '',
    lead.reviewCount,
    lead.status,
    lead.source
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(quoteCsvValue).join(',')).join('\r\n')}`;
}

function getLeadSearchSources(lead: Lead) {
  return new Set([
    ...(lead.searchSources || []),
    ...(lead.source ? [lead.source] : [])
  ]);
}

function getLeadSourceKeywords(lead: Lead) {
  const values = [
    ...(lead.sourceKeywords || []),
    lead.sourceKeyword,
    ...Array.from(getLeadSearchSources(lead)).map((source) => {
      const match = String(source || '').match(/^google-places:(.*):[^:]*$/);
      return match?.[1] || '';
    })
  ];
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)));
}

function getEmailSourceForLead(lead: Lead, email: string) {
  return (lead.emailSources || []).find((item) => item.email.toLowerCase() === email.toLowerCase()) || null;
}

function getLeadWhatsAppContact(lead: Lead) {
  return (lead.whatsappContacts || []).find((item) => item.phone || item.url) || null;
}

function getEmailDiscoveryReason(lead: Lead) {
  if (Array.isArray(lead.emails) && lead.emails.length) return '';
  if (lead.emailDiscoveryReason) return lead.emailDiscoveryReason;
  if (lead.emailDiscoveryError) return lead.emailDiscoveryError;
  if (lead.website && lead.emailDiscoveryStatus === 'empty') return '官网无公开邮箱';
  if (lead.website && lead.emailDiscoveryStatus === 'failed') return '官网打不开或被阻挡';
  if (!lead.website) return '官网为空';
  return '';
}

function getLeadContactPriority(lead: Lead) {
  const hasEmail = Array.isArray(lead.emails) && lead.emails.length > 0;
  const hasPhone = Boolean(lead.phone);
  if (hasEmail && hasPhone) return 0;
  if (hasEmail) return 1;
  if (hasPhone) return 2;
  return 3;
}

function getTaskKindLabel(kind: string) {
  if (kind === 'search') return '搜索商户';
  if (kind === 'campaign-send') return '发送邮件';
  if (kind === 'email-discovery') return '邮箱发现';
  if (kind === 'analysis') return 'AI 分析';
  return kind || '任务';
}

function getTaskStatusLabel(status: string) {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '进行中';
  if (status === 'done') return '已完成';
  if (status === 'failed') return '失败';
  return status;
}

function getSendStatusLabel(status: string) {
  if (status === 'sent') return '已发送';
  if (status === 'failed') return '失败';
  if (status === 'skipped') return '已跳过';
  if (status === 'dry-run') return '预演';
  return status || '-';
}

function getSendReasonLabel(reason?: string) {
  if (reason === 'missing-email') return '缺少邮箱';
  if (reason === 'suppressed') return '已退订/抑制';
  return reason || '';
}

function formatTaskTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatTaskContext(context?: Record<string, unknown>) {
  if (!context) return '';
  const entries = Object.entries(context).filter(([, value]) => {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
  if (!entries.length) return '';
  return entries
    .slice(0, 3)
    .map(([key, value]) => {
      const formatted = Array.isArray(value)
        ? value.map((item) => String(item)).join(', ')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
      return `${key}: ${formatted}`;
    })
    .join(' · ');
}

const areaCatalog: Record<string, AreaProvince[]> = {
  US: [
    { name: 'California', cities: [
      { name: 'Los Angeles', districts: ['Downtown', 'Hollywood', 'Santa Monica', 'Beverly Hills'] },
      { name: 'San Francisco', districts: ['SoMa', 'Mission District', 'Financial District'] },
      { name: 'San Diego', districts: ['Gaslamp Quarter', 'La Jolla', 'North Park'] }
    ] },
    { name: 'New York', cities: [
      { name: 'New York City', districts: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx'] },
      { name: 'Buffalo', districts: ['Downtown', 'Elmwood Village'] },
      { name: 'Rochester', districts: ['East End', 'Park Avenue'] }
    ] },
    { name: 'Texas', cities: [
      { name: 'Houston', districts: ['Downtown', 'Midtown', 'The Heights'] },
      { name: 'Dallas', districts: ['Uptown', 'Deep Ellum', 'Bishop Arts'] },
      { name: 'Austin', districts: ['Downtown', 'South Congress', 'East Austin'] }
    ] },
    { name: 'Florida', cities: [
      { name: 'Miami', districts: ['Downtown', 'Brickell', 'Wynwood'] },
      { name: 'Orlando', districts: ['Downtown', 'Winter Park'] },
      { name: 'Tampa', districts: ['Downtown', 'Ybor City'] }
    ] }
  ],
  CN: [
    { name: '广东省', cities: [
      { name: '深圳市', districts: ['南山区', '福田区', '宝安区', '龙岗区'] },
      { name: '广州市', districts: ['天河区', '越秀区', '海珠区', '番禺区'] },
      { name: '东莞市', districts: ['南城街道', '东城街道', '松山湖'] }
    ] },
    { name: '浙江省', cities: [
      { name: '杭州市', districts: ['西湖区', '滨江区', '余杭区'] },
      { name: '宁波市', districts: ['鄞州区', '海曙区', '江北区'] }
    ] },
    { name: '江苏省', cities: [
      { name: '苏州市', districts: ['工业园区', '姑苏区', '吴中区'] },
      { name: '南京市', districts: ['鼓楼区', '建邺区', '秦淮区'] }
    ] },
    { name: '北京市', cities: [{ name: '北京市', districts: ['朝阳区', '海淀区', '西城区', '东城区'] }] },
    { name: '上海市', cities: [{ name: '上海市', districts: ['浦东新区', '徐汇区', '静安区', '黄浦区'] }] }
  ],
  CA: [
    { name: 'Ontario', cities: [
      { name: 'Toronto', districts: ['Downtown', 'North York', 'Scarborough'] },
      { name: 'Ottawa', districts: ['Centretown', 'Kanata'] }
    ] },
    { name: 'British Columbia', cities: [
      { name: 'Vancouver', districts: ['Downtown', 'Kitsilano', 'Richmond'] },
      { name: 'Victoria', districts: ['Downtown', 'James Bay'] }
    ] },
    { name: 'Quebec', cities: [
      { name: 'Montreal', districts: ['Downtown', 'Plateau', 'Old Montreal'] },
      { name: 'Quebec City', districts: ['Old Quebec', 'Sainte-Foy'] }
    ] }
  ],
  AU: [
    { name: 'New South Wales', cities: [{ name: 'Sydney', districts: ['CBD', 'Parramatta', 'Bondi'] }] },
    { name: 'Victoria', cities: [{ name: 'Melbourne', districts: ['CBD', 'Southbank', 'Carlton'] }] },
    { name: 'Queensland', cities: [{ name: 'Brisbane', districts: ['CBD', 'South Brisbane', 'Fortitude Valley'] }] }
  ],
  GB: [
    { name: 'England', cities: [
      { name: 'London', districts: ['Westminster', 'Camden', 'Kensington', 'Shoreditch'] },
      { name: 'Manchester', districts: ['City Centre', 'Salford', 'Didsbury'] },
      { name: 'Birmingham', districts: ['City Centre', 'Jewellery Quarter'] }
    ] },
    { name: 'Scotland', cities: [{ name: 'Edinburgh', districts: ['Old Town', 'New Town'] }, { name: 'Glasgow', districts: ['City Centre', 'West End'] }] }
  ],
  JP: [
    { name: '東京都', cities: [{ name: '東京', districts: ['渋谷区', '新宿区', '港区', '千代田区'] }] },
    { name: '大阪府', cities: [{ name: '大阪市', districts: ['北区', '中央区', '浪速区'] }] },
    { name: '京都府', cities: [{ name: '京都市', districts: ['中京区', '下京区', '東山区'] }] }
  ],
  DE: [
    { name: 'Bavaria', cities: [{ name: 'Munich', districts: ['Altstadt', 'Schwabing', 'Maxvorstadt'] }] },
    { name: 'Berlin', cities: [{ name: 'Berlin', districts: ['Mitte', 'Kreuzberg', 'Charlottenburg'] }] },
    { name: 'North Rhine-Westphalia', cities: [{ name: 'Cologne', districts: ['Innenstadt', 'Ehrenfeld'] }, { name: 'Dusseldorf', districts: ['Stadtmitte', 'MedienHafen'] }] }
  ],
  FR: [
    { name: 'Île-de-France', cities: [{ name: 'Paris', districts: ['1er arrondissement', '8e arrondissement', '15e arrondissement'] }] },
    { name: 'Provence-Alpes-Côte d’Azur', cities: [{ name: 'Marseille', districts: ['Vieux-Port', 'La Joliette'] }, { name: 'Nice', districts: ['Vieux Nice', 'Jean-Médecin'] }] }
  ],
  IN: [
    { name: 'Maharashtra', cities: [{ name: 'Mumbai', districts: ['Bandra', 'Andheri', 'South Mumbai'] }, { name: 'Pune', districts: ['Koregaon Park', 'Hinjawadi'] }] },
    { name: 'Delhi', cities: [{ name: 'New Delhi', districts: ['Connaught Place', 'South Delhi', 'Dwarka'] }] },
    { name: 'Karnataka', cities: [{ name: 'Bengaluru', districts: ['Indiranagar', 'Koramangala', 'Whitefield'] }] }
  ]
};

const countryOptions: CountryOption[] = [
  { code: 'AF', language: 'fa' }, { code: 'AX', language: 'sv' }, { code: 'AL', language: 'sq' },
  { code: 'DZ', language: 'ar' }, { code: 'AS', language: 'en' }, { code: 'AD', language: 'ca' },
  { code: 'AO', language: 'pt' }, { code: 'AI', language: 'en' }, { code: 'AQ', language: 'en' },
  { code: 'AG', language: 'en' }, { code: 'AR', language: 'es' }, { code: 'AM', language: 'hy' },
  { code: 'AW', language: 'nl' }, { code: 'AU', language: 'en' }, { code: 'AT', language: 'de' },
  { code: 'AZ', language: 'az' }, { code: 'BS', language: 'en' }, { code: 'BH', language: 'ar' },
  { code: 'BD', language: 'bn' }, { code: 'BB', language: 'en' }, { code: 'BY', language: 'be' },
  { code: 'BE', language: 'nl' }, { code: 'BZ', language: 'en' }, { code: 'BJ', language: 'fr' },
  { code: 'BM', language: 'en' }, { code: 'BT', language: 'dz' }, { code: 'BO', language: 'es' },
  { code: 'BQ', language: 'nl' }, { code: 'BA', language: 'bs' }, { code: 'BW', language: 'en' },
  { code: 'BV', language: 'no' }, { code: 'BR', language: 'pt' }, { code: 'IO', language: 'en' },
  { code: 'BN', language: 'ms' }, { code: 'BG', language: 'bg' }, { code: 'BF', language: 'fr' },
  { code: 'BI', language: 'fr' }, { code: 'KH', language: 'km' }, { code: 'CM', language: 'fr' },
  { code: 'CA', language: 'en' }, { code: 'CV', language: 'pt' }, { code: 'KY', language: 'en' },
  { code: 'CF', language: 'fr' }, { code: 'TD', language: 'fr' }, { code: 'CL', language: 'es' },
  { code: 'CN', language: 'zh' }, { code: 'CX', language: 'en' }, { code: 'CC', language: 'en' },
  { code: 'CO', language: 'es' }, { code: 'KM', language: 'ar' }, { code: 'CG', language: 'fr' },
  { code: 'CD', language: 'fr' }, { code: 'CK', language: 'en' }, { code: 'CR', language: 'es' },
  { code: 'CI', language: 'fr' }, { code: 'HR', language: 'hr' }, { code: 'CU', language: 'es' },
  { code: 'CW', language: 'nl' }, { code: 'CY', language: 'el' }, { code: 'CZ', language: 'cs' },
  { code: 'DK', language: 'da' }, { code: 'DJ', language: 'fr' }, { code: 'DM', language: 'en' },
  { code: 'DO', language: 'es' }, { code: 'EC', language: 'es' }, { code: 'EG', language: 'ar' },
  { code: 'SV', language: 'es' }, { code: 'GQ', language: 'es' }, { code: 'ER', language: 'ti' },
  { code: 'EE', language: 'et' }, { code: 'SZ', language: 'en' }, { code: 'ET', language: 'am' },
  { code: 'FK', language: 'en' }, { code: 'FO', language: 'fo' }, { code: 'FJ', language: 'en' },
  { code: 'FI', language: 'fi' }, { code: 'FR', language: 'fr' }, { code: 'GF', language: 'fr' },
  { code: 'PF', language: 'fr' }, { code: 'TF', language: 'fr' }, { code: 'GA', language: 'fr' },
  { code: 'GM', language: 'en' }, { code: 'GE', language: 'ka' }, { code: 'DE', language: 'de' },
  { code: 'GH', language: 'en' }, { code: 'GI', language: 'en' }, { code: 'GR', language: 'el' },
  { code: 'GL', language: 'kl' }, { code: 'GD', language: 'en' }, { code: 'GP', language: 'fr' },
  { code: 'GU', language: 'en' }, { code: 'GT', language: 'es' }, { code: 'GG', language: 'en' },
  { code: 'GN', language: 'fr' }, { code: 'GW', language: 'pt' }, { code: 'GY', language: 'en' },
  { code: 'HT', language: 'fr' }, { code: 'HM', language: 'en' }, { code: 'VA', language: 'it' },
  { code: 'HN', language: 'es' }, { code: 'HK', language: 'zh' }, { code: 'HU', language: 'hu' },
  { code: 'IS', language: 'is' }, { code: 'IN', language: 'hi' }, { code: 'ID', language: 'id' },
  { code: 'IR', language: 'fa' }, { code: 'IQ', language: 'ar' }, { code: 'IE', language: 'en' },
  { code: 'IM', language: 'en' }, { code: 'IL', language: 'he' }, { code: 'IT', language: 'it' },
  { code: 'JM', language: 'en' }, { code: 'JP', language: 'ja' }, { code: 'JE', language: 'en' },
  { code: 'JO', language: 'ar' }, { code: 'KZ', language: 'kk' }, { code: 'KE', language: 'en' },
  { code: 'KI', language: 'en' }, { code: 'KP', language: 'ko' }, { code: 'KR', language: 'ko' },
  { code: 'KW', language: 'ar' }, { code: 'KG', language: 'ky' }, { code: 'LA', language: 'lo' },
  { code: 'LV', language: 'lv' }, { code: 'LB', language: 'ar' }, { code: 'LS', language: 'en' },
  { code: 'LR', language: 'en' }, { code: 'LY', language: 'ar' }, { code: 'LI', language: 'de' },
  { code: 'LT', language: 'lt' }, { code: 'LU', language: 'fr' }, { code: 'MO', language: 'zh' },
  { code: 'MG', language: 'fr' }, { code: 'MW', language: 'en' }, { code: 'MY', language: 'ms' },
  { code: 'MV', language: 'dv' }, { code: 'ML', language: 'fr' }, { code: 'MT', language: 'mt' },
  { code: 'MH', language: 'en' }, { code: 'MQ', language: 'fr' }, { code: 'MR', language: 'ar' },
  { code: 'MU', language: 'en' }, { code: 'YT', language: 'fr' }, { code: 'MX', language: 'es' },
  { code: 'FM', language: 'en' }, { code: 'MD', language: 'ro' }, { code: 'MC', language: 'fr' },
  { code: 'MN', language: 'mn' }, { code: 'ME', language: 'sr' }, { code: 'MS', language: 'en' },
  { code: 'MA', language: 'ar' }, { code: 'MZ', language: 'pt' }, { code: 'MM', language: 'my' },
  { code: 'NA', language: 'en' }, { code: 'NR', language: 'en' }, { code: 'NP', language: 'ne' },
  { code: 'NL', language: 'nl' }, { code: 'NC', language: 'fr' }, { code: 'NZ', language: 'en' },
  { code: 'NI', language: 'es' }, { code: 'NE', language: 'fr' }, { code: 'NG', language: 'en' },
  { code: 'NU', language: 'en' }, { code: 'NF', language: 'en' }, { code: 'MK', language: 'mk' },
  { code: 'MP', language: 'en' }, { code: 'NO', language: 'no' }, { code: 'OM', language: 'ar' },
  { code: 'PK', language: 'ur' }, { code: 'PW', language: 'en' }, { code: 'PS', language: 'ar' },
  { code: 'PA', language: 'es' }, { code: 'PG', language: 'en' }, { code: 'PY', language: 'es' },
  { code: 'PE', language: 'es' }, { code: 'PH', language: 'en' }, { code: 'PN', language: 'en' },
  { code: 'PL', language: 'pl' }, { code: 'PT', language: 'pt' }, { code: 'PR', language: 'es' },
  { code: 'QA', language: 'ar' }, { code: 'RE', language: 'fr' }, { code: 'RO', language: 'ro' },
  { code: 'RU', language: 'ru' }, { code: 'RW', language: 'rw' }, { code: 'BL', language: 'fr' },
  { code: 'SH', language: 'en' }, { code: 'KN', language: 'en' }, { code: 'LC', language: 'en' },
  { code: 'MF', language: 'fr' }, { code: 'PM', language: 'fr' }, { code: 'VC', language: 'en' },
  { code: 'WS', language: 'sm' }, { code: 'SM', language: 'it' }, { code: 'ST', language: 'pt' },
  { code: 'SA', language: 'ar' }, { code: 'SN', language: 'fr' }, { code: 'RS', language: 'sr' },
  { code: 'SC', language: 'fr' }, { code: 'SL', language: 'en' }, { code: 'SG', language: 'en' },
  { code: 'SX', language: 'nl' }, { code: 'SK', language: 'sk' }, { code: 'SI', language: 'sl' },
  { code: 'SB', language: 'en' }, { code: 'SO', language: 'so' }, { code: 'ZA', language: 'en' },
  { code: 'GS', language: 'en' }, { code: 'SS', language: 'en' }, { code: 'ES', language: 'es' },
  { code: 'LK', language: 'si' }, { code: 'SD', language: 'ar' }, { code: 'SR', language: 'nl' },
  { code: 'SJ', language: 'no' }, { code: 'SE', language: 'sv' }, { code: 'CH', language: 'de' },
  { code: 'SY', language: 'ar' }, { code: 'TW', language: 'zh' }, { code: 'TJ', language: 'tg' },
  { code: 'TZ', language: 'sw' }, { code: 'TH', language: 'th' }, { code: 'TL', language: 'pt' },
  { code: 'TG', language: 'fr' }, { code: 'TK', language: 'en' }, { code: 'TO', language: 'en' },
  { code: 'TT', language: 'en' }, { code: 'TN', language: 'ar' }, { code: 'TR', language: 'tr' },
  { code: 'TM', language: 'tk' }, { code: 'TC', language: 'en' }, { code: 'TV', language: 'en' },
  { code: 'UG', language: 'en' }, { code: 'UA', language: 'uk' }, { code: 'AE', language: 'ar' },
  { code: 'GB', language: 'en' }, { code: 'US', language: 'en' }, { code: 'UM', language: 'en' },
  { code: 'UY', language: 'es' }, { code: 'UZ', language: 'uz' }, { code: 'VU', language: 'en' },
  { code: 'VE', language: 'es' }, { code: 'VN', language: 'vi' }, { code: 'VG', language: 'en' },
  { code: 'VI', language: 'en' }, { code: 'WF', language: 'fr' }, { code: 'EH', language: 'ar' },
  { code: 'YE', language: 'ar' }, { code: 'ZM', language: 'en' }, { code: 'ZW', language: 'en' }
];

const regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['zh-CN'], { type: 'language' });

const countries = countryOptions
  .map((country) => ({
    ...country,
    name: regionNames.of(country.code) || country.code,
    languageName: languageNames.of(country.language) || country.language
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

const keywordTranslations: Record<string, Record<string, string>> = {
  dentist: {
    ar: 'طبيب أسنان', bn: 'দাঁতের ডাক্তার', ca: 'dentista', cs: 'zubní lékař', da: 'tandlæge',
    de: 'Zahnarzt', el: 'οδοντίατρος', en: 'dentist', es: 'dentista', fa: 'دندانپزشک',
    fi: 'hammaslääkäri', fr: 'dentiste', he: 'רופא שיניים', hi: 'दंत चिकित्सक', hu: 'fogorvos',
    id: 'dokter gigi', it: 'dentista', ja: '歯医者', ko: '치과의사', ms: 'doktor gigi',
    nl: 'tandarts', no: 'tannlege', pl: 'dentysta', pt: 'dentista', ro: 'dentist',
    ru: 'стоматолог', sv: 'tandläkare', th: 'ทันตแพทย์', tr: 'diş hekimi', uk: 'стоматолог',
    vi: 'nha sĩ', zh: '牙医'
  },
  plumber: {
    ar: 'سباك', de: 'Klempner', en: 'plumber', es: 'plomero', fi: 'putkimies', fr: 'plombier',
    hi: 'प्लंबर', id: 'tukang ledeng', it: 'idraulico', ja: '配管工', ko: '배관공',
    nl: 'loodgieter', pl: 'hydraulik', pt: 'encanador', ru: 'сантехник', sv: 'rörmokare',
    th: 'ช่างประปา', tr: 'tesisatçı', vi: 'thợ sửa ống nước', zh: '水管工'
  },
  roofing: {
    ar: 'أسقف', de: 'Dachdecker', en: 'roofing', es: 'techado', fi: 'kattotyöt', fr: 'toiture',
    id: 'atap', it: 'coperture', ja: '屋根工事', ko: '지붕 공사', nl: 'dakbedekking',
    pl: 'dekarstwo', pt: 'telhados', ru: 'кровельные работы', sv: 'takläggning',
    tr: 'çatı kaplama', vi: 'lợp mái', zh: '屋顶维修'
  },
  restaurant: {
    ar: 'مطعم', de: 'Restaurant', en: 'restaurant', es: 'restaurante', fi: 'ravintola',
    fr: 'restaurant', hi: 'रेस्तरां', id: 'restoran', it: 'ristorante', ja: 'レストラン',
    ko: '레스토랑', nl: 'restaurant', pl: 'restauracja', pt: 'restaurante',
    ru: 'ресторан', sv: 'restaurang', th: 'ร้านอาหาร', tr: 'restoran', vi: 'nhà hàng', zh: '餐厅'
  },
  lawyer: {
    ar: 'محامي', de: 'Anwalt', en: 'lawyer', es: 'abogado', fi: 'asianajaja', fr: 'avocat',
    hi: 'वकील', id: 'pengacara', it: 'avvocato', ja: '弁護士', ko: '변호사', nl: 'advocaat',
    pl: 'prawnik', pt: 'advogado', ru: 'юрист', sv: 'advokat', th: 'ทนายความ',
    tr: 'avukat', vi: 'luật sư', zh: '律师'
  },
  electrician: {
    ar: 'كهربائي', de: 'Elektriker', en: 'electrician', es: 'electricista', fi: 'sähköasentaja',
    fr: 'électricien', hi: 'इलेक्ट्रीशियन', id: 'tukang listrik', it: 'elettricista',
    ja: '電気工事士', ko: '전기기사', nl: 'elektricien', pl: 'elektryk', pt: 'eletricista',
    ru: 'электрик', sv: 'elektriker', th: 'ช่างไฟฟ้า', tr: 'elektrikçi', vi: 'thợ điện', zh: '电工'
  },
  salon: {
    ar: 'صالون', de: 'Salon', en: 'salon', es: 'salón de belleza', fi: 'kauneussalonki',
    fr: 'salon de beauté', id: 'salon', it: 'salone di bellezza', ja: '美容室', ko: '미용실',
    nl: 'salon', pl: 'salon kosmetyczny', pt: 'salão de beleza', ru: 'салон красоты',
    sv: 'salong', th: 'ร้านเสริมสวย', tr: 'güzellik salonu', vi: 'tiệm làm đẹp', zh: '美容院'
  }
};

function getSessionAdminToken() {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem('leadgen-admin-token') || '';
}

function getMembershipToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('leadgen-membership-token') || '';
}

const searchFormStorageKey = 'leadgen-search-form-v1';
const whatsappStorageBaseKey = 'leadgen-whatsapp-state-v1';

type SavedSearchForm = {
  keyword?: string;
  area?: string;
  countryCode?: string;
  translatedKeyword?: string;
  onlyTranslatedKeyword?: boolean;
  searchMode?: SearchMode;
  placeType?: string;
  maxResults?: number;
  includeEmailDiscovery?: boolean;
  emailDiscoveryDepth?: number;
  areaTargets?: string[];
};

type SavedWhatsAppState = {
  message?: unknown;
  queue?: unknown;
};

function getSavedSearchForm(): SavedSearchForm {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(searchFormStorageKey) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function getWhatsAppStorageKey(userId = '') {
  return `${whatsappStorageBaseKey}:${userId || 'anonymous'}`;
}

function getSavedWhatsAppState(storageKey = getWhatsAppStorageKey()): SavedWhatsAppState {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function isSearchMode(value: unknown): value is SearchMode {
  return value === 'keyword' || value === 'type' || value === 'smart';
}

function normalizeSavedMaxResults(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 10;
  return Math.max(1, Math.round(numericValue));
}

function normalizeEmailDiscoveryDepth(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.max(0, Math.min(3, Math.round(numericValue)));
}

function normalizeSavedAreaTargets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((target): target is string => typeof target === 'string' && target.trim().length > 0);
}

function normalizeSavedWhatsAppQueue(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const rawPhone = typeof record.phone === 'string' ? record.phone.trim() : '';
    const normalizedPhone = normalizeWhatsAppPhone(
      typeof record.normalizedPhone === 'string' && record.normalizedPhone.trim() ? record.normalizedPhone : rawPhone
    );
    if (!normalizedPhone || seen.has(normalizedPhone)) return [];
    seen.add(normalizedPhone);

    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : normalizedPhone;
    const leadId = typeof record.leadId === 'string' && record.leadId.trim() ? record.leadId.trim() : undefined;
    const source = typeof record.source === 'string' ? record.source : '';
    const id = typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `${leadId || 'lead'}:${normalizedPhone}:${index}`;

    return [{
      id,
      leadId,
      name,
      phone: rawPhone || normalizedPhone,
      normalizedPhone,
      source
    }];
  });
}

function authenticatedHeaders(headers?: HeadersInit) {
  const token = getSessionAdminToken();
  const membershipToken = getMembershipToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(membershipToken ? { 'X-Leadgen-Session-Token': membershipToken } : {}),
    ...(headers || {})
  };
}

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: authenticatedHeaders(init?.headers)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data as T;
};

function translateKeyword(keyword: string, language: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return '';
  return keywordTranslations[normalized]?.[language] || keywordTranslations[normalized]?.en || keyword;
}

const defaultSubject = '关于 {{name}} 的本地获客合作想法';
const defaultBody = `你好，{{name}} 团队，\n\n我在 Google 地图上看到你们的商户信息，想确认是否方便聊一个提升本地区客户转化的小合作。\n\n如果合适，我可以发一份很短的方案。`;
const defaultBodyHtml = [
  '<p>你好，{{name}} 团队，</p>',
  '<p>我在 Google 地图上看到你们的商户信息，想确认是否方便聊一个提升本地区客户转化的小合作。</p>',
  '<p>如果合适，我可以发一份很短的方案。</p>'
].join('');

const defaultSettings: SettingsPayload = {
  googleMapsApiKey: '',
  googleTranslateApiKey: '',
  openAiApiKey: '',
  openAiBaseUrl: 'https://api.openai.com/v1',
  openAiModel: 'gpt-4.1-mini',
  enrichmentEmailApiEndpoint: '',
  enrichmentEmailApiKey: '',
  yelpApiKey: '',
  foursquareApiKey: '',
  hunterApiKey: '',
  placesLanguageCode: 'zh-CN',
  placesRegionCode: 'US',
  smtp: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: ''
  },
  jarvisEmailEndpoint: '',
  jarvisEmailToken: '',
  unsubscribeUrl: 'https://example.com/unsubscribe',
  emailDailyLimit: 25
};

function mergeClientSettings(settingsResult: SettingsPayload) {
  return { ...defaultSettings, ...settingsResult, smtp: { ...defaultSettings.smtp, ...settingsResult.smtp } };
}

function App() {
  const savedSearchForm = useMemo(getSavedSearchForm, []);
  const savedSearchMode = isSearchMode(savedSearchForm.searchMode) ? savedSearchForm.searchMode : 'smart';
  const savedMaxResults = normalizeSavedMaxResults(savedSearchForm.maxResults);
  const savedEmailDiscoveryDepth = normalizeEmailDiscoveryDepth(savedSearchForm.emailDiscoveryDepth);
  const savedAreaTargets = normalizeSavedAreaTargets(savedSearchForm.areaTargets);
  const [health, setHealth] = useState<Health | null>(null);
  const [payload, setPayload] = useState<StorePayload>({ leads: [], searches: [], campaigns: [], tasks: [], sendLog: [] });
  const [settings, setSettings] = useState<SettingsPayload>(defaultSettings);
  const [adminToken, setAdminToken] = useState(getSessionAdminToken);
  const [authMessage, setAuthMessage] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [legalView, setLegalView] = useState<LegalDocumentKey | null>(null);
  const [authState, setAuthState] = useState<AuthState>({ membershipEnabled: true, user: null, plans: {}, usage: [] });
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [adminUsers, setAdminUsers] = useState<MembershipUser[]>([]);
  const [activeSettingsView, setActiveSettingsView] = useState<SettingsView>('workspace');
  const [activeLeadKeyword, setActiveLeadKeyword] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyword, setKeyword] = useState(savedSearchForm.keyword || 'dentist');
  const [area, setArea] = useState(savedSearchForm.area || 'New York, NY');
  const [countryCode, setCountryCode] = useState(savedSearchForm.countryCode || 'US');
  const [translatedKeyword, setTranslatedKeyword] = useState(savedSearchForm.translatedKeyword || 'dentist');
  const [onlyTranslatedKeyword, setOnlyTranslatedKeyword] = useState(Boolean(savedSearchForm.onlyTranslatedKeyword));
  const [searchMode, setSearchMode] = useState<SearchMode>(savedSearchMode);
  const [placeType, setPlaceType] = useState(savedSearchForm.placeType || 'dentist');
  const [keywordStrategy, setKeywordStrategy] = useState<KeywordStrategy | null>(null);
  const [maxResults, setMaxResults] = useState(savedMaxResults);
  const includeEmailDiscovery = true;
  const [emailDiscoveryDepth, setEmailDiscoveryDepth] = useState(savedEmailDiscoveryDepth);
  const [recipientInput, setRecipientInput] = useState('');
  const [emailAiKeywords, setEmailAiKeywords] = useState('');
  const [emailDrafts, setEmailDrafts] = useState<EmailDraft[]>([]);
  const [whatsAppAiKeywords, setWhatsAppAiKeywords] = useState('');
  const [whatsAppDrafts, setWhatsAppDrafts] = useState<WhatsAppDraft[]>([]);
  const [whatsAppMessage, setWhatsAppMessage] = useState('');
  const [whatsAppQueue, setWhatsAppQueue] = useState<WhatsAppQueueItem[]>([]);
  const [campaignExpanded, setCampaignExpanded] = useState(false);
  const [whatsAppExpanded, setWhatsAppExpanded] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [bodyHtml, setBodyHtml] = useState(defaultBodyHtml);
  const [dryRun, setDryRun] = useState(true);
  const [campaignPreview, setCampaignPreview] = useState<EmailPreview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [translationMenuOpen, setTranslationMenuOpen] = useState(false);
  const [whatsAppTranslationMenuOpen, setWhatsAppTranslationMenuOpen] = useState(false);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [areaManual, setAreaManual] = useState('');
  const [selectedProvinceName, setSelectedProvinceName] = useState('');
  const [selectedCityNames, setSelectedCityNames] = useState<string[]>([]);
  const [selectedDistrictPaths, setSelectedDistrictPaths] = useState<string[]>([]);
  const [districtText, setDistrictText] = useState('');
  const [areaTargets, setAreaTargets] = useState<string[]>(savedAreaTargets);
  const [pageTargets, setPageTargets] = useState<SearchPageTarget[]>([]);
  const countryPickerRef = useRef<HTMLDivElement | null>(null);
  const areaPickerRef = useRef<HTMLDivElement | null>(null);
  const translationMenuRef = useRef<HTMLDivElement | null>(null);
  const whatsAppTranslationMenuRef = useRef<HTMLDivElement | null>(null);
  const whatsAppMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const loadedWhatsAppStorageKeyRef = useRef('');
  const countryInitializedRef = useRef(false);
  const restoredTranslatedKeywordRef = useRef(Boolean(savedSearchForm.translatedKeyword));

  const selectedCountry = useMemo(
    () => countries.find((country) => country.code === countryCode) || countries.find((country) => country.code === 'US')!,
    [countryCode]
  );
  const countryAreas = useMemo<AreaProvince[]>(() => {
    return areaCatalog[countryCode] || [{ name: selectedCountry.name, code: '', cities: [] }];
  }, [countryCode, selectedCountry.name]);
  const selectedProvince = useMemo(
    () => countryAreas.find((province) => province.name === selectedProvinceName),
    [countryAreas, selectedProvinceName]
  );
  const selectedProvinceCities = useMemo<AreaCity[]>(() => {
    if (!selectedProvince) return [];
    return selectedProvince.cities
      .map((city) => ({ name: city.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedProvince]);
  const leadsWithEmail = useMemo(() => payload.leads.filter((lead) => Array.isArray(lead.emails) && lead.emails.length), [payload.leads]);
  const callableLeads = useMemo(() => payload.leads.filter((lead) => lead.phone), [payload.leads]);
  const leadKeywordTabs = useMemo(() => {
    const tabs = new Map<string, { key: string; label: string; sources: Set<string> }>();
    for (const search of payload.searches) {
      const label = String(search.keyword || '').trim();
      const key = normalizeSearchKeyword(label);
      if (!key) continue;
      const existing = tabs.get(key) || { key, label, sources: new Set<string>() };
      existing.sources.add(buildSearchSource(search.keyword, search.area));
      tabs.set(key, existing);
    }

    return Array.from(tabs.values()).map((tab) => ({
      ...tab,
      count: payload.leads.filter((lead) => {
        const leadSources = getLeadSearchSources(lead);
        return Array.from(tab.sources).some((source) => leadSources.has(source));
      }).length
    }));
  }, [payload.leads, payload.searches]);
  const filteredLeads = useMemo(() => {
    const tab = activeLeadKeyword === 'all' ? null : leadKeywordTabs.find((item) => item.key === activeLeadKeyword);
    const byKeyword = tab
      ? payload.leads.filter((lead) => {
          const leadSources = getLeadSearchSources(lead);
          return Array.from(tab.sources).some((source) => leadSources.has(source));
        })
      : payload.leads;
    return [...byKeyword].sort((left, right) => {
      const priority = getLeadContactPriority(left) - getLeadContactPriority(right);
      if (priority !== 0) return priority;
      return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime();
    });
  }, [activeLeadKeyword, leadKeywordTabs, payload.leads]);
  const recipientCount = useMemo(() => parseRecipientEmails(recipientInput).length, [recipientInput]);
  const activeLeadTab = useMemo(
    () => leadKeywordTabs.find((item) => item.key === activeLeadKeyword) || null,
    [activeLeadKeyword, leadKeywordTabs]
  );
  const latestTasks = useMemo(() => {
    return [...payload.tasks]
      .sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime())
      .slice(0, 8);
  }, [payload.tasks]);
  const latestSendLogs = useMemo(() => {
    return [...payload.sendLog]
      .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
      .slice(0, 12);
  }, [payload.sendLog]);
  const filteredCountries = useMemo(() => {
    const query = countryFilter.trim().toLowerCase();
    if (!query) return countries;
    return countries.filter((country) => {
      return [country.name, country.code, country.languageName, country.language]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [countryFilter]);
  const searchKeyword = useMemo(() => {
    const translated = translatedKeyword.trim();
    const original = keyword.trim();
    if (onlyTranslatedKeyword) return translated || original;
    if (translated && translated.toLowerCase() !== original.toLowerCase()) return `${original} ${translated}`.trim();
    return original;
  }, [keyword, translatedKeyword, onlyTranslatedKeyword]);
  const suggestedBusinessProfile = useMemo(() => inferClientBusinessProfile(keyword), [keyword]);
  const sendDisabledReason = useMemo(() => {
    if (dryRun) return '当前处于 Dry-run 预演模式，取消勾选后才能真实发送。';
    if (health?.emailReady === false) return (health.emailIssues || []).join('；') || '真实邮件发送尚未就绪。';
    if (!parseRecipientEmails(recipientInput).length && !leadsWithEmail.length) {
      return '没有可发送的收件人，请输入收件人邮箱，或先在线索库中发现邮箱。';
    }
    return '';
  }, [dryRun, health?.emailIssues, health?.emailReady, leadsWithEmail.length, recipientInput]);
  const sendActionDisabled = busy === 'send' || busy === 'preview' || busy === 'translate' || Boolean(sendDisabledReason);
  const canManageGlobalApiSettings = ['super_admin', 'admin'].includes(authState.user?.role || '');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(searchFormStorageKey, JSON.stringify({
      keyword,
      area,
      countryCode,
      translatedKeyword,
      onlyTranslatedKeyword,
      searchMode,
      placeType,
      maxResults,
      includeEmailDiscovery,
      emailDiscoveryDepth,
      areaTargets
    }));
  }, [
    keyword,
    area,
    countryCode,
    translatedKeyword,
    onlyTranslatedKeyword,
    searchMode,
    placeType,
    maxResults,
    includeEmailDiscovery,
    emailDiscoveryDepth,
    areaTargets
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!authLoaded) return;
      const storageKey = getWhatsAppStorageKey(authState.user?.id || '');
      window.localStorage.setItem(storageKey, JSON.stringify({
        message: whatsAppMessage,
        queue: whatsAppQueue
      }));
    } catch {
      // Ignore quota / serialization failures.
    }
  }, [authLoaded, authState.user?.id, whatsAppMessage, whatsAppQueue]);

  useEffect(() => {
    if (!authLoaded) return;
    const storageKey = getWhatsAppStorageKey(authState.user?.id || '');
    if (loadedWhatsAppStorageKeyRef.current === storageKey) return;
    loadedWhatsAppStorageKeyRef.current = storageKey;
    const savedWhatsAppState = getSavedWhatsAppState(storageKey);
    setWhatsAppMessage(typeof savedWhatsAppState.message === 'string' ? savedWhatsAppState.message : '');
    setWhatsAppQueue(normalizeSavedWhatsAppQueue(savedWhatsAppState.queue));
  }, [authLoaded, authState.user?.id]);

  useEffect(() => {
    setPageTargets([]);
  }, [searchKeyword, area, maxResults, includeEmailDiscovery, emailDiscoveryDepth, countryCode, searchMode, placeType]);

  useEffect(() => {
    if (activeLeadKeyword !== 'all' && !leadKeywordTabs.some((tab) => tab.key === activeLeadKeyword)) {
      setActiveLeadKeyword('all');
    }
  }, [activeLeadKeyword, leadKeywordTabs]);

  useEffect(() => {
    if (!canManageGlobalApiSettings && ['google', 'translate', 'ai', 'email', 'members'].includes(activeSettingsView)) {
      setActiveSettingsView('workspace');
    }
  }, [activeSettingsView, canManageGlobalApiSettings]);

  useEffect(() => {
    if (restoredTranslatedKeywordRef.current) {
      restoredTranslatedKeywordRef.current = false;
      return;
    }
    setTranslatedKeyword(translateKeyword(keyword, selectedCountry.language));
  }, [keyword, selectedCountry.language]);

  useEffect(() => {
    if (!placeType && suggestedBusinessProfile.types[0]) {
      setPlaceType(suggestedBusinessProfile.types[0]);
    }
  }, [placeType, suggestedBusinessProfile.types]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!countryPickerRef.current?.contains(event.target as Node)) {
        setCountryMenuOpen(false);
      }
      if (!areaPickerRef.current?.contains(event.target as Node)) {
        setAreaPickerOpen(false);
      }
      if (!translationMenuRef.current?.contains(event.target as Node)) {
        setTranslationMenuOpen(false);
      }
      if (!whatsAppTranslationMenuRef.current?.contains(event.target as Node)) {
        setWhatsAppTranslationMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    setSelectedProvinceName('');
    setSelectedCityNames([]);
    setSelectedDistrictPaths([]);
    setDistrictText('');
    setAreaTargets([]);
    setAreaManual('');
  }, [countryCode]);

  function selectCountry(code: string) {
    setCountryCode(code);
    setArea('');
    setAreaTargets([]);
    setPageTargets([]);
    setCountryMenuOpen(false);
    setCountryFilter('');
  }

  async function refresh() {
    const healthResult = await api<Health>('/api/health');
    setHealth(healthResult);
    const sessionResult = await api<AuthState>('/api/auth/session');
    setAuthState(sessionResult);
    setAuthLoaded(true);
    if (sessionResult.membershipEnabled && !sessionResult.user) {
      setPayload({ leads: [], searches: [], campaigns: [], tasks: [], sendLog: [] });
      setAdminUsers([]);
      return;
    }
    if (healthResult.authRequired && !getSessionAdminToken()) {
      setPayload({ leads: [], searches: [], campaigns: [], tasks: [], sendLog: [] });
      setSettings(defaultSettings);
      setAuthMessage('请输入管理员 Token 以加载受保护的数据。');
      return;
    }
    const [storeResult, settingsResult] = await Promise.all([
      api<StorePayload>('/api/leads'),
      api<{ settings: SettingsPayload }>('/api/settings')
    ]);
    setPayload(storeResult);
    const mergedSettings = mergeClientSettings(settingsResult.settings);
    if (activeSettingsView === 'workspace') {
      setSettings(mergedSettings);
    }
    if (sessionResult.user && ['super_admin', 'admin'].includes(sessionResult.user.role)) {
      const usersResult = await api<{ users: MembershipUser[] }>('/api/admin/users').catch(() => ({ users: [] }));
      setAdminUsers(usersResult.users);
    }
    if (!countryInitializedRef.current) {
      const configuredCountry = String(mergedSettings.placesRegionCode || '').toUpperCase();
      if (countries.some((country) => country.code === configuredCountry) && configuredCountry !== countryCode) {
        selectCountry(configuredCountry);
      }
      countryInitializedRef.current = true;
    }
  }

  const refreshPollRef = useRef(refresh);

  useEffect(() => {
    refreshPollRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshPollRef.current().catch(() => {});
    }, 8000);
    return () => window.clearInterval(interval);
  }, []);

  async function applyAdminToken() {
    const token = adminToken.trim();
    if (token) window.sessionStorage.setItem('leadgen-admin-token', token);
    else window.sessionStorage.removeItem('leadgen-admin-token');
    setAuthMessage('');
    try {
      await refresh();
      setAuthMessage(token ? '管理员 Token 验证成功。' : '管理员 Token 已清除。');
    } catch (error) {
      setPayload({ leads: [], searches: [], campaigns: [], tasks: [], sendLog: [] });
      setSettings(defaultSettings);
      setAuthMessage(error instanceof Error ? error.message : '管理员 Token 验证失败');
    }
  }

  async function submitAuth() {
    setBusy('membership-auth');
    setAuthMessage('');
    try {
      const result = await api<AuthState & { token: string }>(authMode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(authForm)
      });
      window.localStorage.setItem('leadgen-membership-token', result.token);
      setAuthState(result);
      setAuthForm({ name: '', email: '', password: '' });
      setAuthMessage(authMode === 'register' ? '注册成功，已登录。' : '登录成功。');
      await refresh();
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '登录失败');
    } finally {
      setBusy('');
    }
  }

  async function logoutMembership() {
    setBusy('membership-auth');
    try {
      await api<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => ({ ok: true }));
    } finally {
      window.localStorage.removeItem('leadgen-membership-token');
      setAuthState((current) => ({ ...current, user: null, usage: [] }));
      setAdminUsers([]);
      setBusy('');
    }
  }

  async function updateMembershipUser(userId: string, patch: Partial<MembershipUser>) {
    setBusy(`membership-user:${userId}`);
    setSettingsMessage('');
    try {
      const result = await api<{ user: MembershipUser }>(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      setAdminUsers((users) => users.map((user) => user.id === userId ? result.user : user));
      if (authState.user?.id === userId) {
        setAuthState((current) => ({ ...current, user: result.user }));
      }
      setSettingsMessage('会员信息已更新。');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : '会员信息更新失败');
    } finally {
      setBusy('');
    }
  }

  async function saveSettings(returnToWorkspace = false) {
    setBusy('settings');
    setSettingsMessage('');
    try {
      const result = await api<{ settings: SettingsPayload }>('/api/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      setSettings(mergeClientSettings(result.settings));
      setSettingsMessage('设置已保存');
      await refresh();
      if (returnToWorkspace) setActiveSettingsView('workspace');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  async function testSmtpConnection() {
    setBusy('smtp-test');
    setSettingsMessage('');
    try {
      const saved = await api<{ settings: SettingsPayload }>('/api/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      setSettings(mergeClientSettings(saved.settings));
      const result = await api<{ message: string }>('/api/email/test-smtp', { method: 'POST' });
      setSettingsMessage(result.message);
      await refresh();
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : 'SMTP 测试失败');
    } finally {
      setBusy('');
    }
  }

  async function downloadLeadsCsv() {
    setMessage('');
    try {
      const csv = leadsToClientCsv(filteredLeads);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'leads.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败');
    }
  }

  async function deleteLeadGroup(action: 'tag' | 'contents') {
    if (!activeLeadTab) return;
    setBusy('delete-lead-group');
    setMessage('');
    try {
      const response = await api<{
        result: {
          keyword: string;
          deletedSearches: number;
          deletedLeads: number;
          detachedLeads: number;
        };
      }>('/api/lead-groups', {
        method: 'DELETE',
        body: JSON.stringify({ keyword: activeLeadTab.label, action })
      });
      setDeleteDialogOpen(false);
      if (action === 'tag') {
        setActiveLeadKeyword('all');
        setMessage(`已删除“${response.result.keyword}”标签，线索信息已保留。`);
      } else {
        setMessage(
          `已清空“${response.result.keyword}”标签：删除 ${response.result.deletedLeads} 条独有线索，` +
          `保留 ${response.result.detachedLeads} 条同时属于其他标签的线索。`
        );
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
    } finally {
      setBusy('');
    }
  }

  async function deleteAllLeads() {
    setBusy('delete-lead-group');
    setMessage('');
    try {
      const response = await api<{
        result: { deletedLeads: number; deletedSearches: number };
      }>('/api/leads', { method: 'DELETE' });
      setDeleteDialogOpen(false);
      setActiveLeadKeyword('all');
      setMessage(
        `已删除全部线索信息：${response.result.deletedLeads} 条线索，` +
        `${response.result.deletedSearches} 个关键词搜索记录。`
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
    } finally {
      setBusy('');
    }
  }

  function chooseProvince(provinceName: string) {
    setSelectedProvinceName(provinceName);
    setSelectedCityNames([]);
    setSelectedDistrictPaths([]);
    setDistrictText('');
  }

  function toggleCity(cityName: string) {
    setSelectedCityNames((current) => {
      if (current.includes(cityName)) {
        setSelectedDistrictPaths((paths) => paths.filter((path) => !path.startsWith(`${cityName}::`)));
        return current.filter((name) => name !== cityName);
      }
      return [...current, cityName];
    });
  }

  function toggleDistrict(cityName: string, districtName: string) {
    const path = `${cityName}::${districtName}`;
    setSelectedCityNames((current) => current.includes(cityName) ? current : [...current, cityName]);
    setSelectedDistrictPaths((current) => current.includes(path)
      ? current.filter((item) => item !== path)
      : [...current, path]
    );
  }

  function buildConfirmedAreaTargets() {
    const manual = areaManual.trim();
    const targets: string[] = [];
    if (manual) targets.push(manual);

    if (!selectedProvince) return targets;

    const province = selectedProvince.name;
    if (!selectedCityNames.length) {
      targets.push(`${province}, ${selectedCountry.name}`);
      return targets;
    }

    const districtEntries = districtText
      .split(/[,\n，、;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    for (const cityName of selectedCityNames) {
      const districts = selectedDistrictPaths
        .filter((path) => path.startsWith(`${cityName}::`))
        .map((path) => path.split('::')[1]);
      const mergedDistricts = [...districts, ...districtEntries];

      if (!mergedDistricts.length) {
        targets.push(`${cityName}, ${province}, ${selectedCountry.name}`);
        continue;
      }

      for (const district of mergedDistricts) {
        targets.push(`${district}, ${cityName}, ${province}, ${selectedCountry.name}`);
      }
    }

    return Array.from(new Set(targets));
  }

  function confirmAreaSelection() {
    const targets = buildConfirmedAreaTargets();
    if (!targets.length) return;
    setAreaTargets(targets);
    setArea(targets.join('；'));
    setAreaPickerOpen(false);
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, []);

  function requestSearch(targetArea: string, pageToken = '') {
    const normalizedPlaceType = normalizeClientPlaceType(placeType, keyword);
    return api<SearchResponse>('/api/searches', {
      method: 'POST',
      body: JSON.stringify({
        keyword: searchKeyword,
        area: targetArea,
        maxResults,
        includeEmailDiscovery,
        emailDiscoveryDepth,
        pageToken,
        languageCode: selectedCountry.language,
        regionCode: countryCode,
        searchMode,
        placeType: normalizedPlaceType
      })
    });
  }

  async function analyzeSearchKeywords() {
    setBusy('keyword-analysis');
    setMessage('');
    try {
      const result = await api<{ strategy: KeywordStrategy }>('/api/searches/analyze-keywords', {
        method: 'POST',
        body: JSON.stringify({
          keywords: keyword,
          country: selectedCountry.name,
          region: area
        })
      });
      setKeywordStrategy(result.strategy);
      setMessage(result.strategy.source === 'fallback'
        ? '已生成基础关键词策略。配置 OpenAI API Key 后可获得更完整的 AI 分析。'
        : 'AI 关键词分析已完成，请确认策略后再执行搜索。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 关键词分析失败');
    } finally {
      setBusy('');
    }
  }

  function applyKeywordStrategy(strategy: KeywordStrategy, batch?: KeywordStrategy['searchBatches'][number]) {
    const selectedBatch = batch || strategy.searchBatches[0];
    const nextKeyword = selectedBatch?.keyword || strategy.searchKeywords[0] || '';
    if (nextKeyword) {
      setKeyword(nextKeyword);
      setTranslatedKeyword(nextKeyword);
    }
    setSearchMode(selectedBatch?.mode || strategy.recommendedMode || 'smart');
    if (selectedBatch?.placeType || strategy.primaryPlaceType) setPlaceType(selectedBatch?.placeType || strategy.primaryPlaceType);
    setPageTargets([]);
    setMessage('搜索策略已应用，请检查区域和数量后点击开始搜索。');
  }

  async function runSearch() {
    setBusy('search');
    setMessage('');
    setPageTargets([]);
    try {
      const targets = areaTargets.length ? areaTargets : [area.trim()].filter(Boolean);
      if (!targets.length) throw new Error('请先选择或输入搜索区域。');
      if (targets.length > 1) {
        let created = 0;
        let updated = 0;
        let latestLeads: Lead[] = payload.leads;
        const nextPages: SearchPageTarget[] = [];

        for (const targetArea of targets) {
          const result = await requestSearch(targetArea);
          created += result.created;
          updated += result.updated;
          latestLeads = result.leads;
          if (result.search.nextPageToken) nextPages.push({ area: targetArea, token: result.search.nextPageToken });
        }

        setPayload((current) => ({ ...current, leads: latestLeads }));
        setPageTargets(nextPages);
        setMessage(`本次使用关键词“${searchKeyword}”，搜索 ${targets.length} 个区域，新增 ${created} 条，更新 ${updated} 条线索。`);
        await refresh();
        setActiveLeadKeyword(normalizeSearchKeyword(searchKeyword));
        return;
      }

      const result = await requestSearch(targets[0]);
      setPayload((current) => ({ ...current, leads: result.leads }));
      setPageTargets(result.search.nextPageToken ? [{ area: targets[0], token: result.search.nextPageToken }] : []);
      setMessage(`本次使用关键词“${searchKeyword}”，新增 ${result.created} 条，更新 ${result.updated} 条线索。`);
      await refresh();
      setActiveLeadKeyword(normalizeSearchKeyword(searchKeyword));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '搜索失败');
    } finally {
      setBusy('');
    }
  }

  async function loadMoreSearchResults() {
    if (!pageTargets.length) return;
    setBusy('search-more');
    setMessage('');
    try {
      let created = 0;
      let updated = 0;
      let latestLeads = payload.leads;
      const nextPages: SearchPageTarget[] = [];
      for (const page of pageTargets) {
        const result = await requestSearch(page.area, page.token);
        created += result.created;
        updated += result.updated;
        latestLeads = result.leads;
        if (result.search.nextPageToken) nextPages.push({ area: page.area, token: result.search.nextPageToken });
      }
      setPayload((current) => ({ ...current, leads: latestLeads }));
      setPageTargets(nextPages);
      setMessage(`下一页加载完成：新增 ${created} 条，更新 ${updated} 条线索。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载下一页失败');
    } finally {
      setBusy('');
    }
  }

  async function retryTask(taskId: string) {
    setBusy(`retry-task:${taskId}`);
    setMessage('');
    try {
      const result = await api<SearchResponse & { retriedFrom: string }>(`/api/tasks/${taskId}/retry`, {
        method: 'POST'
      });
      setPayload((current) => ({ ...current, leads: result.leads }));
      setPageTargets(result.search.nextPageToken ? [{ area: result.search.area, token: result.search.nextPageToken }] : []);
      setActiveLeadKeyword(normalizeSearchKeyword(result.search.keyword));
      setMessage(`重试完成：新增 ${result.created} 条，更新 ${result.updated} 条线索。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '任务重试失败');
    } finally {
      setBusy('');
    }
  }

  async function clearFinishedTasks() {
    setBusy('clear-tasks');
    setMessage('');
    try {
      const response = await api<{ result: { deletedTasks: number } }>('/api/tasks?status=done,failed', {
        method: 'DELETE'
      });
      setMessage(`已清理 ${response.result.deletedTasks} 条已完成/失败任务。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '清理任务失败');
    } finally {
      setBusy('');
    }
  }

  async function clearSendLogs() {
    setBusy('clear-send-log');
    setMessage('');
    try {
      const response = await api<{ result: { deletedSendLog: number } }>('/api/send-log', {
        method: 'DELETE'
      });
      setMessage(`已清理 ${response.result.deletedSendLog} 条发送记录。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '清理发送记录失败');
    } finally {
      setBusy('');
    }
  }

  function loadCampaignTask(task: StorePayload['tasks'][number]) {
    const context = task.context || {};
    const nextRecipients = Array.isArray(context.recipients)
      ? context.recipients.filter((email): email is string => typeof email === 'string' && email.trim().length > 0)
      : [];
    const nextSubject = typeof context.subject === 'string' ? context.subject : '';
    const nextBody = typeof context.body === 'string' ? context.body : '';
    const nextHtmlBody = typeof context.htmlBody === 'string' ? context.htmlBody : '';
    const nextDryRun = typeof context.dryRun === 'boolean' ? context.dryRun : true;

    if (!nextSubject && !nextBody && !nextHtmlBody && !nextRecipients.length) {
      setMessage('这条旧任务没有保存可恢复的邮件内容。');
      return;
    }

    const confirmed = window.confirm('是否把这条发送任务载入到邮件活动编辑区？载入后不会自动发送。');
    if (!confirmed) return;

    setRecipientInput(nextRecipients.join(', '));
    if (nextSubject) setSubject(nextSubject);
    if (nextBody) setBody(nextBody);
    if (nextHtmlBody) setBodyHtml(nextHtmlBody);
    setDryRun(nextDryRun);
    setCampaignPreview(null);
    setActiveSettingsView('workspace');
    setCampaignExpanded(true);
    setMessage('已载入发送任务内容，请检查后再手动发送。');
    window.setTimeout(() => {
      document.querySelector('.campaign-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function addLeadEmailsToRecipients(lead: Lead) {
    const leadEmails = Array.isArray(lead.emails)
      ? lead.emails.map((email) => email.trim()).filter(Boolean)
      : [];
    if (!leadEmails.length) {
      setMessage('这条线索还没有邮箱地址。请重新搜索或确认官网是否公开了邮箱。');
      return;
    }

    setRecipientInput((current) => {
      const merged = Array.from(new Set([...parseRecipientEmails(current), ...leadEmails]));
      return merged.join(', ');
    });
    setCampaignPreview(null);
    setCampaignExpanded(true);
    setMessage(`已将 ${leadEmails.length} 个邮箱加入收件人。`);
  }

  function buildWhatsAppMessageContext(item: WhatsAppQueueItem, lead?: Lead | null): WhatsAppMessageContext {
    return {
      name: lead?.name || item.name,
      companyType: lead?.companyType || '',
      phone: lead?.phone || item.normalizedPhone,
      website: lead?.website || item.source || '',
      address: lead?.address || '',
      source: lead?.website || lead?.address || item.source || ''
    };
  }

  function insertWhatsAppTemplateToken(token: string) {
    const target = whatsAppMessageRef.current;
    if (!target) {
      setWhatsAppMessage((current) => `${current}${token}`);
      return;
    }

    const start = target.selectionStart ?? whatsAppMessage.length;
    const end = target.selectionEnd ?? whatsAppMessage.length;
    const nextValue = `${whatsAppMessage.slice(0, start)}${token}${whatsAppMessage.slice(end)}`;
    setWhatsAppMessage(nextValue);
    window.requestAnimationFrame(() => {
      target.focus();
      const cursor = start + token.length;
      target.setSelectionRange(cursor, cursor);
    });
  }

  function addLeadPhoneToWhatsAppQueue(lead: Lead) {
    const confirmedContact = getLeadWhatsAppContact(lead);
    if (confirmedContact?.url && !confirmedContact.phone) {
      const openedWindow = window.open(confirmedContact.url, '_blank');
      if (!openedWindow) {
        setMessage('浏览器拦截了 WhatsApp 链接，请允许弹窗后再试。');
        return;
      }
      try {
        openedWindow.opener = null;
      } catch {
        // Ignore older browsers.
      }
      setMessage('已打开确认过的 WhatsApp 联系链接。');
      return;
    }

    const rawPhone = String(confirmedContact?.phone || lead.phone || '').trim();
    const normalizedPhone = normalizeWhatsAppPhone(rawPhone);
    if (!normalizedPhone) {
      setMessage('这条线索还没有可用的 WhatsApp 号码或电话。');
      return;
    }

    let alreadyQueued = false;
    setWhatsAppQueue((current) => {
      alreadyQueued = current.some((item) => item.normalizedPhone === normalizedPhone);
      if (alreadyQueued) return current;
      return [
        ...current,
        {
          id: `${lead.id}:${normalizedPhone}`,
          leadId: lead.id,
          name: lead.name || lead.companyType || normalizedPhone,
          phone: rawPhone,
          normalizedPhone,
          source: confirmedContact?.url || lead.website || lead.address || lead.companyType || ''
        }
      ];
    });
    setWhatsAppExpanded(true);
    setMessage(alreadyQueued ? '这个号码已经在 WhatsApp 队列中。' : `已将 ${lead.name || normalizedPhone} 加入 WhatsApp 队列。`);
  }

  function removeWhatsAppQueueItem(itemId: string) {
    setWhatsAppQueue((current) => current.filter((item) => item.id !== itemId));
  }

  async function copyWhatsAppMessage() {
    if (!whatsAppMessage.trim()) {
      setMessage('Enter a WhatsApp message first.');
      return;
    }

    try {
      const copied = await copyTextToClipboard(whatsAppMessage);
      setMessage(copied ? 'WhatsApp message copied.' : 'Clipboard copy is not supported in this browser.');
    } catch {
      setMessage('Clipboard copy is not supported in this browser.');
    }
  }

  function openWhatsAppPhone(phone: string, options?: { quiet?: boolean; context?: WhatsAppMessageContext }) {
    const renderedMessage = renderWhatsAppMessage(whatsAppMessage, options?.context);
    const url = buildWhatsAppUrl(phone, renderedMessage);
    if (!url) {
      setMessage('This WhatsApp phone number is not valid.');
      return false;
    }
    const openedWindow = window.open(url, '_blank');
    if (!openedWindow) {
      setMessage('浏览器拦截了 WhatsApp 新窗口，号码已保留在队列中。请允许弹窗后再试。');
      return false;
    }
    try {
      openedWindow.opener = null;
    } catch {
      // Some browsers block opener access for cross-origin windows.
    }
    if (!options?.quiet) {
      setMessage(isMobileBrowser() ? 'WhatsApp opened on this device.' : 'WhatsApp Web opened in a new tab.');
    }
    return true;
  }

  function openNextWhatsAppChat() {
    if (!whatsAppQueue.length) {
      setMessage('Add at least one lead phone number to the WhatsApp queue first.');
      return;
    }
    const nextItem = whatsAppQueue[0];
    const nextLead = payload.leads.find((lead) => lead.id === nextItem.leadId) || null;
    const opened = openWhatsAppPhone(nextItem.normalizedPhone, {
      quiet: true,
      context: buildWhatsAppMessageContext(nextItem, nextLead)
    });
    if (!opened) return;
    setWhatsAppQueue((current) => current.slice(1));
    setMessage(`已打开下一条：${nextItem.name}。`);
  }

  function clearWhatsAppQueue() {
    setWhatsAppQueue([]);
    setMessage('WhatsApp queue cleared.');
  }

  async function enrichLeadWaterfall(lead: Lead) {
    setBusy(`enrich-lead:${lead.id}`);
    setMessage('');
    try {
      const result = await api<{ lead: Lead; discovered: string[]; steps: Lead['enrichmentSteps'] }>(`/api/leads/${lead.id}/discover-email`, {
        method: 'POST',
        body: JSON.stringify({ emailDiscoveryDepth, enableAiResearch: true })
      });
      setPayload((current) => ({
        ...current,
        leads: current.leads.map((item) => item.id === lead.id ? result.lead : item)
      }));
      setMessage(`瀑布式补全完成：发现 ${result.discovered.length} 个邮箱。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '瀑布式补全失败');
    } finally {
      setBusy('');
    }
  }

  async function translateCampaign(targetLanguage: string) {
    setBusy('translate');
    setMessage('');
    setTranslationMenuOpen(false);
    try {
      const result = await api<EmailTranslation>('/api/email/translate', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body,
          htmlBody: bodyHtml,
          targetLanguage
        })
      });
      setSubject(result.subject);
      setBody(result.body);
      setBodyHtml(result.htmlBody);
      setCampaignPreview(null);
      setMessage(`已翻译为 ${result.targetLanguage}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '翻译失败');
    } finally {
      setBusy('');
    }
  }

  async function translateWhatsAppMessage(targetLanguage: string) {
    setBusy('translate');
    setMessage('');
    setWhatsAppTranslationMenuOpen(false);
    try {
      const result = await api<EmailTranslation>('/api/whatsapp/translate', {
        method: 'POST',
        body: JSON.stringify({
          body: whatsAppMessage,
          targetLanguage
        })
      });
      setWhatsAppMessage(result.body);
      setWhatsAppExpanded(true);
      setMessage(`WhatsApp 消息已翻译为 ${result.targetLanguage}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '翻译失败');
    } finally {
      setBusy('');
    }
  }

  async function generateEmailDrafts() {
    setBusy('email-ai');
    setMessage('');
    try {
      const result = await api<{ drafts: EmailDraft[] }>('/api/email/generate-drafts', {
        method: 'POST',
        body: JSON.stringify({
          keywords: emailAiKeywords || keyword,
          country: selectedCountry.name,
          region: area,
          audience: keywordStrategy?.customerProfile || searchKeyword
        })
      });
      setEmailDrafts(result.drafts);
      setMessage(`已生成 ${result.drafts.length} 版推广邮件，请选择合适的一版。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 邮件生成失败');
    } finally {
      setBusy('');
    }
  }

  async function generateWhatsAppDrafts() {
    setBusy('whatsapp-ai');
    setMessage('');
    try {
      const result = await api<{ drafts: WhatsAppDraft[] }>('/api/whatsapp/generate-drafts', {
        method: 'POST',
        body: JSON.stringify({
          keywords: whatsAppAiKeywords || keyword,
          country: selectedCountry.name,
          region: area,
          audience: keywordStrategy?.customerProfile || searchKeyword
        })
      });
      setWhatsAppDrafts(result.drafts);
      setWhatsAppExpanded(true);
      setMessage(`已生成 ${result.drafts.length} 版 WhatsApp 首次触达内容，请选择合适的一版。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI WhatsApp 文案生成失败');
    } finally {
      setBusy('');
    }
  }

  function applyEmailDraft(draft: EmailDraft) {
    const confirmed = window.confirm('是否直接替换当前主题和正文？');
    if (!confirmed) return;
    setSubject(draft.subject);
    setBody(draft.body);
    setBodyHtml(draft.htmlBody);
    setCampaignPreview(null);
    setMessage('已替换为选中的 AI 邮件版本。');
  }

  function applyWhatsAppDraft(draft: WhatsAppDraft) {
    const confirmed = window.confirm('是否直接替换当前 WhatsApp 消息内容？');
    if (!confirmed) return;
    setWhatsAppMessage(draft.message);
    setWhatsAppExpanded(true);
    setMessage('已替换为选中的 WhatsApp 首次触达版本。');
  }

  async function previewEmailCampaign() {
    setBusy('preview');
    setMessage('');
    try {
      const result = await api<{ preview: EmailPreview }>('/api/campaigns/preview', {
        method: 'POST',
        body: JSON.stringify({
          recipients: parseRecipientEmails(recipientInput),
          subject,
          body,
          htmlBody: bodyHtml,
          dryRun: true
        })
      });
      setCampaignPreview(result.preview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '生成预览失败');
    } finally {
      setBusy('');
    }
  }

  async function sendCampaign() {
    setBusy('send');
    setMessage('');
    try {
      const result = await api<{
        mode: string;
        results: Array<{ status: string }>;
        limit?: { remainingBefore: number; selected: number };
      }>('/api/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({
          recipients: parseRecipientEmails(recipientInput),
          subject,
          body,
          htmlBody: bodyHtml,
          dryRun: false
        })
      });
      const sent = result.results.filter((item) => item.status === 'sent').length;
      const failed = result.results.filter((item) => item.status === 'failed').length;
      const skipped = result.results.filter((item) => item.status === 'skipped').length;
      setMessage(result.mode === 'dry-run'
        ? '当前没有配置真实邮件服务，本次未发送邮件。'
        : `发送完成：成功 ${sent} 封，失败 ${failed} 封，跳过 ${skipped} 封。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '发送失败');
    } finally {
      setBusy('');
    }
  }

  if (authLoaded && !authState.user) {
    return (
      <>
        <AuthGate
          mode={authMode}
          setMode={setAuthMode}
          form={authForm}
          setForm={setAuthForm}
          onSubmit={submitAuth}
          busy={busy === 'membership-auth'}
          message={authMessage}
          onOpenLegal={setLegalView}
        />
        <LegalCenter activeKey={legalView} onOpen={setLegalView} onClose={() => setLegalView(null)} />
      </>
    );
  }

  return (
    <div className="app-layout">
      <SettingsSidebar
        settings={settings}
        setSettings={setSettings}
        onSave={saveSettings}
        saving={busy === 'settings'}
        message={settingsMessage}
        activeSettingsView={activeSettingsView}
        setActiveSettingsView={setActiveSettingsView}
        authState={authState}
      />
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">IZYLEADS</p>
          <h1>获客工作台</h1>
        </div>
        <div className="topbar-controls">
          <div className="status-row">
            <span className={health?.googleConfigured ? 'pill success' : 'pill warning'}>
              <MapPin size={16} /> {health?.googleConfigured ? '数据源已就绪' : '数据源待配置'}
            </span>
            <span className={health?.emailReady ? 'pill success' : 'pill warning'}>
              <Mail size={16} /> {health?.emailReady ? `邮件已就绪：${health.mailerMode}` : `邮件未就绪：${health?.mailerMode || 'dry-run'}`}
            </span>
            <button className="icon-button" onClick={refresh} aria-label="刷新数据" title="刷新数据">
              <RefreshCw size={18} />
            </button>
          </div>
          {health?.authRequired && (
            <div className="auth-panel">
              <ShieldCheck size={17} />
              <input
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyAdminToken();
                }}
                placeholder="管理员 Token"
                aria-label="管理员 Token"
              />
              <button type="button" className="primary-small" onClick={applyAdminToken}>
                验证
              </button>
            </div>
          )}
          {authMessage && <div className="auth-message">{authMessage}</div>}
        </div>
      </header>

      <section className="metrics">
        <Metric label="全部线索" value={payload.leads.length} />
        <Metric label="有邮箱" value={leadsWithEmail.length} />
        <Metric label="有电话" value={callableLeads.length} />
        <Metric label="搜索批次" value={payload.searches.length} />
      </section>

      {message && <div className="notice">{message}</div>}

      {activeSettingsView !== 'workspace' ? (
        <SettingsDetailView
          view={activeSettingsView}
          settings={settings}
          setSettings={setSettings}
          onSave={() => saveSettings(true)}
          onTestSmtp={testSmtpConnection}
          busy={busy}
          saving={busy === 'settings'}
          testingSmtp={busy === 'smtp-test'}
          message={settingsMessage}
          authState={authState}
          authForm={authForm}
          setAuthForm={setAuthForm}
          authMode={authMode}
          setAuthMode={setAuthMode}
          onAuthSubmit={submitAuth}
          onLogout={logoutMembership}
          adminUsers={adminUsers}
          onUpdateUser={updateMembershipUser}
          latestTasks={latestTasks}
          latestSendLogs={latestSendLogs}
          totalSendLogs={payload.sendLog.length}
          onRefresh={refresh}
          onClearFinishedTasks={clearFinishedTasks}
          onRetryTask={retryTask}
          onLoadCampaignTask={loadCampaignTask}
          onClearSendLogs={clearSendLogs}
        />
      ) : (
      <>
      <section className="workspace-grid">
        <div className="panel search-panel">
          <div className="panel-title">
            <Search size={18} />
            <h2>搜索商户</h2>
          </div>
          <div className="search-form-grid">
            <div className="search-form-main">
          <div className="search-keyword-field">
            <div className="search-field-header">
              <span>关键词</span>
              <button
                type="button"
                className="ai-analysis-button"
                onClick={analyzeSearchKeywords}
                disabled={busy === 'keyword-analysis' || !keyword.trim()}
              >
                <Sparkles size={15} /> {busy === 'keyword-analysis' ? '分析中...' : 'AI关键词分析'}
              </button>
            </div>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="LCD, phone repair store, mobile parts" />
          </div>
          <label>
            <span className="label-icon"><Languages size={15} /> 关键词自动翻译</span>
            <input value={translatedKeyword} onChange={(event) => setTranslatedKeyword(event.target.value)} placeholder="选择国家后自动生成，也可以手动修改" />
          </label>
          <div className="search-mode-panel">
            <div className="segmented-control" role="tablist" aria-label="搜索模式">
              {[
                { value: 'keyword', label: '关键词' },
                { value: 'type', label: '行业类型' },
                { value: 'smart', label: '智能扩展' }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={searchMode === option.value ? 'active' : ''}
                  onClick={() => setSearchMode(option.value as SearchMode)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {searchMode !== 'keyword' && (
              <label className="compact-label">
                行业类型代码
                <input
                  value={placeType}
                  onChange={(event) => setPlaceType(event.target.value.trim())}
                  onBlur={() => setPlaceType((current) => normalizeClientPlaceType(current, keyword))}
                  placeholder="dentist, plumber, car_repair"
                />
              </label>
            )}
            {searchMode === 'smart' && (
              <div className="search-suggestions">
                {suggestedBusinessProfile.types.map((type) => (
                  <button type="button" key={type} onClick={() => setPlaceType(type)}>
                    {type}
                  </button>
                ))}
                {!suggestedBusinessProfile.types.length && commonPlaceTypes.slice(0, 6).map((type) => (
                  <button type="button" key={type} onClick={() => setPlaceType(type)}>
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
          {keywordStrategy && (
            <div className="keyword-strategy-panel">
              <div className="keyword-strategy-header">
                <div>
                  <strong>AI 搜索策略</strong>
                  <small>{keywordStrategy.source === 'fallback' ? '基础策略' : 'AI 分析结果'}</small>
                </div>
                <button type="button" onClick={() => setKeywordStrategy(null)} aria-label="关闭 AI 搜索策略">
                  <X size={15} />
                </button>
              </div>
              <p className="strategy-summary">{keywordStrategy.customerProfile}</p>
              <div className="strategy-chip-list">
                {keywordStrategy.searchKeywords.map((item) => <span key={item}>{item}</span>)}
              </div>
              {!!keywordStrategy.negativeKeywords.length && (
                <div className="strategy-muted">排除：{keywordStrategy.negativeKeywords.join('、')}</div>
              )}
              <div className="strategy-batch-list">
                {keywordStrategy.searchBatches.map((batch) => (
                  <div className="strategy-batch" key={`${batch.label}:${batch.keyword}`}>
                    <div>
                      <strong>{batch.label}</strong>
                      <span>{batch.keyword} · {batch.placeType || '关键词'}</span>
                    </div>
                    <button type="button" className="primary-small" onClick={() => applyKeywordStrategy(keywordStrategy, batch)}>
                      应用策略
                    </button>
                  </div>
                ))}
              </div>
              {!!keywordStrategy.notes.length && (
                <ul className="strategy-notes">
                  {keywordStrategy.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              )}
            </div>
          )}
            </div>
            <div className="search-form-side">
          <label>
            区域
            <div className="area-combobox" ref={areaPickerRef}>
              <input
                value={area}
                onChange={(event) => {
                  setArea(event.target.value);
                  setAreaTargets([]);
                }}
                onFocus={() => setAreaPickerOpen(true)}
                onClick={() => setAreaPickerOpen(true)}
                placeholder="Los Angeles, CA"
              />
              {areaPickerOpen && (
                <div className="area-popover">
                  <label className="compact-label">
                    手动区域
                    <input
                      value={areaManual}
                      onChange={(event) => setAreaManual(event.target.value)}
                      placeholder="也可以直接输入一个城市、商圈或地址"
                    />
                  </label>
                  <div className="area-picker-grid">
                    <div className="area-column">
                      <div className="area-column-title">省份 / 州</div>
                      <div className="area-option-list">
                        {countryAreas.map((province) => (
                          <button
                            key={province.name}
                            type="button"
                            className={province.name === selectedProvinceName ? 'area-option active' : 'area-option'}
                            onClick={() => chooseProvince(province.name)}
                          >
                            <span>{province.name}</span>
                            {province.name === selectedProvinceName && <Check size={15} />}
                          </button>
                        ))}
                        {!countryAreas.length && (
                          <div className="area-empty">该国家暂未内置省市区，可使用手动区域。</div>
                        )}
                      </div>
                    </div>
                    <div className="area-column">
                      <div className="area-column-title">城市</div>
                      <div className="area-option-list">
                        {selectedProvinceCities.map((city) => (
                          <button
                            key={city.name}
                            type="button"
                            className={selectedCityNames.includes(city.name) ? 'area-option active' : 'area-option'}
                            onClick={() => toggleCity(city.name)}
                          >
                            <span>{city.name}</span>
                            {selectedCityNames.includes(city.name) && <Check size={15} />}
                          </button>
                        ))}
                        {!selectedProvince && <div className="area-empty">先选择一个省份。</div>}
                      </div>
                    </div>
                    <div className="area-column">
                      <div className="area-column-title">地区</div>
                      <div className="area-option-list">
                        {selectedCityNames.length ? (
                          <label className="compact-label district-input">
                            地区补充
                            <textarea
                              value={districtText}
                              onChange={(event) => setDistrictText(event.target.value)}
                              rows={5}
                              placeholder="可输入区县、街区、商圈；多个用逗号或换行分隔"
                            />
                          </label>
                        ) : (
                          <div className="area-empty">可多选城市后补充区县、街区或商圈。</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="area-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setAreaManual('');
                        setSelectedProvinceName('');
                        setSelectedCityNames([]);
                        setSelectedDistrictPaths([]);
                        setAreaTargets([]);
                        setArea('');
                      }}
                    >
                      清空
                    </button>
                    <button type="button" className="primary-small" onClick={confirmAreaSelection}>
                      确认选择
                    </button>
                  </div>
                </div>
              )}
            </div>
          </label>
          <label>
            <span className="label-icon"><Globe2 size={15} /> 国家</span>
            <div className="country-combobox" ref={countryPickerRef}>
              <button
                type="button"
                className="country-trigger"
                onClick={() => {
                  setCountryMenuOpen((open) => !open);
                  setCountryFilter('');
                }}
                aria-haspopup="listbox"
                aria-expanded={countryMenuOpen}
              >
                <span>{selectedCountry.name} · {selectedCountry.languageName}</span>
                <span className="country-code">{selectedCountry.code}</span>
              </button>
              {countryMenuOpen && (
                <div className="country-popover">
                  <input
                    className="country-search"
                    autoFocus
                    value={countryFilter}
                    onChange={(event) => setCountryFilter(event.target.value)}
                    placeholder="输入国家名称、代码或语言"
                  />
                  <div className="country-list" role="listbox">
                    {filteredCountries.map((country) => (
                      <button
                        type="button"
                        key={country.code}
                        className={country.code === countryCode ? 'country-option active' : 'country-option'}
                        onClick={() => {
                          selectCountry(country.code);
                        }}
                        role="option"
                        aria-selected={country.code === countryCode}
                      >
                        <span>{country.name}</span>
                        <small>{country.code} · {country.languageName}</small>
                      </button>
                    ))}
                    {!filteredCountries.length && <div className="country-empty">没有匹配的国家</div>}
                  </div>
                </div>
              )}
            </div>
            <select className="country-native-select" value={countryCode} onChange={(event) => selectCountry(event.target.value)}>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name} · {country.languageName}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-fields">
            <label>
              数量
              <input type="number" min={1} value={maxResults} onChange={(event) => setMaxResults(Number(event.target.value))} />
            </label>
            <label>
              官网抓取深度
              <input
                type="number"
                min={0}
                max={3}
                value={emailDiscoveryDepth}
                onChange={(event) => setEmailDiscoveryDepth(normalizeEmailDiscoveryDepth(event.target.value))}
              />
            </label>
          </div>
          <label className="toggle search-toggle">
            <input
              type="checkbox"
              checked={onlyTranslatedKeyword}
              onChange={(event) => setOnlyTranslatedKeyword(event.target.checked)}
            />
            只搜索已翻译关键词
          </label>
          <button className="primary-action" onClick={runSearch} disabled={busy === 'search'}>
            <Play size={18} /> {busy === 'search' ? '搜索中' : '开始搜索'}
          </button>
          {pageTargets.length > 0 && (
            <button className="load-more-action" onClick={loadMoreSearchResults} disabled={busy === 'search-more'}>
              <RefreshCw size={18} /> {busy === 'search-more' ? '加载中' : `加载下一页 (${pageTargets.length})`}
            </button>
          )}
            </div>
          </div>
        </div>

        <div className={campaignExpanded ? 'panel campaign-panel expanded' : 'panel campaign-panel collapsed'}>
          <div className="campaign-panel-header">
            <div className="panel-title campaign-panel-title">
              <Send size={18} />
              <div>
                <h2>邮件活动</h2>
                <p>收件人、AI 文案、预览和邮件发送集中在这里</p>
              </div>
            </div>
            <button
              type="button"
              className="campaign-toggle-button"
              onClick={() => setCampaignExpanded((expanded) => !expanded)}
              aria-expanded={campaignExpanded}
            >
              {campaignExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              {campaignExpanded ? '收起' : '展开'}
            </button>
          </div>
          <div className="campaign-summary-row">
            <span><Mail size={14} /> 收件人 {recipientCount}</span>
            <span><Send size={14} /> {subject.trim() ? '主题已填' : '主题未填'}</span>
            <span className={sendDisabledReason ? 'warning' : 'success'}><ShieldCheck size={14} /> {sendDisabledReason ? '待配置' : '可发送'}</span>
          </div>
          {campaignExpanded && (
          <div className="campaign-panel-body">
          <label>
            收件人
            <textarea
              className="recipient-input"
              value={recipientInput}
              onChange={(event) => {
                setRecipientInput(event.target.value);
                setCampaignPreview(null);
              }}
              rows={2}
              placeholder="owner@example.com, sales@example.com"
            />
          </label>
          <div className="email-ai-panel">
            <div className="search-field-header">
              <span>AI邮件关键词</span>
              <button
                type="button"
                className="ai-analysis-button"
                onClick={generateEmailDrafts}
                disabled={busy === 'email-ai' || !(emailAiKeywords || keyword).trim()}
              >
                <Sparkles size={15} /> {busy === 'email-ai' ? '生成中...' : '一键生成邮件'}
              </button>
            </div>
            <input
              value={emailAiKeywords}
              onChange={(event) => setEmailAiKeywords(event.target.value)}
              placeholder="LCD屏幕出口, 手机维修店, phone repair store"
            />
            {!!emailDrafts.length && (
              <div className="email-draft-list">
                {emailDrafts.map((draft) => (
                  <div className="email-draft-card" key={draft.id}>
                    <div className="email-draft-head">
                      <div>
                        <strong>{draft.angle}</strong>
                        <span>{draft.subject}</span>
                      </div>
                      <button type="button" className="primary-small" onClick={() => applyEmailDraft(draft)}>
                        使用这版
                      </button>
                    </div>
                    <p>{draft.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <label>
            主题
            <input value={subject} onChange={(event) => { setSubject(event.target.value); setCampaignPreview(null); }} />
          </label>
          <RichEmailEditor
            html={bodyHtml}
            onHtmlChange={(nextHtml) => {
              setBodyHtml(nextHtml);
              setCampaignPreview(null);
            }}
            onTextChange={setBody}
          />
          <div className="campaign-actions">
            <label className="toggle">
              <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
              Dry-run
            </label>
            <button onClick={previewEmailCampaign} disabled={busy === 'preview' || busy === 'send' || busy === 'translate'}>
              <Sparkles size={18} /> {busy === 'preview' ? '生成中' : '生成预览'}
            </button>
            <div className="translation-action" ref={translationMenuRef}>
              <button
                type="button"
                onClick={() => setTranslationMenuOpen((open) => !open)}
                disabled={busy === 'preview' || busy === 'send' || busy === 'translate'}
              >
                <Languages size={18} /> {busy === 'translate' ? '翻译中' : '一键翻译'}
              </button>
              {translationMenuOpen && (
                <div className="translation-menu" role="menu">
                  <button type="button" onClick={() => translateCampaign('en')} role="menuitem">
                    翻译成英文
                  </button>
                  <button type="button" onClick={() => translateCampaign(selectedCountry.language)} role="menuitem">
                    目标地域官方语言
                  </button>
                </div>
              )}
            </div>
            <button
              className="danger-action"
              onClick={sendCampaign}
              disabled={sendActionDisabled}
              title={sendDisabledReason || undefined}
            >
              <Send size={18} /> 发送
            </button>
          </div>
          <div className={sendDisabledReason ? 'send-readiness warning' : 'send-readiness success'}>
            {sendDisabledReason || '真实发送已就绪。'}
          </div>
          {campaignPreview && (
            <div className="email-preview" aria-live="polite">
              <div><strong>收件人</strong><span>{campaignPreview.to || '示例线索暂无邮箱'}</span></div>
              <div><strong>主题</strong><span>{campaignPreview.subject}</span></div>
              {campaignPreview.html ? (
                <iframe
                  className="email-preview-frame"
                  sandbox=""
                  title="邮件 HTML 预览"
                  srcDoc={campaignPreview.html}
                />
              ) : (
                <pre>{campaignPreview.text}</pre>
              )}
            </div>
          )}
          <div className="compliance">
            <ShieldCheck size={18} />
            <span>默认限制每日批量、自动跳过退订名单，并在正文追加退订链接。</span>
          </div>
          </div>
          )}
        </div>

        <div className={whatsAppExpanded ? 'panel campaign-panel whatsapp-activity-panel expanded' : 'panel campaign-panel whatsapp-activity-panel collapsed'}>
          <div className="campaign-panel-header">
            <div className="panel-title campaign-panel-title">
              <MessageCircle size={18} />
              <div>
                <h2>WhatsApp 活动</h2>
                <p>消息预填、号码队列和逐条打开集中在这里</p>
              </div>
            </div>
            <button
              type="button"
              className="campaign-toggle-button"
              onClick={() => setWhatsAppExpanded((expanded) => !expanded)}
              aria-expanded={whatsAppExpanded}
            >
              {whatsAppExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              {whatsAppExpanded ? '收起' : '展开'}
            </button>
          </div>
          <div className="campaign-summary-row">
            <span><MessageCircle size={14} /> 队列 {whatsAppQueue.length}</span>
            <span><Send size={14} /> {whatsAppMessage.trim() ? '消息已填' : '消息未填'}</span>
            <span className="warning"><ShieldCheck size={14} /> 手动确认发送</span>
          </div>
          {whatsAppExpanded && (
            <div className="campaign-panel-body">
              <div className="whatsapp-panel">
                <div className="search-field-header">
                  <span>AI WhatsApp 关键词</span>
                  <button
                    type="button"
                    className="ai-analysis-button"
                    onClick={generateWhatsAppDrafts}
                    disabled={busy === 'whatsapp-ai' || !(whatsAppAiKeywords || keyword).trim()}
                  >
                    <Sparkles size={15} /> {busy === 'whatsapp-ai' ? '生成中...' : 'AI关键词分析'}
                  </button>
                </div>
                <input
                  value={whatsAppAiKeywords}
                  onChange={(event) => setWhatsAppAiKeywords(event.target.value)}
                  placeholder="LCD屏幕出口, phone repair store, 手机维修店"
                />
                {!!whatsAppDrafts.length && (
                  <div className="email-draft-list">
                    {whatsAppDrafts.map((draft) => (
                      <div className="email-draft-card" key={draft.id}>
                        <div className="email-draft-head">
                          <div>
                            <strong>{draft.angle}</strong>
                            <span>{draft.message}</span>
                          </div>
                          <button type="button" className="primary-small" onClick={() => applyWhatsAppDraft(draft)}>
                            使用这版
                          </button>
                        </div>
                        {draft.followUp && <p>{draft.followUp}</p>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="search-field-header">
                  <span>发送队列</span>
                  <button
                    type="button"
                    className="ai-analysis-button"
                    onClick={openNextWhatsAppChat}
                    disabled={!whatsAppQueue.length}
                  >
                    <MessageCircle size={15} /> {whatsAppQueue.length ? `打开下一条 (${whatsAppQueue.length})` : '等待加入号码'}
                  </button>
                </div>
                <label>
                  消息内容
                  <textarea
                    ref={whatsAppMessageRef}
                    className="whatsapp-message-input"
                    value={whatsAppMessage}
                    onChange={(event) => setWhatsAppMessage(event.target.value)}
                    rows={4}
                    placeholder="支持 {name} {company} {phone} {address} {website} {source}"
                  />
                </label>
                <div className="campaign-actions">
                  <div className="translation-action" ref={whatsAppTranslationMenuRef}>
                    <button
                      type="button"
                      onClick={() => setWhatsAppTranslationMenuOpen((open) => !open)}
                      disabled={busy === 'preview' || busy === 'send' || busy === 'translate'}
                    >
                      <Languages size={18} /> {busy === 'translate' ? '翻译中' : '一键翻译'}
                    </button>
                    {whatsAppTranslationMenuOpen && (
                      <div className="translation-menu" role="menu">
                        <button type="button" onClick={() => translateWhatsAppMessage('en')} role="menuitem">
                          翻译成英文
                        </button>
                        <button type="button" onClick={() => translateWhatsAppMessage(selectedCountry.language)} role="menuitem">
                          目标地域官方语言
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="whatsapp-template-row" aria-label="WhatsApp 模板变量">
                  <span>模板变量</span>
                  {[
                    { label: '姓名', token: '{name}' },
                    { label: '公司', token: '{company}' },
                    { label: '电话', token: '{phone}' },
                    { label: '地址', token: '{address}' },
                    { label: '网站', token: '{website}' }
                  ].map((item) => (
                    <button type="button" key={item.token} className="mini-button" onClick={() => insertWhatsAppTemplateToken(item.token)}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="campaign-actions whatsapp-actions">
                  <button type="button" onClick={copyWhatsAppMessage} disabled={!whatsAppMessage.trim()}>
                    <Copy size={18} /> 复制消息
                  </button>
                  <button type="button" className="danger-action" onClick={clearWhatsAppQueue} disabled={!whatsAppQueue.length}>
                    <Trash2 size={18} /> 清空队列
                  </button>
                </div>
                <div className="whatsapp-note">
                  WhatsApp 只会预填消息，真正发送仍需在 WhatsApp 里手动确认。
                </div>
                {!!whatsAppQueue.length && (
                  <div className="whatsapp-queue">
                    {whatsAppQueue.map((item, index) => (
                      <div className="whatsapp-queue-item" key={item.id}>
                        <div className="whatsapp-queue-meta">
                          <strong>{index + 1}. {item.name}</strong>
                          <span>{item.normalizedPhone}</span>
                        </div>
                        <div className="whatsapp-queue-actions">
                          <button
                            type="button"
                            className="mini-button"
                            onClick={() => {
                              const lead = payload.leads.find((candidate) => candidate.id === item.leadId) || null;
                              openWhatsAppPhone(item.normalizedPhone, {
                                context: buildWhatsAppMessageContext(item, lead)
                              });
                            }}
                          >
                            <MessageCircle size={14} /> 打开
                          </button>
                          <button type="button" className="mini-button" onClick={() => removeWhatsAppQueueItem(item.id)}>
                            <X size={14} /> 移除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="task-section" aria-live="polite">
        <div className="section-header task-section-header">
          <div>
            <p className="eyebrow">Tasks</p>
            <h2>执行任务</h2>
          </div>
          <div className="task-header-actions">
          <button type="button" className="task-refresh-button" onClick={refresh} disabled={busy === 'refresh'}>
            <RefreshCw size={16} /> 刷新
          </button>
            <button type="button" className="task-refresh-button" onClick={clearFinishedTasks} disabled={busy === 'clear-tasks'}>
              <Trash2 size={16} /> {busy === 'clear-tasks' ? '清理中' : '清理完成'}
            </button>
          </div>
        </div>
        <div className="task-list">
          {latestTasks.map((task) => {
            const progress = Math.min(100, Math.max(0, Number(task.progress) || 0));
            const contextSummary = formatTaskContext(task.context);
            const taskIcon = task.kind === 'search'
              ? <Search size={16} />
              : task.kind === 'campaign-send'
                ? <Send size={16} />
                : task.kind === 'analysis'
                  ? <Sparkles size={16} />
                  : <RefreshCw size={16} />;

            return (
              <article className={`task-card ${task.status}`} key={task.id}>
                <div className="task-card-top">
                  <div className="task-card-title">
                    <span className="task-icon">{taskIcon}</span>
                    <div>
                      <strong>{getTaskKindLabel(task.kind)}</strong>
                      <span>{task.title || getTaskKindLabel(task.kind)}</span>
                    </div>
                  </div>
                  <span className={`task-status ${task.status}`}>{getTaskStatusLabel(task.status)}</span>
                </div>
                <div className="task-progress-row">
                  <progress value={progress} max={100} />
                  <span>{progress}%</span>
                </div>
                {(task.detail || task.error) && (
                  <p className={task.error ? 'task-detail task-error' : 'task-detail'}>
                    {task.error || task.detail}
                  </p>
                )}
                <div className="task-meta">
                  <span>{formatTaskTime(task.updatedAt || task.createdAt)}</span>
                  {contextSummary && <span>{contextSummary}</span>}
                </div>
                {task.status === 'failed' && task.kind === 'search' && (
                  <div className="task-actions">
                    <button
                      type="button"
                      className="task-retry-button"
                      onClick={() => retryTask(task.id)}
                      disabled={busy === `retry-task:${task.id}`}
                    >
                      <RefreshCw size={15} /> {busy === `retry-task:${task.id}` ? '重试中' : '重试搜索'}
                    </button>
                  </div>
                )}
                {task.kind === 'campaign-send' && (
                  <div className="task-actions">
                    <button
                      type="button"
                      className="task-retry-button"
                      onClick={() => loadCampaignTask(task)}
                    >
                      <Mail size={15} /> 载入邮件
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {!latestTasks.length && (
            <div className="task-empty">
              开始搜索、AI 分析或发送邮件后，这里会显示每个任务的进度和失败原因。
            </div>
          )}
        </div>
      </section>

      <section className="send-log-section">
        <div className="section-header send-log-header">
          <div>
            <p className="eyebrow">Delivery</p>
            <h2>最近发送记录</h2>
          </div>
          <button type="button" className="task-refresh-button" onClick={clearSendLogs} disabled={busy === 'clear-send-log' || !payload.sendLog.length}>
            <Trash2 size={16} /> {busy === 'clear-send-log' ? '清理中' : '清理记录'}
          </button>
        </div>
        <div className="send-log-list">
          {latestSendLogs.map((entry) => (
            <article className={`send-log-card ${entry.status}`} key={entry.id}>
              <div className="send-log-main">
                <span className={`send-log-status ${entry.status}`}>{getSendStatusLabel(entry.status)}</span>
                <strong>{entry.to || entry.leadId || '未指定收件人'}</strong>
              </div>
              <div className="send-log-meta">
                <span>{formatTaskTime(entry.at)}</span>
                {(entry.reason || entry.status === 'skipped') && <span>{getSendReasonLabel(entry.reason)}</span>}
              </div>
            </article>
          ))}
          {!latestSendLogs.length && (
            <div className="send-log-empty">
              真实发送、预演或跳过记录会显示在这里，方便排查失败原因。
            </div>
          )}
        </div>
      </section>

      <section className="table-section">
        <div className="section-header">
          <div className="lead-library-heading">
            <div>
            <p className="eyebrow">Leads</p>
            <h2>线索库</h2>
            </div>
            <div className="lead-tabs" role="tablist" aria-label="按搜索关键词筛选线索">
              <button
                type="button"
                className={activeLeadKeyword === 'all' ? 'lead-tab active' : 'lead-tab'}
                onClick={() => setActiveLeadKeyword('all')}
                role="tab"
                aria-selected={activeLeadKeyword === 'all'}
              >
                全部 <span>{payload.leads.length}</span>
              </button>
              {leadKeywordTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.key}
                  className={activeLeadKeyword === tab.key ? 'lead-tab active' : 'lead-tab'}
                  onClick={() => setActiveLeadKeyword(tab.key)}
                  role="tab"
                  aria-selected={activeLeadKeyword === tab.key}
                  title={tab.label}
                >
                  {tab.label} <span>{tab.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="lead-library-actions">
            <button
              type="button"
              className="delete-button"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={busy === 'delete-lead-group'}
              title={activeLeadTab ? `删除 ${activeLeadTab.label}` : '删除全部线索信息'}
            >
              <Trash2 size={18} /> 删除
            </button>
            <button type="button" className="download-button" onClick={downloadLeadsCsv}>
              <Download size={18} /> 导出 CSV
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>商户</th>
                <th>类型</th>
                <th>联系</th>
                <th>地址</th>
                <th>评分</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const whatsappContact = getLeadWhatsAppContact(lead);
                const sourceKeywords = getLeadSourceKeywords(lead);
                return (
                <tr key={lead.id}>
                  <td data-label="商户">
                    <strong>{lead.name}</strong>
                    {lead.website && <a href={lead.website} target="_blank" rel="noreferrer">{lead.website.replace(/^https?:\/\//, '')}</a>}
                    {!!sourceKeywords.length && (
                      <div className="lead-source-keywords" title={sourceKeywords.join('、')}>
                        <span>来源关键词</span>
                        {sourceKeywords.slice(0, 3).map((item) => (
                          <em key={item}>{item}</em>
                        ))}
                        {sourceKeywords.length > 3 && <em>+{sourceKeywords.length - 3}</em>}
                      </div>
                    )}
                  </td>
                  <td data-label="类型">{lead.companyType || '-'}</td>
                  <td data-label="联系">
                    <span><Phone size={14} /> {lead.phone || '-'}</span>
                    {whatsappContact && (
                      <a
                        className="whatsapp-verified-badge"
                        href={whatsappContact.url || `https://wa.me/${whatsappContact.phone}`}
                        target="_blank"
                        rel="noreferrer"
                        title={whatsappContact.pageUrl || whatsappContact.url || '已确认 WhatsApp 联系方式'}
                      >
                        <MessageCircle size={14} />
                        <Check size={12} />
                        WhatsApp
                      </a>
                    )}
                    {Array.isArray(lead.emails) && lead.emails.length ? (
                      <div className="email-quality-list">
                        {lead.emails.map((email) => {
                          const source = getEmailSourceForLead(lead, email);
                          return (
                            <span className="email-quality-row" key={email}>
                              <Mail size={14} />
                              <span className="email-value">{email}</span>
                              {source && (
                                <a className="email-source-link" href={source.url} target="_blank" rel="noreferrer" title={source.url}>
                                  来源页面
                                </a>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="email-empty-state">
                        <span>
                          <Mail size={14} /> -
                        </span>
                        {getEmailDiscoveryReason(lead) && (
                          <small title={lead.emailDiscoveryReasonCode || lead.emailDiscoveryStatus || ''}>
                            {getEmailDiscoveryReason(lead)}
                            {typeof lead.emailDiscoveryPagesScanned === 'number' ? ` · 已扫 ${lead.emailDiscoveryPagesScanned} 页` : ''}
                          </small>
                        )}
                      </div>
                    )}
                    {(Boolean(lead.socialProfiles?.length) || Boolean(lead.directoryProfiles?.length) || Boolean(lead.domainInfo) || Boolean(lead.enrichmentSteps?.length)) && (
                      <div className="waterfall-summary">
                        {!!lead.socialProfiles?.length && <span>社媒 {lead.socialProfiles.length}</span>}
                        {!!lead.directoryProfiles?.length && <span>目录 {lead.directoryProfiles.length}</span>}
                        {lead.domainInfo?.domain && <span>域名 {lead.domainInfo.domain}</span>}
                        {!!lead.enrichmentSteps?.length && <span>补全 {lead.enrichmentSteps.filter((item) => item.status === 'found').length}/{lead.enrichmentSteps.length}</span>}
                      </div>
                    )}
                  </td>
                  <td data-label="地址">{lead.address || '-'}</td>
                  <td data-label="评分">{lead.rating ? `${lead.rating} (${lead.reviewCount})` : '-'}</td>
                  <td data-label="操作">
                    <button
                      className="mini-button"
                      onClick={() => enrichLeadWaterfall(lead)}
                      disabled={busy === `enrich-lead:${lead.id}`}
                      title="瀑布式补全：官网、社媒、目录、域名、第三方 API、AI研究"
                    >
                      <RefreshCw size={15} /> {busy === `enrich-lead:${lead.id}` ? '补全中' : '补全'}
                    </button>
                    <button
                      className="mini-button"
                      onClick={() => addLeadEmailsToRecipients(lead)}
                      disabled={!Array.isArray(lead.emails) || !lead.emails.length}
                      title={Array.isArray(lead.emails) && lead.emails.length ? '加入邮件活动收件人' : '这条线索暂无邮箱'}
                    >
                      <Send size={15} /> 发送邮件
                    </button>
                    <button
                      className="mini-button"
                      onClick={() => addLeadPhoneToWhatsAppQueue(lead)}
                      disabled={!lead.phone && !whatsappContact}
                      title={whatsappContact ? '使用已确认的 WhatsApp 联系方式' : lead.phone ? '加入 WhatsApp 队列' : '这条线索暂无电话或 WhatsApp 联系方式'}
                    >
                      <MessageCircle size={15} /> WhatsApp
                    </button>
                  </td>
                </tr>
                );
              })}
              {!filteredLeads.length && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    {payload.leads.length ? '这个关键词标签下暂时没有线索。' : '还没有线索，先从关键词和区域开始搜索。'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {deleteDialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => {
          if (busy !== 'delete-lead-group') setDeleteDialogOpen(false);
        }}>
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="delete-dialog-header">
              <div>
                <p className="eyebrow">Delete</p>
                <h2 id="delete-dialog-title">
                  {activeLeadTab ? `删除“${activeLeadTab.label}”` : '是否删除目前全部信息'}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={busy === 'delete-lead-group'}
                aria-label="关闭"
                title="关闭"
              >
                <X size={18} />
              </button>
            </div>
            {activeLeadTab ? (
              <div className="delete-options">
                <button
                  type="button"
                  className="delete-option"
                  onClick={() => deleteLeadGroup('tag')}
                  disabled={busy === 'delete-lead-group'}
                >
                  <Trash2 size={19} />
                  <span>
                    <strong>删除该标签</strong>
                    <small>保留标签内的线索，只移除关键词分类。</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="delete-option danger"
                  onClick={() => deleteLeadGroup('contents')}
                  disabled={busy === 'delete-lead-group'}
                >
                  <Trash2 size={19} />
                  <span>
                    <strong>删除该标签内信息</strong>
                    <small>删除该标签独有的线索，共享线索仍保留在其他标签。</small>
                  </span>
                </button>
              </div>
            ) : (
              <>
                <p className="delete-all-warning">
                  此操作会删除线索库中的全部线索和关键词标签，固定的“全部”标签页会保留。
                </p>
                <div className="delete-dialog-actions">
                  <button
                    type="button"
                    onClick={() => setDeleteDialogOpen(false)}
                    disabled={busy === 'delete-lead-group'}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="danger-action"
                    onClick={deleteAllLeads}
                    disabled={busy === 'delete-lead-group'}
                  >
                    <Trash2 size={18} /> {busy === 'delete-lead-group' ? '删除中...' : '确认删除'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      </>
      )}
      <footer className="app-footer">
        <LegalLinks onOpen={setLegalView} />
        <span>IZYLEADS · 合法、克制、可退订的商业触达工具</span>
      </footer>
      <LegalCenter activeKey={legalView} onOpen={setLegalView} onClose={() => setLegalView(null)} />
    </main>
    </div>
  );
}

/*
function ConsoleSidebar({ googleConfigured, mailerMode }: { googleConfigured: boolean; mailerMode: string }) {
  const groups = [
    {
      title: '获客',
      items: [
        { icon: Search, label: '搜索商户', active: true },
        { icon: Database, label: '线索库' },
        { icon: Send, label: '邮件活动' }
      ]
    },
    {
      title: '配置',
      items: [
        { icon: KeyRound, label: 'API Keys' },
        { icon: Settings, label: '系统设置' },
        { icon: BarChart3, label: '发送日志' }
      ]
    }
  ];

  return (
    <aside className="console-sidebar">
      <div className="brand-card">
        <div className="brand-mark"><Bot size={18} /></div>
        <div>
          <strong>Leadgen</strong>
          <span>LOCAL SYSTEM</span>
        </div>
      </div>

      <button className="quick-create">
        <Plus size={16} /> Quick Create
      </button>

      <nav className="console-nav">
        {groups.map((group) => (
          <div className="nav-group" key={group.title}>
            <div className="nav-title">{group.title}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <a className={item.active ? 'nav-item active' : 'nav-item'} href="#" key={item.label}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-status">
        <span className={googleConfigured ? 'dot ok' : 'dot warn'} />
        <div>
          <strong>{googleConfigured ? 'Google 已连接' : '等待 API Key'}</strong>
          <span>邮件模式：{mailerMode}</span>
        </div>
      </div>
    </aside>
  );
}

*/
function LegalLinks({ onOpen }: { onOpen: (key: LegalDocumentKey) => void }) {
  return (
    <nav className="legal-links" aria-label="合规与帮助">
      {legalLinkItems.map((item) => (
        <button type="button" key={item.key} className="legal-link-button" onClick={() => onOpen(item.key)}>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function LegalCenter({
  activeKey,
  onOpen,
  onClose
}: {
  activeKey: LegalDocumentKey | null;
  onOpen: (key: LegalDocumentKey) => void;
  onClose: () => void;
}) {
  if (!activeKey) return null;
  const document = legalDocuments[activeKey];

  return (
    <div className="dialog-backdrop legal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="legal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="legal-dialog-header">
          <div>
            <p className="eyebrow">IZYLEADS</p>
            <h2 id="legal-dialog-title">{document.title}</h2>
            <p>{document.subtitle}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭" title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="legal-tabs" role="tablist" aria-label="合规文档">
          {legalLinkItems.map((item) => (
            <button
              type="button"
              key={item.key}
              className={activeKey === item.key ? 'active' : ''}
              onClick={() => onOpen(item.key)}
              role="tab"
              aria-selected={activeKey === item.key}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="legal-body">
          <div className="legal-updated">最后更新：{document.updatedAt}</div>
          {document.sections.map((section) => (
            <section className="legal-section" key={section.heading}>
              <h3>{section.heading}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function LegalSettingsPanel() {
  return (
    <div className="settings-detail-grid legal-settings-grid">
      {legalLinkItems.map((item) => {
        const document = legalDocuments[item.key];
        return (
          <section className="settings-section legal-settings-card" key={item.key}>
            <div className="legal-settings-card-header">
              <div>
                <p className="eyebrow">IZYLEADS</p>
                <h3>{document.title}</h3>
                <span>最后更新：{document.updatedAt}</span>
              </div>
            </div>
            <p>{document.subtitle}</p>
            {document.sections.map((section) => (
              <div className="legal-settings-section" key={section.heading}>
                <strong>{section.heading}</strong>
                <ul>
                  {section.items.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function AuthGate({
  mode,
  setMode,
  form,
  setForm,
  onSubmit,
  busy,
  message,
  onOpenLegal
}: {
  mode: 'login' | 'register';
  setMode: React.Dispatch<React.SetStateAction<'login' | 'register'>>;
  form: { name: string; email: string; password: string };
  setForm: React.Dispatch<React.SetStateAction<{ name: string; email: string; password: string }>>;
  onSubmit: () => void;
  busy: boolean;
  message: string;
  onOpenLegal: (key: LegalDocumentKey) => void;
}) {
  return (
    <main className="auth-gate">
      <section className="auth-card">
        <p className="eyebrow">IZYLEADS</p>
        <h1>{mode === 'register' ? '创建会员账号' : '登录会员账号'}</h1>
        <div className="segmented-control">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>登录</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>注册</button>
        </div>
        {mode === 'register' && (
          <label>
            名称
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
        )}
        <label>
          邮箱
          <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label>
          密码
          <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
        </label>
        <button type="button" className="primary-action" onClick={onSubmit} disabled={busy || !form.email || !form.password}>
          {busy ? '处理中' : mode === 'register' ? '注册并登录' : '登录'}
        </button>
        {message && <div className="settings-message">{message}</div>}
        <div className="auth-legal">
          <LegalLinks onOpen={onOpenLegal} />
        </div>
      </section>
    </main>
  );
}

const usageLabels: Record<string, string> = {
  search_places: '搜索线索',
  discover_email: '邮箱发现',
  ai_keyword_analysis: 'AI关键词分析',
  ai_email_generation: 'AI邮件生成',
  ai_whatsapp_generation: 'AI WhatsApp生成',
  translate_email: '邮件翻译',
  translate_whatsapp: 'WhatsApp翻译',
  send_email: '真实发送',
  export_csv: 'CSV导出'
};

function MembershipPanel({
  authState,
  authForm,
  setAuthForm,
  authMode,
  setAuthMode,
  onAuthSubmit,
  onLogout,
  adminUsers,
  onUpdateUser
}: {
  authState: AuthState;
  authForm: { name: string; email: string; password: string };
  setAuthForm: React.Dispatch<React.SetStateAction<{ name: string; email: string; password: string }>>;
  authMode: 'login' | 'register';
  setAuthMode: React.Dispatch<React.SetStateAction<'login' | 'register'>>;
  onAuthSubmit: () => void;
  onLogout: () => void;
  adminUsers: MembershipUser[];
  onUpdateUser: (userId: string, patch: Partial<MembershipUser>) => void;
}) {
  const canAdmin = authState.user && ['super_admin', 'admin'].includes(authState.user.role);
  const planOptions = Object.keys(authState.plans);
  const roleOptions: MembershipUser['role'][] = ['super_admin', 'admin', 'manager', 'member'];

  return (
    <div className="settings-detail-grid">
      <section className="settings-section membership-card">
        <h3>当前账号</h3>
        {authState.user ? (
          <>
            <strong>{authState.user.name || authState.user.email}</strong>
            <p>{authState.user.email}</p>
            <div className="membership-chips">
              <span>{authState.user.plan}</span>
              <span>{authState.user.role}</span>
              <span>{authState.user.status}</span>
            </div>
            <button type="button" className="secondary-button" onClick={onLogout}>退出登录</button>
          </>
        ) : (
          <>
            <div className="segmented-control">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>登录</button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>注册</button>
            </div>
            {authMode === 'register' && (
              <label>
                名称
                <input value={authForm.name} onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
            )}
            <label>
              邮箱
              <input value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label>
              密码
              <input type="password" value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} />
            </label>
            <button type="button" className="primary-small" onClick={onAuthSubmit}>
              {authMode === 'register' ? '注册第一个管理员' : '登录'}
            </button>
          </>
        )}
      </section>

      <section className="settings-section membership-card">
        <h3>今日额度</h3>
        {authState.usage.length ? authState.usage.map((item) => (
          <div className="usage-row" key={item.feature}>
            <span>{usageLabels[item.feature] || item.feature}</span>
            <strong>{item.used} / {item.limit == null ? '不限' : item.limit}</strong>
          </div>
        )) : <p className="settings-help">登录后显示当前套餐的每日使用量。</p>}
      </section>

      {canAdmin && (
        <section className="settings-section membership-users">
          <h3>用户管理</h3>
          <div className="membership-user-list">
            {adminUsers.map((user) => (
              <div className="membership-user-row" key={user.id}>
                <div>
                  <strong>{user.name || user.email}</strong>
                  <small>{user.email}</small>
                </div>
                <select value={user.role} onChange={(event) => onUpdateUser(user.id, { role: event.target.value as MembershipUser['role'] })}>
                  {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <select value={user.plan} onChange={(event) => onUpdateUser(user.id, { plan: event.target.value as MembershipUser['plan'] })}>
                  {planOptions.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
                <select value={user.status} onChange={(event) => onUpdateUser(user.id, { status: event.target.value as MembershipUser['status'] })}>
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>
            ))}
            {!adminUsers.length && <p className="settings-help">暂无用户。注册第一个账号后会显示在这里。</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsSidebar({
  settings,
  setSettings,
  onSave,
  saving,
  message,
  activeSettingsView,
  setActiveSettingsView,
  authState
}: {
  settings: SettingsPayload;
  setSettings: React.Dispatch<React.SetStateAction<SettingsPayload>>;
  onSave: () => void;
  saving: boolean;
  message: string;
  activeSettingsView: SettingsView;
  setActiveSettingsView: React.Dispatch<React.SetStateAction<SettingsView>>;
  authState: AuthState;
}) {
  const canManageApiSettings = ['super_admin', 'admin'].includes(authState.user?.role || '');
  const updateSettings = (patch: Partial<SettingsPayload>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };
  const updateSmtp = (patch: Partial<SettingsPayload['smtp']>) => {
    setSettings((current) => ({ ...current, smtp: { ...current.smtp, ...patch } }));
  };

  return (
    <aside className="settings-sidebar settings-sidebar-compact">
      <div className="settings-header">
        <p className="eyebrow">Settings</p>
        <h2>系统设置</h2>
      </div>

      {canManageApiSettings && (
        <>
      <button
        type="button"
        className={activeSettingsView === 'google' ? 'settings-tag active' : 'settings-tag'}
        onClick={() => setActiveSettingsView('google')}
      >
        <MapPin size={17} />
        <span>
          <strong>商户数据服务 API Key</strong>
          <small>{settings.googleMapsApiKey ? '已保存' : '未设置'}</small>
        </span>
      </button>

      <button
        type="button"
        className={activeSettingsView === 'translate' ? 'settings-tag active' : 'settings-tag'}
        onClick={() => setActiveSettingsView('translate')}
      >
        <Languages size={17} />
        <span>
          <strong>翻译服务 API Key</strong>
          <small>{settings.googleTranslateApiKey ? '已保存' : '未设置'}</small>
        </span>
      </button>

        </>
      )}

      {canManageApiSettings && (
        <>
      <button
        type="button"
        className={activeSettingsView === 'ai' ? 'settings-tag active' : 'settings-tag'}
        onClick={() => setActiveSettingsView('ai')}
      >
        <Sparkles size={17} />
        <span>
          <strong>AI关键词分析</strong>
          <small>{settings.hasOpenAiApiKey ? '已配置' : '未配置'}</small>
        </span>
      </button>
        </>
      )}

      {canManageApiSettings && (
        <>
      <button
        type="button"
        className={activeSettingsView === 'email' ? 'settings-tag active' : 'settings-tag'}
        onClick={() => setActiveSettingsView('email')}
      >
        <Mail size={17} />
        <span>
          <strong>邮箱自动化设置</strong>
          <small>{settings.mailerMode || 'dry-run'}</small>
        </span>
      </button>
        </>
      )}

      {canManageApiSettings && (
        <>
      <button
        type="button"
        className={activeSettingsView === 'members' ? 'settings-tag active' : 'settings-tag'}
        onClick={() => setActiveSettingsView('members')}
      >
        <ShieldCheck size={17} />
        <span>
          <strong>会员与权限</strong>
          <small>{authState.user ? `${authState.user.plan} · ${authState.user.role}` : '未登录'}</small>
        </span>
      </button>
        </>
      )}

      <button
        type="button"
        className={activeSettingsView === 'tasks' ? 'settings-tag active' : 'settings-tag'}
        onClick={() => setActiveSettingsView('tasks')}
      >
        <RefreshCw size={17} />
        <span>
          <strong>执行任务</strong>
          <small>任务进度</small>
        </span>
      </button>

      <button
        type="button"
        className={activeSettingsView === 'delivery' ? 'settings-tag active' : 'settings-tag'}
        onClick={() => setActiveSettingsView('delivery')}
      >
        <Send size={17} />
        <span>
          <strong>最近发送记录</strong>
          <small>邮件投递</small>
        </span>
      </button>

      <button
        type="button"
        className={activeSettingsView === 'legal' ? 'settings-tag active' : 'settings-tag'}
        onClick={() => setActiveSettingsView('legal')}
      >
        <ShieldCheck size={17} />
        <span>
          <strong>合规与帮助中心</strong>
          <small>条款、隐私和使用说明</small>
        </span>
      </button>

      <button type="button" className="settings-back-link" onClick={() => setActiveSettingsView('workspace')}>
        返回工作台
      </button>
    </aside>
  );

  return (
    <aside className="settings-sidebar">
      <div className="settings-header">
        <p className="eyebrow">Settings</p>
        <h2>系统设置</h2>
      </div>

      <section className="settings-section">
        <h3>商户数据服务</h3>
        <label>
          API Key
          <input
            type="password"
            value={settings.googleMapsApiKey}
            onChange={(event) => updateSettings({ googleMapsApiKey: event.target.value })}
            placeholder="输入服务密钥"
          />
        </label>
        <div className="settings-two-col">
          <label>
            语言
            <input
              value={settings.placesLanguageCode}
              onChange={(event) => updateSettings({ placesLanguageCode: event.target.value })}
              placeholder="zh-CN"
            />
          </label>
          <label>
            区域
            <input
              value={settings.placesRegionCode}
              onChange={(event) => updateSettings({ placesRegionCode: event.target.value })}
              placeholder="US"
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>SMTP 邮箱</h3>
        <label>
          发件邮箱
          <input value={settings.smtp.from} onChange={(event) => updateSmtp({ from: event.target.value })} placeholder="name@company.com" />
        </label>
        <label>
          SMTP Host
          <input value={settings.smtp.host} onChange={(event) => updateSmtp({ host: event.target.value })} placeholder="smtp.gmail.com" />
        </label>
        <div className="settings-two-col">
          <label>
            端口
            <input value={settings.smtp.port} onChange={(event) => updateSmtp({ port: event.target.value })} placeholder="587" />
          </label>
          <label className="toggle settings-toggle">
            <input
              type="checkbox"
              checked={settings.smtp.secure}
              onChange={(event) => updateSmtp({ secure: event.target.checked })}
            />
            SSL
          </label>
        </div>
        <label>
          用户名
          <input value={settings.smtp.user} onChange={(event) => updateSmtp({ user: event.target.value })} placeholder="SMTP user" />
        </label>
        <label>
          密码
          <input
            type="password"
            value={settings.smtp.pass}
            onChange={(event) => updateSmtp({ pass: event.target.value })}
            placeholder={settings.hasSmtpPass ? '已保存，留空则不修改' : 'SMTP password'}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>Jarvis 邮件接口</h3>
        <label>
          Endpoint
          <input
            value={settings.jarvisEmailEndpoint}
            onChange={(event) => updateSettings({ jarvisEmailEndpoint: event.target.value })}
            placeholder="http://127.0.0.1:8787/email/send"
          />
        </label>
        <label>
          Token
          <input
            type="password"
            value={settings.jarvisEmailToken}
            onChange={(event) => updateSettings({ jarvisEmailToken: event.target.value })}
            placeholder={settings.hasJarvisEmailToken ? '已保存，留空则不修改' : 'Bearer token'}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>邮件自动化</h3>
        <label>
          退订链接
          <input
            value={settings.unsubscribeUrl}
            onChange={(event) => updateSettings({ unsubscribeUrl: event.target.value })}
            placeholder="https://example.com/unsubscribe"
          />
        </label>
        <label>
          每日发送上限
          <input
            type="number"
            min={1}
            value={settings.emailDailyLimit}
            onChange={(event) => updateSettings({ emailDailyLimit: event.target.value })}
          />
        </label>
      </section>

      {message && <div className="settings-message">{message}</div>}
      <button className="primary-action settings-save" onClick={onSave} disabled={saving}>
        <Check size={18} /> {saving ? '保存中' : '保存设置'}
      </button>
      <div className="settings-mode">当前邮件模式：{settings.mailerMode || 'dry-run'}</div>
    </aside>
  );
}

function TaskActivityPanel({
  latestTasks,
  busy,
  onRefresh,
  onClearFinished,
  onRetryTask,
  onLoadCampaignTask
}: {
  latestTasks: StorePayload['tasks'];
  busy: string;
  onRefresh: () => void;
  onClearFinished: () => void;
  onRetryTask: (taskId: string) => void;
  onLoadCampaignTask: (task: StorePayload['tasks'][number]) => void;
}) {
  return (
    <section className="task-section settings-embedded-section" aria-live="polite">
      <div className="section-header task-section-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>执行任务</h2>
        </div>
        <div className="task-header-actions">
          <button type="button" className="task-refresh-button" onClick={onRefresh} disabled={busy === 'refresh'}>
            <RefreshCw size={16} /> 刷新
          </button>
          <button type="button" className="task-refresh-button" onClick={onClearFinished} disabled={busy === 'clear-tasks'}>
            <Trash2 size={16} /> {busy === 'clear-tasks' ? '清理中' : '清理完成'}
          </button>
        </div>
      </div>
      <div className="task-list">
        {latestTasks.map((task) => {
          const progress = Math.min(100, Math.max(0, Number(task.progress) || 0));
          const contextSummary = formatTaskContext(task.context);
          const taskIcon = task.kind === 'search'
            ? <Search size={16} />
            : task.kind === 'campaign-send'
              ? <Send size={16} />
              : task.kind === 'analysis'
                ? <Sparkles size={16} />
                : <RefreshCw size={16} />;

          return (
            <article className={`task-card ${task.status}`} key={task.id}>
              <div className="task-card-top">
                <div className="task-card-title">
                  <span className="task-icon">{taskIcon}</span>
                  <div>
                    <strong>{getTaskKindLabel(task.kind)}</strong>
                    <span>{task.title || getTaskKindLabel(task.kind)}</span>
                  </div>
                </div>
                <span className={`task-status ${task.status}`}>{getTaskStatusLabel(task.status)}</span>
              </div>
              <div className="task-progress-row">
                <progress value={progress} max={100} />
                <span>{progress}%</span>
              </div>
              {(task.detail || task.error) && (
                <p className={task.error ? 'task-detail task-error' : 'task-detail'}>
                  {task.error || task.detail}
                </p>
              )}
              <div className="task-meta">
                <span>{formatTaskTime(task.updatedAt || task.createdAt)}</span>
                {contextSummary && <span>{contextSummary}</span>}
              </div>
              {task.status === 'failed' && task.kind === 'search' && (
                <div className="task-actions">
                  <button
                    type="button"
                    className="task-retry-button"
                    onClick={() => onRetryTask(task.id)}
                    disabled={busy === `retry-task:${task.id}`}
                  >
                    <RefreshCw size={15} /> {busy === `retry-task:${task.id}` ? '重试中' : '重试搜索'}
                  </button>
                </div>
              )}
              {task.kind === 'campaign-send' && (
                <div className="task-actions">
                  <button
                    type="button"
                    className="task-retry-button"
                    onClick={() => onLoadCampaignTask(task)}
                  >
                    <Mail size={15} /> 载入邮件
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!latestTasks.length && (
          <div className="task-empty">
            开始搜索、AI 分析或发送邮件后，这里会显示每个任务的进度和失败原因。
          </div>
        )}
      </div>
    </section>
  );
}

function DeliveryLogPanel({
  latestSendLogs,
  totalSendLogs,
  busy,
  onClearSendLogs
}: {
  latestSendLogs: StorePayload['sendLog'];
  totalSendLogs: number;
  busy: string;
  onClearSendLogs: () => void;
}) {
  return (
    <section className="send-log-section settings-embedded-section">
      <div className="section-header send-log-header">
        <div>
          <p className="eyebrow">Delivery</p>
          <h2>最近发送记录</h2>
        </div>
        <button type="button" className="task-refresh-button" onClick={onClearSendLogs} disabled={busy === 'clear-send-log' || !totalSendLogs}>
          <Trash2 size={16} /> {busy === 'clear-send-log' ? '清理中' : '清理记录'}
        </button>
      </div>
      <div className="send-log-list">
        {latestSendLogs.map((entry) => (
          <article className={`send-log-card ${entry.status}`} key={entry.id}>
            <div className="send-log-main">
              <span className={`send-log-status ${entry.status}`}>{getSendStatusLabel(entry.status)}</span>
              <strong>{entry.to || entry.leadId || '未指定收件人'}</strong>
            </div>
            <div className="send-log-meta">
              <span>{formatTaskTime(entry.at)}</span>
              {(entry.reason || entry.status === 'skipped') && <span>{getSendReasonLabel(entry.reason)}</span>}
            </div>
          </article>
        ))}
        {!latestSendLogs.length && (
          <div className="send-log-empty">
            真实发送、预演或跳过记录会显示在这里，方便排查失败原因。
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsDetailView({
  view,
  settings,
  setSettings,
  onSave,
  onTestSmtp,
  busy,
  saving,
  testingSmtp,
  message,
  authState,
  authForm,
  setAuthForm,
  authMode,
  setAuthMode,
  onAuthSubmit,
  onLogout,
  adminUsers,
  onUpdateUser,
  latestTasks,
  latestSendLogs,
  totalSendLogs,
  onRefresh,
  onClearFinishedTasks,
  onRetryTask,
  onLoadCampaignTask,
  onClearSendLogs
}: {
  view: Exclude<SettingsView, 'workspace'>;
  settings: SettingsPayload;
  setSettings: React.Dispatch<React.SetStateAction<SettingsPayload>>;
  onSave: () => void;
  onTestSmtp: () => void;
  busy: string;
  saving: boolean;
  testingSmtp: boolean;
  message: string;
  authState: AuthState;
  authForm: { name: string; email: string; password: string };
  setAuthForm: React.Dispatch<React.SetStateAction<{ name: string; email: string; password: string }>>;
  authMode: 'login' | 'register';
  setAuthMode: React.Dispatch<React.SetStateAction<'login' | 'register'>>;
  onAuthSubmit: () => void;
  onLogout: () => void;
  adminUsers: MembershipUser[];
  onUpdateUser: (userId: string, patch: Partial<MembershipUser>) => void;
  latestTasks: StorePayload['tasks'];
  latestSendLogs: StorePayload['sendLog'];
  totalSendLogs: number;
  onRefresh: () => void;
  onClearFinishedTasks: () => void;
  onRetryTask: (taskId: string) => void;
  onLoadCampaignTask: (task: StorePayload['tasks'][number]) => void;
  onClearSendLogs: () => void;
}) {
  const updateSettings = (patch: Partial<SettingsPayload>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };
  const updateSmtp = (patch: Partial<SettingsPayload['smtp']>) => {
    setSettings((current) => ({ ...current, smtp: { ...current.smtp, ...patch } }));
  };

  return (
    <section className="settings-detail">
      <div className="settings-detail-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>{view === 'google' ? '商户数据服务 API Key' : view === 'translate' ? '翻译服务 API Key' : view === 'ai' ? 'AI关键词分析' : view === 'members' ? '会员与权限' : view === 'tasks' ? '执行任务' : view === 'delivery' ? '最近发送记录' : view === 'legal' ? '合规与帮助中心' : '邮箱自动化设置'}</h2>
        </div>
        {!['members', 'tasks', 'delivery', 'legal'].includes(view) && (
          <button className="primary-small" onClick={onSave} disabled={saving}>
            <Check size={18} /> {saving ? '保存中' : '保存并返回'}
          </button>
        )}
      </div>

      {message && <div className="settings-message">{message}</div>}

      {view === 'members' ? (
        <MembershipPanel
          authState={authState}
          authForm={authForm}
          setAuthForm={setAuthForm}
          authMode={authMode}
          setAuthMode={setAuthMode}
          onAuthSubmit={onAuthSubmit}
          onLogout={onLogout}
          adminUsers={adminUsers}
          onUpdateUser={onUpdateUser}
        />
      ) : view === 'tasks' ? (
        <TaskActivityPanel
          latestTasks={latestTasks}
          busy={busy}
          onRefresh={onRefresh}
          onClearFinished={onClearFinishedTasks}
          onRetryTask={onRetryTask}
          onLoadCampaignTask={onLoadCampaignTask}
        />
      ) : view === 'delivery' ? (
        <DeliveryLogPanel
          latestSendLogs={latestSendLogs}
          totalSendLogs={totalSendLogs}
          busy={busy}
          onClearSendLogs={onClearSendLogs}
        />
      ) : view === 'legal' ? (
        <LegalSettingsPanel />
      ) : view === 'google' ? (
        <div className="settings-detail-grid compact">
          <section className="settings-section">
            <h3>商户数据服务</h3>
            <label>
              API Key
              <input
                type="password"
                value={settings.googleMapsApiKey}
                onChange={(event) => updateSettings({ googleMapsApiKey: event.target.value })}
                placeholder="输入服务密钥"
              />
            </label>
            <div className="settings-two-col">
              <label>
                语言
                <input
                  value={settings.placesLanguageCode}
                  onChange={(event) => updateSettings({ placesLanguageCode: event.target.value })}
                  placeholder="zh-CN"
                />
              </label>
              <label>
                区域
                <input
                  value={settings.placesRegionCode}
                  onChange={(event) => updateSettings({ placesRegionCode: event.target.value })}
                  placeholder="US"
                />
              </label>
            </div>
            <label>
              Foursquare Places API Key
              <input
                type="password"
                value={settings.foursquareApiKey}
                onChange={(event) => updateSettings({ foursquareApiKey: event.target.value })}
                placeholder={settings.hasFoursquareApiKey ? '已配置，留空则不修改' : 'Foursquare API key'}
              />
            </label>
            <label>
              Hunter API Key
              <input
                type="password"
                value={settings.hunterApiKey}
                onChange={(event) => updateSettings({ hunterApiKey: event.target.value })}
                placeholder={settings.hasHunterApiKey ? '已配置，留空则不修改' : 'Hunter API key'}
              />
            </label>
          </section>
        </div>
      ) : view === 'translate' ? (
        <div className="settings-detail-grid compact">
          <section className="settings-section">
            <h3>翻译服务</h3>
            <label>
              API Key
              <input
                type="password"
                value={settings.googleTranslateApiKey}
                onChange={(event) => updateSettings({ googleTranslateApiKey: event.target.value })}
                placeholder="输入服务密钥"
              />
            </label>
          </section>
        </div>
      ) : view === 'ai' ? (
        <div className="settings-detail-grid compact">
          <section className="settings-section">
            <h3>OpenAI / GLM API</h3>
            <label>
              API Key
              <input
                type="password"
                value={settings.openAiApiKey}
                onChange={(event) => updateSettings({ openAiApiKey: event.target.value })}
                placeholder={settings.hasOpenAiApiKey ? '已配置，留空则不修改' : 'sk-...'}
              />
            </label>
            <label>
              Base URL
              <input
                value={settings.openAiBaseUrl}
                onChange={(event) => updateSettings({ openAiBaseUrl: event.target.value })}
                placeholder="https://api.z.ai/api/paas/v4"
              />
            </label>
            <label>
              Model
              <input
                value={settings.openAiModel}
                onChange={(event) => updateSettings({ openAiModel: event.target.value })}
                placeholder="glm-4-flash / glm-5.2"
              />
            </label>
            <label>
              第三方邮箱 API Endpoint
              <input
                value={settings.enrichmentEmailApiEndpoint}
                onChange={(event) => updateSettings({ enrichmentEmailApiEndpoint: event.target.value })}
                placeholder="https://api.example.com/email-finder"
              />
            </label>
            <label>
              第三方邮箱 API Key
              <input
                type="password"
                value={settings.enrichmentEmailApiKey}
                onChange={(event) => updateSettings({ enrichmentEmailApiKey: event.target.value })}
                placeholder={settings.hasEnrichmentEmailApiKey ? '已配置，留空则不修改' : 'Bearer token / API key'}
              />
            </label>
            <p className="settings-help">只用于分析关键词和生成搜索策略，不会自动执行 Google 搜索。</p>
          </section>
        </div>
      ) : (
        <>
        <div className={settings.emailReady ? 'email-readiness success' : 'email-readiness warning'}>
          <div className="email-readiness-title">
            <ShieldCheck size={18} />
            <strong>{settings.emailReady ? '真实邮件发送已就绪' : '真实邮件发送尚未就绪'}</strong>
          </div>
          {!settings.emailReady && Boolean(settings.emailIssues?.length) && (
            <ul>
              {settings.emailIssues?.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
        </div>
        <div className="settings-detail-grid">
          <section className="settings-section">
            <h3>SMTP 邮箱</h3>
            <label>
              发件邮箱
              <input value={settings.smtp.from} onChange={(event) => updateSmtp({ from: event.target.value })} placeholder="name@company.com" />
            </label>
            <label>
              SMTP Host
              <input value={settings.smtp.host} onChange={(event) => updateSmtp({ host: event.target.value })} placeholder="smtp.gmail.com" />
            </label>
            <div className="settings-two-col">
              <label>
                端口
                <input value={settings.smtp.port} onChange={(event) => updateSmtp({ port: event.target.value })} placeholder="587" />
              </label>
              <label className="toggle settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.smtp.secure}
                  onChange={(event) => updateSmtp({ secure: event.target.checked })}
                />
                SSL
              </label>
            </div>
            <label>
              用户名
              <input value={settings.smtp.user} onChange={(event) => updateSmtp({ user: event.target.value })} placeholder="SMTP user" />
            </label>
            <label>
              密码
              <input
                type="password"
                value={settings.smtp.pass}
                onChange={(event) => updateSmtp({ pass: event.target.value })}
                placeholder={settings.hasSmtpPass ? '已保存，留空则不修改' : 'SMTP password'}
              />
            </label>
            <button
              type="button"
              className="smtp-test-button"
              onClick={onTestSmtp}
              disabled={saving || testingSmtp}
            >
              <RefreshCw size={17} /> {testingSmtp ? '测试中...' : '测试 SMTP 连接'}
            </button>
          </section>

          <section className="settings-section">
            <h3>Jarvis 邮件接口</h3>
            <label>
              Endpoint
              <input
                value={settings.jarvisEmailEndpoint}
                onChange={(event) => updateSettings({ jarvisEmailEndpoint: event.target.value })}
                placeholder="http://127.0.0.1:8787/email/send"
              />
            </label>
            <label>
              Token
              <input
                type="password"
                value={settings.jarvisEmailToken}
                onChange={(event) => updateSettings({ jarvisEmailToken: event.target.value })}
                placeholder={settings.hasJarvisEmailToken ? '已保存，留空则不修改' : 'Bearer token'}
              />
            </label>
          </section>

          <section className="settings-section">
            <h3>邮件自动化</h3>
            <label>
              退订链接
              <input
                value={settings.unsubscribeUrl}
                onChange={(event) => updateSettings({ unsubscribeUrl: event.target.value })}
                placeholder="https://example.com/unsubscribe"
              />
            </label>
            <label>
              每日发送上限
              <input
                type="number"
                min={1}
                value={settings.emailDailyLimit}
                onChange={(event) => updateSettings({ emailDailyLimit: event.target.value })}
              />
            </label>
          </section>
        </div>
        </>
      )}
    </section>
  );
}

function RichEmailEditor({
  html,
  onHtmlChange,
  onTextChange
}: {
  html: string;
  onHtmlChange: (html: string) => void;
  onTextChange: (text: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSyncedHtmlRef = useRef('');

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = html || '';
    if (editor.innerHTML === nextHtml && lastSyncedHtmlRef.current === nextHtml) return;
    if (document.activeElement === editor && lastSyncedHtmlRef.current === nextHtml) return;
    editor.innerHTML = nextHtml;
    lastSyncedHtmlRef.current = nextHtml;
  }, [html]);

  function syncEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = editor.innerHTML;
    lastSyncedHtmlRef.current = nextHtml;
    onHtmlChange(nextHtml);
    onTextChange(editor.innerText.trim());
  }

  function runCommand(command: string, value = '') {
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    syncEditor();
  }

  function promptForLink() {
    const url = window.prompt('输入链接地址');
    if (!url) return;
    runCommand('createLink', url);
  }

  function insertLocalImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      window.alert('图片不能超过 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      runCommand('insertImage', String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  }

  const iconButtons = [
    { title: '撤销', icon: Undo2, action: () => runCommand('undo') },
    { title: '重做', icon: Redo2, action: () => runCommand('redo') },
    { title: '加粗', icon: Bold, action: () => runCommand('bold') },
    { title: '斜体', icon: Italic, action: () => runCommand('italic') },
    { title: '下划线', icon: Underline, action: () => runCommand('underline') },
    { title: '左对齐', icon: AlignLeft, action: () => runCommand('justifyLeft') },
    { title: '居中', icon: AlignCenter, action: () => runCommand('justifyCenter') },
    { title: '右对齐', icon: AlignRight, action: () => runCommand('justifyRight') },
    { title: '无序列表', icon: List, action: () => runCommand('insertUnorderedList') },
    { title: '有序列表', icon: ListOrdered, action: () => runCommand('insertOrderedList') },
    { title: '插入链接', icon: Link, action: promptForLink },
    { title: '插入图片', icon: ImagePlus, action: () => fileInputRef.current?.click() },
    { title: '清除格式', icon: Eraser, action: () => runCommand('removeFormat') }
  ];

  return (
    <div className="rich-mail-field">
      <div className="rich-mail-label">正文</div>
      <div className="rich-mail-toolbar" aria-label="邮件正文工具栏">
        <select defaultValue="" onChange={(event) => event.target.value && runCommand('fontName', event.target.value)} aria-label="字体">
          <option value="">字体</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times</option>
          <option value="Verdana">Verdana</option>
          <option value="Microsoft YaHei">微软雅黑</option>
        </select>
        <select defaultValue="" onChange={(event) => event.target.value && runCommand('fontSize', event.target.value)} aria-label="字号">
          <option value="">字号</option>
          <option value="2">小</option>
          <option value="3">正文</option>
          <option value="4">大</option>
          <option value="5">标题</option>
        </select>
        <input
          className="rich-mail-color"
          type="color"
          defaultValue="#17202a"
          onChange={(event) => runCommand('foreColor', event.target.value)}
          aria-label="文字颜色"
          title="文字颜色"
        />
        <div className="rich-mail-tools">
          {iconButtons.map(({ title, icon: Icon, action }) => (
            <button
              key={title}
              type="button"
              className="rich-tool-button"
              title={title}
              aria-label={title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={action}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) insertLocalImage(file);
            event.target.value = '';
          }}
        />
      </div>
      <div
        ref={editorRef}
        className="rich-mail-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={syncEditor}
        onBlur={syncEditor}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const rootHost = globalThis as typeof globalThis & { __leadgenRoot?: Root };
rootHost.__leadgenRoot ??= createRoot(document.getElementById('root')!);
rootHost.__leadgenRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
