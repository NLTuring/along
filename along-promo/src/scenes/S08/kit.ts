// Small deterministic helpers shared by scenes S08–S11 (owner D).
import { Easing, interpolate } from 'remotion';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0→1 between absolute/local frames a and b (clamped both sides), optional easing. */
export const ramp = (f: number, a: number, b: number, easing?: (t: number) => number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });

/** Seeded PRNG (SKILL assets/lib/helpers/rand.ts). */
export const mulberry32 = (seed: number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const E = {
  outQuad: Easing.out(Easing.quad),
  outCubic: Easing.out(Easing.cubic),
  inOutCubic: Easing.inOut(Easing.cubic),
  inOutSine: Easing.inOut(Easing.sin),
  push: Easing.bezier(0.65, 0, 0.35, 1), // camera push / window grow
  slat: Easing.bezier(0.55, 0, 0.35, 1), // the app's window-slat curve (pages.css)
  press: Easing.bezier(0.2, 0.75, 0.3, 1), // paper-title-card letterpress
};

export type Pt = { x: number; y: number };

/** Monotone cubic (Fritsch–Carlson) through keyframes: one continuous camera curve, no stop at
 *  inner keys (velocity is continuous), zero velocity at both ends, no overshoot. */
export function monotone(xs: number[], ys: number[]) {
  const n = xs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Cubic bezier with an arc-length table (same idea as the bezier-source-converge-merge demo). */
export function cubicPath(p0: Pt, p1: Pt, p2: Pt, p3: Pt, samples = 600) {
  const at = (u: number): Pt => {
    const v = 1 - u;
    return {
      x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x,
      y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y,
    };
  };
  const cum: number[] = [0];
  let prev = p0, acc = 0;
  for (let k = 1; k <= samples; k++) {
    const p = at(k / samples);
    acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    cum.push(acc);
    prev = p;
  }
  const len = acc;
  const pointAt = (s: number): Pt => {
    const t = Math.max(0, Math.min(len, s));
    let lo = 0, hi = samples;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < t) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(1, lo);
    const s0 = cum[i - 1], s1 = cum[i];
    return at((i - 1 + (s1 > s0 ? (t - s0) / (s1 - s0) : 0)) / samples);
  };
  const d = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
  return { len, pointAt, d, p0, p3 };
}
export type CubicPath = ReturnType<typeof cubicPath>;
