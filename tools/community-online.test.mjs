// Pure frontend contract/validation tests; no server, mail, real photo uploads or browser required.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  POST_LIMITS, POST_STATES, INQUIRY_STATES, parseTags, validatePost, moveItem, postsQuery,
  visiblePosts, visibleComments, mergePage, safeMediaUrl, safeModelUrl, mediaFileError,
  createRequestGate, abortableDelay, uploadCommunityFile, canCancelInquiry,
  canConfirmInquiry, inquiryTransitions, canQuoteInquiry, validateInquiry, parseMoney, createSubmissionKey,
} from '../mobile/assets/js/community.js';

const validPost = () => ({ title: ' A place ', body: ' A real memory ', city: ' Shanghai ', tags: 'walk, 慢游,walk', poiId: '', mediaIds: ['media-one', 'media-two'], status: 'PENDING' });
const validInquiry = () => ({ modelId: 'model-immutable', quantity: 2, material: 'PLA', colorProcess: 'SINGLE', notes: '', shipping: { name: 'Traveller', phone: '+86 13800138000', region: 'Shanghai', address: 'Synthetic fixture address', postalCode: '' }, consent: true, idempotencyKey: 'stable-key-1234' });
const source = name => readFile(new URL(`../mobile/assets/js/${name}`, import.meta.url), 'utf8');

describe('online post validation', () => {
  it('trims editable text, de-duplicates tags and preserves explicit media ordering', () => {
    const result = validatePost(validPost()); assert.equal(result.ok, true);
    assert.deepEqual(result.value, { title: 'A place', body: 'A real memory', city: 'Shanghai', tags: ['walk', '慢游'], poiId: null, mediaIds: ['media-one', 'media-two'], status: 'PENDING' });
  });
  it('rejects blank/oversized required fields without silently truncating', () => {
    for (const field of ['title', 'body', 'city']) {
      assert.ok(validatePost({ ...validPost(), [field]: '  ' }).errors.includes(field));
      const result = validatePost({ ...validPost(), [field]: 'x'.repeat(POST_LIMITS[field] + 1) });
      assert.ok(result.errors.includes(field)); assert.equal(result.value[field].length, POST_LIMITS[field] + 1);
    }
  });
  it('cannot claim PUBLIC/approval, ownership or a forged price in request payloads', () => {
    for (const status of ['PUBLIC', 'HIDDEN', 'REJECTED', undefined]) assert.ok(validatePost({ ...validPost(), status }).errors.includes('status'));
    const result = validatePost({ ...validPost(), ownerId: 'someone', email: 'admin@example.test', role: 'ADMIN', price: 1 });
    assert.equal(result.value.ownerId, undefined); assert.equal(result.value.email, undefined); assert.equal(result.value.role, undefined); assert.equal(result.value.price, undefined);
  });
  it('validates tag, media and place limits and accepts text-only drafts', () => {
    assert.deepEqual(parseTags('one，two\n one, '), ['one', 'two']);
    assert.ok(validatePost({ ...validPost(), tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) }).errors.includes('tags'));
    assert.ok(validatePost({ ...validPost(), tags: ['x'.repeat(33)] }).errors.includes('tags'));
    assert.ok(validatePost({ ...validPost(), mediaIds: ['m', 'm'] }).errors.includes('media'));
    assert.ok(validatePost({ ...validPost(), mediaIds: Array.from({ length: 10 }, (_, i) => `m${i}`) }).errors.includes('media'));
    assert.ok(validatePost({ ...validPost(), poiId: 'p'.repeat(201) }).errors.includes('poiId'));
    assert.equal(validatePost({ ...validPost(), mediaIds: [], status: 'DRAFT' }).ok, true);
  });
  it('reorders immutably and ignores invalid moves', () => {
    const items = ['first', 'second', 'third'];
    assert.deepEqual(moveItem(items, 2, 0), ['third', 'first', 'second']); assert.deepEqual(items, ['first', 'second', 'third']);
    for (const indices of [[-1, 0], [0, 3], [0.5, 2]]) assert.deepEqual(moveItem(items, ...indices), items);
  });
});

