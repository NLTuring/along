// S07 3D 文创（1640–1915）——拍立得合拢成有厚度的外滩浮雕冰箱贴（侧面倾斜 + 可感知厚度 + 环绕，审美准则 Q7），
// 手机上是 App 自己渲染的 3D 文创页。说到「动漫」：App 的五秒长按环走满，涟漪从冰箱贴中心扩散，
// 扫过处换成 AI 动漫重绘的同一张照片（theme-switch-moves · palette-theme-ripple：涟漪边界就是换肤边界）。
// 「寄到家」：手机上「带回家」步骤，纸包裹贴好面单沿飞线飞走。T8 前半：冰箱贴碎成彩色粉末被风吹向右上（grain-dissolve）。
import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { useShotFrame } from '../lib/shot';
import { cue, shot } from '../timeline';
import { C, FONT } from '../tokens';
import { Sky } from '../components/Paper';
import { Phone3D, Stage3D } from '../components/Phone3D';
import { Mascot2D } from '../components/Mascot2D';
import { Chip, clamp, ICON, lerp, Note, ramp, rect, Shot } from './phone/kit';
import { Magnet, magnetAt } from './phone/magnet';
import { PHONE67 } from './S06';

const FROM = shot('S07').from;
const L = (w: string) => cue('X5', w) - FROM;
const ANIME = L('动漫'), HOME = L('寄到家');
export const S07_BEATS = { solid: 12, chips: 50, hold: ANIME - 24, ripple: ANIME, parcel: HOME - 10, fly: HOME + 14, dust: 240 };
const PAL = [C.paper, C.accent, C.accent, C.gold, C.sage, C.ink];
const DUST = Array.from({ length: 220 }, (_, i) => {
  const h = (n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: 840 + h(1) * 560, y: 410 + h(2) * 330, c: PAL[Math.floor(h(3) * PAL.length)], r: 2.2 + 4.2 * h(4) ** 2, d: h(1) * 18 + h(5) * 6, w: 0.7 + 0.6 * h(6), n: h(7) * 6.28 };
});

