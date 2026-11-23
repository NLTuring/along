import { t, te, esc } from './i18n.js';
import { api } from './api.js';
import { getSession, onSessionChange } from './auth.js';
import { go } from './router.js';
import { openPostComposer } from './post-sheet.js';
import { createRequestGate, pathId, visibleComments } from './community.js';
import { errorText, dateText, mediaHtml, stateHtml, stopMedia, needLogin, openReport, notifyPosts } from './community-ui.js';
import { openSheet, toast } from './ui.js';
import { socialScope, isFollowing, toggleFollow } from './social.js';

// Following a member is kept on this phone. Messages between members need a message service.
function followHtml(post) {
  const following = isFollowing(socialScope(getSession()), post.author.id);
  return `<div class="community-actions social-member"><button class="btn btn--secondary" data-follow-member aria-pressed="${following}">${te(following ? 'social.following' : 'social.follow')}</button><button class="btn btn--text btn--inline" data-message-member>${te('social.message')}</button></div>`;
}

export function renderPost(root, id) {
  let post = null, comments = [], disposed = false, mutating = false;
  const gate = createRequestGate(); let request;
  root.innerHTML = `<section class="page community-page"><a class="btn btn--text" href="#/stories">${te('community.back')}</a><p role="status" data-load>${te('community.loading')}</p><div data-detail></div><p class="field-error" role="alert" data-error></p><button class="btn btn--secondary" data-retry hidden>${te('community.retry')}</button></section>`;
  const host = root.querySelector('[data-detail]'), loadText = root.querySelector('[data-load]'), errorBox = root.querySelector('[data-error]'), retry = root.querySelector('[data-retry]');
  const alive = () => !disposed && gate.current(request);
  function paintComments() {
    const target = host.querySelector('[data-comments]'); if (!target) return;
    target.innerHTML = comments.length ? `<ol class="community-comments">${comments.map(comment => `<li><div class="community-heading"><strong>${esc(comment.author?.displayName)}</strong>${comment.status !== 'PUBLIC' ? stateHtml(comment.status) : ''}</div><p class="community-prose">${esc(comment.body)}</p><div class="community-actions"><span class="t-small">${esc(dateText(comment.createdAt))}</span><button class="btn btn--text" data-report-comment="${esc(comment.id)}">${te('community.report.action')}</button></div></li>`).join('')}</ol>` : `<p class="t-small">${te('community.noComments')}</p>`;
  }
  function paint() {
    stopMedia(host);
    const mine = getSession()?.id === post.author?.id;
    host.innerHTML = `<article class="community-detail"><div class="community-heading">${stateHtml(post.status)}${mine ? `<button class="btn btn--text" data-edit>${te('community.edit')}</button>` : ''}</div><h1 class="t-title">${esc(post.title)}</h1><p class="community-byline">${esc(post.author?.displayName)} · ${esc(post.city)}<br><time class="t-small">${esc(dateText(post.createdAt))}</time></p>${post.author?.id ? `<a class="profile-byline" href="#/u/${pathId(post.author.id)}"><span class="profile-avatar profile-avatar--sm" aria-hidden="true">${esc([...String(post.author.displayName || '?')][0]?.toUpperCase() || '?')}</span><span>${te('profile.openOf', { name: post.author.displayName || '' })}</span></a>` : ''}${!mine && post.author?.id ? followHtml(post) : ''}${post.status !== 'PUBLIC' ? `<p class="note">${te(post.status === 'DRAFT' ? 'community.draftNote' : 'community.privateNote')}</p>` : ''}${post.reviewNote ? `<p class="note"><strong>${te('community.reviewNote')}</strong> ${esc(post.reviewNote)}</p>` : ''}<div class="community-gallery">${(post.media || []).map(media => mediaHtml(media)).join('')}</div><p class="community-prose">${esc(post.body)}</p><div class="community-card__tags">${(post.tags || []).map(tag => `<span class="community-tag">#${esc(tag)}</span>`).join('')}</div>${post.poiId ? `<button class="btn btn--secondary" data-map>${te('community.map')}</button>` : ''}<div class="community-actions">${post.status === 'PUBLIC' ? `<button class="btn btn--secondary" data-like aria-pressed="${post.liked === true}">${te(post.liked ? 'community.unlike' : 'community.like')} · ${Number(post.likeCount) || 0}</button><button class="btn btn--secondary" data-save aria-pressed="${post.saved === true}">${te(post.saved ? 'community.unsave' : 'community.save')}</button><button class="btn btn--text" data-report>${te('community.report.action')}</button>` : ''}${mine ? `<button class="btn btn--text" data-delete>${te('community.delete')}</button>` : ''}</div>${mine ? `<div class="note" data-delete-confirm hidden><p>${te('community.deleteConfirm')}</p><div class="community-actions"><button class="btn btn--primary" data-delete-yes>${te('community.delete')}</button><button class="btn btn--text" data-delete-no>${te('community.keep')}</button></div></div>` : ''}<section class="community-comment-section"><h2 class="t-heading">${te('community.comments')}</h2><p class="t-small">${te('community.commentNote')}</p><div data-comments></div><p class="field-error" role="alert" data-comments-error></p>${post.status === 'PUBLIC' ? `<form class="community-form" data-comment-form><label class="field"><span>${te('community.writeComment')}</span><textarea class="input input--area" name="body" rows="3" maxlength="2000" required></textarea></label><button class="btn btn--primary" type="submit">${te('community.commentSubmit')}</button></form>` : ''}</section></article>`;
    paintComments();
  }
  async function load() {
    request = gate.next(); const current = request; post = null; comments = []; mutating = false;
    stopMedia(host); host.innerHTML = ''; loadText.textContent = t('community.loading'); errorBox.textContent = ''; retry.hidden = true;
    try {
      const result = await api(`/posts/${pathId(id)}`, { signal: current.signal });
      if (!gate.current(current) || disposed) return;
      if (result.post.status !== 'PUBLIC' && result.post.author?.id !== getSession()?.id) { const problem = new Error(); problem.code = 'NOT_FOUND'; throw problem; }
      post = result.post; paint(); loadText.textContent = '';
      try {
        const response = await api(`/posts/${pathId(id)}/comments`, { signal: current.signal });
        if (!gate.current(current) || disposed) return;
        comments = visibleComments(response.items, getSession()?.id); paintComments();
      } catch (problem) { if (gate.current(current) && !disposed) host.querySelector('[data-comments-error]').textContent = errorText(problem); }
    } catch (problem) { if (gate.current(current) && !disposed) { loadText.textContent = ''; errorBox.textContent = errorText(problem); retry.hidden = false; } }
  }
  async function mutate(path, method, body, done) {
    if (mutating || !post) return;
    if (!needLogin(() => load(), () => !disposed)) return;
    const current = request; mutating = true; errorBox.textContent = '';
    host.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { const response = await api(path, { method, body, signal: current.signal }); if (gate.current(current) && !disposed) done(response); }
    catch (problem) { if (gate.current(current) && !disposed) errorBox.textContent = errorText(problem); }
    finally { if (gate.current(current) && !disposed) { mutating = false; host.querySelectorAll('button').forEach(button => { button.disabled = false; }); } }
  }
  const click = event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-retry')) { load(); return; }
    if (!post) return;
    if (button.hasAttribute('data-follow-member')) {
      const result = toggleFollow(socialScope(getSession()), { id: post.author.id, kind: 'MEMBER', name: post.author.displayName || t('social.member') });
      if (!result.ok) { toast(t(result.error === 'LIMIT' ? 'social.followLimit' : 'error.STORAGE')); return; }
      button.setAttribute('aria-pressed', String(result.following)); button.textContent = t(result.following ? 'social.following' : 'social.follow');
      toast(t(result.following ? 'social.followed' : 'social.unfollowed', { name: post.author.displayName || t('social.member') }));
    } else if (button.hasAttribute('data-message-member')) {
      openSheet({ title: te('social.memberDmTitle'), body: `<p class="t-body">${te('social.memberDmBody')}</p><button class="btn btn--primary" data-sheet-close data-autofocus>${te('common.close')}</button>` });
    } else if (button.hasAttribute('data-map')) go(`map/${pathId(post.poiId)}`);
    else if (button.hasAttribute('data-edit')) openPostComposer({ post });
    else if (button.hasAttribute('data-like')) mutate(`/posts/${pathId(id)}/like`, 'PUT', { active: !post.liked }, result => { post = { ...post, ...result }; button.setAttribute('aria-pressed', String(post.liked)); button.textContent = `${t(post.liked ? 'community.unlike' : 'community.like')} · ${post.likeCount}`; });
    else if (button.hasAttribute('data-save')) mutate(`/posts/${pathId(id)}/save`, 'PUT', { active: !post.saved }, result => { post = { ...post, ...result }; button.setAttribute('aria-pressed', String(post.saved)); button.textContent = t(post.saved ? 'community.unsave' : 'community.save'); });
    else if (button.hasAttribute('data-report')) openReport('POST', id, () => !disposed);
    else if (button.dataset.reportComment) openReport('COMMENT', button.dataset.reportComment, () => !disposed);
    else if (button.hasAttribute('data-delete')) host.querySelector('[data-delete-confirm]').hidden = false;
    else if (button.hasAttribute('data-delete-no')) host.querySelector('[data-delete-confirm]').hidden = true;
    else if (button.hasAttribute('data-delete-yes')) mutate(`/posts/${pathId(id)}`, 'DELETE', undefined, () => { notifyPosts(); go('stories'); });
  };
  const submit = event => {
    const form = event.target.closest('[data-comment-form]'); if (!form) return;
    event.preventDefault(); const body = form.elements.body.value.trim();
    if (!body || body.length > 2000) { errorBox.textContent = t('community.error.comment'); return; }
    mutate(`/posts/${pathId(id)}/comments`, 'POST', { body }, result => { comments.push(result.comment); paintComments(); form.reset(); errorBox.textContent = ''; host.querySelector('[data-comments-error]').textContent = t('community.commentSent'); });
  };
  root.addEventListener('click', click); root.addEventListener('submit', submit);
  const refresh = () => load(); const off = onSessionChange(refresh); document.addEventListener('along:community', refresh); load();
  return () => { disposed = true; gate.dispose(); off(); stopMedia(root); document.removeEventListener('along:community', refresh); root.removeEventListener('click', click); root.removeEventListener('submit', submit); };
}
