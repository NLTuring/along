// One localization call on a saved local image, recording the raw model answer for diagnosis.
// Usage: server\node_modules\.bin\tsx tools/probe-detect-file.mjs <png>
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const { loadConfig } = await import(new URL('../server/src/config.ts', import.meta.url).href);
const { OpenAIPersonProvider } = await import(new URL('../server/src/openai-person-provider.ts', import.meta.url).href);
const { safeHttps } = await import(new URL('../server/src/providers.ts', import.meta.url).href);
const file = process.argv[2];
const vision = Object.fromEntries((await readFile(join(root, '.android-local/hualong.env'), 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const config = loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'p'.repeat(40), DATABASE_URL: 'postgresql://unused', REDIS_URL: 'redis://unused',
  STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://unused.example', S3_BUCKET: 'x', S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'x',
  AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: vision.OPENAI_BASE_URL, OPENAI_ALLOWED_HOSTS: vision.OPENAI_ALLOWED_HOSTS, OPENAI_MODEL: process.argv[3] || 'claude-sonnet-4-6', OPENAI_API_KEY: vision.OPENAI_API_KEY });
let raw;
const provider = new OpenAIPersonProvider(config, async (...args) => (raw = await safeHttps(...args)));
const summary = { file, model: config.ai.openaiModel };
try { const r = await provider.detect(await readFile(file)); summary.ok = true; summary.bbox = r.detection.bbox.map(Math.round); summary.vertices = r.detection.polygon.length; summary.confidence = r.detection.confidence; await writeFile(join(dirname(file), 'anime-mask.png'), r.mask); }
catch (e) { summary.ok = false; summary.error = e.code || e.message; }
if (raw) { try { summary.answer = JSON.parse(raw.bytes.toString('utf8')).choices?.[0]?.message?.content; } catch { summary.body = raw.bytes.toString('utf8').slice(0, 400); } }
await writeFile(join(dirname(file), 'detect-raw.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2).split(vision.OPENAI_API_KEY).join('[redacted]'));
