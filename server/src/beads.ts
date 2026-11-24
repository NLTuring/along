import { z } from 'zod';
import { audit, type Row } from './db.js';
import { digest, fail, id, iso, json, rateLimit, requireAdmin, requireUser, type App, type Services } from './core.js';

// Perler (fuse) bead patterns. One character per cell: '.' is empty, otherwise an index into
// the palette from this alphabet. A 128×128 picture (16 384 cells) fits in a 24 KB field.
export const CELL_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/';
export const BEAD_LIMITS = { min: 8, max: 128, colors: 48 } as const;
export const beadPattern = z.object({
  width: z.number().int().min(BEAD_LIMITS.min).max(BEAD_LIMITS.max),
  height: z.number().int().min(BEAD_LIMITS.min).max(BEAD_LIMITS.max),
  palette: z.array(z.object({ code: z.string().regex(/^[A-Z]{1,3}\d{1,3}$/), hex: z.string().regex(/^#[0-9a-f]{6}$/) }).strict()).min(1).max(BEAD_LIMITS.colors),
  cells: z.string().max(BEAD_LIMITS.max * BEAD_LIMITS.max),
  bead: z.enum(['MIDI_5MM', 'MINI_2_6MM']),
}).strict().superRefine((p, ctx) => {
  if (p.cells.length !== p.width * p.height) { ctx.addIssue({ code: 'custom', message: 'cells length' }); return; }
  let used = 0;
  for (const ch of p.cells) {
    if (ch === '.') continue;
    const index = CELL_ALPHABET.indexOf(ch);
    if (index < 0 || index >= p.palette.length) { ctx.addIssue({ code: 'custom', message: 'cell colour' }); return; }
    used++;
  }
  if (!used) ctx.addIssue({ code: 'custom', message: 'empty pattern' });
});
export type BeadPattern = z.infer<typeof beadPattern>;

/** Beads per palette colour, in palette order (colours with no beads are dropped). */
export function beadCounts(p: BeadPattern) {
  const counts = new Array(p.palette.length).fill(0);
  for (const ch of p.cells) if (ch !== '.') counts[CELL_ALPHABET.indexOf(ch)]++;
  return p.palette.map((colour, i) => ({ ...colour, count: counts[i] })).filter(c => c.count > 0);
}
// Kit pricing in fen. Beads come in bags of 1000 per colour; a full kit adds square pegboards
// (29×29 pegs each for 5 mm beads), ironing paper and tweezers.
export const KIT_PRICES = { bagCents: 600, bagSize: 1000, boardCents: 800, boardPegs: 29, toolsCents: 1500, shippingCents: 800 } as const;
export function kitQuote(p: BeadPattern, kit: 'BEADS' | 'FULL_KIT') {
  const colours = beadCounts(p);
  const bags = colours.reduce((sum, c) => sum + Math.ceil(c.count / KIT_PRICES.bagSize), 0);
  const boards = kit === 'FULL_KIT' ? Math.ceil(p.width / KIT_PRICES.boardPegs) * Math.ceil(p.height / KIT_PRICES.boardPegs) : 0;
  const lines = [
    { item: 'BEAD_BAGS', quantity: bags, cents: bags * KIT_PRICES.bagCents },
    ...(boards ? [{ item: 'PEGBOARDS', quantity: boards, cents: boards * KIT_PRICES.boardCents }, { item: 'TOOLS', quantity: 1, cents: KIT_PRICES.toolsCents }] : []),
    { item: 'SHIPPING', quantity: 1, cents: KIT_PRICES.shippingCents },
  ];
  return { colours, beads: colours.reduce((sum, c) => sum + c.count, 0), lines, totalCents: lines.reduce((sum, l) => sum + l.cents, 0) };
}

const shipping = z.object({ name: z.string().trim().min(1).max(100), phone: z.string().trim().min(5).max(32), region: z.string().trim().min(1).max(200), address: z.string().trim().min(1).max(500), postalCode: z.string().trim().max(20).default('') }).strict();
const orderView = (row: Row, summary = false) => ({
  id: row.id, status: row.status, kit: row.kit, amountCents: row.amount_cents, demoPayment: true,
  quote: kitQuote(row.pattern, row.kit), ...(summary ? {} : { pattern: row.pattern, shipping: row.shipping }),
  tracking: row.tracking, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
});

export function beadRoutes(app: App, s: Services) {
  app.post('/api/bead-orders/quote', async req => {
    requireUser(req);
    const data = z.object({ pattern: beadPattern, kit: z.enum(['BEADS', 'FULL_KIT']) }).strict().parse(req.body);
    return { quote: kitQuote(data.pattern, data.kit) };
  });
  // Payment is a labelled demo: the order is recorded as PAID_DEMO and no money moves.
  app.post('/api/bead-orders', async req => {
    const user = requireUser(req);
    const data = z.object({ pattern: beadPattern, kit: z.enum(['BEADS', 'FULL_KIT']), shipping, demoConsent: z.literal(true), idempotencyKey: z.string().min(8).max(128) }).strict().parse(req.body);
    await rateLimit(s, `bead-order:${user.id}`, 20, 3600_000);
    const hash = digest(s.config.secret, json({ pattern: data.pattern, kit: data.kit, shipping: data.shipping })), quote = kitQuote(data.pattern, data.kit);
    const row = await s.db.tx(async c => {
      const old = (await c.query('SELECT * FROM bead_orders WHERE owner_id=$1 AND idempotency_key=$2', [user.id, data.idempotencyKey])).rows[0];
      if (old) { if (old.request_hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT'); return old; }
      const created = (await c.query("INSERT INTO bead_orders(id,owner_id,status,kit,pattern,amount_cents,shipping,idempotency_key,request_hash) VALUES($1,$2,'PAID_DEMO',$3,$4,$5,$6,$7,$8) RETURNING *",
        [id(), user.id, data.kit, json(data.pattern), quote.totalCents, json(data.shipping), data.idempotencyKey, hash])).rows[0];
      await audit(c, user.id, 'bead-order.create', created.id, null, 'PAID_DEMO');
      return created;
    });
    return { order: orderView(row) };
  });
  app.get('/api/bead-orders', async req => {
    const user = requireUser(req);
    return { items: (await s.db.query('SELECT * FROM bead_orders WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50', [user.id])).rows.map(r => orderView(r, true)) };
  });
  app.get<{ Params: { id: string } }>('/api/bead-orders/:id', async req => {
    const user = requireUser(req), row = await s.db.one('SELECT * FROM bead_orders WHERE id=$1', [req.params.id]);
    if (!row || (row.owner_id !== user.id && user.role !== 'ADMIN')) fail(404, 'NOT_FOUND');
    return { order: orderView(row!) };
  });
  app.post<{ Params: { id: string } }>('/api/bead-orders/:id/cancel', async req => {
    const user = requireUser(req);
    const row = await s.db.tx(async c => {
      const row = (await c.query('SELECT * FROM bead_orders WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!row || row.owner_id !== user.id) fail(404, 'NOT_FOUND');
      if (row.status !== 'PAID_DEMO') fail(409, 'CONFLICT', 'Packed orders cannot be cancelled');
      const changed = (await c.query("UPDATE bead_orders SET status='CANCELLED',updated_at=now() WHERE id=$1 RETURNING *", [row.id])).rows[0];
      await audit(c, user.id, 'bead-order.cancel', row.id, row.status, 'CANCELLED');
      return changed;
    });
    return { order: orderView(row) };
  });
  app.get('/api/admin/bead-orders', async req => {
    requireAdmin(req);
    return { items: (await s.db.query('SELECT * FROM bead_orders ORDER BY created_at DESC LIMIT 100')).rows.map(r => orderView(r)) };
  });
  app.post<{ Params: { id: string } }>('/api/admin/bead-orders/:id/status', async req => {
    const admin = requireAdmin(req);
    const data = z.object({ status: z.enum(['PACKING', 'SHIPPED', 'CANCELLED']), carrier: z.string().trim().max(60).optional(), trackingNumber: z.string().trim().max(80).optional() }).strict().parse(req.body);
    const next: Record<string, string[]> = { PAID_DEMO: ['PACKING', 'CANCELLED'], PACKING: ['SHIPPED', 'CANCELLED'], SHIPPED: [], CANCELLED: [] };
    const row = await s.db.tx(async c => {
      const row = (await c.query('SELECT * FROM bead_orders WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!row) fail(404, 'NOT_FOUND');
      if (!next[row.status].includes(data.status)) fail(409, 'CONFLICT');
      if (data.status === 'SHIPPED' && !(data.carrier && data.trackingNumber)) fail(422, 'TRACKING_REQUIRED');
      const tracking = data.status === 'SHIPPED' ? { carrier: data.carrier, number: data.trackingNumber } : row.tracking;
      const changed = (await c.query('UPDATE bead_orders SET status=$2,tracking=$3,updated_at=now() WHERE id=$1 RETURNING *', [row.id, data.status, json(tracking)])).rows[0];
      await audit(c, admin.id, 'bead-order.status', row.id, row.status, data.status);
      return changed;
    });
    return { order: orderView(row) };
  });
}
