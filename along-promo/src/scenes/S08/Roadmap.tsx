// S08 bottom row: three-step roadmap. Every step is a plan (「规划 Plan」), nothing is signed.
import React from 'react';
import { C, EASE, FONT } from '../../tokens';
import { lerp, ramp, monotone } from './kit';
import { B, ROAD, STEPS } from './layout';

export const PlanPill: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, padding: '4px 16px 6px', borderRadius: 999, whiteSpace: 'nowrap',
    background: C.accentSoft, color: C.accent, boxShadow: 'inset 0 0 0 1.5px rgba(178,74,44,.35)', ...style }}>
    <span style={{ fontFamily: FONT.sans, fontWeight: 500, fontSize: 32, lineHeight: 1.2 }}>规划</span>
    <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 32, lineHeight: 1.2 }}>Plan</span>
  </div>
);

export const Roadmap: React.FC<{ af: number }> = ({ af }) => {
  const r0 = B.roadmap;
  const pops = [r0 + 4, r0 + 13, r0 + 20]; // gaps shrink: 9f → 7f
  // one continuous curve through the step pops (no constant-speed segments, R2)
  const head = monotone([r0, pops[0], pops[1], pops[2], r0 + 30], [376, ROAD.xs[0], ROAD.xs[1], ROAD.xs[2], ROAD.arrowTo])(af);
  const labelK = ramp(af, r0 - 4, r0 + 6, EASE.out);
  if (labelK <= 0) return null;
  const arrowK = ramp(af, r0 + 28, r0 + 34, EASE.out);
  return (
    <>
      <div style={{ position: 'absolute', left: ROAD.labelX, top: ROAD.y - 22, display: 'flex', alignItems: 'baseline', gap: 10,
        opacity: labelK, whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: FONT.serifZh, fontWeight: 600, fontSize: 36, color: C.ink }}>路线图</span>
        <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 32, color: C.mutedStrong }}>Roadmap</span>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line x1={376} y1={ROAD.y} x2={head} y2={ROAD.y} stroke={C.mutedStrong} strokeWidth={3} strokeDasharray="14 12" strokeLinecap="round" opacity={0.7} />
        {arrowK > 0 && (
          <path d={`M ${ROAD.arrowTo - 16} ${ROAD.y - 13} L ${ROAD.arrowTo + 2} ${ROAD.y} L ${ROAD.arrowTo - 16} ${ROAD.y + 13}`}
            fill="none" stroke={C.mutedStrong} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.75 * arrowK} />
        )}
      </svg>
      {STEPS.map((s, i) => {
        const x = ROAD.xs[i];
        const k = ramp(af, pops[i], pops[i] + 11, EASE.land);
        if (af < pops[i]) return null;
        const tk = ramp(af, pops[i] + 3, pops[i] + 14, EASE.out);
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: x - 26, top: ROAD.y - 26, width: 52, height: 52, borderRadius: '50%', boxSizing: 'border-box',
              background: C.surface, boxShadow: `inset 0 0 0 2.5px ${C.ink}, 0 4px 10px rgba(60,42,20,.16)`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: `scale(${lerp(0.3, 1, k)})` }}>
              <span style={{ fontFamily: FONT.serif, fontWeight: 600, fontSize: 32, color: C.ink, lineHeight: 1 }}>{i + 1}</span>
            </div>
            <PlanPill style={{ position: 'absolute', left: x + 42, top: ROAD.y - 25, opacity: tk, transform: `translateX(${(1 - tk) * -10}px)` }} />
            <div style={{ position: 'absolute', left: x - 26, top: ROAD.y + 42, opacity: tk, transform: `translateY(${(1 - tk) * 10}px)`, whiteSpace: 'nowrap' }}>
              <div style={{ fontFamily: FONT.serifZh, fontWeight: 600, fontSize: 38, lineHeight: 1.2, color: C.ink }}>{s.zh}</div>
              <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 32, lineHeight: 1.25, color: C.mutedStrong, marginTop: 2 }}>{s.en}</div>
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};
