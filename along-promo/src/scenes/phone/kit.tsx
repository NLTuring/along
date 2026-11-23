// Shared pieces for the App section (S03–S07): screen helpers, chips, notes, voice pill, lens close-up.
import React from 'react';
import { Easing, Img, interpolate, staticFile } from 'remotion';
import M from '../../../public/apk/manifest.json';
import { SCREEN_H, SCREEN_W } from '../../components/Phone3D';
import { C, FONT } from '../../tokens';

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ramp = (f: number, a: number, b: number, e = OUT) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });

type Rect = { x: number; y: number; w: number; h: number };
const SCREENS = (M as unknown as { screens: Record<string, { file: string; h: number; rects: Record<string, Rect> }> }).screens;
export const rect = (screen: string, name: string, fallback: Rect): Rect => SCREENS[screen]?.rects?.[name] ?? fallback;
export const screenH = (screen: string) => SCREENS[screen]?.h ?? SCREEN_H;

/** A screenshot (any height) laid in the 390-wide screen box, scrolled by `scroll` CSS px. */
export const Shot: React.FC<{ name: string; scroll?: number; opacity?: number; style?: React.CSSProperties }> = ({ name, scroll = 0, opacity = 1, style }) => (
  <Img src={staticFile(`apk/${name}.png`)} style={{ position: 'absolute', left: 0, top: -scroll, width: SCREEN_W, height: screenH(name), opacity, display: 'block', ...style }} />
);

