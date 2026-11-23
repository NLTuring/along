// Content-loop regression tests. Uses only in-memory storage.
import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, it } from 'node:test';
import { filterGuides } from '../assets/js/guide-filter.js';
import { GUIDES } from '../assets/js/seed.js';
import { SAMPLE_POSTS } from '../assets/js/seed-community.js';
import { listPosts, listSamplePosts, removePost } from '../assets/js/posts.js';
import { isSaved, listSaved, toggleSaved, clearSaved } from '../assets/js/saved.js';

const SAVED_KEY = 'instrip.saved';
const POSTS_KEY = 'instrip.posts';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(String(key)) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    snapshot() { return [...data.entries()]; },
  };
}

describe('content loops', { concurrency: false }, () => {
  let storage;
  let originalStorage;

  beforeEach(() => {
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    storage = memoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  });

  afterEach(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  });

  describe('saved places', () => {
    it('adds, deduplicates, toggles and clears POI ids', () => {
      assert.deepEqual(listSaved(), []);
      assert.equal(isSaved('poi_yuyuan'), false);
      assert.equal(toggleSaved('poi_yuyuan'), true);
      assert.equal(toggleSaved('poi_yuyuan'), false);
      assert.equal(toggleSaved('poi_njmuseum'), true);
      assert.deepEqual(listSaved(), ['poi_njmuseum']);
      assert.equal(isSaved('poi_njmuseum'), true);
      assert.equal(clearSaved(), true);
      assert.deepEqual(listSaved(), []);
    });

    it('rejects invalid and corrupt saved ids safely', () => {
      assert.equal(toggleSaved(''), false);
      assert.equal(toggleSaved(null), false);
      storage.setItem(SAVED_KEY, JSON.stringify(['poi_yuyuan', 12, '', 'poi_yuyuan']));
      assert.deepEqual(listSaved(), ['poi_yuyuan']);
      storage.setItem(SAVED_KEY, '{broken');
      assert.deepEqual(listSaved(), []);
    });
  });

  describe('guide filters', () => {
    it('filters by city, type, topic and combinations', () => {
      assert.deepEqual(filterGuides(GUIDES, { city: 'nanjing' }).map((g) => g.id), ['guide_junjie']);
      assert.deepEqual(filterGuides(GUIDES, { kind: 'VOLUNTEER' }).map((g) => g.id), ['guide_jiajia']);
      assert.deepEqual(filterGuides(GUIDES, { topic: 'Food' }).map((g) => g.id), ['guide_zhangmin']);
      assert.deepEqual(filterGuides(GUIDES, { city: 'shanghai', kind: 'LICENSED', topic: 'Food' }).map((g) => g.id), ['guide_zhangmin']);
      assert.deepEqual(filterGuides(GUIDES, { city: 'nanjing', topic: 'Food' }), []);
    });
  });

  describe('curated stories', () => {
    it('provides curated examples without writing to user post storage', () => {
      const before = storage.snapshot();
      const samples = listSamplePosts();
      assert.equal(samples.length, SAMPLE_POSTS.length);
      assert.ok(samples.every((post) => post.kind === 'SAMPLE' && post.status === 'VISIBLE'));
      assert.deepEqual(storage.snapshot(), before);
      samples[0].textEn = 'changed locally';
      assert.notEqual(listSamplePosts()[0].textEn, 'changed locally');
    });

    it('uses every bundled Along sample photo with complete bilingual copy', async () => {
      const { readdir, access } = await import('node:fs/promises');
      const assets = new URL('../assets/', import.meta.url);
      const bundled = (await readdir(new URL('img/along-samples/', assets))).map((name) => `img/along-samples/${name}`);
      const photos = SAMPLE_POSTS.map((post) => post.photo).filter(Boolean);
      for (const file of bundled) assert.ok(photos.includes(file), `${file} is not used by a local example`);
      for (const file of photos) await access(new URL(file, assets));
      assert.equal(new Set(SAMPLE_POSTS.map((post) => post.id)).size, SAMPLE_POSTS.length);
      for (const post of SAMPLE_POSTS) {
        for (const key of ['title', 'text', 'author']) assert.ok(post[`${key}En`]?.trim() && post[`${key}Zh`]?.trim(), `${post.id} ${key}`);
        if (post.photo) assert.ok(post.altEn?.trim() && post.altZh?.trim(), `${post.id} alt`);
        assert.equal(post.tagsEn?.length, post.tagsZh?.length, `${post.id} tags`);
        assert.ok(Number.isInteger(post.likes) && Number.isInteger(post.comments), `${post.id} counts`);
      }
    });

    it('keeps pending user posts separate and protects samples from deletion', () => {
      storage.setItem(POSTS_KEY, JSON.stringify([{ id: 'user-post', email: 'a@test', status: 'PENDING', text: 'hi' }]));
      assert.deepEqual(listPosts('a@test').map((p) => p.id), ['user-post']);
      assert.deepEqual(listPosts('other@test'), []);
      assert.equal(removePost(SAMPLE_POSTS[0].id, 'a@test'), false);
      assert.deepEqual(JSON.parse(storage.getItem(POSTS_KEY)), [{ id: 'user-post', email: 'a@test', status: 'PENDING', text: 'hi' }]);
    });
  });
});
