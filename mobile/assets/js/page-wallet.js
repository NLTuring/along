// Along — saved payment cards for this account on this phone.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { skyline, toast, openSheet, closeSheet } from './ui.js';
import { back } from './router.js';
import { getSession, onSessionChange } from './auth.js';
import { openLogin } from './login.js';
import { walletScope, listCards, removeCard, setDefaultCard, cardExpired, expiryText, brandLabel } from './payments.js';
import { openCardSheet, brandBadge } from './card-sheet.js';

export function cardRowHtml(card, { now = Date.now() } = {}) {
  const expired = cardExpired(card, now);
  return `${brandBadge(card.brand)}<span class="row__text"><strong class="t-num">•••• ${esc(card.last4)}</strong><small>${te('pay.card.expires', { date: expiryText(card) })} · ${esc(card.name)}</small></span>${card.isDefault ? `<span class="pay-tag">${te('pay.card.default')}</span>` : ''}${expired ? `<span class="pay-tag pay-tag--bad">${te('pay.card.expired')}</span>` : ''}`;
}

export function renderWallet(root) {
  let disposed = false;
  function paint() {
    const session = getSession(), scope = walletScope(session), cards = listCards(scope);
    root.innerHTML = `<section class="page page--tab page--wallet">
      ${skyline()}
      <button class="btn btn--text btn--inline" data-back>${icon('back', { size: 18 })}${te('common.back')}</button>
      <h1 class="t-title">${te('you.wallet')}</h1>
      <p class="demo t-small pay-demo">${icon('lock', { size: 18 })}<span>${te('pay.demo.wallet')}</span></p>
      ${!session ? `<p class="t-body">${te('pay.signin')}</p><button class="btn btn--primary" data-signin>${te('you.signin')}</button>`
        : `${cards.length ? `<div class="stack">${cards.map((card) => `<article class="card pay-card" data-card="${esc(card.id)}">
            <div class="row pay-card__row">${cardRowHtml(card)}</div>
            <div class="pay-card__actions">${card.isDefault ? '' : `<button class="btn btn--text btn--inline" data-default="${esc(card.id)}">${te('pay.card.makeDefault')}</button>`}<button class="btn btn--text btn--inline" data-remove="${esc(card.id)}">${te('pay.card.remove')}</button></div>
          </article>`).join('')}</div>`
          : `<div class="empty"><span class="pay-empty" aria-hidden="true">${icon('card', { size: 32 })}</span><h2 class="t-heading">${te('pay.empty')}</h2><p class="t-body">${te('pay.empty.body')}</p></div>`}
          <button class="btn btn--primary" data-add>${icon('plus', { size: 20 })}<span>${te('pay.add.button')}</span></button>`}
    </section>`;
  }
  const click = (event) => {
    const button = event.target.closest('button'), scope = walletScope(getSession());
    if (!button) return;
    if (button.hasAttribute('data-back')) back('you');
    else if (button.hasAttribute('data-signin')) openLogin();
    else if (button.hasAttribute('data-add')) openCardSheet({ scope, onAdded: () => { if (!disposed) paint(); } });
    else if (button.dataset.default) {
      const result = setDefaultCard(scope, button.dataset.default);
      if (!result.ok) { toast(t('pay.error.storage')); return; }
      toast(t('pay.card.defaultSet')); paint();
    } else if (button.dataset.remove) {
      const card = listCards(scope).find((c) => c.id === button.dataset.remove);
      if (!card) return;
      openSheet({ title: te('pay.remove.title'), body: `<p class="t-body sheet__note">${te('pay.remove.body', { brand: brandLabel(card.brand), last4: card.last4 })}</p><button class="btn btn--danger" data-confirm>${te('pay.card.remove')}</button><button class="btn btn--text" data-sheet-close data-autofocus>${te('pay.remove.keep')}</button>`,
        onMount(panel) {
          panel.querySelector('[data-confirm]').addEventListener('click', () => {
            const result = removeCard(scope, card.id);
            closeSheet();
            if (!result.ok) { toast(t('pay.error.storage')); return; }
            toast(t('pay.card.removed')); if (!disposed) paint();
          });
        } });
    }
  };
  root.addEventListener('click', click);
  const off = onSessionChange(() => { if (!disposed) paint(); });
  paint();
  return () => { disposed = true; off(); root.removeEventListener('click', click); };
}
