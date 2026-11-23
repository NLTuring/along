// Synthetic fixtures only; no network, real photos, browser, or native export bridge.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Texture, BufferGeometry, BufferAttribute, Mesh, MeshStandardMaterial, Group, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { buildReliefMesh, validateMesh, imagePlacement, maskFromRGBA, MAX_GRID } from '../assets/js/craft-geometry.js';
import { encodeGLB, encodeSTL, downloadArtifact } from '../assets/js/craft-export.js';
import { createHoldController, attachHold, HOLD_MS } from '../assets/js/craft-hold.js';
import { createCraft, getCraft, updateCraft, createCraftJobRunner } from '../assets/js/crafts.js';

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7l8AAAAASUVORK5CYII=', 'base64'));
function personMask() {
  const width = 64, height = 64, data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if ((x - 32) ** 2 + (y - 14) ** 2 < 7 ** 2 || (x >= 22 && x <= 42 && y >= 21 && y <= 46)
      || (y > 46 && y < 60 && ((x >= 23 && x <= 29) || (x >= 35 && x <= 41)))) data[y * width + x] = 255;
  }
  return { width, height, data };
}
function bounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { min[i % 3] = Math.min(min[i % 3], positions[i]); max[i % 3] = Math.max(max[i % 3], positions[i]); }
  return { min, max };
}
function parseGLB(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67); assert.equal(view.getUint32(4, true), 2); assert.equal(view.getUint32(8, true), bytes.length);
  const jsonLength = view.getUint32(12, true); assert.equal(jsonLength % 4, 0); assert.equal(view.getUint32(16, true), 0x4e4f534a);
  const doc = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)));
  const binStart = 28 + jsonLength; assert.equal(view.getUint32(binStart - 4, true), 0x004e4942); assert.equal(view.getUint32(binStart - 8, true), bytes.length - binStart);
  const bin = bytes.slice(binStart);
  function accessor(index) {
    const a = doc.accessors[index], b = doc.bufferViews[a.bufferView], components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const start = b.byteOffset + (a.byteOffset || 0), length = a.count * components * 4;
    assert.ok(start >= 0 && start + length <= bin.length);
    const buffer = bin.slice(start, start + length).buffer;
    return a.componentType === 5126 ? new Float32Array(buffer) : new Uint32Array(buffer);
  }
  return { doc, bin, accessor };
}
function welded(mesh) {
  const points = [], indices = [], index = new Map();
  for (let i = 0; i < mesh.length; i += 3) {
    const point = [mesh[i], mesh[i + 1], mesh[i + 2]], key = point.join(',');
    if (!index.has(key)) { index.set(key, points.length / 3); points.push(...point); }
    indices.push(index.get(key));
  }
  return { positions: new Float32Array(points), indices: new Uint32Array(indices) };
}
function clock() {
  let time = 0, serial = 0; const timers = new Map();
  return {
    now: () => time,
    schedule(fn, ms) { const id = ++serial; timers.set(id, { at: time + ms, fn }); return id; },
    unschedule(id) { timers.delete(id); },
    advance(ms) {
      const until = time + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      time = until;
    },
    get count() { return timers.size; },
  };
}
const pointer = (change = {}) => ({ pointerId: 1, clientX: 10, clientY: 20, isPrimary: true, pointerType: 'touch', button: 0, ...change });
const ready = (change = {}) => ({ id: 'job1', inputVersion: 'v1', sourceMediaId: 'media1', variant: 'ANIME', status: 'READY', ...change });
const tick = () => new Promise((resolve) => setImmediate(resolve));

 describe('real physical geometry and binary files', () => {
  for (const product of ['MAGNET', 'KEYCHAIN']) for (const shape of ['rounded', 'arch', 'oval', 'scallop']) {
    it(`${product}/${shape}: bounded, nonempty, finite, sealed, outward mesh and positive volume`, () => {
      const mesh = buildReliefMesh({ product, shape, mask: personMask(), maskSource: 'MANUAL', imageWidth: 64, imageHeight: 64, resolution: 96 });
      const report = validateMesh(mesh); assert.ok(report.volumeMm3 > 100); assert.ok(report.triangles > 1000 && report.triangles < 42000);
      assert.ok(mesh.personVertices.length > 0); assert.equal(mesh.maskSource, 'MANUAL');
      const b = bounds(mesh.positions); assert.ok(Math.abs(b.max[0] - b.min[0] - mesh.settings.widthMm) < 1.5); assert.ok(Math.abs(b.max[1] - b.min[1] - mesh.settings.heightMm) < 1.5);
      assert.ok(b.max[2] > mesh.settings.baseMm); assert.ok(b.max[2] <= mesh.settings.baseMm + mesh.settings.reliefMm + .00001);
      const person = new Set(mesh.personVertices);
      for (const i of mesh.frontVertices) if (!person.has(i)) assert.ok(Math.abs(mesh.positions[i * 3 + 2] - mesh.settings.baseMm) < 1e-6, 'all background vertices are exactly coplanar');
      for (const i of person) assert.ok(mesh.positions[i * 3 + 2] > mesh.settings.baseMm, 'selected person is in front');
    });
  }
  it('new-craft default, saved near-front and reset poses expose the textured photo with correct UV orientation', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), rows = new Map();
    let draft;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => rows.get(key) || null, setItem: (key, value) => rows.set(key, value) } });
    try { draft = createCraft({ mediaId: 'synthetic-photo', email: 'orientation@example.test' }); }
    finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
    assert.equal(draft.variant, 'REAL');
    const mesh = buildReliefMesh({ ...draft, imageWidth: 400, imageHeight: 300 });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    geometry.addGroup(0, mesh.frontIndexCount, 0);
    geometry.addGroup(mesh.frontIndexCount, mesh.indices.length - mesh.frontIndexCount, 1);
    const object = new Mesh(geometry, [new MeshStandardMaterial(), new MeshStandardMaterial()]);
    object.position.z = -(mesh.settings.baseMm + mesh.settings.reliefMm) / 2;
    const group = new Group(); group.add(object);
    const camera = new PerspectiveCamera(34, 1, 1, 1000);
    camera.position.set(0, 0, Math.max(mesh.settings.widthMm, mesh.settings.heightMm) * 2.8);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const ray = new Raycaster();
    try {
      for (const [rotation, tilt] of [[draft.rotation, draft.tilt], [356.2824180603027, -3.616659545898436], [0, 0]]) {
        group.rotation.set(tilt * Math.PI / 180, rotation * Math.PI / 180, 0); group.updateMatrixWorld(true);
        ray.setFromCamera(new Vector2(0, 0), camera);
        const hit = ray.intersectObject(group)[0];
        assert.equal(hit?.face.materialIndex, 0, `${rotation}/${tilt}: camera must hit the photo, not the rear pocket`);
        assert.ok(hit.uv.x > mesh.imageRect.x && hit.uv.x < mesh.imageRect.x + mesh.imageRect.w);
        assert.ok(hit.uv.y > mesh.imageRect.y && hit.uv.y < mesh.imageRect.y + mesh.imageRect.h);
        assert.ok(new Vector3(0, 0, 1).transformDirection(group.matrixWorld).z > .8);
      }
      group.rotation.set(0, 0, 0); group.updateMatrixWorld(true);
      ray.setFromCamera(new Vector2(0, .2), camera); const top = ray.intersectObject(group)[0];
      ray.setFromCamera(new Vector2(0, -.2), camera); const bottom = ray.intersectObject(group)[0];
      assert.ok(top.uv.y < bottom.uv.y, 'unflipped canvas/GLB texture V=0 is the top of the photo');
      group.rotation.y = Math.PI; group.updateMatrixWorld(true);
      ray.setFromCamera(new Vector2(0, 0), camera); assert.equal(ray.intersectObject(group)[0].face.materialIndex, 1, 'the recess is only visible after deliberate rear rotation');
    } finally { geometry.dispose(); for (const material of object.material) material.dispose(); }
  });
  it('zero, missing and invalid masks are explicitly flat, never a fake protruding person', () => {
    for (const mask of [null, { width: 2, height: 2, data: new Uint8Array(4) }, { width: 9, height: 9, data: new Uint8Array(3) }]) {
      const mesh = buildReliefMesh({ mask, maskSource: 'AI' }); assert.equal(mesh.hasRelief, false); assert.equal(mesh.maskSource, 'NONE'); assert.equal(mesh.personVertices.length, 0);
      for (const i of mesh.frontVertices) assert.ok(Math.abs(mesh.positions[i * 3 + 2] - mesh.settings.baseMm) < 1e-6);
    }
  });
  it('models a real rear pocket with a positive floor, not painted magnet decoration', () => {
    const mesh = buildReliefMesh({ product: 'MAGNET' }), front = new Set(mesh.frontVertices); let recessed = 0, backPlane = 0;
    for (let i = 0; i < mesh.positions.length / 3; i++) if (!front.has(i)) {
      const z = mesh.positions[i * 3 + 2]; if (z > 1) recessed++; if (z === 0) backPlane++;
      assert.ok(z <= 1.200001 && z < mesh.settings.baseMm);
    }
    assert.ok(recessed > 20 && backPlane > 20); assert.equal(mesh.pocket.depth, 1.2);
  });
  it('keychain has a void through the face with actual inner sidewalls', () => {
    const mesh = buildReliefMesh({ product: 'KEYCHAIN', resolution: 96 }); let innerWalls = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const points = [0, 1, 2].map((j) => { const n = mesh.indices[i + j] * 3; return [...mesh.positions.slice(n, n + 3)]; });
      const center = [0, 1, 2].map((a) => points.reduce((sum, p) => sum + p[a], 0) / 3);
      if (i < mesh.frontIndexCount) assert.ok(Math.hypot(center[0], center[1] - mesh.hole.y) > mesh.hole.radius - 1);
      if (new Set(points.map((p) => p[2])).size > 1 && Math.hypot(center[0], center[1] - mesh.hole.y) < mesh.hole.radius + 1) innerWalls++;
    }
    assert.ok(innerWalls > 12);
  });
  it('caps geometry complexity and rejects broken/nonfinite meshes', () => {
    assert.equal(buildReliefMesh({ resolution: 100000 }).resolution, MAX_GRID);
    const mesh = buildReliefMesh({ resolution: 24 });
    assert.throws(() => validateMesh({ ...mesh, indices: mesh.indices.slice(3) }), /MESH_OPEN/);
    const p = mesh.positions.slice(); p[0] = Infinity; assert.throws(() => validateMesh({ ...mesh, positions: p }), /MESH_NONFINITE/);
  });
  it('preserves image aspect in physical dimensions and shares mask/texture placement', () => {
    const rect = imagePlacement('rounded', 1600, 900, 60 / 72);
    assert.ok(Math.abs(rect.w * 60 / (rect.h * 72) - 1600 / 900) < 1e-10);
    assert.ok(rect.x > 0 && rect.y > 0 && rect.x + rect.w < 1 && rect.y + rect.h < 1);
  });
  it('normalizes documented grayscale and alpha masks, refuses coloured RGB masks', () => {
    assert.deepEqual([...maskFromRGBA({ width: 2, height: 1, data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]) }).data], [0, 255]);
    assert.deepEqual([...maskFromRGBA({ width: 2, height: 1, data: new Uint8Array([255, 0, 90, 0, 90, 10, 1, 255]) }).data], [0, 255]);
    assert.throws(() => maskFromRGBA({ width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) }), /MASK_FORMAT/);
  });
  it('binary STL reparses in Three STLLoader at millimetre scale as the same sealed geometry', () => {
    const mesh = buildReliefMesh({ mask: personMask(), maskSource: 'MANUAL' }), bytes = encodeSTL(mesh);
    assert.equal(bytes.length, 84 + mesh.indices.length / 3 * 50); assert.notDeepEqual([...bytes.slice(0, 8)], [...png.slice(0, 8)]);
    const loaded = new STLLoader().parse(bytes.buffer), p = loaded.getAttribute('position').array;
    assert.equal(p.length, mesh.indices.length * 3); const b = bounds(p);
    assert.ok(Math.abs(b.max[0] - b.min[0] - 60) < .001); assert.ok(Math.abs(b.max[1] - b.min[1] - 72) < .001);
    const report = validateMesh(welded(p)); assert.ok(report.volumeMm3 > 1000); loaded.dispose();
  });
  it('GLB reparses indexed triangles in metres with embedded image and no external URI', () => {
    const mesh = buildReliefMesh({ mask: personMask(), maskSource: 'MANUAL' }), bytes = encodeGLB(mesh, png), { doc, bin, accessor } = parseGLB(bytes);
    assert.equal(doc.asset.version, '2.0'); assert.equal(doc.images[0].mimeType, 'image/png'); assert.equal(doc.images[0].uri, undefined); assert.equal(doc.buffers[0].uri, undefined);
    const p = accessor(0), b = bounds(p); assert.ok(Math.abs(b.max[0] - b.min[0] - .06) < 1e-8); assert.ok(Math.abs(b.max[1] - b.min[1] - .072) < 1e-8);
    const indices = new Uint32Array([...accessor(3), ...accessor(4)]); assert.deepEqual(indices, mesh.indices);
    validateMesh({ positions: Float32Array.from(p, (v) => v * 1000), indices });
    const texture = doc.bufferViews[doc.images[0].bufferView], embedded = bin.slice(texture.byteOffset, texture.byteOffset + texture.byteLength); assert.deepEqual(embedded, png);
    const idat = []; for (let offset = 8; offset < embedded.length;) { const size = new DataView(embedded.buffer).getUint32(offset), type = new TextDecoder().decode(embedded.slice(offset + 4, offset + 8)); if (type === 'IDAT') idat.push(embedded.slice(offset + 8, offset + 8 + size)); offset += 12 + size; }
    assert.ok(inflateSync(Buffer.concat(idat)).length > 0, 'embedded PNG has real decodable compressed pixel bytes');
    assert.ok(bytes.length > 100000 && bytes.length < 4 * 1024 * 1024);
    assert.throws(() => encodeGLB(mesh, new Uint8Array(32)), /TEXTURE_INVALID/);
  });
  it('the real Three GLTFLoader reparses both textured primitives and physical position buffers', async () => {
    const mesh = buildReliefMesh({ mask: personMask(), maskSource: 'MANUAL' }), bytes = encodeGLB(mesh, png), loader = new GLTFLoader();
    // Node has no image DOM. The image bytes are independently decoded above; only image upload is substituted.
    const priorSelf = globalThis.self; globalThis.self = globalThis;
    loader.register(() => ({ name: 'ALONG_NODE_IMAGE_ADAPTER', loadTexture: () => Promise.resolve(new Texture()) }));
    try {
      const gltf = await loader.parseAsync(bytes.buffer, ''); const meshes = [];
      gltf.scene.traverse((object) => { if (object.isMesh) meshes.push(object); });
      assert.equal(meshes.length, 2); assert.equal(meshes.reduce((count, object) => count + object.geometry.index.count, 0), mesh.indices.length);
      for (const object of meshes) { assert.ok(object.geometry.attributes.normal.count > 0); const b = bounds(object.geometry.attributes.position.array); assert.ok(Math.abs(b.max[0] - b.min[0] - .06) < 1e-8); object.geometry.dispose(); object.material.dispose(); }
    } finally { if (priorSelf === undefined) delete globalThis.self; else globalThis.self = priorSelf; }
  });
});

