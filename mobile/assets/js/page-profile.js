// Along — a member's profile: their photo and video stories, followers and following.
// #/u/me opens the signed-in member's own profile; #/u/<id> anyone's; #/u/<id>/followers|following the lists.
import { t, te, esc, getLocale } from './i18n.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { go, back, replace } from './router.js';
import { SAMPLE_POSTS, SAMPLE_AUTHORS } from './seed-community.js';
import { socialScope, isFollowing, isLiked, toggleFollow } from './social.js';
import { api } from './api.js';
import { getSession, onSessionChange } from './auth.js';
import { openLogin } from './login.js';
import { openPostComposer } from './post-sheet.js';
import { createRequestGate, pathId, safeMediaUrl } from './community.js';
import { errorText, stateHtml, needLogin } from './community-ui.js';

export const profileInitial = (name) => [...String(name || '?').trim()][0]?.toUpperCase() || '?';
export const profileRoute = (userId, list = '') => `u/${pathId(userId)}${list ? `/${list}` : ''}`;
export function parseProfileParam(param) {
  const [id = '', list = ''] = String(param || '').split('/');
  return { id, list: ['followers', 'following'].includes(list) ? list : '' };
}

function avatar(name, size = 'lg') {
  return `<span class="profile-avatar profile-avatar--${size}" aria-hidden="true">${esc(profileInitial(name))}</span>`;
}
function tile(post) {
  const cover = post.cover;
  const src = safeMediaUrl(cover?.kind === 'VIDEO' ? cover.posterUrl : cover?.url);
  return `<li class="profile-tile"><a href="#/posts/${pathId(post.id)}" class="profile-tile__link" aria-label="${esc(post.title)}">
    ${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span class="profile-tile__text">${esc(post.title)}</span>`}
    ${post.hasVideo ? `<span class="profile-tile__badge">${icon('film', { size: 16 })}<span class="sr-only">${te('profile.video')}</span></span>` : post.mediaCount > 1 ? `<span class="profile-tile__badge">${te('profile.photos', { n: post.mediaCount })}</span>` : ''}
    ${post.status !== 'PUBLIC' ? `<span class="profile-tile__state">${stateHtml(post.status)}</span>` : ''}
    <span class="profile-tile__likes">${icon('heart', { size: 14 })} ${Number(post.likeCount) || 0}</span>
  </a></li>`;
}

// A demo author from the local examples: their example stories, follow and message, all on this phone.
// They are not Along members, so there are no follower lists; nothing here is loaded from the server.
function renderAuthorProfile(root, author) {
  const zh = getLocale() === 'zh', pick = (item, key) => item?.[key + (zh ? 'Zh' : 'En')] || '';
  const posts = SAMPLE_POSTS.filter((post) => post.authorId === author.id);
  const scope = () => socialScope(getSession());
  function paint() {
    const following = isFollowing(scope(), author.id);
    const likes = posts.reduce((sum, post) => sum + post.likes + (isLiked(scope(), post.id) ? 1 : 0), 0);
    root.innerHTML = `<section class="page page--flow page--profile">
      <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${te('profile.title')}</h1></header>
      <div class="profile-head">
        ${author.photo ? `<span class="profile-avatar profile-avatar--lg profile-avatar--photo"><img src="${esc(author.photo)}" alt=""></span>` : avatar(pick(author, 'name'))}
        <div class="profile-head__text"><h2 class="t-title profile-name">${esc(pick(author, 'name'))}</h2><p class="t-small">${esc(pick(author, 'tagline'))} · <span class="seal seal--volunteer">${te('social.demoPersona')}</span></p></div>
      </div>
      <p class="t-body">${esc(pick(author, 'bio'))}</p>
      <dl class="profile-stats profile-stats--two">
        <div><dt>${te('profile.posts')}</dt><dd class="t-num">${posts.length}</dd></div>
        <div><dt>${te('profile.likes')}</dt><dd class="t-num">${likes}</dd></div>
      </dl>
      <div class="profile-actions">
        <button class="btn ${following ? 'btn--outline' : 'btn--primary'} profile-action" data-follow-author aria-pressed="${following}">${icon(following ? 'check' : 'userplus', { size: 18 })}<span>${te(following ? 'profile.following' : 'profile.follow')}</span></button>
        <button class="btn btn--outline profile-action" data-dm-author>${icon('message', { size: 18 })}<span>${te('social.message')}</span></button>
      </div>
      ${author.guideId ? `<button class="btn btn--text" data-guide>${te('social.meetFriend')}</button>` : ''}
      <p class="note t-small">${te('profile.demoNote')}</p>
      <h3 class="t-label section-label">${te('profile.gallery')}</h3>
      <ul class="profile-grid">${posts.map((post) => `<li class="profile-tile"><a href="#/examples/${pathId(post.id)}" class="profile-tile__link" aria-label="${esc(pick(post, 'title'))}">
        ${post.photo ? `<img src="${esc(post.photo)}" alt="" loading="lazy">` : `<span class="profile-tile__text">${esc(pick(post, 'title'))}</span>`}
        <span class="profile-tile__likes">${icon('heart', { size: 14 })} ${post.likes + (isLiked(scope(), post.id) ? 1 : 0)}</span>
      </a></li>`).join('')}</ul>
    </section>`;
  }
  const click = (event) => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-back')) back('stories');
    else if (button.hasAttribute('data-dm-author')) go(`dm/${encodeURIComponent(author.id)}`);
    else if (button.hasAttribute('data-guide')) go(`guides/${encodeURIComponent(author.guideId)}`);
    else if (button.hasAttribute('data-follow-author')) {
      const result = toggleFollow(scope(), { id: author.id, kind: 'SAMPLE', name: pick(author, 'name') });
      if (!result.ok) { toast(t(result.error === 'LIMIT' ? 'social.followLimit' : 'error.STORAGE')); return; }
      paint(); toast(t(result.following ? 'social.followed' : 'social.unfollowed', { name: pick(author, 'name') }));
      root.querySelector('[data-follow-author]')?.focus();
    }
  };
  root.addEventListener('click', click);
  const off = onSessionChange(paint);
  paint();
  return () => { off(); root.removeEventListener('click', click); };
}

export function renderProfile(root, param) {
  const { id: rawId, list } = parseProfileParam(param);
  if (Object.hasOwn(SAMPLE_AUTHORS, rawId)) {
    // Demo authors have no follower lists; a list link lands on the profile itself.
    if (list) { replace(profileRoute(rawId)); return null; }
    return renderAuthorProfile(root, SAMPLE_AUTHORS[rawId]);
  }
  const gate = createRequestGate();
  let disposed = false, profile = null, busy = false;

  function shell(inner) {
    root.innerHTML = `<section class="page page--flow page--profile">
      <header class="topbar"><button class="icon-btn topbar__back" data-back aria-label="${te('common.back')}">${icon('back')}</button><h1 class="t-heading topbar__title">${list ? te(`profile.${list}`) : te('profile.title')}</h1></header>
      <p role="status" aria-live="polite" data-status></p>${inner}</section>`;
  }
  const status = (text) => { const el = root.querySelector('[data-status]'); if (el) el.textContent = text; };

  async function resolveId(request) {
    if (rawId !== 'me') return rawId;
    if (!getSession() || getSession().localOnly) return '';
    const { user } = await api('/me/profile', { signal: request.signal });
    return user.id;
  }

  function paintProfile() {
    const user = profile.user, posts = profile.posts;
    const followBtn = user.self ? `<button class="btn btn--outline profile-action" data-compose>${icon('plus', { size: 18 })}<span>${te('profile.share')}</span></button>`
      : `<button class="btn ${user.followedByMe ? 'btn--outline' : 'btn--primary'} profile-action" data-follow aria-pressed="${user.followedByMe}">${icon(user.followedByMe ? 'check' : 'userplus', { size: 18 })}<span>${te(user.followedByMe ? 'profile.following' : 'profile.follow')}</span></button>`;
    shell(`<div class="profile-head">
        ${avatar(user.displayName)}
        <div class="profile-head__text"><h2 class="t-title profile-name">${esc(user.displayName)}</h2><p class="t-small">${te('profile.joined', { date: new Date(user.joinedAt).toLocaleDateString() })}</p></div>
      </div>
      <dl class="profile-stats">
        <div><dt>${te('profile.posts')}</dt><dd class="t-num">${user.posts}</dd></div>
        <a class="profile-stat" href="#/${profileRoute(user.id, 'followers')}"><dt>${te('profile.followers')}</dt><dd class="t-num" data-followers>${user.followers}</dd></a>
        <a class="profile-stat" href="#/${profileRoute(user.id, 'following')}"><dt>${te('profile.followingCount')}</dt><dd class="t-num">${user.following}</dd></a>
      </dl>
      <div class="profile-actions">${followBtn}</div>
      ${user.self ? `<p class="note t-small">${te('profile.selfNote')}</p>` : ''}
      <h3 class="t-label section-label">${te('profile.gallery')}</h3>
      ${posts.length ? `<ul class="profile-grid">${posts.map(tile).join('')}</ul>`
        : `<div class="empty"><p class="t-body">${te(user.self ? 'profile.emptySelf' : 'profile.empty')}</p>${user.self ? `<button class="btn btn--primary" data-compose>${te('profile.share')}</button>` : ''}</div>`}`);
  }
  function paintList(items, userId) {
    shell(items.length ? `<div class="rows card profile-list">${items.map((m) => `<div class="row profile-row">
        <a class="profile-row__who" href="#/${profileRoute(m.id)}">${avatar(m.displayName, 'sm')}<span class="row__text"><strong>${esc(m.displayName)}</strong></span></a>
        ${m.self ? `<span class="t-small">${te('profile.you')}</span>` : `<button class="btn btn--text btn--inline" data-follow-row="${esc(m.id)}" aria-pressed="${m.followedByMe}">${te(m.followedByMe ? 'profile.following' : 'profile.follow')}</button>`}
      </div>`).join('')}</div>` : `<div class="empty"><p class="t-body">${te(list === 'followers' ? 'profile.noFollowers' : 'profile.noFollowing')}</p></div>`);
    root.dataset.userId = userId;
  }
  async function load() {
    const request = gate.next();
    shell(''); status(t('community.loading'));
    try {
      const userId = await resolveId(request);
      if (!gate.current(request) || disposed) return;
      if (!userId) {
        shell(`<div class="empty"><p class="t-body">${te(getSession()?.localOnly ? 'experience.online.blocked' : 'profile.signIn')}</p>${getSession()?.localOnly ? '' : `<button class="btn btn--primary" data-signin>${te('you.signin')}</button>`}</div>`);
        return;
      }
      if (rawId === 'me') { replace(profileRoute(userId, list)); return; }
      if (list) {
        const { items } = await api(`/users/${pathId(userId)}/${list}`, { signal: request.signal });
        if (gate.current(request) && !disposed) paintList(items, userId);
      } else {
        profile = await api(`/users/${pathId(userId)}`, { signal: request.signal });
        if (gate.current(request) && !disposed) paintProfile();
      }
    } catch (error) {
      if (!gate.current(request) || disposed) return;
      shell(`<p class="field-error" role="alert">${esc(errorText(error))}</p><button class="btn btn--secondary" data-retry>${te('community.retry')}</button>`);
    }
  }
  async function follow(userId, active, button) {
    if (busy || !needLogin(() => load(), () => !disposed)) return;
    busy = true; button.disabled = true;
    try {
      const result = await api(`/users/${pathId(userId)}/follow`, { method: 'PUT', body: { active } });
      if (disposed) return;
      if (profile?.user.id === userId) { profile.user = { ...profile.user, ...result }; paintProfile(); }
      else { button.setAttribute('aria-pressed', String(result.followedByMe)); button.textContent = t(result.followedByMe ? 'profile.following' : 'profile.follow'); }
      toast(t(result.followedByMe ? 'profile.followed' : 'profile.unfollowed'));
    } catch (error) { if (!disposed) toast(errorText(error)); }
    finally { busy = false; if (button.isConnected) button.disabled = false; }
  }
  const click = (event) => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-back')) back('you');
    else if (button.hasAttribute('data-signin')) openLogin();
    else if (button.hasAttribute('data-retry')) load();
    else if (button.hasAttribute('data-compose')) openPostComposer();
    else if (button.hasAttribute('data-follow') && profile) follow(profile.user.id, !profile.user.followedByMe, button);
    else if (button.dataset.followRow) follow(button.dataset.followRow, button.getAttribute('aria-pressed') !== 'true', button);
  };
  root.addEventListener('click', click);
  const refresh = () => { if (!disposed) load(); };
  const off = onSessionChange(refresh);
  document.addEventListener('along:community', refresh);
  load();
  return () => { disposed = true; gate.dispose(); off(); document.removeEventListener('along:community', refresh); root.removeEventListener('click', click); };
}
