// The clay bench stage: three.js view of the PINCH clay engine with phone gestures.
// One finger on the clay sculpts with the current brush; one finger off the clay turns the
// turntable; two fingers pinch to zoom and drag to look around. In "turn" mode one finger
// always turns, so a stray touch never changes the clay.
import { AlongClay, projectUVs, fitProjector, newStrokeId } from './vendor/clay.js';

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const BRUSHES = ['build', 'dig', 'smooth', 'flatten', 'grab', 'crease'];
export const CLAY_COLORS = ['#c98a5e', '#b7653f', '#d8c3a1', '#8f9a7a', '#6d7f99', '#e8e1d4'];
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createClayStage(host, { onChange = () => {}, onState = () => {} } = {}) {
  let THREE, renderer, scene, camera, root, material, photoMaterial, texture = null, ground, cursor;
  let clay = null, meshes = new Map(), disposed = false, frame = 0, failed = false;
  let yaw = -0.5, pitch = 0.5, distance = 260, target = [0, 30, 0];
  let brush = 'build', radius = 9, strength = 0.6, symmetry = 'mirror', mode = 'sculpt', color = CLAY_COLORS[0];
  let photo = null; // { kind, bitmap canvas, projector }
  const pointers = new Map();
  let gesture = null;
  const ready = (async () => {
    THREE = await import('./vendor/three.js');
    if (disposed) return;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { failed = true; onState('WEBGL_UNAVAILABLE'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'clay-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 1, 4000);
    root = new THREE.Group(); scene.add(root);
    // Warm window light from the left, a cool fill from behind: the bench by a window.
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a66, 1.6));
    const key = new THREE.DirectionalLight(0xffefd6, 2.6); key.position.set(-120, 200, 160); scene.add(key);
    const rim = new THREE.DirectionalLight(0xdbe6f2, 0.9); rim.position.set(140, 80, -160); scene.add(rim);
    material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.86, metalness: 0 });
    photoMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
    // A turntable plate under the clay.
    ground = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ color: 0xc9ad84, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; scene.add(ground);
    cursor = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: 0x1b1813, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: false }));
    cursor.visible = false; cursor.renderOrder = 10; scene.add(cursor);
    host.replaceChildren(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); if (disposed) return; failed = true; cancelStroke(); onState('WEBGL_LOST'); });
    // Android drops the GL context when the app goes to the background; three restores its buffers itself.
    renderer.domElement.addEventListener('webglcontextrestored', () => { if (disposed) return; failed = false; onState('WEBGL_BACK'); draw(); });
    observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; observer?.observe(host);
    resize();
    bind();
  })();
  let observer = null;

  function resize() {
    if (!renderer || disposed) return;
    const w = Math.max(host.clientWidth, 200), h = Math.max(host.clientHeight, 240);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); draw();
  }
  function placeCamera() {
    const cp = Math.cos(pitch);
    camera.position.set(target[0] + distance * cp * Math.sin(yaw), target[1] + distance * Math.sin(pitch), target[2] + distance * cp * Math.cos(yaw));
    camera.lookAt(target[0], target[1], target[2]);
  }
  function draw() {
    if (!renderer || failed || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; if (disposed) return; placeCamera(); renderer.render(scene, camera); });
  }

  // ───── clay meshes ─────
  function geometryFor(m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    if (photo) g.setAttribute('uv', new THREE.BufferAttribute(projectUVs(m.pos, m.nrm, photo.projector), 2));
    g.computeBoundingSphere();
    return g;
  }
  // Coloured pieces (AI layouts, gallery examples) keep one glaze per part; plain clay has one.
  let partMaterials = [];
  function setPartColors(colors) {
    for (const m of partMaterials) m.dispose();
    partMaterials = (colors || []).map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.62, metalness: 0 }));
  }
  function materialFor() { return photo ? photoMaterial : partMaterials.length ? partMaterials : material; }
  function apply(changes) {
    if (!THREE || !changes?.length) return;
    for (const c of changes) {
      const old = meshes.get(c.key);
      if (old) { root.remove(old); old.geometry.dispose(); meshes.delete(c.key); }
      if (c.removed || !c.idx?.length) continue;
      const geometry = geometryFor(c);
      if (partMaterials.length && !photo) for (const [start, count, part] of c.groups) geometry.addGroup(start, count, Math.min(Math.max(part, 0), partMaterials.length - 1));
      const mesh = new THREE.Mesh(geometry, materialFor());
      meshes.set(c.key, mesh); root.add(mesh);
    }
    draw();
  }
  let lastTap = 0, home = [0, 30, 0];
  function clampTarget(t) {
    const b = clay?.bounds();
    if (!b) return t;
    const pad = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    return t.map((v, k) => clampN(v, b.min[k] - pad * 0.5, b.max[k] + pad * 0.5));
  }
  function resetView() { yaw = -0.5; pitch = 0.5; frameClay(); }
  function frameClay() {
    const b = clay?.bounds();
    if (!b) return;
    const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    target = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; home = [...target];
    // Fit the whole piece with room to work: vertical field of view 36°, so ~3.4× its size.
    distance = clampN(size * 3.4, 120, 1100);
    const plate = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 0.62;
    ground.scale.set(plate, plate, plate);
    draw();
  }
  function rebuildAll() {
    for (const mesh of meshes.values()) { root.remove(mesh); mesh.geometry.dispose(); }
    meshes = new Map();
    apply(clay.all());
  }

  // ───── picking ─────
  function rayFrom(x, y) {
    placeCamera(); camera.updateMatrixWorld();
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    return { origin: ray.ray.origin.toArray(), dir: ray.ray.direction.toArray() };
  }
  function pick(x, y) {
    if (!clay) return null;
    const { origin, dir } = rayFrom(x, y);
    return clay.raycast(origin, dir);
  }
  // Brush size is in screen pixels, like PINCH: zoom in to work on detail.
  function worldRadius(hit) {
    const rect = renderer.domElement.getBoundingClientRect();
    const d = camera.position.distanceTo(new THREE.Vector3(...hit.point));
    const px = (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / rect.height;
    return clampN(radius * 4 * px, clay.cell * 1.6, 60);
  }
  function showCursor(hit, r) {
    if (!hit) { cursor.visible = false; draw(); return; }
    cursor.visible = true;
    cursor.position.set(...hit.point);
    cursor.lookAt(hit.point[0] + hit.normal[0], hit.point[1] + hit.normal[1], hit.point[2] + hit.normal[2]);
    cursor.scale.set(r, r, r);
    draw();
  }
  const symFor = () => (symmetry === 'mirror' ? { kind: 'mirror', point: [0, 0, 0], normal: [1, 0, 0] } : symmetry === 'radial' ? { kind: 'radial', point: [0, 0, 0], axis: [0, 1, 0] } : null);

  // ───── gestures ─────
  function bind() {
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', (event) => { if (pointers.has(event.pointerId)) up(event); });
    el.addEventListener('wheel', (event) => { event.preventDefault(); distance = clampN(distance * (1 + event.deltaY * 0.001), 50, 1200); draw(); }, { passive: false });
  }
  function cancelStroke() {
    if (gesture?.kind === 'stroke') { if (gesture.tick) cancelAnimationFrame(gesture.tick); if (clay) apply(clay.cancel()); }
    gesture = null; pointers.clear(); if (cursor) showCursor(null);
  }
  function down(event) {
    if (!clay || failed) return;
    // A new first finger means any earlier pointer was lost (no pointerup reached us): start clean.
    if (event.isPrimary && pointers.size) {
      if (gesture?.kind === 'stroke') { if (gesture.tick) cancelAnimationFrame(gesture.tick); apply(clay.end()); onChange(); }
      gesture = null; pointers.clear();
    }
    // Capture keeps the stroke going when the finger slides off the canvas; some WebViews refuse it.
    try { renderer.domElement.setPointerCapture?.(event.pointerId); } catch { /* the stroke still works inside the canvas */ }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      if (gesture?.kind === 'stroke') apply(clay.cancel());
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), distance, mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], target: [...target] };
      showCursor(null); return;
    }
    if (pointers.size > 2) return;
    const hit = mode === 'sculpt' ? pick(event.clientX, event.clientY) : null;
    if (!hit) {
      const now = performance.now();
      if (now - lastTap < 320) { lastTap = 0; resetView(); return; }
      lastTap = now;
      gesture = { kind: 'orbit', x: event.clientX, y: event.clientY, yaw, pitch }; return;
    }
    const r = worldRadius(hit);
    // Shift (on a keyboard) or a stylus eraser end smooths, like PINCH.
    const kind = event.shiftKey || event.buttons === 32 ? 'smooth' : brush;
    clay.begin({ id: newStrokeId(), brush: kind, radius: r, strength, points: kind === 'grab' ? [...hit.point] : [], normals: kind === 'grab' ? [...hit.normal] : [], sym: symFor() });
    const ray0 = rayFrom(event.clientX, event.clientY);
    gesture = { kind: 'stroke', brush: kind, start: hit, r, last: hit.point, plane: hit.t, dir0: ray0.dir, x: event.clientX, y: event.clientY };
    if (kind !== 'grab') apply(clay.dab(hit.point, hit.normal, event.pointerType === 'pen' ? event.pressure : undefined));
    showCursor(hit, r);
  }
  function move(event) {
    const p = pointers.get(event.pointerId);
    if (!p) {
      // Hover (mouse or stylus) shows where the brush would land.
      if (mode === 'sculpt' && clay && event.pointerType !== 'touch') { const hit = pick(event.clientX, event.clientY); showCursor(hit, hit ? worldRadius(hit) : 0); }
      return;
    }
    p.x = event.clientX; p.y = event.clientY;
    if (!gesture) return;
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      distance = clampN(gesture.distance * (gesture.d / Math.max(d, 1)), 50, 1200);
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2], k = distance / 900;
      target = clampTarget([gesture.target[0] - (mid[0] - gesture.mid[0]) * k * Math.cos(yaw), gesture.target[1] + (mid[1] - gesture.mid[1]) * k, gesture.target[2] + (mid[0] - gesture.mid[0]) * k * Math.sin(yaw)]);
      draw();
    } else if (gesture.kind === 'orbit') {
      const rect = renderer.domElement.getBoundingClientRect();
      yaw = gesture.yaw - ((event.clientX - gesture.x) / rect.width) * Math.PI * 1.6;
      pitch = clampN(gesture.pitch + ((event.clientY - gesture.y) / rect.height) * Math.PI, -0.2, 1.35);
      draw();
    } else if (gesture.kind === 'stroke') {
      // At most one clay update per frame: on a slow phone the finger's moves merge instead of queueing up.
      gesture.pending = { x: event.clientX, y: event.clientY, pen: event.pointerType === 'pen' ? event.pressure : undefined };
      if (!gesture.tick) gesture.tick = requestAnimationFrame(() => { const g = gesture; if (!g || g.kind !== 'stroke') return; g.tick = 0; const p = g.pending; g.pending = null; if (p) strokeTo(p.x, p.y, p.pen); });
    }
  }
  function strokeTo(x, y, pen) {
    {
      if (gesture.brush === 'grab') {
        // Drag in the plane facing the camera through the grabbed point.
        const { origin, dir } = rayFrom(x, y);
        const d0 = gesture.dir0, cos = dir[0] * d0[0] + dir[1] * d0[1] + dir[2] * d0[2];
        const t = gesture.plane / Math.max(cos, 0.2);
        const point = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
        apply(clay.grab([point[0] - gesture.start.point[0], point[1] - gesture.start.point[1], point[2] - gesture.start.point[2]]));
        return;
      }
      const hit = pick(x, y);
      if (!hit) { showCursor(null); return; }
      // Dabs every third of a brush radius along the finger's path.
      const step = gesture.r * 0.33, dx = hit.point[0] - gesture.last[0], dy = hit.point[1] - gesture.last[1], dz = hit.point[2] - gesture.last[2];
      const gap = Math.hypot(dx, dy, dz);
      if (gap < step) { showCursor(hit, gesture.r); return; }
      const n = Math.min(12, Math.floor(gap / step));
      const changes = [];
      for (let i = 1; i <= n; i++) {
        const t = i / n, q = [gesture.last[0] + dx * t, gesture.last[1] + dy * t, gesture.last[2] + dz * t];
        changes.push(...clay.dab(q, hit.normal, pen));
      }
      gesture.last = hit.point;
      apply(dedupe(changes));
      showCursor(hit, gesture.r);
    }
  }
  function dedupe(changes) { const byKey = new Map(); for (const c of changes) byKey.set(c.key, c); return [...byKey.values()]; }
  function up(event) {
    pointers.delete(event.pointerId);
    if (gesture?.kind === 'stroke') {
      // Finish the last merged move before closing the stroke.
      if (gesture.tick) { cancelAnimationFrame(gesture.tick); gesture.tick = 0; }
      if (gesture.pending) { const p = gesture.pending; gesture.pending = null; strokeTo(p.x, p.y, p.pen); }
      apply(clay.end()); onChange();
    }
    if (pointers.size === 1 && gesture?.kind === 'pinch') { const [p] = [...pointers.values()]; gesture = { kind: 'orbit', x: p.x, y: p.y, yaw, pitch }; return; }
    if (!pointers.size) { gesture = null; if (event.pointerType === 'touch') showCursor(null); }
  }
  function cancel(event) {
    pointers.delete(event.pointerId);
    if (gesture?.kind === 'stroke') { if (gesture.tick) cancelAnimationFrame(gesture.tick); apply(clay.cancel()); }
    gesture = null; showCursor(null);
  }

  // ───── photo on clay ─────
  function photoDirection() {
    // Project along the view direction, levelled so a landscape stays upright.
    const f = [target[0] - camera.position.x, target[1] - camera.position.y, target[2] - camera.position.z];
    return f;
  }
  function refreshUVs() {
    for (const mesh of meshes.values()) {
      const pos = mesh.geometry.getAttribute('position').array, nrm = mesh.geometry.getAttribute('normal').array;
      const old = mesh.geometry.getAttribute('uv');
      if (photo) {
        const uv = projectUVs(pos, nrm, photo.projector);
        if (old && old.array.length === uv.length) { old.array.set(uv); old.needsUpdate = true; }
        else { if (old) mesh.geometry.deleteAttribute('uv'); mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
      } else if (old) mesh.geometry.deleteAttribute('uv');
      mesh.material = materialFor();
    }
    // Groups are only meaningful with part colours; a photo or plain clay is one material.
    if (partMaterials.length && clay) rebuildAll();
    draw();
  }

  return {
    ready,
    get failed() { return failed; },
    get clay() { return clay; },
    async load(engine, strokes = []) {
      await ready;
      clay = engine;
      if (strokes.length) clay.replay(strokes);
      if (!renderer) return;
      setPartColors(clay.colors);
      rebuildAll(); frameClay();
    },
    setBrush(value) { brush = value; },
    setRadius(value) { radius = value; },
    setStrength(value) { strength = value; },
    setSymmetry(value) { symmetry = value; },
    setMode(value) { mode = value; showCursor(null); },
    setColor(value) {
      color = value; material?.color.set(value);
      if (photo && texture) { texture.image = padded(photo.canvas, value); texture.needsUpdate = true; }
      draw();
    },
    undo() { if (clay?.canUndo) { apply(clay.undo()); onChange(); } },
    redo() { if (clay?.canRedo) { apply(clay.redo()); onChange(); } },
    resetView,
    turn(deg) { yaw += (deg * Math.PI) / 180; draw(); },
    /** Put a photo on the clay. kind: 'view' projects from where you are looking; 'wrap' goes all round. */
    async setPhoto(canvas, kind = 'view', scale = 1, forward = null, saved = null) {
      await ready;
      if (!renderer || !clay || disposed) return;
      const valid = saved && saved.kind === kind && Array.isArray(saved.center) && Number.isFinite(saved.halfW) && Number.isFinite(saved.halfH);
      const projector = valid ? saved : fitProjector(clay.fullMesh().positions, kind, forward || photoDirection(), [0, 1, 0], canvas.width / canvas.height, scale);
      texture?.dispose();
      texture = new THREE.CanvasTexture(padded(canvas, color));
      texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.anisotropy = 4;
      photoMaterial.map = texture; photoMaterial.needsUpdate = true;
      photo = { kind, canvas, projector, scale };
      refreshUVs();
    },
    clearPhoto() { photo = null; texture?.dispose(); texture = null; photoMaterial.map = null; refreshUVs(); },
    get photo() { return photo; },
    /** Texture canvas (photo with the clay-colour margin) and UVs for the whole welded mesh. */
    exportData() {
      const mesh = clay.fullMesh();
      return { mesh, uvs: photo ? projectUVs(mesh.positions, mesh.normals, photo.projector) : null, texture: photo ? padded(photo.canvas, color) : null, color, partColors: clay.colors };
    },
    snapshot(size = 720) {
      if (!renderer) return null;
      placeCamera(); cursor.visible = false; renderer.render(scene, camera);
      const out = document.createElement('canvas'); out.width = size; out.height = size;
      const ctx = out.getContext('2d'), src = renderer.domElement, s = Math.min(src.width, src.height);
      ctx.fillStyle = '#f7f2e8'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
      return out;
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect();
      if (gesture?.tick) cancelAnimationFrame(gesture.tick);
      gesture = null; pointers.clear();
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      for (const m of partMaterials) m.dispose();
      ground?.geometry.dispose(); ground?.material.dispose(); cursor?.geometry.dispose(); cursor?.material.dispose();
      texture?.dispose(); material?.dispose(); photoMaterial?.dispose();
      // WebViews cap live GL contexts; give this one back now instead of waiting for garbage collection.
      renderer?.forceContextLoss(); renderer?.dispose();
    },
    reducedMotion,
  };
}

// The photo inside a thin clay-coloured frame: UVs outside the photo point at the frame.
export function padded(canvas, color, margin = 0.02) {
  const size = 2048, out = document.createElement('canvas');
  out.width = size; out.height = size;
  const ctx = out.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, size, size);
  const inner = size * (1 - 2 * margin);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, size * margin, size * margin, inner, inner);
  return out;
}
export { AlongClay };
