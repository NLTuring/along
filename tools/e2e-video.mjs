// Local-only video upload/transcode/read-permission smoke test with a generated clip.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const origin = 'http://localhost:4175';
const run = Date.now().toString(36), email = `video-qa-${run}@example.test`;
let cookie = '', csrf = '';
async function call(path, options = {}) {
  const response = await fetch(origin + '/api' + path, { method: options.method || 'GET', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(options.json ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, body: options.json ? JSON.stringify(options.json) : options.body });
  const cookies = response.headers.getSetCookie(); if (cookies.length) cookie = cookies.map(c => c.split(';')[0]).join('; ');
  assert.equal(response.status, options.status || 200, path + ': ' + response.status);
  if (!response.headers.get('content-type')?.includes('json')) return new Uint8Array(await response.arrayBuffer());
  const result = await response.json(); if (result.csrfToken) csrf = result.csrfToken; return result;
}
assert.equal((await call('/config')).mode, 'development');
const otp = await call('/auth/otp', { method: 'POST', json: { email } });
await call('/auth/verify', { method: 'POST', json: { email, code: otp.code } });
const dir = await mkdtemp(join(tmpdir(), 'along-synthetic-video-'));
const file = join(dir, 'synthetic.mp4');
await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', file], { timeout: 15000 });
const form = new FormData(); form.append('purpose', 'COMMUNITY'); form.append('consent', 'true'); form.append('file', new Blob([await readFile(file)], { type: 'video/mp4' }), 'synthetic.mp4');
let { media } = await call('/media', { method: 'POST', body: form });
assert.equal(media.status, 'PROCESSING');
const until = Date.now() + 45000;
while (media.status === 'PROCESSING' && Date.now() < until) {
  await new Promise(resolve => setTimeout(resolve, 300));
  ({ media } = await call(`/media/${media.id}`));
}
assert.equal(media.status, 'READY', 'FFmpeg must really finish before READY');
assert.equal(media.kind, 'VIDEO'); assert.ok(media.posterUrl); assert.ok(media.durationSeconds > 0 && media.durationSeconds <= 3);
const range = await call(`/media/${media.id}/file`, { headers: { Range: 'bytes=0-31' }, status: 206 }); assert.equal(range.length, 32);
const poster = await call(`/media/${media.id}/poster`); assert.equal(poster[0], 255); assert.equal(poster[1], 216);
const { post } = await call('/posts', { method: 'POST', json: { title: '合成视频转码验收', body: '两秒测试图，仅用于本地验收。', city: '上海', tags: ['video-test'], poiId: null, mediaIds: [media.id], status: 'PENDING' } });
const privatePost = await call(`/posts/${post.id}`); assert.equal(privatePost.post.media[0].kind, 'VIDEO');
console.log(JSON.stringify({ ok: true, generatedClip: file, email, mediaId: media.id, postId: post.id, durationSeconds: media.durationSeconds, rangeBytes: range.length, posterBytes: poster.length, status: media.status }, null, 2));
