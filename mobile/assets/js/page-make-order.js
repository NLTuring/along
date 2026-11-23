import { t, te, esc } from './i18n.js';
import { api } from './api.js';
import { getSession, onSessionChange } from './auth.js';
import { go } from './router.js';
import { createRequestGate, createSubmissionKey, validateInquiry, pathId } from './community.js';
import { errorText, needLogin } from './community-ui.js';
import { shippingFields, readShipping } from './inquiry-ui.js';

export function renderMakeOrder(root, modelId) {
  let disposed = false, model = null, submitting = false, request;
  const gate = createRequestGate(); const submissionKey = createSubmissionKey();
  root.innerHTML = `<section class="page community-page"><a class="btn btn--text" href="#/make-orders">${te('community.inquiry.myRequests')}</a><h1 class="t-title">${te('community.inquiry.title')}</h1><p class="note">${te('community.inquiry.noPayment')}</p><div data-body></div><p class="field-error" role="alert" data-error></p><button class="btn btn--secondary" data-retry hidden>${te('community.retry')}</button></section>`;
  const host = root.querySelector('[data-body]'), errorBox = root.querySelector('[data-error]'), retry = root.querySelector('[data-retry]');
  async function load() {
    request = gate.next(); const current = request; model = null; submitting = false; errorBox.textContent = ''; retry.hidden = true;
    if (!getSession()) { host.innerHTML = `<div class="empty"><p>${te('community.inquiry.signIn')}</p><button class="btn btn--primary" data-login>${te('community.signIn')}</button></div>`; return; }
    host.innerHTML = `<p role="status">${te('community.loading')}</p>`;
    try {
      const response = await api(`/craft-models/${pathId(modelId)}`, { signal: current.signal });
      if (!gate.current(current) || disposed) return;
      model = response.model;
      const metadata = model.metadata || {};
      host.innerHTML = `<section class="community-model"><h2 class="t-heading">${te('community.inquiry.model')}</h2><dl class="community-facts"><div><dt>${te('community.inquiry.modelVersion')}</dt><dd>${esc(model.version)}</dd></div><div><dt>${te('community.inquiry.product')}</dt><dd>${te(metadata.product === 'KEYCHAIN' ? 'community.inquiry.KEYCHAIN' : 'community.inquiry.MAGNET')}</dd></div><div><dt>${te('community.inquiry.dimensions')}</dt><dd>${esc(metadata.widthMm ?? '—')} × ${esc(metadata.heightMm ?? '—')} mm</dd></div></dl><p class="t-small">${te('community.inquiry.frozen')}</p></section><form class="community-form" data-inquiry-form><label class="field"><span>${te('community.inquiry.quantity')}</span><input class="input" name="quantity" type="number" min="1" max="1000" step="1" value="1" required></label><label class="field"><span>${te('community.inquiry.material')}</span><select class="input" name="material">${['PLA', 'RESIN', 'ADVICE'].map(value => `<option value="${value}">${te(`community.material.${value}`)}</option>`).join('')}</select></label><label class="field"><span>${te('community.inquiry.colorProcess')}</span><select class="input" name="colorProcess">${['SINGLE', 'FULL_COLOR', 'HAND_PAINTED', 'ADVICE'].map(value => `<option value="${value}">${te(`community.color.${value}`)}</option>`).join('')}</select></label><p class="t-small">${te('community.inquiry.preferences')}</p><label class="field"><span>${te('community.inquiry.notes')}</span><textarea class="input input--area" name="notes" rows="3" maxlength="4000"></textarea></label>${shippingFields()}<label class="community-check"><input type="checkbox" name="consent" required><span>${te('community.inquiry.consent')}</span></label><button class="btn btn--primary" type="submit">${te('community.inquiry.submit')}</button></form>`;
    } catch (error) { if (gate.current(current) && !disposed) { host.innerHTML = ''; errorBox.textContent = errorText(error); retry.hidden = false; } }
  }
  const click = event => {
    if (event.target.closest('[data-login]')) needLogin(() => load(), () => !disposed);
    if (event.target.closest('[data-retry]')) load();
  };
  const submit = async event => {
    const form = event.target.closest('[data-inquiry-form]'); if (!form) return;
    event.preventDefault(); if (!model || submitting) return;
    const raw = { modelId: model.id, quantity: Number(form.elements.quantity.value), material: form.elements.material.value, colorProcess: form.elements.colorProcess.value, notes: form.elements.notes.value.trim(), shipping: readShipping(form), consent: form.elements.consent.checked };
    const checked = validateInquiry({ ...raw, idempotencyKey: submissionKey(raw) });
    if (!checked.ok) { errorBox.textContent = t(`community.error.${checked.errors[0]}`); return; }
    const current = request; submitting = true; errorBox.textContent = '';
    const button = form.querySelector('[type="submit"]'); button.textContent = t('community.sending');
    form.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = true; });
    try {
      const result = await api('/inquiries', { method: 'POST', body: checked.value, signal: current.signal });
      if (gate.current(current) && !disposed) go(`make-orders/${pathId(result.inquiry.id)}`);
    } catch (error) { if (gate.current(current) && !disposed) errorBox.textContent = errorText(error); }
    finally { if (gate.current(current) && !disposed) { submitting = false; form.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = false; }); button.textContent = t('community.inquiry.submit'); } }
  };
  root.addEventListener('click', click); root.addEventListener('submit', submit); const off = onSessionChange(load); load();
  return () => { disposed = true; gate.dispose(); off(); model = null; host.innerHTML = ''; root.removeEventListener('click', click); root.removeEventListener('submit', submit); };
}
