// 小游 in 3D: a three.js view of the assistant (or the user's own .glb) on a soft round plate,
// wearing the wardrobe in avatar-store.js. Clothes are small three.js shapes hung on anchors:
// 小游's are known from its node layout; any other model gets them from its bounding box.
// Drag to turn; it bobs gently when idle (not with reduced motion). WebGL loss is reported,
// like clay-stage.js, so the page can show a note and keep working.
import { colorHex, BODY_TINTS, normalizeOutfit, clampSize } from './avatar-store.js';
import { facesPlusX } from './model-stage.js';

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const XIAOYOU_URL = new URL('../models/xiaoyou.glb', import.meta.url).href;
export const TARGET_HEIGHT = 1.4; // metres: other models are scaled to 小游's height
const CREAM = '#F2E6CF', INK = '#2B2620';

// 小游's anchors, read from its node layout (metres, +Y up, facing +Z). r is the size the clothes are built to.
export const XIAOYOU_ANCHORS = {
  head: { p: [0, 1.24, 0], r: 0.42 }, neck: { p: [0, 0.72, 0], r: 0.62 }, face: { p: [0, 1.0, 0.47], r: 0.36 },
  back: { p: [0, 0.74, -0.5], r: 0.55 }, chest: { p: [0, 0.5, 0.52], r: 0.5 }, feet: { p: [0, 0, 0], r: 0.6 },
};
// The original clothes on 小游, hidden when another item takes their slot.
export const XIAOYOU_PARTS = { hat: ['Hat'], neck: ['Scarf', 'Knot', 'Tails'], back: ['Bag'] };
const XIAOYOU_TINTS = { hat: ['Hat', 'Brim'], neck: ['Scarf', 'ScarfBack'], back: ['Bag', 'BagFlap'] };

/**
 * Where clothes go on a model we know nothing about, from its box { min:[x,y,z], max:[x,y,z] }
 * (already standing on y=min, facing +Z). Head-top, neck at ~78% of the height, face front,
 * back and feet. `size` is the per-model slider: it scales the clothes, not where they hang.
 */
export function anchorsFromBox(box, size = 1) {
  const [x0, y0, z0] = box.min, [x1, y1, z1] = box.max;
  const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6), d = Math.max(z1 - z0, 1e-6);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, s = clampSize(size);
  // A head is about a fifth of a figure's height, never wider than the figure itself.
  const u = Math.min(h * 0.2, Math.max(w, d) * 0.5);
  const front = cz + Math.min(d / 2, u * 0.55), rear = cz - Math.min(d / 2, u * 0.6);
  const head = u * 0.55 * s;
  return {
    head: { p: [cx, y1 - head * 0.7, cz], r: head },
    neck: { p: [cx, y0 + h * 0.78, cz], r: u * 0.45 * s },
    face: { p: [cx, y0 + h * 0.88, front], r: u * 0.45 * s },
    back: { p: [cx, y0 + h * 0.62, rear], r: u * 0.6 * s },
    chest: { p: [cx, y0 + h * 0.62, cz + Math.min(d / 2, u * 0.6)], r: u * 0.5 * s },
    feet: { p: [cx, y0, cz], r: u * s },
  };
}
// 小游 with the slider: the same places, clothes scaled.
const scaledXiaoyou = (size) => Object.fromEntries(Object.entries(XIAOYOU_ANCHORS).map(([k, a]) => [k, { p: a.p, r: a.r * clampSize(size) }]));

// Stripes for the striped scarf: around the ring, in the item colour and cream.
function stripes(THREE, color) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? CREAM : color; ctx.fillRect(i * 8, 0, 8, 8); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  return tex;
}

