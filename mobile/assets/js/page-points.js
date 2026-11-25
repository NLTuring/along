// Along — workshop points: the balance, the two top-up tiers, this month's free points and the
// ledger. Top-ups are a labelled demo: no money moves, and the button says so before it is pressed.
import { t, te, esc, getLocale } from './i18n.js';
import { icon } from './icons.js';
import { toast, openSheet, closeSheet } from './ui.js';
import { back } from './router.js';
import { getSession, onSessionChange } from './auth.js';
import { openLogin } from './login.js';
import { loadPoints, topUp, pointsError, pointsMode, newKey, TOPUP_TIERS, MONTHLY_GRANT, PRICES, GALLERY_PRICE, AUTHOR_SHARE, tierPoints } from './points.js';

function when(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(getLocale() === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
const reasonText = (row) => (row.reason === 'SPEND' || row.reason === 'REFUND' ? t(`points.item.${row.item}`) : t(`points.reason.${row.reason}`));

export function renderPoints(root) {
  let disposed = false, busy = false, request = null;
  root.innerHTML = `<section class="page page--tab points-page">
    <button class="btn btn--text btn--inline" data-back>${icon('back', { size: 18 })}${te('common.back')}</button>
    <h1 class="t-title">${te('points.title')}</h1>
    <div data-body></div>
  </section>`;
  root.querySelector('[data-back]').onclick = () => back('workshop');
  const body = root.querySelector('[data-body]');

  function paint(state) {
    const local = pointsMode() === 'local';
    body.innerHTML = `
      <div class="points-card">
        <p class="points-card__label">${te('points.balance')}</p>
        <p class="points-card__value t-num">${esc(state.balance)}<small>${te('points.unit')}</small></p>
        <p class="points-card__grant">${icon('spark', { size: 16 })}${te('points.grant', { n: MONTHLY_GRANT, month: state.month || '' })}</p>
        ${local ? `<p class="points-card__local">${te('points.local.note')}</p>` : ''}
      </div>
      <h2 class="t-heading">${te('points.topup.title')}</h2>
      <p class="note t-small">${te('points.topup.demo')}</p>
      <div class="tiers">${TOPUP_TIERS.map((tier) => `<button class="tier${tier.bonus ? ' tier--bonus' : ''}" data-tier="${tier.id}">
        <span class="tier__yuan t-num">¥${tier.yuan}</span>
        <span class="tier__points t-num">${te('points.amount', { n: tier.points })}</span>
        ${tier.bonus ? `<span class="tier__bonus">${te('points.tier.bonus', { n: tier.bonus })}</span>` : `<span class="tier__bonus tier__bonus--plain">${te('points.tier.plain')}</span>`}
        <span class="tier__each">${te('points.tier.each', { n: (tierPoints(tier) / tier.yuan).toFixed(1).replace(/\.0$/, '') })}</span>
      </button>`).join('')}</div>
      <h2 class="t-heading">${te('points.prices.title')}</h2>
      <ul class="price-list">
        ${[['MAGNET', PRICES.MAGNET], ['KEYCHAIN', PRICES.KEYCHAIN], ['BEADS', PRICES.BEADS], ['AI_MODEL', PRICES.AI_MODEL], ['AI_MODEL_TRIPO', PRICES.AI_MODEL_TRIPO]].map(([item, n]) => `<li><span>${te(`points.item.${item}`)}</span><strong class="t-num">${te('points.amount', { n })}</strong></li>`).join('')}
        <li><span>${te('points.item.GALLERY')}</span><strong class="t-num">${te('points.gallery.range', { min: GALLERY_PRICE.min, max: GALLERY_PRICE.max })}</strong></li>
        <li><span>${te('points.price.clay')}</span><strong>${te('workshop.free')}</strong></li>
      </ul>
      <p class="t-small">${te('points.share', { n: Math.round(AUTHOR_SHARE * 100) })}</p>
      <h2 class="t-heading">${te('points.ledger')}</h2>
      ${state.ledger?.length ? `<ol class="ledger">${state.ledger.map((row) => `<li class="ledger__row">
        <span class="ledger__what"><strong>${esc(reasonText(row))}</strong><small>${esc(when(row.createdAt))}</small></span>
        <span class="ledger__delta t-num ${row.delta > 0 ? 'is-in' : 'is-out'}">${row.delta > 0 ? '+' : '−'}${Math.abs(row.delta)}</span>
      </li>`).join('')}</ol>` : `<p class="t-small">${te('points.ledger.empty')}</p>`}`;
  }
  async function load() {
    if (!getSession()) {
      body.innerHTML = `<div class="empty"><p class="t-body">${te('points.signin')}</p><button class="btn btn--primary" data-signin>${te('you.signin')}</button></div>`;
      return;
    }
    request?.abort(); request = new AbortController();
    body.innerHTML = `<p class="t-small" role="status">${te('community.loading')}</p>`;
    try { const state = await loadPoints({ signal: request.signal }); if (!disposed) paint(state); }
    catch (error) { if (!disposed && error.name !== 'AbortError') body.innerHTML = `<p class="t-small">${esc(pointsError(error))}</p><button class="btn btn--outline" data-retry>${te('points.retry')}</button>`; }
  }
  function confirmTopup(tier) {
    const key = newKey();
    openSheet({
      title: te('points.topup.confirm', { yuan: tier.yuan }),
      body: `<div class="points-receipt">
          <p class="points-receipt__line"><span>${te('points.topup.pay')}</span><strong class="t-num">¥${tier.yuan}</strong></p>
          <p class="points-receipt__line"><span>${te('points.topup.get')}</span><strong class="t-num">${te('points.amount', { n: tierPoints(tier) })}</strong></p>
        </div>
        <p class="note t-small">${te('points.topup.demoSheet')}</p>
        <label class="consent"><input type="checkbox" data-demo-ok /> <span>${te('points.topup.demoCheck')}</span></label>
        <button class="btn btn--primary" data-demo-pay disabled>${te('points.topup.demoPay', { yuan: tier.yuan })}</button>`,
      onMount(panel) {
        panel.querySelector('[data-demo-ok]').onchange = (event) => { panel.querySelector('[data-demo-pay]').disabled = !event.target.checked; };
        panel.querySelector('[data-demo-pay]').onclick = async () => {
          if (busy) return;
          busy = true; panel.querySelector('[data-demo-pay]').disabled = true;
          try {
            const result = await topUp(tier.id, key);
            closeSheet(); toast(t('points.topup.done', { n: tierPoints(tier), balance: result.balance })); await load();
          } catch (error) { toast(pointsError(error)); panel.querySelector('[data-demo-pay]').disabled = false; }
          finally { busy = false; }
        };
      },
    });
  }
  const click = (event) => {
    if (event.target.closest('[data-signin]')) { openLogin(); return; }
    if (event.target.closest('[data-retry]')) { load(); return; }
    const tier = TOPUP_TIERS.find((item) => item.id === event.target.closest('[data-tier]')?.dataset.tier);
    if (tier) confirmTopup(tier);
  };
  root.addEventListener('click', click);
  load();
  const off = onSessionChange(() => { if (!disposed) load(); });
  return () => { disposed = true; root.removeEventListener('click', click); request?.abort(); off(); };
}
