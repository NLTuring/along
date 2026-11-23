// 小游 assistant: pure logic only (whitelist, gesture, voice settle, one-time filter, payload).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { clientActions, stashFriendsFilter, takeFriendsFilter, filterTopic, createPressGesture, createSettleSender, conversationPayload, voiceMode, HARD_SPEECH_ERRORS, FILTER_KEY } from '../assets/js/assistant-core.js';
import { mascotSvg, MASCOT_EXPRESSIONS, MASCOT_ACTIONS } from '../assets/js/assistant-mascot.js';
import { POIS } from '../assets/js/seed-places.js';
import { GUIDES } from '../assets/js/seed.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), size: () => m.size }; };

describe('assistant actions on the client', () => {
  it('maps known actions to app paths and drops anything unknown', () => {
    const actions = clientActions([
      { type: 'place', id: 'poi_zhongshan' }, { type: 'directions', id: 'poi_fake' }, { type: 'guide', id: 'guide_jiajia' },
      { type: 'open', route: 'admin' },
    ], { places: POIS, guides: GUIDES });
    assert.deepEqual(actions, [{ type: 'place', id: 'poi_zhongshan', path: 'map/poi_zhongshan' }, { type: 'guide', id: 'guide_jiajia', path: 'guides/guide_jiajia' }]);
    assert.deepEqual(clientActions([{ type: 'open', route: 'crafts' }, { type: 'friends', city: 'nanjing', kind: 'LICENSED', topic: 'History' }, { type: 'copy', text: ' 谢谢 ' }], { places: POIS, guides: GUIDES }), [
      { type: 'open', route: 'crafts', path: 'crafts' },
      { type: 'friends', filter: { city: 'nanjing', kind: 'LICENSED', topic: 'History' }, path: 'friends' },
      { type: 'copy', text: '谢谢' },
    ]);
    assert.deepEqual(clientActions([{ type: 'friends', city: 'paris', kind: 'ROBOT', topic: '<script>' }], { places: POIS, guides: GUIDES }), [{ type: 'friends', filter: {}, path: 'friends' }]);
    assert.deepEqual(clientActions({ not: 'array' }), []);
  });
  it('hands a friends filter to the next Friends render exactly once', () => {
    const storage = memory();
    assert.equal(takeFriendsFilter(storage), null);
    stashFriendsFilter({ city: 'nanjing', kind: 'LICENSED', topic: 'Architecture' }, storage);
    assert.deepEqual(takeFriendsFilter(storage), { city: 'nanjing', kind: 'LICENSED', topic: 'Architecture' });
    assert.equal(takeFriendsFilter(storage), null, 'read once');
    storage.setItem(FILTER_KEY, JSON.stringify({ city: 'paris', kind: 'X', topic: 7 }));
    assert.deepEqual(takeFriendsFilter(storage), { city: 'all', kind: 'all', topic: 'all' });
    storage.setItem(FILTER_KEY, '{broken'); assert.equal(takeFriendsFilter(storage), null);
    assert.equal(filterTopic('Street food'), 'Food'); assert.equal(filterTopic('Slow walks'), 'all'); assert.equal(filterTopic('History'), 'History');
  });
  it('sends only the last turns, starting with the user, trimmed like the server expects', () => {
    const history = [{ role: 'assistant', text: 'hi' }, ...Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i} ` + 'x'.repeat(i === 13 ? 1200 : 0) }))];
    const body = conversationPayload(history, { locale: 'zh', route: 'friends', city: 'nanjing' });
    assert.ok(body.messages.length <= 12); assert.equal(body.messages[0].role, 'user');
    assert.ok(body.messages.every((m) => m.text.length <= 1000));
    assert.equal(body.locale, 'zh'); assert.equal(body.route, 'friends'); assert.equal(body.city, 'nanjing');
    const odd = conversationPayload([{ role: 'user', text: 'hello' }], { locale: 'fr', route: '../x', city: 'paris' });
    assert.deepEqual(odd, { messages: [{ role: 'user', text: 'hello' }], locale: 'en' });
  });
});

describe('tap versus long-press', () => {
  const clock = () => {
    let t = 0, id = 0; const timers = new Map();
    return { now: () => t, schedule: (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id; }, clear: (i) => timers.delete(i), frame: () => 0,
      advance(ms) { t += ms; for (const [i, x] of [...timers]) if (x.at <= t) { timers.delete(i); x.fn(); } } };
  };
  it('a short press is a tap and never a long-press', () => {
    const c = clock(), log = [];
    const g = createPressGesture({ threshold: 500, ...c, onTap: () => log.push('tap'), onLong: () => log.push('long'), onRelease: () => log.push('release') });
    g.down(10, 10); c.advance(200); g.up(); c.advance(1000);
    assert.deepEqual(log, ['tap']);
  });
  it('holding past the threshold fires once and releases instead of tapping', () => {
    const c = clock(), log = [];
    const g = createPressGesture({ threshold: 500, ...c, onTap: () => log.push('tap'), onLong: () => log.push('long'), onRelease: () => log.push('release') });
    g.down(); c.advance(520); c.advance(2000); g.up();
    assert.deepEqual(log, ['long', 'release']);
  });
  it('moving away cancels, both before and after the threshold', () => {
    const c = clock(), log = [];
    const g = createPressGesture({ threshold: 500, slop: 14, ...c, onTap: () => log.push('tap'), onLong: () => log.push('long'), onCancel: ({ afterLong }) => log.push(`cancel:${afterLong}`) });
    g.down(0, 0); c.advance(100); g.move(30, 0); g.up(); c.advance(800);
    g.down(0, 0); c.advance(600); g.move(0, 40); g.up();
    assert.deepEqual(log, ['cancel:false', 'long', 'cancel:true']);
    g.down(0, 0); g.move(5, 5); c.advance(100); g.up(); assert.equal(log.at(-1), 'tap', 'small jitter is still a tap');
  });
});

describe('keyboard voice input', () => {
  it('sends once after the dictated text settles, and only when armed', () => {
    let t = 0, id = 0; const timers = new Map(); const sent = [];
    const s = createSettleSender({ delay: 1200, send: () => sent.push(t), schedule: (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id; }, clear: (i) => timers.delete(i) });
    const advance = (ms) => { t += ms; for (const [i, x] of [...timers]) if (x.at <= t) { timers.delete(i); x.fn(); } };
    s.input('ignored, not armed'); advance(2000); assert.equal(sent.length, 0);
    s.arm(); s.input('请带'); advance(600); s.input('请带我去中山陵'); advance(1100); assert.equal(sent.length, 0);
    advance(200); assert.equal(sent.length, 1); assert.equal(s.armed, false);
    s.input('more'); advance(5000); assert.equal(sent.length, 1, 'sends once per voice turn');
    s.arm(); assert.equal(s.flush('   '), false); assert.equal(s.flush('谢谢'), true); assert.equal(sent.length, 2);
  });
});

describe('choosing how to listen', () => {
  it('uses the keyboard inside the Android shell even though WebView exposes speech recognition', () => {
    const webview = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36';
    assert.equal(voiceMode({ hasRecognition: true, origin: 'https://appassets.androidplatform.net' }), 'keyboard');
    assert.equal(voiceMode({ hasRecognition: true, origin: 'https://tokennext.top', userAgent: webview }), 'keyboard');
    assert.equal(voiceMode({ hasRecognition: true, origin: 'https://tokennext.top', nativeBridge: true }), 'keyboard');
  });
  it('uses page recognition in a real browser until it fails once', () => {
    const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
    assert.equal(voiceMode({ hasRecognition: true, origin: 'https://tokennext.top', userAgent: chrome }), 'web');
    assert.equal(voiceMode({ hasRecognition: true, origin: 'https://tokennext.top', userAgent: chrome, failed: true }), 'keyboard');
    assert.equal(voiceMode({ hasRecognition: false, origin: 'https://tokennext.top', userAgent: chrome }), 'keyboard');
    for (const e of ['not-allowed', 'service-not-allowed', 'audio-capture', 'network']) assert.ok(HARD_SPEECH_ERRORS.has(e), e);
    assert.ok(!HARD_SPEECH_ERRORS.has('no-speech') && !HARD_SPEECH_ERRORS.has('aborted'));
  });
  it('waits while the input method is still composing dictated text', () => {
    let t = 0, id = 0, busy = true; const timers = new Map(); const sent = [];
    const s = createSettleSender({ delay: 1000, isBusy: () => busy, send: () => sent.push(t), schedule: (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id; }, clear: (i) => timers.delete(i) });
    const advance = (ms) => { for (let k = 0; k < ms; k += 100) { t += 100; for (const [i, x] of [...timers]) if (x.at <= t) { timers.delete(i); x.fn(); } } };
    s.arm(); s.input('请带我去'); advance(3000); assert.equal(sent.length, 0, 'held while composing');
    busy = false; advance(1100); assert.equal(sent.length, 1);
  });
});

describe('character, copy and wiring', () => {
  it('renders every expression and action, with a head-and-shoulders crop for avatars', () => {
    for (const e of MASCOT_EXPRESSIONS) for (const a of MASCOT_ACTIONS) assert.match(mascotSvg({ expression: e, action: a }), new RegExp(`data-e="${e}" data-a="${a}"`));
    assert.match(mascotSvg({ crop: 'avatar' }), /viewBox="20 52 160 160"/);
    assert.match(mascotSvg({ expression: '<x>', action: 'evil' }), /data-e="normal" data-a="idle"/);
  });
  it('has matching Chinese and English copy and is off by default', async () => {
    const [en, zh] = await Promise.all(['en', 'zh'].map(async (l) => JSON.parse(await readFile(new URL(`../assets/messages/assistant.${l}.json`, import.meta.url), 'utf8'))));
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
    for (const k of Object.keys(en)) assert.deepEqual([...en[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]), [...zh[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]), k);
    const ui = await readFile(new URL('../assets/js/ui.js', import.meta.url), 'utf8');
    assert.match(ui, /assistant: false/);
  });
  it('keeps conversations out of persistent storage and the API key out of the web layer', async () => {
    const source = await readFile(new URL('../assets/js/assistant.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage/); assert.doesNotMatch(source, /hualong|sk-[A-Za-z0-9]{10}/i);
    assert.match(source, /api\('\/assistant\/chat'/);
  });
  it('keeps the server catalog in sync with the seed data', () => {
    const script = fileURLToPath(new URL('./build-assistant-catalog.mjs', import.meta.url));
    assert.match(execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' }), /up to date/);
  });
});
