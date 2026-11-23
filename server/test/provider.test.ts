import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import dns from 'node:dns/promises';
import https from 'node:https';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { AliyunImageProvider } from '../src/aliyun-provider.js';
import { allowedProviderUrl, HttpImageProvider, safeHttps, type ProviderTransport } from '../src/providers.js';

// No service credentials, DNS or image/provider network traffic: every transport is mocked.
const base: NodeJS.ProcessEnv = {
  NODE_ENV: 'development', SESSION_SECRET: 'unit-tests-only-not-a-real-secret-123456',
  DATABASE_URL: 'postgres://unused', REDIS_URL: 'redis://unused',
  S3_ENDPOINT: 'https://storage.example.com', S3_BUCKET: 'test', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test',
};
const full: NodeJS.ProcessEnv = {
  AI_PROVIDER: 'aliyun-dashscope', DASHSCOPE_API_KEY: 'edit-test-secret',
  DASHSCOPE_MODEL: 'qwen-image-2.0-pro', DASHSCOPE_RESULT_HOSTS: 'dashscope-result-bj.oss-cn-beijing.aliyuncs.com',
  AI_SEGMENT_URL: 'https://segment.example.com/mask', AI_SEGMENT_ALLOWED_HOSTS: 'segment.example.com',
  AI_SEGMENT_API_KEY: 'segment-test-secret', AI_SEGMENT_ANIME_CAPABLE: 'true',
};
const config = (overrides: NodeJS.ProcessEnv = {}) => loadConfig({ ...base, ...full, ...overrides });
const resultUrl = 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.png?Expires=123&Signature=not-real';
const success = (url = resultUrl) => ({ output: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: [{ image: url }] } }] }, request_id: 'mock-only', usage: { image_count: 1 } });
const json = (value: unknown) => ({ bytes: Buffer.from(JSON.stringify(value)), type: 'application/json; charset=utf-8' });
const fixture = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#708090' } }).png().toBuffer();

test('AI readiness requires the complete explicit chain and no implicit model', () => {
  assert.equal(loadConfig(base).aiReady, false);
  assert.equal(loadConfig(base).ai.provider, 'disabled');
  assert.equal(config().aiReady, true);
  for (const key of ['DASHSCOPE_API_KEY', 'DASHSCOPE_MODEL', 'DASHSCOPE_RESULT_HOSTS', 'AI_SEGMENT_URL', 'AI_SEGMENT_ALLOWED_HOSTS', 'AI_SEGMENT_API_KEY', 'AI_SEGMENT_ANIME_CAPABLE']) {
    assert.equal(config({ [key]: '' }).aiReady, false, key);
  }
  assert.equal(config({ AI_PROVIDER: 'disabled' }).aiReady, false);
  assert.equal(config({ AI_SEGMENT_ANIME_CAPABLE: 'false' }).aiReady, false);
  assert.throws(() => config({ DEVELOPMENT_LOCAL: 'true' }), /forbids external/);
  assert.equal(config({ DEVELOPMENT_LOCAL: 'true', DASHSCOPE_API_KEY: '' }).aiReady, false);
  const gateway = { AI_PROVIDER: 'http-gateway', AI_EDIT_URL: 'https://edit.example.com/edit', AI_EDIT_ALLOWED_HOSTS: 'edit.example.com', AI_API_KEY: 'gateway-test-secret' };
  assert.equal(config(gateway).aiReady, true);
  assert.equal(config({ ...gateway, AI_EDIT_URL: '' }).aiReady, false);
  assert.equal(config({ ...gateway, AI_EDIT_ALLOWED_HOSTS: '' }).aiReady, false);
  assert.equal(config({ ...gateway, AI_API_KEY: '' }).aiReady, false);
});

