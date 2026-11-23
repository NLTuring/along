// S02 parts: the passport page (guilloche, header, six pain-point cells with ink seals), the entry stamp,
// and the tear line. Seal slam follows slam-entrance-moves · impact-burst-kit: hover → 3f ease-in drop
// (bezier .55,.055,.675,.19) → squash at the landing frame → damped return; one ink ring per seal.
import React from 'react';
import { Easing, interpolate } from 'remotion';
import { C, FONT } from '../../tokens';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const EASE_IN = Easing.bezier(0.55, 0.055, 0.675, 0.19);
export const PAGE = { x: 160, y: 140, w: 1600, h: 710 };
export const ENTRY = { x: 1596, y: 232, r: 64 }; // world coordinates

export const PAINS = [
  { zh: '支付', en: 'Payment', d: '习惯银行卡和现金，\n移动支付不习惯', src: '国办发〔2024〕10号' },
  { zh: '语言', en: 'Language', d: '菜单、路牌、打车，\n说不清也看不懂', src: '' },
  { zh: '导航', en: 'Getting around', d: '看不懂中文地图，\n换乘找不到路', src: '' },
  { zh: '订票', en: 'Booking', d: '订票、买门票\n都不容易', src: '文化和旅游部 · 2026 两会' },
  { zh: '求助', en: 'Help', d: '遇到紧急情况，\n不知道该找谁', src: '' },
  { zh: '朋友', en: 'Local friend', d: '身边没有一位\n本地朋友带路', src: '' },
];
export const CELL = (i: number) => ({ x: PAGE.x + 60 + (i % 3) * 510, y: PAGE.y + 190 + Math.floor(i / 3) * 255 });
const TILT = [-6, 4, -3, 5, -5, 3];

export const Defs: React.FC = () => (
  <svg width={0} height={0} style={{ position: 'absolute' }}>
    <defs>
      <filter id="s02ink" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={11} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={5} xChannelSelector="R" yChannelSelector="G" result="d" />
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={2} seed={3} result="m" />
        <feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.1" result="speck" />
        <feComposite in="d" in2="speck" operator="in" />
      </filter>
    </defs>
  </svg>
);

