// Along keepsake/application regressions. Run with Node 24+: node --test mobile/tools/keepsake.test.mjs
// No browser, dependencies, network, or real user storage; bundled assets are only read.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createCraft, getCraft, listCrafts, normalizePose, SHAPES, updateCraft } from '../assets/js/crafts.js';
import * as applications from '../assets/js/applications.js';
import { SAMPLES } from '../assets/js/media.js';

const CRAFTS_KEY = 'instrip.crafts';
const APPLICATIONS_KEY = 'instrip.guideApplications';
const EMAIL = 'traveller@example.test';
const OTHER_EMAIL = 'other@example.test';
const NOW = Date.parse('2026-11-14T08:00:00Z');
const {
  applicationFields, validateApplication, getApplication, saveApplicationDraft,
  submitApplication, clearGuestApplication,
} = applications;

function memoryStorage() {
  const data = new Map();
  const fail = { get: false, set: false };
  return {
    fail,
    getItem(key) {
      if (fail.get) throw new Error('Injected localStorage read failure');
      return data.get(String(key)) ?? null;
    },
    setItem(key, value) {
      if (fail.set) throw new Error('Injected localStorage write failure');
      data.set(String(key), String(value));
    },
    removeItem(key) { data.delete(String(key)); },
    snapshot() { return [...data.entries()]; },
  };
}

function validApplication(change = {}) {
  return {
    name: '  Lin Chen  ', city: 'shanghai', languages: ['en', 'zh'],
    topics: ['Photography', 'History'],
    bio: '  I enjoy sharing local architecture and quiet neighbourhood walks with travellers.  ',
    availability: ['weekday-am', 'weekend-pm'], agree: true,
    ...change,
  };
}

function savedApplication(email = EMAIL, fields = validApplication(), options = {}) {
  const result = submitApplication(email, fields, { now: NOW, ...options });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.application;
}

function savedCraft() {
  const draft = createCraft({ email: EMAIL, mediaId: 'sample_xuanwu' });
  assert.ok(draft, 'fixture craft must persist');
  const saved = updateCraft(draft.id, { status: 'DESIGNED' });
  assert.equal(saved?.status, 'DESIGNED');
  return saved;
}

// Only the single-request transactions used by media.js are modelled. Writes are
// staged until completion; even a successful request can subsequently abort.
function memoryIndexedDB({ open = 'success', write = 'success', initial = [] } = {}) {
  const records = new Map(initial.map((item) => [item.id, structuredClone(item)]));
  const faults = { open, write };
  let openCalls = 0;
  const db = {
    objectStoreNames: { contains: (name) => name === 'photos' },
    createObjectStore() {},
    close() {},
    transaction(name, mode) {
      assert.equal(name, 'photos');
      if (mode === 'readwrite' && faults.write === 'transaction-throw') {
        throw new Error('Injected transaction creation failure');
      }
      const tx = { error: null };
      const staged = new Map(records);
      function request(work) {
        const req = {};
        queueMicrotask(() => {
          req.result = structuredClone(work(staged));
          req.onsuccess?.({ target: req });
          queueMicrotask(() => {
            if (mode === 'readwrite' && ['error', 'abort'].includes(faults.write)) {
              tx.error = new Error(`Injected transaction ${faults.write}`);
              tx[faults.write === 'abort' ? 'onabort' : 'onerror']?.({ target: tx });
              return;
            }
            if (mode === 'readwrite') {
              records.clear();
              for (const [id, item] of staged) records.set(id, item);
            }
            tx.oncomplete?.({ target: tx });
          });
        });
        return req;
      }
      tx.objectStore = (store) => {
        assert.equal(store, 'photos');
        return {
          put(item) {
            if (faults.write === 'put-throw') throw new Error('Injected object store write failure');
            return request((data) => { data.set(item.id, structuredClone(item)); return item.id; });
          },
          get: (id) => request((data) => data.get(id)),
          getAll: () => request((data) => [...data.values()]),
          delete: (id) => request((data) => { data.delete(id); }),
        };
      };
      return tx;
    },
  };
  const factory = {
    open() {
      openCalls += 1;
      if (faults.open === 'throw') throw new Error('Injected IndexedDB open exception');
      const req = {};
      queueMicrotask(() => {
        if (faults.open === 'error' || faults.open === 'blocked') {
          req.error = new Error(`Injected IndexedDB open ${faults.open}`);
          req[faults.open === 'blocked' ? 'onblocked' : 'onerror']?.({ target: req });
        } else {
          req.result = db;
          req.onupgradeneeded?.({ target: req });
          req.onsuccess?.({ target: req });
        }
      });
      return req;
    },
  };
  return { factory, records, faults, get openCalls() { return openCalls; } };
}

function imageFile(change = {}) {
  return { name: 'trip.png', type: 'image/png', size: 100, width: 4000, height: 2000, ...change };
}

