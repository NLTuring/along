import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, it } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalExperience, LOCAL_EXPERIENCE_KEY } from '../assets/js/local-experience.js';

function memory() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), data };
}
const json = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });

describe('explicit local experience profile', () => {
  it('disabled builds do not trust a saved experience marker or user role', () => {
    const storage = memory(); storage.setItem(LOCAL_EXPERIENCE_KEY, JSON.stringify({ version: 1, active: true, role: 'ADMIN' }));
    const profile = createLocalExperience({ enabled: false, storage: () => storage });
    assert.equal(profile.active(), false); assert.equal(profile.session(), null); assert.equal(profile.enter().ok, false);
  });
  it('constructs a fixed local identity rather than trusting stored identity fields', () => {
    const storage = memory(); storage.setItem(LOCAL_EXPERIENCE_KEY, JSON.stringify({ version: 1, active: true, email: 'victim@example.test', role: 'ADMIN' }));
    const profile = createLocalExperience({ enabled: true, storage: () => storage });
    assert.equal(profile.session().role, 'LOCAL'); assert.equal(profile.session().localOnly, true);
    assert.notEqual(profile.session().email, 'victim@example.test'); assert.ok(Object.isFrozen(profile.session()));
  });
  it('ignores malformed, wrong-version and inactive storage', () => {
    for (const value of ['{broken', 'null', '[]', JSON.stringify({ version: 2, active: true }), JSON.stringify({ version: 1, active: false })]) {
      const storage = memory(); storage.setItem(LOCAL_EXPERIENCE_KEY, value);
      assert.equal(createLocalExperience({ enabled: true, storage: () => storage }).active(), false);
    }
  });
  it('enters, persists and resumes without credentials', () => {
    const storage = memory(), profile = createLocalExperience({ enabled: true, storage: () => storage });
    assert.equal(profile.enter().persistent, true);
    assert.deepEqual(JSON.parse(storage.getItem(LOCAL_EXPERIENCE_KEY)), { version: 1, active: true });
    assert.equal(createLocalExperience({ enabled: true, storage: () => storage }).active(), true);
    assert.equal('token' in profile.session(), false);
  });
  it('exits locally without removing photos or craft records', () => {
    const storage = memory(); storage.setItem('instrip.crafts', '[{"id":"keep"}]');
    const profile = createLocalExperience({ enabled: true, storage: () => storage });
    profile.enter(); assert.equal(profile.leave().ok, true);
    assert.equal(profile.active(), false); assert.equal(storage.getItem('instrip.crafts'), '[{"id":"keep"}]');
    assert.equal(createLocalExperience({ enabled: true, storage: () => storage }).active(), false);
  });
  it('reports memory-only mode when writes fail and can still exit it', () => {
    const profile = createLocalExperience({ enabled: true, storage: () => { throw Error('blocked'); } });
    const result = profile.enter(); assert.equal(result.ok, true); assert.equal(result.persistent, false);
    assert.equal(profile.active(), true); assert.equal(profile.leave().ok, true); assert.equal(profile.active(), false);
  });
  it('does not claim persistent sign-out succeeded when marker removal fails', () => {
    const storage = memory(), profile = createLocalExperience({ enabled: true, storage: () => storage });
    profile.enter(); storage.removeItem = () => { throw Error('blocked'); };
    assert.deepEqual(profile.leave(), { ok: false, error: 'STORAGE' }); assert.equal(profile.active(), true);
  });
});

