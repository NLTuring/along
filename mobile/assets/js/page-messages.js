// InsTrip mobile — messages with a local friend (spec §6.9), one thread per booking.
// No message service is connected: what you write is kept on this phone and the
// friend does not receive it. The page says so.

import { t, te, esc } from './i18n.js';
import { time24 } from './format.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { go, back } from './router.js';
import { getSession } from './auth.js';
import { openLogin } from './login.js';
import { guide, getBooking } from './bookings.js';
import { TZ } from './plan.js';
import { guideText } from './seed-text.js';

const KEY = 'instrip.threads';
const MAX_LEN = 500;
const QUICK = ['here', 'late', 'where'];

function readThreads() {
  try {
    const threads = JSON.parse(localStorage.getItem(KEY) || '{}');
    return threads && typeof threads === 'object' && !Array.isArray(threads) ? threads : {};
  } catch {
    return {};
  }
}

function saveThread(id, messages) {
  const all = readThreads();
  all[id] = messages;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function renderMessages(root, threadId) {
  const session = getSession();
  // Signed out: ask to sign in, then come back to this page (spec §12.11).
  if (!session) {
    root.innerHTML = `
      <section class="page page--flow">
        <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button></header>
        <p class="t-body">${te('login.sub')}</p>
        <button class="btn btn--primary" data-signin>${te('you.signin')}</button>
      </section>`;
    root.querySelector('[data-back]').addEventListener('click', () => back('trip'));
    root.querySelector('[data-signin]').addEventListener('click', () => openLogin());
    return;
  }
  const booking = getBooking(threadId);
  // Only the traveller on the booking can open its thread.
  if (!booking || booking.email !== session.email) {
    root.innerHTML = `
      <section class="page page--flow">
        <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button></header>
        <p class="t-body">${te('chat.notfound')}</p>
        <button class="btn btn--primary" data-home>${te('nav.trip')}</button>
      </section>`;
    root.querySelector('[data-back]').addEventListener('click', () => back('trip'));
    root.querySelector('[data-home]').addEventListener('click', () => go('trip'));
    return;
  }

  const g = guideText(guide(booking.guideId));
  const stored = readThreads()[threadId];
  let messages = Array.isArray(stored)
    ? stored.filter((m) => m && typeof m.text === 'string' && Number.isFinite(m.at) && Number.isFinite(new Date(m.at).getTime()))
    : [];

  root.innerHTML = `
    <section class="page page--chat">
      <header class="topbar">
        <button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button>
        <div class="window window--moon chat__photo"><img src="${esc(g.photo)}" alt="" /></div>
        <div class="chat__who">
          <h1 class="t-heading">${esc(g.name)}</h1>
          <span class="seal ${g.kind === 'VOLUNTEER' ? 'seal--volunteer' : 'seal--licensed'}">${te(`guide.kind.${g.kind}`)}</span>
        </div>
      </header>
      <p class="note t-small">${te('chat.local', { name: g.name })}</p>
      <ol class="bubbles" aria-live="polite" aria-label="${te('chat.title')}"></ol>
    </section>
    <div class="composer glass glass--2">
      <div class="quick">${QUICK.map((key) => `<button class="quick__item" data-quick="${key}" data-track="quick_reply">${te(`chat.quick.${key}`)}</button>`).join('')}</div>
      <form class="composer__row">
        <label class="sr-only" for="chat-text">${te('chat.placeholder')}</label>
        <input class="input" id="chat-text" name="text" maxlength="${MAX_LEN}" autocomplete="off" placeholder="${te('chat.placeholder')}" />
        <button class="icon-btn composer__send" type="submit" aria-label="${te('chat.send')}" data-track="message_sent">${icon('send')}</button>
      </form>
    </div>`;

  const list = root.querySelector('.bubbles');
  const form = root.querySelector('.composer__row');
  const input = form.elements.text;

  function paint() {
    list.innerHTML = messages.length
      ? messages.map((m) => `<li class="bubble bubble--me"><p>${esc(m.text)}</p><time class="t-num">${esc(time24(new Date(m.at), TZ))}</time></li>`).join('')
      : `<li class="bubbles__empty t-body">${te('chat.empty')}</li>`;
  }

  function send(text) {
    const clean = String(text).trim().slice(0, MAX_LEN);
    if (!clean) return false;
    const next = [...messages, { text: clean, at: Date.now() }];
    if (!saveThread(threadId, next)) {
      toast(t('error.STORAGE'));
      return false;
    }
    messages = next;
    paint();
    window.scrollTo(0, document.documentElement.scrollHeight);
    return true;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (send(input.value)) input.value = '';
    input.focus();
  });
  root.querySelector('.quick').addEventListener('click', (event) => {
    const key = event.target.closest('[data-quick]')?.dataset.quick;
    if (key) send(t(`chat.quick.${key}`));
  });
  root.querySelector('[data-back]').addEventListener('click', () => back('trip'));

  paint();
  window.scrollTo(0, document.documentElement.scrollHeight);
}
