import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createServices } from '../src/runtime.js';
import { NATIVE_APP_ORIGIN } from '../src/mobile-auth.js';
import { digest, type Services } from '../src/core.js';
import { cookieName, cookiePath } from '../src/auth.js';

it('uses a path-scoped secure cookie for the same-domain Along mount', () => {
  const base = loadConfig({ NODE_ENV: 'test', DEVELOPMENT_LOCAL: 'true', SESSION_SECRET: 'path-cookie-secret-longer-than-32-characters', PUBLIC_BASE_PATH: '/along' });
  assert.equal(cookiePath(base), '/along/');
  assert.equal(cookieName({ ...base, mode: 'production' }), '__Secure-along_session');
  assert.equal(cookieName({ ...base, mode: 'production', publicBasePath: '' }), '__Host-along_session');
  assert.throws(() => loadConfig({ NODE_ENV: 'test', DEVELOPMENT_LOCAL: 'true', SESSION_SECRET: 'path-cookie-secret-longer-than-32-characters', PUBLIC_BASE_PATH: '/along/../other' }));
});

describe('native mobile authentication and scoped files', { concurrency: false }, () => {
  let s: Services, app: Awaited<ReturnType<typeof createApp>>, dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'along-mobile-auth-'));
    s = await createServices(loadConfig({ NODE_ENV: 'test', DEVELOPMENT_LOCAL: 'true', DEV_OTP_DISPLAY: 'true', SESSION_SECRET: 'mobile-test-secret-longer-than-32-characters', APP_ORIGINS: `http://localhost:4175,${NATIVE_APP_ORIGIN}`, LOCAL_STORAGE_DIR: dir }));
    app = await createApp(s);
  });
  afterEach(async () => { await app?.close(); await s?.tasks.close?.(); await s?.db.close(); if (dir) await rm(dir, { recursive: true, force: true }); });
  const headers = (token?: string) => ({ origin: NATIVE_APP_ORIGIN, 'x-along-client': 'android', ...(token ? { authorization: `Bearer ${token}` } : {}) });
  async function login(email = 'mobile@example.test') {
    const otp = await app.inject({ method: 'POST', url: '/api/auth/otp', headers: headers(), payload: { email } });
    assert.equal(otp.statusCode, 200);
    const verified = await app.inject({ method: 'POST', url: '/api/auth/verify', headers: headers(), payload: { email, code: otp.json().code } });
    assert.equal(verified.statusCode, 200);
    return { response: verified, ...verified.json() };
  }
  async function privateMedia(userId: string) {
    const id = randomUUID(), key = `media/${randomUUID()}.png`;
    await s.storage.put(key, Buffer.from('synthetic-private-bytes'), 'image/png');
    await s.db.query("INSERT INTO media(id,owner_id,kind,purpose,status,object_key,mime,size,width,height) VALUES($1,$2,'IMAGE','CRAFT','READY',$3,'image/png',23,4,4)", [id, userId, key]);
    return id;
  }
  it('preflight allows only the exact configured native origin and known headers', async () => {
    const request = { method: 'OPTIONS' as const, url: '/api/auth/verify', headers: { origin: NATIVE_APP_ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-along-client,authorization' } };
    const allowed = await app.inject(request);
    assert.equal(allowed.statusCode, 204); assert.equal(allowed.headers['access-control-allow-origin'], NATIVE_APP_ORIGIN);
    assert.equal(allowed.headers['access-control-allow-credentials'], undefined);
    assert.equal((await app.inject({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } })).statusCode, 403);
    assert.equal((await app.inject({ ...request, headers: { ...request.headers, 'access-control-request-headers': 'x-arbitrary-secret' } })).statusCode, 403);
  });
  it('issues a bounded mobile token but no cookie only after real OTP verification', async () => {
    const account = await login();
    assert.match(account.mobileToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(account.response.headers['set-cookie'], undefined);
    assert.ok(account.expiresAt > Date.now() + 29 * 86_400_000 && account.expiresAt <= Date.now() + 30 * 86_400_000);
    const session = await app.inject({ url: '/api/auth/session', headers: headers(account.mobileToken) });
    assert.equal(session.json().user.id, account.user.id);
    const stored = await s.db.one('SELECT * FROM sessions WHERE token_hash=$1', [digest(s.config.secret, account.mobileToken)]);
    assert.equal(stored?.client_kind, 'mobile'); assert.equal(stored?.native_origin, NATIVE_APP_ORIGIN);
    assert.notEqual(stored?.token_hash, account.mobileToken);
  });
  it('renews a phone session while it is used, at most once a day, and never revives an expired one', async () => {
    const account = await login();
    const hash = digest(s.config.secret, account.mobileToken), day = 86_400_000;
    // Pretend the sign-in is 20 days old: 10 days left.
    await s.db.query('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1', [hash, Date.now() + 10 * day]);
    const used = await app.inject({ url: '/api/auth/session', headers: headers(account.mobileToken) });
    assert.equal(used.json().user.id, account.user.id);
    const renewed = Number((await s.db.one('SELECT expires_at FROM sessions WHERE token_hash=$1', [hash]))!.expires_at);
    assert.ok(renewed > Date.now() + 29 * day, 'pushed back to 30 days');
    assert.ok(used.json().expiresAt >= renewed - 1000);
    // A second request the same day does not write again.
    await s.db.query('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1', [hash, Date.now() + 30 * day - 3_600_000]);
    await app.inject({ url: '/api/auth/session', headers: headers(account.mobileToken) });
    assert.ok(Number((await s.db.one('SELECT expires_at FROM sessions WHERE token_hash=$1', [hash]))!.expires_at) < Date.now() + 30 * day - 3_000_000);
    // Expired sessions stay expired.
    await s.db.query('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1', [hash, Date.now() - 1]);
    const expired = await app.inject({ url: '/api/auth/session', headers: headers(account.mobileToken) });
    assert.equal(expired.json().user, null);
    assert.ok(Number((await s.db.one('SELECT expires_at FROM sessions WHERE token_hash=$1', [hash]))!.expires_at) < Date.now());
  });
  it('cannot use a mobile token as a cookie or from a foreign origin', async () => {
    const account = await login();
    const cookie = await app.inject({ url: '/api/auth/session', headers: { cookie: `along_session=${account.mobileToken}` } });
    assert.equal(cookie.json().user, null);
    const foreign = await app.inject({ url: '/api/auth/session', headers: { ...headers(account.mobileToken), origin: 'https://evil.example' } });
    assert.equal(foreign.statusCode, 401);
  });
  it('accepts native authenticated writes without browser cookie CSRF and revokes logout', async () => {
    const account = await login();
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: headers(account.mobileToken) });
    assert.equal(logout.statusCode, 200);
    const again = await app.inject({ url: '/api/inquiries', headers: headers(account.mobileToken) });
    assert.equal(again.statusCode, 401);
  });
  it('creates file-only tickets and rejects metadata, mutation and path reuse', async () => {
    const account = await login(), id = await privateMedia(account.user.id);
    const metadata = await app.inject({ url: `/api/media/${id}`, headers: headers(account.mobileToken) });
    const file = metadata.json().media.url;
    assert.match(file, /\?ticket=/); assert.ok(!file.includes(account.mobileToken));
    const downloaded = await app.inject({ url: file });
    assert.equal(downloaded.statusCode, 200); assert.equal(downloaded.body, 'synthetic-private-bytes');
    assert.equal(downloaded.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.equal(downloaded.headers['referrer-policy'], 'no-referrer');
    const ticket = file.split('?')[1];
    for (const path of [`/api/media/${id}?${ticket}`, `/api/media/${id}/poster?${ticket}`, `/api/media/${randomUUID()}/file?${ticket}`]) {
      assert.equal((await app.inject({ url: path })).statusCode, 403);
    }
    assert.equal((await app.inject({ method: 'POST', url: file, headers: headers() })).statusCode, 403);
  });
  it('revokes outstanding file tickets when the session expires or is logged out', async () => {
    const account = await login(), id = await privateMedia(account.user.id);
    const file = (await app.inject({ url: `/api/media/${id}`, headers: headers(account.mobileToken) })).json().media.url;
    await s.db.query('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1', [digest(s.config.secret, account.mobileToken), Date.now() - 1]);
    assert.equal((await app.inject({ url: file })).statusCode, 403);
  });
  it('does not expose another owner private media to a valid mobile account', async () => {
    const first = await login(), second = await login('other@example.test'), id = await privateMedia(first.user.id);
    assert.equal((await app.inject({ url: `/api/media/${id}`, headers: headers(second.mobileToken) })).statusCode, 404);
    assert.equal((await app.inject({ url: `/api/media/${id}/file`, headers: headers(second.mobileToken) })).statusCode, 404);
  });
});