/** Reeded-glass wipe (the app's glass.css idea): vertical ribs sweep left→right; behind them `to` replaces `from`. */
export const ReededSwap: React.FC<{ from: React.ReactNode; to: React.ReactNode; t: number }> = ({ from, to, t }) => {
  const edge = lerp(-60, SCREEN_W + 60, t);
  return (
    <>
      <div style={{ position: 'absolute', inset: 0 }}>{from}</div>
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${Math.max(0, SCREEN_W - edge)}px 0 0)` }}>{to}</div>
      {t > 0 && t < 1 && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: edge - 70, width: 120, backdropFilter: 'blur(5px) saturate(1.2)',
          background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.34) 0 3px, rgba(255,255,255,.02) 3px 9px, rgba(27,24,19,.06) 9px 12px)',
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,.8), inset -1px 0 0 rgba(255,255,255,.4)' }} />
      )}
    </>
  );
};

/** White pill with a red icon disc (radial-ripple-phone-chips chip), pops with one spring overshoot. */
export const ICON = {
  go: <svg width={30} height={30} viewBox="0 0 24 24"><path d="M4 11.5 20 4l-7.5 16-2.2-6.3z" fill="#fff" /></svg>,
  translate: <span style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 24, color: '#fff' }}>文A</span>,
  trip: <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round"><circle cx={6} cy={18} r={2.2} /><circle cx={18} cy={6} r={2.2} /><path d="M8.2 18H13a3.5 3.5 0 0 0 0-7h-2a3.5 3.5 0 0 1 0-7h4.8" /></svg>,
  check: <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>,
  cube: <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z M4 7.5 12 12l8-4.5 M12 12v9" /></svg>,
  camera: <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2}><rect x={3} y={7} width={18} height={13} rx={3} /><circle cx={12} cy={13.5} r={3.6} /><path d="M8.5 7 10 4h4l1.5 3" /></svg>,
};

export const Chip: React.FC<{ f: number; at: number; icon: React.ReactNode; zh: string; en?: string; x: number; y: number; out?: number; float?: number }> = ({
  f, at, icon, zh, en, x, y, out = 1, float = 0,
}) => {
  const k = ramp(f, at, at + 14, SPRING);
  const o = ramp(f, at, at + 6, Easing.linear) * out;
  if (o <= 0) return null;
  const bob = Math.sin((f - at) / 14 + float) * 6 * ramp(f, at + 14, at + 30);
  return (
    <div style={{ position: 'absolute', left: x, top: y + bob, opacity: o, transform: `scale(${0.8 + 0.2 * k})`, transformOrigin: '0 50%',
      display: 'flex', alignItems: 'center', gap: 16, padding: '12px 26px 12px 12px', borderRadius: 999, background: C.surface,
      boxShadow: '0 0 0 1px rgba(27,24,19,.06), 0 14px 30px rgba(60,42,20,.16)', whiteSpace: 'nowrap' }}>
      <div style={{ width: 62, height: 62, borderRadius: '50%', background: C.accent, color: '#FFF', display: 'grid', placeItems: 'center', fontSize: 30 }}>{icon}</div>
      <div>
        <div style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 38, color: C.ink, lineHeight: 1.1 }}>{zh}</div>
        {en && <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, color: C.mutedStrong, lineHeight: 1.1 }}>{en}</div>}
      </div>
    </div>
  );
};

/** A note label with a highlighter bar (aesthetic-rules C3), for callouts next to the phone. */
export const Note: React.FC<{ f: number; at: number; x: number; y: number; zh: string; en?: string; size?: number; out?: number; color?: string }> = ({
  f, at, x, y, zh, en, size = 40, out = 1, color = C.ink,
}) => {
  const k = ramp(f, at, at + 12);
  const bar = ramp(f, at + 6, at + 16);
  const o = k * out;
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: o, transform: `translateY(${(1 - k) * 14}px)`, whiteSpace: 'nowrap' }}>
      <div style={{ position: 'relative', display: 'inline-block', fontFamily: FONT.serifZh, fontWeight: 600, fontSize: size, color, lineHeight: 1.15 }}>
        <span style={{ position: 'absolute', left: -6, right: -6, bottom: 2, height: size * 0.36, background: 'rgba(217,164,65,.42)', transformOrigin: '0 50%', transform: `scaleX(${bar})`, borderRadius: 4 }} />
        <span style={{ position: 'relative' }}>{zh}</span>
      </div>
      {en && <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: Math.max(30, size * 0.72), color: C.mutedStrong, marginTop: 2 }}>{en}</div>}
    </div>
  );
};

/** Hold-to-speak capsule with a live waveform (voice-waveform-live: 64 bars, sin^0.8 centre weight, silence = dots). */
export const VoicePill: React.FC<{ f: number; at: number; talk: (f: number) => number; text: string; x: number; y: number; w?: number; out?: number }> = ({
  f, at, talk, text, x, y, w = 620, out = 1,
}) => {
  const k = ramp(f, at, at + 12);
  const o = k * out;
  if (o <= 0) return null;
  const bars = Array.from({ length: 48 }, (_, i) => {
    const centre = Math.pow(Math.sin(((i + 0.5) / 48) * Math.PI), 0.8);
    const s = Math.abs(Math.sin(f * 0.9 + i * 1.7) * 0.6 + Math.sin(f * 0.37 + i * 0.6) * 0.4);
    return Math.max(6, 6 + talk(f - (47 - i) * 0.6) * centre * s * 58);
  });
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, opacity: o, transform: `scale(${1.04 - 0.04 * k})`, transformOrigin: '50% 50%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 22px', borderRadius: 999, background: C.surface,
        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,.9), 0 0 0 1px rgba(27,24,19,.06), 0 16px 34px rgba(60,42,20,.16)' }}>
        <div style={{ width: 58, height: 58, borderRadius: '50%', background: C.accent, display: 'grid', placeItems: 'center',
          boxShadow: `0 0 0 ${6 + talk(f) * 10}px rgba(178,74,44,${0.18 * talk(f)})` }}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round"><rect x={9} y={3} width={6} height={12} rx={3} /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 70, flex: 1 }}>
          {bars.map((h, i) => <div key={i} style={{ width: 4, height: h, borderRadius: 2, background: `rgba(178,74,44,${0.35 + 0.65 * (i / 47)})` }} />)}
        </div>
      </div>
      <div style={{ marginTop: 14, textAlign: 'center', fontFamily: FONT.sans, fontSize: 34, color: C.ink }}>{text}</div>
    </div>
  );
};

/** The app's bottom-bar capture button, close up (S05 end frame = S06 first frame). Centre (cx, cy), diameter d. */
export const LensCloseup: React.FC<{ cx?: number; cy?: number; d?: number; ring: number }> = ({ cx = 960, cy = 540, d = 180, ring }) => {
  const r = d / 2, R = r + 18;
  return (
    <div style={{ position: 'absolute', left: cx - R - 40, top: cy - R - 40, width: 2 * R + 80, height: 2 * R + 80 }}>
      <svg width={2 * R + 80} height={2 * R + 80} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="lensglass" cx="40%" cy="32%" r="75%"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".6" stopColor="#E9EEF0" /><stop offset="1" stopColor="#C9D2D6" /></radialGradient>
        </defs>
        <g transform={`translate(${R + 40} ${R + 40})`}>
          <circle r={R} fill="#FFFDF8" stroke="rgba(27,24,19,.08)" strokeWidth={2} />
          <circle r={r * 0.78} fill="url(#lensglass)" stroke={C.ink} strokeWidth={r * 0.05} />
          <ellipse cx={-r * 0.22} cy={-r * 0.3} rx={r * 0.3} ry={r * 0.16} fill="#fff" opacity={0.8} transform="rotate(-24)" />
          <circle r={r + 6} fill="none" stroke="rgba(178,74,44,.18)" strokeWidth={8} />
          <circle r={r + 6} fill="none" stroke={C.accent} strokeWidth={8} strokeLinecap="round" pathLength={1}
            strokeDasharray={`${ring} 1`} transform="rotate(-90)" />
        </g>
      </svg>
    </div>
  );
};
