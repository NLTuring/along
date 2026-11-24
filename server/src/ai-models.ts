// Photo-to-3D for the clay workshop. Adapted from 捏个 PINCH (server/app/providers/mesh.py):
// the same Tripo / Meshy request shapes, ported to the Along provider transport with pinned
// public addresses, no redirects, bounded responses and an exact result-host allowlist.
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { audit } from './db.js';
import type { Row } from './db.js';
import { fail, id, iso, rateLimit, requireUser, sendFile, type App, type Services } from './core.js';
import type { Config } from './config.js';
import { readMultipart, normalizeImage } from './media.js';
import { allowedProviderUrl, safeHttps, type ProviderTransport } from './providers.js';
import { objectKey } from './storage.js';
import { changePoints, PRICES } from './points.js';
import { workshopFile } from './workshop-files.js';

export type MeshState = { state: 'queued' | 'running' | 'success' | 'failed'; progress: number; url?: string; error?: string };
export interface MeshProvider {
  readonly name: string;
  submit(image: Buffer): Promise<string>;
  poll(remoteId: string): Promise<MeshState>;
  download(url: string): Promise<Buffer>;
}
const JSON_BYTES = 1024 * 1024;
const POLL_EVERY_MS = 3000;

function parseJson(bytes: Buffer) { try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error('PROVIDER_FORMAT_INVALID'); } }
/** Signed result URLs must be HTTPS on an exact allowlisted host; the body must be a binary glTF 2.0 file. */
export async function downloadGlb(config: Config, transport: ProviderTransport, value: string) {
  const url = allowedProviderUrl(value, config.mesh.resultHosts);
  const { bytes } = await transport(url, 'GET', undefined, { Accept: 'model/gltf-binary,application/octet-stream' }, config.limits.modelBytes, 120_000);
  checkGlb(bytes);
  return bytes;
}
export function checkGlb(bytes: Buffer) {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('MODEL_NOT_GLB');
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || jsonLength < 2 || 20 + jsonLength > bytes.length) throw new Error('MODEL_NOT_GLB');
  const gltf = parseJson(bytes.subarray(20, 20 + jsonLength));
  // Self-contained only: the phone must never be pointed at a URL inside a model file.
  const external = JSON.stringify(gltf.buffers || []).includes('"uri"') || JSON.stringify(gltf.images || []).includes('"uri"');
  if (gltf.asset?.version !== '2.0' || external || !gltf.meshes?.length) throw new Error('MODEL_NOT_SELF_CONTAINED');
}
// Providers accept up to a few MB; a 1024 px JPEG keeps uploads small and strips metadata.
async function providerImage(bytes: Buffer) { return sharp(bytes).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer(); }

