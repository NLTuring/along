import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { OpenAIPersonProvider } from '../src/openai-person-provider.js';
import type { ProviderResponse } from '../src/providers.js';

function config() {
  return loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'person-provider-test-secret-at-least-32-characters', APP_ORIGINS: 'https://along.example.test', DATABASE_URL: 'postgresql://unused', REDIS_URL: 'redis://unused', STORAGE_DRIVER: 'filesystem', PRIVATE_STORAGE_DIR: process.cwd(), SMTP_HOST: 'mail.example.test', SMTP_USER: 'test', SMTP_PASSWORD: 'not-real', SMTP_FROM: 'test@example.test', AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: 'https://openai.goldgom.top/v1', OPENAI_ALLOWED_HOSTS: 'openai.goldgom.top', OPENAI_MODEL: 'gpt-6.1-sol', OPENAI_API_KEY: 'synthetic-secret-not-valid' });
}
function editConfig(change: Record<string, string> = {}) {
  return loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'person-provider-test-secret-at-least-32-characters', APP_ORIGINS: 'https://along.example.test', DATABASE_URL: 'postgresql://unused', REDIS_URL: 'redis://unused', STORAGE_DRIVER: 'filesystem', PRIVATE_STORAGE_DIR: process.cwd(), SMTP_HOST: 'mail.example.test', SMTP_USER: 'test', SMTP_PASSWORD: 'not-real', SMTP_FROM: 'test@example.test', AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: 'https://openai.goldgom.top/v1', OPENAI_ALLOWED_HOSTS: 'openai.goldgom.top', OPENAI_MODEL: 'gpt-6.1-sol', OPENAI_API_KEY: 'synthetic-secret-not-valid',
    OPENAI_IMAGE_BASE_URL: 'https://images.example.test/v1', OPENAI_IMAGE_ALLOWED_HOSTS: 'images.example.test', OPENAI_IMAGE_MODEL: 'gpt-image-2.6-sunburst', OPENAI_IMAGE_API_KEY: 'synthetic-image-secret', ...change });
}
const detection = () => ({ image_width: 64, image_height: 64, main_person_bbox: [16, 8, 48, 56], main_person_polygon: [[32, 8], [42, 20], [48, 36], [40, 56], [24, 56], [16, 36], [22, 20]], confidence: .8 });
const reply = (value: unknown): ProviderResponse => ({ type: 'application/json', bytes: Buffer.from(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(value) } }] })) });
const source = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#9dbbbc' } }).png().toBuffer();

