// Along — local, genuine bas-relief; optional consented provider jobs and private model freeze.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { go, replace, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { api, upload, getRuntimeConfig, fetchProtectedMedia } from './api.js';
import { listMedia, getMedia, addFiles, addSamples, urlFor } from './media.js';
import { createCraft, getCraft, updateCraft, PRODUCTS, SHAPES, variantCacheKey, cacheVariant, getCachedVariant, createCraftJobRunner, craftAICapabilities, createCraftReview } from './crafts.js';
import { createCraftModel, createMaskEditor } from './craft-model.js';
import { maskFromRGBA, validMask, fitDimensions } from './craft-geometry.js';
import { downloadArtifact } from './craft-export.js';

const STEPS = ['photo', 'product', 'shape', 'done'];
function loadImage(src) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('PHOTO_LOAD')); image.src = src; });
}
async function blobImage(blob) { const url = URL.createObjectURL(blob); try { return await loadImage(url); } finally { URL.revokeObjectURL(url); } }
function rasterBlob(image) {
  const canvas = document.createElement('canvas'), scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PHOTO_ENCODE')), 'image/jpeg', .9));
}
async function privateBlob(media, signal) {
  if (!media || media.kind !== 'IMAGE' || media.status !== 'READY' || !media.url) throw new Error('AI_OUTPUT_INVALID');
  const blob = await fetchProtectedMedia(media.url, { signal, maxBytes: 20 * 1024 * 1024 });
  if (!blob.type.startsWith('image/') || blob.size > 20 * 1024 * 1024) throw new Error('AI_OUTPUT_INVALID');
  return blob;
}

