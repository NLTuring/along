// 小游's performance in S11, frame by frame (ABSOLUTE frames). Positions live in the frozen
// recording's own video px (3840×2160), so he stays on the hall floor while the crop camera moves.
//   2500–2503  still (S10's last frame, R1 hold of the mark continues)
//   2503–2513  springs up from behind the crown of the mark's hat (clipped by the hat's top edge)
//   2513–2526  leaps forward–down to the right of the mark, a full turn in the air (spin 2509–2526)
//   2526–2532  lands: squash, small rebound · 2524–2612 waves (ArmR) · talks during X6
//   2615–      idle: breathing, tail sway, two blinks, a glance at the slogan
import { Easing } from 'remotion';
import { cue, cueEnd } from '../../timeline';
import { clamp01, lerp, ramp, E } from '../S08/kit';
import type { XyPose } from './Xiaoyou3D';

export const T = { pop: 2503, apex: 2513, land: 2526, spin0: 2509 };
const HIDE = { x: 1910, y: 875, h: 270 }; // feet below the crown line: hidden
const APEX = { x: 1910, y: 520, h: 270 }; // just clear of the hat
export const LAND = { x: 3120, y: 1872, h: 565 }; // floor to the right of the mark (film ≈ 1600, 931, 294 px tall)

const TALK = [cue('X6', '让'), cueEnd('X6', '游')]; // 2543–2590
const outBack = Easing.bezier(0.34, 1.56, 0.64, 1);

/** Feet/height in video px at frame af. */
export function placeVideo(af: number) {
  if (af < T.apex) {
    const k = ramp(af, T.pop, T.apex, E.outCubic);
    return { x: HIDE.x, y: lerp(HIDE.y, APEX.y, k), h: HIDE.h };
  }
  const p = clamp01((af - T.apex) / (T.land - T.apex));
  return { x: lerp(APEX.x, LAND.x, p), y: lerp(APEX.y, LAND.y, p * p), h: lerp(APEX.h, LAND.h, Math.pow(p, 1.6)) };
}

const blinkAt = (af: number, t: number) => {
  const d = Math.abs(af - t);
  return d > 2.5 ? 1 : Math.max(0.08, d / 2.5);
};

/** Everything but the film placement (S11 converts video px → film px with the crop). */
export function act(af: number): Omit<XyPose, 'x' | 'y' | 'h'> {
  const t = af / 30;
  const air = af >= T.pop && af < T.land;
  // squash & stretch: stretch on the spring, squash on landing, one small rebound
  const stretch = 0.08 * Math.sin(Math.PI * ramp(af, T.pop, T.apex));
  const squash = 0.12 * Math.sin(Math.PI * ramp(af, T.land, T.land + 6)) - 0.04 * Math.sin(Math.PI * ramp(af, T.land + 6, T.land + 12));
  const breathe = af >= T.land + 12 ? Math.sin(t * 2.1) : 0;
  const sy = 1 + stretch - squash - breathe * 0.01;
  const sx = 1 - stretch * 0.5 + squash * 0.8 + breathe * 0.008;
  // one full turn in the air (buddy.js jump turns him 2π)
  const spin = 2 * Math.PI * ramp(af, T.spin0, T.land, E.inOutSine);
  const glance = ramp(af, 2620, 2632, E.inOutSine) * (1 - ramp(af, 2650, 2662, E.inOutSine));
  const yaw = spin - 0.25 - 0.12 * glance + (af >= T.land ? Math.sin(t * 0.6) * 0.05 : 0);
  // arms: flung out in the air, then the wave
  const fling = Math.sin(Math.PI * ramp(af, T.pop + 2, T.land + 2));
  const wave = Math.min(ramp(af, T.land - 2, T.land + 5, E.outCubic), 1 - ramp(af, 2600, 2612, E.inOutSine));
  // buddy.js waves at 2.3 ± .35 rad; at this framing the top of that swing hides behind the brim,
  // so the swing is lowered to 1.95 ± .32 (hand beside the brim, never under it).
  const armR = fling * 1.1 * (1 - wave) + wave * (1.95 + Math.sin(t * 11) * 0.32) + Math.sin(t * 2.1) * 0.04;
  const armL = -fling * 1.1 - Math.sin(t * 2.1 + 0.6) * 0.06;
  const tails = Math.sin(t * 1.7) * 0.08 + (air ? 0.25 * Math.sin(Math.PI * ramp(af, T.pop, T.land)) : 0);
  const hat = Math.sin(t * 1.05 + 1) * 0.02 + (air ? -0.05 * Math.sin(Math.PI * ramp(af, T.apex, T.land)) : 0);
  // face: surprised 'o' in the air, happy grin on landing; talks during X6; later open eyes + blinks
  const landed = af >= T.land;
  const talking = af >= TALK[0] && af < TALK[1] && Math.sin(t * 18) > 0;
  const happy = landed && af < 2616;
  const eyes: XyPose['eyes'] = happy ? 'happy' : 'open';
  const mouth: XyPose['mouth'] = !landed && af >= T.pop ? 'o' : talking ? 'o' : 'grin';
  const blink = Math.min(blinkAt(af, 2640), blinkAt(af, 2676));
  return { yaw, lean: 0.17, sx, sy, armR, armL, tails, hat, eyes, mouth, blink, look: -0.8 * glance, visible: af >= T.pop };
}

/** Contact shadow on the floor (video px): grows in as he comes down. */
export function shadowVideo(af: number) {
  const k = ramp(af, T.land - 7, T.land, E.outCubic);
  return { x: LAND.x, y: LAND.y, w: LAND.h * 0.78 * (0.6 + 0.4 * k), op: 0.3 * k };
}

export { outBack };
