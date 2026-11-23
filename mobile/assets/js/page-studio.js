// InsTrip mobile — picking photos for a film (spec §6.10).
// Tapped photos go into the strip at the bottom; the order in the strip is the
// order of the shots. Every reorder can be done with buttons as well as a tap.

import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { go, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { listMedia, addFiles, addSamples, urlFor } from './media.js';
import { createFilm, STYLES, DURATIONS, MIN_ASSETS, MAX_ASSETS } from './films.js';

const DRAFT_KEY = 'instrip.studio';

function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') || {};
    return {
      picked: Array.isArray(d.picked) ? d.picked.slice(0, MAX_ASSETS) : [],
      styleId: STYLES.includes(d.styleId) ? d.styleId : STYLES[0],
      duration: DURATIONS.includes(d.duration) ? d.duration : 30,
    };
  } catch {
    return { picked: [], styleId: STYLES[0], duration: 30 };
  }
}

export function renderStudio(root) {
  const draft = loadDraft();
  let items = [];
  let loaded = false;
  const save = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* forgets on reload */ }
  };
  const nameOf = (item) => item.altKey ? t(item.altKey) : item.alt || t('studio.photo.own');

  root.innerHTML = `
    <section class="page page--studio">
      <header class="topbar">
        <button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button>
      </header>
      <h1 class="t-title">${te('studio.title')}</h1>
      <p class="t-body page__sub">${te('studio.sub')}</p>
      <div class="studio-tools">
        <label class="btn btn--outline studio-tools__add">
          <input class="sr-only" type="file" accept="image/*" multiple data-files />
          <span>${te('studio.add')}</span>
        </label>
        <button class="btn btn--text btn--inline" data-samples>${te('studio.samples')}</button>
      </div>
      <div data-grid></div>
    </section>

    <div class="strip glass glass--2">
      <div class="strip__head">
        <p class="t-label" id="strip-label">${te('studio.strip')}</p>
        <p class="t-small t-num" data-count aria-live="polite"></p>
      </div>
      <ol class="strip__row" aria-labelledby="strip-label" data-strip></ol>
      <div class="strip__options">
        <div class="segmented segmented--compact" role="radiogroup" aria-label="${te('studio.style')}">
          ${STYLES.map((id) => `<button class="segmented__item" role="radio" data-style="${id}"><span>${te(`style.${id}`)}</span></button>`).join('')}
        </div>
        <div class="segmented segmented--compact" role="radiogroup" aria-label="${te('studio.length')}">
          ${DURATIONS.map((n) => `<button class="segmented__item" role="radio" data-duration="${n}"><span class="t-num">${te('studio.seconds', { n })}</span></button>`).join('')}
        </div>
      </div>
      <button class="btn btn--primary" data-make data-track="film_create"></button>
    </div>`;

  const grid = root.querySelector('[data-grid]');
  const strip = root.querySelector('[data-strip]');
  const count = root.querySelector('[data-count]');
  const make = root.querySelector('[data-make]');

  function paintGrid() {
    if (!items.length) {
      grid.innerHTML = `
        <div class="empty">
          <div class="window window--frame empty__window" aria-hidden="true"></div>
          <h2 class="t-heading">${te('studio.empty.title')}</h2>
          <p class="t-body">${te('studio.empty.body')}</p>
        </div>`;
      return;
    }
    grid.innerHTML = `<ul class="photo-grid">${items.map((item) => {
      const order = draft.picked.indexOf(item.id) + 1;
      const label = order
        ? t('studio.photo.picked', { name: nameOf(item), order })
        : t('studio.photo.pick', { name: nameOf(item) });
      return `<li><button class="photo" data-photo="${esc(item.id)}" aria-pressed="${order > 0}" aria-label="${esc(label)}" data-track="studio_select">
        <img src="${esc(urlFor(item))}" alt="" loading="lazy" />
        ${order ? `<span class="photo__order t-num" aria-hidden="true">${order}</span>` : ''}
        ${item.sample ? `<span class="photo__tag" aria-hidden="true">${te('studio.sample')}</span>` : ''}
      </button></li>`;
    }).join('')}</ul>`;
  }

  function paintStrip() {
    const n = draft.picked.length;
    count.textContent = t('studio.count', { n, max: MAX_ASSETS });
    const cells = draft.picked.map((id) => items.find((x) => x.id === id)).filter(Boolean);
    strip.classList.toggle('is-empty', cells.length === 0);
    strip.innerHTML = cells.length
      ? cells.map((item, i) => {
        return `<li class="strip__cell">
          <img src="${esc(urlFor(item))}" alt="${esc(nameOf(item))}" />
          <span class="strip__n t-num" aria-hidden="true">${i + 1}</span>
          <span class="strip__moves">
            <button class="strip__move" data-move="${i}" data-by="-1" ${i === 0 ? 'disabled' : ''} aria-label="${te('studio.move.earlier', { n: i + 1 })}">${icon('back', { size: 18 })}</button>
            <button class="strip__move" data-move="${i}" data-by="1" ${i === n - 1 ? 'disabled' : ''} aria-label="${te('studio.move.later', { n: i + 1 })}">${icon('chevron', { size: 18 })}</button>
          </span>
        </li>`;
      }).join('')
      : `<li class="strip__empty t-small">${te('studio.strip.empty')}</li>`;

    root.querySelectorAll('[data-style]').forEach((el) => {
      const on = el.dataset.style === draft.styleId;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', String(on));
    });
    root.querySelectorAll('[data-duration]').forEach((el) => {
      const on = Number(el.dataset.duration) === draft.duration;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', String(on));
    });
    make.disabled = n < MIN_ASSETS;
    make.textContent = n < MIN_ASSETS ? t('studio.min', { n: MIN_ASSETS }) : t('studio.cta');
  }

  function paint() {
    // Drop picks whose photo is no longer in the library, but only once the
    // library has been read: before that, every pick would look missing.
    if (loaded) {
      draft.picked = draft.picked.filter((id) => items.some((x) => x.id === id));
      save();
    }
    paintGrid();
    paintStrip();
  }

  async function reload() {
    try {
      items = await listMedia();
      loaded = true;
      if (root.contains(grid)) paint();
    } catch { if (root.contains(grid)) toast(t('error.STORAGE')); }
  }

  grid.addEventListener('click', (event) => {
    const id = event.target.closest('[data-photo]')?.dataset.photo;
    if (!id) return;
    const at = draft.picked.indexOf(id);
    if (at >= 0) draft.picked.splice(at, 1);
    else if (draft.picked.length >= MAX_ASSETS) { toast(t('studio.full', { max: MAX_ASSETS })); return; }
    else draft.picked.push(id);
    paint();
    grid.querySelector(`[data-photo="${CSS.escape(id)}"]`)?.focus();
  });

  strip.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-move]');
    if (!btn || btn.disabled) return;
    const from = Number(btn.dataset.move);
    const to = from + Number(btn.dataset.by);
    [draft.picked[from], draft.picked[to]] = [draft.picked[to], draft.picked[from]];
    paint();
    // Keep focus on the photo that moved.
    const next = strip.querySelector(`[data-move="${to}"][data-by="${btn.dataset.by}"]`);
    (next && !next.disabled ? next : strip.querySelector(`[data-move="${to}"]:not(:disabled)`))?.focus();
  });

  root.querySelector('.strip__options').addEventListener('click', (event) => {
    const s = event.target.closest('[data-style]');
    const d = event.target.closest('[data-duration]');
    if (s) draft.styleId = s.dataset.style;
    if (d) draft.duration = Number(d.dataset.duration);
    if (s || d) { save(); paintStrip(); }
  });

  root.querySelector('[data-files]').addEventListener('change', async (event) => {
    const input = event.target;
    if (!input.files?.length) return;
    const { added, failed } = await addFiles(input.files);
    input.value = '';
    if (added.length) toast(t('studio.added', { n: added.length }));
    else if (failed) toast(t('studio.failed', { n: failed }));
    await reload();
  });

  root.querySelector('[data-samples]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await addSamples(); await reload(); }
    catch { if (root.contains(grid)) toast(t('error.STORAGE')); }
    finally { if (button.isConnected) button.disabled = false; }
  });

  function makeFilm() {
    if (draft.picked.length < MIN_ASSETS) return;
    const session = getSession();
    if (!session) { openLogin({ onDone: makeFilm }); return; }
    const result = createFilm({ mediaIds: draft.picked, styleId: draft.styleId, duration: draft.duration, email: session.email });
    if (!result.ok) { toast(t('error.CONFLICT')); return; }
    go(`studio/${result.film.id}`);
  }
  make.addEventListener('click', makeFilm);
  root.querySelector('[data-back]').addEventListener('click', () => back('trip'));

  const onMedia = () => reload();
  document.addEventListener('instrip:media', onMedia);

  paint();
  reload();
  return () => document.removeEventListener('instrip:media', onMedia);
}
