// InsTrip mobile — Today, the Trip tab in senior mode ("Larger text and simpler
// layout"). Three things only: the next stop, the local friend, and a button to
// take a photo. The rest of the day is one tap away.

import { t, te, esc } from './i18n.js';
import { dateShort } from './format.js';
import { clearSkyPreview } from './sky.js';
import { skyline } from './ui.js';
import { poi, dayDate, nextStop, TZ } from './plan.js';
import { openPoi } from './poi-sheet.js';
import { openCamera } from './nav.js';

export function renderToday(root, plan) {
  clearSkyPreview();
  document.documentElement.dataset.stage = 'plan';
  const { dayIndex, stop, live } = nextStop(plan);
  const day = plan.daysData[dayIndex];
  const place = stop ? poi(stop.poiId) : null;
  const heading = live
    ? dateShort(dayDate(plan, dayIndex), TZ)
    : t('senior.day', { n: dayIndex + 1 });

  root.innerHTML = `
    <section class="page page--tab page--today">
      ${skyline()}
      <h1 class="t-title">${te('nav.today')}</h1>
      <p class="t-body t-num page__sub">${esc(heading)}</p>

      <section class="card today-next" aria-labelledby="today-next-label">
        <h2 class="t-label" id="today-next-label">${te('senior.next')}</h2>
        ${place ? `
          <p class="today-next__time t-num">${esc(stop.startTime)}</p>
          <p class="t-title">${esc(place.nameEn)}</p>
          <p class="today-next__zh" lang="zh-CN">${esc(place.nameZh)}</p>
          <p class="t-body">${esc(stop.transport)}</p>
          <button class="btn btn--primary" data-stop="${day.stops.indexOf(stop)}" data-track="poi_open">${te('poi.directions')}</button>`
          : `<p class="t-body">${te('senior.none')}</p>`}
      </section>

      <div class="bookings" data-bookings hidden></div>

      <button class="btn btn--outline" data-photo>${te('senior.photo')}</button>

      <details class="whole">
        <summary class="t-heading">${te('senior.whole')}</summary>
        <ol class="whole__list">
          ${day.stops.map((s, i) => `
            <li><button class="row" data-stop="${i}">
              <span class="whole__time t-num">${esc(s.startTime)}</span>
              <span class="row__text"><strong>${esc(poi(s.poiId).nameEn)}</strong><small lang="zh-CN">${esc(poi(s.poiId).nameZh)}</small></span>
            </button></li>`).join('')}
        </ol>
      </details>
    </section>`;

  root.querySelector('.page--today').addEventListener('click', (event) => {
    if (event.target.closest('[data-photo]')) { openCamera(); return; }
    const at = event.target.closest('[data-stop]')?.dataset.stop;
    if (at == null) return;
    const s = day.stops[Number(at)];
    openPoi(poi(s.poiId), s);
  });
}
