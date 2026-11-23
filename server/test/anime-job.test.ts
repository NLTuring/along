// The anime job is the picture only: one paid edit call, no person localization, no mask.
// pg-mem and in-memory storage; the provider is a stub, so nothing leaves the process.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { memoryDatabase } from '../src/db.js';
import { MemoryStorage } from '../src/storage.js';
import { processCraft } from '../src/jobs.js';
import type { ImageProvider, Services } from '../src/core.js';

const env = { NODE_ENV: 'production', SESSION_SECRET: 'anime-job-test-secret-at-least-32-characters', APP_ORIGINS: 'https://along.example.test', DATABASE_URL: 'postgresql://unused', REDIS_URL: 'redis://unused', STORAGE_DRIVER: 'filesystem', PRIVATE_STORAGE_DIR: process.cwd(), SMTP_HOST: 'mail.example.test', SMTP_USER: 'test', SMTP_PASSWORD: 'not-real', SMTP_FROM: 'test@example.test',
  AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: 'https://vision.example.test/v1', OPENAI_ALLOWED_HOSTS: 'vision.example.test', OPENAI_MODEL: 'vision-model', OPENAI_API_KEY: 'synthetic',
  OPENAI_IMAGE_BASE_URL: 'https://images.example.test/v1', OPENAI_IMAGE_ALLOWED_HOSTS: 'images.example.test', OPENAI_IMAGE_MODEL: 'gpt-image-2.6-sunburst', OPENAI_IMAGE_API_KEY: 'synthetic-image' };

async function setup(provider: ImageProvider) {
  const db = await memoryDatabase(), storage = new MemoryStorage();
  const s = { config: loadConfig(env), db, storage, provider, mailer: { sendOtp: async () => {} }, tasks: { enqueue: async () => {} } } as unknown as Services;
  const photo = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#9dbbbc' } }).png().toBuffer();
  await db.query("INSERT INTO users(id,email,display_name) VALUES('u1','u1@example.test','U1')");
  await storage.put('media/00000000-0000-4000-8000-000000000001.png', photo);
  await db.query("INSERT INTO media(id,owner_id,kind,purpose,status,object_key,mime,size,width,height) VALUES('m1','u1','IMAGE','CRAFT','READY','media/00000000-0000-4000-8000-000000000001.png','image/png',$1,48,32)", [photo.length]);
  await db.query("INSERT INTO craft_jobs(id,owner_id,source_media_id,input_version,variant,idempotency_key,request_hash,status,stage) VALUES('j1','u1','m1','v1','ANIME','idem-0001','h','QUEUED','QUEUED')");
  return s;
}

describe('anime craft job', () => {
  it('stores only the edited picture and never asks for a person outline', async () => {
    let edits = 0, detects = 0;
    const anime = await sharp({ create: { width: 72, height: 48, channels: 3, background: '#e05a4f' } }).png().toBuffer();
    const s = await setup({ edit: async () => { edits++; return anime; }, segment: async () => { throw Error('must not segment'); }, detect: async () => { detects++; throw Error('must not detect'); } } as ImageProvider);
    await processCraft(s, 'j1');
    const job = (await s.db.one("SELECT * FROM craft_jobs WHERE id='j1'"))!;
    assert.equal(job.status, 'READY', job.error); assert.equal(job.stage, 'READY');
    assert.equal(job.mask_media_id, null); assert.equal(job.person_detection, null); assert.equal(job.detection_attempted, true);
    assert.equal(edits, 1); assert.equal(detects, 0);
    const output = (await s.db.one('SELECT * FROM media WHERE id=$1', [job.output_media_id]))!;
    assert.equal(output.width, 72); assert.equal(output.height, 48); assert.equal(output.owner_id, 'u1');
    // A redelivered job must not pay for a second edit.
    await s.db.query("UPDATE craft_jobs SET status='PROCESSING' WHERE id='j1'");
    await processCraft(s, 'j1'); assert.equal(edits, 1);
  });
  it('fails safely when the edit call fails, without a partial result', async () => {
    const s = await setup({ edit: async () => { throw Error('PROVIDER_REQUEST_FAILED'); }, segment: async () => Buffer.alloc(0) } as ImageProvider);
    await processCraft(s, 'j1');
    const job = (await s.db.one("SELECT * FROM craft_jobs WHERE id='j1'"))!;
    assert.equal(job.status, 'FAILED'); assert.equal(job.output_media_id, null); assert.equal(job.mask_media_id, null);
    assert.equal((await s.db.one("SELECT count(*)::int AS n FROM media"))!.n, 1);
  });
});
