// InsTrip mobile — display formats (spec §5.1).
// Money is stored as integer USD cents; times are stored in UTC and shown in the city's time zone.

import { getLocale } from './i18n.js';

export const FX_CNY_PER_USD = 7.15; // spec §7.1, display reference only

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 4900 -> "$49", 5350 -> "$53.50" (two decimals only when there are cents)
export function usd(cents) {
  const whole = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  return rest ? `$${group(whole)}.${String(rest).padStart(2, '0')}` : `$${group(whole)}`;
}

// USD cents -> "¥657" at the configured reference rate
export function cny(cents) {
  return `¥${group(Math.round((cents / 100) * FX_CNY_PER_USD))}`;
}

// 4.9 -> "4.9", 5 -> "5.0"
export function rating(value) {
  return Number(value).toFixed(1);
}

function parts(date, timeZone, options) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).formatToParts(date)) {
    out[p.type] = p.value;
  }
  return out;
}

// "Sat 14 Nov"; Chinese uses the platform's own short form.
export function dateShort(date, timeZone) {
  if (getLocale() === 'zh') {
    return new Intl.DateTimeFormat('zh-CN', { timeZone, month: 'numeric', day: 'numeric', weekday: 'short' }).format(date);
  }
  const p = parts(date, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${p.weekday} ${p.day} ${p.month}`;
}

// "14 Nov 2026"
export function dateLong(date, timeZone) {
  if (getLocale() === 'zh') {
    return new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
  }
  const p = parts(date, timeZone, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${p.day} ${p.month} ${p.year}`;
}

// 24-hour "09:30"
export function time24(date, timeZone) {
  const p = parts(date, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}:${p.minute}`;
}

// Hour and minute of a moment in a given time zone, as numbers.
export function clockIn(date, timeZone) {
  const p = parts(date, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { hour: Number(p.hour), minute: Number(p.minute) };
}

// "2026-11-13" for <input type="date">, in a given time zone.
export function isoDateIn(date, timeZone) {
  const p = parts(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}
