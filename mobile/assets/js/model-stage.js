// A coloured 3D model (from Tripo, or any GLB with its own texture) on the bench turntable.
// Look only, no sculpting: one finger turns it, two fingers or the wheel zoom, a double tap
// resets the view. Same lights, plate and snapshot as clay-stage.js so the two read as one bench.

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const HEIGHT = 70; // the model is scaled to clay size (mm) so the bench lights and camera fit it
/** Tripo's models face +X (its default export orientation); glTF and this app face +Z. */
export const facesPlusX = (asset) => /tripo3d/i.test(String(asset?.generator || ''));

export function createModelStage(host, { onState = () => {} } = {}) {
  let THREE, renderer, scene, camera, root, ground, model = null, disposed = false, failed = false, frame = 0, observer = null;
  let yaw = -0.5, pitch = 0.32, distance = 260, target = [0, HEIGHT / 2, 0], home = [...target], homeDistance = 260;
  const pointers = new Map();
  let gesture = null, lastTap = 0;
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
    // The clay bench's window light, a little softer so painted colours are not washed out.
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a66, 1.3));
    const key = new THREE.DirectionalLight(0xffefd6, 2.0); key.position.set(-120, 200, 160); scene.add(key);
    const rim = new THREE.DirectionalLight(0xdbe6f2, 0.8); rim.position.set(140, 80, -160); scene.add(rim);
    ground = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ color: 0xc9ad84, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; scene.add(ground);
    host.replaceChildren(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); if (disposed) return; failed = true; gesture = null; pointers.clear(); onState('WEBGL_LOST'); });
    renderer.domElement.addEventListener('webglcontextrestored', () => { if (disposed) return; failed = false; onState('WEBGL_BACK'); draw(); });
    observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; observer?.observe(host);
    resize();
    bind();
  })();

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
  function resetView() { yaw = -0.5; pitch = 0.32; target = [...home]; distance = homeDistance; draw(); }
  function disposeTree(node) {
    node?.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
    });
  }

  // ───── gestures ─────
  function bind() {
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', (event) => { if (pointers.has(event.pointerId)) up(event); });
    el.addEventListener('wheel', (event) => { event.preventDefault(); distance = clampN(distance * (1 + event.deltaY * 0.001), 60, 1200); draw(); }, { passive: false });
  }
  function down(event) {
    if (!model || failed) return;
    try { renderer.domElement.setPointerCapture?.(event.pointerId); } catch { /* turning still works inside the canvas */ }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), distance };
      return;
    }
    if (pointers.size > 2) return;
    const now = performance.now();
    if (now - lastTap < 320) { lastTap = 0; resetView(); gesture = null; return; }
    lastTap = now;
    gesture = { kind: 'orbit', x: event.clientX, y: event.clientY, yaw, pitch };
  }
  function move(event) {
    const p = pointers.get(event.pointerId);
    if (!p || !gesture) return;
    p.x = event.clientX; p.y = event.clientY;
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      distance = clampN(gesture.distance * (gesture.d / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1)), 60, 1200);
    } else if (gesture.kind === 'orbit') {
      const rect = renderer.domElement.getBoundingClientRect();
      yaw = gesture.yaw - ((event.clientX - gesture.x) / rect.width) * Math.PI * 1.6;
      pitch = clampN(gesture.pitch + ((event.clientY - gesture.y) / rect.height) * Math.PI, -0.2, 1.35);
    }
    draw();
  }
  function up(event) {
    pointers.delete(event.pointerId);
    if (pointers.size === 1 && gesture?.kind === 'pinch') { const [p] = [...pointers.values()]; gesture = { kind: 'orbit', x: p.x, y: p.y, yaw, pitch }; return; }
    if (!pointers.size) gesture = null;
  }

  return {
    ready,
    get failed() { return failed; },
    /** Show a GLB (Uint8Array or ArrayBuffer). Resolves false if it cannot be read. */
    async load(bytes) {
      await ready;
      if (!renderer || disposed) return false;
      const buffer = bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      // Embedded textures come out as blob: URLs; the default loader fetch()es them, which the page's
      // CSP (connect-src 'self') refuses. An <img> is allowed by img-src blob: (as in avatar-stage.js).
      const loader = new THREE.GLTFLoader().register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'along_img_textures' }; });
      let gltf;
      try { gltf = await loader.parseAsync(buffer, ''); } catch { return false; }
      if (disposed) { disposeTree(gltf.scene); return false; }
      if (model) { root.remove(model); disposeTree(model); }
      model = gltf.scene;
      // Tripo exports face +X; the bench's front is +Z.
      if (facesPlusX(gltf.asset)) model.rotation.y = -Math.PI / 2;
      // Stand it on the plate at clay size, centred.
      const box = new THREE.Box3().setFromObject(model), dims = box.getSize(new THREE.Vector3());
      model.scale.setScalar(HEIGHT / Math.max(dims.y, dims.x * 0.75, dims.z * 0.75, 1e-6));
      const fit = new THREE.Box3().setFromObject(model), mid = fit.getCenter(new THREE.Vector3());
      model.position.set(-mid.x, -fit.min.y, -mid.z);
      root.add(model);
      const out = new THREE.Box3().setFromObject(model), size = out.getSize(new THREE.Vector3());
      home = [0, size.y / 2, 0]; target = [...home];
      homeDistance = distance = clampN(Math.max(size.x, size.y, size.z) * 3.4, 120, 1100);
      const plate = Math.max(size.x, size.z) * 0.62;
      ground.scale.set(plate, plate, plate);
      draw();
      return true;
    },
    resetView,
    snapshot(size = 720) {
      if (!renderer || !model) return null;
      placeCamera(); renderer.render(scene, camera);
      const out = document.createElement('canvas'); out.width = size; out.height = size;
      const ctx = out.getContext('2d'), src = renderer.domElement, s = Math.min(src.width, src.height);
      ctx.fillStyle = '#f7f2e8'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
      return out;
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect();
      gesture = null; pointers.clear();
      disposeTree(model); ground?.geometry.dispose(); ground?.material.dispose();
      // WebViews cap live GL contexts; give this one back now.
      renderer?.forceContextLoss(); renderer?.dispose();
    },
  };
}
