// Along — server sessions and an explicitly enabled, isolated local test profile.
import { api, initApi, setCsrfToken, onUnauthorized, getRuntimeConfig, hasMobileSession } from './api.js';
import { localExperienceSession, localExperienceActive, localExperienceEnabled, enterLocalExperience, leaveLocalExperience } from './local-experience.js';

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_TRIES = 5;
export const LOCK_MS = 15 * 60_000;
export const MAX_SENDS_PER_HOUR = 5;

let session = localExperienceSession();
let generation = 0;
const listeners = new Set();

export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim());
}

export function getSession() { return session; }
export function localExperienceAvailable() { return localExperienceEnabled(); }
export function onSessionChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function changed(value) {
  session = value;
  listeners.forEach((fn) => fn(session));
}

export function startLocalExperience() {
  if (session && !session.localOnly) return { ok: false, error: 'SIGN_OUT_FIRST' };
  generation += 1;
  const result = enterLocalExperience();
  if (result.ok) {
    setCsrfToken('');
    changed(result.session);
  }
  return result;
}

onUnauthorized(() => {
  if (session && !session.localOnly) { generation += 1; changed(null); }
});

export async function initSession() {
  const current = ++generation;
  if (localExperienceActive()) { session = localExperienceSession(); return session; }
  // Phone builds keep a stored sign-in: a weak or missing network on reopening must not sign out.
  // Only the server saying "not signed in" (or 401) ends it.
  clearTimeout(recheckTimer);
  const keep = hasMobileSession();
  if (!getRuntimeConfig().connected) { if (!keep) session = null; scheduleRecheck(current); return session; }
  try {
    const result = await api('/auth/session');
    if (current !== generation || localExperienceActive()) return session;
    setCsrfToken(result.csrfToken);
    session = result.user || null;
  } catch (error) {
    if (current !== generation || localExperienceActive()) return session;
    if (error.status === 401 || !keep) session = null; else scheduleRecheck(current);
  }
  return session;
}

// Retry the session check once the connection is back, without blocking app start.
let recheckTimer = 0;
function scheduleRecheck(current) {
  if (!hasMobileSession()) return;
  clearTimeout(recheckTimer);
  let attempts = 0;
  const later = (ms) => { recheckTimer = setTimeout(retry, ms); recheckTimer?.unref?.(); };
  const retry = async () => {
    if (++attempts > 8) return; // the next app start or page action will check again
    if (current !== generation || !hasMobileSession()) return;
    try {
      // The app started offline: load the service config too, so online features come back.
      if (!getRuntimeConfig().connected) await initApi();
      const result = await api('/auth/session', { timeoutMs: 8000 });
      if (current !== generation) return;
      setCsrfToken(result.csrfToken);
      if ((result.user?.id || null) !== (session?.id || null)) changed(result.user || null);
    } catch (error) { if (error.status !== 401 && current === generation) later(15_000); }
  };
  if (globalThis.navigator?.onLine === false) globalThis.addEventListener?.('online', retry, { once: true });
  else later(3000);
}

export async function signOut() {
  const current = ++generation;
  if (session?.localOnly || localExperienceActive()) {
    const result = leaveLocalExperience();
    if (!result.ok) throw Object.assign(new Error('Could not clear local experience state'), { code: result.error });
    setCsrfToken('');
    changed(null);
    return;
  }
  await api('/auth/logout', { method: 'POST' });
  if (current !== generation) return;
  setCsrfToken('');
  changed(null);
}

export async function requestCode(rawEmail) {
  if (localExperienceActive()) return { ok: false, error: 'LOCAL_EXPERIENCE_ONLY' };
  const email = String(rawEmail).trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: 'INVALID_EMAIL' };
  try { return await api('/auth/otp', { method: 'POST', body: { email } }); }
  catch (error) {
    if (error.details?.ok === false) return error.details;
    return { ok: false, error: error.code || 'SERVICE_UNAVAILABLE' };
  }
}

export async function verifyCode(rawEmail, code) {
  if (localExperienceActive()) return { ok: false, error: 'LOCAL_EXPERIENCE_ONLY' };
  const current = generation;
  try {
    const result = await api('/auth/verify', {
      method: 'POST', body: { email: String(rawEmail).trim().toLowerCase(), code: String(code) },
    });
    if (current !== generation || localExperienceActive()) return { ok: false, error: 'CANCELLED' };
    if (result.ok && result.user) {
      setCsrfToken(result.csrfToken);
      changed(result.user);
    }
    return result;
  } catch (error) {
    if (error.details?.ok === false) return error.details;
    return { ok: false, error: error.code || 'SERVICE_UNAVAILABLE' };
  }
}
