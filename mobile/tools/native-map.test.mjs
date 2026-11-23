import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initNativeMapBridge, isNativeMapAvailable, clipNativeRect, nativeMapPayload,
  nativeLocationPoint, nativeViewportRect, createNativeMapSession, nativePlace, samplePath,
  MAX_MAP_POIS, MAX_PATH_POINTS } from '../assets/js/native-map.js';
import { routeSteps, simplifyPath, turnKind, compassOf, bearing, distanceMeters, pathMeters,
  distanceParts, durationParts } from '../assets/js/map-guide.js';
import { tripKeywords, createPlaceCache, PLACE_TTL_MS } from '../assets/js/map-places.js';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
class Events {
  listeners = new Map();
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  fire(type, extra = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ type, ...extra }); }
}
function fixture({ available = true } = {}) {
  const win = new Events();
  const doc = new Events();
  const frames = new Map();
  const timers = new Map();
  const observers = [];
  const calls = [];
  const classes = new Set();
  const properties = new Map();
  let id = 0;
  let prepares = 0;
  let locations = 0;
  const html = { dataset: { route: 'map' }, classList: { contains: () => false },
    style: { setProperty: (key, value) => properties.set(key, value), removeProperty: (key) => properties.delete(key) } };
  const body = { classList: { contains: (name) => classes.has(name) }, parentElement: html };
  const overlay = { childElementCount: 0 };
  const viewport = { isConnected: true, parentElement: body,
    rect: { left: 20.25, top: 180.5, right: 379.8, bottom: 500.9 },
    getBoundingClientRect() { return this.rect; } };
  doc.documentElement = html; doc.body = body; doc.hidden = false;
  doc.getElementById = (name) => name === 'overlay' ? overlay : null;
  doc.querySelector = () => null;
  Object.assign(win, {
    innerWidth: 400, innerHeight: 800, devicePixelRatio: 3,
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(key) { frames.delete(key); },
    setTimeout(fn) { timers.set(++id, fn); return id; },
    clearTimeout(key) { timers.delete(key); },
    getComputedStyle: (element) => element.style || { overflowX: 'visible', overflowY: 'visible' },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    ResizeObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  });
  const searches = [];
  const routes = [];
  const android = Object.freeze({
    setMap(raw) { assert.equal(typeof raw, 'string'); calls.push(JSON.parse(raw)); },
    prepareExperience() { prepares++; }, getLocation() { locations++; }, getAppConfig() {},
    searchCity(raw) { assert.equal(typeof raw, 'string'); searches.push(JSON.parse(raw)); },
    searchTravelRoute(raw) { assert.equal(typeof raw, 'string'); routes.push(JSON.parse(raw)); },
  });
  if (available) win.Android = android;
  return { win, doc, html, viewport, overlay, classes, calls, frames, timers, observers, properties, searches, routes,
    get prepares() { return prepares; }, get locations() { return locations; },
    inject() { win.Android = android; win.fire('nativeReady'); },
    frame() { const work = [...frames.values()]; frames.clear(); work.forEach((fn) => fn()); },
    expire() { const work = [...timers.values()]; timers.clear(); work.forEach((fn) => fn()); },
    mutate() { observers.filter((o) => !o.disconnected).forEach((o) => o.fn()); },
  };
}
function mount(f) {
  const states = [];
  const session = createNativeMapSession({ viewport: f.viewport, win: f.win, doc: f.doc, onState: (s) => states.push(s) });
  return { session, states };
}
async function ready(f, session) {
  session.load(); f.frame();
  f.win.onNativeMapEvent(JSON.stringify({ type: 'ready', success: true }));
  await flush(); f.frame();
}

test('frozen bridge, delayed injection and callbacks are preserved; dispatch is asynchronous', async () => {
  const f = fixture({ available: false });
  let previous = 0;
  f.win.onNativeMapEvent = () => { previous++; throw new Error('independent callback'); };
  const bridge = initNativeMapBridge(f.win);
  assert.equal(bridge, initNativeMapBridge(f.win));
  assert.equal(isNativeMapAvailable(f.win), false);
  const events = [];
  bridge.subscribe((e) => events.push(e));
  f.inject();
  assert.equal(isNativeMapAvailable(f.win), true);
  assert.equal(Object.isFrozen(f.win.Android), true);
  f.win.onNativeMapEvent('{bad JSON');
  f.win.onNativeMapEvent({ type: 'auth', success: false, code: 230 });
  assert.equal(events.length, 0);
  assert.equal(previous, 2);
  await flush();
  assert.equal(events[0].channel, 'bridge');
  assert.equal(events[1].data.code, 230);
  assert.equal(f.prepares, 0);
  assert.equal(f.locations, 0);
});

test('queued callback recipients do not leak into new or disposed subscriptions', async () => {
  const f = fixture(); const bridge = initNativeMapBridge(f.win);
  let old = 0; let next = 0;
  const unsub = bridge.subscribe(() => { old++; });
  f.win.onNativeMapEvent({ type: 'ready' });
  unsub(); bridge.subscribe(() => { next++; });
  await flush();
  assert.equal(old, 0); assert.equal(next, 0);
  f.win.onNativeLocation(JSON.stringify({ success: false, message: 'denied' }));
  await flush(); assert.equal(next, 1);
});

