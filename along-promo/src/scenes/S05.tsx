// S05 导航与本地伙伴（1160–1415）——正俯视的纸墨上海示意图：行程卡收成图钉标签，墨线笔头画出步行路线
// （draw-svg-trace），小游沿线走；手机立起显示豫园地点弹层和"给司机看"大字卡。说到「本地伙伴」时豫园图钉
// 实心圆镂空成圆环、撑开一扇月洞门（circle-match-iris：圆环把光圈撑开，旧景以锚点为心推远压暗），
// 门里伙伴轮换（avatar-bracket-carousel：对焦框钉死、头像弹簧轮换）；手机上预约成功落章；最后推进到取景键。
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile } from 'remotion';
import { useShotFrame } from '../lib/shot';
import { cue, shot } from '../timeline';
import { C, FONT } from '../tokens';
import { Phone3D, Stage3D } from '../components/Phone3D';
import { Mascot2D } from '../components/Mascot2D';
import { Chip, clamp, ICON, LensCloseup, lerp, Note, ramp, rect, Shot } from './phone/kit';
import { InkMap, METRO, Pin, PIN, WALK } from './phone/map';

const FROM = shot('S05').from;
const L = (w: string) => cue('X3', w) - FROM;
const GATE = { x: 1010, y: 545, r: 300 };
const T_WALK = L('我带你走') - 8, T_GATE = L('本地伙伴') - 4;
export const S05_BEATS = { pins: 6, walk: T_WALK, phone: 40, driver: 68, gate: T_GATE, swap1: T_GATE + 48, swap2: T_GATE + 48, booked: T_GATE + 92, push: 230, ring: 236 };
const GUIDES = [
  { img: 'zhangmin', name: '张敏 Zhang Min', tag: '持证向导 · $49', tagEn: 'Licensed guide', meta: '★ 4.8 · 街头小吃 · 菜市场' },
  { img: 'jiajia', name: '陈佳佳 Chen Jiajia', tag: '志愿者 · 免费', tagEn: 'Volunteer · Free', meta: '★ 4.9 · 摄影 · 慢慢逛' },
];
const LABELS = [
  { img: 'stop1', w: 350, h: 138, to: [1050, 530] }, { img: 'stop2', w: 350, h: 113, to: [840, 790] }, { img: 'stop3', w: 350, h: 113, to: [300, 380] },
];

/** Point on the walking path (cubic) at t. */
const walkAt = (t: number) => {
  const [p0, p1, p2, p3] = [[860, 470], [900, 470], [930, 520], [1010, 545]];
  const u = 1 - t;
  return [0, 1].map((i) => u ** 3 * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t ** 3 * p3[i]);
};

