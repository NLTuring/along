// InsTrip mobile — Trip tab, stage B: the plan (spec §6.3).
// Day tabs, a timeline per day, the rain backup, the cost and the next step.

import { t, te, esc, getLocale } from './i18n.js';
import { usd, cny, dateShort, yuanRange } from './format.js';
import { isDomestic } from './audience.js';
import { placeName, placeSubName, dayTitle, dayRainBackup, stopText } from './seed-text.js';
import { clearSkyPreview } from './sky.js';
import { openSheet, closeSheet, toast, skyline } from './ui.js';
import { icon } from './icons.js';
import { poi, dayDate, arrivalDate, stopWarning, msUntilLanding, TZ } from './plan.js';
import { openPoi } from './poi-sheet.js';
import { go } from './router.js';
import { RESTAURANTS, STAY_AREAS } from './seed-food.js';
import { mealPlan, mealStopFor, MEAL_SLOTS, MEAL_CNY, nightsFor, dayCost, getDiets, getStayTier } from './travel.js';
import { openRestaurant, restaurantName, priceText, budgetText } from './page-travel.js';

const money = (cents) => (cents === 0 ? t('plan.free') : cny(cents));
// "a, b" with the separator of the current language.
const pair = (a, b) => te('list.pair', { a, b });

function countdown(plan) {
  const ms = msUntilLanding(plan);
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  const text = hours >= 24
    ? t('plan.lands', { days: Math.floor(hours / 24), hours: hours % 24 })
    : t('plan.lands.today', { hours: Math.max(1, hours) });
  return `<p class="t-small t-num">${esc(text)}</p>`;
}

function stopHtml(plan, day, stop, index) {
  const place = poi(stop.poiId);
  const text = stopText(day, stop);
  const sub = placeSubName(place);
  const warn = stopWarning(plan, day, stop);
  const warnText = warn && (warn.kind === 'closed' ? te('plan.warn.closed') : te('plan.warn.hours', { hours: warn.hours }));
  return `
    <li class="stop">
      <p class="stop__move t-small">${esc(text.transport)}</p>
      <button class="stop__card" data-stop="${index}" data-track="poi_open" aria-label="${te('plan.stop.open', { name: placeName(place) })}">
        <span class="stop__time t-num">${esc(stop.startTime)}</span>
        <span class="stop__dot" aria-hidden="true"></span>
        <span class="stop__body">
          <strong class="t-heading">${esc(placeName(place))}</strong>
          ${sub ? `<span class="stop__zh" lang="zh-CN">${esc(sub)}</span>` : ''}
          <span class="t-body">${esc(text.note)}</span>
          <span class="t-small t-num">${pair(t('plan.duration', { min: stop.durationMin }), money(stop.costCents))}</span>
          ${warn ? `<span class="stop__warn t-small">${warnText}</span>` : ''}
        </span>
        <span class="window stop__photo${place.photo ? '' : ' is-empty'}" aria-hidden="true">
          ${place.photo ? `<img src="${esc(place.photo)}" alt="" loading="lazy" />` : ''}
        </span>
      </button>
    </li>`;
}

function dayHtml(plan, n) {
  const day = plan.daysData[n];
  if (!day) {
    return `<div class="unplanned glass glass--reeded">
      <p class="t-heading">${te('plan.unplanned', { n: n + 1 })}</p>
      <p class="t-body">${te('plan.unplanned.body')}</p>
    </div>`;
  }
  return `
    <p class="day__head"><span class="t-heading">${esc(dayTitle(day))}</span>
      <span class="t-small t-num">${pair(dateShort(dayDate(plan, n), TZ), t(`city.${day.citySlug}`))}</span></p>
    ${n === 0 ? stayHtml(plan, 0, 'travel.day.arrivalStay') : ''}
    <ol class="timeline">${day.stops.map((stop, i) => stopHtml(plan, day, stop, i)).join('')}</ol>
    ${mealsHtml(day)}
    <aside class="rain"><h2 class="t-label">${te('plan.rain')}</h2><p class="t-body t-ink">${esc(dayRainBackup(day))}</p></aside>
    ${stayHtml(plan, n + 1)}
    ${dayCostHtml(plan, n)}`;
}

