// Covers for coloured clay recipes: build the piece with the clay engine and photograph it once
// on a warm paper backdrop. Shared by the gallery wall and the work page; cached per session.
import { AlongClay, sceneFromLayout } from './vendor/clay.js';

const cache = new Map();
let renderer = null, THREE = null;
async function setup() {
  if (renderer) return renderer;
  THREE = await import('./vendor/three.js');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}
async function render(parts, size) {
  const r = await setup();
  const { scene: layout, colors } = sceneFromLayout(parts);
  const clay = AlongClay.fromScene(layout, colors, 72);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3e9d8');
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a66, 1.7));
  const key = new THREE.DirectionalLight(0xffefd6, 2.6); key.position.set(-120, 200, 160); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdbe6f2, 0.9); rim.position.set(140, 80, -160); scene.add(rim);
  const materials = colors.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.6, metalness: 0 }));
  const geometries = [];
  for (const m of clay.all()) {
    if (m.removed || !m.idx?.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    for (const [start, count, part] of m.groups) g.addGroup(start, count, Math.min(Math.max(part, 0), materials.length - 1));
    geometries.push(g); scene.add(new THREE.Mesh(g, materials));
  }
  const plate = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0xd8c3a1, roughness: 1 }));
  const b = clay.bounds();
  const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  plate.rotation.x = -Math.PI / 2; plate.position.y = -0.4; plate.scale.setScalar(Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 0.7); scene.add(plate);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 4000);
  const cy = (b.min[1] + b.max[1]) / 2, d = span * 2.35;
  camera.position.set(-d * 0.42, cy + d * 0.38, d * 0.82); camera.lookAt(0, cy, 0);
  r.setSize(size, size, false);
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/jpeg', 0.86);
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  plate.geometry.dispose(); plate.material.dispose();
  return url;
}
let queue = Promise.resolve();
/** Data URL of the piece, or '' if WebGL is unavailable. Renders one at a time. */
export function clayCover(id, parts, size = 480) {
  if (!cache.has(id)) {
    const job = queue.then(() => render(parts, size)).catch(() => '');
    queue = job;
    cache.set(id, job);
  }
  return cache.get(id);
}
