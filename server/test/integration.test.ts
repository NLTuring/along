// Isolated API integration tests. Never listen on a socket, read .env, send mail,
// call providers or run video workers. Every test gets a fresh pg-mem database
// and a new temporary private-storage directory containing only synthetic data.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createServices } from '../src/runtime.js';
import { digest, type Services, type User } from '../src/core.js';

const ORIGIN = 'http://localhost:4175';
const ADMIN = 'integration-admin@example.test';
type Session = { cookie: string; csrfToken: string; user: User };
type Part = { name: string; value: string } | { name: string; filename: string; type: string; bytes: Buffer };

function multipart(parts: Part[]) {
  const boundary = `along-test-${randomUUID()}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const file = 'bytes' in part;
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${file ? `; filename="${part.filename}"` : ''}\r\n${file ? `Content-Type: ${part.type}\r\n` : ''}\r\n`));
    chunks.push(file ? part.bytes : Buffer.from(part.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
function expectStatus(response: LightMyRequestResponse, status: number) {
  assert.equal(response.statusCode, status, `HTTP ${response.statusCode}, expected ${status}: ${response.body}`);
  return response;
}
function expectError(response: LightMyRequestResponse, status: number, code: string) {
  expectStatus(response, status);
  assert.equal(response.json().error?.code, code);
}
const postBody = (overrides: Record<string, unknown> = {}) => ({ title: 'Synthetic riverside story', body: 'Only synthetic integration-test text.', city: 'Fixture City', tags: ['fixture', 'walk'], poiId: null, mediaIds: [], status: 'PENDING', ...overrides });
const shipping = () => ({ name: 'Synthetic Recipient', phone: '+86 10000000000', region: 'Fixture Region', address: 'Synthetic address, not a real delivery destination', postalCode: '000000' });
const inquiryBody = (modelId: string, overrides: Record<string, unknown> = {}) => ({ modelId, quantity: 2, material: 'PLA', colorProcess: 'SINGLE', notes: 'Private synthetic note', shipping: shipping(), consent: true, idempotencyKey: randomUUID(), ...overrides });
const metadata = (localCraftId = 'fixture-craft', inputVersion = 'input-1') => ({ localCraftId, inputVersion, variant: 'REAL', product: 'MAGNET', shape: 'RECTANGLE', widthMm: 40, heightMm: 40, baseMm: 2, reliefMm: 1, maskSource: 'MANUAL', consent: true });

// The allowed local services use real route/auth/storage code with no external credentials.
describe('isolated Fastify API authorization and immutable ownership', { concurrency: false }, () => {
  let services: Services;
  let app: Awaited<ReturnType<typeof createApp>>;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'along-api-integration-'));
    const config = loadConfig({
      NODE_ENV: 'test', DEVELOPMENT_LOCAL: 'true', DEV_OTP_DISPLAY: 'true',
      SESSION_SECRET: 'integration-only-not-a-production-secret-2026',
      APP_ORIGINS: ORIGIN, ADMIN_EMAILS: ADMIN, HOST: '127.0.0.1',
      LOCAL_STORAGE_DIR: storageDir,
    });
    services = await createServices(config);
    app = await createApp(services);
  });
  afterEach(async () => {
    try { await app?.close(); }
    finally {
      try { await services?.tasks.close?.(); }
      finally { try { await services?.db.close(); } finally { if (storageDir) await rm(storageDir, { recursive: true, force: true }); } }
    }
  });

  function send(method: InjectOptions['method'], url: string, session?: Session, payload?: InjectOptions['payload'], extraHeaders: Record<string, string> = {}) {
    return app.inject({ method, url, payload, headers: { origin: ORIGIN, ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrfToken } : {}), ...extraHeaders } });
  }
  async function issueCode(email: string) {
    const response = expectStatus(await send('POST', '/api/auth/otp', undefined, { email }), 200);
    assert.equal(response.json().ok, true);
    assert.match(response.json().code, /^\d{6}$/);
    return String(response.json().code);
  }
  async function login(email = 'alice@example.test'): Promise<Session> {
    const code = await issueCode(email);
    const response = expectStatus(await send('POST', '/api/auth/verify', undefined, { email, code }), 200);
    const value = response.json();
    assert.equal(value.ok, true);
    const cookies = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : cookies;
    assert.ok(cookieHeader);
    return { cookie: cookieHeader.split(';')[0], csrfToken: value.csrfToken, user: value.user };
  }
  async function accounts() {
    return { alice: await login(), bob: await login('bob@example.test'), admin: await login(ADMIN) };
  }
  async function createPost(session: Session, overrides: Record<string, unknown> = {}) {
    return expectStatus(await send('POST', '/api/posts', session, postBody(overrides)), 200).json().post;
  }
  async function review(session: Session, id: string, status = 'PUBLIC') {
    return expectStatus(await send('POST', `/api/admin/posts/${id}/review`, session, { status, note: 'Synthetic moderation decision' }), 200).json().post;
  }
  async function imageUpload(session: Session, purpose = 'COMMUNITY') {
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 90, g: 130, b: 170 } } }).png().toBuffer();
    const form = multipart([{ name: 'purpose', value: purpose }, { name: 'consent', value: 'true' }, { name: 'file', filename: 'synthetic.png', type: 'image/png', bytes }]);
    const response = expectStatus(await send('POST', '/api/media', session, form.payload, { 'content-type': form.contentType }), 200);
    assert.equal(response.json().media.status, 'READY');
    return response.json().media;
  }
  // Seed immutable model rows only for downstream access/ownership tests, not to claim
  // geometry validation passed. Invalid artifact uploads are exercised separately below.
  async function seedModel(session: Session, version = 1, localCraftId = 'fixture-craft') {
    const id = randomUUID(), glb = Buffer.from('synthetic-private-glb-fixture'), stl = Buffer.from('synthetic-private-stl-fixture');
    const glbKey = `models/${randomUUID()}.glb`, stlKey = `models/${randomUUID()}.stl`;
    await services.storage.put(glbKey, glb, 'model/gltf-binary');
    await services.storage.put(stlKey, stl, 'model/stl');
    await services.db.query('INSERT INTO craft_models(id,owner_id,local_craft_id,version,input_version,glb_key,stl_key,glb_size,stl_size,glb_sha256,stl_sha256,metadata,validation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [id, session.user.id, localCraftId, version, `input-${version}`, glbKey, stlKey, glb.length, stl.length, createHash('sha256').update(glb).digest('hex'), createHash('sha256').update(stl).digest('hex'), JSON.stringify(metadata(localCraftId, `input-${version}`)), JSON.stringify({ syntheticOwnershipFixture: true })]);
    return { id, version, glb, stl };
  }
  async function createInquiry(session: Session, modelId: string, overrides: Record<string, unknown> = {}) {
    return expectStatus(await send('POST', '/api/inquiries', session, inquiryBody(modelId, overrides)), 200).json().inquiry;
  }

  it('rejects missing and foreign Origin before issuing OTP or accepting writes', async () => {
    expectError(await app.inject({ method: 'POST', url: '/api/auth/otp', payload: { email: 'a@example.test' } }), 403, 'ORIGIN_FORBIDDEN');
    expectError(await send('POST', '/api/auth/otp', undefined, { email: 'a@example.test' }, { origin: 'https://foreign.example.test' }), 403, 'ORIGIN_FORBIDDEN');
    expectError(await send('POST', '/api/posts', undefined, postBody(), { origin: 'null' }), 403, 'ORIGIN_FORBIDDEN');
    assert.equal(Number((await services.db.one('SELECT count(*) AS n FROM otp_challenges'))!.n), 0);
  });

  it('rejects OTP verification without a challenge and malformed or role-injecting input', async () => {
    const expired = expectStatus(await send('POST', '/api/auth/verify', undefined, { email: 'absent@example.test', code: '123456' }), 400);
    assert.equal(expired.json().error, 'EXPIRED');
    assert.equal(expired.headers['set-cookie'], undefined);
    expectError(await send('POST', '/api/auth/otp', undefined, { email: 'not-email' }), 400, 'INVALID_REQUEST');
    expectError(await send('POST', '/api/auth/otp', undefined, { email: 'alice@example.test', role: 'ADMIN' }), 400, 'INVALID_REQUEST');
    expectError(await send('POST', '/api/auth/verify', undefined, { email: 'alice@example.test', code: '123456', role: 'ADMIN' }), 400, 'INVALID_REQUEST');
  });

  it('limits OTP retries and rejects the correct code after lockout', async () => {
    const email = 'locked@example.test', correct = await issueCode(email), wrong = correct === '111111' ? '222222' : '111111';
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = expectStatus(await send('POST', '/api/auth/verify', undefined, { email, code: wrong }), attempt === 5 ? 429 : 400);
      assert.equal(response.json().error, attempt === 5 ? 'LOCKED' : 'WRONG');
      assert.equal(response.json().triesLeft, 5 - attempt);
      assert.equal(response.headers['set-cookie'], undefined);
    }
    assert.equal(expectStatus(await send('POST', '/api/auth/verify', undefined, { email, code: correct }), 429).json().error, 'LOCKED');
    assert.equal(expectStatus(await send('POST', '/api/auth/otp', undefined, { email }), 429).json().error, 'LOCKED');
    assert.equal(Number((await services.db.one('SELECT count(*) AS n FROM sessions'))!.n), 0);
  });

  it('enforces OTP resend cooldown and expiry without setting a session', async () => {
    const email = 'expiry@example.test', code = await issueCode(email);
    assert.equal(expectStatus(await send('POST', '/api/auth/otp', undefined, { email }), 429).json().error, 'RATE_LIMITED');
    await services.db.query('UPDATE otp_challenges SET expires_at=$2 WHERE email_hash=$1', [digest(services.config.secret, email), Date.now() - 1]);
    const response = expectStatus(await send('POST', '/api/auth/verify', undefined, { email, code }), 400);
    assert.equal(response.json().error, 'EXPIRED'); assert.equal(response.headers['set-cookie'], undefined);
  });

  it('creates an HttpOnly same-site session, consumes the OTP and rejects cookie forgery', async () => {
    const email = 'session@example.test', code = await issueCode(email);
    const verified = expectStatus(await send('POST', '/api/auth/verify', undefined, { email, code }), 200);
    const cookie = String(verified.headers['set-cookie']);
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i); assert.match(cookie, /Path=\//);
    const response = expectStatus(await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: cookie.split(';')[0] } }), 200);
    assert.equal(response.json().user.email, email); assert.equal(response.json().user.role, 'USER');
    assert.equal(response.json().csrfToken, verified.json().csrfToken); assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(expectStatus(await send('POST', '/api/auth/verify', undefined, { email, code }), 400).json().error, 'EXPIRED');
    const forged = expectStatus(await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: `along_session=${'x'.repeat(43)}` } }), 200).json();
    assert.equal(forged.user, null); assert.equal(forged.csrfToken, undefined);
  });

  it('rejects missing, wrong and another account CSRF tokens without mutating posts', async () => {
    const alice = await login(), bob = await login('bob@example.test');
    expectError(await app.inject({ method: 'POST', url: '/api/posts', headers: { origin: ORIGIN, cookie: alice.cookie }, payload: postBody() }), 403, 'CSRF_INVALID');
    for (const token of ['not-a-token', bob.csrfToken]) expectError(await send('POST', '/api/posts', alice, postBody(), { 'x-csrf-token': token }), 403, 'CSRF_INVALID');
    expectError(await send('POST', '/api/posts', alice, postBody(), { origin: 'https://foreign.example.test' }), 403, 'ORIGIN_FORBIDDEN');
    assert.deepEqual(expectStatus(await send('GET', '/api/posts?mine=1', alice), 200).json().items, []);
    assert.equal((await createPost(alice)).status, 'PENDING');
  });

  it('invalidates a logged-out cookie and rejects further authenticated writes', async () => {
    const alice = await login();
    expectStatus(await send('POST', '/api/auth/logout', alice), 200);
    assert.equal(expectStatus(await send('GET', '/api/auth/session', alice), 200).json().user, null);
    expectError(await send('POST', '/api/posts', alice, postBody()), 401, 'UNAUTHENTICATED');
    expectError(await send('GET', '/api/inquiries', alice), 401, 'UNAUTHENTICATED');
  });

  it('guards every admin collection and rejects user moderation even with valid CSRF', async () => {
    const { alice, admin } = await accounts();
    for (const path of ['/api/admin/posts', '/api/admin/comments', '/api/admin/reports', '/api/admin/inquiries']) {
      expectError(await send('GET', path), 401, 'UNAUTHENTICATED');
      expectError(await send('GET', path, alice), 403, 'FORBIDDEN');
      expectStatus(await send('GET', path, admin), 200);
    }
    const post = await createPost(alice);
    expectError(await send('POST', `/api/admin/posts/${post.id}/review`, alice, { status: 'PUBLIC', note: '' }), 403, 'FORBIDDEN');
    assert.equal(expectStatus(await send('GET', `/api/posts/${post.id}`, alice), 200).json().post.status, 'PENDING');
  });

  it('keeps drafts/pending posts owner-only and refuses a client-supplied PUBLIC status', async () => {
    const { alice, bob, admin } = await accounts();
    const pending = await createPost(alice), draft = await createPost(alice, { status: 'DRAFT' });
    expectError(await send('POST', '/api/posts', alice, postBody({ status: 'PUBLIC' })), 400, 'INVALID_REQUEST');
    expectError(await send('POST', '/api/posts', alice, postBody({ ownerId: bob.user.id })), 400, 'INVALID_REQUEST');
    for (const id of [pending.id, draft.id]) {
      expectError(await send('GET', `/api/posts/${id}`), 404, 'NOT_FOUND');
      expectError(await send('GET', `/api/posts/${id}`, bob), 404, 'NOT_FOUND');
      expectStatus(await send('GET', `/api/posts/${id}`, alice), 200);
      expectStatus(await send('GET', `/api/posts/${id}`, admin), 200);
    }
    assert.deepEqual(expectStatus(await send('GET', '/api/posts'), 200).json().items, []);
    assert.deepEqual(expectStatus(await send('GET', '/api/posts?mine=1', bob), 200).json().items, []);
    assert.equal(expectStatus(await send('GET', '/api/posts?mine=1', alice), 200).json().items.length, 2);
    expectError(await send('GET', '/api/posts?mine=1'), 401, 'UNAUTHENTICATED');
    expectError(await send('POST', `/api/admin/posts/${draft.id}/review`, admin, { status: 'PUBLIC' }), 409, 'DRAFT_NOT_SUBMITTED');
  });

  it('only publishes after admin review; owner edits revoke visibility and other users cannot edit/delete', async () => {
    const { alice, bob, admin } = await accounts(); const post = await createPost(alice);
    expectError(await send('PATCH', `/api/posts/${post.id}`, bob, { title: 'Hijacked' }), 404, 'NOT_FOUND');
    expectError(await send('DELETE', `/api/posts/${post.id}`, bob), 404, 'NOT_FOUND');
    expectError(await send('PUT', `/api/posts/${post.id}/like`, alice, { active: true }), 409, 'POST_NOT_PUBLIC');
    await review(admin, post.id);
    assert.equal(expectStatus(await send('GET', `/api/posts/${post.id}`, bob), 200).json().post.status, 'PUBLIC');
    const feed = expectStatus(await send('GET', '/api/posts?city=Fixture%20City&tag=fixture&q=riverside'), 200).json();
    assert.deepEqual(feed.items.map((item: { id: string }) => item.id), [post.id]);
    assert.equal(feed.items[0].reviewNote, undefined);
    assert.deepEqual(expectStatus(await send('GET', '/api/posts?city=Different'), 200).json().items, []);
    expectError(await send('GET', '/api/posts?cursor=not-a-cursor'), 400, 'INVALID_CURSOR');
    assert.equal(expectStatus(await send('PATCH', `/api/posts/${post.id}`, alice, { title: 'Edited title' }), 200).json().post.status, 'PENDING');
    expectError(await send('GET', `/api/posts/${post.id}`, bob), 404, 'NOT_FOUND');
    assert.deepEqual(expectStatus(await send('GET', '/api/posts'), 200).json().items, []);
  });

  it('stores idempotent per-account reactions and does not copy private saved state to others', async () => {
    const { alice, bob, admin } = await accounts(); const post = await createPost(alice); await review(admin, post.id);
    expectError(await send('PUT', `/api/posts/${post.id}/like`, undefined, { active: true }), 401, 'UNAUTHENTICATED');
    for (let n = 0; n < 2; n++) assert.equal(expectStatus(await send('PUT', `/api/posts/${post.id}/like`, bob, { active: true }), 200).json().likeCount, 1);
    expectStatus(await send('PUT', `/api/posts/${post.id}/save`, bob, { active: true }), 200);
    const mine = expectStatus(await send('GET', `/api/posts/${post.id}`, bob), 200).json().post;
    const other = expectStatus(await send('GET', `/api/posts/${post.id}`, alice), 200).json().post;
    assert.equal(mine.liked, true); assert.equal(mine.saved, true); assert.equal(other.liked, false); assert.equal(other.saved, false);
    assert.equal(expectStatus(await send('PUT', `/api/posts/${post.id}/like`, bob, { active: false }), 200).json().likeCount, 0);
  });

  it('moderates comments and rejects reports targeting another account private comment', async () => {
    const { alice, bob, admin } = await accounts(); const post = await createPost(alice); await review(admin, post.id);
    const comment = expectStatus(await send('POST', `/api/posts/${post.id}/comments`, bob, { body: 'Synthetic comment' }), 200).json().comment;
    assert.equal(comment.status, 'PENDING');
    assert.equal(expectStatus(await send('GET', `/api/posts/${post.id}/comments`, bob), 200).json().items.length, 1);
    for (const session of [undefined, alice]) assert.deepEqual(expectStatus(await send('GET', `/api/posts/${post.id}/comments`, session), 200).json().items, []);
    expectError(await send('POST', '/api/reports', alice, { targetType: 'COMMENT', targetId: comment.id, reason: 'Private target attempt' }), 404, 'NOT_FOUND');
    expectError(await send('POST', `/api/admin/comments/${comment.id}/review`, bob, { status: 'PUBLIC' }), 403, 'FORBIDDEN');
    expectStatus(await send('POST', `/api/admin/comments/${comment.id}/review`, admin, { status: 'PUBLIC' }), 200);
    assert.equal(expectStatus(await send('GET', `/api/posts/${post.id}/comments`), 200).json().items[0].id, comment.id);
    expectStatus(await send('POST', '/api/reports', alice, { targetType: 'COMMENT', targetId: comment.id, reason: 'Synthetic report' }), 200);
    const report = expectStatus(await send('GET', '/api/admin/reports', admin), 200).json().items[0];
    expectError(await send('POST', `/api/admin/reports/${report.id}/resolve`, bob, { note: 'Forbidden' }), 403, 'FORBIDDEN');
    expectStatus(await send('POST', `/api/admin/reports/${report.id}/resolve`, admin, { note: 'Synthetic decision' }), 200);
    assert.equal(expectStatus(await send('GET', '/api/admin/reports', admin), 200).json().items[0].resolved, true);
  });

  it('protects real synthetic image bytes until review and revokes public access on hide', async () => {
    const { alice, bob, admin } = await accounts(); const media = await imageUpload(alice);
    assert.equal(media.kind, 'IMAGE'); assert.equal(media.width, 4);
    for (const path of [`/api/media/${media.id}`, media.url]) {
      for (const session of [undefined, bob]) expectError(await send('GET', path, session), 404, 'NOT_FOUND');
      for (const session of [alice, admin]) expectStatus(await send('GET', path, session), 200);
    }
    const post = await createPost(alice, { mediaIds: [media.id] });
    expectError(await send('GET', media.url, bob), 404, 'NOT_FOUND');
    await review(admin, post.id);
    const publicFile = expectStatus(await send('GET', media.url), 200);
    assert.match(String(publicFile.headers['content-type']), /^image\/png/);
    assert.equal(publicFile.headers['cache-control'], 'private, no-store');
    assert.equal(publicFile.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(publicFile.rawPayload.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const range = expectStatus(await send('GET', media.url, undefined, undefined, { range: 'bytes=0-7' }), 206);
    assert.equal(range.rawPayload.length, 8);
    expectStatus(await send('GET', media.url, undefined, undefined, { range: 'bytes=999999-' }), 416);
    await review(admin, post.id, 'HIDDEN');
    expectError(await send('GET', media.url, bob), 404, 'NOT_FOUND');
    expectError(await send('GET', `/api/media/${media.id}`), 404, 'NOT_FOUND');
    expectStatus(await send('GET', media.url, alice), 200);
  });

  it('rejects stolen, craft-only, unready and duplicate attachments without orphan posts', async () => {
    const { alice, bob } = await accounts(); const owned = await imageUpload(alice), craft = await imageUpload(alice, 'CRAFT');
    const initial = Number((await services.db.one('SELECT count(*) AS n FROM posts'))!.n);
    expectError(await send('POST', '/api/posts', bob, postBody({ mediaIds: [owned.id] })), 422, 'MEDIA_NOT_OWNED_OR_READY');
    expectError(await send('POST', '/api/posts', alice, postBody({ mediaIds: [craft.id] })), 422, 'MEDIA_NOT_OWNED_OR_READY');
    expectError(await send('POST', '/api/posts', alice, postBody({ mediaIds: [owned.id, owned.id] })), 422, 'DUPLICATE_MEDIA');
    await services.db.query("UPDATE media SET status='PROCESSING' WHERE id=$1", [owned.id]);
    expectError(await send('POST', '/api/posts', alice, postBody({ mediaIds: [owned.id] })), 422, 'MEDIA_NOT_OWNED_OR_READY');
    expectError(await send('GET', owned.url, alice), 409, 'MEDIA_NOT_READY');
    assert.equal(Number((await services.db.one('SELECT count(*) AS n FROM posts'))!.n), initial);
  });

  it('rejects missing consent, spoofed bytes, empty files and non-multipart uploads', async () => {
    const alice = await login();
    expectError(await send('POST', '/api/media', alice, { file: 'not-multipart' }), 415, 'MULTIPART_REQUIRED');
    const bytes = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#aabbcc' } }).png().toBuffer();
    const noConsent = multipart([{ name: 'purpose', value: 'COMMUNITY' }, { name: 'consent', value: 'false' }, { name: 'file', filename: 'fake.png', type: 'image/png', bytes }]);
    expectError(await send('POST', '/api/media', alice, noConsent.payload, { 'content-type': noConsent.contentType }), 400, 'INVALID_REQUEST');
    const spoof = multipart([{ name: 'purpose', value: 'COMMUNITY' }, { name: 'consent', value: 'true' }, { name: 'file', filename: 'fake.png', type: 'image/png', bytes: Buffer.from('This is text, not a PNG image.') }]);
    expectError(await send('POST', '/api/media', alice, spoof.payload, { 'content-type': spoof.contentType }), 415, 'UNSUPPORTED_MEDIA');
    const empty = multipart([{ name: 'purpose', value: 'COMMUNITY' }, { name: 'consent', value: 'true' }, { name: 'file', filename: 'empty.png', type: 'image/png', bytes: Buffer.alloc(0) }]);
    expectError(await send('POST', '/api/media', alice, empty.payload, { 'content-type': empty.contentType }), 413, 'FILE_TOO_LARGE_OR_EMPTY');
    assert.equal(Number((await services.db.one('SELECT count(*) AS n FROM media'))!.n), 0);
    assert.deepEqual(await readdir(storageDir), []);
  });

  it('rejects invalid image dimensions and oversized multipart bytes before persistence', async () => {
    const alice = await login();
    const tiny = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const form = multipart([{ name: 'purpose', value: 'COMMUNITY' }, { name: 'consent', value: 'true' }, { name: 'file', filename: 'one-pixel.png', type: 'image/png', bytes: tiny }]);
    expectError(await send('POST', '/api/media', alice, form.payload, { 'content-type': form.contentType }), 422, 'INVALID_IMAGE');
    // A separate test-owned app gets a small limit; do not mutate production config.
    const limitedApp = await createApp({ ...services, config: { ...services.config, limits: { ...services.config.limits, videoBytes: 32 } } });
    try {
      const tooLarge = multipart([{ name: 'purpose', value: 'COMMUNITY' }, { name: 'consent', value: 'true' }, { name: 'file', filename: 'large.bin', type: 'image/png', bytes: Buffer.alloc(128, 1) }]);
      expectError(await limitedApp.inject({ method: 'POST', url: '/api/media', payload: tooLarge.payload, headers: { origin: ORIGIN, cookie: alice.cookie, 'x-csrf-token': alice.csrfToken, 'content-type': tooLarge.contentType } }), 413, 'PAYLOAD_TOO_LARGE');
    } finally { await limitedApp.close(); }
    assert.equal(Number((await services.db.one('SELECT count(*) AS n FROM media'))!.n), 0);
  });

  it('rejects malformed GLB/STL artifacts through the upload API without creating a model', async () => {
    const alice = await login();
    const form = multipart([{ name: 'metadata', value: JSON.stringify(metadata()) }, { name: 'glb', filename: 'invalid.glb', type: 'model/gltf-binary', bytes: Buffer.from('not a GLB') }, { name: 'stl', filename: 'invalid.stl', type: 'model/stl', bytes: Buffer.from('not an STL') }]);
    expectError(await send('POST', '/api/craft-models', alice, form.payload, { 'content-type': form.contentType }), 422, 'GLB_HEADER_INVALID');
    assert.equal(Number((await services.db.one('SELECT count(*) AS n FROM craft_models'))!.n), 0);
    assert.deepEqual(await readdir(storageDir), []);
  });

  it('enforces model metadata/file ownership and rejects inquiries on another owner model', async () => {
    const { alice, bob, admin } = await accounts(); const model = await seedModel(alice);
    for (const suffix of ['', '/glb', '/stl']) {
      const path = `/api/craft-models/${model.id}${suffix}`;
      expectError(await send('GET', path), 401, 'UNAUTHENTICATED');
      expectError(await send('GET', path, bob), 404, 'NOT_FOUND');
      expectStatus(await send('GET', path, alice), 200); expectStatus(await send('GET', path, admin), 200);
    }
    expectError(await send('POST', '/api/inquiries', bob, inquiryBody(model.id)), 404, 'NOT_FOUND');
    expectError(await send('POST', '/api/inquiries', undefined, inquiryBody(model.id)), 401, 'UNAUTHENTICATED');
    assert.equal(Number((await services.db.one('SELECT count(*) AS n FROM inquiries'))!.n), 0);
  });

  it('freezes server model version/product and rejects client prices or mutation of immutable fields', async () => {
    const alice = await login(); const first = await seedModel(alice), inquiry = await createInquiry(alice, first.id);
    const second = await seedModel(alice, 2);
    assert.notEqual(second.id, first.id);
    assert.equal(inquiry.modelId, first.id); assert.equal(inquiry.modelVersion, 1); assert.equal(inquiry.product, 'MAGNET');
    for (const extra of [{ modelVersion: 99 }, { product: 'KEYCHAIN' }, { totalCents: 1 }, { ownerId: randomUUID() }]) expectError(await send('POST', '/api/inquiries', alice, inquiryBody(first.id, extra)), 400, 'INVALID_REQUEST');
    for (const payload of [{ modelId: second.id }, { quantity: 9 }, { quote: { totalCents: 1 } }]) expectError(await send('PATCH', `/api/inquiries/${inquiry.id}`, alice, payload), 400, 'INVALID_REQUEST');
    const unchanged = expectStatus(await send('GET', `/api/inquiries/${inquiry.id}`, alice), 200).json().inquiry;
    assert.equal(unchanged.modelId, first.id); assert.equal(unchanged.modelVersion, 1); assert.equal(unchanged.quantity, 2); assert.equal(unchanged.quote, null);
  });

  it('deduplicates inquiry retries and rejects reusing the same key for a changed request', async () => {
    const alice = await login(); const model = await seedModel(alice), payload = inquiryBody(model.id);
    const a = expectStatus(await send('POST', '/api/inquiries', alice, payload), 200).json().inquiry;
    const b = expectStatus(await send('POST', '/api/inquiries', alice, payload), 200).json().inquiry;
    assert.equal(a.id, b.id);
    expectError(await send('POST', '/api/inquiries', alice, { ...payload, quantity: 3 }), 409, 'IDEMPOTENCY_CONFLICT');
    assert.equal(expectStatus(await send('GET', '/api/inquiries', alice), 200).json().items.length, 1);
  });

  it('keeps inquiry shipping private, rejects foreign detail/updates and redacts list summaries', async () => {
    const { alice, bob, admin } = await accounts(); const model = await seedModel(alice), inquiry = await createInquiry(alice, model.id);
    expectError(await send('GET', `/api/inquiries/${inquiry.id}`, bob), 404, 'NOT_FOUND');
    expectError(await send('PATCH', `/api/inquiries/${inquiry.id}`, bob, { notes: 'Hijacked' }), 404, 'NOT_FOUND');
    expectError(await send('POST', `/api/inquiries/${inquiry.id}/cancel`, bob, { reason: 'Hijacked' }), 404, 'NOT_FOUND');
    assert.deepEqual(expectStatus(await send('GET', '/api/inquiries', bob), 200).json().items, []);
    for (const [path, session] of [['/api/inquiries', alice], ['/api/admin/inquiries', admin]] as const) {
      const summary = expectStatus(await send('GET', path, session), 200).json().items[0];
      assert.equal(summary.shipping, undefined); assert.equal(summary.notes, undefined); assert.equal(summary.statusNote, undefined);
    }
    assert.deepEqual(expectStatus(await send('GET', `/api/inquiries/${inquiry.id}`, admin), 200).json().inquiry.shipping, shipping());
  });

  it('requires a real clarification note and only lets the owner update permitted private fields', async () => {
    const { alice, bob, admin } = await accounts(); const model = await seedModel(alice), inquiry = await createInquiry(alice, model.id);
    expectError(await send('POST', `/api/admin/inquiries/${inquiry.id}/status`, admin, { status: 'NEEDS_INFO' }), 422, 'NOTE_REQUIRED');
    const note = 'Synthetic request: please clarify the finish.';
    const needs = expectStatus(await send('POST', `/api/admin/inquiries/${inquiry.id}/status`, admin, { status: 'NEEDS_INFO', note }), 200).json().inquiry;
    assert.equal(needs.statusNote, note);
    expectError(await send('PATCH', `/api/inquiries/${inquiry.id}`, bob, { shipping: shipping() }), 404, 'NOT_FOUND');
    const updated = expectStatus(await send('PATCH', `/api/inquiries/${inquiry.id}`, alice, { notes: 'Synthetic clarification', shipping: { ...shipping(), name: 'Updated Synthetic Recipient' } }), 200).json().inquiry;
    assert.equal(updated.status, 'NEEDS_INFO'); assert.equal(updated.notes, 'Synthetic clarification'); assert.equal(updated.shipping.name, 'Updated Synthetic Recipient');
    assert.equal(expectStatus(await send('GET', '/api/inquiries', alice), 200).json().items[0].statusNote, undefined);
  });

  it('refuses stale quote confirmation, non-admin quotes and production before latest confirmation', async () => {
    const { alice, bob, admin } = await accounts(); const model = await seedModel(alice), inquiry = await createInquiry(alice, model.id);
    const quote = { productionCents: 1200, shippingCents: 300, leadDays: 4, note: 'Synthetic quote' };
    expectError(await send('POST', `/api/admin/inquiries/${inquiry.id}/quote`, alice, quote), 403, 'FORBIDDEN');
    expectError(await send('POST', `/api/admin/inquiries/${inquiry.id}/status`, admin, { status: 'PRODUCING' }), 409, 'CONFLICT');
    const first = expectStatus(await send('POST', `/api/admin/inquiries/${inquiry.id}/quote`, admin, quote), 200).json().inquiry;
    const latest = expectStatus(await send('POST', `/api/admin/inquiries/${inquiry.id}/quote`, admin, { ...quote, productionCents: 1400 }), 200).json().inquiry;
    assert.equal(first.quote.revision, 1); assert.equal(latest.quote.revision, 2); assert.equal(latest.quote.totalCents, 1700);
    expectError(await send('POST', `/api/inquiries/${inquiry.id}/confirm`, bob, { quoteRevision: 2 }), 404, 'NOT_FOUND');
    expectError(await send('POST', `/api/inquiries/${inquiry.id}/confirm`, alice, { quoteRevision: 1 }), 409, 'CONFLICT');
    expectError(await send('PATCH', `/api/inquiries/${inquiry.id}`, alice, { notes: 'Late edit' }), 409, 'CONFLICT');
    assert.equal(expectStatus(await send('POST', `/api/inquiries/${inquiry.id}/confirm`, alice, { quoteRevision: 2 }), 200).json().inquiry.status, 'CONFIRMED');
    expectError(await send('POST', `/api/admin/inquiries/${inquiry.id}/quote`, admin, quote), 409, 'CONFLICT');
  });

  it('rejects cancellation after production, skipped states and shipping without tracking', async () => {
    const { alice, admin } = await accounts(); const model = await seedModel(alice), inquiry = await createInquiry(alice, model.id);
    expectStatus(await send('POST', `/api/admin/inquiries/${inquiry.id}/quote`, admin, { productionCents: 1200, shippingCents: 300, leadDays: 4 }), 200);
    expectStatus(await send('POST', `/api/inquiries/${inquiry.id}/confirm`, alice, { quoteRevision: 1 }), 200);
    expectStatus(await send('POST', `/api/admin/inquiries/${inquiry.id}/status`, admin, { status: 'PRODUCING' }), 200);
    expectError(await send('POST', `/api/inquiries/${inquiry.id}/cancel`, alice, { reason: 'Too late' }), 409, 'CONFLICT');
    expectError(await send('POST', `/api/admin/inquiries/${inquiry.id}/status`, admin, { status: 'COMPLETED' }), 409, 'CONFLICT');
    expectError(await send('POST', `/api/admin/inquiries/${inquiry.id}/status`, admin, { status: 'SHIPPED' }), 422, 'TRACKING_REQUIRED');
    const shipped = expectStatus(await send('POST', `/api/admin/inquiries/${inquiry.id}/status`, admin, { status: 'SHIPPED', carrier: 'Synthetic carrier', number: 'SYNTHETIC-TRACKING-NOT-REAL' }), 200).json().inquiry;
    assert.equal(shipped.status, 'SHIPPED'); assert.equal(shipped.tracking.number, 'SYNTHETIC-TRACKING-NOT-REAL');
    expectError(await send('POST', `/api/admin/inquiries/${inquiry.id}/status`, admin, { status: 'CANCELLED' }), 409, 'CONFLICT');
  });

  it('cancels pre-production idempotently and rejects nonconsensual/invalid inquiry input', async () => {
    const alice = await login(); const model = await seedModel(alice);
    for (const overrides of [{ consent: false }, { quantity: 0 }, { quantity: 1.5 }, { shipping: { ...shipping(), address: '' } }]) expectError(await send('POST', '/api/inquiries', alice, inquiryBody(model.id, overrides)), 400, 'INVALID_REQUEST');
    const inquiry = await createInquiry(alice, model.id);
    for (let attempt = 0; attempt < 2; attempt++) assert.equal(expectStatus(await send('POST', `/api/inquiries/${inquiry.id}/cancel`, alice, { reason: 'Synthetic cancellation' }), 200).json().inquiry.status, 'CANCELLED');
    expectError(await send('POST', `/api/inquiries/${inquiry.id}/confirm`, alice, { quoteRevision: 1 }), 409, 'CONFLICT');
  });
});
