import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, getMailerMode } from './config.mjs';
import { getEmailReadiness } from './emailReadiness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultSettingsPath = join(__dirname, 'data', 'settings.json');
let settingsMutationQueue = Promise.resolve();

function getSettingsPath() {
  return process.env.LEADGEN_SETTINGS_PATH || defaultSettingsPath;
}

function emptySavedSettings() {
  return {
    googleMapsApiKey: '',
    googleTranslateApiKey: '',
    openAiApiKey: '',
    openAiBaseUrl: '',
    openAiModel: '',
    enrichmentEmailApiEndpoint: '',
    enrichmentEmailApiKey: '',
    yelpApiKey: '',
    foursquareApiKey: '',
    hunterApiKey: '',
    placesLanguageCode: '',
    placesRegionCode: '',
    smtp: {
      host: '',
      port: '',
      secure: false,
      user: '',
      pass: '',
      from: ''
    },
    jarvisEmailEndpoint: '',
    jarvisEmailToken: '',
    unsubscribeUrl: '',
    emailDailyLimit: ''
  };
}

async function ensureSettingsFile() {
  const settingsPath = getSettingsPath();
  await mkdir(dirname(settingsPath), { recursive: true });
  try {
    await readFile(settingsPath, 'utf8');
  } catch {
    await writeFile(settingsPath, JSON.stringify(emptySavedSettings(), null, 2));
  }
}

