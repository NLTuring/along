// 小游's wardrobe: outfit rules, anchors for any model, and the .glb upload check.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeOutfit, defaultOutfit, randomOutfit, isDefaultOutfit, checkGlb, clampSize, SLOTS, SLOT_NAMES, MAX_GLB } from '../assets/js/avatar-store.js';
import { anchorsFromBox, XIAOYOU_PARTS } from '../assets/js/avatar-stage.js';
import { parseCommand } from '../assets/js/assistant-commands.js';

globalThis.window ??= globalThis;
const { parseHash } = await import('../assets/js/router.js');
const read = (p) => readFile(new URL(p, import.meta.url));

// A minimal glTF 2.0 binary: header, a JSON chunk padded to 4 bytes, optionally a BIN chunk.
function glb(json, { bin = 0, version = 2, lengthDelta = 0 } = {}) {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = new TextEncoder().encode(text), binLen = bin ? 8 + bin : 0;
  const total = 20 + body.length + binLen, out = new Uint8Array(total), view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, version, true); view.setUint32(8, total + lengthDelta, true);
  view.setUint32(12, body.length, true); view.setUint32(16, 0x4e4f534a, true); out.set(body, 20);
  if (bin) { view.setUint32(20 + body.length, bin, true); view.setUint32(24 + body.length, 0x004e4942, true); }
  return out;
}
const MODEL = { asset: { version: '2.0' }, meshes: [{ primitives: [] }], buffers: [{ byteLength: 8 }] };

describe('outfits', () => {
  it('starts as 小游 in its own clothes, and a custom model with nothing on', () => {
    const d = defaultOutfit('xiaoyou');
    assert.deepEqual([d.hat.item, d.neck.item, d.back.item, d.face.item, d.body], ['original', 'original', 'original', 'none', 'original']);
    const c = defaultOutfit('custom');
    for (const slot of SLOT_NAMES) assert.equal(c[slot].item, 'none');
    assert.ok(isDefaultOutfit({}, 'xiaoyou'));
  });
  it('keeps known items and colours, and drops anything else', () => {
    const o = normalizeOutfit({ hat: { item: 'beret', color: 'sage' }, neck: { item: 'cape', color: 'neon' }, face: { item: 'shades', color: '#ff00ff' }, body: 'peach', extra: 1 });
    assert.deepEqual(o.hat, { item: 'beret', color: 'sage' });
    assert.deepEqual(o.neck, { item: 'original', color: '' });
    assert.deepEqual(o.face, { item: 'shades', color: SLOTS.face.shades });
    assert.equal(o.body, 'peach'); assert.equal('extra' in o, false);
    assert.deepEqual(normalizeOutfit(null), defaultOutfit());
    assert.deepEqual(normalizeOutfit('junk'), defaultOutfit());
  });
  it('has no originals and no body tint on a custom model', () => {
    const o = normalizeOutfit({ hat: { item: 'original' }, body: 'peach', back: { item: 'balloon', color: 'sea' } }, 'custom');
    assert.equal(o.hat.item, 'none'); assert.equal(o.body, 'original'); assert.deepEqual(o.back, { item: 'balloon', color: 'sea' });
  });
  it('lets the originals be tinted, and items with nothing on have no colour', () => {
    assert.deepEqual(normalizeOutfit({ hat: { item: 'original', color: 'sea' } }).hat, { item: 'original', color: 'sea' });
    assert.deepEqual(normalizeOutfit({ hat: { item: 'none', color: 'sea' } }).hat, { item: 'none', color: '' });
  });
  it('random outfits are always valid', () => {
    let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) for (const kind of ['xiaoyou', 'custom']) {
      const o = randomOutfit(kind, rand);
      assert.deepEqual(normalizeOutfit(o, kind), o);
    }
  });
  it('clamps the size slider', () => {
    assert.equal(clampSize(9), 2.5); assert.equal(clampSize(0), 0.4); assert.equal(clampSize('x'), 1); assert.equal(clampSize(1.234), 1.23);
  });
});

