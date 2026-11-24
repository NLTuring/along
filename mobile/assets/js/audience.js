// Along mobile — who is travelling.
// 'inbound': a visitor from abroad, the traveller the app was first written for (prices in US
// dollars, advice about landing, passports and foreign cards).
// 'domestic': a traveller who lives in China (prices in yuan, advice about ID-card reservations
// and local payment, sharing through the phone's own apps).
// The first launch follows the phone's language; You > Settings changes it. The interface
// language is a separate choice (i18n.js).

export const AUDIENCES = ['domestic', 'inbound'];
const STORE_KEY = 'along.audience';

function phoneLanguage() {
  const nav = globalThis.navigator;
  return String((Array.isArray(nav?.languages) && nav.languages[0]) || nav?.language || '');
}

// Any Chinese: picks the interface language on the first launch.
export function prefersChinese(tag = phoneLanguage()) {
  return /^zh(?:$|[-_])/i.test(tag);
}

// Simplified Chinese as set on a mainland phone ("zh", "zh-CN", "zh-Hans-CN"). Phones set to
// Hong Kong, Macao, Taiwan or Singapore Chinese belong to visitors, who keep the inbound advice.
export function mainlandChinese(tag = phoneLanguage()) {
  return /^zh(?:[-_]hans)?(?:[-_]cn)?$/i.test(tag);
}

export function createAudience({ storage = () => globalThis.localStorage, domestic = mainlandChinese } = {}) {
  let value = null;
  const listeners = new Set();
  function stored() {
    try {
      const saved = storage()?.getItem(STORE_KEY);
      return AUDIENCES.includes(saved) ? saved : null;
    } catch {
      return null;
    }
  }
  const get = () => {
    if (!value) value = stored() || (domestic() ? 'domestic' : 'inbound');
    return value;
  };
  return {
    get,
    isDomestic: () => get() === 'domestic',
    set(next) {
      if (!AUDIENCES.includes(next) || next === get()) return;
      value = next;
      try {
        storage().setItem(STORE_KEY, next);
      } catch {
        /* private mode: the choice lasts for this session only */
      }
      listeners.forEach((fn) => fn(next));
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const audience = createAudience();
export const getAudience = () => audience.get();
export const isDomestic = () => audience.isDomestic();
export const setAudience = (value) => audience.set(value);
export const onAudienceChange = (fn) => audience.onChange(fn);
