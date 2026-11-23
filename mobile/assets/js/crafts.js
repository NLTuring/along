// Along — durable craft records, private variant cache, and version-guarded AI jobs.
// Legacy DESIGNED is photo artwork, never proof of a generated or printable mesh.
import { physicalOptions, GEOMETRY_VERSION, validMask, PHOTO_FITS } from './craft-geometry.js';

// Capability flags are independent: recognition can work while image editing cannot.
export function craftAICapabilities(config = {}, session = {}) {
  const ai = config.ai || {}, online = !session?.localOnly;
  return {
    detect: online && (typeof ai.detectAvailable === 'boolean' ? ai.detectAvailable : ai.available === true),
    edit: online && (typeof ai.editAvailable === 'boolean' ? ai.editAvailable : ai.available === true),
    provider: typeof ai.provider === 'string' && ai.provider ? ai.provider : '',
  };
}

export function reviewDetection(value, width, height) {
  if (!value || value.width !== width || value.height !== height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height;
  const box = value.bbox;
  const bbox = Array.isArray(box) && box.length === 4 && point(box.slice(0, 2)) && point(box.slice(2)) && box[0] < box[2] && box[1] < box[3] ? [...box] : null;
  let polygon = Array.isArray(value.polygon) && value.polygon.length >= 3 && value.polygon.length <= 512 && value.polygon.every(point) ? value.polygon.map((p) => [...p]) : null;
  if (polygon) {
    const area = Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    if (area < 1 || value.method !== 'MODEL_POLYGON') polygon = null;
  }
  return { width, height, bbox, polygon, confidence: Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 ? value.confidence : null, method: value.method, requiresReview: true };
}

// Pending suggestions never mutate the current variant. Only explicit confirmation
// produces a cacheable record; reload resumes the job reference, not a confirmed mask.
export function createCraftReview({ currentVersion }) {
  let pending = null;
  const current = () => { if (pending && pending.inputVersion !== currentVersion()) pending = null; return pending; };
  return {
    get pending() { return current(); },
    stage(job, { record, image, mask, width, height }) {
      if (job.inputVersion !== currentVersion()) return null;
      const detection = reviewDetection(job.detection, width, height);
      const usable = !!detection?.polygon && validMask(mask) && mask.data.some((v) => v > 0);
      pending = { jobId: job.id, inputVersion: job.inputVersion, variant: job.variant, record, image, detection, mask: usable ? { ...mask, data: mask.data.slice() } : null, needsManual: !usable };
      return pending;
    },
    confirm(mask, manual = false) {
      const review = current();
      if (!review) throw new Error('REVIEW_STALE');
      if ((review.needsManual && !manual) || !validMask(mask) || !mask.data.some((v) => v > 0)) throw new Error('REVIEW_REFINEMENT_REQUIRED');
      return { variant: review.variant, maskRevision: `${manual ? 'manual' : 'review'}-${review.jobId}-${Date.now()}`, record: { ...review.record, mask: { ...mask, data: mask.data.slice() }, maskSource: manual ? 'MANUAL' : 'AI', jobId: review.jobId, requiresReview: false } };
    },
    discard() { pending = null; },
  };
}


const KEY = 'instrip.crafts';

export const PRODUCTS = [
  { id: 'MAGNET', priceCents: 2900 },
  { id: 'KEYCHAIN', priceCents: 2400 },
];
export const SHIPPING_CENTS = 600;
export const SHAPES = ['arch', 'oval', 'scallop', 'rounded'];
export const DESIGN_SIZE = 1200; // px, square canvas for the digital version
export const MODEL_TYPES = ['MAGNET', 'KEYCHAIN'];
export const MODEL_CONFIG = {
  MAGNET: { thickness: 18, edge: '#B24A2C', label: 'product.MAGNET' },
  KEYCHAIN: { thickness: 14, edge: '#9B7B54', label: 'product.KEYCHAIN' },
};

const DEFAULT_MODEL = 'MAGNET';

// Turning is free all the way round; tilting stops short of edge-on, where the photo disappears.
export const MAX_TILT = 60;
export function normalizePose(rotation = 0, tilt = 0) {
  return {
    rotation: Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0,
    tilt: Number.isFinite(tilt) ? Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt)) : 0,
  };
}

