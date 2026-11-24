// Along — the craft gallery. Creators share 3D clay pieces, keepsakes and bead patterns; each is
// reviewed before it is public. Downloading or remixing someone else's work costs its point
// price once (the creator receives half). Offline or with the local profile, the gallery shows
// Along's own example works, unlocked with the points kept on this phone.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { go, back, replace } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { api, upload, fetchProtectedMedia, apiFileUrl } from './api.js';
import { errorText, dateText } from './community-ui.js';
import { confirmSpend, pointsError, pointsMode, localSpend, localPaid, insufficient, GALLERY_PRICE, AUTHOR_SHARE } from './points.js';
import { setDraft, takeDraft } from './workshop-draft.js';
import { listMedia, addFiles, urlFor } from './media.js';
import { validPattern } from './beads.js';
import { drawPattern, cellFor } from './page-beads.js';
import { CLAY_EXAMPLES, BEAD_EXAMPLES } from './gallery-examples.js';
import { clayCover } from './clay-cover.js';

const KINDS = ['CLAY', 'BEADS', 'MAGNET', 'KEYCHAIN'];
const online = () => pointsMode() === 'online';
// Along's own pieces: glazed clay figurines and pixel-art bead pictures, bright and real (they open and remix).
const EXAMPLES = [
  ...CLAY_EXAMPLES.map((e) => ({ ...e, kind: 'CLAY' })),
  ...BEAD_EXAMPLES.map((e) => ({ ...e, kind: 'BEADS' })),
].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'CLAY' ? -1 : 1));
const exampleView = (e) => ({ ...e, title: t(`gallery.example.${e.id}`), story: t(`gallery.example.${e.id}.story`), author: { displayName: t('gallery.example.author') },
  unlocked: localPaid(`gallery:${e.id}`), allowRemix: true, example: true, unlocks: 0 });
// Bead examples draw their own pattern; clay examples are rendered by the clay engine; members' works load from the server.
const beadCover = new Map();
function exampleCover(work) {
  if (work.kind === 'BEADS') {
    if (!beadCover.has(work.id)) { const c = document.createElement('canvas'); drawPattern(c, work.pattern, { cell: cellFor(work.pattern, 24, 520) }); beadCover.set(work.id, c.toDataURL('image/png')); }
    return Promise.resolve(beadCover.get(work.id));
  }
  return clayCover(work.id, work.parts);
}
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const coverSrc = (work) => (work.example ? PLACEHOLDER : apiFileUrl(work.coverUrl));
/** Fill example covers after the page is drawn (clay renders take a moment each). */
function fillCovers(host, items) {
  for (const work of items.filter((w) => w.example)) exampleCover(work).then((url) => { const img = host.querySelector(`[data-cover="${CSS.escape(work.id)}"]`); if (url && img) img.src = url; });
}

