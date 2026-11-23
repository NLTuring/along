// Verified Android/NativePort facade only. Never mutate the frozen Android object.
const bridges = new WeakMap();
const sessions = new WeakMap();
const MAP_EVENTS = new Set(['ready', 'auth', 'consent', 'error', 'select', 'camera']);
const APERTURE_VARS = ['--native-map-x', '--native-map-y', '--native-map-width', '--native-map-height'];

// Camera defaults from the original CityTravel (Shanghai) and NanjingData.city.
// These are approximate city views, NOT geocoded destinations or navigation origins.
export const NATIVE_CITY_CENTERS = Object.freeze({
  '上海': Object.freeze({ lat: 31.236, lng: 121.480 }),
  '南京': Object.freeze({ lat: 32.0595, lng: 118.8054 }),
});

function objectFromNative(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

export function isNativeMapAvailable(win = globalThis.window) {
  return !!win && ['setMap', 'prepareExperience', 'getLocation'].every((name) => typeof win.Android?.[name] === 'function');
}

// Place search (Baidu PoiSearch) and walking routes (Baidu RoutePlanSearch) exist in the
// shell as searchCity / searchTravelRoute. Both need the map consent the load button asks for.
export function nativeSearchAvailable(win = globalThis.window) { return typeof win?.Android?.searchCity === 'function'; }
export function nativeRouteAvailable(win = globalThis.window) { return typeof win?.Android?.searchTravelRoute === 'function'; }

export function validNativePoint(point) {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
}

const coded = (code, message = '') => Object.assign(new Error(message || code), { code });
const cleanText = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

// A search result as the shell reports it: Baidu's own name and BD-09 coordinates.
export function nativePlace(value) {
  const id = cleanText(value?.id, 80), name = cleanText(value?.name, 60);
  if (!id || !name || !validNativePoint(value) || (value.lat === 0 && value.lng === 0)) return null;
  return { id, name, lat: value.lat, lng: value.lng, crs: 'BD09',
    address: cleanText(value.address, 120), district: cleanText(value.district, 40), city: cleanText(value.city, 40) };
}

export function initNativeMapBridge(win = globalThis.window) {
  if (!win) return null;
  if (bridges.has(win)) return bridges.get(win);
  const listeners = new Set();
  function dispatch(event) {
    // Capture recipients now: an event queued by a disposed page must not reach
    // a newly mounted page. Unsubscription also invalidates queued deliveries.
    const recipients = [...listeners];
    Promise.resolve().then(() => {
      for (const listener of recipients) {
        if (!listeners.has(listener)) continue;
        try { listener(event); } catch { /* one subscriber cannot break the others */ }
      }
    });
  }
  // The shell runs one place search at a time (more are refused as BUSY) and a new route
  // search replaces the one in flight, so searches queue here and only the latest route counts.
  const searches = [];
  let activeSearch = null, activeRoute = null, serial = 0;
  function pumpSearch() {
    if (activeSearch || !searches.length) return;
    const job = activeSearch = searches.shift();
    const done = (error, value) => {
      if (activeSearch !== job) return;
      win.clearTimeout(job.timer); activeSearch = null;
      if (!job.cancelled) { if (error) job.reject(error); else job.resolve(value); }
      pumpSearch();
    };
    job.done = done;
    job.timer = win.setTimeout(() => done(coded('SEARCH_TIMEOUT')), job.timeout);
    if (job.cancelled) { done(coded('CANCELLED')); return; }
    try { win.Android.searchCity(JSON.stringify({ id: job.id, city: job.city, keyword: job.keyword })); }
    catch { done(coded('SEARCH_UNAVAILABLE')); }
  }
  function finishRoute(error, value) {
    const job = activeRoute; if (!job) return;
    win.clearTimeout(job.timer); activeRoute = null;
    if (error) job.reject(error); else job.resolve(value);
  }
  const receivers = {
    search(data) {
      if (!activeSearch || data.id !== activeSearch.id) return;
      if (data.success !== true) { activeSearch.done(coded(cleanText(data.code, 40) || 'SEARCH_FAILED', cleanText(data.error, 200))); return; }
      activeSearch.done(null, { city: activeSearch.city, keyword: activeSearch.keyword,
        places: (Array.isArray(data.places) ? data.places : []).slice(0, 20).map(nativePlace).filter(Boolean) });
    },
    route(data) {
      if (!activeRoute || data.id !== activeRoute.id) return;
      if (data.success !== true) { finishRoute(coded(cleanText(data.code, 40) || 'ROUTE_FAILED', cleanText(data.error, 200))); return; }
      const path = (Array.isArray(data.path) ? data.path : []).filter(validNativePoint).map((p) => ({ lat: p.lat, lng: p.lng }));
      const legs = (Array.isArray(data.legs) ? data.legs : []).map((leg) => ({ meters: Number(leg?.distance), seconds: Number(leg?.duration) }));
      if (path.length < 2 || !legs.length || legs.some((leg) => !Number.isFinite(leg.meters) || leg.meters < 0 || !Number.isFinite(leg.seconds) || leg.seconds < 0)) { finishRoute(coded('ROUTE_INVALID')); return; }
      finishRoute(null, { path, legs, meters: legs.reduce((sum, leg) => sum + leg.meters, 0), seconds: legs.reduce((sum, leg) => sum + leg.seconds, 0) });
    },
    // Arguments the shell refuses (no consent yet, bad input) come back here, not on the callbacks above.
    result(data) {
      if (data.success !== false) return;
      if (data.action === 'searchCity' && activeSearch) activeSearch.done(coded('SEARCH_REJECTED', cleanText(data.message, 200)));
      if (data.action === 'searchTravelRoute' && activeRoute) finishRoute(coded('ROUTE_REJECTED', cleanText(data.message, 200)));
    },
  };
  for (const [name, channel] of [['onNativeMapEvent', 'map'], ['onNativeLocation', 'location'],
    ['onNativeCitySearch', 'search'], ['onNativeTravelRoute', 'route'], ['onNativeResult', 'result']]) {
    const previous = win[name];
    win[name] = function (raw, ...rest) {
      const data = objectFromNative(raw);
      if (data && receivers[channel]) { try { receivers[channel](data); } catch { /* a malformed reply settles nothing */ } }
      else if (data && (channel !== 'map' || MAP_EVENTS.has(data.type))) dispatch({ channel, data: { ...data } });
      if (typeof previous === 'function') {
        try { previous.call(this, raw, ...rest); } catch { /* preserve independent consumers */ }
      }
    };
  }
  win.addEventListener('nativeReady', () => dispatch({ channel: 'bridge', available: isNativeMapAvailable(win) }));
  const bridge = {
    available: () => isNativeMapAvailable(win),
    canSearch: () => nativeSearchAvailable(win),
    canRoute: () => nativeRouteAvailable(win),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setMap(payload) {
      if (typeof win.Android?.setMap !== 'function') return false;
      win.Android.setMap(JSON.stringify(payload));
      return true;
    },
    prepare() {
      if (!isNativeMapAvailable(win)) throw new Error('Native map unavailable');
      win.Android.prepareExperience();
    },
    locate() {
      if (!isNativeMapAvailable(win)) throw new Error('Native location unavailable');
      win.Android.getLocation();
    },
    // -> Promise<{ city, keyword, places }>; rejects with a coded error. `owner` lets a page drop its own requests.
    search(city, keyword, { timeout = 16000, owner = null } = {}) {
      const where = cleanText(city, 100), text = cleanText(keyword, 100);
      if (!nativeSearchAvailable(win)) return Promise.reject(coded('SEARCH_UNAVAILABLE'));
      if (!where || !text) return Promise.reject(coded('SEARCH_INVALID'));
      return new Promise((resolve, reject) => {
        searches.push({ id: `along-search-${++serial}`, city: where, keyword: text, timeout, owner, resolve, reject });
        pumpSearch();
      });
    },
    // -> Promise<{ path, legs, meters, seconds }> for a walking route through 2 to 20 BD-09 points.
    walkingRoute(stops, { timeout = 45000, owner = null } = {}) {
      if (!nativeRouteAvailable(win)) return Promise.reject(coded('ROUTE_UNAVAILABLE'));
      if (!Array.isArray(stops) || stops.length < 2 || stops.length > 20 || !stops.every(validNativePoint)) return Promise.reject(coded('ROUTE_INVALID'));
      finishRoute(coded('SUPERSEDED'));
      return new Promise((resolve, reject) => {
        const job = activeRoute = { id: `along-route-${++serial}`, owner, resolve, reject };
        job.timer = win.setTimeout(() => { if (activeRoute === job) finishRoute(coded('ROUTE_TIMEOUT')); }, timeout);
        try { win.Android.searchTravelRoute(JSON.stringify({ id: job.id, stops: stops.map((p) => ({ lat: p.lat, lng: p.lng })) })); }
        catch { if (activeRoute === job) finishRoute(coded('ROUTE_UNAVAILABLE')); }
      });
    },
    // A page that goes away abandons its requests; a search already in the shell keeps its slot until it answers.
    cancel(owner) {
      for (let i = searches.length - 1; i >= 0; i--) if (searches[i].owner === owner) searches.splice(i, 1)[0].reject(coded('CANCELLED'));
      if (activeSearch?.owner === owner && !activeSearch.cancelled) { activeSearch.cancelled = true; activeSearch.reject(coded('CANCELLED')); }
      if (activeRoute?.owner === owner) finishRoute(coded('CANCELLED'));
    },
  };
  bridges.set(win, bridge);
  return bridge;
}

export function nativeLocationPoint(result, requestedAt, now = Date.now()) {
  if (!result || result.success !== true || result.coordinateSystem !== 'BD09' || !validNativePoint(result)) return null;
  // Native supplies epoch milliseconds. Do not accept cached/stale or undated fixes.
  if (!Number.isFinite(result.createdAt) || result.createdAt < requestedAt - 1000 || result.createdAt > now + 5000) return null;
  if (result.accuracy != null && (!Number.isFinite(result.accuracy) || result.accuracy < 0)) return null;
  return { lat: result.lat, lng: result.lng, crs: 'BD09', createdAt: result.createdAt,
    accuracy: result.accuracy ?? null, city: typeof result.city === 'string' ? result.city : '' };
}

// CSS pixels, deliberately no devicePixelRatio multiplication. Round inward so
// the native touch rectangle cannot spill onto adjacent controls.
export function clipNativeRect(rect, bounds) {
  if (![rect?.left, rect?.top, rect?.right, rect?.bottom, bounds?.left, bounds?.top, bounds?.right, bounds?.bottom].every(Number.isFinite)) return null;
  const x = Math.ceil(Math.max(rect.left, bounds.left));
  const y = Math.ceil(Math.max(rect.top, bounds.top));
  const right = Math.floor(Math.min(rect.right, bounds.right));
  const bottom = Math.floor(Math.min(rect.bottom, bounds.bottom));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function nativeViewportRect(viewport, win, doc) {
  if (!viewport?.isConnected) return null;
  const visual = win.visualViewport;
  // The native contract has no visual-viewport scale parameter.
  if (visual && visual.scale !== 1) return null;
  const bounds = { left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0,
    right: Math.min(win.innerWidth, (visual?.offsetLeft || 0) + (visual?.width || win.innerWidth)),
    bottom: Math.min(win.innerHeight, (visual?.offsetTop || 0) + (visual?.height || win.innerHeight)) };
  let parent = viewport.parentElement;
  while (parent && parent !== doc.documentElement) {
    const style = win.getComputedStyle?.(parent);
    if (style && /hidden|clip|auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)) {
      const r = parent.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(style.overflowX)) { bounds.left = Math.max(bounds.left, r.left); bounds.right = Math.min(bounds.right, r.right); }
      if (/hidden|clip|auto|scroll/.test(style.overflowY)) { bounds.top = Math.max(bounds.top, r.top); bounds.bottom = Math.min(bounds.bottom, r.bottom); }
    }
    parent = parent.parentElement;
  }
  return clipNativeRect(viewport.getBoundingClientRect(), bounds);
}

