// One authorized detection call through the production OpenAIPersonProvider code path.
// Synthetic illustration only; the key is read from .android-local/hualong.env and never printed.
// Usage: npx --prefix server tsx tools/probe-hualong-detect.mjs <model>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(root, 'server/package.json'));
const sharp = require('sharp');
const { loadConfig } = await import(new URL('../server/src/config.ts', import.meta.url).href);
const { OpenAIPersonProvider } = await import(new URL('../server/src/openai-person-provider.ts', import.meta.url).href);
const { safeHttps } = await import(new URL('../server/src/providers.ts', import.meta.url).href);
const model = process.argv[2];
if (!/^claude-[a-z0-9.-]+$/.test(model || '')) throw Error('Pass one listed model id');
const env = Object.fromEntries((await readFile(join(root, '.android-local/hualong.env'), 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const config = loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'p'.repeat(40), DATABASE_URL: 'postgresql://unused', REDIS_URL: 'redis://unused',
  STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://unused.example', S3_BUCKET: 'x', S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'x',
  AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: env.OPENAI_BASE_URL, OPENAI_ALLOWED_HOSTS: env.OPENAI_ALLOWED_HOSTS, OPENAI_MODEL: model, OPENAI_API_KEY: env.OPENAI_API_KEY, AI_REQUEST_TIMEOUT_MS: '120000' });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#d7e8ef"/><rect y="350" width="512" height="162" fill="#a7bc87"/><rect x="20" y="110" width="110" height="240" fill="#8b9caa"/><circle cx="258" cy="159" r="51" fill="#e6b185"/><path d="M210 218 Q258 190 306 218 L335 340 L288 354 L280 452 L240 452 L228 354 L181 340Z" fill="#cb534a"/><text x="12" y="496" font-size="14" fill="#253328">SYNTHETIC TEST - NO REAL PERSON</text></svg>`;
const image = await sharp(Buffer.from(svg)).png().toBuffer();
let raw = null;
const recording = async (...args) => { const r = await safeHttps(...args); raw = r; return r; };
const out = join(root, '_downloads', 'hualong-probe'); await mkdir(out, { recursive: true });
const summary = { model, at: new Date().toISOString() };
try {
  const result = await new OpenAIPersonProvider(config, recording).detect(image);
  summary.ok = true; summary.bbox = result.detection.bbox.map(Math.round); summary.vertices = result.detection.polygon.length; summary.confidence = result.detection.confidence;
  await writeFile(join(out, 'mask.png'), result.mask);
} catch (error) { summary.ok = false; summary.error = String(error.message).split(env.OPENAI_API_KEY).join('[redacted]'); }
if (raw) {
  summary.status = raw.status; summary.contentType = raw.type;
  try { const j = JSON.parse(raw.bytes.toString('utf8')); summary.finishReason = j.choices?.[0]?.finish_reason; summary.role = j.choices?.[0]?.message?.role; summary.contentStart = String(j.choices?.[0]?.message?.content ?? '').slice(0, 300); summary.envelopeKeys = Object.keys(j); summary.error ??= j.error?.message; } catch { summary.body = raw.bytes.toString('utf8').slice(0, 300); }
}
await writeFile(join(out, `summary-${model}.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
