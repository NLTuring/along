// S01 parts: dark-glass data cards, an odometer that runs on the shot's own frame, leader lines.
import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONT } from '../../tokens';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const DIGITS = '0123456789';
const rollEase = Easing.bezier(0.25, 0.8, 0.25, 1); // DigitRoll (assets/lib) timing: 22f per column, 4f stagger

/** Odometer roll (DigitRoll timing) driven by an explicit frame. */
export const Roll: React.FC<{ value: string; f: number; start: number; size: number; color: string; weight?: number }> = ({
  value, f, start, size, color, weight = 500,
}) => {
  const lineH = size * 1.12;
  let col = 0;
  return (
    <span style={{ display: 'inline-flex', overflow: 'hidden', height: lineH, verticalAlign: 'bottom', fontFamily: FONT.serif, fontWeight: weight }}>
      {value.split('').map((ch, i) => {
        const target = DIGITS.indexOf(ch);
        if (target < 0) return <span key={i} style={{ fontSize: size, lineHeight: `${lineH}px`, color }}>{ch}</span>;
        const t = interpolate(f, [start + col * 4, start + col * 4 + 22], [0, 1], { ...clamp, easing: rollEase });
        col++;
        return (
          <span key={i} style={{ display: 'inline-block', height: lineH }}>
            <span style={{ display: 'block', transform: `translateY(${-(10 + target) * t * lineH}px)` }}>
              {(DIGITS + DIGITS).split('').map((d, j) => (
                <span key={j} style={{ display: 'block', fontSize: size, lineHeight: `${lineH}px`, color, fontVariantNumeric: 'tabular-nums' }}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};

/** A dark-glass card that lands with a small overshoot. `at` = landing start (shot frame). */
export const Card: React.FC<{
  f: number; at: number; x: number; y: number; w: number; out?: number; children: React.ReactNode;
}> = ({ f, at, x, y, w, out = 1, children }) => {
  const k = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  const o = interpolate(f, [at, at + 8], [0, 1], clamp) * out;
  if (o <= 0) return null;
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w, padding: '18px 26px 20px', borderRadius: 20,
      background: 'rgba(14,18,26,.74)', boxShadow: '0 0 0 1px rgba(255,255,255,.12), 0 18px 40px rgba(0,0,0,.35)',
      backdropFilter: 'blur(10px)', color: '#F3EDE2', opacity: o,
      transform: `translateY(${(1 - k) * 22}px) scale(${0.94 + 0.06 * k})`, transformOrigin: '50% 100%',
    }}>
      {children}
    </div>
  );
};

export const Label: React.FC<{ zh: string; en?: string; size?: number }> = ({ zh, en, size = 32 }) => (
  <div style={{ lineHeight: 1.25 }}>
    <span style={{ fontFamily: FONT.sans, fontWeight: 500, fontSize: size, color: 'rgba(243,237,226,.92)' }}>{zh}</span>
    {en && <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: size, color: 'rgba(243,237,226,.8)', marginTop: 2 }}>{en}</div>}
  </div>
);

export const Big: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({ children, color = '#F1D29A', size = 72 }) => (
  <div style={{ fontFamily: FONT.serif, fontSize: size, lineHeight: 1.05, color, marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 10 }}>{children}</div>
);

/** Leader line from a card corner to a map anchor; draws on in 10f. */
export const Leader: React.FC<{ f: number; at: number; x1: number; y1: number; x2: number; y2: number; out?: number }> = ({
  f, at, x1, y1, x2, y2, out = 1,
}) => {
  const t = interpolate(f, [at + 4, at + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  if (t <= 0 || out <= 0) return null;
  const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
  return (
    <g opacity={0.75 * out}>
      <line x1={x1} y1={y1} x2={x} y2={y} stroke="#F1D29A" strokeWidth={1.6} strokeDasharray="5 5" />
      {t > 0.96 && <circle cx={x2} cy={y2} r={4} fill="#F1D29A" />}
    </g>
  );
};
