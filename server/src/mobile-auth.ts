import type { FastifyRequest } from 'fastify';
import { digest, equal, fail, sendFile, type App, type Services, type User } from './core.js';

export const NATIVE_APP_ORIGIN = 'https://appassets.androidplatform.net';
// Phone sign-ins stay valid for 30 days of inactivity. Any authenticated use renews the deadline
// at most once a day, so an active traveller is not asked for a new code mid-trip.
export const MOBILE_SESSION_TTL_MS = 30 * 86_400_000;
export const MOBILE_SESSION_RENEW_AFTER_MS = 86_400_000;
export const FILE_TICKET_TTL_MS = 120_000;
const filePath = /^\/api\/(media\/([a-zA-Z0-9_-]{1,128})\/(file|poster)|craft-models\/([a-zA-Z0-9_-]{1,128})\/(glb|stl))$/;
const corsMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const corsHeaders = new Set(['accept', 'authorization', 'content-type', 'x-along-client', 'x-csrf-token', 'range']);

export function nativeOriginAllowed(s: Services, origin: unknown): origin is string {
  return origin === NATIVE_APP_ORIGIN && s.config.origins.includes(NATIVE_APP_ORIGIN);
}
export function isNativeClient(req: FastifyRequest, s: Services) {
  return req.headers['x-along-client'] === 'android' && nativeOriginAllowed(s, req.headers.origin);
}
type Ticket = { v: 1; s: string; p: string; m: 'GET'; e: number };
function ticketFor(s: Services, hash: string, path: string, expiresAt: number) {
  const body = Buffer.from(JSON.stringify({ v: 1, s: hash, p: path, m: 'GET', e: Math.min(Date.now() + FILE_TICKET_TTL_MS, expiresAt) } satisfies Ticket)).toString('base64url');
  return `${body}.${digest(s.config.secret, `mobile-file-ticket:v1:${body}`)}`;
}
function readTicket(s: Services, value: string, path: string): Ticket {
  if (value.length > 1024 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(value)) fail(403, 'FILE_TICKET_INVALID');
  const [body, signature] = value.split('.');
  if (!equal(signature, digest(s.config.secret, `mobile-file-ticket:v1:${body}`))) fail(403, 'FILE_TICKET_INVALID');
  let ticket: Ticket;
  try { ticket = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return fail(403, 'FILE_TICKET_INVALID'); }
  const now = Date.now();
  if (!ticket || ticket.v !== 1 || ticket.m !== 'GET' || ticket.p !== path || !/^[a-f0-9]{64}$/.test(ticket.s) || !Number.isSafeInteger(ticket.e) || ticket.e <= now || ticket.e > now + FILE_TICKET_TTL_MS) fail(403, 'FILE_TICKET_INVALID');
  return ticket;
}

