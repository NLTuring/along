// Along — same-origin service requests. Credentials never come from local demo data.
import { localExperienceActive, localExperienceError, onLocalExperienceChange } from './local-experience.js';
import { API_BASE_URL } from './build-flags.js';
import { validatedApiBase, createMobileTokenStore, approvedApiFile, webMountPath } from './remote-session.js';

const apiBase = validatedApiBase(API_BASE_URL);
const webMount = apiBase ? '' : webMountPath(import.meta.url);
const mobileTokens = createMobileTokenStore(apiBase);
const requestHeaders = () => {
  const headers = { Accept: 'application/json' };
  if (apiBase) {
    headers['X-Along-Client'] = 'android';
    const token = mobileTokens.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const pending = new Set();
let requestGeneration = 0;
onLocalExperienceChange(() => {
  requestGeneration += 1;
  csrfToken = '';
  mobileTokens.clear();
  for (const abort of pending) abort();
});

let config = { mode: 'unavailable', authAvailable: false, baidu: { browserKey: '' }, ai: { available: false, provider: '' }, limits: {} };
let csrfToken = '';
const listeners = new Set();

function endpoint(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\r\n\\]/.test(path)) {
    throw new TypeError('API path must be same-origin');
  }
  return `${apiBase || webMount}/api${path}`;
}

function failure(status, payload) {
  const error = new Error(payload?.error?.message || 'The service could not complete this request.');
  error.code = typeof payload?.error === 'string' ? payload.error : payload?.error?.code || (status === 401 ? 'UNAUTHENTICATED' : 'SERVICE_UNAVAILABLE');
  error.status = status;
  error.details = payload;
  if (status === 401) {
    csrfToken = '';
    mobileTokens.clear();
    listeners.forEach((fn) => fn());
  }
  return error;
}

export function onUnauthorized(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setCsrfToken(value) { csrfToken = typeof value === 'string' ? value : ''; }
export function clearMobileSession() { mobileTokens.clear(); }
export function hasMobileSession() { return !!apiBase && !!mobileTokens.get(); }
export function apiFileUrl(value, origin = globalThis.location?.origin) { return approvedApiFile(value, apiBase, origin, webMount); }
export function getRuntimeConfig() {
  return localExperienceActive()
    ? { ...config, mode: 'local-experience', connected: false, authAvailable: false, ai: { available: false, detectAvailable: false, editAvailable: false, provider: '' }, localOnly: true }
    : config;
}

export async function api(path, { method = 'GET', body, signal, timeoutMs = 20_000 } = {}) {
  if (localExperienceActive()) throw localExperienceError();
  const generation = requestGeneration;
  const controller = new AbortController();
  const abort = () => controller.abort();
  pending.add(abort);
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  const headers = requestHeaders();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!apiBase && !['GET', 'HEAD'].includes(method.toUpperCase()) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  try {
    const response = await fetch(endpoint(path), {
      method, credentials: apiBase ? 'omit' : 'same-origin', headers, redirect: 'error',
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    let payload;
    try { payload = await response.json(); } catch { throw failure(response.status, null); }
    if (generation !== requestGeneration || localExperienceActive()) throw localExperienceError();
    if (!response.ok) throw failure(response.status, payload);
    if (payload.csrfToken) setCsrfToken(payload.csrfToken);
    if (apiBase && path === '/auth/verify' && payload.ok && payload.mobileToken) mobileTokens.set(payload.mobileToken, payload.expiresAt);
    // A valid session check means the server renewed it; keep the stored deadline in step.
    if (apiBase && path === '/auth/session' && payload.user) mobileTokens.touch();
    if (apiBase && path === '/auth/logout' && payload.ok) mobileTokens.clear();
    return payload;
  } catch (error) {
    if (error.code || error.name === 'AbortError') throw error;
    throw failure(0, null);
  } finally {
    pending.delete(abort);
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function initApi() {
  if (localExperienceActive()) return getRuntimeConfig();
  const generation = requestGeneration;
  try {
    const result = await api('/config', { timeoutMs: 4000 });
    if (generation !== requestGeneration || localExperienceActive()) return getRuntimeConfig();
    config = { ...config, ...result, connected: true };
  } catch {
    config = { ...config, connected: false, authAvailable: false };
  }
  return config;
}

export function upload(path, formData, { onProgress, signal } = {}) {
  if (localExperienceActive()) return Promise.reject(localExperienceError());
  const generation = requestGeneration;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let finished = false;
    const abort = () => xhr.abort();
    const finish = (error, data) => {
      if (finished) return;
      finished = true;
      pending.delete(abort);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(data);
    };
    xhr.open('POST', endpoint(path));
    xhr.withCredentials = !apiBase;
    xhr.timeout = 180_000;
    for (const [name, value] of Object.entries(requestHeaders())) xhr.setRequestHeader(name, value);
    if (!apiBase && csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      if (generation !== requestGeneration || localExperienceActive()) { finish(localExperienceError()); return; }
      let payload;
      try { payload = JSON.parse(xhr.responseText); } catch { finish(failure(xhr.status, null)); return; }
      if (xhr.status < 200 || xhr.status >= 300) finish(failure(xhr.status, payload));
      else finish(null, payload);
    };
    xhr.onerror = () => finish(failure(0, null));
    xhr.ontimeout = () => finish(failure(408, null));
    xhr.onabort = () => finish(new DOMException('Upload cancelled', 'AbortError'));
    if (signal?.aborted) { finish(new DOMException('Upload cancelled', 'AbortError')); return; }
    pending.add(abort);
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(formData);
  });
}

export async function fetchProtectedMedia(value, { signal, maxBytes = 20 * 1024 * 1024 } = {}) {
  if (localExperienceActive()) throw localExperienceError();
  const url = apiFileUrl(value);
  if (!url || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 128 * 1024 * 1024) throw new TypeError('Invalid private media request');
  const controller = new AbortController(), generation = requestGeneration;
  const abort = () => controller.abort();
  pending.add(abort);
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 30000);
  try {
    const response = await fetch(url, { credentials: apiBase ? 'omit' : 'same-origin', headers: requestHeaders(), signal: controller.signal, redirect: 'error' });
    if (generation !== requestGeneration || localExperienceActive()) throw localExperienceError();
    if (!response.ok) throw failure(response.status, null);
    if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('Media too large');
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > maxBytes || generation !== requestGeneration || localExperienceActive()) { await reader.cancel(); throw new Error('Media limit or session changed'); }
      chunks.push(chunk);
    }
    return new Blob(chunks, { type: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' });
  } finally {
    clearTimeout(timer); pending.delete(abort); signal?.removeEventListener('abort', abort);
  }
}
