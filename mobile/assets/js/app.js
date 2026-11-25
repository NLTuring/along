// InsTrip mobile — entry point: settings, language, sky, routing.

import { initI18n, onLocaleChange, t } from './i18n.js';
import { prefersChinese } from './audience.js';
import { time24 } from './format.js';
import { startSky, clearSkyPreview, onSkyTick } from './sky.js';
import { initSettings, closeSheet, sheetIsOpen, onSettingsChange } from './ui.js';
import { initNav, renderNav, setCurrentTab, initNativePhotos } from './nav.js';
import { parseHash, go, noteMove, initHistory } from './router.js';
import { initSession, onSessionChange } from './auth.js';
import { initApi } from './api.js';
import { renderMap } from './page-map.js';
import { initNativeMapBridge, isNativeMapAvailable } from './page-native-map.js';
import { renderPost } from './page-post.js';
import { renderMakeOrder } from './page-make-order.js';
import { renderMakeOrders } from './page-make-orders.js';
import { renderTrip } from './page-trip.js';
import { renderFriends } from './page-friends.js';
import { renderStories } from './page-stories.js';
import { renderYou } from './page-you.js';
import { renderOrders } from './page-orders.js';
import { renderLibrary } from './page-library.js';
import { renderSaved } from './page-saved.js';
import { renderTravel } from './page-travel.js';
import { renderGuide } from './page-guide.js';
import { renderCheckout } from './page-checkout.js';
import { renderMessages } from './page-messages.js';
import { renderSupport } from './page-support.js';
import { renderStudio } from './page-studio.js';
import { renderFilm } from './page-film.js';
import { renderCraft } from './page-craft.js';
import { renderCrafts } from './page-crafts.js';
import { renderApply } from './page-apply.js';
import { renderExample } from './page-example.js';
import { renderDm } from './page-dm.js';
import { renderSocial } from './page-social.js';
import { renderWallet } from './page-wallet.js';
import { renderProfile } from './page-profile.js';
import { renderWorkshop } from './page-workshop.js';
import { renderPoints } from './page-points.js';
import { renderBeads } from './page-beads.js';
import { renderClay } from './page-clay.js';
import { renderGallery } from './page-gallery.js';
import { renderAvatar } from './page-avatar.js';
import { maybeWelcome } from './welcome.js';
import { initAssistant, assistantRoute } from './assistant.js';

const PAGES = {
  trip: renderTrip,
  friends: renderFriends,
  stories: renderStories,
  you: renderYou,
  orders: renderOrders,
  library: renderLibrary,
  saved: renderSaved,
  travel: renderTravel,
  guide: renderGuide,
  checkout: renderCheckout,
  messages: renderMessages,
  support: renderSupport,
  studio: renderStudio,
  film: renderFilm,
  craft: renderCraft,
  crafts: renderCrafts,
  apply: renderApply,
  map: renderMap,
  post: renderPost,
  'make-order': renderMakeOrder,
  'make-orders': renderMakeOrders,
  example: renderExample,
  dm: renderDm,
  social: renderSocial,
  wallet: renderWallet,
  profile: renderProfile,
  workshop: renderWorkshop,
  points: renderPoints,
  beads: renderBeads,
  clay: renderClay,
  gallery: renderGallery,
  avatar: renderAvatar,
};

const DESTINATION_TZ = 'Asia/Shanghai';
const app = document.getElementById('app');
let route = null;
let cleanup = null; // a page may return a function to stop its timers when it is left

// The skyline strip on tab pages shows the destination's local time.
function paintSkyline() {
  const el = app.querySelector('[data-sky-now]');
  if (!el) return;
  el.textContent = t('sky.now', { city: t('city.shanghai'), time: time24(new Date(), DESTINATION_TZ) });
}

function show(next, { focus = true, keepScroll = false } = {}) {
  if (typeof cleanup === 'function') cleanup();
  route = next;
  const root = document.documentElement;
  // Only the arrival form previews a chosen hour; every other page shows the live sky.
  if (next.name !== 'trip') {
    clearSkyPreview();
    delete root.dataset.stage; // the Trip tab sets its own stage
  }
  root.dataset.route = next.name;
  root.dataset.nav = next.nav ? 'shown' : 'hidden';
  cleanup = PAGES[next.name](app, next.param) || null;
  paintSkyline();
  setCurrentTab(next.tab, next.name);
  if (document.documentElement.dataset.ready) assistantRoute(next);
  if (!keepScroll) window.scrollTo(0, 0);
  if (focus) app.focus({ preventScroll: true });
}