function normalizeCraft(craft) {
  if (!craft || typeof craft.id !== 'string' || !craft.id
    || typeof craft.email !== 'string' || !craft.email
    || typeof craft.mediaId !== 'string' || !craft.mediaId) return null;
  const product = MODEL_TYPES.includes(craft.product) ? craft.product : DEFAULT_MODEL;
  return {
    ...craft,
    schemaVersion: 2,
    variant: craft.variant === 'ANIME' ? 'ANIME' : 'REAL',
    inputVersion: typeof craft.inputVersion === 'string' && craft.inputVersion ? craft.inputVersion : `${craft.id}:0`,
    revision: Number.isInteger(craft.revision) && craft.revision >= 0 ? craft.revision : 0,
    geometryVersion: craft.geometryVersion === GEOMETRY_VERSION ? GEOMETRY_VERSION : 0,
    modelStatus: craft.geometryVersion === GEOMETRY_VERSION && craft.modelStatus === 'GENERATED' ? 'GENERATED' : 'NOT_GENERATED',
    maskSource: ['AI', 'MANUAL', 'NONE'].includes(craft.maskSource) ? craft.maskSource : 'NONE',
    // Optional raised figure. Off means a flat base and no painting; older crafts keep their relief.
    raised: typeof craft.raised === 'boolean' ? craft.raised : ['AI', 'MANUAL'].includes(craft.maskSource),
    // FILL: the photo covers the whole face. Keepsakes made before this choice existed keep the whole photo.
    photoFit: PHOTO_FITS.includes(craft.photoFit) ? craft.photoFit : 'WHOLE',
    sizedFor: typeof craft.sizedFor === 'string' ? craft.sizedFor.slice(0, 200) : '',
    ...physicalOptions({ ...craft, product }),
    product,
    modelType: product,
    shape: SHAPES.includes(craft.shape) ? craft.shape : SHAPES[0],
    ...normalizePose(craft.rotation, craft.tilt),
    previewStatus: ['READY', 'PREVIEWED', 'DESIGNED'].includes(craft.previewStatus)
      ? craft.previewStatus : craft.status === 'DESIGNED' ? 'DESIGNED' : 'READY',
    demoEdition: typeof craft.demoEdition === 'string' && craft.demoEdition
      ? craft.demoEdition : `AL-${craft.id.slice(-6).toUpperCase()}`,
    createdAt: Number.isFinite(craft.createdAt) ? craft.createdAt : 0,
  };
}

function readAll() {
  const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
  return Array.isArray(raw) ? raw.map(normalizeCraft).filter(Boolean) : [];
}

function writeAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

// Failed writes never return a craft that only exists in memory.
export function createCraft({ mediaId, email }) {
  if (typeof mediaId !== 'string' || !mediaId || typeof email !== 'string' || !email) return null;
  try {
    const id = `cr_${crypto.getRandomValues(new Uint32Array(2)).join('_')}`;
    const craft = normalizeCraft({
      id, email, mediaId, product: 'MAGNET', shape: 'rounded', photoFit: 'FILL',
      status: 'DRAFT', previewStatus: 'READY', rotation: 340, tilt: 10,
      demoEdition: `AL-${id.slice(3).replace('_', '-').toUpperCase()}`,
      createdAt: Date.now(),
    });
    const list = readAll();
    list.unshift(craft);
    writeAll(list);
    return craft;
  } catch {
    return null;
  }
}

export function getCraft(id) {
  try { return readAll().find((craft) => craft.id === id) || null; }
  catch { return null; }
}

export function listCrafts(email) {
  if (!email) return [];
  try { return readAll().filter((craft) => craft.email === email).sort((a, b) => b.createdAt - a.createdAt); }
  catch { return []; }
}

