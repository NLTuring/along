import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { api, initApi } from '../assets/js/api.js';
import { initSession, getSession, requestCode, verifyCode, signOut } from '../assets/js/auth.js';

const originalFetch = globalThis.fetch;
const json = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
afterEach(async () => {
  globalThis.fetch = async () => json({ user: null });
  await initSession();
  globalThis.fetch = originalFetch;
});

describe('server session facade', () => {
  it('does not read a forged legacy localStorage session', async () => {
    const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ email: 'forged@example.test', role: 'ADMIN' }) } });
    try {
      globalThis.fetch = async (url) => url.endsWith('/config') ? json({ connected: true, authAvailable: true }) : json({ user: null });
      await initApi();
      await initSession();
      assert.equal(getSession(), null);
    } finally {
      if (old) Object.defineProperty(globalThis, 'localStorage', old);
      else delete globalThis.localStorage;
    }
  });
  it('normalizes email and uses the service OTP rather than generating its own', async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/auth/otp');
      assert.deepEqual(JSON.parse(options.body), { email: 'a@example.test' });
      return json({ ok: true, expiresAt: 123 });
    };
    const result = await requestCode(' A@EXAMPLE.TEST ');
    assert.equal(result.ok, true);
    assert.equal('code' in result, false);
  });
  it('rejects invalid emails before sending a request', async () => {
    let count = 0;
    globalThis.fetch = async () => { count += 1; };
    assert.equal((await requestCode('not-an-email')).ok, false);
    assert.equal(count, 0);
  });
  it('creates a session only from a successful verified server response', async () => {
    const user = { id: 'user-1', email: 'a@example.test', displayName: 'A', role: 'USER' };
    globalThis.fetch = async () => json({ ok: false, error: 'WRONG', triesLeft: 4 });
    assert.equal((await verifyCode('a@example.test', '000000')).ok, false);
    assert.equal(getSession(), null);
    globalThis.fetch = async () => json({ ok: true, user, csrfToken: 'csrf' });
    assert.equal((await verifyCode('a@example.test', '123456')).ok, true);
    assert.deepEqual(getSession(), user);
  });
  it('does not claim sign-out success when the server cannot revoke the session', async () => {
    const user = { id: 'user-1', email: 'a@example.test' };
    globalThis.fetch = async () => json({ ok: true, user, csrfToken: 'csrf' });
    await verifyCode('a@example.test', '123456');
    globalThis.fetch = async () => json({ error: { code: 'UNAVAILABLE' } }, 503);
    await assert.rejects(signOut(), { code: 'UNAVAILABLE' });
    assert.deepEqual(getSession(), user);
    globalThis.fetch = async () => json({ ok: true });
    await signOut();
    assert.equal(getSession(), null);
  });
  it('clears an expired session when any authenticated API returns 401', async () => {
    globalThis.fetch = async () => json({ ok: true, user: { id: 'user-1', email: 'a@example.test' }, csrfToken: 'csrf' });
    await verifyCode('a@example.test', '123456');
    globalThis.fetch = async () => json({ error: { code: 'UNAUTHENTICATED' } }, 401);
    await assert.rejects(api('/posts?mine=1'));
    assert.equal(getSession(), null);
  });
});