// The shell draws a marker and the name for every entry in `pois` (names over 18 characters
// are cut there), a straight line through `route`, and the road geometry in `routePath`.
// Every coordinate must be BD-09: a fresh native fix, a native search result or a native route.
export const MAX_MAP_POIS = 60;
export const MAX_PATH_POINTS = 3000;
export function samplePath(path, budget = MAX_PATH_POINTS) {
  const points = (Array.isArray(path) ? path : []).filter(validNativePoint).map((p) => ({ lat: p.lat, lng: p.lng }));
  if (points.length <= budget || budget < 2) return points;
  return Array.from({ length: budget }, (_, i) => points[Math.round(i * (points.length - 1) / (budget - 1))]);
}
function mapPois(items) {
  const seen = new Set(), pois = [];
  for (const value of Array.isArray(items) ? items : []) {
    const id = cleanText(value?.id, 80), name = cleanText(value?.name, 40);
    if (!id || !name || seen.has(id) || !validNativePoint(value) || pois.length >= MAX_MAP_POIS) continue;
    seen.add(id);
    const poi = { id, name, lat: value.lat, lng: value.lng, category: '景点',
      rank: Number.isInteger(value.rank) && value.rank >= 0 ? value.rank : pois.length + 1 };
    if (Number.isInteger(value.routeNumber) && value.routeNumber > 0 && value.routeNumber < 100) poi.routeNumber = value.routeNumber;
    pois.push(poi);
  }
  return pois;
}

