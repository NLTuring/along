// InsTrip mobile — bottom navigation ("the windowsill").
// A floating glass pill: Trip, Friends, the capture lens, Stories, You.
// The current tab is marked by a small bar of light that slides between items.

import { t, te } from './i18n.js';
import { icon } from './icons.js';
import { openSheet, closeSheet, toast, getSettings } from './ui.js';
import { addFiles, addNative } from './media.js';
import { openPostComposer } from './post-sheet.js';

export const TABS = ['trip', 'friends', 'stories', 'you'];
const LONG_PRESS_MS = 400;

let host = null;
let current = 'trip';

// The bar's size changes with language, font loading, senior mode and the compact
// state; keep the light under the current tab through all of them.
const navObserver = 'ResizeObserver' in window ? new ResizeObserver(() => placeLight(false)) : null;

function item(route, label = `nav.${route}`, iconName = route) {
  const on = route === current;
  return `<button class="nav__item${on ? ' is-current' : ''}" data-route="${route}" ${on ? 'aria-current="page"' : ''} data-track="nav_${route}">
    ${icon(iconName)}<span>${te(label)}</span>
  </button>`;
}

export function renderNav(route = current) {
  current = route;
  host = host || document.getElementById('nav');
  // Senior mode: three plain tabs, no lens (taking a photo is a labelled button on Today).
  if (getSettings().senior) {
    host.innerHTML = `
      <nav class="nav nav--senior glass glass--2" aria-label="${te('nav.label')}">
        ${item('trip', 'nav.today')}${item('friends')}${item('support', 'nav.help', 'help')}
        <span class="nav__light" aria-hidden="true"></span>
      </nav>`;
    placeLight(false);
    return;
  }
  host.innerHTML = `
    <nav class="nav glass glass--2" aria-label="${te('nav.label')}">
      ${item('trip')}${item('friends')}
      <button class="nav__lens" data-lens aria-label="${te('nav.capture')}" data-track="nav_capture">
        <span class="nav__lens-glass" aria-hidden="true"></span>
      </button>
      ${item('stories')}${item('you')}
      <span class="nav__light" aria-hidden="true"></span>
    </nav>`;
  placeLight(false);
  if (navObserver) {
    navObserver.disconnect();
    navObserver.observe(host.querySelector('.nav'));
    host.querySelectorAll('.nav__item').forEach((el) => navObserver.observe(el));
  }
}

// Slide the bar of light under the current tab.
function placeLight(animate = true) {
  const nav = host?.querySelector('.nav');
  const light = nav?.querySelector('.nav__light');
  const target = nav?.querySelector('.nav__item.is-current');
  if (!nav || !light) return;
  light.hidden = !target; // no tab is lit on pages that are not in the bar
  if (!target) return;
  const a = nav.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  light.classList.toggle('is-instant', !animate);
  light.style.transform = `translateX(${Math.round(b.left - a.left + b.width / 2 - 8)}px)`;
}

