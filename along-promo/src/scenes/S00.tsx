// S00 舷窗开场（0–126，夜）——机舱内壁上一扇舷窗，遮光板上按笔顺写出 Along 标志（网站开场同款），
// hold 1s 后遮光板升起，舷窗里是夜色世界（S01 在下层），镜头穿窗而出（shot-transitions · mask-wipe）。
// 穿窗时值取 PortalWipeV2：窗放大用 bezier(0.7,0,0.3,1) 先慢后快再缓收，几何与窗内景同一个 t。
import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { useShotFrame } from '../lib/shot';
import { LogoInk } from '../components/LogoInk';
import { Grain } from '../components/Paper';
import { C, FONT } from '../tokens';

export const S00_BEATS = { brush: 6, settled: 72, subtitle: 66, shadeUp: 104, push: 110 };

const PW = 360, PH = 480, PR = 180; // porthole (vertical stadium)
const CX = 960, CY = 452;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const hole = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

export const S00: React.FC = () => {
  const f = useShotFrame();
  const brush = interpolate(f, [6, 64], [0, 1], clamp);
  const settle = interpolate(f, [64, 72], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const sub = interpolate(f, [66, 80], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }); // mark still from 72 to 104 (32f)
  const subOut = interpolate(f, [104, 112], [1, 0], clamp);
  const shade = interpolate(f, [104, 118], [0, 1], { ...clamp, easing: Easing.bezier(0.55, 0, 0.35, 1) });
  const push = interpolate(f, [110, 126], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.3, 1) });
  const k = Math.exp(Math.log(15) * push); // scale around the porthole centre
  const glare = interpolate(f, [100, 118], [0.5, 0], clamp);
  const x = CX - PW / 2, y = CY - PH / 2;
  const wall = `M0 0H1920V1080H0Z ${hole(x, y, PW, PH, PR)}`;
  const rim = hole(x - 22, y - 22, PW + 44, PH + 44, PR + 22);
  return (
    <AbsoluteFill style={{ opacity: f >= 125 ? 0 : 1 }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${k})`, transformOrigin: `${CX}px ${CY}px` }}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <radialGradient id="s00wall" cx="50%" cy="42%" r="75%">
              <stop offset="0" stopColor="#3A332B" />
              <stop offset=".55" stopColor="#25201B" />
              <stop offset="1" stopColor="#14110E" />
            </radialGradient>
            <linearGradient id="s00rim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5C5248" />
              <stop offset=".5" stopColor="#2E2822" />
              <stop offset="1" stopColor="#4A4139" />
            </linearGradient>
          </defs>
          <path d={wall} fill="url(#s00wall)" fillRule="evenodd" />
          <path d={`M${x - 260} 0V1080M${x + PW + 260} 0V1080`} stroke="rgba(255,240,220,.05)" strokeWidth={2} />
          <path d={`${rim} ${hole(x, y, PW, PH, PR)}`} fill="url(#s00rim)" fillRule="evenodd" />
          <path d={rim} fill="none" stroke="rgba(255,240,220,.16)" strokeWidth={2} />
          <path d={hole(x - 6, y - 6, PW + 12, PH + 12, PR + 6)} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={10} />
        </svg>
        {/* the shade inside the window: paper with the mark; it lifts up and away */}
        <div style={{ position: 'absolute', left: x, top: y, width: PW, height: PH, borderRadius: PR, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-shade * (PH + 40)}px)`,
            background: `linear-gradient(180deg, ${C.surface} 0%, ${C.paper} 70%, #EDE5D6 100%)` }}>
            <Grain opacity={0.6} />
            <div style={{ position: 'absolute', left: 120, right: 120, bottom: 18, height: 6, borderRadius: 3, background: 'rgba(27,24,19,.18)' }} />
            <div style={{ position: 'absolute', left: (PW - 296) / 2, top: PH / 2 - 70 }}>
              <LogoInk progress={brush} settle={settle} width={296} color={C.ink} />
            </div>
          </div>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: glare,
            background: 'linear-gradient(125deg, rgba(255,255,255,0) 30%, rgba(255,255,255,.28) 42%, rgba(255,255,255,0) 55%)' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: CY + PH / 2 + 56, textAlign: 'center', color: '#F3EDE2',
        opacity: sub * subOut, transform: `translateY(${(1 - sub) * 16}px)` }}>
        <div style={{ fontFamily: FONT.serifZh, fontSize: 54, letterSpacing: '.08em' }}>Along 一起游 · 外国游客来华的旅行 App</div>
        <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 36, opacity: 0.72, marginTop: 8 }}>The travel app for visitors to China</div>
      </div>
      <AbsoluteFill style={{ pointerEvents: 'none', background: 'radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%)', opacity: 1 - push }} />
    </AbsoluteFill>
  );
};
