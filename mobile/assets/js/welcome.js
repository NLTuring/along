// InsTrip mobile — first open: a window with its shade down.
// Pull the shade up (or tap, press a key, or wait four seconds) and the app is
// behind it. Shown once; skipped entirely when motion is reduced.

import { te } from './i18n.js';
import { prefersReducedMotion } from './ui.js';

const SEEN_KEY = 'instrip.welcomed';
const AUTO_OPEN_MS = 4000;

function seen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* shows again next launch */ }
}

export function maybeWelcome() {
  if (seen()) return;
  markSeen();
  if (prefersReducedMotion()) return;

  const behind = [document.getElementById('app'), document.getElementById('nav'), document.getElementById('assistant')].filter(Boolean);
  const el = document.createElement('div');
  el.className = 'welcome';
  el.innerHTML = `
    <div class="welcome__window window window--porthole">
      <img src="img/xuanwu.jpg" alt="" />
      <div class="welcome__shade"><span class="welcome__handle"></span></div>
    </div>
    <p class="t-display welcome__title">${te('hero.title')}</p>
    <button class="welcome__open" aria-label="${te('welcome.open')}">${te('welcome.pull')}</button>`;

  const shade = el.querySelector('.welcome__shade');
  const frame = el.querySelector('.welcome__window');
  let done = false;
  let startY = null;
  let moved = 0;

  function open() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey, true);
    shade.style.transform = '';
    el.classList.add('is-open');
    behind.forEach((node) => { node.inert = false; });
    setTimeout(() => {
      el.remove();
      document.getElementById('app').focus({ preventScroll: true });
    }, 700);
  }

  function onKey(event) {
    if (event.key === 'Tab') return;
    event.preventDefault();
    open();
  }

  el.addEventListener('pointerdown', (event) => {
    startY = event.clientY;
    moved = 0;
    shade.classList.add('is-dragging');
  });
  el.addEventListener('pointermove', (event) => {
    if (startY == null) return;
    moved = Math.min(0, event.clientY - startY);
    shade.style.transform = `translateY(${moved}px)`;
  });
  const release = () => {
    if (startY == null) return;
    startY = null;
    shade.classList.remove('is-dragging');
    // A tap opens it; so does pulling it a third of the way up.
    if (moved > -8 || -moved > frame.getBoundingClientRect().height / 3) open();
    else shade.style.transform = '';
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.querySelector('.welcome__open').addEventListener('click', open);
  document.addEventListener('keydown', onKey, true);

  behind.forEach((node) => { node.inert = true; });
  document.getElementById('overlay').append(el);
  el.querySelector('.welcome__open').focus({ preventScroll: true });
  const timer = setTimeout(open, AUTO_OPEN_MS);
}
