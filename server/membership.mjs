import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mutateStore, readStore, normalizeEmail } from './store.mjs';

const scryptAsync = promisify(scrypt);
const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;

export const roles = ['super_admin', 'admin', 'manager', 'member'];
export const plans = {
  free: {
    key: 'free',
    name: 'Free',
    limits: {
      search_places: 10,
      discover_email: 10,
      ai_keyword_analysis: 3,
      ai_email_generation: 3,
      ai_whatsapp_generation: 3,
      translate_email: 3,
      translate_whatsapp: 3,
      send_email: 5,
      export_csv: 0
    },
    maxEmailDiscoveryDepth: 1,
    maxTeamMembers: 1
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    limits: {
      search_places: 500,
      discover_email: 500,
      ai_keyword_analysis: 30,
      ai_email_generation: 30,
      ai_whatsapp_generation: 30,
      translate_email: 30,
      translate_whatsapp: 30,
      send_email: 300,
      export_csv: 20
    },
    maxEmailDiscoveryDepth: 2,
    maxTeamMembers: 1
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    limits: {
      search_places: 5000,
      discover_email: 5000,
      ai_keyword_analysis: 300,
      ai_email_generation: 300,
      ai_whatsapp_generation: 300,
      translate_email: 300,
      translate_whatsapp: 300,
      send_email: 3000,
      export_csv: 200
    },
    maxEmailDiscoveryDepth: 3,
    maxTeamMembers: 5
  },
  business: {
    key: 'business',
    name: 'Business',
    limits: {
      search_places: null,
      discover_email: null,
      ai_keyword_analysis: null,
      ai_email_generation: null,
      ai_whatsapp_generation: null,
      translate_email: null,
      translate_whatsapp: null,
      send_email: null,
      export_csv: null
    },
    maxEmailDiscoveryDepth: 3,
    maxTeamMembers: 50
  }
};

const roleRank = {
  super_admin: 4,
  admin: 3,
  manager: 2,
  member: 1
};

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function authError(message, status = 401) {
  return Object.assign(new Error(message), { status });
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
}

function normalizeRole(value, fallback = 'member') {
  return roles.includes(value) ? value : fallback;
}

function normalizePlan(value, fallback = 'free') {
  return plans[value] ? value : fallback;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw badRequest('password must be 8 to 200 characters.');
  }
}

function validateEmailAddress(email) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(normalized)) {
    throw badRequest('email format is invalid.');
  }
  return normalized;
}

async function hashPassword(password, salt = randomBytes(16).toString('base64url')) {
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString('base64url') };
}

async function verifyPassword(password, user) {
  if (!user?.passwordSalt || !user?.passwordHash) return false;
  const { hash } = await hashPassword(password, user.passwordSalt);
  const provided = Buffer.from(hash);
  const expected = Buffer.from(user.passwordHash);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function serializeMembershipState({ user = null, usage = [], membershipEnabled = true } = {}) {
  return {
    membershipEnabled,
    user: sanitizeUser(user),
    plans,
    usage
  };
}

export async function getMembershipState(user = null) {
  const store = await readStore();
  return serializeMembershipState({
    membershipEnabled: true,
    user,
    usage: user ? getUsageSummaryForUser(store, user) : []
  });
}

export async function registerUser(input = {}) {
  const email = validateEmailAddress(input.email);
  validatePassword(input.password);
  const name = String(input.name || email.split('@')[0]).trim().slice(0, 120);
  const { salt, hash } = await hashPassword(input.password);

  return mutateStore((store) => {
    const now = new Date().toISOString();
    store.users ||= [];
    if (store.users.some((user) => normalizeEmail(user.email) === email)) {
      throw badRequest('email is already registered.');
    }
    const firstUser = store.users.length === 0;
    const user = {
      id: randomUUID(),
      email,
      name,
      role: firstUser ? 'super_admin' : 'member',
      plan: firstUser ? 'business' : 'free',
      status: 'active',
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: now,
      updatedAt: now
    };
    store.users.push(user);
    return sanitizeUser(user);
  });
}

export async function loginUser(input = {}) {
  const email = validateEmailAddress(input.email);
  if (typeof input.password !== 'string') throw badRequest('password is required.');
  const store = await readStore();
  const user = (store.users || []).find((item) => normalizeEmail(item.email) === email);
  if (!user || !(await verifyPassword(input.password, user))) {
    throw authError('email or password is incorrect.');
  }
  if (user.status === 'disabled') throw authError('account is disabled.', 403);

  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  await mutateStore((nextStore) => {
    nextStore.sessions ||= [];
    nextStore.sessions.push({
      token,
      userId: user.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt
    });
    nextStore.sessions = nextStore.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now()).slice(-500);
  });

  return { token, user: sanitizeUser(user) };
}

