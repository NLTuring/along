// Along — the authors this phone follows and its message threads.
import { t, te, esc, getLocale } from './i18n.js';
import { icon } from './icons.js';
import { skyline, toast } from './ui.js';
import { go } from './router.js';
import { getSession } from './auth.js';
import { SAMPLE_AUTHORS } from './seed-community.js';
import { socialScope, listFollowing, listThreads, toggleFollow } from './social.js';
import { dateText } from './community-ui.js';
import { avatarHtml, avatarLink } from './page-example.js';

export function renderSocial(root) {
  const scope = socialScope(getSession());
  const zh = getLocale() === 'zh';
  const pick = (item, key) => item?.[key + (zh ? 'Zh' : 'En')] || '';

  function paint() {
    const follows = listFollowing(scope), threads = listThreads(scope).filter((thread) => SAMPLE_AUTHORS[thread.authorId]);
    root.innerHTML = `<section class="page page--tab page--social">
      ${skyline()}
      <h1 class="t-title">${te('you.social')}</h1>
      <p class="note t-small">${te('social.pageNote')}</p>
      <h2 class="t-label section-label">${te('social.followingTitle')}</h2>
      ${follows.length ? `<div class="rows card">${follows.map((follow) => {
        const author = follow.kind === 'SAMPLE' ? SAMPLE_AUTHORS[follow.id] : null;
        // Both demo authors and members have a profile; the avatar opens it.
        return `<div class="row social-row" data-follow-row="${esc(follow.id)}">
          ${avatarLink(author || { id: follow.id, nameEn: follow.name, nameZh: follow.name }, 'sm')}
          <span class="row__text"><strong>${esc(author ? pick(author, 'name') : follow.name)}</strong><small>${author ? esc(pick(author, 'tagline')) : te('social.member')}</small></span>
          ${author ? `<button class="btn btn--text btn--inline" data-dm="${esc(follow.id)}">${te('social.message')}</button>` : ''}
          <button class="btn btn--text btn--inline" data-unfollow="${esc(follow.id)}" data-kind="${esc(follow.kind)}" data-name="${esc(follow.name)}">${te('social.unfollow')}</button>
        </div>`;
      }).join('')}</div>` : `<div class="empty"><p class="t-body">${te('social.followingEmpty')}</p><button class="btn btn--primary" data-stories>${te('social.browseExamples')}</button></div>`}
      <h2 class="t-label section-label">${te('social.messagesTitle')}</h2>
      ${threads.length ? `<div class="rows card">${threads.map((thread) => {
        const author = SAMPLE_AUTHORS[thread.authorId];
        return `<button class="row social-row" data-dm="${esc(thread.authorId)}">
          ${avatarHtml(author, 'sm')}
          <span class="row__text"><strong>${esc(pick(author, 'name'))}</strong><small class="social-excerpt">${esc(thread.last.text)}</small><small>${esc(dateText(thread.last.at))}</small></span>
          ${icon('chevron', { size: 20 })}
        </button>`;
      }).join('')}</div>` : `<p class="t-small">${te('social.messagesEmpty')}</p>`}
    </section>`;
  }
  const click = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.dm) go(`dm/${encodeURIComponent(button.dataset.dm)}`);
    else if (button.hasAttribute('data-stories')) go('stories');
    else if (button.dataset.unfollow) {
      const result = toggleFollow(scope, { id: button.dataset.unfollow, kind: button.dataset.kind, name: button.dataset.name });
      if (!result.ok) { toast(t('error.STORAGE')); return; }
      toast(t('social.unfollowed', { name: button.dataset.name })); paint();
    }
  };
  root.addEventListener('click', click);
  paint();
  return () => root.removeEventListener('click', click);
}
