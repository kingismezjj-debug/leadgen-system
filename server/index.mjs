import express from 'express';
import cors from 'cors';
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countDailySendAttempts, selectCampaignLeads } from './campaigns.mjs';
import { config, getMailerMode } from './config.mjs';
import { leadsToCsv } from './csv.mjs';
import { generateEmailDrafts } from './emailGeneration.mjs';
import { getEmailReadiness } from './emailReadiness.mjs';
import { analyzeKeywords } from './keywordAnalysis.mjs';
import { assessLeadEmails } from './emailQuality.mjs';
import { enrichLeadsWithEmails } from './leadEmailEnrichment.mjs';
import { buildUnsubscribeUrl, sendCampaign, previewCampaign, verifySmtpSettings } from './mailer.mjs';
import { searchPlaces } from './places.mjs';
import { generateWhatsAppDrafts } from './whatsappGeneration.mjs';
import { translateEmailCampaign, translateWithGoogle } from './translate.mjs';
import { enrichLeadWaterfall } from './waterfallEnrichment.mjs';
import {
  consumeUsage,
  findUserBySessionToken,
  getAllowedEmailDiscoveryDepth,
  getMembershipState,
  getSessionTokenFromRequest,
  listUsers,
  loginUser,
  logoutSession,
  registerUser,
  requireRole,
  updateUserAdmin
} from './membership.mjs';
import {
  addCampaignRecord,
  addSearchRecord,
  addSendLog,
  addSuppression,
  addTaskRecord,
  deleteAllLeadData,
  deleteLeadKeywordGroup,
  deleteSendLogEntries,
  deleteTaskRecords,
  findUnsubscribeToken,
  getTaskRecord,
  readStore,
  unsubscribeByToken,
  updateTaskRecord,
  updateLead,
  upsertLeads
} from './store.mjs';
import { getClientSettings, getRuntimeSettings, saveClientSettings } from './settings.mjs';
import { validateCampaignInput, validateEmail, validateLeadPatch } from './validation.mjs';

