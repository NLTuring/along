import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatedApiBase, createMobileTokenStore, approvedApiFile, webMountPath } from '../assets/js/remote-session.js';
import { craftAICapabilities, createCraftReview, reviewDetection } from '../assets/js/crafts.js';

const origin = 'https://appassets.androidplatform.net';
const backend = 'https://along.example.test';
function store() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
const mask = () => ({ width: 4, height: 4, data: new Uint8Array([0,0,0,0,0,255,255,0,0,255,255,0,0,0,0,0]) });
const detection = () => ({ width: 40, height: 40, bbox: [10,5,30,35], polygon: [[20,5],[30,20],[25,35],[15,35],[10,20]], confidence: .8, method: 'MODEL_POLYGON', requiresReview: true });

describe('compiled remote API and the persistent mobile token', () => {
  it('allows an explicit HTTPS base and a safe optional mount path', () => {
    assert.equal(validatedApiBase(''), ''); assert.equal(validatedApiBase(backend), backend);
    assert.equal(validatedApiBase('https://tokennext.top/along/'), 'https://tokennext.top/along');
    for (const value of ['http://host.test','https://user:pass@host.test','https://host.test/a.b','https://host.test/%2fsecret','https://host.test?token=x','https://host.test:444','https://host.test/#x']) assert.throws(() => validatedApiBase(value));
  });
  it('derives the web prefix from its own module location', () => {
    assert.equal(webMountPath('https://tokennext.top/along/js/api.js'), '/along');
    assert.equal(webMountPath('https://tokennext.top/js/api.js'), '');
    assert.equal(webMountPath('file:///tmp/js/api.js'), '');
  });
  it('maps canonical private files under the mount without leaking to the other site', () => {
    const base = 'https://tokennext.top/along';
    assert.equal(approvedApiFile('/api/media/a/file?ticket=t', base, origin), base + '/api/media/a/file?ticket=t');
    assert.equal(approvedApiFile(base + '/api/media/a/file?ticket=t', base, origin), base + '/api/media/a/file?ticket=t');
    assert.equal(approvedApiFile('https://tokennext.top/api/media/a/file', base, origin), '');
    assert.equal(approvedApiFile('/api/media/a/file', '', 'https://tokennext.top', '/along'), '/along/api/media/a/file');
  });
  it('stores only a valid bounded session token and binds it to the backend', () => {
    const storage = store(), now = 1000, token = 'a'.repeat(43);
    const account = createMobileTokenStore(backend, () => storage, () => now);
    account.set(token, now + 60000); assert.equal(account.get(), token);
    assert.equal(createMobileTokenStore(backend, () => storage, () => now).get(), token);
    assert.equal(createMobileTokenStore('https://other.example.test', () => storage, () => now).get(), '');
    assert.throws(() => account.set('bad', now + 10000));
    account.clear(); assert.equal(account.get(), '');
  });
  it('keeps a fresh sign-in when the phone clock differs from the server clock', () => {
    const server = 1_800_000_000_000, issued = server + 12 * 3600000, token = 'd'.repeat(43);
    for (const skew of [-1, -5000, -86400000, 3000, 86400000]) {
      const account = createMobileTokenStore(backend, () => store(), () => server + skew);
      account.set(token, issued); assert.equal(account.get(), token, `clock skew ${skew} ms`);
    }
  });
  it('survives the app being closed and reopened, for up to 30 days', () => {
    const disk = store(), day = 86_400_000, token = 'e'.repeat(43);
    createMobileTokenStore(backend, () => disk, () => 1000, () => store()).set(token);
    // A fresh process (Android killed the app) with an empty per-tab store still finds the sign-in.
    assert.equal(createMobileTokenStore(backend, () => disk, () => 1000 + 3 * day, () => store()).get(), token);
    assert.equal(createMobileTokenStore(backend, () => disk, () => 1000 + 30 * day + 1, () => store()).get(), '');
  });
  it('renews the local deadline while the app is used and clears it on expiry', () => {
    const disk = store(), day = 86_400_000; let now = 1000;
    const account = createMobileTokenStore(backend, () => disk, () => now, () => store());
    account.set('f'.repeat(43));
    now += 25 * day; account.touch();
    now += 25 * day; assert.equal(createMobileTokenStore(backend, () => disk, () => now, () => store()).get(), 'f'.repeat(43), 'renewed at day 25');
    now += 31 * day; assert.equal(account.get(), ''); assert.equal(disk.getItem('along.mobileSession.v1'), null, 'expired copy removed');
  });
  it('moves a sign-in from the old per-tab store once', () => {
    const disk = store(), old = store(), token = 'g'.repeat(43);
    old.setItem('along.mobileSession.v1', JSON.stringify({ base: backend, token, expiresAt: 1000 + 3600000 }));
    assert.equal(createMobileTokenStore(backend, () => disk, () => 1000, () => old).get(), token);
    assert.equal(old.getItem('along.mobileSession.v1'), null);
    assert.equal(JSON.parse(disk.getItem('along.mobileSession.v1')).token, token);
  });
  it('does not restore expired or malformed tokens and tolerates blocked storage', () => {
    const storage = store(), account = createMobileTokenStore(backend, () => storage, () => 1000);
    account.set('b'.repeat(43), 2000);
    assert.equal(createMobileTokenStore(backend, () => storage, () => 1000 + 30 * 86_400_000).get(), '');
    storage.setItem('along.mobileSession.v1', JSON.stringify({ base: backend, token: 'b'.repeat(43), expiresAt: 1000 + 31 * 86_400_000 }));
    assert.equal(createMobileTokenStore(backend, () => storage, () => 1000).get(), '');
    storage.setItem('along.mobileSession.v1', '{not json');
    assert.equal(createMobileTokenStore(backend, () => storage, () => 1000).get(), '');
    const blocked = createMobileTokenStore(backend, () => { throw Error('disabled'); }, () => 1000);
    blocked.set('c'.repeat(43), 2000); assert.equal(blocked.get(), 'c'.repeat(43)); blocked.clear(); assert.equal(blocked.get(), '');
  });
  it('allows only resource-scoped files on the configured origin', () => {
    const path = '/api/media/abc/file?ticket=signed';
    assert.equal(approvedApiFile(path, backend, origin), backend + path);
    assert.equal(approvedApiFile('/api/craft-models/abc/glb', '', 'http://localhost:4175'), '/api/craft-models/abc/glb');
    for (const value of ['https://evil.example/api/media/abc/file','/api/auth/session','/api/media/abc','/api/media/abc/file?token=secret','/api/media/abc/file?ticket=a&ticket=b','/api/media/abc/file#fragment','javascript:alert(1)']) assert.equal(approvedApiFile(value, backend, origin), '');
  });
});

