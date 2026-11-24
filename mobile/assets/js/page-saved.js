// InsTrip mobile — places saved from the plan and place sheets.
// This is local browsing data, so it stays available before and after sign-in.

import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { skyline } from './ui.js';
import { go } from './router.js';
import { poi } from './plan.js';
import { openPoi } from './poi-sheet.js';
import { listSaved } from './saved.js';
import { placeName, placeSubName } from './seed-text.js';

function row(place) {
  return `<button class="row" data-poi="${esc(place.id)}" data-track="saved_open">
    <span class="row__icon">${icon('heart')}</span>
    <span class="row__text"><strong>${esc(placeName(place))}</strong>${placeSubName(place) ? `<small lang="zh-CN">${esc(placeSubName(place))}</small>` : ''}<small>${esc(t('list.pair', { a: t(`city.${place.citySlug}`), b: t(`category.${place.category}`) }))}</small></span>
    ${icon('chevron', { size: 20 })}
  </button>`;
}

export function renderSaved(root) {
  const places = listSaved().map((id) => poi(id)).filter(Boolean);
  root.innerHTML = `
    <section class="page page--tab page--saved">
      ${skyline()}
      <h1 class="t-title">${te('saved.title')}</h1>
      <p class="t-body page__sub">${te('saved.sub')}</p>
      ${places.length
        ? `<div class="rows card" data-saved>${places.map(row).join('')}</div>`
        : `<div class="empty">
            <div class="window window--frame empty__window" aria-hidden="true"></div>
            <h2 class="t-heading">${te('saved.empty')}</h2>
            <p class="t-body">${te('saved.empty.body')}</p>
            <button class="btn btn--primary" data-trip>${te('saved.empty.cta')}</button>
          </div>`}
    </section>`;

  root.querySelector('[data-trip]')?.addEventListener('click', () => go('trip'));
  root.querySelector('[data-saved]')?.addEventListener('click', (event) => {
    const id = event.target.closest('[data-poi]')?.dataset.poi;
    const place = id ? poi(id) : null;
    if (place) openPoi(place);
  });
}
