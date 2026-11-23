// T10 · print-texture-transitions · ink-bleed-reveal (demos/transition/print-texture-transitions/InkBleedReveal.tsx),
// re-inked in 印泥红: the stamp's ink soaks out from the seal and eats S09; the new scene develops
// inside it. Layers (outside → in): wet halo · ink edge (light) · ink core (dense) · new scene.
// One feTurbulence(0.02, 3 octaves, seed 7) + feDisplacementMap(60→160) shapes only the mask circles.
// Phases (ABSOLUTE frames):
//   PRE  2350–2366  drawn by S09: the seal's ink spreads into a small blot (no reveal yet)
//   BLEED 2366–2402 drawn by S10: reveal radius 0→R (ease-out quad, ±8% wobble that dies 2392–2402)
//   2406             S10 drops the SVG mask and shows the new scene plain (true stillness)
import React, { useId } from 'react';
import { Easing, interpolate } from 'remotion';
import { C } from '../../tokens';
import { ramp } from '../S08/kit';

// R: farthest frame corner from the stamp point ≈ 1620 px + displacement margin (160/2).
export const INK = { pre: 2350, reveal: 2366, wobbleOff: 2392, full: 2402, unmask: 2406, R: 1760 };
const outQuad = Easing.out(Easing.quad);

/** All radii at absolute frame af (0 when not drawn). */
export function inkGeom(af: number) {
  const blot = 56 * ramp(af, INK.pre, INK.reveal, Easing.out(Easing.cubic)); // the seal soaking outward
  const base = interpolate(af, [INK.reveal, INK.full], [0, INK.R], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: outQuad });
  const env = 1 - ramp(af, INK.wobbleOff, INK.full);
  const r = af < INK.reveal ? 0 : Math.max(0, base * (1 + 0.08 * Math.sin(af * 0.32) * env));
  const lead = 20 + 22 * Math.sin(Math.PI * ramp(af, INK.reveal, INK.wobbleOff));
  const rInk = Math.max(blot, r > 0.5 ? r + lead : 0);
  const rCore = Math.max(blot * 0.9, r > 0.5 ? r + lead * 0.45 : 0);
  const rHalo = rInk > 0.5 ? rInk + 110 * ramp(af, INK.pre, INK.reveal + 8) : 0;
  const disp = interpolate(af, [INK.pre, INK.full], [60, 160], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const develop = interpolate(af, [INK.reveal, INK.full - 2], [1.035, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return { r, rInk, rCore, rHalo, disp, develop };
}

export const InkBleed: React.FC<{ af: number; ox: number; oy: number; children?: React.ReactNode }> = ({ af, ox, oy, children }) => {
  const uid = 'ink' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = inkGeom(af);
  if (g.rInk <= 0.5) return null;
  const circle = (r: number, filter: string) => <circle cx={ox} cy={oy} r={r} fill="white" filter={`url(#${uid}${filter})`} />;
  const fx = { x: '-40%', y: '-40%', width: '180%', height: '180%' };
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, display: 'block' }}>
      <defs>
        <filter id={`${uid}b`} {...fx}>
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={3} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={g.disp} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={`${uid}f`} {...fx}>
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={3} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={g.disp * 1.08} xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="3.2" />
        </filter>
        <filter id={`${uid}c`} {...fx}>
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={3} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={g.disp * 1.03} xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="1" />
        </filter>
        <filter id={`${uid}h`} {...fx}>
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={g.disp * 1.3} xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="34" />
        </filter>
        {[['H', g.rHalo, 'h'], ['I', g.rInk, 'f'], ['C', g.rCore, 'c'], ['N', g.r, 'b']].map(([k, r, f]) => (
          <mask key={k as string} id={`${uid}m${k}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <rect x="0" y="0" width="1920" height="1080" fill="black" />
            {(r as number) > 0.5 && circle(r as number, f as string)}
          </mask>
        ))}
      </defs>
      <rect x="0" y="0" width="1920" height="1080" fill="#6A2A18" opacity={0.12} mask={`url(#${uid}mH)`} />
      <rect x="0" y="0" width="1920" height="1080" fill={C.accent} opacity={0.5} mask={`url(#${uid}mI)`} />
      <rect x="0" y="0" width="1920" height="1080" fill={C.accentDeep} opacity={0.9} mask={`url(#${uid}mC)`} />
      {children && g.r > 0.5 && (
        <g mask={`url(#${uid}mN)`}>
          <foreignObject x="0" y="0" width="1920" height="1080">
            <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden', transform: `scale(${g.develop})`, transformOrigin: `${ox}px ${oy}px` }}>
              {children}
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
};
