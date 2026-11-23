import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import type { Database, Row, SQL } from './db.js';
import type { Storage } from './storage.js';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) { super(message); }
}
export const fail = (status: number, code: string, message?: string): never => { throw new ApiError(status, code, message); };
export const id = () => randomUUID();
export const digest = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');
export function equal(a: string, b: string) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export type User = { id: string; email: string; displayName: string; role: 'USER' | 'ADMIN' };
export interface Mailer { sendOtp(email: string, code: string): Promise<void> }
export interface Tasks { enqueue(task: 'MEDIA' | 'CRAFT', resourceId: string, outboxId: string): Promise<void>; close?(): Promise<void> }
export type PersonPoint = [number, number];
export interface PersonDetection {
  bbox: [number, number, number, number]; polygon: PersonPoint[];
  width: number; height: number; confidence: number;
  method: 'MODEL_POLYGON'; requiresReview: true;
}
export interface PersonSuggestion { detection: PersonDetection; mask: Buffer; maskSource: 'AI_SUGGESTION' }
export interface ImageProvider {
  edit(image: Buffer): Promise<Buffer>; segment(image: Buffer): Promise<Buffer>;
  // Optional to preserve existing precise-mask providers. A suggestion must not lose review metadata.
  detect?(image: Buffer): Promise<PersonSuggestion>;
}
export interface Services { config: Config; db: Database; storage: Storage; mailer: Mailer; tasks: Tasks; provider: ImageProvider }
export type App = FastifyInstance;
declare module 'fastify' { interface FastifyRequest {
  user: User | null; sessionHash: string | null; csrf: string | null;
  authKind: 'web' | 'mobile' | null; sessionExpiresAt: number | null; fileTicket: boolean;
} }
export function requireUser(req: FastifyRequest): User { return req.user || fail(401, 'UNAUTHENTICATED'); }
export function requireAdmin(req: FastifyRequest): User { const user = requireUser(req); if (user.role !== 'ADMIN') fail(403, 'FORBIDDEN'); return user; }
export function owner(req: FastifyRequest, row: Row | undefined): Row {
  const user = requireUser(req);
  if (!row || (row.owner_id !== user.id && user.role !== 'ADMIN')) fail(404, 'NOT_FOUND');
  return row!;
}
export const iso = (date: any) => new Date(date).toISOString();
export const json = (value: unknown) => JSON.stringify(value);
export async function rateLimit(s: Services, key: string, max: number, windowMs: number) {
  const now = Date.now(); const hash = digest(s.config.secret, key); const start = now - now % windowMs;
  const result = await s.db.one(`INSERT INTO rate_limits(key,window_start,hits) VALUES($1,$2,1)
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.window_start=$2 THEN rate_limits.hits+1 ELSE 1 END,window_start=$2 RETURNING hits`, [hash, start]);
  if (result!.hits > max) fail(429, 'RATE_LIMITED');
}
export async function outbox(sql: SQL, task: 'MEDIA' | 'CRAFT', resource: string) { await sql.query('INSERT INTO job_outbox(id,task,resource_id) VALUES($1,$2,$3)', [id(), task, resource]); }
export async function flushOutbox(s: Services) {
  const rows = (await s.db.query('SELECT * FROM job_outbox WHERE delivered=false ORDER BY created_at LIMIT 100')).rows;
  for (const row of rows) { await s.tasks.enqueue(row.task, row.resource_id, row.id); await s.db.query('UPDATE job_outbox SET delivered=true WHERE id=$1', [row.id]); }
}
export async function sendFile(req: FastifyRequest, reply: FastifyReply, storage: Storage, key: string, mime: string, filename?: string) {
  const data = await storage.get(key);
  reply.header('Cache-Control', 'private, no-store').header('Accept-Ranges', 'bytes').header('X-Content-Type-Options', 'nosniff').type(mime);
  if (req.fileTicket || req.authKind === 'mobile') reply.header('Cross-Origin-Resource-Policy', 'cross-origin').header('Referrer-Policy', 'no-referrer');
  if (filename) reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) return reply.header('Content-Range', `bytes */${data.length}`).code(416).send();
    const start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
    const end = match[1] ? (match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1) : data.length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length || Number(match[2]) < 0) return reply.header('Content-Range', `bytes */${data.length}`).code(416).send();
    return reply.code(206).header('Content-Range', `bytes ${start}-${end}/${data.length}`).header('Content-Length', end - start + 1).send(data.subarray(start, end + 1));
  }
  return reply.header('Content-Length', data.length).send(data);
}
