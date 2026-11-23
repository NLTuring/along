// Along — where Baidu placed the trip's stops.
// The seed coordinates have no verified coordinate system, so a stop is plotted only where a
// native Baidu search for its name put it. The answer is kept on the phone for a while so the
// names appear at once the next time the map opens.
import { nativePlace } from './native-map.js';

const KEY = 'along.mapPlaces.v1';
export const PLACE_TTL_MS = 30 * 86_400_000;

// "豫园·老城厢" -> ['豫园·老城厢', '豫园']: the whole name first, then its leading part.
export function tripKeywords(stop) {
  const name = String(stop?.nameZh || '').trim();
  return [...new Set([name, name.split(/[·•・]/)[0].trim()].filter(Boolean))];
}

export function createPlaceCache({ storage = () => globalThis.localStorage, now = () => Date.now(), ttl = PLACE_TTL_MS } = {}) {
  function read() {
    try {
      const value = JSON.parse(storage()?.getItem(KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  return {
    get(poiId) {
      const hit = read()[poiId], spot = nativePlace(hit);
      const age = now() - hit?.at;
      return spot && Number.isFinite(age) && age >= -60_000 && age < ttl ? spot : null;
    },
    set(poiId, value) {
      const spot = nativePlace(value);
      if (!spot || typeof poiId !== 'string' || !poiId) return false;
      try {
        const all = read();
        all[poiId] = { ...spot, at: now() };
        storage().setItem(KEY, JSON.stringify(all));
        return true;
      } catch { return false; }
    },
  };
}
