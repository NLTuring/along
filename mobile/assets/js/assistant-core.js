// Along mobile — 小游 assistant logic without DOM: action whitelist, the long-press gesture
// and the one-time friends filter hand-off. Kept pure so it can be tested in Node.

// Pages the AI may open: the server's OPEN_ROUTES, kept the same on both sides.
export const ASSISTANT_ROUTES = ['trip', 'friends', 'stories', 'you', 'support', 'map', 'crafts', 'saved', 'orders', 'studio',
  'wallet', 'social', 'profile', 'library', 'make-orders', 'apply', 'craft-new'];
// Pages a plain command on the phone can open as well. These are newer than the server, so an
// AI answer cannot point at them, but "美食" or "where to eat" still opens them at once.
export const LOCAL_ROUTES = [...ASSISTANT_ROUTES, 'travel', 'workshop', 'points', 'beads', 'clay-new', 'gallery', 'avatar'];
// Most routes are their own path; these few live elsewhere.
const ROUTE_PATHS = { profile: 'u/me', 'craft-new': 'craft/new', 'clay-new': 'clay/new' };
export const routePath = (route) => ROUTE_PATHS[route] || route;
// Actions that move to another page, so they can be carried out at once.
export const NAVIGATING = new Set(['open', 'place', 'directions', 'guide', 'friends']);
const CITIES = ['shanghai', 'nanjing'];
const KINDS = ['VOLUNTEER', 'LICENSED'];
export const FILTER_KEY = 'along.assistant.friendsFilter';
export const LONG_PRESS_MS = 500;
export const SENIOR_LONG_PRESS_MS = 800;
// Voice typing pauses between phrases; wait a little longer than a breath before sending.
export const VOICE_SETTLE_MS = 1500;

/** Re-check the server's actions on the client. Unknown ids or types never become buttons. */
export function clientActions(raw, { places = {}, guides = [] } = {}) {
  if (!Array.isArray(raw)) return [];
  const guideIds = new Set(guides.map((g) => g.id));
  const topics = new Set(guides.flatMap((g) => g.topics || []));
  const out = [];
  for (const a of raw.slice(0, 4)) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'open' && ASSISTANT_ROUTES.includes(a.route)) out.push({ type: 'open', route: a.route, path: routePath(a.route) });
    else if ((a.type === 'place' || a.type === 'directions') && typeof a.id === 'string' && places[a.id]) out.push({ type: a.type, id: a.id, path: `map/${a.id}` });
    else if (a.type === 'guide' && guideIds.has(a.id)) out.push({ type: 'guide', id: a.id, path: `guides/${a.id}` });
    else if (a.type === 'friends') {
      const filter = {};
      if (CITIES.includes(a.city)) filter.city = a.city;
      if (KINDS.includes(a.kind)) filter.kind = a.kind;
      if (typeof a.topic === 'string' && topics.has(a.topic)) filter.topic = a.topic;
      out.push({ type: 'friends', filter, path: 'friends' });
    } else if (a.type === 'copy' && typeof a.text === 'string' && a.text.trim()) out.push({ type: 'copy', text: a.text.trim().slice(0, 600) });
  }
  return out;
}

/** Store a friends filter for the next Friends render only. */
export function stashFriendsFilter(filter, storage = globalThis.sessionStorage) {
  try { storage?.setItem(FILTER_KEY, JSON.stringify(filter || {})); return true; } catch { return false; }
}

/** Read and clear the stashed filter; anything unexpected becomes the default "all". */
export function takeFriendsFilter(storage = globalThis.sessionStorage) {
  let raw = null;
  try { raw = storage?.getItem(FILTER_KEY); storage?.removeItem(FILTER_KEY); } catch { return null; }
  if (!raw) return null;
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  return {
    city: CITIES.includes(value.city) ? value.city : 'all',
    kind: KINDS.includes(value.kind) ? value.kind : 'all',
    topic: filterTopic(value.topic),
  };
}

// The Friends page offers four topic buttons; map a guide topic onto the closest one.
export const FILTER_TOPICS = ['Photography', 'Food', 'History', 'Architecture'];
export function filterTopic(topic) {
  if (typeof topic !== 'string') return 'all';
  const t = topic.toLowerCase();
  if (FILTER_TOPICS.some((x) => x.toLowerCase() === t)) return FILTER_TOPICS.find((x) => x.toLowerCase() === t);
  if (/food|market|eat|snack/.test(t)) return 'Food';
  if (/photo|film|camera/.test(t)) return 'Photography';
  if (/architect|wall|building/.test(t)) return 'Architecture';
  if (/history|museum|temple/.test(t)) return 'History';
  return 'all';
}

