// S04 三天行程（905–1160）——手机转完一圈落在英文行程表单；钴蓝不用、改用鼠尾草绿的"机器视线"扫描线自上而下
// 掠过表单，取景角标逐项锁定日期 / 城市 / 天数（scanline-annotate-focus：匀速扫描、角标弹簧一次过冲）；
// 「排好」时行程生成，站点卡从屏幕里飞出，悬浮成分层的 3D 时间线（depth-layer-moves · multiplane），
// 右侧逐项标注时间 / 交通 / 门票 / 花费 / 闭馆提醒。T4：地图像桌面一样从下方抬起成正俯视，行程卡落成图钉旁的标签
// （overhead-camera-moves · overhead-tabletop-drop：巡视与扎入分离，扎入段零速起步）。
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile } from 'remotion';
import { useShotFrame } from '../lib/shot';
import { cue, shot } from '../timeline';
import { C, FONT } from '../tokens';
import { Sky } from '../components/Paper';
import { Phone3D, Stage3D } from '../components/Phone3D';
import { clamp, lerp, Note, ramp, rect, Shot } from './phone/kit';
import { flipDeg, phonePose } from './phone/rig';
import { InkMap, PIN } from './phone/map';
import { XiaoYou } from './S03';

const FROM = shot('S04').from;
const L = (w: string) => cue('X2', w) - FROM;
export const S04_BEATS = { scan: 50, lock1: 54, lock2: 64, lock3: 72, form2: 94, plan: L('排好') - 2, cards: 148, notes: 176, drop: 220, land: 253 };
const SAGE = C.sage;

// Floating stop cards (stage coords, centre) and where they land on the map (screen coords, card top-left; scale 0.6).
const CARDS = [
  { img: 'stop1', w: 350, h: 138, x: 140, y: -230, z: 80, pin: PIN.yuyuan, to: [1050, 530] },
  { img: 'stop2', w: 350, h: 113, x: 250, y: 20, z: -40, pin: PIN.westbund, to: [840, 790] },
  { img: 'stop3', w: 350, h: 113, x: 380, y: 230, z: -140, pin: PIN.jingan, to: [300, 380] },
  { img: 'nanjing-museum', w: 350, h: 154, x: 640, y: -330, z: -200, pin: null, to: null },
] as const;
const S = 1.15; // card scale while floating

