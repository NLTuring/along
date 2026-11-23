import { z } from 'zod';
import { Queue, Worker } from 'bullmq';
import { digest, fail, id, json, outbox, owner, rateLimit, requireUser, type App, type PersonDetection, type Services, type Tasks } from './core.js';
import { mediaView, normalizeImage, processVideo } from './media.js';
import { normalizeMask } from './providers.js';
import { objectKey } from './storage.js';
import type { Row } from './db.js';

const jobBody = z.object({ mediaId: z.string().uuid(), variant: z.enum(['REAL', 'ANIME']), inputVersion: z.string().min(1).max(128), idempotencyKey: z.string().min(8).max(128), consent: z.literal(true) }).strict();
async function jobView(s: Services, row: Row) {
  const output = row.output_media_id ? await s.db.one('SELECT * FROM media WHERE id=$1', [row.output_media_id]) : null;
  const mask = row.mask_media_id ? await s.db.one('SELECT * FROM media WHERE id=$1', [row.mask_media_id]) : null;
  return { id: row.id, status: row.status, stage: row.stage, inputVersion: row.input_version, variant: row.variant, sourceMediaId: row.source_media_id, ...(output ? { outputMedia: mediaView(output) } : {}), ...(mask ? { maskMedia: mediaView(mask), maskEncoding: 'grayscale-white-foreground' } : {}), ...(row.person_detection ? { detection: row.person_detection, maskSource: 'AI_SUGGESTION', requiresReview: true } : {}), ...(row.error ? { error: row.error } : {}) };
}
export function craftRoutes(app: App, s: Services) {
  app.post('/api/craft-jobs', async req => {
    const user = requireUser(req), data = jobBody.parse(req.body), hash = digest(s.config.secret, json(data));
    const old = await s.db.one('SELECT * FROM craft_jobs WHERE owner_id=$1 AND idempotency_key=$2', [user.id, data.idempotencyKey]);
    if (old) { if (old.request_hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT'); return { job: await jobView(s, old) }; }
    if (s.config.local || (data.variant === 'ANIME' ? !s.config.aiEditReady : !s.config.aiDetectReady)) fail(503, 'AI_UNAVAILABLE');
    await rateLimit(s, `ai-user:${user.id}`, 10, 86400000);
    await rateLimit(s, 'ai-global', 100, 86400000);
    const media = await s.db.one('SELECT * FROM media WHERE id=$1', [data.mediaId]);
    if (!media || media.owner_id !== user.id || media.kind !== 'IMAGE' || media.status !== 'READY') fail(422, 'SOURCE_MEDIA_NOT_OWNED_OR_READY');
    const jobId = id();
    const row = await s.db.tx(async c => {
      const inserted = (await c.query(`INSERT INTO craft_jobs(id,owner_id,source_media_id,input_version,variant,idempotency_key,request_hash,status,stage) VALUES($1,$2,$3,$4,$5,$6,$7,'QUEUED','QUEUED') ON CONFLICT(owner_id,idempotency_key) DO NOTHING RETURNING *`, [jobId, user.id, data.mediaId, data.inputVersion, data.variant, data.idempotencyKey, hash])).rows[0];
      if (inserted) { await outbox(c, 'CRAFT', jobId); return inserted; }
      const duplicate = (await c.query('SELECT * FROM craft_jobs WHERE owner_id=$1 AND idempotency_key=$2', [user.id, data.idempotencyKey])).rows[0];
      if (duplicate.request_hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT'); return duplicate;
    });
    return { job: await jobView(s, row) };
  });
  app.get<{ Params: { id: string } }>('/api/craft-jobs/:id', async req => ({ job: await jobView(s, owner(req, await s.db.one('SELECT * FROM craft_jobs WHERE id=$1', [req.params.id]))) }));
  app.post<{ Params: { id: string } }>('/api/craft-jobs/:id/cancel', async req => {
    owner(req, await s.db.one('SELECT * FROM craft_jobs WHERE id=$1', [req.params.id]));
    await s.db.query("UPDATE craft_jobs SET status='CANCELLED',stage='CANCELLED',run_token=NULL,updated_at=now() WHERE id=$1 AND status IN ('QUEUED','PROCESSING')", [req.params.id]);
    const row = (await s.db.one('SELECT * FROM craft_jobs WHERE id=$1', [req.params.id]))!;
    if (row.status !== 'CANCELLED') fail(409, 'JOB_ALREADY_FINISHED');
    return { job: await jobView(s, row) };
  });
}
export async function processCraft(s: Services, jobId: string) {
  const token = id();
  const row = (await s.db.query("UPDATE craft_jobs SET status='PROCESSING',stage='LOADING',run_token=$2,updated_at=now() WHERE id=$1 AND status IN ('QUEUED','PROCESSING') AND detection_attempted=false RETURNING *", [jobId, token])).rows[0];
  if (!row) {
    // A crash after the persisted call boundary cannot safely be retried. Allow active calls to finish,
    // but fail a stale redelivery rather than silently charging for another provider request.
    await s.db.query("UPDATE craft_jobs SET status='FAILED',stage='FAILED',error='DETECTION_ATTEMPT_INTERRUPTED',run_token=NULL,updated_at=now() WHERE id=$1 AND status='PROCESSING' AND detection_attempted=true AND updated_at<$2", [jobId, new Date(Date.now() - s.config.ai.timeoutMs - s.config.ai.imageTimeoutMs - 60000)]);
    return;
  }
  const keys: string[] = [];
  const current = async () => Boolean(await s.db.one("SELECT id FROM craft_jobs WHERE id=$1 AND run_token=$2 AND status='PROCESSING'", [jobId, token]));
  const stage = async (stage: string) => { const result = await s.db.query("UPDATE craft_jobs SET stage=$3 WHERE id=$1 AND run_token=$2 AND status='PROCESSING'", [jobId, token, stage]); if (!result.rowCount) throw new Error('JOB_OBSOLETE'); };
  try {
    if (s.config.local || (row.variant === 'ANIME' ? !s.config.aiEditReady : !s.config.aiDetectReady)) throw new Error('AI_UNAVAILABLE');
    const source = await s.db.one('SELECT * FROM media WHERE id=$1', [row.source_media_id]);
    if (!source || source.owner_id !== row.owner_id || source.kind !== 'IMAGE' || source.status !== 'READY') throw new Error('SOURCE_UNAVAILABLE');
    let image = { bytes: await s.storage.get(source.object_key), width: source.width, height: source.height };
    const openaiPerson = s.config.ai.provider === 'openai-person';
    // Commit the spend boundary before the first paid provider request. Replays must not repeat it.
    const claimSpend = async () => {
      const claimed = await s.db.query("UPDATE craft_jobs SET detection_attempted=true,updated_at=now() WHERE id=$1 AND run_token=$2 AND status='PROCESSING' AND detection_attempted=false", [jobId, token]);
      if (!claimed.rowCount) throw new Error('JOB_OBSOLETE');
    };
    if (row.variant === 'ANIME') {
      await stage('EDITING');
      if (openaiPerson) await claimSpend();
      image = await normalizeImage(await s.provider.edit(image.bytes), s.config);
      if (!await current()) return;
    }
    let detection: PersonDetection | undefined, mask: Buffer | null = null;
    if (openaiPerson) {
      // ANIME is the picture only. A raised figure is chosen separately by the user, who may then
      // request a REAL-variant localization of this stored output picture.
      if (row.variant === 'REAL') {
        if (!s.provider.detect) throw new Error('AI_UNAVAILABLE');
        await stage('DETECTING');
        await claimSpend();
        const suggestion = await s.provider.detect(image.bytes);
        detection = suggestion.detection;
        if (detection.width !== image.width || detection.height !== image.height || detection.method !== 'MODEL_POLYGON' || detection.requiresReview !== true || suggestion.maskSource !== 'AI_SUGGESTION') throw new Error('MASK_ALIGNMENT_INVALID');
        // This provider's own raster is always grayscale; never interpret its alpha as a precise mask.
        mask = await normalizeMask(suggestion.mask, image.width, image.height, { ...s.config, ai: { ...s.config.ai, mask: 'grayscale-white-foreground' } });
      }
    } else {
      await stage('SEGMENTING');
      mask = await normalizeMask(await s.provider.segment(image.bytes), image.width, image.height, s.config);
    }
    if (!await current()) return;
    await stage('STORING');
    const maskKey = mask ? objectKey('media', 'png') : null, outputKey = row.variant === 'ANIME' ? objectKey('media', 'png') : null;
    if (maskKey && mask) { keys.push(maskKey); await s.storage.put(maskKey, mask, 'image/png'); }
    if (outputKey) { keys.push(outputKey); await s.storage.put(outputKey, image.bytes, 'image/png'); }
    const committed = await s.db.tx(async c => {
      const active = (await c.query('SELECT * FROM craft_jobs WHERE id=$1 FOR UPDATE', [jobId])).rows[0];
      if (active.status !== 'PROCESSING' || active.run_token !== token) return false;
      const maskId = maskKey ? id() : null, outputId = outputKey ? id() : source.id;
      const stored: [string, string, Buffer][] = [];
      if (maskId && maskKey && mask) stored.push([maskId, maskKey, mask]);
      if (outputKey) stored.push([outputId, outputKey, image.bytes]);
      for (const [mediaId, key, bytes] of stored) await c.query("INSERT INTO media(id,owner_id,kind,purpose,status,object_key,mime,size,width,height) VALUES($1,$2,'IMAGE','CRAFT','READY',$3,'image/png',$4,$5,$6)", [mediaId, row.owner_id, key, bytes.length, image.width, image.height]);
      await c.query("UPDATE craft_jobs SET status='READY',stage=$4,mask_media_id=$2,output_media_id=$3,person_detection=$5,run_token=NULL,updated_at=now() WHERE id=$1", [jobId, maskId, outputId, detection ? 'NEEDS_REVIEW' : 'READY', detection ? json(detection) : null]);
      return true;
    });
    if (committed) keys.length = 0;
  } catch (error) {
    const safeError = error instanceof Error && ['NEEDS_REVIEW_NO_POLYGON', 'NEEDS_REVIEW_LOW_CONFIDENCE'].includes(error.message) ? error.message : 'AI_PROCESSING_FAILED';
    await s.db.query("UPDATE craft_jobs SET status='FAILED',stage='FAILED',error=$3,run_token=NULL,updated_at=now() WHERE id=$1 AND run_token=$2 AND status='PROCESSING'", [jobId, token, safeError]);
  } finally { for (const key of keys) await s.storage.remove(key).catch(() => {}); }
}
export function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('Invalid Redis URL');
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username ? decodeURIComponent(url.username) : undefined, password: url.password ? decodeURIComponent(url.password) : undefined, db: Number(url.pathname.slice(1) || 0), ...(url.protocol === 'rediss:' ? { tls: {} } : {}), maxRetriesPerRequest: null };
}
export class DurableTasks implements Tasks {
  readonly queue: Queue;
  constructor(url: string) { this.queue = new Queue('along-online', { connection: redisConnection(url) }); }
  async enqueue(task: 'MEDIA' | 'CRAFT', resourceId: string, outboxId: string) {
    // Keep completed IDs until PostgreSQL marks outbox delivered, avoiding the enqueue/ack crash window.
    await this.queue.add(task, { resourceId }, { jobId: outboxId, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: false, removeOnFail: false });
  }
  async close() { await this.queue.close(); }
}
export function startWorker(s: Services) {
  if (s.config.local || s.db.memory) throw new Error('Durable worker requires PostgreSQL and Redis');
  return new Worker('along-online', async job => {
    if (job.name === 'MEDIA') await processVideo(s, job.data.resourceId);
    else if (job.name === 'CRAFT') await processCraft(s, job.data.resourceId);
    else throw new Error('Unknown job');
  }, { connection: redisConnection(s.config.redisUrl), concurrency: s.config.workerConcurrency, lockDuration: 180000, maxStalledCount: 2 });
}
// Explicit local dev only: non-durable, serial worker. Not selected for production.
export class LocalTasks implements Tasks {
  private chain: Promise<void> = Promise.resolve();
  private seen = new Set<string>();
  constructor(private getServices: () => Services) {}
  async enqueue(task: 'MEDIA' | 'CRAFT', resourceId: string, outboxId: string) {
    if (this.seen.has(outboxId)) return; this.seen.add(outboxId);
    this.chain = this.chain.then(async () => { const s = this.getServices(); if (!s.config.local) throw new Error('Local tasks forbidden'); await (task === 'MEDIA' ? processVideo(s, resourceId) : processCraft(s, resourceId)); }).catch(() => {});
  }
  async close() { await this.chain; }
}