export const S07: React.FC = () => {
  const f = useShotFrame();
  const F = FROM + f;
  const ringK = interpolate(f, [ANIME - 24, ANIME], [0, 1], clamp);
  const ripple = interpolate(f, [ANIME, ANIME + 22], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.8, 0.25, 1) });
  const scr = f < 30 ? 'en-share-bund' : f < ANIME - 24 ? 'en-craft-real' : f < ANIME + 6 ? 'en-craft-hold' : f < HOME - 12 ? 'en-craft-anime' : 'en-craft-step4';
  const chipsOut = interpolate(f, [HOME - 16, HOME - 6], [1, 0], clamp);
  const parcel = ramp(f, HOME - 10, HOME + 2, Easing.bezier(0.34, 1.56, 0.64, 1));
  const fly = interpolate(f, [HOME + 14, HOME + 40], [0, 1], { ...clamp, easing: Easing.bezier(0.5, 0, 0.6, 1) });
  const dust = interpolate(f, [240, 250], [0, 1], clamp);
  const magO = interpolate(f, [240, 252], [1, 0], clamp);
  const bg = interpolate(f, [260, 275], [1, 0], clamp); // S08 is under us from 1900 (local 260)
  const allOut = interpolate(f, [236, 250], [1, 0], clamp);
  const m = magnetAt(F);
  const model = rect('en-craft-hold', 'model', { x: 0, y: 193, w: 390, h: 460 });
  const arc = (t: number) => { const u = 1 - t; return [u * u * 1580 + 2 * u * t * 1780 + t * t * 1990, u * u * 600 + 2 * u * t * 180 + t * t * 60]; };
  const [px, py] = arc(fly);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, opacity: bg }}><Sky from="day" /></div>
      <Stage3D>
        <div style={{ opacity: allOut < 1 ? allOut : undefined, transformStyle: 'preserve-3d' }}>
          <Phone3D pose={PHONE67} height={620}>
            <Shot name={scr} />
            {scr === 'en-craft-hold' && (
              <svg width={390} height={844} style={{ position: 'absolute', inset: 0 }}>
                <circle cx={model.x + model.w / 2} cy={model.y + model.h / 2} r={150} fill="none" stroke={C.accent} strokeWidth={8} pathLength={1}
                  strokeDasharray={`${ringK} 1`} transform={`rotate(-90 ${model.x + model.w / 2} ${model.y + model.h / 2})`} strokeLinecap="round" />
              </svg>
            )}
          </Phone3D>
        </div>
        <div style={{ opacity: magO < 1 ? magO : undefined, transformStyle: 'preserve-3d' }}>
          <Magnet m={m} anime={ripple} labels={interpolate(F, [1622, 1632, 1644, 1652], [0, 1, 1, 0], clamp)} />
        </div>
      </Stage3D>
      <div style={{ opacity: allOut }}>
        {[['3D 冰箱贴', 'Fridge magnet', ICON.cube], ['GLB · STL 可下载', 'Files for 3D printing', ICON.check], ['冰箱贴 · 钥匙扣', 'Magnet or keychain', ICON.check], ['人物凸起可手涂', 'Raise people by hand', ICON.check]].map(([zh, en, ic], i) => (
          <Chip key={zh as string} f={f} at={40 + i * 9} icon={ic} zh={zh as string} en={en as string} x={1480} y={230 + i * 132} out={chipsOut} float={i} />
        ))}
        <Note f={f} at={ANIME + 14} x={860} y={150} zh="AI 动漫重绘 · 原位替换" en="AI anime, swapped in place" out={interpolate(f, [HOME - 14, HOME - 6], [1, 0], clamp)} />
        <Note f={f} at={HOME - 4} x={860} y={150} zh="制作与邮寄 · 寄到家" en="Made and shipped home" color={C.accent} />
        {parcel > 0 && fly < 1 && (
          <>
            <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
              <path d="M1580 600 Q1780 180 1990 60" fill="none" stroke={C.accent} strokeWidth={4} strokeDasharray="12 12" pathLength={1} opacity={0.6} style={{ strokeDashoffset: 0 }} />
            </svg>
            <div style={{ position: 'absolute', left: px - 110 * (1 - 0.5 * fly), top: py - 80 * (1 - 0.5 * fly), width: 220, height: 160, transformOrigin: '0 0',
              transform: `scale(${parcel * (1 - 0.5 * fly)}) rotate(${-8 + 30 * fly}deg)`, borderRadius: 10, background: 'linear-gradient(160deg, #C9A16E, #A87F4C)',
              boxShadow: '0 16px 30px rgba(60,42,20,.3), inset 0 0 0 2px rgba(255,255,255,.18)' }}>
              <div style={{ position: 'absolute', left: 96, top: 0, bottom: 0, width: 28, background: 'rgba(255,253,248,.28)' }} />
              <div style={{ position: 'absolute', left: 20, top: 44, width: 150, padding: '8px 10px', background: '#FFFDF8', borderRadius: 4, fontFamily: FONT.serif, fontSize: 18, lineHeight: 1.25, color: C.ink }}>
                <b>Along</b> · Ship to home<br />Lyon, France
              </div>
            </div>
          </>
        )}
      </div>
      {f < 250 && (
        <div style={{ position: 'absolute', left: 600, top: 640, opacity: allOut }}>
          <Mascot2D expression={f > HOME ? 'love' : f > ANIME ? 'excited' : 'happy'} action={f > HOME + 10 ? 'wave' : f > ANIME ? 'cheer' : 'idle'} size={190} t={f / 30} />
        </div>
      )}
      {dust > 0 && (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {DUST.map((p, i) => {
            const t = Math.max(0, f - 240 - p.d);
            const g = interpolate(f, [1905 - FROM, 1920 - FROM], [1, 0], clamp);
            const x = p.x + t * t * 0.9 * p.w + Math.sin(t / 5 + p.n) * 8, y = p.y - t * t * 0.55 * p.w + Math.cos(t / 6 + p.n) * 6;
            return <circle key={i} cx={x} cy={y} r={p.r} fill={p.c} opacity={dust * g * 0.95} />;
          })}
        </svg>
      )}
    </AbsoluteFill>
  );
};
