// Along — the turning window. The scene on show is cut into rows; each row slides away to the
// left at its own moment, uncovering the next scene underneath, as on the "building your plan" page.
// Pauses while the page is hidden and never runs when motion is reduced.
// Tapping the window asks for directions to the place in the scene on show.
import { t, te } from './i18n.js';
import { icon } from './icons.js';
import { prefersReducedMotion } from './ui.js';
import { WINDOW_SCENES, SCENE_MS, SLAT_COUNT, SLAT_MS, slatDelays, nextScene } from './window-scenes.js';

export function windowShowHtml({ tagClass = 'tag glass glass--1' } = {}) {
  const first = WINDOW_SCENES[0];
  return `<div class="window window--porthole window-show" data-window-show>
      <img class="window-show__under" src="${first.src}" alt="${t(first.altKey)}" width="900" height="1200" data-window-under />
      <div class="window-show__slats" aria-hidden="true" data-window-slats></div>
    </div>
    <figcaption class="${tagClass}">${icon('pin', { size: 14 })}<span data-window-tag>${te(first.tagKey)}</span></figcaption>
    <button class="window-show__go" type="button" data-window-go aria-label="${te('window.go', { place: t(first.tagKey) })}"></button>`;
}

export function mountWindowShow(root, { onScene = () => {}, onOpen = () => {} } = {}) {
  const host = root.querySelector('[data-window-show]');
  if (!host) return () => {};
  const under = host.querySelector('[data-window-under]'), slats = host.querySelector('[data-window-slats]');
  const tag = root.querySelector('[data-window-tag]'), opener = root.querySelector('[data-window-go]');
  let index = 0, timer = 0, turning = false, disposed = false;
  onScene(WINDOW_SCENES[0]);
  // Load every scene once so a turn never shows a half-loaded photo.
  const ready = WINDOW_SCENES.map((scene) => { const image = new Image(); image.decoding = 'async'; image.src = scene.src; return image.decode?.().catch(() => {}) ?? Promise.resolve(); });

  function show(scene) {
    under.src = scene.src; under.alt = t(scene.altKey);
    if (tag) tag.textContent = t(scene.tagKey);
    opener?.setAttribute('aria-label', t('window.go', { place: t(scene.tagKey) }));
    onScene(scene);
  }
  async function turn() {
    if (!host.isConnected) { dispose(); return; }
    if (disposed || turning || document.hidden) return schedule();
    const from = WINDOW_SCENES[index], toIndex = nextScene(index), to = WINDOW_SCENES[toIndex];
    await ready[toIndex];
    if (disposed) return;
    turning = true;
    // The rows carry the old scene; underneath, the new one is already in place.
    const delays = slatDelays(SLAT_COUNT);
    slats.replaceChildren(...delays.map((delay, row) => {
      const slat = document.createElement('span');
      slat.className = 'window-show__slat';
      slat.style.setProperty('--row', row);
      slat.style.setProperty('--rows', SLAT_COUNT);
      slat.style.backgroundImage = `url("${from.src}")`;
      slat.style.animationDelay = `${delay}ms`;
      slat.style.animationDuration = `${SLAT_MS}ms`;
      return slat;
    }));
    show(to);
    index = toIndex;
    setTimeout(() => { if (!disposed) { slats.replaceChildren(); turning = false; schedule(); } }, Math.max(...delays) + SLAT_MS + 60);
  }
  // The page that owns the window may be redrawn without telling us: stop once the window is gone.
  function schedule() {
    clearTimeout(timer);
    if (!host.isConnected) dispose();
    if (!disposed) timer = setTimeout(turn, SCENE_MS);
  }
  // Mid-turn the new scene is already underneath and named on the tag, so it is the one meant.
  function open() { if (!disposed) onOpen(WINDOW_SCENES[index]); }
  function dispose() {
    disposed = true; clearTimeout(timer);
    document.removeEventListener('visibilitychange', visibility);
    opener?.removeEventListener('click', open);
  }
  // Reduced motion: the first scene stays, still.
  if (!prefersReducedMotion()) schedule();
  function visibility() { if (!document.hidden && !turning && !prefersReducedMotion()) schedule(); }
  document.addEventListener('visibilitychange', visibility);
  opener?.addEventListener('click', open);
  return dispose;
}