async function writeSettingsAtomic(settings) {
  const settingsPath = getSettingsPath();
  const temporaryPath = `${settingsPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await mkdir(dirname(settingsPath), { recursive: true });
  try {
    await writeFile(temporaryPath, JSON.stringify(settings, null, 2));
    await rename(temporaryPath, settingsPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function acquireSettingsLock() {
  const settingsPath = getSettingsPath();
  const lockPath = `${settingsPath}.lock`;
  const startedAt = Date.now();
  await mkdir(dirname(settingsPath), { recursive: true });
  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      return async () => {
        await handle.close().catch(() => {});
        await rm(lockPath, { force: true }).catch(() => {});
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const details = await stat(lockPath).catch(() => null);
      if (details && Date.now() - details.mtimeMs > 30_000) {
        await rm(lockPath, { force: true }).catch(() => {});
        continue;
      }
      if (Date.now() - startedAt >= 5000) {
        throw Object.assign(new Error('Settings are busy, please retry.'), { status: 503 });
      }
      await wait(15 + Math.floor(Math.random() * 20));
    }
  }
}

function enqueueSettingsMutation(task) {
  const result = settingsMutationQueue.then(task, task);
  settingsMutationQueue = result.catch(() => {});
  return result;
}

function numberOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function mergeSettings(saved) {
  return {
    ...config,
    googleMapsApiKey: saved.googleMapsApiKey || config.googleMapsApiKey,
    googleTranslateApiKey: saved.googleTranslateApiKey || config.googleTranslateApiKey,
    openAiApiKey: saved.openAiApiKey || config.openAiApiKey,
    openAiBaseUrl: saved.openAiBaseUrl || config.openAiBaseUrl,
    openAiModel: saved.openAiModel || config.openAiModel,
    enrichmentEmailApiEndpoint: saved.enrichmentEmailApiEndpoint || '',
    enrichmentEmailApiKey: saved.enrichmentEmailApiKey || '',
    yelpApiKey: saved.yelpApiKey || '',
    foursquareApiKey: saved.foursquareApiKey || '',
    hunterApiKey: saved.hunterApiKey || '',
    placesLanguageCode: saved.placesLanguageCode || config.placesLanguageCode,
    placesRegionCode: saved.placesRegionCode || config.placesRegionCode,
    smtp: {
      host: saved.smtp?.host || config.smtp.host,
      port: numberOrFallback(saved.smtp?.port, config.smtp.port),
      secure: Boolean(saved.smtp?.secure ?? config.smtp.secure),
      user: saved.smtp?.user || config.smtp.user,
      pass: saved.smtp?.pass || config.smtp.pass,
      from: saved.smtp?.from || config.smtp.from
    },
    jarvisEmailEndpoint: saved.jarvisEmailEndpoint || config.jarvisEmailEndpoint,
    jarvisEmailToken: saved.jarvisEmailToken || config.jarvisEmailToken,
    unsubscribeUrl: saved.unsubscribeUrl || config.unsubscribeUrl,
    emailDailyLimit: numberOrFallback(saved.emailDailyLimit, config.emailDailyLimit)
  };
}

function sanitizeForClient(saved, runtime) {
  const emailReadiness = getEmailReadiness(runtime);
  return {
    googleMapsApiKey: runtime.googleMapsApiKey,
    googleTranslateApiKey: runtime.googleTranslateApiKey,
    openAiBaseUrl: runtime.openAiBaseUrl,
    openAiModel: runtime.openAiModel,
    enrichmentEmailApiEndpoint: runtime.enrichmentEmailApiEndpoint,
    yelpApiKey: '',
    foursquareApiKey: '',
    hunterApiKey: '',
    placesLanguageCode: runtime.placesLanguageCode,
    placesRegionCode: runtime.placesRegionCode,
    smtp: {
      host: runtime.smtp.host,
      port: runtime.smtp.port,
      secure: runtime.smtp.secure,
      user: runtime.smtp.user,
      pass: '',
      from: runtime.smtp.from
    },
    jarvisEmailEndpoint: runtime.jarvisEmailEndpoint,
    jarvisEmailToken: '',
    unsubscribeUrl: runtime.unsubscribeUrl,
    emailDailyLimit: runtime.emailDailyLimit,
    hasSmtpPass: Boolean(saved.smtp?.pass || config.smtp.pass),
    hasJarvisEmailToken: Boolean(saved.jarvisEmailToken || config.jarvisEmailToken),
    hasOpenAiApiKey: Boolean(saved.openAiApiKey || config.openAiApiKey),
    hasEnrichmentEmailApiKey: Boolean(saved.enrichmentEmailApiKey),
    hasYelpApiKey: Boolean(saved.yelpApiKey),
    hasFoursquareApiKey: Boolean(saved.foursquareApiKey),
    hasHunterApiKey: Boolean(saved.hunterApiKey),
    mailerMode: getMailerMode(runtime),
    emailReady: emailReadiness.readyForRealSend,
    emailIssues: emailReadiness.issues
  };
}

export async function readSavedSettings() {
  await ensureSettingsFile();
  const settingsPath = getSettingsPath();
  const raw = await readFile(settingsPath, 'utf8');
  return { ...emptySavedSettings(), ...JSON.parse(raw) };
}

export async function getRuntimeSettings() {
  return mergeSettings(await readSavedSettings());
}

export async function getClientSettings() {
  const saved = await readSavedSettings();
  return sanitizeForClient(saved, mergeSettings(saved));
}

export async function saveClientSettings(input = {}) {
  return enqueueSettingsMutation(async () => {
    const release = await acquireSettingsLock();
    try {
      const current = await readSavedSettings();
      const next = {
        ...current,
        googleMapsApiKey: String(input.googleMapsApiKey ?? current.googleMapsApiKey ?? '').trim(),
        googleTranslateApiKey: String(input.googleTranslateApiKey ?? current.googleTranslateApiKey ?? '').trim(),
        openAiApiKey: input.openAiApiKey ? String(input.openAiApiKey).trim() : current.openAiApiKey || '',
        openAiBaseUrl: String(input.openAiBaseUrl ?? current.openAiBaseUrl ?? '').trim(),
        openAiModel: String(input.openAiModel ?? current.openAiModel ?? '').trim(),
        enrichmentEmailApiEndpoint: String(input.enrichmentEmailApiEndpoint ?? current.enrichmentEmailApiEndpoint ?? '').trim(),
        enrichmentEmailApiKey: input.enrichmentEmailApiKey ? String(input.enrichmentEmailApiKey).trim() : current.enrichmentEmailApiKey || '',
        yelpApiKey: input.yelpApiKey ? String(input.yelpApiKey).trim() : current.yelpApiKey || '',
        foursquareApiKey: input.foursquareApiKey ? String(input.foursquareApiKey).trim() : current.foursquareApiKey || '',
        hunterApiKey: input.hunterApiKey ? String(input.hunterApiKey).trim() : current.hunterApiKey || '',
        placesLanguageCode: String(input.placesLanguageCode ?? current.placesLanguageCode ?? '').trim(),
        placesRegionCode: String(input.placesRegionCode ?? current.placesRegionCode ?? '').trim(),
        smtp: {
          host: String(input.smtp?.host ?? current.smtp?.host ?? '').trim(),
          port: String(input.smtp?.port ?? current.smtp?.port ?? '').trim(),
          secure: Boolean(input.smtp?.secure),
          user: String(input.smtp?.user ?? current.smtp?.user ?? '').trim(),
          pass: input.smtp?.pass ? String(input.smtp.pass) : current.smtp?.pass || '',
          from: String(input.smtp?.from ?? current.smtp?.from ?? '').trim()
        },
        jarvisEmailEndpoint: String(input.jarvisEmailEndpoint ?? current.jarvisEmailEndpoint ?? '').trim(),
        jarvisEmailToken: input.jarvisEmailToken ? String(input.jarvisEmailToken) : current.jarvisEmailToken || '',
        unsubscribeUrl: String(input.unsubscribeUrl ?? current.unsubscribeUrl ?? '').trim(),
        emailDailyLimit: String(input.emailDailyLimit ?? current.emailDailyLimit ?? '').trim()
      };

      await writeSettingsAtomic(next);
      return sanitizeForClient(next, mergeSettings(next));
    } finally {
      await release();
    }
  });
}