/** One ink seal (阴文 chop) that slams onto the page at `land`. */
export const Seal: React.FC<{ f: number; land: number; i: number }> = ({ f, land, i }) => {
  if (f < land - 9) return null;
  const appear = interpolate(f, [land - 9, land - 5], [0, 1], clamp);
  const drop = interpolate(f, [land - 3, land], [0, 1], { ...clamp, easing: EASE_IN });
  const t = Math.max(0, f - land);
  const sq = f >= land ? Math.exp(-t / 2.5) * Math.cos(t * 1.1) : 0;
  const s = f < land ? 1.6 - 0.6 * drop : 1;
  const lift = f < land ? -46 * (1 - drop) : 0;
  const ring = interpolate(t, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const c = CELL(i);
  return (
    <div style={{ position: 'absolute', left: c.x, top: c.y + 20, width: 150, height: 150 }}>
      {f >= land && ring < 1 && (
        <div style={{ position: 'absolute', left: 75 - (80 + 90 * ring), top: 75 - (80 + 90 * ring), width: 2 * (80 + 90 * ring), height: 2 * (80 + 90 * ring),
          borderRadius: '50%', border: `${3 * (1 - ring) + 1}px solid ${C.accent}`, opacity: 0.45 * (1 - ring) }} />
      )}
      <div style={{ position: 'absolute', inset: 0, opacity: appear, mixBlendMode: f >= land ? 'multiply' : 'normal',
        transform: `translateY(${lift}px) rotate(${TILT[i]}deg) scale(${s * (1 + 0.07 * sq)}, ${s * (1 - 0.09 * sq)})`,
        filter: f < land ? `drop-shadow(0 ${24 * (1 - drop)}px ${18 * (1 - drop)}px rgba(40,20,10,.35))` : undefined }}>
        <svg width={150} height={150}>
          <g filter="url(#s02ink)">
            <rect x={4} y={4} width={142} height={142} rx={16} fill={C.accent} />
            <rect x={14} y={14} width={122} height={122} rx={9} fill="none" stroke={C.paper} strokeWidth={3} opacity={0.8} />
            <text x={75} y={80} textAnchor="middle" dominantBaseline="middle" fontFamily="'Along Serif'" fontWeight={700} fontSize={54} fill={C.paper}>{PAINS[i].zh}</text>
          </g>
        </svg>
      </div>
    </div>
  );
};

/** The cell's words, sliding in right after its seal lands. */
export const CellText: React.FC<{ f: number; land: number; i: number }> = ({ f, land, i }) => {
  const c = CELL(i), p = PAINS[i];
  const k = (d: number) => interpolate(f, [land + 3 + d, land + 12 + d], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const st = (d: number) => ({ opacity: k(d), transform: `translateX(${(1 - k(d)) * 14}px)`, filter: `blur(${(1 - k(d)) * 5}px)` });
  return (
    <div style={{ position: 'absolute', left: c.x + 172, top: c.y + 16, width: 320 }}>
      <div style={{ ...st(0), fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 38, color: C.ink }}>{p.en}</div>
      <div style={{ ...st(2), fontFamily: FONT.sans, fontSize: 32, lineHeight: 1.32, color: C.body, marginTop: 6, whiteSpace: 'pre-line' }}>{p.d}</div>
      {p.src && <div style={{ ...st(4), fontFamily: FONT.sans, fontSize: 32, color: C.accentDeep, marginTop: 8 }}>{p.src}</div>}
    </div>
  );
};

/** The entry stamp impression (the S01 node lands here). */
export const EntryStamp: React.FC = () => (
  <svg width={ENTRY.r * 2 + 20} height={ENTRY.r * 2 + 20} style={{ position: 'absolute', left: ENTRY.x - ENTRY.r - 10, top: ENTRY.y - ENTRY.r - 10, transform: 'rotate(-8deg)', mixBlendMode: 'multiply' }}>
    <g filter="url(#s02ink)" fill="none" stroke={C.accent} transform={`translate(${ENTRY.r + 10} ${ENTRY.r + 10})`}>
      <circle r={ENTRY.r - 2} strokeWidth={5} />
      <circle r={ENTRY.r - 11} strokeWidth={1.6} />
      <text y={-12} textAnchor="middle" fontFamily="'Along Serif'" fontWeight={700} fontSize={30} fill={C.accent} stroke="none">入境</text>
      <text y={13} textAnchor="middle" fontFamily="'Source Serif 4'" fontSize={13.5} letterSpacing={1} fill={C.accent} stroke="none">ENTRY · SHANGHAI</text>
      <text y={33} textAnchor="middle" fontFamily="'Source Serif 4'" fontSize={13} fill={C.accent} stroke="none">2026 · 11 · 21</text>
    </g>
  </svg>
);

/** Fine security lines across the page. */
export const Guilloche: React.FC = () => {
  const paths = Array.from({ length: 9 }, (_, k) => {
    let d = '';
    for (let x = 0; x <= PAGE.w; x += 16) {
      const y = 120 + k * 64 + 18 * Math.sin(x / 70 + k * 0.7) + 8 * Math.sin(x / 23 + k);
      d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
    }
    return d;
  });
  return (
    <svg width={PAGE.w} height={PAGE.h} style={{ position: 'absolute', left: 0, top: 0 }}>
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={C.sage} strokeWidth={1} opacity={0.12} />)}
    </svg>
  );
};

/** Jagged tear line along world x=960 (shared by both halves so they fit exactly). */
export const TEAR = (() => {
  const pts: [number, number][] = [];
  let s = 7;
  for (let y = -200; y <= 1280; y += 18) { s = (s * 9301 + 49297) % 233280; pts.push([960 + ((s / 233280) - 0.5) * 16, y]); }
  return pts;
})();
export const clipFor = (side: 'L' | 'R') =>
  `polygon(${side === 'L' ? '-2000px -2000px' : '4000px -2000px'}, ${TEAR.map(([x, y]) => `${x}px ${y}px`).join(', ')}, ${side === 'L' ? '-2000px 4000px' : '4000px 4000px'})`;
