// InsTrip mobile — i18n.
// All UI copy lives in messages/en.json and messages/zh.json (spec §0: no hard-coded strings).
// English is the fallback for any key missing in another locale. The first launch follows the
// phone's language; after that the saved choice wins.
// messages/domestic.<locale>.json replaces part of the copy for travellers who live in China
// (audience.js): the same keys, written for them instead of for visitors from abroad.

import { isDomestic, onAudienceChange, prefersChinese } from './audience.js';

export const LOCALES = ['en', 'zh'];
const DEFAULT_LOCALE = 'en';
const STORE_KEY = 'instrip.locale';

let locale = DEFAULT_LOCALE;
let dict = {};
let fallback = {};
let source = null;         // the files of the current language: { base, domestic }
let fallbackSource = null; // the same for English
const cache = new Map();
const missing = new Set();
const listeners = new Set();

async function read(path) {
  const res = await fetch(new URL(`../${path}`, import.meta.url));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function load(code) {
  if (cache.has(code)) return cache.get(code);
  const paths = [`messages/${code}.json`, ...['online', 'community', 'craft-online', 'native-map', 'assistant', 'social', 'pay', 'travel', 'workshop'].map((feature) => `messages/${feature}.${code}.json`)];
  const [domestic, ...dictionaries] = await Promise.all([`messages/domestic.${code}.json`, ...paths].map(read));
  const data = { base: Object.assign({}, ...dictionaries), domestic };
  cache.set(code, data);
  return data;
}

const pick = (data) => (isDomestic() ? { ...data.base, ...data.domestic } : data.base);

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
  source = data;
  dict = pick(data);
  fallback = pick(fallbackSource);
  document.documentElement.lang = code === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
}

export async function initI18n() {
  fallbackSource = await load(DEFAULT_LOCALE);
  const code = stored() || (prefersChinese() ? 'zh' : DEFAULT_LOCALE);
  try {
    apply(code, code === DEFAULT_LOCALE ? fallbackSource : await load(code));
  } catch (error) {
    console.warn('[i18n] falling back to English:', error.message);
    apply(DEFAULT_LOCALE, fallbackSource);
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

// The traveller type swaps part of the copy, so whatever redraws for a new language redraws now.
onAudienceChange(() => {
  if (!source) return;
  apply(locale, source);
  listeners.forEach((fn) => fn(locale));
});

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