describe('two-account visibility and request construction', () => {
  const items = POST_STATES.map((status, i) => ({ id: `${i}`, status, author: { id: i % 2 ? 'alice' : 'bob' } }));
  it('latest shows only backend PUBLIC posts, never legacy VISIBLE samples or pending', () => {
    assert.deepEqual(visiblePosts([...items, { id: 'local', status: 'VISIBLE', kind: 'SAMPLE' }], 'alice').map(post => post.status), ['PUBLIC']);
    assert.deepEqual(visiblePosts(items, null).map(post => post.status), ['PUBLIC']);
  });
  it('mine requires an account id and cannot leak another account drafts', () => {
    assert.deepEqual(visiblePosts(items, null, true), []);
    assert.ok(visiblePosts(items, 'alice', true).every(post => post.author.id === 'alice'));
    assert.ok(visiblePosts(items, 'bob', true).every(post => post.author.id === 'bob'));
  });
  it('comments expose public plus only own private comments', () => {
    const comments = [{ id: '1', status: 'PUBLIC', author: { id: 'bob' } }, { id: '2', status: 'PENDING', author: { id: 'alice' } }, { id: '3', status: 'PENDING', author: { id: 'bob' } }];
    assert.deepEqual(visibleComments(comments, 'alice').map(item => item.id), ['1', '2']);
    assert.deepEqual(visibleComments(comments).map(item => item.id), ['1']);
  });
  it('encodes city/search/tag/cursor values and does not invent a sort API field', () => {
    const query = postsQuery({ city: ' 上海 ', q: 'river & %', tag: '#walk', cursor: 'a+b/=', mine: true });
    const url = new URL(query, 'https://along.test');
    assert.equal(url.pathname, '/posts'); assert.equal(url.searchParams.get('city'), '上海'); assert.equal(url.searchParams.get('q'), 'river & %');
    assert.equal(url.searchParams.get('tag'), '#walk'); assert.equal(url.searchParams.get('cursor'), 'a+b/='); assert.equal(url.searchParams.get('mine'), '1'); assert.equal(url.searchParams.has('sort'), false);
    assert.equal(postsQuery(), '/posts');
  });
  it('deduplicates pagination while replacing updated entries', () => {
    assert.deepEqual(mergePage([{ id: 'a', title: 'old' }], [{ id: 'a', title: 'new' }, { id: 'b' }]), [{ id: 'a', title: 'new' }, { id: 'b' }]);
  });
});

describe('private media safety and asynchronous disposal', () => {
  const origin = 'https://along.test';
  it('accepts only authorized same-origin media/model paths', () => {
    assert.equal(safeMediaUrl('/api/media/fixture/file', origin), '/api/media/fixture/file');
    assert.equal(safeMediaUrl(`${origin}/api/media/fixture/poster`, origin), '/api/media/fixture/poster');
    for (const url of ['https://external.test/photo.jpg', '//external.test/api/media/x/file', 'javascript:alert(1)', 'data:image/png;base64,x', '/api/auth/session', '/api/media/../../admin', 'https://user:pass@along.test/api/media/x/file']) assert.equal(safeMediaUrl(url, origin), '');
    assert.equal(safeModelUrl('/api/craft-models/model/stl', origin), '/api/craft-models/model/stl');
    assert.equal(safeModelUrl('https://elsewhere.test/api/craft-models/m/glb', origin), '');
  });
  it('applies actual file type and per-kind runtime size limits', () => {
    assert.equal(mediaFileError({ type: 'image/png', size: 100 }, { imageBytes: 100 }), '');
    assert.equal(mediaFileError({ type: 'image/png', size: 101 }, { imageBytes: 100 }), 'fileSize');
    assert.equal(mediaFileError({ type: 'video/mp4', size: 201 }, { videoBytes: 200 }), 'fileSize');
    assert.equal(mediaFileError({ type: 'image/svg+xml', size: 10 }), 'fileType');
    assert.equal(mediaFileError({ type: 'image/png', size: 0 }), 'fileType');
  });
  it('rejects unconsented uploads before any request or file processing', async () => {
    await assert.rejects(uploadCommunityFile(null, { consent: false }), { code: 'CONSENT_REQUIRED' });
    await assert.rejects(uploadCommunityFile(null), { code: 'CONSENT_REQUIRED' });
  });
  it('aborts superseded requests and rejects every stale response after disposal', () => {
    const gate = createRequestGate(), first = gate.next(), second = gate.next();
    assert.equal(first.signal.aborted, true); assert.equal(gate.current(first), false); assert.equal(gate.current(second), true);
    gate.dispose(); assert.equal(second.signal.aborted, true); assert.equal(gate.current(second), false); assert.equal(gate.next().signal.aborted, true);
  });
  it('cancels media poll delays promptly', async () => {
    const controller = new AbortController(); const pending = abortableDelay(60000, controller.signal); controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    await assert.rejects(abortableDelay(60000, controller.signal), { name: 'AbortError' });
    await abortableDelay(1);
  });
});

