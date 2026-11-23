// One bounded image-edit probe with a synthetic drawing. Key read from .android-local/goldgom-image.env.
// Usage: node tools/probe-image-edit.mjs <images-edits|responses-tool>
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const sharp = createRequire(join(root, 'server/package.json'))('sharp');
const env = Object.fromEntries((await readFile(join(root, '.android-local/goldgom-image.env'), 'utf8')).split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const mode = process.argv[2];
if (!['images-edits', 'responses-tool'].includes(mode)) throw Error('mode: images-edits | responses-tool');
if (env.OPENAI_IMAGE_BASE_URL !== 'https://openai.goldgom.top/v1') throw Error('Unexpected base');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#d7e8ef"/><rect y="350" width="512" height="162" fill="#a7bc87"/><rect x="20" y="110" width="110" height="240" fill="#8b9caa"/><circle cx="258" cy="159" r="51" fill="#e6b185"/><path d="M210 218 Q258 190 306 218 L335 340 L288 354 L280 452 L240 452 L228 354 L181 340Z" fill="#cb534a"/></svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const prompt = 'Convert this picture into a clean 2D anime illustration. Keep the single person, pose, full silhouette, composition and square aspect ratio. No text, borders or watermarks.';
const dir = await mkdtemp(join(await mkdir(join(root, '_downloads', 'image-edit-probe'), { recursive: true }) || join(root, '_downloads', 'image-edit-probe'), `${mode}-`));
const redact = (s) => String(s).split(env.OPENAI_IMAGE_API_KEY).join('[redacted]');
let url, init = { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_IMAGE_API_KEY}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(240000) };
if (mode === 'images-edits') {
  url = `${env.OPENAI_IMAGE_BASE_URL}/images/edits`;
  const form = new FormData();
  form.append('model', env.OPENAI_IMAGE_MODEL); form.append('image', new Blob([png], { type: 'image/png' }), 'source.png');
  form.append('prompt', prompt); form.append('n', '1'); form.append('size', '1024x1024');
  init.body = form;
} else {
  url = `${env.OPENAI_IMAGE_BASE_URL}/responses`;
  init.headers['Content-Type'] = 'application/json';
  init.body = JSON.stringify({ model: 'gpt-6.1-sol', stream: false, tools: [{ type: 'image_generation', model: env.OPENAI_IMAGE_MODEL, size: '1024x1024' }], tool_choice: { type: 'image_generation' },
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: `data:image/png;base64,${png.toString('base64')}` }] }] });
}
const summary = { mode, model: env.OPENAI_IMAGE_MODEL, at: new Date().toISOString(), dir };
const started = Date.now();
try {
  const r = await fetch(url, init);
  summary.status = r.status; summary.contentType = r.headers.get('content-type');
  const reader = r.body.getReader(); const chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 40 * 1024 * 1024) { await reader.cancel(); throw Error('response too large'); } chunks.push(Buffer.from(value)); }
  const bytes = Buffer.concat(chunks); summary.bytes = bytes.length; summary.ms = Date.now() - started;
  let j; try { j = JSON.parse(bytes.toString('utf8')); } catch { summary.body = redact(bytes.toString('utf8').slice(0, 500)); }
  if (j) {
    summary.keys = Object.keys(j); if (j.error) summary.error = redact(JSON.stringify(j.error)).slice(0, 800);
    const images = [];
    for (const item of j.data || []) images.push(item.b64_json ? { b64: item.b64_json } : { url: item.url });
    for (const item of j.output || []) { summary.outputTypes = [...(summary.outputTypes || []), item.type]; if (item.type === 'image_generation_call' && item.result) images.push({ b64: item.result }); }
    summary.images = [];
    for (const [i, im] of images.slice(0, 1).entries()) {
      if (im.b64) { const buf = Buffer.from(im.b64, 'base64'); const meta = await sharp(buf, { limitInputPixels: 25e6 }).metadata(); await writeFile(join(dir, `anime-${i}.png`), await sharp(buf).png().toBuffer()); summary.images.push({ format: meta.format, width: meta.width, height: meta.height, bytes: buf.length, file: join(dir, `anime-${i}.png`) }); }
      else summary.images.push({ returnedUrlHost: im.url ? new URL(im.url).hostname : null });
    }
    if (j.usage) summary.usage = j.usage;
  }
} catch (e) { summary.failure = redact(e.message); summary.ms = Date.now() - started; }
await writeFile(join(dir, 'source.png'), png);
await writeFile(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