let mediaImport = 0;
describe('Along keepsakes and companion applications', { concurrency: false }, () => {
  let storage;
  let originals;
  function setGlobal(name, value) {
    if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  beforeEach(() => {
    originals = new Map();
    storage = memoryStorage();
    // Do not invoke Node's real localStorage getter or access its backing file.
    setGlobal('localStorage', storage);
  });
  afterEach(() => {
    for (const [name, descriptor] of [...originals].reverse()) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  function useIndexedDB(factory) {
    setGlobal('window', factory ? { indexedDB: factory } : {});
    setGlobal('indexedDB', factory);
  }
  async function freshMedia(factory) {
    useIndexedDB(factory);
    // Each module instance owns its own dbPromise and blob-URL cache.
    return import(new URL(`../assets/js/media.js?keepsake=${++mediaImport}`, import.meta.url).href);
  }
  function imageTools() {
    const seen = { decodes: 0, closed: 0, encoded: [] };
    setGlobal('createImageBitmap', async (file) => {
      seen.decodes += 1;
      if (file.decodeError) throw new Error('Injected image decoding failure');
      return {
        width: file.width, height: file.height, encodeError: file.encodeError,
        close() { seen.closed += 1; },
      };
    });
    setGlobal('document', {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        let bitmap;
        return {
          width: 0, height: 0,
          getContext(kind) {
            assert.equal(kind, '2d');
            return { drawImage(image) { bitmap = image; } };
          },
          toBlob(callback, type, quality) {
            seen.encoded.push({ width: this.width, height: this.height, type, quality });
            queueMicrotask(() => callback(bitmap.encodeError ? null : new Blob(['encoded photo'], { type })));
          },
        };
      },
    });
    return seen;
  }
  async function expectMediaWriteFailure(media, disk) {
    imageTools();
    const before = disk ? structuredClone([...disk.records]) : null;
    await assert.rejects(media.addSamples(), 'sample import must not report an in-memory success');
    await assert.rejects(media.addNative({ id: 'unsaved', src: '/photos/unsaved.jpg' }),
      'native import must wait for a committed record');
    assert.deepEqual(await media.addFiles([imageFile()]), { added: [], failed: 1 });
    if (disk) assert.deepEqual([...disk.records], before, 'failed transactions must preserve persisted media');
  }

  describe('digital keepsakes', () => {
    it('creates a persistent draft with normalized defaults and account-scoped listing', () => {
      const craft = createCraft({ email: EMAIL, mediaId: 'sample_xuanwu' });
      assert.ok(craft?.id);
      assert.equal(craft.email, EMAIL);
      assert.equal(craft.mediaId, 'sample_xuanwu');
      assert.equal(craft.product, 'MAGNET');
      assert.equal(craft.modelType, 'MAGNET');
      assert.equal(craft.shape, 'rounded');
      assert.equal(craft.status, 'DRAFT');
      assert.equal(craft.previewStatus, 'READY');
      // A slight three-quarter view, photo face toward the camera; new keepsakes fill the face with the photo.
      assert.deepEqual({ rotation: craft.rotation, tilt: craft.tilt }, { rotation: 340, tilt: 10 });
      assert.equal(craft.photoFit, 'FILL');
      assert.match(craft.demoEdition, /^AL-.+/);
      assert.ok(Number.isFinite(craft.createdAt));
      assert.deepEqual(getCraft(craft.id), craft);
      assert.deepEqual(listCrafts(EMAIL), [craft]);
      assert.deepEqual(listCrafts(OTHER_EMAIL), []);
      assert.deepEqual(listCrafts(), []);
      assert.equal(getCraft('missing'), null);
      craft.product = 'KEYCHAIN';
      assert.equal(getCraft(craft.id).product, 'MAGNET', 'returned records must not mutate storage');
    });

    it('rejects invalid creation input and handles malformed storage without overwriting it', () => {
      for (const value of [undefined, null, '', 17]) {
        assert.equal(createCraft({ email: EMAIL, mediaId: value }), null);
        assert.equal(createCraft({ email: value, mediaId: 'sample_xuanwu' }), null);
      }
      assert.deepEqual(storage.snapshot(), []);
      for (const raw of ['{broken', '{}', 'null']) {
        storage.setItem(CRAFTS_KEY, raw);
        const before = storage.snapshot();
        assert.deepEqual(listCrafts(EMAIL), []);
        assert.equal(getCraft('old'), null);
        assert.deepEqual(storage.snapshot(), before);
        if (raw === '{broken') {
          assert.equal(createCraft({ email: EMAIL, mediaId: 'sample_xuanwu' }), null);
          assert.deepEqual(storage.snapshot(), before);
        }
      }
    });

    it('normalizes legacy records without new fields, filters invalid rows and sorts newest first', () => {
      storage.setItem(CRAFTS_KEY, JSON.stringify([
        { id: 'old', email: EMAIL, mediaId: 'sample_xuanwu', product: 'KEYCHAIN', status: 'DESIGNED' },
        { id: 'new', email: EMAIL, mediaId: 'photo', product: 'obsolete', shape: 'oval', createdAt: 20 },
        { id: 'other', email: OTHER_EMAIL, mediaId: 'photo', createdAt: 30 },
        null, {}, { id: '', email: EMAIL, mediaId: 'photo' },
        { id: 'bad-email', email: null, mediaId: 'photo' }, { id: 'no-photo', email: EMAIL },
      ]));
      const before = storage.snapshot();
      const old = getCraft('old');
      assert.equal(old.modelType, 'KEYCHAIN');
      assert.equal(old.shape, SHAPES[0]);
      assert.equal(old.rotation, 0);
      assert.equal(old.tilt, 0);
      assert.equal(old.previewStatus, 'DESIGNED');
      assert.match(old.demoEdition, /^AL-.+/);
      assert.equal(old.createdAt, 0);
      assert.equal(getCraft('new').modelType, 'MAGNET');
      assert.equal(getCraft('new').previewStatus, 'READY');
      assert.deepEqual(listCrafts(EMAIL).map((craft) => craft.id), ['new', 'old']);
      assert.deepEqual(storage.snapshot(), before, 'normalizing a read must not migrate persisted data');
    });

    it('normalizes rotation and clamps tilt, including non-finite and non-number inputs', () => {
      for (const [rotation, tilt, expected] of [
        // Tilt stops at 60° either way: further and the photo would turn edge-on.
        [-450, 90, { rotation: 270, tilt: 60 }],
        [720, -90, { rotation: 0, tilt: -60 }],
        [10, 45, { rotation: 10, tilt: 45 }],
        [45.5, 12.5, { rotation: 45.5, tilt: 12.5 }],
        [NaN, Infinity, { rotation: 0, tilt: 0 }],
        [Infinity, NaN, { rotation: 0, tilt: 0 }],
        ['90', '12', { rotation: 0, tilt: 0 }],
      ]) assert.deepEqual(normalizePose(rotation, tilt), expected);
      assert.deepEqual(normalizePose(), { rotation: 0, tilt: 0 });
    });

    it('returns null on create read/write failures and leaves existing persisted crafts intact', () => {
      savedCraft();
      const before = storage.snapshot();
      for (const failure of ['get', 'set']) {
        storage.fail[failure] = true;
        assert.equal(createCraft({ email: EMAIL, mediaId: 'new-photo' }), null);
        assert.deepEqual(storage.snapshot(), before);
        storage.fail[failure] = false;
      }
    });

    it('returns null on update read/write failures or missing ids without altering saved data', () => {
      const craft = savedCraft();
      const before = storage.snapshot();
      for (const failure of ['get', 'set']) {
        storage.fail[failure] = true;
        assert.equal(updateCraft(craft.id, { product: 'KEYCHAIN', rotation: 90 }), null);
        assert.deepEqual(storage.snapshot(), before);
        storage.fail[failure] = false;
      }
      assert.equal(updateCraft('missing', { product: 'KEYCHAIN' }), null);
      assert.deepEqual(storage.snapshot(), before);
      assert.deepEqual(getCraft(craft.id), craft);
    });

    it('keeps DESIGNED for unchanged content and ignores invalid content or identity changes', () => {
      const craft = savedCraft();
      const unchanged = updateCraft(craft.id, {
        product: craft.product, shape: craft.shape, mediaId: craft.mediaId,
      });
      assert.deepEqual(unchanged, craft);
      const rejected = updateCraft(craft.id, {
        id: 'forged', email: OTHER_EMAIL, product: 'INVALID', shape: 'INVALID', mediaId: '',
      });
      assert.deepEqual(rejected, craft);
      assert.deepEqual(getCraft(craft.id), craft);
    });

    for (const [field, value] of [['product', 'KEYCHAIN'], ['shape', 'oval'], ['mediaId', 'another-photo']]) {
      it(`resets a saved design to DRAFT/READY when ${field} actually changes`, () => {
        const craft = savedCraft();
        const updated = updateCraft(craft.id, { [field]: value });
        assert.ok(updated);
        assert.equal(updated[field], value);
        assert.equal(updated.status, 'DRAFT');
        assert.equal(updated.previewStatus, 'READY');
        assert.equal(updated.modelType, updated.product);
        assert.equal(updated.id, craft.id);
        assert.equal(updated.email, craft.email);
        assert.equal(updated.createdAt, craft.createdAt);
        assert.equal(updated.demoEdition, craft.demoEdition);
        assert.deepEqual(getCraft(craft.id), updated);
        assert.equal(craft.status, 'DESIGNED', 'previous return value is an independent snapshot');
      });
    }

    it('persists pose changes without cancelling a saved design', () => {
      const craft = savedCraft();
      const updated = updateCraft(craft.id, { rotation: -60, tilt: 100 });
      assert.deepEqual({ rotation: updated.rotation, tilt: updated.tilt }, { rotation: 300, tilt: 60 });
      assert.equal(updated.status, 'DESIGNED');
      assert.equal(updated.previewStatus, 'DESIGNED');
      assert.equal(updated.mediaId, craft.mediaId);
      assert.deepEqual(getCraft(craft.id), updated);
    });
  });

  describe('companion applications', () => {
    it('accepts null fields, strips unsupported choices and deduplicates without mutating input', () => {
      const empty = { name: '', city: '', languages: [], topics: [], bio: '', availability: [], agree: false };
      assert.deepEqual(applicationFields(null), empty);
      assert.deepEqual(applicationFields(), empty);
      const input = validApplication({
        name: 'N'.repeat(61), bio: 'B'.repeat(501), city: 'unknown', agree: 'true',
        languages: ['zh', 'en', 'zh', 'fr'], topics: ['History', 'History', 'Unknown'],
        availability: ['weekend-pm', 'night', 'weekend-pm'], extra: 'discard',
      });
      const before = structuredClone(input);
      const fields = applicationFields(input);
      assert.equal(fields.name.length, 60);
      assert.equal(fields.bio.length, 500);
      assert.equal(fields.city, '');
      assert.equal(fields.agree, false);
      assert.deepEqual([...fields.languages].sort(), ['en', 'zh']);
      assert.deepEqual(fields.topics, ['History']);
      assert.deepEqual(fields.availability, ['weekend-pm']);
      assert.equal('extra' in fields, false);
      assert.deepEqual(input, before);
    });

    it('validates required fields, text boundaries and allowed selections before any write', () => {
      assert.deepEqual(validateApplication(validApplication()), []);
      assert.deepEqual(validateApplication({}), ['name', 'city', 'languages', 'topics', 'bio', 'availability', 'agree']);
      for (const [field, value] of [
        ['name', 'A'], ['name', '   '], ['name', 'N'.repeat(61)], ['city', 'unknown'],
        ['languages', []], ['languages', ['fr']], ['topics', ['Unknown']],
        ['bio', 'B'.repeat(29)], ['bio', 'B'.repeat(501)], ['availability', []], ['agree', 'true'],
      ]) {
        const input = validApplication({ [field]: value });
        assert.ok(validateApplication(input).includes(field), field);
        const result = submitApplication(EMAIL, input);
        assert.equal(result.ok, false, field);
        assert.equal(result.error, 'VALIDATION', field);
        assert.ok(result.fields.includes(field));
      }
      assert.deepEqual(validateApplication(validApplication({ name: 'NN', bio: 'B'.repeat(30) })), []);
      assert.deepEqual(validateApplication(validApplication({ name: 'N'.repeat(60), bio: 'B'.repeat(500) })), []);
      assert.deepEqual(storage.snapshot(), []);
    });

    it('round-trips incomplete guest/account drafts and normalizes account email', () => {
      const guest = saveApplicationDraft('', { name: 'Guest' }, { now: NOW });
      assert.equal(guest.ok, true);
      const own = saveApplicationDraft('  TRAVELLER@EXAMPLE.TEST  ', { name: 'Traveller' }, { now: NOW + 1 });
      assert.equal(own.ok, true);
      assert.equal(own.application.email, EMAIL);
      assert.equal(own.application.status, 'DRAFT');
      assert.equal(own.application.submittedAt, null);
      assert.deepEqual(getApplication(EMAIL), own.application);
      assert.deepEqual(getApplication(' TRAVELLER@EXAMPLE.TEST '), own.application);
      assert.deepEqual(getApplication(''), guest.application);
      assert.equal(getApplication(OTHER_EMAIL), null);
      const updated = saveApplicationDraft(EMAIL, { name: 'Updated' }, { now: NOW + 2 });
      assert.equal(updated.application.id, own.application.id);
      assert.equal(updated.application.createdAt, NOW + 1);
      assert.equal(updated.application.updatedAt, NOW + 2);
      assert.equal(getApplication('').id, guest.application.id);
    });

    it('requires a valid signed-in email and persists trimmed submissions under that account', () => {
      for (const email of ['', undefined, 'invalid', 'a@b']) {
        assert.deepEqual(submitApplication(email, validApplication()), { ok: false, error: 'LOGIN' });
      }
      assert.deepEqual(storage.snapshot(), []);
      const input = validApplication();
      const before = structuredClone(input);
      const application = savedApplication(' TRAVELLER@EXAMPLE.TEST ', input);
      assert.equal(application.email, EMAIL);
      assert.equal(application.status, 'SUBMITTED');
      assert.equal(application.fields.name, input.name.trim());
      assert.equal(application.fields.bio, input.bio.trim());
      assert.equal(application.createdAt, NOW);
      assert.equal(application.updatedAt, NOW);
      assert.equal(application.submittedAt, NOW);
      assert.equal(application.revision, 0);
      assert.deepEqual(getApplication(EMAIL), application);
      assert.deepEqual(input, before);
    });

    it('treats trimmed text and reordered/deduplicated multiselect submissions as idempotent', () => {
      const original = savedApplication();
      const before = storage.snapshot();
      const input = validApplication({
        name: ` ${original.fields.name} `, bio: `\n${original.fields.bio}\n`,
        languages: ['zh', 'en', 'zh'], topics: ['History', 'Photography', 'History'],
        availability: ['weekend-pm', 'weekday-am', 'weekday-am'],
      });
      const inputBefore = structuredClone(input);
      storage.fail.set = true; // An idempotent success must not depend on writing again.
      const result = submitApplication(EMAIL, input, { now: NOW + 10 });
      assert.equal(result.ok, true);
      assert.deepEqual(result.application, original);
      assert.deepEqual(storage.snapshot(), before);
      assert.deepEqual(input, inputBefore);
    });

    it('returns CONFLICT rather than a false success for each changed submitted field', () => {
      savedApplication();
      const before = storage.snapshot();
      for (const [field, value] of [
        ['name', 'Another traveller'], ['city', 'nanjing'], ['languages', ['zh']],
        ['topics', ['Food']], ['bio', 'A different introduction about local food, history and safe city walks.'],
        ['availability', ['weekend-am']],
      ]) {
        assert.deepEqual(submitApplication(EMAIL, validApplication({ [field]: value }), { now: NOW + 1 }),
          { ok: false, error: 'CONFLICT' }, field);
        assert.deepEqual(storage.snapshot(), before, field);
      }
    });

    it('protects submitted applications from autosave and allows explicit revision', () => {
      const original = savedApplication();
      const before = storage.snapshot();
      const changed = validApplication({ name: 'Revised traveller' });
      assert.deepEqual(saveApplicationDraft(EMAIL, changed), { ok: false, error: 'CONFLICT' });
      assert.deepEqual(storage.snapshot(), before);
      const revised = saveApplicationDraft(EMAIL, changed, { revise: true, now: NOW + 1 });
      assert.equal(revised.ok, true);
      assert.equal(revised.application.status, 'DRAFT');
      assert.equal(revised.application.id, original.id);
      assert.equal(revised.application.createdAt, original.createdAt);
      assert.equal(revised.application.revision, original.revision + 1);
      assert.equal(revised.application.submittedAt, null);
      const submitted = savedApplication(EMAIL, changed, { now: NOW + 2 });
      assert.equal(submitted.id, original.id);
      assert.equal(submitted.revision, revised.application.revision);
      assert.equal(submitted.fields.name, 'Revised traveller');
      const directRevision = savedApplication(EMAIL, validApplication(), { revise: true, now: NOW + 3 });
      assert.equal(directRevision.id, original.id);
      assert.equal(directRevision.revision, submitted.revision + 1);
    });

    it('reports STORAGE on failed draft/submission/revision writes and does not change persisted data', () => {
      const draft = saveApplicationDraft(EMAIL, validApplication(), { now: NOW });
      assert.equal(draft.ok, true);
      const before = storage.snapshot();
      for (const failure of ['get', 'set']) {
        storage.fail[failure] = true;
        assert.deepEqual(saveApplicationDraft(EMAIL, { name: 'Changed' }), { ok: false, error: 'STORAGE' });
        assert.deepEqual(submitApplication(EMAIL, validApplication()), { ok: false, error: 'STORAGE' });
        assert.deepEqual(storage.snapshot(), before);
        storage.fail[failure] = false;
      }
      savedApplication();
      const submittedBefore = storage.snapshot();
      storage.fail.set = true;
      assert.deepEqual(saveApplicationDraft(EMAIL, validApplication(), { revise: true }), { ok: false, error: 'STORAGE' });
      assert.deepEqual(submitApplication(EMAIL, validApplication({ city: 'nanjing' }), { revise: true }),
        { ok: false, error: 'STORAGE' });
      assert.deepEqual(storage.snapshot(), submittedBefore);
    });

    it('exports getApplicationDraft and prioritizes the current account, including its submitted record', () => {
      assert.equal(typeof applications.getApplicationDraft, 'function');
      assert.equal(saveApplicationDraft('', { name: 'Guest' }).ok, true);
      const own = saveApplicationDraft(EMAIL, { name: 'Own' });
      const other = saveApplicationDraft(OTHER_EMAIL, { name: 'Other' });
      assert.equal(own.ok, true);
      assert.equal(other.ok, true);
      assert.deepEqual(applications.getApplicationDraft(' TRAVELLER@EXAMPLE.TEST '), own.application);
      const submitted = savedApplication();
      assert.deepEqual(applications.getApplicationDraft(EMAIL), submitted);
      assert.deepEqual(applications.getApplicationDraft(OTHER_EMAIL), other.application);
    });

    it('falls back only to a guest DRAFT and never reads an unrelated account', () => {
      assert.equal(typeof applications.getApplicationDraft, 'function');
      assert.equal(saveApplicationDraft(OTHER_EMAIL, validApplication()).ok, true);
      assert.equal(applications.getApplicationDraft(EMAIL), null);
      assert.equal(applications.getApplicationDraft(''), null);
      const guest = saveApplicationDraft('', { name: 'Guest' });
      assert.equal(guest.ok, true);
      const before = storage.snapshot();
      assert.deepEqual(applications.getApplicationDraft(EMAIL), guest.application);
      assert.deepEqual(applications.getApplicationDraft(''), guest.application);
      assert.deepEqual(storage.snapshot(), before);
      const rows = JSON.parse(storage.getItem(APPLICATIONS_KEY));
      rows.find((row) => row.email === '').status = 'SUBMITTED';
      storage.setItem(APPLICATIONS_KEY, JSON.stringify(rows));
      assert.equal(applications.getApplicationDraft(EMAIL), null, 'only guest drafts may be inherited');
      assert.equal(applications.getApplicationDraft(''), null);
    });

    it('clears a matching guest draft only after a matching account submission is persisted', () => {
      const snapshot = validApplication();
      assert.equal(saveApplicationDraft('', snapshot).ok, true);
      const other = saveApplicationDraft(OTHER_EMAIL, { name: 'Other' });
      assert.equal(other.ok, true);
      const submitted = savedApplication(EMAIL, snapshot);
      assert.equal(clearGuestApplication(snapshot, submitted), true);
      assert.equal(getApplication(''), null);
      assert.deepEqual(getApplication(EMAIL), submitted);
      assert.deepEqual(getApplication(OTHER_EMAIL), other.application);
    });

    it('does not clear a guest after failed submission or with absent/forged/unsubmitted receipts', () => {
      const snapshot = validApplication();
      const guest = saveApplicationDraft('', snapshot);
      assert.equal(guest.ok, true);
      storage.fail.set = true;
      const failure = submitApplication(EMAIL, snapshot);
      assert.deepEqual(failure, { ok: false, error: 'STORAGE' });
      storage.fail.set = false;
      const before = storage.snapshot();
      const forged = {
        ...guest.application, id: 'ap_not_persisted', email: EMAIL, status: 'SUBMITTED',
        submittedAt: NOW, fields: { ...guest.application.fields, name: snapshot.name.trim(), bio: snapshot.bio.trim() },
      };
      for (const receipt of [undefined, null, failure.application, forged]) {
        clearGuestApplication(snapshot, receipt);
        assert.deepEqual(storage.snapshot(), before, 'missing durable proof must not delete the guest');
      }
      const draft = saveApplicationDraft(EMAIL, snapshot);
      assert.equal(draft.ok, true);
      const draftBefore = storage.snapshot();
      clearGuestApplication(snapshot, { ...draft.application, status: 'SUBMITTED', submittedAt: NOW });
      assert.deepEqual(storage.snapshot(), draftBefore, 'a persisted DRAFT is not proof of submission');
    });

    it('checks both the submission snapshot and persisted receipt instead of trusting caller fields', () => {
      const submitted = savedApplication();
      const different = validApplication({ city: 'nanjing' });
      assert.equal(saveApplicationDraft('', different).ok, true);
      const before = storage.snapshot();
      for (const receipt of [submitted, { ...submitted, fields: applicationFields(different) },
        { ...submitted, email: OTHER_EMAIL }, { ...submitted, id: 'ap_forged' }]) {
        clearGuestApplication(different, receipt);
        assert.deepEqual(storage.snapshot(), before, 'mismatched fields or persisted identity must not delete');
      }
    });

    it('preserves a guest draft edited after the submitted snapshot and non-draft guest rows', () => {
      const snapshot = validApplication();
      assert.equal(saveApplicationDraft('', snapshot).ok, true);
      const submitted = savedApplication(EMAIL, snapshot);
      assert.equal(saveApplicationDraft('', validApplication({ name: 'New guest draft' })).ok, true);
      const before = storage.snapshot();
      clearGuestApplication(snapshot, submitted);
      assert.deepEqual(storage.snapshot(), before);
      storage.setItem(APPLICATIONS_KEY, JSON.stringify([
        submitted, { ...submitted, id: 'guest-invalid-status', email: '' },
      ]));
      const invalidBefore = storage.snapshot();
      clearGuestApplication(snapshot, submitted);
      assert.deepEqual(storage.snapshot(), invalidBefore, 'only matching guest DRAFT rows may be cleared');
    });

    it('does not use a stale receipt after the persisted submission has been revised', () => {
      const snapshot = validApplication();
      const oldReceipt = savedApplication(EMAIL, snapshot);
      const current = savedApplication(EMAIL, snapshot, { revise: true, now: NOW + 10 });
      assert.equal(current.id, oldReceipt.id);
      assert.notEqual(current.revision, oldReceipt.revision);
      assert.equal(saveApplicationDraft('', snapshot).ok, true);
      const before = storage.snapshot();
      clearGuestApplication(snapshot, oldReceipt);
      assert.deepEqual(storage.snapshot(), before, 'receipt revision must match persistent submission');
      assert.equal(clearGuestApplication(snapshot, current), true);
      assert.equal(getApplication(''), null);
      assert.deepEqual(getApplication(EMAIL), current);
    });

    it('leaves guest/account data intact when cleanup storage reads or writes fail', () => {
      const snapshot = validApplication();
      assert.equal(saveApplicationDraft('', snapshot).ok, true);
      const submitted = savedApplication(EMAIL, snapshot);
      const before = storage.snapshot();
      for (const failure of ['get', 'set']) {
        storage.fail[failure] = true;
        assert.equal(clearGuestApplication(snapshot, submitted), false);
        assert.deepEqual(storage.snapshot(), before);
        storage.fail[failure] = false;
      }
      storage.setItem(APPLICATIONS_KEY, '{broken');
      const corruptBefore = storage.snapshot();
      assert.equal(clearGuestApplication(snapshot, submitted), false);
      assert.deepEqual(storage.snapshot(), corruptBefore);
    });
  });

  describe('media persistence', () => {
    it('commits sample/native imports, deduplicates samples and reads/removes records without mutating seeds', async () => {
      const disk = memoryIndexedDB();
      const media = await freshMedia(disk.factory);
      const samplesBefore = structuredClone(media.SAMPLES);
      const ids = await media.addSamples();
      assert.deepEqual(ids, media.SAMPLES.map((sample) => sample.id));
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(disk.records.size, ids.length);
      await media.addSamples();
      assert.equal(disk.records.size, ids.length);
      const nativeId = await media.addNative({ id: 'camera-1', src: '/photos/camera-1.jpg' });
      assert.equal(nativeId, 'native_camera-1');
      const native = await media.getMedia(nativeId);
      assert.equal(native.native, true);
      assert.equal(native.src, '/photos/camera-1.jpg');
      assert.equal(media.urlFor(native), native.src);
      const items = await media.listMedia();
      assert.equal(items.length, ids.length + 1);
      assert.equal(items[0].id, nativeId);
      for (let i = 1; i < items.length; i += 1) assert.ok(items[i - 1].addedAt >= items[i].addedAt);
      assert.ok(items.filter((item) => item.id !== nativeId).every((item) => item.sample === true));
      await media.removeMedia(nativeId);
      assert.equal(await media.getMedia(nativeId), null);
      assert.equal(disk.records.has(nativeId), false);
      assert.deepEqual(media.SAMPLES, samplesBefore);
      assert.deepEqual(storage.snapshot(), []);
    });

    for (const failure of ['unavailable', 'throw', 'error', 'blocked']) {
      it(`rejects writes when IndexedDB is ${failure}, reports failed files, and can retry`, { timeout: 3000 }, async () => {
        const disk = memoryIndexedDB({ open: failure === 'unavailable' ? 'success' : failure });
        const media = await freshMedia(failure === 'unavailable' ? undefined : disk.factory);
        await expectMediaWriteFailure(media, disk);
        assert.equal(disk.records.size, 0);
        assert.equal(await media.getMedia('native_unsaved'), null, 'failed imports must not remain in memory');
        await assert.rejects(media.listMedia(), 'an unavailable library must not look like a successful empty read');
        disk.faults.open = 'success';
        useIndexedDB(disk.factory);
        assert.equal(await media.addNative({ id: 'recovered', src: '/photos/recovered.jpg' }), 'native_recovered');
        assert.deepEqual([...disk.records.keys()], ['native_recovered']);
      });
    }

    for (const failure of ['error', 'abort']) {
      it(`does not report imported media when a write transaction ends in ${failure}`, { timeout: 3000 }, async () => {
        const disk = memoryIndexedDB({ write: failure, initial: [{ id: 'existing', src: '/photos/existing.jpg', addedAt: 1 }] });
        const media = await freshMedia(disk.factory);
        await expectMediaWriteFailure(media, disk);
        assert.equal((await media.getMedia('existing')).src, '/photos/existing.jpg');
        assert.equal(await media.getMedia('native_unsaved'), null);
      });
    }

    it('rejects synchronous transaction/object-store write exceptions without phantom media', { timeout: 3000 }, async () => {
      for (const write of ['transaction-throw', 'put-throw']) {
        const disk = memoryIndexedDB({ write });
        const media = await freshMedia(disk.factory);
        await expectMediaWriteFailure(media, disk);
        assert.equal(await media.getMedia('native_unsaved'), null);
      }
    });

    it('reports invalid/oversized/undecodable/unencodable files and commits correctly resized images', async () => {
      const disk = memoryIndexedDB();
      const media = await freshMedia(disk.factory);
      const seen = imageTools();
      const files = [
        imageFile({ type: 'text/plain' }), imageFile({ size: 201 * 1024 * 1024 }),
        imageFile({ decodeError: true }), imageFile({ encodeError: true }), imageFile(),
        imageFile({ width: 40, height: 20 }), imageFile({ width: 1, height: 8000 }),
      ];
      const before = structuredClone(files);
      const result = await media.addFiles(files);
      assert.equal(result.failed, 4);
      assert.equal(result.added.length, 3);
      assert.equal(new Set(result.added).size, 3);
      assert.equal(disk.records.size, 3);
      const added = await Promise.all(result.added.map((id) => media.getMedia(id)));
      assert.deepEqual(added.map(({ w, h }) => [w, h]), [[1920, 960], [40, 20], [1, 1920]]);
      assert.ok(added.every((item) => item.blob instanceof Blob && item.blob.type === 'image/jpeg'));
      assert.equal(seen.decodes, 5);
      assert.equal(seen.closed, 4);
      assert.ok(seen.encoded.every(({ type, quality }) => type === 'image/jpeg' && quality > 0 && quality <= 1));
      assert.deepEqual(files, before);
    });

    it('resolves known legacy sample ids from bundled samples without a stored row or working database', async () => {
      for (const mode of ['empty', 'unavailable', 'error', 'blocked']) {
        const disk = memoryIndexedDB({ open: ['error', 'blocked'].includes(mode) ? mode : 'success' });
        const media = await freshMedia(mode === 'unavailable' ? undefined : disk.factory);
        const before = structuredClone(media.SAMPLES);
        for (const sample of media.SAMPLES.filter((item) => item.id === 'sample_xuanwu' || item.userProvided)) {
          const item = await media.getMedia(sample.id);
          assert.ok(item, `${mode}: ${sample.id} must remain usable by old craft records`);
          assert.equal(item.id, sample.id);
          assert.equal(item.src, sample.src);
          assert.equal(item.altKey, sample.altKey);
          assert.equal(media.urlFor(item), sample.src);
        }
        assert.equal(await media.getMedia('ph_missing'), null);
        assert.equal(disk.records.size, 0, 'fallback reads must not import samples');
        assert.deepEqual(media.SAMPLES, before);
      }
    });
  });

  describe('bundled sample assets and bilingual copy', () => {
    it('keeps all four original Along PNG paths with valid headers/dimensions and preserves sample_xuanwu', async () => {
      const expected = [
        ['sample_along_shanghai_friends', 'img/along-samples/along-shanghai-friends.png', 'craft.sample.shanghai'],
        ['sample_along_temple_friends', 'img/along-samples/along-temple-friends.png', 'craft.sample.temple'],
        ['sample_along_forbidden_city', 'img/along-samples/along-forbidden-city.png', 'craft.sample.palace'],
        ['sample_along_lanterns', 'img/along-samples/along-lanterns.png', 'craft.sample.lanterns'],
      ];
      assert.deepEqual(SAMPLES.filter((sample) => sample.userProvided).map(({ id, src, altKey }) => [id, src, altKey]).sort(),
        [...expected].sort());
      for (const [id, src] of expected) {
        const bytes = await readFile(new URL(`../assets/${src}`, import.meta.url));
        assert.ok(bytes.length >= 33, `${id}: complete PNG IHDR`);
        assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), id);
        assert.equal(bytes.readUInt32BE(8), 13, `${id}: IHDR byte length`);
        assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', id);
        for (const offset of [16, 20]) {
          const dimension = bytes.readUInt32BE(offset);
          assert.ok(dimension > 0 && dimension <= 0x7fffffff, `${id}: valid width/height`);
        }
        const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        assert.ok(depths[bytes[25]]?.includes(bytes[24]), `${id}: valid PNG colour type and bit depth`);
        assert.equal(bytes[26], 0, `${id}: PNG compression method`);
        assert.equal(bytes[27], 0, `${id}: PNG filter method`);
        assert.ok([0, 1].includes(bytes[28]), `${id}: PNG interlace method`);
      }
      const xuanwu = SAMPLES.find((sample) => sample.id === 'sample_xuanwu');
      assert.ok(xuanwu);
      assert.equal(xuanwu.src, 'img/xuanwu.jpg');
      assert.ok((await readFile(new URL(`../assets/${xuanwu.src}`, import.meta.url))).length > 0);
      assert.equal(new Set(SAMPLES.map((sample) => sample.id)).size, SAMPLES.length);
    });

    it('keeps English/Chinese key sets and interpolation placeholders in sync', async () => {
      const [en, zh] = await Promise.all(['en', 'zh'].map(async (locale) =>
        JSON.parse(await readFile(new URL(`../assets/messages/${locale}.json`, import.meta.url), 'utf8'))));
      assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
      const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      for (const key of Object.keys(en)) {
        assert.equal(typeof en[key], 'string', `en: ${key}`);
        assert.equal(typeof zh[key], 'string', `zh: ${key}`);
        assert.ok(en[key].trim() && zh[key].trim(), `${key}: nonempty localized copy`);
        assert.deepEqual(placeholders(en[key]), placeholders(zh[key]), `${key}: interpolation placeholders`);
      }
    });

    it('uses Along branding in both locales and supplies dynamic keepsake/application labels', async () => {
      const required = [
        'craft.create', 'craft.saved', 'craft.preview.alt', 'craft.samples.note', 'craft.sample.credit',
        'craft.photo.error', 'craft.download.error', 'apply.title', 'apply.local', 'apply.submitted',
        'apply.status.SUBMITTED', 'apply.revise', 'error.STORAGE', 'error.CONFLICT',
        ...SAMPLES.filter((sample) => sample.altKey).map((sample) => sample.altKey),
        ...['MAGNET', 'KEYCHAIN'].flatMap((product) => [`product.${product}`, `craft.product.${product}`]),
        ...['READY', 'PREVIEWED', 'DESIGNED'].map((status) => `craft.status.${status}`),
        ...applications.APPLICATION_CITIES.map((city) => `city.${city}`),
        ...applications.APPLICATION_LANGUAGES.map((language) => `lang.name.${language}`),
        ...applications.APPLICATION_TOPICS.map((topic) => `apply.topic.${topic}`),
        ...applications.APPLICATION_SLOTS.map((slot) => `apply.slot.${slot}`),
      ];
      for (const locale of ['en', 'zh']) {
        const dict = JSON.parse(await readFile(new URL(`../assets/messages/${locale}.json`, import.meta.url), 'utf8'));
        assert.equal(dict.brand, 'Along', locale);
        assert.match(dict['app.title'], /\bAlong\b/, locale);
        for (const key of ['craft.preview.alt', 'craft.download', 'craft.library.sub', 'apply.intro']) {
          assert.match(dict[key], /\bAlong\b/, `${locale}: ${key}`);
        }
        for (const [key, text] of Object.entries(dict)) assert.doesNotMatch(text, /\bInsTrip\b/i, `${locale}: ${key}`);
        for (const key of required) assert.ok(typeof dict[key] === 'string' && dict[key].trim(), `${locale}: ${key}`);
      }
    });
  });
});
