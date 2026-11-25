// Craft workshop API: points, bead kit orders, the shared gallery and AI photo-to-3D jobs.
// Isolated like the other suites: pg-mem, a temporary storage folder, and a fake 3D provider.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createServices } from '../src/runtime.js';
import type { Services } from '../src/core.js';
import { grantMonth, MONTHLY_GRANT } from '../src/points.js';
import { kitQuote } from '../src/beads.js';
import { checkGlb, checkLayout, cleanLayout, TripoProvider, VisionLayoutProvider, type MeshProvider, type MeshState } from '../src/ai-models.js';
import type { ProviderTransport } from '../src/providers.js';

const ORIGIN = 'http://localhost:4175';
const ADMIN = 'workshop-admin@example.test';
type Session = { cookie: string; csrfToken: string; user: { id: string } };

/** A closed tetrahedron as a canonical single-mesh GLB (positions in metres). */
export function tetraGlb() {
  const positions = new Float32Array([0, 0, 0, 0.02, 0, 0, 0, 0.02, 0, 0, 0, 0.02]);
  const indices = new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const gltf = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [0.02, 0.02, 0.02] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }],
  };
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const padded = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + padded.length, 8);
  const chunk = (type: number, data: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
  return Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, padded)]);
}
const pattern = (overrides: Record<string, unknown> = {}) => ({
  width: 8, height: 8, bead: 'MIDI_5MM',
  palette: [{ code: 'H1', hex: '#ffffff' }, { code: 'H18', hex: '#1a1a1a' }],
  cells: '0'.repeat(32) + '1'.repeat(24) + '.'.repeat(8), ...overrides,
});
const shipping = { name: 'Synthetic Recipient', phone: '+86 10000000000', region: 'Fixture Region', address: 'Synthetic address only', postalCode: '000000' };

