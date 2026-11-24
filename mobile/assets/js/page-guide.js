// InsTrip mobile — a local friend's page (spec §6.6): who they are, when they
// are free, what it costs, and the button that books the chosen time.

import { t, te, esc } from './i18n.js';
import { money, rating, dateShort } from './format.js';
import { guideText } from './seed-text.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { go, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { guide, slotsFor, createBooking, SERVICE_FEE_CENTS } from './bookings.js';
import { TZ } from './plan.js';

const PICK_KEY = 'instrip.slot';

// The chosen time survives signing in (spec §6.6: come back with the choice kept).
function storedPick(guideId) {
  try {
    const pick = JSON.parse(sessionStorage.getItem(PICK_KEY) || 'null');
    return pick && pick.guideId === guideId ? pick.slotId : null;
  } catch {
    return null;
  }
}

function storePick(guideId, slotId) {
  try {
    if (slotId) sessionStorage.setItem(PICK_KEY, JSON.stringify({ guideId, slotId }));
    else sessionStorage.removeItem(PICK_KEY);
  } catch {
    /* the choice just does not survive a reload */
  }
}

const slotDay = (slot) => dateShort(new Date(slot.startsAt), TZ);
// "a, b, c" with the separator of the current language.
const listOf = (items) => items.reduce((a, b) => t('list.pair', { a, b }));

function slotsHtml(slots, selected) {
  if (!slots.length) return `<p class="t-body">${te('guide.noslots')}</p>`;
  const days = new Map();
  slots.forEach((slot) => {
    const key = slotDay(slot);
    days.set(key, [...(days.get(key) || []), slot]);
  });
  return [...days].map(([day, list]) => `
    <div class="slot-day">
      <p class="t-small t-num">${esc(day)}</p>
      <div class="slots">${list.map((slot) => `
        <button class="slot" data-slot="${esc(slot.id)}" aria-pressed="${slot.id === selected}" ${slot.taken ? 'disabled' : ''} data-track="guide_slot_select">
          <span class="t-num">${te(slot.taken ? 'guide.slot.taken' : 'guide.slot', { time: slot.time })}</span>
        </button>`).join('')}
      </div>
    </div>`).join('');
}

export function renderGuide(root, guideId) {
  const g = guideText(guide(guideId)); // name, headline, topics and bio in the reader's language
  if (!g) {
    root.innerHTML = `
      <section class="page page--tab">
        <h1 class="t-title">${te('guide.notfound')}</h1>
        <button class="btn btn--primary" data-all>${te('guide.all')}</button>
      </section>`;
    root.querySelector('[data-all]').addEventListener('click', () => go('friends'));
    return;
  }

  const volunteer = g.kind === 'VOLUNTEER';
  const active = g.status === 'ACTIVE';
  let slots = active ? slotsFor(g.id) : [];
  let selected = storedPick(g.id);
  if (!slots.some((s) => s.id === selected && !s.taken)) selected = null;
  const fee = money(SERVICE_FEE_CENTS);
  const score = rating(g.ratingAvg);

  root.innerHTML = `
    <section class="page page--guide">
      <header class="topbar">
        <button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button>
      </header>
      <div class="window window--moon guide-hero">
        <img src="${esc(g.photo)}" alt="${te('guide.photo.alt', { name: g.name })}" />
      </div>
      <div class="guide-id">
        <h1 class="t-title">${esc(g.name)}</h1>
        <span class="seal ${volunteer ? 'seal--volunteer' : 'seal--licensed'}">${te(`guide.kind.${g.kind}`)}</span>
      </div>
      <p class="t-body">${esc(g.headline)}</p>
      <p class="t-small guide__rating" aria-label="${te('guide.rating.label', { rating: score, count: g.ratingCount })}">
        ${icon('star', { size: 14 })}<span class="t-num" aria-hidden="true">${te('guide.rating', { rating: score, count: g.ratingCount })}</span>
        <span aria-hidden="true">${te(`city.${g.citySlug}`)}</span>
      </p>
      ${volunteer ? `<p class="note t-small">${te('guide.volunteer.note')}</p>` : ''}
      <p class="t-body t-ink guide-bio">${esc(g.bio)}</p>

      <dl class="facts">
        <div><dt class="t-label">${te('guide.speaks')}</dt><dd>${esc(listOf(g.languages.map((code) => t(`lang.name.${code}`))))}</dd></div>
        <div><dt class="t-label">${te('guide.goodat')}</dt><dd>${esc(listOf(g.topics))}</dd></div>
      </dl>

      <section class="block">
        <h2 class="t-heading">${te('guide.when')}</h2>
        ${active
          ? `<div id="slots">${slotsHtml(slots, selected)}</div>${g.instantBook ? `<p class="t-small">${te('guide.instant')}</p>` : ''}`
          : `<p class="t-body">${te('guide.paused')}</p>`}
      </section>

      <section class="block">
        <h2 class="t-heading">${te('guide.reviews')}</h2>
        <p class="t-body">${te('guide.reviews.none')}</p>
      </section>

      <details class="block safety">
        <summary class="t-heading">${te('guide.safety')}</summary>
        <ul class="ticks">${[1, 2, 3, 4].map((n) => `<li>${icon('check', { size: 18 })}<span>${te(`guide.safety.${n}`)}</span></li>`).join('')}</ul>
      </details>
    </section>

    <div class="bookbar glass glass--2">
      <p class="t-small t-num bookbar__price">${volunteer ? te('guide.fee.free', { fee }) : te('guide.fee', { price: money(g.priceHalfCents), fee })}</p>
      <button class="btn btn--primary" data-book data-track="guide_book_click"></button>
    </div>`;

  const bookBtn = root.querySelector('[data-book]');
  const slotsEl = root.querySelector('#slots');
  const canBook = () => active && slots.some((s) => !s.taken);

  function paintButton() {
    if (!canBook()) {
      bookBtn.disabled = false;
      bookBtn.textContent = t('guide.message');
      return;
    }
    const slot = slots.find((s) => s.id === selected);
    bookBtn.disabled = !slot;
    bookBtn.textContent = slot
      ? t('guide.book', { slot: t('list.pair', { a: slotDay(slot), b: slot.time }) })
      : t('guide.pick');
  }

  function book() {
    if (!canBook()) { go('support'); return; }
    const session = getSession();
    if (!session) { openLogin({ onDone: book }); return; }
    const result = createBooking({ guideId: g.id, slotId: selected, email: session.email });
    if (!result.ok) {
      toast(t(`error.${result.error}`));
      if (result.error === 'STORAGE') return;
      selected = null;
      storePick(g.id, null);
      slots = slotsFor(g.id);
      if (slotsEl.isConnected) slotsEl.innerHTML = slotsHtml(slots, selected);
      paintButton();
      return;
    }
    storePick(g.id, null);
    go(`checkout/${result.booking.id}`);
  }

  slotsEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-slot]');
    if (!btn || btn.disabled) return;
    selected = btn.dataset.slot === selected ? null : btn.dataset.slot;
    storePick(g.id, selected);
    slotsEl.querySelectorAll('[data-slot]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.slot === selected)));
    paintButton();
  });
  bookBtn.addEventListener('click', book);
  root.querySelector('[data-back]').addEventListener('click', () => back('friends'));

  paintButton();
}
