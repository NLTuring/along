// S08 network: source cards (left) → Along hub → services (right). Curves draw on in turn
// (bezier-source-converge-merge), then comet pulses flow inside the light tubes toward the hub
// and on to the services (integration-hub-map's "输送" pulse). All frames ABSOLUTE.
import React from 'react';
import { C, EASE, FONT, GLASS } from '../../tokens';
import { clamp01, lerp, ramp, E } from './kit';
import { B, CURVES_L, CURVES_R, SOURCES, SERVICES, LEFT_X, LEFT_W, CARD_H, RIGHT_X, RIGHT_W, CHIP_H, HUB, Dst } from './layout';

const PULSE_COLORS = [C.accent, C.sage, C.gold];
const TRAVEL_L = 26, TRAVEL_R = 30;
const launches = (base: number) => {
  const out = [0, 7, 13, 18].map((o) => base + o); // the first few pour in close together
  for (let n = 1; n < 10; n++) out.push(base + 18 + 18 * n);
  return out;
};

export const curveDrawL = (af: number, i: number) => ramp(af, B.curvesL + i * 4, B.curvesL + i * 4 + 18, E.outQuad);
export const curveDrawR = (af: number, j: number) => ramp(af, B.curvesR + j * 4, B.curvesR + j * 4 + 16, E.outQuad);
export const leftOn = (i: number) => B.left + [0, 5, 9][i];
export const rightOn = (j: number) => B.curvesR + j * 4 + 13;

// ---------- curves + pulses (SVG) ----------
const Comet: React.FC<{ path: (typeof CURVES_L)[number]; s: number; color: string; op: number }> = ({ path, s, color, op }) => {
  const head = path.pointAt(s);
  return (
    <g opacity={op}>
      {Array.from({ length: 7 }, (_, j) => 7 - j).map((j) => {
        const sj = s - j * 10;
        if (sj <= 0) return null;
        const q = path.pointAt(sj);
        return <circle key={j} cx={q.x} cy={q.y} r={5.4 * (1 - j / 8)} fill={color} opacity={0.5 * (1 - j / 8)} />;
      })}
      <circle cx={head.x} cy={head.y} r={13} fill={color} opacity={0.18} />
      <circle cx={head.x} cy={head.y} r={6.5} fill={color} stroke={C.surface} strokeWidth={2.2} />
    </g>
  );
};

