// Dependency-free regression tests for the mobile ES modules (Node 24+).
// Run: node --test mobile/tools/regression.test.mjs
// All storage is in memory; no browser, network, or user storage is accessed.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  buildPlan, clearPlan, dayDate, loadPlan, msUntilLanding,
  planCostCents, savePlan, TZ, validatePlan,
} from '../assets/js/plan.js';
import {
  amountFor, cancelBooking, canCancel, CONFIRM_MS, confirmBooking,
  createBooking, getBooking, guide, HALF_DAY_MIN, listBookings, PAY_MS,
  payBooking, refundPercent, SERVICE_FEE_CENTS, slotsFor, statusAt,
} from '../assets/js/bookings.js';
import { DAY_OPTIONS, GUIDES } from '../assets/js/seed.js';
import { GUIDE_EXTRA, PLAN_TEMPLATE, POIS } from '../assets/js/seed-places.js';
import { isoDateIn, time24 } from '../assets/js/format.js';

const PLAN_KEY = 'instrip.plan';
const BOOKINGS_KEY = 'instrip.bookings';
const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-13T00:00:00Z'); // 08:00 in China.
const LATE = Date.parse('2026-11-13T15:59:00Z'); // Next morning is within 12 h.
const ARRIVAL = { date: '2026-11-20', time: '18:00', city: 'shanghai', days: 3 };
const EMAIL = 'traveller@example.test';
const REQUEST_GUIDE = GUIDES.find((g) => GUIDE_EXTRA[g.id]?.status === 'ACTIVE' && !GUIDE_EXTRA[g.id].instantBook);
const INSTANT_GUIDE = GUIDES.find((g) => GUIDE_EXTRA[g.id]?.status === 'ACTIVE' && GUIDE_EXTRA[g.id].instantBook);

function memoryStorage() {
  const data = new Map();
  const fail = { get: false, set: false, remove: false };
  return {
    fail,
    getItem(key) {
      if (fail.get) throw new Error('Injected storage read failure');
      return data.get(String(key)) ?? null;
    },
    setItem(key, value) {
      if (fail.set) throw new Error('Injected storage write failure');
      data.set(String(key), String(value));
    },
    removeItem(key) {
      if (fail.remove) throw new Error('Injected storage removal failure');
      data.delete(String(key));
    },
    // Inspect the backing store without triggering an injected failure.
    snapshot() { return [...data.entries()]; },
  };
}

function samplePlan(days = 3, prefs = {}) {
  return buildPlan({ ...ARRIVAL, days }, prefs);
}

function makeBooking({ guideId = REQUEST_GUIDE.id, now = NOW, email = EMAIL, slotIndex = 0 } = {}) {
  const slot = slotsFor(guideId, now)[slotIndex];
  assert.ok(slot, 'the seed must provide a future slot for this fixture');
  const result = createBooking({ guideId, slotId: slot.id, email }, now);
  assert.equal(result.ok, true);
  return result.booking;
}

function expectError(result, error) {
  assert.deepEqual(result, { ok: false, error });
}

