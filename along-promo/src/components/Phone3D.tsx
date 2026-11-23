// A CSS-3D phone that can be turned freely. Real APK screenshots go on its screen.
//
//   <Stage3D>                       // perspective container, origin = frame centre
//     <Phone3D pose={{ x: 0, y: 0, z: 0, rx: 8, ry: -24, rz: 0 }} height={760}>
//       <Screen src="apk/en-trip.png" />
//     </Phone3D>
//   </Stage3D>
//
// Screen content is laid out in the app's own CSS px (390 × 844) and scaled with CSS `zoom`
// (layout-level, so text is rasterised at its final size — aesthetic-rules Q2). Set the phone's
// size with `height`; do not enlarge it with translateZ/scale toward the camera (that upsamples).
// Ancestors of a Phone3D must not set overflow/filter/opacity<1 (they flatten preserve-3d).
import React from 'react';
import { Img, staticFile } from 'remotion';
import { C } from '../tokens';

export const SCREEN_W = 390;
export const SCREEN_H = 844;
const BEZEL = 14; // in screen px
const RADIUS = 58;
const DEPTH = 34; // body thickness in screen px
const SLICES = 26;

export type Pose = { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number };

export const Stage3D: React.FC<{ perspective?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  perspective = 2200, children, style,
}) => (
  <div style={{ position: 'absolute', inset: 0, perspective, perspectiveOrigin: '50% 50%', ...style }}>
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transformStyle: 'preserve-3d' }}>{children}</div>
  </div>
);

/** A screenshot from public/, filling the 390×844 screen. */
export const Screen: React.FC<{ src: string; opacity?: number; style?: React.CSSProperties }> = ({ src, opacity = 1, style }) => (
  <Img src={staticFile(src)} style={{ position: 'absolute', inset: 0, width: SCREEN_W, height: SCREEN_H, opacity, display: 'block', ...style }} />
);

export const Phone3D: React.FC<{
  pose: Pose;
  height?: number; // on-screen height of the whole phone in px at z=0
  children?: React.ReactNode; // screen content, 390×844 coordinate box
  sheen?: boolean;
  backLabel?: boolean;
}> = ({ pose, height = 760, children, sheen = true, backLabel = true }) => {
  const s = height / (SCREEN_H + BEZEL * 2);
  const bw = (SCREEN_W + BEZEL * 2) * s, bh = (SCREEN_H + BEZEL * 2) * s;
  const r = RADIUS * s, depth = DEPTH * s;
  const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = pose;
  const sheenPos = 50 + (ry % 360) * 0.9 - rx * 0.4;
  const slab = (k: number) => {
    const t = k / (SLICES - 1); // 0 = front, 1 = back
    const mid = 1 - Math.abs(t - 0.5) * 2;
    const light = Math.round(38 + mid * 34);
    return (
      <div key={k} style={{
        position: 'absolute', left: -bw / 2, top: -bh / 2, width: bw, height: bh, borderRadius: r,
        background: `rgb(${light},${light - 4},${light - 9})`,
        transform: `translateZ(${depth / 2 - t * depth}px)`,
      }} />
    );
  };
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, transformStyle: 'preserve-3d',
      transform: `translate3d(${x}px, ${y}px, ${z}px) rotateZ(${rz}deg) rotateY(${ry}deg) rotateX(${rx}deg)` }}>
      {Array.from({ length: SLICES }, (_, k) => slab(k))}
      {/* back plate */}
      <div style={{
        position: 'absolute', left: -bw / 2, top: -bh / 2, width: bw, height: bh, borderRadius: r,
        transform: `translateZ(${-depth / 2 - 0.5}px) rotateY(180deg)`, backfaceVisibility: 'hidden',
        background: `linear-gradient(150deg, #2B2620 0%, ${C.ink} 55%, #0F0D0A 100%)`,
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.08)',
      }}>
        <div style={{ position: 'absolute', left: 26 * s, top: 26 * s, width: 130 * s, height: 130 * s, borderRadius: 34 * s,
          background: 'linear-gradient(145deg,#3A342C,#1A1712)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12), 0 4px 10px rgba(0,0,0,.4)' }}>
          {[[18, 18], [72, 18], [18, 72]].map(([lx, ly], i) => (
            <div key={i} style={{ position: 'absolute', left: lx * s, top: ly * s, width: 40 * s, height: 40 * s, borderRadius: '50%',
              background: 'radial-gradient(circle at 40% 35%, #4A5560 0%, #0B0D10 60%)', boxShadow: '0 0 0 3px #2A2621' }} />
          ))}
        </div>
        {backLabel && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: bh * 0.47, textAlign: 'center', color: 'rgba(247,242,232,.55)',
            fontFamily: "'Source Serif 4', serif", fontSize: 44 * s, letterSpacing: '.04em' }}>Along</div>
        )}
      </div>
      {/* front: bezel + screen */}
      <div style={{
        position: 'absolute', left: -bw / 2, top: -bh / 2, width: bw, height: bh, borderRadius: r,
        transform: `translateZ(${depth / 2 + 0.5}px)`, backfaceVisibility: 'hidden', background: '#0D0C0A',
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.10)',
      }}>
        <div style={{ position: 'absolute', left: BEZEL * s, top: BEZEL * s, width: SCREEN_W * s, height: SCREEN_H * s,
          borderRadius: (RADIUS - BEZEL) * s, overflow: 'hidden', background: C.paper }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: SCREEN_H, zoom: s }}>{children}</div>
          {/* dynamic island */}
          <div style={{ position: 'absolute', left: '50%', top: 11 * s, width: 104 * s, height: 30 * s, marginLeft: -52 * s,
            borderRadius: 999, background: '#0A0908' }} />
          {sheen && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen',
              background: `linear-gradient(115deg, rgba(255,255,255,0) ${sheenPos - 22}%, rgba(255,255,255,.16) ${sheenPos}%, rgba(255,255,255,0) ${sheenPos + 18}%)` }} />
          )}
        </div>
      </div>
    </div>
  );
};

/** A soft contact shadow for a phone (or card) standing on a floor; place it in screen space under the object. */
export const SoftShadow: React.FC<{ x: number; y: number; w: number; h?: number; opacity?: number }> = ({ x, y, w, h = w * 0.16, opacity = 0.32 }) => (
  <div style={{ position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: '50%',
    background: `radial-gradient(closest-side, rgba(40,28,14,${opacity}), rgba(40,28,14,0))` }} />
);
