// S03 手机与小游（650–905；615 起在 S02 撕开的护照下面）——黎明转白天，3D 手机升起（App「行程」首页）；
// 小游从屏幕里跳出来挥手，九国语言问候环绕（radial-ripple-phone-chips：四层同心圆错相呼吸 + chip 弹簧 pop）；
// 导航 / 翻译 / 行程 三枚 chip 钉旁白；小游助手面板 → 长按说话的声纹胶囊（voice-waveform-live）→
// 说到「翻译」时长虹玻璃扫过屏幕，中文界面换成英文（App 本机指令「切换成英文」）。T3：小游起跳、手机转一整圈。
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { useShotFrame } from '../lib/shot';
import { cue, shot } from '../timeline';
import { C, FONT } from '../tokens';
import { Sky } from '../components/Paper';
import { Phone3D, Stage3D, SoftShadow } from '../components/Phone3D';
import { Mascot2D } from '../components/Mascot2D';
import { Chip, clamp, ICON, Note, ramp, ReededSwap, Shot, SPRING, VoicePill } from './phone/kit';
import { flipDeg, phonePose, xyPose } from './phone/rig';

const FROM = shot('S03').from;
const at = (vo: 'X1', w: string, n = 0) => cue(vo, w, n) - FROM;
export const S03_BEATS = { rise: -35, jump: at('X1', '你好'), chip1: at('X1', '导航'), chip2: at('X1', '翻译'), chip3: at('X1', '行程'), voice: 100, swap: at('X1', '翻译'), hop: 234, flip: 230 };
const HELLO: [string, number, number, number][] = [
  ['你好', 920, 430, 0], ['Hello', 1130, 350, 2], ['こんにちは', 1370, 400, 4], ['안녕하세요', 1470, 560, 6], ['Bonjour', 1440, 720, 8],
  ['Hola', 960, 300, 10], ['Hallo', 1300, 285, 12], ['Привет', 1580, 470, 14], ['مرحبا', 1560, 330, 16],
];

/** 小游 with a contact shadow; (x, y) = centre-bottom. Shared with S04. */
export const XiaoYou: React.FC<{ F: number; f: number }> = ({ F, f }) => {
  const p = xyPose(F);
  if (p.o <= 0) return null;
  const h = p.size * (200 / 212);
  return (
    <>
      <div style={{ position: 'absolute', left: p.x - p.size * 0.32, top: p.y - 10, width: p.size * 0.64, height: 22, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(40,28,14,.28), rgba(40,28,14,0))', opacity: p.o }} />
      <div style={{ position: 'absolute', left: p.x - p.size / 2, top: p.y - h, opacity: p.o, transform: `rotate(${p.rot}deg)`, transformOrigin: '50% 100%' }}>
        <Mascot2D expression={p.e} action={p.a} size={p.size} talk={p.talk} t={f / 30} />
      </div>
    </>
  );
};

export const S03: React.FC = () => {
  const f = useShotFrame();
  const F = FROM + f;
  const { pose, height } = phonePose(F);
  const sky = interpolate(f, [-35, 20], [0, 1], clamp);
  const jump = S03_BEATS.jump, swap = S03_BEATS.swap;
  const sheet = ramp(f, jump + 22, jump + 34);
  const cmd = ramp(f, 86, 96);
  const reed = interpolate(f, [swap - 2, swap + 14], [0, 1], clamp);
  const helloOut = interpolate(f, [92, 102], [1, 0], clamp);
  const sideOut = interpolate(f, [228, 240], [1, 0], clamp);
  const voiceOut = interpolate(f, [swap + 18, swap + 30], [1, 0], clamp);
  const talk = (g: number) => interpolate(g, [104, 109, 127, 132], [0, 1, 1, 0], clamp);
  const ripple = ramp(f, jump - 6, jump + 24) * sideOut;
  return (
    <AbsoluteFill>
      <Sky from="dawn" to="day" mix={sky} />
      {/* four breathing rings behind 小游 and the phone */}
      {[1500, 1120, 780, 470].map((d, i) => {
        const b = 1 + 0.025 * Math.sin(f / 22 + i * 1.3);
        return <div key={d} style={{ position: 'absolute', left: 1080 - (d * b) / 2, top: 560 - (d * b) / 2, width: d * b, height: d * b, borderRadius: '50%',
          background: ['#EFE6D6', '#EADFCB', '#E5D7C0', '#DFCFB5'][i], opacity: ripple * 0.75, boxShadow: 'inset 0 2px 0 rgba(255,255,255,.55)' }} />;
      })}
      <SoftShadow x={960 + pose.x!} y={540 + pose.y! + height / 2 + 6} w={400} opacity={0.26} />
      <Stage3D>
        <Phone3D pose={pose} height={height}>
          {flipDeg(F) < 270 && (
            <ReededSwap t={reed}
              from={<><Shot name="zh-trip" /><Shot name="zh-assistant" opacity={sheet} /><Shot name="zh-assistant-cmd" opacity={cmd} /></>}
              to={<Shot name="en-assistant-translate" />} />
          )}
        </Phone3D>
      </Stage3D>
      {HELLO.map(([w, x, y, d]) => {
        const k = ramp(f, jump + 8 + d, jump + 22 + d, SPRING);
        const o = Math.min(1, k * 3) * helloOut;
        return o > 0 ? (
          <div key={w} style={{ position: 'absolute', left: x, top: y + Math.sin(f / 12 + d) * 5, transform: `translate(-50%,-50%) scale(${0.7 + 0.3 * k})`, opacity: o,
            padding: '10px 24px', borderRadius: 999, background: 'rgba(255,253,248,.92)', boxShadow: '0 10px 24px rgba(60,42,20,.14)',
            fontFamily: w === 'Hello' || w === 'Hola' || w === 'Hallo' || w === 'Bonjour' ? FONT.serif : FONT.sans, fontSize: 38, color: C.ink, whiteSpace: 'nowrap' }}>{w}</div>
        ) : null;
      })}
      <XiaoYou F={F} f={f} />
      <Chip f={f} at={S03_BEATS.chip1 - 2} icon={ICON.go} zh="导航" en="Directions" x={1430} y={300} out={sideOut} />
      <Chip f={f} at={S03_BEATS.chip2 - 2} icon={ICON.translate} zh="翻译" en="Translate" x={1430} y={430} out={sideOut} float={2} />
      <Chip f={f} at={S03_BEATS.chip3 - 2} icon={ICON.trip} zh="行程" en="Trip plan" x={1430} y={560} out={sideOut} float={4} />
      <VoicePill f={f} at={100} talk={talk} text="「切换成英文」 Switch to English" x={960} y={110} w={640} out={voiceOut} />
      <Note f={f} at={swap + 16} x={1430} y={700} zh="说一句，App 就去办" en="Say it, the app does it" size={40} out={sideOut} />
    </AbsoluteFill>
  );
};
