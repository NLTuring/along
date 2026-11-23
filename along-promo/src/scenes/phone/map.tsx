// A hand-drawn ink map of central Shanghai (an illustration, not any map product): Huangpu River,
// Suzhou Creek, district names, the day-1 stops as pins. Shared by S04 (it rises as the floor) and S05.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Grain } from '../../components/Paper';
import { C, FONT } from '../../tokens';

export const PIN = {
  here: [860, 470], yuyuan: [1010, 545], westbund: [800, 780], jingan: [540, 350], ferry: [1150, 432],
} as const;

export const RIVER = 'M560 1100 C 700 900, 980 770, 1080 560 S 1240 300, 1500 262 S 1800 232, 1980 180';
export const CREEK = 'M1150 342 C 1000 300, 820 332, 640 284 S 300 262, -40 300';
export const WALK = 'M860 470 C 900 470, 930 520, 1010 545';
export const METRO = ['M1010 545 C 960 660, 900 720, 800 780', 'M800 780 C 620 720, 560 520, 540 350'];

const STREETS = [
  'M-20 420 L1940 380', 'M-20 640 L1940 600', 'M-20 200 L1940 170', 'M300 -20 L380 1100', 'M700 -20 L760 1100', 'M1300 -20 L1360 1100', 'M1640 -20 L1700 1100',
  'M200 860 C 600 820, 900 900, 1300 980', 'M420 120 C 700 160, 900 230, 1180 240',
];

export const InkMap: React.FC<{ dim?: number }> = ({ dim = 0 }) => (
  <AbsoluteFill style={{ background: '#F2ECDF' }}>
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="inkedge"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={4} /><feDisplacementMap in="SourceGraphic" scale={6} /></filter>
      </defs>
      <g stroke="rgba(27,24,19,.08)" strokeWidth={10} fill="none" strokeLinecap="round">{STREETS.map((d) => <path key={d} d={d} />)}</g>
      <g stroke="rgba(27,24,19,.05)" strokeWidth={3} fill="none">
        {Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${-20 + i * 90} -20 L${60 + i * 90} 1100`} />)}
      </g>
      <ellipse cx={820} cy={392} rx={70} ry={44} fill="rgba(95,111,90,.22)" />
      <ellipse cx={1480} cy={600} rx={120} ry={70} fill="rgba(95,111,90,.14)" />
      <g filter="url(#inkedge)">
        <path d={RIVER} fill="none" stroke="#C8D2CE" strokeWidth={84} strokeLinecap="round" />
        <path d={RIVER} fill="none" stroke="rgba(63,82,78,.55)" strokeWidth={86} strokeLinecap="round" strokeDasharray="1 0" opacity={0.25} />
        <path d={CREEK} fill="none" stroke="#C8D2CE" strokeWidth={24} strokeLinecap="round" />
      </g>
      <g fontFamily="'Source Serif 4', 'Along Serif'" fontStyle="italic" fill="rgba(63,82,78,.75)">
        <text x={1150} y={640} fontSize={34} transform="rotate(-58 1150 640)">黄浦江 Huangpu River</text>
        <text x={760} y={268} fontSize={30} transform="rotate(4 760 268)">苏州河 Suzhou Creek</text>
      </g>
      <g fontFamily="'Along Serif'" fill="rgba(27,24,19,.42)" fontSize={34} letterSpacing="6">
        <text x={420} y={250}>静安 JING'AN</text>
        <text x={1430} y={470}>浦东 PUDONG</text>
        <text x={420} y={700}>徐汇 XUHUI</text>
        <text x={1060} y={430}>外滩 THE BUND</text>
      </g>
    </svg>
    <Grain opacity={0.5} />
    {dim > 0 && <AbsoluteFill style={{ background: `rgba(27,24,19,${dim})` }} />}
  </AbsoluteFill>
);

/** A pin on the map: red ink disc with a paper ring, popping in. */
export const Pin: React.FC<{ x: number; y: number; k: number; r?: number; label?: string; sub?: string; side?: 'l' | 'r'; lo?: number }> = ({ x, y, k, r = 16, label, sub, side = 'r', lo = 1 }) => {
  if (k <= 0) return null;
  return (
    <>
      <div style={{ position: 'absolute', left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: '50%', background: C.accent,
        boxShadow: `0 0 0 5px ${C.paper}, 0 6px 14px rgba(60,42,20,.3)`, transform: `scale(${k})` }} />
      {label && (
        <div style={{ position: 'absolute', top: y - 30, ...(side === 'r' ? { left: x + r + 14 } : { right: 1920 - x + r + 14 }), opacity: Math.min(1, k) * lo,
          whiteSpace: 'nowrap', textAlign: side === 'r' ? 'left' : 'right' }}>
          <div style={{ fontFamily: FONT.serifZh, fontWeight: 600, fontSize: 36, color: C.ink }}>{label}</div>
          {sub && <div style={{ fontFamily: FONT.sans, fontSize: 30, color: C.mutedStrong }}>{sub}</div>}
        </div>
      )}
    </>
  );
};
