import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { audit, type Row } from './db.js';
import { fail, id, iso, json, rateLimit, requireAdmin, requireUser, sendFile, type App, type Services } from './core.js';
import { normalizeImage, readMultipart } from './media.js';
import { inspectGlb } from './models.js';
import { objectKey } from './storage.js';
import { beadPattern } from './beads.js';
import { account, AUTHOR_SHARE, changePoints, GALLERY_PRICE } from './points.js';
import { workshopFile } from './workshop-files.js';

// The workshop gallery. Creators upload a cover plus a 3D model (or a bead pattern); an admin
// reviews it before it is public. Downloading or remixing someone else's work costs its point
// price once; the author receives AUTHOR_SHARE of it and the platform keeps the rest.
const PAGE = 24;
// Coloured clay parts (PINCH layout lines). Only shapes, sizes and colours: no text the phone would render as HTML.
const clayRecipe = z.object({ parts: z.array(z.union([
  z.object({ id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), mirrorOf: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/) }).strict(),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), primitive: z.enum(['sphere', 'box', 'cylinder', 'cone', 'capsule', 'torus', 'prism']),
    params: z.record(z.string().max(16), z.number().finite().min(-2000).max(2000)), position: z.array(z.number().finite().min(-2000).max(2000)).length(3),
    rotation: z.array(z.number().finite().min(-360).max(360)).length(3).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    mode: z.enum(['solid', 'hole']).optional(), blend: z.number().min(0).max(40).optional(),
  }).strict(),
])).min(1).max(24) }).strict();
const metadata = z.object({
  kind: z.enum(['CLAY', 'BEADS', 'MAGNET', 'KEYCHAIN']),
  title: z.string().trim().min(1).max(60), story: z.string().trim().max(600).default(''), city: z.string().trim().max(40).default(''),
  price: z.number().int().min(GALLERY_PRICE.min).max(GALLERY_PRICE.max), allowRemix: z.boolean(),
  remixOf: z.string().uuid().optional(), pattern: beadPattern.optional(), recipe: clayRecipe.optional(), consent: z.literal(true),
}).strict();

export const authorEarning = (price: number) => Math.floor(price * AUTHOR_SHARE);
async function unlockedBy(s: Services, workId: string, userId: string | undefined) {
  return Boolean(userId && await s.db.one('SELECT 1 AS one FROM gallery_unlocks WHERE work_id=$1 AND user_id=$2', [workId, userId]));
}
function workView(row: Row, viewer: { self: boolean; admin: boolean; unlocked: boolean }) {
  const open = viewer.self || viewer.admin || viewer.unlocked;
  return {
    id: row.id, kind: row.kind, title: row.title, story: row.story, city: row.city, price: row.price, allowRemix: row.allow_remix,
    remixOf: row.remix_of, author: { id: row.owner_id, displayName: row.display_name }, unlocks: row.unlocks,
    createdAt: iso(row.created_at), coverUrl: `/api/gallery/${row.id}/cover`, hasModel: Boolean(row.model_key), hasPattern: Boolean(row.pattern),
    self: viewer.self, unlocked: open,
    ...(open && row.model_key ? { modelUrl: `/api/gallery/${row.id}/model` } : {}),
    ...(open && row.pattern ? { pattern: row.pattern } : {}),
    ...(open && row.recipe ? { recipe: row.recipe } : {}), hasRecipe: Boolean(row.recipe),
    ...(viewer.self || viewer.admin ? { status: row.status, reviewNote: row.review_note } : {}),
  };
}
const selectWork = 'SELECT w.*,u.display_name FROM gallery_works w JOIN users u ON u.id=w.owner_id';
async function viewFor(s: Services, req: FastifyRequest, row: Row) {
  const user = req.user;
  return workView(row, { self: user?.id === row.owner_id, admin: user?.role === 'ADMIN', unlocked: await unlockedBy(s, row.id, user?.id) });
}
async function listView(s: Services, req: FastifyRequest, rows: Row[]) {
  const me = req.user?.id;
  const mine = me ? new Set((await s.db.query('SELECT work_id FROM gallery_unlocks WHERE user_id=$1', [me])).rows.map(r => r.work_id)) : new Set<string>();
  return rows.map(row => workView(row, { self: me === row.owner_id, admin: req.user?.role === 'ADMIN', unlocked: mine.has(row.id) }));
}

