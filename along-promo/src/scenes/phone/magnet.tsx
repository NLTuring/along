// The Bund photo as one object across S06→S07: a polaroid print (S06) that explodes into layers
// (space-camera-moves · exploded-view: frame / photo / base plate along Z) and closes up into a relief
// fridge magnet with thickness and a magnet recess (S07). Pose is a function of the ABSOLUTE frame.
import React from 'react';
import { Easing, Img, interpolate, staticFile } from 'remotion';
import { C, FONT } from '../../tokens';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const PHOTO = { w: 600, h: 368 }; // the print's photo area (Bund photo 1262×774)
const SLICES = 18;

export type MagnetState = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number; explode: number; frame: number; depth: number; radius: number; anime: number };

/** The object's state at absolute frame F (S06 freeze 1474 → T7 1615–1660 → S07 orbit). */
export function magnetAt(F: number): MagnetState {
  const freeze = interpolate(F, [1474, 1490], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const ex = interpolate(F, [1615, 1636, 1648, 1662], [0, 1, 1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const turn = interpolate(F, [1612, 1640], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const solid = interpolate(F, [1646, 1664], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.4, 0.64, 1) });
  const orbit = interpolate(F, [1664, 1880], [0, 1], clamp);
  const move = interpolate(F, [1640, 1668], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return {
    x: mix(150, 190, move),
    y: mix(-60, 40, move),
    z: 0,
    rx: mix(0, 14, turn) + mix(0, -2, move) + 4 * Math.sin(orbit * Math.PI * 2),
    ry: mix(mix(0, -4, freeze), -34, turn) * (1 - move) + move * interpolate(F, [1640, 1668, 1700, 1736, 1770, 1790, 1812, 1834, 1860, 1880], [-34, -26, 30, 4, -8, 0, 180, 186, 360, 360], { ...clamp, easing: Easing.inOut(Easing.cubic) }),
    rz: mix(0, -3, freeze) * (1 - move),
    s: 1,
    explode: ex,
    frame: interpolate(F, [1486, 1492, 1638, 1652], [0, 1, 1, 0], clamp),
    depth: mix(0, 34, solid),
    radius: mix(6, 44, solid),
    anime: 0,
  };
}

/** Render inside <Stage3D>. `anime` 0..1 = ripple radius reveal of the anime texture (from the face centre). */
export const Magnet: React.FC<{ m: MagnetState; anime?: number; labels?: number }> = ({ m, anime = 0, labels = 0 }) => {
  const { w, h } = PHOTO;
  const d = m.depth, r = m.radius;
  const gap = 90 * m.explode;
  const face = (src: string, extra?: React.CSSProperties) => (
    <Img src={staticFile(src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 40%', ...extra }} />
  );
  const rr = Math.hypot(w, h) * 0.55 * anime;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, transformStyle: 'preserve-3d',
      transform: `translate3d(${m.x}px, ${m.y}px, ${m.z}px) rotateZ(${m.rz}deg) rotateY(${m.ry}deg) rotateX(${m.rx}deg) scale(${m.s})` }}>
      {/* base plate (resin body) with the magnet recess on the back */}
      {Array.from({ length: SLICES }, (_, k) => {
        const t = k / (SLICES - 1);
        const shade = Math.round(222 + 14 * (1 - Math.abs(t - 0.5) * 2));
        return <div key={k} style={{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h, borderRadius: r,
          background: `rgb(${shade},${shade - 6},${shade - 16})`, transform: `translateZ(${d / 2 - t * d - gap}px)`, opacity: d > 1 || k === SLICES - 1 ? 1 : 0 }} />;
      })}
      <div style={{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h, borderRadius: r, backfaceVisibility: 'hidden',
        transform: `translateZ(${-d / 2 - gap - 0.5}px) rotateY(180deg)`, background: '#E4DCCB', boxShadow: 'inset 0 0 0 2px rgba(27,24,19,.06)' }}>
        <div style={{ position: 'absolute', left: w / 2 - 70, top: h / 2 - 70, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, #9A9A9A, #4A4A4A)', boxShadow: 'inset 0 6px 14px rgba(0,0,0,.45)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 30, textAlign: 'center', fontFamily: FONT.serif, fontSize: 34, color: 'rgba(27,24,19,.55)' }}>Along · 18 mm 磁铁槽 magnet recess</div>
      </div>
      {/* the photo face (relief) */}
      <div style={{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h, borderRadius: r, overflow: 'hidden', backfaceVisibility: 'hidden',
        transform: `translateZ(${d / 2 + 0.6 + gap * 0.2}px)`, boxShadow: d > 1 ? 'inset 0 0 0 2px rgba(255,255,255,.35)' : undefined }}>
        {face('img/bund-friends.png')}
        {anime > 0 && <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${rr}px at 50% 50%)` }}>{face('img/anime/along-shanghai-friends.webp')}</div>}
        {anime > 0 && anime < 1 && <div style={{ position: 'absolute', left: w / 2 - rr, top: h / 2 - rr, width: 2 * rr, height: 2 * rr, borderRadius: '50%', boxShadow: '0 0 0 4px rgba(255,255,255,.85), 0 0 24px 6px rgba(255,255,255,.5)' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 40%)', opacity: d > 1 ? 1 : 0 }} />
      </div>
      {/* the polaroid paper frame */}
      {m.frame > 0 && (
        <div style={{ position: 'absolute', left: -w / 2 - 30, top: -h / 2 - 30, width: w, height: h, borderStyle: 'solid', borderColor: '#FFFDF8', borderWidth: '30px 30px 120px 30px',
          borderRadius: 6, opacity: m.frame, transform: `translateZ(${d / 2 + 0.3 + gap * 1.3}px)`, boxShadow: '0 20px 50px rgba(60,42,20,.22)' }}>
          <div style={{ position: 'absolute', left: 4, top: h + 36, fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 34, color: C.ink, whiteSpace: 'nowrap' }}>First morning on the Bund</div>
        </div>
      )}
      {labels > 0 && (
        <div style={{ position: 'absolute', left: -w / 2, top: -h / 2 - 130, opacity: labels, transform: `translateZ(${gap * 1.3}px)`, whiteSpace: 'nowrap' }}>
          <div style={{ fontFamily: FONT.serifZh, fontSize: 36, color: C.ink }}>照片 · 边框 · 底座</div>
          <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, color: C.mutedStrong }}>photo, frame and base, pulled apart</div>
        </div>
      )}
    </div>
  );
};
