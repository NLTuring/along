// Along — bank cards and card payment.
//
// DEMO MODE. No payment processor or merchant account is connected, so nothing is charged and
// no card is checked with a bank. authorizeCardPayment() below is the single place a real
// processor's tokenised payment call replaces. With a real processor, the card fields must be
// the processor's own hosted fields, so a card number never passes through this app's code or
// server; only the processor's token and the card's brand and last four digits come back.
//
// What is kept on this phone: brand, last four digits, expiry and the name on the card. The full
// number and the security code are never stored, logged, put in a URL or sent anywhere.

export const PAYMENT_MODE = 'DEMO';
const KEY = 'along.wallet.v1';
export const MAX_CARDS = 8;

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
// Prefixes are checked longest first, so 62 (UnionPay) is never read as Discover's 6.
export const CARD_BRANDS = Object.freeze({
  visa: { label: 'Visa', prefixes: ['4'], lengths: [13, 16, 19], cvc: 3, luhn: true },
  mastercard: { label: 'Mastercard', prefixes: [...range(51, 55), ...range(2221, 2720)], lengths: [16], cvc: 3, luhn: true },
  amex: { label: 'American Express', prefixes: ['34', '37'], lengths: [15], cvc: 4, luhn: true },
  discover: { label: 'Discover', prefixes: ['6011', '65', ...range(644, 649)], lengths: [16, 17, 18, 19], cvc: 3, luhn: true },
  jcb: { label: 'JCB', prefixes: range(3528, 3589), lengths: [16, 17, 18, 19], cvc: 3, luhn: true },
  diners: { label: 'Diners Club', prefixes: [...range(300, 305), '36', '38', '39'], lengths: [14, 15, 16, 17, 18, 19], cvc: 3, luhn: true },
  unionpay: { label: 'UnionPay', prefixes: ['62', '81'], lengths: [16, 17, 18, 19], cvc: 3, luhn: false },
});
const PREFIXES = Object.entries(CARD_BRANDS).flatMap(([brand, b]) => b.prefixes.map((prefix) => ({ brand, prefix }))).sort((a, b) => b.prefix.length - a.prefix.length);

export const digitsOf = (value) => String(value ?? '').replace(/[\s-]/g, '');

// Works on partial input, for the live brand badge while typing.
export function detectBrand(digits) {
  const value = digitsOf(digits);
  if (!/^\d+$/.test(value)) return '';
  for (const { brand, prefix } of PREFIXES) {
    if (value.length >= prefix.length ? value.startsWith(prefix) : false) return brand;
  }
  // Too short to reach a long prefix: a partial that can only grow into one brand still counts.
  const possible = new Set(PREFIXES.filter(({ prefix }) => value.length < prefix.length && prefix.startsWith(value)).map(({ brand }) => brand));
  return possible.size === 1 ? [...possible][0] : '';
}

