// 小游's look: which figure the assistant is (小游 or the user's own .glb) and what it wears.
// The choice, outfit and a snapshot PNG for the floating button live in localStorage; the
// uploaded model's bytes live in IndexedDB (too big for localStorage). All on this phone.
// The pure helpers (normalizeOutfit, randomOutfit, checkGlb) are tested in tools/avatar.test.mjs.

export const KINDS = ['xiaoyou', 'custom'];
// A small warm palette that sits on the paper colours: no neon, nothing fluorescent.
export const PALETTE = [['terracotta', '#B24A2C'], ['straw', '#D9A441'], ['sage', '#6F7F63'], ['sea', '#4F6D7A'],
  ['rose', '#C97B74'], ['cream', '#F2E6CF'], ['cocoa', '#7A4E33'], ['ink', '#2B2620']];
export const BODY_TINTS = [['original', ''], ['peach', '#F4D9C6'], ['leaf', '#DDE4D2'], ['mist', '#D9E2E4'], ['oat', '#EBDDBF']];
export const colorHex = (name) => PALETTE.find(([n]) => n === name)?.[1] || '';
// slot → item → default colour ('' = the model's own colours, or nothing to colour).
export const SLOTS = {
  hat: { original: '', beret: 'terracotta', bucket: 'straw', beanie: 'sea', crown: 'straw', flower: 'rose', none: '' },
  neck: { original: '', scarf: 'terracotta', stripes: 'sage', bow: 'ink', none: '' },
  back: { original: '', backpack: 'sage', camera: 'ink', balloon: 'rose', none: '' },
  face: { none: '', round: 'cocoa', shades: 'ink', blush: 'rose' },
};
export const SLOT_NAMES = Object.keys(SLOTS);
export const SIZE_MIN = 0.4;
export const SIZE_MAX = 2.5;
// The user's own model has no original clothes, so "original" means nothing there.
const itemsFor = (slot, kind) => Object.keys(SLOTS[slot]).filter((id) => kind === 'xiaoyou' || id !== 'original');
const firstFor = (slot, kind) => (kind === 'xiaoyou' ? Object.keys(SLOTS[slot])[0] : 'none');
export const slotItems = itemsFor;

export function defaultOutfit(kind = 'xiaoyou') {
  const out = { body: 'original' };
  for (const slot of SLOT_NAMES) { const item = firstFor(slot, kind); out[slot] = { item, color: SLOTS[slot][item] }; }
  return out;
}

/** Any stored or hand-made outfit made safe: known items and colours only, one per slot. */
export function normalizeOutfit(raw, kind = 'xiaoyou') {
  kind = KINDS.includes(kind) ? kind : 'xiaoyou';
  const base = defaultOutfit(kind), src = raw && typeof raw === 'object' ? raw : {};
  const out = { body: kind === 'xiaoyou' && BODY_TINTS.some(([n]) => n === src.body) ? src.body : 'original' };
  for (const slot of SLOT_NAMES) {
    const given = src[slot] && typeof src[slot] === 'object' ? src[slot] : {};
    let item = itemsFor(slot, kind).includes(given.item) ? given.item : base[slot].item;
    if (kind === 'custom' && given.item === 'original') item = 'none';
    const fallback = SLOTS[slot][item];
    // Items with nothing to colour keep ''; the originals may be tinted or left as made.
    const allowed = item === 'none' ? [] : PALETTE.map(([n]) => n);
    const color = allowed.includes(given.color) ? given.color : item === 'original' && given.color === '' ? '' : fallback;
    out[slot] = { item, color };
  }
  return out;
}
export const sameOutfit = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const isDefaultOutfit = (outfit, kind = 'xiaoyou') => sameOutfit(normalizeOutfit(outfit, kind), defaultOutfit(kind));

export function randomOutfit(kind = 'xiaoyou', rand = Math.random) {
  const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
  const out = { body: kind === 'xiaoyou' ? pick(BODY_TINTS)[0] : 'original' };
  for (const slot of SLOT_NAMES) {
    const item = pick(itemsFor(slot, kind));
    out[slot] = { item, color: item === 'none' ? '' : item === 'original' ? '' : pick(PALETTE)[0] };
  }
  return normalizeOutfit(out, kind);
}
export const clampSize = (n) => (Number.isFinite(+n) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(+n * 100) / 100)) : 1);

// ───── uploads ─────
export const MAX_GLB = 32 * 1024 * 1024;
const GLTF = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
/**
 * Check a .glb before it is stored: glTF 2.0 binary, the length header true, at most 32 MB, and
 * self-contained (no buffer or image pointing at another file or the network, which a phone
 * could not resolve and which would leak a request). Returns { ok: true } or { ok: false, code }.
 */
