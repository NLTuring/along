// Card checks, the local wallet and demo card payment. In-memory storage, no network.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  PAYMENT_MODE, CARD_BRANDS, detectBrand, luhnValid, formatCardNumber, parseExpiry, validateCard, cardExpired,
  walletScope, createWallet, TEST_CARDS, authorizeCardPayment, MAX_CARDS,
} from '../assets/js/payments.js';
import { createBooking, confirmBooking, getBooking, payBooking, slotsFor } from '../assets/js/bookings.js';
import { GUIDES } from '../assets/js/seed.js';
import { GUIDE_EXTRA } from '../assets/js/seed-places.js';

const NOW = Date.parse('2026-11-16T04:00:00Z');
const FUTURE = '08/29';
const memory = () => { const rows = new Map(); return { rows, getItem: (k) => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)), removeItem: (k) => rows.delete(k) }; };
const visa = (more = {}) => ({ number: '4242 4242 4242 4242', expiry: FUTURE, cvc: '123', name: 'Ada Lovelace', ...more });

describe('card numbers', () => {
  it('detects every accepted brand, also while the number is still being typed', () => {
    for (const [number, brand] of [
      ['4242424242424242', 'visa'], ['5555555555554444', 'mastercard'], ['2223003122003222', 'mastercard'],
      ['378282246310005', 'amex'], ['6011111111111117', 'discover'], ['6445644564456445', 'discover'], ['6500000000000002', 'discover'],
      ['3566002020360505', 'jcb'], ['30569309025904', 'diners'], ['36227206271667', 'diners'],
      ['6200000000000005', 'unionpay'], ['8171999927660000', 'unionpay'],
      ['4', 'visa'], ['37', 'amex'], ['353', 'jcb'], ['62', 'unionpay'], ['6011', 'discover'],
    ]) assert.equal(detectBrand(number), brand, number);
    for (const number of ['', '1234', '9', 'abcd', '7']) assert.equal(detectBrand(number), '', number);
    assert.notEqual(detectBrand('6200000000000005'), 'discover', '62 is UnionPay, not Discover');
  });
  it('checks the Luhn digit', () => {
    for (const number of ['4242424242424242', '5555555555554444', '378282246310005', '6011111111111117', '3566002020360505', '30569309025904']) assert.equal(luhnValid(number), true, number);
    for (const number of ['4242424242424241', '1234', '', 'abcd4242424242424242']) assert.equal(luhnValid(number), false, number);
  });
  it('groups the digits the way each card prints them', () => {
    assert.equal(formatCardNumber('4242424242424242'), '4242 4242 4242 4242');
    assert.equal(formatCardNumber('378282246310005'), '3782 822463 10005');
    assert.equal(formatCardNumber('30569309025904'), '3056 930902 5904');
    assert.equal(formatCardNumber('4242 42ab42'), '4242 4242');
    assert.equal(formatCardNumber('4'.repeat(30)).replace(/ /g, '').length, 19);
  });
});

describe('expiry, code and name', () => {
  it('reads expiry in the usual ways', () => {
    for (const [text, value] of [['08/29', { month: 8, year: 2029 }], ['8/29', { month: 8, year: 2029 }], ['0829', { month: 8, year: 2029 }], ['08 / 2029', { month: 8, year: 2029 }]]) assert.deepEqual(parseExpiry(text), value, text);
    for (const text of ['00/29', '13/29', '8-29', '', '082', 'ab/cd']) assert.equal(parseExpiry(text), null, text);
  });
  it('accepts this month, refuses last month and dates more than 20 years ahead', () => {
    assert.equal(validateCard(visa({ expiry: '11/26' }), NOW).ok, true);
    assert.deepEqual(validateCard(visa({ expiry: '10/26' }), NOW).errors, ['expiry']);
    assert.deepEqual(validateCard(visa({ expiry: '11/2047' }), NOW).errors, ['expiry']);
    assert.equal(validateCard(visa({ expiry: '11/2046' }), NOW).ok, true);
    assert.equal(cardExpired({ expMonth: 11, expYear: 2026 }, NOW), false); assert.equal(cardExpired({ expMonth: 10, expYear: 2026 }, NOW), true);
  });
  it('needs the security code length of the brand, and a real name', () => {
    assert.deepEqual(validateCard(visa({ cvc: '1234' }), NOW).errors, ['cvc']);
    assert.equal(validateCard({ number: '378282246310005', expiry: FUTURE, cvc: '1234', name: 'Ada' }, NOW).ok, true);
    assert.deepEqual(validateCard({ number: '378282246310005', expiry: FUTURE, cvc: '123', name: 'Ada' }, NOW).errors, ['cvc']);
    assert.deepEqual(validateCard(visa({ cvc: '12a' }), NOW).errors, ['cvc']);
    assert.deepEqual(validateCard(visa({ name: ' A ' }), NOW).errors, ['name']);
    assert.deepEqual(validateCard(visa({ name: 'x'.repeat(61) }), NOW).errors, ['name']);
    assert.deepEqual(validateCard({}, NOW).errors, ['number', 'expiry', 'cvc', 'name']);
    assert.deepEqual(validateCard(visa({ number: '4242424242424241' }), NOW).errors, ['number']);
    assert.deepEqual(validateCard(visa({ number: '42424242424242' }), NOW).errors, ['number'], 'a length Visa does not use');
    assert.equal(validateCard({ number: '6200000000000004', expiry: FUTURE, cvc: '123', name: 'Li Lei' }, NOW).ok, true, 'UnionPay does not require Luhn');
  });
  it('keeps only brand, last four, expiry and name; never the number or the code', () => {
    const { value } = validateCard(visa({ name: '  Ada   Lovelace ' }), NOW);
    assert.deepEqual(value, { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029, name: 'Ada Lovelace' });
    assert.doesNotMatch(JSON.stringify(value), /4242424242424242|123/);
  });
});