export function updateCraft(id, change) {
  try {
    const list = readAll();
    const craft = list.find((item) => item.id === id);
    if (!craft) return null;
    const sourceChanged = typeof change.mediaId === 'string' && change.mediaId && change.mediaId !== craft.mediaId;
    const dimensions = physicalOptions({ ...craft, ...Object.fromEntries(Object.entries(change).filter(([key, value]) => ['widthMm', 'heightMm', 'baseMm', 'reliefMm'].includes(key) && Number.isFinite(value))) });
    const variantChanged = ['REAL', 'ANIME'].includes(change.variant) && change.variant !== craft.variant;
    const maskChanged = typeof change.maskRevision === 'string' && change.maskRevision !== craft.maskRevision;
    const raisedChanged = typeof change.raised === 'boolean' && change.raised !== craft.raised;
    const fitChanged = PHOTO_FITS.includes(change.photoFit) && change.photoFit !== craft.photoFit;
    const designChanged = (MODEL_TYPES.includes(change.product) && change.product !== craft.product)
      || (SHAPES.includes(change.shape) && change.shape !== craft.shape) || sourceChanged || variantChanged || maskChanged || raisedChanged || fitChanged
      || ['widthMm', 'heightMm', 'baseMm', 'reliefMm'].some((key) => dimensions[key] !== craft[key]);
    if (MODEL_TYPES.includes(change.product)) {
      craft.product = change.product;
      craft.modelType = change.product;
    }
    if (SHAPES.includes(change.shape)) craft.shape = change.shape;
    if (typeof change.mediaId === 'string' && change.mediaId) craft.mediaId = change.mediaId;
    for (const key of ['widthMm', 'heightMm', 'baseMm', 'reliefMm']) craft[key] = dimensions[key];
    if (['REAL', 'ANIME'].includes(change.variant)) craft.variant = change.variant;
    if (typeof change.maskRevision === 'string') craft.maskRevision = change.maskRevision;
    if (['AI', 'MANUAL', 'NONE'].includes(change.maskSource)) craft.maskSource = change.maskSource;
    if (typeof change.raised === 'boolean') craft.raised = change.raised;
    if (PHOTO_FITS.includes(change.photoFit)) craft.photoFit = change.photoFit;
    // sizedFor: which photo and product the face was sized to, or MANUAL once the traveller typed a size.
    if (typeof change.sizedFor === 'string' && change.sizedFor) craft.sizedFor = change.sizedFor.slice(0, 200);
    if (typeof change.sourceMediaId === 'string') craft.sourceMediaId = change.sourceMediaId;
    if (change.aiJob === null) delete craft.aiJob;
    else if (change.aiJob?.id && change.aiJob.inputVersion === craft.inputVersion && ['REAL', 'ANIME'].includes(change.aiJob.variant) && typeof change.aiJob.sourceMediaId === 'string') {
      // target: which style's picture the result belongs to (a REAL-variant localization may run on the anime picture).
      const target = ['REAL', 'ANIME'].includes(change.aiJob.target) ? change.aiJob.target : change.aiJob.variant;
      craft.aiJob = { id: String(change.aiJob.id), inputVersion: craft.inputVersion, sourceMediaId: change.aiJob.sourceMediaId, variant: change.aiJob.variant, target };
    }
    if (Number.isFinite(change.rotation)) craft.rotation = normalizePose(change.rotation).rotation;
    if (Number.isFinite(change.tilt)) craft.tilt = normalizePose(0, change.tilt).tilt;
    if (['READY', 'PREVIEWED', 'DESIGNED'].includes(change.previewStatus)) craft.previewStatus = change.previewStatus;
    if (designChanged) {
      craft.status = 'DRAFT';
      craft.previewStatus = 'READY';
      craft.revision += 1;
      craft.inputVersion = `${craft.id}:${craft.revision}`;
      craft.modelStatus = 'NOT_GENERATED';
      craft.geometryVersion = 0;
      delete craft.frozenModel;
      delete craft.aiJob;
      if (sourceChanged) { craft.variant = 'REAL'; craft.maskSource = 'NONE'; delete craft.sourceMediaId; delete craft.maskRevision; }
    } else if (change.status === 'DESIGNED') {
      craft.status = 'DESIGNED';
      craft.previewStatus = 'DESIGNED';
    }
    if (!designChanged && change.generatedVersion === craft.inputVersion) {
      craft.geometryVersion = GEOMETRY_VERSION;
      craft.modelStatus = 'GENERATED';
    }
    if (!designChanged && change.frozenModel?.id && change.frozenVersion === craft.inputVersion) {
      craft.frozenModel = { id: String(change.frozenModel.id), version: change.frozenModel.version, inputVersion: craft.inputVersion };
    }
    writeAll(list);
    return craft;
  } catch {
    return null;
  }
}