function navigate(tab) {
  if (route.name === tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  go(tab);
}

// The nav pill shrinks to just the lens while reading down the page and comes
// back on the way up. Senior mode keeps the full bar at all times (senior.css).
function watchScroll() {
  let last = window.scrollY;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const nav = document.querySelector('.nav');
      if (!nav) return;
      const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 24;
      if (y > last + 6 && y > 80 && !atEnd) nav.classList.add('is-compact');
      else if (y < last - 6 || y <= 80 || atEnd) nav.classList.remove('is-compact');
      last = y;
    });
  }, { passive: true });
}

// A thin banner while the phone has no connection (spec §5.4). Everything in this
// build is stored on the phone, so the pages keep working; the banner says so.
function watchConnection() {
  const paint = () => {
    let bar = document.getElementById('offline');
    if (navigator.onLine) { bar?.remove(); return; }
    if (bar) return;
    bar = document.createElement('p');
    bar.id = 'offline';
    bar.className = 'offline glass glass--3';
    bar.setAttribute('role', 'status');
    bar.textContent = t('offline.banner');
    document.body.append(bar);
  };
  window.addEventListener('online', paint);
  window.addEventListener('offline', paint);
  onLocaleChange(() => {
    const bar = document.getElementById('offline');
    if (bar) bar.textContent = t('offline.banner');
  });
  paint();
}

// Keep unused legacy callbacks harmless. The map adapter installs its own: map events,
// location, place search, walking routes and the shell's refusals (onNativeResult).
function quietNativeShell() {
  const unused = ['onNativeConfig', 'onNativeInvite', 'onNativeExperience', 'onNativeTripImported'];
  for (const name of unused) {
    if (typeof window[name] !== 'function') window[name] = () => {};
  }
  try {
    if (route?.name !== 'map') window.Android?.setMap?.(JSON.stringify({ visible: false }));
  } catch {
    /* a shell without a map layer */
  }
}

async function start() {
  initNativeMapBridge();
  window.addEventListener('nativeReady', () => {
    initNativeMapBridge();
    quietNativeShell();
    if (route?.name === 'map' && isNativeMapAvailable() && document.documentElement.dataset.nativeMap !== 'active') {
      show(route, { focus: false, keepScroll: true });
    }
  });
  initSettings();
  await Promise.all([initI18n(), initApi()]);
  await initSession();
  startSky({ timeZone: DESTINATION_TZ });
  onSkyTick(paintSkyline);

  const first = parseHash(location.hash);
  initHistory(first.key);
  initNav(navigate);
  renderNav(first.tab);
  show(first, { focus: false });

  const handleLocationChange = () => {
    if (sheetIsOpen()) closeSheet();
    const next = parseHash(location.hash);
    if (next.key === route.key) return;
    noteMove(next.key);
    show(next);
  };
  window.addEventListener('hashchange', handleLocationChange);
  window.addEventListener('popstate', handleLocationChange);

  // Language and sign-in state both change what the current page says: redraw it in place.
  const redraw = () => {
    renderNav(route.tab);
    show(route, { focus: false, keepScroll: true });
  };
  onLocaleChange(redraw);
  onSessionChange(redraw);
  // Senior mode changes the navigation and the Trip tab's layout. The You page also redraws
  // for the assistant switch (its own listener handles the floating button).
  onSettingsChange((key) => { if (key === 'senior') redraw(); });

  initNativePhotos();
  quietNativeShell();
  watchConnection();

  // The Trip tab redraws itself when a plan is built or removed.
  document.addEventListener('instrip:rendered', paintSkyline);

  watchScroll();
  // 小游 is created before the welcome overlay so the overlay can make it inert too.
  initAssistant();
  assistantRoute(route);
  document.documentElement.dataset.ready = 'true';
  maybeWelcome();
}

start().catch((error) => {
  console.error('[app] failed to start:', error);
  // The copy files may be what failed to load, so this one line is written out here.
  app.textContent = prefersChinese() ? '一起游未能启动，请关闭后重新打开。' : 'Along could not start. Close the app and open it again.';
});
