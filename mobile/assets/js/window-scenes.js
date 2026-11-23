// Along — the scenes that turn in the Trip tab's window. Free photos under the Unsplash License
// (https://unsplash.com/license), cropped to the window's 3:4 shape; the photographer is shown.
// Tapping the window opens the map with directions to where the scene on show was taken.

// Places a scene can lead to that are not trip stops. Like the stops, they carry only a name:
// the map finds them by a Baidu search, so no unverified coordinates are used.
// `aliases` are the shorter names people say, so 小游 can find them too.
export const WINDOW_PLACES = {
  view_pearl: { id: 'view_pearl', citySlug: 'shanghai', nameZh: '东方明珠广播电视塔', nameEn: 'Oriental Pearl Tower', aliases: ['东方明珠', 'Oriental Pearl'] },
  view_bund: { id: 'view_bund', citySlug: 'shanghai', nameZh: '外滩', nameEn: 'The Bund', aliases: ['Bund'] },
  view_xuanwu: { id: 'view_xuanwu', citySlug: 'nanjing', nameZh: '玄武湖景区', nameEn: 'Xuanwu Lake', aliases: ['玄武湖', 'Xuanwu'] },
};
export const windowPlace = (id) => (Object.hasOwn(WINDOW_PLACES, id) ? WINDOW_PLACES[id] : null);

export const WINDOW_SCENES = [
  { id: 'shanghai-pearl-day', src: 'img/window/shanghai-pearl-day.jpg', city: 'shanghai', author: 'alan braeley', place: 'view_pearl',
    url: 'https://unsplash.com/photos/brown-and-red-tower-during-daytime-YhSfWtCMDug', tagKey: 'window.pearl', altKey: 'window.pearl.alt' },
  { id: 'nanjing-xuanwu-bridge', src: 'img/window/nanjing-xuanwu-bridge.jpg', city: 'nanjing', author: 'kimi lee', place: 'view_xuanwu',
    url: 'https://unsplash.com/photos/stone-path-leads-to-a-beautiful-arched-bridge-Scjvc4CC2R8', tagKey: 'window.xuanwu', altKey: 'window.xuanwu.alt' },
  // Taken from the north end of the Bund: Waibaidu Bridge in front, Lujiazui across the river.
  { id: 'shanghai-lujiazui-night', src: 'img/window/shanghai-lujiazui-night.jpg', city: 'shanghai', author: 'Lijian (Richard) Zhu', place: 'view_bund',
    url: 'https://unsplash.com/photos/shanghai-skyline-with-oriental-pearl-tower-at-night-vt7b_-7Kl4c', tagKey: 'window.lujiazui', altKey: 'window.lujiazui.alt' },
  // Zifeng Tower seen across Xuanwu Lake.
  { id: 'nanjing-lake-skyline', src: 'img/window/nanjing-lake-skyline.jpg', city: 'nanjing', author: 'Cheng Shi Song', place: 'view_xuanwu',
    url: 'https://unsplash.com/photos/city-skyline-reflected-in-a-shimmering-lake--aedpNhiWac', tagKey: 'window.lake', altKey: 'window.lake.alt' },
  { id: 'shanghai-pearl-night', src: 'img/window/shanghai-pearl-night.jpg', city: 'shanghai', author: '蔡 世宏', place: 'view_pearl',
    url: 'https://unsplash.com/photos/white-and-blue-lighted-tower-during-night-time-cQhu6z_twy8', tagKey: 'window.pearlNight', altKey: 'window.pearlNight.alt' },
  { id: 'nanjing-jiming', src: 'img/window/nanjing-jiming.jpg', city: 'nanjing', author: 'Nathan Wong', place: 'poi_jiming',
    url: 'https://unsplash.com/photos/a-tall-yellow-building-with-a-tower-in-the-background-SMOpX47-Cx8', tagKey: 'window.jiming', altKey: 'window.jiming.alt' },
];

export const SCENE_MS = 5200;     // how long each scene stays
export const SLAT_COUNT = 6;      // rows the outgoing scene is cut into
export const SLAT_MS = 720;       // how long one row takes to slide out
export const SLAT_SPREAD_MS = 420; // rows start at random moments within this span

// Start delays for the rows, in a shuffled order so no two turns look the same.
export function slatDelays(count = SLAT_COUNT, spread = SLAT_SPREAD_MS, random = Math.random) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const step = spread / count;
  const delays = new Array(count);
  order.forEach((row, rank) => { delays[row] = Math.round(rank * step + random() * step * 0.6); });
  return delays;
}

// The scene after `index`, wrapping round.
export const nextScene = (index, count = WINDOW_SCENES.length) => (index + 1) % count;
