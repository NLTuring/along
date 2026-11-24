// Along mobile — Food and stays (#/travel, #/travel/<city>). What the traveller avoids, the
// city's dishes worth a trip, restaurants that fit, the areas to sleep in, and what to check
// before booking. The plan page shows the same picks day by day (travel.js does the choosing);
// this page and the restaurant sheet are where the details live.

import { t, te, esc, getLocale } from './i18n.js';
import { yuanRange, usdRange, money, yuan } from './format.js';
import { isDomestic } from './audience.js';
import { icon } from './icons.js';
import { openSheet, closeSheet, toast, skyline } from './ui.js';
import { go } from './router.js';
import { CITIES } from './seed.js';
import { loadPlan, poi } from './plan.js';
import { placeName } from './seed-text.js';
import { RESTAURANTS, DIETS, ORDER_PHRASES, STAY_AREAS, STAY_TIERS, STAY_SOURCES } from './seed-food.js';
import { DIET_IDS, MEAL_CNY, cityDishes, restaurantFit, kitchenGap, getDiets, setDiets, getStayTier, setStayTier } from './travel.js';

const zh = () => getLocale() === 'zh';
// "a, b, c" with the separator of the current language.
const listOf = (items) => items.reduce((a, b) => t('list.pair', { a, b }));

// An estimate in yuan; visitors also see it in US dollars at the reference rate, in brackets so
// it does not stack a second "about" onto copy that already says "about".
export function priceText(range) {
  return isDomestic() ? yuanRange(range) : `${yuanRange(range)} (${usdRange(range)})`;
}

export const restaurantName = (r) => (zh() ? r.nameZh : r.nameEn);
const restaurantSub = (r) => (zh() ? '' : r.nameZh);
const pick = (item, key) => item[`${key}${zh() ? 'Zh' : 'En'}`] || item[`${key}En`];
const dishName = (dish) => (zh() ? dish.zh : dish.en);

// Whether something suits the traveller. With nothing chosen to avoid there is nothing to judge,
// so no badge is drawn: an "OK" on every item would read as a promise nobody checked.
function fitBadge(fit, diets) {
  return diets.length ? `<span class="fit fit--${fit}">${te(`travel.fit.${fit}`)}</span>` : '';
}

function seals(r) {
  return r.diets.map((d) => `<span class="seal seal--volunteer">${te(`travel.kitchen.${d}`)}</span>`).join('');
}

function restaurantMeta(r) {
  return listOf([
    r.chain ? t('travel.chain') : t('travel.since', { year: r.since }),
    t(`travel.price.${r.tier}`),
    t('travel.perHead', { range: priceText(MEAL_CNY[r.tier]) }),
  ]);
}

function dishRows(dishes, diets) {
  return `<ul class="dish-list">${dishes.map((dish) => `
    <li class="dish-list__item"><span><strong>${esc(dishName(dish))}</strong>${zh() ? '' : ` <span lang="zh-CN">${esc(dish.zh)}</span>`}</span>${fitBadge(dish.fit, diets)}</li>`).join('')}</ul>`;
}

// The sheet for one restaurant: everything the card shows, its dishes judged against the
// traveller's diet, the source, and the way there.
export function openRestaurant(r, diets = getDiets()) {
  const { fit, dishes } = restaurantFit(r, diets);
  const sub = restaurantSub(r);
  openSheet({
    title: esc(restaurantName(r)),
    body: `
      <div class="eat">
        ${sub ? `<p class="poi__zh" lang="zh-CN">${esc(sub)}</p>` : ''}
        ${fitBadge(fit, diets) || r.diets.length ? `<p class="eat__seals">${fitBadge(fit, diets)}${seals(r)}</p>` : ''}
        <p class="t-small t-num">${esc(restaurantMeta(r))}</p>
        <p class="t-body">${esc(pick(r, 'area'))}</p>
        ${dishRows(dishes, diets)}
        <p class="t-body t-ink">${esc(pick(r, 'tip'))}</p>
        <p class="t-small">${te('travel.source', { source: r.source })}</p>
        <div class="poi__actions">
          <button class="btn btn--primary" data-directions data-track="eat_directions">${te('poi.directions')}</button>
          <button class="btn btn--outline" data-card>${te('travel.card.open')}</button>
        </div>
      </div>`,
    onMount(panel) {
      panel.querySelector('[data-directions]').addEventListener('click', () => { closeSheet(); go(`map/${encodeURIComponent(r.id)}`); });
      panel.querySelector('[data-card]').addEventListener('click', () => openDietCard(diets));
    },
  });
}

