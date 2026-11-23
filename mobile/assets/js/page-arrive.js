// InsTrip mobile — Trip tab, stage A: the arrival form (spec §6.1 + §6.2).
// Step one asks when and where; step two (same page) asks what you like.
// There is no planning service yet, so building fills in the sample plan.

import { t, te, esc } from './i18n.js';
import { dateShort, isoDateIn } from './format.js';
import { previewSky } from './sky.js';
import { openSheet, toast, prefersReducedMotion } from './ui.js';
import { icon } from './icons.js';
import { CITIES, DAY_OPTIONS } from './seed.js';
import { buildPlan, savePlan, TZ } from './plan.js';
import { windowShowHtml, mountWindowShow } from './window-show.js';
import { go } from './router.js';

const STORE_KEY = 'instrip.arrival';
const INTERESTS = [
  ['Food', 'Food'], ['Photography', 'Photography'], ['History', 'History'],
  ['NoCrowds', 'No crowds'], ['Family', 'Family'], ['Accessible', 'Accessible'],
];
const PACES = ['slow', 'balanced', 'packed'];

function defaults() {
  const soon = new Date(Date.now() + 3 * 86_400_000);
  return { date: isoDateIn(soon, TZ), time: '18:00', city: 'shanghai', days: 3, interests: [], pace: 'balanced', budget: '', step: 1 };
}

function load() {
  const base = defaults();
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    if (!s) return base;
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : base.date,
      time: /^\d{2}:\d{2}$/.test(s.time) ? s.time : base.time,
      city: CITIES.some((c) => c.slug === s.city) ? s.city : base.city,
      days: DAY_OPTIONS.includes(s.days) ? s.days : base.days,
      interests: Array.isArray(s.interests) ? s.interests.filter((v) => INTERESTS.some(([, value]) => value === v)) : [],
      pace: PACES.includes(s.pace) ? s.pace : base.pace,
      budget: /^\d{1,5}$/.test(s.budget) ? s.budget : '',
      step: s.step === 2 ? 2 : 1,
    };
  } catch {
    return base;
  }
}

function save(state) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* the form still works; it just forgets on reload */
  }
}

const checked = (on) => (on ? 'checked' : '');

