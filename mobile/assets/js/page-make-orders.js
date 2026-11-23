import { t, te, esc } from './i18n.js';
import { api } from './api.js';
import { getSession, onSessionChange } from './auth.js';
import { createRequestGate, pathId, canCancelInquiry, canConfirmInquiry, validateInquiry } from './community.js';
import { errorText, needLogin, stateHtml, dateText, quoteHtml, preferenceText } from './community-ui.js';
import { shippingFields, shippingDetail, readShipping } from './inquiry-ui.js';

export function renderMakeOrders(root, id = null) {
  let disposed = false, inquiry = null, busy = false, request;
  const gate = createRequestGate();
  root.innerHTML = `<section class="page community-page"><a class="btn btn--text" href="${id ? '#/make-orders' : '#/you'}">${te(id ? 'community.inquiry.myRequests' : 'community.inquiry.backAccount')}</a><div class="community-heading"><h1 class="t-title">${te(id ? 'community.inquiry.detail' : 'community.inquiry.myRequests')}</h1><button class="btn btn--text" data-refresh>${te('community.refresh')}</button></div><p class="note">${te('community.inquiry.noPayment')}</p><div data-body></div><p role="status" data-result></p><p class="field-error" role="alert" data-error></p></section>`;
  const host = root.querySelector('[data-body]'), errors = root.querySelector('[data-error]'), resultText = root.querySelector('[data-result]');
  function paintDetail() {
    const canEdit = ['REQUESTED', 'NEEDS_INFO'].includes(inquiry.status);
    host.innerHTML = `<article class="community-order">${stateHtml(inquiry.status)}<p class="t-small">${esc(inquiry.id)} · ${esc(dateText(inquiry.updatedAt || inquiry.createdAt))}</p><dl class="community-facts"><div><dt>${te('community.inquiry.product')}</dt><dd>${te(inquiry.product === 'KEYCHAIN' ? 'community.inquiry.KEYCHAIN' : 'community.inquiry.MAGNET')}</dd></div><div><dt>${te('community.inquiry.quantity')}</dt><dd>${esc(inquiry.quantity)}</dd></div><div><dt>${te('community.inquiry.material')}</dt><dd>${esc(preferenceText('material', inquiry.material))}</dd></div><div><dt>${te('community.inquiry.colorProcess')}</dt><dd>${esc(preferenceText('color', inquiry.colorProcess))}</dd></div><div><dt>${te('community.inquiry.modelVersion')}</dt><dd>${esc(inquiry.modelVersion)}</dd></div></dl>${inquiry.notes ? `<h2 class="t-heading">${te('community.inquiry.notes')}</h2><p class="community-prose">${esc(inquiry.notes)}</p>` : ''}${inquiry.statusNote ? `<p class="note">${esc(inquiry.statusNote)}</p>` : ''}${inquiry.status === 'NEEDS_INFO' ? `<p class="note">${te('community.inquiry.needsInfo')}</p>` : ''}${quoteHtml(inquiry.quote)}${canConfirmInquiry(inquiry) ? `<form class="community-form" data-confirm-form><label class="community-check"><input name="agree" type="checkbox" required><span>${te('community.inquiry.confirmConsent', { revision: inquiry.quote.revision })}</span></label><button class="btn btn--primary" type="submit">${te('community.inquiry.confirm')}</button></form>` : ''}${shippingDetail(inquiry.shipping)}${canEdit ? `<details class="community-edit-details"><summary>${te('community.inquiry.updateInfo')}</summary><form class="community-form" data-update-form><label class="field"><span>${te('community.inquiry.notes')}</span><textarea class="input input--area" name="notes" rows="4" maxlength="4000">${esc(inquiry.notes || '')}</textarea></label>${shippingFields(inquiry.shipping)}<button class="btn btn--secondary" type="submit">${te('community.inquiry.sendInfo')}</button></form></details>` : ''}${inquiry.tracking ? `<section class="community-private"><h2 class="t-heading">${te('community.inquiry.tracking')}</h2><p>${esc(inquiry.tracking.carrier)} · ${esc(inquiry.tracking.number)}</p></section>` : ''}${canCancelInquiry(inquiry.status) ? `<details class="community-edit-details"><summary>${te('community.inquiry.cancel')}</summary><form class="community-form" data-cancel-form><p>${te('community.inquiry.cancelNote')}</p><label class="field"><span>${te('community.inquiry.cancelReason')}</span><textarea class="input input--area" name="reason" rows="2" maxlength="2000" required></textarea></label><button class="btn btn--secondary" type="submit">${te('community.inquiry.cancelConfirm')}</button></form></details>` : ['PRODUCING', 'SHIPPED', 'COMPLETED'].includes(inquiry.status) ? `<p class="note">${te('community.inquiry.manualSupport')}</p><a class="btn btn--text" href="#/support">${te('community.inquiry.support')}</a>` : ''}</article>`;
  }
  async function load(message = '') {
    request = gate.next(); const current = request; inquiry = null; busy = false; errors.textContent = ''; resultText.textContent = typeof message === 'string' ? message : '';
    if (!getSession()) { host.innerHTML = `<div class="empty"><p>${te('community.inquiry.signIn')}</p><button class="btn btn--primary" data-login>${te('community.signIn')}</button></div>`; return; }
    host.innerHTML = `<p role="status">${te('community.loading')}</p>`;
    try {
      const response = await api(id ? `/inquiries/${pathId(id)}` : '/inquiries', { signal: current.signal });
      if (!gate.current(current) || disposed) return;
      if (id) { inquiry = response.inquiry; paintDetail(); }
      else host.innerHTML = response.items?.length ? `<ul class="community-order-list">${response.items.map(item => `<li><a href="#/make-orders/${pathId(item.id)}">${stateHtml(item.status)}<h2 class="t-heading">${te(item.product === 'KEYCHAIN' ? 'community.inquiry.KEYCHAIN' : 'community.inquiry.MAGNET')} × ${esc(item.quantity)}</h2><p class="t-small">${esc(dateText(item.updatedAt || item.createdAt))}</p><p class="t-small">${te('community.inquiry.modelVersion')}: ${esc(item.modelVersion)}</p><span>${te('community.inquiry.open')}</span></a></li>`).join('')}</ul>` : `<div class="empty"><h2 class="t-heading">${te('community.inquiry.empty')}</h2><p>${te('community.inquiry.emptyHint')}</p><a class="btn btn--primary" href="#/crafts">${te('community.inquiry.goCrafts')}</a></div>`;
    } catch (error) { if (gate.current(current) && !disposed) { host.innerHTML = ''; errors.textContent = errorText(error); } }
  }
  async function write(path, method, body, success) {
    if (busy || !inquiry) return;
    busy = true; const current = request; errors.textContent = ''; resultText.textContent = t('community.sending');
    host.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = true; });
    try {
      const response = await api(path, { method, body, signal: current.signal });
      if (!gate.current(current) || disposed) return;
      inquiry = response.inquiry; paintDetail(); resultText.textContent = t(success);
    } catch (error) {
      if (!gate.current(current) || disposed) return;
      resultText.textContent = ''; errors.textContent = errorText(error);
      // A stale quote/state requires a fresh detail and another explicit confirmation.
      if (error.status === 409) await load(t('community.inquiry.changed'));
    } finally { if (gate.current(current) && !disposed) { busy = false; host.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = false; }); } }
  }
  const submit = event => {
    const form = event.target.closest('form'); if (!form || !inquiry) return;
    event.preventDefault();
    if (form.hasAttribute('data-confirm-form')) {
      if (!form.elements.agree.checked || !canConfirmInquiry(inquiry)) return;
      write(`/inquiries/${pathId(id)}/confirm`, 'POST', { quoteRevision: inquiry.quote.revision }, 'community.inquiry.confirmed');
    } else if (form.hasAttribute('data-cancel-form')) {
      const reason = form.elements.reason.value.trim(); if (!reason) { errors.textContent = t('community.error.reason'); return; }
      write(`/inquiries/${pathId(id)}/cancel`, 'POST', { reason }, 'community.inquiry.cancelled');
    } else if (form.hasAttribute('data-update-form')) {
      const shipping = readShipping(form), notes = form.elements.notes.value.trim();
      const check = validateInquiry({ ...inquiry, shipping, notes, consent: true, idempotencyKey: 'update' });
      const error = check.errors.find(field => ['shipping', 'notes'].includes(field));
      if (error) { errors.textContent = t(`community.error.${error}`); return; }
      write(`/inquiries/${pathId(id)}`, 'PATCH', { notes, shipping }, 'community.inquiry.infoSent');
    }
  };
  const click = event => { if (event.target.closest('[data-refresh]')) load(); if (event.target.closest('[data-login]')) needLogin(() => load(), () => !disposed); };
  root.addEventListener('submit', submit); root.addEventListener('click', click); const off = onSessionChange(load); load();
  return () => { disposed = true; gate.dispose(); off(); inquiry = null; host.innerHTML = ''; root.removeEventListener('submit', submit); root.removeEventListener('click', click); };
}
