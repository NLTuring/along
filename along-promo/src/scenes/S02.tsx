// S02 落地之后的门槛（405–660，夜→黎明）——匹配剪辑：上一镜的上海红点落成护照上的入境章，镜头拉开露出整页；
// 六枚印章越来越快地砸下（前四枚钉旁白「支付 / 语言 / 导航 / 订票」）；最后护照页沿登机牌式齿孔撕开，
// 两半像对开门向外翻飞（page-turn-transitions · barn-door-split：门 ease-in 加速让位，两半对位无缝），
// 门缝里透出黎明的光——下层是 S03 正在升起的手机。
import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { useShotFrame } from '../lib/shot';
import { cue, shot } from '../timeline';
import { C, FONT } from '../tokens';
import { Grain } from '../components/Paper';
import { CELL, CellText, clipFor, Defs, ENTRY, EntryStamp, Guilloche, PAGE, PAINS, Seal, TEAR } from './S02/parts';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const FROM = shot('S02').from;
const L = (id: string) => cue('N2', id) - FROM;
const LAND = [L('支付') - 2, L('语言') - 1, L('导航') - 1, L('订票') - 1];
LAND.push(LAND[3] + 15, LAND[3] + 26);
export const S02_BEATS = { stamp1: LAND[0], stamp2: LAND[1], stamp3: LAND[2], stamp4: LAND[3], stamp5: LAND[4], stamp6: LAND[5], push: 195, perforate: 208, tear: 212 };

function camera(f: number) {
  // world → screen: s = (w - c) * z + screen anchor
  const a = interpolate(f, [3, 50], [0, 1], { ...clamp, easing: Easing.bezier(0.33, 0, 0.2, 1) });
  const p = interpolate(f, [195, 210], [0, 1], { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const z0 = 80 / ENTRY.r, z1 = 1, z2 = 1.56; // z0: the stamp is the S01 node's 160px disc at the cut
  let z = Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * a);
  let cx = ENTRY.x + (960 - ENTRY.x) * a, cy = ENTRY.y + (520 - ENTRY.y) * a;
  if (p > 0) { z = Math.exp(Math.log(z) + (Math.log(z2) - Math.log(z)) * p); cy += (PAGE.y + PAGE.h / 2 - cy) * p; }
  return { z, cx, cy };
}

const World: React.FC<{ f: number }> = ({ f }) => {
  const shake = f >= LAND[0] && f < LAND[0] + 5 ? Math.sin((f - LAND[0]) * 2.6) * 6 * Math.exp(-(f - LAND[0]) / 2) : 0;
  const hand = interpolate(f, [0, 8], [1, 0], clamp);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `translateY(${shake}px)` }}>
      <div style={{ position: 'absolute', left: PAGE.x, top: PAGE.y, width: PAGE.w, height: PAGE.h, borderRadius: 14, overflow: 'hidden',
        background: `linear-gradient(180deg, #FBF7EE 0%, ${C.paper} 60%, #EFE6D5 100%)`, boxShadow: '0 30px 80px rgba(0,0,0,.45), 0 0 0 1px rgba(60,42,20,.12)' }}>
        <Guilloche />
        <Grain opacity={0.55} />
        <div style={{ position: 'absolute', left: 60, top: 44, fontFamily: FONT.serif, fontSize: 30, letterSpacing: '.32em', color: C.sage }}>VISAS · 签证 · 入出境记录</div>
        <div style={{ position: 'absolute', left: 60, top: 92, fontFamily: FONT.serifZh, fontSize: 60, color: C.ink }}>
          落地之后，<span style={{ color: C.accent }}>六道门槛</span>
          <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 38, color: C.mutedStrong, marginLeft: 20 }}>Six hurdles after landing</span>
        </div>
        <div style={{ position: 'absolute', right: 40, bottom: 26, fontFamily: FONT.serif, fontSize: 30, color: C.muted }}>— 07 —</div>
      </div>
      {PAINS.map((_, i) => (
        <div key={i} style={{ transform: neighbour(f, i) }}>
          <Seal f={f} land={LAND[i]} i={i} />
          <CellText f={f} land={LAND[i]} i={i} />
        </div>
      ))}
      <EntryStamp />
      {hand > 0 && <div style={{ position: 'absolute', left: ENTRY.x - ENTRY.r, top: ENTRY.y - ENTRY.r, width: ENTRY.r * 2, height: ENTRY.r * 2, borderRadius: '50%',
        background: C.accent, opacity: hand, transform: `scale(${1 + 0.15 * (1 - hand)})` }} />}
    </div>
  );
};