// These tests replace a global, so keep them serial even when other test files run in parallel.
describe('mobile pure-module regressions', { concurrency: false }, () => {
  let storage;
  let originalStorage;

  beforeEach(() => {
    // Do not evaluate Node's native localStorage getter or open its backing file.
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    storage = memoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  });

  afterEach(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  });

  describe('plans', () => {
    for (const days of [3, 5, 7]) {
      it(`preserves the existing template and round-trips a ${days}-day selection`, () => {
        assert.ok(DAY_OPTIONS.includes(days));
        const templateBefore = structuredClone(PLAN_TEMPLATE);
        const plan = samplePlan(days, { interests: ['history'], pace: 'balanced', budget: '350' });
        const beforeValidation = structuredClone(plan);
        assert.equal(plan.days, days);
        assert.equal(plan.status, 'READY');
        assert.equal(plan.generatedBy, 'TEMPLATE');
        assert.deepEqual(plan.arrival, { date: ARRIVAL.date, time: ARRIVAL.time, city: ARRIVAL.city });
        // Five/seven-day selections currently retain the available three-day seed, not fabricated days.
        assert.deepEqual(plan.daysData, PLAN_TEMPLATE.daysData.slice(0, days).map((day) => ({
          dayIndex: day.dayIndex,
          citySlug: day.citySlug,
          title: day.titleEn,
          rainBackup: day.rainBackupEn,
          stops: day.stops.map((stop) => ({ ...stop, costCents: POIS[stop.poiId].priceCents })),
        })));
        const expectedCost = plan.daysData.flatMap((day) => day.stops)
          .reduce((sum, stop) => sum + POIS[stop.poiId].priceCents, 0);
        assert.equal(plan.totalCostCents, expectedCost);
        assert.equal(planCostCents(plan), expectedCost);
        assert.deepEqual(validatePlan(plan), []);
        assert.deepEqual(plan, beforeValidation);
        assert.equal(savePlan(plan), true);
        assert.deepEqual(loadPlan(), plan);
        assert.deepEqual(PLAN_TEMPLATE, templateBefore);
      });
    }

    it('builds independent stop objects without changing the seed', () => {
      const before = structuredClone(PLAN_TEMPLATE);
      const first = samplePlan();
      const second = samplePlan();
      first.daysData[0].stops[0].durationMin += 1;
      assert.notDeepEqual(first.daysData, second.daysData);
      assert.deepEqual(PLAN_TEMPLATE, before);
    });

    for (const [label, budget, expected] of [
      ['omitted', undefined, null], ['empty', '', null], ['null', null, null],
      ['zero', 0, 0], ['string zero', '0', 0], ['whole dollars', 250, 25_000],
      ['string dollars', '250', 25_000], ['maximum', '99999', 9_999_900],
      ['negative', -1, null], ['fractional', '12.50', null],
      ['over maximum', '100000', null], ['non-numeric', 'invalid', null],
    ]) {
      it(`stores ${label} budget as integer cents or null`, () => {
        const plan = samplePlan(3, budget === undefined ? {} : { budget });
        assert.equal(plan.budgetCents, expected);
        assert.deepEqual(validatePlan(plan), []);
        assert.equal(savePlan(plan), true);
        assert.equal(loadPlan().budgetCents, expected);
      });
    }

    it('uses China-local dates and arrival times without the host timezone', () => {
      const plan = samplePlan();
      const landing = Date.parse('2026-11-20T10:00:00Z');
      assert.equal(msUntilLanding(plan, landing - 1), 1);
      assert.equal(msUntilLanding(plan, landing), 0);
      assert.equal(msUntilLanding(plan, landing + 1), -1);
      assert.equal(isoDateIn(dayDate(plan, 0), TZ), '2026-11-21');
      assert.equal(isoDateIn(dayDate(plan, 2), TZ), '2026-11-23');
      assert.equal(time24(new Date(landing), TZ), ARRIVAL.time);
    });

    it('returns false on save failure and preserves the previous plan', () => {
      const original = samplePlan(3, { budget: '100' });
      assert.equal(savePlan(original), true);
      const before = storage.snapshot();
      storage.fail.set = true;
      assert.equal(savePlan(samplePlan(5, { budget: '200' })), false);
      assert.deepEqual(storage.snapshot(), before);
      assert.deepEqual(loadPlan(), original);
    });

    it('returns false on serialization failure without changing stored data', () => {
      assert.equal(savePlan(samplePlan()), true);
      const before = storage.snapshot();
      const circular = samplePlan();
      circular.self = circular;
      assert.equal(savePlan(circular), false);
      assert.deepEqual(storage.snapshot(), before);
    });

    it('clears only its own key and returns true even when already absent', () => {
      storage.setItem('unrelated', 'keep');
      assert.equal(savePlan(samplePlan()), true);
      assert.equal(clearPlan(), true);
      assert.equal(loadPlan(), null);
      assert.deepEqual(storage.snapshot(), [['unrelated', 'keep']]);
      assert.equal(clearPlan(), true);
    });

    it('returns false on removal failure and keeps the persisted plan', () => {
      const plan = samplePlan();
      assert.equal(savePlan(plan), true);
      const before = storage.snapshot();
      storage.fail.remove = true;
      assert.equal(clearPlan(), false);
      assert.deepEqual(storage.snapshot(), before);
      assert.deepEqual(loadPlan(), plan);
    });

    it('returns null when storage is absent or unreadable', () => {
      assert.equal(loadPlan(), null);
      assert.equal(savePlan(samplePlan()), true);
      const before = storage.snapshot();
      storage.fail.get = true;
      assert.equal(loadPlan(), null);
      assert.deepEqual(storage.snapshot(), before);
    });

    for (const raw of ['', '{broken', 'null', 'false', '42', '"plan"', '[]', '{}']) {
      it(`ignores corrupt or incomplete stored plan ${JSON.stringify(raw)}`, () => {
        storage.setItem(PLAN_KEY, raw);
        const before = storage.snapshot();
        assert.equal(loadPlan(), null);
        assert.deepEqual(storage.snapshot(), before);
      });
    }

    it('returns problem arrays for missing, primitive and incomplete plans', () => {
      for (const value of [undefined, null, false, 42, 'plan', [], {}]) {
        let problems;
        assert.doesNotThrow(() => { problems = validatePlan(value); });
        assert.ok(Array.isArray(problems));
        assert.ok(problems.length > 0);
      }
    });

    const corruptions = [
      ['unsupported length', (p) => { p.days = 4; }],
      ['missing arrival', (p) => { p.arrival = null; }],
      ['impossible calendar date', (p) => { p.arrival.date = '2026-02-30'; }],
      ['invalid arrival time', (p) => { p.arrival.time = '24:00'; }],
      ['unknown arrival city', (p) => { p.arrival.city = 'unknown'; }],
      ['non-array days', (p) => { p.daysData = {}; }],
      ['empty days', (p) => { p.daysData = []; }],
      ['null day', (p) => { p.daysData[0] = null; }],
      ['incorrect day index', (p) => { p.daysData[0].dayIndex = 9; }],
      ['unknown day city', (p) => { p.daysData[0].citySlug = 'unknown'; }],
      ['non-array stops', (p) => { p.daysData[0].stops = {}; }],
      ['null stop', (p) => { p.daysData[0].stops[0] = null; }],
      ['unknown place', (p) => { p.daysData[0].stops[0].poiId = 'missing'; }],
      ['inherited place key', (p) => { p.daysData[0].stops[0].poiId = '__proto__'; }],
      ['object place key', (p) => { p.daysData[0].stops[0].poiId = { toString: null }; }],
      ['missing transport', (p) => { p.daysData[0].stops[0].transport = null; }],
      ['blank transport', (p) => { p.daysData[0].stops[0].transport = ' '; }],
      ['invalid stop time', (p) => { p.daysData[0].stops[0].startTime = '09:60'; }],
      ['zero duration', (p) => { p.daysData[0].stops[0].durationMin = 0; }],
      ['fractional duration', (p) => { p.daysData[0].stops[0].durationMin = 1.5; }],
      ['overnight duration', (p) => { p.daysData[0].stops[0].durationMin = 1440; }],
      ['negative cost', (p) => { p.daysData[0].stops[0].costCents = -1; }],
      ['string cost', (p) => { p.daysData[0].stops[0].costCents = '560'; }],
      ['incorrect total', (p) => { p.totalCostCents += 1; }],
      ['unsafe total', (p) => { p.totalCostCents = Number.MAX_SAFE_INTEGER + 1; }],
      ['negative budget', (p) => { p.budgetCents = -1; }],
      ['fractional budget', (p) => { p.budgetCents = 1.5; }],
      ['oversized budget', (p) => { p.budgetCents = 10_000_000; }],
    ];
    for (const [label, corrupt] of corruptions) {
      it(`safely rejects a plan with ${label}`, () => {
        const plan = samplePlan();
        corrupt(plan);
        let problems;
        assert.doesNotThrow(() => { problems = validatePlan(plan); });
        assert.ok(Array.isArray(problems));
        assert.ok(problems.length > 0);
        storage.setItem(PLAN_KEY, JSON.stringify(plan));
        const before = storage.snapshot();
        assert.equal(loadPlan(), null);
        assert.deepEqual(storage.snapshot(), before);
      });
    }
  });

  describe('bookings', () => {
    it('creates a requested booking with seeded prices and only its own stored record', () => {
      const b = makeBooking();
      assert.equal(b.status, 'REQUESTED');
      assert.equal(b.payBy, null);
      assert.equal(b.order, null);
      assert.equal(b.guideCents, REQUEST_GUIDE.priceHalfCents);
      assert.equal(b.feeCents, SERVICE_FEE_CENTS);
      assert.equal(b.amountCents, amountFor(guide(b.guideId)));
      assert.equal(b.amountCents, b.guideCents + b.feeCents);
      assert.equal(b.createdAt, NOW);
      assert.deepEqual(JSON.parse(storage.getItem(BOOKINGS_KEY)), [b]);
      assert.deepEqual(getBooking(b.id, NOW), b);
      assert.deepEqual(listBookings(EMAIL, NOW), [b]);
      assert.deepEqual(listBookings('other@example.test', NOW), []);
      assert.equal(slotsFor(b.guideId, NOW).find((s) => s.id === b.slotId).taken, true);
    });

    it('uses a future plan arrival as the slot base and keeps times in China', () => {
      assert.equal(savePlan(samplePlan()), true);
      const slots = slotsFor(REQUEST_GUIDE.id, NOW);
      const rule = GUIDE_EXTRA[REQUEST_GUIDE.id].slotRule;
      const base = Date.parse(`${ARRIVAL.date}T00:00:00Z`);
      assert.equal(slots.length, rule.daysAhead.length);
      for (const [i, slot] of slots.entries()) {
        const expectedDate = new Date(base + rule.daysAhead[i] * 24 * HOUR).toISOString().slice(0, 10);
        assert.equal(slot.date, expectedDate);
        assert.equal(isoDateIn(new Date(slot.startsAt), TZ), slot.date);
        assert.equal(time24(new Date(slot.startsAt), TZ), slot.time);
        assert.ok(slot.startsAt > NOW);
        if (i > 0) assert.ok(slot.startsAt >= slots[i - 1].startsAt);
      }
    });

    for (const [label, now] of [['full windows', NOW], ['start-time caps', LATE]]) {
      it(`applies ${label} to creation and confirmation deadlines`, () => {
        const requested = makeBooking({ now });
        assert.equal(requested.expiresAt, Math.min(now + CONFIRM_MS, requested.startsAt));
        const confirmed = confirmBooking(requested.id, now + 1);
        assert.equal(confirmed.ok, true);
        assert.equal(confirmed.booking.status, 'CONFIRMED');
        assert.equal(confirmed.booking.payBy, Math.min(now + 1 + PAY_MS, requested.startsAt));
        const instant = makeBooking({ guideId: INSTANT_GUIDE.id, now });
        assert.equal(instant.status, 'CONFIRMED');
        assert.equal(instant.expiresAt, Math.min(now + CONFIRM_MS, instant.startsAt));
        assert.equal(instant.payBy, Math.min(now + PAY_MS, instant.startsAt));
        for (const b of [confirmed.booking, instant]) {
          assert.ok(b.expiresAt <= b.startsAt);
          assert.ok(b.payBy <= b.startsAt);
        }
      });
    }

    it('makes duplicate reservations idempotent and rejects another email for the held slot', () => {
      const original = makeBooking();
      const before = storage.snapshot();
      const request = { guideId: original.guideId, slotId: original.slotId, email: EMAIL };
      assert.deepEqual(createBooking(request, NOW + 1), { ok: true, booking: original });
      expectError(createBooking({ ...request, email: 'other@example.test' }, NOW + 1), 'SLOT_TAKEN');
      assert.deepEqual(storage.snapshot(), before);
      assert.equal(listBookings(EMAIL, NOW + 1).length, 1);
    });

    it('reports missing guides, slots and booking IDs without creating data', () => {
      assert.equal(guide('missing'), null);
      assert.deepEqual(slotsFor('missing', NOW), []);
      expectError(createBooking({ guideId: 'missing', slotId: 'missing', email: EMAIL }, NOW), 'NOT_FOUND');
      expectError(createBooking({ guideId: REQUEST_GUIDE.id, slotId: 'missing', email: EMAIL }, NOW), 'NOT_FOUND');
      assert.equal(getBooking('missing', NOW), null);
      for (const action of [confirmBooking, cancelBooking, (id, now) => payBooking(id, 'CASH', now)]) {
        expectError(action('missing', NOW), 'NOT_FOUND');
      }
      assert.deepEqual(storage.snapshot(), []);
    });

    for (const hasExisting of [false, true]) {
      it(`returns STORAGE on create failure with ${hasExisting ? 'existing' : 'empty'} storage`, () => {
        if (hasExisting) makeBooking();
        const slot = slotsFor(INSTANT_GUIDE.id, NOW)[0];
        const before = storage.snapshot();
        storage.fail.set = true;
        expectError(createBooking({ guideId: INSTANT_GUIDE.id, slotId: slot.id, email: EMAIL }, NOW), 'STORAGE');
        assert.deepEqual(storage.snapshot(), before);
        assert.equal(slotsFor(INSTANT_GUIDE.id, NOW)[0].taken, false);
      });
    }

    for (const [label, prepare, action] of [
      ['confirm', () => {}, confirmBooking],
      ['pay', (b) => assert.equal(confirmBooking(b.id, NOW).ok, true), (id, now) => payBooking(id, 'CASH', now)],
      ['cancel requested', () => {}, cancelBooking],
      ['cancel paid', (b) => {
        assert.equal(confirmBooking(b.id, NOW).ok, true);
        assert.equal(payBooking(b.id, 'CASH', NOW).ok, true);
      }, cancelBooking],
    ]) {
      it(`returns STORAGE when ${label} cannot persist, without changing the saved booking`, () => {
        const b = makeBooking();
        prepare(b);
        const original = getBooking(b.id, NOW);
        const before = storage.snapshot();
        storage.fail.set = true;
        expectError(action(b.id, NOW + 1), 'STORAGE');
        assert.deepEqual(storage.snapshot(), before);
        assert.deepEqual(getBooking(b.id, NOW + 1), original);
        storage.fail.set = false;
        assert.equal(action(b.id, NOW + 1).ok, true, 'the operation remains retryable');
      });
    }

    for (const raw of ['{broken', 'null', '{}', '42', '"bookings"']) {
      it(`treats malformed booking storage ${JSON.stringify(raw)} as empty`, () => {
        storage.setItem(BOOKINGS_KEY, raw);
        const before = storage.snapshot();
        assert.deepEqual(listBookings(EMAIL, NOW), []);
        assert.equal(getBooking('missing', NOW), null);
        assert.ok(slotsFor(REQUEST_GUIDE.id, NOW).every((s) => !s.taken));
        assert.deepEqual(storage.snapshot(), before);
      });
    }

    it('handles storage read exceptions without throwing or changing data', () => {
      const b = makeBooking();
      const before = storage.snapshot();
      storage.fail.get = true;
      assert.deepEqual(listBookings(EMAIL, NOW), []);
      assert.equal(getBooking(b.id, NOW), null);
      assert.ok(slotsFor(REQUEST_GUIDE.id, NOW).length > 0);
      assert.deepEqual(storage.snapshot(), before);
    });

    for (const status of ['REQUESTED', 'CONFIRMED']) {
      for (const [label, startsAt, deadline] of [
        ['deadline first', NOW + 2 * HOUR, NOW + HOUR],
        ['start first', NOW + HOUR, NOW + 2 * HOUR],
        ['equal deadlines', NOW + HOUR, NOW + HOUR],
      ]) {
        it(`expires ${status} exactly at the earlier boundary (${label}) without mutating its input`, () => {
          const b = { status, startsAt, expiresAt: deadline, payBy: deadline };
          const original = { ...b };
          const cutoff = Math.min(startsAt, deadline);
          assert.equal(statusAt(b, cutoff - 1), status);
          assert.equal(statusAt(b, cutoff), 'EXPIRED');
          assert.equal(statusAt(b, cutoff + 1), 'EXPIRED');
          assert.deepEqual(b, original);
        });
      }
    }

    it('moves paid bookings into progress and completion at exact boundaries', () => {
      const b = { status: 'PAID', startsAt: NOW + HOUR };
      const end = b.startsAt + HALF_DAY_MIN * 60_000;
      assert.equal(statusAt(b, b.startsAt - 1), 'PAID');
      assert.equal(statusAt(b, b.startsAt), 'IN_PROGRESS');
      assert.equal(statusAt(b, end - 1), 'IN_PROGRESS');
      assert.equal(statusAt(b, end), 'COMPLETED');
      assert.equal(statusAt({ ...b, status: 'IN_PROGRESS' }, end), 'COMPLETED');
      assert.equal(b.status, 'PAID');
      for (const status of ['EXPIRED', 'CANCELLED_BY_TRAVELER', 'COMPLETED']) {
        assert.equal(statusAt({ ...b, status }, end + 1), status);
        assert.equal(canCancel({ status }), false);
      }
    });

    it('expires unanswered bookings, rejects confirmation/cancellation and releases the slot', () => {
      const b = makeBooking();
      assert.equal(getBooking(b.id, b.expiresAt - 1).status, 'REQUESTED');
      expectError(confirmBooking(b.id, b.expiresAt), 'CONFLICT');
      expectError(cancelBooking(b.id, b.expiresAt), 'CONFLICT');
      assert.equal(getBooking(b.id, b.expiresAt).status, 'EXPIRED');
      assert.equal(JSON.parse(storage.getItem(BOOKINGS_KEY))[0].status, 'EXPIRED');
      assert.equal(slotsFor(b.guideId, b.expiresAt).find((s) => s.id === b.slotId).taken, false);
    });

    for (const [label, now] of [['payment deadline', NOW], ['start-time deadline', LATE]]) {
      it(`rejects cash payment at the exact ${label}`, () => {
        const b = makeBooking({ guideId: INSTANT_GUIDE.id, now });
        assert.equal(getBooking(b.id, b.payBy - 1).status, 'CONFIRMED');
        expectError(payBooking(b.id, 'CASH', b.payBy), 'EXPIRED');
        assert.equal(getBooking(b.id, b.payBy).status, 'EXPIRED');
        assert.equal(getBooking(b.id, b.payBy).order, null);
      });
    }

    it('accepts CASH once and preserves the same order on repeated payment', () => {
      const b = makeBooking({ guideId: INSTANT_GUIDE.id });
      const paid = payBooking(b.id, 'CASH', NOW + 1);
      assert.equal(paid.ok, true);
      assert.equal(paid.booking.status, 'PAID');
      assert.equal(paid.booking.order.provider, 'CASH');
      assert.equal(paid.booking.order.status, 'PAID');
      assert.equal(paid.booking.order.amountCents, b.amountCents);
      assert.equal(paid.booking.order.paidAt, NOW + 1);
      const before = storage.snapshot();
      assert.deepEqual(payBooking(b.id, 'CASH', NOW + 2), paid);
      assert.deepEqual(storage.snapshot(), before);
    });

    for (const [method, error] of [
      ['CARD', 'UPSTREAM_ERROR'], ['WIRE', 'CONFLICT'], ['cash', 'CONFLICT'],
      ['', 'CONFLICT'], [undefined, 'CONFLICT'], [null, 'CONFLICT'],
    ]) {
      it(`rejects payment method ${String(method)} without changing an unpaid or paid booking`, () => {
        const b = makeBooking({ guideId: INSTANT_GUIDE.id });
        const unpaid = storage.snapshot();
        expectError(payBooking(b.id, method, NOW), error);
        assert.deepEqual(storage.snapshot(), unpaid);
        assert.equal(payBooking(b.id, 'CASH', NOW).ok, true);
        const paid = storage.snapshot();
        expectError(payBooking(b.id, method, NOW + 1), error);
        assert.deepEqual(storage.snapshot(), paid);
      });
    }

    it('does not accept payment before confirmation', () => {
      const b = makeBooking();
      const before = storage.snapshot();
      expectError(payBooking(b.id, 'CASH', NOW), 'CONFLICT');
      assert.deepEqual(storage.snapshot(), before);
    });

    for (const initialStatus of ['REQUESTED', 'CONFIRMED', 'PAID']) {
      it(`cancels ${initialStatus} bookings once, without charging/refunding cash`, () => {
        const b = makeBooking();
        if (initialStatus !== 'REQUESTED') assert.equal(confirmBooking(b.id, NOW).ok, true);
        if (initialStatus === 'PAID') assert.equal(payBooking(b.id, 'CASH', NOW).ok, true);
        assert.equal(canCancel(getBooking(b.id, NOW)), true);
        const result = cancelBooking(b.id, NOW + 1);
        assert.equal(result.ok, true);
        assert.equal(result.booking.status, 'CANCELLED_BY_TRAVELER');
        assert.equal(result.booking.cancelledAt, NOW + 1);
        assert.equal(result.booking.refundPercent, null);
        assert.equal(canCancel(result.booking), false);
        assert.equal(slotsFor(b.guideId, NOW + 1).find((s) => s.id === b.slotId).taken, false);
        const before = storage.snapshot();
        expectError(cancelBooking(b.id, NOW + 2), 'CONFLICT');
        expectError(confirmBooking(b.id, NOW + 2), 'CONFLICT');
        expectError(payBooking(b.id, 'CASH', NOW + 2), 'CONFLICT');
        assert.deepEqual(storage.snapshot(), before);
      });
    }

    it('does not allow payment or cancellation after a paid tour starts or finishes', () => {
      const b = makeBooking({ guideId: INSTANT_GUIDE.id });
      assert.equal(payBooking(b.id, 'CASH', NOW).ok, true);
      for (const [now, status] of [
        [b.startsAt, 'IN_PROGRESS'], [b.startsAt + HALF_DAY_MIN * 60_000, 'COMPLETED'],
      ]) {
        assert.equal(getBooking(b.id, now).status, status);
        assert.equal(canCancel(getBooking(b.id, now)), false);
        expectError(payBooking(b.id, 'CASH', now), 'CONFLICT');
        expectError(cancelBooking(b.id, now), 'CONFLICT');
      }
    });

    it('uses the documented refund percentages at 24-hour and 2-hour boundaries', () => {
      const b = { startsAt: NOW + 48 * HOUR };
      for (const [remaining, expected] of [
        [24 * HOUR + 1, 100], [24 * HOUR, 50], [24 * HOUR - 1, 50],
        [2 * HOUR + 1, 50], [2 * HOUR, 50], [2 * HOUR - 1, 0], [0, 0],
      ]) {
        assert.equal(refundPercent(b, b.startsAt - remaining), expected);
      }
    });
  });
});
