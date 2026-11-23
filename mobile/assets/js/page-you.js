// InsTrip mobile — You tab (spec §6.15).
// Guest or signed-in header, the trip pass card, section links, help, and the
// display settings (language, motion, transparency, larger text).

import { t, te, esc, getLocale, setLocale, LOCALES } from './i18n.js';
import { usd } from './format.js';
import { icon } from './icons.js';
import { toast, getSettings, setSetting, skyline } from './ui.js';
import { go } from './router.js';
import { getSession, signOut } from './auth.js';
import { openLogin } from './login.js';
import { PASS_PRICE_CENTS } from './seed.js';

const LINKS = [
  ['trips', 'trip'],
  ['orders', 'check'],
  ['films', 'film'],
  ['crafts', 'craft'],
  ['saved', 'heart'],
  ['social', 'message'],
  ['wallet', 'card'],
  ['map', 'globe'],
  ['production', 'craft'],
];

const ROUTES = { trips: 'trip', orders: 'orders', films: 'library', crafts: 'crafts', saved: 'saved', social: 'social', wallet: 'wallet', map: 'map', production: 'make-orders' };

function link(key, name) {
  const route = ROUTES[key];
  return `<button class="row" ${route ? `data-you-route="${route}"` : 'data-soon'} data-track="you_${key}">
    <span class="row__icon">${icon(name)}</span>
    <span class="row__text"><strong>${te(`you.${key}`)}</strong></span>
    ${icon('chevron', { size: 20 })}
  </button>`;
}

function toggle(key, on) {
  return `<button class="row row--switch" role="switch" aria-checked="${on}" data-setting="${key}">
    <span class="row__text"><strong>${te(`you.${key}`)}</strong></span>
    <span class="switch" aria-hidden="true"><i></i></span>
  </button>`;
}