function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function renderGallery(root, param) {
  if (param === 'new') return renderUpload(root);
  if (param === 'mine') return renderMine(root);
  if (param) return renderWork(root, param);
  let disposed = false, kind = '', cursor = null, items = [];
  root.innerHTML = `<section class="page page--tab gallery-page">
    <header class="gallery-head">
      <button class="btn btn--text btn--inline" data-back>${icon('back', { size: 18 })}${te('common.back')}</button>
      <p class="workshop__eyebrow">${te('gallery.eyebrow')}</p>
      <h1 class="t-title">${te('gallery.title')}</h1>
      <p class="t-body">${te('gallery.sub', { n: GALLERY_PRICE.default, share: Math.round(AUTHOR_SHARE * 100) })}</p>
    </header>
    <div class="gallery-bar">
      <div class="chips" role="radiogroup" aria-label="${te('gallery.filter')}">${['', ...KINDS].map((k) => `<label class="chip"><input class="sr-only" type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''} /><span>${te(k ? `gallery.kind.${k}` : 'gallery.kind.all')}</span></label>`).join('')}</div>
      <div class="craft-action-row"><button class="btn btn--outline" data-go="gallery/new">${icon('upload', { size: 18 })}${te('gallery.share')}</button><button class="btn btn--text" data-go="gallery/mine">${te('gallery.mine')}</button></div>
    </div>
    <div data-grid></div><div data-more></div>
  </section>`;
  root.querySelector('[data-back]').onclick = () => back('workshop');
  const grid = root.querySelector('[data-grid]'), more = root.querySelector('[data-more]');
  const tile = (work, i) => `<li class="frame" style="--tilt:${[-0.8, 0.6, -0.4, 0.9, -0.6, 0.5][i % 6]}deg"><button class="frame__card" data-work="${esc(work.id)}">
    <span class="frame__mat${work.kind === 'BEADS' ? ' frame__mat--beads' : ''}"><img src="${esc(coverSrc(work))}" alt="" loading="lazy" data-cover="${esc(work.id)}" /></span>
    <span class="frame__label"><strong>${esc(work.title)}</strong><small>${esc(work.author?.displayName || '')} · ${te(`gallery.kind.${work.kind}`)}</small>
    <span class="frame__price t-num">${work.unlocked ? te('gallery.owned') : work.price ? te('points.amount', { n: work.price }) : te('workshop.free')}</span></span>
  </button></li>`;
  async function load(reset = true) {
    if (reset) { items = []; cursor = null; grid.innerHTML = `<p class="t-small" role="status">${te('community.loading')}</p>`; }
    if (!online()) {
      items = EXAMPLES.map(exampleView).filter((w) => !kind || w.kind === kind);
      grid.innerHTML = `<p class="note t-small">${te(getSession() ? 'gallery.examples.local' : 'gallery.examples.guest')}</p>${items.length ? `<ul class="gallery-wall">${items.map(tile).join('')}</ul>` : `<p class="t-small">${te('gallery.empty')}</p>`}`;
      fillCovers(grid, items); more.innerHTML = ''; return;
    }
    try {
      const response = await api(`/gallery?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(cursor ? { cursor } : {}) })}`);
      if (disposed) return;
      items = [...items, ...response.items]; cursor = response.nextCursor;
      // Along's own pieces sit after the travellers' work, so the wall is never bare.
      const shelf = cursor ? [] : EXAMPLES.map(exampleView).filter((w) => !kind || w.kind === kind);
      const wall = [...items, ...shelf];
      grid.innerHTML = wall.length ? `<ul class="gallery-wall">${wall.map(tile).join('')}</ul>` : `<div class="empty"><p class="t-body">${te('gallery.empty')}</p></div>`;
      fillCovers(grid, shelf);
      more.innerHTML = cursor ? `<button class="btn btn--outline" data-more-btn>${te('gallery.more')}</button>` : '';
    } catch (error) {
      if (disposed) return;
      // No connection: the examples still let the traveller try the gallery.
      const shelf = EXAMPLES.map(exampleView);
      grid.innerHTML = `<p class="note t-small">${esc(errorText(error))}</p><ul class="gallery-wall">${shelf.map(tile).join('')}</ul>`;
      fillCovers(grid, shelf);
    }
  }
  const change = (event) => { if (event.target.name === 'kind') { kind = event.target.value; load(); } };
  const click = (event) => {
    const id = event.target.closest('[data-work]')?.dataset.work;
    if (id) { go(`gallery/${id}`); return; }
    const route = event.target.closest('[data-go]')?.dataset.go;
    if (route) { go(route); return; }
    if (event.target.closest('[data-more-btn]')) load(false);
  };
  root.addEventListener('change', change); root.addEventListener('click', click);
  load();
  return () => { disposed = true; root.removeEventListener('change', change); root.removeEventListener('click', click); };
}

