import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultStorePath = join(__dirname, 'data', 'store.json');
let storeMutationQueue = Promise.resolve();

function getStorePath() {
  return process.env.LEADGEN_STORE_PATH || defaultStorePath;
}

const emptyStore = () => ({
  leads: [],
  searches: [],
  campaigns: [],
  tasks: [],
  suppressions: [],
  unsubscribeTokens: [],
  sendLog: [],
  users: [],
  sessions: [],
  usageRecords: []
});

async function ensureStore() {
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  try {
    await readFile(storePath, 'utf8');
  } catch {
    await writeFile(storePath, JSON.stringify(emptyStore(), null, 2));
  }
}

export async function readStore() {
  await ensureStore();
  const storePath = getStorePath();
  const raw = await readFile(storePath, 'utf8');
  return { ...emptyStore(), ...JSON.parse(raw) };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function renameWithRetry(sourcePath, targetPath, { attempts = 12, delayMs = 35 } = {}) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await rename(sourcePath, targetPath);
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || index === attempts - 1) {
        throw error;
      }
      await wait(delayMs * (index + 1));
    }
  }
}

async function writeStoreAtomic(nextStore) {
  const storePath = getStorePath();
  const temporaryPath = `${storePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await mkdir(dirname(storePath), { recursive: true });
  try {
    await writeFile(temporaryPath, JSON.stringify(nextStore, null, 2));
    await renameWithRetry(temporaryPath, storePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function acquireFileLock(filePath, { timeoutMs = 5000, staleMs = 30_000 } = {}) {
  const lockPath = `${filePath}.lock`;
  const startedAt = Date.now();
  await mkdir(dirname(filePath), { recursive: true });
  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return async () => {
        await handle.close().catch(() => {});
        await rm(lockPath, { force: true }).catch(() => {});
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const details = await stat(lockPath).catch(() => null);
      if (details && Date.now() - details.mtimeMs > staleMs) {
        await rm(lockPath, { force: true }).catch(() => {});
        continue;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw Object.assign(new Error('Store is busy, please retry.'), { status: 503 });
      }
      await wait(15 + Math.floor(Math.random() * 20));
    }
  }
}

function enqueueStoreMutation(task) {
  const result = storeMutationQueue.then(task, task);
  storeMutationQueue = result.catch(() => {});
  return result;
}

export async function mutateStore(mutator) {
  return enqueueStoreMutation(async () => {
    const release = await acquireFileLock(getStorePath());
    try {
      const store = await readStore();
      const result = await mutator(store);
      await writeStoreAtomic(store);
      return result;
    } finally {
      await release();
    }
  });
}

export async function writeStore(nextStore) {
  return enqueueStoreMutation(async () => {
    const release = await acquireFileLock(getStorePath());
    try {
      await writeStoreAtomic(nextStore);
    } finally {
      await release();
    }
  });
}

function normalizeOwnerId(userOrId = null) {
  if (!userOrId) return '';
  if (typeof userOrId === 'string') return userOrId.trim();
  return String(userOrId.id || '').trim();
}

function isSuperAdminUser(user = null) {
  return user?.role === 'super_admin';
}

function recordBelongsToUser(record, user = null) {
  const ownerId = normalizeOwnerId(user);
  if (!ownerId || isSuperAdminUser(user)) return true;
  return normalizeOwnerId(record?.userId || record?.ownerId) === ownerId;
}

export function normalizeLeadKey(lead, ownerId = '') {
  const scope = normalizeOwnerId(ownerId) || normalizeOwnerId(lead?.userId) || normalizeOwnerId(lead?.ownerId);
  if (lead.placeId) return `${scope}|place:${lead.placeId}`;
  if (lead.website) return `${scope}|site:${lead.website.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return `${scope}|name:${lead.name.toLowerCase()}|${lead.address.toLowerCase()}`;
}

function mergeEmailQuality(existingQuality = [], incomingQuality = [], emails = []) {
  const byEmail = new Map();
  for (const item of [...existingQuality, ...incomingQuality]) {
    if (!item?.email) continue;
    byEmail.set(String(item.email).toLowerCase(), item);
  }
  return emails.map((email) => byEmail.get(String(email).toLowerCase())).filter(Boolean);
}

function mergeEmailSources(existingSources = [], incomingSources = []) {
  const byKey = new Map();
  for (const item of [...existingSources, ...incomingSources]) {
    if (!item?.email || !item?.url) continue;
    byKey.set(`${String(item.email).toLowerCase()}|${item.url}`, {
      ...item,
      email: String(item.email).toLowerCase()
    });
  }
  return Array.from(byKey.values());
}

function mergeWhatsAppContacts(existingContacts = [], incomingContacts = []) {
  const byKey = new Map();
  for (const item of [...existingContacts, ...incomingContacts]) {
    if (!item?.url && !item?.phone) continue;
    byKey.set(String(item.phone || item.url).toLowerCase(), item);
  }
  return Array.from(byKey.values());
}

function mergeTextList(...lists) {
  return Array.from(new Set(
    lists
      .flat()
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));
}

function mergeKeywordTranslations(existing = {}, incoming = {}, sourceKeywords = []) {
  const byKeyword = new Map();
  const addMappings = (lead = {}) => {
    const keywords = [...(lead.sourceKeywords || []), lead.sourceKeyword].map((item) => String(item || '').trim()).filter(Boolean);
    const translations = [...(lead.sourceKeywordsZh || []), lead.sourceKeywordZh].map((item) => String(item || '').trim());
    keywords.forEach((keyword, index) => {
      const translated = translations[index];
      if (translated) byKeyword.set(keyword.toLowerCase(), translated);
    });
  };
  addMappings(existing);
  addMappings(incoming);
  return sourceKeywords.map((keyword) => byKeyword.get(String(keyword || '').trim().toLowerCase()) || '');
}

export async function upsertLeads(incomingLeads, source, user = null) {
  return mutateStore((store) => {
    const ownerId = normalizeOwnerId(user);
    const byKey = new Map(store.leads.map((lead) => [normalizeLeadKey(lead, lead.userId || lead.ownerId), lead]));
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const incoming of incomingLeads) {
      const leadOwnerId = ownerId || normalizeOwnerId(incoming.userId) || normalizeOwnerId(incoming.ownerId);
      const key = normalizeLeadKey(incoming, leadOwnerId);
      const existing = byKey.get(key);
      if (existing) {
        const emails = Array.from(new Set([...(existing.emails || []), ...(incoming.emails || [])]));
        const emailQuality = mergeEmailQuality(existing.emailQuality, incoming.emailQuality, emails);
        const emailSources = mergeEmailSources(existing.emailSources, incoming.emailSources);
        const whatsappContacts = mergeWhatsAppContacts(existing.whatsappContacts, incoming.whatsappContacts);
        const sourceKeywords = mergeTextList(
          existing.sourceKeywords,
          existing.sourceKeyword,
          incoming.sourceKeywords,
          incoming.sourceKeyword
        );
        const sourceKeywordsZh = mergeKeywordTranslations(existing, incoming, sourceKeywords);
        const matchStrategies = mergeTextList(
          existing.matchStrategies,
          existing.matchStrategy,
          incoming.matchStrategies,
          incoming.matchStrategy
        );
        const searchSources = Array.from(new Set([
          ...(existing.searchSources || []),
          ...(existing.source ? [existing.source] : []),
          ...(source ? [source] : [])
        ]));
        Object.assign(existing, {
          ...existing,
          ...incoming,
          userId: existing.userId || leadOwnerId || '',
          emails,
          emailQuality,
          emailSources,
          whatsappContacts,
          whatsappVerified: Boolean(existing.whatsappVerified || incoming.whatsappVerified || whatsappContacts.length),
          sourceKeywords,
          sourceKeyword: incoming.sourceKeyword || existing.sourceKeyword || sourceKeywords[0] || '',
          sourceKeywordsZh,
          sourceKeywordZh: incoming.sourceKeywordZh || existing.sourceKeywordZh || sourceKeywordsZh[0] || '',
          matchStrategies,
          tags: Array.from(new Set([...(existing.tags || []), ...(incoming.tags || [])])),
          searchSources,
          updatedAt: now
        });
        updated += 1;
      } else {
        const lead = {
          id: randomUUID(),
          emails: [],
          tags: [],
          status: 'new',
          createdAt: now,
          updatedAt: now,
          source,
          userId: leadOwnerId || '',
          searchSources: source ? [source] : [],
          ...incoming
        };
        store.leads.push(lead);
        byKey.set(key, lead);
        created += 1;
      }
    }

    return { leads: store.leads, created, updated };
  });
}

