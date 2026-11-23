// The phone and 小游 as continuous functions of the ABSOLUTE film frame, so S03→S04 (cut at 905, phone edge-on)
// and S04→S05 stay seamless. Phone poses are Stage3D coordinates (origin = frame centre).
import { Easing, interpolate } from 'remotion';
import type { Pose } from '../../components/Phone3D';
import type { Action, Expression } from '../../components/Mascot2D';
import { cue } from '../../timeline';
import { PIN } from './map';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const k = (F: number, a: number, b: number, e = Easing.bezier(0.16, 1, 0.3, 1)) => interpolate(F, [a, b], [0, 1], { ...clamp, easing: e });
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// T3: one 360° turn about Y across the cut — 885→905 = 0→90° (edge-on at the cut), 905→935 = 90→360°.
const FLIP = Easing.bezier(0.55, 0, 0.3, 1);
export const flipDeg = (F: number) => 360 * interpolate(F, [880, 940], [0, 1], { ...clamp, easing: FLIP });
export const FLIP_CUT = 905;

export function phonePose(F: number): { pose: Pose; height: number } {
  const rise = k(F, 615, 668, Easing.bezier(0.2, 0.8, 0.2, 1));
  let x = mix(-200, -260, rise), y = mix(620, -60, rise);
  let ry = mix(-38, -12, rise) + 6 * k(F, 668, 880, Easing.inOut(Easing.quad));
  let rx = mix(16, 4, rise);
  const flip = flipDeg(F);
  ry += flip;
  const lift = Math.sin((flip / 360) * Math.PI);
  y -= 30 * lift;
  // S04: slide left to make room for the floating stop cards, then leave as the map rises.
  x += -220 * k(F, 1040, 1064, Easing.inOut(Easing.cubic));
  const leave = k(F, 1125, 1152, Easing.bezier(0.55, 0, 0.9, 0.4));
  x += -1100 * leave; ry += -30 * leave;
  return { pose: { x, y, z: 0, rx, ry, rz: -2 * (1 - rise) }, height: 700 * (1 + 0.04 * lift) };
}

/** 小游 in screen px (centre-bottom of the character), size, expression, action, opacity. */
export function xyPose(F: number): { x: number; y: number; size: number; rot: number; e: Expression; a: Action; o: number; talk: boolean } {
  const hi = cue('X1', '你好');
  if (F < hi) return { x: 700, y: 640, size: 120, rot: 0, e: 'happy', a: 'idle', o: 0, talk: false };
  // jump out of the screen, arc, land right of the phone
  const j = interpolate(F, [hi, hi + 18], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.4, 1) });
  let x = mix(700, 1130, j), y = mix(640, 800, j) - Math.sin(Math.PI * j) * 260, size = mix(130, 300, j), rot = mix(-18, 0, j);
  let e: Expression = j < 1 ? 'excited' : 'happy', a: Action = j < 1 ? 'idle' : 'wave';
  const talk = F >= hi && F < cue('X1', '我', 1) + 12;
  if (F > cue('X1', '导航') - 4) a = 'talk';
  if (F > cue('X1', '放心')) { e = 'proud'; a = 'nod'; }
  // T3: a little hop while the phone turns
  const hop = interpolate(F, [884, 906, 928], [0, 1, 0], { ...clamp, easing: Easing.inOut(Easing.quad) });
  y -= 120 * hop; if (hop > 0) { e = 'excited'; a = 'idle'; }
  // S04: point at the form / the plan
  if (F > 945) { a = 'guide'; e = 'happy'; }
  if (F > cue('X2', '排好') - 6) { e = 'excited'; }
  // S04: step aside (left, under the cards) while the stop cards fly out
  const aside = k(F, 1040, 1066, Easing.inOut(Easing.cubic));
  x = mix(x, 800, aside); y = mix(y, 862, aside) - Math.sin(Math.PI * aside) * 80; size = mix(size, 260, aside);
  // T4: leap into the map, landing on "you are here"
  const dive = interpolate(F, [1122, 1156], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.3, 1) });
  if (dive > 0) {
    x = mix(x, PIN.here[0], dive); y = mix(y, PIN.here[1] - 6, dive) - Math.sin(Math.PI * dive) * 180;
    size = mix(size, 150, dive); rot = 0; e = 'excited'; a = 'idle';
  }
  return { x, y, size, rot, e, a, o: 1, talk };
}
