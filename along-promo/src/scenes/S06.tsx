// S06 长按拍照 → 发社区 / TikTok（1415–1640）——接 S05 的取景键特写：四只取景角从按钮里弹出、过冲咬合成全屏
// 取景框（fui-hud-moves · reticle-lock-on），光圈从按钮圆心打开露出外滩；对焦框咬住人脸；「拍下」快门白闪
// （shot-transitions · flash-cut）→ 画面缩成拍立得；#话题 打字后 1 帧硬切成胶囊、缩小归位（hashtag-to-pill-materialize）；
// 手机上发到 Along 故事、分享面板 Open TikTok。T7：拍立得沿 Z 轴炸开成 边框 / 照片 / 底座（exploded-view）。
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, staticFile } from 'remotion';
import { useShotFrame } from '../lib/shot';
import { cue, shot } from '../timeline';
import { C, FONT } from '../tokens';
import { Sky } from '../components/Paper';
import { Phone3D, Stage3D } from '../components/Phone3D';
import { Mascot2D } from '../components/Mascot2D';
import { clamp, LensCloseup, lerp, Note, ramp, rect, Shot } from './phone/kit';
import { Magnet, magnetAt } from './phone/magnet';

const FROM = shot('S06').from;
const L = (w: string) => cue('X4', w) - FROM;
const SHUT = L('拍下');
export const S06_BEATS = { corners: 8, iris: 10, focus: 30, shutter: SHUT, polaroid: SHUT + 12, tag1: 90, tag2: 104, tag3: 118, post: 108, tiktok: L('TikTok'), explode: 200 };
export const PHONE67 = { x: -560, y: 0, rx: 2, ry: 16, rz: 0 };
const IMG = { w: 1262, h: 774 }, COV = 1920 / IMG.w, OFFY = (IMG.h * COV - 1080) / 2;
const TAGS = [{ t: '#ChinaTravel', at: 90, slot: 0 }, { t: '#Along', at: 104, slot: 1 }, { t: '#TheBund', at: 118, slot: 2 }];

const Corners: React.FC<{ k: number; o: number; light: number }> = ({ k, o, light }) => {
  const sp = Easing.bezier(0.34, 1.56, 0.64, 1)(Math.min(1, k));
  const x0 = lerp(960 - 108, 70, sp), x1 = lerp(960 + 108, 1850, sp), y0 = lerp(540 - 108, 70, sp), y1 = lerp(540 + 108, 830, sp), arm = lerp(30, 90, sp);
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: o }}>
      {[[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].map(([x, y, sx, sy], i) => (
        <path key={i} d={`M${x + sx * arm} ${y}H${x}V${y + sy * arm}`} fill="none" stroke={light > 0.5 ? '#FFFDF8' : C.ink} strokeWidth={6} strokeLinecap="round" />
      ))}
    </svg>
  );
};

