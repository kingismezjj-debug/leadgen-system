import 'dotenv/config';

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

export const config = {
  host: process.env.LEADGEN_API_HOST || '127.0.0.1',
  port: numberFromEnv('LEADGEN_API_PORT', 8790),
  webOrigin: process.env.LEADGEN_WEB_ORIGIN || 'http://127.0.0.1:5190',
  adminToken: process.env.LEADGEN_ADMIN_TOKEN || '',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  googleTranslateApiKey: process.env.GOOGLE_TRANSLATE_API_KEY || '',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  placesLanguageCode: process.env.PLACES_LANGUAGE_CODE || 'zh-CN',
  placesRegionCode: process.env.PLACES_REGION_CODE || 'US',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: numberFromEnv('SMTP_PORT', 587),
    secure: process.env.SMTP_SECURE === '1',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || ''
  },
  jarvisEmailEndpoint: process.env.JARVIS_EMAIL_ENDPOINT || '',
  jarvisEmailToken: process.env.JARVIS_EMAIL_TOKEN || '',
  unsubscribeUrl: process.env.UNSUBSCRIBE_URL || 'https://example.com/unsubscribe',
  emailDailyLimit: numberFromEnv('EMAIL_DAILY_LIMIT', 25)
};

export function getMailerMode(settings = config) {
  if (settings.jarvisEmailEndpoint) return 'jarvis';
  if (settings.smtp?.host && settings.smtp?.from) return 'smtp';
  return 'dry-run';
}
