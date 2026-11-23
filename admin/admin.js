// Same-origin administration. All authorization and transitions are enforced by /api.
import { api, initApi, getRuntimeConfig, setCsrfToken, onUnauthorized } from '../js/api.js';
import { createRequestGate, pathId, safeMediaUrl, safeModelUrl, parseMoney, canQuoteInquiry, inquiryTransitions } from '../js/community.js';

const root = document.getElementById('admin-root');
const dictionaries = {};
let lang = navigator.language?.startsWith('zh') ? 'zh' : 'en';
let user = null, section = 'posts', filter = 'PENDING', selected = null, inquiry = null, busy = false, authBusy = false;
const gate = createRequestGate(); let request;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const text = (key, values = {}) => (dictionaries[lang]?.[key] || dictionaries.en?.[key] || key).replace(/\{(\w+)\}/g, (match, name) => name in values ? String(values[name]) : match);
const html = (key, values) => esc(text(key, values));
const preference = (kind, value) => dictionaries[lang]?.[`community.${kind}.${value}`] ? text(`community.${kind}.${value}`) : String(value ?? '');
const state = value => `<span class="community-state community-state--${esc(String(value).toLowerCase())}">${html(`community.state.${value}`)}</span>`;
const date = value => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed); };
const money = value => Number.isSafeInteger(value) ? new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en', { style: 'currency', currency: 'CNY' }).format(value / 100) : text('community.inquiry.unquoted');
function errorMessage(error) { return text(error?.status === 401 ? 'community.error.auth' : error?.status === 403 ? 'community.error.forbidden' : error?.status === 409 ? 'community.error.conflict' : error?.status === 422 || error?.status === 400 ? 'community.error.validation' : error?.status === 429 ? 'community.error.rate' : 'community.error.service'); }
function stopVideos() { root.querySelectorAll('video').forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); }); }
function current(candidate) { return gate.current(candidate); }
function message(value, error = false) { const node = root.querySelector(error ? '[data-error]' : '[data-message]'); if (node) node.textContent = value; }
function resetSession() {
  gate.next(); user = null; inquiry = null; selected = null; authBusy = false; busy = false; setCsrfToken(''); stopVideos(); paintFrame();
}
onUnauthorized(resetSession);

