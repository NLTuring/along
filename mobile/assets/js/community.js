// Online community and production helpers. No legacy/local post storage is read or written.
import { api, upload, apiFileUrl } from './api.js';

export const POST_LIMITS = Object.freeze({ title: 120, body: 10000, city: 100, tags: 10, tag: 32, media: 9 });
export const POST_STATES = Object.freeze(['DRAFT', 'PENDING', 'PUBLIC', 'REJECTED', 'HIDDEN']);
export const INQUIRY_STATES = Object.freeze(['REQUESTED', 'NEEDS_INFO', 'QUOTED', 'CONFIRMED', 'PRODUCING', 'SHIPPED', 'COMPLETED', 'CANCELLED']);
const clean = value => String(value ?? '').trim();
export const pathId = value => encodeURIComponent(String(value));

export function parseTags(value) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(/[,，\n]/);
  return [...new Set(items.map(clean).filter(Boolean))];
}
export function validatePost(input = {}) {
  const value = {
    title: clean(input.title), body: clean(input.body), city: clean(input.city),
    tags: parseTags(input.tags), poiId: clean(input.poiId) || null,
    mediaIds: Array.isArray(input.mediaIds) ? [...input.mediaIds] : [], status: input.status,
  };
  const errors = [];
  for (const key of ['title', 'body', 'city']) if (!value[key] || value[key].length > POST_LIMITS[key]) errors.push(key);
  if (value.tags.length > POST_LIMITS.tags || value.tags.some(tag => tag.length > POST_LIMITS.tag)) errors.push('tags');
  if ((value.poiId?.length || 0) > 200) errors.push('poiId');
  if (value.mediaIds.length > POST_LIMITS.media || new Set(value.mediaIds).size !== value.mediaIds.length || value.mediaIds.some(id => typeof id !== 'string' || !id)) errors.push('media');
  if (!['DRAFT', 'PENDING'].includes(value.status)) errors.push('status');
  return { ok: errors.length === 0, errors, value };
}
export function moveItem(items, from, to) {
  const copy = [...items];
  if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < copy.length)) return copy;
  copy.splice(to, 0, copy.splice(from, 1)[0]);
  return copy;
}
export function postsQuery({ city = '', q = '', tag = '', cursor = '', mine = false } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ city, q, tag, cursor })) if (clean(value)) params.set(key, clean(value));
  if (mine) params.set('mine', '1');
  return `/posts${params.size ? `?${params}` : ''}`;
}
// Defence in depth for rendering; authorization is always enforced by the server.
export function visiblePosts(items, userId, mine = false) {
  return (Array.isArray(items) ? items : []).filter(post => post && POST_STATES.includes(post.status) &&
    (mine ? Boolean(userId && post.author?.id === userId) : post.status === 'PUBLIC'));
}
export function visibleComments(items, userId) {
  return (Array.isArray(items) ? items : []).filter(item => item &&
    (item.status === 'PUBLIC' || Boolean(userId && item.author?.id === userId)));
}
export function mergePage(previous, incoming) {
  const items = new Map(previous.map(item => [item.id, item]));
  for (const item of incoming) items.set(item.id, item);
  return [...items.values()];
}
export function safeMediaUrl(value, origin = globalThis.location?.origin) {
  const url = apiFileUrl(value, origin);
  return url && /\/api\/media\//.test(new URL(url, origin).pathname) ? url : '';
}
export function safeModelUrl(value, origin = globalThis.location?.origin) {
  const url = apiFileUrl(value, origin);
  return url && /\/api\/craft-models\//.test(new URL(url, origin).pathname) ? url : '';
}
export function mediaFileError(file, limits = {}) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) return 'fileType';
  const image = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  const video = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
  if (!image && !video) return 'fileType';
  const max = image ? limits.imageBytes || 15 * 1024 * 1024 : limits.videoBytes || 100 * 1024 * 1024;
  return file.size > max ? 'fileSize' : '';
}
export function createRequestGate() {
  let controller = null;
  let closed = false;
  return {
    next() { controller?.abort(); controller = new AbortController(); if (closed) controller.abort(); return controller; },
    current(request) { return !closed && controller === request && !request.signal.aborted; },
    dispose() { closed = true; controller?.abort(); },
  };
}
export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function uploadCommunityFile(file, { consent, onProgress, signal, onState } = {}) {
  if (consent !== true) { const error = new Error('Upload consent is required'); error.code = 'CONSENT_REQUIRED'; throw error; }
  const data = new FormData();
  data.append('file', file); data.append('purpose', 'COMMUNITY'); data.append('consent', 'true');
  let { media } = await upload('/media', data, { onProgress, signal });
  onState?.(media);
  const deadline = Date.now() + 180000;
  while (media.status === 'PROCESSING' && Date.now() < deadline) {
    await abortableDelay(1500, signal);
    ({ media } = await api(`/media/${pathId(media.id)}`, { signal }));
    onState?.(media);
  }
  if (media.status !== 'READY') {
    const error = new Error('Media is not ready'); error.code = media.status === 'FAILED' ? 'MEDIA_FAILED' : 'MEDIA_TIMEOUT'; throw error;
  }
  return media;
}
export const canCancelInquiry = status => ['REQUESTED', 'NEEDS_INFO', 'QUOTED', 'CONFIRMED'].includes(status);
export function canConfirmInquiry(inquiry) {
  return inquiry?.status === 'QUOTED' && Number.isInteger(inquiry.quote?.revision) && inquiry.quote.revision > 0;
}
export function inquiryTransitions(status) {
  return ({ REQUESTED: ['NEEDS_INFO', 'CANCELLED'], NEEDS_INFO: ['CANCELLED'], QUOTED: ['NEEDS_INFO', 'CANCELLED'], CONFIRMED: ['PRODUCING', 'CANCELLED'], PRODUCING: ['SHIPPED'], SHIPPED: ['COMPLETED'] })[status] || [];
}
export const canQuoteInquiry = status => ['REQUESTED', 'NEEDS_INFO', 'QUOTED'].includes(status);
export function validateInquiry(input = {}) {
  const shipping = Object.fromEntries(['name', 'phone', 'region', 'address', 'postalCode'].map(key => [key, clean(input.shipping?.[key])]));
  const value = { modelId: clean(input.modelId), quantity: Number(input.quantity), material: clean(input.material), colorProcess: clean(input.colorProcess), notes: clean(input.notes), shipping, consent: input.consent === true, idempotencyKey: clean(input.idempotencyKey) };
  const errors = [];
  if (!value.modelId) errors.push('model');
  if (!Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 1000) errors.push('quantity');
  if (!value.material || value.material.length > 100) errors.push('material');
  if (!value.colorProcess || value.colorProcess.length > 100) errors.push('colorProcess');
  if (value.notes.length > 4000) errors.push('notes');
  if (!shipping.name || shipping.name.length > 100 || !shipping.phone || shipping.phone.length > 32 || !/^[+\d\s()\-]{5,32}$/.test(shipping.phone) || shipping.phone.replace(/\D/g, '').length < 5 || !shipping.region || shipping.region.length > 200 || !shipping.address || shipping.address.length > 500 || shipping.postalCode.length > 20) errors.push('shipping');
  if (!value.consent) errors.push('consent');
  if (value.idempotencyKey.length < 8 || value.idempotencyKey.length > 128) errors.push('idempotencyKey');
  return { ok: !errors.length, errors, value };
}
export function parseMoney(value) {
  const text = clean(value);
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return null;
  const [units, decimal = ''] = text.split('.');
  const cents = Number(units) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
// A stable key is reused after an uncertain response, but not after input changes.
export function createSubmissionKey(make = () => crypto.randomUUID()) {
  let fingerprint = '', key = '';
  return input => {
    const next = JSON.stringify(input);
    if (next !== fingerprint || !key) { fingerprint = next; key = make(); }
    return key;
  };
}