export async function updateLead(leadId, patch, user = null) {
  return mutateStore((store) => {
    const lead = store.leads.find((item) => item.id === leadId);
    if (!lead || !recordBelongsToUser(lead, user)) return null;
    Object.assign(lead, patch, { updatedAt: new Date().toISOString() });
    return lead;
  });
}

export async function addSearchRecord(record, user = null) {
  return mutateStore((store) => {
    const search = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      userId: normalizeOwnerId(user),
      ...record
    };
    store.searches.unshift(search);
    return search;
  });
}

export async function addTaskRecord(record, user = null) {
  return mutateStore((store) => {
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      status: 'queued',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      userId: normalizeOwnerId(user),
      ...record
    };
    store.tasks.unshift(task);
    store.tasks = store.tasks.slice(0, 50);
    return task;
  });
}

export async function updateTaskRecord(taskId, patch) {
  return mutateStore((store) => {
    const task = store.tasks.find((item) => item.id === taskId);
    if (!task) return null;
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    return task;
  });
}

export async function getTaskRecord(taskId, user = null) {
  const store = await readStore();
  const ownerId = normalizeOwnerId(user);
  const isSuperAdmin = user?.role === 'super_admin';
  return store.tasks.find((item) => item.id === taskId && (isSuperAdmin || !ownerId || item.userId === ownerId)) || null;
}