describe('wallet', () => {
  const setup = () => { const storage = memory(); let t = NOW, n = 0; return { storage, tick: () => { t += 1000; }, w: createWallet({ storage: () => storage, now: () => t, makeId: () => `c${++n}` }) }; };
  const A = walletScope({ email: 'Ada@Example.test' }), B = walletScope({ email: 'bob@example.test' });
  it('adds cards; the first is the default; duplicates and the ninth card are refused', () => {
    const { w, tick } = setup();
    const first = w.addCard(A, visa());
    assert.equal(first.ok, true); assert.equal(first.card.isDefault, true);
    assert.deepEqual(w.addCard(A, visa({ number: '4242424242424242' })), { ok: false, error: 'DUPLICATE' });
    tick(); assert.equal(w.addCard(A, { number: '5555555555554444', expiry: FUTURE, cvc: '123', name: 'Ada' }).card.isDefault, false);
    for (const [number, cvc] of [['378282246310005', '1234'], ['6011111111111117', '123'], ['3566002020360505', '123'], ['6200000000000005', '123'], ['30569309025904', '123'], ['4000056655665556', '123']]) { tick(); assert.equal(w.addCard(A, { number, expiry: FUTURE, cvc, name: 'Ada' }).ok, true, number); }
    assert.equal(w.listCards(A).length, MAX_CARDS);
    assert.deepEqual(w.addCard(A, { number: '4000000000000002', expiry: FUTURE, cvc: '123', name: 'Ada' }), { ok: false, error: 'LIMIT' });
    assert.equal(w.listCards(A)[0].id, first.card.id, 'the default card is listed first');
    const bad = w.addCard(A, { number: '1234', expiry: '', cvc: '', name: '' });
    assert.equal(bad.error, 'VALIDATION'); assert.deepEqual(bad.errors, ['number', 'expiry', 'cvc', 'name']);
  });
  it('changes and hands over the default; removes only known cards', () => {
    const { w, tick } = setup();
    const a = w.addCard(A, visa()).card; tick();
    const b = w.addCard(A, { number: '5555555555554444', expiry: FUTURE, cvc: '123', name: 'Ada' }).card; tick();
    const c = w.addCard(A, { number: '378282246310005', expiry: FUTURE, cvc: '1234', name: 'Ada' }, { makeDefault: true }).card;
    assert.equal(w.getDefaultCard(A).id, c.id);
    assert.equal(w.setDefaultCard(A, a.id).ok, true); assert.equal(w.getDefaultCard(A).id, a.id);
    assert.deepEqual(w.setDefaultCard(A, 'nope'), { ok: false, error: 'NOT_FOUND' });
    assert.equal(w.removeCard(A, a.id).ok, true);
    assert.equal(w.getDefaultCard(A).id, c.id, 'the newest remaining card becomes the default');
    assert.deepEqual(w.removeCard(A, a.id), { ok: false, error: 'NOT_FOUND' });
    assert.deepEqual(w.listCards(A).map((x) => x.id).sort(), [b.id, c.id].sort());
  });
  it('keeps each account apart and has no wallet without signing in', () => {
    const { w } = setup();
    w.addCard(A, visa());
    assert.deepEqual(w.listCards(B), []); assert.equal(w.getDefaultCard(B), null);
    assert.equal(walletScope(null), ''); assert.equal(walletScope({ email: '  ' }), '');
    assert.deepEqual(w.addCard('', visa()), { ok: false, error: 'SIGNED_OUT' }); assert.deepEqual(w.listCards(''), []);
  });
  it('never stores a full number or a security code', () => {
    const { w, storage } = setup();
    w.addCard(A, visa({ cvc: '987' })); w.addCard(A, { number: '378282246310005', expiry: FUTURE, cvc: '4321', name: 'Ada' });
    const stored = [...storage.rows.values()].join('\n');
    for (const secret of ['4242424242424242', '4242 4242', '378282246310005', '987', '4321', 'cvc', 'number']) assert.equal(stored.includes(secret), false, secret);
    assert.match(stored, /"last4":"4242"/);
  });
  it('reads damaged storage as empty without rewriting it, and a failed save reports STORAGE', () => {
    const { w, storage } = setup();
    for (const raw of ['{broken', '[]', JSON.stringify({ version: 1, scopes: { [A]: { cards: [{ id: 'x', brand: 'nope', last4: '12' }] } } })]) {
      storage.rows.set('along.wallet.v1', raw);
      assert.deepEqual(w.listCards(A), []); assert.equal(storage.rows.get('along.wallet.v1'), raw);
    }
    storage.rows.clear(); w.addCard(A, visa());
    const before = storage.rows.get('along.wallet.v1');
    storage.setItem = () => { throw new Error('full'); };
    assert.deepEqual(w.addCard(A, { number: '5555555555554444', expiry: FUTURE, cvc: '123', name: 'Ada' }), { ok: false, error: 'STORAGE' });
    assert.equal(storage.rows.get('along.wallet.v1'), before); assert.equal(w.listCards(A).length, 1);
  });
});

