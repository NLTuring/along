// Android map: named places, native Baidu place search and walking routes with directions.
// Every point on the map comes from Baidu itself (a search result, a route or a fresh fix).
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { back } from './router.js';
import { POIS } from './seed-places.js';
import { baiduDirections, MAP_MODES } from './maps.js';
import { createNativeMapSession, initNativeMapBridge, isNativeMapAvailable } from './native-map.js';
import { routeSteps, distanceMeters, distanceParts, durationParts } from './map-guide.js';
import { tripKeywords, createPlaceCache } from './map-places.js';
import { windowPlace } from './window-scenes.js';

export { initNativeMapBridge, isNativeMapAvailable };

const ORIGIN_ID = 'along-origin';
const MAX_RESULTS = 8;
const MAX_STEPS = 24;
const WALK_LIMIT_M = 30_000;
const NETWORK_CODES = new Set(['NETWORK_ERROR', 'NETWORK_TIME_OUT', 'ROUTE_TIMEOUT']);
const cityOf = (stop) => stop?.citySlug === 'nanjing' ? '南京' : '上海';

export function renderNativeMap(root, poiId) {
  // A trip stop, or a place shown in the Trip tab's window; either is found by name once the map is up.
  const initial = (Object.hasOwn(POIS, poiId) ? POIS[poiId] : null) || windowPlace(poiId);
  let city = cityOf(initial);
  let disposed = false, phase = 'idle', session = null;
  let origin = null;       // { id, name, lat, lng, crs, fix } — a native fix or a chosen search result
  let destination = null;  // a native search result
  let wanted = initial;    // a trip place still to be looked up by name once the map is ready
  let results = [];
  let marks = [];          // this city's trip places, where Baidu found them
  let plan = null;         // { path, meters, seconds, steps }
  let searchRun = 0, routeRun = 0, markRun = 0;
  const cache = createPlaceCache();

  root.innerHTML = `<section class="page page--flow page--native-map">
    <header class="topbar native-map-panel"><button class="icon-btn topbar__back" data-native-back aria-label="${te('native_map.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('native_map.title')}</h1></header>
    <div class="native-map-panel native-map-intro">
      <p class="t-small" data-native-privacy>${te('native_map.privacy')}</p>
      <div class="native-map-actions">
        <button class="btn btn--primary" data-native-load>${te('native_map.load')}</button>
        <button class="btn btn--outline" data-native-locate disabled>${icon('locate', { size: 20 })}<span>${te('native_map.locate')}</span></button>
        <label class="native-map-city"><span class="sr-only">${te('native_map.city')}</span><select class="input" data-native-city><option value="上海" ${city === '上海' ? 'selected' : ''}>${te('native_map.shanghai')}</option><option value="南京" ${city === '南京' ? 'selected' : ''}>${te('native_map.nanjing')}</option></select></label>
      </div>
    </div>
    <div class="native-map-viewport" data-native-viewport role="region" aria-label="${te('native_map.canvas')}"><p class="native-map-placeholder" data-native-placeholder>${te('native_map.placeholder')}</p></div>
    <div class="native-map-panel native-map-sheet" data-native-sheet>
      <p class="t-small native-map-status" data-native-status role="status" aria-live="polite"></p>
      <form class="native-map-search" data-native-search>
        <label class="field"><span class="t-label">${te('native_map.search')}</span><input class="input" name="query" type="search" enterkeyhint="search" maxlength="100" required value="${esc(initial?.nameZh || '')}" placeholder="${te('native_map.search_placeholder')}" /></label>
        <button class="btn btn--small" type="submit">${icon('search', { size: 20 })}<span>${te('native_map.search_button')}</span></button>
      </form>
      <label class="field"><span class="t-label">${te('native_map.places')}</span><select class="input" data-native-place><option value="">${te('native_map.choose')}</option>${Object.values(POIS).map((stop) => `<option value="${esc(stop.id)}" ${stop.id === poiId ? 'selected' : ''}>${esc(stop.nameZh)} / ${esc(stop.nameEn)}</option>`).join('')}</select></label>
      <p class="t-small" data-native-note role="status" aria-live="polite"></p>
      <ol class="native-map-results" data-native-results></ol>
      <section class="card native-map-route" aria-labelledby="native-map-route-title">
        <h2 class="t-heading" id="native-map-route-title">${te('native_map.steps_title')}</h2>
        <p class="t-body" data-native-origin></p>
        <p class="t-body" data-native-destination></p>
        <div class="native-map-actions">
          <button class="btn btn--primary" data-native-route disabled>${icon('route', { size: 20 })}<span>${te('native_map.route')}</span></button>
          <button class="btn btn--text" data-native-clear hidden>${te('native_map.clear_route')}</button>
        </div>
        <p class="t-body native-map-summary" data-native-summary role="status" aria-live="polite"></p>
        <ol class="native-map-steps" data-native-steps></ol>
        <p class="t-small" data-native-steps-note hidden>${te('native_map.steps_note')}</p>
        <label class="field"><span class="t-label">${te('native_map.mode')}</span><select class="input" data-native-mode>${MAP_MODES.map((mode) => `<option value="${mode}">${te(`native_map.mode_${mode}`)}</option>`).join('')}</select></label>
        <a class="btn btn--outline" data-native-external target="_blank" rel="noopener noreferrer" hidden>${te('native_map.open_place')}</a>
        <p class="t-small">${te('native_map.external_hint')}</p>
      </section>
      <p class="note t-small">${te('native_map.verify')}</p>
      <p class="t-small">${te('native_map.walk_note')}</p>
    </div>
  </section>`;
  // Four opaque fixed strips leave just one rectangular aperture. This also
  // covers gutters on tablets; no CSS mask support or existing CSS edits needed.
  const mask = document.createElement('div');
  mask.className = 'native-map-mask';
  mask.setAttribute('aria-hidden', 'true');
  mask.innerHTML = '<i class="native-map-mask__top"></i><i class="native-map-mask__left"></i><i class="native-map-mask__right"></i><i class="native-map-mask__bottom"></i>';
  document.body.append(mask);
  const find = (name) => root.querySelector(`[data-native-${name}]`);
  const load = find('load'), locate = find('locate'), status = find('status'), viewport = find('viewport');
  const placeholder = find('placeholder'), citySelect = find('city'), form = find('search'), query = form.elements.query;
  const external = find('external'), mode = find('mode'), note = find('note'), list = find('results');
  const routeButton = find('route'), clear = find('clear'), summary = find('summary'), steps = find('steps');
  const removers = [];
  function listen(node, event, handler) {
    node.addEventListener(event, handler);
    removers.push(() => node.removeEventListener(event, handler));
  }
  const ready = () => !disposed && phase === 'ready';
  const distanceText = (meters) => { const { n, unit } = distanceParts(meters); return t(`native_map.dist_${unit}`, { n }); };
  const durationText = (seconds) => { const { h, m } = durationParts(seconds); return h ? t('native_map.time_hm', { h, m }) : t('native_map.time_m', { m }); };

  function drawMap() {
    if (!session) return;
    const pois = [];
    const add = (spot, extra) => pois.push({ id: spot.id, name: spot.name, lat: spot.lat, lng: spot.lng, ...extra });
    if (origin) add(origin, { rank: 0, ...(plan ? { routeNumber: 1 } : {}) });
    if (destination) add(destination, { rank: 0, ...(plan ? { routeNumber: 2 } : {}) });
    // Search results take the map while they are listed; otherwise the trip's own places are named.
    (results.length ? results : marks).forEach((spot, index) => { if (spot.id !== origin?.id && spot.id !== destination?.id) add(spot, { rank: index + 1 }); });
    session.setOverlay({ pois, selectedIds: [origin?.id, destination?.id].filter(Boolean),
      route: plan ? [origin, destination] : [], routePath: plan ? plan.path : [],
      fitKey: plan ? `${origin.lat},${origin.lng}>${destination.lat},${destination.lng}` : '' });
  }
  function paintLinks() {
    find('origin').textContent = origin ? t('native_map.origin', { name: origin.name }) : t('native_map.origin_hint');
    find('destination').textContent = t('native_map.destination', { name: destination?.name || t('native_map.unset') });
    const name = destination?.name || query.value.trim();
    external.hidden = !name;
    if (name) {
      // Only Baidu's own points are passed on: the destination it found and a fresh native fix.
      external.href = baiduDirections({ name, city, point: destination, origin, mode: mode.value });
      external.textContent = t(origin ? 'native_map.open_directions' : 'native_map.open_place');
    }
    routeButton.disabled = !ready() || !origin || !destination || !session.canRoute();
    clear.hidden = !plan;
  }
  function paintResults() {
    list.replaceChildren();
    for (const spot of results) {
      const item = document.createElement('li');
      item.className = 'native-map-result';
      item.dataset.spot = spot.id;
      item.innerHTML = `<button class="native-map-result__main" data-go aria-pressed="${spot.id === destination?.id}"><span class="native-map-result__pin" aria-hidden="true">${icon('pin', { size: 20 })}</span><span class="native-map-result__text"><strong>${esc(spot.name)}</strong><small>${esc(spot.address || spot.district || spot.city || city)}</small></span></button><button class="btn btn--text btn--inline native-map-result__start" data-start>${te('native_map.set_origin')}</button>`;
      list.append(item);
    }
  }
  function paintPlan() {
    steps.replaceChildren();
    find('steps-note').hidden = !plan;
    if (!plan) return;
    summary.textContent = t('native_map.route_summary', { dist: distanceText(plan.meters), time: durationText(plan.seconds) });
    const shown = plan.steps.length > MAX_STEPS ? [...plan.steps.slice(0, MAX_STEPS - 1), plan.steps.at(-1)] : plan.steps;
    shown.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = `native-map-step native-map-step--${step.type.replace('_', '-')}`;
      if (plan.steps.length > MAX_STEPS && index === shown.length - 1) {
        const more = document.createElement('li');
        more.className = 'native-map-step native-map-step--more';
        more.textContent = t('native_map.steps_more', { n: plan.steps.length - MAX_STEPS });
        steps.append(more);
      }
      item.textContent = step.type === 'arrive' ? t('native_map.step_arrive', { name: destination.name })
        : step.type === 'depart' ? t('native_map.step_depart', { dir: t(`native_map.dir_${step.compass}`), dist: distanceText(step.meters) })
          : t(`native_map.step_${step.type}`, { dist: distanceText(step.meters) });
      steps.append(item);
    });
  }
  function dropPlan() {
    routeRun += 1; plan = null; summary.textContent = '';
    paintPlan();
  }

  async function planRoute() {
    if (!ready() || !origin || !destination) return;
    if (!session.canRoute()) { summary.textContent = t('native_map.route_unavailable'); return; }
    const run = ++routeRun, apart = distanceMeters(origin, destination);
    plan = null; paintPlan(); drawMap(); paintLinks();
    if (apart > WALK_LIMIT_M) { summary.textContent = t('native_map.route_far', { dist: distanceText(apart) }); return; }
    summary.textContent = t('native_map.routing');
    try {
      const found = await session.walkingRoute([origin, destination]);
      if (disposed || run !== routeRun) return;
      plan = { ...found, steps: routeSteps(found.path) };
      paintPlan();
    } catch (error) {
      if (disposed || run !== routeRun || ['CANCELLED', 'SUPERSEDED'].includes(error.code)) return;
      const reason = t(error.code === 'RESULT_NOT_FOUND' ? 'native_map.route_none' : NETWORK_CODES.has(error.code) ? 'native_map.route_network' : 'native_map.route_failed');
      // When the shell refuses the request it says why (map consent not given yet, for one); pass that on.
      summary.textContent = error.code === 'ROUTE_REJECTED' && error.message !== error.code ? `${reason} ${error.message}` : reason;
    }
    drawMap(); paintLinks();
  }
  function choose(spot, role) {
    if (!spot) return;
    if (role === 'origin') origin = { ...spot, fix: false };
    else destination = spot;
    // One place cannot be both ends of a walk.
    if (origin && destination && origin.id === destination.id) { if (role === 'origin') destination = null; else origin = null; }
    dropPlan();
    session?.view(spot, 15);
    note.textContent = t(role === 'origin' ? 'native_map.selected_origin' : 'native_map.selected_destination', { name: spot.name });
    paintResults(); drawMap(); paintLinks();
    if (origin && destination) void planRoute();
  }

  // -> the places Baidu returned for the first keyword that finds any ([] when none does);
  // null when a search could not run at all, which another keyword would not fix.
  async function lookup(keywords) {
    for (const keyword of keywords) {
      try {
        const found = await session.search(keyword);
        if (found.places.length) return found.places;
      } catch (error) {
        if (error.code !== 'RESULT_NOT_FOUND') return null;
      }
    }
    return [];
  }
  async function runSearch(text, { trip = null } = {}) {
    if (!ready()) { note.textContent = t('native_map.need_map'); load.focus(); return; }
    if (!session.canSearch()) { note.textContent = t('native_map.search_unavailable'); return; }
    const run = ++searchRun;
    results = []; paintResults();
    note.textContent = t('native_map.searching', { query: text });
    const found = await lookup(trip ? tripKeywords(trip) : [text]);
    if (disposed || run !== searchRun) return;
    if (!found) { note.textContent = t('native_map.search_failed'); drawMap(); return; }
    if (!found.length) { note.textContent = t('native_map.no_results', { query: text }); drawMap(); return; }
    results = found.slice(0, MAX_RESULTS);
    if (trip) {
      // A trip place goes straight to the best match; the rest stay listed in case it is not the one meant.
      cache.set(trip.id, results[0]);
      choose(results[0], 'destination');
      note.textContent = t('native_map.matched', { name: results[0].name });
    } else {
      note.textContent = t('native_map.results', { query: text, n: results.length });
      session.view(results[0], 14);
      paintResults(); drawMap();
    }
  }
  // Name this city's trip places on the map, one search at a time; known answers come from the phone.
  async function plotTripPlaces() {
    const run = ++markRun;
    marks = [];
    const stops = Object.values(POIS).filter((stop) => cityOf(stop) === city);
    if (!session.canSearch() || !stops.length) return;
    for (const stop of stops) {
      if (!ready() || run !== markRun) return;
      let spot = cache.get(stop.id);
      if (!spot) {
        const found = await lookup(tripKeywords(stop));
        if (!ready() || run !== markRun) return;
        if (!found) break;
        spot = found[0] || null;
        if (spot) cache.set(stop.id, spot);
      }
      if (spot && !marks.some((mark) => mark.id === spot.id)) { marks.push(spot); if (!results.length) drawMap(); }
    }
    if (ready() && run === markRun && marks.length && !results.length && !note.textContent) note.textContent = t('native_map.marks_done', { n: marks.length });
  }
  function onReady() {
    const first = wanted;
    wanted = null;
    void (async () => {
      if (first) await runSearch(first.nameZh, { trip: first });
      if (ready()) await plotTripPlaces();
    })();
  }
  function resetPlaces() {
    searchRun += 1; markRun += 1;
    results = []; marks = []; destination = null; note.textContent = '';
    if (origin && !origin.fix) origin = null;
    dropPlan(); paintResults();
  }

  session = createNativeMapSession({ viewport, city, onSelect(id) {
    if (disposed) return;
    const spot = [...results, ...marks].find((item) => item.id === id);
    if (!spot) return;
    choose(spot, 'destination');
    list.querySelector(`[data-spot="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, onState(state) {
    if (disposed) return;
    const becameReady = state.phase === 'ready' && phase !== 'ready';
    phase = state.phase;
    load.hidden = phase === 'ready';
    find('privacy').hidden = phase === 'ready';
    load.disabled = phase === 'loading' || phase === 'unavailable';
    load.textContent = t(['idle', 'unavailable'].includes(phase) ? 'native_map.load' : 'native_map.retry');
    locate.disabled = phase !== 'ready' || state.locating;
    viewport.setAttribute('aria-busy', String(phase === 'loading'));
    let key = `native_map.status_${phase}`;
    if (state.locating) key = 'native_map.status_locating';
    else if (phase === 'ready' && state.code) key = `native_map.status_${state.code.replaceAll('-', '_')}`;
    const details = [phase === 'auth' ? state.code : '', state.message].filter(Boolean).join(' · ');
    status.textContent = `${t(key)}${details ? ` ${details}` : ''}`;
    placeholder.textContent = t(phase === 'ready' ? 'native_map.paused' : phase === 'loading' ? 'native_map.status_loading' : 'native_map.placeholder');
    // A fresh native fix is the start of the walk until the traveller picks another one.
    if (state.point && (!origin || origin.fix) && (origin?.lat !== state.point.lat || origin?.lng !== state.point.lng)) {
      origin = { id: ORIGIN_ID, name: t('native_map.my_location'), lat: state.point.lat, lng: state.point.lng, crs: 'BD09', fix: true };
      dropPlan(); drawMap();
      if (destination && phase === 'ready') void planRoute();
    } else if (!state.point && origin?.fix) { origin = null; dropPlan(); drawMap(); }
    paintLinks();
    if (becameReady) onReady();
  } });

  listen(load, 'click', () => session.load());
  listen(locate, 'click', () => session.locate());
  listen(citySelect, 'change', () => {
    city = citySelect.value;
    query.value = ''; find('place').value = ''; wanted = null;
    resetPlaces();
    session.setCity(city);
    paintLinks();
    if (ready()) void plotTripPlaces();
  });
  listen(find('place'), 'change', (event) => {
    const stop = POIS[event.target.value];
    if (!stop) return;
    query.value = stop.nameZh;
    if (cityOf(stop) !== city) {
      city = cityOf(stop); citySelect.value = city;
      resetPlaces();
      session.setCity(city);
    }
    paintLinks();
    if (ready()) void runSearch(stop.nameZh, { trip: stop }).then(() => { if (ready() && !marks.length) return plotTripPlaces(); });
    else { wanted = stop; note.textContent = t('native_map.need_map'); }
  });
  listen(query, 'input', () => { find('place').value = ''; paintLinks(); });
  listen(form, 'submit', (event) => {
    event.preventDefault();
    const text = query.value.trim();
    if (!text) { query.focus(); return; }
    void runSearch(text);
  });
  listen(list, 'click', (event) => {
    const spot = results.find((item) => item.id === event.target.closest('[data-spot]')?.dataset.spot);
    if (!spot) return;
    if (event.target.closest('[data-start]')) choose(spot, 'origin');
    else if (event.target.closest('[data-go]')) choose(spot, 'destination');
  });
  listen(routeButton, 'click', () => void planRoute());
  listen(clear, 'click', () => { dropPlan(); drawMap(); paintLinks(); });
  listen(mode, 'change', paintLinks);
  listen(find('back'), 'click', () => back('trip'));
  paintLinks();
  return () => {
    if (disposed) return;
    disposed = true;
    searchRun += 1; routeRun += 1; markRun += 1;
    removers.forEach((remove) => remove());
    session.dispose();
    mask.remove();
  };
}