export async function deleteTaskRecords({ statuses = [], user = null } = {}) {
  const normalizedStatuses = new Set(
    statuses.map((status) => String(status || '').trim().toLowerCase()).filter(Boolean)
  );
  const ownerId = normalizeOwnerId(user);
  const isSuperAdmin = user?.role === 'super_admin';
  return mutateStore((store) => {
    const before = store.tasks.length;
    if (!normalizedStatuses.size) {
      store.tasks = isSuperAdmin || !ownerId
        ? []
        : store.tasks.filter((task) => task.userId !== ownerId);
    } else {
      store.tasks = store.tasks.filter((task) => {
        if (!normalizedStatuses.has(String(task.status || '').toLowerCase())) return true;
        return !isSuperAdmin && ownerId && task.userId !== ownerId;
      });
    }
    return { deletedTasks: before - store.tasks.length };
  });
}

export async function deleteLeadKeywordGroup(keyword, action, user = null) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!normalizedKeyword) {
    throw Object.assign(new Error('keyword 是必填项。'), { status: 400 });
  }
  if (!['tag', 'contents'].includes(action)) {
    throw Object.assign(new Error('action 必须是 tag 或 contents。'), { status: 400 });
  }

  return mutateStore((store) => {
    const matchingSearches = store.searches.filter((search) => {
      return String(search.keyword || '').trim().toLowerCase() === normalizedKeyword && recordBelongsToUser(search, user);
    });
    if (!matchingSearches.length) {
      throw Object.assign(new Error('没有找到对应的关键词标签。'), { status: 404 });
    }

    const targetSources = new Set(matchingSearches.map((search) => {
      return `google-places:${search.keyword}:${search.area}`;
    }));
    let deletedLeads = 0;
    let detachedLeads = 0;

    if (action === 'tag') {
      store.searches = store.searches.filter((search) => {
        return String(search.keyword || '').trim().toLowerCase() !== normalizedKeyword || !recordBelongsToUser(search, user);
      });
    }

    store.leads = store.leads.filter((lead) => {
      if (!recordBelongsToUser(lead, user)) return true;
      const currentSources = Array.from(new Set([
        ...(lead.searchSources || []),
        ...(lead.source ? [lead.source] : [])
      ]));
      const belongsToGroup = currentSources.some((source) => targetSources.has(source));
      if (!belongsToGroup) return true;

      const remainingSources = currentSources.filter((source) => !targetSources.has(source));
      if (action === 'contents' && !remainingSources.length) {
        deletedLeads += 1;
        return false;
      }

      lead.searchSources = remainingSources;
      lead.source = remainingSources[0] || '';
      lead.updatedAt = new Date().toISOString();
      detachedLeads += 1;
      return true;
    });

    return {
      action,
      keyword: matchingSearches[0].keyword,
      deletedSearches: action === 'tag' ? matchingSearches.length : 0,
      deletedLeads,
      detachedLeads
    };
  });
}