describe('staged test build isolation', { concurrency: false }, () => {
  let directory, storage, originalStorage, originalFetch, originalXHR;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'along-local-profile-test-'));
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    for (const file of ['auth.js', 'api.js', 'local-experience.js', 'remote-session.js']) await writeFile(join(directory, file), await readFile(new URL(`../assets/js/${file}`, import.meta.url)));
    storage = memory(); originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    originalFetch = globalThis.fetch; originalXHR = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  });
  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else delete globalThis.localStorage;
    if (originalXHR) Object.defineProperty(globalThis, 'XMLHttpRequest', originalXHR); else delete globalThis.XMLHttpRequest;
    await rm(directory, { recursive: true, force: true });
  });
  async function modules(enabled, apiBase = '') {
    await writeFile(join(directory, 'build-flags.js'), `export const LOCAL_EXPERIENCE_ENABLED = ${enabled}; export const API_BASE_URL = ${JSON.stringify(apiBase)};`);
    return { auth: await import(pathToFileURL(join(directory, 'auth.js'))), api: await import(pathToFileURL(join(directory, 'api.js'))) };
  }
  it('keeps a phone sign-in when the app reopens without a connection, and ends it only on 401', async () => {
    const base = 'https://tokennext.top/along', token = 'h'.repeat(43);
    storage.setItem('along.mobileSession.v1', JSON.stringify({ base, token, expiresAt: Date.now() + 86_400_000 }));
    const { auth, api } = await modules(false, base);
    // Reopened offline: config and session requests both fail at the network level.
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await api.initApi();
    await auth.initSession();
    assert.ok(api.hasMobileSession(), 'stored token kept');
    assert.ok(storage.getItem('along.mobileSession.v1'), 'not wiped by a network error');
    // A slow or failing session check (server unreachable mid-start) also keeps it.
    globalThis.fetch = async (url) => url.endsWith('/config') ? json({ authAvailable: true }) : json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
    await api.initApi();
    await auth.initSession();
    assert.ok(api.hasMobileSession(), 'kept after a 503');
    // Back online, the server says the token is no longer valid: now it is cleared.
    globalThis.fetch = async (url) => url.endsWith('/config') ? json({ authAvailable: true }) : json({ error: { code: 'UNAUTHENTICATED' } }, 401);
    await auth.initSession();
    assert.equal(auth.getSession(), null);
    assert.equal(api.hasMobileSession(), false);
    assert.equal(storage.getItem('along.mobileSession.v1'), null);
  });
  it('source build stays disabled and localStorage cannot enable it', async () => {
    const source = await readFile(new URL('../assets/js/build-flags.js', import.meta.url), 'utf8');
    assert.match(source, /LOCAL_EXPERIENCE_ENABLED = false;/);
    storage.setItem(LOCAL_EXPERIENCE_KEY, JSON.stringify({ version: 1, active: true }));
    const { auth } = await modules(false);
    assert.equal(auth.localExperienceAvailable(), false); assert.equal(auth.startLocalExperience().ok, false); assert.equal(auth.getSession(), null);
  });
  it('starts and signs out without fetch or XMLHttpRequest', async () => {
    globalThis.fetch = async () => { throw Error('network must not be used'); };
    const { auth } = await modules(true);
    assert.equal(auth.startLocalExperience().ok, true); assert.equal(auth.getSession().localOnly, true);
    await auth.signOut(); assert.equal(auth.getSession(), null);
  });
  it('restores isolation before initApi can send its first request', async () => {
    storage.setItem(LOCAL_EXPERIENCE_KEY, JSON.stringify({ version: 1, active: true }));
    let calls = 0; globalThis.fetch = async () => { calls++; return json({}); };
    const { auth, api } = await modules(true);
    await api.initApi(); await auth.initSession();
    assert.equal(calls, 0); assert.equal(auth.getSession().localOnly, true); assert.equal(api.getRuntimeConfig().ai.available, false);
  });
  it('blocks API reads, writes and uploads before constructing a network request', async () => {
    let calls = 0; globalThis.fetch = async () => { calls++; return json({}); };
    Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: class { constructor() { calls++; } } });
    const { auth, api } = await modules(true); auth.startLocalExperience();
    for (const path of ['/posts', '/auth/session', '/craft-jobs', '/inquiries']) {
      await assert.rejects(api.api(path), { code: 'LOCAL_EXPERIENCE_ONLY' });
      await assert.rejects(api.api(path, { method: 'POST', body: {} }), { code: 'LOCAL_EXPERIENCE_ONLY' });
    }
    await assert.rejects(api.upload('/media', {}), { code: 'LOCAL_EXPERIENCE_ONLY' });
    assert.equal(calls, 0);
  });
  it('prevents OTP and verification while a local profile is active', async () => {
    let calls = 0; globalThis.fetch = async () => { calls++; return json({}); };
    const { auth } = await modules(true); auth.startLocalExperience();
    assert.equal((await auth.requestCode('a@example.test')).error, 'LOCAL_EXPERIENCE_ONLY');
    assert.equal((await auth.verifyCode('a@example.test', '123456')).error, 'LOCAL_EXPERIENCE_ONLY');
    assert.equal(calls, 0);
  });
  it('rejects a late online login response after entering local experience', async () => {
    let resolve, signal;
    globalThis.fetch = (url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); };
    const { auth } = await modules(true);
    const verifying = auth.verifyCode('a@example.test', '123456');
    auth.startLocalExperience(); assert.equal(signal.aborted, true);
    resolve(json({ ok: true, user: { id: 'server', email: 'a@example.test' }, csrfToken: 'secret' }));
    assert.equal((await verifying).ok, false); assert.equal(auth.getSession().localOnly, true);
  });
  it('requires sign-out before replacing a real account with a local profile', async () => {
    globalThis.fetch = async () => json({ ok: true, user: { id: 'server', email: 'a@example.test' }, csrfToken: 'secret' });
    const { auth } = await modules(true); await auth.verifyCode('a@example.test', '123456');
    assert.equal(auth.startLocalExperience().error, 'SIGN_OUT_FIRST'); assert.equal(auth.getSession().id, 'server');
  });
  it('can use real login again after explicitly leaving local mode', async () => {
    let calls = 0; globalThis.fetch = async () => { calls++; return json({ ok: true, expiresAt: 123 }); };
    const { auth } = await modules(true); auth.startLocalExperience(); await auth.signOut();
    assert.equal((await auth.requestCode('a@example.test')).ok, true); assert.equal(calls, 1);
  });
});