test('payload uses clipped CSS pixels without DPR, exact empty POIs/routes and bounded zoom', () => {
  const f = fixture();
  const rect = nativeViewportRect(f.viewport, f.win, f.doc);
  assert.deepEqual(rect, { x: 21, y: 181, width: 358, height: 319 });
  const p = nativeMapPayload({ rect, center: { lat: 32, lng: 118 }, city: '南京', zoom: 99 });
  assert.equal(p.rect.width, 358); assert.equal(p.zoom, 19);
  for (const key of ['pois', 'selectedIds', 'route', 'routePath']) assert.deepEqual(p[key], []);
  assert.deepEqual(p.categories, ['景点']); assert.equal(p.topFade, 0); assert.equal(p.bottomFade, 0);
  assert.equal(p.appearance, 'light'); assert.equal(p.focusId, '');
  assert.equal(nativeMapPayload({ ...p, zoom: -1 }).zoom, 4);
  assert.throws(() => nativeMapPayload({ ...p, center: { lat: '32', lng: 118 } }));
  assert.throws(() => nativeMapPayload({ ...p, center: { lat: 91, lng: 118 } }));
  assert.throws(() => nativeMapPayload({ ...p, rect: { ...rect, width: NaN } }));
  assert.equal(clipNativeRect({ left: 0, top: 900, right: 100, bottom: 950 }, { left: 0, top: 0, right: 400, bottom: 800 }), null);
});

test('layout clips ancestor overflow and visual viewport; scaled pages fail closed', () => {
  const f = fixture();
  f.viewport.parentElement = { parentElement: f.doc.body, style: { overflowX: 'hidden', overflowY: 'auto' },
    getBoundingClientRect: () => ({ left: 40, right: 300, top: 200, bottom: 450 }) };
  assert.deepEqual(nativeViewportRect(f.viewport, f.win, f.doc), { x: 40, y: 200, width: 260, height: 250 });
  f.win.visualViewport = { scale: 1, width: 400, height: 350, offsetTop: 0, offsetLeft: 0 };
  assert.equal(nativeViewportRect(f.viewport, f.win, f.doc).height, 150);
  f.win.visualViewport.scale = 2;
  assert.equal(nativeViewportRect(f.viewport, f.win, f.doc), null);
});

test('explicit load only, auth is not readiness, consent denial closes and retry is manual', async () => {
  const f = fixture(); const { session, states } = mount(f);
  f.frame(); assert.equal(f.prepares, 0); assert.equal(f.calls.length, 0);
  session.locate(); assert.equal(f.locations, 0);
  session.load(); assert.equal(f.prepares, 1); f.frame();
  assert.equal(f.calls.at(-1).visible, true);
  assert.equal(f.html.dataset.nativeMapAperture, undefined);
  f.win.onNativeMapEvent({ type: 'auth', success: true }); await flush(); f.frame();
  assert.equal(f.html.dataset.nativeMapAperture, undefined);
  f.win.onNativeMapEvent({ type: 'consent', success: false, message: 'consent required' }); await flush();
  assert.equal(states.at(-1).phase, 'consent'); assert.equal(f.calls.at(-1).visible, false);
  f.win.onNativeMapEvent({ type: 'ready', success: true }); await flush(); f.frame();
  assert.equal(f.html.dataset.nativeMapAperture, undefined);
  await ready(f, session);
  assert.equal(f.prepares, 2); assert.equal(f.html.dataset.nativeMapAperture, 'open');
  session.dispose();
});

test('timeout is distinct from auth failure and late callbacks cannot revive a timed-out load', async () => {
  const f = fixture(); const { session, states } = mount(f);
  session.load(); f.frame(); f.expire();
  assert.equal(states.at(-1).phase, 'timeout');
  f.win.onNativeMapEvent({ type: 'ready' }); await flush(); f.frame();
  assert.equal(f.html.dataset.nativeMapAperture, undefined);
  session.load(); f.frame();
  f.win.onNativeMapEvent(JSON.stringify({ type: 'auth', success: false, code: 230, message: 'key rejected' }));
  await flush();
  assert.equal(states.at(-1).phase, 'auth'); assert.equal(states.at(-1).code, '230');
  assert.equal(states.at(-1).message, 'key rejected');
  session.dispose();
});