describe('private production validation and transitions', () => {
  it('builds a minimal request with private shipping, not client price/product/owner', () => {
    const result = validateInquiry({ ...validInquiry(), product: 'FORGED', totalCents: 1, ownerId: 'another', modelVersion: 'fake' });
    assert.equal(result.ok, true); assert.equal(result.value.shipping.address, 'Synthetic fixture address');
    for (const forbidden of ['product', 'totalCents', 'ownerId', 'modelVersion']) assert.equal(result.value[forbidden], undefined);
  });
  it('checks quantity, shipping, lengths and explicit consent', () => {
    for (const quantity of [0, -1, 1.2, 1001, NaN]) assert.ok(validateInquiry({ ...validInquiry(), quantity }).errors.includes('quantity'));
    assert.ok(validateInquiry({ ...validInquiry(), consent: 'true' }).errors.includes('consent'));
    assert.ok(validateInquiry({ ...validInquiry(), shipping: { ...validInquiry().shipping, address: '' } }).errors.includes('shipping'));
    assert.ok(validateInquiry({ ...validInquiry(), shipping: { ...validInquiry().shipping, phone: '1'.repeat(33) } }).errors.includes('shipping'));
    assert.ok(validateInquiry({ ...validInquiry(), notes: 'x'.repeat(4001) }).errors.includes('notes'));
    assert.equal(validateInquiry({ ...validInquiry(), notes: 'x'.repeat(4000) }).ok, true);
  });
  it('keeps the idempotency key stable for a retry but renews it after edits', () => {
    let next = 0; const key = createSubmissionKey(() => `key-${++next}`); const input = validInquiry();
    assert.equal(key(input), 'key-1'); assert.equal(key(structuredClone(input)), 'key-1'); assert.equal(key({ ...input, quantity: 3 }), 'key-2');
  });
  it('allows latest quoted confirmation only with a real revision', () => {
    assert.equal(canConfirmInquiry({ status: 'QUOTED', quote: { revision: 2 } }), true);
    for (const sample of [{ status: 'REQUESTED', quote: { revision: 2 } }, { status: 'QUOTED', quote: null }, { status: 'QUOTED', quote: { revision: 0 } }, { status: 'QUOTED', quote: { revision: '2' } }]) assert.equal(canConfirmInquiry(sample), false);
  });
  it('forbids cancellation after production and admin skipping confirmation', () => {
    for (const status of INQUIRY_STATES) assert.equal(canCancelInquiry(status), ['REQUESTED', 'NEEDS_INFO', 'QUOTED', 'CONFIRMED'].includes(status));
    assert.deepEqual(inquiryTransitions('CONFIRMED'), ['PRODUCING', 'CANCELLED']); assert.deepEqual(inquiryTransitions('PRODUCING'), ['SHIPPED']); assert.deepEqual(inquiryTransitions('SHIPPED'), ['COMPLETED']);
    for (const status of ['REQUESTED', 'NEEDS_INFO', 'QUOTED']) assert.equal(inquiryTransitions(status).includes('PRODUCING'), false);
    for (const status of ['COMPLETED', 'CANCELLED', 'UNKNOWN']) assert.deepEqual(inquiryTransitions(status), []);
    assert.equal(canQuoteInquiry('CONFIRMED'), false); assert.equal(canQuoteInquiry('QUOTED'), true);
  });
  it('parses CNY into exact integer cents without float rounding or scientific notation', () => {
    assert.equal(parseMoney('12.34'), 1234); assert.equal(parseMoney('0.01'), 1); assert.equal(parseMoney('12.3'), 1230); assert.equal(parseMoney('0'), 0);
    for (const value of ['', '-1', '1.001', '1e3', 'Infinity', '1,000', '100000000']) assert.equal(parseMoney(value), null);
  });
});