export const Curves: React.FC<{ af: number }> = ({ af }) => {
  const packets: React.ReactNode[] = [];
  const pk = (path: (typeof CURVES_L)[number], L: number, travel: number, color: string, key: string) => {
    const u = (af - L) / travel;
    if (u <= 0 || u >= 1) return;
    const op = Math.min(ramp(u, 0, 0.1), 1 - ramp(u, 0.9, 1));
    packets.push(<Comet key={key} path={path} s={path.len * E.inOutSine(u)} color={color} op={op} />);
  };
  CURVES_L.forEach((p, i) => launches(B.pulse + i * 4).forEach((L, n) => pk(p, L, TRAVEL_L, SOURCES[i].tint, `l${i}-${n}`)));
  CURVES_R.forEach((p, j) => launches(B.pulse + 20 + j * 4).forEach((L, n) => pk(p, L, TRAVEL_R, PULSE_COLORS[(n + j) % 3], `r${j}-${n}`)));

  const ripple = ramp(af, B.ripple, B.ripple + 16, EASE.out);
  const tube = (path: (typeof CURVES_L)[number], draw: number, grad: string, key: string) =>
    draw > 0 && (
      <g key={key}>
        <path d={path.d} fill="none" stroke="rgba(255,253,248,1)" strokeWidth={16} strokeLinecap="round"
          strokeDasharray={path.len} strokeDashoffset={path.len * (1 - draw)} filter="url(#s08glow)" />
        <path d={path.d} fill="none" stroke="rgba(255,253,248,.9)" strokeWidth={6} strokeLinecap="round"
          strokeDasharray={path.len} strokeDashoffset={path.len * (1 - draw)} />
        <path d={path.d} fill="none" stroke={`url(#${grad})`} strokeWidth={2.6} strokeLinecap="round"
          strokeDasharray={path.len} strokeDashoffset={path.len * (1 - draw)} />
      </g>
    );
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        {/* userSpaceOnUse: the straight middle curve has a zero-height bbox (integration-hub-map pitfall). */}
        <filter id="s08glow" filterUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        {CURVES_L.map((p, i) => (
          <linearGradient key={i} id={`s08gl${i}`} gradientUnits="userSpaceOnUse" x1={p.p0.x} y1={p.p0.y} x2={p.p3.x} y2={p.p3.y}>
            <stop offset="0" stopColor={SOURCES[i].tint} />
            <stop offset="1" stopColor={C.ink} />
          </linearGradient>
        ))}
        {CURVES_R.map((p, j) => (
          <linearGradient key={j} id={`s08gr${j}`} gradientUnits="userSpaceOnUse" x1={p.p0.x} y1={p.p0.y} x2={p.p3.x} y2={p.p3.y}>
            <stop offset="0" stopColor={C.ink} />
            <stop offset="1" stopColor={C.mutedStrong} />
          </linearGradient>
        ))}
      </defs>
      {CURVES_L.map((p, i) => tube(p, curveDrawL(af, i), `s08gl${i}`, `L${i}`))}
      {CURVES_R.map((p, j) => tube(p, curveDrawR(af, j), `s08gr${j}`, `R${j}`))}
      {packets}
      {ripple > 0 && ripple < 1 && (
        <circle cx={HUB.x} cy={HUB.y} r={lerp(HUB.r, HUB.r * 2.1, ripple)} fill="none" stroke={C.accent} strokeWidth={2.5} opacity={(1 - ripple) * 0.55} />
      )}
    </svg>
  );
};

// ---------- cards ----------
const glassCard: React.CSSProperties = {
  position: 'absolute', boxSizing: 'border-box', background: GLASS[2].bg,
  boxShadow: `${GLASS.edge}, 0 14px 34px rgba(60,42,20,.12), 0 2px 4px rgba(60,42,20,.06)`,
  display: 'flex', alignItems: 'center',
};
// Material "flight_land" (Apache-2.0): inbound.
const LAND = 'M2.5 19h19v2h-19v-2zm7.18-5.73l4.35 1.16 5.31 1.42c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2v8.28L5.15 8.95l-.93-2.32-1.45-.39v5.17l1.6.43 5.31 1.43z';

const Port: React.FC<{ x: number; y: number; fill: string; ring: string }> = ({ x, y, fill, ring }) => (
  <div style={{ position: 'absolute', left: x - 9, top: y - 9, width: 18, height: 18, borderRadius: '50%', background: fill,
    boxShadow: `0 0 0 3px ${ring}, 0 2px 5px rgba(60,42,20,.25)` }} />
);

export const SourceCards: React.FC<{ af: number }> = ({ af }) => (
  <>
    {SOURCES.map((s, i) => {
      const t = leftOn(i);
      const k = ramp(af, t, t + 12, EASE.land);
      const op = ramp(af, t, t + 5);
      if (op <= 0) return null;
      return (
        <React.Fragment key={i}>
          <div style={{ ...glassCard, left: LEFT_X, top: s.y - CARD_H / 2, width: LEFT_W, height: CARD_H, borderRadius: 24, padding: '0 26px', gap: 22,
            opacity: op, transform: `scale(${lerp(0.3, 1, k)})`, transformOrigin: '100% 50%' }}>
            <div style={{ width: 70, height: 70, borderRadius: '50%', background: s.tint, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 3px 8px rgba(60,42,20,.18)' }}>
              <svg width={40} height={40} viewBox="0 0 24 24"><path d={LAND} fill={C.surface} /></svg>
            </div>
            <div>
              <div style={{ fontFamily: FONT.serifZh, fontWeight: 600, fontSize: 44, lineHeight: 1.1, color: C.ink, whiteSpace: 'nowrap' }}>{s.zh}</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 32, lineHeight: 1.25, color: C.mutedStrong, marginTop: 4, whiteSpace: 'nowrap' }}>{s.sub}</div>
            </div>
          </div>
          <Port x={LEFT_X + LEFT_W} y={s.y} fill={s.tint} ring={C.surface} />
        </React.Fragment>
      );
    })}
  </>
);