describe('independent recognition capability and explicit review', () => {
  it('allows detection without advertising unsupported anime editing', () => {
    assert.deepEqual(craftAICapabilities({ ai: { available: false, detectAvailable: true, editAvailable: false, provider: 'openai-person' } }, {}), { detect: true, edit: false, provider: 'openai-person' });
    assert.equal(craftAICapabilities({ ai: { detectAvailable: true, editAvailable: true } }, { localOnly: true }).detect, false);
    assert.equal(craftAICapabilities({ ai: { available: true } }, {}).edit, true);
  });
  it('keeps a suggestion pending until confirmation and does not mutate the original', () => {
    const original = { blob: 'original', maskSource: 'NONE' }, before = structuredClone(original);
    const review = createCraftReview({ currentVersion: () => 'v1' });
    review.stage({ id: 'job1', inputVersion: 'v1', variant: 'REAL', detection: detection() }, { record: original, image: {}, mask: mask(), width: 40, height: 40 });
    assert.deepEqual(original, before); assert.ok(review.pending);
    const confirmed = review.confirm(mask()); assert.equal(confirmed.record.maskSource, 'AI'); assert.equal(confirmed.record.requiresReview, false);
    assert.deepEqual(original, before);
  });
  it('discard and source-version changes invalidate a suggestion', () => {
    let version = 'v1'; const review = createCraftReview({ currentVersion: () => version });
    const job = { id: 'j', inputVersion: 'v1', variant: 'REAL', detection: detection() };
    const data = { record: {}, image: {}, mask: mask(), width: 40, height: 40 };
    review.stage(job, data); review.discard(); assert.equal(review.pending, null);
    review.stage(job, data); version = 'v2'; assert.equal(review.pending, null); assert.throws(() => review.confirm(mask()), /STALE/);
    assert.equal(review.stage(job, data), null);
  });
  it('never converts a bounding box into a person mask', () => {
    const review = createCraftReview({ currentVersion: () => 'v1' });
    review.stage({ id: 'j', inputVersion: 'v1', variant: 'REAL', detection: { ...detection(), polygon: null } }, { record: {}, mask: mask(), width: 40, height: 40 });
    assert.equal(review.pending.mask, null); assert.equal(review.pending.needsManual, true);
    assert.throws(() => review.confirm(mask()), /REFINEMENT/);
    assert.equal(review.confirm(mask(), true).record.maskSource, 'MANUAL');
  });
  it('rejects wrong-sized detection coordinates', () => {
    assert.equal(reviewDetection(detection(), 41, 40), null);
    assert.equal(reviewDetection(null, 40, 40), null);
  });
});
