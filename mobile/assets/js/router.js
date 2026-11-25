// InsTrip mobile — routes. Names follow the URLs in the product spec (§4).
// tab: which bottom tab is lit; nav: whether the bottom bar shows (flows hide it).

import { TABS } from './nav.js';

const STATE_KEY = '__instripHistory';
const SESSION = `instrip_${Math.random().toString(36).slice(2)}`;
let depth = 0;
let currentKey = 'trip';
let ready = false;

function decode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function parseHash(hash) {
  const [head, param] = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decode);
  // The guide page has its own booking bar at the bottom, so the tab bar steps aside.
  if (head === 'guides' && param) return { name: 'guide', param, tab: 'friends', nav: false, key: `guides/${param}` };
  if (head === 'checkout' && param) return { name: 'checkout', param, tab: 'friends', nav: false, key: `checkout/${param}` };
  if (head === 'messages' && param) return { name: 'messages', param, tab: 'trip', nav: false, key: `messages/${param}` };
  if (head === 'support') return { name: 'support', param: null, tab: 'you', nav: true, key: 'support' };
  if (head === 'orders') return { name: 'orders', param: null, tab: 'you', nav: true, key: 'orders' };
  if (head === 'library') return { name: 'library', param: null, tab: 'you', nav: true, key: 'library' };
  if (head === 'saved') return { name: 'saved', param: null, tab: 'you', nav: true, key: 'saved' };
  // Food and stays, optionally for one city: #/travel, #/travel/nanjing.
  if (head === 'travel') return { name: 'travel', param: param || null, tab: 'trip', nav: true, key: param ? `travel/${param}` : 'travel' };
  if (head === 'crafts') return { name: 'crafts', param: null, tab: 'you', nav: true, key: 'crafts' };
  // The craft workshop: home, points, bead patterns, the clay bench and the shared gallery.
  if (head === 'workshop') return { name: 'workshop', param: null, tab: 'trip', nav: true, key: 'workshop' };
  if (head === 'points') return { name: 'points', param: null, tab: 'you', nav: true, key: 'points' };
  if (head === 'beads') return { name: 'beads', param: param || null, tab: 'trip', nav: false, key: param ? `beads/${param}` : 'beads' };
  if (head === 'clay') return { name: 'clay', param: param || 'new', tab: 'trip', nav: false, key: `clay/${param || 'new'}` };
  if (head === 'gallery') return { name: 'gallery', param: param || null, tab: 'stories', nav: !param, key: param ? `gallery/${param}` : 'gallery' };
  // 小游's wardrobe has its own Save bar at the bottom.
  if (head === 'avatar') return { name: 'avatar', param: null, tab: 'you', nav: false, key: 'avatar' };
  if (head === 'apply') return { name: 'apply', param: null, tab: 'you', nav: false, key: 'apply' };
  if (head === 'map') return { name: 'map', param: param || null, tab: 'trip', nav: false, key: param ? `map/${param}` : 'map' };
  if (head === 'posts' && param) return { name: 'post', param, tab: 'stories', nav: false, key: `posts/${param}` };
  // Local examples, their authors' chat threads, and the phone's own follows and cards.
  if (head === 'examples' && param) return { name: 'example', param, tab: 'stories', nav: false, key: `examples/${param}` };
  if (head === 'dm' && param) return { name: 'dm', param, tab: 'stories', nav: false, key: `dm/${param}` };
  if (head === 'social') return { name: 'social', param: null, tab: 'you', nav: true, key: 'social' };
  // Profiles: #/u/me, #/u/<id>, #/u/<id>/followers, #/u/<id>/following.
  if (head === 'u' && param) {
    const list = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decode)[2];
    const value = ['followers', 'following'].includes(list) ? `${param}/${list}` : param;
    return { name: 'profile', param: value, tab: 'you', nav: false, key: `u/${value}` };
  }
  if (head === 'wallet') return { name: 'wallet', param: null, tab: 'you', nav: true, key: 'wallet' };
  if (head === 'make-order' && param) return { name: 'make-order', param, tab: 'you', nav: false, key: `make-order/${param}` };
  if (head === 'make-orders') return { name: 'make-orders', param: param || null, tab: 'you', nav: true, key: param ? `make-orders/${param}` : 'make-orders' };
  // Studio pages keep their own controls at the bottom, so the tab bar steps aside.
  if (head === 'studio') {
    return param
      ? { name: 'film', param, tab: 'trip', nav: false, key: `studio/${param}` }
      : { name: 'studio', param: null, tab: 'trip', nav: false, key: 'studio' };
  }
  if (head === 'craft' && param) return { name: 'craft', param, tab: 'trip', nav: false, key: `craft/${param}` };
  const tab = TABS.includes(head) ? head : 'trip';
  return { name: tab, param: null, tab, nav: true, key: tab };
}

function stateFor(nextDepth, key) {
  return { [STATE_KEY]: { session: SESSION, depth: Math.max(0, nextDepth), key } };
}

function emitHashChange(oldURL, newURL) {
  const event = typeof HashChangeEvent === 'function'
    ? new HashChangeEvent('hashchange', { oldURL, newURL })
    : new Event('hashchange');
  window.dispatchEvent(event);
}

// Mark the current hash as the root of this app session. A reload or a deep link
// must never inherit a previous document's in-app back depth.
export function initHistory(key = parseHash(location.hash).key) {
  const state = history.state?.[STATE_KEY];
  if (state?.session === SESSION) depth = state.depth;
  else {
    depth = 0;
    history.replaceState(stateFor(depth, key), '', location.href);
  }
  currentKey = key;
  ready = true;
}

export function go(path) {
  const nextHash = `#/${path}`;
  if (location.hash === nextHash) return;
  const oldURL = location.href;
  const next = parseHash(nextHash);
  depth += 1;
  history.pushState(stateFor(depth, next.key), '', nextHash);
  currentKey = next.key;
  emitHashChange(oldURL, location.href);
}

// Replace the current page without leaving it in the history (after paying, say).
export function replace(path) {
  const nextHash = `#/${path}`;
  if (location.hash === nextHash) return;
  const oldURL = location.href;
  const next = parseHash(nextHash);
  history.replaceState(stateFor(depth, next.key), '', nextHash);
  currentKey = next.key;
  emitHashChange(oldURL, location.href);
}

// Synchronize depth after browser back/forward or a legacy direct hash assignment.
export function noteMove(key = parseHash(location.hash).key) {
  const state = history.state?.[STATE_KEY];
  if (state?.session === SESSION && state.key === key) depth = state.depth;
  else if (state?.session === SESSION) {
    depth += 1;
    history.replaceState(stateFor(depth, key), '', location.href);
  } else {
    depth = ready ? depth + 1 : 0;
    history.replaceState(stateFor(depth, key), '', location.href);
  }
  currentKey = key;
}

// Back returns to the previous in-app page when there is one, else to a fallback.
export function back(fallback = 'trip') {
  if (depth > 0 && history.state?.[STATE_KEY]?.session === SESSION) {
    history.back();
    return;
  }
  if (currentKey !== fallback) replace(fallback);
}

export function historyDepth() {
  return depth;
}