describe('five-second hold lifecycle', () => {
  it('fires at 5000ms exactly, once, and resets for a new deliberate hold', () => {
    const timer = clock(), progress = []; let calls = 0;
    const hold = createHoldController({ ...timer, onProgress: (p) => progress.push(p), onComplete: () => calls++ });
    assert.equal(HOLD_MS, 5000); hold.down(pointer()); timer.advance(4999); assert.equal(calls, 0); timer.advance(1); assert.equal(calls, 1); assert.equal(progress.at(-1), 1);
    timer.advance(20000); assert.equal(calls, 1); hold.up(pointer()); hold.down(pointer()); timer.advance(5000); assert.equal(calls, 2); hold.dispose(); assert.equal(timer.count, 0);
  });
  for (const reason of ['move', 'up', 'cancel', 'multi', 'dispose']) it(`cancels on ${reason} without a delayed trigger`, () => {
    const timer = clock(); let calls = 0; const hold = createHoldController({ ...timer, onComplete: () => calls++ });
    hold.down(pointer()); timer.advance(3000);
    if (reason === 'move') hold.move(pointer({ clientX: 30 }));
    if (reason === 'up') hold.up(pointer());
    if (reason === 'cancel') hold.cancel();
    if (reason === 'multi') hold.down(pointer({ pointerId: 2, isPrimary: false }));
    if (reason === 'dispose') hold.dispose();
    timer.advance(6000); assert.equal(calls, 0); assert.equal(timer.count, 0);
  });
  it('does not start on right-click or a nonprimary pointer', () => {
    const timer = clock(); let calls = 0; const hold = createHoldController({ ...timer, onComplete: () => calls++ });
    hold.down(pointer({ pointerType: 'mouse', button: 2 })); timer.advance(6000); hold.reset(); hold.down(pointer({ isPrimary: false })); timer.advance(6000); assert.equal(calls, 0);
  });
  it('DOM adapter cancels visibility/lostcapture/blur and removes every listener on dispose', () => {
    class Target { constructor() { this.events = new Map(); } addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); } removeEventListener(name, fn) { this.events.get(name)?.delete(fn); } emit(name, data = {}) { for (const fn of this.events.get(name) || []) fn(data); } contains(value) { return value === this; } setPointerCapture() {} }
    const originalDocument = globalThis.document, originalWindow = globalThis.window;
    globalThis.document = new Target(); globalThis.window = new Target(); const host = new Target(), timer = clock(); let calls = 0;
    try {
      const hold = attachHold(host, { ...timer, onComplete: () => calls++ });
      for (const reason of ['visibilitychange', 'lostpointercapture', 'blur']) {
        host.emit('pointerdown', pointer()); timer.advance(2000);
        if (reason === 'visibilitychange') { document.hidden = true; document.emit(reason); }
        else (reason === 'blur' ? window : host).emit(reason);
        timer.advance(6000); assert.equal(calls, 0);
      }
      hold.dispose(); for (const target of [host, document, window]) for (const handlers of target.events.values()) assert.equal(handlers.size, 0);
    } finally { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
  });
});

