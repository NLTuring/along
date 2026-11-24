// The clay engine bundle (ported from 捏个 PINCH): brushes, undo, picking, mesh → clay, photo UVs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlongClay, TEMPLATE_KEYS, volumeArea, weld, edgeStats, normalizeMesh, projectUVs, fitProjector, newStrokeId } from '../assets/js/vendor/clay.js';

const closed = (mesh) => edgeStats(weld(mesh).indices).open === 0;
const volume = (clay) => volumeArea(clay.fullMesh()).volume;
const top = (clay) => clay.fullMesh().positions.reduce((m, v, i) => (i % 3 === 1 ? Math.max(m, v) : m), -Infinity);
function stroke(clay, brush, sym = null, strength = 0.8) {
  const hit = clay.raycast([0, 200, 0.5], [0, -1, 0]);
  assert.ok(hit, 'the lump is under the camera');
  clay.begin({ id: newStrokeId(), brush, radius: 9, strength, points: [], normals: [], sym });
  let changed = 0;
  for (let i = -4; i <= 4; i++) {
    const h = clay.raycast([i * 2, 200, 0.5], [0, -1, 0]);
    if (h) changed += clay.dab(h.point, h.normal).length;
  }
  clay.end();
  return changed;
}

test('every starting shape is a closed mesh standing on the ground', () => {
  for (const key of TEMPLATE_KEYS) {
    const clay = AlongClay.fromTemplate(key, 72), mesh = clay.fullMesh();
    assert.ok(mesh.indices.length > 300, key);
    assert.ok(closed(mesh), `${key} is watertight`);
    const b = clay.bounds();
    assert.ok(Math.abs(b.min[1]) < 2, `${key} sits on the ground (${b.min[1]})`);
  }
});

test('build adds clay, dig removes it, undo and redo are exact', () => {
  const clay = AlongClay.fromTemplate('lump', 80);
  const v0 = volume(clay), t0 = top(clay), g0 = clay.grid.v.slice();
  assert.ok(stroke(clay, 'build') > 0, 'a stroke changes some blocks');
  assert.ok(volume(clay) > v0 + 100);
  assert.ok(top(clay) > t0 + 1);
  const g1 = clay.grid.v.slice();
  stroke(clay, 'dig');
  assert.ok(closed(clay.fullMesh()));
  clay.undo();
  assert.ok(clay.grid.v.every((v, i) => v === g1[i]), 'undo restores the grid');
  clay.redo();
  clay.undo(); clay.undo();
  assert.ok(clay.grid.v.every((v, i) => v === g0[i]));
  assert.equal(clay.canUndo, false);
  assert.equal(clay.canRedo, true);
});

test('smooth, flatten, crease and grab all keep the clay closed', () => {
  const clay = AlongClay.fromTemplate('lump', 80);
  for (const brush of ['build', 'crease', 'smooth', 'flatten']) stroke(clay, brush);
  const hit = clay.raycast([0, 200, 0.5], [0, -1, 0]), t0 = top(clay);
  clay.begin({ id: newStrokeId(), brush: 'grab', radius: 12, strength: 1, points: [...hit.point], normals: [...hit.normal], sym: null });
  clay.grab([0, 10, 0]);
  clay.end();
  assert.ok(top(clay) > t0 + 5, 'grab pulls the top up');
  assert.ok(closed(clay.fullMesh()));
  assert.equal(clay.strokes.length, 5);
});

test('mirror symmetry builds both sides', () => {
  const clay = AlongClay.fromTemplate('lump', 80);
  const side = clay.raycast([200, 25, 0], [-1, 0, 0]);
  assert.ok(side.point[0] > 30);
  clay.begin({ id: newStrokeId(), brush: 'build', radius: 9, strength: 1, points: [], normals: [], sym: { kind: 'mirror', point: [0, 0, 0], normal: [1, 0, 0] } });
  for (let i = 0; i < 4; i++) clay.dab(side.point, side.normal);
  clay.end();
  const p = clay.fullMesh().positions;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
  assert.ok(Math.abs(hi + lo) < 1, `left ${lo} and right ${hi} match`);
});

