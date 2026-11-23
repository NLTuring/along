// Along — Baidu map, place search and routes. Loading the provider is explicit.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { back } from './router.js';
import { toast } from './ui.js';
import { POIS } from './seed-places.js';
import { loadBaidu, locate, toBaiduPoint, baiduDirections, geocode, MAP_MODES } from './maps.js';
import { isNativeMapAvailable, renderNativeMap } from './page-native-map.js';
import { windowPlace } from './window-scenes.js';

export function renderMap(root, poiId) {
  if (isNativeMapAvailable()) return renderNativeMap(root, poiId);
  // A trip stop, or a place shown in the Trip tab's window.
  const initial = (Object.hasOwn(POIS, poiId) ? POIS[poiId] : null) || windowPlace(poiId);
  let city = initial?.citySlug === 'nanjing' ? '南京' : '上海';
  let destination = initial ? { name: initial.nameZh, point: null } : null;
  let origin = null;
  let B = null;
  let map = null;
  let route = null;
  let marker = null;
  let search = null;
  let disposed = false;
  let request = 0;
  let routeTimer = null;

  root.innerHTML = `<section class="page page--flow page--map">
    <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('map.title')}</h1></header>
    <p class="note t-small">${te('map.privacy')}</p>
    <div class="map-actions"><button class="btn btn--primary" data-load>${te('map.load')}</button><button class="btn btn--outline" data-locate disabled>${te('map.locate')}</button></div>
    <p class="t-small" data-status role="status">${te('map.start')}</p>
    <div class="map-view card" data-map role="region" aria-label="${te('map.canvas')}"><p class="map-placeholder">${te('map.placeholder')}</p></div>
    <form class="form card map-form" data-search>
      <label class="field"><span class="t-label">${te('map.city')}</span><select class="input" name="city"><option value="上海" ${city === '上海' ? 'selected' : ''}>${te('city.shanghai')}</option><option value="南京" ${city === '南京' ? 'selected' : ''}>${te('city.nanjing')}</option></select></label>
      <label class="field"><span class="t-label">${te('map.search')}</span><input class="input" name="query" maxlength="100" placeholder="${te('map.search.placeholder')}" required /></label>
      <label class="field"><span class="t-label">${te('map.use.as')}</span><select class="input" name="target"><option value="destination">${te('map.destination')}</option><option value="origin">${te('map.origin')}</option></select></label>
      <button class="btn btn--outline" type="submit" data-search-button disabled>${te('map.search.button')}</button>
    </form>
    <div class="rows card" data-results aria-live="polite"></div>
    <label class="field"><span class="t-label">${te('map.trip.places')}</span><select class="input" data-place><option value="">${te('map.choose')}</option>${Object.values(POIS).map((p) => `<option value="${esc(p.id)}" ${p.id === poiId ? 'selected' : ''}>${esc(p.nameZh)} / ${esc(p.nameEn)}</option>`).join('')}</select></label>
    <div class="card map-route"><p class="t-body" data-origin></p><p class="t-body" data-destination></p>
      <label class="field"><span class="t-label">${te('map.mode')}</span><select class="input" data-mode>${MAP_MODES.map((mode) => `<option value="${mode}">${te(`map.mode.${mode}`)}</option>`).join('')}</select></label>
      <button class="btn btn--primary" data-route disabled>${te('map.route')}</button>
      <p class="t-body" data-summary role="status"></p><div data-instructions></div>
      <a class="btn btn--outline" data-web target="_blank" rel="noopener" hidden>${te('map.open.web')}</a>
      <button class="btn btn--text" data-native hidden>${te('map.open.app')}</button>
      <button class="btn btn--text" data-copy hidden>${te('map.copy')}</button>
      <p class="t-small">${te('map.navigation.hint')}</p>
    </div>
  </section>`;
  const status = root.querySelector('[data-status]');
  const mode = root.querySelector('[data-mode]');
  const web = root.querySelector('[data-web]');
  const summary = root.querySelector('[data-summary]');
  const results = root.querySelector('[data-results]');
  const form = root.querySelector('[data-search]');

  function paint() {
    root.querySelector('[data-origin]').textContent = t('map.origin.value', { name: origin?.name || t('map.unset') });
    root.querySelector('[data-destination]').textContent = t('map.destination.value', { name: destination?.name || t('map.unset') });
    root.querySelector('[data-route]').disabled = !map || !origin?.point || !destination?.point;
    web.hidden = !destination;
    root.querySelector('[data-native]').hidden = !destination;
    root.querySelector('[data-copy]').hidden = !destination;
    if (destination) {
      web.href = baiduDirections({ ...destination, city, origin: origin?.point, mode: mode.value });
      web.textContent = t(origin?.point ? 'map.open.web' : 'map.open.place');
    }
  }
  function clearRoute() {
    clearTimeout(routeTimer);
    route?.clearResults();
    route = null;
    summary.textContent = '';
    root.querySelector('[data-instructions]').replaceChildren();
  }
  async function setDestination(place) {
    const sequence = ++request;
    clearRoute();
    destination = { name: place.nameZh, point: null };
    city = place.citySlug === 'nanjing' ? '南京' : '上海';
    form.elements.city.value = city;
    paint();
    if (!B) return;
    status.textContent = t('map.finding');
    try {
      // Seed CRS is not verified. Resolve names with Baidu rather than guessing.
      const point = await geocode(B, place.nameZh, city);
      if (disposed || sequence !== request) return;
      destination.point = point;
      if (marker) map.removeOverlay(marker);
      const position = new B.Point(point.lng, point.lat);
      marker = new B.Marker(position);
      map.addOverlay(marker);
      map.centerAndZoom(position, 15);
      status.textContent = t('map.name.resolved');
    } catch { if (!disposed && sequence === request) status.textContent = t('map.search.failed'); }
    if (!disposed) paint();
  }

  root.querySelector('[data-load]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = t('map.loading');
    try {
      B = await loadBaidu();
      if (disposed) return;
      const host = root.querySelector('[data-map]');
      host.replaceChildren();
      map = new B.Map(host);
      map.centerAndZoom(city, 12);
      map.enableScrollWheelZoom(true);
      root.querySelector('[data-locate]').disabled = false;
      root.querySelector('[data-search-button]').disabled = false;
      button.hidden = true;
      status.textContent = t('map.ready');
      const selected = POIS[root.querySelector('[data-place]').value] || (destination?.name === initial?.nameZh ? initial : null);
      if (selected) await setDestination(selected);
      paint();
    } catch (error) {
      if (disposed) return;
      status.textContent = t(error.code === 'CONFIG_REQUIRED' ? 'map.unconfigured' : 'map.failed');
      button.disabled = false;
    }
  });
  root.querySelector('[data-locate]').addEventListener('click', async (event) => {
    const sequence = ++request;
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = t('map.locating');
    try {
      const point = await toBaiduPoint(await locate());
      if (disposed || sequence !== request) return;
      origin = { name: t('map.current'), point };
      clearRoute();
      map.centerAndZoom(new B.Point(point.lng, point.lat), 15);
      status.textContent = t('map.ready');
      paint();
    } catch { if (!disposed && sequence === request) status.textContent = t('map.location.failed'); }
    finally { if (!disposed) button.disabled = false; }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!map) return;
    const query = form.elements.query.value.trim();
    if (!query) return;
    const sequence = ++request;
    const target = form.elements.target.value;
    city = form.elements.city.value;
    search?.clearResults();
    results.replaceChildren();
    status.textContent = t('map.finding');
    search = new B.LocalSearch(city, { onSearchComplete(found) {
      if (disposed || sequence !== request) return;
      if (!found || !found.getCurrentNumPois?.()) { status.textContent = t('map.search.failed'); return; }
      status.textContent = t('map.select.result');
      for (let i = 0; i < Math.min(8, found.getCurrentNumPois()); i += 1) {
        const poi = found.getPoi(i);
        if (!poi?.point) continue;
        const button = document.createElement('button');
        button.className = 'row';
        button.textContent = `${poi.title} · ${poi.address || city}`;
        button.addEventListener('click', () => {
          const item = { name: poi.title, point: { lng: poi.point.lng, lat: poi.point.lat, crs: 'BD09' } };
          if (target === 'origin') origin = item; else destination = item;
          clearRoute();
          map.centerAndZoom(poi.point, 15);
          results.replaceChildren();
          status.textContent = t('map.ready');
          paint();
        });
        results.append(button);
      }
    } });
    search.search(query);
  });
  root.querySelector('[data-place]').addEventListener('change', (event) => {
    const place = POIS[event.target.value];
    if (place) setDestination(place);
  });
  mode.addEventListener('change', () => { ++request; clearRoute(); paint(); });
  root.querySelector('[data-route]').addEventListener('click', () => {
    if (!origin?.point || !destination?.point || !map) return;
    const sequence = ++request;
    clearRoute();
    summary.textContent = t('map.routing');
    const Constructor = { walking: B.WalkingRoute, driving: B.DrivingRoute, transit: B.TransitRoute }[mode.value];
    if (!Constructor) { summary.textContent = t('map.route.failed'); return; }
    routeTimer = setTimeout(() => {
      if (!disposed && sequence === request) { ++request; summary.textContent = t('map.route.failed'); route?.clearResults(); }
    }, 20_000);
    route = new Constructor(mode.value === 'transit' ? city : map, {
      renderOptions: { map, autoViewport: true },
      onSearchComplete(found) {
        if (disposed || sequence !== request) return;
        clearTimeout(routeTimer);
        const plan = found?.getPlan?.(0);
        if (!plan) { summary.textContent = t('map.route.failed'); return; }
        summary.textContent = `${plan.getDistance?.(true) || ''} · ${plan.getDuration?.(true) || ''}`;
      },
    });
    route.search(new B.Point(origin.point.lng, origin.point.lat), new B.Point(destination.point.lng, destination.point.lat));
  });
  root.querySelector('[data-native]').addEventListener('click', () => {
    if (!destination) return;
    const url = new URL(web.href);
    // Without a verified start, open place search and let the user choose it in Baidu.
    const uri = `baidumap://map/${origin?.point ? 'direction' : 'place/search'}?${url.searchParams}`;
    try {
      if (window.Android?.openExternal) window.Android.openExternal(uri);
      else window.location.href = uri;
      toast(t('map.app.hint'));
    } catch { toast(t('map.app.hint')); }
  });
  root.querySelector('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${city} ${destination.name}`); toast(t('map.copied')); }
    catch { toast(t('map.copy.failed')); }
  });
  root.querySelector('[data-back]').addEventListener('click', () => back('trip'));
  paint();
  return () => {
    disposed = true;
    ++request;
    clearTimeout(routeTimer);
    route?.clearResults();
    search?.clearResults();
    map?.destroy?.();
  };
}