describe('anchors from a bounding box', () => {
  const box = { min: [-0.3, 0, -0.2], max: [0.3, 1.4, 0.2] };
  it('puts the head on top, the neck at 78%, the face in front and the bag behind', () => {
    const a = anchorsFromBox(box);
    assert.ok(a.head.p[1] < 1.4 && a.head.p[1] > 1.2, 'head near the top');
    assert.ok(Math.abs(a.neck.p[1] - 1.4 * 0.78) < 1e-9);
    assert.ok(a.face.p[2] > 0 && a.face.p[2] <= 0.2, 'face in front, on the surface');
    assert.ok(a.back.p[2] < 0 && a.back.p[2] >= -0.2, 'bag behind');
    assert.equal(a.feet.p[1], 0);
    for (const k of Object.keys(a)) assert.ok(a[k].r > 0, k);
  });
  it('follows an off-centre box and scales the clothes, not where they hang', () => {
    const moved = anchorsFromBox({ min: [1, 0, 2], max: [2, 2, 3] }), big = anchorsFromBox(box, 2), base = anchorsFromBox(box);
    assert.equal(moved.neck.p[0], 1.5); assert.equal(moved.neck.p[2], 2.5);
    assert.ok(Math.abs(big.neck.r - base.neck.r * 2) < 1e-9);
    assert.deepEqual(big.neck.p, base.neck.p);
  });
  it('survives a flat or empty box', () => {
    const a = anchorsFromBox({ min: [0, 0, 0], max: [0, 0, 0] });
    for (const v of Object.values(a)) for (const n of [...v.p, v.r]) assert.ok(Number.isFinite(n));
  });
  it('knows which of 小游’s own parts each slot replaces', () => {
    assert.deepEqual(XIAOYOU_PARTS.hat, ['Hat']); assert.ok(XIAOYOU_PARTS.neck.includes('Scarf')); assert.deepEqual(XIAOYOU_PARTS.back, ['Bag']);
  });
});

describe('.glb upload check', () => {
  it('accepts a self-contained glTF 2.0 binary, like the bundled 小游', async () => {
    assert.deepEqual(checkGlb(glb(MODEL, { bin: 8 }), 'me.GLB'), { ok: true });
    assert.deepEqual(checkGlb(new Uint8Array(await read('../assets/models/xiaoyou.glb')), 'xiaoyou.glb'), { ok: true });
  });
  it('refuses other files, other versions, wrong lengths and big files', () => {
    assert.equal(checkGlb(glb(MODEL, { bin: 8 }), 'me.gltf').code, 'type');
    assert.equal(checkGlb(new Uint8Array(10), 'a.glb').code, 'format');
    const bad = glb(MODEL, { bin: 8 }); bad[0] = 0; assert.equal(checkGlb(bad, 'a.glb').code, 'format');
    assert.equal(checkGlb(glb(MODEL, { bin: 8, version: 1 }), 'a.glb').code, 'version');
    assert.equal(checkGlb(glb(MODEL, { bin: 8, lengthDelta: 4 }), 'a.glb').code, 'format');
    assert.equal(checkGlb(glb({ ...MODEL, asset: { version: '1.0' } }, { bin: 8 }), 'a.glb').code, 'version');
    assert.equal(checkGlb({ byteLength: MAX_GLB + 1 }, 'a.glb').code, 'format');
    assert.equal(checkGlb(new Uint8Array(MAX_GLB + 1), 'a.glb').code, 'size');
  });
  it('refuses models that point at other files or the network', () => {
    assert.equal(checkGlb(glb({ ...MODEL, buffers: [{ uri: 'scene.bin', byteLength: 8 }] }), 'a.glb').code, 'external');
    assert.equal(checkGlb(glb({ ...MODEL, images: [{ uri: 'https://example.com/t.png' }] }, { bin: 8 }), 'a.glb').code, 'external');
    assert.deepEqual(checkGlb(glb({ ...MODEL, images: [{ uri: 'data:image/png;base64,AA==' }] }, { bin: 8 }), 'a.glb'), { ok: true });
    assert.equal(checkGlb(glb(MODEL), 'a.glb').code, 'format', 'buffer 0 with no BIN chunk');
    assert.equal(checkGlb(glb({ ...MODEL, meshes: [] }, { bin: 8 }), 'a.glb').code, 'empty');
  });
});

describe('wardrobe wiring', () => {
  it('has its own page and 小游 opens it', () => {
    assert.deepEqual(parseHash('#/avatar'), { name: 'avatar', param: null, tab: 'you', nav: false, key: 'avatar' });
    for (const text of ['换装', '给小游换衣服', '换形象', 'outfit', 'avatar']) assert.equal(parseCommand(text)?.path, 'avatar', text);
    for (const text of ['文字生成3d', '视频生成3d']) assert.equal(parseCommand(text)?.route, 'clay-new', text);
  });
  it('is linked from You and the chat, and the button steps aside on the page', async () => {
    const [you, chat, app] = await Promise.all(['../assets/js/page-you.js', '../assets/js/assistant.js', '../assets/js/app.js'].map((p) => read(p).then(String)));
    assert.match(you, /data-you-route="avatar"/);
    assert.match(chat, /data-xy-dress/); assert.match(chat, /HIDDEN_ON = new Set\([^)]*'avatar'/);
    assert.match(app, /avatar: renderAvatar/);
  });
});
