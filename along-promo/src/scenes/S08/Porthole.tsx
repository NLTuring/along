// The Along hub: seed → paper disc with the mark (LogoInk, solid) → on 「山水」 the disc becomes a
// porthole and its shade lifts on a window scene → the app's six rows turn it A → B → it grows to
// fill the frame → T9: six full-screen rows slide off to the left (pages.css window-slat) and uncover
// S09. Frames ABSOLUTE.
import React from 'react';
import { Img, staticFile } from 'remotion';
import { C, EASE, FONT, GLASS } from '../../tokens';
import { LogoInk } from '../../components/LogoInk';
import { clamp01, lerp, ramp, E } from './kit';
import { B, HUB, PORT, GROW_DUR, TURN_DUR, SCENE_A, SCENE_B, slatDelay } from './layout';
import { seedRadius } from './Dust';

const HUB_SEED = 3; // index of the hub in SEEDS
const ROWS = 6;
const SLAT_SPREAD = 7, SLAT_DUR = B.slatsEnd - B.slats - SLAT_SPREAD; // 7 + 20 = 27f
const TURN_SPREAD = 5;

const photo = (src: string, pos: string, w: number, h: number): React.CSSProperties => ({
  position: 'absolute', left: 0, top: 0, width: w, height: h, objectFit: 'cover', objectPosition: pos, display: 'block',
});

/** Six rows carrying the outgoing scene, each sliding off to the left at its own moment. */
const Rows: React.FC<{ src: string; pos: string; w: number; h: number; t0: number; dur: number; spread: number; af: number; edge: boolean }> = ({
  src, pos, w, h, t0, dur, spread, af, edge,
}) => (
  <>
    {Array.from({ length: ROWS }, (_, row) => {
      const s = t0 + slatDelay(row, spread);
      const u = ramp(af, s, s + dur, E.slat);
      if (u >= 1) return null;
      const top = Math.floor((h * row) / ROWS), bot = Math.ceil((h * (row + 1)) / ROWS) + 1;
      const tx = -1.04 * w * u;
      const moving = Math.sin(Math.PI * Math.min(1, u * 1.15));
      return (
        <React.Fragment key={row}>
          {edge && u > 0 && (
            // cast shadow just right of the trailing edge, on the scene being uncovered
            <div style={{ position: 'absolute', left: w + tx, top, width: 46, height: bot - top,
              background: `linear-gradient(90deg, rgba(27,24,19,${(0.28 * moving).toFixed(3)}), rgba(27,24,19,0))` }} />
          )}
          <div style={{ position: 'absolute', left: 0, top, width: w, height: bot - top, overflow: 'hidden', transform: `translateX(${tx.toFixed(2)}px)` }}>
            <Img src={staticFile(src)} style={{ ...photo(src, pos, w, h), top: -top }} />
            {u > 0 && (
              <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: edge ? 3 : 2, background: `rgba(255,253,248,${(0.85 * moving).toFixed(3)})` }} />
            )}
          </div>
        </React.Fragment>
      );
    })}
  </>
);

export const coveredAt = (af: number) => af >= B.grow + GROW_DUR;

