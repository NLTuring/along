// InsTrip mobile — shared UI: display settings, bottom sheet, toast.

import { te } from './i18n.js';
import { icon } from './icons.js';

/* ---------- display settings ---------- */

const SETTINGS_KEY = 'instrip.settings';
const defaults = { motion: 'auto', glass: 'auto', senior: false, assistant: false };
let settings = { ...defaults };
const settingListeners = new Set();

// Phones that report under 4 GB of memory get one blurred panel instead of three.
// (navigator.deviceMemory exists in Chrome and Android WebView; elsewhere this is false.)
function lowEnd() {
  return typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 4;
}

export function onSettingsChange(fn) {
  settingListeners.add(fn);
  return () => settingListeners.delete(fn);
}

function applySettings() {
  const root = document.documentElement;
  if (settings.motion === 'reduced') root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
  if (settings.glass === 'solid' || settings.senior) root.dataset.glass = 'solid';
  else if (lowEnd()) root.dataset.glass = 'lite'; // blur stays on the navigation only
  else delete root.dataset.glass;
  root.classList.toggle('senior', !!settings.senior);
}

export function initSettings() {
  try {
    settings = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    settings = { ...defaults };
  }
  applySettings();
}

export function getSettings() {
  return { ...settings };
}

export function setSetting(key, value) {
  if (!(key in defaults)) return;
  settings[key] = value;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode: lasts for this session only */
  }
  applySettings();
  settingListeners.forEach((fn) => fn(key, value));
}

export function prefersReducedMotion() {
  return settings.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- skyline ---------- */

// The strip at the top of a tab page. It sits inside the sky, so its text takes
// the sky's ink colour (white at night). app.js fills in the destination's time.
export function skyline() {
  return '<header class="skyline"><p class="skyline__now t-num" data-sky-now></p></header>';
}

/* ---------- toast ---------- */

let toastTimer = null;

// Shown for 2.6s (spec §5.4); the #toast region is aria-live.
export function toast(message) {
  const host = document.getElementById('toast');
  host.textContent = '';
  const pill = document.createElement('div');
  pill.className = 'toast glass glass--3';
  pill.textContent = message;
  host.append(pill);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => pill.remove(), 2600);
}

/* ---------- bottom sheet ---------- */

let active = null;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Opens a thick-glass sheet. `body` is trusted template HTML built with te()/esc().
// Focus is trapped inside while open; Escape, the close button, the backdrop and a
// downward drag all close it, and focus returns to whatever opened it.
export function openSheet({ title, body, onMount }) {
  closeSheet();
  const overlay = document.getElementById('overlay');
  const opener = document.activeElement;

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';

  const panel = document.createElement('section');
  panel.className = 'sheet glass glass--3';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'sheet-title');
  panel.innerHTML = `
    <div class="sheet__grip" aria-hidden="true"></div>
    <header class="sheet__head">
      <h2 id="sheet-title" class="t-heading">${title}</h2>
      <button class="icon-btn" data-sheet-close aria-label="${te('common.close')}">${icon('close')}</button>
    </header>
    <div class="sheet__body">${body}</div>`;

  overlay.append(backdrop, panel);
  document.body.classList.add('has-sheet');

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    // Only what is actually on screen: a sheet may hold a hidden second step.
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Drag the sheet down by its grip or header to dismiss.
  let startY = null;
  const head = panel.querySelector('.sheet__head');
  const grip = panel.querySelector('.sheet__grip');
  const onDown = (event) => {
    if (event.target.closest('button')) return;
    startY = event.clientY;
    panel.classList.add('is-dragging');
  };
  const onMove = (event) => {
    if (startY == null) return;
    panel.style.transform = `translateY(${Math.max(0, event.clientY - startY)}px)`;
  };
  const onUp = (event) => {
    if (startY == null) return;
    const moved = event.clientY - startY;
    startY = null;
    panel.classList.remove('is-dragging');
    panel.style.transform = '';
    if (moved > 90) closeSheet();
  };
  for (const el of [head, grip]) el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  backdrop.addEventListener('click', closeSheet);
  panel.addEventListener('click', (event) => {
    if (event.target.closest('[data-sheet-close]')) closeSheet();
  });
  document.addEventListener('keydown', onKey);

  active = {
    panel,
    backdrop,
    opener,
    dispose() {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };

  onMount?.(panel);
  (panel.querySelector('[data-autofocus]') || panel.querySelector('[data-sheet-close]')).focus();
  return closeSheet;
}

export function closeSheet() {
  if (!active) return;
  const { panel, backdrop, opener, dispose } = active;
  active = null;
  dispose();
  document.body.classList.remove('has-sheet');
  const remove = () => {
    panel.remove();
    backdrop.remove();
  };
  if (prefersReducedMotion()) {
    remove();
  } else {
    panel.classList.add('is-leaving');
    backdrop.classList.add('is-leaving');
    setTimeout(remove, 240);
  }
  // Return focus to whatever opened the sheet. If that element is gone (the page
  // behind was redrawn, e.g. after signing in), fall back to the page itself so
  // keyboard and screen-reader users are not dropped at the top of the document.
  if (opener && opener.isConnected) opener.focus();
  else document.getElementById('app')?.focus({ preventScroll: true });
}

export function sheetIsOpen() {
  return !!active;
}
