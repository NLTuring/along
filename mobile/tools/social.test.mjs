// Local likes, comments, follows and messages for example stories. In-memory storage only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSocialStore, socialScope, LIMITS } from '../assets/js/social.js';
import { SAMPLE_POSTS, SAMPLE_AUTHORS } from '../assets/js/seed-community.js';

const KEY = 'along.social.v1';
function memory() {
  const rows = new Map();
  return { rows, getItem: (k) => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)) };
}
function store(storage = memory(), start = 1000) {
  let now = start, n = 0;
  return { storage, tick: (ms = 1) => { now += ms; }, s: createSocialStore({ storage: () => storage, now: () => now, makeId: () => `id${++n}` }) };
}
const A = socialScope({ email: 'Alice@Example.test' }), B = socialScope({ email: 'bob@example.test' }), G = socialScope(null);

describe('scopes', () => {
  it('each account on the phone, and a guest, has its own separate copy', () => {
    assert.equal(A, 'u:alice@example.test'); assert.equal(G, 'guest'); assert.equal(socialScope({ email: '  ' }), 'guest');
    const { s } = store();
    assert.equal(s.toggleLike(A, 'p1').liked, true);
    s.addComment(A, 'p1', 'hi'); s.toggleFollow(A, { id: 'author_maya', kind: 'SAMPLE', name: 'Maya' }); s.sendMessage(A, 'author_maya', 'hello');
    for (const scope of [B, G]) {
      assert.equal(s.isLiked(scope, 'p1'), false); assert.deepEqual(s.listComments(scope, 'p1'), []);
      assert.equal(s.isFollowing(scope, 'author_maya'), false); assert.deepEqual(s.listThreads(scope), []);
    }
  });
});

describe('likes and comments', () => {
  it('toggles a like', () => {
    const { s } = store();
    assert.deepEqual(s.toggleLike(A, 'p1'), { ok: true, liked: true }); assert.equal(s.isLiked(A, 'p1'), true);
    assert.deepEqual(s.toggleLike(A, 'p1'), { ok: true, liked: false }); assert.equal(s.isLiked(A, 'p1'), false);
    assert.deepEqual(s.toggleLike(A, ''), { ok: false, error: 'VALIDATION' });
  });
  it('trims comments, enforces length and a per-post limit, and removes only known ones', () => {
    const { s, tick } = store();
    const first = s.addComment(A, 'p1', '  lovely  ');
    assert.equal(first.ok, true); assert.equal(first.comment.text, 'lovely');
    for (const text of ['', '   ', 'x'.repeat(LIMITS.text + 1), 42]) assert.deepEqual(s.addComment(A, 'p1', text), { ok: false, error: 'VALIDATION' });
    assert.equal(s.addComment(A, 'p1', 'x'.repeat(LIMITS.text)).ok, true);
    for (let i = 2; i < LIMITS.commentsPerPost; i++) { tick(); s.addComment(A, 'p1', `c${i}`); }
    assert.equal(s.listComments(A, 'p1').length, LIMITS.commentsPerPost);
    assert.deepEqual(s.addComment(A, 'p1', 'one more'), { ok: false, error: 'LIMIT' });
    assert.deepEqual(s.removeComment(A, 'p1', 'nope'), { ok: false, error: 'NOT_FOUND' });
    assert.equal(s.removeComment(A, 'p1', first.comment.id).ok, true);
    assert.equal(s.listComments(A, 'p1').some((c) => c.id === first.comment.id), false);
    assert.deepEqual(s.removeComment(B, 'p1', first.comment.id), { ok: false, error: 'NOT_FOUND' });
  });
});

