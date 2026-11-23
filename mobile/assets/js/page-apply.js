// Along — a local companion application, with drafts and an honest submission state.
import { t, te, esc } from './i18n.js';
import { icon } from './icons.js';
import { dateLong } from './format.js';
import { toast, openSheet, closeSheet } from './ui.js';
import { go, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import {
  applicationFields, validateApplication, getApplicationDraft, saveApplicationDraft,
  submitApplication, clearGuestApplication, APPLICATION_CITIES, APPLICATION_LANGUAGES,
  APPLICATION_TOPICS, APPLICATION_SLOTS,
} from './applications.js';

export function renderApply(root) {
  const email = getSession()?.email || '';
  const record = getApplicationDraft(email);
  const header = `<header class="topbar">
    <button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button>
    <h1 class="t-heading topbar__title">${te('apply.title')}</h1>
  </header>`;
  if (record?.status === 'SUBMITTED') {
    const fields = record.fields;
    root.innerHTML = `<section class="page page--flow page--apply">${header}
      <article class="card flow-body">
        <p><span class="stamp stamp--pending">${te('apply.status.SUBMITTED')}</span></p>
        <h2 class="t-title">${te('apply.receipt.title')}</h2>
        <p class="t-body">${te('apply.receipt.body')}</p>
        <p class="t-small t-num">${esc(record.id)}</p>
        <dl class="facts">
          <div><dt>${te('apply.name')}</dt><dd>${esc(fields.name)}</dd></div>
          <div><dt>${te('apply.city')}</dt><dd>${te(`city.${fields.city}`)}</dd></div>
          <div><dt>${te('apply.languages')}</dt><dd>${fields.languages.map((code) => te(`lang.name.${code}`)).join(' / ')}</dd></div>
          <div><dt>${te('apply.topics')}</dt><dd>${fields.topics.map((topic) => te(`apply.topic.${topic}`)).join(' / ')}</dd></div>
          <div class="facts__wide"><dt>${te('apply.bio')}</dt><dd>${esc(fields.bio)}</dd></div>
          <div class="facts__wide"><dt>${te('apply.availability')}</dt><dd>${fields.availability.map((slot) => te(`apply.slot.${slot}`)).join(' / ')}</dd></div>
        </dl>
        <p class="t-small">${te('apply.submitted.date', { date: dateLong(new Date(record.submittedAt), 'Asia/Shanghai') })}</p>
      </article>
      <p class="note t-small">${te('apply.local')}</p>
      <button class="btn btn--primary" data-home>${te('apply.home')}</button>
      <button class="btn btn--text" data-revise>${te('apply.revise')}</button>
    </section>`;
    root.querySelector('[data-back]').addEventListener('click', () => back('you'));
    root.querySelector('[data-home]').addEventListener('click', () => go('you'));
    root.querySelector('[data-revise]').addEventListener('click', () => openSheet({
      title: te('apply.revise'),
      body: `<p class="t-body sheet__note">${te('apply.revise.body')}</p>
        <button class="btn btn--primary" data-confirm>${te('apply.revise')}</button>
        <button class="btn btn--text" data-sheet-close data-autofocus>${te('common.close')}</button>`,
      onMount(panel) {
        panel.querySelector('[data-confirm]').addEventListener('click', () => {
          const result = saveApplicationDraft(email, fields, { revise: true });
          if (!result.ok) { toast(t('error.STORAGE')); return; }
          closeSheet();
          renderApply(root);
        });
      },
    }));
    return;
  }

  let fields = applicationFields(record?.fields);
  const checked = (on) => on ? 'checked' : '';
  const error = (key) => `<p class="field-error t-small" id="apply-error-${key}" data-error="${key}"></p>`;
  const chips = (name, values, selected, prefix) => `<div class="chips">${values.map((value) => `<label class="chip">
    <input class="sr-only" type="checkbox" name="${name}" value="${value}" ${checked(selected.includes(value))} /><span>${te(`${prefix}${value}`)}</span>
  </label>`).join('')}</div>`;
  root.innerHTML = `<section class="page page--flow page--apply">${header}
    <h2 class="t-title">${te('apply.invite')}</h2>
    <p class="t-body">${te('apply.intro')}</p>
    <p class="note t-small">${te('apply.local')}</p>
    <form class="card form apply-form" novalidate>
      <p class="t-small" data-draft-state role="status">${te(record && email && record.email === '' ? 'apply.draft.guest' : record ? 'apply.draft.saved' : 'apply.draft.hint')}</p>
      <p class="field-error t-small" data-summary role="alert"></p>
      <label class="field"><span class="t-label">${te('apply.name')}</span><input class="input" name="name" autocomplete="name" maxlength="60" value="${esc(fields.name)}" required aria-describedby="apply-error-name" />${error('name')}</label>
      <fieldset class="field-group" aria-describedby="apply-error-city"><legend class="t-label">${te('apply.city')}</legend>
        <div class="chips">${APPLICATION_CITIES.map((city) => `<label class="chip"><input class="sr-only" type="radio" name="city" value="${city}" ${checked(fields.city === city)} /><span>${te(`city.${city}`)}</span></label>`).join('')}</div>${error('city')}
      </fieldset>
      <fieldset class="field-group" aria-describedby="apply-error-languages"><legend class="t-label">${te('apply.languages')}</legend>${chips('languages', APPLICATION_LANGUAGES, fields.languages, 'lang.name.')}${error('languages')}</fieldset>
      <fieldset class="field-group" aria-describedby="apply-error-topics"><legend class="t-label">${te('apply.topics')}</legend>${chips('topics', APPLICATION_TOPICS, fields.topics, 'apply.topic.')}${error('topics')}</fieldset>
      <label class="field"><span class="t-label">${te('apply.bio')}</span><textarea class="input input--area" name="bio" rows="4" maxlength="500" aria-describedby="apply-bio-hint apply-error-bio" required>${esc(fields.bio)}</textarea>
        <span class="t-small" id="apply-bio-hint">${te('apply.bio.hint')}</span>${error('bio')}</label>
      <fieldset class="field-group" aria-describedby="apply-error-availability"><legend class="t-label">${te('apply.availability')}</legend>${chips('availability', APPLICATION_SLOTS, fields.availability, 'apply.slot.')}${error('availability')}</fieldset>
      <details class="policy"><summary class="t-body">${te('apply.rules.title')}</summary><ul class="ticks">${[1, 2, 3].map((n) => `<li>${icon('check', { size: 18 })}<span>${te(`apply.rules.${n}`)}</span></li>`).join('')}</ul></details>
      <label class="check"><input type="checkbox" name="agree" ${checked(fields.agree)} aria-describedby="apply-error-agree" /><span>${te('apply.agree')}</span></label>${error('agree')}
      <button class="btn btn--primary" type="submit">${te(email ? 'apply.submit' : 'apply.submit.login')}</button>
      <button class="btn btn--text" type="button" data-save>${te('apply.save')}</button>
    </form>
  </section>`;
  const form = root.querySelector('form');
  const draftState = root.querySelector('[data-draft-state]');
  const summary = root.querySelector('[data-summary]');

  function collect() {
    const data = new FormData(form);
    fields = applicationFields({
      name: data.get('name'), city: data.get('city'), bio: data.get('bio'),
      languages: data.getAll('languages'), topics: data.getAll('topics'),
      availability: data.getAll('availability'), agree: data.get('agree') === 'on',
    });
    return fields;
  }
  function save(announce = false) {
    const result = saveApplicationDraft(email, collect());
    draftState.textContent = t(result.ok ? 'apply.draft.saved' : result.error === 'CONFLICT' ? 'apply.conflict' : 'error.STORAGE');
    if (announce) toast(draftState.textContent);
    return result.ok;
  }
  function finish(snapshot) {
    const signedIn = getSession();
    if (!signedIn || (email && signedIn.email !== email)) { toast(t('apply.login.required')); return; }
    const result = submitApplication(signedIn.email, snapshot);
    if (!result.ok) {
      toast(t(result.error === 'STORAGE' ? 'error.STORAGE' : result.error === 'CONFLICT' ? 'apply.conflict' : 'apply.invalid'));
      return;
    }
    const cleared = clearGuestApplication(snapshot, result.application);
    toast(t(cleared ? 'apply.submitted' : 'apply.submitted.guest.retained'));
    if (location.hash === '#/apply') renderApply(root);
  }
  form.addEventListener('input', () => save());
  form.addEventListener('change', () => save());
  form.querySelector('[data-save]').addEventListener('click', () => save(true));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const snapshot = collect();
    const errors = validateApplication(snapshot);
    form.querySelectorAll('[data-error]').forEach((el) => {
      el.textContent = errors.includes(el.dataset.error) ? t(`apply.error.${el.dataset.error}`) : '';
    });
    form.querySelectorAll('[name]').forEach((el) => el.setAttribute('aria-invalid', String(errors.includes(el.name))));
    summary.textContent = errors.length ? t('apply.invalid') : '';
    if (errors.length) { form.querySelector(`[name="${errors[0]}"]`)?.focus(); return; }
    if (!save()) return;
    if (!getSession()) {
      const path = location.hash;
      openLogin({ onDone: () => { if (location.hash === path) finish(snapshot); } });
    } else finish(snapshot);
  });
  root.querySelector('[data-back]').addEventListener('click', () => { if (save()) back('you'); });
}