test('official endpoints must match region, path and exact allowlist', () => {
  assert.equal(config({ DASHSCOPE_REGION: 'ap-southeast-1' }).ai.editUrl, 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
  const workspace = '123456.cn-beijing.maas.aliyuncs.com';
  assert.equal(config({ DASHSCOPE_ENDPOINT: `https://${workspace}/api/v1/services/aigc/multimodal-generation/generation`, DASHSCOPE_ENDPOINT_HOSTS: workspace }).aiReady, true);
  for (const endpoint of [
    'http://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    'https://dashscope.aliyuncs.com/api/v1/other',
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation?x=1',
    'https://user:secret@dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    'https://dashscope.aliyuncs.com:444/api/v1/services/aigc/multimodal-generation/generation',
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation#fragment',
  ]) assert.throws(() => config({ DASHSCOPE_ENDPOINT: endpoint }));
  for (const host of ['other.example.com', 'dashscope-intl.aliyuncs.com', 'a.b.cn-beijing.maas.aliyuncs.com']) {
    assert.throws(() => config({ DASHSCOPE_ENDPOINT: `https://${host}/api/v1/services/aigc/multimodal-generation/generation`, DASHSCOPE_ENDPOINT_HOSTS: host }), /official region/);
  }
  assert.throws(() => config({ DASHSCOPE_RESULT_HOSTS: '*.aliyuncs.com' }));
  assert.throws(() => config({ AI_SEGMENT_ALLOWED_HOSTS: 'other.example.com' }), /allowlist/);
  assert.throws(() => config({ AI_REQUEST_TIMEOUT_MS: '180001' }));
});

test('native DashScope JSON uses sanitized Base64, server model/prompt and isolated secrets', async () => {
  const input = await sharp(await fixture()).withMetadata().png().toBuffer();
  assert.ok((await sharp(input).metadata()).exif);
  const image = await fixture();
  const cfg = config({ DASHSCOPE_EDIT_PROMPT: 'Convert to an anime illustration.' });
  let calls = 0;
  const transport: ProviderTransport = async (url, method, body, headers, maxBytes, timeout) => {
    calls++;
    assert.ok(timeout! > 0 && timeout! <= cfg.ai.timeoutMs);
    if (calls === 1) {
      assert.equal(method, 'POST');
      assert.equal(url.href, cfg.ai.editUrl);
      assert.equal(headers.Authorization, 'Bearer edit-test-secret');
      assert.equal(headers['Content-Type'], 'application/json');
      assert.equal(maxBytes, 64 * 1024);
      const request = JSON.parse(body!.toString('utf8'));
      assert.equal(request.model, cfg.ai.model);
      assert.deepEqual(request.parameters, { n: 1 });
      assert.equal(request.input.messages.length, 1);
      assert.equal(request.input.messages[0].role, 'user');
      const content = request.input.messages[0].content;
      assert.equal(content[1].text, cfg.ai.prompt);
      assert.ok(content[0].image.startsWith('data:image/png;base64,'));
      const sent = Buffer.from(content[0].image.split(',')[1], 'base64');
      const meta = await sharp(sent).metadata();
      assert.equal(meta.format, 'png'); assert.equal(meta.width, 8); assert.equal(meta.height, 8);
      assert.equal(meta.exif, undefined); assert.equal(meta.icc, undefined);
      return json(success());
    }
    if (calls === 2) {
      assert.equal(method, 'GET'); assert.equal(url.href, resultUrl);
      assert.equal(body, undefined); assert.deepEqual(headers, { Accept: 'image/png' });
      assert.equal(maxBytes, cfg.limits.imageBytes); assert.ok(timeout! <= 30000);
      return { bytes: image, type: 'image/png' };
    }
    assert.equal(calls, 3); assert.equal(method, 'POST');
    assert.equal(url.href, cfg.ai.segmentUrl); assert.equal(headers.Authorization, 'Bearer segment-test-secret');
    assert.equal(headers['Content-Type'], 'image/png'); assert.ok(body!.subarray(0, 8).equals(image.subarray(0, 8)));
    // A transport fixture, not a claimed semantic mask. Job mask validation is separate.
    return { bytes: image, type: 'image/png' };
  };
  const provider = new AliyunImageProvider(cfg, transport);
  const edited = await provider.edit(input);
  assert.equal((await sharp(edited).metadata()).format, 'png');
  await provider.segment(edited);
  assert.equal(calls, 3);
});

test('official adapter rejects malformed/error/ambiguous JSON without a result download', async () => {
  const input = await fixture();
  const malformed = [
    { bytes: Buffer.from('{'), type: 'application/json' },
    { bytes: Buffer.alloc(65537, 32), type: 'application/json' },
    { ...json(success()), type: 'text/html' },
    json({ code: 'InvalidApiKey', message: 'do not expose this secret' }),
    json({ error: 'do not expose this secret', ...success() }),
    json({ output: { task_id: 'async-is-not-supported' } }),
    json({ output: { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: [{ image: resultUrl }] } }] } }),
    json({ output: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: [{ text: 'no image' }] } }] } }),
    json({ output: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: [{ image: resultUrl }, { image: resultUrl }] } }] } }),
  ];
  for (const response of malformed) {
    let calls = 0;
    const provider = new AliyunImageProvider(config(), async () => { calls++; return response; });
    await assert.rejects(provider.edit(input), error => error instanceof Error && /^PROVIDER_/.test(error.message) && !error.message.includes('secret'));
    assert.equal(calls, 1);
  }
});

