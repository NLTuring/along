// Public profiles and follows. Isolated: pg-mem database, temporary storage, no sockets or providers.
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
import type { Services, User } from '../src/core.js';

const ORIGIN = 'http://localhost:4175';
const ADMIN = 'profile-admin@example.test';
type Session = { cookie: string; csrfToken: string; user: User };

describe('public profiles, followers and following', { concurrency: false }, () => {
  let services: Services, app: Awaited<ReturnType<typeof createApp>>, storageDir: string;
  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'along-profiles-'));
    services = await createServices(loadConfig({ NODE_ENV: 'test', DEVELOPMENT_LOCAL: 'true', DEV_OTP_DISPLAY: 'true', SESSION_SECRET: 'profiles-test-only-not-a-production-secret', APP_ORIGINS: ORIGIN, ADMIN_EMAILS: ADMIN, HOST: '127.0.0.1', LOCAL_STORAGE_DIR: storageDir }));
    app = await createApp(services);
  });
  afterEach(async () => { await app?.close(); await services?.tasks.close?.(); await services?.db.close(); await rm(storageDir, { recursive: true, force: true }); });

  const send = (method: InjectOptions['method'], url: string, session?: Session, payload?: InjectOptions['payload'], headers: Record<string, string> = {}) =>
    app.inject({ method, url, payload, headers: { origin: ORIGIN, ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrfToken } : {}), ...headers } });
  const ok = (response: LightMyRequestResponse, status = 200) => { assert.equal(response.statusCode, status, response.body); return response.json(); };
  async function login(email: string): Promise<Session> {
    const { code } = ok(await send('POST', '/api/auth/otp', undefined, { email }));
    const response = await send('POST', '/api/auth/verify', undefined, { email, code });
    const value = ok(response), cookie = [response.headers['set-cookie']].flat()[0]!;
    return { cookie: cookie.split(';')[0], csrfToken: value.csrfToken, user: value.user };
  }
  async function publicPost(author: Session, admin: Session, title: string, withImage = false) {
    let mediaIds: string[] = [];
    if (withImage) {
      const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 30, g: 120, b: 90 } } }).png().toBuffer();
      const boundary = `b-${randomUUID()}`, parts = [['purpose', 'COMMUNITY'], ['consent', 'true']].map(([n, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`).join('');
      const payload = Buffer.concat([Buffer.from(parts + `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="s.png"\r\nContent-Type: image/png\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      mediaIds = [ok(await send('POST', '/api/media', author, payload, { 'content-type': `multipart/form-data; boundary=${boundary}` })).media.id];
    }
    const { post } = ok(await send('POST', '/api/posts', author, { title, body: 'Synthetic body', city: 'Fixture City', tags: [], poiId: null, mediaIds, status: 'PENDING' }));
    ok(await send('POST', `/api/admin/posts/${post.id}/review`, admin, { status: 'PUBLIC', note: '' }));
    return post;
  }

  it('shows public posts with covers and counts; the owner also sees private ones', async () => {
    const alice = await login('alice@example.test'), bob = await login('bob@example.test'), admin = await login(ADMIN);
    const shown = await publicPost(alice, admin, 'Riverside at dusk', true);
    const { post: draft } = ok(await send('POST', '/api/posts', alice, { title: 'Draft only', body: 'x', city: 'X', tags: [], poiId: null, mediaIds: [], status: 'DRAFT' }));
    const seen = ok(await send('GET', `/api/users/${alice.user.id}`, bob));
    assert.equal(seen.user.displayName, alice.user.displayName);
    assert.deepEqual({ posts: seen.user.posts, followers: seen.user.followers, following: seen.user.following, self: seen.user.self }, { posts: 1, followers: 0, following: 0, self: false });
    assert.deepEqual(seen.posts.map((p: { id: string }) => p.id), [shown.id]);
    assert.equal(seen.posts[0].cover.kind, 'IMAGE'); assert.equal(seen.posts[0].mediaCount, 1);
    assert.equal(JSON.stringify(seen).includes('alice@example.test'), false, 'no email on a public profile');
    const mine = ok(await send('GET', `/api/users/${alice.user.id}`, alice));
    assert.equal(mine.user.self, true);
    assert.deepEqual(mine.posts.map((p: { id: string }) => p.id).sort(), [shown.id, draft.id].sort());
    assert.deepEqual(ok(await send('GET', `/api/users/${alice.user.id}`)).posts.map((p: { id: string }) => p.id), [shown.id], 'signed-out readers see public posts');
  });

  it('follows and unfollows, keeps counts and both lists right, and is idempotent', async () => {
    const alice = await login('alice@example.test'), bob = await login('bob@example.test'), carol = await login('carol@example.test');
    assert.deepEqual(ok(await send('PUT', `/api/users/${alice.user.id}/follow`, bob, { active: true })), { followedByMe: true, followers: 1, following: 0, posts: 0 });
    ok(await send('PUT', `/api/users/${alice.user.id}/follow`, bob, { active: true }));
    ok(await send('PUT', `/api/users/${alice.user.id}/follow`, carol, { active: true }));
    ok(await send('PUT', `/api/users/${carol.user.id}/follow`, alice, { active: true }));
    const profile = ok(await send('GET', `/api/users/${alice.user.id}`, bob)).user;
    assert.deepEqual({ followers: profile.followers, following: profile.following, followedByMe: profile.followedByMe }, { followers: 2, following: 1, followedByMe: true });
    const followers = ok(await send('GET', `/api/users/${alice.user.id}/followers`, carol)).items;
    assert.deepEqual(followers.map((m: { id: string }) => m.id).sort(), [bob.user.id, carol.user.id].sort());
    assert.equal(followers.find((m: { id: string }) => m.id === carol.user.id).self, true);
    assert.equal(JSON.stringify(followers).includes('@example.test'), false);
    const following = ok(await send('GET', `/api/users/${alice.user.id}/following`, bob)).items;
    assert.deepEqual(following.map((m: { id: string }) => m.id), [carol.user.id]);
    assert.equal(following[0].followedByMe, false);
    assert.deepEqual(ok(await send('PUT', `/api/users/${alice.user.id}/follow`, bob, { active: false })).followers, 1);
    ok(await send('PUT', `/api/users/${alice.user.id}/follow`, bob, { active: false }));
    assert.equal(ok(await send('GET', `/api/users/${alice.user.id}`, bob)).user.followedByMe, false);
    assert.deepEqual(ok(await send('GET', '/api/me/profile', alice)).user.following, 1);
  });

  it('needs sign-in to follow, refuses following yourself, unknown members and bad input', async () => {
    const alice = await login('alice@example.test');
    assert.equal((await send('PUT', `/api/users/${alice.user.id}/follow`, undefined, { active: true })).statusCode, 401);
    assert.equal((await send('PUT', `/api/users/${alice.user.id}/follow`, alice, { active: true })).json().error.code, 'CANNOT_FOLLOW_SELF');
    assert.equal((await send('PUT', `/api/users/${randomUUID()}/follow`, alice, { active: true })).statusCode, 404);
    assert.equal((await send('PUT', `/api/users/${randomUUID()}/follow`, alice, { active: 'yes' })).statusCode, 400);
    assert.equal((await send('GET', '/api/users/not-a-uuid')).statusCode, 400);
    assert.equal((await send('GET', `/api/users/${randomUUID()}`)).statusCode, 404);
    assert.equal((await send('GET', '/api/me/profile')).statusCode, 401);
    assert.equal((await send('GET', `/api/users/${alice.user.id}/followers?cursor=-5`)).statusCode, 400);
  });
});