// Register before authHooks, after cookie/helmet. Tickets never populate req.user:
// only this exact GET file handler can use them, not metadata or mutations.
export function createMobileAuthHooks(app: App, s: Services) {
  app.decorateRequest('fileTicket', false);
  app.addHook('onRequest', async (req, reply) => {
    const rawPath = req.raw.url || req.url;
    if (!rawPath.startsWith('/api/')) return;
    reply.header('Referrer-Policy', 'no-referrer');
    const origin = req.headers.origin;
    if (nativeOriginAllowed(s, origin)) {
      reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin')
        .header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Disposition');
      // Never enable Access-Control-Allow-Credentials: native clients use bearer only.
    }
    if (req.method === 'OPTIONS') {
      if (!nativeOriginAllowed(s, origin)) fail(403, 'ORIGIN_FORBIDDEN');
      const method = req.headers['access-control-request-method'];
      const requested = req.headers['access-control-request-headers'];
      if (typeof method !== 'string' || !corsMethods.has(method) || (requested !== undefined && typeof requested !== 'string')) fail(403, 'CORS_FORBIDDEN');
      if (typeof requested === 'string' && requested.split(',').some(value => !corsHeaders.has(value.trim().toLowerCase()))) fail(403, 'CORS_FORBIDDEN');
      return reply.header('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers')
        .header('Access-Control-Allow-Methods', [...corsMethods].join(', '))
        .header('Access-Control-Allow-Headers', [...corsHeaders].join(', '))
        .header('Access-Control-Max-Age', '300').code(204).send();
    }
    const question = rawPath.indexOf('?');
    if (question < 0) return;
    const path = rawPath.slice(0, question), query = new URLSearchParams(rawPath.slice(question + 1));
    if (!query.has('ticket')) return;
    const match = filePath.exec(path);
    if (!match || req.method !== 'GET' || query.getAll('ticket').length !== 1 || [...query.keys()].some(key => key !== 'ticket') || !s.config.origins.includes(NATIVE_APP_ORIGIN) || (origin !== undefined && !nativeOriginAllowed(s, origin))) fail(403, 'FILE_TICKET_INVALID');
    const ticket = readTicket(s, query.get('ticket')!, path);
    const session = await s.db.one("SELECT s.*,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND s.client_kind='mobile' AND s.native_origin=$3", [ticket.s, Date.now(), NATIVE_APP_ORIGIN]);
    if (!session || ticket.e > Number(session.expires_at)) fail(403, 'FILE_TICKET_INVALID');
    const user: User = { id: session!.user_id, email: session!.email, displayName: session!.display_name, role: s.config.admins.has(session!.email) ? 'ADMIN' : 'USER' };
    const mediaId = match![2], modelId = match![4], part = match![3] || match![5];
    if (mediaId) {
      const row = await s.db.one('SELECT * FROM media WHERE id=$1', [mediaId]);
      if (!row) fail(404, 'NOT_FOUND');
      if (row!.owner_id !== user.id && user.role !== 'ADMIN') {
        const publicPost = await s.db.one('SELECT p.id FROM posts p JOIN post_media pm ON pm.post_id=p.id WHERE pm.media_id=$1 AND p.status=$2 LIMIT 1', [mediaId, 'PUBLIC']);
        if (!publicPost || row!.status !== 'READY') fail(404, 'NOT_FOUND');
      }
      if (row!.status !== 'READY') fail(409, 'MEDIA_NOT_READY');
      const key = part === 'poster' ? row!.poster_key : row!.object_key;
      if (!key) fail(404, 'NOT_FOUND');
      req.fileTicket = true;
      return sendFile(req, reply, s.storage, key, part === 'poster' ? 'image/jpeg' : row!.mime);
    }
    const row = await s.db.one('SELECT * FROM craft_models WHERE id=$1', [modelId]);
    if (!row || (row.owner_id !== user.id && user.role !== 'ADMIN')) fail(404, 'NOT_FOUND');
    req.fileTicket = true;
    return sendFile(req, reply, s.storage, row![`${part}_key`], part === 'glb' ? 'model/gltf-binary' : 'model/stl', `along-${row!.id}-v${row!.version}.${part}`);
  });
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.authKind !== 'mobile' || !req.user || !req.sessionHash || !req.sessionExpiresAt || reply.statusCode < 200 || reply.statusCode >= 300 || typeof payload !== 'string' || !String(reply.getHeader('content-type')).includes('application/json')) return payload;
    let data: unknown;
    try { data = JSON.parse(payload); } catch { return payload; }
    let changed = false;
    const walk = (value: any, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 40) return;
      for (const [key, child] of Object.entries(value)) {
        if (['url', 'posterUrl', 'glbUrl', 'stlUrl'].includes(key) && typeof child === 'string') {
          const match = filePath.exec(child);
          if (match && value.id === (match[2] || match[4])) {
            value[key] = `${child}?ticket=${ticketFor(s, req.sessionHash!, child, req.sessionExpiresAt!)}`;
            changed = true;
          }
        } else if (typeof child === 'object') walk(child, depth + 1);
      }
    };
    walk(data);
    return changed ? JSON.stringify(data) : payload;
  });
}
