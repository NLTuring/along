import { t, te, esc, getLocale } from './i18n.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { getSession, onSessionChange } from './auth.js';
import { openLogin } from './login.js';
import { api } from './api.js';
import { safeMediaUrl } from './community.js';

export function errorText(error) {
  if (error?.code === 'LOCAL_EXPERIENCE_ONLY') return t('experience.online.blocked');
  const key = ({ UNAUTHENTICATED: 'auth', FORBIDDEN: 'forbidden', NOT_FOUND: 'notFound', CONFLICT: 'conflict', RATE_LIMITED: 'rate', VALIDATION_ERROR: 'validation', MEDIA_FAILED: 'mediaFailed', MEDIA_TIMEOUT: 'mediaTimeout', MEDIA_NOT_OWNED_OR_READY: 'mediaFailed', MEDIA_TOO_LARGE: 'fileSize', IMAGE_TOO_LARGE: 'fileSize', NORMALIZED_IMAGE_TOO_LARGE: 'fileSize', UNSUPPORTED_MEDIA: 'fileType', INVALID_IMAGE: 'fileType', CONSENT_REQUIRED: 'consent', POST_NOT_PUBLIC: 'notPublic', QUOTE_CHANGED: 'quoteChanged', STALE_QUOTE: 'quoteChanged', CSRF_INVALID: 'auth' })[error?.code] || (error?.status === 409 ? 'conflict' : error?.status === 403 ? 'forbidden' : error?.status === 422 ? 'validation' : 'service');
  return t(`community.error.${key}`);
}
export function dateText(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(getLocale() === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
export function moneyText(cents) {
  return Number.isSafeInteger(cents) ? new Intl.NumberFormat(getLocale() === 'zh' ? 'zh-CN' : 'en', { style: 'currency', currency: 'CNY' }).format(cents / 100) : t('community.inquiry.unquoted');
}
export const stateHtml = status => `<span class="community-state community-state--${esc(String(status).toLowerCase())}">${te(`community.state.${status}`)}</span>`;
export function preferenceText(kind, value) {
  const known = kind === 'material' ? ['PLA', 'RESIN', 'ADVICE'] : ['SINGLE', 'FULL_COLOR', 'HAND_PAINTED', 'ADVICE'];
  return known.includes(value) ? t(`community.${kind}.${value}`) : String(value ?? '');
}
export function mediaHtml(media, { cover = false } = {}) {
  const url = safeMediaUrl(media?.url);
  if (!url || media?.status !== 'READY') return '';
  const poster = safeMediaUrl(media.posterUrl);
  if (media.kind === 'VIDEO') {
    return cover ? `<div class="community-cover">${poster ? `<img src="${esc(poster)}" alt="" loading="lazy">` : '<div class="community-video-placeholder" aria-hidden="true"></div>'}<span class="community-video-label">${te('community.video')}</span></div>` : `<video class="community-media" src="${esc(url)}" ${poster ? `poster="${esc(poster)}"` : ''} controls muted playsinline preload="none" aria-label="${te('community.video')}"></video>`;
  }
  return `<img class="${cover ? 'community-cover' : 'community-media'}" src="${esc(url)}" alt="${te('community.photo')}" loading="lazy">`;
}
export function stopMedia(root) {
  root.querySelectorAll('video').forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
}
export function needLogin(onDone, alive = () => true) {
  if (getSession()?.localOnly) { toast(t('experience.online.blocked')); return false; }
  if (getSession()) return true;
  const route = location.hash;
  openLogin({ onDone: () => { if (alive() && location.hash === route && getSession()) onDone?.(); } });
  return false;
}
// openSheet has no disposal hook: observe removal/leaving and cancel on navigation/account change.
export function sheetScope(panel, onDispose = () => {}) {
  const controller = new AbortController();
  let disposed = false;
  let offSession = () => {};
  const observer = new MutationObserver(() => {
    if (!panel.isConnected || panel.classList.contains('is-leaving')) dispose();
  });
  function dispose() {
    if (disposed) return;
    disposed = true; controller.abort(); observer.disconnect(); offSession();
    window.removeEventListener('hashchange', leave);
    stopMedia(panel); onDispose();
  }
  function leave() { if (panel.isConnected && !panel.classList.contains('is-leaving')) closeSheet(); dispose(); }
  observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  observer.observe(panel.parentNode, { childList: true });
  window.addEventListener('hashchange', leave);
  offSession = onSessionChange(leave);
  return { signal: controller.signal, alive: () => !disposed && panel.isConnected && !panel.classList.contains('is-leaving'), dispose };
}
export function notifyPosts() { document.dispatchEvent(new CustomEvent('along:community')); }
export function openReport(targetType, targetId, alive = () => true) {
  if (!needLogin(() => openReport(targetType, targetId, alive), alive)) return;
  openSheet({ title: te('community.report.title'), body: `<form class="community-form" data-report-form><label class="field"><span>${te('community.report.reason')}</span><textarea class="input input--area" name="reason" required maxlength="2000" rows="4" data-autofocus></textarea></label><p class="field-error" role="alert" data-error></p><button class="btn btn--primary" type="submit">${te('community.report.submit')}</button></form>`, onMount(panel) {
    const scope = sheetScope(panel), form = panel.querySelector('form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const reason = form.elements.reason.value.trim();
      if (!reason) { form.querySelector('[data-error]').textContent = t('community.error.reason'); return; }
      const button = form.querySelector('button'); button.disabled = true;
      try {
        await api('/reports', { method: 'POST', body: { targetType, targetId, reason }, signal: scope.signal });
        if (scope.alive()) { scope.dispose(); closeSheet(); toast(t('community.report.sent')); }
      } catch (error) { if (scope.alive()) form.querySelector('[data-error]').textContent = errorText(error); }
      finally { if (scope.alive()) button.disabled = false; }
    });
  } });
}
export function quoteHtml(quote) {
  return quote ? `<section class="community-quote"><h2 class="t-heading">${te('community.inquiry.latestQuote', { revision: quote.revision })}</h2><dl class="community-facts"><div><dt>${te('community.inquiry.production')}</dt><dd>${esc(moneyText(quote.productionCents))}</dd></div><div><dt>${te('community.inquiry.shippingCost')}</dt><dd>${esc(moneyText(quote.shippingCents))}</dd></div><div><dt>${te('community.inquiry.total')}</dt><dd>${esc(moneyText(quote.totalCents))}</dd></div><div><dt>${te('community.inquiry.leadDays')}</dt><dd>${te('community.inquiry.days', { n: quote.leadDays })}</dd></div></dl>${quote.note ? `<p class="community-prose">${esc(quote.note)}</p>` : ''}</section>` : `<p class="note">${te('community.inquiry.unquoted')}</p>`;
}
