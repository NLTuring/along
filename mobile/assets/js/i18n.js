// InsTrip mobile — i18n.
// All UI copy lives in messages/en.json and messages/zh.json (spec §0: no hard-coded strings).
// English is the default and the fallback for any key missing in another locale.

export const LOCALES = ['en', 'zh'];
const DEFAULT_LOCALE = 'en';
const STORE_KEY = 'instrip.locale';

let locale = DEFAULT_LOCALE;
let dict = {};
let fallback = {};
const cache = new Map();
const missing = new Set();
const listeners = new Set();

async function load(code) {
  if (cache.has(code)) return cache.get(code);
  const paths = [`messages/${code}.json`, ...['online', 'community', 'craft-online', 'native-map', 'assistant', 'social', 'pay'].map((feature) => `messages/${feature}.${code}.json`)];
  const dictionaries = await Promise.all(paths.map(async (path) => {
    const res = await fetch(new URL(`../${path}`, import.meta.url));
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }));
  const data = Object.assign({}, ...dictionaries);
  cache.set(code, data);
  return data;
}

function stored() {
  try {
    const value = localStorage.getItem(STORE_KEY);
    return LOCALES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

function apply(code, data) {
  locale = code;
  dict = data;
  document.documentElement.lang = code === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
}

export async function initI18n() {
  fallback = await load(DEFAULT_LOCALE);
  const code = stored() || DEFAULT_LOCALE;
  try {
    apply(code, code === DEFAULT_LOCALE ? fallback : await load(code));
  } catch (error) {
    console.warn('[i18n] falling back to English:', error.message);
    apply(DEFAULT_LOCALE, fallback);
  }
}

export async function setLocale(code) {
  if (!LOCALES.includes(code) || code === locale) return;
  apply(code, await load(code));
  try {
    localStorage.setItem(STORE_KEY, code);
  } catch {
    /* private mode: the choice lasts for this session only */
  }
  listeners.forEach((fn) => fn(code));
}

export function getLocale() {
  return locale;
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// t('cta.build', { days: 3 }) -> "Build my 3 days"
export function t(key, params) {
  let text = dict[key];
  if (text == null) text = fallback[key];
  if (text == null) {
    if (!missing.has(key)) {
      missing.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    return key;
  }
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Escape text before it goes into an HTML template.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// Translated and escaped, for use inside template literals.
export function te(key, params) {
  return esc(t(key, params));
}
