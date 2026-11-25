// Along — the clay bench ("捏泥工作台"). Clay engine from 捏个 PINCH (team-owned, ported in
// mobile/pinch). Start from a lump, a tile, a cup or a hut — or send a photo, a short video or a
// few words to AI (20 points) and pinch what comes back. One AI drafts the rough model, a second
// checks and repairs it. Put a travel photo on the clay, then save, export or share it.
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
import { createModelStage, facesPlusX } from './model-stage.js';
import { readGLB, writeGLB, writeSTL, computeNormals, partColors } from './clay-files.js';
import { saveProject, getProject, newProjectId } from './clay-projects.js';
import { confirmSpend, pointsError, pointsMode, newKey, insufficient, PRICES, onPointsChange } from './points.js';
import { setDraft, takeDraft } from './workshop-draft.js';
import { TEMPLATE_KEYS, TEMPLATE_SYMMETRY, normalizeMesh, sceneFromLayout } from './vendor/clay.js';
import { AI_KINDS, AI_ENGINES, ENGINE_ITEM, PROMPT_MIN, PROMPT_MAX, VIDEO_MAX_SECONDS, cleanPrompt, videoFrames, jobForm } from './clay-inputs.js';

const EXAMPLES = [0, 1, 2, 3];
// Codes from the phone (video decoding) and from the server, turned into words a traveller can act on.
const AI_ERRORS = new Map([['VIDEO_TOO_LONG', 'clay.ai.err.long'], ['VIDEO_UNREADABLE', 'clay.ai.err.video'], ['VIDEO_FRAMES_REQUIRED', 'clay.ai.err.video'], ['ENCODE', 'clay.ai.err.video'],
  ['VIDEO_TIMEOUT', 'clay.ai.err.timeout'], ['MESH_KIND_UNSUPPORTED', 'clay.ai.err.kind'], ['PROMPT_REQUIRED', 'clay.ai.err.prompt']]);