describe('demo authorisation', () => {
  const card = { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029 };
  const opts = { wait: async () => {}, now: () => NOW, makeId: () => 'demo_1' };
  it('approves without charging anything and says it is a demo', async () => {
    const result = await authorizeCardPayment({ card, amountCents: 3900, reference: 'INS-1234' }, opts);
    assert.deepEqual(result, { ok: true, payment: { id: 'demo_1', mode: 'DEMO', brand: 'visa', last4: '4242', amountCents: 3900, currency: 'USD', reference: 'INS-1234', at: NOW } });
    assert.equal(PAYMENT_MODE, 'DEMO');
  });
  it('declines the declining test card, an expired card, a bad amount and a broken card', async () => {
    assert.deepEqual(await authorizeCardPayment({ card: { ...card, last4: '0002' }, amountCents: 100 }, opts), { ok: false, error: 'CARD_DECLINED' });
    assert.deepEqual(await authorizeCardPayment({ card: { ...card, expYear: 2025 }, amountCents: 100 }, opts), { ok: false, error: 'CARD_EXPIRED' });
    for (const amountCents of [0, -5, 1.5, NaN, '100']) assert.deepEqual(await authorizeCardPayment({ card, amountCents }, opts), { ok: false, error: 'INVALID_AMOUNT' });
    assert.deepEqual(await authorizeCardPayment({ card: { brand: 'nope', last4: '1' }, amountCents: 100 }, opts), { ok: false, error: 'CARD_INVALID' });
  });
  it('every test card is valid for its brand; only the last one declines', () => {
    for (const sample of TEST_CARDS) {
      const result = validateCard({ number: sample.number, expiry: FUTURE, cvc: '1234'.slice(0, CARD_BRANDS[sample.brand].cvc), name: 'Test' }, NOW);
      assert.equal(result.ok, true, sample.number); assert.equal(result.value.brand, sample.brand);
      assert.equal(result.value.last4 === '0002', !!sample.declines);
    }
  });
});

