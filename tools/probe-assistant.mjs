// One real assistant call through the production code path (askAssistant + safeHttps).
// Synthetic question only; the key is read from .android-local/hualong.env and never printed.
// Usage: server\node_modules\.bin\tsx tools/probe-assistant.mjs "<question>" [zh|en] [model]
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const { loadConfig } = await import(new URL('../server/src/config.ts', import.meta.url).href);
const { askAssistant } = await import(new URL('../server/src/assistant.ts', import.meta.url).href);
const env = Object.fromEntries((await readFile(join(root, '.android-local/hualong.env'), 'utf8')).split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const [question = '南京有什么推荐的博物馆', locale = 'zh', model] = process.argv.slice(2);
const config = loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'p'.repeat(40), DATABASE_URL: 'postgresql://unused', REDIS_URL: 'redis://unused', STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://unused.example', S3_BUCKET: 'x', S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'x',
  AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: env.OPENAI_BASE_URL, OPENAI_ALLOWED_HOSTS: env.OPENAI_ALLOWED_HOSTS, OPENAI_MODEL: 'claude-sonnet-4-6', OPENAI_API_KEY: env.OPENAI_API_KEY, ...(model ? { OPENAI_ASSISTANT_MODEL: model } : {}) });
const started = Date.now();
try {
  const answer = await askAssistant(config, { messages: [{ role: 'user', text: question }], locale, route: 'trip', city: 'nanjing' });
  console.log(JSON.stringify({ model: config.ai.assistantModel, ms: Date.now() - started, ...answer }, null, 2));
} catch (error) { console.log(JSON.stringify({ model: config.ai.assistantModel, ms: Date.now() - started, error: error.code || error.message })); }
