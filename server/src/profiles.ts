import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { App, Services } from './core.js';
import { fail, iso, rateLimit, requireUser } from './core.js';
import type { Row } from './db.js';
import { mediaView } from './media.js';

// Public profiles: a member's public posts, follower and following counts, and the two lists.
// Only display names and ids are shown; emails never leave the server.
const uuid = z.string().uuid();
const PAGE = 30;

async function memberOrFail(s: Services, userId: string) {
  return (await s.db.one('SELECT id,display_name,created_at FROM users WHERE id=$1', [userId])) || fail(404, 'NOT_FOUND');
}
async function counts(s: Services, userId: string) {
  const [followers, following, posts] = await Promise.all([
    s.db.one('SELECT count(*) AS count FROM follows WHERE followee_id=$1', [userId]),
    s.db.one('SELECT count(*) AS count FROM follows WHERE follower_id=$1', [userId]),
    s.db.one("SELECT count(*) AS count FROM posts WHERE owner_id=$1 AND status='PUBLIC'", [userId]),
  ]);
  return { followers: Number(followers!.count), following: Number(following!.count), posts: Number(posts!.count) };
}
async function isFollowing(s: Services, follower: string | undefined, followee: string) {
  if (!follower || follower === followee) return false;
  return Boolean(await s.db.one('SELECT 1 AS one FROM follows WHERE follower_id=$1 AND followee_id=$2', [follower, followee]));
}
// Tiles for the profile grid: the first media of each post, plus the post's title and counts.
async function postTile(s: Services, row: Row) {
  const media = (await s.db.query("SELECT m.* FROM media m JOIN post_media pm ON pm.media_id=m.id WHERE pm.post_id=$1 AND m.status='READY' ORDER BY pm.position", [row.id])).rows.map(mediaView);
  const likes = await s.db.one("SELECT count(*) AS count FROM reactions WHERE post_id=$1 AND kind='LIKE'", [row.id]);
  const comments = await s.db.one("SELECT count(*) AS count FROM comments WHERE post_id=$1 AND status='PUBLIC'", [row.id]);
  return { id: row.id, title: row.title, city: row.city, status: row.status, createdAt: iso(row.created_at), cover: media[0] || null,
    mediaCount: media.length, hasVideo: media.some(m => m.kind === 'VIDEO'), likeCount: Number(likes!.count), commentCount: Number(comments!.count) };
}
const memberView = (row: Row) => ({ id: row.id, displayName: row.display_name });

export function profileRoutes(app: App, s: Services) {
  app.get<{ Params: { id: string } }>('/api/users/:id', async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const userId = uuid.parse(req.params.id), member = await memberOrFail(s, userId), self = req.user?.id === userId;
    // Owners also see their drafts, pending and rejected posts; everyone else only public ones.
    const rows = (await s.db.query(`SELECT * FROM posts WHERE owner_id=$1 ${self ? '' : "AND status='PUBLIC'"} ORDER BY created_at DESC,id DESC LIMIT 60`, [userId])).rows;
    return { user: { ...memberView(member), joinedAt: iso(member.created_at), ...(await counts(s, userId)), followedByMe: await isFollowing(s, req.user?.id, userId), self },
      posts: await Promise.all(rows.map(row => postTile(s, row))) };
  });
  app.put<{ Params: { id: string } }>('/api/users/:id/follow', async req => {
    const user = requireUser(req), userId = uuid.parse(req.params.id), { active } = z.object({ active: z.boolean() }).strict().parse(req.body);
    if (userId === user.id) fail(422, 'CANNOT_FOLLOW_SELF');
    await memberOrFail(s, userId);
    await rateLimit(s, `follow:${user.id}`, 120, 3600_000);
    if (active) await s.db.query('INSERT INTO follows(follower_id,followee_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.id, userId]);
    else await s.db.query('DELETE FROM follows WHERE follower_id=$1 AND followee_id=$2', [user.id, userId]);
    return { followedByMe: active, ...(await counts(s, userId)) };
  });
  for (const [route, column, other] of [['followers', 'followee_id', 'follower_id'], ['following', 'follower_id', 'followee_id']] as const) {
    app.get<{ Params: { id: string } }>(`/api/users/:id/${route}`, async req => {
      const userId = uuid.parse(req.params.id), { cursor } = z.object({ cursor: z.string().max(64).optional() }).strict().parse(req.query);
      await memberOrFail(s, userId);
      const args: unknown[] = [userId];
      let where = `f.${column}=$1`;
      if (cursor) { const at = Number(cursor); if (!Number.isSafeInteger(at) || at < 0) fail(400, 'INVALID_CURSOR'); args.push(new Date(at).toISOString()); where += ` AND f.created_at<$2`; }
      const rows = (await s.db.query(`SELECT u.id,u.display_name,f.created_at FROM follows f JOIN users u ON u.id=f.${other} WHERE ${where} ORDER BY f.created_at DESC LIMIT ${PAGE + 1}`, args)).rows;
      const page = rows.slice(0, PAGE), me = req.user?.id;
      const mine = me ? new Set((await s.db.query('SELECT followee_id FROM follows WHERE follower_id=$1', [me])).rows.map(r => r.followee_id)) : new Set<string>();
      return { items: page.map(row => ({ ...memberView(row), followedByMe: mine.has(row.id), self: row.id === me })),
        nextCursor: rows.length > PAGE ? String(new Date(page.at(-1)!.created_at).getTime()) : null };
    });
  }
  // Signed-in member's own profile id, so the app can open "my profile" without knowing it.
  app.get('/api/me/profile', async req => {
    const user = requireUser(req);
    return { user: { id: user.id, displayName: user.displayName, ...(await counts(s, user.id)) } };
  });
}