test('untrusted, redirect-style, credential-bearing and non-HTTPS image URLs are not downloaded', async () => {
  const input = await fixture();
  for (const url of [
    'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/image.png',
    'https://user:secret@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/image.png',
    'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com:444/image.png',
    'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.example/image.png',
    'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/image.png#fragment',
    'https://127.0.0.1/image.png', 'https://169.254.169.254/latest/meta-data',
    'file:///secret.png', 'data:image/png;base64,AAAA', '//evil.example/image.png',
  ]) {
    let calls = 0;
    const provider = new AliyunImageProvider(config(), async () => { calls++; return json(success(url)); });
    await assert.rejects(provider.edit(input), /PROVIDER_/);
    assert.equal(calls, 1, url);
  }
  assert.throws(() => allowedProviderUrl('https://sub.example.com/image.png', ['example.com']), /HOST_FORBIDDEN/);
});

test('invalid source and invalid or oversized result images fail without fabricated output', async () => {
  let calls = 0;
  const provider = new AliyunImageProvider(config(), async () => { calls++; throw new Error('unexpected network'); });
  await assert.rejects(provider.edit(Buffer.from('<svg></svg>')));
  await assert.rejects(provider.edit(Buffer.alloc(config().limits.imageBytes + 1)), /INPUT_TOO_LARGE/);
  assert.equal(calls, 0);
  const input = await fixture();
  const oversized = Buffer.alloc(513);
  const cfg = config(), smallLimit = { ...cfg, limits: { ...cfg.limits, imageBytes: 512 } };
  for (const bad of [
    { bytes: Buffer.from('not a png'), type: 'image/png' },
    { bytes: input, type: 'image/jpeg' },
    { bytes: oversized, type: 'image/png' },
  ]) {
    let n = 0;
    const badProvider = new AliyunImageProvider(smallLimit, async () => ++n === 1 ? json(success()) : bad);
    await assert.rejects(badProvider.edit(input), /PROVIDER_/);
    assert.equal(n, 2);
  }
});

test('disabled/incomplete/local providers never call transport; gateway mode stays explicit', async () => {
  const input = await fixture();
  let calls = 0;
  const blocked: ProviderTransport = async () => { calls++; throw new Error('unexpected network'); };
  for (const cfg of [config({ DASHSCOPE_API_KEY: '' }), config({ AI_PROVIDER: 'disabled' }), config({ DEVELOPMENT_LOCAL: 'true', DASHSCOPE_API_KEY: '' })]) {
    await assert.rejects(new AliyunImageProvider(cfg, blocked).edit(input), /AI_UNAVAILABLE/);
    await assert.rejects(new HttpImageProvider(cfg, blocked).segment(input), /AI_UNAVAILABLE/);
  }
  assert.equal(calls, 0);
  assert.throws(() => new HttpImageProvider(config(), blocked).edit(input), /AI_UNAVAILABLE/);
  const cfg = config({ AI_PROVIDER: 'http-gateway', AI_EDIT_URL: 'https://edit.example.com/edit', AI_EDIT_ALLOWED_HOSTS: 'edit.example.com', AI_API_KEY: 'gateway-test-secret' });
  const gateway = new HttpImageProvider(cfg, async (url, method, body, headers) => {
    calls++; assert.equal(url.href, cfg.ai.editUrl); assert.equal(method, 'POST');
    assert.equal(headers.Authorization, 'Bearer gateway-test-secret'); assert.equal(headers['Content-Type'], 'image/png');
    assert.equal((await sharp(body!).metadata()).format, 'png'); return { bytes: input, type: 'image/png' };
  });
  await gateway.edit(input); assert.equal(calls, 1);
});

