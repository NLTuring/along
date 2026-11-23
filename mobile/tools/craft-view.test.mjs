// Turning, zooming and how much of the face the photo covers. No browser or WebGL needed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createOrbit, ZOOM_MIN, ZOOM_MAX } from '../assets/js/craft-orbit.js';
import { MAX_TILT, normalizePose, createCraft, updateCraft, getCraft } from '../assets/js/crafts.js';
import { imagePlacement, fitDimensions, buildReliefMesh, validateMesh } from '../assets/js/craft-geometry.js';
import { textureSize, TEXTURE_SIZE, encodeGLB } from '../assets/js/craft-export.js';

function clock() { let t = 0; return { now: () => t, advance(ms) { t += ms; } }; }
const finger = (id, x, y) => ({ id, x, y });

describe('turning the keepsake', () => {
  it('follows the finger: right turns it right, down tips its top toward you', () => {
    const time = clock(), orbit = createOrbit({ pose: { rotation: 0, tilt: 0 }, now: time.now });
    orbit.setScale(400);
    orbit.down(finger(1, 100, 100));
    time.advance(16); orbit.move(finger(1, 160, 100));
    assert.ok(orbit.state.rotation > 30 && orbit.state.rotation < 60, `${orbit.state.rotation}`);
    time.advance(16); orbit.move(finger(1, 160, 160));
    // Positive tilt is a rotation about +X, which brings the top edge toward a camera on +Z.
    assert.ok(orbit.state.tilt > 15, `${orbit.state.tilt}`);
    time.advance(16); orbit.move(finger(1, 160, 40));
    assert.ok(orbit.state.tilt < -15, 'dragging up tips the top away');
  });
  it('turns freely all the way round but stops tilting short of edge-on', () => {
    const time = clock(), orbit = createOrbit({ pose: { rotation: 0, tilt: 0 }, now: time.now });
    orbit.setScale(300);
    orbit.down(finger(1, 0, 0));
    time.advance(16); orbit.move(finger(1, 1200, 0));
    assert.ok(orbit.state.rotation >= 0 && orbit.state.rotation < 360);
    time.advance(16); orbit.move(finger(1, 1200, 5000));
    assert.equal(orbit.state.tilt, MAX_TILT);
    time.advance(16); orbit.move(finger(1, 1200, -5000));
    assert.equal(orbit.state.tilt, -MAX_TILT);
    assert.deepEqual(normalizePose(0, 1e9), { rotation: 0, tilt: MAX_TILT });
  });
  it('a tiny wobble while pressing does not turn it, so a long press can still finish', () => {
    const time = clock(), orbit = createOrbit({ pose: { rotation: 20, tilt: 5 }, now: time.now });
    orbit.down(finger(1, 50, 50));
    assert.deepEqual(orbit.move(finger(1, 53, 51)), {});
    assert.equal(orbit.state.rotation, 20); assert.equal(orbit.dragging, false);
    assert.equal(orbit.move(finger(1, 70, 50)).started, true);
  });
  it('a flick keeps it spinning, slows down and then settles once', () => {
    const time = clock(), orbit = createOrbit({ pose: { rotation: 0, tilt: 0 }, now: time.now });
    orbit.setScale(400);
    orbit.down(finger(1, 0, 0));
    for (let i = 1; i <= 5; i++) { time.advance(16); orbit.move(finger(1, i * 30, 0)); }
    const released = orbit.state.rotation;
    assert.deepEqual(orbit.up(finger(1, 150, 0)), {}, 'not settled yet: it is still turning');
    assert.equal(orbit.spinning, true);
    let settled = 0, previousStep = Infinity, steps = 0;
    while (orbit.spinning && steps < 1000) {
      const before = orbit.state.rotation, result = orbit.step(16); steps++;
      const moved = ((orbit.state.rotation - before) + 360) % 360;
      assert.ok(moved <= previousStep + 1e-9, 'each frame turns a little less');
      previousStep = moved;
      if (result.settled) settled++;
    }
    assert.equal(settled, 1); assert.ok(steps > 10 && steps < 400, `${steps} frames`);
    assert.ok(((orbit.state.rotation - released) + 360) % 360 > 20, 'it carried on past where the finger let go');
    assert.deepEqual(orbit.step(16), {});
  });
  it('a slow release does not spin, and reduced motion never spins', () => {
    const time = clock(), slow = createOrbit({ pose: { rotation: 0, tilt: 0 }, now: time.now });
    slow.down(finger(1, 0, 0)); time.advance(16); slow.move(finger(1, 60, 0)); time.advance(400);
    assert.deepEqual(slow.up(finger(1, 60, 0)), { settled: true }); assert.equal(slow.spinning, false);
    const calm = createOrbit({ pose: { rotation: 0, tilt: 0 }, now: time.now, reduceMotion: () => true });
    calm.down(finger(1, 0, 0));
    for (let i = 1; i <= 5; i++) { time.advance(16); calm.move(finger(1, i * 40, 0)); }
    assert.deepEqual(calm.up(finger(1, 200, 0)), { settled: true }); assert.equal(calm.spinning, false);
  });
  it('touching a spinning keepsake stops it where it is', () => {
    const time = clock(), orbit = createOrbit({ pose: { rotation: 0, tilt: 0 }, now: time.now });
    orbit.down(finger(1, 0, 0));
    for (let i = 1; i <= 5; i++) { time.advance(16); orbit.move(finger(1, i * 30, 0)); }
    orbit.up(finger(1, 150, 0)); orbit.step(16);
    const at = orbit.state.rotation;
    orbit.down(finger(2, 10, 10));
    assert.equal(orbit.spinning, false); assert.deepEqual(orbit.step(16), {}); assert.equal(orbit.state.rotation, at);
  });
  it('pinching zooms within limits, and the remaining finger carries on turning', () => {
    const time = clock(), orbit = createOrbit({ pose: { rotation: 0, tilt: 0 }, now: time.now });
    orbit.down(finger(1, 100, 100)); orbit.down(finger(2, 200, 100));
    assert.equal(orbit.move(finger(2, 300, 100)).zoomed, true);
    assert.ok(Math.abs(orbit.state.zoom - 2) < 1e-9);
    orbit.move(finger(2, 2000, 100)); assert.equal(orbit.state.zoom, ZOOM_MAX);
    orbit.move(finger(2, 101, 100)); assert.equal(orbit.state.zoom, ZOOM_MIN);
    const rotation = orbit.state.rotation;
    assert.deepEqual(orbit.up(finger(2, 101, 100)), {}, 'lifting one finger of a pinch saves nothing');
    time.advance(16); orbit.move(finger(1, 160, 100));
    assert.notEqual(orbit.state.rotation, rotation);
    assert.equal(orbit.wheel(-500).zoomed, true); assert.ok(orbit.state.zoom > ZOOM_MIN);
    assert.deepEqual(orbit.wheel(NaN), {});
  });
  it('a double tap faces it front on at normal size; two far-apart taps do not', () => {
    const time = clock(), orbit = createOrbit({ pose: { rotation: 120, tilt: 30 }, zoom: 2, now: time.now });
    orbit.down(finger(1, 50, 50)); orbit.up(finger(1, 50, 50));
    time.advance(400);
    orbit.down(finger(1, 52, 50)); assert.deepEqual(orbit.up(finger(1, 52, 50)), {}, 'too slow for a double tap');
    time.advance(150);
    orbit.down(finger(1, 54, 51));
    assert.deepEqual(orbit.up(finger(1, 54, 51)), { reset: true, settled: true });
    assert.deepEqual(orbit.state, { rotation: 0, tilt: 0, zoom: 1 });
    orbit.down(finger(1, 10, 10)); orbit.up(finger(1, 10, 10)); time.advance(100);
    orbit.down(finger(1, 200, 200)); assert.deepEqual(orbit.up(finger(1, 200, 200)), {});
  });
  it('a cancelled drag still saves where it got to; a cancelled tap saves nothing', () => {
    const time = clock(), orbit = createOrbit({ pose: { rotation: 0, tilt: 0 }, now: time.now });
    orbit.down(finger(1, 0, 0)); time.advance(16); orbit.move(finger(1, 80, 0));
    assert.deepEqual(orbit.up(finger(1, 80, 0), { cancelled: true }), { settled: true }); assert.equal(orbit.spinning, false);
    orbit.down(finger(1, 0, 0)); assert.deepEqual(orbit.up(finger(1, 0, 0), { cancelled: true }), {});
    assert.deepEqual(orbit.up(finger(9, 0, 0)), {}, 'an unknown pointer is ignored');
  });
});

