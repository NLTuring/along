// S09 camera: the browser window is the subject; the "camera" is its 3D pose on a perspective stage.
// One continuous monotone curve through keyframes (no stops between keys). Frames ABSOLUTE.
//   Z   = page CSS px → film px (window width = 1920·Z; the 3840 video is always downscaled)
//   wx,wy = window centre on film; ry/rx = window yaw/pitch (deg)
import CAP from '../../../public/web/capture.json';
import { cue } from '../../timeline';
import { monotone } from '../S08/kit';

export const PAGE_W = 1920, PAGE_H = 1080; // the site's CSS viewport (video is 2×)
export const CHROME_H = 92; // browser bar, CSS px
export const PERSP = 2400;

// browse.mp4 frame k ↔ film frame: the stamp click (k = CAP.browse.stamp) lands on 「收藏」.
export const STAMP_ABS = cue('N4', '收藏'); // 2336
export const BROWSE_K0_ABS = STAMP_ABS - CAP.browse.stamp; // film frame of browse k = 0 (2129)
export const browseK = (abs: number) => abs - BROWSE_K0_ABS;
export const BROWSE_LAST = CAP.browse.frames - 1;
export const PICK_ABS = BROWSE_K0_ABS + CAP.browse.pick; // 2246: keepsake taken down
// The seal ("已藏") centre in page CSS px.
const SB = CAP.browse.sealBox;
export const SEAL = { x: SB.x + SB.width / 2, y: SB.y + SB.height / 2, r: SB.width / 2 };

const KEYS: [number, number, number, number, number, number][] = [
  // abs,   Z,    wx,   wy,    ry,    rx
  [2165, 0.7, 960, 570, -9, 2.5], // revealed under S08's rows: a window on the dusk sky
  [2222, 1.08, 960, 448, -0.6, 0.2], // pushed in until the page fills the frame (the wall coasts to a stop)
  [2262, 0.86, 960, 621, -3, 1.2], // keepsake in the hand: ease back to show the record + the keepsake
  [2340, 0.875, 958, 625, -3.4, 1.3], // stamped; held still for the ink
  [2410, 0.875, 958, 625, -3.4, 1.3],
];
const T = KEYS.map((k) => k[0]);
const ch = (i: number) => monotone(T, KEYS.map((k) => k[i]));
const fZ = ch(1), fX = ch(2), fY = ch(3), fRY = ch(4), fRX = ch(5);

export type Cam = { Z: number; wx: number; wy: number; ry: number; rx: number; w: number; h: number };
export const cam = (af: number): Cam => {
  const Z = fZ(af);
  return { Z, wx: fX(af), wy: fY(af), ry: fRY(af), rx: fRX(af), w: PAGE_W * Z, h: (PAGE_H + CHROME_H) * Z };
};

/** Page CSS point (+ lift in film px toward the viewer) → film px, matching the CSS transform
 *  `translate(...) rotateX(rx) rotateY(ry)` about the window centre on a stage with perspective PERSP. */
export function project(c: Cam, px: number, py: number, lift = 0) {
  const x0 = px * c.Z - c.w / 2;
  const y0 = (py + CHROME_H) * c.Z - c.h / 2;
  const a = (c.ry * Math.PI) / 180, b = (c.rx * Math.PI) / 180;
  // rotateY first (rightmost), then rotateX
  const x1 = x0 * Math.cos(a) + lift * Math.sin(a);
  const z1 = -x0 * Math.sin(a) + lift * Math.cos(a);
  const y2 = y0 * Math.cos(b) - z1 * Math.sin(b);
  const z2 = y0 * Math.sin(b) + z1 * Math.cos(b);
  const X = c.wx - 960 + x1, Y = c.wy - 540 + y2;
  const k = PERSP / (PERSP - z2);
  return { x: 960 + X * k, y: 540 + Y * k, k };
}
