import { te, esc } from './i18n.js';

export function shippingFields(shipping = {}) {
  const fields = [['name', 100, 'name'], ['phone', 32, 'tel'], ['region', 200, 'address-level1'], ['address', 500, 'street-address'], ['postalCode', 20, 'postal-code']];
  return `<fieldset class="field-group community-private"><legend>${te('community.inquiry.shipping')}</legend><p class="t-small">${te('community.inquiry.privateShipping')}</p>${fields.map(([key, max, autocomplete]) => `<label class="field"><span>${te(`community.inquiry.${key}`)}</span><input class="input" name="shipping_${key}" maxlength="${max}" autocomplete="${autocomplete}" ${key === 'phone' ? 'type="tel"' : ''} ${key !== 'postalCode' ? 'required' : ''} value="${esc(shipping[key] || '')}"></label>`).join('')}</fieldset>`;
}
export function readShipping(form) {
  return Object.fromEntries(['name', 'phone', 'region', 'address', 'postalCode'].map(key => [key, form.elements[`shipping_${key}`].value.trim()]));
}
export function shippingDetail(shipping) {
  return shipping ? `<section class="community-private"><h2 class="t-heading">${te('community.inquiry.shipping')}</h2><p class="t-small">${te('community.inquiry.privateShipping')}</p><address class="community-prose">${esc(shipping.name)} · ${esc(shipping.phone)}<br>${esc(shipping.region)} ${esc(shipping.address)}<br>${esc(shipping.postalCode || '')}</address></section>` : '';
}
