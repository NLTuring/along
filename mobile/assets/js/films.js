// InsTrip mobile — films (spec §6.10, §6.11, §7.6).
// No render service is connected, so a film here is a preview that plays on the
// phone: the chosen photos in order, with captions. There is no MP4 file. The
// record follows POST /api/films so the real render can replace this later.

import { FILM_STYLES } from './seed-places.js';
import { captionsFor } from './seed-text.js';

const KEY = 'instrip.films';
export const MIN_ASSETS = 3;
export const MAX_ASSETS = 12;
export const DURATIONS = [15, 30, 60];
export const CAPTION_LINES = 2;      // spec §7.6: at most 2 lines...
export const CAPTION_LINE_LEN = 32;  // ...of 32 characters each

export const STYLES = FILM_STYLES.map((s) => s.id);

export function style(id) {
  return FILM_STYLES.find((s) => s.id === id) || null;
}

function readAll() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode: lasts for this page only */
  }
}

// -> '' when the caption fits, otherwise 'LINES' or 'LENGTH'.
export function captionProblem(text) {
  const lines = String(text).split('\n');
  if (lines.length > CAPTION_LINES) return 'LINES';
  if (lines.some((line) => line.length > CAPTION_LINE_LEN)) return 'LENGTH';
  return '';
}

// -> { ok: true, film } | { ok: false, error: 'VALIDATION_ERROR' }
// Asking again with the same photos, style and length returns the first film
// (spec §6.10: submitting twice does not make two projects).
export function createFilm({ mediaIds, styleId, duration, email }) {
  const ids = [...mediaIds];
  if (ids.length < MIN_ASSETS || ids.length > MAX_ASSETS || new Set(ids).size !== ids.length
    || !STYLES.includes(styleId) || !DURATIONS.includes(duration)) {
    return { ok: false, error: 'VALIDATION_ERROR' };
  }
  const key = JSON.stringify([email, ids, styleId, duration]);
  const list = readAll();
  const same = list.find((f) => f.key === key);
  if (same) return { ok: true, film: same };
  const lines = captionsFor(styleId);
  const film = {
    id: `fl_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
    key, email, styleId, duration,
    status: 'READY',   // of the on-phone preview; nothing was rendered
    preview: true,
    shots: ids.map((mediaId, i) => ({ mediaId, caption: lines[i % lines.length] })),
    createdAt: Date.now(),
  };
  list.unshift(film);
  writeAll(list);
  return { ok: true, film };
}

export function getFilm(id) {
  return readAll().find((f) => f.id === id) || null;
}

export function listFilms(email) {
  return readAll().filter((f) => f.email === email);
}

export function setCaption(id, index, text) {
  if (captionProblem(text)) return { ok: false, error: 'VALIDATION_ERROR' };
  const list = readAll();
  const film = list.find((f) => f.id === id);
  if (!film || !film.shots[index]) return { ok: false, error: 'NOT_FOUND' };
  film.shots[index].caption = String(text);
  writeAll(list);
  return { ok: true, film };
}

export function removeFilm(id) {
  writeAll(readAll().filter((f) => f.id !== id));
}

// Seconds each photo stays on screen.
export function shotSeconds(film) {
  return film.duration / film.shots.length;
}
