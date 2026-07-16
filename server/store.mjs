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

async function writeStoreAtomic(nextStore) {
  const storePath = getStorePath();
  const temporaryPath = `${storePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await mkdir(dirname(storePath), { recursive: true });
  try {
    await writeFile(temporaryPath, JSON.stringify(nextStore, null, 2));
    await rename(temporaryPath, storePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

export function normalizeLeadKey(lead) {
  if (lead.placeId) return `place:${lead.placeId}`;
  if (lead.website) return `site:${lead.website.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return `name:${lead.name.toLowerCase()}|${lead.address.toLowerCase()}`;
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

export async function upsertLeads(incomingLeads, source) {
  return mutateStore((store) => {
    const byKey = new Map(store.leads.map((lead) => [normalizeLeadKey(lead), lead]));
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const incoming of incomingLeads) {
      const key = normalizeLeadKey(incoming);
      const existing = byKey.get(key);
      if (existing) {
        const emails = Array.from(new Set([...(existing.emails || []), ...(incoming.emails || [])]));
        const emailQuality = mergeEmailQuality(existing.emailQuality, incoming.emailQuality, emails);
        const emailSources = mergeEmailSources(existing.emailSources, incoming.emailSources);
        const searchSources = Array.from(new Set([
          ...(existing.searchSources || []),
          ...(existing.source ? [existing.source] : []),
          ...(source ? [source] : [])
        ]));
        Object.assign(existing, {
          ...existing,
          ...incoming,
          emails,
          emailQuality,
          emailSources,
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

export async function updateLead(leadId, patch) {
  return mutateStore((store) => {
    const lead = store.leads.find((item) => item.id === leadId);
    if (!lead) return null;
    Object.assign(lead, patch, { updatedAt: new Date().toISOString() });
    return lead;
  });
}

export async function addSearchRecord(record) {
  return mutateStore((store) => {
    const search = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...record
    };
    store.searches.unshift(search);
    return search;
  });
}

export async function addTaskRecord(record) {
  return mutateStore((store) => {
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      status: 'queued',
      progress: 0,
      createdAt: now,
      updatedAt: now,
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

export async function getTaskRecord(taskId) {
  const store = await readStore();
  return store.tasks.find((item) => item.id === taskId) || null;
}

export async function deleteTaskRecords({ statuses = [] } = {}) {
  const normalizedStatuses = new Set(
    statuses.map((status) => String(status || '').trim().toLowerCase()).filter(Boolean)
  );
  return mutateStore((store) => {
    const before = store.tasks.length;
    if (!normalizedStatuses.size) {
      store.tasks = [];
    } else {
      store.tasks = store.tasks.filter((task) => !normalizedStatuses.has(String(task.status || '').toLowerCase()));
    }
    return { deletedTasks: before - store.tasks.length };
  });
}

export async function deleteLeadKeywordGroup(keyword, action) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!normalizedKeyword) {
    throw Object.assign(new Error('keyword 是必填项。'), { status: 400 });
  }
  if (!['tag', 'contents'].includes(action)) {
    throw Object.assign(new Error('action 必须是 tag 或 contents。'), { status: 400 });
  }

  return mutateStore((store) => {
    const matchingSearches = store.searches.filter((search) => {
      return String(search.keyword || '').trim().toLowerCase() === normalizedKeyword;
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
        return String(search.keyword || '').trim().toLowerCase() !== normalizedKeyword;
      });
    }

    store.leads = store.leads.filter((lead) => {
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

export async function deleteAllLeadData() {
  return mutateStore((store) => {
    const deletedLeads = store.leads.length;
    const deletedSearches = store.searches.length;
    store.leads = [];
    store.searches = [];
    return { deletedLeads, deletedSearches };
  });
}

export async function addCampaignRecord(record) {
  return mutateStore((store) => {
    const campaign = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...record
    };
    store.campaigns.unshift(campaign);
    return campaign;
  });
}

export async function addSendLog(entries) {
  return mutateStore((store) => {
    store.sendLog.unshift(...entries.map((entry) => ({ id: randomUUID(), at: new Date().toISOString(), ...entry })));
    store.sendLog = store.sendLog.slice(0, 500);
  });
}

export async function deleteSendLogEntries() {
  return mutateStore((store) => {
    const deletedSendLog = store.sendLog.length;
    store.sendLog = [];
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
