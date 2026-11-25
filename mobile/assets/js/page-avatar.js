// 小游's wardrobe (#/avatar): pick the figure (小游, or a .glb of your own), dress it slot by
// slot, then save. Everything is on this phone, so it works offline and without sign-in.
// Changes are a draft until Save; the floating button then shows a snapshot of the new look.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { back } from './router.js';
import { createAvatarStage } from './avatar-stage.js';
import { getAvatar, saveAvatar, storeModel, loadModel, removeModel, normalizeOutfit, defaultOutfit, randomOutfit, slotItems,
  SLOTS, SLOT_NAMES, PALETTE, BODY_TINTS, SIZE_MIN, SIZE_MAX, clampSize } from './avatar-store.js';

export function renderAvatar(root) {
  const saved = getAvatar();
  let kind = saved.kind, outfit = saved.outfit, size = saved.size, slot = 'hat', stage = null, disposed = false, busy = false;
  let hasModel = false, modelName = saved.name, loadedKind = '', shown = 0;
  const outfits = { ...saved.outfits, [kind]: outfit };
  root.innerHTML = `<section class="page page--flow avatar-page">
    <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('avatar.title')}</h1></header>
    <div class="avatar-stage glass glass--1" data-stage-wrap>
      <div class="avatar-stage__view" data-stage></div>
      <p class="avatar-stage__note t-small" data-note role="status" hidden></p>
      <p class="avatar-stage__hint t-small" aria-hidden="true">${te('avatar.drag')}</p>
    </div>
    <div class="avatar-controls">
      <div class="card avatar-who">
        <p class="section-label">${te('avatar.who')}</p>
        <div class="segmented" role="radiogroup" aria-label="${te('avatar.who')}" data-kinds></div>
        <div class="avatar-who__mine" data-mine></div>
      </div>
      <div class="card avatar-wear">
        <div class="segmented segmented--compact avatar-slots" role="radiogroup" aria-label="${te('avatar.slots')}" data-slots></div>
        <div class="avatar-items" role="radiogroup" data-items></div>
        <div class="avatar-colors" data-colors></div>
        <label class="avatar-slider" data-size-row><span>${te('avatar.size')}</span><input type="range" min="${SIZE_MIN}" max="${SIZE_MAX}" step="0.05" data-size /></label>
      </div>
      <div class="avatar-actions glass glass--2">
        <button class="btn btn--outline" type="button" data-random>${icon('spark', { size: 18 })}<span>${te('avatar.random')}</span></button>
        <button class="btn btn--text" type="button" data-reset>${te('avatar.reset')}</button>
        <button class="btn btn--primary" type="button" data-save>${te('avatar.save')}</button>
      </div>
    </div></section>`;
  const $ = (sel) => root.querySelector(sel);
  $('[data-back]').onclick = () => back('you');
  const note = (key) => { const el = $('[data-note]'); el.hidden = !key; el.textContent = key ? t(key) : ''; };

  // ───── the stage ─────
  function startStage() {
    stage?.dispose();
    stage = createAvatarStage($('[data-stage]'), { onState(code) {
      if (code === 'WEBGL_UNAVAILABLE') note('avatar.webgl');
      else if (code === 'WEBGL_LOST') note('avatar.webgl.lost');
      else if (code === 'WEBGL_BACK' || code === 'LOADED') note('');
      else if (code === 'LOAD_FAILED') note('avatar.load.failed');
    } });
    loadedKind = '';
  }
  async function showFigure() {
    if (!stage || loadedKind === kind) { stage?.dress(outfit, size); return; }
    loadedKind = kind;
    let bytes = null;
    if (kind === 'custom') {
      const record = await loadModel().catch(() => null);
      if (disposed) return;
      if (!record) { hasModel = false; kind = 'xiaoyou'; outfit = outfits.xiaoyou || defaultOutfit('xiaoyou'); loadedKind = ''; paint(); return showFigure(); }
      bytes = record.bytes;
    }
    stage.dress(outfit, size);
    const seq = ++shown, ok = await stage.load(kind, bytes);
    // A newer pick or upload took over while this one loaded; it does the rest.
    if (disposed || seq !== shown) return;
    // A model that will not draw falls back to 小游 so the page is never empty.
    if (!ok && kind === 'custom') { toast(t('avatar.load.failed')); kind = 'xiaoyou'; outfit = outfits.xiaoyou || defaultOutfit('xiaoyou'); loadedKind = ''; paint(); return showFigure(); }
    if (ok) stage.dress(outfit, size);
  }

  // ───── controls ─────
  const radio = (name, value, on, label, extra = '') => `<label class="segmented__item"><input type="radio" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''} ${extra} /><span>${label}</span></label>`;
  function paintKinds() {
    $('[data-kinds]').innerHTML = radio('avatar-kind', 'xiaoyou', kind === 'xiaoyou', te('avatar.kind.xiaoyou'))
      + radio('avatar-kind', 'custom', kind === 'custom', te('avatar.kind.custom'), hasModel ? '' : 'disabled');
    $('[data-mine]').innerHTML = `<label class="btn btn--outline btn--small avatar-upload">${icon('upload', { size: 18 })}<input class="sr-only" type="file" accept=".glb,model/gltf-binary" data-file /><span>${te(hasModel ? 'avatar.upload.replace' : 'avatar.upload')}</span></label>
      ${hasModel ? `<span class="t-small avatar-who__name">${esc(modelName || t('avatar.kind.custom'))}</span><button class="btn btn--text btn--small" type="button" data-remove>${te('avatar.remove')}</button>` : `<span class="t-small avatar-who__name">${te('avatar.upload.note')}</span>`}`;
  }
  const slotsFor = () => (kind === 'xiaoyou' ? [...SLOT_NAMES, 'body'] : SLOT_NAMES);
  function paintSlots() {
    if (!slotsFor().includes(slot)) slot = 'hat';
    $('[data-slots]').innerHTML = slotsFor().map((s) => `<label class="segmented__item"><input type="radio" name="avatar-slot" value="${s}" ${s === slot ? 'checked' : ''} /><span>${te(`avatar.slot.${s}`)}</span></label>`).join('');
  }
  function swatch(name, hex, on, label) {
    return `<label class="avatar-swatch"><input class="sr-only" type="radio" name="avatar-color" value="${esc(name)}" ${on ? 'checked' : ''} /><span style="--swatch:${hex || 'transparent'}" class="${hex ? '' : 'is-original'}" title="${esc(label)}"></span><span class="sr-only">${esc(label)}</span></label>`;
  }
  function paintItems() {
    const items = $('[data-items]'), colors = $('[data-colors]');
    if (slot === 'body') {
      items.innerHTML = BODY_TINTS.map(([name, hex]) => `<label class="avatar-item"><input class="sr-only" type="radio" name="avatar-item" value="${name}" ${outfit.body === name ? 'checked' : ''} /><span class="avatar-item__card"><i class="avatar-item__dot" style="--swatch:${hex || '#F7EBD7'}"></i>${te(`avatar.body.${name}`)}</span></label>`).join('');
      items.setAttribute('aria-label', t('avatar.slot.body'));
      colors.innerHTML = ''; colors.hidden = true;
      return;
    }
    const current = outfit[slot];
    items.setAttribute('aria-label', t(`avatar.slot.${slot}`));
    items.innerHTML = slotItems(slot, kind).map((id) => `<label class="avatar-item"><input class="sr-only" type="radio" name="avatar-item" value="${id}" ${current.item === id ? 'checked' : ''} /><span class="avatar-item__card">${te(`avatar.item.${slot}.${id}`)}</span></label>`).join('');
    colors.hidden = current.item === 'none';
    colors.setAttribute('role', 'radiogroup'); colors.setAttribute('aria-label', t('avatar.color'));
    colors.innerHTML = current.item === 'none' ? '' : (current.item === 'original' ? swatch('', '', current.color === '', t('avatar.color.original')) : '')
      + PALETTE.map(([name, hex]) => swatch(name, hex, current.color === name, t(`avatar.color.${name}`))).join('');
  }
  function paintSize() {
    $('[data-size]').value = String(size);
    $('[data-size]').setAttribute('aria-valuetext', `${Math.round(size * 100)}%`);
  }
  function paint() { paintKinds(); paintSlots(); paintItems(); paintSize(); }

  function change(next) { outfit = normalizeOutfit(next, kind); outfits[kind] = outfit; stage?.dress(outfit, size); }
  // Named, so they come off the shared app root when the page closes.
  async function onChange(event) {
    const el = event.target;
    if (el.name === 'avatar-kind') { kind = el.value; outfit = normalizeOutfit(outfits[kind], kind); paint(); void showFigure(); }
    else if (el.name === 'avatar-slot') { slot = el.value; paintSlots(); paintItems(); }
    else if (el.name === 'avatar-item' && slot === 'body') change({ ...outfit, body: el.value });
    else if (el.name === 'avatar-item') { change({ ...outfit, [slot]: { item: el.value, color: SLOTS[slot][el.value] } }); paintItems(); }
    else if (el.name === 'avatar-color') change({ ...outfit, [slot]: { ...outfit[slot], color: el.value } });
    else if (el.matches('[data-file]')) await upload(el);
  }
  root.addEventListener('change', onChange);
  $('[data-size]').addEventListener('input', (event) => { size = clampSize(event.target.value); paintSize(); stage?.dress(outfit, size); });
  const onClick = (event) => { if (event.target.closest('[data-remove]')) void remove(); };
  root.addEventListener('click', onClick);
  $('[data-random]').onclick = () => { change(randomOutfit(kind)); paintItems(); };
  $('[data-reset]').onclick = () => { size = 1; change(defaultOutfit(kind)); paintItems(); paintSize(); };
  $('[data-save]').onclick = () => {
    if (busy) return;
    const snapshot = stage && !stage.failed ? stage.snapshot() : '';
    try { saveAvatar({ kind, outfit, size, name: modelName }, snapshot); toast(t('avatar.saved')); }
    catch { toast(t('avatar.save.failed')); }
  };

  async function upload(input) {
    const file = input.files?.[0]; input.value = '';
    if (!file || busy) return;
    busy = true; toast(t('avatar.upload.checking'));
    try {
      const result = await storeModel(file);
      if (disposed) return;
      if (!result.ok) { toast(t(`avatar.upload.${result.code}`)); return; }
      hasModel = true; modelName = result.name; kind = 'custom';
      outfit = normalizeOutfit(outfits.custom, 'custom'); loadedKind = '';
      paint(); await showFigure();
      toast(t('avatar.upload.done'));
    } catch { toast(t('avatar.upload.storage')); }
    finally { busy = false; }
  }
  async function remove() {
    if (busy) return;
    busy = true;
    try {
      await removeModel();
      hasModel = false; modelName = '';
      if (kind === 'custom') { kind = 'xiaoyou'; outfit = normalizeOutfit(outfits.xiaoyou, 'xiaoyou'); loadedKind = ''; }
      paint(); await showFigure();
      toast(t('avatar.removed'));
    } catch { toast(t('avatar.upload.storage')); }
    finally { busy = false; }
  }

  paint();
  startStage();
  // Whether a model is kept decides if "my model" can be picked; 小游 shows meanwhile.
  loadModel().then((record) => { hasModel = !!record; if (record?.name) modelName = modelName || record.name; }).catch(() => { hasModel = false; })
    .finally(() => { if (disposed) return; if (!hasModel && kind === 'custom') { kind = 'xiaoyou'; outfit = normalizeOutfit(outfits.xiaoyou, 'xiaoyou'); } paint(); void showFigure(); });

  return () => { disposed = true; root.removeEventListener('change', onChange); root.removeEventListener('click', onClick); stage?.dispose(); stage = null; };
}
