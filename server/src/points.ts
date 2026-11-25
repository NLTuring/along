import { z } from 'zod';
import type { SQL } from './db.js';
import { audit, type Row } from './db.js';
import { fail, id, iso, rateLimit, requireUser, type App, type Services } from './core.js';

// Workshop points. Every change is one ledger row inside the caller's transaction, and the
// account row is locked first so concurrent spends cannot overdraw.
export const MONTHLY_GRANT = 50;
export const TOPUP_TIERS = [
  { id: 'T30', yuan: 30, points: 600, bonus: 0 },
  { id: 'T60', yuan: 60, points: 1200, bonus: 100 },
] as const;
// AI_MODEL: two AIs relay (draft + repair). AI_MODEL_TRIPO: Tripo generates the mesh directly and costs more.
export const PRICES = { MAGNET: 5, KEYCHAIN: 5, BEADS: 5, AI_MODEL: 20, AI_MODEL_TRIPO: 40 } as const;
export const GALLERY_PRICE = { min: 0, max: 50, default: 10 } as const;
// Share of a gallery unlock paid to the creator; the rest is the platform's.
export const AUTHOR_SHARE = 0.5;
export type PointItem = keyof typeof PRICES | 'GALLERY' | 'TOPUP' | 'GRANT';
type Reason = 'MONTHLY_GRANT' | 'TOPUP' | 'SPEND' | 'EARN' | 'REFUND';

// Grants follow the China calendar month, the same for every traveller.
export function grantMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
}
export const ledgerView = (row: Row) => ({ id: row.id, delta: row.delta, balanceAfter: row.balance_after, reason: row.reason, item: row.item, ref: row.ref, createdAt: iso(row.created_at) });

/** Lock (or open) the account and add this month's free points once. */
export async function account(c: SQL, userId: string, month = grantMonth()) {
  let row = (await c.query('SELECT * FROM point_accounts WHERE user_id=$1 FOR UPDATE', [userId])).rows[0];
  if (!row) {
    await c.query('INSERT INTO point_accounts(user_id,balance,grant_month) VALUES($1,0,$2) ON CONFLICT(user_id) DO NOTHING', [userId, '']);
    row = (await c.query('SELECT * FROM point_accounts WHERE user_id=$1 FOR UPDATE', [userId])).rows[0];
  }
  if (row.grant_month !== month) {
    // The ledger key makes the grant once-per-month even if the account row was ever reset.
    const granted = (await c.query('SELECT 1 AS one FROM point_ledger WHERE user_id=$1 AND idempotency_key=$2', [userId, `grant:${month}`])).rows.length > 0;
    if (!granted) await c.query('INSERT INTO point_ledger(id,user_id,delta,balance_after,reason,item,ref,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [id(), userId, MONTHLY_GRANT, row.balance + MONTHLY_GRANT, 'MONTHLY_GRANT', 'GRANT', month, `grant:${month}`]);
    const balance = row.balance + (granted ? 0 : MONTHLY_GRANT);
    await c.query('UPDATE point_accounts SET balance=$2,grant_month=$3,updated_at=now() WHERE user_id=$1', [userId, balance, month]);
    row = { ...row, balance, grant_month: month };
  }
  return row;
}

/**
 * Apply one change. The same idempotency key never applies twice: a retry returns the first entry.
 * Spending more than the balance fails with 402 and changes nothing.
 */
export async function changePoints(c: SQL, userId: string, change: { delta: number; reason: Reason; item: PointItem; ref: string; key: string }) {
  if (!Number.isSafeInteger(change.delta) || change.delta === 0) throw new Error('Invalid point change');
  const row = await account(c, userId);
  const old = (await c.query('SELECT * FROM point_ledger WHERE user_id=$1 AND idempotency_key=$2', [userId, change.key])).rows[0];
  if (old) {
    if (old.delta !== change.delta || old.item !== change.item || old.ref !== change.ref) fail(409, 'IDEMPOTENCY_CONFLICT');
    return { balance: row.balance as number, entry: old, replay: true };
  }
  const balance = row.balance + change.delta;
  if (balance < 0) fail(402, 'POINTS_INSUFFICIENT', `Needs ${-change.delta} points, has ${row.balance}`);
  await c.query('UPDATE point_accounts SET balance=$2,updated_at=now() WHERE user_id=$1', [userId, balance]);
  const entry = (await c.query('INSERT INTO point_ledger(id,user_id,delta,balance_after,reason,item,ref,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [id(), userId, change.delta, balance, change.reason, change.item, change.ref, change.key])).rows[0];
  return { balance, entry, replay: false };
}

const key = z.string().min(8).max(128).regex(/^[A-Za-z0-9:_-]+$/);
const ref = z.string().min(1).max(128).regex(/^[A-Za-z0-9:_.-]+$/);

export function pointRoutes(app: App, s: Services) {
  app.get('/api/points', async req => {
    const user = requireUser(req);
    const { balance, month, ledger } = await s.db.tx(async c => {
      const row = await account(c, user.id);
      const rows = (await c.query('SELECT * FROM point_ledger WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 60', [user.id])).rows;
      return { balance: row.balance, month: row.grant_month, ledger: rows };
    });
    return { balance, month, monthlyGrant: MONTHLY_GRANT, tiers: TOPUP_TIERS, prices: PRICES, gallery: { ...GALLERY_PRICE, authorShare: AUTHOR_SHARE },
      demoTopup: s.config.pointsDemoTopup, ledger: ledger.map(ledgerView) };
  });
  app.post('/api/points/topup', async req => {
    const user = requireUser(req), data = z.object({ tier: z.enum(['T30', 'T60']), idempotencyKey: key, demoConsent: z.literal(true) }).strict().parse(req.body);
    // Only the labelled demo exists. A real processor must confirm payment server-side before crediting.
    if (!s.config.pointsDemoTopup) fail(503, 'PAYMENT_UNAVAILABLE');
    await rateLimit(s, `topup:${user.id}`, 12, 3600_000);
    const tier = TOPUP_TIERS.find(t => t.id === data.tier)!;
    const result = await s.db.tx(async c => {
      const done = await changePoints(c, user.id, { delta: tier.points + tier.bonus, reason: 'TOPUP', item: 'TOPUP', ref: `demo:${tier.id}`, key: `topup:${data.idempotencyKey}` });
      if (!done.replay) await audit(c, user.id, 'points.topup.demo', done.entry.id, null, tier.id);
      return done;
    });
    return { balance: result.balance, entry: ledgerView(result.entry), demo: true };
  });
  // Magnet, keychain and bead patterns are generated on the phone; this records the charge first.
  app.post('/api/points/spend', async req => {
    const user = requireUser(req), data = z.object({ item: z.enum(['MAGNET', 'KEYCHAIN', 'BEADS']), ref, idempotencyKey: key }).strict().parse(req.body);
    await rateLimit(s, `spend:${user.id}`, 120, 3600_000);
    const result = await s.db.tx(c => changePoints(c, user.id, { delta: -PRICES[data.item], reason: 'SPEND', item: data.item, ref: data.ref, key: `spend:${data.idempotencyKey}` }));
    return { balance: result.balance, entry: ledgerView(result.entry), replay: result.replay };
  });
}
