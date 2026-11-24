// Compiled HTTPS base only. No URL query, server response or localStorage override.
export function validatedApiBase(value) {
  if (!value) return '';
  if (typeof value !== 'string' || /[\\\s%]/.test(value)) throw new TypeError('Invalid API base');
  const url = new URL(value), path = url.pathname.replace(/\/$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443')
    || (path && (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(path) || path.length > 128))) throw new TypeError('API base must be HTTPS with a simple optional mount path');
  return url.origin + path;
}

// Resolve web mounting from the loaded module, not URL parameters or stored settings.
export function webMountPath(moduleUrl) {
  const url = new URL(moduleUrl);
  if (!['http:', 'https:'].includes(url.protocol)) return '';
  return new URL('../', url).pathname.replace(/\/$/, '');
}
// Matches the server's sliding 30-day phone session (MOBILE_SESSION_TTL_MS).
export const MOBILE_SESSION_MS = 30 * 86_400_000;
const KEY = 'along.mobileSession.v1';

// The token lives in the app's private WebView storage (only this app's origin can read it), so a
// sign-in survives Android closing the app in the background. sessionStorage was cleared then,
// which signed people out "by itself". The server still decides: logout or expiry returns 401,
// and a 401 clears this copy.
export function createMobileTokenStore(base, storage = () => globalThis.localStorage, now = () => Date.now(), legacy = () => globalThis.sessionStorage) {
  let current = null;
  const valid = value => value?.base === base && typeof value?.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.token)
    && Number.isSafeInteger(value.expiresAt) && value.expiresAt > now() && value.expiresAt <= now() + MOBILE_SESSION_MS;
  const read = (area) => { try { const value = JSON.parse(area()?.getItem(KEY) || 'null'); return valid(value) ? value : null; } catch { return null; } };
  const write = (value) => { try { storage()?.setItem(KEY, JSON.stringify(value)); } catch { /* memory only for this run */ } };
  if (base) {
    current = read(storage);
    // One-time move from the old per-tab store, so people signed in before this update stay signed in.
    if (!current) { current = read(legacy); if (current) write(current); }
    try { legacy()?.removeItem(KEY); } catch { /* nothing to move */ }
  }
  return {
    get() { if (!valid(current)) { if (current) this.clear(); current = null; return ''; } return current.token; },
    // The server's clock may differ from the phone's; keep a local deadline. The server's own
    // expiry still applies and a 401 clears this copy.
    set(token) {
      const value = { base, token, expiresAt: now() + MOBILE_SESSION_MS };
      if (!base || !valid(value)) throw new TypeError('Invalid mobile session');
      current = value; write(value);
    },
    /** The server renewed the session (sliding expiry): push the local deadline forward too. */
    touch() {
      if (!current || !valid(current)) return;
      current = { ...current, expiresAt: now() + MOBILE_SESSION_MS }; write(current);
    },
    clear() {
      current = null;
      try { storage()?.removeItem(KEY); } catch { /* server logout revocation remains authoritative */ }
      try { legacy()?.removeItem(KEY); } catch { /* nothing stored there */ }
    },
  };
}
export function approvedApiFile(value, base, origin = globalThis.location?.origin, mount = '') {
  if (typeof value !== 'string' || !value || !origin || /[\\\r\n]/.test(value)) return '';
  try {
    const expected = new URL(base || origin);
    const prefix = base ? expected.pathname.replace(/\/$/, '') : mount;
    const canonicalInput = value.startsWith('/api/');
    const url = new URL(canonicalInput ? prefix + value : value, expected.origin);
    if (url.origin !== expected.origin || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash
      || !url.pathname.startsWith(`${prefix}/api/`)) return '';
    const canonical = url.pathname.slice(prefix.length);
    if (!/^\/api\/(?:media\/[A-Za-z0-9_-]{1,128}\/(?:file|poster)|craft-models\/[A-Za-z0-9_-]{1,128}\/(?:glb|stl)|gallery\/[A-Za-z0-9_-]{1,128}\/(?:cover|model)|ai-models\/[A-Za-z0-9_-]{1,128}\/glb)$/.test(canonical)) return '';
    const keys = [...url.searchParams.keys()];
    if (keys.some(key => key !== 'ticket') || url.searchParams.getAll('ticket').length > 1 || (url.searchParams.get('ticket') || '').length > 1024) return '';
    return base ? url.href : `${url.pathname}${url.search}`;
  } catch { return ''; }
}