const ICON: Record<Dst['icon'], React.ReactNode> = {
  friends: (<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.6" cy="9" r="2.6" /><path d="M15.2 14.1c2.6-.3 4.8 1.3 5.4 4.4" /></>),
  scenic: (<><path d="M2.5 19.5h19" /><path d="M4.5 19.5l5.2-8.2 3.1 4.3 2.2-3.1 4.5 7" /><circle cx="16.4" cy="6.2" r="2" /></>),
  trip: (<><path d="M6 18.2c0-3.2 4.2-3.2 6.1-6.1S18 9 18 6.2" /><circle cx="6" cy="18.2" r="2" /><path d="M18 2.9c-1.6 0-2.8 1.2-2.8 2.7 0 2 2.8 4.6 2.8 4.6s2.8-2.6 2.8-4.6c0-1.5-1.2-2.7-2.8-2.7z" /></>),
  keepsake: (<><rect x="4.5" y="4.5" width="15" height="15" rx="3.6" /><path d="M7.8 15.6l2.7-3.3 2 2.2 1.9-2.1 1.9 3.2" /><circle cx="9.6" cy="9" r="1.3" /></>),
};

export const ServiceChips: React.FC<{ af: number }> = ({ af }) => (
  <>
    {SERVICES.map((d, j) => {
      const t = rightOn(j);
      const k = ramp(af, t, t + 12, EASE.land);
      const op = ramp(af, t, t + 5);
      const lit = ramp(af, t, t + 4);
      return (
        <React.Fragment key={j}>
          {op > 0 && (
            <div style={{ ...glassCard, left: RIGHT_X, top: d.y - CHIP_H / 2, width: RIGHT_W, height: CHIP_H, borderRadius: 20, padding: '0 22px 0 30px', gap: 18,
              opacity: op, transform: `scale(${lerp(0.3, 1, k)})`, transformOrigin: '0% 50%' }}>
              <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                {ICON[d.icon]}
              </svg>
              <span style={{ fontFamily: FONT.serifZh, fontWeight: 600, fontSize: 40, color: C.ink, whiteSpace: 'nowrap' }}>{d.zh}</span>
              <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 32, color: C.mutedStrong, whiteSpace: 'nowrap' }}>{d.en}</span>
            </div>
          )}
          {lit > 0 && <Port x={RIGHT_X} y={d.y} fill={C.ink} ring={C.surface} />}
        </React.Fragment>
      );
    })}
  </>
);

export const ColumnHeads: React.FC<{ af: number }> = ({ af }) => {
  const head = (x: number, zh: string, en: string, t: number, align: 'left' | 'right') => {
    const k = ramp(af, t, t + 10, EASE.out);
    if (k <= 0) return null;
    return (
      <div style={{ position: 'absolute', top: 172, left: align === 'left' ? x : undefined, right: align === 'right' ? 1920 - x : undefined,
        display: 'flex', alignItems: 'baseline', gap: 12, opacity: k, transform: `translateY(${(1 - k) * 8}px)`, whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: FONT.serifZh, fontWeight: 600, fontSize: 34, color: C.body }}>{zh}</span>
        <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 32, color: C.mutedStrong }}>{en}</span>
      </div>
    );
  };
  return (
    <>
      {head(LEFT_X + 4, '海外客源', 'Source markets', B.left - 4, 'left')}
      {head(RIGHT_X + RIGHT_W, '落地服务', 'On the ground', B.curvesR + 8, 'right')}
    </>
  );
};

export const lerpClamp = (a: number, b: number, t: number) => lerp(a, b, clamp01(t));
