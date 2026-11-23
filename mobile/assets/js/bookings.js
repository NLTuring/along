// InsTrip mobile — bookings (spec §7.2, §7.3 and the Booking state machine).
// No booking service exists yet, so bookings live on this phone. Statuses, time
// limits, prices and refund rules follow the spec so the pages behave the same
// once POST /api/bookings and POST /api/orders/:id/checkout replace this file.
// Card payments run in demo mode (payments.js): orders record them, nothing is charged.

import { GUIDES } from './seed.js';
import { GUIDE_EXTRA } from './seed-places.js';
import { isoDateIn } from './format.js';
import { loadPlan, msUntilLanding, TZ } from './plan.js';

const KEY = 'instrip.bookings';
export const SERVICE_FEE_CENTS = 400;         // spec §7.1: fixed $4 per booking
export const CONFIRM_MS = 12 * 3_600_000;     // guide has 12 h to confirm
export const PAY_MS = 24 * 3_600_000;         // then 24 h to pay
export const HALF_DAY_MIN = 240;              // half day = 4 h
const HOLDING = ['REQUESTED', 'CONFIRMED', 'PAID', 'IN_PROGRESS'];

function readAll() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// What the service's timers would do: expire unanswered and unpaid bookings,
// start paid ones at their start time and complete them four hours later.
// Pure: returns the status a booking should have at `now`.
export function statusAt(b, now) {
  if (b.status === 'REQUESTED' && now >= Math.min(b.expiresAt, b.startsAt)) return 'EXPIRED';
  if (b.status === 'CONFIRMED' && now >= Math.min(b.payBy, b.startsAt)) return 'EXPIRED';
  if (b.status === 'PAID' || b.status === 'IN_PROGRESS') {
    if (now >= b.startsAt + HALF_DAY_MIN * 60_000) return 'COMPLETED';
    if (now >= b.startsAt) return 'IN_PROGRESS';
  }
  return b.status;
}

function sweep(list, now) {
  let changed = false;
  for (const b of list) {
    const next = statusAt(b, now);
    if (next !== b.status) { b.status = next; changed = true; }
  }
  if (changed) writeAll(list);
  return list;
}

const current = (now = Date.now()) => sweep(readAll(), now);

