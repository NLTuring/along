// T8, second half: the coloured powder S07's keepsake broke into turns back from the top-right
// and settles, faster and faster, into the network's seeds (card ports, the hub, chip ports).
// All frames ABSOLUTE.
import React from 'react';
import { C } from '../../tokens';
import { mulberry32, clamp01, lerp, E, ramp, Pt } from './kit';
import { SEEDS, B } from './layout';

const PALETTE: [string, number][] = [[C.paper, 0.3], [C.accent, 0.24], [C.gold, 0.18], [C.sage, 0.16], [C.ink, 0.12]];
const N = 260;
const T_FIRST = 1930; // first speck lands
const T_TURN = 1904; // earliest turn-back (S07's powder still blows up-right before this)
const T_DECEL = 14; // frames over which the up-right drift slows to a stop

type Particle = { o: Pt; c1: Pt; c2: Pt; t: Pt; seed: number; r: number; col: string; t0: number; tA: number; w: Pt };

const rnd = mulberry32(20261119);
const pick = <T,>(list: [T, number][]) => {
  let u = rnd() * list.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of list) { if ((u -= w) <= 0) return v; }
  return list[list.length - 1][0];
};
const SEED_W: [number, number][] = SEEDS.map((s, i) => [i, s.weight]);

export const PARTICLES: Particle[] = Array.from({ length: N }, (_, k) => {
  const seed = pick(SEED_W);
  const s = SEEDS[seed];
  const o = { x: 1960 - 720 * Math.pow(rnd(), 1.4), y: -60 + 420 * Math.pow(rnd(), 1.3) };
  const c1 = { x: o.x + 60 + 110 * rnd(), y: o.y - 40 - 90 * rnd() };
  const jit = s.kind === 'H' ? 26 : 10;
  const t = { x: s.x + (rnd() - 0.5) * jit, y: s.y + (rnd() - 0.5) * jit };
  const c2 = { x: t.x + 120 + 260 * rnd(), y: t.y - 80 - 200 * rnd() };
  // Arrivals get denser toward the end (sqrt of rank): the settling speeds up, then stops.
  const tA = T_FIRST + (B.dustLast - T_FIRST) * Math.sqrt(k / (N - 1));
  const dur = 26 + 14 * rnd();
  const r = 2.2 + 4.2 * Math.pow(rnd(), 2);
  // Until t0 each speck still rides S07's wind (up-right), slowing to a stop, then turns back.
  return { o, c1, c2, t, seed, r, col: pick(PALETTE), t0: Math.max(T_TURN, tA - dur), tA, w: { x: 2.4 + rnd() * 1.2, y: -1.1 - rnd() * 0.8 } };
});

const bez = (p: Particle, u: number): Pt => {
  const v = 1 - u;
  return {
    x: v * v * v * p.o.x + 3 * v * v * u * p.c1.x + 3 * v * u * u * p.c2.x + u * u * u * p.t.x,
    y: v * v * v * p.o.y + 3 * v * v * u * p.c1.y + 3 * v * u * u * p.c2.y + u * u * u * p.t.y,
  };
};
const posAt = (p: Particle, f: number): Pt => {
  if (f <= p.t0) {
    // velocity decays linearly to 0 at t0: displacement before t0 = ∫ v
    const d = p.t0 - f;
    const disp = d < T_DECEL ? (d * d) / (2 * T_DECEL) : d - T_DECEL / 2;
    return { x: p.o.x - p.w.x * disp, y: p.o.y - p.w.y * disp };
  }
  return bez(p, E.inOutSine(clamp01((f - p.t0) / (p.tA - p.t0))));
};

const COUNT = SEEDS.map((_, i) => PARTICLES.filter((p) => p.seed === i).length);
/** How full a seed is at frame f (0..1). */
export const seedFill = (i: number, f: number) => PARTICLES.filter((p) => p.seed === i && p.tA <= f).length / Math.max(1, COUNT[i]);
export const seedRadius = (i: number, f: number) => {
  const k = Math.sqrt(seedFill(i, f));
  return SEEDS[i].kind === 'H' ? 4 + 18 * k : 3 + 6 * k;
};

export const Dust: React.FC<{ af: number; hideSeed: (i: number) => boolean }> = ({ af, hideSeed }) => {
  const fadeIn = ramp(af, B.dust0, B.dust0 + 7);
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {af <= B.dustLast + 2 &&
        PARTICLES.map((p, k) => {
          if (af > p.tA + 1) return null;
          const u = clamp01((af - p.t0) / (p.tA - p.t0));
          const absorb = clamp01((u - 0.86) / 0.14);
          const a = posAt(p, af), b = posAt(p, af - 0.7);
          const r = p.r * lerp(1, 0.35, absorb);
          const op = 0.92 * fadeIn * (1 - absorb);
          if (op <= 0.01) return null;
          return (
            <g key={k} opacity={op}>
              <line x1={b.x} y1={b.y} x2={a.x} y2={a.y} stroke={p.col} strokeWidth={r * 1.4} strokeLinecap="round" opacity={0.45} />
              <circle cx={a.x} cy={a.y} r={r} fill={p.col} />
            </g>
          );
        })}
      {SEEDS.map((s, i) => {
        if (hideSeed(i)) return null;
        const fill = seedFill(i, af);
        if (fill <= 0) return null;
        const r = seedRadius(i, af);
        return (
          <g key={`s${i}`} opacity={ramp(fill, 0, 0.08)}>
            <circle cx={s.x} cy={s.y + 1.5} r={r + 2} fill="rgba(60,42,20,.16)" />
            <circle cx={s.x} cy={s.y} r={r} fill={C.surface} stroke={C.ink} strokeWidth={2} />
          </g>
        );
      })}
    </svg>
  );
};
