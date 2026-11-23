// InsTrip mobile — plans.
// Phase two has no backend, so "building" a plan fills in the product's sample
// plan (docs/03-种子数据.json) and marks it generatedBy: 'TEMPLATE'. The object
// follows the shape of POST /api/plans in the tech spec so the real call can
// replace buildPlan() later without touching the pages.

import { POIS, PLAN_TEMPLATE } from './seed-places.js';
import { CITIES, DAY_OPTIONS } from './seed.js';
import { isoDateIn, time24 } from './format.js';

const STORE_KEY = 'instrip.plan';
export const TZ = 'Asia/Shanghai';

export function poi(id) {
  return POIS[id] || null;
}

// arrival: { date: 'YYYY-MM-DD', time: 'HH:MM', city, days }
export function buildPlan(arrival, prefs = {}) {
  const daysData = PLAN_TEMPLATE.daysData.slice(0, arrival.days).map((day) => ({
    dayIndex: day.dayIndex,
    citySlug: day.citySlug,
    title: day.titleEn,
    rainBackup: day.rainBackupEn,
    stops: day.stops.map((stop) => ({ ...stop, costCents: POIS[stop.poiId].priceCents })),
  }));
  const plan = {
    id: `pl_local_${Date.now().toString(36)}`,
    status: 'READY',
    generatedBy: 'TEMPLATE',
    days: arrival.days,
    arrival: { date: arrival.date, time: arrival.time, city: arrival.city },
    interests: prefs.interests || [],
    pace: prefs.pace || 'balanced',
    budgetCents: /^\d{1,5}$/.test(String(prefs.budget ?? '')) ? Number(prefs.budget) * 100 : null,
    daysData,
  };
  plan.totalCostCents = planCostCents(plan);
  return plan;
}

export function planCostCents(plan) {
  return plan.daysData.reduce((sum, day) => sum + day.stops.reduce((s, stop) => s + stop.costCents, 0), 0);
}

// Problems the spec's validator would reject (§12.2). Empty array = fine.
export function validatePlan(plan) {
  const problems = [];
  if (!plan || typeof plan !== 'object') return ['missing plan'];
  if (!DAY_OPTIONS.includes(plan.days)) problems.push('invalid trip length');
  const date = plan.arrival?.date;
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    problems.push('invalid arrival date');
  }
  const validTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(plan.arrival?.time)) problems.push('invalid arrival time');
  if (!CITIES.some((city) => city.slug === plan.arrival?.city)) problems.push('invalid arrival city');
  if (!Array.isArray(plan.daysData) || !plan.daysData.length || plan.daysData.length > plan.days) {
    return [...problems, 'invalid plan days'];
  }
  for (const [index, day] of plan.daysData.entries()) {
    if (!day || day.dayIndex !== index || !Array.isArray(day.stops)) {
      problems.push(`day ${index + 1}: invalid day`);
      continue;
    }
    if (!CITIES.some((city) => city.slug === day.citySlug)) problems.push(`day ${index + 1}: invalid city`);
    for (const stop of day.stops) {
      if (!stop || typeof stop.poiId !== 'string' || !Object.prototype.hasOwnProperty.call(POIS, stop.poiId)) {
        problems.push(`day ${index + 1}: unknown place`);
        continue;
      }
      if (typeof stop.transport !== 'string' || !stop.transport.trim()) problems.push(`day ${index + 1}: no transport`);
      if (!validTime(stop.startTime) || !Number.isInteger(stop.durationMin) || stop.durationMin <= 0 || stop.durationMin >= 1440) {
        problems.push(`day ${index + 1}: invalid stop time`);
      }
      if (!Number.isSafeInteger(stop.costCents) || stop.costCents < 0) problems.push(`day ${index + 1}: invalid cost`);
    }
  }
  if (!Number.isSafeInteger(plan.totalCostCents) || plan.totalCostCents < 0) problems.push('invalid total');
  if (plan.budgetCents != null && (!Number.isSafeInteger(plan.budgetCents) || plan.budgetCents < 0 || plan.budgetCents > 9_999_900)) {
    problems.push('invalid budget');
  }
  if (!problems.length && plan.totalCostCents !== planCostCents(plan)) problems.push('incorrect total');
  return problems;
}

// Day 1 is the morning after landing. Returns a Date at midday in China so the
// weekday and date format correctly in the city's time zone.
export function dayDate(plan, dayIndex) {
  const [y, m, d] = plan.arrival.date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1 + dayIndex, 4));
}

export function arrivalDate(plan) {
  const [y, m, d] = plan.arrival.date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 4));
}

// "09:30" + 90 min -> "11:00"
export function endTime(startTime, durationMin) {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + durationMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Opening hours of a place on a weekday (0 = Sunday, as Date#getUTCDay).
// Seed keys look like "mon_sun", "tue_sun" or "mon"; values "09:00-17:00" or "closed".
export function hoursOn(place, weekday) {
  const idx = (weekday + 6) % 7; // Monday = 0
  for (const [key, value] of Object.entries(place.hours || {})) {
    const [from, to = from] = key.split('_');
    const a = DAY_KEYS.indexOf(from);
    const b = DAY_KEYS.indexOf(to);
    if (a < 0 || b < 0 || idx < a || idx > b) continue;
    if (value === 'closed') return { closed: true };
    const [open, close] = value.split('-');
    return { open, close, allDay: open === '00:00' && close === '24:00' };
  }
  return null;
}

// A stop that falls on a closed day or outside opening hours (spec §6.3 rule).
export function stopWarning(plan, day, stop) {
  const hours = hoursOn(POIS[stop.poiId], dayDate(plan, day.dayIndex).getUTCDay());
  if (!hours || hours.allDay) return null;
  if (hours.closed) return { kind: 'closed' };
  const end = endTime(stop.startTime, stop.durationMin);
  if (stop.startTime < hours.open || end > hours.close || end < stop.startTime) {
    return { kind: 'hours', hours: `${hours.open}–${hours.close}` };
  }
  return null;
}

// Milliseconds until the traveller lands (arrival date and time are China local, UTC+8).
export function msUntilLanding(plan, now = Date.now()) {
  const [y, m, d] = plan.arrival.date.split('-').map(Number);
  const [h, min] = plan.arrival.time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h - 8, min) - now;
}

// Which plan day is today in China, or -1 when today is not one of the trip's days.
export function todayIndex(plan, now = Date.now()) {
  const today = isoDateIn(new Date(now), TZ);
  for (let n = 0; n < plan.daysData.length; n += 1) {
    if (dayDate(plan, n).toISOString().slice(0, 10) === today) return n;
  }
  return -1;
}

// The stop to show as "next": during the trip, the first one that has not ended
// yet (null when the day is over); before or after the trip, the first stop of day 1.
export function nextStop(plan, now = Date.now()) {
  const n = todayIndex(plan, now);
  if (n < 0) return { dayIndex: 0, stop: plan.daysData[0]?.stops[0] || null, live: false };
  const clock = time24(new Date(now), TZ);
  const stop = plan.daysData[n].stops.find((s) => endTime(s.startTime, s.durationMin) > clock) || null;
  return { dayIndex: n, stop, live: true };
}

export function savePlan(plan) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

export function loadPlan() {
  try {
    const plan = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!plan || !Array.isArray(plan.daysData) || !plan.arrival) return null;
    if (validatePlan(plan).length) return null;
    return plan;
  } catch {
    return null;
  }
}

export function clearPlan() {
  try {
    localStorage.removeItem(STORE_KEY);
    return true;
  } catch {
    return false;
  }
}