export function guide(id) {
  const base = GUIDES.find((g) => g.id === id);
  return base ? { ...base, ...GUIDE_EXTRA[id] } : null;
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Slots come from the seed rule (days after a base date + start times). The base
// is the day the traveller lands when a plan says so, otherwise today in China.
export function slotsFor(guideId, now = Date.now()) {
  const g = guide(guideId);
  if (!g || g.status !== 'ACTIVE') return [];
  const plan = loadPlan();
  const base = plan && msUntilLanding(plan, now) > 0 ? plan.arrival.date : isoDateIn(new Date(now), TZ);
  const held = new Set(current(now).filter((b) => HOLDING.includes(b.status)).map((b) => b.slotId));
  return g.slotRule.daysAhead.map((ahead, i) => {
    const date = addDays(base, ahead);
    const time = g.slotRule.times[i];
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    const id = `${guideId}_${date}_${time}`;
    return {
      id, guideId, date, time,
      kind: time < '12:00' ? 'HALF_AM' : 'HALF_PM',
      startsAt: Date.UTC(y, m - 1, d, h - 8, min), // China is UTC+8
      taken: held.has(id),
    };
  }).filter((slot) => slot.startsAt > now).sort((a, b) => a.startsAt - b.startsAt);
}

export function amountFor(g) {
  return g.priceHalfCents + SERVICE_FEE_CENTS;
}

// -> { ok: true, booking } | { ok: false, error }
// Asking twice for the same slot with the same email returns the first booking.
export function createBooking({ guideId, slotId, email }, now = Date.now()) {
  const slot = slotsFor(guideId, now).find((s) => s.id === slotId);
  const g = guide(guideId);
  if (!slot || !g) return { ok: false, error: 'NOT_FOUND' };
  const list = current(now);
  const holder = list.find((b) => b.slotId === slotId && HOLDING.includes(b.status));
  if (holder) return holder.email === email ? { ok: true, booking: holder } : { ok: false, error: 'SLOT_TAKEN' };
  const rand = crypto.getRandomValues(new Uint32Array(2));
  const booking = {
    id: `bk_${rand[0].toString(36)}`,
    code: `INS-${String(1000 + (rand[1] % 9000))}`,
    guideId, slotId, email,
    date: slot.date, time: slot.time, kind: slot.kind, startsAt: slot.startsAt,
    people: 1,
    guideCents: g.priceHalfCents, feeCents: SERVICE_FEE_CENTS, amountCents: amountFor(g),
    createdAt: now,
    // Instant-book guides skip confirmation and go straight to payment.
    status: g.instantBook ? 'CONFIRMED' : 'REQUESTED',
    expiresAt: Math.min(now + CONFIRM_MS, slot.startsAt),
    payBy: g.instantBook ? Math.min(now + PAY_MS, slot.startsAt) : null,
    order: null,
  };
  list.unshift(booking);
  if (!writeAll(list)) return { ok: false, error: 'STORAGE' };
  return { ok: true, booking };
}

export function getBooking(id, now = Date.now()) {
  return current(now).find((b) => b.id === id) || null;
}

export function listBookings(email, now = Date.now()) {
  return current(now).filter((b) => b.email === email);
}

function update(id, now, change) {
  const list = current(now);
  const b = list.find((x) => x.id === id);
  if (!b) return { ok: false, error: 'NOT_FOUND' };
  const result = change(b);
  if (!result.ok) return result;
  if (!writeAll(list)) return { ok: false, error: 'STORAGE' };
  return { ok: true, booking: b };
}

// Stands in for the guide's answer while no guide service is connected.
export function confirmBooking(id, now = Date.now()) {
  return update(id, now, (b) => {
    if (b.status !== 'REQUESTED') return { ok: false, error: 'CONFLICT' };
    b.status = 'CONFIRMED';
    b.payBy = Math.min(now + PAY_MS, b.startsAt);
    return { ok: true };
  });
}

// A card payment counts only with proof of an authorised payment for exactly this amount.
// In this build that proof comes from the demo authoriser in payments.js: nothing is charged.
const CARD_BRAND_IDS = ['visa', 'mastercard', 'amex', 'discover', 'jcb', 'diners', 'unionpay'];
function cardProof(payment) {
  return !!payment && payment.mode === 'DEMO' && typeof payment.id === 'string' && payment.id.length > 0
    && CARD_BRAND_IDS.includes(payment.brand) && /^\d{4}$/.test(payment.last4 || '') && Number.isSafeInteger(payment.amountCents);
}

// Cash is settled on the day, so the order is recorded as paid at once (tech spec §12).
export function payBooking(id, method, now = Date.now(), payment = null) {
  if (method === 'CARD' && !cardProof(payment)) return { ok: false, error: 'UPSTREAM_ERROR' };
  if (method !== 'CASH' && method !== 'CARD') return { ok: false, error: 'CONFLICT' };
  return update(id, now, (b) => {
    if (b.status === 'PAID') return { ok: true };            // paying twice changes nothing
    if (b.status !== 'CONFIRMED') return { ok: false, error: b.status === 'EXPIRED' ? 'EXPIRED' : 'CONFLICT' };
    if (method === 'CARD' && payment.amountCents !== b.amountCents) return { ok: false, error: 'CONFLICT' };
    b.status = 'PAID';
    b.order = method === 'CARD'
      ? { id: `or_${b.id.slice(3)}`, provider: 'CARD', status: 'PAID', amountCents: b.amountCents, paidAt: now,
        paymentId: payment.id, mode: 'DEMO', brand: payment.brand, last4: payment.last4 }
      : { id: `or_${b.id.slice(3)}`, provider: 'CASH', status: 'PAID', amountCents: b.amountCents, paidAt: now };
    return { ok: true };
  });
}

// Spec §7.3: more than 24 h before the start 100%, 2 to 24 h 50%, under 2 h nothing.
export function refundPercent(booking, now = Date.now()) {
  const hours = (booking.startsAt - now) / 3_600_000;
  if (hours > 24) return 100;
  if (hours >= 2) return 50;
  return 0;
}

export function canCancel(booking) {
  return ['REQUESTED', 'CONFIRMED', 'PAID'].includes(booking.status);
}

export function cancelBooking(id, now = Date.now()) {
  return update(id, now, (b) => {
    if (!canCancel(b)) return { ok: false, error: 'CONFLICT' };
    // Cash orders are never charged, so there is nothing to refund.
    b.refundPercent = b.order && b.order.provider !== 'CASH' ? refundPercent(b, now) : null;
    b.status = 'CANCELLED_BY_TRAVELER';
    b.cancelledAt = now;
    return { ok: true };
  });
}
