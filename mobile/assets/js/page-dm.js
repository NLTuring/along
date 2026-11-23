// Along — a direct-message thread with the author of a local example story.
// The authors are demo personas: their replies are prepared sample lines, and the whole
// thread is kept on this phone. Nothing is sent to anyone.
import { t, te, esc, getLocale } from './i18n.js';
import { time24 } from './format.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { back } from './router.js';
import { getSession, onSessionChange } from './auth.js';
import { SAMPLE_AUTHORS } from './seed-community.js';
import { socialScope, getThread, sendMessage } from './social.js';
import { avatarLink } from './page-example.js';

const QUICK = ['hello', 'tips', 'thanks'];
const REPLY_MS = 900;
const TZ = 'Asia/Shanghai';

export function renderDm(root, authorId) {
  const author = SAMPLE_AUTHORS[authorId];
  const zh = () => getLocale() === 'zh';
  if (!author) {
    root.innerHTML = `<section class="page page--flow"><header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button></header><div class="empty"><h1 class="t-heading">${te('social.dmNotFound')}</h1></div></section>`;
    root.querySelector('[data-back]').addEventListener('click', () => back('stories'));
    return null;
  }
  const name = () => (zh() ? author.nameZh : author.nameEn);
  let scope = socialScope(getSession()), timer = 0, disposed = false;

  root.innerHTML = `
    <section class="page page--chat page--dm">
      <header class="topbar">
        <button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button>
        ${avatarLink(author, 'sm')}
        <div class="chat__who"><h1 class="t-heading">${esc(name())}</h1><span class="seal seal--volunteer">${te('social.demoPersona')}</span></div>
      </header>
      <p class="note t-small">${te('social.dmNote', { name: name() })}</p>
      <ol class="bubbles" aria-live="polite" aria-label="${te('social.dmTitle', { name: name() })}"></ol>
    </section>
    <div class="composer glass glass--2">
      <div class="quick">${QUICK.map((key) => `<button class="quick__item" data-quick="${key}">${te(`social.quick.${key}`)}</button>`).join('')}</div>
      <form class="composer__row">
        <label class="sr-only" for="dm-text">${te('chat.placeholder')}</label>
        <input class="input" id="dm-text" name="text" maxlength="500" autocomplete="off" placeholder="${te('chat.placeholder')}" />
        <button class="icon-btn composer__send" type="submit" aria-label="${te('chat.send')}">${icon('send')}</button>
      </form>
    </div>`;
  const list = root.querySelector('.bubbles'), form = root.querySelector('.composer__row'), input = form.elements.text;

  function paint() {
    const thread = getThread(scope, author.id);
    list.innerHTML = thread.length
      ? thread.map((m) => m.from === 'me'
        ? `<li class="bubble bubble--me"><p>${esc(m.text)}</p><time class="t-num">${esc(time24(new Date(m.at), TZ))}</time></li>`
        : `<li class="bubble bubble--them"><p>${esc(m.text)}</p><span class="t-small social-auto">${m.auto ? te('social.autoReply') : ''} · <time class="t-num">${esc(time24(new Date(m.at), TZ))}</time></span></li>`).join('')
      : `<li class="bubbles__empty t-body">${te('social.dmEmpty', { name: name() })}</li>`;
    window.scrollTo(0, document.documentElement.scrollHeight);
  }
  // One prepared reply per message sent, in turn; leaving the page cancels a pending one.
  function scheduleReply() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      if (disposed) return;
      const replies = zh() ? author.repliesZh : author.repliesEn;
      const sent = getThread(scope, author.id).filter((m) => m.from === 'them' && m.auto).length;
      const result = sendMessage(scope, author.id, replies[sent % replies.length], { from: 'them', auto: true });
      if (!result.ok) { toast(t('error.STORAGE')); return; }
      paint();
    }, REPLY_MS);
  }
  function send(text) {
    const result = sendMessage(scope, author.id, text);
    if (!result.ok) { if (result.error !== 'VALIDATION') toast(t('error.STORAGE')); return false; }
    paint(); scheduleReply();
    return true;
  }
  const submit = (event) => { event.preventDefault(); if (send(input.value)) input.value = ''; input.focus(); };
  const quick = (event) => { const key = event.target.closest('[data-quick]')?.dataset.quick; if (key) send(t(`social.quick.${key}`)); };
  const leave = () => back('stories');
  form.addEventListener('submit', submit);
  root.querySelector('.quick').addEventListener('click', quick);
  root.querySelector('[data-back]').addEventListener('click', leave);
  // Another account has its own threads: switch to them and drop a reply meant for the old one.
  const off = onSessionChange((session) => { clearTimeout(timer); timer = 0; scope = socialScope(session); paint(); });
  paint();
  return () => {
    disposed = true; clearTimeout(timer); off();
    form.removeEventListener('submit', submit);
  };
}