describe('main-person provider without live calls', () => {
  it('reports detection separately and never advertises image editing', () => {
    const c = config(); assert.equal(c.aiDetectReady, true); assert.equal(c.aiEditReady, false); assert.equal(c.aiReady, false);
  });
  it('uses one bounded vision request and returns an explicitly reviewable polygon mask', async () => {
    let calls = 0;
    const provider = new OpenAIPersonProvider(config(), async (url, method, body, headers, max) => {
      calls++; assert.equal(url.href, 'https://openai.goldgom.top/v1/chat/completions'); assert.equal(method, 'POST'); assert.equal(max, 64 * 1024);
      const request = JSON.parse(body!.toString()); assert.equal(request.model, 'gpt-6.1-sol'); assert.equal(request.max_tokens, 1600);
      assert.ok(request.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'));
      assert.equal(headers.Authorization, 'Bearer synthetic-secret-not-valid');
      return reply(detection());
    });
    const result = await provider.detect(await source());
    assert.equal(calls, 1); assert.equal(result.maskSource, 'AI_SUGGESTION'); assert.equal(result.detection.requiresReview, true);
    const mask = await sharp(result.mask).raw().toBuffer(); assert.ok(mask.includes(0)); assert.ok(mask.includes(255));
    assert.deepEqual(result.detection.bbox, [16, 8, 48, 56]);
  });
  it('refuses animation or precise segmentation calls instead of fabricating images', async () => {
    const provider = new OpenAIPersonProvider(config(), async () => { throw Error('must not call'); });
    await assert.rejects(provider.edit(await source()), { code: 'AI_UNAVAILABLE' }); // no image gateway configured
    await assert.rejects(provider.segment(await source()), { code: 'AI_DETECTION_REQUIRES_REVIEW' });
  });
  for (const [label, change] of Object.entries({ missingPolygon: { main_person_polygon: null }, lowConfidence: { confidence: .1 }, dimensions: { image_width: 65 }, bounds: { main_person_polygon: [[0, 0], [64, 0], [64, 64]] }, selfIntersection: { main_person_polygon: [[16,8],[48,56],[48,8],[16,56]] }, duplicate: { main_person_polygon: [[16,8],[48,8],[48,56],[16,8],[16,56]] } })) {
    it(`rejects invalid ${label} without a rectangular mask fallback`, async () => {
      const provider = new OpenAIPersonProvider(config(), async () => reply({ ...detection(), ...change }));
      await assert.rejects(provider.detect(await source()));
    });
  }
  it('accepts an outline slightly past the model box and widens the box to it', async () => {
    const provider = new OpenAIPersonProvider(config(), async () => reply({ ...detection(), main_person_polygon: [[32, 7], [42, 20], [49, 36], [40, 56], [24, 56], [16, 36], [22, 20]] }));
    const result = await provider.detect(await source());
    assert.deepEqual(result.detection.bbox, [16, 7, 49, 56]);
  });
  it('still rejects an outline far outside the model box', async () => {
    const provider = new OpenAIPersonProvider(config(), async () => reply({ ...detection(), main_person_polygon: [[32, 0], [42, 20], [48, 36], [40, 56], [24, 56], [16, 36], [22, 20]] }));
    await assert.rejects(provider.detect(await source()), /PROVIDER_DETECTION_INVALID/);
  });
  it('does not retry a rejected provider request', async () => {
    let calls = 0; const provider = new OpenAIPersonProvider(config(), async () => { calls++; throw Error('503'); });
    await assert.rejects(provider.detect(await source()), /PROVIDER_REQUEST_FAILED/); assert.equal(calls, 1);
  });
  it('accepts the recorded synthetic-image response without another provider call', async () => {
    const recorded = { image_width: 512, image_height: 512, main_person_bbox: [181,108,335,452], main_person_polygon: [[238,206],[227,199],[218,189],[211,177],[207,164],[208,149],[212,136],[220,125],[231,116],[244,110],[258,108],[272,110],[285,116],[296,125],[304,137],[308,150],[309,163],[305,178],[298,190],[288,200],[278,206],[292,211],[306,218],[335,340],[284,355],[306,452],[218,452],[199,354],[220,351],[181,340],[210,218],[224,211]], confidence: .99 };
    const image = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#9dbbbc' } }).png().toBuffer();
    const provider = new OpenAIPersonProvider(config(), async () => reply(recorded));
    const result = await provider.detect(image);
    assert.equal(result.detection.requiresReview, true);
    assert.deepEqual(result.detection.bbox, recorded.main_person_bbox);
    assert.equal(result.detection.polygon.length, recorded.main_person_polygon.length);
  });
  it('enables anime editing only with a complete separate image gateway', () => {
    const c = editConfig(); assert.equal(c.aiEditReady, true); assert.equal(c.aiDetectReady, true);
    assert.equal(editConfig({ OPENAI_IMAGE_API_KEY: '' }).aiEditReady, false);
    // The anime picture does not depend on the person-localization model.
    const imageOnly = editConfig({ OPENAI_API_KEY: '' }); assert.equal(imageOnly.aiEditReady, true); assert.equal(imageOnly.aiDetectReady, false);
    assert.throws(() => editConfig({ OPENAI_IMAGE_ALLOWED_HOSTS: 'other.example.test' }), /allowlist/);
    assert.throws(() => editConfig({ OPENAI_IMAGE_BASE_URL: 'http://images.example.test/v1' }), /HTTPS/);
  });
  it('sends one multipart /images/edits request and returns a re-encoded inline image', async () => {
    let calls = 0;
    const edited = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#e05a4f' } }).withMetadata({ exif: { IFD0: { Copyright: 'provider' } } }).jpeg().toBuffer();
    const provider = new OpenAIPersonProvider(editConfig(), async (url, method, body, headers, max, timeout) => {
      calls++; assert.equal(url.href, 'https://images.example.test/v1/images/edits'); assert.equal(method, 'POST');
      assert.equal(headers.Authorization, 'Bearer synthetic-image-secret'); assert.match(headers['Content-Type'], /^multipart\/form-data; boundary=along-[a-f0-9]{24}$/);
      const text = body!.toString('latin1');
      assert.match(text, /name="model"\r\n\r\ngpt-image-2\.6-sunburst\r\n/); assert.match(text, /name="size"\r\n\r\n1536x1024\r\n/); assert.match(text, /name="image"; filename="source\.png"\r\nContent-Type: image\/png/);
      assert.ok(max >= 16 * 1024 * 1024); assert.equal(timeout, 180000);
      return { type: 'application/json', bytes: Buffer.from(JSON.stringify({ created: 1, data: [{ b64_json: edited.toString('base64') }], usage: {} })) };
    });
    const wide = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#9dbbbc' } }).png().toBuffer();
    const result = await provider.edit(wide), meta = await sharp(result).metadata();
    assert.equal(calls, 1); assert.equal(meta.format, 'png'); assert.equal(meta.width, 96); assert.equal(meta.exif, undefined);
  });
  for (const [label, response] of Object.entries({
    url: { type: 'application/json', bytes: Buffer.from(JSON.stringify({ data: [{ url: 'https://evil.example.test/a.png' }] })) },
    error: { type: 'application/json', bytes: Buffer.from(JSON.stringify({ error: { message: 'no channel' }, data: [{ b64_json: 'A'.repeat(32) }] })) },
    html: { type: 'text/html', bytes: Buffer.from('<html></html>') },
    notImage: { type: 'application/json', bytes: Buffer.from(JSON.stringify({ data: [{ b64_json: Buffer.from('not an image at all').toString('base64') }] })) },
    two: { type: 'application/json', bytes: Buffer.from(JSON.stringify({ data: [{ b64_json: 'A'.repeat(32) }, { b64_json: 'A'.repeat(32) }] })) },
  })) {
    it(`rejects an anime ${label} response without fetching or storing it`, async () => {
      let calls = 0; const provider = new OpenAIPersonProvider(editConfig(), async () => { calls++; return response; });
      await assert.rejects(provider.edit(await source())); assert.equal(calls, 1);
    });
  }
  it('requires exact allowed host and forbids external AI in local-development mode', () => {
    const base = { NODE_ENV: 'test', DEVELOPMENT_LOCAL: 'true', SESSION_SECRET: 'local-secret-longer-than-32-characters', AI_PROVIDER: 'openai-person', OPENAI_BASE_URL: 'https://openai.goldgom.top/v1', OPENAI_ALLOWED_HOSTS: 'openai.goldgom.top', OPENAI_MODEL: 'gpt-6.1-sol', OPENAI_API_KEY: 'synthetic' };
    assert.throws(() => loadConfig(base), /forbids external/);
    assert.throws(() => loadConfig({ ...base, OPENAI_ALLOWED_HOSTS: 'other.example.test' }), /allowlist/);
  });
});