describe('versioned craft state and provider lifecycle', () => {
  it('preserves old IDs and DESIGNED semantics but never calls legacy artwork a generated model', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); const data = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) } });
    try {
      localStorage.setItem('instrip.crafts', JSON.stringify([{ id: 'legacy1', email: 'person@example.test', mediaId: 'old-photo', status: 'DESIGNED' }]));
      const old = getCraft('legacy1'); assert.equal(old.id, 'legacy1'); assert.equal(old.previewStatus, 'DESIGNED'); assert.equal(old.modelStatus, 'NOT_GENERATED'); assert.equal(old.variant, 'REAL');
      let craft = createCraft({ email: 'person@example.test', mediaId: 'source1' }); const version = craft.inputVersion;
      craft = updateCraft(craft.id, { generatedVersion: version }); assert.equal(craft.modelStatus, 'GENERATED');
      craft = updateCraft(craft.id, { variant: 'ANIME' }); assert.notEqual(craft.inputVersion, version); assert.equal(craft.mediaId, 'source1'); assert.equal(craft.modelStatus, 'NOT_GENERATED');
      assert.equal(updateCraft(craft.id, { generatedVersion: version }).modelStatus, 'NOT_GENERATED');
      craft = updateCraft(craft.id, { frozenVersion: craft.inputVersion, frozenModel: { id: 'private-model', version: 1 } }); assert.equal(craft.frozenModel.id, 'private-model');
      craft = updateCraft(craft.id, { widthMm: 70 }); assert.equal(craft.frozenModel, undefined);
      craft = updateCraft(craft.id, { mediaId: 'source2' }); assert.equal(craft.variant, 'REAL'); assert.equal(craft.maskSource, 'NONE');
    } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
  });
  it('makes raising the figure an explicit, versioned choice that is off for new crafts', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); const data = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) } });
    try {
      localStorage.setItem('instrip.crafts', JSON.stringify([{ id: 'oldRelief', email: 'person@example.test', mediaId: 'p', maskSource: 'MANUAL' }, { id: 'oldFlat', email: 'person@example.test', mediaId: 'p' }]));
      assert.equal(getCraft('oldRelief').raised, true); assert.equal(getCraft('oldFlat').raised, false);
      let craft = createCraft({ email: 'person@example.test', mediaId: 'source1' }); assert.equal(craft.raised, false);
      const version = craft.inputVersion;
      craft = updateCraft(craft.id, { raised: true }); assert.equal(craft.raised, true); assert.notEqual(craft.inputVersion, version);
      const raisedVersion = craft.inputVersion;
      craft = updateCraft(craft.id, { raised: true }); assert.equal(craft.inputVersion, raisedVersion);
      craft = updateCraft(craft.id, { raised: 'yes' }); assert.equal(craft.raised, true);
      craft = updateCraft(craft.id, { aiJob: { id: 'j1', inputVersion: craft.inputVersion, sourceMediaId: 'anime-media', variant: 'REAL', target: 'ANIME' } });
      assert.equal(craft.aiJob.target, 'ANIME');
      craft = updateCraft(craft.id, { aiJob: { id: 'j2', inputVersion: craft.inputVersion, sourceMediaId: 's', variant: 'ANIME', target: 'bogus' } });
      assert.equal(craft.aiJob.target, 'ANIME');
    } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
  });
  it('requires explicit consent before any request', async () => {
    let requests = 0; const runner = createCraftJobRunner({ api: async () => { requests++; }, currentVersion: () => 'v1' });
    await assert.rejects(runner.start({ mediaId: 'media1', inputVersion: 'v1', variant: 'ANIME', consent: false }), /CONSENT_REQUIRED/); assert.equal(requests, 0); runner.dispose();
  });
  it('polls a genuine provider job and accepts only the current aligned variant contract', async () => {
    let requests = 0, accepted = 0; const states = [];
    const runner = createCraftJobRunner({ api: async (path, opts) => { requests++; if (path === '/craft-jobs') { assert.equal(opts.body.consent, true); assert.ok(opts.body.idempotencyKey); return { job: ready({ status: 'PROCESSING' }) }; } return { job: ready() }; }, currentVersion: () => 'v1', delay: async () => {}, onState: (job) => states.push(job.status), onReady: async (job, current) => { assert.equal(current(), true); accepted++; } });
    assert.equal(await runner.start({ mediaId: 'media1', inputVersion: 'v1', variant: 'ANIME', consent: true }), true); assert.equal(accepted, 1); assert.equal(requests, 2); assert.equal(runner.busy, false); assert.ok(states.includes('PROCESSING')); runner.dispose();
  });
  it('cancels a late-created job and never installs its result after cancellation', async () => {
    let resolveCreate, accepted = 0; const calls = [];
    const runner = createCraftJobRunner({ api: async (path) => { calls.push(path); if (path === '/craft-jobs') return new Promise((resolve) => { resolveCreate = resolve; }); return { job: ready({ status: 'CANCELLED' }) }; }, currentVersion: () => 'v1', onReady: async () => accepted++ });
    const result = runner.start({ mediaId: 'media1', inputVersion: 'v1', variant: 'ANIME', consent: true }); await tick(); runner.cancel(); resolveCreate({ job: ready() }); assert.equal(await result, false); await tick(); assert.equal(accepted, 0); assert.ok(calls.includes('/craft-jobs/job1/cancel')); assert.equal(runner.busy, false); runner.dispose();
  });
  it('discards stale input versions and releases busy state even if UI cancellation was omitted', async () => {
    let resolveCreate, version = 'v1', accepted = 0;
    const runner = createCraftJobRunner({ api: async (path) => path === '/craft-jobs' ? new Promise((resolve) => { resolveCreate = resolve; }) : { job: ready({ status: 'CANCELLED' }) }, currentVersion: () => version, onReady: async () => accepted++ });
    const result = runner.start({ mediaId: 'media1', inputVersion: 'v1', variant: 'ANIME', consent: true }); await tick(); version = 'v2'; resolveCreate({ job: ready() }); assert.equal(await result, false); assert.equal(accepted, 0); assert.equal(runner.busy, false); runner.dispose();
  });
  it('rejects wrong source/variant/version and never fabricates success for provider failure', async () => {
    for (const mismatch of [{ variant: 'REAL' }, { sourceMediaId: 'wrong' }, { inputVersion: 'old' }, { status: 'FAILED', error: 'PROVIDER_UNAVAILABLE' }]) {
      let accepted = 0; const states = [];
      const runner = createCraftJobRunner({ api: async () => ({ job: ready(mismatch) }), currentVersion: () => 'v1', onState: (job) => states.push(job), onReady: async () => accepted++ });
      assert.equal(await runner.start({ mediaId: 'media1', inputVersion: 'v1', variant: 'ANIME', consent: true }), false); assert.equal(accepted, 0); assert.equal(states.at(-1).status, 'FAILED'); runner.dispose();
    }
  });
  it('does not accept a provider result after dispose during polling', async () => {
    let resolveDelay, accepted = 0;
    const runner = createCraftJobRunner({ api: async (path) => ({ job: ready({ status: path === '/craft-jobs' ? 'PROCESSING' : 'READY' }) }), currentVersion: () => 'v1', delay: () => new Promise((resolve) => { resolveDelay = resolve; }), onReady: async () => accepted++ });
    const promise = runner.start({ mediaId: 'media1', inputVersion: 'v1', variant: 'ANIME', consent: true }); await tick(); runner.dispose(); resolveDelay(); assert.equal(await promise, false); assert.equal(accepted, 0);
  });
});