export function renderCraft(root, craftId) {
  const session = getSession();
  let craft = craftId === 'new' ? null : getCraft(craftId);
  const topbar = `<header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('craft.title')}</h1></header>`;
  if (!session || (craftId !== 'new' && (!craft || craft.email !== session.email))) {
    root.innerHTML = `<section class="page page--flow">${topbar}<p class="t-body">${te(session ? 'craft.notfound' : 'craft.signin')}</p><button class="btn btn--primary" data-continue>${te(session ? 'craft.create' : 'you.signin')}</button></section>`;
    root.querySelector('[data-back]').onclick = () => back('you'); root.querySelector('[data-continue]').onclick = () => session ? go('craft/new') : openLogin(); return;
  }
  let step = craft ? (craft.modelStatus === 'GENERATED' ? 3 : 1) : 0;
  let items = [], source = null, image = null, disposed = false, photoRequest = 0, busy = false, jobBusy = false, operation = 0;
  let uploadAbort = null, fetchAbort = new AbortController(), editor = null, consentResolve = null, lastJobVariant = 'ANIME';
  let loading = false, webgl = true, modelVersion = '', loadSerial = 0, editorVersion = '', reviewManual = false;
  // editorImage: the picture the brush is drawn on; editorDirty: strokes not yet applied to the model.
  // jobTarget: which style's picture a person-localization job belongs to.
  let editorImage = null, editorDirty = false, editorNote = '', jobTarget = 'REAL';
  const records = new Map(), images = new Map();
  const review = createCraftReview({ currentVersion: () => !disposed && getSession()?.email === session.email ? craft?.inputVersion : null });
  const capabilities = () => craftAICapabilities(getRuntimeConfig(), session);
  root.innerHTML = `<section class="page page--craft craft-online">
    ${topbar}<p class="t-small" data-progress aria-live="polite"></p><h2 class="t-title" data-heading tabindex="-1"></h2>
    <div class="craft-preview" data-preview hidden>
      <span class="stamp" data-variant></span>
      <div class="craft-stage craft-online-stage" data-stage tabindex="0" role="group" aria-label="${te('craft3d.preview.alt')}" aria-describedby="craft-help"></div>
      <p class="t-small" data-webgl hidden>${te('craft3d.webgl')}</p>
      <div class="craft-hold" data-hold hidden><progress max="100" value="0" aria-label="${te('craft3d.hold.progress')}"></progress><span data-hold-label></span></div>
      <p class="t-small" id="craft-help">${te('craft3d.rotate.hint')} ${te('craft3d.hold.switch')}</p>
      <div class="craft-controls"><button class="btn btn--outline" data-turn="-30">${te('craft.rotate.left')}</button><button class="btn btn--outline" data-reset>${te('craft.rotate.reset')}</button><button class="btn btn--outline" data-turn="30">${te('craft.rotate.right')}</button></div>
      <div class="craft-controls craft-controls--zoom"><button class="btn btn--outline" data-zoom="out" aria-label="${te('craft3d.zoom.out')}">−</button><button class="btn btn--outline" data-zoom="in" aria-label="${te('craft3d.zoom.in')}">+</button></div>
      <section class="craft-panel" aria-labelledby="craft-fit-title">
        <h3 class="t-heading" id="craft-fit-title">${te('craft3d.fit.title')}</h3>
        <div class="craft-segmented" role="group" aria-labelledby="craft-fit-title"><button class="craft-segment" data-fit="FILL" aria-pressed="true">${te('craft3d.fit.fill')}</button><button class="craft-segment" data-fit="WHOLE" aria-pressed="false">${te('craft3d.fit.whole')}</button></div>
        <p class="t-small" data-fit-note></p>
      </section>
      <p class="t-small" data-photo-state role="status"></p><p class="t-label" data-credit></p>
      <p class="note t-small" data-relief></p><p class="t-small t-num" data-dimensions></p>
      <section class="craft-panel" aria-labelledby="craft-style-title">
        <h3 class="t-heading" id="craft-style-title">${te('craft3d.style.title')}</h3>
        <div class="craft-segmented" role="group" aria-labelledby="craft-style-title"><button class="craft-segment" data-real aria-pressed="true">${te('craft3d.style.real')}</button><button class="craft-segment" data-anime aria-pressed="false">${te('craft3d.style.anime')}</button></div>
        <p class="t-small" data-style-note></p><p class="t-small" data-provider></p><p class="t-small" data-job role="status" aria-live="polite"></p>
        <div class="craft-action-row"><button class="btn btn--outline" data-resume hidden>${te('craft3d.review.resume')}</button><button class="btn btn--text" data-discard-job hidden>${te('craft3d.cancel')}</button></div>
      </section>
      <section class="craft-panel" aria-labelledby="craft-raise-title">
        <label class="craft-switch"><input type="checkbox" role="switch" data-raise aria-describedby="craft-raise-note" /><span class="craft-switch__text"><strong id="craft-raise-title">${te('craft3d.raise.title')}</strong><span class="t-small" id="craft-raise-note" data-raise-note></span></span></label>
        <div class="craft-mask" data-editor hidden>
          <p class="t-small" data-editor-note>${te('craft3d.manual.note')}</p>
          <p class="note t-small" data-review-note role="status" hidden></p><p class="t-small" data-confidence hidden></p>
          <button class="btn btn--outline" data-segment>${te('craft3d.segment')}</button><p class="t-small" data-detect-note></p>
          <div class="craft-mask-image"><canvas data-mask></canvas><svg data-detection class="craft-detection" aria-hidden="true" hidden></svg></div><p class="t-small">${te('craft3d.manual.keys')}</p>
          <div class="craft-action-row"><button class="btn btn--outline" data-brush="add" aria-pressed="true">${te('craft3d.manual.add')}</button><button class="btn btn--outline" data-brush="erase" aria-pressed="false">${te('craft3d.manual.erase')}</button></div>
          <label class="field t-small">${te('craft3d.manual.radius')}<input type="range" min="2" max="24" value="8" data-radius /></label>
          <div class="craft-action-row"><button class="btn btn--text" data-clear-mask>${te('craft3d.manual.clear')}</button><button class="btn btn--primary" data-apply-mask>${te('craft3d.manual.apply')}</button><button class="btn btn--text" data-close-mask>${te('craft3d.cancel')}</button></div>
        </div>
      </section>
    </div><div class="flow-body" data-body></div>
    <section class="craft-consent" data-consent hidden role="dialog" aria-modal="true" aria-labelledby="craft-consent-title" tabindex="-1">
      <h2 class="t-heading" id="craft-consent-title">${te('craft3d.consent.title')}</h2><p class="t-body" data-consent-copy></p>
      <label class="craft-consent-check"><input type="checkbox" data-consent-check /><span>${te('craft3d.consent.check')}</span></label>
      <div class="craft-action-row"><button class="btn btn--primary" data-consent-yes disabled>${te('craft3d.consent.continue')}</button><button class="btn btn--outline" data-consent-no>${te('craft3d.cancel')}</button></div>
    </section>
    <section class="craft-ai glass glass--2" data-ai hidden aria-labelledby="craft-ai-title">
      <span class="craft-ai__spin" data-ai-spin aria-hidden="true"></span>
      <div class="craft-ai__copy" role="status" aria-live="polite"><strong id="craft-ai-title" data-ai-title></strong><span class="t-small" data-ai-detail></span><span class="t-small t-num" data-ai-time></span></div>
      <div class="craft-ai__actions"><button class="btn btn--small btn--outline" data-retry hidden>${te('craft3d.retry')}</button><button class="btn btn--small btn--primary" data-cancel-job>${te('craft3d.cancel')}</button></div>
    </section>
  </section><div class="stepbar glass glass--2" data-stepbar hidden><button class="btn btn--text btn--inline" data-prev>${te('craft.prev')}</button><button class="btn btn--primary" data-next>${te('craft.next')}</button></div>`;
  const $ = (selector) => root.querySelector(selector);
  const body = $('[data-body]'), heading = $('[data-heading]'), stage = $('[data-stage]'), state = $('[data-photo-state]');
  const locked = () => busy || jobBusy || loading;
  function persist(change) { if (!craft) return false; const saved = updateCraft(craft.id, change); if (!saved) { toast(t('error.STORAGE')); return false; } craft = saved; return true; }
  function validOperation(token, version) { return !disposed && token === operation && craft.inputVersion === version && getSession()?.email === session.email; }
  function closeEditor() { editor?.dispose(); editor = null; editorVersion = ''; editorImage = null; editorDirty = false; $('[data-editor]').hidden = true; }
  function discardReview() { review.discard(); reviewManual = false; closeEditor(); if (craft?.aiJob) persist({ aiJob: null }); }
  function cancelOperation() {
    operation++; busy = false; jobBusy = false; uploadAbort?.abort(); fetchAbort.abort(); fetchAbort = new AbortController(); runner.cancel(); model.cancelHold(); discardReview(); hideAI(); refreshControls();
  }
  // The floating AI window: what the AI is doing (anime style or finding the person), how long it
  // has taken, and a Cancel that works at every step. A failure stays on screen with Retry.
  const ai = $('[data-ai]');
  let aiKind = 'ANIME', aiFailed = false, aiStarted = 0, aiTimer = 0;
  function aiTick() { $('[data-ai-time]').textContent = aiFailed ? '' : t('craft3d.ai.time', { n: Math.max(0, Math.round((Date.now() - aiStarted) / 1000)) }); }
  function showAI(kind, detail = '') {
    if (disposed) return;
    if (ai.hidden || aiFailed || kind !== aiKind) aiStarted = Date.now();
    aiKind = kind === 'ANIME' ? 'ANIME' : 'REAL'; aiFailed = false;
    ai.hidden = false; ai.classList.remove('is-failed');
    $('[data-ai-title]').textContent = t(`craft3d.ai.${aiKind}.title`);
    if (detail) $('[data-ai-detail]').textContent = detail;
    $('[data-ai] [data-cancel-job]').textContent = t('craft3d.cancel'); $('[data-retry]').hidden = true;
    clearInterval(aiTimer); aiTimer = setInterval(aiTick, 1000); aiTick();
  }
  function failAI(detail) {
    if (disposed) return;
    clearInterval(aiTimer); aiFailed = true;
    ai.hidden = false; ai.classList.add('is-failed');
    $('[data-ai-title]').textContent = t(`craft3d.ai.${aiKind}.failed`);
    $('[data-ai-detail]').textContent = detail; aiTick();
    $('[data-ai] [data-cancel-job]').textContent = t('craft3d.ai.close'); $('[data-retry]').hidden = false;
  }
  function hideAI() { clearInterval(aiTimer); aiFailed = false; if (ai) ai.hidden = true; }
  // Status text goes to the style panel and, while an AI step is on screen, to the floating window.
  function note(text) { $('[data-job]').textContent = text; if (!ai.hidden && !aiFailed) $('[data-ai-detail]').textContent = text; }
  function providerName() { return capabilities().provider === 'openai-person' ? t('craft3d.provider.proxy') : capabilities().provider || t('craft3d.provider.generic'); }
  // The brush lives inside the "raise the figure" panel and always paints on the current style's picture.
  function openEditor(pending = null) {
    closeEditor(); model.cancelHold(); editorVersion = craft.inputVersion; reviewManual = false;
    $('[data-editor]').hidden = false;
    $('[data-editor-note]').textContent = t(pending ? 'craft3d.review.note' : 'craft3d.manual.note');
    const note = pending ? t(pending.needsManual ? 'craft3d.review.manualRequired' : 'craft3d.review.pending') : editorNote;
    $('[data-review-note]').hidden = !note; $('[data-review-note]').textContent = note; editorNote = '';
    $('[data-apply-mask]').textContent = t(pending ? 'craft3d.review.confirm' : 'craft3d.manual.apply');
    const detection = pending?.detection, svg = $('[data-detection]'); svg.replaceChildren(); svg.hidden = !detection;
    if (detection) {
      svg.setAttribute('viewBox', `0 0 ${detection.width} ${detection.height}`); svg.setAttribute('preserveAspectRatio', 'none');
      // Guides only: a bounding box is never rasterized into a person mask.
      const add = (name, attrs) => { const node = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); svg.append(node); };
      if (detection.bbox) { const [x0, y0, x1, y1] = detection.bbox; add('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: 'craft-detection-box' }); }
      if (detection.polygon) add('polygon', { points: detection.polygon.map((p) => p.join(',')).join(' '), class: 'craft-detection-polygon' });
    }
    $('[data-confidence]').hidden = detection?.confidence == null;
    $('[data-confidence]').textContent = detection?.confidence == null ? '' : t('craft3d.review.confidence', { n: Math.round(detection.confidence * 100) });
    const markChanged = () => {
      editorDirty = true;
      if (review.pending) { reviewManual = true; $('[data-detection]').hidden = true; $('[data-apply-mask]').textContent = t('craft3d.review.confirmManual'); }
      refreshControls();
    };
    editorImage = pending?.image || image;
    editor = createMaskEditor($('[data-mask]'), editorImage, pending ? pending.mask : records.get(craft.variant)?.mask, { label: t(pending ? 'craft3d.review.canvas' : 'craft3d.manual.canvas'), onChange: markChanged });
    $('[data-radius]').value = '8'; root.querySelectorAll('[data-brush]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.brush === 'add')));
    refreshControls(); if (pending) $('[data-mask]').focus();
  }
  // Keep the brush in step with the model: shown only while raising is on, redrawn when the style's picture changes.
  function syncEditor() {
    if (disposed || !craft) return;
    if (!craft.raised || !image) { if (editor && !review.pending) closeEditor(); return; }
    if (review.pending) return;
    if (editor && editorImage === image) { editorVersion = craft.inputVersion; return; }
    openEditor();
  }
  // A style without its own selection starts from the other style's raised region; the user reviews it below.
  async function carryMask(target) {
    const to = records.get(target), from = records.get(target === 'ANIME' ? 'REAL' : 'ANIME');
    if (!craft.raised || !to || to.mask?.data?.some((v) => v > 0) || !from?.mask?.data?.some((v) => v > 0)) return false;
    const record = { ...to, mask: { ...from.mask, data: from.mask.data.slice() }, maskSource: 'MANUAL' };
    await cacheVariant(variantCacheKey(craft, target), record).catch(() => {});
    records.set(target, record); editorNote = t('craft3d.raise.carried');
    return true;
  }
  function consentBackground(value) {
    for (const selector of ['.topbar', '[data-preview]', '[data-body]', '[data-stepbar]']) {
      const element = $(selector); if (value) element.setAttribute('inert', ''); else element.removeAttribute('inert');
    }
  }
  function finishConsent(value) { if (!consentResolve) return; const resolve = consentResolve; consentResolve = null; $('[data-consent]').hidden = true; consentBackground(false); resolve(value); $('[data-anime]').focus(); }
  function consent(kind) {
    if (consentResolve) return Promise.resolve(false);
    const panel = $('[data-consent]'); consentBackground(true); panel.hidden = false; $('[data-consent-copy]').textContent = t(`craft3d.consent.${kind}`, { provider: providerName() });
    $('[data-consent-check]').checked = false; $('[data-consent-yes]').disabled = true; panel.focus();
    return new Promise((resolve) => { consentResolve = resolve; });
  }
  $('[data-consent-check]').onchange = (event) => { $('[data-consent-yes]').disabled = !event.target.checked; };
  $('[data-consent-yes]').onclick = () => { if ($('[data-consent-check]').checked) finishConsent(true); };
  $('[data-consent-no]').onclick = () => finishConsent(false);
  $('[data-consent]').onkeydown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); finishConsent(false); }
    if (event.key === 'Tab') {
      const controls = [...$('[data-consent]').querySelectorAll('button:not(:disabled),input')], first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $('[data-consent]'))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  const model = createCraftModel(stage, {
    onPose(pose) { if (craft && !persist({ ...pose, previewStatus: craft.status === 'DESIGNED' ? 'DESIGNED' : 'PREVIEWED' })) model.setPose(craft.rotation, craft.tilt); },
    onState(status) { if (!disposed) { webgl = status !== 'WEBGL_UNAVAILABLE'; $('[data-webgl]').hidden = webgl; } },
    onHold() { if (!locked() && !editorDirty && !review.pending && !consentResolve) void (craft.variant === 'ANIME' ? restoreOriginal() : requestAI('ANIME')); },
    onHoldProgress(value) { if (disposed) return; $('[data-hold]').hidden = value === 0; $('[data-hold] progress').value = value * 100; $('[data-hold-label]').textContent = t('craft3d.hold.remaining', { n: Math.max(0, Math.ceil(5 * (1 - value))) }); },
  });
  function refreshControls() {
    if (disposed) return;
    const disabled = !image || locked(), caps = capabilities(), pending = review.pending, unresolved = !!pending || !!craft?.aiJob;
    const anime = craft?.variant === 'ANIME', animeCached = !!records.get('ANIME')?.blob;
    root.querySelectorAll('[data-turn],[data-reset],[data-zoom],[data-fit],[data-segment],[data-save-craft],[data-download],[data-freeze],[data-size],[data-product],[data-shape]').forEach((el) => { el.disabled = disabled; });
    root.querySelectorAll('[data-fit]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.fit === craft?.photoFit)));
    $('[data-fit-note]').textContent = t(craft?.photoFit === 'WHOLE' ? 'craft3d.fit.wholeNote' : 'craft3d.fit.fillNote');
    root.querySelectorAll('[data-save-craft],[data-download],[data-freeze]').forEach((el) => { el.disabled = disabled || unresolved || editorDirty || modelVersion !== craft?.inputVersion; });
    $('[data-real]').setAttribute('aria-pressed', String(!anime)); $('[data-anime]').setAttribute('aria-pressed', String(anime));
    $('[data-real]').disabled = disabled || !!pending;
    $('[data-anime]').disabled = disabled || unresolved || (!anime && !animeCached && !caps.edit);
    $('[data-style-note]').textContent = session.localOnly && !animeCached ? t('experience.online.blocked') : t(anime ? 'craft3d.style.animeOn' : animeCached ? 'craft3d.style.cached' : caps.edit ? 'craft3d.style.generate' : 'craft3d.edit.unavailable');
    $('[data-raise]').checked = !!craft?.raised; $('[data-raise]').disabled = !image || locked() || !!pending;
    $('[data-raise-note]').textContent = t(craft?.raised ? 'craft3d.raise.on' : 'craft3d.raise.off');
    $('[data-segment]').disabled = disabled || unresolved || !caps.detect || session.localOnly;
    $('[data-retry]').disabled = disabled || unresolved || !(lastJobVariant === 'REAL' ? caps.detect : caps.edit);
    $('[data-resume]').hidden = !unresolved || !!pending; $('[data-resume]').disabled = disabled || session.localOnly;
    // A job left over from an earlier visit can be dropped here; a running one is cancelled in the floating window.
    $('[data-discard-job]').hidden = !craft?.aiJob || !!pending || busy || jobBusy;
    $('[data-next]').disabled = loading || busy || jobBusy || unresolved || editorDirty;
    $('[data-apply-mask]').disabled = locked() || !editor || editorVersion !== craft?.inputVersion || (!pending && !editorDirty) || !!(pending && ((!reviewManual && pending.needsManual) || !editor.mask.data.some((v) => v > 0)));
    root.querySelectorAll('[data-close-mask],[data-brush],[data-radius],[data-clear-mask]').forEach((el) => { el.disabled = locked(); });
    $('[data-close-mask]').hidden = !pending && !editorDirty;
    $('[data-mask]').style.pointerEvents = locked() ? 'none' : ''; $('[data-mask]').tabIndex = locked() ? -1 : 0;
    $('[data-variant]').textContent = t(anime ? 'craft3d.variant.anime' : 'craft3d.variant.real');
    $('[data-provider]').textContent = session.localOnly ? '' : caps.detect || caps.edit ? t('craft3d.provider.ready', { provider: providerName() }) : t('craft3d.provider.unavailable');
    $('[data-detect-note]').textContent = t(caps.detect ? 'craft3d.detect.ready' : 'craft3d.detect.unavailable');
    $('[data-credit]').textContent = source?.userProvided ? t('craft.sample.credit') : source?.credit || '';
    if (craft) $('[data-dimensions]').textContent = t('craft3d.dimensions', { w: craft.widthMm, h: craft.heightMm, b: craft.baseMm, r: craft.reliefMm });
  }
  // A face that fills with the photo is sized once to the photo's proportions (and again for a new
  // photo or product), so little of it is trimmed. A size typed by hand is never changed.
  function sizeToPhoto() {
    const original = images.get('REAL');
    if (!craft || !original || craft.photoFit !== 'FILL' || craft.sizedFor === 'MANUAL') return;
    const key = `${craft.mediaId}|${craft.product}`;
    if (craft.sizedFor === key) return;
    persist({ ...fitDimensions(craft.product, original.naturalWidth, original.naturalHeight), sizedFor: key });
  }
  async function rebuild() {
    if (!image || !craft || disposed) return;
    sizeToPhoto();
    const serial = ++loadSerial, version = craft.inputVersion; modelVersion = '';
    try {
      // The same stage is reloaded in place for either style; raising off always gives a flat base.
      const record = records.get(craft.variant), mask = craft.raised ? record?.mask || null : null;
      await model.load({ ...craft, maskSource: mask ? record?.maskSource || 'NONE' : 'NONE' }, image, mask);
      if (disposed || serial !== loadSerial || version !== craft.inputVersion) return;
      modelVersion = version; stage.hidden = false;
      $('[data-relief]').textContent = model.mesh.hasRelief ? t(model.mesh.maskSource === 'AI' ? 'craft3d.relief.ai' : 'craft3d.relief.manual') : t(craft.raised ? 'craft3d.raise.empty' : 'craft3d.relief.flatChosen');
      const maskSource = model.mesh.hasRelief ? model.mesh.maskSource : 'NONE';
      if (maskSource !== craft.maskSource) persist({ maskSource });
      syncEditor();
    } catch { if (!disposed) state.textContent = t('craft3d.geometry.error'); }
    refreshControls();
  }
  async function loadPhoto() {
    const request = ++photoRequest; loading = true; image = null; source = null; records.clear(); images.clear(); closeEditor();
    if (!craft) { loading = false; return; }
    state.textContent = t('craft.loading'); refreshControls();
    try {
      const item = await getMedia(craft.mediaId); if (!item) throw new Error('PHOTO_MISSING');
      const original = await loadImage(urlFor(item));
      const cached = await getCachedVariant(variantCacheKey(craft, 'REAL')).catch(() => null);
      if (disposed || request !== photoRequest) return;
      source = item; images.set('REAL', original); records.set('REAL', cached || { maskSource: 'NONE' }); image = original;
      // Load a cached anime picture whichever style is showing, so switching back and forth never pays twice.
      const anime = await getCachedVariant(variantCacheKey(craft, 'ANIME')).catch(() => null);
      if (disposed || request !== photoRequest) return;
      if (anime?.blob) {
        const decoded = await blobImage(anime.blob).catch(() => null); if (disposed || request !== photoRequest) return;
        if (decoded) { records.set('ANIME', anime); images.set('ANIME', decoded); if (craft.variant === 'ANIME') image = decoded; }
      }
      if (craft.variant === 'ANIME' && image !== images.get('ANIME')) { persist({ variant: 'REAL' }); toast(t('craft3d.cache.missing')); }
      if (disposed || request !== photoRequest) return;
      state.textContent = craft.modelStatus === 'NOT_GENERATED' && craft.status === 'DESIGNED' ? t('craft3d.legacy') : '';
      await rebuild();
      if (craft.aiJob?.inputVersion === craft.inputVersion) $('[data-job]').textContent = t('craft3d.review.resumeNote');
    } catch { if (!disposed && request === photoRequest) state.textContent = t('craft.photo.error'); }
    finally { if (!disposed && request === photoRequest) { loading = false; refreshControls(); } }
  }
  async function ensureOriginal(isCurrent = () => !disposed) {
    const key = variantCacheKey(craft, 'REAL');
    let record = records.get('REAL');
    if (!record?.blob) {
      // originalBlob may contain GPS. Only the existing sanitized blob/raster is uploaded.
      record = { ...record, blob: source?.blob || await rasterBlob(images.get('REAL')) };
      if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
      records.set('REAL', record);
    }
    await cacheVariant(key, record, isCurrent);
    return record;
  }
  async function ensureSource(token, version) {
    const record = await ensureOriginal(() => validOperation(token, version));
    if (!validOperation(token, version)) throw new DOMException('Cancelled', 'AbortError');
    if (record.sourceMediaId) return record.sourceMediaId;
    const form = new FormData(); form.append('file', record.blob, 'along-source.jpg'); form.append('purpose', 'CRAFT'); form.append('consent', 'true');
    const result = await upload('/media', form, { signal: uploadAbort.signal, onProgress: (n) => { if (validOperation(token, version)) note(t('craft3d.upload.progress', { n })); } });
    if (!validOperation(token, version)) throw new DOMException('Cancelled', 'AbortError');
    if (result.media?.status !== 'READY' || result.media.kind !== 'IMAGE') throw new Error('PHOTO_NOT_READY');
    record.sourceMediaId = result.media.id; await cacheVariant(variantCacheKey(craft, 'REAL'), record);
    if (!validOperation(token, version)) throw new DOMException('Cancelled', 'AbortError');
    if (!persist({ sourceMediaId: record.sourceMediaId })) throw new Error('STORAGE');
    return record.sourceMediaId;
  }
  const runner = createCraftJobRunner({ api, currentVersion: () => getSession()?.email === session.email ? craft?.inputVersion : null,
    onState(job) {
      if (disposed) return;
      jobBusy = ['QUEUED', 'PROCESSING', 'READY'].includes(job.status);
      const text = t(job.status === 'READY' ? 'craft3d.job.VALIDATING' : `craft3d.job.${job.status}`);
      if (jobBusy) showAI(job.variant || aiKind, text);
      else if (job.status === 'CANCELLED') hideAI();
      note(text);
      if (job.id && job.inputVersion === craft?.inputVersion && job.sourceMediaId && ['QUEUED', 'PROCESSING', 'READY'].includes(job.status)) {
        persist({ aiJob: { id: job.id, inputVersion: job.inputVersion, sourceMediaId: job.sourceMediaId, variant: job.variant, target: job.variant === 'ANIME' ? 'ANIME' : jobTarget } });
      }
      if (job.status === 'FAILED') {
        persist({ aiJob: null });
        let reason = text;
        if (/UNAVAILABLE|CONFIGURED|PROVIDER/.test(job.error || '')) reason = t('craft3d.provider.unavailable');
        if (/NEEDS_REVIEW/.test(job.error || '')) reason = t('craft3d.review.manualRequired');
        if (/TIMEOUT/.test(job.error || '')) reason = t('craft3d.ai.timeout');
        $('[data-job]').textContent = reason; failAI(reason);
      }
      refreshControls();
    },
    async onReady(job, isCurrent) {
      const original = await ensureOriginal(isCurrent); if (!isCurrent() || disposed) return;
      if (job.variant === 'ANIME') {
        // The anime picture alone. It replaces the model in place; raising stays the user's own choice.
        if (!job.outputMedia) throw new Error('AI_OUTPUT_INVALID');
        const blob = await privateBlob(job.outputMedia, fetchAbort.signal), outputImage = await blobImage(blob);
        if (!isCurrent() || disposed) return;
        const record = { blob, maskSource: 'NONE', outputMediaId: job.outputMedia.id, jobId: job.id };
        await cacheVariant(variantCacheKey(craft, 'ANIME'), record, isCurrent); if (!isCurrent() || disposed) return;
        records.set('ANIME', record); images.set('ANIME', outputImage);
        await carryMask('ANIME');
        if (!persist({ variant: 'ANIME', aiJob: null })) throw new Error('STORAGE');
        image = outputImage; await rebuild(); jobBusy = false; syncEditor();
        hideAI(); $('[data-job]').textContent = t('craft3d.style.animeReady'); toast(t('craft3d.ai.ANIME.done')); refreshControls(); return;
      }
      // Person localization for the style that was showing when it was requested.
      const target = jobTarget, picture = images.get(target);
      if (!job.maskMedia || !picture) throw new Error('AI_OUTPUT_INVALID');
      const maskImage = await blobImage(await privateBlob(job.maskMedia, fetchAbort.signal));
      if (maskImage.naturalWidth !== picture.naturalWidth || maskImage.naturalHeight !== picture.naturalHeight) throw new Error('MASK_ALIGNMENT');
      const scale = Math.min(1, 1024 / Math.max(maskImage.naturalWidth, maskImage.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(maskImage.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(maskImage.naturalHeight * scale));
      const ctx = canvas.getContext('2d'); ctx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
      const mask = maskFromRGBA(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (!isCurrent() || disposed || craft.variant !== target) return;
      const record = { ...(records.get(target) || original), mask, maskSource: mask.data.some((v) => v > 0) ? 'AI' : 'NONE', jobId: job.id };
      const pending = review.stage({ ...job, variant: target }, { record, image: picture, mask, width: picture.naturalWidth, height: picture.naturalHeight });
      if (!pending) throw new Error('REVIEW_STALE');
      jobBusy = false; hideAI(); $('[data-job]').textContent = t('craft3d.review.pending'); toast(t('craft3d.ai.REAL.done')); openEditor(pending);
      $('[data-editor]').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  });
  // Style switch: both pictures stay cached on the phone and the one model stage is rebuilt in place.
  // Switching never calls AI; only an anime style that has not been generated yet does, after consent.
  async function showStyle(variant) {
    if (!craft || !images.get(variant)) return false;
    await carryMask(variant);
    if (craft.variant !== variant && !persist({ variant })) return false;
    image = images.get(variant); await rebuild(); syncEditor(); refreshControls();
    return true;
  }
  async function restoreOriginal() {
    if (!craft || !images.get('REAL') || locked() || review.pending || craft.variant === 'REAL') return;
    if (editorDirty) closeEditor(); // unapplied strokes belong to the other style's picture
    if (await showStyle('REAL')) $('[data-job]').textContent = t('craft3d.original.restored');
  }
  async function requestAI(variant) {
    if (!image || locked() || consentResolve || review.pending || craft?.aiJob) return;
    model.cancelHold();
    if (variant === 'ANIME' && records.get('ANIME')?.blob) {
      if (!images.get('ANIME')) images.set('ANIME', await blobImage(records.get('ANIME').blob));
      if (editorDirty) closeEditor();
      if (await showStyle('ANIME')) $('[data-job]').textContent = t('craft3d.style.switched');
      return;
    }
    if (session.localOnly) { $('[data-job]').textContent = t('experience.online.blocked'); toast(t('experience.online.blocked')); return; }
    // REAL means "find the person" on whichever style is showing; ANIME means "draw the anime picture".
    const enabled = variant === 'REAL' ? capabilities().detect : capabilities().edit;
    if (!enabled) { const message = t(variant === 'REAL' ? 'craft3d.detect.unavailable' : 'craft3d.edit.unavailable'); $('[data-job]').textContent = message; toast(message); return; }
    const target = variant === 'ANIME' ? 'ANIME' : craft.variant;
    const animeSource = target === 'ANIME' && variant === 'REAL' ? records.get('ANIME')?.outputMediaId : null;
    if (target === 'ANIME' && variant === 'REAL' && !animeSource) { toast(t('craft3d.raise.animeSourceMissing')); return; }
    if (!await consent('ai') || disposed) return;
    const token = ++operation, version = craft.inputVersion; busy = true; lastJobVariant = variant; jobTarget = target; uploadAbort = new AbortController(); refreshControls();
    showAI(variant, t('craft3d.ai.preparing'));
    try {
      const mediaId = animeSource || await ensureSource(token, version); if (!validOperation(token, version)) return;
      busy = false;
      await runner.start({ mediaId, variant, inputVersion: version, consent: true });
    } catch (error) { if (validOperation(token, version) && error.name !== 'AbortError') { $('[data-job]').textContent = t('craft3d.job.FAILED'); failAI(t('craft3d.job.FAILED')); } }
    finally { if (!disposed && token === operation) { busy = false; jobBusy = false; if (!aiFailed) hideAI(); refreshControls(); } }
  }
  const choice = (attr, value, selected, inner) => `<button class="choice" ${attr}="${esc(value)}" aria-pressed="${selected}">${inner}</button>`;
  function paint({ focus = false } = {}) {
    if (disposed) return;
    const name = STEPS[step]; $('[data-progress]').textContent = t('craft.step', { n: step + 1, total: STEPS.length }); heading.textContent = t(`craft.step.${name}`);
    $('[data-preview]').hidden = step === 0; $('[data-stepbar]').hidden = step === 0 || step === 3; document.documentElement.dataset.craftStep = name;
    if (step === 0) {
      body.innerHTML = `<p class="note t-small">${te('craft.samples.note')}</p><p class="t-small">${te('craft3d.source.local')}</p><div class="studio-tools"><label class="btn btn--outline studio-tools__add"><input class="sr-only" type="file" accept="image/*" data-files /><span>${te('studio.add')}</span></label><button class="btn btn--text btn--inline" data-samples>${te('craft.samples.add')}</button></div>
        ${items.length ? `<ul class="photo-grid">${items.map((item) => `<li><button class="photo" data-photo="${esc(item.id)}" aria-label="${esc(item.altKey ? t(item.altKey) : item.alt || t('studio.photo.own'))}"><img src="${esc(urlFor(item))}" alt="" loading="lazy" />${item.sample ? `<span class="photo__tag">${te('studio.sample')}</span>` : ''}</button></li>`).join('')}</ul>` : `<div class="empty"><h3 class="t-heading">${te('studio.empty.title')}</h3><p class="t-body">${te('studio.empty.body')}</p></div>`}`;
    } else if (step === 1) {
      body.innerHTML = `<div class="choices">${PRODUCTS.map((p) => choice('data-product', p.id, craft.product === p.id, `<strong>${te(`product.${p.id}`)}</strong><span class="t-small">${te(`craft3d.product.${p.id}`)}</span>`)).join('')}</div><div class="craft-sizes">${[['widthMm', 35, 100], ['heightMm', 40, 120], ['baseMm', 2.4, 6], ['reliefMm', .5, 8]].map(([key, min, max]) => `<label class="field t-small">${te(`craft3d.size.${key}`)}<input class="input" type="number" min="${min}" max="${max}" step="0.1" value="${craft[key]}" data-size="${key}" /></label>`).join('')}</div>`;
    } else if (step === 2) {
      body.innerHTML = `<div class="choices choices--shapes">${SHAPES.map((shape) => choice('data-shape', shape, craft.shape === shape, `<span class="shape shape--${shape}" aria-hidden="true"></span><strong>${te(`shape.${shape}`)}</strong>`)).join('')}</div>`;
    } else {
      body.innerHTML = `<p class="t-small t-num">${te('craft.edition', { id: craft.demoEdition })}</p><p class="note t-small">${te('craft3d.files.note')}</p><button class="btn btn--primary" data-save-craft>${te('craft3d.save')}</button><div class="craft-action-row"><button class="btn btn--outline" data-download="glb">${te('craft3d.download.glb')}</button><button class="btn btn--outline" data-download="stl">${te('craft3d.download.stl')}</button></div><button class="btn btn--text" data-download="preview">${te('craft3d.download.preview')}</button><p class="t-small">${te('craft3d.download.native')}</p><button class="btn btn--primary" data-freeze>${te('craft3d.make')}</button><p class="t-small">${te('craft3d.make.note')}</p><button class="btn btn--text" data-library>${te('craft.library.title')}</button><button class="btn btn--text" data-edit>${te('craft.edit')}</button>`;
    }
    if (step > 0) body.insertAdjacentHTML('beforeend', `<button class="btn btn--text" data-photo-again>${te('craft.change.photo')}</button>`);
    refreshControls(); if (focus) { window.scrollTo(0, 0); heading.focus({ preventScroll: true }); }
  }
  async function reload() { try { const media = await listMedia(); if (disposed) return; items = [...media.filter((item) => item.userProvided), ...media.filter((item) => !item.userProvided)]; if (step === 0) paint(); } catch { if (!disposed) toast(t('craft.photo.error')); } }
  async function filesAction(kind) {
    if (!image || locked() || modelVersion !== craft.inputVersion) return;
    if (kind === 'freeze' && session.localOnly) { toast(t('experience.online.blocked')); return; }
    if (kind === 'freeze' && (!await consent('model') || disposed)) return;
    closeEditor(); const token = ++operation, version = craft.inputVersion; busy = true; uploadAbort = new AbortController(); refreshControls();
    try {
      const artifacts = await model.artifacts(); if (!validOperation(token, version)) return;
      if (kind === 'save') {
        await ensureOriginal(); await cacheVariant(variantCacheKey(craft), { ...records.get(craft.variant), artifacts, inputVersion: version });
        if (!validOperation(token, version)) return;
        if (persist({ generatedVersion: version, status: 'DESIGNED' })) toast(t('craft3d.saved'));
      } else if (kind === 'freeze') {
        const sourceMediaId = await ensureSource(token, version); if (!validOperation(token, version)) return;
        const form = new FormData(); form.append('glb', artifacts.glb, 'along-model.glb'); form.append('stl', artifacts.stl, 'along-model.stl');
        form.append('metadata', JSON.stringify({ localCraftId: craft.id, inputVersion: version, variant: craft.variant, product: craft.product, shape: craft.shape, widthMm: craft.widthMm, heightMm: craft.heightMm, baseMm: craft.baseMm, reliefMm: model.mesh.hasRelief ? craft.reliefMm : 0, sourceMediaId, maskSource: model.mesh.maskSource, consent: true }));
        const { model: frozen } = await upload('/craft-models', form, { signal: uploadAbort.signal, onProgress: (n) => { if (validOperation(token, version)) note(t('craft3d.upload.progress', { n })); } });
        if (!validOperation(token, version)) return;
        if (!frozen?.id || !frozen.version) throw new Error('MODEL_INVALID');
        if (!persist({ frozenModel: frozen, frozenVersion: version, generatedVersion: version })) throw new Error('STORAGE');
        go(`make-order/${encodeURIComponent(frozen.id)}`);
      } else {
        const ext = kind === 'preview' ? 'png' : kind;
        const result = downloadArtifact(artifacts[kind], `along-${craft.product.toLowerCase()}-${craft.demoEdition.toLowerCase()}.${ext}`);
        toast(t(result.nativeCaveat ? 'craft3d.download.native' : 'craft3d.download.started'));
      }
    } catch (error) { if (!disposed && token === operation && error.name !== 'AbortError') toast(t(kind === 'freeze' ? 'craft3d.make.error' : 'craft3d.export.error')); }
    finally { if (!disposed && token === operation) { busy = false; refreshControls(); } }
  }
  body.addEventListener('click', async (event) => {
    if (locked() || consentResolve) return;
    const photo = event.target.closest('[data-photo]')?.dataset.photo;
    if (photo) {
      if (!craft) { const created = createCraft({ mediaId: photo, email: session.email }); if (!created) { toast(t('error.STORAGE')); return; } replace(`craft/${created.id}`); return; }
      cancelOperation(); if (!persist({ mediaId: photo, previewStatus: 'READY' })) return; step = 1; paint({ focus: true }); await loadPhoto(); return;
    }
    if (event.target.closest('[data-samples]')) { busy = true; try { await addSamples(); await reload(); } catch { if (!disposed) toast(t('error.STORAGE')); } finally { busy = false; refreshControls(); } return; }
    const product = event.target.closest('[data-product]')?.dataset.product, shape = event.target.closest('[data-shape]')?.dataset.shape;
    if (product || shape) { cancelOperation(); if (!persist(product ? { product } : { shape })) return; await rebuild(); paint(); return; }
    if (event.target.closest('[data-save-craft]')) { await filesAction('save'); return; }
    if (event.target.closest('[data-freeze]')) { await filesAction('freeze'); return; }
    const format = event.target.closest('[data-download]')?.dataset.download; if (format) { await filesAction(format); return; }
    if (event.target.closest('[data-library]')) { go('crafts'); return; }
    if (event.target.closest('[data-edit]')) { step = 1; paint({ focus: true }); return; }
    if (event.target.closest('[data-photo-again]')) { cancelOperation(); closeEditor(); step = 0; paint({ focus: true }); await reload(); }
  });
  body.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-files]'), size = event.target.closest('[data-size]');
    if (locked()) return;
    if (size) { const value = Number(size.value); if (!size.value || !size.checkValidity() || !Number.isFinite(value)) { size.reportValidity(); return; } cancelOperation(); if (persist({ [size.dataset.size]: value, sizedFor: 'MANUAL' })) { await rebuild(); paint(); } return; }
    if (!input?.files?.length) return;
    busy = true; try { const { added, failed } = await addFiles(input.files); if (disposed) return; toast(t(added.length ? 'studio.added' : 'studio.failed', { n: added.length || failed })); await reload(); } finally { busy = false; refreshControls(); }
  });
  $('[data-anime]').onclick = () => void requestAI('ANIME'); $('[data-real]').onclick = () => void restoreOriginal();
  // Cancel stops the AI step at once (upload, queue or processing); after a failure it just closes the window.
  $('[data-segment]').onclick = () => void requestAI('REAL');
  $('[data-cancel-job]').onclick = () => { if (aiFailed) { hideAI(); return; } cancelOperation(); toast(t('craft3d.ai.cancelled')); };
  $('[data-retry]').onclick = () => { hideAI(); void requestAI(lastJobVariant); };
  $('[data-discard-job]').onclick = () => { if (!locked()) cancelOperation(); };
  $('[data-resume]').onclick = async () => {
    if (locked() || session.localOnly || !craft?.aiJob) return;
    if (review.pending) { openEditor(review.pending); return; }
    const job = { ...craft.aiJob };
    jobTarget = job.target || job.variant;
    // A pending person outline belongs to one style's picture: show that picture before resuming.
    if (job.variant === 'REAL' && craft.variant !== jobTarget && images.get(jobTarget)) await showStyle(jobTarget);
    await runner.resume(job);
    if (!disposed) { jobBusy = false; if (!aiFailed) hideAI(); refreshControls(); }
  };
  // Raising is optional. Off: a flat base, no painting and no localization. On: the brush appears for the current style.
  $('[data-raise]').onchange = async (event) => {
    const on = event.target.checked;
    if (!craft || !image || locked() || review.pending || on === craft.raised) { refreshControls(); return; }
    model.cancelHold(); closeEditor();
    if (!persist({ raised: on })) { refreshControls(); return; }
    if (on) await carryMask(craft.variant);
    await rebuild();
    if (on) $('[data-mask]').focus();
  };
  $('[data-radius]').oninput = (event) => editor?.setRadius(event.target.value);
  root.querySelectorAll('[data-brush]').forEach((button) => { button.onclick = () => { editor?.setErase(button.dataset.brush === 'erase'); root.querySelectorAll('[data-brush]').forEach((b) => b.setAttribute('aria-pressed', String(b === button))); }; });
  $('[data-clear-mask]').onclick = () => editor?.clear();
  // Cancel discards a suggestion or strokes not yet applied; the applied selection stays on the model.
  $('[data-close-mask]').onclick = () => { if (locked()) return; discardReview(); syncEditor(); refreshControls(); };
  $('[data-apply-mask]').onclick = async () => {
    if (!editor || locked() || editorVersion !== craft.inputVersion) return;
    const token = ++operation, version = craft.inputVersion, pending = review.pending;
    const mask = { ...editor.mask, data: editor.mask.data.slice() };
    const accepted = pending ? review.confirm(mask, reviewManual) : null;
    const variant = accepted?.variant || craft.variant;
    busy = true; refreshControls();
    try {
      if (!validMask(mask)) throw new Error('MASK_INVALID');
      await ensureOriginal(); if (!validOperation(token, version)) return;
      const record = accepted?.record || { ...records.get(variant), mask, maskSource: mask.data.some((v) => v > 0) ? 'MANUAL' : 'NONE' };
      await cacheVariant(variantCacheKey(craft, variant), record, () => validOperation(token, version)); if (!validOperation(token, version)) return;
      if (!persist({ variant, maskSource: record.maskSource, maskRevision: accepted?.maskRevision || `manual-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`, aiJob: null })) return;
      records.set(variant, record);
      if (pending?.image) { images.set(variant, pending.image); image = pending.image; }
      review.discard(); closeEditor(); await rebuild();
    } catch { if (!disposed && token === operation) toast(t('error.STORAGE')); }
    finally { if (!disposed && token === operation) { busy = false; refreshControls(); } }
  };
  $('.craft-controls').onclick = (event) => {
    if (!craft || !image || locked()) return; const turn = event.target.closest('[data-turn]'), reset = event.target.closest('[data-reset]'); if (!turn && !reset) return;
    model.cancelHold(); if (persist({ rotation: reset ? 0 : craft.rotation + Number(turn.dataset.turn), tilt: reset ? 0 : craft.tilt, previewStatus: 'PREVIEWED' })) model.setPose(craft.rotation, craft.tilt);
  };
  $('.craft-controls--zoom').onclick = (event) => {
    const zoom = event.target.closest('[data-zoom]')?.dataset.zoom;
    if (!zoom || !image || locked()) return;
    model.cancelHold(); model.zoomBy(zoom === 'in' ? 1.25 : 0.8);
  };
  root.querySelectorAll('[data-fit]').forEach((button) => { button.onclick = async () => {
    const photoFit = button.dataset.fit;
    if (!craft || !image || locked() || review.pending || photoFit === craft.photoFit) return;
    cancelOperation(); if (!persist({ photoFit })) return; await rebuild(); refreshControls();
  }; });
  $('[data-next]').onclick = () => { closeEditor(); model.cancelHold(); step = Math.min(3, step + 1); paint({ focus: true }); };
  $('[data-prev]').onclick = () => { if (locked()) return; closeEditor(); model.cancelHold(); step = Math.max(0, step - 1); paint({ focus: true }); };
  $('[data-back]').onclick = () => back('crafts'); document.addEventListener('instrip:media', reload);
  paint(); void reload(); void loadPhoto();
  return () => {
    disposed = true; operation++; photoRequest++; loadSerial++; uploadAbort?.abort(); fetchAbort.abort(); clearInterval(aiTimer);
    if (consentResolve) { consentResolve(false); consentResolve = null; } closeEditor(); runner.dispose(); model.dispose();
    document.removeEventListener('instrip:media', reload); delete document.documentElement.dataset.craftStep;
  };
}