function renderWork(root, id) {
  let disposed = false, work = null, busy = false;
  root.innerHTML = `<section class="page page--flow gallery-page">
    <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('gallery.title')}</h1></header>
    <div data-body><p class="t-small" role="status">${te('community.loading')}</p></div></section>`;
  root.querySelector('[data-back]').onclick = () => back('gallery');
  const host = root.querySelector('[data-body]');
  const example = EXAMPLES.find((e) => e.id === id);
  function paint() {
    const mine = work.self, open = work.unlocked || mine;
    host.innerHTML = `<figure class="work">
        <div class="work__frame${work.kind === 'BEADS' ? ' work__frame--beads' : ''}"><img src="${esc(coverSrc(work))}" data-cover="${esc(work.id)}" alt="${te('gallery.cover.alt', { title: work.title })}" /></div>
        <figcaption class="work__caption">
          <p class="workshop__eyebrow">${te(`gallery.kind.${work.kind}`)}${work.remixOf ? ` · ${te('gallery.remix.of')}` : ''}</p>
          <h2 class="t-title">${esc(work.title)}</h2>
          <p class="t-small">${te('gallery.by', { name: work.author?.displayName || '' })}${work.city ? ` · ${esc(work.city)}` : ''}${work.createdAt ? ` · ${esc(dateText(work.createdAt))}` : ''}</p>
          ${work.story ? `<p class="t-body work__story">${esc(work.story)}</p>` : ''}
        </figcaption>
      </figure>
      ${mine && work.status && work.status !== 'PUBLIC' ? `<p class="note t-small">${te(`gallery.status.${work.status}`)}${work.reviewNote ? ` — ${esc(work.reviewNote)}` : ''}</p>` : ''}
      <div class="work__buy">
        ${open ? `<p class="t-small">${te(mine ? 'gallery.yours' : 'gallery.unlocked')}</p>`
          : `<p class="work__price"><span class="t-num">${work.price ? te('points.amount', { n: work.price }) : te('workshop.free')}</span><small>${te('gallery.price.note', { n: Math.floor(work.price * AUTHOR_SHARE) })}</small></p>`}
        <div class="craft-action-row">
          <button class="btn btn--primary" data-act="DOWNLOAD">${icon('download', { size: 18 })}${te(open ? 'gallery.download' : 'gallery.unlock.download')}</button>
          ${work.allowRemix || mine ? `<button class="btn btn--outline" data-act="REMIX">${icon('remix', { size: 18 })}${te(open ? 'gallery.remix' : 'gallery.unlock.remix')}</button>` : `<p class="t-small">${te('gallery.noRemix')}</p>`}
        </div>
        ${mine && !work.example ? `<button class="btn btn--text" data-withdraw>${te('gallery.withdraw')}</button>` : ''}
      </div>`;
    if (work.example) fillCovers(host, [work]);
  }
  async function act(purpose) {
    if (busy) return;
    const mine = work.self, open = work.unlocked || mine;
    if (!getSession()) { openLogin(); return; }
    if (!open && work.price > 0 && !await confirmSpend({ item: 'GALLERY', cost: work.price, title: work.title, detail: t('gallery.confirm.detail', { n: Math.floor(work.price * AUTHOR_SHARE) }) })) return;
    busy = true;
    try {
      if (work.example) {
        if (!open) { localSpend('GALLERY', work.id, `gallery:${work.id}`, work.price); work = exampleView(example); paint(); }
        if (example.pattern) {
          if (purpose === 'REMIX') { setDraft('beads', example.pattern); go('beads'); }
          else { const c = document.createElement('canvas'); drawPattern(c, example.pattern, { cell: cellFor(example.pattern, 28), labels: true }); c.toBlob((b) => b && download(b, `along-${work.id}.png`), 'image/png'); toast(t('beads.saved')); }
        } else {
          // Both download and remix open the piece on the bench: export GLB/STL from there.
          setDraft('clay', { parts: example.parts, title: purpose === 'REMIX' ? t('gallery.remix.title', { title: work.title }) : work.title, galleryId: null });
          go('clay/new');
        }
        return;
      }
      if (!open) {
        const result = await api(`/gallery/${encodeURIComponent(work.id)}/unlock`, { method: 'POST', body: { purpose } });
        work = result.work; paint();
        if (result.charged) toast(t('points.spent', { n: result.charged, balance: result.balance }));
      }
      if (purpose === 'REMIX' && work.recipe) { setDraft('clay', { parts: work.recipe.parts, title: t('gallery.remix.title', { title: work.title }), galleryId: work.id }); go('clay/new'); return; }
      if (work.pattern) {
        if (purpose === 'REMIX') { setDraft('beads', work.pattern); go('beads'); return; }
        const c = document.createElement('canvas'); drawPattern(c, work.pattern, { cell: cellFor(work.pattern, 28), labels: true });
        c.toBlob((b) => b && download(b, `along-gallery-${work.id}.png`), 'image/png'); toast(t('beads.saved')); return;
      }
      const blob = await fetchProtectedMedia(work.modelUrl, { maxBytes: 32 * 1024 * 1024 });
      if (purpose === 'REMIX') { setDraft('clay', { glb: new Uint8Array(await blob.arrayBuffer()), title: t('gallery.remix.title', { title: work.title }), galleryId: work.id }); go('clay/new'); }
      else { download(new Blob([blob], { type: 'model/gltf-binary' }), `along-gallery-${work.id}.glb`); toast(t(window.Android ? 'craft3d.download.native' : 'craft3d.download.started')); }
    } catch (error) {
      toast(insufficient(error) || error?.code === 'POINTS_INSUFFICIENT' ? t('points.error.short') : error?.status === 403 ? t('gallery.noRemix') : pointsError(error));
      if (insufficient(error) || error?.code === 'POINTS_INSUFFICIENT') go('points');
    } finally { busy = false; }
  }
  host.addEventListener('click', async (event) => {
    const purpose = event.target.closest('[data-act]')?.dataset.act;
    if (purpose) { act(purpose); return; }
    if (event.target.closest('[data-withdraw]')) {
      try { await api(`/gallery/${encodeURIComponent(work.id)}`, { method: 'DELETE' }); toast(t('gallery.withdrawn')); go('gallery/mine'); }
      catch (error) { toast(errorText(error)); }
    }
  });
  if (example) { work = exampleView(example); paint(); }
  else api(`/gallery/${encodeURIComponent(id)}`).then((r) => { if (!disposed) { work = r.work; paint(); } })
    .catch((error) => { if (!disposed) host.innerHTML = `<p class="t-body">${esc(errorText(error))}</p>`; });
  return () => { disposed = true; };
}