export function galleryRoutes(app: App, s: Services) {
  app.get('/api/gallery', async req => {
    const q = z.object({ kind: z.enum(['CLAY', 'BEADS', 'MAGNET', 'KEYCHAIN']).optional(), cursor: z.string().max(64).optional() }).strict().parse(req.query);
    const args: unknown[] = []; let where = "w.status='PUBLIC'";
    if (q.kind) { args.push(q.kind); where += ` AND w.kind=$${args.length}`; }
    if (q.cursor) { const at = Number(q.cursor); if (!Number.isSafeInteger(at) || at < 0) fail(400, 'INVALID_CURSOR'); args.push(new Date(at).toISOString()); where += ` AND w.created_at<$${args.length}`; }
    const rows = (await s.db.query(`${selectWork} WHERE ${where} ORDER BY w.created_at DESC,w.id DESC LIMIT ${PAGE + 1}`, args)).rows;
    const page = rows.slice(0, PAGE);
    return { items: await listView(s, req, page), nextCursor: rows.length > PAGE ? String(new Date(page.at(-1)!.created_at).getTime()) : null };
  });
  app.get('/api/gallery/mine', async req => {
    const user = requireUser(req);
    const own = (await s.db.query(`${selectWork} WHERE w.owner_id=$1 ORDER BY w.created_at DESC LIMIT 100`, [user.id])).rows;
    const unlocked = (await s.db.query(`${selectWork} JOIN gallery_unlocks g ON g.work_id=w.id WHERE g.user_id=$1 AND w.status='PUBLIC' ORDER BY g.created_at DESC LIMIT 100`, [user.id])).rows;
    return { works: await listView(s, req, own), unlocked: await listView(s, req, unlocked) };
  });
  app.get<{ Params: { id: string } }>('/api/gallery/:id', async req => {
    const workId = z.string().uuid().parse(req.params.id), row = await s.db.one(`${selectWork} WHERE w.id=$1`, [workId]);
    if (!row || (row.status !== 'PUBLIC' && row.owner_id !== req.user?.id && req.user?.role !== 'ADMIN')) fail(404, 'NOT_FOUND');
    return { work: await viewFor(s, req, row!), earning: authorEarning(row!.price) };
  });
  app.post('/api/gallery', async req => {
    const user = requireUser(req);
    await rateLimit(s, `gallery-upload:${user.id}`, 20, 3600_000);
    // Metadata can carry a 128×128 bead pattern or a clay recipe, so its field may reach 48 KB.
    const { files, fields } = await readMultipart(req, ['cover'], s.config.limits.modelBytes, 1, ['model'], 48 * 1024);
    let value: unknown; try { value = JSON.parse(fields.metadata || ''); } catch { fail(400, 'INVALID_METADATA_JSON'); }
    const data = metadata.parse(value), model = files.get('model');
    if (data.kind === 'BEADS' ? !data.pattern : !model) fail(422, data.kind === 'BEADS' ? 'PATTERN_REQUIRED' : 'MODEL_REQUIRED');
    if (data.kind !== 'BEADS' && data.pattern) fail(422, 'PATTERN_ONLY_FOR_BEADS');
    if (data.kind !== 'CLAY' && data.recipe) fail(422, 'RECIPE_ONLY_FOR_CLAY');
    if (data.remixOf) {
      const source = await s.db.one('SELECT * FROM gallery_works WHERE id=$1', [data.remixOf]);
      if (!source || source.status !== 'PUBLIC') fail(404, 'REMIX_SOURCE_NOT_FOUND');
      if (source!.owner_id !== user.id && !(source!.allow_remix && await unlockedBy(s, source!.id, user.id))) fail(403, 'REMIX_NOT_ALLOWED');
    }
    const cover = await normalizeImage(files.get('cover')!, s.config);
    if (model) await inspectGlb(model);
    const coverKey = objectKey('media', 'png'), modelKey = model ? objectKey('models', 'glb') : null, workId = id();
    try {
      await s.storage.put(coverKey, cover.bytes, 'image/png');
      if (model) await s.storage.put(modelKey!, model, 'model/gltf-binary');
      await s.db.tx(async c => {
        await c.query("INSERT INTO gallery_works(id,owner_id,kind,title,story,city,cover_key,model_key,model_size,pattern,price,allow_remix,remix_of,status,recipe) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PENDING',$14)",
          [workId, user.id, data.kind, data.title, data.story, data.city, coverKey, modelKey, model?.length ?? null, data.pattern ? json(data.pattern) : null, data.price, data.allowRemix, data.remixOf ?? null, data.recipe ? json(data.recipe) : null]);
        await audit(c, user.id, 'gallery.upload', workId, null, 'PENDING');
      });
    } catch (error) { await Promise.all([s.storage.remove(coverKey), modelKey ? s.storage.remove(modelKey) : undefined]); throw error; }
    return { work: await viewFor(s, req, (await s.db.one(`${selectWork} WHERE w.id=$1`, [workId]))!) };
  });
  // One unlock covers both downloading and remixing; remixing additionally needs the author's permission.
  app.post<{ Params: { id: string } }>('/api/gallery/:id/unlock', async req => {
    const user = requireUser(req), workId = z.string().uuid().parse(req.params.id);
    // Retries are safe without a client key: one member unlocks one work at most once.
    const data = z.object({ purpose: z.enum(['DOWNLOAD', 'REMIX']) }).strict().parse(req.body);
    await rateLimit(s, `gallery-unlock:${user.id}`, 60, 3600_000);
    const result = await s.db.tx(async c => {
      const row = (await c.query('SELECT * FROM gallery_works WHERE id=$1 FOR UPDATE', [workId])).rows[0];
      if (!row || row.status !== 'PUBLIC') fail(404, 'NOT_FOUND');
      if (data.purpose === 'REMIX' && !row.allow_remix && row.owner_id !== user.id) fail(403, 'REMIX_NOT_ALLOWED');
      if (row.owner_id === user.id) return { charged: 0, balance: (await account(c, user.id)).balance };
      const done = (await c.query('SELECT * FROM gallery_unlocks WHERE work_id=$1 AND user_id=$2', [workId, user.id])).rows[0];
      if (done) return { charged: 0, balance: (await account(c, user.id)).balance };
      // Lock both accounts in a fixed order so two members buying each other's work cannot deadlock.
      for (const member of [user.id, row.owner_id].sort()) await account(c, member);
      let balance = (await account(c, user.id)).balance;
      if (row.price > 0) {
        balance = (await changePoints(c, user.id, { delta: -row.price, reason: 'SPEND', item: 'GALLERY', ref: workId, key: `unlock:${workId}` })).balance;
        const earning = authorEarning(row.price);
        if (earning > 0) await changePoints(c, row.owner_id, { delta: earning, reason: 'EARN', item: 'GALLERY', ref: workId, key: `earn:${workId}:${user.id}` });
      }
      await c.query('INSERT INTO gallery_unlocks(work_id,user_id,price) VALUES($1,$2,$3)', [workId, user.id, row.price]);
      await c.query('UPDATE gallery_works SET unlocks=unlocks+1 WHERE id=$1', [workId]);
      await audit(c, user.id, `gallery.unlock.${data.purpose.toLowerCase()}`, workId);
      return { charged: row.price, balance };
    });
    return { ...result, work: await viewFor(s, req, (await s.db.one(`${selectWork} WHERE w.id=$1`, [workId]))!) };
  });
  // Owners can withdraw their own work; it disappears from the gallery for everyone.
  app.delete<{ Params: { id: string } }>('/api/gallery/:id', async req => {
    const user = requireUser(req), workId = z.string().uuid().parse(req.params.id);
    await s.db.tx(async c => {
      const row = (await c.query('SELECT * FROM gallery_works WHERE id=$1 FOR UPDATE', [workId])).rows[0];
      if (!row || row.owner_id !== user.id) fail(404, 'NOT_FOUND');
      await c.query("UPDATE gallery_works SET status='HIDDEN',updated_at=now() WHERE id=$1", [workId]);
      await audit(c, user.id, 'gallery.withdraw', workId, row.status, 'HIDDEN');
    });
    return { ok: true };
  });
  for (const part of ['cover', 'model'] as const) app.get<{ Params: { id: string } }>(`/api/gallery/:id/${part}`, async (req, reply) => {
    const file = await workshopFile(s, req.user, 'gallery', z.string().uuid().parse(req.params.id), part);
    return sendFile(req, reply, s.storage, file.key, file.mime, file.filename);
  });
  app.get('/api/admin/gallery', async req => {
    requireAdmin(req);
    const { status } = z.object({ status: z.enum(['PENDING', 'PUBLIC', 'REJECTED', 'HIDDEN']).default('PENDING') }).strict().parse(req.query);
    const rows = (await s.db.query(`${selectWork} WHERE w.status=$1 ORDER BY w.created_at ASC LIMIT 100`, [status])).rows;
    return { items: rows.map(row => workView(row, { self: false, admin: true, unlocked: true })) };
  });
  app.post<{ Params: { id: string } }>('/api/admin/gallery/:id/review', async req => {
    const admin = requireAdmin(req), workId = z.string().uuid().parse(req.params.id);
    const data = z.object({ status: z.enum(['PUBLIC', 'REJECTED', 'HIDDEN']), note: z.string().trim().max(500).default('') }).strict().parse(req.body);
    await s.db.tx(async c => {
      const row = (await c.query('SELECT * FROM gallery_works WHERE id=$1 FOR UPDATE', [workId])).rows[0];
      if (!row) fail(404, 'NOT_FOUND');
      await c.query('UPDATE gallery_works SET status=$2,review_note=$3,updated_at=now() WHERE id=$1', [workId, data.status, data.note]);
      await audit(c, admin.id, 'gallery.review', workId, row.status, data.status);
    });
    return { work: workView((await s.db.one(`${selectWork} WHERE w.id=$1`, [workId]))!, { self: false, admin: true, unlocked: true }) };
  });
}
