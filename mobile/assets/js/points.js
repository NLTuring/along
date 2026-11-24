// Workshop points for the phone. A signed-in member's balance lives on the Along server; the
// local experience profile keeps the same rules on this phone only (labelled as such).
// Every charge asks first: confirmSpend() shows the price, the balance and what is bought.
import { t, te, esc } from './i18n.js';
import { api } from './api.js';
import { getSession } from './auth.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { go } from './router.js';
import { createLocalPoints, PRICES, PointsError, TOPUP_TIERS, MONTHLY_GRANT, GALLERY_PRICE, AUTHOR_SHARE, tierPoints } from './points-core.js';

export { PRICES, TOPUP_TIERS, MONTHLY_GRANT, GALLERY_PRICE, AUTHOR_SHARE, tierPoints };
const listeners = new Set();
let last = null;
export const onPointsChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = (balance) => { last = balance; listeners.forEach((fn) => fn(balance)); };
export const lastBalance = () => last;

export const pointsMode = () => (getSession()?.localOnly ? 'local' : getSession() ? 'online' : 'none');
const localBook = () => createLocalPoints({ scope: getSession()?.id || 'local' });
export const newKey = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** { balance, month, ledger, local } */
export async function loadPoints({ signal } = {}) {
  if (pointsMode() === 'none') throw new PointsError('UNAUTHENTICATED');
  if (pointsMode() === 'local') { const state = localBook().state(); notify(state.balance); return { ...state, local: true }; }
  const state = await api('/points', { signal });
  notify(state.balance);
  return { ...state, local: false };
}
export async function topUp(tier, key = newKey()) {
  const result = pointsMode() === 'local' ? localBook().topup(tier, key) : await api('/points/topup', { method: 'POST', body: { tier, idempotencyKey: key, demoConsent: true } });
  notify(result.balance);
  return result;
}
/** Charge a phone-side item (magnet, keychain, bead pattern). The ref ties it to the design. */
export async function spend(item, ref, key = newKey()) {
  const result = pointsMode() === 'local' ? localBook().spend(item, ref, key) : await api('/points/spend', { method: 'POST', body: { item, ref: safeRef(ref), idempotencyKey: key } });
  notify(result.balance);
  return result;
}
// Local-only flows the server cannot see (gallery unlocks of the bundled examples, AI refunds while offline).
export function localSpend(item, ref, key, cost) { const result = localBook().spend(item, ref, key, cost); notify(result.balance); return result; }
export function localRefund(item, ref, key, amount) { const result = localBook().refund(item, ref, key, amount); notify(result.balance); return result; }
export const localPaid = (key) => localBook().has(`spend:${key}`);
export const safeRef = (ref) => String(ref || 'item').replace(/[^A-Za-z0-9:_.-]/g, '-').slice(0, 128) || 'item';
export const insufficient = (error) => error?.code === 'POINTS_INSUFFICIENT' || error?.status === 402;

/**
 * The pay-with-points sheet. Resolves true once the traveller confirms (the caller then charges),
 * false if they close it. When the balance is short it offers the top-up page instead.
 */
export function confirmSpend({ item, cost, title, detail = '' }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const paint = (panel, balance) => {
      const enough = balance == null || balance >= cost;
      panel.querySelector('[data-spend-body]').innerHTML = `
        <div class="points-receipt">
          <p class="points-receipt__item">${esc(title)}</p>
          ${detail ? `<p class="t-small">${esc(detail)}</p>` : ''}
          <p class="points-receipt__line"><span>${te('points.confirm.cost')}</span><strong class="t-num">${te('points.amount', { n: cost })}</strong></p>
          <p class="points-receipt__line"><span>${te('points.confirm.balance')}</span><strong class="t-num">${balance == null ? '…' : te('points.amount', { n: balance })}</strong></p>
          ${balance != null ? `<p class="points-receipt__line points-receipt__line--after"><span>${te('points.confirm.after')}</span><strong class="t-num">${enough ? te('points.amount', { n: balance - cost }) : '—'}</strong></p>` : ''}
        </div>
        ${pointsMode() === 'local' ? `<p class="note t-small">${te('points.local.note')}</p>` : ''}
        ${enough ? `<button class="btn btn--primary" data-spend-yes ${balance == null ? 'disabled' : ''}>${te('points.confirm.pay', { n: cost })}</button>`
          : `<p class="t-small points-short">${te('points.confirm.short', { n: cost - balance })}</p><button class="btn btn--primary" data-spend-topup>${te('points.confirm.topup')}</button>`}
        <button class="btn btn--text" data-sheet-close>${te('workshop.cancel')}</button>`;
    };
    openSheet({
      title: te(`points.confirm.title.${item}`),
      body: '<div data-spend-body></div>',
      onMount(panel) {
        paint(panel, null);
        loadPoints().then((state) => { if (!settled && panel.isConnected) paint(panel, state.balance); })
          .catch((error) => { if (!settled && panel.isConnected) { panel.querySelector('[data-spend-body]').innerHTML = `<p class="t-small">${esc(pointsError(error))}</p>`; } });
        panel.addEventListener('click', (event) => {
          if (event.target.closest('[data-spend-yes]')) { done(true); closeSheet(); }
          else if (event.target.closest('[data-spend-topup]')) { done(false); closeSheet(); go('points'); }
        });
        // Closing any other way (backdrop, Escape, drag) is a "no".
        new MutationObserver((_, observer) => { if (!panel.isConnected) { observer.disconnect(); done(false); } }).observe(document.getElementById('overlay'), { childList: true });
      },
    });
  });
}

export function pointsError(error) {
  if (insufficient(error)) return t('points.error.short');
  if (error?.code === 'LOCAL_EXPERIENCE_ONLY') return t('experience.online.blocked');
  if (error?.code === 'UNAUTHENTICATED' || error?.status === 401) return t('points.error.signin');
  if (error?.status === 503) return t('points.error.unavailable');
  if (error?.status === 0) return t('points.error.offline');
  return t('points.error.generic');
}

/** Confirm, charge, and report. Returns the charge or null if the traveller backed out or it failed. */
export async function payWithPoints({ item, cost = PRICES[item], title, detail, ref, key = newKey() }) {
  if (pointsMode() === 'none') { toast(t('points.error.signin')); return null; }
  if (!await confirmSpend({ item, cost, title, detail })) return null;
  try {
    const result = await spend(item, ref, key);
    toast(t('points.spent', { n: cost, balance: result.balance }));
    return result;
  } catch (error) {
    toast(pointsError(error));
    if (insufficient(error)) go('points');
    return null;
  }
}
