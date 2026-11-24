// Along mobile — seed content in the reader's language.
// Places, the sample plan, guides and film captions were written in English first (seed.js,
// seed-places.js); seed-zh.js holds the Chinese. These helpers pick by the current language at
// the moment a page is drawn, so saved plans and bookings stay as they were written and follow
// a language switch.

import { t, getLocale } from './i18n.js';
import { POIS, PLAN_TEMPLATE, FILM_STYLES } from './seed-places.js';
import { PLACE_ZH, PLAN_ZH, GUIDE_ZH, CAPTIONS_ZH } from './seed-zh.js';

const zh = () => getLocale() === 'zh';

// The name to show for a place.
export function placeName(place) {
  return (zh() ? place?.nameZh : place?.nameEn) || place?.nameEn || '';
}

// The Chinese name to put under an English one, to match street signs and to show a driver.
// Chinese readers already have it as the main name.
export function placeSubName(place) {
  return zh() ? '' : place?.nameZh || '';
}

export function placeDescription(place) {
  return (zh() && PLACE_ZH[place?.id]?.description) || place?.descriptionEn || '';
}

// A saved plan keeps the template's English text. The Chinese is shown only while a day or a
// stop still is that template text; anything else (a plan from a planning service) shows as saved.
function templateDay(day) {
  const source = PLAN_TEMPLATE.daysData[day?.dayIndex];
  return source && source.titleEn === day.title ? source : null;
}

export function dayTitle(day) {
  return (zh() && templateDay(day) && PLAN_ZH[day.dayIndex]?.title) || day.title;
}

export function dayRainBackup(day) {
  const source = templateDay(day);
  return (zh() && source?.rainBackupEn === day.rainBackup && PLAN_ZH[day.dayIndex]?.rainBackup) || day.rainBackup;
}

// -> { transport, note } for one stop of a plan day.
export function stopText(day, stop) {
  const source = zh() ? templateDay(day) : null;
  const at = source ? source.stops.findIndex((s) => s.poiId === stop.poiId && s.transport === stop.transport && s.note === stop.note) : -1;
  const local = at >= 0 ? PLAN_ZH[day.dayIndex]?.stops[at] : null;
  return local?.poiId === stop.poiId ? { transport: local.transport, note: local.note } : { transport: stop.transport, note: stop.note };
}

// A guide as shown on a page. Filters, bookings and prices keep using the seed record; only the
// name, headline, topics and bio change with the language.
export function guideText(guide) {
  const local = zh() ? GUIDE_ZH[guide?.id] : null;
  return local ? { ...guide, ...local } : guide;
}

// The captions a new film starts with.
export function captionsFor(styleId) {
  return (zh() && CAPTIONS_ZH[styleId]) || FILM_STYLES.find((s) => s.id === styleId)?.captions || [];
}

// What a library photo is called for screen readers. Bundled place photos follow the language.
export function mediaName(item) {
  if (item.altKey) return t(item.altKey);
  if (item.id === 'sample_xuanwu') return t('window.xuanwu');
  const place = typeof item.id === 'string' && item.id.startsWith('sample_') ? POIS[item.id.slice(7)] : null;
  return place ? placeName(place) : item.alt || t('studio.photo.own');
}