const app = express();
let campaignQueue = Promise.resolve();
let searchTaskQueue = Promise.resolve();
app.use(cors({ origin: config.webOrigin }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

const unsubscribePage = ({ confirmed = false, invalid = false } = {}) => {
  const title = invalid ? '退订链接无效' : confirmed ? '退订成功' : '确认退订';
  const message = invalid
    ? '这个退订链接无效或已失效。'
    : confirmed
      ? '你已成功退订，之后不会再收到类似邮件。'
      : '确认后，这个邮箱将不再收到类似邮件。';
  const action = confirmed || invalid
    ? ''
    : '<form method="post"><button type="submit">确认退订</button></form>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #17202a; background: #f4f7f5; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    main { width: min(100%, 440px); border: 1px solid #dbe4df; border-radius: 8px; padding: 28px; background: #fff; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0 0 22px; color: #45544c; line-height: 1.6; }
    button { min-height: 42px; border: 0; border-radius: 7px; padding: 0 18px; color: #fff; background: #1f6f4a; cursor: pointer; font: inherit; font-weight: 700; }
  </style>
</head>
<body><main><h1>${title}</h1><p>${message}</p>${action}</main></body>
</html>`;
};

function sendUnsubscribePage(res, status, state) {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  return res.status(status).type('html').send(unsubscribePage(state));
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function enqueueCampaign(task) {
  const result = campaignQueue.then(task, task);
  campaignQueue = result.catch(() => {});
  return result;
}

function enqueueSearchTask(task) {
  const result = searchTaskQueue.then(task, task);
  searchTaskQueue = result.catch(() => {});
  return result;
}

function tokensMatch(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function requireAdminToken(req, res, next) {
  if (!config.adminToken) return next();
  const authorization = req.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const provided = bearerToken || req.get('x-leadgen-admin-token') || '';
  if (!tokensMatch(provided, config.adminToken)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: '需要有效的管理员 Token。' });
  }
  next();
}

async function attachMembership(req, res, next) {
  try {
    req.membershipEnabled = true;
    const token = getSessionTokenFromRequest(req);
    const user = await findUserBySessionToken(token);
    if (!user) return res.status(401).json({ error: 'Please login first.' });
    req.membershipToken = token;
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdminRole(req, _res, next) {
  try {
    requireRole(req.user, 'admin');
    next();
  } catch (error) {
    next(error);
  }
}

function canManageGlobalApiSettings(user) {
  return ['super_admin', 'admin'].includes(user?.role || '');
}

function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}

function visibleRecords(records, user) {
  if (isSuperAdmin(user)) return records;
  const ownerId = String(user?.id || '').trim();
  if (!ownerId) return [];
  return records.filter((record) => String(record?.userId || '').trim() === ownerId);
}

function findVisibleLead(store, leadId, user) {
  return visibleRecords(store.leads || [], user).find((item) => item.id === leadId) || null;
}

function settingsInputForUser(input = {}, user = null) {
  if (canManageGlobalApiSettings(user)) return input;
  return {};
}

function normalizeEmailDiscoveryDepth(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.max(0, Math.min(3, Math.floor(numericValue)));
}

function validateSearchPayload(body = {}) {
  const {
    keyword,
    area,
    maxResults = 20,
    includeEmailDiscovery = true,
    pageToken = '',
    languageCode = '',
    regionCode = '',
    searchMode = 'keyword',
    placeType = '',
    emailDiscoveryDepth = 1
  } = body || {};

  if (!keyword || !area) {
    throw Object.assign(new Error('keyword and area are required.'), { status: 400 });
  }
  if (typeof pageToken !== 'string' || pageToken.length > 4000) {
    throw Object.assign(new Error('Invalid pageToken.'), { status: 400 });
  }
  if (languageCode && (typeof languageCode !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(languageCode))) {
    throw Object.assign(new Error('Invalid languageCode.'), { status: 400 });
  }
  if (regionCode && (typeof regionCode !== 'string' || !/^[a-z]{2}$/i.test(regionCode))) {
    throw Object.assign(new Error('Invalid regionCode.'), { status: 400 });
  }
  if (searchMode && (typeof searchMode !== 'string' || !/^(keyword|type|smart)$/i.test(searchMode))) {
    throw Object.assign(new Error('Invalid searchMode.'), { status: 400 });
  }
  if (placeType && (typeof placeType !== 'string' || !/^[a-z][a-z0-9_]{1,80}$/i.test(placeType))) {
    throw Object.assign(new Error('Invalid placeType.'), { status: 400 });
  }

  return {
    keyword,
    area,
    maxResults,
    includeEmailDiscovery,
    pageToken,
    languageCode,
    regionCode,
    searchMode,
    placeType,
    emailDiscoveryDepth: normalizeEmailDiscoveryDepth(emailDiscoveryDepth)
  };
}

async function executeSearchTask(searchInput, user = null, existingTask = null) {
  const input = {
    ...validateSearchPayload(searchInput),
    emailDiscoveryDepth: getAllowedEmailDiscoveryDepth(user, searchInput?.emailDiscoveryDepth ?? 1)
  };
  const source = `google-places:${input.keyword}:${input.area}`;
  const task = existingTask || await addTaskRecord({
    kind: 'search',
    title: '搜索商户',
    status: 'queued',
    progress: 0,
    detail: `${input.keyword} · ${input.area}`,
    context: input
  }, user);

  try {
    await updateTaskRecord(task.id, {
      status: 'running',
      progress: 5,
      detail: `${input.keyword} · ${input.area}`,
      error: ''
    });
    await consumeUsage(user, 'search_places', input.maxResults, { keyword: input.keyword, area: input.area });
    const settings = await getRuntimeSettings();
    await updateTaskRecord(task.id, { progress: 20, detail: '正在查询商户数据' });
    const result = await searchPlaces(input);
    let leads = result.leads.map((lead) => ({
      ...lead,
      sourceKeyword: lead.sourceKeyword || input.keyword,
      sourceKeywords: Array.from(new Set([...(lead.sourceKeywords || []), lead.sourceKeyword || input.keyword].filter(Boolean)))
    }));
    if (input.includeEmailDiscovery) {
      await consumeUsage(user, 'discover_email', Math.max(leads.length, 1), { keyword: input.keyword, area: input.area });
    }
    await updateTaskRecord(task.id, {
      progress: input.includeEmailDiscovery ? 35 : 60,
      detail: `已获取 ${leads.length} 条候选线索`
    });

    if (input.includeEmailDiscovery) {
      leads = await enrichLeadsWithEmails(leads, {
        concurrency: 4,
        retries: 1,
        emailDiscoveryDepth: input.emailDiscoveryDepth,
        settings,
        onProgress: async ({ completed, total }) => {
          const progress = 35 + Math.round((completed / Math.max(total, 1)) * 45);
          await updateTaskRecord(task.id, {
            progress,
            detail: `邮箱发现 ${completed}/${total}`
          });
        }
      });
    }

    await updateTaskRecord(task.id, { progress: input.includeEmailDiscovery ? 78 : 70, detail: '正在翻译展示标签' });
    leads = await translateLeadDisplayLabels(leads, settings);
    await updateTaskRecord(task.id, { progress: 80, detail: '正在写入线索库' });
    const upsert = await upsertLeads(leads, source, user);
    const search = await addSearchRecord({
      keyword: input.keyword,
      area: input.area,
      maxResults: input.maxResults,
      includeEmailDiscovery: input.includeEmailDiscovery,
      languageCode: input.languageCode,
      regionCode: input.regionCode,
      searchMode: input.searchMode,
      placeType: input.placeType,
      emailDiscoveryDepth: input.emailDiscoveryDepth,
      strategies: result.strategies || [],
      pageTokenUsed: Boolean(input.pageToken),
      created: upsert.created,
      updated: upsert.updated,
      nextPageToken: result.nextPageToken
    }, user);
    await updateTaskRecord(task.id, {
      status: 'done',
      progress: 100,
      detail: `完成：新增 ${upsert.created}，更新 ${upsert.updated}`,
      result: {
        created: upsert.created,
        updated: upsert.updated,
        search: {
          id: search.id,
          keyword: search.keyword,
          area: search.area,
          nextPageToken: search.nextPageToken || ''
        }
      },
      completedAt: new Date().toISOString()
    });

    return {
      task,
      search,
      created: upsert.created,
      updated: upsert.updated,
      leads: upsert.leads
    };
  } catch (error) {
    await updateTaskRecord(task.id, {
      status: 'failed',
      progress: 100,
      detail: error instanceof Error ? error.message : '搜索失败',
      error: error instanceof Error ? error.message : '搜索失败',
      completedAt: new Date().toISOString()
    });
    throw error;
  }
}

async function queueSearchTask(searchInput, user = null) {
  const input = {
    ...validateSearchPayload(searchInput),
    emailDiscoveryDepth: getAllowedEmailDiscoveryDepth(user, searchInput?.emailDiscoveryDepth ?? 1)
  };
  const task = await addTaskRecord({
    kind: 'search',
    title: '搜索商户',
    status: 'queued',
    progress: 0,
    detail: `等待执行：${input.keyword} · ${input.area}`,
    context: input
  }, user);
  enqueueSearchTask(() => executeSearchTask(input, user, task));
  return task;
}

async function translateLeadDisplayLabels(leads, settings) {
  const apiKey = settings.googleTranslateApiKey;
  if (!apiKey) return leads;

  const uniqueLabels = [];
  const seen = new Set();
  for (const lead of leads || []) {
    for (const label of [lead?.companyType, lead?.sourceKeyword, ...(lead?.sourceKeywords || [])]) {
      const text = String(label || '').trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueLabels.push(text);
    }
  }

  if (!uniqueLabels.length) return leads;

  let translations = [];
  try {
    translations = await translateWithGoogle({
      values: uniqueLabels,
      targetLanguage: 'zh-CN',
      apiKey
    });
  } catch {
    return leads;
  }

  const translatedByLabel = new Map(uniqueLabels.map((label, index) => [label.toLowerCase(), String(translations[index] || '').trim()]));
  return leads.map((lead) => {
    const sourceKeywords = Array.from(new Set([...(lead.sourceKeywords || []), lead.sourceKeyword].map((item) => String(item || '').trim()).filter(Boolean)));
    return {
      ...lead,
      companyTypeZh: translatedByLabel.get(String(lead.companyType || '').trim().toLowerCase()) || lead.companyTypeZh || '',
      sourceKeywordZh: translatedByLabel.get(String(lead.sourceKeyword || sourceKeywords[0] || '').trim().toLowerCase()) || lead.sourceKeywordZh || '',
      sourceKeywordsZh: sourceKeywords.map((item) => translatedByLabel.get(item.toLowerCase()) || '').filter(Boolean)
    };
  });
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  const settings = await getRuntimeSettings();
  const emailReadiness = getEmailReadiness(settings);
  res.json({
    ok: true,
    googleConfigured: Boolean(settings.googleMapsApiKey),
    mailerMode: getMailerMode(settings),
    authRequired: Boolean(config.adminToken),
    emailReady: emailReadiness.readyForRealSend,
    emailIssues: emailReadiness.issues
  });
}));

app.get('/api/auth/session', asyncHandler(async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  const user = await findUserBySessionToken(token);
  res.json(await getMembershipState(user));
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const user = await registerUser(req.body || {});
  const session = await loginUser(req.body || {});
  res.json({ ...(await getMembershipState(user)), token: session.token });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const session = await loginUser(req.body || {});
  res.json({ ...(await getMembershipState(session.user)), token: session.token });
}));

app.post('/api/auth/logout', asyncHandler(async (req, res) => {
  await logoutSession(getSessionTokenFromRequest(req));
  res.json({ ok: true });
}));

app.use('/api', requireAdminToken);
app.use('/api', attachMembership);

app.get('/api/admin/users', requireAdminRole, asyncHandler(async (_req, res) => {
  res.json({ users: await listUsers() });
}));

app.patch('/api/admin/users/:id', requireAdminRole, asyncHandler(async (req, res) => {
  res.json({ user: await updateUserAdmin(req.params.id, req.body || {}) });
}));

app.get('/api/settings', asyncHandler(async (_req, res) => {
  res.json({ settings: await getClientSettings(_req.user) });
}));

app.post('/api/settings', asyncHandler(async (req, res) => {
  res.json({ settings: await saveClientSettings(settingsInputForUser(req.body || {}, req.user), req.user) });
}));

app.post('/api/email/test-smtp', asyncHandler(async (_req, res) => {
  const settings = await getRuntimeSettings();
  await verifySmtpSettings(settings);
  res.json({ ok: true, message: 'SMTP 连接和认证验证成功。' });
}));

app.post('/api/email/translate', asyncHandler(async (req, res) => {
  const settings = await getRuntimeSettings();
  await consumeUsage(req.user, 'translate_email', 1, { targetLanguage: req.body?.targetLanguage });
  const translated = await translateEmailCampaign({
    subject: req.body?.subject,
    body: req.body?.body,
    htmlBody: req.body?.htmlBody,
    targetLanguage: req.body?.targetLanguage,
    apiKey: settings.googleTranslateApiKey
  });
  res.json(translated);
}));

app.post('/api/whatsapp/translate', asyncHandler(async (req, res) => {
  const settings = await getRuntimeSettings();
  await consumeUsage(req.user, 'translate_whatsapp', 1, { targetLanguage: req.body?.targetLanguage });
  const task = await addTaskRecord({
    kind: 'whatsapp-translate',
    title: 'WhatsApp 翻译',
    status: 'running',
    progress: 20,
    detail: String(req.body?.targetLanguage || '翻译 WhatsApp 消息'),
    context: {
      targetLanguage: req.body?.targetLanguage,
      bodyLength: String(req.body?.body || '').length
    }
  }, req.user);

  try {
    const translated = await translateEmailCampaign({
      subject: '',
      body: req.body?.body,
      htmlBody: '',
      targetLanguage: req.body?.targetLanguage,
      apiKey: settings.googleTranslateApiKey
    });
    await updateTaskRecord(task.id, {
      status: 'done',
      progress: 100,
      detail: `WhatsApp 消息已翻译为 ${translated.targetLanguage}`,
      completedAt: new Date().toISOString()
    });
    res.json({ task, ...translated });
  } catch (error) {
    await updateTaskRecord(task.id, {
      status: 'failed',
      progress: 100,
      detail: error instanceof Error ? error.message : 'WhatsApp 翻译失败',
      error: error instanceof Error ? error.message : 'WhatsApp 翻译失败',
      completedAt: new Date().toISOString()
    });
    throw error;
  }
}));

app.post('/api/email/generate-drafts', asyncHandler(async (req, res) => {
  const settings = await getRuntimeSettings();
  await consumeUsage(req.user, 'ai_email_generation', 1, { keywords: req.body?.keywords, audience: req.body?.audience });
  const task = await addTaskRecord({
    kind: 'analysis',
    title: '生成推广邮件',
    status: 'running',
    progress: 10,
    detail: String(req.body?.keywords || req.body?.audience || 'AI 邮件生成'),
    context: {
      keywords: req.body?.keywords,
      country: req.body?.country,
      region: req.body?.region,
      model: settings.openAiModel || config.openAiModel
    }
  }, req.user);

  try {
    await updateTaskRecord(task.id, { progress: 35, detail: '正在生成邮件版本' });
    const drafts = await generateEmailDrafts({
      keywords: req.body?.keywords,
      country: req.body?.country,
      region: req.body?.region,
      audience: req.body?.audience,
      apiKey: settings.openAiApiKey,
      baseUrl: settings.openAiBaseUrl,
      model: settings.openAiModel || config.openAiModel
    });
    await updateTaskRecord(task.id, {
      status: 'done',
      progress: 100,
      detail: `已生成 ${drafts.length} 版邮件`,
      completedAt: new Date().toISOString()
    });
    res.json({ task, drafts });
  } catch (error) {
    await updateTaskRecord(task.id, {
      status: 'failed',
      progress: 100,
      detail: error instanceof Error ? error.message : 'AI 邮件生成失败',
      error: error instanceof Error ? error.message : 'AI 邮件生成失败',
      completedAt: new Date().toISOString()
    });
    throw error;
  }
}));

app.post('/api/whatsapp/generate-drafts', asyncHandler(async (req, res) => {
  const settings = await getRuntimeSettings();
  await consumeUsage(req.user, 'ai_whatsapp_generation', 1, { keywords: req.body?.keywords, audience: req.body?.audience });
  const task = await addTaskRecord({
    kind: 'analysis',
    title: '生成 WhatsApp 文案',
    status: 'running',
    progress: 10,
    detail: String(req.body?.keywords || req.body?.audience || 'AI WhatsApp 文案生成'),
    context: {
      keywords: req.body?.keywords,
      country: req.body?.country,
      region: req.body?.region,
      model: settings.openAiModel || config.openAiModel
    }
  }, req.user);

  try {
    await updateTaskRecord(task.id, { progress: 35, detail: '正在生成 WhatsApp 文案版本' });
    const drafts = await generateWhatsAppDrafts({
      keywords: req.body?.keywords,
      country: req.body?.country,
      region: req.body?.region,
      audience: req.body?.audience,
      apiKey: settings.openAiApiKey,
      baseUrl: settings.openAiBaseUrl,
      model: settings.openAiModel || config.openAiModel
    });
    await updateTaskRecord(task.id, {
      status: 'done',
      progress: 100,
      detail: `已生成 ${drafts.length} 版 WhatsApp 文案`,
      completedAt: new Date().toISOString()
    });
    res.json({ task, drafts });
  } catch (error) {
    await updateTaskRecord(task.id, {
      status: 'failed',
      progress: 100,
      detail: error instanceof Error ? error.message : 'AI WhatsApp 文案生成失败',
      error: error instanceof Error ? error.message : 'AI WhatsApp 文案生成失败',
      completedAt: new Date().toISOString()
    });
    throw error;
  }
}));

app.get('/api/leads', asyncHandler(async (_req, res) => {
  const store = await readStore();
  const leads = visibleRecords(store.leads || [], _req.user);
  const searches = visibleRecords(store.searches || [], _req.user);
  const campaigns = visibleRecords(store.campaigns || [], _req.user);
  const tasks = visibleRecords(store.tasks || [], _req.user);
  const sendLog = visibleRecords(store.sendLog || [], _req.user).slice(0, 100);
  res.json({
    leads,
    searches,
    campaigns,
    tasks,
    suppressions: isSuperAdmin(_req.user) ? store.suppressions : [],
    sendLog
  });
}));

app.delete('/api/leads', asyncHandler(async (_req, res) => {
  res.json({ result: await deleteAllLeadData(_req.user) });
}));

app.post('/api/searches/analyze-keywords', asyncHandler(async (req, res) => {
  const settings = await getRuntimeSettings();
  await consumeUsage(req.user, 'ai_keyword_analysis', 1, { keywords: req.body?.keywords, country: req.body?.country });
  const task = await addTaskRecord({
    kind: 'analysis',
    title: 'AI 关键词分析',
    status: 'running',
    progress: 10,
    detail: String(req.body?.keywords || '关键词分析'),
    context: {
      keywords: req.body?.keywords,
      country: req.body?.country,
      region: req.body?.region,
      model: settings.openAiModel || config.openAiModel
    }
  }, req.user);

  try {
    await updateTaskRecord(task.id, { progress: 35, detail: '正在分析搜索意图' });
    const strategy = await analyzeKeywords({
      keywords: req.body?.keywords,
      country: req.body?.country,
      region: req.body?.region,
      apiKey: settings.openAiApiKey,
      baseUrl: settings.openAiBaseUrl,
      model: settings.openAiModel || config.openAiModel
    });
    await updateTaskRecord(task.id, {
      status: 'done',
      progress: 100,
      detail: strategy.source === 'fallback' ? '已生成基础策略' : 'AI 分析完成',
      completedAt: new Date().toISOString()
    });
    res.json({ task, strategy });
  } catch (error) {
    await updateTaskRecord(task.id, {
      status: 'failed',
      progress: 100,
      detail: error instanceof Error ? error.message : 'AI 关键词分析失败',
      error: error instanceof Error ? error.message : 'AI 关键词分析失败',
      completedAt: new Date().toISOString()
    });
    throw error;
  }
}));

app.post('/api/tasks/:id/retry', asyncHandler(async (req, res) => {
  const task = await getTaskRecord(req.params.id, req.user);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.status !== 'failed') {
    return res.status(400).json({ error: 'Only failed tasks can be retried.' });
  }
  if (task.kind !== 'search') {
    return res.status(400).json({ error: 'Only failed search tasks can be retried from the task panel.' });
  }
  const queuedTask = await queueSearchTask(task.context || {}, req.user);
  res.status(202).json({
    retriedFrom: task.id,
    queued: true,
    task: queuedTask
  });
}));

app.get('/api/tasks/:id', asyncHandler(async (req, res) => {
  const task = await getTaskRecord(req.params.id, req.user);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task });
}));

app.delete('/api/tasks', asyncHandler(async (req, res) => {
  const rawStatus = String(req.query.status || 'done,failed');
  const statuses = rawStatus === 'all' ? [] : rawStatus.split(',');
  res.json({ result: await deleteTaskRecords({ statuses, user: req.user }) });
}));

app.delete('/api/send-log', asyncHandler(async (_req, res) => {
  res.json({ result: await deleteSendLogEntries(_req.user) });
}));

app.post('/api/searches', asyncHandler(async (req, res) => {
  const task = await queueSearchTask(req.body || {}, req.user);
  res.status(202).json({ queued: true, task });
}));

app.post('/api/leads/:id/discover-email', asyncHandler(async (req, res) => {
  const store = await readStore();
  const lead = findVisibleLead(store, req.params.id, req.user);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  await consumeUsage(req.user, 'discover_email', 1, { leadId: lead.id, website: lead.website });
  const settings = await getRuntimeSettings();
  const enriched = await enrichLeadWaterfall(lead, {
    settings,
    emailDiscoveryDepth: getAllowedEmailDiscoveryDepth(req.user, req.body?.emailDiscoveryDepth ?? lead.emailDiscoveryDepth ?? 1),
    enableAiResearch: Boolean(req.body?.enableAiResearch)
  });
  const patch = {
    ...enriched,
    emailQuality: await assessLeadEmails(enriched.emails || [], { website: lead.website }),
    emailDiscoveryCheckedAt: new Date().toISOString(),
    emailDiscoveryAttempts: (lead.emailDiscoveryAttempts || 0) + 1
  };
  const updated = await updateLead(lead.id, patch, req.user);
  res.json({ lead: updated, discovered: enriched.emails || [], steps: enriched.enrichmentSteps || [] });
}));

app.post('/api/leads/:id', asyncHandler(async (req, res) => {
  const patch = validateLeadPatch(req.body);
  const lead = await updateLead(req.params.id, patch, req.user);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({ lead });
}));

app.get('/api/export/leads.csv', asyncHandler(async (_req, res) => {
  await consumeUsage(_req.user, 'export_csv', 1, { kind: 'leads' });
  const store = await readStore();
  const leads = visibleRecords(store.leads || [], _req.user);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(leadsToCsv(leads));
}));

app.delete('/api/lead-groups', asyncHandler(async (req, res) => {
  const result = await deleteLeadKeywordGroup(req.body?.keyword, req.body?.action, req.user);
  res.json({ result });
}));

app.post('/api/suppressions', asyncHandler(async (req, res) => {
  const { email, reason } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email 是必填项。' });
  const normalized = await addSuppression(validateEmail(email), typeof reason === 'string' ? reason.slice(0, 200) : 'manual');
  res.json({ email: normalized });
}));

app.get('/unsubscribe/:token', asyncHandler(async (req, res) => {
  const entry = await findUnsubscribeToken(req.params.token);
  sendUnsubscribePage(res, entry ? 200 : 404, { invalid: !entry });
}));

app.post('/unsubscribe/:token', asyncHandler(async (req, res) => {
  const result = await unsubscribeByToken(req.params.token);
  if (!result) {
    return sendUnsubscribePage(res, 404, { invalid: true });
  }
  sendUnsubscribePage(res, 200, { confirmed: true });
}));

app.post('/api/campaigns/preview', asyncHandler(async (req, res) => {
  const campaign = validateCampaignInput(req.body);
  const store = await readStore();
  const manualEmail = campaign.recipients[0];
  const leads = visibleRecords(store.leads || [], req.user);
  const sample = manualEmail
    ? { id: `manual:${manualEmail}`, name: manualEmail.split('@')[0], emails: [manualEmail] }
    : leads.find((lead) => (lead.emails || []).length) || leads[0];
  if (!sample) return res.status(400).json({ error: '还没有线索可用于预览。' });
  const settings = await getRuntimeSettings();
  const unsubscribeUrl = buildUnsubscribeUrl(settings, 'preview-token');
  res.json({ preview: previewCampaign(campaign, { ...sample, unsubscribeUrl }) });
}));

app.post('/api/campaigns/send', asyncHandler(async (req, res) => {
  const campaign = validateCampaignInput(req.body);
  const task = await addTaskRecord({
    kind: 'campaign-send',
    title: campaign.dryRun ? '预演发送' : '发送邮件',
    status: 'queued',
    progress: 0,
    detail: `${campaign.subject}`,
    context: {
      dryRun: campaign.dryRun,
      subject: campaign.subject,
      body: campaign.body,
      htmlBody: campaign.htmlBody,
      recipients: campaign.recipients,
      recipientCount: campaign.recipients.length,
      leadIds: campaign.leadIds,
      leadIdCount: campaign.leadIds.length
    }
  }, req.user);

  await enqueueCampaign(async () => {
    const store = await readStore();
    const settings = await getRuntimeSettings();
    const emailReadiness = getEmailReadiness(settings);
    await updateTaskRecord(task.id, {
      status: 'running',
      progress: 10,
      detail: campaign.dryRun ? '正在生成预演' : '正在准备发送'
    });
    if (!campaign.dryRun && !emailReadiness.readyForRealSend) {
      await updateTaskRecord(task.id, {
        status: 'failed',
        progress: 100,
        detail: emailReadiness.issues.join('；'),
        error: emailReadiness.issues.join('；'),
        completedAt: new Date().toISOString()
      });
      throw Object.assign(new Error(`邮件尚未达到真实发送条件：${emailReadiness.issues.join('；')}`), { status: 400 });
    }
    const dailyLimit = Math.max(1, Math.floor(Number(settings.emailDailyLimit) || 1));
    const usedBefore = countDailySendAttempts(store.sendLog, new Date(), req.user?.id || '');
    const remainingBefore = Math.max(0, dailyLimit - usedBefore);
    const availableLeads = campaign.recipients.length
      ? campaign.recipients.map((email, index) => ({
          id: `manual:${index}:${email}`,
          name: email.split('@')[0],
          emails: [email],
          status: 'manual'
        }))
      : visibleRecords(store.leads || [], req.user);
    const selected = selectCampaignLeads({
      leads: availableLeads,
      leadIds: campaign.leadIds,
      batchLimit: dailyLimit,
      dailyRemaining: remainingBefore,
      dryRun: campaign.dryRun
    });
    if (!campaign.dryRun) {
      await consumeUsage(req.user, 'send_email', Math.max(selected.length, 1), { subject: campaign.subject });
    }

    await updateTaskRecord(task.id, {
      progress: 30,
      detail: `已选择 ${selected.length} 封，正在${campaign.dryRun ? '预演' : '发送'}`
    });

    const delivery = await sendCampaign({
      subject: campaign.subject,
      body: campaign.body,
      htmlBody: campaign.htmlBody,
      leads: selected,
      suppressions: store.suppressions,
      dryRun: campaign.dryRun,
      onProgress: async ({ completed, total, result }) => {
        const base = campaign.dryRun ? 30 : 35;
        const span = campaign.dryRun ? 60 : 55;
        const progress = base + Math.round((completed / Math.max(total, 1)) * span);
        const statusText = result?.status === 'sent'
          ? '已发送'
          : result?.status === 'dry-run'
            ? '已预演'
            : result?.status === 'failed'
              ? '发送失败'
              : '已跳过';
        await updateTaskRecord(task.id, {
          progress,
          detail: `${statusText} ${completed}/${total}`
        });
      }
    });

    await addCampaignRecord({
      subject: campaign.subject,
      body: campaign.body,
      hasHtmlBody: Boolean(campaign.htmlBody),
      dryRun: campaign.dryRun,
      mode: delivery.mode,
      leadCount: selected.length
    }, req.user);
    await addSendLog(delivery.results, req.user);
    await updateTaskRecord(task.id, {
      status: 'done',
      progress: 100,
      detail: `完成：成功 ${delivery.results.filter((item) => item.status === 'sent').length}，失败 ${delivery.results.filter((item) => item.status === 'failed').length}，跳过 ${delivery.results.filter((item) => item.status === 'skipped').length}`,
      completedAt: new Date().toISOString()
    });
    res.json({
      task,
      ...delivery,
      limit: { dailyLimit, usedBefore, remainingBefore, selected: selected.length }
    });
  }).catch(async (error) => {
    await updateTaskRecord(task.id, {
      status: 'failed',
      progress: 100,
      detail: error instanceof Error ? error.message : '发送失败',
      error: error instanceof Error ? error.message : '发送失败',
      completedAt: new Date().toISOString()
    });
    throw error;
  });
}));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({ error: error.message || 'Internal server error' });
});

export { app };

const isMainModule = process.argv[1]
  && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
if (isMainModule) {
  app.listen(config.port, config.host, () => {
    console.log(`Leadgen API running at http://${config.host}:${config.port}`);
  });
}