test('resize/scroll coalescing; overlay, hidden document, route leave and disposal close hit region', async () => {
  const f = fixture(); const { session } = mount(f);
  await ready(f, session);
  assert.equal(f.properties.get('--native-map-x'), '21px');
  const count = f.calls.length;
  for (let i = 0; i < 10; i++) f.win.fire('scroll');
  assert.equal(f.frames.size, 1); assert.equal(f.calls.length, count + 1);
  assert.equal(f.html.dataset.nativeMapAperture, undefined);
  f.frame(); assert.equal(f.html.dataset.nativeMapAperture, 'open');
  f.overlay.childElementCount = 1; f.mutate(); f.frame();
  assert.equal(f.calls.at(-1).visible, false); assert.equal(f.html.dataset.nativeMapAperture, undefined);
  f.overlay.childElementCount = 0; f.mutate(); f.frame();
  assert.equal(f.html.dataset.nativeMapAperture, 'open');
  f.doc.hidden = true; f.doc.fire('visibilitychange'); f.frame();
  assert.equal(f.calls.at(-1).visible, false);
  f.doc.hidden = false; f.doc.fire('visibilitychange'); f.frame();
  assert.equal(f.html.dataset.nativeMapAperture, 'open');
  f.html.dataset.route = 'trip'; f.mutate(); f.frame();
  assert.equal(f.calls.at(-1).visible, false);
  session.dispose(); session.dispose();
  assert.equal(f.html.dataset.nativeMap, undefined); assert.equal(f.properties.size, 0);
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  assert.ok(f.observers.every((o) => o.disconnected));
  const after = f.calls.length;
  f.win.fire('resize'); f.win.onNativeMapEvent({ type: 'ready' }); await flush(); f.frame();
  assert.equal(f.calls.length, after);
});

test('location validates BD09, finite coordinates, age and accuracy; never invokes automatically', async () => {
  const now = Date.now();
  const good = { success: true, lat: 31.2, lng: 121.4, coordinateSystem: 'BD09', accuracy: 20, createdAt: now };
  assert.equal(nativeLocationPoint(good, now, now).crs, 'BD09');
  for (const bad of [{ lat: NaN }, { lng: 200 }, { lat: '31' }, { coordinateSystem: 'WGS84' }, { createdAt: now - 30000 }, { createdAt: undefined }, { accuracy: -1 }]) {
    assert.equal(nativeLocationPoint({ ...good, ...bad }, now, now), null);
  }
  const f = fixture(); const { session, states } = mount(f);
  await ready(f, session); assert.equal(f.locations, 0);
  f.win.onNativeLocation(good); await flush(); assert.equal(states.at(-1).point, null);
  session.locate(); assert.equal(f.locations, 1);
  f.win.onNativeLocation({ ...good, createdAt: now - 30000 }); await flush();
  assert.equal(states.at(-1).locating, true);
  f.win.onNativeLocation(JSON.stringify({ ...good, createdAt: Date.now() })); await flush(); f.frame();
  assert.equal(states.at(-1).locating, false); assert.equal(states.at(-1).point.crs, 'BD09');
  assert.deepEqual(f.calls.at(-1).center, { lat: good.lat, lng: good.lng });
  session.setCity('南京'); assert.equal(states.at(-1).point, null);
  session.locate(); f.expire(); assert.equal(states.at(-1).code, 'location-timeout');
  f.win.onNativeLocation({ ...good, createdAt: Date.now() }); await flush();
  assert.equal(states.at(-1).point, null);
  session.dispose();
});

test('dispose/remount drops queued ready and location deliveries', async () => {
  const f = fixture(); const first = mount(f);
  first.session.load(); f.frame();
  f.win.onNativeMapEvent({ type: 'ready' });
  first.session.dispose();
  const second = mount(f);
  await flush(); f.frame();
  assert.equal(second.states.at(-1).phase, 'idle');
  assert.equal(f.html.dataset.nativeMapAperture, undefined);
  await ready(f, second.session);
  second.session.locate();
  f.win.onNativeLocation({ success: true, lat: 32, lng: 118, coordinateSystem: 'BD09', createdAt: Date.now() });
  second.session.dispose();
  const third = mount(f); await flush();
  assert.equal(third.states.at(-1).point, null);
  third.session.dispose();
});

test('hidden to visible ready replay does not loop; status reflow remeasures before reopening', async () => {
  const f = fixture();
  const session = createNativeMapSession({ viewport: f.viewport, win: f.win, doc: f.doc, onState(state) {
    if (state.locating) f.viewport.rect = { ...f.viewport.rect, top: 220.5, bottom: 540.9 };
  } });
  await ready(f, session);
  f.win.fire('scroll'); f.frame();
  const count = f.calls.length;
  f.win.onNativeMapEvent({ type: 'ready', success: true });
  f.win.onNativeMapEvent({ type: 'auth', success: true });
  await flush(); f.frame();
  assert.equal(f.calls.length, count);
  assert.equal(f.html.dataset.nativeMapAperture, 'open');
  session.locate();
  assert.equal(f.html.dataset.nativeMapAperture, undefined);
  assert.equal(f.calls.at(-1).visible, false);
  f.frame();
  assert.equal(f.calls.at(-1).rect.y, 221);
  assert.equal(f.properties.get('--native-map-y'), '221px');
  session.dispose();
});