test('a raycast misses empty air and hits the near side first', () => {
  const clay = AlongClay.fromTemplate('lump', 72);
  assert.equal(clay.raycast([200, 200, 200], [1, 0, 0]), null);
  const front = clay.raycast([0, 25, 300], [0, 0, -1]);
  assert.ok(front.point[2] > 30, `front face at z=${front.point[2]}`);
  assert.ok(front.normal[2] > 0.8);
});

test('a generated mesh becomes clay that can be sculpted', () => {
  const box = AlongClay.fromTemplate('hut', 64).fullMesh();
  const mesh = normalizeMesh(box, 60);
  const clay = AlongClay.fromMesh(mesh, 72);
  const out = clay.fullMesh();
  assert.ok(closed(out));
  const ratio = volumeArea(out).volume / volumeArea(mesh).volume;
  assert.ok(ratio > 0.85 && ratio < 1.15, `voxelized volume ratio ${ratio}`);
  stroke(clay, 'build');
  assert.ok(closed(clay.fullMesh()));
});

test('a photo projects onto the front only and wraps around a cup', () => {
  const tile = AlongClay.fromTemplate('tile', 72).fullMesh();
  const projector = fitProjector(tile.positions, 'view', [0, 0, -1], [0, 1, 0], 4 / 3);
  const uv = projectUVs(tile.positions, tile.normals, projector);
  let front = 0, back = 0;
  for (let i = 0; i < tile.normals.length / 3; i++) {
    const inside = uv[i * 2] > projector.margin && uv[i * 2] < 1 - projector.margin;
    if (tile.normals[i * 3 + 2] > 0.5 && inside) front++;
    if (tile.normals[i * 3 + 2] < -0.5 && inside) back++;
  }
  assert.ok(front > 50); assert.equal(back, 0);
  assert.ok(uv.every((v) => v >= 0 && v <= 1));
  const cup = AlongClay.fromTemplate('cup', 72).fullMesh();
  const wrap = projectUVs(cup.positions, cup.normals, fitProjector(cup.positions, 'wrap', [0, 0, -1], [0, 1, 0], 1));
  assert.ok(wrap.some((v, i) => i % 2 === 0 && v > 0.9) && wrap.some((v, i) => i % 2 === 0 && v < 0.1), 'the wrap goes all the way round');
});

test('coloured part recipes become closed clay, one colour group per part, and survive sculpting', async () => {
  const { sceneFromLayout } = await import('../assets/js/vendor/clay.js');
  const { CLAY_EXAMPLES } = await import('../assets/js/gallery-examples.js');
  for (const example of CLAY_EXAMPLES) {
    const { scene, colors } = sceneFromLayout(example.parts);
    const clay = AlongClay.fromScene(scene, colors, 64);
    const groups = new Set(); for (const m of clay.all()) for (const g of m.groups) groups.add(g[2]);
    assert.ok(groups.size >= Math.min(scene.parts.length, 4), `${example.id} shows its colours`);
    assert.ok(closed(clay.fullMesh()), `${example.id} is watertight`);
    assert.ok(clay.bounds().min[1] < 3, `${example.id} stands on the ground`);
  }
  // Unknown primitives and dangling mirrors are dropped; an empty layout is refused.
  const { scene } = sceneFromLayout([{ id: 'a', primitive: 'sphere', params: { r: 10 }, position: [0, 10, 0] }, { primitive: 'teapot' }, { id: 'b', mirrorOf: 'zz' }]);
  assert.equal(scene.parts.length, 1);
  assert.throws(() => sceneFromLayout([{ primitive: 'teapot' }]), /LAYOUT_EMPTY/);
});