describe('a bigger, sharper photo on the face', () => {
  it('fills the face: the photo covers it completely and keeps its proportions', () => {
    for (const [w, h, aspect] of [[1600, 900, 60 / 72], [900, 1600, 60 / 72], [1000, 1000, 1], [3000, 1000, 72 / 60]]) {
      const rect = imagePlacement('rounded', w, h, aspect, 'FILL');
      assert.ok(rect.x <= 1e-12 && rect.y <= 1e-12 && rect.x + rect.w >= 1 - 1e-12 && rect.y + rect.h >= 1 - 1e-12, 'no uncovered border');
      assert.ok(Math.abs(rect.w * aspect / rect.h - w / h) < 1e-9, 'not stretched');
      assert.ok(Math.abs(Math.min(rect.w, rect.h) - 1) < 1e-12, 'only one side overhangs');
    }
    const whole = imagePlacement('rounded', 1600, 900, 60 / 72), filled = imagePlacement('rounded', 1600, 900, 60 / 72, 'FILL');
    assert.ok(filled.w * filled.h > whole.w * whole.h * 3, 'the filled photo is several times larger on the face');
  });
  it('sizes the face to the photo so little is trimmed, within the product limits', () => {
    assert.deepEqual(fitDimensions('MAGNET', 1600, 900), { widthMm: 72, heightMm: 40.5 });
    assert.deepEqual(fitDimensions('MAGNET', 900, 1600), { widthMm: 40.5, heightMm: 72 });
    assert.deepEqual(fitDimensions('KEYCHAIN', 1000, 1000), { widthMm: 64, heightMm: 64 });
    assert.deepEqual(fitDimensions('MAGNET', 4000, 500), { widthMm: 72, heightMm: 40 }, 'a panorama is held at the minimum height');
    assert.deepEqual(fitDimensions('MAGNET', 0, 0), { widthMm: 60, heightMm: 72 });
    const { widthMm, heightMm } = fitDimensions('MAGNET', 1600, 900);
    const rect = imagePlacement('rounded', 1600, 900, widthMm / heightMm, 'FILL');
    assert.ok(Math.abs(rect.w - 1) < 0.02 && Math.abs(rect.h - 1) < 0.02, 'the face and photo have nearly the same shape');
  });
  it('a filled face is still a sealed, printable mesh and texture coordinates cover it', () => {
    for (const shape of ['rounded', 'arch', 'oval', 'scallop']) {
      const mesh = buildReliefMesh({ product: 'MAGNET', shape, photoFit: 'FILL', widthMm: 72, heightMm: 40.5, imageWidth: 1600, imageHeight: 900 });
      assert.ok(validateMesh(mesh).volumeMm3 > 1000);
      assert.equal(mesh.imageRect.w >= 1 && mesh.imageRect.h >= 1, true);
    }
    assert.ok(buildReliefMesh({ imageWidth: 1600, imageHeight: 900 }).imageRect.w < 1, 'without FILL the whole photo stays inside');
  });
  it('the texture has enough pixels for the photo, up to 2048, and never wastes memory on a small one', () => {
    const mesh = (fit) => buildReliefMesh({ product: 'MAGNET', photoFit: fit, widthMm: 72, heightMm: 40.5, imageWidth: 1920, imageHeight: 1080 });
    assert.equal(TEXTURE_SIZE, 2048);
    assert.equal(textureSize({ naturalWidth: 1920, naturalHeight: 1080 }, mesh('FILL')), 2048);
    assert.equal(textureSize({ naturalWidth: 400, naturalHeight: 225 }, mesh('FILL')), 512);
    assert.equal(textureSize({ naturalWidth: 900, naturalHeight: 506 }, mesh('FILL')), 1024);
    assert.equal(textureSize({ naturalWidth: 8000, naturalHeight: 4500 }, mesh('FILL')), 2048, 'capped for phone memory');
  });
  it('GLB carries a JPEG photo texture the server accepts', () => {
    const mesh = buildReliefMesh({ resolution: 24 });
    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 217]);
    const glb = encodeGLB(mesh, jpeg, 'image/jpeg');
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + new DataView(glb.buffer).getUint32(12, true))));
    assert.equal(json.images[0].mimeType, 'image/jpeg');
    assert.throws(() => encodeGLB(mesh, jpeg, 'image/png'), /TEXTURE_INVALID/);
  });
});

