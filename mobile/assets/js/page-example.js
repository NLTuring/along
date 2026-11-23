// Along — one local example story: read it, like it, comment, follow or message its author.
// Examples and their authors are curated demo content; everything done here stays on this phone.
import { t, te, esc, getLocale } from './i18n.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { go, back } from './router.js';
import { getSession, onSessionChange } from './auth.js';
import { SAMPLE_POSTS, SAMPLE_AUTHORS } from './seed-community.js';
import { socialScope, isLiked, toggleLike, listComments, addComment, removeComment, isFollowing, toggleFollow } from './social.js';
import { dateText } from './community-ui.js';

const pick = (item, key) => item?.[key + (getLocale() === 'zh' ? 'Zh' : 'En')] || item?.[`${key}En`] || '';

export function avatarHtml(author, size = 'md') {
  const name = pick(author, 'name') || '?';
  return author?.photo
    ? `<span class="social-avatar social-avatar--${size}"><img src="${esc(author.photo)}" alt="" loading="lazy"></span>`
    : `<span class="social-avatar social-avatar--${size}" aria-hidden="true">${esc([...name][0].toUpperCase())}</span>`;
}
// The same avatar as a link to the author's profile page.
export function avatarLink(author, size = 'md') {
  if (!author?.id) return avatarHtml(author, size);
  return `<a class="social-avatar-link" href="#/u/${encodeURIComponent(author.id)}" aria-label="${te('profile.openOf', { name: pick(author, 'name') })}">${avatarHtml(author, size)}</a>`;
}

function myName() {
  const session = getSession();
  if (!session) return t('social.you');
  if (session.displayName && !session.localOnly) return session.displayName;
  return session.email ? session.email.split('@')[0] : t('social.you');
}