// Lunch and dinner for a plan day. A meal that is already a stop (dinner in Jing'an) is named
// as such; an open one gets the restaurant that best fits the traveller's diet, nearest first.
function mealsHtml(day) {
  const diets = getDiets();
  const meals = Object.fromEntries(mealPlan(day, diets).map((meal) => [meal.slot, meal]));
  const rows = MEAL_SLOTS.map((slot) => {
    const stop = mealStopFor(day, slot);
    if (stop) return `<li class="meal meal--stop"><span class="meal__slot t-label">${te(`travel.slot.${slot}`)}</span><span class="t-body">${te('travel.day.mealStop', { place: placeName(poi(stop.poiId)) })}</span></li>`;
    const item = meals[slot]?.item;
    if (!item) return `<li class="meal"><span class="meal__slot t-label">${te(`travel.slot.${slot}`)}</span><span class="t-small">${te('travel.day.noMeal')}</span></li>`;
    const r = item.restaurant;
    const facts = [
      item.nearStop ? t('travel.day.near', { place: placeName(poi(item.nearStop)) }) : null,
      diets.length ? t(`travel.fit.${item.fit}`) : null,
      t('travel.perHead', { range: priceText(MEAL_CNY[r.tier]) }),
      meals[slot].repeat ? t('travel.day.repeat') : null,
    ].filter(Boolean);
    return `<li class="meal"><span class="meal__slot t-label">${te(`travel.slot.${slot}`)}</span>
      <button class="meal__pick" data-restaurant="${esc(r.id)}" data-track="plan_meal_open">
        <strong>${esc(restaurantName(r))}</strong>
        <span class="t-small">${esc(facts.reduce((a, b) => t('list.pair', { a, b })))}</span>
      </button></li>`;
  });
  return `<section class="meals" aria-label="${te('travel.day.eat')}">
    <h2 class="t-label">${icon('bowl', { size: 18 })}<span>${te('travel.day.eat')}</span></h2>
    <ul class="meals__list">${rows.join('')}</ul>
    <button class="btn btn--text btn--inline" data-travel>${te('travel.more')}</button>
  </section>`;
}
// The night before plan day `night` (0 = the evening you arrive). After the last planned day
// there is no night, and the page says what to do with the luggage instead.
function stayHtml(plan, night, label = 'travel.day.stay') {
  const info = nightsFor(plan).find((x) => x.night === night);
  if (!info) {
    return night === plan.daysData.length
      ? `<aside class="stay-line"><h2 class="t-label">${icon('bed', { size: 18 })}<span>${te('travel.day.stay')}</span></h2><p class="t-small">${te('travel.day.last')}</p></aside>`
      : '';
  }
  const a = info.area;
  const tier = getStayTier();
  const near = info.nearStops.map((id) => placeName(poi(id)));
  return `<aside class="stay-line">
    <h2 class="t-label">${icon('bed', { size: 18 })}<span>${te(label)}</span></h2>
    <button class="stay-line__pick" data-area="${esc(a.id)}" data-track="plan_stay_open">
      <strong>${esc(getLocale() === 'zh' ? a.nameZh : a.nameEn)}</strong>
      <span class="t-small t-num">${te('travel.stay.price', { range: priceText(a.nightlyCny[tier]) })}</span>
      ${near.length ? `<span class="t-small">${te('travel.stay.near', { places: near.reduce((x, y) => t('list.pair', { a: x, b: y })) })}</span>` : ''}
    </button>
    ${info.move ? `<p class="t-small stay-line__move">${te('travel.day.move', { city: t(`city.${info.move.to}`) })}</p>` : ''}
  </aside>`;
}
// What the day costs with meals and the night, against the traveller's daily budget.
function dayCostHtml(plan, n) {
  const tier = getStayTier();
  const cost = dayCost(plan, n, { tier, diets: getDiets() });
  if (!cost) return '';
  const parts = cost.hasNight
    ? t('travel.day.costParts', { tickets: yuanRange([cost.tickets, cost.tickets]), meals: yuanRange(cost.meals), night: yuanRange(cost.night) })
    : t('travel.day.costNoNight', { tickets: yuanRange([cost.tickets, cost.tickets]), meals: yuanRange(cost.meals) });
  const budget = cost.budgetFit ? `<p class="t-small day-cost__budget day-cost__budget--${cost.budgetFit}">${te(`travel.budget.${cost.budgetFit}`, { budget: budgetText(plan) })}</p>` : '';
  return `<aside class="day-cost">
    <p class="t-body t-ink t-num"><strong>${te('travel.day.cost', { range: priceText(cost.total) })}</strong></p>
    <p class="t-small t-num">${esc(parts)}</p>
    ${budget}
    <p class="t-small">${te('travel.day.costNote', { tier: t(`travel.stay.${tier}`) })}</p>
  </aside>`;
}

function shareText(plan) {
  const lines = [t('plan.share.text', { days: plan.days }), ''];
  plan.daysData.forEach((day, n) => {
    lines.push(`${t('plan.day', { n: n + 1 })}: ${dayTitle(day)}`);
    day.stops.forEach((stop) => lines.push(`  ${stop.startTime} ${placeName(poi(stop.poiId))}`));
  });
  return lines.join('\n');
}