/**
 * Tap versus long-press on the floating button. A press shorter than the threshold is a tap;
 * holding past it fires onLong once; moving away or cancelling aborts both.
 */
export function createPressGesture({ threshold = LONG_PRESS_MS, slop = 14, onTap = () => {}, onLong = () => {}, onRelease = () => {}, onProgress = () => {}, onCancel = () => {}, now = () => performance.now(), schedule = (fn, ms) => setTimeout(fn, ms), clear = (id) => clearTimeout(id), frame = (fn) => requestAnimationFrame(fn) } = {}) {
  let start = null, timer = null, fired = false, origin = null, raf = 0;
  const tick = () => {
    if (start == null || fired) return;
    onProgress(Math.min(1, (now() - start) / threshold));
    raf = frame(tick);
  };
  const reset = () => { if (timer != null) clear(timer); timer = null; start = null; origin = null; raf = 0; };
  return {
    down(x = 0, y = 0) {
      reset(); fired = false; start = now(); origin = { x, y };
      timer = schedule(() => { if (start == null) return; fired = true; onProgress(1); onLong(); }, threshold);
      raf = frame(tick);
    },
    move(x = 0, y = 0) {
      if (start == null || !origin) return;
      if (Math.hypot(x - origin.x, y - origin.y) > slop) {
        const wasLong = fired; reset(); onProgress(0); onCancel({ afterLong: wasLong }); fired = false;
      }
    },
    up() {
      if (start == null) return;
      const wasLong = fired; reset(); onProgress(0); fired = false;
      if (wasLong) onRelease(); else onTap();
    },
    cancel() { if (start == null) return; const wasLong = fired; reset(); onProgress(0); fired = false; onCancel({ afterLong: wasLong }); },
    get pressing() { return start != null; },
  };
}

export const NATIVE_ORIGIN = 'https://appassets.androidplatform.net';
// Errors after which in-page recognition will not work on this device for the rest of the session.
export const HARD_SPEECH_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported']);

/**
 * How 小游 listens. 'web' uses the page's SpeechRecognition; 'keyboard' relies on the soft
 * keyboard's own voice typing. Android WebView exposes webkitSpeechRecognition, but this shell
 * grants no microphone, so inside the app it always fails and the keyboard is used instead.
 */
export function voiceMode({ hasRecognition = false, origin = '', userAgent = '', nativeBridge = false, failed = false } = {}) {
  if (!hasRecognition || failed) return 'keyboard';
  if (nativeBridge || origin === NATIVE_ORIGIN || /; wv\)/.test(userAgent)) return 'keyboard';
  return 'web';
}

/** Keyboard voice input: send once the dictated text has settled (and the IME is not mid-composition). */
export function createSettleSender({ delay = VOICE_SETTLE_MS, send = () => {}, isBusy = () => false, schedule = (fn, ms) => setTimeout(fn, ms), clear = (id) => clearTimeout(id) } = {}) {
  let timer = null, armed = false;
  const stop = () => { if (timer != null) clear(timer); timer = null; };
  const fire = () => {
    timer = null;
    if (!armed) return;
    if (isBusy()) { timer = schedule(fire, delay); return; }
    armed = false; send();
  };
  return {
    arm() { armed = true; stop(); },
    disarm() { armed = false; stop(); },
    input(text) {
      if (!armed) return;
      stop();
      if (!String(text || '').trim()) return;
      timer = schedule(fire, delay);
    },
    flush(text) { if (!armed || !String(text || '').trim()) return false; stop(); armed = false; send(); return true; },
    get armed() { return armed; },
  };
}

/** Last turns only, trimmed the way the server validates them. */
export function conversationPayload(history, { locale, route, city } = {}) {
  const messages = history.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text?.trim())
    .slice(-12).map((m) => ({ role: m.role, text: m.text.trim().slice(0, 1000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const body = { messages, locale: locale === 'zh' ? 'zh' : 'en' };
  if (route && /^[a-z][a-z-]{0,23}$/.test(route)) body.route = route;
  if (CITIES.includes(city)) body.city = city;
  return body;
}
