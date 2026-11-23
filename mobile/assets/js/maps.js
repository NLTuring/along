// Along — Baidu map boundaries. All points passed to the renderer are BD-09.
import { api, getRuntimeConfig } from './api.js';

export const MAP_MODES = ['walking', 'driving', 'transit'];
let loading = null;

export function validPoint(value) {
  return !!value && Number.isFinite(value.lng) && Number.isFinite(value.lat)
    && value.lng >= -180 && value.lng <= 180 && value.lat >= -90 && value.lat <= 90;
}

export function baiduDirections({ name, city, point, origin, mode = 'walking' }) {
  const hasOrigin = validPoint(origin) && origin.crs === 'BD09';
  const url = new URL(hasOrigin ? 'https://api.map.baidu.com/direction' : 'https://api.map.baidu.com/place/search');
  const destination = validPoint(point) && point.crs === 'BD09'
    ? `latlng:${point.lat},${point.lng}|name:${name}` : String(name || '');
  if (hasOrigin) {
    url.searchParams.set('destination', destination);
    url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
    url.searchParams.set('mode', MAP_MODES.includes(mode) ? mode : 'walking');
  } else url.searchParams.set('query', String(name || ''));
  url.searchParams.set('region', city || '上海');
  url.searchParams.set('coord_type', 'bd09ll');
  url.searchParams.set('output', 'html');
  url.searchParams.set('src', 'webapp.Along.mobile');
  return url.href;
}

export async function toBaiduPoint(point) {
  if (!validPoint(point)) throw Object.assign(new Error('Invalid coordinates'), { code: 'INVALID_COORDINATES' });
  if (point.crs === 'BD09') return { lng: point.lng, lat: point.lat, crs: 'BD09' };
  if (!['WGS84', 'GCJ02'].includes(point.crs)) throw Object.assign(new Error('Unknown coordinate system'), { code: 'UNKNOWN_CRS' });
  const result = await api('/maps/convert', { method: 'POST', body: { lng: point.lng, lat: point.lat, from: point.crs } });
  if (!validPoint(result) || result.crs !== 'BD09') throw new Error('Invalid coordinate conversion');
  return result;
}

export function loadBaidu() {
  if (typeof window !== 'undefined' && window.BMapGL?.Map) return Promise.resolve(window.BMapGL);
  if (loading) return loading;
  const key = getRuntimeConfig().baidu?.browserKey;
  if (!key) return Promise.reject(Object.assign(new Error('Baidu is not configured'), { code: 'CONFIG_REQUIRED' }));
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const callback = '__alongBaiduReady';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window[callback];
      if (error) { script.remove(); reject(error); }
      else resolve(window.BMapGL);
    };
    const timer = setTimeout(() => finish(new Error('Map loading timed out')), 15_000);
    window[callback] = () => window.BMapGL?.Map ? finish() : finish(new Error('Map API is missing'));
    script.onerror = () => finish(new Error('Map loading failed'));
    const url = new URL('https://api.map.baidu.com/api');
    url.search = new URLSearchParams({ v: '1.0', type: 'webgl', ak: key, callback }).toString();
    script.src = url.href;
    script.async = true;
    document.head.append(script);
  }).catch((error) => { loading = null; throw error; });
  return loading;
}

export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Location unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lng: coords.longitude, lat: coords.latitude, crs: 'WGS84' }),
      reject, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

export function geocode(B, name, city) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Place search timed out')), 12_000);
    const coder = new B.Geocoder();
    coder.getPoint(name, (point) => {
      clearTimeout(timer);
      if (!validPoint(point)) reject(new Error('Place not found'));
      else resolve({ lng: point.lng, lat: point.lat, crs: 'BD09' });
    }, city);
  });
}