export async function logoutSession(token) {
  if (!token) return;
  await mutateStore((store) => {
    store.sessions = (store.sessions || []).filter((session) => session.token !== token);
  });
}

export function getSessionTokenFromRequest(req) {
  const authorization = req.get?.('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  return req.get?.('x-leadgen-session-token') || req.get?.('x-membership-token') || bearerToken || '';
}

export async function findUserBySessionToken(token) {
  if (!token) return null;
  const store = await readStore();
  const session = (store.sessions || []).find((item) => item.token === token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = (store.users || []).find((item) => item.id === session.userId);
  if (!user || user.status === 'disabled') return null;
  await mutateStore((nextStore) => {
    const current = (nextStore.sessions || []).find((item) => item.token === token);
    if (current) current.lastSeenAt = new Date().toISOString();
  });
  return user;
}

export async function listUsers() {
  const store = await readStore();
  return (store.users || []).map(sanitizeUser);
}

export async function updateUserAdmin(userId, input = {}) {
  return mutateStore((store) => {
    const user = (store.users || []).find((item) => item.id === userId);
    if (!user) throw Object.assign(new Error('User not found.'), { status: 404 });
    if ('name' in input) user.name = String(input.name || user.name || '').trim().slice(0, 120);
    if ('role' in input) user.role = normalizeRole(input.role, user.role);
    if ('plan' in input) user.plan = normalizePlan(input.plan, user.plan);
    if ('status' in input) user.status = input.status === 'disabled' ? 'disabled' : 'active';
    user.updatedAt = new Date().toISOString();
    return sanitizeUser(user);
  });
}

export function requireRole(user, minimumRole = 'member') {
  if (!user) throw authError('login is required.');
  if ((roleRank[user.role] || 0) < (roleRank[minimumRole] || 0)) {
    throw authError('permission denied.', 403);
  }
}

export function getPlan(user) {
  return plans[normalizePlan(user?.plan, 'free')];
}

export function getAllowedEmailDiscoveryDepth(user, requestedDepth) {
  const requested = Math.max(0, Math.min(3, Math.floor(Number(requestedDepth) || 0)));
  if (!user) return requested;
  return Math.min(requested, getPlan(user).maxEmailDiscoveryDepth);
}

export function getUsageSummaryForUser(store, user, date = todayKey()) {
  const plan = getPlan(user);
  const records = (store.usageRecords || []).filter((record) => record.userId === user.id && record.date === date);
  return Object.entries(plan.limits).map(([feature, limit]) => {
    const used = records
      .filter((record) => record.feature === feature)
      .reduce((sum, record) => sum + Number(record.amount || 0), 0);
    return {
      feature,
      used,
      limit,
      remaining: limit == null ? null : Math.max(0, limit - used)
    };
  });
}

export async function consumeUsage(user, feature, amount = 1, meta = {}) {
  const numericAmount = Math.max(0, Math.ceil(Number(amount) || 0));
  if (!user || numericAmount === 0) return null;
  return mutateStore((store) => {
    const currentUser = (store.users || []).find((item) => item.id === user.id);
    if (!currentUser || currentUser.status === 'disabled') throw authError('login is required.');
    const plan = getPlan(currentUser);
    const limit = plan.limits[feature];
    if (limit === undefined) return null;
    const date = todayKey();
    const used = (store.usageRecords || [])
      .filter((record) => record.userId === currentUser.id && record.date === date && record.feature === feature)
      .reduce((sum, record) => sum + Number(record.amount || 0), 0);
    if (limit !== null && used + numericAmount > limit) {
      throw Object.assign(new Error(`Usage limit exceeded for ${feature}.`), {
        status: 429,
        limit: { feature, used, requested: numericAmount, limit, remaining: Math.max(0, limit - used) }
      });
    }
    store.usageRecords ||= [];
    store.usageRecords.push({
      id: randomUUID(),
      userId: currentUser.id,
      feature,
      amount: numericAmount,
      date,
      meta,
      createdAt: new Date().toISOString()
    });
    store.usageRecords = store.usageRecords.slice(-10000);
    return { feature, used: used + numericAmount, limit, remaining: limit == null ? null : Math.max(0, limit - used - numericAmount) };
  });
}