export function nativeMapPayload({ rect, center, city, zoom = 12.2, senior = false,
  pois = [], selectedIds = [], focusId = '', route = [], routePath = [], fitKey = '' }) {
  if (!validNativePoint(center) || !rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || !Number.isFinite(zoom)) throw new Error('Invalid native map geometry');
  const marks = mapPois(pois), known = new Set(marks.map((poi) => poi.id));
  const payload = { visible: true, rect: { ...rect }, center: { lat: center.lat, lng: center.lng },
    zoom: Math.max(4, Math.min(19, zoom)), city, senior: !!senior, appearance: 'light',
    topFade: 0, bottomFade: 0, pois: marks,
    selectedIds: (Array.isArray(selectedIds) ? selectedIds : []).filter((id) => known.has(id)),
    focusId: known.has(focusId) ? focusId : '',
    route: samplePath(route, 20), routePath: samplePath(routePath), categories: ['景点'] };
  // A changed fitKey asks the shell to frame the whole route once, inside this padding (CSS pixels).
  const key = cleanText(fitKey, 200);
  if (key && payload.route.length > 1 && !payload.focusId) { payload.fitKey = key; payload.fitRect = { left: 40, top: 40, right: 40, bottom: 40 }; }
  return payload;
}

export function createNativeMapSession({ viewport, city = '上海', onState = () => {}, onSelect = () => {},
  win = globalThis.window, doc = globalThis.document, bridge = initNativeMapBridge(win),
  loadingTimeout = 15000, locationTimeout = 20000 } = {}) {
  sessions.get(doc)?.dispose();
  const html = doc.documentElement;
  let disposed = false;
  let phase = bridge?.available() ? 'idle' : 'unavailable';
  let message = '';
  let code = '';
  let center = NATIVE_CITY_CENTERS[city] || NATIVE_CITY_CENTERS['上海'];
  let zoom = 12.2;
  let point = null;
  let locating = false;
  let requestedAt = 0;
  let loadTimer;
  let locationTimer;
  let frame = null;
  let lastPayload = '';
  let nativeVisible = false;
  let sentLoad = false;
  let overlay = {};
  const removers = [];
  html.dataset.nativeMap = 'active';
  const emit = () => {
    if (disposed) return;
    // Status copy can reflow the controls above the viewport. Close the old
    // native touch rectangle before changing text, then measure next frame.
    hide();
    onState({ phase, message, code, point, locating, city });
    schedule();
  };
  const clearLoad = () => { win.clearTimeout(loadTimer); loadTimer = undefined; };
  function cancelLocation() {
    win.clearTimeout(locationTimer);
    locationTimer = undefined;
    locating = false;
    requestedAt = 0;
  }
  function closeAperture() { delete html.dataset.nativeMapAperture; }
  function hide(force = false) {
    closeAperture();
    if (nativeVisible || force) {
      try { bridge?.setMap({ visible: false }); } catch { /* keep the WebView opaque even if native fails */ }
    }
    nativeVisible = false;
    lastPayload = '';
  }
  function blocked() {
    return disposed || doc.hidden || !viewport.isConnected || (html.dataset.route && html.dataset.route !== 'map')
      || doc.body.classList.contains('has-sheet') || !!doc.getElementById('overlay')?.childElementCount
      || !!doc.querySelector('[aria-modal="true"], dialog[open]');
  }
  function fail(next, data = {}) {
    clearLoad();
    cancelLocation();
    phase = next;
    message = typeof data.message === 'string' ? data.message.slice(0, 240) : '';
    code = typeof data.code === 'string' || typeof data.code === 'number' ? String(data.code).slice(0, 60) : '';
    sentLoad = false;
    hide();
    emit();
  }
  function sync() {
    frame = null;
    if (blocked() || !['loading', 'ready'].includes(phase)) { hide(); return; }
    const rect = nativeViewportRect(viewport, win, doc);
    if (!rect) { hide(); return; }
    try {
      const payload = nativeMapPayload({ ...overlay, rect, center, city, zoom, senior: html.classList.contains('senior') });
      const json = JSON.stringify(payload);
      if (json !== lastPayload) {
        sentLoad = true;
        if (!bridge.setMap(payload)) { fail('unavailable'); return; }
        lastPayload = json;
        nativeVisible = true;
      }
      if (phase === 'ready') {
        for (const [name, value] of Object.entries({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })) html.style.setProperty(`--native-map-${name}`, `${value}px`);
        html.dataset.nativeMapAperture = 'open';
      } else closeAperture();
    } catch (error) { fail('error', { message: error.message }); }
  }
  function schedule() {
    if (!disposed && frame === null) frame = win.requestAnimationFrame(sync);
  }
  function invalidate() {
    // Close the old hit region immediately; coalesce geometry updates to one frame.
    hide();
    schedule();
  }
  const unsubscribe = bridge?.subscribe(({ channel, data }) => {
    if (disposed) return;
    if (channel === 'bridge') { if (phase === 'unavailable' && bridge.available()) { phase = 'idle'; emit(); } return; }
    if (channel === 'map') {
      if (!sentLoad || !['loading', 'ready'].includes(phase)) return;
      // A tap on one of the markers this page drew.
      if (data.type === 'select') { if (phase === 'ready' && typeof data.id === 'string' && data.id) onSelect(data.id.slice(0, 80)); return; }
      if (data.type === 'auth' && data.success === false) { fail('auth', data); return; }
      if (data.type === 'consent' && data.success === false) { fail('consent', data); return; }
      if (data.type === 'error' || (data.type === 'ready' && data.success === false)) { fail('error', data); return; }
      // Auth success only confirms credentials; only ready opens the aperture.
      if (data.type === 'ready' && phase !== 'ready') { clearLoad(); phase = 'ready'; message = ''; code = ''; emit(); }
    } else if (channel === 'location' && locating && phase === 'ready') {
      if (data.success === false) {
        cancelLocation(); message = typeof data.message === 'string' ? data.message.slice(0, 240) : ''; code = 'location-failed'; emit(); return;
      }
      const fix = nativeLocationPoint(data, requestedAt, Date.now());
      if (!fix) {
        // A stale response must not settle a newer request.
        if (Number.isFinite(data.createdAt) && data.createdAt < requestedAt - 1000) return;
        cancelLocation(); message = ''; code = 'location-invalid'; emit(); return;
      }
      cancelLocation(); point = fix; center = fix; zoom = 15; message = ''; code = 'located'; schedule(); emit();
    }
  });
  function listen(target, event, handler, options) {
    target?.addEventListener(event, handler, options);
    removers.push(() => target?.removeEventListener(event, handler, options));
  }
  // A list scrolling beside the map does not move it; only scrolls of the page or of a container holding the map do.
  listen(win, 'scroll', (event) => {
    const target = event?.target;
    if (target && target !== doc && target !== win && typeof target.contains === 'function' && !target.contains(viewport)) return;
    invalidate();
  }, { passive: true, capture: true });
  listen(win, 'resize', invalidate);
  listen(win, 'orientationchange', invalidate);
  listen(win, 'pagehide', () => hide(true));
  listen(win, 'pageshow', schedule);
  listen(doc, 'visibilitychange', invalidate);
  listen(win.visualViewport, 'resize', invalidate);
  listen(win.visualViewport, 'scroll', invalidate);
  const resize = win.ResizeObserver ? new win.ResizeObserver(invalidate) : null;
  resize?.observe(viewport);
  if (viewport.parentElement) resize?.observe(viewport.parentElement);
  const mutation = win.MutationObserver ? new win.MutationObserver(invalidate) : null;
  mutation?.observe(html, { attributes: true, attributeFilter: ['data-route', 'class'] });
  mutation?.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  for (const id of ['overlay', 'app']) {
    const target = doc.getElementById(id);
    if (target) mutation?.observe(target, { childList: true });
  }
  const session = {
    load() {
      if (disposed || ['loading', 'ready'].includes(phase)) return;
      if (!bridge?.available()) { fail('unavailable'); return; }
      phase = 'loading'; code = ''; message = ''; sentLoad = false;
      emit();
      // Only this explicit click path may initiate baidu_map_consent.
      try { bridge.prepare(); } catch (error) { fail('error', { message: error.message }); return; }
      loadTimer = win.setTimeout(() => { if (!disposed && phase === 'loading') fail('timeout'); }, loadingTimeout);
      schedule();
    },
    locate() {
      if (disposed || phase !== 'ready' || locating || blocked()) return;
      locating = true; requestedAt = Date.now(); code = ''; message = '';
      emit();
      locationTimer = win.setTimeout(() => {
        if (disposed || !locating) return;
        cancelLocation(); code = 'location-timeout'; emit();
      }, locationTimeout);
      // No automatic geolocation or browser geolocation fallback.
      try { bridge.locate(); } catch (error) { cancelLocation(); code = 'location-failed'; message = error.message; emit(); }
    },
    setCity(next) {
      if (disposed || !Object.hasOwn(NATIVE_CITY_CENTERS, next)) return;
      city = next; center = NATIVE_CITY_CENTERS[next]; zoom = 12.2; point = null; overlay = {};
      cancelLocation(); code = ''; message = ''; schedule(); emit();
    },
    // Markers, names and the route line. The map itself stays where it is, so nothing is hidden first.
    setOverlay(next = {}) {
      if (disposed) return;
      overlay = { pois: next.pois, selectedIds: next.selectedIds, focusId: next.focusId, route: next.route, routePath: next.routePath, fitKey: next.fitKey };
      schedule();
    },
    view(target, nextZoom = 15) {
      if (disposed || !validNativePoint(target) || !Number.isFinite(nextZoom)) return;
      center = { lat: target.lat, lng: target.lng }; zoom = nextZoom; schedule();
    },
    search(keyword) {
      if (disposed || phase !== 'ready') return Promise.reject(coded('NOT_READY'));
      return bridge.search(city, keyword, { owner: session });
    },
    walkingRoute(stops) {
      if (disposed || phase !== 'ready') return Promise.reject(coded('NOT_READY'));
      return bridge.walkingRoute(stops, { owner: session });
    },
    canSearch: () => !!bridge?.canSearch(),
    canRoute: () => !!bridge?.canRoute(),
    refresh: invalidate,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearLoad(); cancelLocation();
      bridge?.cancel(session);
      if (frame !== null) win.cancelAnimationFrame(frame);
      unsubscribe?.();
      removers.forEach((remove) => remove());
      resize?.disconnect(); mutation?.disconnect();
      hide(true);
      if (sessions.get(doc) === session) {
        sessions.delete(doc);
        delete html.dataset.nativeMap;
        APERTURE_VARS.forEach((name) => html.style.removeProperty(name));
      }
    },
  };
  sessions.set(doc, session);
  emit();
  return session;
}
