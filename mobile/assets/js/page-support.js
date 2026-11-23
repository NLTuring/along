// InsTrip mobile — help (spec §6.17). Emergency numbers first, then the four common topics,
// then a person. Tapping 110 or 120 opens the phone's dialer.

import { t, te } from './i18n.js';
import { icon } from './icons.js';
import { toast, skyline, getSettings } from './ui.js';
import { go } from './router.js';

const TOPICS = ['payment', 'internet', 'tickets', 'safety'];

export function renderSupport(root) {
  root.innerHTML = `
    <section class="page page--tab page--support">
      ${skyline()}
      <h1 class="t-title">${te('support.title')}</h1>
      <p class="t-body page__sub">${te('support.sub')}</p>

      <section class="card urgent" aria-labelledby="urgent-title">
        <h2 class="t-label" id="urgent-title">${te('support.emergency')}</h2>
        <div class="urgent__calls">
          <a class="btn btn--outline" href="tel:110">${icon('phone', { size: 20 })}<span class="t-num">${te('support.police')}</span></a>
          <a class="btn btn--outline" href="tel:120">${icon('phone', { size: 20 })}<span class="t-num">${te('support.ambulance')}</span></a>
        </div>
      </section>

      <div class="rows card topics">
        ${TOPICS.map((key) => `
          <details class="topic">
            <summary class="row"><span class="row__text"><strong>${te(`support.topic.${key}`)}</strong></span>${icon('chevron', { size: 20 })}</summary>
            <p class="t-body">${te(`support.answer.${key}`)}</p>
          </details>`).join('')}
      </div>

      <button class="btn btn--primary" data-human data-track="support_human_click">${te('support.human')}</button>

      ${getSettings().senior
        // Senior mode has no You tab in the bar; this is the way back to settings.
        ? `<button class="btn btn--outline" data-settings>${te('senior.settings')}</button>`
        : ''}
    </section>`;

  // Inside the app shell the page hands tel: to the shell, which opens the phone's dialer; the
  // shell accepts tel: links (see mobile/tools/android_dex.py). In a browser the link is left to
  // the browser, which dials. If the shell cannot open it, say the number instead of failing quietly.
  root.querySelector('.urgent__calls').addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="tel:"]');
    if (!link || !window.Android?.openExternal) return;
    event.preventDefault();
    const number = link.getAttribute('href').slice(4);
    try {
      window.Android.openExternal(link.getAttribute('href'));
    } catch {
      toast(t('support.dial', { number }));
      return;
    }
    // The dialer usually covers the app; if the page is still in front, add the number as a fallback.
    setTimeout(() => { if (!document.hidden) toast(t('support.dial', { number })); }, 1500);
  });

  root.querySelector('[data-human]').addEventListener('click', () => toast(t('support.human.off')));
  root.querySelector('[data-settings]')?.addEventListener('click', () => go('you'));
}