test('safe HTTPS DNS rejection and DNS timeout perform no requests', async t => {
  const dnsMock = t.mock.method(dns, 'lookup', async () => [{ address: '127.0.0.1', family: 4 }] as any);
  const requestMock = t.mock.method(https, 'request', (() => { throw new Error('must not request'); }) as any);
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1']) {
    dnsMock.mock.mockImplementation((async () => [{ address, family: address.includes(':') ? 6 : 4 }]) as any);
    await assert.rejects(safeHttps(new URL('https://provider.example.com/'), 'GET', undefined, {}, 100, 1000), /PROVIDER_ADDRESS/);
  }
  dnsMock.mock.mockImplementation((async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]) as any);
  await assert.rejects(safeHttps(new URL('https://provider.example.com/'), 'GET', undefined, {}, 100, 1000), /PROVIDER_ADDRESS/);
  dnsMock.mock.mockImplementation((() => new Promise(() => {})) as any);
  await assert.rejects(safeHttps(new URL('https://provider.example.com/'), 'GET', undefined, {}, 100, 15), /PROVIDER_TIMEOUT/);
  assert.equal(requestMock.mock.callCount(), 0);
});

test('safe HTTPS pins public DNS, bounds responses, rejects redirects/encoding, and times out', async t => {
  t.mock.method(dns, 'lookup', (async () => [{ address: '8.8.8.8', family: 4 }]) as any);
  let status = 200, headers: Record<string, string> = { 'content-type': 'image/png' }, chunks = [Buffer.from('ok')], hang = false, abort = false;
  let lastRequest: (EventEmitter & { destroyed: boolean; destroy(): void; end(): void }) | undefined;
  const requestMock = t.mock.method(https, 'request', ((_url: URL, options: any, callback: (res: any) => void) => {
    assert.equal(options.servername, 'provider.example.com');
    assert.equal(options.headers['Accept-Encoding'], 'identity');
    options.lookup('provider.example.com', {}, (error: unknown, address: string, family: number) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
    options.lookup('provider.example.com', { all: true }, (error: unknown, addresses: unknown) => { assert.equal(error, null); assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]); });
    const req = Object.assign(new EventEmitter(), {
      destroyed: false,
      destroy() { this.destroyed = true; },
      end() {
        if (hang) return;
        queueMicrotask(() => {
          const response = Object.assign(new PassThrough(), { statusCode: status, headers, complete: false });
          callback(response);
          if (response.destroyed) return;
          if (abort) { response.emit('aborted'); return; }
          for (const chunk of chunks) response.write(chunk);
          response.complete = true; response.end();
        });
      },
    });
    lastRequest = req; return req;
  }) as any);
  const call = (limit = 10, timeout = 1000) => safeHttps(new URL('https://provider.example.com/'), 'GET', undefined, {}, limit, timeout);
  assert.equal((await call()).bytes.toString(), 'ok');
  for (const code of [301, 302, 307, 429, 500]) {
    status = code; const before = requestMock.mock.callCount();
    await assert.rejects(call(), /PROVIDER_REJECTED/);
    assert.equal(requestMock.mock.callCount(), before + 1); assert.equal(lastRequest!.destroyed, true);
  }
  status = 200; headers = { 'content-type': 'image/png', 'content-length': '11' };
  await assert.rejects(call(), /RESPONSE_TOO_LARGE/);
  headers = { 'content-type': 'image/png' }; chunks = [Buffer.alloc(6), Buffer.alloc(6)];
  await assert.rejects(call(), /RESPONSE_TOO_LARGE/);
  headers = { 'content-type': 'image/png', 'content-encoding': 'gzip' }; chunks = [Buffer.from('ok')];
  await assert.rejects(call(), /ENCODING_INVALID/);
  headers = { 'content-type': 'image/png', 'content-length': '3' };
  await assert.rejects(call(), /RESPONSE_INCOMPLETE/);
  headers = { 'content-type': 'image/png' }; abort = true;
  await assert.rejects(call(), /RESPONSE_INCOMPLETE/);
  abort = false; hang = true;
  await assert.rejects(call(10, 15), /PROVIDER_TIMEOUT/);
  assert.equal(lastRequest!.destroyed, true);
});