export const S05: React.FC = () => {
  const f = useShotFrame();
  const gate = interpolate(f, [T_GATE, T_GATE + 24], [0, 1], { ...clamp, easing: Easing.bezier(0.6, 0, 0.3, 1) });
  const push = interpolate(f, [228, 252], [0, 1], { ...clamp, easing: Easing.bezier(0.6, 0, 0.9, 0.35) });
  const leave = interpolate(f, [224, 238], [1, 0], clamp);
  const walk = interpolate(f, [T_WALK, T_WALK + 34], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const metro = ramp(f, T_WALK + 30, T_WALK + 56, Easing.inOut(Easing.cubic));
  const mapScale = 1 + 0.06 * gate;
  // phone: rises left, then pushes into the capture button
  const rise = ramp(f, 40, 62, Easing.bezier(0.2, 0.8, 0.2, 1));
  const lensR = rect('en-trip', 'lens', { x: 167, y: 764, w: 56, h: 56 });
  const H1 = 2803, s1 = H1 / 872, yEnd = -((14 + lensR.y + lensR.h / 2) * s1 - H1 / 2);
  const pose = { x: lerp(lerp(-640, -700, 1 - rise), 0, push), y: lerp(lerp(940, 30, rise), yEnd, push), rx: 0, ry: lerp(16, 0, push), rz: 0 };
  const height = Math.exp(lerp(Math.log(560), Math.log(H1), push));
  const close = interpolate(f, [244, 250], [0, 1], clamp);
  const ring = interpolate(f, [236, 254], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const scr = f < 68 ? 'poi' : f < T_GATE + 12 ? 'driver' : f < T_GATE + 70 ? 'friends' : f < 222 ? 'checkout' : 'trip';
  const booked = ramp(f, T_GATE + 80, T_GATE + 90);
  // carousel: segments [start, guide]; the new one springs up into the brackets, the old one leaves upward
  const SEG: [number, number][] = [[T_GATE + 6, 0], [T_GATE + 48, 1]];
  let si = 0; SEG.forEach(([t], i) => { if (f >= t) si = i; });
  const p = walkAt(walk);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${mapScale})`, transformOrigin: `${GATE.x}px ${GATE.y}px`, opacity: 1 - push }}>
        <InkMap dim={0.32 * gate} />
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <path d={WALK} fill="none" stroke={C.ink} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={`${walk} 1`} />
          {METRO.map((d) => <path key={d} d={d} fill="none" stroke={C.sage} strokeWidth={6} strokeLinecap="round" strokeDasharray="14 12" opacity={metro} />)}
          {walk > 0 && walk < 1 && <circle cx={p[0]} cy={p[1]} r={9} fill={C.ink} />}
        </svg>
        <Pin x={PIN.here[0]} y={PIN.here[1]} k={ramp(f, 4, 16)} r={11} />
        <Note f={f} at={T_WALK + 14} x={840} y={350} zh="步行 12 分钟" en="Walk 12 min" size={36} out={1 - gate} />
        <Note f={f} at={T_WALK + 44} x={600} y={600} zh="地铁 25 分钟" en="Metro 25 min" size={34} out={1 - gate} color={C.sage} />
        {LABELS.map((c, i) => {
          const fold = ramp(f, 6 + i * 5, 22 + i * 5);
          const pin = [PIN.yuyuan, PIN.westbund, PIN.jingan][i];
          return (
            <React.Fragment key={c.img}>
              {fold < 1 && <Img src={staticFile(`scenes/S04/${c.img}.png`)} style={{ position: 'absolute', left: c.to[0], top: c.to[1], width: c.w * 0.6, height: c.h * 0.6,
                borderRadius: 11, opacity: 1 - fold, boxShadow: '0 11px 20px rgba(60,42,20,.18)', transform: `scale(${1 - 0.3 * fold})`, transformOrigin: '0 0' }} />}
              <Pin x={pin[0]} y={pin[1]} k={(i === 0 ? 1 - gate : 1) * ramp(f, 10 + i * 5, 24 + i * 5, Easing.bezier(0.34, 1.56, 0.64, 1))}
                label={['豫园 · 09:30', '西岸滨江 · 14:00', '静安 · 18:30'][i]} sub={['Yu Garden', 'West Bund', "Jing'an"][i]} lo={1 - gate} />
            </React.Fragment>
          );
        })}
        {/* the moon gate: the pin's disc hollows into a ring that opens the gate */}
        {gate > 0 && (
          <div style={{ position: 'absolute', left: GATE.x - GATE.r * gate, top: GATE.y - GATE.r * gate, width: 2 * GATE.r * gate, height: 2 * GATE.r * gate, borderRadius: '50%', overflow: 'hidden',
            background: 'radial-gradient(circle at 50% 35%, #FBF6EC 0%, #F1E6D2 60%, #E4D3B6 100%)', boxShadow: `0 0 0 ${lerp(16, 26, gate)}px ${gate < 0.4 ? C.accent : '#CFC3AE'}, 0 0 0 ${lerp(20, 32, gate)}px rgba(27,24,19,.12), 0 30px 60px rgba(27,24,19,.25)` }}>
            <div style={{ position: 'absolute', left: GATE.r * gate - GATE.r, top: GATE.r * gate - GATE.r, width: 2 * GATE.r, height: 2 * GATE.r, opacity: ramp(f, T_GATE + 10, T_GATE + 22) }}>
              {[si - 1, si].filter((j) => j >= 0).map((j) => {
                const [t0, gIdx] = SEG[j], g = GUIDES[gIdx];
                const ent = ramp(f, t0, t0 + 12, Easing.bezier(0.34, 1.3, 0.64, 1));
                const ex = j < si ? ramp(f, SEG[si][0], SEG[si][0] + 8, Easing.in(Easing.quad)) : 0;
                if (ex >= 1) return null;
                return (
                  <div key={j} style={{ position: 'absolute', inset: 0, textAlign: 'center', opacity: Math.min(1, ent * 2) * (1 - ex), transform: `translateY(${(1 - ent) * 40 - ex * 50}px) scale(${1 - 0.12 * ex})`, filter: `blur(${(1 - ent) * 8 + ex * 8}px)` }}>
                    <Img src={staticFile(`scenes/S05/guide-${g.img}.png`)} style={{ position: 'absolute', left: GATE.r - 110, top: 70, width: 220, height: 220, borderRadius: '50%', boxShadow: '0 0 0 6px #FFFDF8, 0 14px 26px rgba(60,42,20,.22)' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 312, fontFamily: FONT.serifZh, fontSize: 40, fontWeight: 600, color: C.ink }}>{g.name}</div>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 368, fontFamily: FONT.sans, fontSize: 34, color: C.accent, fontWeight: 600 }}>{g.tag}</div>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 414, fontFamily: FONT.sans, fontSize: 32, color: C.body }}>{g.meta}</div>
                  </div>
                );
              })}
              {/* focus brackets pinned around the portrait */}
              {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy], i) => (
                <div key={i} style={{ position: 'absolute', left: GATE.r - 136 + cx * 244, top: 46 + cy * 244, width: 28, height: 28,
                  borderLeft: cx ? 'none' : `4px solid ${C.accent}`, borderRight: cx ? `4px solid ${C.accent}` : 'none',
                  borderTop: cy ? 'none' : `4px solid ${C.accent}`, borderBottom: cy ? `4px solid ${C.accent}` : 'none' }} />
              ))}
            </div>
          </div>
        )}
        {[['身份已核验', 'ID checked before joining'], ['首次接待前培训', 'Trained before the first trip'], ['预约与聊天留存', 'Bookings & chats on record'], ['行程中一键求助', 'Help is one tap away']].map(([zh, en], i) => (
          <Chip key={zh} f={f} at={T_GATE + 30 + i * 8} icon={ICON.check} zh={zh} en={en} x={1360} y={250 + i * 132} out={1 - push} float={i} />
        ))}
      </div>
      <Stage3D>
        <Phone3D pose={pose} height={height}>
          {scr === 'poi' && <Shot name="en-poi-yuyuan" />}
          {scr === 'driver' && <Shot name="en-driver-card" />}
          {scr === 'friends' && <Shot name="en-friends" />}
          {scr === 'checkout' && <><Shot name="en-checkout" /><Shot name="en-booked" opacity={booked} /></>}
          {scr === 'trip' && <Shot name="en-trip" />}
        </Phone3D>
      </Stage3D>
      <Note f={f} at={70} x={560} y={104} zh="给司机看 · 大字中文地名" en="Show the driver the name in Chinese" size={38} out={1 - gate} />
      <Note f={f} at={T_GATE + 84} x={560} y={104} zh="已预约 · Booked" en="Confirmed by the guide (demo)" size={38} out={leave} color={C.accent} />
      {f < 240 && (
        <div style={{ position: 'absolute', left: lerp(p[0], 1300, ramp(f, T_GATE + 6, T_GATE + 30)) - 80, top: lerp(p[1] - 150, 690, ramp(f, T_GATE + 6, T_GATE + 30)), opacity: ramp(f, 0, 4) * leave,
          transform: `translateY(${-Math.abs(Math.sin(f / 4)) * 10 * (walk > 0 && walk < 1 ? 1 : 0)}px)` }}>
          <Mascot2D expression={f > T_GATE ? 'love' : 'happy'} action={walk > 0 && walk < 1 ? 'guide' : f > T_GATE ? 'wave' : 'idle'} size={160} t={f / 30} />
        </div>
      )}
      {close > 0 && (
        <AbsoluteFill style={{ opacity: close, background: 'linear-gradient(180deg, #F1EEE7 0%, #F7F2E8 100%)' }}>
          <LensCloseup ring={ring} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
