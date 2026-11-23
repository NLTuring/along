// InsTrip mobile — stories (spec §6.14, §7.5).
// No community service is connected, so a story is saved on this phone with
// status PENDING ("in review") and only its author sees it, which is also what
// the spec says about pending posts. Nothing is sent anywhere, and there are no
// stories from other travellers to show.

import { SAMPLE_POSTS } from './seed-community.js';

const KEY = 'instrip.posts';
export const MAX_TEXT = 500;

function readAll() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode: lasts for this page only */
  }
}

// -> { ok: true, post } | { ok: false, error: 'VALIDATION_ERROR' }
export function createPost({ text, mediaId, email }) {
  const clean = String(text || '').trim().slice(0, MAX_TEXT);
  if (!clean && !mediaId) return { ok: false, error: 'VALIDATION_ERROR' };
  const post = {
    id: `po_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
    kind: 'USER',
    status: 'PENDING',
    email,
    text: clean,
    mediaId: mediaId || null,
    liked: false,
    createdAt: Date.now(),
  };
  const list = readAll();
  list.unshift(post);
  writeAll(list);
  return { ok: true, post };
}

// Pending posts are visible to their author only.
export function listPosts(email) {
  return readAll().filter((p) => p.status === 'VISIBLE' || (email && p.email === email));
}

export function listSamplePosts() {
  return SAMPLE_POSTS.map((post) => ({ ...post }));
}

export function toggleLike(id) {
  const list = readAll();
  const post = list.find((p) => p.id === id);
  if (!post) return null;
  post.liked = !post.liked;
  writeAll(list);
  return post;
}

export function removePost(id, email) {
  const list = readAll();
  const post = list.find((p) => p.id === id);
  if (!post || post.email !== email) return false;
  writeAll(list.filter((p) => p.id !== id));
  return true;
}