export function renderYou(root) {
  const settings = getSettings();
  const locale = getLocale();
  const session = getSession();

  root.innerHTML = `
    <section class="page page--tab page--you">
      ${skyline()}
      <h1 class="t-title">${te('you.title')}</h1>

      <div class="you-head">
        ${session && !session.localOnly
          ? `<button class="window window--moon you-head__avatar you-head__avatar--link" data-profile aria-label="${te('profile.open')}">${icon('you', { size: 28 })}</button>`
          : `<div class="window window--moon you-head__avatar" aria-hidden="true">${icon('you', { size: 28 })}</div>`}
        <div>
          ${session
            ? `<p class="t-heading you-head__email">${session.localOnly ? te('experience.title') : esc(session.email)}</p>
               ${session.localOnly ? `<p class="t-small">${te('experience.description')}</p>` : `<button class="btn btn--text btn--inline" data-profile>${te('profile.open')}</button>`}
               <button class="btn btn--text btn--inline" data-signout>${te(session.localOnly ? 'experience.exit' : 'you.signout')}</button>`
            : `<p class="t-heading">${te('you.guest')}</p>
               <button class="btn btn--text btn--inline" data-signin data-track="login_start">${te('you.signin')}</button>`}
        </div>
      </div>

      <article class="card pass">
        <div class="pass__copy">
          <h2 class="t-heading">${te('pass.title')}</h2>
          <p class="t-body">${te('pass.body')}</p>
          <p class="t-small t-num">${te('pass.price', { price: usd(PASS_PRICE_CENTS) })}</p>
          <button class="btn btn--small" data-soon data-track="pass_cta">${te('pass.cta')}</button>
        </div>
        <div class="pass__locked glass glass--reeded" role="img" aria-label="${te('pass.locked')}">${icon('lock')}</div>
      </article>

      <div class="rows card">${LINKS.map(([key, name]) => link(key, name)).join('')}</div>

      <h2 class="t-label section-label">${te('you.section.settings')}</h2>
      <div class="rows card">
        <div class="row row--static">
          <span class="row__icon">${icon('globe')}</span>
          <span class="row__text"><strong id="lang-label">${te('you.language')}</strong></span>
          <div class="segmented segmented--compact" role="radiogroup" aria-labelledby="lang-label">
            ${LOCALES.map((code) => `
              <button class="segmented__item${code === locale ? ' is-on' : ''}" role="radio" aria-checked="${code === locale}" data-locale="${code}" lang="${code === 'zh' ? 'zh-CN' : 'en'}"><span>${te(`lang.${code}`)}</span></button>`).join('')}
          </div>
        </div>
        <button class="row row--switch" role="switch" aria-checked="${settings.assistant === true}" data-setting="assistant" aria-describedby="assistant-setting-note">
          <span class="row__text"><strong>${te('you.assistant')}</strong><span class="t-small" id="assistant-setting-note">${te('you.assistant.note')}</span></span>
          <span class="switch" aria-hidden="true"><i></i></span>
        </button>
        ${toggle('senior', !!settings.senior)}
        ${toggle('motion', settings.motion === 'reduced')}
        ${toggle('glass', settings.glass === 'solid')}
      </div>

      <div class="rows card">
        ${settings.senior
          // Senior mode has no Stories tab in the bar; this keeps the page reachable.
          ? `<button class="row" data-stories><span class="row__icon">${icon('stories')}</span><span class="row__text"><strong>${te('nav.stories')}</strong></span>${icon('chevron', { size: 20 })}</button>`
          : ''}
        <button class="row" data-you-route="apply"><span class="row__icon">${icon('friends')}</span><span class="row__text"><strong>${te('you.apply')}</strong></span>${icon('chevron', { size: 20 })}</button>
        <button class="row" data-help data-track="support_open"><span class="row__icon">${icon('help')}</span><span class="row__text"><strong>${te('you.help')}</strong></span>${icon('chevron', { size: 20 })}</button>
      </div>

      <nav class="legal" aria-label="${te('legal.terms')}">
        <button class="btn btn--text btn--inline" data-soon>${te('legal.terms')}</button>
        <button class="btn btn--text btn--inline" data-soon>${te('legal.privacy')}</button>
        <button class="btn btn--text btn--inline" data-soon>${te('legal.refunds')}</button>
      </nav>
    </section>`;

  root.querySelector('.page--you').addEventListener('click', async (event) => {
    const localeBtn = event.target.closest('[data-locale]');
    if (localeBtn) {
      if (localeBtn.dataset.locale === getLocale()) return;
      await setLocale(localeBtn.dataset.locale); // app.js re-renders on locale change
      toast(t('lang.changed'));
      return;
    }

    const sw = event.target.closest('[data-setting]');
    if (sw) {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      const key = sw.dataset.setting;
      if (key === 'senior') setSetting('senior', on);
      if (key === 'assistant') { setSetting('assistant', on); toast(t(on ? 'you.assistant.on' : 'you.assistant.off')); }
      if (key === 'motion') setSetting('motion', on ? 'reduced' : 'auto');
      if (key === 'glass') setSetting('glass', on ? 'solid' : 'auto');
      return;
    }

    if (event.target.closest('[data-signin]')) { openLogin(); return; }
    if (event.target.closest('[data-signout]')) {
      const button = event.target.closest('[data-signout]');
      button.disabled = true;
      try { await signOut(); toast(t(session?.localOnly ? 'experience.exited' : 'you.signedout')); }
      catch (error) { toast(t(error.code === 'STORAGE' ? 'error.STORAGE' : 'online.auth.unavailable')); if (button.isConnected) button.disabled = false; }
      return;
    }
    if (event.target.closest('[data-help]')) { go('support'); return; }
    if (event.target.closest('[data-profile]')) { go('u/me'); return; }
    if (event.target.closest('[data-stories]')) { go('stories'); return; }
    const youRoute = event.target.closest('[data-you-route]')?.dataset.youRoute;
    if (youRoute) { go(youRoute); return; }
    if (event.target.closest('[data-soon]')) toast(t('phase.next'));
  });
}
