// InsTrip mobile — the booking card on the Trip tab (spec §6.8): who you are
// meeting and when, the booking's stamp, and the next thing to do about it.

import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { go } from './router.js';
import { getSession } from './auth.js';
import { guide, listBookings, cancelBooking, canCancel, refundPercent } from './bookings.js';
import { stampHtml, duration, bookingDay } from './booking-ui.js';

const DAY_MS = 86_400_000;

function cardHtml(b, now, { details = false } = {}) {
  const g = guide(b.guideId);
  const open = b.status === 'REQUESTED' || b.status === 'CONFIRMED';
  const live = b.status === 'PAID' || b.status === 'IN_PROGRESS';
  const waiting = b.status === 'REQUESTED'
    ? `<p class="t-small t-num">${te('checkout.waiting', { name: g.name, time: duration(b.expiresAt - now) })}</p>`
    : b.status === 'CONFIRMED'
      ? `<p class="t-small t-num">${te('checkout.payby', { time: duration(b.payBy - now) })}</p>`
      : '';
  return `
    <article class="card booking${open || live ? '' : ' is-void'}" data-booking="${esc(b.id)}">
      <div class="booking__top">
        <div class="window window--moon booking__photo"><img src="${esc(g.photo)}" alt="" /></div>
        <div class="booking__who">
          <p class="t-heading">${esc(g.name)}</p>
          <p class="t-body t-num">${te('trip.meets', { date: bookingDay(b), time: b.time })}</p>
        </div>
        ${stampHtml(b.status)}
      </div>
      ${waiting}
      ${open ? `<button class="btn btn--primary" data-act="pay">${te('trip.pay')}</button>` : ''}
      ${details ? `<button class="btn btn--text" data-act="details">${te('trip.details')}</button>` : ''}
      ${live ? `<button class="btn btn--primary" data-act="message" data-track="trip_chat_open">${icon('message', { size: 20 })}<span>${te('trip.message')}</span></button>` : ''}
      ${canCancel(b) ? `<button class="btn btn--text" data-act="cancel" data-track="trip_cancel">${te('trip.cancel')}</button>` : ''}
    </article>`;
}

function confirmCancel(b, onChange) {
  const charged = b.order && b.order.provider !== 'CASH';
  // A demo card payment charged nothing, so nothing is refunded; the policy share is shown for reference.
  const line = b.order?.mode === 'DEMO' ? te('pay.cancel.demo', { percent: refundPercent(b) })
    : charged ? te('trip.cancel.refund', { percent: refundPercent(b) }) : te('trip.cancel.cash');
  openSheet({
    title: te('trip.cancel.title'),
    body: `<p class="t-body t-ink sheet__note">${line}</p>
      <button class="btn btn--danger" data-confirm>${te('trip.cancel.confirm')}</button>
      <button class="btn btn--text" data-sheet-close data-autofocus>${te('trip.cancel.keep')}</button>`,
      onMount(panel) {
      panel.querySelector('[data-confirm]').addEventListener('click', () => {
        const result = cancelBooking(b.id);
        if (!result.ok) {
          toast(t(`error.${result.error}`));
          onChange();
          return;
        }
        closeSheet();
        toast(t('trip.cancelled'));
        onChange();
      });
    },
  });
}

// Fills the page's [data-bookings] slot. Trip keeps the compact recent view;
// account pages can request the complete history with the same card and actions.
export function mountBookings(root, { all = false, title = 'trip.booking', details = false } = {}) {
  const host = root.querySelector('[data-bookings]');
  if (!host) return;
  const session = getSession();
  const paint = () => {
    const now = Date.now();
    const list = session
      ? listBookings(session.email, now)
        .filter((b) => all || b.startsAt > now - DAY_MS)
        .slice(0, all ? undefined : 3)
      : [];
    host.hidden = !all && (!session || list.length === 0);
    host.innerHTML = host.hidden
      ? ''
      : session && list.length
        ? `<h2 class="t-label section-label">${te(title)}</h2>
           <div class="stack">${list.map((b) => cardHtml(b, now, { details })).join('')}</div>
           ${all ? '' : `<button class="btn btn--text" data-help data-track="support_open">${te('trip.help')}</button>`}`
        : `<p class="note t-small">${te(session ? 'orders.empty' : 'orders.signin')}</p>
           ${!session && all ? `<button class="btn btn--primary" data-signin>${te('you.signin')}</button>` : ''}`;
  };
  host.addEventListener('click', (event) => {
    if (event.target.closest('[data-help]')) { go('support'); return; }
    const act = event.target.closest('[data-act]')?.dataset.act;
    const id = event.target.closest('[data-booking]')?.dataset.booking;
    if (!act || !id || !session) return;
    const b = listBookings(session.email).find((x) => x.id === id);
    if (!b) return;
    if (act === 'pay' || act === 'details') go(`checkout/${b.id}`);
    else if (act === 'message') go(`messages/${b.id}`);
    else if (act === 'cancel') confirmCancel(b, paint);
  });
  paint();
}