export function renderArrive(root, { onBuilt, draft = null }) {
  const state = draft || load();
  const today = isoDateIn(new Date(), TZ);
  document.documentElement.dataset.stage = 'arrive';

  root.innerHTML = `
    <section class="page page--trip">
      <figure class="arrive-window">
        ${windowShowHtml()}
      </figure>
      <h1 class="t-display">${te('plan.new.title')}</h1>
      <p class="t-lead">${te('hero.sub')}</p>
      <div class="bookings" data-bookings hidden></div>

      <form class="card form" id="arrive-form" novalidate>
        <div class="form__step" data-step="1">
          <fieldset class="field-group">
            <legend class="t-label">${te('arrive.when')}</legend>
            <div class="field-row">
              <label class="field"><span class="sr-only">${te('arrive.date')}</span>
                <input class="input t-num" type="date" name="date" value="${esc(state.date)}" min="${today}" required /></label>
              <label class="field field--time"><span class="sr-only">${te('arrive.time')}</span>
                <input class="input t-num" type="time" name="time" value="${esc(state.time)}" required /></label>
            </div>
            <p class="t-small" id="sky-note" aria-live="polite"></p>
          </fieldset>
          <fieldset class="field-group">
            <legend class="t-label">${te('arrive.where')}</legend>
            <div class="chips">${CITIES.map((c) => `
              <label class="chip"><input class="sr-only" type="radio" name="city" value="${c.slug}" ${checked(c.slug === state.city)} /><span>${te(`city.${c.slug}`)}</span></label>`).join('')}
            </div>
          </fieldset>
          <fieldset class="field-group">
            <legend class="t-label">${te('arrive.days')}</legend>
            <div class="segmented">${DAY_OPTIONS.map((n) => `
              <label class="segmented__item"><input class="sr-only" type="radio" name="days" value="${n}" ${checked(n === state.days)} /><span class="t-num">${te('arrive.days.option', { n })}</span></label>`).join('')}
            </div>
          </fieldset>
        </div>

        <div class="form__step" data-step="2" tabindex="-1" hidden>
          <div class="summary-row">
            <p class="t-ink" id="arrive-summary"></p>
            <button class="btn btn--text btn--inline" type="button" data-back>${te('arrive.back')}</button>
          </div>
          <fieldset class="field-group">
            <legend class="t-label">${te('arrive.interests')}</legend>
            <div class="chips">${INTERESTS.map(([key, value]) => `
              <label class="chip"><input class="sr-only" type="checkbox" name="interests" value="${value}" ${checked(state.interests.includes(value))} /><span>${te(`interest.${key}`)}</span></label>`).join('')}
            </div>
          </fieldset>
          <fieldset class="field-group">
            <legend class="t-label">${te('arrive.pace')}</legend>
            <div class="segmented">${PACES.map((p) => `
              <label class="segmented__item"><input class="sr-only" type="radio" name="pace" value="${p}" ${checked(p === state.pace)} /><span>${te(`pace.${p}`)}</span></label>`).join('')}
            </div>
          </fieldset>
          <details class="budget" ${state.budget ? 'open' : ''}>
            <summary class="t-label">${te('arrive.budget')}</summary>
            <input class="input t-num" type="number" name="budget" inputmode="numeric" min="0" max="99999" step="1" value="${esc(state.budget)}" aria-label="${te('arrive.budget')}" />
            <p class="t-small">${te('arrive.budget.hint')}</p>
          </details>
          <p class="note t-small">${te('plan.sample')}</p>
        </div>

        <button class="btn btn--primary" type="submit" data-track="plan_cta_click"><span id="cta-label"></span></button>
        <button class="btn btn--text" type="button" data-waitlist data-track="waitlist_submit">${te('cta.waitlist')}</button>
      </form>
      <p class="t-label credit" data-window-credit aria-live="off"></p>
    </section>`;

  const form = root.querySelector('#arrive-form');
  const steps = [...form.querySelectorAll('[data-step]')];
  const ctaLabel = root.querySelector('#cta-label');
  const skyNote = root.querySelector('#sky-note');
  const summary = root.querySelector('#arrive-summary');
  const waitlist = root.querySelector('[data-waitlist]');

  function sync() {
    const data = new FormData(form);
    state.date = String(data.get('date') || state.date);
    state.time = String(data.get('time') || state.time);
    state.city = String(data.get('city') || state.city);
    state.days = Number(data.get('days') || state.days);
    state.interests = data.getAll('interests').map(String);
    state.pace = String(data.get('pace') || state.pace);
    state.budget = String(data.get('budget') || '');
    save(state);

    steps.forEach((el) => { el.hidden = Number(el.dataset.step) !== state.step; });
    waitlist.hidden = state.step !== 1;
    ctaLabel.textContent = state.step === 1 ? t('cta.build', { days: state.days }) : t('plan.new.cta');

    const [hour, minute] = state.time.split(':').map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      previewSky(hour, minute); // the sky takes the colour of the hour the traveller lands
      skyNote.textContent = t('arrive.sky', { city: t(`city.${state.city}`), time: state.time });
    }
    const [y, m, d] = state.date.split('-').map(Number);
    summary.textContent = t('arrive.summary', {
      city: t(`city.${state.city}`), date: dateShort(new Date(Date.UTC(y, m - 1, d, 4)), TZ), time: state.time, days: state.days,
    });
  }

  function goTo(step) {
    state.step = step;
    sync();
    const target = steps[step - 1];
    target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    (step === 2 ? target : form.querySelector('[name=date]')).focus({ preventScroll: true });
  }

  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  form.addEventListener('click', (event) => {
    if (event.target.closest('[data-back]')) goTo(1);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const arrivalFields = [form.elements.date, form.elements.time];
    form.elements.date.min = isoDateIn(new Date(), TZ);
    if (state.step === 1) {
      if (arrivalFields.every((el) => el.reportValidity())) goTo(2);
      return;
    }
    // A restored draft can have an arrival date that is no longer valid.
    if (!arrivalFields.every((el) => el.checkValidity())) {
      goTo(1);
      arrivalFields.find((el) => !el.checkValidity())?.reportValidity();
      return;
    }
    if (!form.elements.budget.reportValidity()) return;
    sync();
    building(root, state, onBuilt);
  });

  waitlist.addEventListener('click', () => {
    openSheet({
      title: te('cta.waitlist'),
      body: `<p class="t-body sheet__note">${te('phase.next')}</p>
        <button class="btn btn--primary" data-sheet-close data-autofocus>${te('common.done')}</button>`,
    });
  });

  sync();
  // The window turns between scenes; the photo credit follows whichever is showing.
  const credit = root.querySelector('[data-window-credit]');
  mountWindowShow(root, {
    onScene: (scene) => { if (credit) credit.textContent = t('window.credit', { author: scene.author }); },
    // Tapping the window asks for directions to where the scene on show was taken.
    onOpen: (scene) => go(`map/${encodeURIComponent(scene.place)}`),
  });
}

// The window fills the screen while the plan is put together. With no planning
// service the steps are staged; the plan itself is ready at once.
function building(root, state, onBuilt) {
  const lines = [1, 2, 3, 4].map((n) => te(`plan.building.${n}`));
  root.innerHTML = `
    <section class="page page--trip page--building">
      <figure class="arrive-window arrive-window--big" aria-hidden="true">
        <div class="window window--porthole"><div class="clouds"></div></div>
      </figure>
      <h1 class="t-title" tabindex="-1">${te('plan.building.title')}</h1>
      <ol class="progress" aria-live="polite">${lines.map((line) => `<li hidden>${icon('check', { size: 18 })}<span>${line}</span></li>`).join('')}</ol>
    </section>`;
  window.scrollTo(0, 0);
  root.querySelector('h1').focus({ preventScroll: true });

  const items = [...root.querySelectorAll('.progress li')];
  const plan = buildPlan(state, { interests: state.interests, pace: state.pace, budget: state.budget });
  const finish = () => {
    if (!savePlan(plan)) {
      renderArrive(root, { onBuilt, draft: state });
      toast(t('error.STORAGE'));
      return;
    }
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    onBuilt(plan);
  };
  if (prefersReducedMotion()) {
    finish();
    return;
  }
  let i = 0;
  const timer = setInterval(() => {
    if (!root.contains(items[0])) { clearInterval(timer); return; } // the user left this page
    if (i < items.length) { items[i].hidden = false; i += 1; return; }
    clearInterval(timer);
    finish();
  }, 420);
}
