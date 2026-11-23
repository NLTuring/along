// SFX cue table, pinned to the scenes' exported beats (local frames) + shot starts — never bare frame numbers.
// `at(F, file)` places a cue so the file's attack peak lands on frame F: from = F − peak lag − output offset
// (aesthetic-rules S5; lags measured by tools/sfx_peaks.py → docs/sfx-peaks.txt, AAC priming ≈ 1f).
// Files: public/sfx/<category>/<name>.mp3 (Mixkit, licence in public/sfx/ATTRIBUTION.md). No BGM in this film.
import { shot } from './timeline';
import { S00_BEATS } from './scenes/S00';
import { S01_BEATS } from './scenes/S01';
import { S02_BEATS } from './scenes/S02';
import { S03_BEATS } from './scenes/S03';
import { S04_BEATS } from './scenes/S04';
import { S05_BEATS } from './scenes/S05';
import { S06_BEATS } from './scenes/S06';
import { S07_BEATS } from './scenes/S07';
import { S08_BEATS } from './scenes/S08';
import { S09_BEATS } from './scenes/S09';
import { S10_BEATS } from './scenes/S10';
import { S11_BEATS } from './scenes/S11';

export type Sfx = { from: number; src: string; volume: number; dur?: number; label?: string };
const OUT = 1;
const LAG: Record<string, number> = {
  'text/pen-write-paper': 0, 'text/marker-pen-line': 0, 'light/sparkle-touch': 14, 'light/sparkle-wand': 5, 'light/shimmer-sparkle-sweep': 18, 'light/light-sweep-magic': 18,
  'light/light-transition-magic': 16, 'light/stardust-swish': 16, 'paper/paper-slide': 11, 'paper/paper-move-quick': 13, 'paper/paper-page-turn': 4, 'paper/paper-page-turn-big': 10,
  'paper/paper-crumple-quick': 8, 'paper/paper-staple': 4, 'paper/paper-wind-blow': 0, 'paper/paper-book-browse-fast': 0, 'transition/air-woosh-quick': 7, 'transition/air-woosh-deep': 15,
  'transition/air-zoom-vacuum': 13, 'transition/whoosh-swirl': 16, 'transition/whoosh-fast': 16, 'transition/swoosh-quick': 9, 'transition/swoosh-slow': 16, 'transition/sweep-short': 14,
  'transition/wind-woosh-throw': 5, 'transition/transition-soft': 13, 'transition/air-whoosh-powerful': 6, 'impact/hit-blow': 6, 'impact/hit-weak': 4, 'impact/bass-hit-short': 3,
  'impact/gravel-fall-hit': 3, 'impact/metal-spring-hit': 15, 'impact/impact-deep-whoosh': 17, 'riser/riser-cine': 0, 'ui/pop': 1, 'ui/switch-tap': 0, 'ui/hitech-touch-magnet': 0,
  'mech/lock-quick': 0, 'camera/camera-autofocus': 0, 'camera/camera-shutter-hard': 4, 'counter/clock-mech-retract': 2, 'data/data-scan': 6, 'data/whoosh-electric': 18,
  'text/typewriter-hit-soft': 4, 'text/typewriter-hit-hard': 1, 'fluid/liquid-bubble': 2, 'fluid/sand-swish': 9, 'light/light-aura': 0,
};
const at = (F: number, file: string, volume: number, dur?: number, label?: string): Sfx =>
  ({ from: Math.max(0, Math.round(F - (LAG[file] ?? 0) - OUT)), src: `${file}.mp3`, volume, dur, label: label ?? file.split('/')[1] });
const S = (id: Parameters<typeof shot>[0]) => shot(id).from;

const b0 = S('S00'), b1 = S('S01'), b2 = S('S02'), b3 = S('S03'), b4 = S('S04'), b5 = S('S05'), b6 = S('S06'), b7 = S('S07'), b8 = S('S08'), b9 = S('S09'), b10 = S('S10'), b11 = S('S11');
const B1 = S01_BEATS, B2 = S02_BEATS, B3 = S03_BEATS, B4 = S04_BEATS, B5 = S05_BEATS, B6 = S06_BEATS, B7 = S07_BEATS, B8 = S08_BEATS, B9 = S09_BEATS, B10 = S10_BEATS, B11 = S11_BEATS;