function multipartFile(field: string, filename: string, type: string, bytes: Buffer) {
  const boundary = `along-${randomUUID()}`;
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { body, type: `multipart/form-data; boundary=${boundary}` };
}
export class TripoProvider implements MeshProvider {
  readonly name = 'tripo';
  constructor(private config: Config, private transport: ProviderTransport = safeHttps) {}
  private auth() { return { Authorization: `Bearer ${this.config.mesh.apiKey}`, Accept: 'application/json' }; }
  private async call(path: string, method: 'GET' | 'POST', body?: Buffer, type?: string) {
    const url = new URL(`${this.config.mesh.baseUrl}${path}`);
    const { bytes } = await this.transport(url, method, body, { ...this.auth(), ...(type ? { 'Content-Type': type } : {}) }, JSON_BYTES, 60_000);
    const result = parseJson(bytes);
    if (result.code !== 0 || !result.data) throw new Error('PROVIDER_REJECTED');
    return result.data;
  }
  async submit(image: Buffer) {
    const file = multipartFile('file', 'seed.jpg', 'image/jpeg', await providerImage(image));
    const uploaded = await this.call('/upload', 'POST', file.body, file.type);
    const task = await this.call('/task', 'POST', Buffer.from(JSON.stringify({ type: 'image_to_model', file: { type: 'jpg', file_token: String(uploaded.image_token) } })), 'application/json');
    return z.string().min(1).max(128).parse(task.task_id);
  }
  async poll(remoteId: string): Promise<MeshState> {
    const d = await this.call(`/task/${encodeURIComponent(remoteId)}`, 'GET');
    const progress = Math.max(0, Math.min(100, Number(d.progress) || 0));
    if (d.status === 'success') {
      const out = d.output || {}, url = out.pbr_model || out.model || out.base_model;
      return url ? { state: 'success', progress: 100, url: String(url) } : { state: 'failed', progress, error: 'PROVIDER_NO_MODEL' };
    }
    if (['failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(d.status)) return { state: 'failed', progress, error: `PROVIDER_${String(d.status).toUpperCase()}` };
    return { state: d.status === 'queued' ? 'queued' : 'running', progress };
  }
  download(url: string) { return downloadGlb(this.config, this.transport, url); }
}
export class MeshyProvider implements MeshProvider {
  readonly name = 'meshy';
  constructor(private config: Config, private transport: ProviderTransport = safeHttps) {}
  private headers() { return { Authorization: `Bearer ${this.config.mesh.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' }; }
  async submit(image: Buffer) {
    const imageUrl = `data:image/jpeg;base64,${(await providerImage(image)).toString('base64')}`;
    const { bytes } = await this.transport(new URL(`${this.config.mesh.baseUrl}/v1/image-to-3d`), 'POST', Buffer.from(JSON.stringify({ image_url: imageUrl, enable_pbr: true, should_texture: true })), this.headers(), JSON_BYTES, 60_000, [200, 201, 202]);
    return z.string().min(1).max(128).parse(parseJson(bytes).result);
  }
  async poll(remoteId: string): Promise<MeshState> {
    const { bytes } = await this.transport(new URL(`${this.config.mesh.baseUrl}/v1/image-to-3d/${encodeURIComponent(remoteId)}`), 'GET', undefined, this.headers(), JSON_BYTES, 30_000);
    const d = parseJson(bytes), progress = Math.max(0, Math.min(100, Number(d.progress) || 0));
    if (d.status === 'SUCCEEDED') return d.model_urls?.glb ? { state: 'success', progress: 100, url: String(d.model_urls.glb) } : { state: 'failed', progress, error: 'PROVIDER_NO_MODEL' };
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(d.status)) return { state: 'failed', progress, error: `PROVIDER_${d.status}` };
    return { state: d.status === 'PENDING' ? 'queued' : 'running', progress };
  }
  download(url: string) { return downloadGlb(this.config, this.transport, url); }
}
// ───── Photo → coloured clay parts with a vision model (the PINCH layout method) ─────
// The model never returns vertices: it lays the subject out as 3–16 primitives with colours,
// the phone turns them into clay (along-clay.ts sceneFromLayout) and the traveller pinches on.
const PRIMS = ['sphere', 'box', 'cylinder', 'cone', 'capsule', 'torus', 'prism'] as const;
export const LAYOUT_SYSTEM = `You are the 3D layout artist of "PINCH" (捏个). Turn the photo's main subject into a rough clay model made of 3–16 primitives that a traveller will keep sculpting by hand. Make it look like a cheerful, colourful handmade clay figurine.

Coordinates: millimetres; +Y up, ground at y=0; +Z faces the viewer (the front); +X to the right. position is the part centre, rotation is XYZ Euler degrees.
Primitives (local centre at origin, local axis Y):
- sphere {r}
- box {w (X), h (Y), d (Z), bevel}
- cylinder {r, h, bevel}
- cone {r1 bottom radius, r2 top radius, h}  (r2=0 is a point)
- capsule {r, h total length}
- torus {R ring radius, r tube radius}  (ring in local XY plane)
- prism {n sides 3–12, r, h}

Rules:
1. Real proportions, about 60–90 mm tall overall. Every part touches or sinks 1–3 mm into another; nothing floats; it stands on the ground.
2. Few and accurate: 6 good parts beat 16 scraps. Keep the outline recognisable from the front.
3. Give every part a "color" (#RRGGBB) taken from the photo, slightly brighter and more saturated, like glazed clay. Use clearly different colours for different parts.
4. Paired parts (ears, arms, windows): write only the left one (x<0); then a line {"id":"…","mirrorOf":"left id"}.
5. ids are lowercase English (body, roof, ear_l).

Output JSON only, no prose and no code fence:
{"title":"short Chinese name","parts":[{"id":"body","primitive":"box","params":{"w":40,"h":30,"d":30,"bevel":3},"position":[0,15,0],"rotation":[0,0,0],"color":"#d9714a"}, …]}`;
const idText = (v: unknown) => { const s = String(v ?? '').trim().toLowerCase().slice(0, 32); return /^[a-z][a-z0-9_]{0,31}$/.test(s) ? s : ''; };
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2000;
const vec3 = (v: unknown) => (Array.isArray(v) && v.length === 3 && v.every(num) ? v.map(Number) : null);
/** Loose clean-up of the model's layout (same rules as PINCH clean_layout); the phone validates again. */
export function cleanLayout(answer: any) {
  const parts: any[] = [], seen = new Set<string>();
  for (const o of Array.isArray(answer?.parts) ? answer.parts.slice(0, 32) : []) {
    if (!o || typeof o !== 'object' || parts.length >= 24) continue;
    const pid = idText(o.id) || `p${parts.length}`;
    if (seen.has(pid)) continue;
    if (o.mirrorOf) { const src = idText(o.mirrorOf); if (src && seen.has(src)) { parts.push({ id: pid, mirrorOf: src }); seen.add(pid); } continue; }
    if (!PRIMS.includes(o.primitive)) continue;
    const params: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.params || {})) if (typeof k === 'string' && k.length <= 16 && num(v)) params[k] = Number(v);
    parts.push({ id: pid, primitive: o.primitive, params, position: vec3(o.position) || [0, 0, 0], rotation: vec3(o.rotation) || [0, 0, 0],
      ...(typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? { color: o.color.toLowerCase() } : {}), ...(o.mode === 'hole' ? { mode: 'hole' } : {}) });
    seen.add(pid);
  }
  if (!parts.some((p) => p.primitive)) throw new Error('LAYOUT_EMPTY');
  return { title: String(answer?.title || '').replace(/[\u0000-\u001f]/g, '').slice(0, 40), parts };
}
function contentOf(bytes: Buffer) {
  const reply = parseJson(bytes)?.choices?.[0]?.message?.content;
  const text = typeof reply === 'string' ? reply : Array.isArray(reply) ? reply.map((p: any) => p?.text || '').join('') : '';
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try { return JSON.parse(body); } catch {
    const a = body.indexOf('{'), b = body.lastIndexOf('}');
    if (a >= 0 && b > a) try { return JSON.parse(body.slice(a, b + 1)); } catch { /* falls through */ }
    throw new Error('PROVIDER_FORMAT_INVALID');
  }
}
/**
 * Synchronous: one bounded chat request per job, no retries (a slow gateway never doubles the cost).
 * submit() returns a pending id; the result is held in memory until the next poll collects it.
 */
export class VisionLayoutProvider implements MeshProvider {
  readonly name = 'layout';
  readonly layout = true;
  private results = new Map<string, Promise<MeshState & { layout?: unknown }>>();
  constructor(private config: Config, private transport: ProviderTransport = safeHttps) {}
  async submit(image: Buffer) {
    const jpeg = await providerImage(image);
    const url = allowedProviderUrl(`${this.config.mesh.baseUrl.replace(/\/$/, '')}/chat/completions`, this.config.mesh.llmHosts);
    const body = Buffer.from(JSON.stringify({
      model: this.config.mesh.llmModel, temperature: 0.4, max_tokens: 2400,
      messages: [{ role: 'system', content: LAYOUT_SYSTEM }, { role: 'user', content: [
        { type: 'text', text: 'Build the rough clay model of this photo\'s main subject. Reply with the JSON only.' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } },
      ] }],
    }));
    const pending = randomUUID();
    const work = this.transport(url, 'POST', body, { Authorization: `Bearer ${this.config.mesh.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }, JSON_BYTES, this.config.mesh.llmTimeoutMs)
      .then((r) => ({ state: 'success' as const, progress: 100, layout: cleanLayout(contentOf(r.bytes)) }))
      .catch((error) => ({ state: 'failed' as const, progress: 0, error: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROVIDER_FAILED' }));
    this.results.set(pending, work);
    // Forget results nobody collects (the job times out and refunds on its own).
    setTimeout(() => this.results.delete(pending), this.config.mesh.timeoutMs).unref?.();
    return pending;
  }
  async poll(remoteId: string): Promise<MeshState & { layout?: unknown }> {
    const work = this.results.get(remoteId);
    if (!work) return { state: 'failed', progress: 0, error: 'PROVIDER_RESTARTED' };
    const settled = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), 50))]);
    if (!settled) return { state: 'running', progress: 50 };
    this.results.delete(remoteId);
    return settled;
  }
  async download(): Promise<Buffer> { throw new Error('PROVIDER_NO_MODEL'); }
}

export function createMeshProvider(config: Config, transport: ProviderTransport = safeHttps): MeshProvider | null {
  if (!config.meshReady) return null;
  if (config.mesh.provider === 'openai-layout') return new VisionLayoutProvider(config, transport);
  return config.mesh.provider === 'tripo' ? new TripoProvider(config, transport) : new MeshyProvider(config, transport);
}

const jobView = (row: Row) => ({
  id: row.id, status: row.status, progress: row.progress, error: row.error, cost: row.cost, refunded: row.refunded, provider: row.provider,
  createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  ...(row.status === 'READY' && row.model_key ? { glbUrl: `/api/ai-models/${row.id}/glb` } : {}),
  ...(row.status === 'READY' && row.layout ? { layout: row.layout } : {}),
});
async function failJob(s: Services, jobId: string, error: string) {
  return s.db.tx(async c => {
    const row = (await c.query('SELECT * FROM ai_model_jobs WHERE id=$1 FOR UPDATE', [jobId])).rows[0];
    if (!row || row.status === 'READY' || row.status === 'FAILED') return row;
    // Refund exactly once, keyed by the job; the ledger shows the charge and the refund side by side.
    const refund = await changePoints(c, row.owner_id, { delta: row.cost, reason: 'REFUND', item: 'AI_MODEL', ref: row.id, key: `ai-refund:${row.id}` });
    await audit(c, row.owner_id, 'ai-model.fail', row.id, row.status, 'FAILED');
    return (await c.query("UPDATE ai_model_jobs SET status='FAILED',error=$2,refunded=$3,updated_at=now() WHERE id=$1 RETURNING *", [row.id, error.slice(0, 80), Boolean(refund.entry)])).rows[0];
  });
}
const providerError = (error: unknown) => (error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROVIDER_FAILED');

/** Poll lazily when the owner looks at the job; a claim on polled_at keeps parallel requests from double-polling. */
async function advance(s: Services, provider: MeshProvider | null, row: Row) {
  if (!['QUEUED', 'RUNNING'].includes(row.status)) return row;
  const now = Date.now();
  if (now - Number(row.started_at) > s.config.mesh.timeoutMs) return failJob(s, row.id, 'PROVIDER_TIMEOUT');
  if (!provider) return failJob(s, row.id, 'MESH_UNAVAILABLE');
  if (!row.remote_id || now - Number(row.polled_at) < POLL_EVERY_MS) return row;
  const claimed = await s.db.query("UPDATE ai_model_jobs SET polled_at=$2 WHERE id=$1 AND polled_at=$3 AND status IN ('QUEUED','RUNNING')", [row.id, now, row.polled_at]);
  if (!claimed.rowCount) return (await s.db.one('SELECT * FROM ai_model_jobs WHERE id=$1', [row.id]))!;
  let state: MeshState & { layout?: unknown };
  try { state = await provider.poll(row.remote_id); } catch (error) { return { ...row, error: providerError(error) }; }
  if (state.state === 'failed') return failJob(s, row.id, state.error || 'PROVIDER_FAILED');
  if (state.state !== 'success') {
    return (await s.db.one("UPDATE ai_model_jobs SET status=$2,progress=$3,updated_at=now() WHERE id=$1 AND status IN ('QUEUED','RUNNING') RETURNING *", [row.id, state.state === 'queued' ? 'QUEUED' : 'RUNNING', Math.round(state.progress)])) || row;
  }
  if (state.layout) {
    return (await s.db.tx(async c => {
      const current = (await c.query('SELECT * FROM ai_model_jobs WHERE id=$1 FOR UPDATE', [row.id])).rows[0];
      if (!['QUEUED', 'RUNNING'].includes(current.status)) return current;
      await audit(c, current.owner_id, 'ai-model.ready', current.id, current.status, 'READY');
      return (await c.query("UPDATE ai_model_jobs SET status='READY',progress=100,layout=$2,error=NULL,updated_at=now() WHERE id=$1 RETURNING *", [row.id, JSON.stringify(state.layout)])).rows[0];
    }));
  }
  let glb: Buffer;
  try { glb = await provider.download(state.url!); } catch (error) { return failJob(s, row.id, providerError(error)); }
  const key = objectKey('models', 'glb');
  await s.storage.put(key, glb, 'model/gltf-binary');
  const ready = await s.db.tx(async c => {
    const current = (await c.query('SELECT * FROM ai_model_jobs WHERE id=$1 FOR UPDATE', [row.id])).rows[0];
    if (!['QUEUED', 'RUNNING'].includes(current.status)) return null;
    await audit(c, current.owner_id, 'ai-model.ready', current.id, current.status, 'READY');
    return (await c.query("UPDATE ai_model_jobs SET status='READY',progress=100,model_key=$2,model_size=$3,error=NULL,updated_at=now() WHERE id=$1 RETURNING *", [row.id, key, glb.length])).rows[0];
  });
  if (!ready) { await s.storage.remove(key); return (await s.db.one('SELECT * FROM ai_model_jobs WHERE id=$1', [row.id]))!; }
  return ready;
}

export function aiModelRoutes(app: App, s: Services, provider: MeshProvider | null) {
  app.get('/api/ai-models/config', async () => ({ available: Boolean(provider), provider: provider?.name ?? null, cost: PRICES.AI_MODEL }));
  app.post('/api/ai-models', async req => {
    const user = requireUser(req);
    // Not configured: say so before taking any points.
    if (!provider) fail(503, 'MESH_UNAVAILABLE', 'Photo-to-3D is not switched on yet');
    await rateLimit(s, `ai-model:${user.id}`, 10, 3600_000);
    const { files, fields } = await readMultipart(req, ['image'], s.config.limits.imageBytes, 2);
    const meta = z.object({ idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9:_-]+$/), consent: z.literal('true') }).strict().parse(fields);
    const image = await normalizeImage(files.get('image')!, s.config);
    const jobId = id();
    const created = await s.db.tx(async c => {
      const old = (await c.query('SELECT * FROM ai_model_jobs WHERE owner_id=$1 AND idempotency_key=$2', [user.id, meta.idempotencyKey])).rows[0];
      if (old) return { row: old, fresh: false };
      await changePoints(c, user.id, { delta: -PRICES.AI_MODEL, reason: 'SPEND', item: 'AI_MODEL', ref: jobId, key: `ai:${meta.idempotencyKey}` });
      const row = (await c.query("INSERT INTO ai_model_jobs(id,owner_id,provider,status,cost,idempotency_key,started_at) VALUES($1,$2,$3,'QUEUED',$4,$5,$6) RETURNING *", [jobId, user.id, provider!.name, PRICES.AI_MODEL, meta.idempotencyKey, Date.now()])).rows[0];
      await audit(c, user.id, 'ai-model.create', jobId, null, 'QUEUED');
      return { row, fresh: true };
    });
    if (!created.fresh) return { job: jobView(created.row) };
    try {
      const remote = await provider!.submit(image.bytes);
      const row = await s.db.one("UPDATE ai_model_jobs SET remote_id=$2,status='RUNNING',updated_at=now() WHERE id=$1 RETURNING *", [jobId, remote]);
      return { job: jobView(row!) };
    } catch (error) {
      return { job: jobView(await failJob(s, jobId, providerError(error))) };
    }
  });
  app.get('/api/ai-models', async req => {
    const user = requireUser(req);
    return { items: (await s.db.query('SELECT * FROM ai_model_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30', [user.id])).rows.map(jobView) };
  });
  app.get<{ Params: { id: string } }>('/api/ai-models/:id', async req => {
    const user = requireUser(req), row = await s.db.one('SELECT * FROM ai_model_jobs WHERE id=$1', [z.string().uuid().parse(req.params.id)]);
    if (!row || row.owner_id !== user.id) fail(404, 'NOT_FOUND');
    return { job: jobView(await advance(s, provider, row!)) };
  });
  app.get<{ Params: { id: string } }>('/api/ai-models/:id/glb', async (req, reply) => {
    const file = await workshopFile(s, requireUser(req), 'ai-models', z.string().uuid().parse(req.params.id), 'glb');
    return sendFile(req, reply, s.storage, file.key, file.mime, file.filename);
  });
}
