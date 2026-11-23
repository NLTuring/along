// InsTrip mobile — pieces shared by the checkout page and the booking card:
// the status stamp and the ticket.

import { t, te, esc } from './i18n.js';
import { usd, dateShort } from './format.js';
import { endTime, TZ } from './plan.js';
import { HALF_DAY_MIN } from './bookings.js';

// "9 h 12 min" / "12 min"
export function duration(ms) {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? t('time.hm', { h, m }) : t('time.m', { m });
}

export const bookingDay = (booking) => dateShort(new Date(booking.startsAt), TZ);

const STAMP = {
  REQUESTED: 'pending',            // dashed outline: waiting for the guide
  CONFIRMED: 'ok',                 // ink outline
  PAID: 'paid',                    // seal red, solid
  IN_PROGRESS: 'paid',
  COMPLETED: 'paid',
  EXPIRED: 'void',                 // grey with a stroke through it
  CANCELLED_BY_TRAVELER: 'void',
};

// The status is always written out; the stamp shape only reinforces it.
export function stampHtml(status) {
  return `<span class="stamp stamp--${STAMP[status] || 'void'}" data-status="${esc(status)}">${te(`status.${status}`)}</span>`;
}

// A paper ticket: the trip above the tear line, the price below it.
export function ticketHtml(booking, g) {
  const to = endTime(booking.time, HALF_DAY_MIN);
  return `
    <article class="ticket">
      <div class="ticket__top">
        <div class="window window--moon ticket__photo"><img src="${esc(g.photo)}" alt="" /></div>
        <div class="ticket__who">
          <p class="t-heading">${esc(g.name)}</p>
          <p class="t-body t-num">${esc(bookingDay(booking))}</p>
          <p class="t-body t-num">${te('checkout.halfday', { from: booking.time, to })}</p>
          <p class="t-small t-num">${te('list.pair', { a: t('checkout.people', { n: booking.people }), b: t('checkout.code', { code: booking.code }) })}</p>
        </div>
        <div class="ticket__stamp" aria-live="polite">${stampHtml(booking.status)}</div>
      </div>
      <dl class="ticket__price t-num">
        <div><dt>${te('checkout.guide')}</dt><dd>${booking.guideCents === 0 ? te('plan.free') : esc(usd(booking.guideCents))}</dd></div>
        <div><dt>${te('checkout.fee')}</dt><dd>${esc(usd(booking.feeCents))}</dd></div>
        <div class="ticket__total"><dt>${te('checkout.total')}</dt><dd>${esc(usd(booking.amountCents))}</dd></div>
      </dl>
    </article>`;
}