async function share(plan) {
  const text = shareText(plan);
  try {
    if (window.Android?.shareText) { window.Android.shareText(text); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast(t('plan.shared'));
  } catch (error) {
    if (error?.name !== 'AbortError') console.warn('[plan] share failed:', error);
  }
}

export function renderPlan(root, plan, { onRestart }) {
  clearSkyPreview();
  document.documentElement.dataset.stage = 'plan';
  let current = 0;
  const first = arrivalDate(plan);
  const last = dayDate(plan, plan.days - 1);

  root.innerHTML = `
    <section class="page page--tab page--plan">
      ${skyline()}
      <div class="plan-head">
        <h1 class="t-title">${te('plan.title', { days: plan.days })}</h1>
        <p class="t-body t-num">${te('plan.dates', { from: dateShort(first, TZ), to: dateShort(last, TZ) })}</p>
        ${countdown(plan)}
      </div>
      <div class="bookings" data-bookings hidden></div>
      ${plan.generatedBy === 'TEMPLATE' ? `<p class="note t-small">${te('plan.sample')}</p>` : ''}
      <div class="daytabs glass glass--2" role="tablist" aria-label="${te('plan.days.label')}">
        ${Array.from({ length: plan.days }, (_, n) => `
          <button class="daytabs__tab" role="tab" id="day-tab-${n}" aria-controls="day-panel" aria-selected="${n === 0}" tabindex="${n === 0 ? 0 : -1}" data-day="${n}">${te('plan.day', { n: n + 1 })}</button>`).join('')}
      </div>
      <div class="day" id="day-panel" role="tabpanel" aria-labelledby="day-tab-0"></div>
      <div class="cost">
        <p class="t-small">${te('plan.cost')}</p>
        <p class="cost__sum t-num"><strong>${esc(cny(plan.totalCostCents))}</strong>${isDomestic() ? '' : ` <span class="t-small">${te('plan.cost.approx', { usd: usd(plan.totalCostCents) })}</span>`}</p>
      </div>
      <button class="btn btn--primary" data-friend data-track="plan_cta_friend">${te('plan.cta.friend')}</button>
      <div class="plan-actions">
        <button class="btn btn--text btn--inline" data-share>${te('plan.share')}</button>
        <button class="btn btn--text btn--inline" data-restart>${te('plan.restart')}</button>
      </div>
    </section>`;

  const panel = root.querySelector('#day-panel');
  const tabs = [...root.querySelectorAll('.daytabs__tab')];

  function showDay(n, focus = false) {
    current = Math.max(0, Math.min(plan.days - 1, n));
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === current));
      tab.tabIndex = i === current ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `day-tab-${current}`);
    panel.innerHTML = dayHtml(plan, current);
    if (focus) tabs[current].focus();
    tabs[current].scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  root.querySelector('.daytabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-day]');
    if (tab) showDay(Number(tab.dataset.day));
  });
  root.querySelector('.daytabs').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') showDay(current + 1, true);
    else if (event.key === 'ArrowLeft') showDay(current - 1, true);
  });

  // Swipe the day sideways to change day; mostly-vertical moves stay with the page scroll.
  let start = null;
  panel.addEventListener('touchstart', (event) => {
    start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  panel.addEventListener('touchend', (event) => {
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) showDay(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  panel.addEventListener('click', (event) => {
    const restaurant = RESTAURANTS.find((r) => r.id === event.target.closest('[data-restaurant]')?.dataset.restaurant);
    if (restaurant) { openRestaurant(restaurant); return; }
    const area = STAY_AREAS.find((a) => a.id === event.target.closest('[data-area]')?.dataset.area);
    if (area) { go(`travel/${area.citySlug}`); return; }
    if (event.target.closest('[data-travel]')) { go(`travel/${plan.daysData[current]?.citySlug || plan.arrival.city}`); return; }
    const card = event.target.closest('[data-stop]');
    if (!card) return;
    const stop = plan.daysData[current].stops[Number(card.dataset.stop)];
    openPoi(poi(stop.poiId), stop);
  });

  root.querySelector('[data-friend]').addEventListener('click', () => { location.hash = '#/friends'; });
  root.querySelector('[data-share]').addEventListener('click', () => share(plan));
  root.querySelector('[data-restart]').addEventListener('click', () => {
    openSheet({
      title: te('plan.restart'),
      body: `<p class="t-body sheet__note">${te('plan.restart.body')}</p>
        <button class="btn btn--danger" data-confirm>${te('plan.restart.confirm')}</button>
        <button class="btn btn--text" data-sheet-close data-autofocus>${te('plan.restart.cancel')}</button>`,
      onMount(sheet) {
        sheet.querySelector('[data-confirm]').addEventListener('click', () => {
          closeSheet();
          onRestart();
          window.scrollTo(0, 0);
        });
      },
    });
  });

  showDay(0);
}
