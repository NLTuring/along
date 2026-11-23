// Profiles, the stories tab without "mine", sharing to Along, and the new place photos.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { POIS } from '../assets/js/seed-places.js';

// router.js imports nav.js, which reads `window` when it loads; a bare object is enough for parseHash.
globalThis.window ??= globalThis;
const { parseHash } = await import('../assets/js/router.js');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('profile routes', () => {
  it('opens my profile, anyone\'s profile and both lists', () => {
    assert.deepEqual(parseHash('#/u/me'), { name: 'profile', param: 'me', tab: 'you', nav: false, key: 'u/me' });
    const id = '7b1f0c2e-1a2b-4c3d-9e8f-001122334455';
    assert.equal(parseHash(`#/u/${id}`).param, id);
    assert.equal(parseHash(`#/u/${id}/followers`).param, `${id}/followers`);
    assert.equal(parseHash(`#/u/${id}/following`).key, `u/${id}/following`);
    assert.equal(parseHash(`#/u/${id}/anything`).param, id, 'unknown lists fall back to the profile');
    assert.equal(parseHash('#/u').name, 'trip', 'no id, no profile');
  });
  it('profile page helpers', async () => {
    const page = await read('../assets/js/page-profile.js');
    assert.match(page, /api\('\/me\/profile'/); assert.match(page, /\/users\/\$\{pathId\(userId\)\}\/follow`/);
    assert.match(page, /\/users\/\$\{pathId\(userId\)\}\/\$\{list\}`/);
    assert.doesNotMatch(page, /email/, 'profiles never show an email');
  });
});

describe('where the entry points are', () => {
  it('the avatar on the You tab and author bylines open profiles', async () => {
    const you = await read('../assets/js/page-you.js'), post = await read('../assets/js/page-post.js');
    assert.match(you, /you-head__avatar--link" data-profile/); assert.match(you, /go\('u\/me'\)/);
    assert.match(post, /href="#\/u\/\$\{pathId\(post\.author\.id\)\}"/);
  });
  it('the stories tab no longer has "my stories"; new posts land on the author\'s profile', async () => {
    const stories = await read('../assets/js/page-stories.js'), composer = await read('../assets/js/post-sheet.js');
    assert.doesNotMatch(stories, /'mine'|mine:/);
    assert.match(composer, /go\(post \? `posts\/\$\{pathId\(result\.post\.id\)\}` : `u\/\$\{pathId\(result\.post\.author\.id\)\}`\)/);
  });
  it('a film can be posted to Along, still behind the upload and publish consents', async () => {
    const film = await read('../assets/js/page-film.js'), share = await read('../assets/js/share-sheet.js'), composer = await read('../assets/js/post-sheet.js');
    assert.match(share, /data-publish/); assert.match(film, /openPostComposer\(\{ draft:/);
    assert.match(composer, /draft\?\.files/); assert.match(composer, /name="uploadConsent"/); assert.match(composer, /name="publishConsent"/);
    assert.match(composer, /status: 'LOCAL'/, 'files from a film start un-uploaded');
  });
});

describe('example authors have profiles', () => {
  it('every example author opens a profile route, and their avatars link to it', async () => {
    const { SAMPLE_AUTHORS, SAMPLE_POSTS } = await import('../assets/js/seed-community.js');
    for (const id of Object.keys(SAMPLE_AUTHORS)) {
      assert.deepEqual(parseHash(`#/u/${id}`), { name: 'profile', param: id, tab: 'you', nav: false, key: `u/${id}` });
      assert.ok(SAMPLE_POSTS.some((post) => post.authorId === id), `${id} has example stories`);
    }
    const profile = await read('../assets/js/page-profile.js');
    assert.match(profile, /Object\.hasOwn\(SAMPLE_AUTHORS, rawId\)/, 'demo authors are recognised before any server call');
    assert.match(profile, /href="#\/examples\/\$\{pathId\(post\.id\)\}"/, 'their grid opens the examples');
    const example = await read('../assets/js/page-example.js'), dm = await read('../assets/js/page-dm.js'), social = await read('../assets/js/page-social.js'), stories = await read('../assets/js/page-stories.js');
    assert.match(example, /export function avatarLink/); assert.match(example, /\$\{avatarLink\(author\)\}/);
    assert.match(dm, /avatarLink\(author, 'sm'\)/); assert.match(social, /avatarLink\(author \|\| \{ id: follow\.id/);
    assert.match(stories, /class="social-card-author" href="#\/u\/\$\{pathId\(author\.id\)\}"/);
    assert.doesNotMatch(stories, /<a [^>]*community-card__link[^>]*>(?:(?!<\/a>).)*social-card-author/s, 'no link inside the card link');
  });
});

describe('every trip place has a photo with a credit', () => {
  it('photo files exist and are credited in credits.json', async () => {
    const credits = JSON.parse(await read('../assets/img/credits.json'));
    const credited = new Map();
    for (const entry of Object.values(credits)) for (const item of [entry, ...(entry.photoGallery || [])]) if (item.photoUrl) credited.set(`img/${item.photoUrl}`, item);
    for (const place of Object.values(POIS)) {
      assert.ok(place.photo, `${place.id} has a photo`);
      assert.ok((await stat(new URL(`../assets/${place.photo}`, import.meta.url))).size > 50_000, `${place.photo} is a real image`);
      const credit = credited.get(place.photo);
      assert.ok(credit?.photoCredit && credit.photoCreditUrl && credit.photoLicenseUrl, `${place.photo} credit`);
      assert.equal(place.photoCredit, credit.photoCredit);
    }
    for (const item of credited.values()) if (/unsplash/.test(item.photoCreditUrl)) { assert.equal(item.photoLicenseUrl, 'https://unsplash.com/license'); assert.doesNotMatch(item.photoCredit, /contributor/); }
  });
});

describe('copy', () => {
  it('profile and share copy matches in both languages', async () => {
    const [en, zh] = await Promise.all(['en', 'zh'].map(async (l) => JSON.parse(await read(`../assets/messages/social.${l}.json`))));
    for (const key of Object.keys(en).filter((k) => /^(profile|share)\./.test(k))) {
      assert.ok(zh[key]?.trim(), key);
      assert.deepEqual([...en[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]), [...zh[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]), key);
    }
  });
});