describe('integration safety and bilingual UI', () => {
  it('uses actual GLB/STL downloads and no native exportImage call', async () => {
    const source = await readFile(new URL('../assets/js/page-craft.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.exportImage\s*\(/); assert.match(source, /upload\('\/craft-models'/); assert.match(source, /go\(`make-order\//); assert.match(source, /source\?\.blob \|\| await rasterBlob/);
    assert.doesNotMatch(source, /form\.append\([^\n]*originalBlob/);
    const restore = source.slice(source.indexOf('async function restoreOriginal'), source.indexOf('async function requestAI')); assert.doesNotMatch(restore, /runner\.start|upload\(|api\(/);
    const show = source.slice(source.indexOf('async function showStyle'), source.indexOf('async function restoreOriginal')); assert.doesNotMatch(show, /runner\.start|upload\(|api\(/);
  });
  it('swaps styles on the one model stage and keeps painting behind the raise switch', async () => {
    const source = await readFile(new URL('../assets/js/page-craft.js', import.meta.url), 'utf8');
    assert.equal(source.match(/data-stage/g).length, 2, 'one model stage, reused for both styles');
    assert.equal(source.match(/createCraftModel\(/g).length, 1);
    // The brush only exists inside the raise panel and the model ignores masks while raising is off.
    assert.match(source, /data-raise[\s\S]*data-editor[\s\S]*data-mask/);
    assert.match(source, /craft\.raised \? record\?\.mask \|\| null : null/);
    assert.match(source, /if \(!craft\.raised \|\| !image\) \{ if \(editor && !review\.pending\) closeEditor\(\); return; \}/);
    // An anime result is the picture alone; it is shown in place and never opens a person review by itself.
    const ready = source.slice(source.indexOf('async onReady'), source.indexOf('// Person localization'));
    assert.match(ready, /image = outputImage; await rebuild\(\)/); assert.doesNotMatch(ready, /openEditor|review\.stage/);
    assert.doesNotMatch(source, /data-manual|data-refine|data-edit-note|data-hold-note/);
    assert.equal(typeof downloadArtifact, 'function');
  });
  it('new Chinese and English dictionaries have the same nonempty keys and interpolation placeholders', async () => {
    const [en, zh] = await Promise.all(['en', 'zh'].map(async (locale) => JSON.parse(await readFile(new URL(`../assets/messages/craft-online.${locale}.json`, import.meta.url), 'utf8'))));
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
    for (const key of Object.keys(en)) { assert.ok(en[key].trim() && zh[key].trim()); assert.deepEqual([...en[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), [...zh[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), key); }
    const sources = await Promise.all(['page-craft.js', 'page-crafts.js'].map((name) => readFile(new URL(`../assets/js/${name}`, import.meta.url), 'utf8')));
    for (const source of sources) for (const match of source.matchAll(/['"](craft3d\.[\w.]+)['"]/g)) assert.ok(en[match[1]], match[1]);
  });
});