// ───── wardrobe: every item is built at unit size and scaled by its anchor's r ─────
function builder(THREE, made) {
  const mat = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.78, metalness: 0, ...extra }); made.push(m); return m; };
  const mesh = (geometry, material, at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    made.push(geometry);
    const m = new THREE.Mesh(geometry, material); m.position.set(...at); m.rotation.set(...rot); m.scale.set(...scale); return m;
  };
  const group = (...children) => { const g = new THREE.Group(); g.add(...children); return g; };
  const PI = Math.PI;
  return {
    hat: {
      beret: (c) => group(mesh(new THREE.SphereGeometry(1.02, 36, 16), mat(c), [0.08, 0.12, 0], [0, 0, -0.22], [1, 0.32, 1]),
        mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 10), mat(c), [0.02, 0.44, 0], [0, 0, -0.22])),
      bucket: (c) => group(mesh(new THREE.CylinderGeometry(0.72, 0.9, 0.62, 40), mat(c), [0, 0.28, 0]),
        mesh(new THREE.SphereGeometry(0.72, 40, 8, 0, 2 * PI, 0, PI / 2), mat(c), [0, 0.58, 0], [0, 0, 0], [1, 0.18, 1]),
        mesh(new THREE.CylinderGeometry(0.9, 1.42, 0.18, 48, 1, true), mat(c, { side: THREE.DoubleSide }), [0, -0.04, 0]),
        mesh(new THREE.TorusGeometry(0.86, 0.06, 8, 48), mat(INK), [0, 0.06, 0], [PI / 2, 0, 0])),
      beanie: (c) => group(mesh(new THREE.SphereGeometry(0.94, 36, 16, 0, 2 * PI, 0, PI / 2), mat(c, { roughness: 0.95 }), [0, -0.08, 0], [0, 0, 0], [1, 1.05, 1]),
        mesh(new THREE.TorusGeometry(0.93, 0.14, 12, 48), mat(c, { roughness: 0.95 }), [0, -0.06, 0], [PI / 2, 0, 0]),
        mesh(new THREE.SphereGeometry(0.24, 18, 12), mat(CREAM, { roughness: 1 }), [0, 0.98, 0])),
      crown: (c) => {
        const g = group(mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.3, 40, 1, true), mat(c, { metalness: 0.45, roughness: 0.38, side: THREE.DoubleSide }), [0, 0.12, 0]));
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * 2 * PI;
          g.add(mesh(new THREE.ConeGeometry(0.16, 0.34, 12), mat(c, { metalness: 0.45, roughness: 0.38 }), [Math.sin(a) * 0.6, 0.42, Math.cos(a) * 0.6]));
          g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(i % 2 ? '#C97B74' : '#4F6D7A', { roughness: 0.3 }), [Math.sin(a) * 0.65, 0.14, Math.cos(a) * 0.65]));
        }
        return g;
      },
      flower: (c) => {
        const g = group(mesh(new THREE.SphereGeometry(0.13, 16, 10), mat('#D9A441'), [0, 0, 0.04]));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 2 * PI;
          g.add(mesh(new THREE.SphereGeometry(0.2, 16, 10), mat(c), [Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0], [0, 0, a], [1, 0.62, 0.32]));
        }
        g.add(mesh(new THREE.SphereGeometry(0.16, 12, 8), mat('#6F7F63'), [-0.3, -0.26, -0.02], [0, 0, 0.7], [1, 0.42, 0.25]));
        g.position.set(0.52, 0.36, 0.5); g.rotation.set(-0.5, 0.7, 0.2);
        return g;
      },
    },
    neck: {
      scarf: (c) => scarf(c, mat(c)),
      stripes: (c) => { const tex = stripes(THREE, c); made.push(tex); return scarf(c, mat('#ffffff', { map: tex })); },
      bow: (c) => group(mesh(new THREE.ConeGeometry(0.17, 0.3, 16), mat(c), [-0.15, 0, 1.0], [0, 0, -PI / 2], [1, 1, 0.55]),
        mesh(new THREE.ConeGeometry(0.17, 0.3, 16), mat(c), [0.15, 0, 1.0], [0, 0, PI / 2], [1, 1, 0.55]),
        mesh(new THREE.SphereGeometry(0.075, 14, 10), mat(c), [0, 0, 1.02])),
    },
    back: {
      backpack: (c) => group(mesh(new THREE.CapsuleGeometry(0.42, 0.42, 6, 20), mat(c), [0, 0, -0.22], [0, 0, 0], [1.05, 1, 0.5]),
        mesh(new THREE.CapsuleGeometry(0.24, 0.12, 4, 16), mat(c, { roughness: 0.9 }), [0, -0.2, -0.46], [0, 0, 0], [1.1, 1, 0.45]),
        mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), mat(INK), [0, -0.02, -0.55]),
        mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20, PI), mat(INK), [0, 0.62, -0.2])),
      balloon: (c) => group(mesh(new THREE.SphereGeometry(0.42, 28, 18), mat(c, { roughness: 0.32 }), [0.75, 2.35, -0.25], [0, 0, 0], [1, 1.15, 1]),
        mesh(new THREE.ConeGeometry(0.06, 0.1, 10), mat(c), [0.75, 1.84, -0.25], [PI, 0, 0]),
        mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.95, 4), mat(INK), [0.38, 0.85, -0.12], [0, 0, 0.36])),
    },
    // The camera hangs at the chest, where a traveller carries one.
    chest: {
      camera: (c) => group(mesh(new THREE.BoxGeometry(0.62, 0.4, 0.22), mat(c), [0, 0, 0.1]),
        mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 24), mat(INK, { roughness: 0.4 }), [0, -0.02, 0.27], [PI / 2, 0, 0]),
        mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), mat('#4F6D7A', { roughness: 0.1, metalness: 0.2 }), [0, -0.02, 0.36], [PI / 2, 0, 0]),
        mesh(new THREE.BoxGeometry(0.14, 0.08, 0.06), mat(CREAM), [0.2, 0.16, 0.2])),
    },
    face: {
      round: (c) => group(mesh(new THREE.TorusGeometry(0.27, 0.045, 10, 32), mat(c, { metalness: 0.3, roughness: 0.4 }), [-0.5, 0, 0]),
        mesh(new THREE.TorusGeometry(0.27, 0.045, 10, 32), mat(c, { metalness: 0.3, roughness: 0.4 }), [0.5, 0, 0]),
        mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), mat(c), [0, 0.06, 0], [0, 0, PI / 2])),
      shades: (c) => group(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 28), mat(INK, { roughness: 0.15, metalness: 0.2 }), [-0.5, 0, 0], [PI / 2, 0, 0], [1.15, 1, 0.82]),
        mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 28), mat(INK, { roughness: 0.15, metalness: 0.2 }), [0.5, 0, 0], [PI / 2, 0, 0], [1.15, 1, 0.82]),
        mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), mat(c), [0, 0.1, 0])),
      blush: (c) => group(mesh(new THREE.CircleGeometry(0.2, 24), mat(c, { transparent: true, opacity: 0.8 }), [-0.86, -0.34, -0.15], [0, -0.55, 0], [1.25, 0.8, 1]),
        mesh(new THREE.CircleGeometry(0.2, 24), mat(c, { transparent: true, opacity: 0.8 }), [0.86, -0.34, -0.15], [0, 0.55, 0], [1.25, 0.8, 1])),
    },
  };
  function scarf(c, material) {
    return group(mesh(new THREE.TorusGeometry(1, 0.18, 16, 56), material, [0, 0, 0], [PI / 2, 0, 0], [1, 1, 1.1]),
      mesh(new THREE.BoxGeometry(0.3, 0.7, 0.09), material, [0.3, -0.36, 0.98], [0.18, 0, 0.12]),
      mesh(new THREE.BoxGeometry(0.28, 0.56, 0.09), material, [0.5, -0.3, 0.9], [0.18, 0.3, -0.2]),
      mesh(new THREE.SphereGeometry(0.16, 14, 10), material, [0.38, 0, 1.06]));
  }
}
// Which anchor each slot's items hang on (the camera is the exception).
const ANCHOR_OF = { hat: 'head', neck: 'neck', back: 'back', face: 'face' };