test('feature translations are complete, disjoint from base and CSS is scoped', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
  const en = JSON.parse(await read('../assets/messages/native-map.en.json'));
  const zh = JSON.parse(await read('../assets/messages/native-map.zh.json'));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const locale of ['en', 'zh']) {
    const base = JSON.parse(await read(`../assets/messages/${locale}.json`));
    for (const key of Object.keys(en)) { assert.ok(key.startsWith('native_map.')); assert.equal(Object.hasOwn(base, key), false); }
  }
  const css = await read('../assets/css/native-map.css');
  assert.equal(css.includes('mask-image'), false);
  assert.ok(css.includes("[data-native-map-aperture='open']"));
  const page = await read('../assets/js/page-native-map.js');
  assert.doesNotMatch(page, /place\.(lat|lng)|loadBaidu|geocode\(|openExternal|fetch\(/);
  assert.ok(page.includes('baiduDirections('));
  // Names and routes come from the shell's own search and route calls, never from seed coordinates.
  assert.match(page, /session\.search\(/); assert.match(page, /session\.walkingRoute\(/); assert.match(page, /session\.setOverlay\(/);
  assert.doesNotMatch(page, /stop\.(lat|lng)|POIS\[[^\]]+\]\.(lat|lng)/);
  for (const key of page.matchAll(/['"`](native_map\.[a-z_]+)['"`]/g)) assert.ok(key[1] in en || key[1].endsWith('_'), key[1]);
  for (const type of ['depart', 'left', 'right', 'slight_left', 'slight_right', 'sharp_left', 'sharp_right', 'uturn', 'arrive']) assert.ok(`native_map.step_${type}` in en, type);
  for (const dir of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) assert.ok(`native_map.dir_${dir}` in en, dir);
  for (const gone of ['native_map.limitation', 'native_map.approximate']) assert.equal(gone in en, false, 'the bridge does search and route');
});

const spot = (id, name, lat, lng, more = {}) => ({ id, name, lat, lng, ...more });

test('map payload names places: ids deduplicated, bad points dropped, selection limited to drawn places', () => {
  const f = fixture(); const rect = nativeViewportRect(f.viewport, f.win, f.doc);
  const base = { rect, center: { lat: 31.2, lng: 121.5 }, city: '上海' };
  const p = nativeMapPayload({ ...base, pois: [
    spot('a', '  豫园  ', 31.23, 121.49, { rank: 0, routeNumber: 2 }), spot('a', '重复', 31, 121),
    spot('b', 'x'.repeat(90), 31.24, 121.5, { rank: -4, routeNumber: 0 }), spot('', '无编号', 31, 121),
    spot('c', '', 31, 121), spot('d', '越界', 99, 121), spot('e', '文字坐标', '31', 121), null, 'junk',
  ], selectedIds: ['a', 'zzz', 'b'], focusId: 'zzz' });
  assert.deepEqual(p.pois.map((poi) => poi.id), ['a', 'b']);
  assert.deepEqual(p.pois[0], { id: 'a', name: '豫园', lat: 31.23, lng: 121.49, category: '景点', rank: 0, routeNumber: 2 });
  assert.equal(p.pois[1].name.length, 40); assert.equal(p.pois[1].rank, 2); assert.equal('routeNumber' in p.pois[1], false);
  assert.deepEqual(p.selectedIds, ['a', 'b']); assert.equal(p.focusId, '');
  assert.equal(nativeMapPayload({ ...base, pois: [spot('a', '甲', 31, 121)], focusId: 'a' }).focusId, 'a');
  const many = Array.from({ length: MAX_MAP_POIS + 30 }, (_, i) => spot(`p${i}`, `地点${i}`, 31 + i / 1000, 121));
  assert.equal(nativeMapPayload({ ...base, pois: many }).pois.length, MAX_MAP_POIS);
  assert.deepEqual(p.categories, ['景点'], 'every marker is in the one category the shell is told to draw');
});

test('map payload draws a route only from valid points and frames it once per fitKey', () => {
  const f = fixture(); const rect = nativeViewportRect(f.viewport, f.win, f.doc);
  const base = { rect, center: { lat: 31.2, lng: 121.5 }, city: '上海' };
  const ends = [{ lat: 31.2, lng: 121.4, name: 'ignored' }, { lat: 31.3, lng: 121.5 }];
  const long = Array.from({ length: MAX_PATH_POINTS * 2 + 7 }, (_, i) => ({ lat: 31.2 + i / 1e5, lng: 121.4 }));
  const p = nativeMapPayload({ ...base, route: [...ends, { lat: NaN, lng: 1 }], routePath: [...long, { lat: 200, lng: 1 }], fitKey: 'a>b' });
  assert.deepEqual(p.route, [{ lat: 31.2, lng: 121.4 }, { lat: 31.3, lng: 121.5 }]);
  assert.equal(p.routePath.length, MAX_PATH_POINTS);
  assert.deepEqual(p.routePath[0], long[0]); assert.deepEqual(p.routePath.at(-1), long.at(-1));
  assert.equal(p.fitKey, 'a>b'); assert.deepEqual(p.fitRect, { left: 40, top: 40, right: 40, bottom: 40 });
  assert.ok(JSON.stringify(p).length < 1_048_576, 'the shell refuses a setMap payload over 1 MB');
  assert.equal('fitKey' in nativeMapPayload({ ...base, fitKey: 'a>b' }), false, 'nothing to frame without a route');
  assert.equal('fitKey' in nativeMapPayload({ ...base, route: ends, fitKey: 'a>b', pois: [spot('a', '甲', 31, 121)], focusId: 'a' }), false);
  assert.deepEqual(samplePath([{ lat: 1, lng: 1 }, { lat: 'x', lng: 1 }, { lat: 2, lng: 2 }], 10), [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]);
  assert.deepEqual(samplePath(null), []);
});

test('search results keep Baidu\'s name and BD-09 point; empty or impossible places are refused', () => {
  assert.deepEqual(nativePlace({ id: ' baidu-1 ', name: ' 豫园 ', lat: 31.23, lng: 121.49, address: '福佑路168号', district: '黄浦区', city: '上海', rank: 3, source: '百度地图' }),
    { id: 'baidu-1', name: '豫园', lat: 31.23, lng: 121.49, crs: 'BD09', address: '福佑路168号', district: '黄浦区', city: '上海' });
  for (const bad of [null, {}, { id: 'x', name: 'y', lat: 0, lng: 0 }, { id: 'x', name: 'y', lat: '31', lng: 121 }, { id: '', name: 'y', lat: 31, lng: 121 }, { id: 'x', name: 5, lat: 31, lng: 121 }, { id: 'x', name: 'y', lat: 31, lng: 181 }]) assert.equal(nativePlace(bad), null);
});

test('place searches run one at a time and settle only on their own reply', async () => {
  const f = fixture(); const bridge = initNativeMapBridge(f.win);
  assert.equal(bridge.canSearch(), true); assert.equal(bridge.canRoute(), true);
  const first = bridge.search('上海', '  豫园  '), second = bridge.search('上海', '外滩');
  assert.equal(f.searches.length, 1, 'the shell refuses concurrent searches as BUSY');
  assert.deepEqual({ city: f.searches[0].city, keyword: f.searches[0].keyword }, { city: '上海', keyword: '豫园' });
  f.win.onNativeCitySearch(JSON.stringify({ id: 'someone-else', success: true, places: [spot('x', '别人的', 31, 121)] }));
  f.win.onNativeCitySearch('{broken');
  assert.equal(f.searches.length, 1);
  f.win.onNativeCitySearch(JSON.stringify({ id: f.searches[0].id, success: true, city: '上海', places: [spot('baidu-1', '豫园', 31.23, 121.49), spot('bad', '坏点', 0, 0), 'junk'] }));
  const found = await first;
  assert.deepEqual(found.places.map((p) => p.id), ['baidu-1']); assert.equal(found.keyword, '豫园');
  assert.equal(f.searches.length, 2); assert.notEqual(f.searches[1].id, f.searches[0].id);
  f.win.onNativeCitySearch({ id: f.searches[1].id, success: false, code: 'RESULT_NOT_FOUND', error: '没有找到地点，请换个关键词' });
  await assert.rejects(second, { code: 'RESULT_NOT_FOUND', message: '没有找到地点，请换个关键词' });
  await assert.rejects(bridge.search('上海', '   '), { code: 'SEARCH_INVALID' });
  await assert.rejects(bridge.search('', '豫园'), { code: 'SEARCH_INVALID' });
  assert.equal(f.searches.length, 2);
});

test('a search that never answers times out, a refused one fails at once, and the queue moves on', async () => {
  const f = fixture(); const bridge = initNativeMapBridge(f.win);
  const silent = bridge.search('南京', '夫子庙'), next = bridge.search('南京', '中山陵');
  f.expire();
  await assert.rejects(silent, { code: 'SEARCH_TIMEOUT' });
  assert.equal(f.searches.length, 2);
  // Without map consent the shell throws: the refusal arrives on onNativeResult, not on the search callback.
  f.win.onNativeResult(JSON.stringify({ action: 'searchCity', success: false, message: '请先开启地图权限' }));
  await assert.rejects(next, { code: 'SEARCH_REJECTED', message: '请先开启地图权限' });
  f.win.onNativeCitySearch({ id: f.searches[0].id, success: true, places: [spot('late', '迟到', 32, 118)] });
  f.win.onNativeResult({ action: 'openExternal', success: true, message: '已在浏览器打开链接' });
  const after = bridge.search('南京', '鸡鸣寺');
  assert.equal(f.searches.length, 3);
  f.win.onNativeCitySearch({ id: f.searches[2].id, success: true, places: [] });
  assert.deepEqual((await after).places, []);
});

test('a page that leaves drops its queued searches without freeing a slot the shell still holds', async () => {
  const f = fixture(); const bridge = initNativeMapBridge(f.win); const page = {}, other = {};
  const active = bridge.search('上海', '甲', { owner: page }), queued = bridge.search('上海', '乙', { owner: page });
  const kept = bridge.search('上海', '丙', { owner: other });
  bridge.cancel(page);
  await assert.rejects(active, { code: 'CANCELLED' }); await assert.rejects(queued, { code: 'CANCELLED' });
  assert.equal(f.searches.length, 1, 'the next search waits for the one already inside the shell');
  f.win.onNativeCitySearch({ id: f.searches[0].id, success: true, places: [spot('a', '甲', 31, 121)] });
  assert.equal(f.searches.length, 2); assert.equal(f.searches[1].keyword, '丙');
  f.win.onNativeCitySearch({ id: f.searches[1].id, success: true, places: [spot('c', '丙', 31, 121)] });
  assert.equal((await kept).places[0].id, 'c');
});

test('walking routes: only the latest counts, results are validated, refusals and timeouts reject', async () => {
  const f = fixture(); const bridge = initNativeMapBridge(f.win);
  const a = { lat: 31.2, lng: 121.4 }, b = { lat: 31.21, lng: 121.41 };
  for (const stops of [[a], [], null, [a, { lat: NaN, lng: 1 }], Array.from({ length: 21 }, () => a)]) await assert.rejects(bridge.walkingRoute(stops), { code: 'ROUTE_INVALID' });
  assert.equal(f.routes.length, 0);
  const first = bridge.walkingRoute([{ ...a, name: 'not sent' }, b]);
  assert.deepEqual(f.routes[0].stops, [a, b]);
  const second = bridge.walkingRoute([a, b]);
  await assert.rejects(first, { code: 'SUPERSEDED' }, 'the shell destroys the search in flight when a new one starts');
  f.win.onNativeTravelRoute({ id: f.routes[0].id, success: true, path: [a, b], legs: [{ distance: 1, duration: 1 }] });
  f.win.onNativeTravelRoute(JSON.stringify({ id: f.routes[1].id, success: true, path: [a, { lat: 31.205, lng: 121.405 }, { lat: 'x', lng: 1 }, b], legs: [{ distance: 1500, duration: 1200 }] }));
  const route = await second;
  assert.equal(route.path.length, 3); assert.equal(route.meters, 1500); assert.equal(route.seconds, 1200);
  assert.deepEqual(route.legs, [{ meters: 1500, seconds: 1200 }]);
  for (const reply of [{ success: true, path: [a], legs: [{ distance: 1, duration: 1 }] }, { success: true, path: [a, b], legs: [] }, { success: true, path: [a, b], legs: [{ distance: -1, duration: 1 }] }, { success: true, path: [a, b], legs: [{ distance: 'far', duration: 1 }] }]) {
    const pending = bridge.walkingRoute([a, b]);
    f.win.onNativeTravelRoute({ id: f.routes.at(-1).id, ...reply });
    await assert.rejects(pending, { code: 'ROUTE_INVALID' });
  }
  const none = bridge.walkingRoute([a, b]);
  f.win.onNativeTravelRoute({ id: f.routes.at(-1).id, success: false, code: 'RESULT_NOT_FOUND', error: '未找到可步行到达的道路，可调整地点后重试' });
  await assert.rejects(none, { code: 'RESULT_NOT_FOUND' });
  const refused = bridge.walkingRoute([a, b]);
  f.win.onNativeResult({ action: 'searchTravelRoute', success: false, message: '请先开启地图' });
  await assert.rejects(refused, { code: 'ROUTE_REJECTED', message: '请先开启地图' });
  const slow = bridge.walkingRoute([a, b]); f.expire();
  await assert.rejects(slow, { code: 'ROUTE_TIMEOUT' });
});

test('session: names and route reach the map without closing it; search and routes need a ready map', async () => {
  const f = fixture(); const picked = [];
  const session = createNativeMapSession({ viewport: f.viewport, win: f.win, doc: f.doc, onSelect: (id) => picked.push(id) });
  await assert.rejects(session.search('豫园'), { code: 'NOT_READY' });
  await assert.rejects(session.walkingRoute([{ lat: 31, lng: 121 }, { lat: 31.1, lng: 121.1 }]), { code: 'NOT_READY' });
  session.load(); f.frame();
  f.win.onNativeMapEvent({ type: 'select', id: 'baidu-1' }); await flush();
  assert.deepEqual(picked, [], 'marker taps before the map is ready are not this page\'s');
  f.win.onNativeMapEvent({ type: 'ready', success: true }); await flush(); f.frame();
  assert.equal(f.html.dataset.nativeMapAperture, 'open');
  const before = f.calls.length;
  session.setOverlay({ pois: [spot('baidu-1', '豫园', 31.23, 121.49), spot('along-origin', '我的位置', 31.22, 121.48)], selectedIds: ['baidu-1'],
    route: [{ lat: 31.22, lng: 121.48 }, { lat: 31.23, lng: 121.49 }], routePath: [{ lat: 31.22, lng: 121.48 }, { lat: 31.225, lng: 121.485 }, { lat: 31.23, lng: 121.49 }], fitKey: 'k1' });
  assert.equal(f.calls.length, before, 'coalesced to the next frame');
  f.frame();
  assert.equal(f.calls.length, before + 1); assert.equal(f.calls.at(-1).visible, true, 'the map is not hidden to change its markers');
  assert.deepEqual(f.calls.at(-1).pois.map((poi) => poi.name), ['豫园', '我的位置']);
  assert.equal(f.calls.at(-1).routePath.length, 3); assert.equal(f.calls.at(-1).fitKey, 'k1');
  assert.equal(f.html.dataset.nativeMapAperture, 'open');
  session.setOverlay({ pois: [spot('baidu-1', '豫园', 31.23, 121.49)] }); f.frame();
  assert.deepEqual(f.calls.at(-1).route, []); assert.equal('fitKey' in f.calls.at(-1), false);
  f.win.onNativeMapEvent(JSON.stringify({ type: 'select', id: 'baidu-1' })); f.win.onNativeMapEvent({ type: 'select', id: 7 }); f.win.onNativeMapEvent({ type: 'select', id: '' }); await flush();
  assert.deepEqual(picked, ['baidu-1']);
  session.view({ lat: 31.23, lng: 121.49 }, 15); f.frame();
  assert.deepEqual(f.calls.at(-1).center, { lat: 31.23, lng: 121.49 }); assert.equal(f.calls.at(-1).zoom, 15);
  session.view({ lat: 'x', lng: 1 }); f.frame();
  assert.deepEqual(f.calls.at(-1).center, { lat: 31.23, lng: 121.49 });
  const search = session.search('外滩');
  assert.deepEqual({ city: f.searches[0].city, keyword: f.searches[0].keyword }, { city: '上海', keyword: '外滩' });
  const route = session.walkingRoute([{ lat: 31.22, lng: 121.48 }, { lat: 31.23, lng: 121.49 }]);
  session.setCity('南京'); f.frame();
  assert.deepEqual(f.calls.at(-1).pois, [], 'another city starts with a clean map');
  session.dispose();
  await assert.rejects(search, { code: 'CANCELLED' }); await assert.rejects(route, { code: 'CANCELLED' });
  f.win.onNativeMapEvent({ type: 'select', id: 'baidu-1' }); await flush();
  assert.deepEqual(picked, ['baidu-1']);
});

test('a list scrolling beside the map does not close it; the page or a container holding it does', async () => {
  const f = fixture(); const { session } = mount(f);
  await ready(f, session);
  const count = f.calls.length;
  f.win.fire('scroll', { target: { contains: () => false } });
  assert.equal(f.calls.length, count); assert.equal(f.html.dataset.nativeMapAperture, 'open'); assert.equal(f.frames.size, 0);
  f.win.fire('scroll', { target: { contains: (node) => node === f.viewport } });
  assert.equal(f.calls.at(-1).visible, false); assert.equal(f.html.dataset.nativeMapAperture, undefined);
  f.frame(); assert.equal(f.html.dataset.nativeMapAperture, 'open');
  f.win.fire('scroll', { target: f.doc });
  assert.equal(f.calls.at(-1).visible, false);
  session.dispose();
});

// About 111 m per 0.001 degree of latitude; at latitude 31 a degree of longitude is about 95.4 km.
const north = (m) => m / 111_195, east = (m) => m / (111_195 * Math.cos(31 * Math.PI / 180));
const at = (x, y) => ({ lat: 31 + north(y), lng: 121 + east(x) });

test('walking steps follow the shape of the line: start heading, turns with their side, arrival', () => {
  const steps = routeSteps([at(0, 0), at(0, 100), at(0, 200), at(150, 200), at(150, 120)]);
  assert.deepEqual(steps.map((s) => s.type), ['depart', 'right', 'right', 'arrive']);
  assert.equal(steps[0].compass, 'n');
  assert.ok(Math.abs(steps[0].meters - 200) < 2); assert.ok(Math.abs(steps[1].meters - 150) < 2); assert.ok(Math.abs(steps[2].meters - 80) < 2);
  assert.deepEqual(routeSteps([at(0, 0), at(100, 0), at(100, 100)]).map((s) => s.type), ['depart', 'left', 'arrive']);
  assert.equal(routeSteps([at(0, 0), at(100, 0), at(100, 100)])[0].compass, 'e');
  assert.deepEqual(routeSteps([at(0, 0), at(0, 100), at(60, 160)]).map((s) => s.type), ['depart', 'slight_right', 'arrive']);
  assert.deepEqual(routeSteps([at(0, 0), at(0, 100), at(-60, 40)]).map((s) => s.type), ['depart', 'sharp_left', 'arrive']);
  assert.deepEqual(routeSteps([at(0, 0), at(0, 100), at(1, 0)]).map((s) => s.type), ['depart', 'uturn', 'arrive']);
  assert.deepEqual(routeSteps([at(0, 0)]), []); assert.deepEqual(routeSteps(null), []); assert.deepEqual(routeSteps([at(0, 0), at(0, 0)]), []);
});

test('wobble and short jogs do not become turns, and the steps add up to the walk', () => {
  const wobbly = Array.from({ length: 41 }, (_, i) => at(i % 2 ? 3 : -3, i * 10));
  const straight = routeSteps(wobbly);
  assert.deepEqual(straight.map((s) => s.type), ['depart', 'arrive']); assert.equal(straight[0].compass, 'n');
  assert.ok(simplifyPath(wobbly).length < 6);
  // Crossing a road: 12 m sideways, then on in the same direction.
  const jog = routeSteps([at(0, 0), at(0, 200), at(12, 200), at(12, 400)]);
  assert.deepEqual(jog.map((s) => s.type), ['depart', 'arrive']);
  assert.ok(Math.abs(jog[0].meters - 412) < 1, 'the jog is still walked, even though it is not announced');
  // A larger sidestep survives as corners but is still one walk in one direction.
  const sidestep = routeSteps([at(0, 0), at(0, 200), at(18, 200), at(18, 400)]);
  assert.deepEqual(sidestep.map((s) => s.type), ['depart', 'arrive']); assert.ok(Math.abs(sidestep[0].meters - 418) < 1);
  for (const path of [wobbly, [at(0, 0), at(0, 300), at(200, 300), at(200, 310), at(420, 310), at(420, 10)], [at(0, 0), at(40, 90), at(45, 95), at(300, 100), at(310, 400)]]) {
    const walked = routeSteps(path).reduce((sum, s) => sum + (s.meters || 0), 0);
    assert.ok(Math.abs(walked - pathMeters(path)) < 0.001, 'steps add up to the line as drawn');
  }
  // A few metres at the very end belong to the stretch before them.
  assert.deepEqual(routeSteps([at(0, 0), at(0, 300), at(8, 300)]).map((s) => s.type), ['depart', 'arrive']);
});

test('bearings, turn names and the units people read', () => {
  assert.ok(Math.abs(distanceMeters(at(0, 0), at(0, 1000)) - 1000) < 1);
  assert.ok(Math.abs(bearing(at(0, 0), at(100, 0)) - 90) < 0.5); assert.ok(Math.abs(bearing(at(0, 0), at(0, -100)) - 180) < 0.5);
  assert.deepEqual([0, 44, 46, 90, 180, 270, 315, 359, -90, 720].map(compassOf), ['n', 'ne', 'ne', 'e', 's', 'w', 'nw', 'n', 'w', 'n']);
  assert.deepEqual([0, 29, -29, 30, -30, 59, 60, -135, 136, -164, 165, -180].map((d) => turnKind(d)),
    ['straight', 'straight', 'straight', 'slight_right', 'slight_left', 'slight_right', 'right', 'left', 'sharp_right', 'sharp_left', 'uturn', 'uturn']);
  assert.deepEqual(distanceParts(3), { n: 5, unit: 'm' }); assert.deepEqual(distanceParts(43), { n: 45, unit: 'm' });
  assert.deepEqual(distanceParts(874), { n: 870, unit: 'm' }); assert.deepEqual(distanceParts(996), { n: '1.0', unit: 'km' });
  assert.deepEqual(distanceParts(1234), { n: '1.2', unit: 'km' }); assert.deepEqual(distanceParts(12_340), { n: '12', unit: 'km' });
  assert.deepEqual(distanceParts(NaN), { n: 5, unit: 'm' });
  assert.deepEqual(durationParts(0), { h: 0, m: 0 }); assert.deepEqual(durationParts(20), { h: 0, m: 1 });
  assert.deepEqual(durationParts(1080), { h: 0, m: 18 }); assert.deepEqual(durationParts(3900), { h: 1, m: 5 });
});

test('trip places are looked up by name and remembered only as Baidu returned them', () => {
  assert.deepEqual(tripKeywords({ nameZh: '豫园·老城厢' }), ['豫园·老城厢', '豫园']);
  assert.deepEqual(tripKeywords({ nameZh: ' 中山陵 ' }), ['中山陵']); assert.deepEqual(tripKeywords({}), []); assert.deepEqual(tripKeywords(null), []);
  const data = new Map(); let now = 1_000_000;
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const cache = createPlaceCache({ storage: () => storage, now: () => now });
  assert.equal(cache.get('poi_yuyuan'), null);
  assert.equal(cache.set('poi_yuyuan', spot('baidu-1', '豫园', 31.23, 121.49, { address: '福佑路' })), true);
  assert.deepEqual(cache.get('poi_yuyuan'), { id: 'baidu-1', name: '豫园', lat: 31.23, lng: 121.49, crs: 'BD09', address: '福佑路', district: '', city: '' });
  assert.equal(cache.set('poi_x', spot('baidu-2', '零点', 0, 0)), false); assert.equal(cache.set('', spot('baidu-3', '甲', 31, 121)), false);
  assert.equal(cache.get('poi_x'), null);
  now += PLACE_TTL_MS - 1; assert.ok(cache.get('poi_yuyuan'));
  now += 2; assert.equal(cache.get('poi_yuyuan'), null, 'an old answer is looked up again');
  data.set('along.mapPlaces.v1', '{broken'); assert.equal(cache.get('poi_yuyuan'), null);
  data.set('along.mapPlaces.v1', JSON.stringify({ poi_yuyuan: { id: 'x', name: '甲', lat: 31, lng: 121, at: now + 3_600_000 } }));
  assert.equal(cache.get('poi_yuyuan'), null, 'a time from the future is not trusted');
  const failing = createPlaceCache({ storage: () => ({ getItem: () => null, setItem() { throw new Error('full'); } }) });
  assert.equal(failing.set('poi_yuyuan', spot('baidu-1', '豫园', 31.23, 121.49)), false);
  assert.equal(createPlaceCache({ storage: () => { throw new Error('blocked'); } }).get('poi_yuyuan'), null);
});
