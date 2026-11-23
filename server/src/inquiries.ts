import { z } from 'zod';
import { audit, type Row, type SQL } from './db.js';
import { digest, fail, id, iso, json, owner, requireAdmin, requireUser, type App, type Services } from './core.js';

const shippingSchema = z.object({ name: z.string().trim().min(1).max(100), phone: z.string().trim().min(5).max(32), region: z.string().trim().min(1).max(200), address: z.string().trim().min(1).max(500), postalCode: z.string().trim().max(20).default('') }).strict();
const notes = z.string().trim().max(4000);
const createSchema = z.object({ modelId: z.string().uuid(), quantity: z.number().int().min(1).max(1000), material: z.string().trim().min(1).max(100), colorProcess: z.string().trim().min(1).max(100), notes: notes.default(''), shipping: shippingSchema, consent: z.literal(true), idempotencyKey: z.string().min(8).max(128) }).strict();
const preproduction = ['REQUESTED', 'NEEDS_INFO', 'QUOTED', 'CONFIRMED'];
export function inquiryView(row: Row, summary = false) {
  const details = { ...row.details };
  if (summary) { delete details.shipping; delete details.notes; delete details.statusNote; }
  return { id: row.id, modelId: row.model_id, modelVersion: row.model_version, status: row.status, ...details, quote: row.quote, tracking: row.tracking, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
async function locked(c: SQL, inquiryId: string) {
  const row = (await c.query('SELECT * FROM inquiries WHERE id=$1 FOR UPDATE', [inquiryId])).rows[0];
  if (!row) fail(404, 'NOT_FOUND'); return row;
}
async function update(c: SQL, row: Row, data: { status?: string; quote?: unknown; tracking?: unknown; details?: unknown }, actor: string, action: string) {
  const changed = await c.query(`UPDATE inquiries SET status=$2,quote=$3,tracking=$4,details=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$6 RETURNING *`, [row.id, data.status ?? row.status, json(data.quote === undefined ? row.quote : data.quote), json(data.tracking === undefined ? row.tracking : data.tracking), json(data.details ?? row.details), row.revision]);
  if (!changed.rowCount) fail(409, 'CONFLICT');
  await audit(c, actor, action, row.id, row.status, data.status ?? row.status);
  return changed.rows[0];
}
export function inquiryRoutes(app: App, s: Services) {
  app.post('/api/inquiries', async req => {
    const user = requireUser(req), data = createSchema.parse(req.body), hash = digest(s.config.secret, json(data));
    const inquiry = await s.db.tx(async c => {
      const old = (await c.query('SELECT * FROM inquiries WHERE owner_id=$1 AND idempotency_key=$2', [user.id, data.idempotencyKey])).rows[0];
      if (old) { if (old.request_hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT'); return old; }
      const model = (await c.query('SELECT * FROM craft_models WHERE id=$1', [data.modelId])).rows[0];
      if (!model || model.owner_id !== user.id) fail(404, 'NOT_FOUND');
      const details = { product: model.metadata.product, quantity: data.quantity, material: data.material, colorProcess: data.colorProcess, notes: data.notes, shipping: data.shipping };
      const inquiryId = id();
      const row = (await c.query("INSERT INTO inquiries(id,owner_id,model_id,model_version,status,idempotency_key,request_hash,details) VALUES($1,$2,$3,$4,'REQUESTED',$5,$6,$7) ON CONFLICT(owner_id,idempotency_key) DO NOTHING RETURNING *", [inquiryId, user.id, model.id, model.version, data.idempotencyKey, hash, json(details)])).rows[0];
      if (row) { await audit(c, user.id, 'inquiry.create', row.id, null, 'REQUESTED'); return row; }
      const duplicate = (await c.query('SELECT * FROM inquiries WHERE owner_id=$1 AND idempotency_key=$2', [user.id, data.idempotencyKey])).rows[0];
      if (duplicate.request_hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT'); return duplicate;
    });
    return { inquiry: inquiryView(inquiry) };
  });
  app.get('/api/inquiries', async req => {
    const user = requireUser(req); return { items: (await s.db.query('SELECT * FROM inquiries WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100', [user.id])).rows.map(r => inquiryView(r, true)) };
  });
  app.get('/api/admin/inquiries', async req => { requireAdmin(req); return { items: (await s.db.query('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 100')).rows.map(r => inquiryView(r, true)) }; });
  app.get<{ Params: { id: string } }>('/api/inquiries/:id', async req => ({ inquiry: inquiryView(owner(req, await s.db.one('SELECT * FROM inquiries WHERE id=$1', [req.params.id]))) }));
  app.patch<{ Params: { id: string } }>('/api/inquiries/:id', async req => {
    const user = requireUser(req), data = z.object({ notes: notes.optional(), shipping: shippingSchema.optional() }).strict().refine(v => Object.keys(v).length > 0).parse(req.body);
    const row = await s.db.tx(async c => {
      const row = await locked(c, req.params.id);
      if (row.owner_id !== user.id) fail(404, 'NOT_FOUND');
      if (!['REQUESTED', 'NEEDS_INFO'].includes(row.status)) fail(409, 'CONFLICT');
      return update(c, row, { details: { ...row.details, ...data } }, user.id, 'inquiry.update');
    }); return { inquiry: inquiryView(row) };
  });
  app.post<{ Params: { id: string } }>('/api/inquiries/:id/confirm', async req => {
    const user = requireUser(req), data = z.object({ quoteRevision: z.number().int().min(1) }).strict().parse(req.body);
    const row = await s.db.tx(async c => {
      const row = await locked(c, req.params.id);
      if (row.owner_id !== user.id) fail(404, 'NOT_FOUND');
      if (row.status !== 'QUOTED' || row.quote?.revision !== data.quoteRevision) fail(409, 'CONFLICT', 'Quote changed or cannot be confirmed');
      return update(c, row, { status: 'CONFIRMED' }, user.id, 'inquiry.confirm');
    }); return { inquiry: inquiryView(row) };
  });
  app.post<{ Params: { id: string } }>('/api/inquiries/:id/cancel', async req => {
    const user = requireUser(req); z.object({ reason: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
    const row = await s.db.tx(async c => {
      const row = await locked(c, req.params.id);
      if (row.owner_id !== user.id) fail(404, 'NOT_FOUND');
      if (row.status === 'CANCELLED') return row;
      if (!preproduction.includes(row.status)) fail(409, 'CONFLICT', 'Production started; contact manual support');
      return update(c, row, { status: 'CANCELLED' }, user.id, 'inquiry.cancel');
    }); return { inquiry: inquiryView(row) };
  });
  app.post<{ Params: { id: string } }>('/api/admin/inquiries/:id/quote', async req => {
    const user = requireAdmin(req), data = z.object({ productionCents: z.number().int().min(1).max(100_000_000), shippingCents: z.number().int().min(0).max(10_000_000), leadDays: z.number().int().min(1).max(365), note: z.string().trim().max(2000).default('') }).strict().parse(req.body);
    const row = await s.db.tx(async c => {
      const row = await locked(c, req.params.id);
      if (!['REQUESTED', 'NEEDS_INFO', 'QUOTED'].includes(row.status)) fail(409, 'CONFLICT');
      const latest = (await c.query('SELECT revision FROM inquiry_quotes WHERE inquiry_id=$1 ORDER BY revision DESC LIMIT 1', [row.id])).rows[0];
      const quote = { ...data, revision: (latest?.revision || 0) + 1, totalCents: data.productionCents + data.shippingCents };
      await c.query('INSERT INTO inquiry_quotes(inquiry_id,revision,quote,created_by) VALUES($1,$2,$3,$4)', [row.id, quote.revision, json(quote), user.id]);
      return update(c, row, { status: 'QUOTED', quote }, user.id, 'inquiry.quote');
    }); return { inquiry: inquiryView(row) };
  });
  app.post<{ Params: { id: string } }>('/api/admin/inquiries/:id/status', async req => {
    const user = requireAdmin(req), data = z.object({ status: z.enum(['NEEDS_INFO', 'PRODUCING', 'SHIPPED', 'COMPLETED', 'CANCELLED']), note: z.string().trim().max(2000).optional(), carrier: z.string().trim().min(1).max(100).optional(), number: z.string().trim().min(1).max(100).optional() }).strict().parse(req.body);
    const row = await s.db.tx(async c => {
      const row = await locked(c, req.params.id);
      const allowed: Record<string, string[]> = { REQUESTED: ['NEEDS_INFO', 'CANCELLED'], NEEDS_INFO: ['CANCELLED'], QUOTED: ['NEEDS_INFO', 'CANCELLED'], CONFIRMED: ['PRODUCING', 'CANCELLED'], PRODUCING: ['SHIPPED'], SHIPPED: ['COMPLETED'] };
      if (!allowed[row.status]?.includes(data.status)) fail(409, 'CONFLICT');
      if (data.status === 'SHIPPED' && (!data.carrier || !data.number)) fail(422, 'TRACKING_REQUIRED');
      if (data.status === 'NEEDS_INFO' && !data.note) fail(422, 'NOTE_REQUIRED');
      return update(c, row, { status: data.status, details: { ...row.details, statusNote: data.note || '' }, ...(data.status === 'SHIPPED' ? { tracking: { carrier: data.carrier, number: data.number } } : {}) }, user.id, 'inquiry.status');
    }); return { inquiry: inquiryView(row) };
  });
}
