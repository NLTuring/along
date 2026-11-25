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

export type MeshState = { state: 'queued' | 'running' | 'success' | 'failed'; progress: number; url?: string; error?: string; stage?: string };
/** What the traveller sent: one photo, a few frames taken from a video, or a written description. */
export type MeshInput = { kind: 'image' | 'video' | 'text'; images: Buffer[]; prompt?: string };
export interface MeshProvider {
  readonly name: string;
  readonly kinds?: readonly MeshInput['kind'][];
  submit(input: MeshInput): Promise<string>;
  poll(remoteId: string): Promise<MeshState>;
  download(url: string): Promise<Buffer>;
}
const JSON_BYTES = 1024 * 1024;
const FRAMES = ['frame0', 'frame1', 'frame2', 'frame3'];
const POLL_EVERY_MS = 3000;

function parseJson(bytes: Buffer) { try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error('PROVIDER_FORMAT_INVALID'); } }
/** Signed result URLs must be HTTPS on an exact allowlisted host; the body must be a binary glTF 2.0 file. */
export async function downloadGlb(config: Config, transport: ProviderTransport, value: string, hosts: readonly string[] = config.mesh.resultHosts) {
  const url = allowedProviderUrl(value, hosts);
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
/**
 * Tripo v3 (H3.1 model): a photo goes to image-to-model, words to text-to-model, and a video sends
 * its first frame. The model comes back coloured (one embedded base-colour texture, no PBR maps).
 */
export class TripoProvider implements MeshProvider {
  readonly name = 'tripo';
  readonly kinds = ['image', 'video', 'text'] as const;
  constructor(private config: Config, private transport: ProviderTransport = safeHttps) {}
  private get tripo() {
    if (!this.config.mesh.tripo) throw new Error('MESH_UNAVAILABLE');
    return this.config.mesh.tripo;
  }
  private async call(path: string, method: 'GET' | 'POST', body?: Buffer, type?: string) {
    const t = this.tripo, url = new URL(`${t.baseUrl}${path}`);
    const { bytes } = await this.transport(url, method, body, { Authorization: `Bearer ${t.apiKey}`, Accept: 'application/json', ...(type ? { 'Content-Type': type } : {}) }, JSON_BYTES, 60_000, [200, 201]);
    const result = parseJson(bytes);
    if (result.code !== 0 || !result.data) throw new Error('PROVIDER_REJECTED');
    return result.data;
  }
  async submit(input: MeshInput) {
    // Coloured, standard texture, about 40k faces: a ~2 MB GLB a phone shows smoothly.
    // PBR maps stay off: a phone viewer only uses the base colour.
    const shape = { model: this.tripo.model, texture: true, pbr: false, texture_quality: 'standard', face_limit: 40_000 };
    const json = (value: object) => Buffer.from(JSON.stringify(value));
    let task;
    if (input.kind === 'text') task = await this.call('/generation/text-to-model', 'POST', json({ ...shape, prompt: input.prompt }), 'application/json');
    else {
      if (!input.images[0]) throw new Error('MISSING_FILE');
      const file = multipartFile('file', 'seed.jpg', 'image/jpeg', await providerImage(input.images[0]));
      const uploaded = await this.call('/files', 'POST', file.body, file.type);
      task = await this.call('/generation/image-to-model', 'POST', json({ ...shape, input: z.string().min(1).max(256).parse(uploaded.file_token) }), 'application/json');
    }
    return z.string().min(1).max(128).parse(task.task_id);
  }
  async poll(remoteId: string): Promise<MeshState> {
    const d = await this.call(`/tasks/${encodeURIComponent(remoteId)}`, 'GET');
    const progress = Math.max(0, Math.min(100, Number(d.progress) || 0));
    if (d.status === 'success') {
      const out = d.output || {}, url = out.model_url || out.pbr_model || out.model || out.base_model;
      return url ? { state: 'success', progress: 100, url: String(url) } : { state: 'failed', progress, error: 'PROVIDER_NO_MODEL' };
    }
    if (['failed', 'cancelled', 'banned', 'expired'].includes(d.status)) return { state: 'failed', progress, error: `PROVIDER_${String(d.status).toUpperCase()}` };
    // "unknown" is not final for Tripo; the job timeout ends it if it never settles.
    return { state: d.status === 'queued' ? 'queued' : 'running', progress };
  }
  download(url: string) { return downloadGlb(this.config, this.transport, url, this.tripo.resultHosts); }
}
export class MeshyProvider implements MeshProvider {
  readonly name = 'meshy';
  constructor(private config: Config, private transport: ProviderTransport = safeHttps) {}
  private headers() { return { Authorization: `Bearer ${this.config.mesh.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' }; }
  readonly kinds = ['image', 'video'] as const;
  async submit(input: MeshInput) {
    const imageUrl = `data:image/jpeg;base64,${(await providerImage(input.images[0])).toString('base64')}`;
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
export const LAYOUT_SYSTEM = `You are the 3D layout artist of "PINCH" (捏个). Turn the main subject (shown in a photo, in several frames of one video, or described in words) into a rough clay model made of 3–16 primitives that a traveller will keep sculpting by hand. Make it look like a cheerful, colourful handmade clay figurine.

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
      ...(typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? { color: o.color.toLowerCase() } : {}), ...(o.mode === 'hole' ? { mode: 'hole' } : {}),
      ...(num(o.blend) ? { blend: Math.max(0, Math.min(12, Number(o.blend))) } : {}) });
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
// ───── Second AI: repair and detail the rough layout ─────
export const REFINE_SYSTEM = `You are the senior 3D model finisher of "PINCH" (捏个). Another AI drafted a rough clay figurine as primitives. Repair it and add the detail that makes it read as the real subject, while keeping it a cheerful handmade clay piece.

Same coordinate system and primitives as the draft: millimetres, +Y up, ground at y=0, +Z is the front, +X right; position is the part centre, rotation XYZ Euler degrees.
sphere {r} · box {w,h,d,bevel} · cylinder {r,h,bevel} · cone {r1,r2,h} · capsule {r,h} · torus {R,r} · prism {n,r,h}. Optional "blend" 0–12 mm softens the join with neighbours; optional "mode":"hole" carves.

Do, in this order:
1. Fix every problem listed in "checks" (floating parts, parts below ground, wrong overall size, missing colours).
2. Correct proportions and silhouette against the reference (photo/frames) or the description.
3. Add 4–10 small detail parts that matter: eyes, nose, ears, windows, roof ridge, handles, buttons, hair tufts, patterns. Details sink 1–2 mm into the surface they sit on.
4. Use "blend" 2–5 on soft organic joins (head to body), 0–1 on crisp ones (window on wall).
5. Keep paired parts as left part + {"id":"…","mirrorOf":"left id"}. Total at most 24 parts. Overall 60–90 mm tall, standing on y=0.
6. Colours: #RRGGBB glazed-clay colours from the reference; adjacent parts must contrast.

Output JSON only, no prose and no code fence, in the draft's format plus a short list of what you changed:
{"title":"short Chinese name","notes":["…"],"parts":[…]}`;

type Layout = ReturnType<typeof cleanLayout>;
const RADIUS: Record<string, (p: Record<string, number>) => [number, number, number]> = {
  sphere: (p) => [p.r ?? 10, p.r ?? 10, p.r ?? 10],
  box: (p) => [(p.w ?? 20) / 2, (p.h ?? 20) / 2, (p.d ?? 20) / 2],
  cylinder: (p) => [p.r ?? 10, (p.h ?? 20) / 2, p.r ?? 10],
  cone: (p) => [Math.max(p.r1 ?? 10, p.r2 ?? 0), (p.h ?? 20) / 2, Math.max(p.r1 ?? 10, p.r2 ?? 0)],
  capsule: (p) => [p.r ?? 8, (p.h ?? 24) / 2, p.r ?? 8],
  torus: (p) => [(p.R ?? 12) + (p.r ?? 3), (p.R ?? 12) + (p.r ?? 3), p.r ?? 3],
  prism: (p) => [p.r ?? 10, (p.h ?? 20) / 2, p.r ?? 10],
};
/** Rough bounding boxes (rotation ignored: half-extents are taken as the largest axis) so the checker stays cheap. */
function boxes(layout: Layout) {
  const byId = new Map<string, any>(), out: { id: string; min: number[]; max: number[] }[] = [];
  for (const p of layout.parts as any[]) {
    const src = p.mirrorOf ? byId.get(p.mirrorOf) : p;
    if (!src?.primitive) continue;
    const pos = p.mirrorOf ? [-src.position[0], src.position[1], src.position[2]] : src.position;
    const r = RADIUS[src.primitive](src.params), rotated = (src.rotation as number[]).some((a) => Math.abs(a % 180) > 1);
    const half = rotated ? [Math.max(...r), Math.max(...r), Math.max(...r)] : r;
    out.push({ id: p.id, min: pos.map((v: number, i: number) => v - half[i]), max: pos.map((v: number, i: number) => v + half[i]) });
    if (!p.mirrorOf) byId.set(p.id, p);
  }
  return out;
}
/** Problems a person would see at once; the refiner is told about each of them. */
export function checkLayout(layout: Layout) {
  const issues: string[] = [], b = boxes(layout);
  if (!b.length) return ['no solid parts'];
  const min = [0, 1, 2].map((i) => Math.min(...b.map((x) => x.min[i]))), max = [0, 1, 2].map((i) => Math.max(...b.map((x) => x.max[i])));
  const height = max[1] - min[1], gap = 1.5;
  if (height < 45 || height > 120) issues.push(`overall height is ${Math.round(height)} mm; make it 60–90 mm`);
  if (min[1] < -3) issues.push(`lowest part sits ${Math.round(-min[1])} mm below the ground; lift it to y=0`);
  if (min[1] > 4) issues.push(`the model floats ${Math.round(min[1])} mm above the ground; lower it to y=0`);
  for (const a of b) {
    const touches = b.some((o) => o !== a && [0, 1, 2].every((i) => a.min[i] <= o.max[i] + gap && o.min[i] <= a.max[i] + gap));
    if (b.length > 1 && !touches) issues.push(`part "${a.id}" floats free; connect it to a neighbour`);
  }
  const plain = (layout.parts as any[]).filter((p) => p.primitive && !p.color).map((p) => p.id);
  if (plain.length) issues.push(`parts without a colour: ${plain.slice(0, 6).join(', ')}`);
  if ((layout.parts as any[]).length < 6) issues.push('only a few parts; add the details that make the subject recognisable');
  return issues.slice(0, 12);
}
function referenceContent(input: MeshInput, jpegs: Buffer[], lead: string) {
  const text = input.kind === 'text' ? `${lead}\nDescription from the traveller: """${input.prompt}"""`
    : input.kind === 'video' ? `${lead}\nThe images are ${jpegs.length} frames from one short video of the same subject, seen from different sides; combine them.` : lead;
  return [{ type: 'text', text }, ...jpegs.map((j) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${j.toString('base64')}` } }))];
}
const errorCode = (error: unknown) => (error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROVIDER_FAILED');

/**
 * Bounded chat requests per job, no retries (a slow gateway never doubles the cost).
 * Draft AI → checks → refine AI (up to `rounds` times while checks still find problems).
 * submit() returns a pending id; the result is held in memory until the next poll collects it.
 * If the refiner fails, the draft is still delivered, so the traveller is never charged for nothing.
 */
export class VisionLayoutProvider implements MeshProvider {
  readonly layout = true;
  readonly kinds = ['image', 'video', 'text'] as const;
  private results = new Map<string, { work: Promise<MeshState & { layout?: unknown }>; stage: string; progress: number }>();
  constructor(private config: Config, private transport: ProviderTransport = safeHttps) {}
  get name() { return this.config.mesh.refine ? 'layout+refine' : 'layout'; }
  private async chat(base: string, hosts: readonly string[], key: string, model: string, system: string, content: unknown[], maxTokens: number) {
    const url = allowedProviderUrl(`${base.replace(/\/$/, '')}/chat/completions`, hosts);
    const body = Buffer.from(JSON.stringify({ model, temperature: 0.4, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content }] }));
    const r = await this.transport(url, 'POST', body, { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' }, JSON_BYTES, this.config.mesh.llmTimeoutMs);
    return contentOf(r.bytes);
  }
  async submit(input: MeshInput) {
    const jpegs = await Promise.all(input.images.slice(0, 4).map(providerImage));
    const m = this.config.mesh, pending = randomUUID();
    const entry = { stage: 'draft', progress: 10, work: null as any };
    entry.work = (async () => {
      const lead = input.kind === 'text' ? 'Build the rough clay model of the subject described below. Reply with the JSON only.'
        : 'Build the rough clay model of the main subject. Reply with the JSON only.';
      const draft = cleanLayout(await this.chat(m.baseUrl, m.llmHosts, m.apiKey, m.llmModel, LAYOUT_SYSTEM, referenceContent(input, jpegs, lead), 2400));
      if (!m.refine) return { state: 'success' as const, progress: 100, layout: { ...draft, rounds: 0 } };
      let best = draft, notes: string[] = [];
      let issues = checkLayout(draft), round = 0;
      for (; round < m.refine.rounds; round++) {
        entry.stage = 'refine'; entry.progress = 35 + Math.round((50 * round) / m.refine.rounds);
        const lead2 = `Here is the rough draft${round ? ' after your previous pass' : ''}.\ndraft: ${JSON.stringify({ title: best.title, parts: best.parts })}\nchecks: ${JSON.stringify(issues.length ? issues : ['no geometric problems found; improve detail and likeness'])}\nReply with the improved JSON only.`;
        let next: Layout;
        try {
          const answer = await this.chat(m.refine.baseUrl, m.refine.hosts, m.refine.apiKey, m.refine.model, REFINE_SYSTEM, referenceContent(input, jpegs, lead2), 6000);
          next = cleanLayout(answer);
          notes = Array.isArray(answer?.notes) ? answer.notes.filter((n: unknown) => typeof n === 'string').map((n: string) => n.slice(0, 120)).slice(0, 8) : notes;
        } catch { break; } // keep the best layout so far
        const nextIssues = checkLayout(next);
        // Never trade a sound model for a broken one: keep the refined version only if it is not worse.
        if (nextIssues.length <= issues.length + 1) { best = next; issues = nextIssues; } else break;
        if (!issues.length) { round++; break; }
      }
      return { state: 'success' as const, progress: 100, layout: { ...best, rounds: round, notes, issues } };
    })().catch((error) => ({ state: 'failed' as const, progress: 0, error: errorCode(error) }));
    this.results.set(pending, entry);
    // Forget results nobody collects (the job times out and refunds on its own).
    setTimeout(() => this.results.delete(pending), m.timeoutMs).unref?.();
    return pending;
  }
  async poll(remoteId: string): Promise<MeshState & { layout?: unknown }> {
    const entry = this.results.get(remoteId);
    if (!entry) return { state: 'failed', progress: 0, error: 'PROVIDER_RESTARTED' };
    const settled = await Promise.race([entry.work, new Promise<null>((r) => setTimeout(() => r(null), 50))]);
    if (!settled) return { state: 'running', progress: entry.progress, stage: entry.stage };
    this.results.delete(remoteId);
    return settled;
  }
  async download(): Promise<Buffer> { throw new Error('PROVIDER_NO_MODEL'); }
}

/**
 * The two ways a traveller can have the model made. relay: one AI drafts coloured clay parts and a
 * second repairs them (cheaper). tripo: Tripo generates a finer mesh directly (dearer).
 */
export const ENGINES = ['relay', 'tripo'] as const;
export type Engine = typeof ENGINES[number];
export type MeshEngines = Partial<Record<Engine, MeshProvider | null>>;
export const ENGINE_ITEM = { relay: 'AI_MODEL', tripo: 'AI_MODEL_TRIPO' } as const;
const engineOf = (providerName: string): Engine => (providerName === 'tripo' ? 'tripo' : 'relay');
/** A single injected provider (tests) goes into the slot its name belongs to. */
export function meshEngines(provider: MeshProvider | null): MeshEngines {
  return provider ? { [engineOf(provider.name)]: provider } : {};
}
export function createMeshProviders(config: Config, transport: ProviderTransport = safeHttps): MeshEngines {
  return {
    relay: config.meshLayoutReady ? new VisionLayoutProvider(config, transport) : config.mesh.provider === 'meshy' && config.meshReady ? new MeshyProvider(config, transport) : null,
    tripo: config.mesh.tripo ? new TripoProvider(config, transport) : null,
  };
}

const jobView = (row: Row) => ({
  id: row.id, status: row.status, progress: row.progress, error: row.error, cost: row.cost, refunded: row.refunded, provider: row.provider,
  engine: engineOf(row.provider), kind: row.kind || 'image', stage: row.stage || null,
  createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  ...(row.status === 'READY' && row.model_key ? { glbUrl: `/api/ai-models/${row.id}/glb` } : {}),
  ...(row.status === 'READY' && row.layout ? { layout: row.layout } : {}),
});
async function failJob(s: Services, jobId: string, error: string) {
  return s.db.tx(async c => {
    const row = (await c.query('SELECT * FROM ai_model_jobs WHERE id=$1 FOR UPDATE', [jobId])).rows[0];
    if (!row || row.status === 'READY' || row.status === 'FAILED') return row;
    // Refund exactly once, keyed by the job; the ledger shows the charge and the refund side by side.
    const refund = await changePoints(c, row.owner_id, { delta: row.cost, reason: 'REFUND', item: ENGINE_ITEM[engineOf(row.provider)], ref: row.id, key: `ai-refund:${row.id}` });
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
    return (await s.db.one("UPDATE ai_model_jobs SET status=$2,progress=$3,stage=COALESCE($4,stage),updated_at=now() WHERE id=$1 AND status IN ('QUEUED','RUNNING') RETURNING *", [row.id, state.state === 'queued' ? 'QUEUED' : 'RUNNING', Math.round(state.progress), state.stage ?? null])) || row;
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

export function aiModelRoutes(app: App, s: Services, engines: MeshEngines) {
  const relay = engines.relay ?? null, tripo = engines.tripo ?? null;
  const first = relay || tripo;
  const engineView = (engine: Engine, provider: MeshProvider | null) => ({
    id: engine, available: Boolean(provider), cost: PRICES[ENGINE_ITEM[engine]], kinds: provider ? provider.kinds ?? ['image'] : [],
    refine: engine === 'relay' && Boolean(provider && (provider as any).layout && s.config.mesh.refine),
  });
  app.get('/api/ai-models/config', async () => ({
    // The top-level fields describe the default engine, for phones that do not know about engines yet.
    available: Boolean(first), provider: first?.name ?? null, cost: relay ? PRICES.AI_MODEL : tripo ? PRICES.AI_MODEL_TRIPO : PRICES.AI_MODEL,
    kinds: first ? first.kinds ?? ['image'] : [], refine: Boolean(relay && (relay as any).layout && s.config.mesh.refine),
    engines: ENGINES.map((engine) => engineView(engine, engines[engine] ?? null)),
  }));
  app.post('/api/ai-models', async req => {
    const user = requireUser(req);
    // Not configured: say so before taking any points.
    if (!first) fail(503, 'MESH_UNAVAILABLE', 'Photo-to-3D is not switched on yet');
    await rateLimit(s, `ai-model:${user.id}`, 10, 3600_000);
    // image: one photo · video: 2–4 frames the phone took from a short video · text: a description.
    const { files, fields } = await readMultipart(req, [], s.config.limits.imageBytes, 5, ['image', ...FRAMES]);
    const meta = z.object({
      idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9:_-]+$/), consent: z.literal('true'),
      kind: z.enum(['image', 'video', 'text']).default('image'), prompt: z.string().trim().min(2).max(600).optional(),
      // relay: two AIs (cheaper) · tripo: Tripo makes the mesh (dearer). Older phones send nothing and get the default.
      engine: z.enum(ENGINES).optional(),
    }).strict().parse(fields);
    const engine: Engine = meta.engine ?? (relay ? 'relay' : 'tripo');
    const provider = engines[engine] ?? null;
    if (!provider) fail(503, 'MESH_UNAVAILABLE', 'This way of making the model is not switched on');
    // The price is the server's, chosen by the engine; the phone never sends one.
    const item = ENGINE_ITEM[engine], cost = PRICES[item];
    if (provider!.kinds && !provider!.kinds.includes(meta.kind)) fail(422, 'MESH_KIND_UNSUPPORTED');
    const raw = meta.kind === 'image' ? [files.get('image')] : meta.kind === 'video' ? FRAMES.map((f) => files.get(f)).filter(Boolean) : [];
    if (meta.kind === 'image' && !raw[0]) fail(400, 'MISSING_FILE');
    if (meta.kind === 'video' && raw.length < 2) fail(400, 'VIDEO_FRAMES_REQUIRED');
    if (meta.kind === 'text' && !meta.prompt) fail(400, 'PROMPT_REQUIRED');
    if (meta.kind !== 'text' && meta.prompt) fail(400, 'UNEXPECTED_PROMPT');
    const input: MeshInput = { kind: meta.kind, prompt: meta.prompt, images: await Promise.all(raw.map(async (b) => (await normalizeImage(b!, s.config)).bytes)) };
    const jobId = id();
    const created = await s.db.tx(async c => {
      const old = (await c.query('SELECT * FROM ai_model_jobs WHERE owner_id=$1 AND idempotency_key=$2', [user.id, meta.idempotencyKey])).rows[0];
      if (old) return { row: old, fresh: false };
      await changePoints(c, user.id, { delta: -cost, reason: 'SPEND', item, ref: jobId, key: `ai:${meta.idempotencyKey}` });
      const row = (await c.query("INSERT INTO ai_model_jobs(id,owner_id,provider,status,cost,idempotency_key,started_at,kind,stage) VALUES($1,$2,$3,'QUEUED',$4,$5,$6,$7,$8) RETURNING *", [jobId, user.id, provider!.name, cost, meta.idempotencyKey, Date.now(), meta.kind, engine === 'relay' ? 'draft' : null])).rows[0];
      await audit(c, user.id, 'ai-model.create', jobId, null, 'QUEUED');
      return { row, fresh: true };
    });
    if (!created.fresh) return { job: jobView(created.row) };
    try {
      const remote = await provider!.submit(input);
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
    return { job: jobView(await advance(s, engines[engineOf(row!.provider)] ?? null, row!)) };
  });
  app.get<{ Params: { id: string } }>('/api/ai-models/:id/glb', async (req, reply) => {
    const file = await workshopFile(s, requireUser(req), 'ai-models', z.string().uuid().parse(req.params.id), 'glb');
    return sendFile(req, reply, s.storage, file.key, file.mime, file.filename);
  });
}