describe('follows', () => {
  it('toggles, checks kinds, trims names and lists newest first', () => {
    const { s, tick } = store();
    assert.deepEqual(s.toggleFollow(A, { id: 'author_maya', kind: 'SAMPLE', name: '  Maya  ' }), { ok: true, following: true });
    tick(); s.toggleFollow(A, { id: 'member-1', kind: 'MEMBER', name: 'x'.repeat(200) });
    const list = s.listFollowing(A);
    assert.deepEqual(list.map((f) => f.id), ['member-1', 'author_maya']);
    assert.equal(list[1].name, 'Maya'); assert.equal(list[0].name.length, LIMITS.name);
    for (const bad of [{ id: 'x', kind: 'ROBOT', name: 'n' }, { id: '', kind: 'SAMPLE', name: 'n' }, { id: 'x', kind: 'SAMPLE', name: '  ' }, {}]) assert.deepEqual(s.toggleFollow(A, bad), { ok: false, error: 'VALIDATION' });
    assert.deepEqual(s.toggleFollow(A, { id: 'author_maya', kind: 'SAMPLE', name: 'Maya' }), { ok: true, following: false });
    assert.equal(s.isFollowing(A, 'author_maya'), false);
  });
  it('caps the number of follows', () => {
    const { s } = store();
    for (let i = 0; i < LIMITS.follows; i++) assert.equal(s.toggleFollow(A, { id: `m${i}`, kind: 'MEMBER', name: `M${i}` }).ok, true);
    assert.deepEqual(s.toggleFollow(A, { id: 'one-more', kind: 'MEMBER', name: 'X' }), { ok: false, error: 'LIMIT' });
  });
});

describe('message threads', () => {
  it('keeps who said what, flags sample replies and lists threads by latest activity', () => {
    const { s, tick } = store();
    s.sendMessage(A, 'author_maya', 'hi'); tick();
    s.sendMessage(A, 'author_tom', 'hey'); tick();
    const reply = s.sendMessage(A, 'author_maya', 'thanks for writing', { from: 'them', auto: true });
    assert.deepEqual({ from: reply.message.from, auto: reply.message.auto }, { from: 'them', auto: true });
    assert.equal('auto' in s.getThread(A, 'author_maya')[0], false);
    assert.deepEqual(s.listThreads(A).map((t) => [t.authorId, t.count]), [['author_maya', 2], ['author_tom', 1]]);
    assert.equal(s.listThreads(A)[0].last.text, 'thanks for writing');
    for (const [text, opts] of [['', {}], ['x'.repeat(501), {}], ['ok', { from: 'someone' }]]) assert.deepEqual(s.sendMessage(A, 'author_maya', text, opts), { ok: false, error: 'VALIDATION' });
  });
  it('keeps at most 200 messages, dropping the oldest', () => {
    const { s, tick } = store();
    for (let i = 0; i < LIMITS.threadMessages + 15; i++) { tick(); s.sendMessage(A, 'author_luca', `m${i}`); }
    const thread = s.getThread(A, 'author_luca');
    assert.equal(thread.length, LIMITS.threadMessages); assert.equal(thread[0].text, 'm15'); assert.equal(thread.at(-1).text, `m${LIMITS.threadMessages + 14}`);
  });
});

describe('storage safety', () => {
  it('corrupt or wrongly shaped storage reads as empty and is not overwritten by reading', () => {
    for (const raw of ['{broken', '[]', JSON.stringify({ version: 2, scopes: {} }), JSON.stringify({ version: 1, scopes: [] }),
      JSON.stringify({ version: 1, scopes: { [A]: { likes: 'p1', comments: { p1: [{ id: 3 }] }, follows: [{ id: 'x', kind: 'ROBOT', name: 'n', at: 1 }], threads: { t: [{ id: 'm', text: 'hi', at: 1, from: 'nobody' }] } } } })]) {
      const { s, storage } = store(); storage.rows.set(KEY, raw);
      assert.equal(s.isLiked(A, 'p1'), false); assert.deepEqual(s.listComments(A, 'p1'), []);
      assert.deepEqual(s.listFollowing(A), []); assert.deepEqual(s.listThreads(A), []);
      assert.equal(storage.rows.get(KEY), raw, 'reading never rewrites');
    }
  });
  it('a failed write reports STORAGE and leaves earlier data intact', () => {
    const storage = memory(), { s } = store(storage);
    s.addComment(A, 'p1', 'kept');
    const before = storage.rows.get(KEY);
    storage.setItem = () => { throw new Error('full'); };
    assert.deepEqual(s.addComment(A, 'p1', 'lost'), { ok: false, error: 'STORAGE' });
    assert.deepEqual(s.toggleLike(A, 'p1'), { ok: false, error: 'STORAGE' });
    assert.deepEqual(s.sendMessage(A, 'author_maya', 'lost'), { ok: false, error: 'STORAGE' });
    assert.equal(storage.rows.get(KEY), before);
    assert.deepEqual(s.listComments(A, 'p1').map((c) => c.text), ['kept']);
    assert.equal(s.isLiked(A, 'p1'), false);
    const blocked = createSocialStore({ storage: () => { throw new Error('blocked'); } });
    assert.equal(blocked.isLiked(A, 'p1'), false);
    assert.deepEqual(blocked.toggleLike(A, 'p1'), { ok: false, error: 'STORAGE' });
  });
});