function renderUpload(root) {
  const session = getSession();
  const draft = takeDraft('gallery');
  let busy = false, coverBlob = null, coverUrl = '';
  root.innerHTML = `<section class="page page--flow gallery-page">
    <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('gallery.share')}</h1></header>
    <div data-body></div></section>`;
  root.querySelector('[data-back]').onclick = () => back('gallery');
  const host = root.querySelector('[data-body]');
  if (!session) { host.innerHTML = `<div class="empty"><p class="t-body">${te('gallery.signin')}</p><button class="btn btn--primary" data-signin>${te('you.signin')}</button></div>`; host.querySelector('[data-signin]').onclick = () => openLogin(); return () => {}; }
  if (session.localOnly) { host.innerHTML = `<p class="note t-body">${te('gallery.upload.local')}</p>`; return () => {}; }
  if (!draft) {
    host.innerHTML = `<p class="t-body">${te('gallery.upload.how')}</p>
      <div class="craft-action-row"><button class="btn btn--outline" data-go="clay/new">${icon('clay', { size: 18 })}${te('workshop.clay.name')}</button><button class="btn btn--outline" data-go="beads">${icon('beads', { size: 18 })}${te('workshop.beads.name')}</button></div>
      <h2 class="t-heading">${te('gallery.upload.file')}</h2>
      <form class="community-form" data-file-form><label class="field"><span class="t-label">${te('gallery.upload.glb')}</span><input class="input" type="file" accept=".glb,model/gltf-binary" name="glb" required /></label>
      <label class="field"><span class="t-label">${te('gallery.upload.cover')}</span><input class="input" type="file" accept="image/*" name="cover" required /></label>
      <button class="btn btn--primary" type="submit">${te('gallery.upload.next')}</button></form>`;
    host.addEventListener('click', (event) => { const r = event.target.closest('[data-go]')?.dataset.go; if (r) go(r); });
    host.querySelector('[data-file-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target, glb = form.elements.glb.files[0], cover = form.elements.cover.files[0];
      if (!glb || !cover) return;
      if (glb.size > 32 * 1024 * 1024) { toast(t('gallery.upload.tooBig')); return; }
      const image = await loadImage(URL.createObjectURL(cover));
      const c = document.createElement('canvas'), s = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      c.width = Math.round(image.naturalWidth * s); c.height = Math.round(image.naturalHeight * s); c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
      setDraft('gallery', { kind: 'CLAY', glb: new Uint8Array(await glb.arrayBuffer()), cover: c, title: glb.name.replace(/\.glb$/i, '') });
      replace('gallery/new');
    });
    return () => {};
  }
  host.innerHTML = `<form class="community-form" data-form>
      <div class="work__frame work__frame--small"><img data-cover alt="${te('gallery.cover.preview')}" /></div>
      <label class="field"><span class="t-label">${te('gallery.form.title')}</span><input class="input" name="title" maxlength="60" required value="${esc(draft.title || '')}" /></label>
      <label class="field"><span class="t-label">${te('gallery.form.story')}</span><textarea class="input" name="story" maxlength="600" rows="3" placeholder="${te('gallery.form.story.hint')}"></textarea></label>
      <label class="field"><span class="t-label">${te('gallery.form.city')}</span><input class="input" name="city" maxlength="40" /></label>
      <fieldset class="field-group"><legend class="t-label">${te('gallery.form.kind')}</legend><div class="segmented segmented--compact">${(draft.kind === 'BEADS' ? ['BEADS'] : ['CLAY', 'MAGNET', 'KEYCHAIN']).map((k, i) => `<label class="segmented__item"><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''} /><span>${te(`gallery.kind.${k}`)}</span></label>`).join('')}</div></fieldset>
      <label class="field"><span class="t-label">${te('gallery.form.price', { min: GALLERY_PRICE.min, max: GALLERY_PRICE.max })}</span><input class="input" name="price" type="number" inputmode="numeric" min="${GALLERY_PRICE.min}" max="${GALLERY_PRICE.max}" step="1" value="${GALLERY_PRICE.default}" required /></label>
      <p class="t-small" data-earn></p>
      <label class="consent"><input type="checkbox" name="allowRemix" checked /> <span>${te('gallery.form.remix')}</span></label>
      <label class="consent"><input type="checkbox" name="consent" required /> <span>${te('gallery.form.consent')}</span></label>
      <p class="note t-small">${te('gallery.form.review')}</p>
      <button class="btn btn--primary" type="submit">${te('gallery.form.submit')}</button>
    </form>`;
  const form = host.querySelector('[data-form]');
  const earn = () => { const n = Math.max(0, Math.min(GALLERY_PRICE.max, Math.floor(Number(form.elements.price.value) || 0))); form.querySelector('[data-earn]').textContent = t('gallery.form.earn', { n: Math.floor(n * AUTHOR_SHARE) }); };
  earn(); form.elements.price.addEventListener('input', earn);
  draft.cover.toBlob((blob) => { coverBlob = blob; coverUrl = URL.createObjectURL(blob); form.querySelector('[data-cover]').src = coverUrl; }, 'image/png');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity() || !coverBlob) return;
    busy = true; form.querySelector('[type=submit]').disabled = true;
    try {
      const meta = { kind: form.elements.kind.value, title: form.elements.title.value.trim(), story: form.elements.story.value.trim(), city: form.elements.city.value.trim(),
        price: Math.floor(Number(form.elements.price.value)), allowRemix: form.elements.allowRemix.checked, consent: true,
        ...(draft.remixOf ? { remixOf: draft.remixOf } : {}), ...(draft.pattern && validPattern(draft.pattern) ? { pattern: draft.pattern } : {}), ...(draft.recipe ? { recipe: draft.recipe } : {}) };
      const data = new FormData();
      data.append('metadata', JSON.stringify(meta));
      data.append('cover', coverBlob, 'cover.png');
      if (draft.glb) data.append('model', new Blob([draft.glb], { type: 'model/gltf-binary' }), 'work.glb');
      const { work } = await upload('/gallery', data);
      toast(t('gallery.form.sent')); replace(`gallery/${work.id}`);
    } catch (error) {
      toast(error?.status === 422 ? t('gallery.form.invalid') : errorText(error));
      form.querySelector('[type=submit]').disabled = false;
    } finally { busy = false; }
  });
  return () => { if (coverUrl) URL.revokeObjectURL(coverUrl); };
}

