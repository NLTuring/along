// Workshop points: the rules, shared with the server (server/src/points.ts), and the ledger kept on
// the phone for the local experience. No DOM here so it can be tested in Node.

export const MONTHLY_GRANT = 50;
export const TOPUP_TIERS = Object.freeze([
  Object.freeze({ id: 'T30', yuan: 30, points: 600, bonus: 0 }),
  Object.freeze({ id: 'T60', yuan: 60, points: 1200, bonus: 100 }),
]);
export const PRICES = Object.freeze({ MAGNET: 5, KEYCHAIN: 5, BEADS: 5, AI_MODEL: 20 });
export const GALLERY_PRICE = Object.freeze({ min: 0, max: 50, default: 10 });
export const AUTHOR_SHARE = 0.5;
const ITEMS = new Set(['MAGNET', 'KEYCHAIN', 'BEADS', 'AI_MODEL', 'GALLERY']);
const MAX_LEDGER = 200;

export function grantMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}
export const authorEarning = (price) => Math.floor(price * AUTHOR_SHARE);
export const tierPoints = (tier) => tier.points + tier.bonus;

export class PointsError extends Error {
  constructor(code, detail = {}) { super(code); this.code = code; Object.assign(this, detail); }
}

/**
 * The local ledger. Same behaviour as the server: one free grant per China calendar month,
 * one credit per idempotency key, and a spend never takes the balance below zero.
 */
export function createLocalPoints({ storage = () => globalThis.localStorage, now = () => new Date(), scope = 'local', newId = () => `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` } = {}) {
  const key = `along.points.v1:${scope}`;
  let memory = null;
  function read() {
    try {
      const value = JSON.parse(storage()?.getItem(key) || 'null');
      if (value && Number.isSafeInteger(value.balance) && value.balance >= 0 && Array.isArray(value.ledger)) return value;
    } catch { /* unreadable storage starts a fresh ledger */ }
    return memory ? structuredClone(memory) : { balance: 0, month: '', ledger: [], keys: {} };
  }
  function write(value) {
    value.ledger = value.ledger.slice(0, MAX_LEDGER);
    memory = structuredClone(value);
    try { storage()?.setItem(key, JSON.stringify(value)); } catch { /* the in-memory copy keeps working */ }
  }
  function entry(value, delta, reason, item, ref, idempotencyKey) {
    const row = { id: newId(), delta, balanceAfter: value.balance + delta, reason, item, ref, createdAt: now().toISOString() };
    value.balance += delta;
    value.ledger.unshift(row);
    value.keys[idempotencyKey] = row.id;
    return row;
  }
  function grant(value) {
    const month = grantMonth(now());
    if (value.month !== month) {
      if (!value.keys[`grant:${month}`]) entry(value, MONTHLY_GRANT, 'MONTHLY_GRANT', 'GRANT', month, `grant:${month}`);
      value.month = month;
    }
    return value;
  }
  function find(value, idempotencyKey) {
    const id = value.keys[idempotencyKey];
    return id ? value.ledger.find((row) => row.id === id) || { id, replay: true } : null;
  }
  return {
    state() { const value = grant(read()); write(value); return { balance: value.balance, month: value.month, ledger: value.ledger.slice(0, 60) }; },
    has(idempotencyKey) { return Boolean(read().keys?.[idempotencyKey]); },
    topup(tierId, idempotencyKey) {
      const tier = TOPUP_TIERS.find((t) => t.id === tierId);
      if (!tier) throw new PointsError('INVALID_TIER');
      const value = grant(read()), old = find(value, `topup:${idempotencyKey}`);
      if (old) return { balance: value.balance, entry: old, replay: true };
      const row = entry(value, tierPoints(tier), 'TOPUP', 'TOPUP', `demo:${tier.id}`, `topup:${idempotencyKey}`);
      write(value);
      return { balance: value.balance, entry: row, replay: false };
    },
    spend(item, ref, idempotencyKey, cost = PRICES[item]) {
      if (!ITEMS.has(item) || !Number.isSafeInteger(cost) || cost < 0) throw new PointsError('INVALID_ITEM');
      const value = grant(read()), old = find(value, `spend:${idempotencyKey}`);
      if (old) return { balance: value.balance, entry: old, replay: true };
      if (cost === 0) { value.keys[`spend:${idempotencyKey}`] = 'free'; write(value); return { balance: value.balance, entry: null, replay: false }; }
      if (value.balance < cost) throw new PointsError('POINTS_INSUFFICIENT', { needed: cost, balance: value.balance });
      const row = entry(value, -cost, 'SPEND', item, String(ref).slice(0, 128), `spend:${idempotencyKey}`);
      write(value);
      return { balance: value.balance, entry: row, replay: false };
    },
    refund(item, ref, idempotencyKey, amount) {
      const value = grant(read()), old = find(value, `refund:${idempotencyKey}`);
      if (old) return { balance: value.balance, entry: old, replay: true };
      const row = entry(value, amount, 'REFUND', item, String(ref).slice(0, 128), `refund:${idempotencyKey}`);
      write(value);
      return { balance: value.balance, entry: row, replay: false };
    },
  };
}