describe('example content', () => {
  it('every example has a known author and bilingual sample comments that its count matches', () => {
    for (const post of SAMPLE_POSTS) {
      assert.ok(SAMPLE_AUTHORS[post.authorId], `${post.id} author`);
      assert.ok(post.sampleComments.length >= 2, `${post.id} comments`);
      assert.equal(post.comments, post.sampleComments.length, `${post.id} count`);
      assert.equal(new Set(post.sampleComments.map((c) => c.id)).size, post.sampleComments.length);
      for (const c of post.sampleComments) for (const key of ['nameEn', 'nameZh', 'textEn', 'textZh']) assert.ok(c[key]?.trim(), `${post.id} ${key}`);
    }
    assert.equal(SAMPLE_POSTS.find((p) => p.id === 'sample_jiajia').authorId, 'author_jiajia');
    assert.equal(SAMPLE_POSTS.find((p) => p.id === 'sample_laomendong').authorId, 'author_fieldnote');
  });
  it('every author has bilingual names, taglines, bios and replies of equal length', () => {
    for (const [id, author] of Object.entries(SAMPLE_AUTHORS)) {
      assert.equal(author.id, id);
      for (const key of ['nameEn', 'nameZh', 'taglineEn', 'taglineZh', 'bioEn', 'bioZh']) assert.ok(author[key]?.trim(), `${id} ${key}`);
      assert.ok(author.repliesEn.length >= 3); assert.equal(author.repliesEn.length, author.repliesZh.length);
      for (const line of [...author.repliesEn, ...author.repliesZh]) assert.ok(line.trim() && line.length <= 500);
      assert.ok(SAMPLE_POSTS.some((p) => p.authorId === id), `${id} wrote an example`);
    }
    assert.equal(SAMPLE_AUTHORS.author_jiajia.guideId, 'guide_jiajia');
  });
});

describe('copy and page wiring', () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
  it('social copy matches in both languages', async () => {
    const [en, zh] = await Promise.all(['en', 'zh'].map(async (l) => JSON.parse(await read(`../assets/messages/social.${l}.json`))));
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
    const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en)) { assert.ok(en[key].trim() && zh[key].trim()); assert.deepEqual(holes(en[key]), holes(zh[key]), key); assert.equal(en[key].includes('!'), false, key); }
  });
  it('example cards open the example; story pages use the social store, not storage directly', async () => {
    const stories = await read('../assets/js/page-stories.js'), post = await read('../assets/js/page-post.js');
    assert.match(stories, /href="#\/examples\/\$\{pathId\(post\.id\)\}"/);
    // A member's own stories moved to their profile; the stories tab has no "mine" tab.
    assert.match(stories, /const MODES = \['latest', 'following', 'examples'\]/);
    assert.match(stories, /href="#\/u\/me"/);
    for (const code of [stories, post]) { assert.doesNotMatch(code, /localStorage|sessionStorage/); assert.doesNotMatch(code, /from ['"]\.\/posts\.js/); }
    assert.match(post, /kind: 'MEMBER'/);
    const dm = await read('../assets/js/page-dm.js');
    assert.match(dm, /clearTimeout\(timer\)/); assert.match(dm, /auto: true/);
    const example = await read('../assets/js/page-example.js');
    assert.match(example, /go\(`dm\//); assert.match(example, /toggleFollow\(/); assert.match(example, /addComment\(/);
  });
});
