// The turning window on the Trip tab: Shanghai and Nanjing scenes, cut into rows that leave in random order.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { WINDOW_SCENES, SLAT_COUNT, SLAT_SPREAD_MS, slatDelays, nextScene, windowPlace } from '../assets/js/window-scenes.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('window scenes', () => {
  it('shows Shanghai, with the Oriental Pearl, and Nanjing', async () => {
    const cities = new Set(WINDOW_SCENES.map((scene) => scene.city));
    assert.deepEqual([...cities].sort(), ['nanjing', 'shanghai']);
    assert.ok(WINDOW_SCENES.filter((scene) => scene.id.includes('pearl')).length >= 1, 'the Oriental Pearl is in the window');
    assert.equal(WINDOW_SCENES[0].id, 'shanghai-pearl-day', 'the Oriental Pearl is the first scene');
    for (let i = 1; i < WINDOW_SCENES.length; i++) assert.notEqual(WINDOW_SCENES[i].city, WINDOW_SCENES[i - 1].city, 'cities alternate');
    assert.equal(new Set(WINDOW_SCENES.map((scene) => scene.id)).size, WINDOW_SCENES.length);
  });
  it('every scene has its photo, copy and a free-licence source', async () => {
    const zh = JSON.parse(await read('../assets/messages/zh.json'));
    const en = JSON.parse(await read('../assets/messages/en.json'));
    for (const scene of WINDOW_SCENES) {
      const file = await stat(new URL(`../assets/${scene.src}`, import.meta.url));
      assert.ok(file.size > 20_000 && file.size < 600_000, `${scene.src} is a real, reasonably sized photo`);
      for (const messages of [zh, en]) {
        assert.ok(messages[scene.tagKey], `${scene.tagKey} is translated`);
        assert.ok(messages[scene.altKey], `${scene.altKey} is translated`);
      }
      assert.match(scene.url, /^https:\/\/unsplash\.com\/photos\//);
      assert.ok(scene.author);
    }
    assert.match(zh['window.credit'], /\{author\}/); assert.match(en['window.credit'], /\{author\}/);
    assert.equal(zh['arrive.window.tag'], undefined, 'the single fixed photo is gone');
  });
  it('rows start at different moments, in no fixed order', () => {
    const seen = new Set();
    for (let run = 0; run < 40; run++) {
      const delays = slatDelays();
      assert.equal(delays.length, SLAT_COUNT);
      assert.ok(delays.every((d) => Number.isInteger(d) && d >= 0 && d <= SLAT_SPREAD_MS));
      assert.equal(new Set(delays).size, SLAT_COUNT, 'no two rows leave together');
      seen.add(delays.map((_, row) => row).sort((a, b) => delays[a] - delays[b]).join());
    }
    assert.ok(seen.size > 10, 'the order changes from turn to turn');
  });
  it('every scene leads to a named place in its own city', async () => {
    const { POIS } = await import('../assets/js/seed-places.js');
    for (const scene of WINDOW_SCENES) {
      const place = (Object.hasOwn(POIS, scene.place) ? POIS[scene.place] : null) || windowPlace(scene.place);
      assert.ok(place, `${scene.id} leads somewhere`);
      assert.equal(place.citySlug, scene.city, `${scene.id} leads to a place in ${scene.city}`);
      assert.ok(place.nameZh, 'the map finds it by its Chinese name');
      assert.equal('lat' in place && !POIS[scene.place], false, 'window places carry no unverified coordinates');
    }
    assert.equal(WINDOW_SCENES.find((scene) => scene.id === 'shanghai-pearl-day').place, 'view_pearl');
    assert.equal(windowPlace('toString'), null, 'only its own places');
    assert.equal(windowPlace('poi_jiming'), null);
  });
  it('tapping the window opens the map for the scene on show', async () => {
    const show = await read('../assets/js/window-show.js');
    assert.match(show, /<button class="window-show__go" type="button" data-window-go aria-label=/);
    assert.match(show, /onOpen\(WINDOW_SCENES\[index\]\)/);
    assert.match(show, /removeEventListener\('click', open\)/);
    const page = await read('../assets/js/page-arrive.js');
    assert.match(page, /onOpen: \(scene\) => go\(`map\/\$\{encodeURIComponent\(scene\.place\)\}`\)/);
    for (const map of ['page-map.js', 'page-native-map.js']) {
      assert.match(await read(`../assets/js/${map}`), /\|\| windowPlace\(poiId\)/, `${map} accepts window places`);
    }
  });
  it('turns round to the first scene after the last', () => {
    assert.equal(nextScene(0), 1);
    assert.equal(nextScene(WINDOW_SCENES.length - 1), 0);
  });
  it('the Trip page uses the turning window and keeps reduced motion still', async () => {
    const page = await read('../assets/js/page-arrive.js');
    assert.match(page, /windowShowHtml\(\)/); assert.match(page, /mountWindowShow\(root/);
    const show = await read('../assets/js/window-show.js');
    assert.match(show, /prefersReducedMotion\(\)/); assert.match(show, /document\.hidden/); assert.match(show, /isConnected/);
    const css = await read('../assets/css/pages.css');
    assert.match(css, /@keyframes window-slat[\s\S]*translateX\(-104%\)/);
  });
});
