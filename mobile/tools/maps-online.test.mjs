import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { baiduDirections, validPoint, toBaiduPoint, loadBaidu } from '../assets/js/maps.js';
import { api, initApi, setCsrfToken } from '../assets/js/api.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; setCsrfToken(''); });

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

describe('Baidu map boundaries', () => {
  it('uses Baidu HTTPS navigation and encodes untrusted place text', () => {
    const url = new URL(baiduDirections({ name: '豫园 & 测试#', city: '上海', mode: 'walking' }));
    assert.equal(url.origin, 'https://api.map.baidu.com');
    assert.equal(url.pathname, '/place/search');
    assert.equal(url.searchParams.get('query'), '豫园 & 测试#');
    assert.equal(url.searchParams.get('coord_type'), 'bd09ll');
    assert.equal(url.hash, '');
  });
  it('never passes unknown or WGS84 destination coordinates as Baidu points', () => {
    for (const crs of [undefined, 'WGS84', 'GCJ02']) {
      const url = new URL(baiduDirections({ name: '天坛', point: { lng: 116.4, lat: 39.88, crs } }));
      assert.equal(url.searchParams.get('query'), '天坛');
      assert.equal(url.searchParams.has('origin'), false);
    }
  });
  it('uses latitude first only for verified BD09 points', () => {
    const url = new URL(baiduDirections({ name: '景点', point: { lng: 121.5, lat: 31.2, crs: 'BD09' }, origin: { lng: 121.4, lat: 31.1, crs: 'BD09' }, mode: 'driving' }));
    assert.equal(url.searchParams.get('destination'), 'latlng:31.2,121.5|name:景点');
    assert.equal(url.searchParams.get('origin'), '31.1,121.4');
    assert.equal(url.searchParams.get('mode'), 'driving');
  });
  it('defaults unsupported travel modes rather than forwarding input', () => {
    assert.equal(new URL(baiduDirections({ name: 'x', mode: 'javascript:', origin: { lng: 121, lat: 31, crs: 'BD09' } })).searchParams.get('mode'), 'walking');
  });
  it('rejects nonfinite, out of range and string coordinates', () => {
    for (const point of [null, {}, { lng: NaN, lat: 30 }, { lng: 181, lat: 30 }, { lng: 10, lat: 91 }, { lng: '121', lat: 30 }]) assert.equal(validPoint(point), false);
    assert.equal(validPoint({ lng: 0, lat: 0 }), true);
  });
  it('does not double convert BD09 points or send them to a service', async () => {
    globalThis.fetch = () => { throw Error('must not request'); };
    assert.deepEqual(await toBaiduPoint({ lng: 121, lat: 31, crs: 'BD09' }), { lng: 121, lat: 31, crs: 'BD09' });
  });
  it('refuses unknown coordinate system', async () => {
    await assert.rejects(toBaiduPoint({ lng: 121, lat: 31 }), { code: 'UNKNOWN_CRS' });
  });
  it('uses fixed same-origin conversion with an explicit source CRS', async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/maps/convert');
      assert.deepEqual(JSON.parse(options.body), { lng: 121, lat: 31, from: 'WGS84' });
      return response({ lng: 121.01, lat: 31.01, crs: 'BD09' });
    };
    assert.equal((await toBaiduPoint({ lng: 121, lat: 31, crs: 'WGS84' })).crs, 'BD09');
  });
  it('rejects malformed conversion responses', async () => {
    globalThis.fetch = async () => response({ lng: 121, lat: 31, crs: 'WGS84' });
    await assert.rejects(toBaiduPoint({ lng: 121, lat: 31, crs: 'WGS84' }));
  });
  it('does not pretend a map is loaded without a configured key', async () => {
    globalThis.fetch = async () => response({ mode: 'development', baidu: { browserKey: '' } });
    await initApi();
    await assert.rejects(loadBaidu(), { code: 'CONFIG_REQUIRED' });
  });
});

describe('same-origin API client', () => {
  it('never accepts arbitrary external API URLs', async () => {
    for (const url of ['https://example.test/', '//example.test/', '/\\example.test', 'posts']) {
      let called = false;
      globalThis.fetch = async () => { called = true; };
      await assert.rejects(api(url));
      assert.equal(called, false);
    }
  });
  it('includes credentials and CSRF only on writes', async () => {
    setCsrfToken('test-token');
    const seen = [];
    globalThis.fetch = async (url, options) => { seen.push(options); return response({ ok: true }); };
    await api('/posts');
    await api('/posts', { method: 'POST', body: { title: 'test' } });
    assert.equal(seen[0].credentials, 'same-origin');
    assert.equal(seen[0].headers['X-CSRF-Token'], undefined);
    assert.equal(seen[1].headers['X-CSRF-Token'], 'test-token');
  });
  it('surfaces non-JSON service failures without false success', async () => {
    globalThis.fetch = async () => ({ status: 503, ok: false, json: async () => { throw Error('html'); } });
    await assert.rejects(api('/config'), { code: 'SERVICE_UNAVAILABLE', status: 503 });
  });
  it('clears a revoked CSRF token on 401', async () => {
    setCsrfToken('old');
    globalThis.fetch = async () => response({ error: { code: 'UNAUTHENTICATED', message: 'expired' } }, 401);
    await assert.rejects(api('/auth/session'), { status: 401 });
    globalThis.fetch = async (url, options) => { assert.equal(options.headers['X-CSRF-Token'], undefined); return response({ ok: true }); };
    await api('/auth/otp', { method: 'POST', body: {} });
  });
});
