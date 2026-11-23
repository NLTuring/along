// Prepare deployment secrets locally; never print credentials or stage an incomplete mail configuration.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const local = new URL('../.android-local/', import.meta.url);
function parse(text) {
  return Object.fromEntries(text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => { const at = line.indexOf('='); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]; }));
}
const smtp = parse(await readFile(new URL('smtp-deployment.env', local), 'utf8'));
const provider = parse(await readFile(new URL('hualong.env', local), 'utf8'));
const images = parse(await readFile(new URL('goldgom-image.env', local), 'utf8'));
if (images.OPENAI_IMAGE_BASE_URL !== 'https://openai.goldgom.top/v1' || images.OPENAI_IMAGE_ALLOWED_HOSTS !== 'openai.goldgom.top' || !images.OPENAI_IMAGE_API_KEY) throw Error('Unexpected image gateway configuration');
const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
const missing = required.filter(key => !smtp[key]);
if (missing.length) {
  console.log(JSON.stringify({ ready: false, missing, message: 'No production environment file written; fill SMTP fields locally first.' }));
  process.exitCode = 2;
} else {
  if (!/^\d{2,5}$/.test(smtp.SMTP_PORT) || /[\r\n]/.test(Object.values(smtp).join(''))) throw Error('Invalid SMTP settings');
  // Vision-only proxy: claude-sonnet-4-6 passed one synthetic detection probe; it has no image-edit model.
  if (provider.OPENAI_BASE_URL !== 'https://api.hualong-ai.com/v1' || provider.OPENAI_ALLOWED_HOSTS !== 'api.hualong-ai.com' || !provider.OPENAI_API_KEY) throw Error('Unexpected provider configuration');
  provider.OPENAI_MODEL = 'claude-sonnet-4-6';
  const env = {
    NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '3001',
    APP_ORIGINS: 'https://tokennext.top,https://appassets.androidplatform.net',
    PUBLIC_BASE_PATH: '/along',
    SESSION_SECRET: randomBytes(48).toString('base64url'),
    POSTGRES_PASSWORD: randomBytes(32).toString('hex'), REDIS_PASSWORD: randomBytes(32).toString('hex'),
    STORAGE_DRIVER: 'filesystem', PRIVATE_STORAGE_DIR: '/var/lib/along/private',
    SMTP_HOST: smtp.SMTP_HOST, SMTP_PORT: smtp.SMTP_PORT, SMTP_SECURE: smtp.SMTP_SECURE || 'true',
    SMTP_USER: smtp.SMTP_USER, SMTP_PASSWORD: smtp.SMTP_PASSWORD, SMTP_FROM: smtp.SMTP_FROM,
    ADMIN_EMAILS: smtp.ADMIN_EMAILS || '',
    AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: provider.OPENAI_BASE_URL,
    OPENAI_ALLOWED_HOSTS: provider.OPENAI_ALLOWED_HOSTS, OPENAI_MODEL: provider.OPENAI_MODEL,
    OPENAI_API_KEY: provider.OPENAI_API_KEY, AI_REQUEST_TIMEOUT_MS: '120000',
    // 小游 assistant: same gateway and key, a faster model, 45 s per answer.
    OPENAI_ASSISTANT_MODEL: 'claude-haiku-4-5-20251001', AI_ASSISTANT_TIMEOUT_MS: '45000',
    // Anime variant: separate /images/edits gateway (gpt-image-2.6-sunburst passed one synthetic probe).
    OPENAI_IMAGE_BASE_URL: images.OPENAI_IMAGE_BASE_URL, OPENAI_IMAGE_ALLOWED_HOSTS: images.OPENAI_IMAGE_ALLOWED_HOSTS,
    OPENAI_IMAGE_MODEL: images.OPENAI_IMAGE_MODEL, OPENAI_IMAGE_API_KEY: images.OPENAI_IMAGE_API_KEY, AI_IMAGE_TIMEOUT_MS: '180000',
    BAIDU_BROWSER_AK: '', BAIDU_SERVER_AK: '', FFMPEG_PATH: 'ffmpeg', FFPROBE_PATH: 'ffprobe', WORKER_CONCURRENCY: '1',
  };
  for (const value of Object.values(env)) if (/[\r\n]/.test(value)) throw Error('Multiline env values are forbidden');
  // Single-quoted dotenv values prevent Compose interpreting '$' in service passwords.
  const encode = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const path = new URL('along-production.env', local);
  await writeFile(path, Object.entries(env).map(([key, value]) => `${key}=${encode(value)}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ready: true, file: fileURLToPath(path), secretsPrinted: false, deployed: false }));
}
