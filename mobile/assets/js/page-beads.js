// Along — perler bead patterns. Pick a photo, choose the board and how many colours, see the
// pattern bead by bead; 5 points unlocks the full-size pattern and materials list, and the kit
// (beads, pegboards, ironing paper) can be ordered to a home address. Payment is a labelled demo.
import { t, te, esc, getLocale } from './i18n.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { go, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { api } from './api.js';
import { listMedia, addFiles, addSamples, urlFor } from './media.js';
import { mediaName } from './seed-text.js';
import { fen } from './format.js';
import { shippingFields, readShipping } from './inquiry-ui.js';
import { errorText, dateText } from './community-ui.js';
import { payWithPoints, localPaid, pointsMode, newKey, PRICES } from './points.js';
import { setDraft, takeDraft } from './workshop-draft.js';
import { buildPattern, beadCounts, kitQuote, boardsFor, finishedCm, patternRef, SIZES, PALETTE, CELL_ALPHABET, validPattern, MAX_PEGS } from './beads.js';

const DRAFT = 'along.beads.draft.v1';
const PAID = 'along.beads.paid.v1';
function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
// About four photo pixels per peg, so a 116-peg picture still averages real detail into each bead.
function pixels(image, max = 640) {
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(image.naturalWidth * scale)); c.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, c.width, c.height);
  return { rgba: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
}
const paidSet = () => { try { return new Set(JSON.parse(localStorage.getItem(PAID) || '[]')); } catch { return new Set(); } };
const markPaid = (ref) => { const s = paidSet(); s.add(ref); try { localStorage.setItem(PAID, JSON.stringify([...s].slice(-200))); } catch { /* the charge is on the server ledger */ } };
const colourName = (code) => { const p = PALETTE.find((c) => c.code === code); return p ? (getLocale() === 'zh' ? p.zh : p.en) : code; };