export const S06: React.FC = () => {
  const f = useShotFrame();
  const F = FROM + f;
  const corners = ramp(f, 8, 22, Easing.linear);
  const iris = interpolate(f, [10, 26], [0, 1], { ...clamp, easing: Easing.bezier(0.55, 0, 0.75, 0.35) });
  const flash = interpolate(f, [SHUT, SHUT + 2, SHUT + 12], [0, 1, 0], clamp);
  const shrink = ramp(f, SHUT, SHUT + 16);
  const vfO = interpolate(f, [SHUT + 11, SHUT + 17], [1, 0], clamp);
  const uiO = interpolate(f, [SHUT - 1, SHUT + 4], [1, 0], clamp) * ramp(f, 24, 32);
  const focus = ramp(f, 30, 42, Easing.bezier(0.34, 1.56, 0.64, 1));
  const hold = interpolate(f, [L('长按'), SHUT], [0, 1], clamp);
  // the viewfinder image shrinks into the polaroid's photo area (centre 960+150, 540-60; 600 wide)
  const vs = lerp(1, 600 / 1920, shrink), vx = lerp(0, 1110 - 960, shrink), vy = lerp(0, 480 - 540, shrink);
  const phoneIn = ramp(f, SHUT + 16, SHUT + 36, Easing.bezier(0.2, 0.8, 0.2, 1));
  const scr = f < L('社区') ? 'en-stories' : f < L('TikTok') - 4 ? 'en-story-bund' : 'en-share-bund';
  const tk = rect('en-share-bund', 'tiktok', { x: 20, y: 770, w: 350, h: 52 });
  const pulse = f > L('TikTok') ? 0.5 + 0.5 * Math.sin((f - L('TikTok')) / 3) : 0;
  const out = interpolate(f, [196, 206], [1, 0], clamp);
  const labels = interpolate(F, [1622, 1632, 1644, 1652], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill>
      <Sky from="day" />
      {f < SHUT + 18 && (
        <AbsoluteFill style={{ background: '#F1EEE7', opacity: vfO }}>
          <LensCloseup ring={1} />
          <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${lerp(0, 1150, iris)}px at 960px 540px)`, transformOrigin: '960px 540px',
            transform: `translate(${vx}px, ${vy}px) scale(${vs})`, borderRadius: 26 * shrink }}>
            <Img src={staticFile('img/bund-friends.png')} style={{ position: 'absolute', left: 0, top: -OFFY, width: 1920, height: IMG.h * COV, transform: `scale(${1.12 - 0.07 * ramp(f, 10, SHUT)})`, transformOrigin: '50% 40%' }} />
            <div style={{ opacity: uiO }}>
              <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
                {focus > 0 && (() => { const x = 560 - 60 * (1 - focus), y = 390 - 60 * (1 - focus), w = 800 + 120 * (1 - focus), h = 350 + 120 * (1 - focus);
                  return [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].map(([px, py, sx, sy], i) =>
                    <path key={i} d={`M${px + sx * 40} ${py}H${px}V${py + sy * 40}`} fill="none" stroke="#FFFDF8" strokeWidth={6} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,.5))' }} />); })()}
              </svg>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center' }}>
                <span style={{ padding: '10px 26px', borderRadius: 999, background: 'rgba(27,24,19,.55)', color: '#FFFDF8', fontFamily: FONT.sans, fontSize: 32 }}>外滩 The Bund · 照片 PHOTO</span>
              </div>
              <div style={{ position: 'absolute', left: 960 - 56, top: 690, width: 112, height: 112, borderRadius: '50%', background: 'rgba(255,253,248,.9)', boxShadow: '0 0 0 6px rgba(255,255,255,.4)' }}>
                <svg width={112} height={112} style={{ position: 'absolute', inset: 0 }}>
                  <circle cx={56} cy={56} r={50} fill="none" stroke={C.accent} strokeWidth={6} pathLength={1} strokeDasharray={`${hold} 1`} transform="rotate(-90 56 56)" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ position: 'absolute', left: 1010 + 30, top: 718, fontFamily: FONT.sans, fontSize: 34, color: '#FFFDF8', textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>长按拍摄 · Hold to shoot</div>
            </div>
          </div>
          <Corners k={corners} o={Math.max(uiO, ramp(f, 8, 12) * (1 - ramp(f, SHUT - 1, SHUT + 4)))} light={iris} />
        </AbsoluteFill>
      )}
      <Stage3D>
        <Phone3D pose={{ ...PHONE67, x: lerp(-1300, PHONE67.x, phoneIn) }} height={620}>
          <Shot name={scr} />
          {scr === 'en-share-bund' && <div style={{ position: 'absolute', left: tk.x - 6, top: tk.y - 6, width: tk.w + 12, height: tk.h + 12, borderRadius: 16, boxShadow: `0 0 0 ${3 + 4 * pulse}px rgba(178,74,44,${0.5 + 0.4 * pulse})` }} />}
        </Phone3D>
        {f >= SHUT + 11 && <Magnet m={magnetAt(F)} labels={labels} />}
      </Stage3D>
      {TAGS.map(({ t, at, slot }) => {
        const n = Math.round(interpolate(f, [at, at + 7], [0, t.length], clamp));
        const pill = f >= at + 9, move = ramp(f, at + 13, at + 24);
        if (f < at || out <= 0) return null;
        const x = lerp(1110, 1650, move), y = lerp(480, 250 + slot * 96, move), s = lerp(1, 0.62, move);
        return (
          <div key={t} style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) scale(${s})`, opacity: out, whiteSpace: 'nowrap' }}>
            {pill ? <div style={{ padding: '14px 38px', borderRadius: 999, background: C.accent, color: '#FFFDF8', fontFamily: FONT.serif, fontSize: 64, boxShadow: '0 14px 30px rgba(178,74,44,.3)' }}>{t}</div>
              : <div style={{ fontFamily: FONT.serif, fontSize: 64, color: '#FFFDF8', textShadow: '0 3px 14px rgba(0,0,0,.5)' }}>{t.slice(0, n)}<span style={{ display: 'inline-block', width: 5, height: 60, background: C.accent, marginLeft: 4, verticalAlign: -6 }} /></div>}
          </div>
        );
      })}
      <Note f={f} at={L('社区') + 2} x={560} y={110} zh="发到 Along 故事" en="Post to Stories" out={interpolate(f, [L('TikTok') - 6, L('TikTok')], [1, 0], clamp)} />
      <Note f={f} at={L('TikTok') + 2} x={560} y={110} zh="一键分享 TikTok" en="Share to TikTok" out={out} color={C.accent} />
      {f > SHUT + 20 && (
        <div style={{ position: 'absolute', left: 600, top: 640, opacity: ramp(f, SHUT + 20, SHUT + 30) * out, transform: `translateY(${(1 - ramp(f, SHUT + 20, SHUT + 34, Easing.bezier(0.34, 1.56, 0.64, 1))) * 80}px)` }}>
          <Mascot2D expression="excited" action={f > L('TikTok') ? 'cheer' : 'wave'} size={190} t={f / 30} />
        </div>
      )}
      {flash > 0 && <AbsoluteFill style={{ background: '#FFFFFF', opacity: flash }} />}
    </AbsoluteFill>
  );
};