// Photo/AI/mask bytes live in their own private IndexedDB, not JSON/localStorage.
// The original is immutable per craft + original media ID, never replaced by anime.
export function variantCacheKey(craft, variant = craft.variant) { return `${craft.id}|${craft.mediaId}|${variant}`; }
export function cacheVariant(key, record, isCurrent = () => true) { return cacheTransaction('readwrite', (store) => store.put({ ...record, key }), isCurrent); }
export function getCachedVariant(key) { return cacheTransaction('readonly', (store) => store.get(key)); }
function cacheTransaction(mode, action, isCurrent = () => true) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('STORAGE')); return; }
    const request = indexedDB.open('along-craft-models', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('variants', { keyPath: 'key' });
    request.onerror = () => reject(request.error || new Error('STORAGE'));
    request.onblocked = () => reject(new Error('STORAGE'));
    request.onsuccess = () => {
      const db = request.result;
      try {
        if (!isCurrent()) throw new DOMException('Stale cache write', 'AbortError');
        const tx = db.transaction('variants', mode), result = action(tx.objectStore('variants'));
        result.onsuccess = () => { if (!isCurrent()) tx.abort(); };
        tx.oncomplete = () => { resolve(result.result || null); db.close(); };
        tx.onerror = tx.onabort = () => { reject(tx.error || new Error('STORAGE')); db.close(); };
      } catch (error) { db.close(); reject(error); }
    };
  });
}