describe('saved keepsakes', () => {
  function withStorage(work) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), rows = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)), removeItem: (k) => rows.delete(k) } });
    try { return work(rows); } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
  }
  it('new keepsakes fill the face; older ones keep the whole photo until changed', () => withStorage((rows) => {
    rows.set('instrip.crafts', JSON.stringify([{ id: 'old', email: 'a@test', mediaId: 'p', status: 'DESIGNED' }]));
    assert.equal(getCraft('old').photoFit, 'WHOLE');
    const craft = createCraft({ email: 'a@test', mediaId: 'p' });
    assert.equal(craft.photoFit, 'FILL'); assert.equal(craft.sizedFor, '');
    const version = craft.inputVersion;
    const whole = updateCraft(craft.id, { photoFit: 'WHOLE' });
    assert.equal(whole.photoFit, 'WHOLE'); assert.notEqual(whole.inputVersion, version, 'a new look needs a new model');
    assert.equal(updateCraft(craft.id, { photoFit: 'BOGUS' }).photoFit, 'WHOLE');
    const sized = updateCraft(craft.id, { widthMm: 72, heightMm: 40.5, sizedFor: 'p|MAGNET' });
    assert.equal(sized.sizedFor, 'p|MAGNET'); assert.equal(sized.widthMm, 72);
    assert.equal(updateCraft(craft.id, { sizedFor: 'MANUAL' }).sizedFor, 'MANUAL');
  }));
});

describe('page wiring', () => {
  it('offers zoom buttons and the fill choice, and only a manual size stops automatic sizing', async () => {
    const page = await readFile(new URL('../assets/js/page-craft.js', import.meta.url), 'utf8');
    assert.match(page, /data-zoom="in"/); assert.match(page, /data-zoom="out"/); assert.match(page, /data-fit="FILL"/); assert.match(page, /data-fit="WHOLE"/);
    assert.match(page, /sizedFor: 'MANUAL'/); assert.match(page, /fitDimensions\(/);
    const model = await readFile(new URL('../assets/js/craft-model.js', import.meta.url), 'utf8');
    assert.match(model, /createOrbit\(/); assert.match(model, /getMaxAnisotropy\(\)/); assert.match(model, /'wheel'/);
    assert.match(model, /cancelAnimationFrame\(frame\)/, 'the spin loop is stopped on dispose');
  });
});