// `tab` is the tab a page belongs to; `name` is the page itself. A bar item that
// matches the page wins (Help in senior mode), otherwise the page's tab is lit.
export function setCurrentTab(tab, name = tab) {
  if (!host) return;
  const has = (r) => !!host.querySelector(`.nav__item[data-route="${r}"]`);
  const route = has(name) ? name : tab;
  current = route;
  host.querySelectorAll('.nav__item').forEach((el) => {
    const on = el.dataset.route === route;
    el.classList.toggle('is-current', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  placeLight(true);
}

// In the app, the native camera takes the photo and calls window.onNativePhoto
// with it (see initNativePhotos below). In a browser, a file input with `capture`
// asks the phone's camera instead; on a desktop it opens the file picker.
export function openCamera() {
  if (window.Android?.openCamera) {
    window.Android.openCamera(JSON.stringify({ city: 'Shanghai' }));
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.addEventListener('change', async () => {
    if (!input.files?.length) return;
    const { added } = await addFiles(input.files);
    toast(t(added.length ? 'capture.saved' : 'capture.failed'));
    if (added.length) document.dispatchEvent(new CustomEvent('instrip:media'));
  });
  input.click();
}

const NATIVE_PHOTO_ORIGIN = 'https://appassets.androidplatform.net/photos/';

// The app's camera hands a photo back as { id, url } (or that as a JSON string,
// possibly wrapped in { photo }). Only URLs under the app's own photo folder are
// accepted, as in the old app. UNTESTED on a device: built from reading the old
// app's handler, not from running the native side.
export function initNativePhotos() {
  window.onNativePhoto = async (input) => {
    try {
      const data = typeof input === 'string' ? JSON.parse(input) : input;
      const photo = data?.photo || data;
      const id = typeof photo?.id === 'string' ? photo.id : '';
      const url = String(photo?.url || '');
      if (!id || id.length > 150 || !url.startsWith(NATIVE_PHOTO_ORIGIN)) throw new Error('unrecognised photo');
      await addNative({ id, src: url });
      toast(t('capture.saved'));
      document.dispatchEvent(new CustomEvent('instrip:media'));
    } catch {
      toast(t('capture.failed'));
    }
  };

  // The shell can also hand over the photos it already holds, as { photos: [...] }.
  // They are added quietly; anything not under the app's photo folder is skipped.
  window.onNativePhotos = async (input) => {
    try {
      const data = typeof input === 'string' ? JSON.parse(input) : input;
      let added = 0;
      for (const photo of Array.isArray(data?.photos) ? data.photos.slice(0, 500) : []) {
        const id = typeof photo?.id === 'string' ? photo.id : '';
        const url = String(photo?.url || '');
        if (!id || id.length > 150 || !url.startsWith(NATIVE_PHOTO_ORIGIN)) continue;
        await addNative({ id, src: url });
        added += 1;
      }
      if (added) document.dispatchEvent(new CustomEvent('instrip:media'));
    } catch {
      /* not a photo list: ignore */
    }
  };
}

function captureSheet() {
  const row = (key, name) => `
    <button class="row" data-capture="${key}" data-track="capture_${key}">
      <span class="row__icon">${icon(name)}</span>
      <span class="row__text"><strong>${te(`capture.${key}`)}</strong><small>${te(`capture.${key}.sub`)}</small></span>
      ${icon('chevron', { size: 20 })}
    </button>`;
  openSheet({
    title: te('capture.title'),
    body: `<div class="rows">${row('photo', 'camera')}${row('film', 'film')}${row('craft', 'craft')}${row('story', 'pen')}</div>`,
    onMount(panel) {
      panel.addEventListener('click', (event) => {
        const key = event.target.closest('[data-capture]')?.dataset.capture;
        if (!key) return;
        closeSheet();
        if (key === 'photo') openCamera();
        else if (key === 'film') location.hash = '#/studio';
        else if (key === 'craft') location.hash = '#/craft/new';
        else if (key === 'story') openPostComposer();
      });
    },
  });
}

// Tap the lens for the capture sheet; hold it for 0.4s to go straight to the camera.
export function initNav(onNavigate) {
  host = document.getElementById('nav');
  let pressTimer = null;
  let longPressed = false;

  host.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('[data-lens]')) return;
    longPressed = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressed = true;
      openCamera();
    }, LONG_PRESS_MS);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
    host.addEventListener(type, () => clearTimeout(pressTimer), true);
  }
  host.addEventListener('contextmenu', (event) => {
    if (event.target.closest('[data-lens]')) event.preventDefault();
  });

  host.addEventListener('click', (event) => {
    if (event.target.closest('[data-lens]')) {
      if (longPressed) longPressed = false;
      else captureSheet();
      return;
    }
    const route = event.target.closest('[data-route]')?.dataset.route;
    if (route) onNavigate(route);
  });

  window.addEventListener('resize', () => placeLight(false));
}