function paintFrame() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; document.title = text('community.admin.title');
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = `<header class="admin-header"><div><a class="admin-brand" href="../">Along</a><h1 class="t-title">${html('community.admin.title')}</h1><p class="t-small">${html('community.admin.subtitle')}</p></div><div class="admin-account"><label>${html('community.admin.language')}<select class="input" data-language><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option><option value="zh" ${lang === 'zh' ? 'selected' : ''}>中文</option></select></label>${user ? `<span>${esc(user.displayName || user.email)}</span><button class="btn btn--secondary" data-logout>${html('community.admin.signOut')}</button>` : ''}</div></header><p class="admin-message" role="status" aria-live="polite" data-message></p><p class="field-error" role="alert" data-error></p><div data-workspace></div>`;
  const workspace = root.querySelector('[data-workspace]');
  if (!user) {
    const available = getRuntimeConfig().authAvailable;
    workspace.innerHTML = `<section class="admin-login"><h2 class="t-heading">${html('community.signIn')}</h2>${!available ? `<p class="note">${html('community.admin.authUnavailable')}</p>` : ''}<form class="community-form" data-login-form><label class="field"><span>${html('community.admin.email')}</span><input class="input" name="email" type="email" autocomplete="email" required maxlength="254" ${!available ? 'disabled' : ''}></label><button class="btn btn--secondary" type="button" data-send-code ${!available ? 'disabled' : ''}>${html('community.admin.sendCode')}</button><p class="note" data-dev-code hidden></p><label class="field"><span>${html('community.admin.code')}</span><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required ${!available ? 'disabled' : ''}></label><button class="btn btn--primary" type="submit" ${!available ? 'disabled' : ''}>${html('community.admin.verify')}</button></form></section>`;
  } else if (user.role !== 'ADMIN') workspace.innerHTML = `<p class="note">${html('community.admin.denied')}</p>`;
  else workspace.innerHTML = `<nav class="admin-tabs" aria-label="${html('community.admin.title')}">${['posts', 'comments', 'reports', 'inquiries'].map(item => `<button class="btn ${section === item ? 'btn--primary' : 'btn--secondary'}" data-section="${item}" aria-current="${section === item ? 'page' : 'false'}">${html(`community.admin.${item}`)}</button>`).join('')}</nav><div class="admin-toolbar">${['posts', 'comments'].includes(section) ? `<label>${html('community.admin.status')}<select class="input" data-filter>${['PENDING', 'PUBLIC', 'REJECTED', 'HIDDEN'].map(value => `<option value="${value}" ${filter === value ? 'selected' : ''}>${html(`community.state.${value}`)}</option>`).join('')}</select></label>` : ''}<button class="btn btn--secondary" data-refresh>${html('community.refresh')}</button></div><div data-content></div>`;
}
function mediaMarkup(media) {
  const url = safeMediaUrl(media?.url); if (!url || media.status !== 'READY') return '';
  const poster = safeMediaUrl(media.posterUrl);
  return media.kind === 'VIDEO' ? `<video class="admin-media" controls muted playsinline preload="none" src="${esc(url)}" ${poster ? `poster="${esc(poster)}"` : ''} aria-label="${html('community.video')}"></video>` : `<img class="admin-media" src="${esc(url)}" alt="${html('community.photo')}" loading="lazy">`;
}
function reviewForm(item, kind) {
  return `<form class="community-form admin-review" data-review="${kind}" data-id="${esc(item.id)}"><label class="field"><span>${html('community.admin.status')}</span><select class="input" name="status"><option value="PUBLIC">${html('community.admin.approve')}</option><option value="REJECTED">${html('community.admin.reject')}</option><option value="HIDDEN">${html('community.admin.hide')}</option></select></label><label class="field"><span>${html('community.admin.note')}</span><textarea class="input input--area" name="note" rows="2" maxlength="2000">${esc(item.reviewNote || '')}</textarea></label><button class="btn btn--primary" type="submit">${html('community.admin.applyReview')}</button></form>`;
}
function paintItems(items) {
  const content = root.querySelector('[data-content]'); if (!content) return;
  if (!items.length) { content.innerHTML = `<p class="note">${html('community.admin.none')}</p>`; return; }
  if (section === 'posts') content.innerHTML = `<div class="admin-grid">${items.map(item => `<article class="admin-card">${state(item.status)}<h2 class="t-heading">${esc(item.title)}</h2><p class="t-small">${esc(item.author?.displayName)} · ${esc(item.city)} · ${esc(date(item.createdAt))}</p><div class="admin-media-grid">${(item.media || []).map(mediaMarkup).join('')}</div><p class="community-prose">${esc(item.body)}</p><p class="t-small">${esc((item.tags || []).join(' · '))}</p><a href="../#/posts/${pathId(item.id)}" target="_blank" rel="noopener">${html('community.admin.openPost')}</a>${reviewForm(item, 'posts')}</article>`).join('')}</div>`;
  else if (section === 'comments') content.innerHTML = `<div class="admin-grid">${items.map(item => `<article class="admin-card">${state(item.status)}<h2 class="t-heading">${esc(item.author?.displayName)}</h2><p class="t-small">${esc(date(item.createdAt))}</p><p class="community-prose">${esc(item.body)}</p>${item.postId ? `<a href="../#/posts/${pathId(item.postId)}" target="_blank" rel="noopener">${html('community.admin.openPost')}</a>` : ''}${reviewForm(item, 'comments')}</article>`).join('')}</div>`;
  else if (section === 'reports') content.innerHTML = `<p class="note">${html('community.admin.reportNotice')}</p><div class="admin-grid">${items.map(item => `<article class="admin-card"><span class="community-state">${html(item.resolved ? 'community.admin.resolved' : 'community.admin.open')}</span><h2 class="t-heading">${html('community.admin.target')}</h2><p class="t-small">${esc(item.targetType)} · ${esc(item.targetId)}</p>${item.targetType === 'POST' ? `<a href="../#/posts/${pathId(item.targetId)}" target="_blank" rel="noopener">${html('community.admin.openPost')}</a>` : ''}<p class="community-prose">${esc(item.reason)}</p><p class="t-small">${esc(date(item.createdAt))}</p>${item.resolved ? `<p class="community-prose">${esc(item.note)}</p>` : `<form class="community-form" data-resolve="${esc(item.id)}"><label class="field"><span>${html('community.admin.reportNote')}</span><textarea class="input input--area" name="note" rows="3" maxlength="2000" required></textarea></label><button class="btn btn--primary" type="submit">${html('community.admin.resolve')}</button></form>`}</article>`).join('')}</div>`;
  else content.innerHTML = `<div class="admin-grid">${items.map(item => `<article class="admin-card">${state(item.status)}<h2 class="t-heading">${html(item.product === 'KEYCHAIN' ? 'community.inquiry.KEYCHAIN' : 'community.inquiry.MAGNET')} × ${esc(item.quantity)}</h2><p class="t-small">${esc(item.id)}</p><p>${html('community.inquiry.modelVersion')}: ${esc(item.modelVersion)}</p><p class="t-small">${esc(date(item.updatedAt || item.createdAt))}</p><button class="btn btn--secondary" data-inquiry="${esc(item.id)}">${html('community.admin.privateDetail')}</button></article>`).join('')}</div>`;
}
function paintInquiry(model) {
  const content = root.querySelector('[data-content]'); if (!content || !inquiry) return;
  const q = inquiry.quote, shipping = inquiry.shipping || {}, transitions = inquiryTransitions(inquiry.status);
  content.innerHTML = `<button class="btn btn--text" data-back>${html('community.admin.backList')}</button><article class="admin-card admin-detail"><div class="community-heading"><h2 class="t-heading">${html('community.inquiry.detail')}</h2>${state(inquiry.status)}</div><p class="t-small">${esc(inquiry.id)} · ${esc(date(inquiry.updatedAt))}</p><dl class="community-facts"><div><dt>${html('community.inquiry.product')}</dt><dd>${html(inquiry.product === 'KEYCHAIN' ? 'community.inquiry.KEYCHAIN' : 'community.inquiry.MAGNET')}</dd></div><div><dt>${html('community.inquiry.quantity')}</dt><dd>${esc(inquiry.quantity)}</dd></div><div><dt>${html('community.inquiry.material')}</dt><dd>${esc(preference('material', inquiry.material))}</dd></div><div><dt>${html('community.inquiry.colorProcess')}</dt><dd>${esc(preference('color', inquiry.colorProcess))}</dd></div><div><dt>${html('community.inquiry.modelVersion')}</dt><dd>${esc(inquiry.modelVersion)}</dd></div></dl><h3 class="t-heading">${html('community.inquiry.notes')}</h3><p class="community-prose">${esc(inquiry.notes)}</p>${inquiry.statusNote ? `<p class="note">${esc(inquiry.statusNote)}</p>` : ''}<section class="community-private"><h3 class="t-heading">${html('community.inquiry.shipping')}</h3><p class="t-small">${html('community.inquiry.privateShipping')}</p><address class="community-prose">${esc(shipping.name)} · ${esc(shipping.phone)}<br>${esc(shipping.region)} ${esc(shipping.address)}<br>${esc(shipping.postalCode)}</address></section>${model ? `<section><h3 class="t-heading">${html('community.admin.modelFiles')}</h3><div class="community-actions">${['glb', 'stl'].map(type => { const url = safeModelUrl(model[`${type}Url`]); return url ? `<a class="btn btn--secondary" href="${esc(url)}" download>${html(`community.admin.${type}`)}</a>` : ''; }).join('')}</div></section>` : ''}${q ? `<section class="community-quote"><h3 class="t-heading">${html('community.inquiry.latestQuote', { revision: q.revision })}</h3><dl class="community-facts"><div><dt>${html('community.inquiry.production')}</dt><dd>${esc(money(q.productionCents))}</dd></div><div><dt>${html('community.inquiry.shippingCost')}</dt><dd>${esc(money(q.shippingCents))}</dd></div><div><dt>${html('community.inquiry.total')}</dt><dd>${esc(money(q.totalCents))}</dd></div><div><dt>${html('community.inquiry.leadDays')}</dt><dd>${html('community.inquiry.days', { n: q.leadDays })}</dd></div></dl><p class="community-prose">${esc(q.note)}</p></section>` : `<p class="note">${html('community.inquiry.unquoted')}</p>`}${canQuoteInquiry(inquiry.status) ? `<form class="community-form community-private" data-quote-form><h3 class="t-heading">${html('community.admin.quote')}</h3><p class="t-small">${html('community.admin.quoteNotice')}</p><div class="field-row"><label class="field"><span>${html('community.admin.productionAmount')}</span><input class="input" name="production" inputmode="decimal" required value="${q ? (q.productionCents / 100).toFixed(2) : ''}"></label><label class="field"><span>${html('community.admin.shippingAmount')}</span><input class="input" name="shipping" inputmode="decimal" required value="${q ? (q.shippingCents / 100).toFixed(2) : ''}"></label></div><label class="field"><span>${html('community.admin.leadDays')}</span><input class="input" type="number" name="days" min="1" max="365" step="1" required value="${esc(q?.leadDays || '')}"></label><label class="field"><span>${html('community.admin.note')}</span><textarea class="input input--area" name="note" rows="3" maxlength="2000">${esc(q?.note || '')}</textarea></label><button class="btn btn--primary" type="submit">${html('community.admin.saveQuote')}</button></form>` : ''}${transitions.length ? `<form class="community-form community-private" data-state-form><h3 class="t-heading">${html('community.admin.transition')}</h3><p class="t-small">${html('community.admin.stateNotice')}</p><label class="field"><span>${html('community.admin.nextState')}</span><select class="input" name="status">${transitions.map(value => `<option value="${value}">${html(`community.state.${value}`)}</option>`).join('')}</select></label><label class="field"><span>${html('community.admin.note')}</span><textarea class="input input--area" name="note" maxlength="2000" rows="3"></textarea></label>${transitions.includes('SHIPPED') ? `<label class="field"><span>${html('community.admin.carrier')}</span><input class="input" name="carrier" maxlength="100" required></label><label class="field"><span>${html('community.admin.trackingNumber')}</span><input class="input" name="number" maxlength="100" required></label>` : ''}<button class="btn btn--primary" type="submit">${html('community.admin.saveState')}</button></form>` : ''}${inquiry.tracking ? `<h3 class="t-heading">${html('community.inquiry.tracking')}</h3><p>${esc(inquiry.tracking.carrier)} · ${esc(inquiry.tracking.number)}</p>` : ''}</article>`;
}
async function loadView(success = '') {
  if (user?.role !== 'ADMIN') return;
  request = gate.next(); const candidate = request; inquiry = null; busy = false; stopVideos();
  const content = root.querySelector('[data-content]'); if (!content) return;
  content.innerHTML = `<p role="status">${html('community.loading')}</p>`; message(''); message('', true);
  try {
    if (section === 'inquiries' && selected) {
      const response = await api(`/inquiries/${pathId(selected)}`, { signal: candidate.signal });
      if (!current(candidate)) return;
      inquiry = response.inquiry;
      let model = null;
      try { const detail = await api(`/craft-models/${pathId(inquiry.modelId)}`, { signal: candidate.signal }); if (current(candidate)) model = detail.model; }
      catch (error) { if (current(candidate)) message(errorMessage(error), true); }
      if (current(candidate)) paintInquiry(model);
    } else {
      const response = await api(`/admin/${section}${['posts', 'comments'].includes(section) ? `?status=${encodeURIComponent(filter)}` : ''}`, { signal: candidate.signal });
      if (current(candidate)) paintItems(response.items || []);
    }
    if (current(candidate)) message(success);
  } catch (error) {
    if (!current(candidate)) return;
    content.innerHTML = '';
    if (error.status === 403) { user = { ...user, role: 'USER' }; paintFrame(); }
    message(errorMessage(error), true);
  }
}
async function verifySession() {
  request = gate.next(); const candidate = request;
  try {
    const response = await api('/auth/session', { signal: candidate.signal });
    if (!current(candidate)) return;
    user = response.user; setCsrfToken(response.csrfToken || '');
    if (user?.role === 'ADMIN') {
      // Do not grant the admin workspace from client state alone.
      await api('/admin/posts?status=PENDING', { signal: candidate.signal });
      if (!current(candidate)) return;
    }
    paintFrame(); if (user?.role === 'ADMIN') await loadView();
  } catch (error) { if (current(candidate)) { if (error.status === 403 && user) user = { ...user, role: 'USER' }; paintFrame(); message(errorMessage(error), true); } }
}
async function write(path, body) {
  if (busy || user?.role !== 'ADMIN') return;
  const candidate = request; busy = true; message(text('community.sending')); message('', true);
  root.querySelectorAll('[data-content] button, [data-content] input, [data-content] select, [data-content] textarea').forEach(control => { control.disabled = true; });
  try { await api(path, { method: 'POST', body, signal: candidate.signal }); if (current(candidate)) await loadView(text('community.admin.updated')); }
  catch (error) { if (current(candidate)) { message(''); message(errorMessage(error), true); if (error.status === 409) await loadView(text('community.inquiry.changed')); } }
  finally { if (current(candidate)) { busy = false; root.querySelectorAll('[data-content] button, [data-content] input, [data-content] select, [data-content] textarea').forEach(control => { control.disabled = false; }); } }
}
root.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-send-code')) {
    const form = button.closest('form'); if (authBusy || !form.elements.email.reportValidity()) return;
    authBusy = true; button.disabled = true; message(''); message('', true);
    const candidate = request = gate.next();
    const dev = form.querySelector('[data-dev-code]'); dev.textContent = ''; dev.hidden = true;
    try {
      const response = await api('/auth/otp', { method: 'POST', body: { email: form.elements.email.value.trim() }, signal: candidate.signal });
      if (!current(candidate)) return;
      if (!response.ok) throw new Error('OTP unavailable');
      message(text('community.admin.codeSent'));
      if (getRuntimeConfig().mode === 'development' && response.code) { dev.textContent = text('community.admin.devCode', { code: response.code }); dev.hidden = false; }
    } catch (error) { if (current(candidate)) message(errorMessage(error), true); }
    finally { if (current(candidate)) { authBusy = false; button.disabled = false; } }
  } else if (button.hasAttribute('data-logout')) {
    if (authBusy) return; authBusy = true; button.disabled = true;
    try { await api('/auth/logout', { method: 'POST' }); resetSession(); }
    catch (error) { message(errorMessage(error), true); authBusy = false; button.disabled = false; }
  } else if (button.dataset.section) { section = button.dataset.section; selected = null; stopVideos(); paintFrame(); loadView(); }
  else if (button.dataset.inquiry) { selected = button.dataset.inquiry; loadView(); }
  else if (button.hasAttribute('data-back')) { selected = null; loadView(); }
  else if (button.hasAttribute('data-refresh')) loadView();
});
root.addEventListener('change', event => {
  if (event.target.hasAttribute('data-language')) { lang = event.target.value; gate.next(); authBusy = false; stopVideos(); paintFrame(); if (user?.role === 'ADMIN') loadView(); }
  else if (event.target.hasAttribute('data-filter')) { filter = event.target.value; loadView(); }
});
root.addEventListener('submit', async event => {
  const form = event.target; event.preventDefault();
  if (form.hasAttribute('data-login-form')) {
    if (authBusy) return; authBusy = true; const candidate = request = gate.next();
    form.querySelectorAll('button').forEach(button => { button.disabled = true; }); message(''); message('', true);
    try {
      const response = await api('/auth/verify', { method: 'POST', body: { email: form.elements.email.value.trim(), code: form.elements.code.value.trim() }, signal: candidate.signal });
      if (!current(candidate)) return;
      if (!response.ok) { message(text('community.admin.loginFailed'), true); return; }
      setCsrfToken(response.csrfToken || ''); await verifySession();
    } catch (error) { if (current(candidate)) message(errorMessage(error), true); }
    finally { authBusy = false; if (form.isConnected) form.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  } else if (form.dataset.review) write(`/admin/${form.dataset.review}/${pathId(form.dataset.id)}/review`, { status: form.elements.status.value, note: form.elements.note.value.trim() });
  else if (form.dataset.resolve) { const note = form.elements.note.value.trim(); if (!note) { message(text('community.error.reason'), true); return; } write(`/admin/reports/${pathId(form.dataset.resolve)}/resolve`, { note }); }
  else if (form.hasAttribute('data-quote-form') && inquiry) {
    const productionCents = parseMoney(form.elements.production.value), shippingCents = parseMoney(form.elements.shipping.value), leadDays = Number(form.elements.days.value);
    if (productionCents === null || productionCents < 1 || productionCents > 100000000 || shippingCents === null || shippingCents > 10000000 || !Number.isInteger(leadDays) || leadDays < 1 || leadDays > 365) { message(text('community.admin.quoteInvalid'), true); return; }
    write(`/admin/inquiries/${pathId(inquiry.id)}/quote`, { productionCents, shippingCents, leadDays, note: form.elements.note.value.trim() });
  } else if (form.hasAttribute('data-state-form') && inquiry) {
    const status = form.elements.status.value, note = form.elements.note.value.trim(), carrier = form.elements.carrier?.value.trim(), number = form.elements.number?.value.trim();
    if (status === 'SHIPPED' && (!carrier || !number)) { message(text('community.admin.shippingRequired'), true); return; }
    write(`/admin/inquiries/${pathId(inquiry.id)}/status`, { status, note, ...(status === 'SHIPPED' ? { carrier, number } : {}) });
  }
});
window.addEventListener('pagehide', () => { gate.dispose(); inquiry = null; stopVideos(); root.replaceChildren(); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
try {
  await Promise.all(['en', 'zh'].map(async code => { const response = await fetch(new URL(`../messages/community.${code}.json`, import.meta.url), { credentials: 'same-origin' }); if (!response.ok) throw new Error('Translations unavailable'); dictionaries[code] = await response.json(); }));
  await initApi(); paintFrame(); await verifySession();
} catch (error) { root.setAttribute('aria-busy', 'false'); root.textContent = text('community.error.service'); }