export function checkGlb(bytes, name = 'model.glb') {
  if (!/\.glb$/i.test(String(name))) return { ok: false, code: 'type' };
  const buf = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (!(buf instanceof Uint8Array) || buf.byteLength < 20) return { ok: false, code: 'format' };
  if (buf.byteLength > MAX_GLB) return { ok: false, code: 'size' };
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(0, true) !== GLTF) return { ok: false, code: 'format' };
  if (view.getUint32(4, true) !== 2) return { ok: false, code: 'version' };
  if (view.getUint32(8, true) !== buf.byteLength) return { ok: false, code: 'format' };
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > buf.byteLength) return { ok: false, code: 'format' };
  let json;
  try { json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLength))); } catch { return { ok: false, code: 'format' }; }
  if (!json || typeof json !== 'object' || !String(json.asset?.version || '').startsWith('2')) return { ok: false, code: 'version' };
  const next = 20 + jsonLength;
  const hasBin = next + 8 <= buf.byteLength && view.getUint32(next + 4, true) === BIN_CHUNK;
  const external = (uri) => typeof uri === 'string' && !uri.startsWith('data:');
  for (const [i, b] of (json.buffers || []).entries()) {
    if (external(b?.uri)) return { ok: false, code: 'external' };
    if (b?.uri === undefined && !(i === 0 && hasBin)) return { ok: false, code: 'format' };
  }
  if ((json.images || []).some((img) => external(img?.uri))) return { ok: false, code: 'external' };
  if (!(json.meshes || []).length) return { ok: false, code: 'empty' };
  return { ok: true };
}

// ───── stored choice ─────
const KEY = 'along.avatar.v1';
const SNAP = 'along.avatar.snapshot.v1';
const listeners = new Set();
export function getAvatar() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* a broken entry is the default */ }
  const kind = KINDS.includes(raw.kind) ? raw.kind : 'xiaoyou';
  return { kind, outfit: normalizeOutfit(raw.outfits?.[kind] ?? raw.outfit, kind), outfits: raw.outfits || {}, size: clampSize(raw.size ?? 1), name: String(raw.name || '').slice(0, 80) };
}
/** Save the choice and, if given, the snapshot. The snapshot may not fit; the look is kept anyway. */
export function saveAvatar({ kind, outfit, size, name }, snapshot) {
  const now = getAvatar();
  kind = KINDS.includes(kind) ? kind : now.kind;
  const outfits = { ...now.outfits, [kind]: normalizeOutfit(outfit ?? now.outfit, kind) };
  const value = { kind, outfits, size: clampSize(size ?? now.size), name: name ?? now.name };
  localStorage.setItem(KEY, JSON.stringify(value));
  if (snapshot !== undefined) {
    try { if (snapshot) localStorage.setItem(SNAP, snapshot); else localStorage.removeItem(SNAP); } catch { localStorage.removeItem(SNAP); }
  }
  for (const fn of listeners) fn(getAvatar());
}
export const getSnapshot = () => { try { return localStorage.getItem(SNAP) || ''; } catch { return ''; } };
export const onAvatarChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
/** The floating button keeps the drawn 小游 unless the look was actually changed. */
export function showsSnapshot(avatar = getAvatar()) { return !!getSnapshot() && (avatar.kind === 'custom' || !isDefaultOutfit(avatar.outfit, 'xiaoyou')); }

// ───── the user's own model (IndexedDB, one record) ─────
const DB = 'along-avatar', STORE = 'models', VERSION = 1, MODEL_ID = 'mine';
function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('STORAGE')); return; }
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('STORAGE'));
    request.onblocked = () => reject(new Error('STORAGE'));
  });
}
async function run(mode, work) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode), request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('STORAGE'));
    });
  } finally { db.close(); }
}
/** Check and keep a picked File. Resolves { ok, code?, name }. */
export async function storeModel(file) {
  if (!file) return { ok: false, code: 'type' };
  if (!/\.glb$/i.test(file.name || '')) return { ok: false, code: 'type' };
  if (file.size > MAX_GLB) return { ok: false, code: 'size' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkGlb(bytes, file.name);
  if (!check.ok) return check;
  await run('readwrite', (s) => s.put({ id: MODEL_ID, name: file.name.slice(0, 80), bytes: bytes.buffer, savedAt: Date.now() }));
  return { ok: true, name: file.name.slice(0, 80) };
}
export async function loadModel() { const r = await run('readonly', (s) => s.get(MODEL_ID)); return r?.bytes ? r : null; }
export async function removeModel() {
  await run('readwrite', (s) => s.delete(MODEL_ID));
  const now = getAvatar();
  if (now.kind === 'custom') saveAvatar({ kind: 'xiaoyou', outfit: now.outfits.xiaoyou }, '');
}