const Bracket: React.FC<{ x: number; y: number; w: number; h: number; k: number; color?: string; arm?: number; stroke?: number }> = ({ x, y, w, h, k, color = SAGE, arm = 14, stroke = 3 }) => {
  if (k <= 0) return null;
  const sp = Easing.bezier(0.34, 1.56, 0.64, 1)(Math.min(1, k));
  const o = 40 * (1 - sp);
  const L1 = (sx: number, sy: number) => `M${sx * arm} 0H0V${sy * arm}`;
  return (
    <svg style={{ position: 'absolute', left: x - o - 6, top: y - o - 6, width: w + 2 * o + 12, height: h + 2 * o + 12, overflow: 'visible', opacity: Math.min(1, k * 2) }}>
      {[[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].map(([cx, cy, sx, sy], i) => (
        <path key={i} d={L1(sx, sy)} transform={`translate(${6 + cx * (w + 2 * o)} ${6 + cy * (h + 2 * o)})`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      ))}
    </svg>
  );
};

export const S04: React.FC = () => {
  const f = useShotFrame();
  const F = FROM + f;
  const { pose, height } = phonePose(F);
  const frontReady = flipDeg(F) >= 270 || F >= 905;
  const scanY = interpolate(f, [50, 84], [150, 570], clamp);
  const scanO = interpolate(f, [48, 52, 82, 88], [0, 1, 1, 0], clamp);
  const lock = (t: number) => ramp(f, t, t + 12, Easing.linear);
  const r = (n: string, fb: { x: number; y: number; w: number; h: number }) => rect('en-trip-form', n, fb);
  const form2 = ramp(f, 94, 104), plan = ramp(f, S04_BEATS.plan, S04_BEATS.plan + 10);
  const notesOut = interpolate(f, [140, 150], [1, 0], clamp);
  const drop = interpolate(f, [220, 253], [0, 1], { ...clamp, easing: Easing.bezier(0.45, 0, 0.25, 1) });
  const floorTilt = 84 * (1 - drop);
  const side = interpolate(f, [176, 186], [0, 1], clamp) * interpolate(f, [218, 228], [1, 0], clamp);
  return (
    <AbsoluteFill>
      <Sky from="day" />
      {/* the map rises into view as the floor — camera pitches down to look straight at it */}
      {drop > 0 && (
        <div style={{ position: 'absolute', inset: 0, perspective: 1500, perspectiveOrigin: '50% 100%' }}>
          <div style={{ position: 'absolute', inset: 0, transformOrigin: '50% 100%', transform: `rotateX(${floorTilt}deg)`, opacity: Math.min(1, drop * 4) }}>
            <InkMap />
          </div>
        </div>
      )}
      <Stage3D>
        <Phone3D pose={pose} height={height}>
          {frontReady && (
            <>
              <Shot name="en-trip-form" />
              <Shot name="en-trip-form-2" opacity={form2} />
              <Shot name="en-plan-view" opacity={plan} />
              {scanO > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: scanY - 1.5, height: 3, background: SAGE, opacity: scanO,
                boxShadow: `0 -60px 60px -20px rgba(95,111,90,.22)` }} />}
              <div style={{ opacity: 1 - form2 }}>
                <Bracket {...r('date', { x: 41, y: 193, w: 183, h: 52 })} k={lock(54)} />
                <Bracket {...r('time', { x: 232, y: 193, w: 117, h: 52 })} k={lock(57)} />
                <Bracket {...r('city', { x: 41, y: 327, w: 101, h: 44 })} k={lock(64)} />
                <Bracket {...r('days', { x: 45, y: 429, w: 100, h: 44 })} k={lock(72)} />
              </div>
            </>
          )}
        </Phone3D>
        {CARDS.map((c, i) => {
          const t0 = 148 + i * 9;
          const out = interpolate(f, [t0, t0 + 18], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.9, 0.25, 1.08) });
          if (out <= 0) return null;
          const drift = Math.sin(f / 26 + i) * 6 * ramp(f, t0 + 18, t0 + 40);
          const sx0 = pose.x! - 30, sy0 = pose.y! - 120 + i * 40;
          let x = lerp(sx0, c.x, out), y = lerp(sy0, c.y, out) + drift, z = lerp(0, c.z, out), s = lerp(0.55, S, out), rx = 0, ry = lerp(-20, -8 + i * 3, out), o = 1;
          if (drop > 0) {
            if (c.to) {
              const d = Easing.bezier(0.5, 0, 0.3, 1)(Math.min(1, drop * 1.15));
              const tx = c.to[0] + (c.w * 0.6) / 2 - 960, ty = c.to[1] + (c.h * 0.6) / 2 - 540;
              x = lerp(x, tx, d); y = lerp(y, ty, d); z = lerp(z, 0, d); s = lerp(s, 0.6, d); ry = lerp(ry, 0, d); rx = 46 * Math.sin(Math.PI * d);
            } else o = interpolate(drop, [0, 0.35], [1, 0], clamp);
          }
          return (
            <div key={c.img} style={{ position: 'absolute', left: 0, top: 0, transformStyle: 'preserve-3d', opacity: o,
              transform: `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})` }}>
              <div style={{ position: 'absolute', left: -c.w / 2, top: -c.h / 2, width: c.w, height: c.h, borderRadius: 18, overflow: 'hidden', background: C.paper,
                boxShadow: '0 0 0 1px rgba(27,24,19,.06), 0 18px 34px rgba(60,42,20,.18)' }}>
                <Img src={staticFile(`scenes/S04/${c.img}.png`)} style={{ width: c.w, height: c.h, display: 'block' }} />
                {i === 0 && <><Bracket x={0} y={6} w={64} h={34} k={lock(178) * (1 - drop)} stroke={2.5} arm={10} /><Bracket x={74} y={104} w={130} h={30} k={lock(194) * (1 - drop)} stroke={2.5} arm={10} /></>}
                {i === 3 && <Bracket x={74} y={100} w={240} h={46} k={lock(202) * (1 - drop)} color={C.danger} stroke={2.5} arm={10} />}
                {i === 3 && <div style={{ position: 'absolute', right: 8, top: 8, padding: '3px 10px', borderRadius: 999, background: C.ink, color: C.paper, fontFamily: FONT.sans, fontSize: 16, fontWeight: 600 }}>Day 2 · 南京 Nanjing</div>}
              </div>
            </div>
          );
        })}
      </Stage3D>
      <Note f={f} at={56} x={930} y={240} zh="落地 · 上海" en="Land in Shanghai · 21 Nov, 10:00" out={notesOut} />
      <Note f={f} at={70} x={930} y={380} zh="3 天 · 美食 · 历史 · 摄影" en="3 days · Food · History · Photography" out={notesOut} />
      <div style={{ position: 'absolute', left: 1540, top: 330, opacity: side, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {[['09:30 出发', 'Time for each stop'], ['步行 · 地铁', 'Walk & metro times'], ['门票 ¥40', 'Tickets & costs'], ['闭馆日提醒', 'Closed-day check']].map(([zh, en], i) => (
          <div key={zh} style={{ opacity: ramp(f, 176 + i * 8, 186 + i * 8), transform: `translateX(${(1 - ramp(f, 176 + i * 8, 186 + i * 8)) * 16}px)`,
            borderLeft: `4px solid ${i === 3 ? C.danger : SAGE}`, paddingLeft: 14, whiteSpace: 'nowrap' }}>
            <div style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 34, color: i === 3 ? C.danger : C.ink }}>{zh}</div>
            <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 30, color: C.mutedStrong }}>{en}</div>
          </div>
        ))}
      </div>
      <XiaoYou F={F} f={f} />
    </AbsoluteFill>
  );
};