describe('paying a booking by card', { concurrency: false }, () => {
  const EMAIL = 'traveller@example.test';
  const INSTANT = GUIDES.find((g) => GUIDE_EXTRA[g.id]?.status === 'ACTIVE' && GUIDE_EXTRA[g.id].instantBook);
  let original, storage;
  beforeEach(() => { original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); storage = memory(); Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage }); });
  afterEach(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; });
  const booked = () => {
    const slot = slotsFor(INSTANT.id, NOW)[0];
    const result = createBooking({ guideId: INSTANT.id, slotId: slot.id, email: EMAIL }, NOW);
    assert.equal(result.ok, true); assert.equal(result.booking.status, 'CONFIRMED');
    return result.booking;
  };
  const proof = (b, more = {}) => ({ id: 'demo_abc', mode: 'DEMO', brand: 'visa', last4: '4242', amountCents: b.amountCents, currency: 'USD', ...more });
  it('refuses a card payment without proof and leaves the booking as it was', () => {
    const b = booked(), before = JSON.stringify(getBooking(b.id, NOW));
    for (const payment of [null, undefined, {}, proof(b, { mode: 'LIVE' }), proof(b, { id: '' }), proof(b, { brand: 'nope' }), proof(b, { last4: '42' })]) {
      assert.deepEqual(payBooking(b.id, 'CARD', NOW, payment), { ok: false, error: 'UPSTREAM_ERROR' });
    }
    assert.equal(JSON.stringify(getBooking(b.id, NOW)), before);
  });
  it('refuses a payment for a different amount', () => {
    const b = booked();
    assert.deepEqual(payBooking(b.id, 'CARD', NOW, proof(b, { amountCents: b.amountCents - 1 })), { ok: false, error: 'CONFLICT' });
    assert.equal(getBooking(b.id, NOW).status, 'CONFIRMED');
  });
  it('records a demo card payment once, and paying again changes nothing', () => {
    const b = booked();
    const result = payBooking(b.id, 'CARD', NOW + 5, proof(b));
    assert.equal(result.ok, true); assert.equal(result.booking.status, 'PAID');
    const paid = getBooking(b.id, NOW + 5);
    assert.equal(paid.status, 'PAID');
    assert.deepEqual(paid.order, { id: `or_${b.id.slice(3)}`, provider: 'CARD', status: 'PAID', amountCents: b.amountCents, paidAt: NOW + 5, paymentId: 'demo_abc', mode: 'DEMO', brand: 'visa', last4: '4242' });
    assert.equal(payBooking(b.id, 'CARD', NOW + 9, proof(b, { id: 'demo_other' })).ok, true);
    assert.equal(getBooking(b.id, NOW + 9).order.paymentId, 'demo_abc', 'the first payment stands');
    assert.doesNotMatch([...storage.rows.values()].join(''), /4242424242424242/);
  });
  it('an expired booking cannot be paid by card', () => {
    const b = booked();
    assert.deepEqual(payBooking(b.id, 'CARD', b.payBy, proof(b)), { ok: false, error: 'EXPIRED' });
  });
  it('a booking still waiting for the guide cannot be paid', () => {
    const guide = GUIDES.find((g) => GUIDE_EXTRA[g.id]?.status === 'ACTIVE' && !GUIDE_EXTRA[g.id].instantBook);
    const slot = slotsFor(guide.id, NOW)[0];
    const b = createBooking({ guideId: guide.id, slotId: slot.id, email: EMAIL }, NOW).booking;
    assert.deepEqual(payBooking(b.id, 'CARD', NOW, proof(b)), { ok: false, error: 'CONFLICT' });
    assert.equal(confirmBooking(b.id, NOW).ok, true);
    assert.equal(payBooking(b.id, 'CARD', NOW + 1, proof(b)).ok, true);
  });
});

describe('copy and page wiring', () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
  it('payment copy matches in both languages', async () => {
    const [en, zh] = await Promise.all(['en', 'zh'].map(async (l) => JSON.parse(await read(`../assets/messages/pay.${l}.json`))));
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
    const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en)) { assert.ok(en[key].trim() && zh[key].trim()); assert.deepEqual(holes(en[key]), holes(zh[key]), key); assert.equal(en[key].includes('!'), false, key); }
  });
  it('card payment is offered, says it is a demo, and never reaches the network', async () => {
    const checkout = await read('../assets/js/page-checkout.js'), payments = await read('../assets/js/payments.js'), sheet = await read('../assets/js/card-sheet.js');
    assert.doesNotMatch(checkout, /value="CARD" disabled/);
    assert.match(checkout, /authorizeCardPayment\(/); assert.match(checkout, /payBooking\(b\.id, 'CARD'/); assert.match(checkout, /pay\.demo\.checkout/);
    for (const code of [payments, sheet, checkout]) { assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|sendBeacon|console\.log/); }
    assert.match(sheet, /autocomplete="cc-number"/); assert.match(sheet, /autocomplete="cc-csc"/); assert.match(sheet, /clearSecrets\(\)/);
    const en = JSON.parse(await read('../assets/messages/en.json'));
    assert.equal('checkout.card.off' in en, false); assert.doesNotMatch(en['error.UPSTREAM_ERROR'], /not connected/);
  });
});
