// Explicitly authorized probe: at most three HTTP requests in total, synthetic input only.
// Secrets are read from a git/docker-ignored file, never command-line arguments or output.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../server/package.json', import.meta.url));
const sharp = require('sharp');
const local = join(root, '.android-local');
const env = Object.fromEntries((await readFile(join(local, 'goldgom.env'), 'utf8')).split(/\r?\n/).filter(line => line.includes('=')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const base = new URL(env.OPENAI_BASE_URL);
if (base.href !== 'https://openai.goldgom.top/v1' || env.OPENAI_MODEL !== 'gpt-6.1-sol') throw Error('Unexpected configured probe target');
const mode = process.argv[2];
if (!['models', 'vision', 'edit'].includes(mode)) throw Error('Choose models, vision or edit');
const ledgerPath = join(local, 'ai-probe-ledger.json');
let ledger;
try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; ledger = { limit: 3, attempts: [] }; }
if (ledger.limit !== 3 || ledger.attempts.length >= 3 || ledger.attempts.some(attempt => attempt.mode === mode)) throw Error('Authorized call limit or duplicate mode reached');
const downloads = join(root, '_downloads', 'ai-capability-probes');
await mkdir(downloads, { recursive: true });
const output = await mkdtemp(join(downloads, `${mode}-`));
const summary = { mode, attempt: ledger.attempts.length + 1, at: new Date().toISOString(), outputDirectory: output, model: env.OPENAI_MODEL };
ledger.attempts.push(summary);
await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#d7e8ef"/><rect y="350" width="512" height="162" fill="#a7bc87"/><rect x="20" y="110" width="110" height="240" fill="#8b9caa"/><rect x="380" y="180" width="90" height="170" fill="#91a1ae"/><circle cx="258" cy="159" r="51" fill="#e6b185"/><path d="M210 218 Q258 190 306 218 L335 340 L288 354 L280 452 L240 452 L228 354 L181 340Z" fill="#cb534a"/><path d="M227 351 L246 452 L218 452 L199 354 M283 351 L306 452 L278 452 L262 354" fill="#3d516d"/><circle cx="242" cy="155" r="5" fill="#302a27"/><circle cx="274" cy="155" r="5" fill="#302a27"/><path d="M243 178 Q258 191 274 178" fill="none" stroke="#754431" stroke-width="4"/><text x="12" y="496" font-size="14" fill="#253328">SYNTHETIC LOCAL TEST - NO REAL PERSON</text></svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();
await writeFile(join(output, 'synthetic-source.png'), png);
let path, options = { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(mode === 'models' ? 30000 : 150000) };
if (mode === 'models') path = '/models';
else if (mode === 'vision') {
  path = '/chat/completions'; options.method = 'POST'; options.headers['Content-Type'] = 'application/json';
  options.body = JSON.stringify({ model: env.OPENAI_MODEL, messages: [{ role: 'user', content: [
    { type: 'text', text: 'This is a synthetic test illustration. Identify the primary human figure, not the background. Return only JSON: {"image_width":512,"image_height":512,"main_person_bbox":[x_min,y_min,x_max,y_max],"main_person_polygon":[[x,y],...],"confidence":0.0,"can_return_edited_image":false}. Use pixel coordinates. Polygon should follow the visible person silhouette, not merely the rectangular box; if uncertain return an empty polygon and low confidence. State actual capabilities; do not pretend to edit an image. Keep under 100 polygon vertices.' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
  ] }], max_tokens: 1600, stream: false });
} else {
  path = '/images/edits'; options.method = 'POST'; const form = new FormData();
  form.append('model', env.OPENAI_MODEL);
  form.append('image', new Blob([png], { type: 'image/png' }), 'synthetic-source.png');
  form.append('prompt', 'Convert this synthetic drawing into a polished anime illustration. Keep the one central person, pose, complete silhouette, composition, square aspect ratio and city background. Return an actual edited image, not an explanation. This test contains no real people.');
  form.append('n', '1'); form.append('size', '1024x1024'); form.append('response_format', 'b64_json'); options.body = form;
}
try {
  const response = await fetch(base.href + path, options);
  summary.status = response.status; summary.contentType = response.headers.get('content-type');
  const maxBytes = mode === 'edit' ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw Error('Response exceeded probe bound'); } chunks.push(Buffer.from(value)); }
  const bytes = Buffer.concat(chunks); summary.bytes = bytes.length;
  await writeFile(join(output, 'response.bin'), bytes);
  let payload; try { payload = JSON.parse(bytes.toString('utf8')); } catch { payload = null; }
  if (mode === 'models' && payload?.data) {
    const ids = payload.data.map(item => item.id).filter(value => typeof value === 'string');
    summary.listedModel = ids.includes(env.OPENAI_MODEL); summary.modelCount = ids.length;
    summary.relatedModelIds = ids.filter(id => /gpt-6\.1-sol|image|dall|flux|imagen/i.test(id)).slice(0, 40);
  }
  if (payload?.error) summary.error = String(payload.error.message || payload.error.code || payload.error).replaceAll(env.OPENAI_API_KEY, '[REDACTED]').slice(0, 1200);
  if (payload?.choices) summary.choices = payload.choices.map(choice => ({ finishReason: choice.finish_reason, content: typeof choice.message?.content === 'string' ? choice.message.content.slice(0, 10000).replaceAll(env.OPENAI_API_KEY, '[REDACTED]') : choice.message?.content, imageFields: Object.keys(choice.message || {}).filter(key => /image/i.test(key)) }));
  if (payload?.usage) summary.usage = payload.usage;
  if (mode === 'edit' && Array.isArray(payload?.data)) {
    summary.images = [];
    for (const [index, item] of payload.data.slice(0, 1).entries()) {
      if (typeof item.b64_json === 'string') {
        const image = Buffer.from(item.b64_json, 'base64');
        const metadata = await sharp(image, { limitInputPixels: 25000000 }).metadata();
        await writeFile(join(output, `edited-${index}.png`), await sharp(image).png().toBuffer());
        summary.images.push({ decoded: true, width: metadata.width, height: metadata.height, bytes: image.length });
      } else if (typeof item.url === 'string') {
        summary.images.push({ returnedUrl: true, host: new URL(item.url).hostname, downloaded: false });
      }
    }
  }
} catch (error) { summary.failure = String(error.message).replaceAll(env.OPENAI_API_KEY, '[REDACTED]'); }
await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2));
await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
console.log(JSON.stringify(summary, null, 2));
