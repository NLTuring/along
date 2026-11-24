// Along — the clay bench ("捏泥工作台"). Clay engine from 捏个 PINCH (team-owned, ported in
// mobile/pinch). Start from a lump, a tile, a cup or a hut — or send a photo to AI (20 points)
// and pinch what comes back. Put a travel photo on the clay, then save, export or share it.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { toast, openSheet, closeSheet } from './ui.js';
import { go, replace, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { api, upload, fetchProtectedMedia, getRuntimeConfig } from './api.js';
import { listMedia, addFiles, addSamples, urlFor } from './media.js';
import { mediaName } from './seed-text.js';
import { createClayStage, BRUSHES, CLAY_COLORS, AlongClay } from './clay-stage.js';
import { readGLB, writeGLB, writeSTL, computeNormals, partColors } from './clay-files.js';
import { saveProject, getProject, newProjectId } from './clay-projects.js';
import { confirmSpend, pointsError, pointsMode, newKey, insufficient, PRICES, onPointsChange } from './points.js';
import { setDraft, takeDraft } from './workshop-draft.js';
import { TEMPLATE_KEYS, TEMPLATE_SYMMETRY, normalizeMesh, sceneFromLayout } from './vendor/clay.js';

const SIZE_STEPS = [5, 9, 14, 22];
function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
function toCanvas(image, max = 1600) {
  const scale = Math.min(1, max / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const c = document.createElement('canvas'); c.width = Math.round((image.naturalWidth || image.width) * scale); c.height = Math.round((image.naturalHeight || image.height) * scale);
  c.getContext('2d').drawImage(image, 0, 0, c.width, c.height); return c;
}
const canvasBlob = (canvas, type = 'image/jpeg', q = 0.88) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ENCODE'))), type, q));
function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function renderClay(root, param) {
  const session = getSession();
  const owner = session?.id || session?.email;
  let disposed = false, stage = null, project = null, busy = false, saveTimer = 0, photoItem = null, loaded = false;
  root.innerHTML = `<section class="page page--flow clay-page">
    <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('clay.title')}</h1></header>
    <div data-body></div></section>`;
  root.querySelector('[data-back]').onclick = () => back('workshop');
  const body = root.querySelector('[data-body]');
  if (!session) {
    body.innerHTML = `<div class="empty"><p class="t-body">${te('clay.signin')}</p><button class="btn btn--primary" data-signin>${te('you.signin')}</button></div>`;
    body.querySelector('[data-signin]').onclick = () => openLogin();
    return () => {};
  }

  // ───── start: pick a shape or ask AI ─────
  function startScreen() {
    const ai = getRuntimeConfig().ai?.meshAvailable && pointsMode() === 'online';
    body.innerHTML = `<p class="t-body">${te('clay.start.sub')}</p>
      <ul class="clay-starts">${TEMPLATE_KEYS.map((key) => `<li><button class="clay-start" data-template="${key}">
        <span class="clay-start__art clay-start__art--${key}" aria-hidden="true"></span>
        <strong>${te(`clay.template.${key}`)}</strong><small>${te(`clay.template.${key}.desc`)}</small></button></li>`).join('')}</ul>
      <section class="clay-ai">
        <h2 class="t-heading">${icon('spark', { size: 20 })}${te('clay.ai.title')}</h2>
        <p class="t-small">${te('clay.ai.sub', { n: PRICES.AI_MODEL })}</p>
        ${ai ? '' : `<p class="note t-small">${te(pointsMode() === 'local' ? 'clay.ai.local' : 'clay.ai.off')}</p>`}
        <label class="btn btn--outline clay-ai__pick ${ai ? '' : 'is-disabled'}"><input class="sr-only" type="file" accept="image/*" data-ai-file ${ai ? '' : 'disabled'} /><span>${te('clay.ai.pick', { n: PRICES.AI_MODEL })}</span></label>
        <div data-ai-jobs></div>
      </section>`;
    if (ai) loadJobs();
  }
  async function loadJobs() {
    try {
      const { items } = await api('/ai-models');
      if (disposed) return;
      const host = body.querySelector('[data-ai-jobs]');
      if (!host || !items.length) return;
      host.innerHTML = `<h3 class="t-label">${te('clay.ai.recent')}</h3><ul class="ai-jobs">${items.slice(0, 5).map((job) => `<li class="ai-job">
        <span>${te(`clay.ai.status.${job.status}`)}${job.status === 'RUNNING' || job.status === 'QUEUED' ? ` · ${job.progress}%` : ''}${job.refunded ? ` · ${te('clay.ai.refunded', { n: job.cost })}` : ''}</span>
        ${job.status === 'READY' ? `<button class="btn btn--small btn--outline" data-ai-open="${esc(job.id)}">${te('clay.ai.open')}</button>` : job.status === 'FAILED' ? '' : `<button class="btn btn--small btn--text" data-ai-watch="${esc(job.id)}">${te('clay.ai.watch')}</button>`}
      </li>`).join('')}</ul>`;
    } catch { /* the list is a convenience */ }
  }
  async function startAI(file) {
    if (busy) return;
    if (!await confirmSpend({ item: 'AI_MODEL', cost: PRICES.AI_MODEL, title: t('clay.ai.confirm'), detail: t('clay.ai.confirm.detail') })) return;
    busy = true;
    const host = body.querySelector('[data-ai-jobs]');
    host.innerHTML = `<p class="t-small" role="status">${te('clay.ai.uploading')}</p>`;
    try {
      const form = new FormData();
      form.append('idempotencyKey', newKey()); form.append('consent', 'true'); form.append('image', file, 'photo.jpg');
      const { job } = await upload('/ai-models', form);
      if (job.status === 'FAILED') { toast(t('clay.ai.failed.refunded', { n: job.cost })); await loadJobs(); return; }
      await watchJob(job.id);
    } catch (error) {
      toast(error?.status === 503 ? t('clay.ai.off') : insufficient(error) ? t('points.error.short') : pointsError(error));
      host.innerHTML = '';
      if (insufficient(error)) go('points');
    } finally { busy = false; }
  }
  async function watchJob(jobId) {
    const host = body.querySelector('[data-ai-jobs]');
    for (let i = 0; i < 400 && !disposed; i++) {
      const { job } = await api(`/ai-models/${encodeURIComponent(jobId)}`);
      if (disposed) return;
      if (host) host.innerHTML = `<div class="ai-progress"><progress max="100" value="${job.progress}"></progress><span>${te(`clay.ai.status.${job.status}`)} · ${job.progress}%</span></div>`;
      if (job.status === 'READY') { if (!disposed) await openAI(job); return; }
      if (job.status === 'FAILED') { toast(t('clay.ai.failed.refunded', { n: job.cost })); await loadJobs(); return; }
      await new Promise((r) => setTimeout(r, 3500));
    }
  }
  async function openAI(job) {
    // Vision-model jobs return coloured clay parts; mesh services return a GLB file.
    if (job.layout) { await fromRecipe({ parts: job.layout.parts }, { source: 'AI', title: job.layout.title || t('clay.ai.title.made') }); return; }
    const blob = await fetchProtectedMedia(job.glbUrl, { maxBytes: 32 * 1024 * 1024 });
    if (disposed) return;
    await fromModel(new Uint8Array(await blob.arrayBuffer()), { source: 'AI', title: t('clay.ai.title.made') });
  }
  /** A coloured parts recipe (AI layout, gallery example): kept as parts so it reopens exactly. */
  async function fromRecipe(recipe, { source, title, galleryId = null }) {
    const next = { id: newProjectId(), owner, title, start: { kind: 'recipe', source, galleryId, parts: recipe.parts }, strokes: [], color: CLAY_COLORS[0], symmetry: 'none', createdAt: Date.now() };
    try { engineFor(next); } catch { toast(t('clay.model.invalid')); return false; }
    return open(next);
  }

  // ───── open the bench ─────
  async function fromModel(bytes, { source, title, galleryId = null }) {
    let parsed;
    try { parsed = readGLB(bytes); } catch (error) { toast(t(error.message === 'MODEL_COMPRESSED' ? 'clay.model.compressed' : 'clay.model.invalid')); return false; }
    const mesh = normalizeMesh({ positions: parsed.positions, normals: computeNormals(parsed.positions, parsed.indices), indices: parsed.indices }, 70);
    const next = { id: newProjectId(), owner, title, start: { kind: 'mesh', source, galleryId }, mesh: { positions: mesh.positions, indices: mesh.indices }, strokes: [], color: CLAY_COLORS[0], symmetry: 'none', createdAt: Date.now() };
    // Build once before saving: a model the engine cannot turn into clay is never stored.
    try { engineFor(next); } catch { toast(t('clay.model.invalid')); return false; }
    return open(next);
  }
  async function newFromTemplate(key) {
    return open({ id: newProjectId(), owner, title: t(`clay.template.${key}`), start: { kind: 'template', key }, strokes: [], color: CLAY_COLORS[0], symmetry: TEMPLATE_SYMMETRY[key], createdAt: Date.now() });
  }
  // One tap makes one piece: a second tap while saving is ignored, and leaving the page cancels the jump.
  let opening = false;
  async function open(next) {
    if (opening || disposed) return false;
    opening = true;
    try { await saveProject(next); } catch { opening = false; toast(t('error.STORAGE')); return false; }
    if (disposed) return false;
    replace(`clay/${next.id}`);
    return true;
  }
  function engineFor(p) {
    if (p.start.kind === 'template') return AlongClay.fromTemplate(p.start.key, 96);
    if (p.start.kind === 'recipe') { const { scene, colors } = sceneFromLayout(p.start.parts); return AlongClay.fromScene(scene, colors, 96); }
    const positions = p.mesh.positions instanceof Float32Array ? p.mesh.positions : new Float32Array(p.mesh.positions);
    const indices = p.mesh.indices instanceof Uint32Array ? p.mesh.indices : new Uint32Array(p.mesh.indices);
    return AlongClay.fromMesh({ positions, normals: computeNormals(positions, indices), indices }, 96);
  }

  function bench() {
    body.innerHTML = `
      <div class="clay-stage" data-stage role="application" aria-label="${te('clay.stage.alt')}" aria-describedby="clay-help"><p class="clay-stage__loading">${te('clay.loading')}</p></div>
      <p class="t-small clay-help" id="clay-help">${te('clay.help')}</p>
      <div class="clay-tools" role="toolbar" aria-label="${te('clay.tools')}">
        <div class="clay-brushes" role="radiogroup" aria-label="${te('clay.brush')}">${BRUSHES.map((b) => `<label class="clay-brush"><input type="radio" name="brush" value="${b}" ${b === 'build' ? 'checked' : ''} /><span>${icon(`brush-${b}`, { size: 22 })}<small>${te(`clay.brush.${b}`)}</small></span></label>`).join('')}</div>
        <div class="clay-row">
          <label class="clay-slider"><span>${te('clay.size')}</span><input type="range" min="0" max="3" step="1" value="1" data-size /></label>
          <label class="clay-slider"><span>${te('clay.strength')}</span><input type="range" min="0.2" max="1" step="0.1" value="0.6" data-strength /></label>
        </div>
        <div class="clay-row">
          <div class="segmented segmented--compact" role="radiogroup" aria-label="${te('clay.symmetry')}">${['mirror', 'radial', 'none'].map((s) => `<label class="segmented__item"><input type="radio" name="sym" value="${s}" ${project.symmetry === s ? 'checked' : ''} /><span>${te(`clay.sym.${s}`)}</span></label>`).join('')}</div>
          <button class="icon-btn" data-undo disabled aria-label="${te('clay.undo')}">${icon('undo')}</button>
          <button class="icon-btn" data-redo disabled aria-label="${te('clay.redo')}">${icon('redo')}</button>
          <button class="icon-btn" data-turnmode aria-pressed="false" aria-label="${te('clay.turnmode')}">${icon('hand')}</button>
        </div>
        <div class="clay-colors" role="radiogroup" aria-label="${te('clay.color')}">${CLAY_COLORS.map((c, i) => `<label class="clay-color"><input type="radio" name="color" value="${c}" ${project.color === c ? 'checked' : ''} /><span style="--clay:${c}" aria-label="${te(`clay.color.${i}`)}"></span></label>`).join('')}</div>
      </div>
      <section class="clay-photo">
        <h2 class="t-heading">${icon('photo', { size: 20 })}${te('clay.photo.title')}</h2>
        <p class="t-small">${te('clay.photo.sub')}</p>
        <div class="clay-row"><button class="btn btn--outline" data-photo-pick>${te('clay.photo.pick')}</button><button class="btn btn--text" data-photo-clear hidden>${te('clay.photo.clear')}</button></div>
        <div class="clay-row" data-photo-modes hidden>
          <div class="segmented segmented--compact" role="radiogroup" aria-label="${te('clay.photo.mode')}">${['view', 'wrap'].map((m, i) => `<label class="segmented__item"><input type="radio" name="photomode" value="${m}" ${i === 0 ? 'checked' : ''} /><span>${te(`clay.photo.${m}`)}</span></label>`).join('')}</div>
          <label class="clay-slider"><span>${te('clay.photo.scale')}</span><input type="range" min="0.6" max="1.6" step="0.05" value="1" data-photo-scale /></label>
          <button class="btn btn--small btn--outline" data-photo-here>${te('clay.photo.here')}</button>
        </div>
      </section>
      <div class="clay-actions">
        <label class="field"><span class="t-label">${te('clay.name')}</span><input class="input" maxlength="60" data-title value="${esc(project.title || '')}" /></label>
        <div class="craft-action-row">
          <button class="btn btn--outline" data-export="glb">${icon('download', { size: 18 })}GLB</button>
          <button class="btn btn--outline" data-export="stl">${icon('download', { size: 18 })}STL</button>
        </div>
        <button class="btn btn--primary" data-share>${icon('upload', { size: 18 })}${te('clay.share')}</button>
        <p class="note t-small">${te('clay.credit')}</p>
      </div>`;
    const host = body.querySelector('[data-stage]');
    stage = createClayStage(host, {
      onChange: () => { refreshHistory(); scheduleSave(); },
      // A note over the canvas, not instead of it, so the view comes back when the GL context does.
      onState: (state) => {
        host.querySelector('.clay-stage__note')?.remove();
        if (state === 'WEBGL_BACK') return;
        host.insertAdjacentHTML('beforeend', `<p class="clay-stage__loading clay-stage__note">${te(state === 'WEBGL_LOST' ? 'clay.webgl.lost' : 'clay.webgl')}</p>`);
      },
    });
    stage.setSymmetry(project.symmetry); stage.setColor(project.color);
    let engine;
    try { engine = engineFor(project); } catch { host.innerHTML = `<p class="clay-stage__loading">${te('clay.model.invalid')}</p>`; return; }
    stage.load(engine, project.strokes || []).then(async () => {
      if (disposed) return;
      loaded = true;
      refreshHistory();
      if (project.photo?.mediaId) await restorePhoto(project.photo);
    }).catch(() => { if (!disposed) host.innerHTML = `<p class="clay-stage__loading">${te('clay.model.invalid')}</p>`; });
  }
  function refreshHistory() {
    const clay = stage?.clay;
    body.querySelector('[data-undo]')?.toggleAttribute('disabled', !clay?.canUndo);
    body.querySelector('[data-redo]')?.toggleAttribute('disabled', !clay?.canRedo);
  }
  function scheduleSave() {
    if (disposed) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 900);
  }
  // Saves this page's own piece only, and never before its strokes were replayed.
  async function persist() {
    if (!project || !stage?.clay || !loaded) return;
    project.strokes = stage.clay.strokes;
    const title = body.querySelector('[data-title]');
    if (title) project.title = title.value.trim().slice(0, 60);
    const shot = stage.failed ? null : stage.snapshot(240);
    if (shot) project.thumb = shot.toDataURL('image/jpeg', 0.7);
    try { await saveProject(project); } catch { if (!disposed) toast(t('error.STORAGE')); }
  }

  // ───── photos on the clay ─────
  async function pickPhoto() {
    let items = [];
    try { items = await listMedia(); } catch { /* still lets the traveller add a file */ }
    openSheet({
      title: te('clay.photo.pick'),
      body: `<div class="studio-tools"><label class="btn btn--outline studio-tools__add"><input class="sr-only" type="file" accept="image/*" data-sheet-file /><span>${te('studio.add')}</span></label>${items.length ? '' : `<button class="btn btn--text" data-sheet-samples>${te('beads.samples')}</button>`}</div>
        <ul class="photo-grid">${items.map((item) => `<li><button class="photo" data-sheet-photo="${esc(item.id)}" aria-label="${esc(mediaName(item))}"><img src="${esc(urlFor(item))}" alt="" loading="lazy" /></button></li>`).join('')}</ul>`,
      onMount(panel) {
        panel.addEventListener('change', async (event) => {
          if (!event.target.matches('[data-sheet-file]')) return;
          const result = await addFiles(event.target.files); closeSheet();
          if (result.added[0]) { const media = await listMedia(); await usePhoto(media.find((m) => m.id === result.added[0])); }
        });
        panel.addEventListener('click', async (event) => {
          if (event.target.closest('[data-sheet-samples]')) { await addSamples(); closeSheet(); pickPhoto(); return; }
          const id = event.target.closest('[data-sheet-photo]')?.dataset.sheetPhoto;
          if (id) { closeSheet(); await usePhoto(items.find((m) => m.id === id)); }
        });
      },
    });
  }
  async function usePhoto(item, mode = 'view', scale = 1, forward = null, projector = null) {
    if (!item || disposed) return;
    try {
      const canvas = toCanvas(await loadImage(urlFor(item)));
      if (disposed) return;
      photoItem = item;
      await stage.setPhoto(canvas, mode, scale, forward, projector);
      if (disposed || !stage.photo) return;
      // The whole projector is kept so a reopened piece shows the photo exactly where it was.
      project.photo = { mediaId: item.id, mode, scale, forward: stage.photo.projector.forward, projector: stage.photo.projector };
      body.querySelector('[data-photo-modes]').hidden = false;
      body.querySelector('[data-photo-clear]').hidden = false;
      body.querySelector(`[name=photomode][value=${mode}]`).checked = true;
      body.querySelector('[data-photo-scale]').value = String(scale);
      scheduleSave();
    } catch { toast(t('craft.photo.error')); }
  }
  async function restorePhoto(saved) {
    const media = await listMedia().catch(() => []);
    const item = media.find((m) => m.id === saved.mediaId);
    if (item && !disposed) await usePhoto(item, saved.mode, saved.scale, saved.forward, saved.projector || null);
  }

  // ───── export and share ─────
  async function glbBytes() {
    const data = stage.exportData();
    let texture = null;
    if (data.texture) texture = { bytes: new Uint8Array(await (await canvasBlob(data.texture, 'image/jpeg', 0.86)).arrayBuffer()), mime: 'image/jpeg' };
    const colors = !texture && data.partColors?.length && data.mesh.owners ? partColors(data.mesh.owners, data.partColors) : null;
    return writeGLB(data.mesh, { uvs: data.uvs, texture, colors, color: hexColor(data.color), name: project.title || 'Along clay' });
  }
  async function exportFile(kind) {
    if (busy || !stage?.clay) return;
    busy = true;
    try {
      const name = `along-clay-${(project.title || 'clay').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30)}`;
      if (kind === 'glb') download(await glbBytes(), `${name}.glb`, 'model/gltf-binary');
      else download(writeSTL(stage.clay.fullMesh()), `${name}.stl`, 'model/stl');
      toast(t(window.Android ? 'craft3d.download.native' : 'craft3d.download.started'));
    } catch { toast(t('craft3d.export.error')); }
    finally { busy = false; }
  }
  async function share() {
    if (busy || !stage?.clay) return;
    busy = true;
    try {
      await persist();
      const cover = stage.snapshot(900);
      // A piece started from coloured parts keeps them only while unsculpted: strokes are not part of a recipe.
      const recipe = project.start.kind === 'recipe' && !project.strokes.length ? { parts: project.start.parts } : null;
      setDraft('gallery', { kind: 'CLAY', title: project.title, glb: await glbBytes(), cover, recipe, remixOf: project.start.galleryId || null });
      go('gallery/new');
    } catch { toast(t('craft3d.export.error')); }
    finally { busy = false; }
  }

  // ───── events ─────
  body.addEventListener('click', async (event) => {
    const template = event.target.closest('[data-template]')?.dataset.template;
    if (template) { await newFromTemplate(template); return; }
    const open = event.target.closest('[data-ai-open]')?.dataset.aiOpen;
    if (open) { try { const { job } = await api(`/ai-models/${encodeURIComponent(open)}`); await openAI(job); } catch (error) { toast(pointsError(error)); } return; }
    const watch = event.target.closest('[data-ai-watch]')?.dataset.aiWatch;
    if (watch) { watchJob(watch).catch((error) => toast(pointsError(error))); return; }
    if (!stage) return;
    if (event.target.closest('[data-undo]')) stage.undo();
    else if (event.target.closest('[data-redo]')) stage.redo();
    else if (event.target.closest('[data-turnmode]')) {
      const button = event.target.closest('[data-turnmode]'), on = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(on)); stage.setMode(on ? 'turn' : 'sculpt');
    }
    else if (event.target.closest('[data-photo-pick]')) pickPhoto();
    else if (event.target.closest('[data-photo-clear]')) { stage.clearPhoto(); delete project.photo; photoItem = null; body.querySelector('[data-photo-modes]').hidden = true; event.target.closest('[data-photo-clear]').hidden = true; scheduleSave(); }
    else if (event.target.closest('[data-photo-here]')) { if (photoItem) usePhoto(photoItem, body.querySelector('[name=photomode]:checked').value, Number(body.querySelector('[data-photo-scale]').value)); }
    else if (event.target.closest('[data-export]')) exportFile(event.target.closest('[data-export]').dataset.export);
    else if (event.target.closest('[data-share]')) share();
  });
  body.addEventListener('change', (event) => {
    const el = event.target;
    if (el.matches('[data-ai-file]') && el.files[0]) { startAI(el.files[0]); el.value = ''; return; }
    if (!stage) return;
    if (el.name === 'brush') stage.setBrush(el.value);
    else if (el.name === 'sym') { stage.setSymmetry(el.value); project.symmetry = el.value; scheduleSave(); }
    else if (el.name === 'color') { stage.setColor(el.value); project.color = el.value; scheduleSave(); }
    else if (el.name === 'photomode' && photoItem) usePhoto(photoItem, el.value, Number(body.querySelector('[data-photo-scale]').value), project.photo?.forward);
    else if (el.matches('[data-photo-scale]') && photoItem) usePhoto(photoItem, body.querySelector('[name=photomode]:checked').value, Number(el.value), project.photo?.forward);
  });
  // Typing saves as you go, so the Android back button cannot lose a new name.
  body.addEventListener('input', (event) => { if (event.target.matches('[data-title]') && project) { project.title = event.target.value.trim().slice(0, 60); scheduleSave(); } });
  body.addEventListener('input', (event) => {
    if (!stage) return;
    if (event.target.matches('[data-size]')) stage.setRadius(SIZE_STEPS[Number(event.target.value)]);
    else if (event.target.matches('[data-strength]')) stage.setStrength(Number(event.target.value));
  });

  // ───── route ─────
  (async () => {
    // A model handed over from the gallery ("remix") opens on a fresh bench.
    const sent = param === 'new' ? takeDraft('clay') : null;
    if (sent?.parts && await fromRecipe(sent, { source: 'GALLERY', title: sent.title || t('clay.untitled'), galleryId: sent.galleryId })) return;
    if (sent?.glb && !sent.parts && await fromModel(sent.glb, { source: 'GALLERY', title: sent.title || t('clay.untitled'), galleryId: sent.galleryId })) return;
    if (disposed) return;
    if (param === 'new') { startScreen(); return; }
    try { project = await getProject(param, owner); } catch { project = null; }
    if (disposed) return;
    if (!project) { body.innerHTML = `<p class="t-body">${te('clay.notfound')}</p><button class="btn btn--primary" data-new>${te('clay.new')}</button>`; body.querySelector('[data-new]').onclick = () => go('clay/new'); return; }
    bench();
  })();
  const offPoints = onPointsChange(() => {});
  return () => {
    clearTimeout(saveTimer);
    // The save takes its snapshot synchronously before the first await, so the stage can go right after.
    if (stage?.clay) persist();
    disposed = true;
    stage?.dispose();
    offPoints();
  };
}
function hexColor(hex) { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); }
