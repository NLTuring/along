// The Along mark written like a brush, in stroke order — a frame-driven port of the website's
// logo.js (a wide pen follows each glyph's centreline; the glyph outline clips it; dry-brush
// edge from feTurbulence; the solid mark settles over the strokes at the end).
//   <LogoInk progress={0..1} settle={0..1} width={900} color={C.ink} />
import React, { useId } from 'react';
import { Easing } from 'remotion';
import LOGO from '../../public/data/logo.json';

const PEN: Record<string, number> = { hat: 172, l: 112, o: 106, n: 142, g: 116 };
type Stroke = { glyph: string; start: number; end: number; points: [number, number][] };
const ease = Easing.bezier(0.42, 0, 0.32, 1);

function smoothPath(points: [number, number][]) {
  if (points.length < 3) return `M${points.map((p) => p.join(' ')).join('L')}`;
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], [nx, ny] = points[i + 1];
    d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const last = points[points.length - 1];
  return `${d}L${last[0]} ${last[1]}`;
}

export const LOGO_VIEWBOX = LOGO.viewBox as number[]; // [84, 74, 2104, 853]
export const LOGO_ASPECT = LOGO_VIEWBOX[3] / LOGO_VIEWBOX[2];

export const LogoInk: React.FC<{
  progress: number; // 0..1 brush time across all strokes
  settle?: number; // 0..1 solid mark fade-in over the brush
  width: number;
  color?: string;
  rough?: boolean;
  style?: React.CSSProperties;
}> = ({ progress, settle = 0, width, color = '#1B1813', rough = true, style }) => {
  const id = 'lg' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const glyphs = LOGO.glyphs as { name: string; d: string }[];
  const strokes = LOGO.strokes as unknown as Stroke[];
  return (
    <svg viewBox={LOGO_VIEWBOX.join(' ')} width={width} height={width * LOGO_ASPECT} style={{ display: 'block', overflow: 'visible', color, ...style }}>
      <defs>
        {rough && (
          <filter id={`${id}-dry`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={46} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        )}
        {glyphs.map((g) => (
          <clipPath key={g.name} id={`${id}-${g.name}`}>
            <path d={g.d} clipRule="evenodd" />
          </clipPath>
        ))}
      </defs>
      {settle < 1 &&
        glyphs.map((g) => (
          <g key={g.name} clipPath={`url(#${id}-${g.name})`}>
            <g filter={rough ? `url(#${id}-dry)` : undefined}>
              {strokes.filter((s) => s.glyph === g.name).map((s, i) => {
                const span = Math.max(0.02, s.end - s.start);
                const k = Math.min(1, Math.max(0, (progress - s.start) / span));
                if (k <= 0) return null;
                return (
                  <path key={i} d={smoothPath(s.points)} fill="none" stroke="currentColor" strokeWidth={PEN[g.name]}
                    strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - ease(k)} />
                );
              })}
            </g>
          </g>
        ))}
      {settle > 0 && (
        <g opacity={settle}>
          {glyphs.map((g) => <path key={g.name} d={g.d} fillRule="evenodd" fill="currentColor" />)}
        </g>
      )}
    </svg>
  );
};