export const SFX: Sfx[] = [
  // S00 brush on the shade → shade up → through the window
  at(b0 + S00_BEATS.brush, 'text/pen-write-paper', 0.3, 34, 'brush'), at(b0 + 36, 'text/pen-write-paper', 0.24, 30, 'brush 2'),
  at(b0 + S00_BEATS.settled, 'light/sparkle-touch', 0.28, 60), at(b0 + S00_BEATS.shadeUp + 4, 'paper/paper-slide', 0.42), at(b0 + S00_BEATS.push + 8, 'transition/air-woosh-quick', 0.5),
  // S01 flylines into Shanghai, cards land, crash zoom
  at(b1 + B1.arcs + 10, 'transition/whoosh-swirl', 0.24), at(b1 + B1.arrive, 'light/sparkle-touch', 0.22, 50),
  at(b1 + B1.card57 + 8, 'ui/pop', 0.28), at(b1 + B1.cardEU + 8, 'ui/pop', 0.22), at(b1 + B1.cardTop + 8, 'ui/pop', 0.2), at(b1 + B1.cardQ3 + 8, 'ui/pop', 0.26),
  at(b1 + B1.roll + 4, 'counter/clock-mech-retract', 0.34), at(b1 + B1.push + 4, 'transition/air-zoom-vacuum', 0.5), at(b1 + B1.hit, 'impact/bass-hit-short', 0.44),
  // S02 six stamps, faster and faster; perforation; the page tears open
  at(b2 + 6, 'paper/paper-slide', 0.3),
  at(b2 + B2.stamp1, 'impact/hit-blow', 0.36), at(b2 + B2.stamp2, 'impact/gravel-fall-hit', 0.42), at(b2 + B2.stamp3, 'impact/hit-blow', 0.4),
  at(b2 + B2.stamp4, 'impact/gravel-fall-hit', 0.36), at(b2 + B2.stamp5, 'impact/hit-blow', 0.32), at(b2 + B2.stamp6, 'impact/gravel-fall-hit', 0.28),
  at(b2 + B2.perforate, 'paper/paper-page-turn', 0.34), at(b2 + B2.tear + 4, 'paper/paper-crumple-quick', 0.45), at(b2 + B2.tear + 12, 'transition/swoosh-quick', 0.36),
  // S03 phone rises, 小游 jumps out, hellos, chips, voice, reeded swap, flip
  at(b3 - 10, 'transition/sweep-short', 0.3), at(b3 + 17, 'impact/hit-weak', 0.18, 30, 'phone settles'), at(b3 + 4, 'light/light-aura', 0.12, 40, 'air'),
  at(b3 + B3.jump + 4, 'transition/wind-woosh-throw', 0.36), at(b3 + B3.jump + 18, 'ui/pop', 0.32),
  at(b3 + B3.jump + 22, 'ui/pop', 0.22), at(b3 + B3.jump + 28, 'ui/pop', 0.18),
  at(b3 + B3.chip1 + 4, 'ui/switch-tap', 0.24), at(b3 + B3.chip2 + 4, 'ui/switch-tap', 0.18), at(b3 + B3.chip3 + 4, 'ui/switch-tap', 0.18),
  at(b3 + B3.voice + 4, 'ui/hitech-touch-magnet', 0.18, 40), at(b3 + B3.swap + 16, 'transition/swoosh-quick', 0.14), at(b3 + B3.flip + 14, 'transition/whoosh-fast', 0.34),
  // S04 scan locks, plan, cards fly out, map rises as the floor
  at(b4 + B4.scan, 'data/data-scan', 0.2, 36), at(b4 + B4.lock1 + 4, 'mech/lock-quick', 0.3), at(b4 + B4.lock2 + 4, 'mech/lock-quick', 0.24), at(b4 + B4.lock3 + 4, 'mech/lock-quick', 0.2),
  at(b4 + B4.form2, 'ui/switch-tap', 0.24), at(b4 + B4.plan + 4, 'light/sparkle-touch', 0.26, 50),
  at(b4 + B4.cards + 10, 'paper/paper-move-quick', 0.21), at(b4 + B4.cards + 19, 'paper/paper-page-turn', 0.17), at(b4 + B4.cards + 28, 'paper/paper-move-quick', 0.15),
  at(b4 + B4.notes, 'text/marker-pen-line', 0.2), at(b4 + B4.drop + 18, 'transition/air-woosh-deep', 0.36), at(b4 + B4.land, 'impact/hit-weak', 0.3),
  // S05 pins, the walk drawn in ink, moon gate, partners, booked, push to the capture button
  at(b5 + B5.pins + 12, 'ui/pop', 0.24), at(b5 + B5.walk, 'text/marker-pen-line', 0.3), at(b5 + B5.phone + 6, 'transition/sweep-short', 0.24),
  at(b5 + B5.driver, 'ui/switch-tap', 0.26), at(b5 + B5.gate + 12, 'light/light-sweep-magic', 0.3, 60), at(b5 + B5.swap1, 'transition/swoosh-quick', 0.22),
  at(b5 + B5.gate + 32, 'ui/switch-tap', 0.2), at(b5 + B5.booked + 2, 'impact/hit-blow', 0.32),
  at(b5 + B5.push + 18, 'transition/air-zoom-vacuum', 0.4), at(b5 + B5.ring, 'ui/hitech-touch-magnet', 0.24, 30),
  // S06 reticle locks, focus, shutter, hashtags, post, TikTok, explode
  at(b6 + 20, 'mech/lock-quick', 0.36), at(b6 + B6.focus + 8, 'camera/camera-autofocus', 0.28, 14), at(b6 + B6.shutter, 'camera/camera-shutter-hard', 0.6),
  at(b6 + B6.polaroid, 'transition/swoosh-quick', 0.3),
  at(b6 + B6.tag1, 'text/typewriter-hit-soft', 0.22), at(b6 + B6.tag1 + 9, 'ui/pop', 0.3), at(b6 + B6.tag2, 'text/typewriter-hit-soft', 0.2), at(b6 + B6.tag2 + 9, 'ui/pop', 0.26),
  at(b6 + B6.tag3, 'text/typewriter-hit-soft', 0.18), at(b6 + B6.tag3 + 9, 'ui/pop', 0.22),
  at(b6 + B6.post + 4, 'transition/transition-soft', 0.22), at(b6 + B6.tiktok + 2, 'ui/switch-tap', 0.3), at(b6 + B6.explode + 8, 'transition/air-whoosh-powerful', 0.36),
  // S07 the magnet closes up, chips, hold ring, anime ripple, parcel, powder
  at(b7 + 22, 'impact/metal-spring-hit', 0.26), at(b7 + B7.chips, 'ui/switch-tap', 0.22), at(b7 + B7.chips + 9, 'ui/switch-tap', 0.18),
  at(b7 + B7.hold, 'ui/hitech-touch-magnet', 0.24, 28), at(b7 + B7.ripple + 8, 'light/shimmer-sparkle-sweep', 0.34), at(b7 + B7.parcel + 6, 'paper/paper-staple', 0.3),
  at(b7 + B7.fly + 6, 'transition/wind-woosh-throw', 0.34), at(b7 + B7.dust, 'paper/paper-wind-blow', 0.36, 60),
  // S08 powder settles into the network, pulses, roadmap, the window opens, six slats
  at(b8 + B8.dustSettled, 'light/stardust-swish', 0.2, 60), at(b8 + B8.logoWrite, 'text/pen-write-paper', 0.22, 26), at(b8 + B8.leftLight, 'light/sparkle-touch', 0.2, 50),
  at(b8 + B8.curvesGrow + 10, 'transition/swoosh-slow', 0.18, 50), at(b8 + B8.pulsesPour + 10, 'data/whoosh-electric', 0.16), at(b8 + B8.roadmap + 4, 'ui/pop', 0.22),
  at(b8 + B8.roadmap + 13, 'ui/pop', 0.18), at(b8 + B8.roadmap + 20, 'ui/pop', 0.15), at(b8 + B8.portholeOpen, 'paper/paper-slide', 0.3), at(b8 + B8.windowTurn, 'paper/paper-page-turn', 0.24),
  at(b8 + B8.slatsOut, 'paper/paper-book-browse-fast', 0.26, 24),
  // S09 the archive: wall turns, taken down, stamped
  at(b9 + B9.wallRelease + 12, 'transition/whoosh-swirl', 0.22), at(b9 + B9.note1, 'ui/pop', 0.2), at(b9 + B9.pick + 6, 'transition/swoosh-quick', 0.24),
  at(b9 + B9.turnInHand + 8, 'transition/sweep-short', 0.2), at(b9 + B9.stamp, 'impact/hit-blow', 0.5),
  // S10 ink bleeds, keepsakes fly into the mark: riser → impact → sparkle
  at(b10 + B10.inkBleed + 6, 'fluid/liquid-bubble', 0.24), at(b10 + B10.inkBleed + 16, 'light/light-transition-magic', 0.22, 50),
  at(b10 + B10.tilesFly, 'paper/paper-book-browse-fast', 0.2, B10.markDone - B10.tilesFly), at(b10 + B10.markDone - 70, 'riser/riser-cine', 0.32, 72),
  at(b10 + B10.markDone, 'impact/impact-deep-whoosh', 0.62), at(b10 + B10.markDone + 14, 'light/sparkle-touch', 0.3, 60),
  // S11 小游 jumps out; the slogan pressed word by word
  at(b11 + B11.pop, 'ui/pop', 0.3), at(b11 + B11.leap, 'transition/wind-woosh-throw', 0.32), at(b11 + B11.land, 'impact/hit-weak', 0.32),
  at(b11 + B11.word1, 'text/typewriter-hit-soft', 0.3), at(b11 + B11.word2, 'text/typewriter-hit-soft', 0.3), at(b11 + B11.word3, 'text/typewriter-hit-hard', 0.44),
  at(b11 + B11.word4, 'text/typewriter-hit-hard', 0.4), at(b11 + B11.rule, 'text/marker-pen-line', 0.24), at(b11 + B11.english, 'light/sparkle-wand', 0.34, 70),
];
export const sfxDuration = (s: Sfx) => s.dur ?? 90;