function multipart(parts: ({ name: string; value: string } | { name: string; filename: string; type: string; bytes: Buffer })[]) {
  const boundary = `workshop-${randomUUID()}`, chunks: Buffer[] = [];
  for (const part of parts) {
    const file = 'bytes' in part;
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${file ? `; filename="${part.filename}"` : ''}\r\n${file ? `Content-Type: ${part.type}\r\n` : ''}\r\n`));
    chunks.push(file ? part.bytes : Buffer.from(part.value), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
function expectStatus(response: LightMyRequestResponse, status: number) {
  assert.equal(response.statusCode, status, `HTTP ${response.statusCode}, expected ${status}: ${response.body}`);
  return response.json();
}
const pngBytes = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 120, b: 80 } } }).png().toBuffer();

class FakeMesh implements MeshProvider {
  // The name picks the engine: 'tripo' is Tripo, anything else is the two-AI relay.
  constructor(readonly name = 'fake-relay') {}
  submitted = 0; next: MeshState = { state: 'success', progress: 100, url: 'https://cdn.example.test/m.glb' };
  failSubmit = false; body: Buffer = tetraGlb();
  async submit() { this.submitted++; if (this.failSubmit) throw new Error('PROVIDER_REJECTED'); return `remote-${this.submitted}`; }
  async poll() { return this.next; }
  async download() { checkGlb(this.body); return this.body; }
}

describe('craft workshop API', { concurrency: false }, () => {
  let services: Services, app: Awaited<ReturnType<typeof createApp>>, dir: string, mesh: FakeMesh | null;
  async function start(withMesh: boolean) {
    dir = await mkdtemp(join(tmpdir(), 'along-workshop-'));
    services = await createServices(loadConfig({ NODE_ENV: 'test', DEVELOPMENT_LOCAL: 'true', DEV_OTP_DISPLAY: 'true', SESSION_SECRET: 'workshop-only-not-a-production-secret-2026', APP_ORIGINS: ORIGIN, ADMIN_EMAILS: ADMIN, LOCAL_STORAGE_DIR: dir }));
    mesh = withMesh ? new FakeMesh() : null;
    app = await createApp(services, { meshProvider: mesh });
  }
  beforeEach(() => start(false));
  afterEach(async () => { await app?.close(); await services?.tasks.close?.(); await services?.db.close(); if (dir) await rm(dir, { recursive: true, force: true }); });
  async function restartWithMesh() { await app.close(); await services.db.close(); await rm(dir, { recursive: true, force: true }); await start(true); }

  function send(method: InjectOptions['method'], url: string, session?: Session, payload?: InjectOptions['payload'], headers: Record<string, string> = {}) {
    return app.inject({ method, url, payload, headers: { origin: ORIGIN, ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrfToken } : {}), ...headers } });
  }
  async function login(email: string): Promise<Session> {
    const code = expectStatus(await send('POST', '/api/auth/otp', undefined, { email }), 200).code;
    const response = await send('POST', '/api/auth/verify', undefined, { email, code });
    const value = expectStatus(response, 200), cookies = response.headers['set-cookie'];
    return { cookie: String(Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0], csrfToken: value.csrfToken, user: value.user };
  }
  const balance = async (session: Session) => expectStatus(await send('GET', '/api/points', session), 200).balance as number;
  async function topup(session: Session, tier = 'T60', key = randomUUID()) {
    return expectStatus(await send('POST', '/api/points/topup', session, { tier, idempotencyKey: key, demoConsent: true }), 200);
  }
  async function upload(session: Session, meta: Record<string, unknown>, model: Buffer | null = tetraGlb()) {
    const parts: Parameters<typeof multipart>[0] = [{ name: 'metadata', value: JSON.stringify({ kind: 'CLAY', title: '外滩的小楼', story: '用照片贴了外墙', city: '上海', price: 10, allowRemix: true, consent: true, ...meta }) }, { name: 'cover', filename: 'cover.png', type: 'image/png', bytes: await pngBytes() }];
    if (model) parts.push({ name: 'model', filename: 'work.glb', type: 'model/gltf-binary', bytes: model });
    const form = multipart(parts);
    return send('POST', '/api/gallery', session, form.payload, { 'content-type': form.contentType });
  }

  it('grants 50 points once a month, credits demo top-ups once per key and never overdraws', async () => {
    const alice = await login('alice@example.test');
    const first = expectStatus(await send('GET', '/api/points', alice), 200);
    assert.equal(first.balance, MONTHLY_GRANT);
    assert.equal(first.month, grantMonth());
    assert.deepEqual(first.tiers.map((t: any) => t.points + t.bonus), [600, 1300]);
    assert.equal(first.ledger.length, 1);
    assert.equal((await send('GET', '/api/points', alice)).json().ledger.length, 1, 'no second grant in the same month');
    // A new month adds another grant on the next visit.
    await services.db.query("UPDATE point_accounts SET grant_month='2000-01' WHERE user_id=$1", [alice.user.id]);
    await services.db.query("UPDATE point_ledger SET idempotency_key='grant:2000-01',ref='2000-01' WHERE user_id=$1", [alice.user.id]);
    assert.equal(await balance(alice), 100);
    // Resetting the month marker alone cannot double-credit: the ledger key already exists.
    await services.db.query("UPDATE point_accounts SET grant_month='2000-01' WHERE user_id=$1", [alice.user.id]);
    assert.equal(await balance(alice), 100);

    const key = randomUUID();
    assert.equal((await topup(alice, 'T30', key)).balance, 700);
    assert.equal((await topup(alice, 'T30', key)).balance, 700, 'retry with the same key does not credit twice');
    assert.equal((await topup(alice, 'T60')).balance, 2000);
    expectStatus(await send('POST', '/api/points/topup', alice, { tier: 'T60', idempotencyKey: randomUUID() }), 400);

    const bob = await login('bob@example.test');
    const spend = (item: string, ref = 'craft-1') => send('POST', '/api/points/spend', bob, { item, ref, idempotencyKey: randomUUID() });
    for (let i = 0; i < 10; i++) expectStatus(await spend(i % 2 ? 'MAGNET' : 'BEADS'), 200);
    assert.equal(await balance(bob), 0);
    assert.equal((await spend('KEYCHAIN')).json().error.code, 'POINTS_INSUFFICIENT');
    assert.equal((await spend('KEYCHAIN')).statusCode, 402);
    assert.equal(await balance(bob), 0);
    expectStatus(await send('POST', '/api/points/spend', bob, { item: 'AI_MODEL', ref: 'x', idempotencyKey: randomUUID() }), 400);
    expectStatus(await send('GET', '/api/points'), 401);
  });

  it('prices bead kits from the pattern on the server and records demo-paid orders', async () => {
    const alice = await login('alice@example.test');
    const quote = kitQuote(pattern() as any, 'FULL_KIT');
    assert.equal(quote.beads, 56);
    assert.deepEqual(quote.colours.map(c => c.count), [32, 24]);
    assert.equal(quote.totalCents, 2 * 600 + 800 + 1500 + 800);
    const body = { pattern: pattern(), kit: 'FULL_KIT', shipping, demoConsent: true, idempotencyKey: randomUUID() };
    const order = expectStatus(await send('POST', '/api/bead-orders', alice, body), 200).order;
    assert.equal(order.status, 'PAID_DEMO');
    assert.equal(order.amountCents, quote.totalCents);
    assert.equal(expectStatus(await send('POST', '/api/bead-orders', alice, body), 200).order.id, order.id);
    expectStatus(await send('POST', '/api/bead-orders', alice, { ...body, kit: 'BEADS' }), 409);
    expectStatus(await send('POST', '/api/bead-orders', alice, { ...body, idempotencyKey: randomUUID(), pattern: pattern({ cells: '9'.repeat(64) }) }), 400);
    expectStatus(await send('POST', '/api/bead-orders', alice, { ...body, idempotencyKey: randomUUID(), pattern: pattern({ cells: '.'.repeat(64) }) }), 400);

    const bob = await login('bob@example.test');
    expectStatus(await send('GET', `/api/bead-orders/${order.id}`, bob), 404);
    assert.equal(expectStatus(await send('GET', '/api/bead-orders', bob), 200).items.length, 0);
    const admin = await login(ADMIN);
    expectStatus(await send('POST', `/api/admin/bead-orders/${order.id}/status`, admin, { status: 'SHIPPED' }), 409);
    expectStatus(await send('POST', `/api/admin/bead-orders/${order.id}/status`, admin, { status: 'PACKING' }), 200);
    expectStatus(await send('POST', `/api/bead-orders/${order.id}/cancel`, alice), 409);
    expectStatus(await send('POST', `/api/admin/bead-orders/${order.id}/status`, admin, { status: 'SHIPPED' }), 422);
    const shipped = expectStatus(await send('POST', `/api/admin/bead-orders/${order.id}/status`, admin, { status: 'SHIPPED', carrier: '顺丰', trackingNumber: 'SF000000' }), 200).order;
    assert.deepEqual(shipped.tracking, { carrier: '顺丰', number: 'SF000000' });
  });

  it('reviews gallery uploads, charges unlocks once and pays the author half', async () => {
    const [alice, bob, admin] = [await login('alice@example.test'), await login('bob@example.test'), await login(ADMIN)];
    const work = expectStatus(await upload(alice, {}), 200).work;
    assert.equal(work.status, 'PENDING');
    assert.equal(expectStatus(await send('GET', '/api/gallery', bob), 200).items.length, 0, 'pending works stay hidden');
    expectStatus(await send('GET', `/api/gallery/${work.id}`, bob), 404);
    expectStatus(await send('GET', `/api/gallery/${work.id}/cover`, bob), 404);
    expectStatus(await send('POST', `/api/admin/gallery/${work.id}/review`, alice, { status: 'PUBLIC' }), 403);
    expectStatus(await send('POST', `/api/admin/gallery/${work.id}/review`, admin, { status: 'PUBLIC', note: '' }), 200);

    const listed = expectStatus(await send('GET', '/api/gallery'), 200).items[0];
    assert.equal(listed.id, work.id);
    assert.equal(listed.modelUrl, undefined, 'no model link before unlocking');
    assert.equal((await send('GET', `/api/gallery/${work.id}/cover`)).statusCode, 200);
    expectStatus(await send('GET', `/api/gallery/${work.id}/model`, bob), 402);

    const before = { alice: await balance(alice), bob: await balance(bob) };
    const unlocked = expectStatus(await send('POST', `/api/gallery/${work.id}/unlock`, bob, { purpose: 'DOWNLOAD' }), 200);
    assert.equal(unlocked.charged, 10);
    assert.equal(unlocked.balance, before.bob - 10);
    assert.ok(unlocked.work.modelUrl);
    assert.equal(await balance(alice), before.alice + 5);
    const again = expectStatus(await send('POST', `/api/gallery/${work.id}/unlock`, bob, { purpose: 'REMIX' }), 200);
    assert.equal(again.charged, 0, 'remix after download is already paid');
    assert.equal(await balance(bob), before.bob - 10);
    const file = await send('GET', `/api/gallery/${work.id}/model`, bob);
    assert.equal(file.statusCode, 200);
    assert.equal(file.rawPayload.readUInt32LE(0), 0x46546c67);
    const ledger = expectStatus(await send('GET', '/api/points', alice), 200).ledger;
    assert.equal(ledger[0].reason, 'EARN');

    // A remix records its source and needs the author's permission.
    const remix = expectStatus(await upload(bob, { title: '我的版本', remixOf: work.id }), 200).work;
    assert.equal(remix.remixOf, work.id);
    const closed = expectStatus(await upload(alice, { allowRemix: false, title: '不开放二创' }), 200).work;
    expectStatus(await send('POST', `/api/admin/gallery/${closed.id}/review`, admin, { status: 'PUBLIC' }), 200);
    expectStatus(await send('POST', `/api/gallery/${closed.id}/unlock`, bob, { purpose: 'REMIX' }), 403);
    expectStatus(await upload(bob, { remixOf: closed.id }), 403);
  });

  it('refuses unlocks without points and rejects unsafe or missing gallery files', async () => {
    const [alice, bob, admin] = [await login('alice@example.test'), await login('bob@example.test'), await login(ADMIN)];
    const work = expectStatus(await upload(alice, { price: 50 }), 200).work;
    expectStatus(await send('POST', `/api/admin/gallery/${work.id}/review`, admin, { status: 'PUBLIC' }), 200);
    expectStatus(await send('POST', '/api/points/spend', bob, { item: 'MAGNET', ref: 'craft-1', idempotencyKey: randomUUID() }), 200);
    const denied = await send('POST', `/api/gallery/${work.id}/unlock`, bob, { purpose: 'DOWNLOAD' });
    assert.equal(denied.statusCode, 402);
    assert.equal(await balance(bob), 45, 'a refused unlock changes nothing');
    assert.equal(expectStatus(await send('GET', `/api/gallery/${work.id}`, bob), 200).work.unlocked, false);

    expectStatus(await upload(alice, { price: 51 }), 400);
    expectStatus(await upload(alice, {}, null), 422);
    expectStatus(await upload(alice, {}, Buffer.from('not a model at all, just text')), 422);
    expectStatus(await upload(alice, { kind: 'BEADS' }, null), 422);
    const beads = expectStatus(await upload(alice, { kind: 'BEADS', pattern: pattern(), price: 0 }, null), 200).work;
    expectStatus(await send('POST', `/api/admin/gallery/${beads.id}/review`, admin, { status: 'PUBLIC' }), 200);
    assert.equal(expectStatus(await send('GET', `/api/gallery/${beads.id}`, bob), 200).work.pattern, undefined);
    const free = expectStatus(await send('POST', `/api/gallery/${beads.id}/unlock`, bob, { purpose: 'DOWNLOAD' }), 200);
    assert.equal(free.charged, 0);
    assert.equal(free.work.pattern.width, 8);
    // Withdrawing hides the work from everyone.
    expectStatus(await send('DELETE', `/api/gallery/${work.id}`, bob), 404);
    expectStatus(await send('DELETE', `/api/gallery/${work.id}`, alice), 200);
    expectStatus(await send('GET', `/api/gallery/${work.id}`, bob), 404);
  });

  it('says photo-to-3D is off before charging anything when no provider is set', async () => {
    const alice = await login('alice@example.test');
    assert.equal(expectStatus(await send('GET', '/api/ai-models/config', alice), 200).available, false);
    assert.equal(expectStatus(await send('GET', '/api/config'), 200).ai.meshAvailable, false);
    const form = multipart([{ name: 'idempotencyKey', value: randomUUID() }, { name: 'consent', value: 'true' }, { name: 'image', filename: 'a.png', type: 'image/png', bytes: await pngBytes() }]);
    const response = await send('POST', '/api/ai-models', alice, form.payload, { 'content-type': form.contentType });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'MESH_UNAVAILABLE');
    assert.equal(await balance(alice), 50);
  });

  it('charges 20 points for photo-to-3D, stores the model, and refunds failures once', async () => {
    await restartWithMesh();
    const alice = await login('alice@example.test');
    const create = async (key = randomUUID()) => {
      const form = multipart([{ name: 'idempotencyKey', value: key }, { name: 'consent', value: 'true' }, { name: 'image', filename: 'a.png', type: 'image/png', bytes: await pngBytes() }]);
      return expectStatus(await send('POST', '/api/ai-models', alice, form.payload, { 'content-type': form.contentType }), 200).job;
    };
    const key = randomUUID(), job = await create(key);
    assert.equal(job.status, 'RUNNING');
    assert.equal(await balance(alice), 30);
    assert.equal((await create(key)).id, job.id, 'a retried upload is the same job');
    assert.equal(mesh!.submitted, 1);
    const ready = expectStatus(await send('GET', `/api/ai-models/${job.id}`, alice), 200).job;
    assert.equal(ready.status, 'READY');
    const glb = await send('GET', ready.glbUrl, alice);
    assert.equal(glb.statusCode, 200);
    assert.equal(glb.rawPayload.readUInt32LE(0), 0x46546c67);
    const bob = await login('bob@example.test');
    expectStatus(await send('GET', `/api/ai-models/${job.id}`, bob), 404);
    expectStatus(await send('GET', ready.glbUrl, bob), 404);

    mesh!.next = { state: 'failed', progress: 40, error: 'PROVIDER_FAILED' };
    const failing = await create();
    assert.equal(await balance(alice), 10);
    const failed = expectStatus(await send('GET', `/api/ai-models/${failing.id}`, alice), 200).job;
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.refunded, true);
    expectStatus(await send('GET', `/api/ai-models/${failing.id}`, alice), 200);
    assert.equal(await balance(alice), 30, 'refunded exactly once');

    mesh!.failSubmit = true;
    const rejected = await create();
    assert.equal(rejected.status, 'FAILED');
    assert.equal(await balance(alice), 30);
    mesh!.failSubmit = false;
    await create(); assert.equal(await balance(alice), 10);
    const form = multipart([{ name: 'idempotencyKey', value: randomUUID() }, { name: 'consent', value: 'true' }, { name: 'image', filename: 'a.png', type: 'image/png', bytes: await pngBytes() }]);
    assert.equal((await send('POST', '/api/ai-models', alice, form.payload, { 'content-type': form.contentType })).statusCode, 402);
  });

  it('lays a photo out as coloured clay parts with an OpenAI-compatible vision model', async () => {
    const sent: any[] = [];
    const answer = { title: '小楼', parts: [
      { id: 'body', primitive: 'box', params: { w: 40, h: 30, d: 30 }, position: [0, 15, 0], color: '#D9714A' },
      { id: 'ear_l', primitive: 'sphere', params: { r: 6 }, position: [-12, 34, 0], color: '#123456' },
      { id: 'ear_r', mirrorOf: 'ear_l' }, { id: 'bad', primitive: 'teapot' }, { id: 'ghost', mirrorOf: 'nobody' },
    ] };
    const transport: ProviderTransport = async (url, method, body, headers, _max, timeout) => {
      sent.push({ url: url.href, method, body: JSON.parse(String(body)), auth: headers.Authorization, timeout });
      return { type: 'application/json', bytes: Buffer.from(JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify(answer) + '\n```' } }] })) };
    };
    const config = { ...services.config, meshReady: true, mesh: { ...services.config.mesh, provider: 'openai-layout', apiKey: 'test-key', baseUrl: 'https://vision.example.test/v1', llmHosts: ['vision.example.test'], llmModel: 'vision-model', llmTimeoutMs: 60000 } } as Services['config'];
    const provider = new VisionLayoutProvider(config, transport);
    const remote = await provider.submit({ kind: 'image', images: [await pngBytes()] });
    let state: any = await provider.poll(remote);
    for (let i = 0; state.state === 'running' && i < 20; i++) state = await provider.poll(remote);
    assert.equal(state.state, 'success');
    assert.equal(sent[0].url, 'https://vision.example.test/v1/chat/completions');
    assert.equal(sent[0].body.model, 'vision-model');
    assert.equal(sent[0].auth, 'Bearer test-key');
    assert.match(sent[0].body.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.deepEqual(state.layout.parts.map((p: any) => p.id), ['body', 'ear_l', 'ear_r']);
    assert.equal(state.layout.parts[0].color, '#d9714a');
    assert.equal((await provider.poll(remote)).state, 'failed', 'a result is collected once');
    assert.throws(() => cleanLayout({ parts: [{ primitive: 'teapot' }] }), /LAYOUT_EMPTY/);

    // Through the job API: 20 points, READY with the layout, and a failure refunds.
    await app.close(); await services.db.close(); await rm(dir, { recursive: true, force: true });
    dir = await mkdtemp(join(tmpdir(), 'along-workshop-'));
    services = await createServices(loadConfig({ NODE_ENV: 'test', DEVELOPMENT_LOCAL: 'true', DEV_OTP_DISPLAY: 'true', SESSION_SECRET: 'workshop-only-not-a-production-secret-2026', APP_ORIGINS: ORIGIN, ADMIN_EMAILS: ADMIN, LOCAL_STORAGE_DIR: dir }));
    app = await createApp(services, { meshProvider: new VisionLayoutProvider(config, transport) });
    const alice = await login('alice@example.test');
    const form = multipart([{ name: 'idempotencyKey', value: randomUUID() }, { name: 'consent', value: 'true' }, { name: 'image', filename: 'a.png', type: 'image/png', bytes: await pngBytes() }]);
    const job = expectStatus(await send('POST', '/api/ai-models', alice, form.payload, { 'content-type': form.contentType }), 200).job;
    assert.equal(await balance(alice), 30);
    let ready = job;
    for (let i = 0; ready.status !== 'READY' && i < 10; i++) { await services.db.query('UPDATE ai_model_jobs SET polled_at=0 WHERE id=$1', [job.id]); ready = expectStatus(await send('GET', `/api/ai-models/${job.id}`, alice), 200).job; }
    assert.equal(ready.status, 'READY');
    assert.equal(ready.layout.parts.length, 3);
    assert.equal(ready.glbUrl, undefined);
  });

  it('has a second AI repair the rough layout, and keeps the draft when the refiner fails', async () => {
    const draft = { title: '小猫', parts: [
      { id: 'body', primitive: 'sphere', params: { r: 20 }, position: [0, 20, 0], color: '#d9714a' },
      { id: 'head', primitive: 'sphere', params: { r: 12 }, position: [0, 80, 0] }, // floats, no colour
    ] };
    const refined = { title: '小猫', notes: ['joined head to body', 'added eyes'], parts: [
      { id: 'body', primitive: 'sphere', params: { r: 22 }, position: [0, 22, 0], color: '#d9714a' },
      { id: 'head', primitive: 'sphere', params: { r: 15 }, position: [0, 52, 0], color: '#e08a5a', blend: 4 },
      { id: 'ear_l', primitive: 'cone', params: { r1: 5, r2: 0, h: 10 }, position: [-8, 68, 0], color: '#c0603a' }, { id: 'ear_r', mirrorOf: 'ear_l' },
      { id: 'eye_l', primitive: 'sphere', params: { r: 2.4 }, position: [-5, 55, 13], color: '#1b1813' }, { id: 'eye_r', mirrorOf: 'eye_l' },
      { id: 'tail', primitive: 'capsule', params: { r: 3, h: 30 }, position: [0, 18, -24], rotation: [60, 0, 0], color: '#c0603a' },
    ] };
    const issues = checkLayout(cleanLayout(draft));
    assert.ok(issues.some((i) => i.includes('"head" floats')), issues.join('; '));
    assert.ok(issues.some((i) => i.includes('without a colour')));
    assert.equal(checkLayout(cleanLayout(refined)).length, 0, checkLayout(cleanLayout(refined)).join('; '));

    const sent: any[] = [];
    let refinerDown = false;
    const transport: ProviderTransport = async (url, _m, body) => {
      const request = JSON.parse(String(body)); sent.push({ host: url.hostname, ...request });
      if (request.model === 'refine-model' && refinerDown) throw new Error('PROVIDER_TIMEOUT');
      const answer = request.model === 'refine-model' ? refined : draft;
      return { type: 'application/json', bytes: Buffer.from(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] })) };
    };
    const mesh = { ...services.config.mesh, provider: 'openai-layout', apiKey: 'draft-key', baseUrl: 'https://vision.example.test/v1', llmHosts: ['vision.example.test'], llmModel: 'draft-model', llmTimeoutMs: 60000,
      refine: { model: 'refine-model', baseUrl: 'https://refine.example.test/v1', hosts: ['refine.example.test'], apiKey: 'refine-key', rounds: 2 } };
    const config = { ...services.config, meshReady: true, mesh } as unknown as Services['config'];
    const provider = new VisionLayoutProvider(config, transport);
    assert.equal(provider.name, 'layout+refine');
    const settle = async (id: string) => { let s: any = await provider.poll(id); for (let i = 0; s.state === 'running' && i < 40; i++) s = await provider.poll(id); return s; };

    // Text input: no image is sent, the description is.
    const state = await settle(await provider.submit({ kind: 'text', images: [], prompt: '一只橘猫' }));
    assert.equal(state.state, 'success');
    assert.deepEqual(sent.map((r) => r.model), ['draft-model', 'refine-model'], 'the refiner stops once the checks pass');
    assert.equal(sent[1].host, 'refine.example.test');
    assert.match(sent[0].messages[1].content[0].text, /一只橘猫/);
    assert.equal(sent[0].messages[1].content.length, 1);
    assert.match(sent[1].messages[1].content[0].text, /head\\" floats free/, 'the refiner is told what the checks found');
    assert.equal(state.layout.parts.length, 7);
    assert.equal(state.layout.rounds, 1);
    assert.deepEqual(state.layout.notes, ['joined head to body', 'added eyes']);
    assert.equal(state.layout.parts.find((p: any) => p.id === 'head').blend, 4);

    // Video frames go to both AIs; a refiner outage still delivers the draft.
    sent.length = 0; refinerDown = true;
    const frames = [await pngBytes(), await pngBytes(), await pngBytes()];
    const fallback = await settle(await provider.submit({ kind: 'video', images: frames }));
    assert.equal(fallback.state, 'success');
    assert.equal(fallback.layout.parts.length, 2);
    assert.equal(fallback.layout.rounds, 0);
    assert.equal(sent[0].messages[1].content.filter((c: any) => c.type === 'image_url').length, 3);
    assert.match(sent[0].messages[1].content[0].text, /3 frames/);
  });

  it('accepts video frames and text descriptions through the job API', async () => {
    const transport: ProviderTransport = async () => ({ type: 'application/json', bytes: Buffer.from(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: 't', parts: [{ id: 'body', primitive: 'box', params: { w: 30, h: 60, d: 30 }, position: [0, 30, 0], color: '#aa5533' }] }) } }] })) });
    const config = { ...services.config, meshReady: true, mesh: { ...services.config.mesh, provider: 'openai-layout', apiKey: 'k', baseUrl: 'https://vision.example.test/v1', llmHosts: ['vision.example.test'], llmModel: 'm', llmTimeoutMs: 60000, refine: null } } as unknown as Services['config'];
    await app.close();
    app = await createApp(services, { meshProvider: new VisionLayoutProvider(config, transport) });
    const alice = await login('alice@example.test');
    const post = (parts: any[]) => { const form = multipart([{ name: 'idempotencyKey', value: randomUUID() }, { name: 'consent', value: 'true' }, ...parts]); return send('POST', '/api/ai-models', alice, form.payload, { 'content-type': form.contentType }); };
    assert.deepEqual(expectStatus(await send('GET', '/api/ai-models/config', alice), 200).kinds, ['image', 'video', 'text']);
    const text = expectStatus(await post([{ name: 'kind', value: 'text' }, { name: 'prompt', value: '一座红色的小灯塔' }]), 200).job;
    assert.equal(text.kind, 'text');
    const png = await pngBytes();
    const video = expectStatus(await post([{ name: 'kind', value: 'video' }, { name: 'frame0', filename: 'a.png', type: 'image/png', bytes: png }, { name: 'frame1', filename: 'b.png', type: 'image/png', bytes: png }]), 200).job;
    assert.equal(video.kind, 'video');
    assert.equal((await post([{ name: 'kind', value: 'text' }])).statusCode, 400, 'text needs a description');
    assert.equal((await post([{ name: 'kind', value: 'video' }, { name: 'frame0', filename: 'a.png', type: 'image/png', bytes: png }])).statusCode, 400, 'video needs two frames');
    assert.equal(await balance(alice), 10, 'only the two valid jobs were charged');
  });

  it('offers the two-AI relay (20 points) and Tripo (40 points), charging and refunding by the chosen engine', async () => {
    const relayMesh = new FakeMesh('layout+refine'), tripoMesh = new FakeMesh('tripo');
    await app.close();
    app = await createApp(services, { meshEngines: { relay: relayMesh, tripo: tripoMesh } });
    const alice = await login('alice@example.test');
    await topup(alice);
    const start = await balance(alice), png = await pngBytes();
    const config = expectStatus(await send('GET', '/api/ai-models/config', alice), 200);
    assert.deepEqual(config.engines.map((e: any) => [e.id, e.available, e.cost]), [['relay', true, 20], ['tripo', true, 40]]);
    const post = (engine?: string) => {
      const form = multipart([{ name: 'idempotencyKey', value: randomUUID() }, { name: 'consent', value: 'true' }, ...(engine ? [{ name: 'engine', value: engine }] : []), { name: 'image', filename: 'a.png', type: 'image/png', bytes: png }]);
      return send('POST', '/api/ai-models', alice, form.payload, { 'content-type': form.contentType });
    };
    const viaTripo = expectStatus(await post('tripo'), 200).job;
    assert.equal(viaTripo.engine, 'tripo');
    assert.equal(viaTripo.cost, 40);
    assert.equal(tripoMesh.submitted, 1);
    assert.equal(await balance(alice), start - 40);
    const viaRelay = expectStatus(await post(), 200).job;
    assert.equal(viaRelay.engine, 'relay', 'no engine means the cheaper relay');
    assert.equal(viaRelay.cost, 20);
    assert.equal(relayMesh.submitted, 1);
    assert.equal(await balance(alice), start - 60);
    expectStatus(await post('meshy'), 400);
    // A failed Tripo job returns its own 40 points, booked under the Tripo item.
    tripoMesh.next = { state: 'failed', progress: 10, error: 'PROVIDER_FAILED' };
    const failing = expectStatus(await post('tripo'), 200).job;
    assert.equal(expectStatus(await send('GET', `/api/ai-models/${failing.id}`, alice), 200).job.refunded, true);
    assert.equal(await balance(alice), start - 60);
    const ledger = expectStatus(await send('GET', '/api/points', alice), 200).ledger as any[];
    assert.ok(ledger.some((row) => row.item === 'AI_MODEL_TRIPO' && row.reason === 'REFUND' && row.delta === 40));
    // Tripo switched off: asking for it charges nothing.
    await app.close();
    app = await createApp(services, { meshEngines: { relay: relayMesh, tripo: null } });
    const before = await balance(alice);
    assert.equal((await post('tripo')).statusCode, 503);
    assert.equal(await balance(alice), before);
  });

  it('keeps a coloured clay recipe with a gallery work and opens it only after unlocking', async () => {
    const [alice, bob, admin] = [await login('alice@example.test'), await login('bob@example.test'), await login(ADMIN)];
    const recipe = { parts: [{ id: 'body', primitive: 'sphere', params: { r: 20 }, position: [0, 20, 0], color: '#e85d75' }, { id: 'hat', primitive: 'cone', params: { r1: 12, r2: 0, h: 18 }, position: [0, 46, 0], color: '#3d7fc6' }] };
    const work = expectStatus(await upload(alice, { recipe }), 200).work;
    expectStatus(await send('POST', `/api/admin/gallery/${work.id}/review`, admin, { status: 'PUBLIC' }), 200);
    const locked = expectStatus(await send('GET', `/api/gallery/${work.id}`, bob), 200).work;
    assert.equal(locked.hasRecipe, true);
    assert.equal(locked.recipe, undefined);
    const open = expectStatus(await send('POST', `/api/gallery/${work.id}/unlock`, bob, { purpose: 'REMIX' }), 200).work;
    assert.equal(open.recipe.parts[1].color, '#3d7fc6');
    expectStatus(await upload(alice, { kind: 'MAGNET', recipe }), 422);
    expectStatus(await upload(alice, { recipe: { parts: [{ id: 'x', primitive: 'box', params: {}, position: [0, 0, 0], color: 'red' }] } }), 400);
  });

  it('speaks the Tripo v3 protocol through the pinned transport and only downloads from allowed hosts', async () => {
    const calls: string[] = [], bodies: any[] = [];
    const transport: ProviderTransport = async (url, method, body, headers) => {
      calls.push(`${method} ${url.href}`);
      assert.match(headers.Authorization || 'none', /^Bearer test-key$|^none$/);
      const ok = (data: unknown) => ({ type: 'application/json', bytes: Buffer.from(JSON.stringify({ code: 0, data })) });
      if (url.pathname.endsWith('/files')) { assert.match(String(body), /seed\.jpg/); return ok({ file_token: 'file_tok' }); }
      if (url.pathname.endsWith('/image-to-model') || url.pathname.endsWith('/text-to-model')) { bodies.push(JSON.parse(String(body))); return ok({ task_id: 't1' }); }
      if (url.pathname.endsWith('/tasks/t1')) return ok({ status: 'success', progress: 100, output: { model_url: 'https://cdn.example.test/out.glb' } });
      if (url.pathname.endsWith('/tasks/t2')) return ok({ status: 'unknown', progress: 30 });
      return { type: 'model/gltf-binary', bytes: tetraGlb() };
    };
    const tripoConfig = { apiKey: 'test-key', baseUrl: 'https://openapi.tripo3d.com/v3', model: 'v3.1-20260211', resultHosts: ['cdn.example.test'] };
    const config = { ...services.config, meshReady: true, mesh: { ...services.config.mesh, tripo: tripoConfig } } as unknown as Services['config'];
    const tripo = new TripoProvider(config, transport);
    assert.equal(await tripo.submit({ kind: 'image', images: [await pngBytes()] }), 't1');
    assert.deepEqual(bodies[0], { model: 'v3.1-20260211', texture: true, pbr: false, texture_quality: 'standard', face_limit: 40000, input: 'file_tok' });
    const state = await tripo.poll('t1');
    assert.equal(state.state, 'success');
    assert.equal((await tripo.download(state.url!)).readUInt32LE(0), 0x46546c67);
    await assert.rejects(() => tripo.download('https://evil.example.test/out.glb'), /PROVIDER_HOST_FORBIDDEN/);
    assert.deepEqual(calls.slice(0, 3), ['POST https://openapi.tripo3d.com/v3/files', 'POST https://openapi.tripo3d.com/v3/generation/image-to-model', 'GET https://openapi.tripo3d.com/v3/tasks/t1']);
    // Words go straight to text-to-model; "unknown" keeps waiting instead of failing.
    calls.length = 0;
    await tripo.submit({ kind: 'text', images: [], prompt: '一只橘猫' });
    assert.deepEqual(calls, ['POST https://openapi.tripo3d.com/v3/generation/text-to-model']);
    assert.equal(bodies[1].prompt, '一只橘猫');
    assert.equal((await tripo.poll('t2')).state, 'running');
    assert.throws(() => checkGlb(Buffer.from('glTF but not really a model file')), /MODEL_NOT_GLB/);
  });
});