describe('frontend rendering and translation contracts', () => {
  it('all community translation keys and placeholders match in English and Chinese', async () => {
    const en = JSON.parse(await readFile(new URL('../mobile/assets/messages/community.en.json', import.meta.url), 'utf8'));
    const zh = JSON.parse(await readFile(new URL('../mobile/assets/messages/community.zh.json', import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
    for (const key of Object.keys(en)) {
      assert.match(key, /^community\./); assert.ok(en[key].trim() && zh[key].trim());
      assert.deepEqual([...en[key].matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), [...zh[key].matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), key);
    }
    const files = ['page-stories.js', 'page-post.js', 'post-sheet.js', 'page-make-order.js', 'page-make-orders.js', 'inquiry-ui.js', 'community-ui.js'];
    const code = (await Promise.all(files.map(source))).join('\n') + await readFile(new URL('../admin/admin.js', import.meta.url), 'utf8');
    for (const [, key] of code.matchAll(/['"](community\.[A-Za-z0-9_.]+)['"]/g)) assert.ok(key in en, `missing ${key}`);
    for (const status of [...POST_STATES, ...INQUIRY_STATES]) assert.ok(`community.state.${status}` in en);
  });
  it('does not import legacy mutable posts or persist private shipping/client sessions', async () => {
    const files = ['page-stories.js', 'page-post.js', 'post-sheet.js', 'page-make-order.js', 'page-make-orders.js', 'community.js'];
    for (const file of files) {
      const code = await source(file); assert.doesNotMatch(code, /from ['"]\.\/posts\.js/); assert.doesNotMatch(code, /localStorage|sessionStorage/);
    }
  });
  it('video elements are user-operated, muted, inline and never autoplay', async () => {
    const code = await source('community-ui.js') + await source('post-sheet.js') + await readFile(new URL('../admin/admin.js', import.meta.url), 'utf8');
    const videos = [...code.matchAll(/<video\s[^>]+>/g)].map(match => match[0]); assert.ok(videos.length >= 3);
    for (const video of videos) { assert.match(video, /controls/); assert.match(video, /muted/); assert.match(video, /playsinline/); assert.doesNotMatch(video, /autoplay/); }
  });
  it('composer separates upload consent from publication and explicitly saves DRAFT/PENDING', async () => {
    const code = await source('post-sheet.js'); assert.match(code, /name="uploadConsent"/); assert.match(code, /name="publishConsent"/); assert.match(code, /value="DRAFT"/); assert.match(code, /value="PENDING"/);
    assert.match(code, /scope\.signal/); assert.match(code, /URL\.revokeObjectURL/); assert.doesNotMatch(code, /status:\s*['"]PUBLIC/);
  });
  it('admin uses same-origin API session guard, not client-stored roles or inline scripts', async () => {
    const code = await readFile(new URL('../admin/admin.js', import.meta.url), 'utf8');
    assert.match(code, /api\('\/auth\/session'/); assert.match(code, /api\('\/admin\/posts\?status=PENDING'/); assert.match(code, /getRuntimeConfig\(\)\.mode === 'development'/);
    assert.doesNotMatch(code, /localStorage|sessionStorage/);
    const html = await readFile(new URL('../admin/index.html', import.meta.url), 'utf8'); assert.match(html, /src="\.\/admin\.js"/); assert.doesNotMatch(html, /onclick=|<script>/);
  });
});