// A soft round shadow under the figure, drawn once: reads as a plate on paper without lights.
function shadowTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(60,42,20,.34)'); g.addColorStop(0.6, 'rgba(60,42,20,.12)'); g.addColorStop(1, 'rgba(60,42,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

/**
 * host: an element to draw in. Options: interactive (drag to turn), onState(code) for
 * WEBGL_UNAVAILABLE / WEBGL_LOST / WEBGL_BACK / LOAD_FAILED / LOADED.
 */
export function createAvatarStage(host, { interactive = true, onState = () => {} } = {}) {
  let THREE, renderer, scene, camera, turntable, figure = null, wear = null, plate, shadow, mixer = null, clock;
  let disposed = false, failed = false, frame = 0, observer = null, model = null, outfit = null, size = 1, kind = 'xiaoyou';
  let loads = 0; // only the newest load() may put its figure on the plate
  let yaw = 0, spin = 0, dragging = null, center = [0, 0.7, 0], height = TARGET_HEIGHT, anchors = XIAOYOU_ANCHORS;
  const made = [], tints = new Map(); // geometries/materials of the clothes; 小游's materials as loaded
  const ready = (async () => {
    THREE = await import('./vendor/three.js');
    if (disposed) return;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { failed = true; onState('WEBGL_UNAVAILABLE'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'avatar-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    clock = new THREE.Clock();
    // The same warm window light as the clay bench, a little softer for a character.
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a66, 1.7));
    const key = new THREE.DirectionalLight(0xffefd6, 2.2); key.position.set(-2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0xdbe6f2, 0.8); rim.position.set(2.5, 1.5, -3); scene.add(rim);
    turntable = new THREE.Group(); scene.add(turntable);
    plate = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.05, 64), new THREE.MeshStandardMaterial({ color: 0xe9dcc4, roughness: 0.95 }));
    plate.position.y = -0.026; turntable.add(plate);
    shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({ map: shadowTexture(THREE), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; turntable.add(shadow);
    host.replaceChildren(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); if (disposed) return; failed = true; onState('WEBGL_LOST'); });
    renderer.domElement.addEventListener('webglcontextrestored', () => { if (disposed) return; failed = false; onState('WEBGL_BACK'); draw(); });
    observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; observer?.observe(host);
    if (interactive) bind();
    document.addEventListener('visibilitychange', onVisible);
    resize();
  })();
  const onVisible = () => { if (!document.hidden) draw(); };

  function resize() {
    if (!renderer || disposed) return;
    const w = Math.max(host.clientWidth, 64), h = Math.max(host.clientHeight, 64);
    renderer.setSize(w, h, false); camera.aspect = w / h; frameView(); draw();
  }
  // Fit the figure and whatever it wears (a balloon reaches well above the head) with a little air.
  function frameView() {
    if (!camera) return;
    const top = outfit?.back.item === 'balloon' ? height * 1.55 : height * 1.14, bottom = -0.06;
    const span = top - bottom, tan = Math.tan((camera.fov * Math.PI) / 360);
    const distance = Math.max(span / (2 * tan) * 1.08, 1.9 / (2 * tan * camera.aspect));
    center = [0, bottom + span / 2, 0];
    camera.position.set(0, center[1] + distance * 0.16, distance);
    camera.lookAt(0, center[1], 0); camera.updateProjectionMatrix();
  }
  const moving = () => !reducedMotion() && !failed && host.isConnected && !document.hidden;
  function render() {
    const dt = clock.getDelta(), t = clock.elapsedTime;
    if (moving()) {
      mixer?.update(dt);
      if (!dragging) spin += dt;
      if (figure) figure.position.y = Math.sin(t * 2.1) * 0.012;
      turntable.rotation.y = yaw + (dragging ? 0 : Math.sin(spin * 0.55) * 0.28);
    } else turntable.rotation.y = yaw;
    renderer.render(scene, camera);
  }
  // Continuous while it moves; one frame on demand otherwise (reduced motion, hidden, or detached).
  function draw() {
    if (!renderer || failed || frame || disposed) return;
    frame = requestAnimationFrame(() => { frame = 0; if (disposed || failed) return; render(); if (moving()) draw(); });
  }

  function bind() {
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (event) => {
      if (event.button > 0) return;
      dragging = { x: event.clientX, yaw: turntable.rotation.y };
      try { el.setPointerCapture?.(event.pointerId); } catch { /* turning works without capture */ }
    });
    el.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      yaw = dragging.yaw + (event.clientX - dragging.x) * 0.012; spin = 0; draw();
    });
    const end = () => { if (!dragging) return; dragging = null; spin = 0; draw(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  function disposeTree(node) {
    node?.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
    });
  }
  function clearWear() {
    if (wear) { wear.parent?.remove(wear); wear = null; }
    for (const x of made.splice(0)) x.dispose();
  }
  /** Load 小游 (bytes omitted) or the user's model (an ArrayBuffer of a checked .glb). */
  async function load(nextKind, bytes = null) {
    const seq = ++loads;
    await ready;
    if (!renderer || disposed) return false;
    // Embedded textures come out as blob: URLs. The default ImageBitmapLoader fetch()es them, which
    // the page's CSP (connect-src 'self') refuses; an <img> is allowed by img-src blob:.
    const loader = new THREE.GLTFLoader().register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'along_img_textures' }; });
    let gltf;
    try { gltf = bytes ? await loader.parseAsync(bytes.slice(0), '') : await loader.loadAsync(XIAOYOU_URL); }
    catch { if (!disposed) onState('LOAD_FAILED'); return false; }
    if (disposed || seq !== loads) { disposeTree(gltf.scene); return false; }
    clearWear(); mixer?.stopAllAction(); mixer = null;
    if (figure) { turntable.remove(figure); disposeTree(figure); }
    kind = nextKind === 'custom' && bytes ? 'custom' : 'xiaoyou';
    // Measured before it joins the turntable, so a turned turntable cannot skew the box.
    model = gltf.scene; tints.clear();
    let plateR = 0.78;
    if (kind === 'custom') {
      // Stand any model on the plate at 小游's height, centred; glTF faces +Z like 小游.
      // Tripo's models face +X: turn them first, so the box, the clothes and the snapshot all see the front.
      if (facesPlusX(gltf.asset)) model.rotation.y = -Math.PI / 2;
      const box = new THREE.Box3().setFromObject(model), dims = box.getSize(new THREE.Vector3());
      const scale = TARGET_HEIGHT / Math.max(dims.y, dims.x * 0.6, dims.z * 0.6, 1e-6);
      model.scale.setScalar(scale);
      const fit = new THREE.Box3().setFromObject(model), mid = fit.getCenter(new THREE.Vector3());
      model.position.set(-mid.x, -fit.min.y, -mid.z);
      const out = new THREE.Box3().setFromObject(model);
      height = out.max.y - out.min.y;
      model.userData.box = { min: out.min.toArray(), max: out.max.toArray() };
      plateR = Math.max(0.62, Math.min(1.1, Math.hypot(out.max.x - out.min.x, out.max.z - out.min.z) * 0.6));
    } else {
      height = TARGET_HEIGHT;
      model.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.name && !tints.has(m.name)) tints.set(m.name, { m, color: m.color?.clone() }); });
    }
    if (gltf.animations?.length) { mixer = new THREE.AnimationMixer(model); mixer.clipAction(gltf.animations[0]).play(); }
    figure = new THREE.Group(); figure.add(model); turntable.add(figure);
    plate.scale.set(plateR / 0.78, 1, plateR / 0.78); shadow.scale.setScalar(plateR / 0.78);
    if (outfit) dress(outfit, size); else frameView();
    onState('LOADED'); draw();
    return true;
  }
  function tint(names, hex) {
    for (const name of names) { const t = tints.get(name); if (t?.m.color) { if (hex) t.m.color.set(hex); else t.m.color.copy(t.color); } }
  }
  /** Put clothes on: one item per slot, the originals hidden or tinted on 小游. */
  function dress(next, nextSize = size) {
    outfit = normalizeOutfit(next, kind); size = clampSize(nextSize);
    if (!THREE || !model) return;
    clearWear();
    anchors = kind === 'custom' ? anchorsFromBox(model.userData.box, size) : scaledXiaoyou(size);
    if (kind === 'xiaoyou') {
      for (const [slot, names] of Object.entries(XIAOYOU_PARTS)) for (const name of names) { const n = model.getObjectByName(name); if (n) n.visible = outfit[slot].item === 'original'; }
      for (const [slot, names] of Object.entries(XIAOYOU_TINTS)) tint(names, outfit[slot].item === 'original' ? colorHex(outfit[slot].color) : '');
      tint(['Body'], BODY_TINTS.find(([n]) => n === outfit.body)?.[1] || '');
    }
    const items = builder(THREE, made);
    wear = new THREE.Group(); figure.add(wear);
    for (const slot of Object.keys(ANCHOR_OF)) {
      const { item, color } = outfit[slot];
      const where = item === 'camera' ? 'chest' : ANCHOR_OF[slot], make = items[where]?.[item];
      if (!make) continue;
      const piece = make(colorHex(color) || CREAM), a = anchors[where];
      const holder = new THREE.Group(); holder.position.set(...a.p); holder.scale.setScalar(a.r); holder.add(piece);
      wear.add(holder);
    }
    frameView(); draw();
  }

  return {
    ready,
    load,
    dress,
    get kind() { return kind; },
    get failed() { return failed || !renderer; },
    /** A square PNG of the figure facing front, on a transparent background, for the floating button. */
    snapshot(px = 192) {
      if (!renderer || failed || !model) return '';
      const keep = [turntable.rotation.y, figure.position.y, renderer.getPixelRatio()];
      const w = host.clientWidth, h = host.clientHeight;
      turntable.rotation.y = 0; figure.position.y = 0;
      // Head and shoulders, like the drawn 小游 in the button.
      const top = height * 1.18, bottom = height * 0.22, look = (top + bottom) / 2, cam = camera.clone();
      cam.aspect = 1; cam.fov = 30;
      const d = ((top - bottom) / 2 / Math.tan((cam.fov * Math.PI) / 360)) * 1.04;
      cam.position.set(0, look + d * 0.06, d); cam.lookAt(0, look, 0); cam.updateProjectionMatrix();
      renderer.setPixelRatio(1); renderer.setSize(px, px, false);
      plate.visible = false; shadow.visible = false;
      renderer.render(scene, cam);
      const url = renderer.domElement.toDataURL('image/png');
      plate.visible = true; shadow.visible = true;
      renderer.setPixelRatio(keep[2]); renderer.setSize(Math.max(w, 64), Math.max(h, 64), false);
      turntable.rotation.y = keep[0]; figure.position.y = keep[1];
      render();
      return url.length > 32 ? url : '';
    },
    turn(deg) { yaw += (deg * Math.PI) / 180; draw(); },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      mixer?.stopAllAction(); clearWear(); disposeTree(figure);
      plate?.geometry.dispose(); plate?.material.dispose();
      shadow?.geometry.dispose(); shadow?.material.map?.dispose(); shadow?.material.dispose();
      // WebViews cap live GL contexts; give this one back now instead of waiting for garbage collection.
      renderer?.forceContextLoss(); renderer?.dispose(); renderer?.domElement.remove();
    },
  };
}
