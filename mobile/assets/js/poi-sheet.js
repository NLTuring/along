// InsTrip mobile — the place sheet (spec §6.4): why go, how long, how much, how to get there.
// Opens over the plan without leaving the page.

import { t, te, esc } from './i18n.js';
import { cny, usd } from './format.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { go } from './router.js';
import { isSaved, toggleSaved } from './saved.js';

function hoursText(place) {
  const parts = Object.entries(place.hours || {}).map(([key, value]) => {
    if (value === 'closed') return `${t(`hours.${key}`)} ${t('hours.closed')}`;
    if (value === '00:00-24:00') return t('hours.allday');
    return `${t(`hours.${key}`)} ${value.replace('-', '–')}`;
  });
  return parts.reduce((a, b) => t('list.pair', { a, b }));
}

// A full-screen card with the place name in large Chinese characters, to hold up
// to a taxi driver. Tap anywhere, or press Escape, to go back.
function showToDriver(place, opener) {
  const card = document.createElement('button');
  card.className = 'driver';
  card.setAttribute('aria-label', `${place.nameZh}. ${t('poi.driver.hint')}`);
  card.innerHTML = `
    <span class="driver__zh" lang="zh-CN">${esc(place.nameZh)}</span>
    <span class="driver__en">${esc(place.nameEn)}</span>
    <span class="driver__hint">${te('poi.driver.hint')}</span>`;

  const onKey = (event) => {
    // Runs before the sheet's own key handling so Escape closes only this card.
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); }
  };
  function close() {
    document.removeEventListener('keydown', onKey, true);
    card.remove();
    if (opener?.isConnected) opener.focus();
  }
  card.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.getElementById('overlay').append(card);
  card.focus();
}

export function openPoi(place, stop = null) {
  const price = place.priceCents === 0
    ? te('plan.free')
    : `${esc(cny(place.priceCents))} <span class="t-small">${te('plan.cost.approx', { usd: usd(place.priceCents) })}</span>`;
  const minutes = stop?.durationMin ?? place.durationMin;

  openSheet({
    title: esc(place.nameEn),
    body: `
      <div class="poi">
        ${place.photo
          ? `<figure class="poi__photo"><img src="${esc(place.photo)}" alt="${esc(place.nameEn)}" />
               ${place.photoCredit ? `<figcaption class="t-label">${te('poi.credit', { credit: place.photoCredit })}</figcaption>` : ''}</figure>`
          : ''}
        <p class="poi__zh" lang="zh-CN">${esc(place.nameZh)}</p>
        <p class="t-small">${te('list.pair', { a: t(`category.${place.category}`), b: t(`city.${place.citySlug}`) })}</p>
        <dl class="facts">
          <div><dt class="t-label">${te('poi.stay')}</dt><dd class="t-num">${te('plan.duration', { min: minutes })}</dd></div>
          <div><dt class="t-label">${te('poi.price')}</dt><dd class="t-num">${price}</dd></div>
          <div class="facts__wide"><dt class="t-label">${te('poi.hours')}</dt><dd class="t-num">${esc(hoursText(place))}</dd></div>
        </dl>
        <p class="t-body t-ink">${esc(place.descriptionEn)}</p>
        <div class="poi__actions">
          <button class="btn btn--primary" data-directions data-track="poi_directions">${te('poi.directions')}</button>
          <button class="btn ${isSaved(place.id) ? 'btn--primary' : 'btn--outline'}" data-save aria-pressed="${isSaved(place.id)}" data-track="poi_save">${te(isSaved(place.id) ? 'saved.saved' : 'saved.save')}</button>
          <button class="btn btn--outline" data-driver>${te('poi.driver')}</button>
        </div>
      </div>`,
    onMount(panel) {
      panel.querySelector('[data-directions]').addEventListener('click', () => { closeSheet(); go(`map/${encodeURIComponent(place.id)}`); });
      const save = panel.querySelector('[data-save]');
      save.addEventListener('click', () => {
        const saved = toggleSaved(place.id);
        save.classList.toggle('btn--primary', saved);
        save.classList.toggle('btn--outline', !saved);
        save.setAttribute('aria-pressed', String(saved));
        save.textContent = t(saved ? 'saved.saved' : 'saved.save');
        toast(t(saved ? 'saved.added' : 'saved.removed'));
      });
      const driver = panel.querySelector('[data-driver]');
      driver.addEventListener('click', () => showToDriver(place, driver));
    },
  });
}