// A card to show the staff: what the traveller cannot eat, in Chinese and large, with the
// reader's own language underneath for a visitor; then lines for ordering and asking the price.
export function openDietCard(diets = getDiets()) {
  const chosen = DIETS.filter((d) => diets.includes(d.id));
  const line = (zhText, enText) => `<li><p class="diet-card__zh" lang="zh-CN">${esc(zhText)}</p>${zh() ? '' : `<p class="diet-card__en">${esc(enText)}</p>`}</li>`;
  openSheet({
    title: te('travel.card.title'),
    body: `
      <div class="diet-card">
        ${chosen.length ? `<ul class="diet-card__list">${chosen.map((d) => line(d.cardZh, d.cardEn)).join('')}</ul>` : `<p class="t-body">${te('travel.card.empty')}</p>`}
        <h3 class="t-label">${te('travel.card.phrases')}</h3>
        <ul class="diet-card__list diet-card__list--small">${ORDER_PHRASES.map((p) => line(p.zh, p.en)).join('')}</ul>
        <button class="btn btn--primary" data-sheet-close data-autofocus>${te('common.done')}</button>
      </div>`,
  });
}

function stayCard(area, tier) {
  const near = area.near.map((id) => placeName(poi(id))).filter(Boolean);
  return `
    <article class="card stay" data-area="${esc(area.id)}">
      <div class="stay__head">
        <span class="row__icon">${icon('bed')}</span>
        <div><h3 class="t-heading">${esc(zh() ? area.nameZh : area.nameEn)}</h3>${zh() ? '' : `<p class="t-small" lang="zh-CN">${esc(area.nameZh)}</p>`}</div>
      </div>
      <p class="t-body">${esc(pick(area, 'why'))}</p>
      ${near.length ? `<p class="t-small">${te('travel.stay.near', { places: listOf(near) })}</p>` : ''}
      <p class="t-small t-num"><strong>${te('travel.stay.price', { range: priceText(area.nightlyCny[tier]) })}</strong></p>
      <p class="t-small">${esc(pick(area, 'note'))}</p>
      <button class="btn btn--outline btn--small" data-directions="${esc(area.id)}">${te('poi.directions')}</button>
    </article>`;
}

function cityOf(param) {
  if (CITIES.some((c) => c.slug === param)) return param;
  const plan = loadPlan();
  return plan?.arrival.city || 'shanghai';
}

