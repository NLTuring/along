// InsTrip mobile — Friends tab: the guide list (spec §6.5).
// Phase three: "See times" opens the friend's page. Filters are still to come.

import { t, te, esc } from './i18n.js';
import { usd, rating } from './format.js';
import { icon } from './icons.js';
import { skyline } from './ui.js';
import { go } from './router.js';
import { GUIDES } from './seed.js';
import { filterGuides } from './guide-filter.js';
import { takeFriendsFilter } from './assistant-core.js';

const FILTERS = {
  city: [
    ['all', 'guides.filter.all'],
    ['shanghai', 'city.shanghai'],
    ['nanjing', 'city.nanjing'],
  ],
  kind: [
    ['all', 'guides.filter.all'],
    ['VOLUNTEER', 'guide.kind.VOLUNTEER'],
    ['LICENSED', 'guide.kind.LICENSED'],
  ],
  topic: [
    ['all', 'guides.filter.all'],
    ['Photography', 'interest.Photography'],
    ['Food', 'interest.Food'],
    ['History', 'interest.History'],
    ['Architecture', 'guides.filter.architecture'],
  ],
};

export { filterGuides } from './guide-filter.js';

function price(guide) {
  return guide.priceHalfCents === 0
    ? te('guide.price.free')
    : te('guide.price.half', { price: usd(guide.priceHalfCents) });
}

// Kept short so three friends fit on the first screen (spec §6.5 acceptance).
function card(guide) {
  const volunteer = guide.kind === 'VOLUNTEER';
  const score = rating(guide.ratingAvg);
  return `
    <article class="card guide">
      <div class="window window--moon guide__photo">
        <img src="${esc(guide.photo)}" alt="${te('guide.photo.alt', { name: guide.name })}" width="128" height="128" />
      </div>
      <div class="guide__main">
        <div class="guide__top">
          <h2 class="t-heading">${esc(guide.name)}</h2>
          <p class="t-small guide__rating" aria-label="${te('guide.rating.label', { rating: score, count: guide.ratingCount })}">
            ${icon('star', { size: 14 })}<span class="t-num" aria-hidden="true">${te('guide.rating', { rating: score, count: guide.ratingCount })}</span>
          </p>
        </div>
        <p class="t-small guide__who">${esc(guide.headline)}</p>
        <ul class="tags">${guide.topics.map((topic) => `<li>${esc(topic)}</li>`).join('')}</ul>
      </div>
      <div class="guide__foot">
        <div class="guide__terms">
          <p class="t-ink t-num guide__price">${price(guide)}</p>
          <p class="t-small guide__kind">
            <span class="seal ${volunteer ? 'seal--volunteer' : 'seal--licensed'}">${te(`guide.kind.${guide.kind}`)}</span>
            <span>${te(`city.${guide.citySlug}`)}</span>
          </p>
        </div>
        <button class="btn btn--small" data-guide="${esc(guide.id)}" data-track="guide_open">${te('guide.times')}</button>
      </div>
    </article>`;
}

export function renderFriends(root) {
  // 小游 can hand over a one-time filter ("licensed guides in Nanjing"); it is read once and cleared.
  const filters = { city: 'all', kind: 'all', topic: 'all', ...(takeFriendsFilter() || {}) };
  root.innerHTML = `
    <section class="page page--tab page--friends">
      ${skyline()}
      <h1 class="t-title">${te('guides.title')}</h1>
      <p class="t-body page__sub">${te('guides.sub')}</p>
      <div class="guide-filters" aria-label="${te('guides.filters')}" data-filters>
        ${Object.entries(FILTERS).map(([group, options]) => `
          <div class="guide-filter" data-filter-group="${group}">
            <p class="t-label">${te(`guides.filter.${group}`)}</p>
            <div class="segmented segmented--compact" role="radiogroup" aria-label="${te(`guides.filter.${group}`)}">
              ${options.map(([value, label]) => `<button class="segmented__item${filters[group] === value ? ' is-on' : ''}" role="radio" aria-checked="${filters[group] === value}" data-filter="${group}" data-value="${esc(value)}"><span>${te(label)}</span></button>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <p class="t-small" data-count aria-live="polite"></p>
      <div class="stack" data-guides></div>
      <div class="empty" data-empty hidden>
        <div class="window window--frame empty__window" aria-hidden="true"></div>
        <h2 class="t-heading">${te('guides.filter.empty')}</h2>
        <p class="t-body">${te('guides.filter.empty.body')}</p>
        <button class="btn btn--outline" data-reset>${te('guides.filter.reset')}</button>
      </div>
      <p class="t-small legend">
        <span class="seal seal--volunteer">${te('guide.kind.VOLUNTEER')}</span>
        <span>${te('guide.volunteer.note')}</span>
      </p>
      <aside class="card card--quiet">
        <h2 class="t-heading">${te('guides.match.title')}</h2>
        <p class="t-body">${te('guides.match.body')}</p>
      </aside>
    </section>`;

  const list = root.querySelector('[data-guides]');
  const empty = root.querySelector('[data-empty]');
  const count = root.querySelector('[data-count]');

  function paint() {
    const guides = filterGuides(GUIDES, filters);
    list.innerHTML = guides.map(card).join('');
    list.hidden = guides.length === 0;
    empty.hidden = guides.length !== 0;
    count.textContent = t('guides.filter.count', { n: guides.length });
  }

  root.querySelector('[data-filters]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    const { filter, value } = button.dataset;
    filters[filter] = value;
    root.querySelectorAll(`[data-filter="${CSS.escape(filter)}"]`).forEach((item) => {
      const on = item === button;
      item.classList.toggle('is-on', on);
      item.setAttribute('aria-checked', String(on));
    });
    paint();
  });
  root.querySelector('[data-reset]').addEventListener('click', () => {
    Object.keys(filters).forEach((key) => { filters[key] = 'all'; });
    root.querySelectorAll('[data-filter]').forEach((item) => {
      const on = item.dataset.value === 'all';
      item.classList.toggle('is-on', on);
      item.setAttribute('aria-checked', String(on));
    });
    paint();
  });
  list.addEventListener('click', (event) => {
    const id = event.target.closest('[data-guide]')?.dataset.guide;
    if (id) go(`guides/${id}`);
  });
  paint();
}
