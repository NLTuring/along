// Along — the add-a-card sheet. The full number and security code live only in these inputs
// while the sheet is open; they are cleared as soon as the card is saved or the sheet closes.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { CARD_BRANDS, TEST_CARDS, detectBrand, digitsOf, formatCardNumber, brandLabel, addCard } from './payments.js';

let testIndex = 0;
const FIELDS = ['number', 'expiry', 'cvc', 'name'];

export const brandBadge = (brand, extra = '') => `<span class="pay-brand pay-brand--${esc(brand || 'none')}${extra}">${esc(brandLabel(brand) || t('pay.brand.unknown'))}</span>`;

// "08" + "2" -> "08/2"; deleting keeps the digits the traveller left.
function formatExpiry(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 4);
  if (digits.length === 1 && Number(digits) > 1) return `0${digits}/`;
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function openCardSheet({ scope, onAdded = () => {} } = {}) {
  openSheet({
    title: te('pay.add.title'),
    body: `<form class="pay-form" data-card-form novalidate autocomplete="on">
      <div class="pay-brands" aria-label="${te('pay.accepted')}">${Object.keys(CARD_BRANDS).map((brand) => brandBadge(brand, ' pay-brand--small')).join('')}</div>
      <p class="demo t-small pay-demo">${icon('lock', { size: 18 })}<span>${te('pay.demo.add')}</span></p>
      <label class="field"><span class="t-label">${te('pay.field.number')}</span>
        <span class="pay-number"><input class="input" name="number" inputmode="numeric" autocomplete="cc-number" maxlength="23" placeholder="1234 5678 9012 3456" data-autofocus aria-describedby="card-number-error" />${brandBadge('', ' pay-brand--live')}</span>
        <span class="field-error" id="card-number-error" role="alert" data-error="number"></span></label>
      <div class="pay-row">
        <label class="field"><span class="t-label">${te('pay.field.expiry')}</span><input class="input" name="expiry" inputmode="numeric" autocomplete="cc-exp" maxlength="7" placeholder="${te('pay.field.expiryHint')}" aria-describedby="card-expiry-error" /><span class="field-error" id="card-expiry-error" role="alert" data-error="expiry"></span></label>
        <label class="field"><span class="t-label">${te('pay.field.cvc')}</span><input class="input" name="cvc" type="password" inputmode="numeric" autocomplete="cc-csc" maxlength="3" placeholder="•••" aria-describedby="card-cvc-error" /><span class="field-error" id="card-cvc-error" role="alert" data-error="cvc"></span></label>
      </div>
      <label class="field"><span class="t-label">${te('pay.field.name')}</span><input class="input" name="name" autocomplete="cc-name" maxlength="60" aria-describedby="card-name-error" /><span class="field-error" id="card-name-error" role="alert" data-error="name"></span></label>
      <label class="check"><input type="checkbox" name="makeDefault" /><span>${te('pay.field.default')}</span></label>
      <p class="field-error" role="alert" data-error="form"></p>
      <button class="btn btn--primary" type="submit">${te('pay.add.save')}</button>
      <button class="btn btn--text" type="button" data-test-card>${te('pay.add.test')}</button>
    </form>`,
    onMount(panel) {
      const form = panel.querySelector('[data-card-form]'), { number, expiry, cvc, name } = form.elements;
      const live = panel.querySelector('.pay-brand--live');
      const clearSecrets = () => { number.value = ''; cvc.value = ''; };
      // The sheet can close by backdrop, Escape or drag: the number and code go with it.
      const watcher = new MutationObserver(() => { if (!panel.isConnected || panel.classList.contains('is-leaving')) { clearSecrets(); watcher.disconnect(); } });
      watcher.observe(panel, { attributes: true, attributeFilter: ['class'] });
      if (panel.parentNode) watcher.observe(panel.parentNode, { childList: true });
      function paintBrand() {
        const brand = detectBrand(number.value), spec = CARD_BRANDS[brand];
        live.className = `pay-brand pay-brand--${brand || 'none'} pay-brand--live`;
        live.textContent = brandLabel(brand) || t('pay.brand.unknown');
        cvc.maxLength = spec?.cvc || 3; cvc.placeholder = '•'.repeat(spec?.cvc || 3);
        if (cvc.value.length > cvc.maxLength) cvc.value = cvc.value.slice(0, cvc.maxLength);
      }
      function setErrors(errors = []) {
        for (const field of FIELDS) {
          const bad = errors.includes(field);
          panel.querySelector(`[data-error="${field}"]`).textContent = bad ? t(`pay.error.${field}`) : '';
          form.elements[field].setAttribute('aria-invalid', String(bad));
        }
      }
      number.addEventListener('input', () => {
        const atEnd = number.selectionStart === number.value.length;
        const formatted = formatCardNumber(digitsOf(number.value).replace(/\D/g, ''));
        if (formatted !== number.value) { number.value = formatted; if (atEnd) number.setSelectionRange(formatted.length, formatted.length); }
        paintBrand();
      });
      expiry.addEventListener('input', (event) => {
        if (event.inputType?.startsWith('delete')) return;
        expiry.value = formatExpiry(expiry.value);
      });
      cvc.addEventListener('input', () => { cvc.value = cvc.value.replace(/\D/g, '').slice(0, cvc.maxLength); });
      panel.querySelector('[data-test-card]').addEventListener('click', () => {
        const sample = TEST_CARDS[testIndex++ % TEST_CARDS.length], next = new Date();
        number.value = formatCardNumber(sample.number);
        expiry.value = `${String(next.getMonth() + 1).padStart(2, '0')}/${String(next.getFullYear() + 3).slice(-2)}`;
        cvc.value = '1234'.slice(0, CARD_BRANDS[sample.brand].cvc);
        if (!name.value.trim()) name.value = t('pay.add.sampleName');
        paintBrand(); setErrors();
        toast(t(sample.declines ? 'pay.add.testDeclines' : 'pay.add.testFilled', { brand: brandLabel(sample.brand) }));
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const result = addCard(scope, { number: number.value, expiry: expiry.value, cvc: cvc.value, name: name.value }, { makeDefault: form.elements.makeDefault.checked });
        const formError = panel.querySelector('[data-error="form"]');
        if (!result.ok) {
          setErrors(result.errors || []);
          formError.textContent = result.error === 'VALIDATION' ? '' : t(`pay.error.${result.error === 'STORAGE' ? 'storage' : result.error === 'DUPLICATE' ? 'duplicate' : result.error === 'LIMIT' ? 'limit' : 'signedOut'}`);
          (form.elements[result.errors?.[0]] || number).focus();
          return;
        }
        clearSecrets(); watcher.disconnect(); closeSheet();
        toast(t('pay.add.saved', { brand: brandLabel(result.card.brand), last4: result.card.last4 }));
        onAdded(result.card);
      });
      paintBrand();
    },
  });
}
