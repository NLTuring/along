import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { App, Services } from './core.js';
import { fail, id, outbox, requireUser, sendFile } from './core.js';
import { objectKey } from './storage.js';
import type { Row } from './db.js';
import type { Config } from './config.js';

export const mediaView = (row: Row) => ({ id: row.id, kind: row.kind, status: row.status, url: `/api/media/${row.id}/file`, ...(row.poster_key ? { posterUrl: `/api/media/${row.id}/poster` } : {}), ...(row.width ? { width: row.width, height: row.height } : {}), ...(row.duration ? { durationSeconds: row.duration } : {}) });
export async function accessibleMedia(s: Services, req: FastifyRequest, mediaId: string) {
  const row = await s.db.one('SELECT * FROM media WHERE id=$1', [mediaId]);
  if (!row) fail(404, 'NOT_FOUND');
  if (row!.owner_id !== req.user?.id && req.user?.role !== 'ADMIN') {
    const publicPost = await s.db.one('SELECT p.id FROM posts p JOIN post_media pm ON pm.post_id=p.id WHERE pm.media_id=$1 AND p.status=$2 LIMIT 1', [mediaId, 'PUBLIC']);
    if (!publicPost || row!.status !== 'READY') fail(404, 'NOT_FOUND');
  }
  return row!;
}
export async function normalizeImage(bytes: Buffer, config: Config) {
  if (bytes.length > config.limits.imageBytes) fail(413, 'IMAGE_TOO_LARGE');
  const type = await fileTypeFromBuffer(bytes);
  if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) fail(415, 'INVALID_IMAGE');
  try {
    const decoder = sharp(bytes, { limitInputPixels: config.limits.pixels, failOn: 'warning', animated: false });
    const meta = await decoder.metadata();
    if (!meta.width || !meta.height || (meta.pages || 1) !== 1 || meta.width < 2 || meta.height < 2 || meta.width * meta.height > config.limits.pixels) fail(422, 'INVALID_IMAGE');
    const { data, info } = await decoder.rotate().toColorspace('srgb').png().toBuffer({ resolveWithObject: true });
    if (data.length > config.limits.imageBytes) fail(413, 'NORMALIZED_IMAGE_TOO_LARGE');
    return { bytes: data, width: info.width, height: info.height };
  } catch (e: any) { if (e.code) throw e; return fail(422, 'IMAGE_DECODE_FAILED'); }
}
export async function readMultipart(req: FastifyRequest, names: string[], fileBytes: number, maxFields = 3) {
  const files = new Map<string, Buffer>(), fields: Record<string, string> = {};
  if (!req.isMultipart()) fail(415, 'MULTIPART_REQUIRED');
  for await (const part of req.parts({ limits: { files: names.length, fields: maxFields, parts: names.length + maxFields, fileSize: fileBytes, fieldSize: 16 * 1024 } })) {
    if (part.type === 'file') {
      if (!names.includes(part.fieldname) || files.has(part.fieldname)) fail(400, 'UNEXPECTED_FILE');
      const bytes = await part.toBuffer();
      if (part.file.truncated || !bytes.length) fail(413, 'FILE_TOO_LARGE_OR_EMPTY');
      files.set(part.fieldname, bytes);
    } else {
      if (fields[part.fieldname] !== undefined || part.valueTruncated || typeof part.value !== 'string') return fail(400, 'INVALID_MULTIPART_FIELD');
      fields[part.fieldname] = part.value;
    }
  }
  if (files.size !== names.length) fail(400, 'MISSING_FILE');
  return { files, fields };
}
export function mediaRoutes(app: App, s: Services) {
  app.post('/api/media', async req => {
    const user = requireUser(req);
    const { files, fields } = await readMultipart(req, ['file'], s.config.limits.videoBytes, 2);
    const meta = z.object({ purpose: z.enum(['COMMUNITY', 'CRAFT']), consent: z.literal('true') }).strict().parse(fields);
    const bytes = files.get('file')!; const sniff = await fileTypeFromBuffer(bytes);
    if (!sniff) fail(415, 'UNSUPPORTED_MEDIA');
    const image = ['image/png', 'image/jpeg', 'image/webp'].includes(sniff!.mime);
    if (!image && !['video/mp4', 'video/quicktime', 'video/webm'].includes(sniff!.mime)) fail(415, 'UNSUPPORTED_MEDIA');
    if (!image && meta.purpose === 'CRAFT') fail(422, 'CRAFT_REQUIRES_IMAGE');
    const decoded = image ? await normalizeImage(bytes, s.config) : null;
    const key = objectKey('media', image ? 'png' : 'bin'), mediaId = id();
    await s.storage.put(key, decoded?.bytes || bytes, image ? 'image/png' : sniff!.mime);
    try {
      await s.db.tx(async c => {
        await c.query(`INSERT INTO media(id,owner_id,kind,purpose,status,object_key,mime,size,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [mediaId, user.id, image ? 'IMAGE' : 'VIDEO', meta.purpose, image ? 'READY' : 'PROCESSING', key, image ? 'image/png' : sniff!.mime, decoded?.bytes.length || bytes.length, decoded?.width || null, decoded?.height || null]);
        if (!image) await outbox(c, 'MEDIA', mediaId);
      });
    } catch (e) { await s.storage.remove(key); throw e; }
    return { media: mediaView((await s.db.one('SELECT * FROM media WHERE id=$1', [mediaId]))!) };
  });
  app.get<{ Params: { id: string } }>('/api/media/:id', async req => ({ media: mediaView(await accessibleMedia(s, req, req.params.id)) }));
  for (const part of ['file', 'poster'] as const) app.get<{ Params: { id: string } }>(`/api/media/:id/${part}`, async (req, reply) => {
    const row = await accessibleMedia(s, req, req.params.id);
    if (row.status !== 'READY') fail(409, 'MEDIA_NOT_READY');
    const key = part === 'poster' ? row.poster_key : row.object_key;
    if (!key) fail(404, 'NOT_FOUND');
    return sendFile(req, reply, s.storage, key, part === 'poster' ? 'image/jpeg' : row.mime);
  });
}
function run(command: string, args: string[], timeout: number) {
  return new Promise<string>((resolve, reject) => {
    const process = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', errors = '', settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(out); };
    const timer = setTimeout(() => { process.kill('SIGKILL'); finish(new Error('MEDIA_PROCESS_TIMEOUT')); }, timeout);
    process.stdout.on('data', b => { out += b.toString(); if (out.length > 1024 * 1024) { process.kill('SIGKILL'); finish(new Error('MEDIA_PROCESS_OUTPUT_LIMIT')); } });
    process.stderr.on('data', b => { errors = (errors + b.toString()).slice(-8192); });
    process.on('error', () => finish(new Error('MEDIA_TOOL_UNAVAILABLE')));
    process.on('exit', code => finish(code === 0 ? undefined : new Error('MEDIA_PROCESS_FAILED')));
  });
}
export async function processVideo(s: Services, mediaId: string) {
  const row = await s.db.one('SELECT * FROM media WHERE id=$1', [mediaId]);
  if (!row || row.status !== 'PROCESSING') return;
  const dir = await mkdtemp(join(tmpdir(), 'along-video-'));
  let outputKey: string | undefined, posterKey: string | undefined;
  try {
    const input = join(dir, 'input.bin'), output = join(dir, 'output.mp4'), poster = join(dir, 'poster.jpg');
    await writeFile(input, await s.storage.get(row.object_key));
    const args = ['-v', 'error', '-protocol_whitelist', 'file', '-show_format', '-show_streams', '-of', 'json', input];
    const probe = JSON.parse(await run(s.config.ffprobe, args, 15000));
    const video = probe.streams?.find((st: any) => st.codec_type === 'video');
    const duration = Number(probe.format?.duration);
    if (!video || !Number.isFinite(duration) || duration <= 0 || duration > s.config.limits.videoSeconds || video.width * video.height > 4096 * 2160 || video.width < 2 || video.height < 2) throw new Error('VIDEO_LIMITS_EXCEEDED');
    await run(s.config.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'file', '-threads', '2', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-vf', "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-t', String(s.config.limits.videoSeconds), '-fs', String(s.config.limits.videoBytes), '-movflags', '+faststart', '-y', output], 120000);
    const outProbe = JSON.parse(await run(s.config.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-show_format', '-show_streams', '-of', 'json', output], 15000));
    const outVideo = outProbe.streams?.find((st: any) => st.codec_type === 'video');
    if (!outVideo || outVideo.codec_name !== 'h264' || Math.abs(Number(outProbe.format.duration) - duration) > 1.2) throw new Error('VIDEO_OUTPUT_INVALID');
    await run(s.config.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'file', '-i', output, '-frames:v', '1', '-vf', 'scale=640:-2', '-threads', '1', '-y', poster], 15000);
    const data = await readFile(output), posterData = await readFile(poster);
    if (data.length > s.config.limits.videoBytes || !posterData.length) throw new Error('VIDEO_OUTPUT_INVALID');
    outputKey = objectKey('media', 'mp4'); posterKey = objectKey('media', 'jpg');
    await s.storage.put(outputKey, data, 'video/mp4'); await s.storage.put(posterKey, posterData, 'image/jpeg');
    const updated = await s.db.query(`UPDATE media SET status='READY',object_key=$2,poster_key=$3,mime='video/mp4',size=$4,width=$5,height=$6,duration=$7 WHERE id=$1 AND status='PROCESSING'`, [mediaId, outputKey, posterKey, data.length, outVideo.width, outVideo.height, Number(outProbe.format.duration)]);
    if (!updated.rowCount) { await s.storage.remove(outputKey); await s.storage.remove(posterKey); }
    else await s.storage.remove(row.object_key);
  } catch {
    if (outputKey) await s.storage.remove(outputKey).catch(() => {});
    if (posterKey) await s.storage.remove(posterKey).catch(() => {});
    await s.db.query("UPDATE media SET status='FAILED',error='VIDEO_PROCESSING_FAILED' WHERE id=$1 AND status='PROCESSING'", [mediaId]);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