export const Hub: React.FC<{ af: number }> = ({ af }) => {
  // ---- T9: full-screen rows ----
  if (af >= B.slats) {
    if (af >= B.slatsEnd) return null;
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <Rows src={SCENE_B.src} pos={SCENE_B.pos} w={1920} h={1080} t0={B.slats} dur={SLAT_DUR} spread={SLAT_SPREAD} af={af} edge />
      </div>
    );
  }
  if (af < B.hubDisc - 1) return null;

  // ---- the hub box ----
  const disc = ramp(af, B.hubDisc, B.hubDisc + 13, EASE.land);
  const r = lerp(seedRadius(HUB_SEED, B.hubDisc), HUB.r, disc);
  const open = ramp(af, B.open, B.open + 12, E.inOutCubic);
  const grow = ramp(af, B.grow, B.grow + GROW_DUR, E.push);
  const w0 = lerp(2 * r, PORT.w, open), h0 = lerp(2 * r, PORT.h, open);
  const w = lerp(w0, 1920, grow), h = lerp(h0, 1080, grow);
  const cx = lerp(HUB.x, 960, grow), cy = lerp(HUB.y, 540, grow);
  const radK = Math.pow(1 - grow, 2.4);
  const radius = `${lerp(50, 42, open) * radK}% / ${lerp(50, 31, open) * radK}%`;
  const pulse = 1 + 0.07 * ramp(af, B.ripple - 2, B.ripple + 5, EASE.out) - 0.07 * ramp(af, B.ripple + 5, B.ripple + 14, E.outQuad);
  const lift = ramp(af, B.open + 4, B.open + 16, E.outCubic);
  const turnOn = af >= B.turn;
  const sceneUnder = turnOn ? SCENE_B : SCENE_A;
  const logoP = ramp(af, B.logo, B.logo + 30);
  const logoS = ramp(af, B.logo + 28, B.logo + 36);
  const shadowK = 1 - ramp(af, B.grow, B.grow + 6);

  // tag chip (figcaption): appears with the window, swaps name on the turn, leaves as it grows
  const tagK = Math.min(ramp(af, B.open + 8, B.open + 16, EASE.out), 1 - ramp(af, B.grow, B.grow + 4));
  const tagSwap = ramp(af, B.turn + 6, B.turn + 10);
  // hub label under the disc
  const labelK = Math.min(ramp(af, B.hubLabel, B.hubLabel + 10, EASE.out), 1 - ramp(af, B.open - 6, B.open + 2));

  return (
    <>
      {labelK > 0 && (
        <div style={{ position: 'absolute', left: HUB.x - 300, width: 600, top: HUB.y + HUB.r + 18, textAlign: 'center', opacity: labelK,
          transform: `translateY(${(1 - labelK) * 8}px)` }}>
          <div style={{ fontFamily: FONT.serifZh, fontWeight: 600, fontSize: 40, lineHeight: 1.2, color: C.ink }}>AI 行程 · 本地伙伴</div>
          <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 32, lineHeight: 1.25, color: C.mutedStrong, marginTop: 2 }}>AI trips · Local friends</div>
        </div>
      )}
      <div style={{
        position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, borderRadius: radius, overflow: 'hidden',
        transform: `scale(${pulse})`, background: C.line,
        boxShadow: `0 ${18 * shadowK}px ${44 * shadowK}px rgba(60,42,20,${(0.22 * shadowK).toFixed(3)}), 0 0 0 ${3 * (1 - open)}px ${C.ink}`,
      }}>
        {open > 0 && (
          <>
            <Img src={staticFile(sceneUnder.src)} style={photo(sceneUnder.src, sceneUnder.pos, w, h)} />
            {turnOn && af < B.turn + TURN_DUR + TURN_SPREAD && (
              <Rows src={SCENE_A.src} pos={SCENE_A.pos} w={w} h={h} t0={B.turn} dur={TURN_DUR - TURN_SPREAD} spread={TURN_SPREAD} af={af} edge={false} />
            )}
            {/* glass pane + rim (glass.css .window::after) */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', boxShadow: `inset 0 0 0 ${2 * (1 - grow)}px rgba(255,255,255,.6)`,
              background: `linear-gradient(135deg, rgba(255,255,255,${(0.22 * (1 - grow)).toFixed(3)}), rgba(255,255,255,0) 42%)` }} />
          </>
        )}
        {lift < 1 && (
          // the paper shade with the mark, lifting like S00's window shade
          <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: `translateY(${(-lift * 104).toFixed(2)}%)`,
            background: `radial-gradient(circle at 50% 35%, ${C.surface}, ${C.paper} 70%)`,
            boxShadow: lift > 0 ? `0 18px 30px rgba(27,24,19,${(0.25 * Math.sin(Math.PI * lift)).toFixed(3)})` : undefined,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogoInk progress={logoP} settle={logoS} width={178} color={C.ink} />
            <div style={{ position: 'absolute', left: '50%', bottom: 16, width: 46, height: 6, marginLeft: -23, borderRadius: 3, background: C.line, opacity: open }} />
          </div>
        )}
      </div>
      {tagK > 0 && (
        <div style={{ position: 'absolute', left: cx - 260, width: 520, top: cy + h / 2 - 70, display: 'flex', justifyContent: 'center', opacity: tagK,
          transform: `translateY(${(1 - tagK) * 10}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 22px 10px 16px', borderRadius: 999, background: GLASS[2].bg,
            boxShadow: `${GLASS.edge}, ${GLASS.shadow}`, whiteSpace: 'nowrap' }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" />
            </svg>
            <span style={{ display: 'inline-grid', justifyItems: 'center', fontFamily: FONT.sans, fontWeight: 500, fontSize: 32, color: C.ink }}>
              <span style={{ gridArea: '1 / 1', opacity: 1 - tagSwap }}>{SCENE_A.zh}</span>
              <span style={{ gridArea: '1 / 1', opacity: tagSwap }}>{SCENE_B.zh}</span>
            </span>
          </div>
        </div>
      )}
    </>
  );
};

export const hubSeedHidden = (af: number) => af >= B.hubDisc;
export const _clamp = clamp01;
