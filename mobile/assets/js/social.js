// Along — likes, comments, follows and message threads kept on this phone.
// Used for the local example stories and their demo authors, and for following real community
// members. Nothing here is uploaded; every account on the phone has its own separate copy.

const KEY = 'along.social.v1';
export const LIMITS = Object.freeze({ text: 500, id: 128, name: 80, commentsPerPost: 100, threadMessages: 200, follows: 200 });
const KINDS = ['SAMPLE', 'MEMBER'];

export function socialScope(session) {
  const email = typeof session?.email === 'string' ? session.email.trim().toLowerCase() : '';
  return email ? `u:${email}` : 'guest';
}

const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= LIMITS.id;
const cleanText = (value) => typeof value === 'string' ? value.trim() : '';
const list = (value) => Array.isArray(value) ? value : [];
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

// Only well-formed entries are read back; anything else is treated as absent.
function scopeData(raw) {
  const value = record(raw);
  const comments = {}, threads = {};
  for (const [postId, items] of Object.entries(record(value.comments))) {
    const good = list(items).filter((c) => validId(c?.id) && typeof c.text === 'string' && Number.isFinite(c.at));
    if (validId(postId) && good.length) comments[postId] = good;
  }
  for (const [authorId, items] of Object.entries(record(value.threads))) {
    const good = list(items).filter((m) => validId(m?.id) && typeof m.text === 'string' && Number.isFinite(m.at) && ['me', 'them'].includes(m.from));
    if (validId(authorId) && good.length) threads[authorId] = good;
  }
  return {
    likes: [...new Set(list(value.likes).filter(validId))],
    comments,
    follows: list(value.follows).filter((f) => validId(f?.id) && KINDS.includes(f.kind) && typeof f.name === 'string' && Number.isFinite(f.at)),
    threads,
  };
}

export function createSocialStore({ storage = () => globalThis.localStorage, now = () => Date.now(),
  makeId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}` } = {}) {
  function readAll() {
    try {
      const value = JSON.parse(storage()?.getItem(KEY) || 'null');
      return value?.version === 1 && value.scopes && typeof value.scopes === 'object' && !Array.isArray(value.scopes) ? value : { version: 1, scopes: {} };
    } catch { return { version: 1, scopes: {} }; }
  }
  const read = (scope) => scopeData(readAll().scopes[scope]);
  // A change is applied to a fresh copy and only reported once it is stored.
  function write(scope, change) {
    if (!validId(scope)) return { ok: false, error: 'VALIDATION' };
    const all = readAll(), data = scopeData(all.scopes[scope]);
    const result = change(data);
    if (!result.ok) return result;
    all.scopes[scope] = data;
    try { storage().setItem(KEY, JSON.stringify(all)); } catch { return { ok: false, error: 'STORAGE' }; }
    return result;
  }
  return {
    isLiked: (scope, postId) => read(scope).likes.includes(postId),
    toggleLike(scope, postId) {
      if (!validId(postId)) return { ok: false, error: 'VALIDATION' };
      return write(scope, (data) => {
        const liked = !data.likes.includes(postId);
        data.likes = liked ? [...data.likes, postId] : data.likes.filter((id) => id !== postId);
        return { ok: true, liked };
      });
    },
    listComments: (scope, postId) => read(scope).comments[postId] || [],
    addComment(scope, postId, text) {
      const body = cleanText(text);
      if (!validId(postId) || !body || body.length > LIMITS.text) return { ok: false, error: 'VALIDATION' };
      return write(scope, (data) => {
        const items = data.comments[postId] || [];
        if (items.length >= LIMITS.commentsPerPost) return { ok: false, error: 'LIMIT' };
        const comment = { id: makeId(), text: body, at: now() };
        data.comments[postId] = [...items, comment];
        return { ok: true, comment };
      });
    },
    removeComment(scope, postId, commentId) {
      return write(scope, (data) => {
        const items = data.comments[postId] || [];
        if (!items.some((c) => c.id === commentId)) return { ok: false, error: 'NOT_FOUND' };
        const rest = items.filter((c) => c.id !== commentId);
        if (rest.length) data.comments[postId] = rest; else delete data.comments[postId];
        return { ok: true };
      });
    },
    isFollowing: (scope, authorId) => read(scope).follows.some((f) => f.id === authorId),
    toggleFollow(scope, { id, kind, name } = {}) {
      const label = cleanText(name).slice(0, LIMITS.name);
      if (!validId(id) || !KINDS.includes(kind) || !label) return { ok: false, error: 'VALIDATION' };
      return write(scope, (data) => {
        if (data.follows.some((f) => f.id === id)) { data.follows = data.follows.filter((f) => f.id !== id); return { ok: true, following: false }; }
        if (data.follows.length >= LIMITS.follows) return { ok: false, error: 'LIMIT' };
        data.follows = [...data.follows, { id, kind, name: label, at: now() }];
        return { ok: true, following: true };
      });
    },
    listFollowing: (scope) => [...read(scope).follows].sort((a, b) => b.at - a.at),
    getThread: (scope, authorId) => read(scope).threads[authorId] || [],
    listThreads(scope) {
      return Object.entries(read(scope).threads)
        .map(([authorId, items]) => ({ authorId, last: items.at(-1), count: items.length }))
        .sort((a, b) => b.last.at - a.last.at);
    },
    sendMessage(scope, authorId, text, { from = 'me', auto = false } = {}) {
      const body = cleanText(text);
      if (!validId(authorId) || !body || body.length > LIMITS.text || !['me', 'them'].includes(from)) return { ok: false, error: 'VALIDATION' };
      return write(scope, (data) => {
        const message = { id: makeId(), from, text: body, at: now(), ...(auto ? { auto: true } : {}) };
        data.threads[authorId] = [...(data.threads[authorId] || []), message].slice(-LIMITS.threadMessages);
        return { ok: true, message };
      });
    },
  };
}

// The pages use this phone's real storage.
const store = createSocialStore();
export const isLiked = (...args) => store.isLiked(...args);
export const toggleLike = (...args) => store.toggleLike(...args);
export const listComments = (...args) => store.listComments(...args);
export const addComment = (...args) => store.addComment(...args);
export const removeComment = (...args) => store.removeComment(...args);
export const isFollowing = (...args) => store.isFollowing(...args);
export const toggleFollow = (...args) => store.toggleFollow(...args);
export const listFollowing = (...args) => store.listFollowing(...args);
export const getThread = (...args) => store.getThread(...args);
export const listThreads = (...args) => store.listThreads(...args);
export const sendMessage = (...args) => store.sendMessage(...args);