// Earlier cells give a small damped nudge when a later seal lands next to them (the hit travels).
function neighbour(f: number, i: number) {
  let dx = 0, dy = 0;
  LAND.forEach((land, j) => {
    if (j <= i || f < land + 2) return;
    const a = CELL(i), b = CELL(j), d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 560) return;
    const t = f - land - 2, k = Math.cos(t / 2) * Math.exp(-t / 6) * (t < 24 ? 1 : 0) * 10 * (1 - d / 600);
    dx += ((a.x - b.x) / d) * k; dy += ((a.y - b.y) / d) * k;
  });
  return `translate(${dx}px, ${dy}px)`;
}

export const S02: React.FC = () => {
  const f = useShotFrame();
  const { z, cx, cy } = camera(f);
  const cam = `translate(960px, 540px) scale(${z}) translate(${-cx}px, ${-cy}px)`;
  const open = interpolate(f, [212, 248], [0, 1], { ...clamp, easing: Easing.bezier(0.42, 0, 0.8, 0.25) });
  const perf = interpolate(f, [206, 214], [0, 1], clamp);
  const leak = interpolate(f, [210, 222, 246], [0, 1, 0], clamp);
  const desk = f < 211;
  const half = (side: 'L' | 'R') => {
    const sg = side === 'L' ? -1 : 1;
    return (
      <div key={side} style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transformOrigin: `${side === 'L' ? 0 : 1920}px 540px`,
        transform: `translateX(${sg * 1150 * open}px) rotateY(${-sg * 58 * open}deg) rotateZ(${sg * 4 * open}deg)` }}>
        <div style={{ position: 'absolute', inset: 0, transform: cam, transformOrigin: '0 0' }}>
          <div style={{ position: 'absolute', inset: 0, clipPath: clipFor(side) }}><World f={f} /></div>
          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <polyline points={TEAR.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#FFF8EA" strokeWidth={3} opacity={0.8 * Math.min(1, open * 6)} />
          </svg>
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <Defs />
      {desk && <AbsoluteFill style={{ background: 'radial-gradient(90% 80% at 50% 38%, #4A3F33 0%, #2A231C 55%, #15110D 100%)' }} />}
      <div style={{ position: 'absolute', inset: 0, perspective: 1800 }}>
        {f < 212 ? (
          <div style={{ position: 'absolute', inset: 0, transform: cam, transformOrigin: '0 0' }}>
            <World f={f} />
            {perf > 0 && (
              <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                {Array.from({ length: 26 }, (_, k) => {
                  const y = PAGE.y + 10 + k * 27.5;
                  return perf * 26 > k ? <circle key={k} cx={960} cy={y} r={4.5} fill="#2A231C" opacity={0.85} /> : null;
                })}
              </svg>
            )}
          </div>
        ) : (
          [half('L'), half('R')]
        )}
      </div>
      {leak > 0 && (
        <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: leak,
          background: `linear-gradient(90deg, rgba(255,214,170,0) ${50 - 6 - open * 30}%, rgba(255,226,190,.95) 50%, rgba(255,214,170,0) ${50 + 6 + open * 30}%)` }} />
      )}
    </AbsoluteFill>
  );
};
