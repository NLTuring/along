// Along — local photographs. Display/upload copies strip metadata and are bounded.
// Newly imported originals are kept locally; they are never automatically uploaded.

import { POIS } from './seed-places.js';

const DB = 'instrip';
const STORE = 'photos';
export const MAX_EDGE = 1920;
const MAX_BYTES = 200 * 1024 * 1024; // spec §7.6: one file at most 200 MB

let dbPromise = null;
const urls = new Map();

async function open() {
  if (!dbPromise) dbPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (db) => {
      if (settled) { db?.close(); return; }
      settled = true;
      resolve(db);
    };
    try {
      if (!window.indexedDB) { finish(null); return; }
      const req = window.indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => { req.result.close(); dbPromise = null; };
        finish(req.result);
      };
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
    } catch { finish(null); }
  });
  const db = await dbPromise;
  if (!db) dbPromise = null;
  return db;
}

function run(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function put(item) {
  const db = await open();
  if (!db) throw new Error('Photo storage is unavailable');
  await run(db, 'readwrite', (s) => s.put(item));
}

// Newest first.
export async function listMedia() {
  const db = await open();
  if (!db) throw new Error('Photo storage is unavailable');
  const items = await run(db, 'readonly', (s) => s.getAll());
  return items.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getMedia(id) {
  // Bundled photographs remain usable by old keepsakes even if their photo row is missing.
  const sample = SAMPLES.find((item) => item.id === id);
  try {
    const db = await open();
    const item = db ? await run(db, 'readonly', (s) => s.get(id)) : null;
    if (item) return item;
  } catch {
    /* known samples can be recovered from the bundled files */
  }
  return sample ? { ...sample, sample: true, addedAt: 0 } : null;
}

export async function removeMedia(id) {
  const records = JSON.parse(localStorage.getItem('instrip.crafts') || '[]');
  if (!Array.isArray(records)) throw new Error('Cannot verify photo references');
  if (records.some((craft) => craft?.mediaId === id || craft?.originalMediaId === id)) {
    throw new Error('This photo is still used by a keepsake');
  }
  const db = await open();
  if (!db) throw new Error('Photo storage is unavailable');
  await run(db, 'readwrite', (s) => s.delete(id));
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
}

// A URL that an <img> can show: the bundled file for samples, a blob URL otherwise.
export function urlFor(item) {
  if (item.src) return item.src;
  if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.blob));
  return urls.get(item.id);
}

async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('encode failed');
  return { blob, w, h };
}

// -> { added: [ids], failed: n }. Files that are not images, are too large or
// cannot be decoded are counted as failed and skipped.
export async function addFiles(fileList) {
  const added = [];
  let failed = 0;
  let n = 0;
  for (const file of [...fileList]) {
    n += 1;
    if (!file.type.startsWith('image/') || file.size > MAX_BYTES) { failed += 1; continue; }
    try {
      const { blob, w, h } = await shrink(file);
      const id = `ph_${Date.now().toString(36)}_${n}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
      await put({ id, blob, w, h, originalBlob: file instanceof Blob ? file : null,
        originalStoredLocally: file instanceof Blob, addedAt: Date.now() + n });
      added.push(id);
    } catch {
      failed += 1;
    }
  }
  return { added, failed };
}

// A photo taken by the app's own camera. The native side keeps the file and
// serves it under /photos/; the library only records where it is.
export async function addNative({ id, src }) {
  const item = { id: `native_${id}`, src, native: true, addedAt: Date.now() };
  await put(item);
  return item.id;
}

// Bundled photos let travellers try films and keepsakes before adding their own.
// Stable sample ids also keep earlier saved designs readable.
export const SAMPLES = [
  { id: 'sample_xuanwu', src: 'img/xuanwu.jpg', alt: 'Xuanwu Lake', credit: 'A Chinese user / CC BY-SA 4.0' },
  { id: 'sample_along_shanghai_friends', src: 'img/along-samples/along-shanghai-friends.png', altKey: 'craft.sample.shanghai', alt: 'Friends by the Shanghai skyline', userProvided: true },
  { id: 'sample_along_temple_friends', src: 'img/along-samples/along-temple-friends.png', altKey: 'craft.sample.temple', alt: 'Friends at the Temple of Heaven', userProvided: true },
  { id: 'sample_along_forbidden_city', src: 'img/along-samples/along-forbidden-city.png', altKey: 'craft.sample.palace', alt: 'Friends at the Forbidden City', userProvided: true },
  { id: 'sample_along_lanterns', src: 'img/along-samples/along-lanterns.png', altKey: 'craft.sample.lanterns', alt: 'A traveller beneath red lanterns', userProvided: true },
  ...Object.values(POIS).filter((p) => p.photo).map((p) => ({
    id: `sample_${p.id}`, src: p.photo, alt: p.nameEn, credit: p.photoCredit,
  })),
];

export async function addSamples() {
  const now = Date.now();
  let i = 0;
  for (const sample of SAMPLES) {
    i += 1;
    await put({ ...sample, sample: true, addedAt: now - i });
  }
  return SAMPLES.map((s) => s.id);
}