export function createCraftJobRunner({ api, currentVersion, onState = () => {}, onReady = async () => {},
  delay = (ms, signal) => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  }), now = () => Date.now() }) {
  let serial = 0, active = null, disposed = false;
  const live = (run) => !disposed && active === run && run.serial === serial && currentVersion() === run.inputVersion;
  async function cancelRemote(id) { try { await api(`/craft-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); } catch { /* local cancellation remains authoritative */ } }
  function cancel({ remote = true, notify = true } = {}) {
    serial++;
    const run = active; active = null;
    if (run) { run.preserve = !remote; run.abort.abort(); if (remote && run.jobId) void cancelRemote(run.jobId); }
    if (!disposed && notify) onState({ status: 'CANCELLED' });
  }
  async function start({ mediaId, variant, inputVersion, consent, jobId = null }) {
    if (disposed) return false;
    if (!consent) throw new Error('CONSENT_REQUIRED');
    cancel({ notify: false });
    const run = { serial, inputVersion, jobId, known: !!jobId, abort: new AbortController() };
    active = run; onState({ status: 'QUEUED', variant });
    try {
      // Do not abort creation: a late job ID must still be cancelled. Resume only
      // reads a previously consented job and never starts another provider call.
      let { job } = jobId ? await api(`/craft-jobs/${encodeURIComponent(jobId)}`, { signal: run.abort.signal })
        : await api('/craft-jobs', { method: 'POST', body: { mediaId, variant, inputVersion, consent: true,
          idempotencyKey: `craft-${inputVersion}-${variant}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}` } });
      run.jobId = job?.id;
      // An anime job is two provider calls in sequence (edit up to 3 min, then localization).
      const deadline = now() + (variant === 'ANIME' ? 360000 : 180000);
      while (true) {
        if (!live(run)) { if (run.jobId && (!run.preserve || !run.known)) void cancelRemote(run.jobId); if (active === run) active = null; return false; }
        if (!job?.id || (jobId && job.id !== jobId) || job.inputVersion !== inputVersion || job.variant !== variant || job.sourceMediaId !== mediaId) throw new Error('JOB_STALE');
        if (!['QUEUED', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED'].includes(job.status)) throw new Error('JOB_INVALID');
        run.known = true; onState(job);
        if (job.status === 'READY') {
          await onReady(job, () => live(run));
          if (active === run) active = null;
          return true;
        }
        if (job.status === 'FAILED') throw new Error(job.error || 'AI_FAILED');
        if (job.status === 'CANCELLED') { active = null; return false; }
        if (now() > deadline) throw new Error('AI_TIMEOUT');
        await delay(1000, run.abort.signal);
        ({ job } = await api(`/craft-jobs/${encodeURIComponent(run.jobId)}`, { signal: run.abort.signal }));
      }
    } catch (error) {
      if (!live(run) || error.name === 'AbortError') { if (active === run) active = null; return false; }
      if (run.jobId) void cancelRemote(run.jobId);
      active = null; onState({ status: 'FAILED', error: error.code || error.message });
      return false;
    }
  }
  return {
    start, resume: ({ id, sourceMediaId, variant, inputVersion }) => start({ jobId: id, mediaId: sourceMediaId, variant, inputVersion, consent: true }), cancel,
    dispose({ preserve = false } = {}) { disposed = true; cancel({ remote: !preserve }); }, get busy() { return active !== null; },
  };
}


// The outline of each shape on a size×size canvas, as a Path2D.
export function shapePath(shape, size) {
  const p = new Path2D();
  const m = size * 0.06;           // margin
  const w = size - m * 2;
  const x0 = m;
  const y0 = m;
  if (shape === 'oval') {
    p.ellipse(size / 2, size / 2, w * 0.4, w / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'arch') {
    const left = x0 + w * 0.12;
    const right = x0 + w * 0.88;
    const r = (right - left) / 2;
    p.moveTo(left, y0 + w);
    p.lineTo(left, y0 + r);
    p.arc(left + r, y0 + r, r, Math.PI, 0);
    p.lineTo(right, y0 + w);
    p.closePath();
  } else if (shape === 'scallop') {
    const lobes = 12;
    const cx = size / 2;
    const cy = size / 2;
    const base = w * 0.42;
    for (let i = 0; i <= 360; i += 2) {
      const a = (i * Math.PI) / 180;
      const r = base + Math.cos(a * lobes) * w * 0.035;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
  } else {
    // Rounded square, drawn with arcs: Path2D.roundRect is missing before WebView 99.
    const r = w * 0.16;
    const x = x0 + w * 0.06;
    const y = y0 + w * 0.06;
    const s = w * 0.88;
    p.moveTo(x + r, y);
    p.arcTo(x + s, y, x + s, y + s, r);
    p.arcTo(x + s, y + s, x, y + s, r);
    p.arcTo(x, y + s, x, y, r);
    p.arcTo(x, y, x + s, y, r);
    p.closePath();
  }
  return p;
}

// Draws the photo, cut to the shape, with a white rim. Returns the canvas.
export function drawDesign(image, shape, size = DESIGN_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const path = shapePath(shape, size);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = '#FFFDF8';
  ctx.fillRect(0, 0, size, size);
  // Keep the full photograph (including any source watermark) inside the shape.
  const box = shape === 'oval' || shape === 'scallop'
    ? { x: 0.26, y: 0.25, w: 0.48, h: 0.5 }
    : shape === 'arch' ? { x: 0.22, y: 0.3, w: 0.56, h: 0.5 }
      : { x: 0.16, y: 0.18, w: 0.68, h: 0.64 };
  const scale = Math.min(size * box.w / image.naturalWidth, size * box.h / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, size * (box.x + box.w / 2) - w / 2, size * (box.y + box.h / 2) - h / 2, w, h);
  ctx.restore();
  ctx.lineWidth = size * 0.022;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke(path);
  return canvas;
}