export function renderTravel(root, param) {
  let city = cityOf(param);
  let diets = getDiets();
  let tier = getStayTier();

  root.innerHTML = `
    <section class="page page--tab page--travel">
      ${skyline()}
      <h1 class="t-title">${te('travel.title')}</h1>
      <p class="t-body page__sub">${te('travel.sub')}</p>
      <div class="segmented segmented--compact" role="radiogroup" aria-label="${te('travel.city')}" data-cities>
        ${CITIES.map((c) => `<button class="segmented__item" role="radio" data-city="${c.slug}"><span>${te(`city.${c.slug}`)}</span></button>`).join('')}
      </div>

      <section class="card form" aria-labelledby="diet-title">
        <h2 class="t-heading" id="diet-title">${te('travel.diet.title')}</h2>
        <div class="chips" data-diets>${DIET_IDS.map((d) => `
          <label class="chip"><input class="sr-only" type="checkbox" value="${d}" ${diets.includes(d) ? 'checked' : ''} /><span>${te(`travel.diet.${d}`)}</span></label>`).join('')}
        </div>
        <p class="t-small">${te('travel.diet.note')}</p>
        <button class="btn btn--outline" type="button" data-card>${te('travel.card.open')}</button>
      </section>
      <div data-gap></div>

      <h2 class="t-label section-label">${te('travel.dishes.title')}</h2>
      <div class="rows card" data-dishes></div>

      <h2 class="t-label section-label">${te('travel.restaurants.title')}</h2>
      <div class="stack" data-restaurants></div>

      <h2 class="t-label section-label">${te('travel.stay.title')}</h2>
      <div class="segmented segmented--compact" role="radiogroup" aria-label="${te('travel.stay.tier')}" data-tiers>
        ${STAY_TIERS.map((k) => `<button class="segmented__item" role="radio" data-tier="${k}"><span>${te(`travel.stay.${k}`)}</span></button>`).join('')}
      </div>
      <div class="stack" data-stays></div>
      <p class="note t-small">${te('travel.stay.estimate')}</p>
      <p class="t-small" data-stay-source></p>

      <section class="card tips" aria-labelledby="tips-title">
        <h2 class="t-heading" id="tips-title">${te('travel.tips.title')}</h2>
        <ul class="ticks">${['book', 'holiday', 'checkin', 'smoke', 'price'].map((k) => `<li>${icon('check', { size: 18 })}<span>${te(`travel.tips.${k}`)}</span></li>`).join('')}</ul>
        <p class="t-small">${te('travel.tips.sources')}</p>
      </section>
    </section>`;

  const $ = (sel) => root.querySelector(sel);

  function paintChoice(selector, attr, value) {
    root.querySelectorAll(selector).forEach((el) => {
      const on = el.dataset[attr] === value;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', String(on));
    });
  }

  function paint() {
    paintChoice('[data-city]', 'city', city);
    paintChoice('[data-tier]', 'tier', tier);
    const cityName = t(`city.${city}`);

    const gaps = kitchenGap(city, diets);
    $('[data-gap]').innerHTML = gaps.map((d) => `
      <p class="note t-small">${te('travel.gap', { city: cityName, diet: t(`travel.gap.${d}`), query: d === 'halal' ? '清真' : '素食' })}
        <button class="btn btn--text btn--inline" data-gap-map>${te('travel.gap.map')}</button></p>`).join('');

    $('[data-dishes]').innerHTML = cityDishes(city, diets).map((dish) => {
      const places = dish.at.map((id) => RESTAURANTS.find((r) => r.id === id)).filter(Boolean);
      return `<div class="row row--static dish">
        <span class="row__icon">${icon('bowl')}</span>
        <span class="row__text"><strong>${esc(dishName(dish))}</strong>${zh() ? '' : `<small lang="zh-CN">${esc(dish.zh)}</small>`}
          <small>${esc(pick(dish, 'desc'))}</small>
          <small>${places.length ? te('travel.dishes.where', { places: listOf(places.map(restaurantName)) }) : te('travel.dishes.anywhere')}</small></span>
        ${fitBadge(dish.fit, diets)}
      </div>`;
    }).join('');

    const fits = RESTAURANTS.filter((r) => r.citySlug === city).map((r) => ({ r, ...restaurantFit(r, diets) }));
    const shown = fits.filter((f) => f.fit !== 'no').sort((a, b) => (b.kitchen - a.kitchen) || ((a.fit === 'ok' ? 0 : 1) - (b.fit === 'ok' ? 0 : 1)) || a.r.tier - b.r.tier);
    $('[data-restaurants]').innerHTML = shown.length
      ? shown.map(({ r, fit }) => `
        <button class="card eat-card" data-restaurant="${esc(r.id)}" data-track="eat_open">
          <span class="eat-card__top"><strong class="t-heading">${esc(restaurantName(r))}</strong>${fitBadge(fit, diets)}</span>
          ${restaurantSub(r) ? `<span class="t-small" lang="zh-CN">${esc(restaurantSub(r))}</span>` : ''}
          ${r.diets.length ? `<span class="eat__seals">${seals(r)}</span>` : ''}
          <span class="t-small t-num">${esc(restaurantMeta(r))}</span>
          <span class="t-body">${esc(listOf(r.dishes.map(dishName)))}</span>
        </button>`).join('')
      : `<p class="note t-small">${te('travel.none')}</p>`;

    $('[data-stays]').innerHTML = STAY_AREAS.filter((a) => a.citySlug === city).map((a) => stayCard(a, tier)).join('');
    $('[data-stay-source]').textContent = t('travel.stay.source', { source: STAY_AREAS.filter((a) => a.citySlug === city).map((a) => STAY_SOURCES[a.id]).join('；') });
  }

  root.querySelector('.page--travel').addEventListener('click', (event) => {
    const cityBtn = event.target.closest('[data-city]');
    if (cityBtn) { city = cityBtn.dataset.city; paint(); return; }
    const tierBtn = event.target.closest('[data-tier]');
    if (tierBtn) {
      tier = tierBtn.dataset.tier;
      if (!setStayTier(tier)) toast(t('travel.diet.failed'));
      paint();
      return;
    }
    if (event.target.closest('[data-card]')) { openDietCard(diets); return; }
    if (event.target.closest('[data-gap-map]')) { go('map'); return; }
    const restaurant = RESTAURANTS.find((r) => r.id === event.target.closest('[data-restaurant]')?.dataset.restaurant);
    if (restaurant) { openRestaurant(restaurant, diets); return; }
    const area = event.target.closest('[data-directions]')?.dataset.directions;
    if (area) go(`map/${encodeURIComponent(area)}`);
  });
  $('[data-diets]').addEventListener('change', () => {
    diets = [...root.querySelectorAll('[data-diets] input:checked')].map((input) => input.value);
    if (!setDiets(diets)) toast(t('travel.diet.failed'));
    paint();
  });

  paint();
}

// Shared with the plan page: the daily budget in the currency it was typed in. A budget from
// before yuan were offered has only cents, and was typed in dollars.
export function budgetText(plan) {
  return Number.isSafeInteger(plan.budgetYuan) ? yuan(plan.budgetYuan) : money(plan.budgetCents);
}