export function luhnValid(digits) {
  const value = digitsOf(digits);
  if (!/^\d{12,19}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    let n = Number(value[value.length - 1 - i]);
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

// Groups for display: 4-4-4-4…, Amex 4-6-5, a 14-digit Diners card 4-6-4.
export function formatCardNumber(digits, brand = detectBrand(digits)) {
  const value = digitsOf(digits).replace(/\D/g, '').slice(0, 19);
  const groups = brand === 'amex' ? [4, 6, 5] : brand === 'diners' && value.length <= 14 ? [4, 6, 4] : null;
  if (!groups) return value.replace(/(\d{4})(?=\d)/g, '$1 ');
  const parts = [];
  let at = 0;
  for (const size of groups) { if (at >= value.length) break; parts.push(value.slice(at, at + size)); at += size; }
  if (at < value.length) parts.push(value.slice(at));
  return parts.join(' ');
}

// '08/29', '8/29', '0829', '08 / 2029' -> { month: 8, year: 2029 }
export function parseExpiry(text) {
  const value = String(text ?? '').replace(/\s/g, '');
  const match = /^(\d{1,2})\/(\d{2}|\d{4})$/.exec(value) || /^(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[1]), year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  return month >= 1 && month <= 12 ? { month, year } : null;
}

// A card is good through the last day of its expiry month.
export function cardExpired(card, now = Date.now()) {
  const date = new Date(now), year = date.getFullYear(), month = date.getMonth() + 1;
  return !card || card.expYear < year || (card.expYear === year && card.expMonth < month);
}

export function validateCard({ number, expiry, cvc, name } = {}, now = Date.now()) {
  const errors = [], digits = digitsOf(number), brand = /^\d+$/.test(digits) ? detectBrand(digits) : '';
  const spec = CARD_BRANDS[brand];
  if (!spec || !spec.lengths.includes(digits.length) || (spec.luhn && !luhnValid(digits))) errors.push('number');
  const exp = parseExpiry(expiry), year = new Date(now).getFullYear();
  if (!exp || cardExpired({ expMonth: exp.month, expYear: exp.year }, now) || exp.year > year + 20) errors.push('expiry');
  const code = String(cvc ?? '').trim();
  if (!/^\d+$/.test(code) || code.length !== (spec?.cvc || 3)) errors.push('cvc');
  const holder = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (holder.length < 2 || holder.length > 60) errors.push('name');
  return { ok: !errors.length, errors,
    value: errors.length ? null : { brand, last4: digits.slice(-4), expMonth: exp.month, expYear: exp.year, name: holder } };
}

export const brandLabel = (brand) => CARD_BRANDS[brand]?.label || '';
export const expiryText = (card) => `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`;

export function walletScope(session) {
  return typeof session?.email === 'string' && session.email.trim() ? session.email.trim().toLowerCase() : '';
}

const safeCard = (c) => c && typeof c.id === 'string' && CARD_BRANDS[c.brand] && /^\d{4}$/.test(c.last4)
  && Number.isInteger(c.expMonth) && c.expMonth >= 1 && c.expMonth <= 12 && Number.isInteger(c.expYear)
  && typeof c.name === 'string' && Number.isFinite(c.createdAt);

export function createWallet({ storage = () => globalThis.localStorage, now = () => Date.now(),
  makeId = () => `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` } = {}) {
  function readAll() {
    try {
      const value = JSON.parse(storage()?.getItem(KEY) || 'null');
      return value?.version === 1 && value.scopes && typeof value.scopes === 'object' && !Array.isArray(value.scopes) ? value : { version: 1, scopes: {} };
    } catch { return { version: 1, scopes: {} }; }
  }
  function scopeData(all, scope) {
    const raw = all.scopes[scope], cards = (Array.isArray(raw?.cards) ? raw.cards : []).filter(safeCard)
      .map(({ id, brand, last4, expMonth, expYear, name, createdAt }) => ({ id, brand, last4, expMonth, expYear, name, createdAt }));
    return { cards, defaultId: cards.some((c) => c.id === raw?.defaultId) ? raw.defaultId : cards[0]?.id || '' };
  }
  function change(scope, work) {
    if (!scope) return { ok: false, error: 'SIGNED_OUT' };
    const all = readAll(), data = scopeData(all, scope), result = work(data);
    if (!result.ok) return result;
    all.scopes[scope] = data;
    try { storage().setItem(KEY, JSON.stringify(all)); } catch { return { ok: false, error: 'STORAGE' }; }
    return result;
  }
  const listCards = (scope) => {
    if (!scope) return [];
    const { cards, defaultId } = scopeData(readAll(), scope);
    return [...cards].sort((a, b) => (b.id === defaultId) - (a.id === defaultId) || b.createdAt - a.createdAt).map((c) => ({ ...c, isDefault: c.id === defaultId }));
  };
  return {
    listCards,
    getDefaultCard: (scope) => listCards(scope).find((c) => c.isDefault) || null,
    addCard(scope, input, { makeDefault = false } = {}) {
      if (!scope) return { ok: false, error: 'SIGNED_OUT' };
      const checked = validateCard(input, now());
      if (!checked.ok) return { ok: false, error: 'VALIDATION', errors: checked.errors };
      return change(scope, (data) => {
        const v = checked.value;
        if (data.cards.some((c) => c.brand === v.brand && c.last4 === v.last4 && c.expMonth === v.expMonth && c.expYear === v.expYear)) return { ok: false, error: 'DUPLICATE' };
        if (data.cards.length >= MAX_CARDS) return { ok: false, error: 'LIMIT' };
        const card = { id: makeId(), ...v, createdAt: now() };
        data.cards.push(card);
        if (makeDefault || data.cards.length === 1) data.defaultId = card.id;
        return { ok: true, card: { ...card, isDefault: data.defaultId === card.id } };
      });
    },
    removeCard(scope, id) {
      return change(scope, (data) => {
        if (!data.cards.some((c) => c.id === id)) return { ok: false, error: 'NOT_FOUND' };
        data.cards = data.cards.filter((c) => c.id !== id);
        if (data.defaultId === id) data.defaultId = [...data.cards].sort((a, b) => b.createdAt - a.createdAt)[0]?.id || '';
        return { ok: true };
      });
    },
    setDefaultCard(scope, id) {
      return change(scope, (data) => {
        if (!data.cards.some((c) => c.id === id)) return { ok: false, error: 'NOT_FOUND' };
        data.defaultId = id;
        return { ok: true };
      });
    },
  };
}

const wallet = createWallet();
export const listCards = (...args) => wallet.listCards(...args);
export const getDefaultCard = (...args) => wallet.getDefaultCard(...args);
export const addCard = (...args) => wallet.addCard(...args);
export const removeCard = (...args) => wallet.removeCard(...args);
export const setDefaultCard = (...args) => wallet.setDefaultCard(...args);

// Public processor test numbers, for trying the flow without a real card. The last one is declined here.
export const TEST_CARDS = Object.freeze([
  { brand: 'visa', number: '4242424242424242' },
  { brand: 'mastercard', number: '5555555555554444' },
  { brand: 'amex', number: '378282246310005' },
  { brand: 'discover', number: '6011111111111117' },
  { brand: 'jcb', number: '3566002020360505' },
  { brand: 'unionpay', number: '6200000000000005' },
  { brand: 'visa', number: '4000000000000002', declines: true },
]);

// DEMO: stands in for a processor's authorisation. Nothing is charged.
export async function authorizeCardPayment({ card, amountCents, currency = 'USD', reference = '' } = {},
  { wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now(),
    makeId = () => `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` } = {}) {
  await wait(900);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { ok: false, error: 'INVALID_AMOUNT' };
  if (!card || !CARD_BRANDS[card.brand] || !/^\d{4}$/.test(card.last4 || '')) return { ok: false, error: 'CARD_INVALID' };
  if (cardExpired(card, now())) return { ok: false, error: 'CARD_EXPIRED' };
  if (card.last4 === '0002') return { ok: false, error: 'CARD_DECLINED' };
  return { ok: true, payment: { id: makeId(), mode: PAYMENT_MODE, brand: card.brand, last4: card.last4, amountCents, currency, reference: String(reference).slice(0, 40), at: now() } };
}
