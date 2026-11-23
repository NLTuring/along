// Real community feed. Curated examples remain an explicitly local, separate collection.
import { t, te, esc, getLocale } from './i18n.js';
import { skyline } from './ui.js';
import { getSession, onSessionChange } from './auth.js';
import { api } from './api.js';
import { go } from './router.js';
import { SAMPLE_POSTS, SAMPLE_AUTHORS } from './seed-community.js';
import { openPostComposer } from './post-sheet.js';
import { postsQuery, visiblePosts, mergePage, createRequestGate, pathId } from './community.js';
import { errorText, dateText, mediaHtml } from './community-ui.js';
import { socialScope, isLiked, listComments, listFollowing } from './social.js';
import { avatarHtml } from './page-example.js';

// A member's own stories, drafts and review state live on their profile (#/u/me), not here.
const MODES = ['latest', 'following', 'examples'];
// The tab last used, so coming back from an example lands where the reader was.
let lastMode = 'latest';

export function renderStories(root) {
  let mode = MODES.includes(lastMode) ? lastMode : 'latest', items = [], nextCursor = null, busy = false, disposed = false;
  let filters = { city: '', q: '', tag: '' };
  const gate = createRequestGate();
  root.innerHTML = `<section class="page page--tab page--stories community-page">${skyline()}<div class="community-heading"><h1 class="t-title">${te('community.title')}</h1><div class="community-heading__actions"><a class="btn btn--text btn--inline" href="#/u/me">${te('profile.mine')}</a><button class="btn btn--primary btn--inline" data-compose>${te('community.compose')}</button></div></div><p class="t-body">${te('community.subtitle')}</p><div class="segmented segmented--tabs" role="tablist" aria-label="${te('community.title')}">${MODES.map((tab) => `<button class="segmented__item${tab === mode ? ' is-on' : ''}" role="tab" id="community-tab-${tab}" aria-controls="community-panel" aria-selected="${tab === mode}" tabindex="${tab === mode ? 0 : -1}" data-mode="${tab}"><span>${te(`community.tab.${tab}`)}</span></button>`).join('')}</div><form class="community-filters" data-filters><label class="field"><span class="t-small">${te('community.search')}</span><input class="input" type="search" name="q" maxlength="120" placeholder="${te('community.searchPlaceholder')}"></label><div class="field-row"><label class="field"><span class="t-small">${te('community.city')}</span><input class="input" name="city" maxlength="100" placeholder="${te('community.allCities')}"></label><label class="field"><span class="t-small">${te('community.tag')}</span><input class="input" name="tag" maxlength="32" placeholder="${te('community.allTags')}"></label></div><div class="community-actions"><button class="btn btn--secondary" type="submit">${te('community.filter')}</button><button class="btn btn--text" type="reset">${te('community.reset')}</button></div></form><div id="community-panel" role="tabpanel" aria-labelledby="community-tab-latest"><p role="status" aria-live="polite" data-status></p><div data-results></div><button class="btn btn--secondary" data-more hidden>${te('community.more')}</button><button class="btn btn--secondary" data-retry hidden>${te('community.retry')}</button></div><a class="btn btn--text" href="#/make-orders">${te('community.inquiry.myRequests')}</a></section>`;
  const form = root.querySelector('[data-filters]'), results = root.querySelector('[data-results]'), status = root.querySelector('[data-status]'), more = root.querySelector('[data-more]'), retry = root.querySelector('[data-retry]');
  const realCard = (post) => `<li class="community-card"><a href="#/posts/${pathId(post.id)}" class="community-card__link">${mediaHtml(post.media?.[0], { cover: true })}<div class="community-card__body"><h2 class="t-heading">${esc(post.title)}</h2><p class="community-card__excerpt">${esc(post.body)}</p><p class="t-small community-byline">${esc(post.author?.displayName)} · ${esc(post.city)}</p><p class="t-small">${esc(dateText(post.createdAt))}</p><p class="t-small">${te('community.counts', { likes: Number(post.likeCount) || 0, comments: Number(post.commentCount) || 0 })}</p></div></a>${post.tags?.length ? `<div class="community-card__tags">${post.tags.map(tag => `<button class="community-tag" data-tag="${esc(tag)}">#${esc(tag)}</button>`).join('')}</div>` : ''}</li>`;
  function paintItems() {
    results.innerHTML = items.length ? `<ul class="community-masonry">${items.map(realCard).join('')}</ul>` : `<div class="empty"><h2 class="t-heading">${te('community.empty')}</h2><p>${te('community.emptyHint')}</p></div>`;
  }
  // Local examples look like community cards but stay clearly marked. A card opens the example;
  // the map button sits outside the link. Counts include this phone's own like and comments.
  function exampleCard(post) {
    const zh = getLocale() === 'zh', pick = (item, key) => item?.[key + (zh ? 'Zh' : 'En')];
    const scope = socialScope(getSession()), author = SAMPLE_AUTHORS[post.authorId];
    const likes = post.likes + (isLiked(scope, post.id) ? 1 : 0), comments = post.sampleComments.length + listComments(scope, post.id).length;
    return `<li class="community-card community-card--example"><a href="#/examples/${pathId(post.id)}" class="community-card__link">${post.photo ? `<img class="community-cover" src="${esc(post.photo)}" alt="${esc(pick(post, 'alt') || '')}" loading="lazy">` : ''}<div class="community-card__body"><span class="community-state">${te('community.localExample')}</span>${pick(post, 'title') ? `<h2 class="t-heading">${esc(pick(post, 'title'))}</h2>` : ''}<p class="community-card__excerpt">${esc(pick(post, 'text'))}</p><p class="t-small community-byline">${esc(pick(author, 'name') || pick(post, 'author'))}${post.city ? ` · ${te(`community.exampleCity.${post.city}`)}` : ''}</p><p class="t-small">${te('community.exampleCounts', { likes, comments })}</p></div></a>${author ? `<a class="social-card-author" href="#/u/${pathId(author.id)}">${avatarHtml(author, 'xs')}<span>${esc(pick(author, 'name'))}</span></a>` : ''}${post.poiId ? `<button class="btn btn--text social-card-map" data-map="${esc(post.poiId)}">${te('community.map')}</button>` : ''}${pick(post, 'tags')?.length ? `<div class="community-card__tags">${pick(post, 'tags').map(tag => `<span class="community-tag">#${esc(tag)}</span>`).join('')}</div>` : ''}</li>`;
  }
  function paintExamples() {
    results.innerHTML = `<p class="note">${te('community.examplesNote')}</p><ul class="community-masonry">${SAMPLE_POSTS.map(exampleCard).join('')}</ul>`;
  }
  // Following: examples by followed demo authors, plus followed members' posts from the latest page.
  async function loadFollowing(request) {
    const follows = listFollowing(socialScope(getSession()));
    if (!follows.length) {
      status.textContent = '';
      results.innerHTML = `<div class="empty"><h2 class="t-heading">${te('social.feedEmpty')}</h2><p>${te('social.feedEmptyHint')}</p><button class="btn btn--primary" data-mode="examples">${te('social.browseExamples')}</button></div>`;
      return;
    }
    const authors = new Set(follows.filter((f) => f.kind === 'SAMPLE').map((f) => f.id));
    const members = new Set(follows.filter((f) => f.kind === 'MEMBER').map((f) => f.id));
    const samples = SAMPLE_POSTS.filter((post) => authors.has(post.authorId));
    const paint = (posts, problem = '') => {
      results.innerHTML = samples.length || posts.length
        ? `${problem ? `<p class="field-error" role="alert">${esc(problem)}</p>` : ''}<ul class="community-masonry">${posts.map(realCard).join('')}${samples.map(exampleCard).join('')}</ul>`
        : `${problem ? `<p class="field-error" role="alert">${esc(problem)}</p>` : ''}<div class="empty"><p>${te('social.feedNoPosts')}</p></div>`;
    };
    status.textContent = members.size ? t('social.feedNote') : '';
    paint([]);
    if (!members.size) return;
    busy = true;
    try {
      const response = await api(postsQuery({}), { signal: request.signal });
      if (!gate.current(request) || disposed) return;
      paint(visiblePosts(response.items, getSession()?.id).filter((post) => members.has(post.author?.id)));
    } catch (error) {
      if (gate.current(request) && !disposed) paint([], errorText(error));
    } finally { if (gate.current(request)) busy = false; }
  }
  async function load(append = false) {
    const request = gate.next();
    more.hidden = true; retry.hidden = true; busy = false;
    if (mode === 'examples') { status.textContent = ''; paintExamples(); return; }
    if (mode === 'following') { await loadFollowing(request); return; }
    busy = true; status.textContent = t('community.loading');
    if (!append) { items = []; nextCursor = null; results.innerHTML = ''; }
    try {
      const response = await api(postsQuery({ ...filters, cursor: append ? nextCursor : '' }), { signal: request.signal });
      if (!gate.current(request) || disposed) return;
      const incoming = visiblePosts(response.items, getSession()?.id);
      items = append ? mergePage(items, incoming) : incoming;
      nextCursor = response.nextCursor || null;
      paintItems(); status.textContent = t('community.latestNote'); more.hidden = !nextCursor;
    } catch (error) {
      if (!gate.current(request) || disposed) return;
      status.textContent = errorText(error); retry.hidden = false;
    } finally { if (gate.current(request)) busy = false; }
  }
  function selectMode(next, focus = false) {
    mode = lastMode = next;
    root.querySelectorAll('[role="tab"][data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('is-on', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
    root.querySelector('#community-panel').setAttribute('aria-labelledby', `community-tab-${mode}`);
    form.hidden = ['examples', 'following'].includes(mode); load();
  }
  const click = event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.hasAttribute('data-compose')) openPostComposer();
    else if (target.dataset.mode) selectMode(target.dataset.mode);
    else if (target.hasAttribute('data-login')) needLogin(() => load(), () => !disposed);
    else if (target.dataset.map) go(`map/${pathId(target.dataset.map)}`);
    else if (target.dataset.tag) { form.elements.tag.value = target.dataset.tag; filters.tag = target.dataset.tag; load(); }
    else if (target.hasAttribute('data-more') && !busy) load(true);
    else if (target.hasAttribute('data-retry')) load();
  };
  const keydown = event => {
    if (!event.target.closest('[role="tab"][data-mode]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const count = MODES.length;
    selectMode(event.key === 'Home' ? MODES[0] : event.key === 'End' ? MODES[count - 1] : MODES[(MODES.indexOf(mode) + (event.key === 'ArrowRight' ? 1 : count - 1)) % count], true);
  };
  const submit = event => { event.preventDefault(); filters = { city: form.elements.city.value.trim(), tag: form.elements.tag.value.trim(), q: form.elements.q.value.trim() }; load(); };
  const reset = () => { filters = { city: '', tag: '', q: '' }; load(); };
  root.addEventListener('click', click); root.addEventListener('keydown', keydown); form.addEventListener('submit', submit); form.addEventListener('reset', reset);
  const refresh = () => load();
  const off = onSessionChange(refresh); document.addEventListener('along:community', refresh);
  root.querySelector('#community-panel').setAttribute('aria-labelledby', `community-tab-${mode}`);
  form.hidden = ['examples', 'following'].includes(mode);
  load();
  return () => { disposed = true; gate.dispose(); off(); document.removeEventListener('along:community', refresh); root.removeEventListener('click', click); root.removeEventListener('keydown', keydown); form.removeEventListener('submit', submit); form.removeEventListener('reset', reset); };
}