const kindOf = (job) => (AI_KINDS.includes(job?.kind) ? job.kind : 'image');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
        <p class="t-small">${te('clay.ai.sub', { a: engineCost('relay'), b: engineCost('tripo') })}</p>
        ${ai ? '' : `<p class="note t-small">${te(pointsMode() === 'local' ? 'clay.ai.local' : 'clay.ai.off')}</p>`}
        <div class="clay-engines" role="radiogroup" aria-label="${te('clay.ai.engine')}">${AI_ENGINES.map((e) => `<label class="clay-engine">
          <input type="radio" name="aiengine" value="${e}" ${e === engine ? 'checked' : ''} ${ai ? '' : 'disabled'} />
          <span><strong>${te(`clay.ai.engine.${e}`)}</strong><small>${te(`clay.ai.engine.${e}.desc`)}</small><em class="t-num" data-engine-cost="${e}">${te('points.amount', { n: engineCost(e) })}</em></span></label>`).join('')}</div>
        <p class="t-small clay-ai__duo" data-ai-duo hidden>${icon('spark', { size: 16 })}${te('clay.ai.duo')}</p>
        <div class="segmented segmented--compact clay-ai__kinds" role="radiogroup" aria-label="${te('clay.ai.kind')}">${AI_KINDS.map((k, i) => `<label class="segmented__item"><input type="radio" name="aikind" value="${k}" ${i === 0 ? 'checked' : ''} ${ai ? '' : 'disabled'} /><span>${te(`clay.ai.kind.${k}`)}</span></label>`).join('')}</div>
        <div class="clay-ai__pane" data-ai-pane="image">
          <label class="btn btn--outline clay-ai__pick ${ai ? '' : 'is-disabled'}"><input class="sr-only" type="file" accept="image/*" data-ai-file ${ai ? '' : 'disabled'} /><span data-cost-label="clay.ai.pick">${te('clay.ai.pick', { n: engineCost() })}</span></label>
        </div>
        <div class="clay-ai__pane" data-ai-pane="video" hidden>
          <label class="btn btn--outline clay-ai__pick ${ai ? '' : 'is-disabled'}"><input class="sr-only" type="file" accept="video/*" data-ai-video ${ai ? '' : 'disabled'} /><span data-cost-label="clay.ai.pick.video">${te('clay.ai.pick.video', { n: engineCost() })}</span></label>
          <p class="t-small" data-engine-hint="relay">${te('clay.ai.video.hint', { s: VIDEO_MAX_SECONDS })}</p>
          <p class="t-small" data-engine-hint="tripo" hidden>${te('clay.ai.video.hint.tripo', { s: VIDEO_MAX_SECONDS })}</p>
        </div>
        <div class="clay-ai__pane" data-ai-pane="text" hidden>
          <label class="field"><span class="t-label">${te('clay.ai.prompt')}</span><textarea class="input input--area" rows="3" maxlength="${PROMPT_MAX}" data-ai-prompt placeholder="${te('clay.ai.prompt.ph')}" ${ai ? '' : 'disabled'}></textarea></label>
          <div class="clay-ai__examples" role="group" aria-label="${te('clay.ai.examples')}">${EXAMPLES.map((i) => `<button type="button" class="clay-ai__example" data-ai-example="${i}" ${ai ? '' : 'disabled'}>${te(`clay.ai.example.${i}`)}</button>`).join('')}</div>
          <button class="btn btn--primary" data-ai-send ${ai ? '' : 'disabled'}>${icon('spark', { size: 18 })}<span data-cost-label="clay.ai.send">${te('clay.ai.send', { n: engineCost() })}</span></button>
        </div>
        <div data-ai-jobs></div>
      </section>`;
    if (ai) { loadConfig(); loadJobs(); }
  }
  // Two ways to make the model, each with its own price: the server's figure wins once it is known.
  let engine = 'relay';
  function engineCost(e = engine) {
    const fromServer = aiConfig?.engines?.find((x) => x.id === e)?.cost;
    return Number.isSafeInteger(fromServer) ? fromServer : PRICES[ENGINE_ITEM[e]];
  }
  const engineInfo = (e = engine) => aiConfig?.engines?.find((x) => x.id === e) || null;
  function paintEngine() {
    for (const label of body.querySelectorAll('[data-cost-label]')) label.textContent = t(label.dataset.costLabel, { n: engineCost() });
    for (const price of body.querySelectorAll('[data-engine-cost]')) price.textContent = t('points.amount', { n: engineCost(price.dataset.engineCost) });
    for (const hint of body.querySelectorAll('[data-engine-hint]')) hint.hidden = hint.dataset.engineHint !== engine;
    const duo = body.querySelector('[data-ai-duo]');
    if (duo) duo.hidden = !(engine === 'relay' && (engineInfo('relay')?.refine ?? aiConfig?.refine));
    // Each engine reads different inputs; keep the chosen one if it still fits.
    const info = engineInfo();
    const kinds = !aiConfig ? AI_KINDS : aiConfig.available === false ? [] : info ? (info.available ? info.kinds : []) : aiConfig.kinds || ['image'];
    for (const input of body.querySelectorAll('[name=aikind]')) {
      const off = !kinds.includes(input.value);
      input.disabled = off; input.closest('.segmented__item').classList.toggle('is-disabled', off);
    }
    const checked = body.querySelector('[name=aikind]:checked');
    if (checked?.disabled) { const first = body.querySelector('[name=aikind]:not(:disabled)'); if (first) { first.checked = true; showKind(first.value); } }
  }
  // Which inputs the server's AI can take (a mesh service may not read words), and whether a second AI refines.
  let aiConfig = null;
  async function loadConfig() {
    try { aiConfig = await api('/ai-models/config'); } catch { return; /* every kind stays offered; the server still says no */ }
    if (disposed) return;
    // An engine the server has not switched on cannot be picked; if the chosen one is off, take the other.
    for (const input of body.querySelectorAll('[name=aiengine]')) {
      const info = engineInfo(input.value), off = Boolean(aiConfig.engines) && !info?.available;
      input.disabled = off; input.closest('.clay-engine').classList.toggle('is-disabled', off);
    }
    const picked = body.querySelector('[name=aiengine]:checked');
    if (picked?.disabled) { const other = body.querySelector('[name=aiengine]:not(:disabled)'); if (other) { other.checked = true; engine = other.value; } }
    paintEngine();
  }
  function showKind(kind) {
    for (const pane of body.querySelectorAll('[data-ai-pane]')) pane.hidden = pane.dataset.aiPane !== kind;
  }
  function sendText() {
    const prompt = cleanPrompt(body.querySelector('[data-ai-prompt]')?.value);
    if (prompt.length < PROMPT_MIN) { toast(t('clay.ai.err.prompt')); body.querySelector('[data-ai-prompt]')?.focus(); return; }
    startAI({ kind: 'text', prompt });
  }
  // Frames are taken on the phone and shown for a moment, so the traveller sees exactly what the AI will get.
  async function sendVideo(file) {
    if (busy) return;
    busy = true;
    const host = body.querySelector('[data-ai-jobs]');
    host.innerHTML = `<p class="t-small" role="status">${te('clay.ai.frames.taking')}</p>`;
    let frames, urls = [];
    try { frames = await videoFrames(file); } catch (error) { toast(aiError(error)); host.innerHTML = ''; return; } finally { busy = false; }
    if (disposed) return;
    urls = frames.map((blob) => URL.createObjectURL(blob));
    host.innerHTML = `<p class="t-small">${te('clay.ai.frames.ready', { n: frames.length })}</p>
      <ul class="clay-ai__frames">${urls.map((url, i) => `<li><img src="${url}" alt="${te('clay.ai.frame.alt', { n: i + 1 })}" /></li>`).join('')}</ul>`;
    await wait(900);
    try { if (!disposed) await startAI({ kind: 'video', frames }, { keepHost: true }); } finally { urls.forEach((url) => URL.revokeObjectURL(url)); }
  }
  function aiError(error) {
    const key = AI_ERRORS.get(error?.code) || AI_ERRORS.get(error?.message);
    if (key) return t(key);
    return error?.status === 503 ? t('clay.ai.off') : insufficient(error) ? t('points.error.short') : pointsError(error);
  }
  async function loadJobs() {
    try {
      const { items } = await api('/ai-models');
      if (disposed) return;
      const host = body.querySelector('[data-ai-jobs]');
      if (!host || !items.length) return;
      host.innerHTML = `<h3 class="t-label">${te('clay.ai.recent')}</h3><ul class="ai-jobs">${items.slice(0, 5).map((job) => `<li class="ai-job">
        <span><em class="ai-job__kind">${te(`clay.ai.kind.${kindOf(job)}`)}</em>${job.engine === 'tripo' ? `<em class="ai-job__kind">${te('clay.ai.engine.tripo')}</em>` : ''}${te(`clay.ai.status.${job.status}`)}${job.status === 'RUNNING' || job.status === 'QUEUED' ? ` · ${job.progress}%` : ''}${job.refunded ? ` · ${te('clay.ai.refunded', { n: job.cost })}` : ''}</span>
        ${job.status === 'READY' ? `<button class="btn btn--small btn--outline" data-ai-open="${esc(job.id)}">${te('clay.ai.open')}</button>` : job.status === 'FAILED' ? '' : `<button class="btn btn--small btn--text" data-ai-watch="${esc(job.id)}">${te('clay.ai.watch')}</button>`}
      </li>`).join('')}</ul>`;
    } catch { /* the list is a convenience */ }
  }
  /** input: { kind: 'image', image } · { kind: 'video', frames } · { kind: 'text', prompt } */
  async function startAI(input, { keepHost = false } = {}) {
    if (busy) return;
    const kind = input.kind, using = engine;
    const detail = `${t(`clay.ai.confirm.engine.${using}`)} ${t(`clay.ai.confirm.detail.${kind}`)}`;
    if (!await confirmSpend({ item: ENGINE_ITEM[using], cost: engineCost(using), title: t(`clay.ai.confirm.${kind}`), detail })) {
      if (keepHost) body.querySelector('[data-ai-jobs]').innerHTML = '';
      return;
    }
    busy = true;
    const host = body.querySelector('[data-ai-jobs]');
    host.innerHTML = `<p class="t-small" role="status">${te(`clay.ai.uploading.${kind}`)}</p>`;
    try {
      const { job } = await upload('/ai-models', jobForm({ ...input, engine: using, key: newKey() }));
      if (job.status === 'FAILED') { toast(t('clay.ai.failed.refunded', { n: job.cost })); await loadJobs(); return; }
      await watchJob(job.id);
    } catch (error) {
      toast(aiError(error));
      host.innerHTML = '';
      if (insufficient(error)) go('points');
    } finally { busy = false; }
  }
  // Two steps the traveller can follow: the first AI drafts a rough model, the second repairs and details it.
  // A Tripo job is one step: Tripo makes the whole shape.
  function progressView(job, refine) {
    const tripo = job.engine === 'tripo';
    const step = job.stage === 'refine' ? 2 : 1;
    const steps = (tripo ? ['tripo'] : refine ? [1, 2] : [1]).map((n, i) => `<li class="ai-step ${i + 1 < step || job.status === 'READY' ? 'is-done' : i + 1 === step ? 'is-now' : ''}" ${i + 1 === step && job.status !== 'READY' ? 'aria-current="step"' : ''}>
      <span class="ai-step__dot" aria-hidden="true">${i + 1}</span><span><strong>${te(`clay.ai.step.${n}`)}</strong><small>${te(`clay.ai.step.${n}.desc`)}</small></span></li>`).join('');
    return `<div class="ai-progress" role="status"><ol class="ai-steps">${steps}</ol>
      <progress max="100" value="${job.progress}" aria-label="${te('clay.ai.progress')}"></progress><span>${te(`clay.ai.status.${job.status}`)} · ${job.progress}%</span></div>`;
  }
  async function watchJob(jobId) {
    const host = body.querySelector('[data-ai-jobs]');
    let refine = Boolean(aiConfig?.refine);
    for (let i = 0; i < 400 && !disposed; i++) {
      const { job } = await api(`/ai-models/${encodeURIComponent(jobId)}`);
      if (disposed) return;
      // Shown as two steps once a second AI is known to be on, or as soon as one is seen working.
      refine = refine || job.stage === 'refine';
      if (host) host.innerHTML = progressView(job, refine);
      if (job.status === 'READY') { if (!disposed) await openAI(job); return; }
      if (job.status === 'FAILED') { toast(t('clay.ai.failed.refunded', { n: job.cost })); await loadJobs(); return; }
      await wait(3500);
    }
  }
  async function openAI(job) {
    // Vision-model jobs return coloured clay parts; mesh services return a GLB file.
    const title = job.layout?.title || t(`clay.ai.title.made.${kindOf(job)}`);
    if (job.layout) { await fromRecipe({ parts: job.layout.parts }, { source: 'AI', title, notes: job.layout.notes }); return; }
    const blob = await fetchProtectedMedia(job.glbUrl, { maxBytes: 32 * 1024 * 1024 });
    if (disposed) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // A painted model keeps its colours: it opens as a model to look at, export and share.
    if (hasTexture(bytes)) await fromPainted(bytes, { source: 'AI', title });
    else await fromModel(bytes, { source: 'AI', title });
  }
  /** A GLB with its own colours (Tripo): stored as it came, shown as it is. */
  async function fromPainted(bytes, { source, title, galleryId = null }) {
    return open({ id: newProjectId(), owner, title, start: { kind: 'painted', source, galleryId }, glb: bytes, strokes: [], color: CLAY_COLORS[0], symmetry: 'none', createdAt: Date.now() });
  }
  /** A coloured parts recipe (AI layout, gallery example): kept as parts so it reopens exactly. */
  async function fromRecipe(recipe, { source, title, galleryId = null, notes = null }) {
    // What the second AI changed, kept as short text so the bench can show it later.
    const kept = Array.isArray(notes) ? notes.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.slice(0, 120)).slice(0, 8) : [];
    const next = { id: newProjectId(), owner, title, start: { kind: 'recipe', source, galleryId, parts: recipe.parts, ...(kept.length ? { notes: kept } : {}) }, strokes: [], color: CLAY_COLORS[0], symmetry: 'none', createdAt: Date.now() };
    try { engineFor(next); } catch { toast(t('clay.model.invalid')); return false; }
    return open(next);
  }

  // ───── open the bench ─────
  async function fromModel(bytes, { source, title, galleryId = null }) {
    let parsed;
    try { parsed = readGLB(bytes); } catch (error) { toast(t(error.message === 'MODEL_COMPRESSED' ? 'clay.model.compressed' : 'clay.model.invalid')); return false; }
    // Tripo's models face +X: turn them to the bench's front (+Z), as the model viewer does.
    if (facesPlusX(glbAsset(bytes))) for (let i = 0; i < parsed.positions.length; i += 3) { const x = parsed.positions[i]; parsed.positions[i] = -parsed.positions[i + 2]; parsed.positions[i + 2] = x; }
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

  // ───── a painted model: look, name, export, share, or turn it into clay ─────
  let viewer = null;
  function painted() {
    const bytes = project.glb instanceof Uint8Array ? project.glb : new Uint8Array(project.glb);
    body.innerHTML = `
      <div class="clay-stage" data-stage role="img" aria-label="${te('clay.painted.alt', { title: project.title || t('clay.untitled') })}" aria-describedby="clay-help"><p class="clay-stage__loading">${te('clay.loading')}</p></div>
      <p class="t-small clay-help" id="clay-help">${te('clay.painted.help')}</p>
      <section class="clay-painted">
        <p class="t-small">${te('clay.painted.sub')}</p>
        <button class="btn btn--outline" data-to-clay>${icon('clay', { size: 18 })}${te('clay.painted.toClay')}</button>
      </section>
      <div class="clay-actions">
        <label class="field"><span class="t-label">${te('clay.name')}</span><input class="input" maxlength="60" data-title value="${esc(project.title || '')}" /></label>
        <div class="craft-action-row"><button class="btn btn--outline" data-painted-export>${icon('download', { size: 18 })}GLB</button></div>
        <button class="btn btn--primary" data-painted-share>${icon('upload', { size: 18 })}${te('clay.share')}</button>
        <p class="note t-small">${te('clay.painted.credit')}</p>
      </div>`;
    const host = body.querySelector('[data-stage]');
    viewer = createModelStage(host, {
      onState: (state) => {
        host.querySelector('.clay-stage__note')?.remove();
        if (state === 'WEBGL_BACK') return;
        host.insertAdjacentHTML('beforeend', `<p class="clay-stage__loading clay-stage__note">${te(state === 'WEBGL_LOST' ? 'clay.webgl.lost' : 'clay.webgl')}</p>`);
      },
    });
    viewer.load(bytes).then((ok) => {
      if (disposed) return;
      if (!ok) { host.innerHTML = `<p class="clay-stage__loading">${te('clay.model.invalid')}</p>`; return; }
      // A cover for the workshop shelf, once.
      if (!project.thumb) { const shot = viewer.snapshot(240); if (shot) { project.thumb = shot.toDataURL('image/jpeg', 0.7); saveProject(project).catch(() => {}); } }
    });
    const name = () => `along-model-${(project.title || 'model').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30)}`;
    body.querySelector('[data-painted-export]').onclick = () => {
      download(bytes, `${name()}.glb`, 'model/gltf-binary');
      toast(t(window.Android ? 'craft3d.download.native' : 'craft3d.download.started'));
    };
    body.querySelector('[data-painted-share]').onclick = () => {
      const cover = viewer.snapshot(900);
      if (!cover) { toast(t('craft3d.export.error')); return; }
      setDraft('gallery', { kind: 'CLAY', title: project.title, glb: bytes, cover, recipe: null, remixOf: project.start.galleryId || null });
      go('gallery/new');
    };
    // Sculpting needs clay: a new piece from the same shape, the painted one stays as it is.
    body.querySelector('[data-to-clay]').onclick = () => fromModel(bytes, { source: project.start.source, title: project.title, galleryId: project.start.galleryId });
    body.querySelector('[data-title]').addEventListener('change', (event) => { project.title = event.target.value.trim().slice(0, 60); saveProject(project).catch(() => toast(t('error.STORAGE'))); });
  }

  function bench() {
    body.innerHTML = `
      <div class="clay-stage" data-stage role="application" aria-label="${te('clay.stage.alt')}" aria-describedby="clay-help"><p class="clay-stage__loading">${te('clay.loading')}</p></div>
      <p class="t-small clay-help" id="clay-help">${te('clay.help')}</p>
      ${project.start.notes?.length ? `<details class="clay-notes">
        <summary>${icon('spark', { size: 16 })}<span>${te('clay.ai.notes')}</span><small>${te('clay.ai.notes.count', { n: project.start.notes.length })}</small></summary>
        <p class="t-small">${te('clay.ai.notes.sub')}</p>
        <ul>${project.start.notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></details>` : ''}
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
    const example = event.target.closest('[data-ai-example]')?.dataset.aiExample;
    if (example != null) { const box = body.querySelector('[data-ai-prompt]'); box.value = t(`clay.ai.example.${example}.prompt`); box.focus(); return; }
    if (event.target.closest('[data-ai-send]')) { sendText(); return; }
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
    if (el.matches('[data-ai-file]') && el.files[0]) { startAI({ kind: 'image', image: el.files[0] }); el.value = ''; return; }
    if (el.matches('[data-ai-video]') && el.files[0]) { sendVideo(el.files[0]); el.value = ''; return; }
    if (el.name === 'aikind') { showKind(el.value); return; }
    if (el.name === 'aiengine') { engine = AI_ENGINES.includes(el.value) ? el.value : 'relay'; paintEngine(); return; }
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
    if (sent?.glb && !sent.parts) {
      const from = { source: 'GALLERY', title: sent.title || t('clay.untitled'), galleryId: sent.galleryId };
      if (await (hasTexture(sent.glb) ? fromPainted(sent.glb, from) : fromModel(sent.glb, from))) return;
    }
    if (disposed) return;
    if (param === 'new') { startScreen(); return; }
    try { project = await getProject(param, owner); } catch { project = null; }
    if (disposed) return;
    if (!project) { body.innerHTML = `<p class="t-body">${te('clay.notfound')}</p><button class="btn btn--primary" data-new>${te('clay.new')}</button>`; body.querySelector('[data-new]').onclick = () => go('clay/new'); return; }
    if (project.start.kind === 'painted' && project.glb) { painted(); return; }
    bench();
  })();
  const offPoints = onPointsChange(() => {});
  return () => {
    clearTimeout(saveTimer);
    // The save takes its snapshot synchronously before the first await, so the stage can go right after.
    if (stage?.clay) persist();
    disposed = true;
    stage?.dispose();
    viewer?.dispose();
    offPoints();
  };
}
function glbJson(bytes) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) return null;
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  } catch { return null; }
}
const glbAsset = (bytes) => glbJson(bytes)?.asset || null;
/** True when the GLB carries a colour texture (a painted model), not just a shape. */
function hasTexture(bytes) {
  const gltf = glbJson(bytes);
  return Boolean(gltf?.images?.length && (gltf.materials || []).some((m) => m?.pbrMetallicRoughness?.baseColorTexture));
}
function hexColor(hex) { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); }
