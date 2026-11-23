// Real Three.js mesh viewer. Geometry/export continue to work without WebGL.
import { normalizePose } from './crafts.js';
import { buildReliefMesh } from './craft-geometry.js';
import { drawTexture, exportArtifacts } from './craft-export.js';
import { attachHold } from './craft-hold.js';
import { createOrbit } from './craft-orbit.js';

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createCraftModel(host, { onPose = () => {}, onState = () => {}, onHold = () => {}, onHoldProgress = () => {} } = {}) {
  let disposed = false, revision = 0, webglFailed = false, frame = 0, lastTick = 0, distance = 190;
  let renderer, scene, camera, group, THREE, object, texture, mesh, canvas, pending, observer, contextLost;
  let exportsPromise;
  const orbit = createOrbit({ pose: normalizePose(340, 10), reduceMotion: reducedMotion });
  const hold = attachHold(host, { onProgress: onHoldProgress, onComplete: () => { orbit.reset(); onHold(); } });
  function render() { if (renderer && !disposed && !webglFailed) renderer.render(scene, camera); }
  function applyPose() {
    if (!group) return;
    const { rotation, tilt, zoom } = orbit.state;
    group.rotation.set(tilt * Math.PI / 180, rotation * Math.PI / 180, 0);
    camera.position.z = distance / zoom;
    render();
  }
  const settle = () => { const { rotation, tilt } = orbit.state; onPose({ rotation, tilt }); };
  // Only a flick keeps a frame loop running; a still model draws nothing.
  function tick(time) {
    frame = 0;
    if (disposed) return;
    const result = orbit.step(time - lastTick); lastTick = time;
    if (result.turned) applyPose();
    if (result.settled) settle();
    if (orbit.spinning) frame = requestAnimationFrame(tick);
  }
  function spin() { if (!frame && orbit.spinning) { lastTick = performance.now(); frame = requestAnimationFrame(tick); } }
  function flatPreview() {
    if (!canvas || disposed) return;
    canvas.className = 'craft-flat-preview'; canvas.setAttribute('aria-hidden', 'true'); host.replaceChildren(canvas); onState('WEBGL_UNAVAILABLE');
  }
  function resize() {
    if (!renderer || disposed) return;
    const width = Math.max(host.clientWidth, 240), height = Math.max(host.clientHeight, 280);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    orbit.setScale(width); fitCamera(); applyPose();
  }
  // Frame the face so it fills most of the stage, whichever way the stage and the face are shaped.
  function fitCamera() {
    if (!camera || !mesh) return;
    const { widthMm, heightMm } = mesh.settings, vertical = camera.fov * Math.PI / 360;
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    distance = Math.max((heightMm / 2) / Math.tan(vertical), (widthMm / 2) / Math.tan(horizontal)) / 0.86;
  }
  function freeObject() {
    if (object) { object.geometry.dispose(); for (const material of object.material) material.dispose(); group?.remove(object); object = null; }
    texture?.dispose(); texture = null;
  }
  async function setup() {
    if (webglFailed) throw new Error('WEBGL_UNAVAILABLE');
    if (renderer) return;
    if (!pending) pending = (async () => {
      THREE = await import('./vendor/three.js');
      if (disposed) return;
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      // Phones report 2.75–3.5; drawing at up to 3x keeps the photo crisp rather than soft.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = 'craft-webgl'; renderer.domElement.setAttribute('aria-hidden', 'true');
      scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(34, 1, 1, 1000); camera.position.set(0, 0, 190);
      // Geometry uses +Z for the photograph and -Z for the pocket. Keep the camera
      // explicitly on +Z looking at the origin; saved user poses must not be remapped.
      camera.lookAt(0, 0, 0);
      group = new THREE.Group(); scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff, 2.2));
      const key = new THREE.DirectionalLight(0xfff5de, 3.2); key.position.set(-60, 80, 160); scene.add(key);
      const fill = new THREE.DirectionalLight(0xe3ecff, 1); fill.position.set(80, -20, -90); scene.add(fill);
      contextLost = (event) => { event.preventDefault(); webglFailed = true; hold.cancel(); orbit.reset(); flatPreview(); };
      renderer.domElement.addEventListener('webglcontextlost', contextLost);
      host.replaceChildren(renderer.domElement);
      observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; observer?.observe(host);
      window.addEventListener('resize', resize); resize();
    })();
    return pending;
  }
  function setPose(rotation, tilt) { orbit.setPose({ rotation, tilt }); applyPose(); }
  async function load(craft, image, mask = null) {
    const current = ++revision; hold.cancel(); orbit.reset(); exportsPromise = null;
    mesh = buildReliefMesh({ ...craft, mask, imageWidth: image.naturalWidth || image.width, imageHeight: image.naturalHeight || image.height });
    canvas = drawTexture(image, mesh);
    try {
      await setup();
      if (disposed || current !== revision) return;
      freeObject();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2)); geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geometry.computeVertexNormals(); geometry.addGroup(0, mesh.frontIndexCount, 0); geometry.addGroup(mesh.frontIndexCount, mesh.indices.length - mesh.frontIndexCount, 1);
      texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
      // Sharp at an angle too: mipmaps plus the strongest anisotropic filtering the phone offers.
      // (CanvasTexture already builds mipmaps with trilinear filtering by default.)
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      object = new THREE.Mesh(geometry, [new THREE.MeshStandardMaterial({ map: texture, roughness: .62, metalness: 0 }), new THREE.MeshStandardMaterial({ color: '#ebd9b8', roughness: .8 })]);
      object.position.z = -(mesh.settings.baseMm + mesh.settings.reliefMm) / 2;
      group.add(object);
      orbit.setPose({ rotation: craft.rotation, tilt: craft.tilt }); resize(); onState('READY');
    } catch {
      if (disposed || current !== revision) return;
      webglFailed = true; flatPreview();
    }
  }
  const point = (event) => ({ id: event.pointerId, x: event.clientX, y: event.clientY });
  const down = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) { hold.cancel(); return; }
    cancelAnimationFrame(frame); frame = 0;
    if (orbit.down(point(event)).pinch) hold.cancel();
    try { host.setPointerCapture?.(event.pointerId); } catch { /* the pointer already left */ }
  };
  const move = (event) => {
    const result = orbit.move(point(event));
    if (result.started || result.zoomed) hold.cancel();
    if (result.turned || result.zoomed) applyPose();
  };
  const up = (event) => {
    const result = orbit.up(point(event), { cancelled: event.type !== 'pointerup' });
    if (host.hasPointerCapture?.(event.pointerId)) host.releasePointerCapture(event.pointerId);
    if (result.reset) applyPose();
    if (result.settled) settle();
    spin();
  };
  const wheel = (event) => { event.preventDefault(); if (orbit.wheel(event.deltaY).zoomed) applyPose(); };
  const key = (event) => {
    const changes = { ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    const { rotation, tilt } = orbit.state;
    if (event.key === 'Home') { orbit.setPose({ rotation: 0, tilt: 0 }); orbit.zoomBy(0); } // zoom clamps back to 1x
    else if (event.key === '+' || event.key === '=') orbit.zoomBy(1.2);
    else if (event.key === '-') orbit.zoomBy(1 / 1.2);
    else if (changes[event.key]) orbit.setPose({ rotation: rotation + changes[event.key][0], tilt: tilt + changes[event.key][1] });
    else return;
    hold.cancel(); event.preventDefault(); applyPose(); settle();
  };
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up); host.addEventListener('lostpointercapture', up);
  host.addEventListener('wheel', wheel, { passive: false }); host.addEventListener('keydown', key);
  return {
    load, setPose, cancelHold: () => hold.cancel(), get mesh() { return mesh; },
    zoomBy(factor) { orbit.zoomBy(factor); applyPose(); },
    async artifacts() { if (!mesh || !canvas) throw new Error('MODEL_MISSING'); if (!exportsPromise) exportsPromise = exportArtifacts(mesh, canvas).catch((error) => { exportsPromise = null; throw error; }); return exportsPromise; },
    dispose() {
      disposed = true; revision++; cancelAnimationFrame(frame); frame = 0; hold.dispose(); orbit.reset(); observer?.disconnect(); window.removeEventListener('resize', resize);
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up); host.removeEventListener('lostpointercapture', up); host.removeEventListener('wheel', wheel); host.removeEventListener('keydown', key);
      freeObject(); renderer?.domElement.removeEventListener('webglcontextlost', contextLost); renderer?.dispose(); host.replaceChildren();
    },
  };
}

