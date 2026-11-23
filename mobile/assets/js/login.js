// InsTrip mobile — sign in (spec §6.16). A sheet over the current page, so the
// page and whatever was chosen on it are still there afterwards.

import { t, te } from './i18n.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { requestCode, verifyCode, validEmail, localExperienceAvailable, startLocalExperience } from './auth.js';

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const minutesUntil = (until) => Math.max(1, Math.ceil((until - Date.now()) / 60_000));

export function openLogin({ onDone } = {}) {
  let email = '';
  let expiresAt = 0;
  let timer = null;
  let developmentCode = false;

  openSheet({
    title: te('login.title'),
    body: `
      ${localExperienceAvailable() ? `<section class="note" aria-label="${te('experience.title')}">
        <p class="t-body">${te('experience.description')}</p>
        <button class="btn btn--primary" type="button" data-local-experience>${te('experience.enter')}</button>
      </section>` : ''}
      <form class="login" novalidate>
        <p class="t-body">${te('login.sub')}</p>
        <label class="field"><span class="t-label">${te('login.email')}</span>
          <input class="input" type="email" name="email" autocomplete="email" inputmode="email" data-autofocus aria-describedby="login-email-error" /></label>
        <p class="field-error t-small" id="login-email-error" role="alert"></p>
        <label class="check"><input type="checkbox" name="agree" aria-describedby="login-agree-error" /><span>${te('login.agree')}</span></label>
        <p class="field-error t-small" id="login-agree-error" role="alert"></p>
        <button class="btn btn--primary" type="submit" data-track="otp_sent">${te('login.send')}</button>
      </form>
      <form class="login" novalidate hidden>
        <p class="t-body" data-sent></p>
        <label class="otp">
          <span class="sr-only">${te('login.code.label')}</span>
          <input class="otp__input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" aria-describedby="login-code-error" />
          <span class="otp__cells" aria-hidden="true">${'<i></i>'.repeat(6)}</span>
        </label>
        <p class="field-error t-small" id="login-code-error" role="alert"></p>
        <p class="t-small t-num" data-expires></p>
        <p class="note t-small t-num" data-demo></p>
        <button class="btn btn--text" type="button" data-resend>${te('login.resend')}</button>
        <button class="btn btn--text" type="button" data-change>${te('login.change')}</button>
      </form>`,
    onMount(panel) {
      const title = panel.querySelector('#sheet-title');
      const [emailForm, codeForm] = panel.querySelectorAll('form');
      const emailInput = emailForm.elements.email;
      const agree = emailForm.elements.agree;
      const codeInput = codeForm.elements.code;
      const cells = [...codeForm.querySelectorAll('.otp__cells i')];
      const say = (id, text) => { panel.querySelector(`#${id}`).textContent = text; };
      panel.querySelector('[data-local-experience]')?.addEventListener('click', () => {
        const result = startLocalExperience();
        if (!result.ok) { toast(t('experience.unavailable')); return; }
        clearInterval(timer);
        closeSheet();
        toast(t(result.persistent ? 'experience.entered' : 'experience.memory'));
        onDone?.();
      });

      function paintCells() {
        const value = codeInput.value;
        cells.forEach((cell, i) => {
          cell.textContent = value[i] || '';
          cell.classList.toggle('is-filled', i < value.length);
          cell.classList.toggle('is-next', i === value.length);
        });
      }

      function tick() {
        if (!panel.isConnected) { clearInterval(timer); return; }
        const left = expiresAt - Date.now();
        codeForm.querySelector('[data-expires]').textContent = left > 0
          ? t('login.code.expires', { time: mmss(left) })
          : t('login.code.expired');
      }

      let sending = false;
      let verifying = false;
      const live = () => panel.isConnected && !panel.classList.contains('is-leaving');

      async function send() {
        if (sending) return t('online.wait');
        sending = true;
        emailForm.querySelector('[type="submit"]').disabled = true;
        codeForm.querySelector('[data-resend]').disabled = true;
        try {
          const result = await requestCode(email);
          if (!live()) return t('online.cancelled');
          if (!result.ok) {
            if (result.error === 'LOCKED' || result.error === 'RATE_LIMITED') {
              return t(result.error === 'LOCKED' ? 'login.code.locked' : 'login.code.rate', { min: minutesUntil(result.until || Date.now() + 60_000) });
            }
            return t('online.auth.unavailable');
          }
          expiresAt = result.expiresAt;
          developmentCode = !!result.code;
          const demo = codeForm.querySelector('[data-demo]');
          demo.hidden = !result.code;
          demo.textContent = result.code ? t('online.auth.devcode', { code: result.code }) : '';
          return '';
        } finally {
          sending = false;
          if (live()) {
            emailForm.querySelector('[type="submit"]').disabled = false;
            codeForm.querySelector('[data-resend]').disabled = false;
          }
        }
      }

      function showCodeStep() {
        emailForm.hidden = true;
        codeForm.hidden = false;
        title.textContent = t('login.code.title');
        codeForm.querySelector('[data-sent]').textContent = t(developmentCode ? 'online.auth.local' : 'login.code.sent', { email });
        codeForm.classList.remove('is-locked');
        codeInput.disabled = false;
        codeInput.value = '';
        paintCells();
        say('login-code-error', '');
        clearInterval(timer);
        timer = setInterval(tick, 1000);
        tick();
        codeInput.focus();
      }

      async function check() {
        if (verifying || !live()) return;
        verifying = true;
        codeInput.disabled = true;
        const result = await verifyCode(email, codeInput.value);
        verifying = false;
        if (!live()) return;
        codeInput.disabled = false;
        if (result.ok) {
          clearInterval(timer);
          closeSheet(); // focus goes back to the opener, or to the page if it was redrawn
          toast(t('login.done'));
          onDone?.();
          return;
        }
        codeInput.value = '';
        paintCells();
        if (result.error === 'LOCKED') {
          codeForm.classList.add('is-locked');
          codeInput.disabled = true;
          say('login-code-error', t('login.code.locked', { min: minutesUntil(result.until) }));
        } else if (result.error === 'EXPIRED') {
          say('login-code-error', t('login.code.expired'));
        } else if (result.error === 'WRONG') {
          say('login-code-error', t('login.code.wrong', { n: result.triesLeft }));
          codeForm.classList.remove('is-shaking');
          void codeForm.offsetWidth; // restart the shake
          codeForm.classList.add('is-shaking');
        } else say('login-code-error', t('online.auth.unavailable'));
      }

      emailInput.addEventListener('blur', () => {
        const bad = emailInput.value.trim() !== '' && !validEmail(emailInput.value);
        say('login-email-error', bad ? t('login.email.error') : '');
      });

      emailForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        email = emailInput.value.trim().toLowerCase();
        const emailOk = validEmail(email);
        say('login-email-error', emailOk ? '' : t('login.email.error'));
        say('login-agree-error', agree.checked ? '' : t('login.agree.error'));
        emailInput.setAttribute('aria-invalid', String(!emailOk));
        if (!emailOk) { emailInput.focus(); return; }
        if (!agree.checked) { agree.focus(); return; }
        const problem = await send();
        if (!live()) return;
        if (problem) { say('login-email-error', problem); return; }
        showCodeStep();
      });

      codeForm.addEventListener('submit', (event) => event.preventDefault());
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
        paintCells();
        if (codeInput.value.length === 6) check(); // six digits submit by themselves
      });

      codeForm.querySelector('[data-resend]').addEventListener('click', async () => {
        const problem = await send();
        if (!live()) return;
        if (problem) { say('login-code-error', problem); return; }
        showCodeStep();
      });
      codeForm.querySelector('[data-change]').addEventListener('click', () => {
        if (sending || verifying) return;
        clearInterval(timer);
        codeForm.hidden = true;
        emailForm.hidden = false;
        title.textContent = t('login.title');
        emailInput.focus();
      });
    },
  });
}