/** Draw the pattern: round beads on a pegboard, with a darker line every 5 and 29 pegs. */
// Largest cell that keeps the canvas under `limit` px (phones refuse very large canvases).
export const cellFor = (pattern, want, limit = 2900) => Math.max(4, Math.min(want, Math.floor(limit / Math.max(pattern.width, pattern.height))));
export function drawPattern(canvas, pattern, { cell = 12, labels = false, blur = false } = {}) {
  const w = pattern.width * cell, h = pattern.height * cell;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe7d8'; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < pattern.height; y++) for (let x = 0; x < pattern.width; x++) {
    const ch = pattern.cells[y * pattern.width + x], cx = x * cell + cell / 2, cy = y * cell + cell / 2;
    if (ch === '.') { ctx.fillStyle = '#d9cfbd'; ctx.beginPath(); ctx.arc(cx, cy, cell * 0.12, 0, Math.PI * 2); ctx.fill(); continue; }
    const colour = pattern.palette[CELL_ALPHABET.indexOf(ch)];
    ctx.fillStyle = colour.hex; ctx.beginPath(); ctx.arc(cx, cy, cell * 0.46, 0, Math.PI * 2); ctx.fill();
    // The hole in each bead: what makes it read as beads rather than pixels.
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(cx, cy, cell * 0.14, 0, Math.PI * 2); ctx.fill();
    if (labels && cell >= 18) {
      ctx.fillStyle = luminance(colour.hex) > 0.55 ? '#1b1813' : '#fffdf8';
      ctx.font = `600 ${Math.round(cell * 0.3)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(CELL_ALPHABET.indexOf(ch) + 1), cx, cy - cell * 0.27);
    }
  }
  ctx.strokeStyle = 'rgba(27,24,19,.16)'; ctx.lineWidth = 1;
  for (let x = 5; x < pattern.width; x += 5) { ctx.beginPath(); ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, h); ctx.stroke(); }
  for (let y = 5; y < pattern.height; y += 5) { ctx.beginPath(); ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(w, y * cell + 0.5); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(178,74,44,.55)'; ctx.lineWidth = 2;
  for (let x = 29; x < pattern.width; x += 29) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, h); ctx.stroke(); }
  for (let y = 29; y < pattern.height; y += 29) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(w, y * cell); ctx.stroke(); }
  // Before paying, the preview is shown soft so the pattern cannot be copied bead by bead.
  if (blur) { ctx.filter = 'blur(3px)'; ctx.drawImage(canvas, 0, 0); ctx.filter = 'none'; }
}
function luminance(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

export function renderBeads(root, param) {
  if (param === 'orders') return renderBeadOrders(root);
  const session = getSession();
  let disposed = false, items = [], image = null, pattern = null, busy = false;
  const DEFAULTS = { size: 58, colors: 20, dither: false };
  let draft = (() => { try { const d = { ...DEFAULTS, ...JSON.parse(sessionStorage.getItem(DRAFT) || '{}') }; return SIZES.includes(d.size) ? d : { ...d, size: DEFAULTS.size }; } catch { return { ...DEFAULTS }; } })();
  const saveDraft = () => { try { sessionStorage.setItem(DRAFT, JSON.stringify(draft)); } catch { /* a reload forgets */ } };
  root.innerHTML = `<section class="page page--flow beads-page">
    <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('beads.title')}</h1></header>
    <p class="t-body">${te('beads.sub')}</p>
    <div data-body></div>
  </section>`;
  root.querySelector('[data-back]').onclick = () => back('workshop');
  const body = root.querySelector('[data-body]');
  const paid = () => pattern && (paidSet().has(patternRef(pattern)) || (pointsMode() === 'local' && localPaid(patternRef(pattern))));

  function photoStep() {
    body.innerHTML = `<h2 class="t-heading">${te('beads.step.photo')}</h2>
      <div class="studio-tools"><label class="btn btn--outline studio-tools__add"><input class="sr-only" type="file" accept="image/*" data-files /><span>${te('studio.add')}</span></label>
      ${items.length ? '' : `<button class="btn btn--text" data-samples>${te('beads.samples')}</button>`}</div>
      ${items.length ? `<ul class="photo-grid">${items.map((item) => `<li><button class="photo" data-photo="${esc(item.id)}" aria-label="${esc(mediaName(item))}"><img src="${esc(urlFor(item))}" alt="" loading="lazy" /></button></li>`).join('')}</ul>` : ''}
      <p class="note t-small">${te('beads.tip')}</p>`;
  }
  function makePattern() {
    if (!image) return;
    const { rgba, width, height } = pixels(image);
    const rows = Math.round(draft.size * Math.min(1.6, Math.max(0.6, height / width)));
    pattern = buildPattern(rgba, width, height, { cols: draft.size, rows: Math.max(8, Math.min(MAX_PEGS, rows)), maxColors: draft.colors, dither: draft.dither });
  }
  function designStep() {
    const unlocked = paid(), counts = beadCounts(pattern), [wcm, hcm] = finishedCm(pattern);
    body.innerHTML = `<div class="bead-board"><canvas data-canvas aria-label="${te('beads.preview.alt', { w: pattern.width, h: pattern.height })}" role="img"></canvas>${unlocked ? '' : `<span class="bead-board__lock">${icon('lock', { size: 18 })}${te('beads.locked')}</span>`}</div>
      <div class="bead-controls">
        <fieldset class="field-group"><legend class="t-label">${te('beads.size')}</legend><div class="segmented segmented--compact" role="radiogroup">${SIZES.map((n) => `<label class="segmented__item"><input type="radio" name="size" value="${n}" ${draft.size === n ? 'checked' : ''} /><span>${te('beads.size.n', { n })}</span></label>`).join('')}</div></fieldset>
        <fieldset class="field-group"><legend class="t-label">${te('beads.colors')}</legend><div class="segmented segmented--compact" role="radiogroup">${[8, 20, 32].map((n) => `<label class="segmented__item"><input type="radio" name="colors" value="${n}" ${draft.colors === n ? 'checked' : ''} /><span>${te('beads.colors.n', { n })}</span></label>`).join('')}</div></fieldset>
        <label class="consent"><input type="checkbox" data-dither ${draft.dither ? 'checked' : ''} /> <span>${te('beads.dither')}</span></label>
      </div>
      <p class="t-small bead-facts">${te('beads.facts', { w: pattern.width, h: pattern.height, cmw: wcm, cmh: hcm, boards: boardsFor(pattern), colours: counts.length, beads: counts.reduce((s, c) => s + c.count, 0) })}</p>
      ${unlocked ? `
        <h2 class="t-heading">${te('beads.card')}</h2>
        <ul class="bead-card">${counts.map((c, i) => `<li><span class="bead-dot" style="--bead:${esc(c.hex)}" aria-hidden="true"></span><span class="bead-card__n t-num">${i + 1}</span><span>${esc(c.code)} · ${esc(colourName(c.code))}</span><strong class="t-num">${te('beads.count', { n: c.count })}</strong></li>`).join('')}</ul>
        <div class="craft-action-row"><button class="btn btn--outline" data-save-png>${icon('download', { size: 18 })}${te('beads.save')}</button><button class="btn btn--outline" data-share-gallery>${icon('upload', { size: 18 })}${te('beads.toGallery')}</button></div>
        <button class="btn btn--primary" data-order>${icon('truck', { size: 18 })}${te('beads.order')}</button>`
        : `<button class="btn btn--primary" data-unlock>${te('beads.unlock', { n: PRICES.BEADS })}</button><p class="t-small">${te('beads.unlock.note')}</p>`}
      <button class="btn btn--text" data-again>${te('beads.another')}</button>`;
    drawPattern(body.querySelector('[data-canvas]'), pattern, { cell: cellFor(pattern, unlocked ? 14 : 10, 1800), blur: !unlocked });
  }
  function orderStep() {
    const quotes = { BEADS: kitQuote(pattern, 'BEADS'), FULL_KIT: kitQuote(pattern, 'FULL_KIT') };
    body.innerHTML = `<h2 class="t-heading">${te('beads.order.title')}</h2>
      <form class="community-form" data-order-form>
        <fieldset class="field-group"><legend class="t-label">${te('beads.kit')}</legend>
          ${['FULL_KIT', 'BEADS'].map((kit, i) => `<label class="kit-option"><input type="radio" name="kit" value="${kit}" ${i === 0 ? 'checked' : ''} /><span><strong>${te(`beads.kit.${kit}`)}</strong><small>${te(`beads.kit.${kit}.desc`)}</small></span><span class="t-num">${esc(fen(quotes[kit].totalCents))}</span></label>`).join('')}
        </fieldset>
        <div data-lines></div>
        ${shippingFields()}
        <p class="note t-small">${te('beads.order.demo')}</p>
        <label class="consent"><input type="checkbox" name="demo" required /> <span>${te('beads.order.demoCheck')}</span></label>
        <button class="btn btn--primary" type="submit">${te('beads.order.pay')}</button>
        <button class="btn btn--text" type="button" data-design>${te('common.back')}</button>
      </form>`;
    const form = body.querySelector('[data-order-form]');
    const lines = () => {
      const q = quotes[form.elements.kit.value];
      body.querySelector('[data-lines]').innerHTML = `<ul class="price-list">${q.lines.map((l) => `<li><span>${te(`beads.line.${l.item}`, { n: l.quantity })}</span><strong class="t-num">${esc(fen(l.cents))}</strong></li>`).join('')}<li class="price-list__total"><span>${te('beads.total')}</span><strong class="t-num">${esc(fen(q.totalCents))}</strong></li></ul>`;
    };
    lines();
    form.addEventListener('change', (event) => { if (event.target.name === 'kit') lines(); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      if (session.localOnly) { toast(t('experience.online.blocked')); return; }
      busy = true; form.querySelector('[type=submit]').disabled = true;
      try {
        const { order } = await api('/bead-orders', { method: 'POST', body: { pattern, kit: form.elements.kit.value, shipping: readShipping(form), demoConsent: true, idempotencyKey: form.dataset.key || (form.dataset.key = newKey()) } });
        toast(t('beads.order.done')); go(`beads/orders`); void order;
      } catch (error) { toast(errorText(error)); form.querySelector('[type=submit]').disabled = false; }
      finally { busy = false; }
    });
  }
  async function reload() {
    try { const media = await listMedia(); if (disposed) return; items = [...media.filter((m) => m.userProvided), ...media.filter((m) => !m.userProvided)]; if (!pattern) photoStep(); }
    catch { if (!disposed) body.innerHTML = `<p class="t-small">${te('craft.photo.error')}</p>`; }
  }
  body.addEventListener('change', async (event) => {
    if (event.target.matches('[data-files]')) {
      const result = await addFiles(event.target.files); if (result.failed) toast(t('workshop.addFailed', { n: result.failed })); await reload(); return;
    }
    if (!pattern) return;
    if (event.target.name === 'size') draft.size = Number(event.target.value);
    else if (event.target.name === 'colors') draft.colors = Number(event.target.value);
    else if (event.target.matches('[data-dither]')) draft.dither = event.target.checked;
    else return;
    saveDraft(); makePattern(); designStep();
  });
  body.addEventListener('click', async (event) => {
    if (busy) return;
    const photo = event.target.closest('[data-photo]')?.dataset.photo;
    if (photo) {
      const item = items.find((m) => m.id === photo);
      try { image = await loadImage(urlFor(item)); makePattern(); designStep(); window.scrollTo(0, 0); }
      catch { toast(t('craft.photo.error')); }
      return;
    }
    if (event.target.closest('[data-samples]')) { await addSamples(); await reload(); return; }
    if (event.target.closest('[data-again]')) { pattern = null; image = null; photoStep(); return; }
    if (event.target.closest('[data-design]')) { designStep(); return; }
    if (event.target.closest('[data-unlock]')) {
      const ref = patternRef(pattern);
      busy = true;
      const result = await payWithPoints({ item: 'BEADS', title: t('beads.unlock.title'), detail: t('beads.unlock.detail', { w: pattern.width, h: pattern.height }), ref, key: ref });
      busy = false;
      if (result) { markPaid(ref); designStep(); }
      return;
    }
    if (event.target.closest('[data-save-png]')) {
      const canvas = document.createElement('canvas'); drawPattern(canvas, pattern, { cell: cellFor(pattern, 28), labels: true });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = `along-beads-${pattern.width}x${pattern.height}.png`; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        toast(t(window.Android ? 'craft3d.download.native' : 'beads.saved'));
      }, 'image/png');
      return;
    }
    if (event.target.closest('[data-share-gallery]')) {
      const cover = document.createElement('canvas'); drawPattern(cover, pattern, { cell: cellFor(pattern, 16, 1200) });
      setDraft('gallery', { kind: 'BEADS', pattern, cover }); go('gallery/new'); return;
    }
    if (event.target.closest('[data-order]')) orderStep();
  });
  if (!session) {
    body.innerHTML = `<div class="empty"><p class="t-body">${te('beads.signin')}</p><button class="btn btn--primary" data-signin>${te('you.signin')}</button></div>`;
    body.querySelector('[data-signin]').onclick = () => openLogin();
    return () => { disposed = true; };
  }
  // A pattern sent back from the gallery ("remix this pattern") opens straight in the editor.
  const sent = takeDraft('beads');
  if (validPattern(sent)) { pattern = sent; markPaid(patternRef(sent)); designStep(); }
  if (!pattern) { photoStep(); reload(); }
  return () => { disposed = true; };
}

function renderBeadOrders(root) {
  let disposed = false;
  root.innerHTML = `<section class="page page--flow beads-page">
    <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('beads.orders')}</h1></header>
    <div data-body><p class="t-small" role="status">${te('community.loading')}</p></div></section>`;
  root.querySelector('[data-back]').onclick = () => back('workshop');
  const host = root.querySelector('[data-body]');
  if (!getSession()) { host.innerHTML = `<p class="t-body">${te('beads.signin')}</p>`; return () => {}; }
  api('/bead-orders').then(({ items }) => {
    if (disposed) return;
    host.innerHTML = items.length ? `<ul class="stack">${items.map((o) => `<li class="card bead-order">
      <p class="bead-order__head"><span class="stamp ${o.status === 'SHIPPED' ? 'stamp--ok' : 'stamp--pending'}">${te(`beads.status.${o.status}`)}</span><span class="t-small">${esc(dateText(o.createdAt))}</span></p>
      <p><strong>${te(`beads.kit.${o.kit}`)}</strong> · ${esc(fen(o.amountCents))} <span class="t-small">${te('beads.demoPaid')}</span></p>
      <p class="t-small">${te('beads.order.summary', { beads: o.quote.beads, colours: o.quote.colours.length })}</p>
      ${o.tracking ? `<p class="t-small">${te('beads.tracking', { carrier: o.tracking.carrier, number: o.tracking.number })}</p>` : ''}
    </li>`).join('')}</ul>` : `<div class="empty"><p class="t-body">${te('beads.orders.empty')}</p><button class="btn btn--primary" data-new>${te('beads.title')}</button></div>`;
    host.querySelector('[data-new]')?.addEventListener('click', () => go('beads'));
  }).catch((error) => { if (!disposed) host.innerHTML = `<p class="t-small">${esc(errorText(error))}</p>`; });
  return () => { disposed = true; };
}