export function renderExample(root, id) {
  const post = SAMPLE_POSTS.find((item) => item.id === id);
  const author = post && SAMPLE_AUTHORS[post.authorId];
  if (!post || !author) {
    root.innerHTML = `<section class="page community-page"><button class="btn btn--text btn--inline" data-back>${icon('back', { size: 18 })}${te('community.back')}</button><div class="empty"><h1 class="t-heading">${te('social.notFound')}</h1></div></section>`;
    root.querySelector('[data-back]').addEventListener('click', () => back('stories'));
    return null;
  }
  const scope = () => socialScope(getSession());
  let disposed = false;

  function commentsHtml() {
    const samples = post.sampleComments.map((comment) => `<li><div class="community-heading"><strong>${esc(pick(comment, 'name'))}</strong><span class="community-state">${te('social.sampleComment')}</span></div><p class="community-prose">${esc(pick(comment, 'text'))}</p></li>`);
    const mine = listComments(scope(), post.id).map((comment) => `<li data-own="${esc(comment.id)}"><div class="community-heading"><strong>${esc(myName())}</strong><span class="community-state community-state--pending">${te('social.onlyHere')}</span></div><p class="community-prose">${esc(comment.text)}</p><div class="community-actions"><span class="t-small">${esc(dateText(comment.at))}</span><button class="btn btn--text btn--inline" data-delete-comment="${esc(comment.id)}">${te('social.deleteComment')}</button></div></li>`);
    return `<ol class="community-comments">${[...samples, ...mine].join('')}</ol>`;
  }
  function likeLabel() {
    const liked = isLiked(scope(), post.id);
    return { liked, text: t('social.likes', { n: post.likes + (liked ? 1 : 0) }) };
  }
  function followLabel() {
    const following = isFollowing(scope(), author.id);
    return { following, text: t(following ? 'social.following' : 'social.follow') };
  }
  function paint() {
    const like = likeLabel(), follow = followLabel(), tags = pick(post, 'tags') || [];
    root.innerHTML = `<section class="page community-page page--example">
      <button class="btn btn--text btn--inline" data-back>${icon('back', { size: 18 })}${te('community.back')}</button>
      <article class="community-detail">
        <div class="community-heading"><span class="community-state">${te('community.localExample')}</span></div>
        <h1 class="t-title">${esc(pick(post, 'title'))}</h1>
        <div class="social-author">
          ${avatarLink(author)}
          <div class="social-author__text"><a class="social-author__name" href="#/u/${encodeURIComponent(author.id)}">${esc(pick(author, 'name'))}</a><span class="t-small">${esc(pick(author, 'tagline'))}${post.city ? ` · ${te(`community.exampleCity.${post.city}`)}` : ''}</span></div>
          <div class="social-author__actions">
            <button class="btn btn--small social-follow" data-follow aria-pressed="${follow.following}">${icon(follow.following ? 'check' : 'userplus', { size: 18 })}<span>${esc(follow.text)}</span></button>
            <button class="btn btn--outline btn--inline social-message" data-message>${icon('message', { size: 18 })}<span>${te('social.message')}</span></button>
          </div>
        </div>
        ${post.photo ? `<img class="community-media social-photo" src="${esc(post.photo)}" alt="${esc(pick(post, 'alt'))}">` : ''}
        <p class="community-prose">${esc(pick(post, 'text'))}</p>
        ${tags.length ? `<div class="community-card__tags">${tags.map((tag) => `<span class="community-tag">#${esc(tag)}</span>`).join('')}</div>` : ''}
        <div class="community-actions">
          <button class="btn btn--secondary social-like" data-like aria-pressed="${like.liked}">${icon('heart', { size: 18 })}<span>${esc(like.text)}</span></button>
          ${post.poiId ? `<button class="btn btn--text btn--inline" data-map>${te('community.map')}</button>` : ''}
          ${post.guideId ? `<button class="btn btn--text btn--inline" data-guide>${te('social.meetFriend')}</button>` : ''}
        </div>
        <p class="note t-small">${te('social.localNote')}</p>
        <section class="community-comment-section" aria-labelledby="example-comments-title">
          <h2 class="t-heading" id="example-comments-title" data-comment-count>${te('social.comments', { n: post.sampleComments.length + listComments(scope(), post.id).length })}</h2>
          <div data-comments>${commentsHtml()}</div>
          <form class="community-form" data-comment-form>
            <label class="field"><span>${te('community.writeComment')}</span><textarea class="input input--area" name="body" rows="3" maxlength="500" required></textarea></label>
            <p class="field-error" role="alert" data-comment-error></p>
            <button class="btn btn--primary" type="submit">${te('social.commentSubmit')}</button>
          </form>
        </section>
      </article>
    </section>`;
  }
  function paintComments() {
    root.querySelector('[data-comments]').innerHTML = commentsHtml();
    root.querySelector('[data-comment-count]').textContent = t('social.comments', { n: post.sampleComments.length + listComments(scope(), post.id).length });
  }
  const click = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-back')) back('stories');
    else if (button.hasAttribute('data-message')) go(`dm/${encodeURIComponent(author.id)}`);
    else if (button.hasAttribute('data-map')) go(`map/${encodeURIComponent(post.poiId)}`);
    else if (button.hasAttribute('data-guide')) go(`guides/${encodeURIComponent(post.guideId)}`);
    else if (button.hasAttribute('data-like')) {
      const result = toggleLike(scope(), post.id);
      if (!result.ok) { toast(t('error.STORAGE')); return; }
      const like = likeLabel();
      button.setAttribute('aria-pressed', String(like.liked)); button.querySelector('span').textContent = like.text;
    } else if (button.hasAttribute('data-follow')) {
      const result = toggleFollow(scope(), { id: author.id, kind: 'SAMPLE', name: pick(author, 'name') });
      if (!result.ok) { toast(t(result.error === 'LIMIT' ? 'social.followLimit' : 'error.STORAGE')); return; }
      const follow = followLabel();
      button.setAttribute('aria-pressed', String(follow.following));
      button.innerHTML = `${icon(follow.following ? 'check' : 'userplus', { size: 18 })}<span>${esc(follow.text)}</span>`;
      toast(t(result.following ? 'social.followed' : 'social.unfollowed', { name: pick(author, 'name') }));
    } else if (button.dataset.deleteComment) {
      const result = removeComment(scope(), post.id, button.dataset.deleteComment);
      if (!result.ok) { toast(t('error.STORAGE')); return; }
      paintComments(); toast(t('social.commentDeleted'));
      root.querySelector('[data-comment-form] textarea')?.focus();
    }
  };
  const submit = (event) => {
    const form = event.target.closest('[data-comment-form]');
    if (!form) return;
    event.preventDefault();
    const error = form.querySelector('[data-comment-error]');
    const result = addComment(scope(), post.id, form.elements.body.value);
    if (!result.ok) {
      error.textContent = t(result.error === 'VALIDATION' ? 'social.commentInvalid' : result.error === 'LIMIT' ? 'social.commentLimit' : 'error.STORAGE');
      form.elements.body.focus();
      return;
    }
    error.textContent = ''; form.reset(); paintComments();
    toast(t('social.commentSaved'));
    root.querySelector(`[data-own="${CSS.escape(result.comment.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    form.elements.body.focus();
  };
  root.addEventListener('click', click); root.addEventListener('submit', submit);
  const off = onSessionChange(() => { if (!disposed) paint(); });
  paint();
  return () => { disposed = true; off(); root.removeEventListener('click', click); root.removeEventListener('submit', submit); };
}
