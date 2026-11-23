// InsTrip mobile — sky.
// The top of every page takes the colour of the sky over the destination city
// right now (its local time and weather), and the glass highlight follows the sun.

import { clockIn } from './format.js';

export const SKY_STATES = ['dawn', 'day', 'dusk', 'night', 'rain', 'overcast'];

const root = document.documentElement;
let timer = null;
let live = { timeZone: 'Asia/Shanghai', weather: null };
let preview = null;   // { hour, minute } while the arrival form shows a chosen time
let forced = null;    // ?sky=night in the URL, for checking each state by eye

// Minutes after midnight -> state. Rain and overcast only replace the daylight
// states; at night the sky stays night.
export function skyStateFor(hour, minute = 0, weather = null) {
  const m = hour * 60 + minute;
  let state;
  if (m >= 300 && m < 420) state = 'dawn';         // 05:00–07:00
  else if (m >= 420 && m < 1050) state = 'day';    // 07:00–17:30
  else if (m >= 1050 && m < 1170) state = 'dusk';  // 17:30–19:30
  else state = 'night';                            // 19:30–05:00
  if (state !== 'night' && (weather === 'rain' || weather === 'overcast')) return weather;
  return state;
}

// Direction of the highlight gradient on glass. 140deg starts at the top left
// (morning light), 220deg at the top right (afternoon); straight down at night.
export function lightAngleFor(hour, minute = 0) {
  const m = hour * 60 + minute;
  if (m < 420 || m >= 1170) return 180;
  const progress = Math.min(1, (m - 420) / (1050 - 420));
  return Math.round(140 + progress * 80);
}

function paint(hour, minute, weather) {
  const state = forced || skyStateFor(hour, minute, weather);
  if (root.dataset.sky !== state) root.dataset.sky = state;
  root.style.setProperty('--glass-light-angle', `${lightAngleFor(hour, minute)}deg`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--sky-top').trim() || '#F7F2E8';
  return state;
}

const tickListeners = new Set();

// Called on every repaint (at least once a minute) so captions showing the
// destination's local time can stay current.
export function onSkyTick(fn) {
  tickListeners.add(fn);
  return () => tickListeners.delete(fn);
}

function tick() {
  const now = clockIn(new Date(), live.timeZone);
  const state = preview
    ? paint(preview.hour, preview.minute, null)
    : paint(now.hour, now.minute, live.weather);
  tickListeners.forEach((fn) => fn({ ...now, state }));
  return state;
}

// Follow the destination's clock. Re-checks once a minute.
export function startSky({ timeZone = 'Asia/Shanghai', weather = null } = {}) {
  live = { timeZone, weather };
  const param = new URLSearchParams(location.search).get('sky');
  forced = SKY_STATES.includes(param) ? param : null;
  clearInterval(timer);
  timer = setInterval(tick, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  return tick();
}

export function setWeather(weather) {
  live.weather = weather === 'rain' || weather === 'overcast' ? weather : null;
  return tick();
}

// Show the sky at a chosen local time, e.g. the hour the traveller lands.
export function previewSky(hour, minute = 0) {
  preview = { hour, minute };
  return tick();
}

export function clearSkyPreview() {
  preview = null;
  return tick();
}

export function currentSky() {
  return root.dataset.sky || 'day';
}
