// Offline: replay the recorded model answer through the current validator. No network.
// Usage: server\node_modules\.bin\tsx tools/replay-detect.mjs <dir with anime.png and detect-raw.json>
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const { loadConfig } = await import(new URL('../server/src/config.ts', import.meta.url).href);
const { OpenAIPersonProvider } = await import(new URL('../server/src/openai-person-provider.ts', import.meta.url).href);
const dir = process.argv[2];
const saved = JSON.parse(await readFile(join(dir, 'detect-raw.json'), 'utf8'));
const config = loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'p'.repeat(40), DATABASE_URL: 'postgresql://u', REDIS_URL: 'redis://u', STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://u.example', S3_BUCKET: 'x', S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'x',
  AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: 'https://api.hualong-ai.com/v1', OPENAI_ALLOWED_HOSTS: 'api.hualong-ai.com', OPENAI_MODEL: 'claude-sonnet-4-6', OPENAI_API_KEY: 'offline' });
const provider = new OpenAIPersonProvider(config, async () => ({ type: 'application/json', bytes: Buffer.from(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: saved.answer } }] })) }));
const r = await provider.detect(await readFile(join(dir, 'anime.png')));
await writeFile(join(dir, 'anime-mask.png'), r.mask);
console.log(JSON.stringify({ size: [r.detection.width, r.detection.height], bbox: r.detection.bbox.map(Math.round), vertices: r.detection.polygon.length, confidence: r.detection.confidence }));