// Deliberately manual, local-only brush refinement. No person detector is simulated.
export function createMaskEditor(canvas, image, initial, { onChange = () => {}, label = '' } = {}) {
  const w = 256, h = Math.max(1, Math.round(w * (image.naturalHeight || image.height) / (image.naturalWidth || image.width)));
  const scale = Math.min(1, 512 / h), width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
  const mask = { width, height, data: new Uint8Array(width * height) };
  if (initial?.data) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) mask.data[y * width + x] = initial.data[Math.min(initial.height - 1, Math.floor(y / height * initial.height)) * initial.width + Math.min(initial.width - 1, Math.floor(x / width * initial.width))] || 0;
  canvas.width = width * 2; canvas.height = height * 2; canvas.tabIndex = 0; canvas.setAttribute('aria-label', label);
  const ctx = canvas.getContext('2d'), overlay = document.createElement('canvas'); overlay.width = width; overlay.height = height;
  const overlayCtx = overlay.getContext('2d'); let erasing = false, radius = 8, pointer = null, cursor = { x: width / 2, y: height / 2 };
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = overlayCtx.createImageData(width, height);
    for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) { pixels.data[i * 4] = 188; pixels.data[i * 4 + 1] = 71; pixels.data[i * 4 + 2] = 43; pixels.data[i * 4 + 3] = 140; }
    overlayCtx.putImageData(pixels, 0, 0); ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.arc(cursor.x * 2, cursor.y * 2, radius * 2, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }
  function brush() {
    for (let y = Math.max(0, Math.floor(cursor.y - radius)); y < Math.min(height, cursor.y + radius); y++) for (let x = Math.max(0, Math.floor(cursor.x - radius)); x < Math.min(width, cursor.x + radius); x++) {
      if (Math.hypot(x - cursor.x, y - cursor.y) <= radius) mask.data[y * width + x] = erasing ? 0 : 255;
    }
    draw(); onChange(mask);
  }
  function locate(event) { const rect = canvas.getBoundingClientRect(); cursor = { x: (event.clientX - rect.left) / rect.width * width, y: (event.clientY - rect.top) / rect.height * height }; }
  const down = (event) => { if (!event.isPrimary) { pointer = null; return; } pointer = event.pointerId; canvas.setPointerCapture?.(pointer); locate(event); brush(); };
  const move = (event) => { if (pointer !== event.pointerId) return; locate(event); brush(); };
  const up = () => { pointer = null; };
  const key = (event) => {
    const shifts = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, -3], ArrowDown: [0, 3] };
    if (shifts[event.key]) { cursor.x = Math.max(0, Math.min(width - 1, cursor.x + shifts[event.key][0])); cursor.y = Math.max(0, Math.min(height - 1, cursor.y + shifts[event.key][1])); draw(); }
    else if (event.key === ' ' || event.key === 'Enter') brush(); else return;
    event.preventDefault();
  };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('keydown', key); draw();
  return {
    mask, setErase(value) { erasing = value; }, setRadius(value) { radius = Math.max(2, Math.min(24, Number(value) || 8)); draw(); },
    clear() { mask.data.fill(0); draw(); onChange(mask); },
    dispose() { pointer = null; canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('keydown', key); },
  };
}