export async function deleteAllLeadData(user = null) {
  return mutateStore((store) => {
    const deletedLeads = store.leads.filter((lead) => recordBelongsToUser(lead, user)).length;
    const deletedSearches = store.searches.filter((search) => recordBelongsToUser(search, user)).length;
    if (isSuperAdminUser(user) || !normalizeOwnerId(user)) {
      store.leads = [];
      store.searches = [];
    } else {
      store.leads = store.leads.filter((lead) => !recordBelongsToUser(lead, user));
      store.searches = store.searches.filter((search) => !recordBelongsToUser(search, user));
    }
    return { deletedLeads, deletedSearches };
  });
}

export async function addCampaignRecord(record, user = null) {
  return mutateStore((store) => {
    const campaign = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      userId: normalizeOwnerId(user),
      ...record
    };
    store.campaigns.unshift(campaign);
    return campaign;
  });
}

export async function addSendLog(entries, user = null) {
  return mutateStore((store) => {
    const ownerId = normalizeOwnerId(user);
    store.sendLog.unshift(...entries.map((entry) => ({
      id: randomUUID(),
      at: new Date().toISOString(),
      userId: ownerId,
      ...entry
    })));
    store.sendLog = store.sendLog.slice(0, 500);
  });
}

export async function deleteSendLogEntries(user = null) {
  return mutateStore((store) => {
    const deletedSendLog = store.sendLog.filter((entry) => recordBelongsToUser(entry, user)).length;
    if (isSuperAdminUser(user) || !normalizeOwnerId(user)) {
      store.sendLog = [];
    } else {
      store.sendLog = store.sendLog.filter((entry) => !recordBelongsToUser(entry, user));
    }
    return { deletedSendLog };
  });
}

export async function addSuppression(email, reason = 'manual') {
  const normalized = normalizeEmail(email);
  return mutateStore((store) => {
    if (!store.suppressions.some((item) => item.email === normalized)) {
      store.suppressions.push({ email: normalized, reason, createdAt: new Date().toISOString() });
    }
    return normalized;
  });
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function ensureUnsubscribeToken(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  return mutateStore((store) => {
    const existing = store.unsubscribeTokens.find((item) => item.email === normalized);
    if (existing) return existing.token;

    const entry = {
      email: normalized,
      token: randomBytes(24).toString('base64url'),
      createdAt: new Date().toISOString()
    };
    store.unsubscribeTokens.push(entry);
    return entry.token;
  });
}

export async function findUnsubscribeToken(token) {
  const store = await readStore();
  return store.unsubscribeTokens.find((item) => item.token === token) || null;
}

export async function unsubscribeByToken(token) {
  return mutateStore((store) => {
    const entry = store.unsubscribeTokens.find((item) => item.token === token);
    if (!entry) return null;

    const email = normalizeEmail(entry.email);
    const existing = store.suppressions.find((item) => item.email === email);
    if (!existing) {
      store.suppressions.push({
        email,
        reason: 'unsubscribe',
        createdAt: new Date().toISOString()
      });
    }

    return { email, alreadyUnsubscribed: Boolean(existing) };
  });
}
