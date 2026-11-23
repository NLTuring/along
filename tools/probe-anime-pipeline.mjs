// One end-to-end anime pipeline run through the production provider code: edit, then localize the
// person on the edited picture. Synthetic illustration only; keys read from .android-local and never printed.
// Usage: server\node_modules\.bin\tsx tools/probe-anime-pipeline.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const sharp = createRequire(join(root, 'server/package.json'))('sharp');
const { loadConfig } = await import(new URL('../server/src/config.ts', import.meta.url).href);
const { OpenAIPersonProvider } = await import(new URL('../server/src/openai-person-provider.ts', import.meta.url).href);
const { normalizeImage } = await import(new URL('../server/src/media.ts', import.meta.url).href);
const read = async (name) => Object.fromEntries((await readFile(join(root, '.android-local', name), 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const vision = await read('hualong.env'), images = await read('goldgom-image.env');
const config = loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'p'.repeat(40), DATABASE_URL: 'postgresql://unused', REDIS_URL: 'redis://unused',
  STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://unused.example', S3_BUCKET: 'x', S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'x',
  AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: vision.OPENAI_BASE_URL, OPENAI_ALLOWED_HOSTS: vision.OPENAI_ALLOWED_HOSTS, OPENAI_MODEL: 'claude-sonnet-4-6', OPENAI_API_KEY: vision.OPENAI_API_KEY,
  OPENAI_IMAGE_BASE_URL: images.OPENAI_IMAGE_BASE_URL, OPENAI_IMAGE_ALLOWED_HOSTS: images.OPENAI_IMAGE_ALLOWED_HOSTS, OPENAI_IMAGE_MODEL: images.OPENAI_IMAGE_MODEL, OPENAI_IMAGE_API_KEY: images.OPENAI_IMAGE_API_KEY });
if (!config.aiEditReady || !config.aiDetectReady) throw Error('Pipeline config incomplete');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="512"><rect width="768" height="512" fill="#d7e8ef"/><rect y="350" width="768" height="162" fill="#a7bc87"/><rect x="40" y="110" width="140" height="240" fill="#8b9caa"/><rect x="590" y="160" width="120" height="190" fill="#91a1ae"/><circle cx="384" cy="159" r="51" fill="#e6b185"/><path d="M336 218 Q384 190 432 218 L461 340 L414 354 L406 452 L366 452 L354 354 L307 340Z" fill="#cb534a"/></svg>`;
const source = await sharp(Buffer.from(svg)).png().toBuffer();
const out = join(root, '_downloads', 'anime-pipeline-probe'); await mkdir(out, { recursive: true });
const provider = new OpenAIPersonProvider(config), redact = (s) => [vision.OPENAI_API_KEY, images.OPENAI_IMAGE_API_KEY].reduce((t, k) => t.split(k).join('[redacted]'), String(s));
const summary = { at: new Date().toISOString(), source: '768x512 synthetic' };
let t = Date.now();
try {
  const edited = await normalizeImage(await provider.edit(source), config);
  summary.edit = { ms: Date.now() - t, width: edited.width, height: edited.height, bytes: edited.bytes.length };
  await writeFile(join(out, 'source.png'), source); await writeFile(join(out, 'anime.png'), edited.bytes);
  t = Date.now();
  const suggestion = await provider.detect(edited.bytes);
  const d = suggestion.detection;
  summary.detect = { ms: Date.now() - t, alignedToAnime: d.width === edited.width && d.height === edited.height, bbox: d.bbox.map(Math.round), vertices: d.polygon.length, confidence: d.confidence };
  await writeFile(join(out, 'anime-mask.png'), suggestion.mask);
  const overlay = await sharp(edited.bytes).composite([{ input: await sharp(suggestion.mask).resize(edited.width, edited.height).ensureAlpha().linear([1, 1, 1, 0.45], [0, 0, 0, 0]).tint('#00c853').png().toBuffer(), blend: 'over' }]).png().toBuffer();
  await writeFile(join(out, 'anime-overlay.png'), overlay);
  summary.ok = true;
} catch (e) { summary.ok = false; summary.error = redact(e.code || e.message); summary.ms = Date.now() - t; }
await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
