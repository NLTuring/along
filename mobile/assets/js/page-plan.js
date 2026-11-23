// InsTrip mobile — Trip tab, stage B: the plan (spec §6.3).
// Day tabs, a timeline per day, the rain backup, the cost and the next step.

import { t, te, esc } from './i18n.js';
import { usd, cny, dateShort } from './format.js';
import { clearSkyPreview } from './sky.js';
import { openSheet, closeSheet, toast, skyline } from './ui.js';
import { icon } from './icons.js';
import { poi, dayDate, arrivalDate, stopWarning, msUntilLanding, TZ } from './plan.js';
import { openPoi } from './poi-sheet.js';

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
  const warn = stopWarning(plan, day, stop);
  const warnText = warn && (warn.kind === 'closed' ? te('plan.warn.closed') : te('plan.warn.hours', { hours: warn.hours }));
  return `
    <li class="stop">
      <p class="stop__move t-small">${esc(stop.transport)}</p>
      <button class="stop__card" data-stop="${index}" data-track="poi_open" aria-label="${te('plan.stop.open', { name: place.nameEn })}">
        <span class="stop__time t-num">${esc(stop.startTime)}</span>
        <span class="stop__dot" aria-hidden="true"></span>
        <span class="stop__body">
          <strong class="t-heading">${esc(place.nameEn)}</strong>
          <span class="stop__zh" lang="zh-CN">${esc(place.nameZh)}</span>
          <span class="t-body">${esc(stop.note)}</span>
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
    <p class="day__head"><span class="t-heading">${esc(day.title)}</span>
      <span class="t-small t-num">${pair(dateShort(dayDate(plan, n), TZ), t(`city.${day.citySlug}`))}</span></p>
    <ol class="timeline">${day.stops.map((stop, i) => stopHtml(plan, day, stop, i)).join('')}</ol>
    <aside class="rain"><h2 class="t-label">${te('plan.rain')}</h2><p class="t-body t-ink">${esc(day.rainBackup)}</p></aside>`;
}

function shareText(plan) {
  const lines = [t('plan.share.text', { days: plan.days }), ''];
  plan.daysData.forEach((day, n) => {
    lines.push(`${t('plan.day', { n: n + 1 })}: ${day.title}`);
    day.stops.forEach((stop) => lines.push(`  ${stop.startTime} ${poi(stop.poiId).nameEn}`));
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
        <p class="cost__sum t-num"><strong>${esc(cny(plan.totalCostCents))}</strong> <span class="t-small">${te('plan.cost.approx', { usd: usd(plan.totalCostCents) })}</span></p>
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