function renderMine(root) {
  let disposed = false;
  root.innerHTML = `<section class="page page--flow gallery-page">
    <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('gallery.mine')}</h1></header>
    <div data-body><p class="t-small" role="status">${te('community.loading')}</p></div></section>`;
  root.querySelector('[data-back]').onclick = () => back('gallery');
  const host = root.querySelector('[data-body]');
  if (!online()) { host.innerHTML = `<p class="note t-body">${te(getSession() ? 'gallery.upload.local' : 'gallery.signin')}</p>`; return () => {}; }
  const row = (w) => `<li><button class="row" data-work="${esc(w.id)}"><span class="row__icon gallery-thumb"><img src="${esc(apiFileUrl(w.coverUrl))}" alt="" loading="lazy" /></span>
    <span class="row__text"><strong>${esc(w.title)}</strong><small>${w.status ? te(`gallery.status.${w.status}`) : te('gallery.owned')} · ${te('gallery.unlocks', { n: w.unlocks })}</small></span>${icon('chevron', { size: 20 })}</button></li>`;
  api('/gallery/mine').then(({ works, unlocked }) => {
    if (disposed) return;
    host.innerHTML = `<h2 class="t-heading">${te('gallery.mine.shared')}</h2>${works.length ? `<ul class="rows card">${works.map(row).join('')}</ul>` : `<p class="t-small">${te('gallery.mine.none')}</p>`}
      <h2 class="t-heading">${te('gallery.mine.unlocked')}</h2>${unlocked.length ? `<ul class="rows card">${unlocked.map(row).join('')}</ul>` : `<p class="t-small">${te('gallery.mine.noneUnlocked')}</p>`}`;
  }).catch((error) => { if (!disposed) host.innerHTML = `<p class="t-body">${esc(errorText(error))}</p>`; });
  host.addEventListener('click', (event) => { const id = event.target.closest('[data-work]')?.dataset.work; if (id) go(`gallery/${id}`); });
  return () => { disposed = true; };
}
