// InsTrip mobile — checkout (spec §6.7): one ticket, one way to pay, one button.
// Card payment runs in demo mode (payments.js): the card is authorised by a local stand-in,
// nothing is charged, and the page says so. Cash on the day works as before. The guide's
// confirmation is stood in for by a button that is labelled as a demo.

import { t, te, esc } from './i18n.js';
import { money } from './format.js';
import { guideText } from './seed-text.js';
import { icon } from './icons.js';
import { toast, prefersReducedMotion } from './ui.js';
import { go, replace, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { guide, getBooking, confirmBooking, payBooking } from './bookings.js';
import { ticketHtml, stampHtml, duration, bookingDay } from './booking-ui.js';
import { walletScope, listCards, cardExpired, authorizeCardPayment, brandLabel } from './payments.js';
import { openCardSheet } from './card-sheet.js';
import { cardRowHtml } from './page-wallet.js';

const DONE = ['PAID', 'IN_PROGRESS', 'COMPLETED'];
const CARD_ERRORS = { CARD_DECLINED: 'pay.error.declined', CARD_EXPIRED: 'pay.error.expired', INVALID_AMOUNT: 'pay.error.failed', CARD_INVALID: 'pay.error.failed' };

function topbar() {
  return `<header class="topbar">
    <button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button>
    <h1 class="t-heading topbar__title">${te('checkout.title')}</h1>
  </header>`;
}

function cardSection(cards, selectedId) {
  const now = Date.now();
  return `<div class="pay-choose" data-card-section>
    <p class="demo t-small pay-demo">${icon('lock', { size: 18 })}<span>${te('pay.demo.checkout')}</span></p>
    ${cards.length ? `<fieldset class="field-group"><legend class="t-label">${te('pay.choose')}</legend>${cards.map((card) => {
      const expired = cardExpired(card, now);
      return `<label class="radio pay-radio${expired ? ' is-off' : ''}"><input type="radio" name="card" value="${esc(card.id)}" ${card.id === selectedId ? 'checked' : ''} ${expired ? 'disabled' : ''} /><span class="pay-radio__body">${cardRowHtml(card, { now })}</span></label>`;
    }).join('')}</fieldset>` : `<p class="t-small">${te('pay.none')}</p>`}
    <button class="btn btn--outline" type="button" data-add-card>${icon('plus', { size: 20 })}<span>${te('pay.add.button')}</span></button>
  </div>`;
}

export function renderCheckout(root, bookingId) {
  const session = getSession();
  const scope = walletScope(session);
  let timer = null;
  let redirectTimer = null;
  let leaving = false;
  let disposed = false;
  // Kept outside the markup so a repaint (countdown, new card) never loses the traveller's choice.
  let method = null;
  let cardId = '';
  let paying = false;
  let payError = '';

  function message(text, buttonHtml) {
    root.innerHTML = `<section class="page page--flow">${topbar()}<p class="t-body">${text}</p>${buttonHtml}</section>`;
  }

  function wireCommon() {
    root.querySelector('[data-back]')?.addEventListener('click', () => back('friends'));
    root.querySelector('[data-all]')?.addEventListener('click', () => go('friends'));
    root.querySelector('[data-see]')?.addEventListener('click', () => replace('trip'));
  }

  if (!session) {
    message(te('login.sub'), `<button class="btn btn--primary" data-signin>${te('you.signin')}</button>`);
    wireCommon();
    root.querySelector('[data-signin]').addEventListener('click', () => openLogin());
    return null;
  }

  const usable = () => listCards(scope).filter((card) => !cardExpired(card));
  function choose() {
    const cards = usable();
    if (!cards.some((card) => card.id === cardId)) cardId = (cards.find((card) => card.isDefault) || cards[0])?.id || '';
    if (method === null) method = cards.length ? 'CARD' : 'CASH';
  }

  function bodyHtml(b, g, now) {
    if (b.status === 'REQUESTED') {
      return `
        <p class="t-body t-ink" data-wait>${te('checkout.waiting', { name: g.name, time: duration(b.expiresAt - now) })}</p>
        <p class="t-small">${te('checkout.waiting.note')}</p>
        <div class="demo">
          <button class="btn btn--outline" data-demo-confirm>${te('checkout.demo.confirm')}</button>
          <p class="t-small">${te('checkout.demo.note')}</p>
        </div>`;
    }
    if (b.status === 'CONFIRMED') {
      choose();
      const card = usable().find((c) => c.id === cardId);
      const payLabel = paying ? t('pay.processing') : card ? t('pay.cta', { amount: money(b.amountCents), brand: brandLabel(card.brand), last4: card.last4 }) : t('pay.cta.choose');
      return `
        <fieldset class="field-group">
          <legend class="t-label">${te('checkout.how')}</legend>
          <label class="radio">
            <input type="radio" name="method" value="CARD" ${method === 'CARD' ? 'checked' : ''} data-track="checkout_method" />
            <span><strong>${te('checkout.pay.card')}</strong><small>${te('pay.card.brands')}</small></span>
          </label>
          <label class="radio">
            <input type="radio" name="method" value="CASH" ${method === 'CASH' ? 'checked' : ''} data-track="checkout_method" />
            <span><strong>${te('checkout.pay.cash')}</strong></span>
          </label>
        </fieldset>
        ${method === 'CARD' ? cardSection(listCards(scope), cardId) : ''}
        <details class="policy">
          <summary class="t-body">${te('checkout.policy')}</summary>
          <p class="t-small">${te('checkout.policy.more')}</p>
        </details>
        <dl class="facts"><div class="facts__wide"><dt class="t-label">${te('checkout.contact')}</dt><dd>${esc(b.email)}</dd></div></dl>
        <p class="t-small t-num" data-payby>${te('checkout.payby', { time: duration(b.payBy - now) })}</p>
        <p class="field-error" role="alert" data-pay-error>${esc(payError)}</p>
        ${method === 'CARD'
          ? `<button class="btn btn--primary" data-pay-card ${card && !paying ? '' : 'disabled'} aria-busy="${paying}" data-track="payment_started">${icon('card', { size: 20 })}<span>${esc(payLabel)}</span></button>`
          : `<button class="btn btn--primary" data-pay data-track="payment_started">${te('checkout.cta.cash', { amount: money(b.amountCents) })}</button>`}`;
    }
    if (DONE.includes(b.status)) {
      const paidByCard = b.order?.provider === 'CARD' && b.order.mode === 'DEMO';
      return `
        <p class="t-lead t-ink">${te('checkout.done', { date: bookingDay(b) })}</p>
        ${paidByCard ? `<p class="t-small pay-paid">${te('pay.paidWith', { brand: brandLabel(b.order.brand), last4: b.order.last4 })}</p>` : ''}
        <button class="btn btn--primary" data-see>${te('checkout.see')}</button>`;
    }
    return `
      <p class="t-body">${te('checkout.gone')}</p>
      <button class="btn btn--primary" data-all>${te('guide.all')}</button>`;
  }

  // The same ending for cash and card: the PAID stamp lands, then back to the trip.
  function celebrate(b) {
    leaving = true;
    const host = root.querySelector('.ticket__stamp');
    host.innerHTML = stampHtml('PAID');
    host.firstElementChild.classList.add('is-landing');
    // Haptics only after a real tap; browsers block (and log) it otherwise.
    if (navigator.userActivation?.isActive) {
      try { navigator.vibrate?.(20); } catch { /* no haptics here */ }
    }
    toast(t('checkout.done', { date: bookingDay(b) }));
    redirectTimer = setTimeout(() => {
      if (root.querySelector('.ticket')) replace('trip');
    }, prefersReducedMotion() ? 0 : 1100);
  }

  function paint({ focus = false } = {}) {
    const b = getBooking(bookingId);
    // Someone else's booking is treated the same as one that does not exist.
    if (!b || b.email !== session.email) {
      message(te('checkout.notfound'), `<button class="btn btn--primary" data-all>${te('guide.all')}</button>`);
      wireCommon();
      return null;
    }
    const g = guideText(guide(b.guideId));
    root.innerHTML = `
      <section class="page page--flow">
        ${topbar()}
        ${ticketHtml(b, g)}
        <div class="flow-body">${bodyHtml(b, g, Date.now())}</div>
      </section>`;
    wireCommon();

    root.querySelector('[data-demo-confirm]')?.addEventListener('click', () => {
      const result = confirmBooking(b.id);
      if (!result.ok) toast(t(`error.${result.error}`));
      shown = paint({ focus: true });
      if (result.ok) root.querySelector('.stamp')?.classList.add('is-landing');
    });

    root.querySelectorAll('input[name="method"]').forEach((input) => input.addEventListener('change', () => {
      if (paying) return;
      method = input.value; payError = '';
      shown = paint();
      root.querySelector(`input[name="method"][value="${method}"]`)?.focus();
    }));
    root.querySelectorAll('input[name="card"]').forEach((input) => input.addEventListener('change', () => {
      if (paying) return;
      cardId = input.value; payError = '';
      shown = paint();
      root.querySelector(`input[name="card"][value="${CSS.escape(cardId)}"]`)?.focus();
    }));
    root.querySelector('[data-add-card]')?.addEventListener('click', () => {
      if (paying) return;
      openCardSheet({ scope, onAdded(card) {
        if (disposed) return;
        if (!cardExpired(card)) cardId = card.id;
        payError = ''; shown = paint();
        root.querySelector('[data-pay-card]')?.focus();
      } });
    });

    const pay = root.querySelector('[data-pay]');
    pay?.addEventListener('click', () => {
      if (pay.disabled) return;
      pay.disabled = true; // one tap, one order
      const result = payBooking(b.id, 'CASH');
      if (!result.ok) {
        toast(t(`error.${result.error}`));
        shown = paint({ focus: true });
        return;
      }
      celebrate(b);
    });

    const payCard = root.querySelector('[data-pay-card]');
    payCard?.addEventListener('click', async () => {
      const card = usable().find((c) => c.id === cardId);
      if (paying || payCard.disabled || !card) return;
      paying = true; payError = '';  // one tap, one order
      shown = paint();
      const result = await authorizeCardPayment({ card, amountCents: b.amountCents, currency: 'USD', reference: b.code });
      if (disposed) return;
      paying = false;
      if (!result.ok) {
        payError = t(CARD_ERRORS[result.error] || 'pay.error.failed');
        shown = paint();
        root.querySelector('[data-pay-error]')?.focus?.();
        return;
      }
      const paid = payBooking(b.id, 'CARD', Date.now(), result.payment);
      if (!paid.ok) {
        payError = t(`error.${paid.error}`);
        shown = paint({ focus: true });
        return;
      }
      shown = getBooking(bookingId);
      celebrate(b);
    });

    if (focus) root.querySelector('[data-pay], [data-pay-card], [data-see], [data-all], [data-demo-confirm]')?.focus();
    return b;
  }

  let shown = paint();

  // Keep the countdowns current and notice when the booking expires. A payment in progress is left alone.
  timer = setInterval(() => {
    if (leaving || paying || !shown) return;
    const b = getBooking(bookingId);
    if (!b || b.status !== shown.status) { shown = paint(); return; }
    const now = Date.now();
    const wait = root.querySelector('[data-wait]');
    if (wait) wait.textContent = t('checkout.waiting', { name: guideText(guide(b.guideId)).name, time: duration(b.expiresAt - now) });
    const payBy = root.querySelector('[data-payby]');
    if (payBy) payBy.textContent = t('checkout.payby', { time: duration(b.payBy - now) });
  }, 30_000);

  return () => {
    disposed = true;
    clearInterval(timer);
    clearTimeout(redirectTimer);
  };
}
