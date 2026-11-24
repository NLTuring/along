// InsTrip mobile — Today, the Trip tab in senior mode ("Larger text and simpler
// layout"). Three things only: the next stop, the local friend, and a button to
// take a photo. The rest of the day is one tap away.

import { t, te, esc } from './i18n.js';
import { dateShort } from './format.js';
import { placeName, placeSubName, stopText } from './seed-text.js';
import { clearSkyPreview } from './sky.js';
import { skyline } from './ui.js';
import { poi, dayDate, nextStop, TZ } from './plan.js';
import { openPoi } from './poi-sheet.js';
import { openCamera } from './nav.js';
import { icon } from './icons.js';
import { mealPlan, MEAL_CNY, getDiets } from './travel.js';
import { openRestaurant, restaurantName, priceText } from './page-travel.js';

export function renderToday(root, plan) {
  clearSkyPreview();
  document.documentElement.dataset.stage = 'plan';
  const { dayIndex, stop, live } = nextStop(plan);
  const day = plan.daysData[dayIndex];
  const place = stop ? poi(stop.poiId) : null;
  const sub = place ? placeSubName(place) : '';
  const heading = live
    ? dateShort(dayDate(plan, dayIndex), TZ)
    : t('senior.day', { n: dayIndex + 1 });
  // The next open meal of the day: lunch until the next stop is in the afternoon, then dinner.
  const meals = mealPlan(day, getDiets()).filter((m) => m.item);
  const meal = (stop && stop.startTime >= '15:00' ? meals.find((m) => m.slot === 'dinner') : null) || meals[0] || null;

  root.innerHTML = `
    <section class="page page--tab page--today">
      ${skyline()}
      <h1 class="t-title">${te('nav.today')}</h1>
      <p class="t-body t-num page__sub">${esc(heading)}</p>

      <section class="card today-next" aria-labelledby="today-next-label">
        <h2 class="t-label" id="today-next-label">${te('senior.next')}</h2>
        ${place ? `
          <p class="today-next__time t-num">${esc(stop.startTime)}</p>
          <p class="t-title">${esc(placeName(place))}</p>
          ${sub ? `<p class="today-next__zh" lang="zh-CN">${esc(sub)}</p>` : ''}
          <p class="t-body">${esc(stopText(day, stop).transport)}</p>
          <button class="btn btn--primary" data-stop="${day.stops.indexOf(stop)}" data-track="poi_open">${te('poi.directions')}</button>`
          : `<p class="t-body">${te('senior.none')}</p>`}
      </section>

      ${meal ? `<section class="card today-meal" aria-labelledby="today-meal-label">
        <h2 class="t-label" id="today-meal-label">${te('travel.senior.meal')}</h2>
        <p class="t-body">${te(`travel.slot.${meal.slot}`)}</p>
        <button class="row" data-restaurant="${esc(meal.item.restaurant.id)}">
          <span class="row__icon">${icon('bowl')}</span>
          <span class="row__text"><strong>${esc(restaurantName(meal.item.restaurant))}</strong><small>${te('travel.perHead', { range: priceText(MEAL_CNY[meal.item.restaurant.tier]) })}</small></span>
        </button>
      </section>` : ''}

      <div class="bookings" data-bookings hidden></div>

      <button class="btn btn--outline" data-photo>${te('senior.photo')}</button>

      <details class="whole">
        <summary class="t-heading">${te('senior.whole')}</summary>
        <ol class="whole__list">
          ${day.stops.map((s, i) => `
            <li><button class="row" data-stop="${i}">
              <span class="whole__time t-num">${esc(s.startTime)}</span>
              <span class="row__text"><strong>${esc(placeName(poi(s.poiId)))}</strong>${placeSubName(poi(s.poiId)) ? `<small lang="zh-CN">${esc(placeSubName(poi(s.poiId)))}</small>` : ''}</span>
            </button></li>`).join('')}
        </ol>
      </details>
    </section>`;

  root.querySelector('.page--today').addEventListener('click', (event) => {
    if (event.target.closest('[data-photo]')) { openCamera(); return; }
    if (event.target.closest('[data-restaurant]') && meal) { openRestaurant(meal.item.restaurant); return; }
    const at = event.target.closest('[data-stop]')?.dataset.stop;
    if (at == null) return;
    const s = day.stops[Number(at)];
    openPoi(poi(s.poiId), s);
  });
}
