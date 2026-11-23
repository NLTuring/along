// InsTrip mobile — the film preview (spec §6.11). The one dark page in the app:
// it is the screening room. Plays the chosen photos in order with captions.
// Tap the right half for the next shot, the left half for the previous one,
// hold to pause; the buttons underneath do the same.

import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { toast, openSheet, closeSheet, prefersReducedMotion } from './ui.js';
import { go, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { getMedia, urlFor } from './media.js';
import { getFilm, setCaption, captionProblem, shotSeconds, CAPTION_LINE_LEN } from './films.js';
import { openShare } from './share-sheet.js';
import { openPostComposer } from './post-sheet.js';

function message(root, text, button) {
  root.innerHTML = `
    <section class="page page--flow">
      <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button></header>
      <p class="t-body">${text}</p>${button}
    </section>`;
  root.querySelector('[data-back]').addEventListener('click', () => back('studio'));
}

export function renderFilm(root, filmId) {
  const session = getSession();
  if (!session) {
    message(root, te('login.sub'), `<button class="btn btn--primary" data-signin>${te('you.signin')}</button>`);
    root.querySelector('[data-signin]').addEventListener('click', () => openLogin());
    return null;
  }
  let film = getFilm(filmId);
  // Someone else's film is treated the same as one that does not exist.
  if (!film || film.email !== session.email) {
    message(root, te('film.notfound'), `<button class="btn btn--primary" data-pick>${te('film.back')}</button>`);
    root.querySelector('[data-pick]').addEventListener('click', () => go('studio'));
    return null;
  }

  const total = film.shots.length;
  let index = 0;
  let playing = !prefersReducedMotion(); // reduced motion: start paused, step by hand
  let elapsed = 0;      // ms into the current shot
  let last = 0;
  let raf = 0;
  let urls = [];
  let disposed = false;

  root.innerHTML = `
    <section class="page page--film">
      <header class="topbar">
        <button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button>
        <h1 class="t-heading topbar__title">${te('film.title')}</h1>
      </header>
      <div class="window window--frame player" data-player>
        <img class="player__img" data-img alt="" />
        <span class="player__brand">${te('brand')}</span>
        <p class="player__caption" data-caption></p>
        <div class="player__bars" aria-hidden="true">${film.shots.map(() => '<i><b></b></i>').join('')}</div>
      </div>
      <p class="sr-only" data-status aria-live="polite"></p>
      <div class="player__controls">
        <button class="icon-btn" data-prev aria-label="${te('film.prev')}">${icon('back')}</button>
        <button class="icon-btn player__toggle" data-toggle></button>
        <button class="icon-btn" data-next aria-label="${te('film.next')}">${icon('chevron')}</button>
      </div>
      <button class="btn btn--light" data-share data-track="film_share">${te('film.share')}</button>
      <div class="film-actions">
        <button class="btn btn--ghost" data-save data-track="film_save">${te('film.save')}</button>
        <button class="btn btn--ghost" data-edit>${te('film.edit')}</button>
      </div>
      <p class="film-note">${te('film.note')}</p>
    </section>`;

  const img = root.querySelector('[data-img]');
  const caption = root.querySelector('[data-caption]');
  const status = root.querySelector('[data-status]');
  const toggle = root.querySelector('[data-toggle]');
  const bars = [...root.querySelectorAll('.player__bars b')];
  const player = root.querySelector('[data-player]');
  const shotMs = () => shotSeconds(film) * 1000;

  function paintToggle() {
    toggle.innerHTML = icon(playing ? 'pause' : 'play');
    toggle.setAttribute('aria-label', t(playing ? 'film.pause' : 'film.play'));
  }

  function paintBars() {
    bars.forEach((bar, i) => {
      const done = i < index ? 1 : i === index ? Math.min(1, elapsed / shotMs()) : 0;
      bar.style.transform = `scaleX(${done})`;
    });
  }

  function show(i, announce = true) {
    index = (i + total) % total;
    elapsed = 0;
    const shot = film.shots[index];
    if (urls[index]) img.src = urls[index];
    img.alt = t('film.shot', { n: index + 1, total });
    caption.textContent = shot.caption;
    caption.hidden = !shot.caption;
    if (announce) status.textContent = `${t('film.shot', { n: index + 1, total })}. ${shot.caption}`;
    paintBars();
  }

  function frame(now) {
    if (disposed) return;
    if (playing) {
      elapsed += now - last;
      if (elapsed >= shotMs()) show(index + 1, false);
      paintBars();
    }
    last = now;
    raf = requestAnimationFrame(frame);
  }

  function setPlaying(on) {
    playing = on;
    last = performance.now();
    paintToggle();
  }

  // Tap halves and hold-to-pause on the picture itself.
  let downAt = 0;
  let held = false;
  let wasPlaying = false;
  let holdTimer = null;
  player.addEventListener('pointerdown', () => {
    downAt = performance.now();
    held = false;
    wasPlaying = playing;
    holdTimer = setTimeout(() => { held = true; setPlaying(false); }, 250);
  });
  const release = (event) => {
    clearTimeout(holdTimer);
    if (!downAt) return;
    downAt = 0;
    if (held) { setPlaying(wasPlaying); return; }
    if (event.type !== 'pointerup') return;
    const box = player.getBoundingClientRect();
    show(index + (event.clientX - box.left < box.width / 2 ? -1 : 1));
  };
  player.addEventListener('pointerup', release);
  player.addEventListener('pointercancel', release);
  player.addEventListener('pointerleave', release);

  root.querySelector('[data-prev]').addEventListener('click', () => show(index - 1));
  root.querySelector('[data-next]').addEventListener('click', () => show(index + 1));
  toggle.addEventListener('click', () => setPlaying(!playing));
  root.querySelector('[data-back]').addEventListener('click', () => back('studio'));
  root.querySelector('[data-save]').addEventListener('click', () => toast(t('film.save.off')));
  root.querySelector('[data-share]').addEventListener('click', () => {
    setPlaying(false);
    openShare(film, urls[0] || '', { onPublish: (caption) => publishToAlong(caption) });
  });
  // The film is a slideshow of the traveller's photos, so its story on Along is those photos
  // (in film order, up to the post limit) with the caption. Upload still waits for consent.
  async function publishToAlong(caption) {
    const items = await Promise.all(film.shots.map((shot) => getMedia(shot.mediaId).catch(() => null)));
    const files = [];
    for (const [index, item] of items.entries()) {
      if (!item || files.length >= 9) continue;
      try {
        const blob = item.blob || await (await fetch(urlFor(item))).blob();
        const type = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg';
        files.push(new File([blob], `along-film-${index + 1}.${type.split('/')[1].replace('jpeg', 'jpg')}`, { type }));
      } catch { /* a photo that cannot be read is left out */ }
    }
    if (!files.length) { toast(t('share.along.nophotos')); return; }
    closeSheet();
    openPostComposer({ draft: { title: t(`style.${film.styleId}`), body: caption, files } });
  }

  root.querySelector('[data-edit]').addEventListener('click', () => {
    setPlaying(false);
    openSheet({
      title: te('film.edit'),
      body: `
        <form class="captions" novalidate>
          <p class="t-small">${te('film.caption.rule', { max: CAPTION_LINE_LEN })}</p>
          ${film.shots.map((shot, i) => `
            <label class="field"><span class="t-label">${te('film.caption.label', { n: i + 1 })}</span>
              <textarea class="input input--area" rows="2" data-shot="${i}" ${i === 0 ? 'data-autofocus' : ''} aria-describedby="captions-error">${esc(shot.caption)}</textarea></label>`).join('')}
          <p class="field-error t-small" id="captions-error" role="alert"></p>
          <button class="btn btn--primary" type="submit">${te('film.caption.save')}</button>
        </form>`,
      onMount(panel) {
        const form = panel.querySelector('form');
        const error = panel.querySelector('#captions-error');
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const areas = [...form.querySelectorAll('[data-shot]')];
          const bad = areas.find((area) => captionProblem(area.value.trimEnd()));
          if (bad) {
            const n = Number(bad.dataset.shot) + 1;
            error.textContent = t(`film.caption.error.${captionProblem(bad.value.trimEnd())}`, { n, max: CAPTION_LINE_LEN });
            bad.focus();
            return;
          }
          areas.forEach((area) => setCaption(film.id, Number(area.dataset.shot), area.value.trimEnd()));
          film = getFilm(film.id);
          closeSheet();
          toast(t('film.caption.saved'));
          show(index);
        });
      },
    });
  });

  paintToggle();
  show(0, false);
  Promise.all(film.shots.map((shot) => getMedia(shot.mediaId))).then((items) => {
    if (disposed) return;
    urls = items.map((item) => (item ? urlFor(item) : ''));
    show(index, false);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(holdTimer);
  };
}
