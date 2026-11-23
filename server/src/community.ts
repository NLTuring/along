import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { App, Services } from './core.js';
import { fail, id, iso, json, owner, requireAdmin, requireUser } from './core.js';
import { audit, type Row, type SQL } from './db.js';
import { mediaView } from './media.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const postSchema = z.object({ title: text(120), body: text(10000), city: text(100), tags: z.array(text(32)).max(10).default([]), poiId: z.string().max(200).nullable().default(null), mediaIds: z.array(z.string().uuid()).max(9).default([]), status: z.enum(['DRAFT', 'PENDING']) }).strict();
export async function getPost(s: Services, req: FastifyRequest, postId: string) {
  const row = await s.db.one('SELECT * FROM posts WHERE id=$1', [postId]);
  if (!row || (row.status !== 'PUBLIC' && row.owner_id !== req.user?.id && req.user?.role !== 'ADMIN')) fail(404, 'NOT_FOUND');
  return row!;
}
async function postView(s: Services, req: FastifyRequest, row: Row) {
  const author = await s.db.one('SELECT id,display_name FROM users WHERE id=$1', [row.owner_id]);
  const media = (await s.db.query('SELECT m.* FROM media m JOIN post_media pm ON pm.media_id=m.id WHERE pm.post_id=$1 ORDER BY pm.position', [row.id])).rows.map(mediaView);
  const likes = await s.db.one("SELECT count(*) AS count FROM reactions WHERE post_id=$1 AND kind='LIKE'", [row.id]);
  const comments = await s.db.one("SELECT count(*) AS count FROM comments WHERE post_id=$1 AND status='PUBLIC'", [row.id]);
  const mine = req.user ? (await s.db.query('SELECT kind FROM reactions WHERE post_id=$1 AND user_id=$2', [row.id, req.user.id])).rows : [];
  return { id: row.id, author: { id: author!.id, displayName: author!.display_name }, title: row.title, body: row.body, city: row.city, tags: row.tags, poiId: row.poi_id, media, status: row.status, createdAt: iso(row.created_at), likeCount: Number(likes!.count), commentCount: Number(comments!.count), liked: mine.some(r => r.kind === 'LIKE'), saved: mine.some(r => r.kind === 'SAVE'), ...((row.owner_id === req.user?.id || req.user?.role === 'ADMIN') && row.review_note ? { reviewNote: row.review_note } : {}) };
}
async function setMedia(c: SQL, userId: string, postId: string, mediaIds: string[]) {
  if (new Set(mediaIds).size !== mediaIds.length) fail(422, 'DUPLICATE_MEDIA');
  for (const mediaId of mediaIds) {
    const media = (await c.query('SELECT * FROM media WHERE id=$1', [mediaId])).rows[0];
    if (!media || media.owner_id !== userId || media.status !== 'READY' || media.purpose !== 'COMMUNITY') fail(422, 'MEDIA_NOT_OWNED_OR_READY');
  }
  await c.query('DELETE FROM post_media WHERE post_id=$1', [postId]);
  for (const [position, mediaId] of mediaIds.entries()) await c.query('INSERT INTO post_media(post_id,media_id,position) VALUES($1,$2,$3)', [postId, mediaId, position]);
}
async function commentView(s: Services, row: Row) {
  const author = await s.db.one('SELECT id,display_name FROM users WHERE id=$1', [row.owner_id]);
  return { id: row.id, postId: row.post_id, author: { id: author!.id, displayName: author!.display_name }, body: row.body, status: row.status, createdAt: iso(row.created_at) };
}
export function communityRoutes(app: App, s: Services) {
  app.get('/api/posts', async req => {
    const q = z.object({ city: z.string().max(100).optional(), q: z.string().max(120).optional(), tag: z.string().max(32).optional(), cursor: z.string().max(256).optional(), mine: z.enum(['1']).optional() }).strict().parse(req.query);
    const args: unknown[] = []; const conditions: string[] = [];
    const value = (v: unknown) => { args.push(v); return `$${args.length}`; };
    conditions.push(q.mine ? `owner_id=${value(requireUser(req).id)}` : `status='PUBLIC'`);
    if (q.city) conditions.push(`city=${value(q.city)}`);
    if (q.q) { const term = value(`%${q.q.replace(/[\\%_]/g, '\\$&')}%`); conditions.push(`(title ILIKE ${term} OR body ILIKE ${term})`); }
    if (q.tag) conditions.push(`tags @> ${value(json([q.tag]))}::jsonb`);
    if (q.cursor) {
      let cursor: { date: string; id: string };
      try { cursor = z.object({ date: z.iso.datetime(), id: z.string().uuid() }).parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8'))); } catch { fail(400, 'INVALID_CURSOR'); }
      const date = value(cursor!.date), cid = value(cursor!.id); conditions.push(`(created_at<${date} OR (created_at=${date} AND id<${cid}))`);
    }
    const rows = (await s.db.query(`SELECT * FROM posts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT 21`, args)).rows;
    const items = await Promise.all(rows.slice(0, 20).map(row => postView(s, req, row)));
    const last = rows[19];
    return { items, nextCursor: rows.length > 20 ? Buffer.from(json({ date: iso(last.created_at), id: last.id })).toString('base64url') : null };
  });
  app.post('/api/posts', async req => {
    const user = requireUser(req), data = postSchema.parse(req.body), postId = id();
    await s.db.tx(async c => {
      await c.query('INSERT INTO posts(id,owner_id,title,body,city,tags,poi_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [postId, user.id, data.title, data.body, data.city, json(data.tags), data.poiId, data.status]);
      await setMedia(c, user.id, postId, data.mediaIds);
    });
    return { post: await postView(s, req, (await s.db.one('SELECT * FROM posts WHERE id=$1', [postId]))!) };
  });
  app.get<{ Params: { id: string } }>('/api/posts/:id', async req => ({ post: await postView(s, req, await getPost(s, req, req.params.id)) }));
  app.patch<{ Params: { id: string } }>('/api/posts/:id', async req => {
    const user = requireUser(req), data = postSchema.partial().parse(req.body);
    await s.db.tx(async c => {
      const row = (await c.query('SELECT * FROM posts WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!row || row.owner_id !== user.id) fail(404, 'NOT_FOUND');
      await c.query('UPDATE posts SET title=$2,body=$3,city=$4,tags=$5,poi_id=$6,status=$7,review_note=NULL,updated_at=now() WHERE id=$1', [row.id, data.title ?? row.title, data.body ?? row.body, data.city ?? row.city, json(data.tags ?? row.tags), data.poiId === undefined ? row.poi_id : data.poiId, data.status ?? (row.status === 'DRAFT' ? 'DRAFT' : 'PENDING')]);
      if (data.mediaIds !== undefined) await setMedia(c, user.id, row.id, data.mediaIds);
    });
    return { post: await postView(s, req, (await s.db.one('SELECT * FROM posts WHERE id=$1', [req.params.id]))!) };
  });
  app.delete<{ Params: { id: string } }>('/api/posts/:id', async req => {
    owner(req, await s.db.one('SELECT * FROM posts WHERE id=$1', [req.params.id]));
    await s.db.query('DELETE FROM posts WHERE id=$1', [req.params.id]); return { ok: true };
  });
  for (const [route, kind] of [['like', 'LIKE'], ['save', 'SAVE']] as const) app.put<{ Params: { id: string } }>(`/api/posts/:id/${route}`, async req => {
    const user = requireUser(req), { active } = z.object({ active: z.boolean() }).strict().parse(req.body), row = await getPost(s, req, req.params.id);
    if (row.status !== 'PUBLIC') fail(409, 'POST_NOT_PUBLIC');
    if (active) await s.db.query('INSERT INTO reactions(post_id,user_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [row.id, user.id, kind]);
    else await s.db.query('DELETE FROM reactions WHERE post_id=$1 AND user_id=$2 AND kind=$3', [row.id, user.id, kind]);
    if (kind === 'SAVE') return { saved: active };
    const count = await s.db.one("SELECT count(*) AS count FROM reactions WHERE post_id=$1 AND kind='LIKE'", [row.id]);
    return { liked: active, likeCount: Number(count!.count) };
  });
  app.get<{ Params: { id: string } }>('/api/posts/:id/comments', async req => {
    await getPost(s, req, req.params.id);
    const rows = req.user?.role === 'ADMIN' ? (await s.db.query('SELECT * FROM comments WHERE post_id=$1 ORDER BY created_at LIMIT 200', [req.params.id])).rows : (await s.db.query("SELECT * FROM comments WHERE post_id=$1 AND (status='PUBLIC' OR owner_id=$2) ORDER BY created_at LIMIT 200", [req.params.id, req.user?.id || ''])).rows;
    return { items: await Promise.all(rows.map(r => commentView(s, r))) };
  });
  app.post<{ Params: { id: string } }>('/api/posts/:id/comments', async req => {
    const user = requireUser(req), row = await getPost(s, req, req.params.id), { body } = z.object({ body: text(2000) }).strict().parse(req.body);
    if (row.status !== 'PUBLIC') fail(409, 'POST_NOT_PUBLIC');
    const commentId = id();
    await s.db.query("INSERT INTO comments(id,post_id,owner_id,body,status) VALUES($1,$2,$3,$4,'PENDING')", [commentId, row.id, user.id, body]);
    return { comment: await commentView(s, (await s.db.one('SELECT * FROM comments WHERE id=$1', [commentId]))!) };
  });
  app.post('/api/reports', async req => {
    const user = requireUser(req), data = z.object({ targetType: z.enum(['POST', 'COMMENT']), targetId: z.string().uuid(), reason: text(2000) }).strict().parse(req.body);
    if (data.targetType === 'POST') await getPost(s, req, data.targetId);
    else {
      const row = await s.db.one('SELECT * FROM comments WHERE id=$1', [data.targetId]);
      if (!row || (row.status !== 'PUBLIC' && row.owner_id !== user.id)) fail(404, 'NOT_FOUND');
      await getPost(s, req, row!.post_id);
    }
    await s.db.query('INSERT INTO reports(id,owner_id,target_type,target_id,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id,target_type,target_id) DO NOTHING', [id(), user.id, data.targetType, data.targetId, data.reason]);
    return { ok: true };
  });
  app.get('/api/admin/posts', async req => {
    requireAdmin(req); const { status } = z.object({ status: z.enum(['DRAFT', 'PENDING', 'PUBLIC', 'REJECTED', 'HIDDEN']).default('PENDING') }).parse(req.query);
    return { items: await Promise.all((await s.db.query('SELECT * FROM posts WHERE status=$1 ORDER BY created_at LIMIT 100', [status])).rows.map(r => postView(s, req, r))) };
  });
  app.get('/api/admin/comments', async req => {
    requireAdmin(req); const { status } = z.object({ status: z.enum(['PENDING', 'PUBLIC', 'REJECTED', 'HIDDEN']).default('PENDING') }).parse(req.query);
    return { items: await Promise.all((await s.db.query('SELECT * FROM comments WHERE status=$1 ORDER BY created_at LIMIT 100', [status])).rows.map(r => commentView(s, r))) };
  });
  for (const table of ['posts', 'comments'] as const) app.post<{ Params: { id: string } }>(`/api/admin/${table}/:id/review`, async req => {
    const user = requireAdmin(req), data = z.object({ status: z.enum(['PUBLIC', 'REJECTED', 'HIDDEN']), note: z.string().trim().max(2000).default('') }).strict().parse(req.body);
    await s.db.tx(async c => {
      const row = (await c.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!row) fail(404, 'NOT_FOUND');
      if (row.status === 'DRAFT') fail(409, 'DRAFT_NOT_SUBMITTED');
      await c.query(`UPDATE ${table} SET status=$2,review_note=$3 WHERE id=$1`, [row.id, data.status, data.note]);
      await audit(c, user.id, `${table}.review`, row.id, row.status, data.status);
    });
    return table === 'posts' ? { post: await postView(s, req, (await s.db.one('SELECT * FROM posts WHERE id=$1', [req.params.id]))!) } : { ok: true };
  });
  app.get('/api/admin/reports', async req => {
    requireAdmin(req); return { items: (await s.db.query('SELECT id,target_type,target_id,reason,resolved,resolution,created_at FROM reports ORDER BY created_at DESC LIMIT 100')).rows.map(r => ({ id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason, resolved: r.resolved, note: r.resolution, createdAt: iso(r.created_at) })) };
  });
  app.post<{ Params: { id: string } }>('/api/admin/reports/:id/resolve', async req => {
    const user = requireAdmin(req), { note } = z.object({ note: text(2000) }).strict().parse(req.body);
    await s.db.tx(async c => {
      const row = (await c.query('UPDATE reports SET resolved=true,resolution=$2 WHERE id=$1 RETURNING id', [req.params.id, note])).rows[0];
      if (!row) fail(404, 'NOT_FOUND'); await audit(c, user.id, 'report.resolve', row.id);
    }); return { ok: true };
  });
}
