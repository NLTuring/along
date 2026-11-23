// The browser window carrying the real museum recording, posed by camera.ts, with page-space
// 3D annotations (aesthetic-rules C3: same 3D space, translateZ lift + cast shadow, serif + marker).
import React from 'react';
import { Freeze, Img, OffthreadVideo, Sequence, staticFile } from 'remotion';
import { C, EASE, FONT } from '../../tokens';
import { ramp } from '../S08/kit';
import { cam, Cam, CHROME_H, PAGE_W, PAGE_H, PERSP, BROWSE_K0_ABS, BROWSE_LAST } from './camera';

const S09_FROM_PRE = 2165; // S09 sequence start (from - pre)
export const NOTE1_IN = 2196, NOTE2_IN = 2258; // the two page notes lift off
const LEAD = S09_FROM_PRE - BROWSE_K0_ABS; // browse frame at the sequence's frame 0 (negative: hold frame 0 first)
const TRIM = Math.max(0, LEAD), HOLD0 = Math.max(0, -LEAD);

const Chrome: React.FC = () => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: PAGE_W, height: CHROME_H,
    background: 'linear-gradient(180deg, #EFE8DC, #E7DFD1)', boxShadow: 'inset 0 -1px 0 rgba(27,24,19,.10)' }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ position: 'absolute', left: 34 + i * 34, top: CHROME_H / 2 - 10, width: 20, height: 20, borderRadius: '50%',
        background: ['#D9CBB6', '#D9CBB6', '#D9CBB6'][i], boxShadow: 'inset 0 0 0 1.5px rgba(27,24,19,.12)' }} />
    ))}
    <div style={{ position: 'absolute', left: (PAGE_W - 680) / 2, top: 12, height: CHROME_H - 12, width: 680, borderRadius: '18px 18px 0 0',
      background: C.surface, boxShadow: '0 -1px 0 rgba(27,24,19,.06), 0 0 0 1px rgba(27,24,19,.05)', display: 'flex', alignItems: 'center', padding: '0 26px', gap: 16 }}>
      <Img src={staticFile('img/apk/brand/app-icon.png')} style={{ width: 44, height: 44, borderRadius: 11 }} />
      {/* 46 CSS px → ≥32 px on film from the window's smallest size (Z 0.7) */}
      <span style={{ fontFamily: FONT.sans, fontWeight: 500, fontSize: 46, color: C.ink, whiteSpace: 'nowrap' }}>Along 一起游 · 记忆馆</span>
      <svg width={26} height={26} viewBox="0 0 24 24" style={{ marginLeft: 'auto' }} fill="none" stroke={C.mutedStrong} strokeWidth={2} strokeLinecap="round">
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    </div>
  </div>
);

/** A page-space note floating `lift` px off the page, with its shadow left on the page. */
const Note: React.FC<{ c: Cam; x: number; y: number; w: number; k: number; children: React.ReactNode }> = ({ c, x, y, w, k, children }) => {
  if (k <= 0) return null;
  const lift = 46 * k;
  const left = x * c.Z, top = (y + CHROME_H) * c.Z, width = w * c.Z;
  const body = (style: React.CSSProperties) => (
    <div style={{ position: 'absolute', left, top, width, textAlign: 'center', zoom: 1, ...style }}>
      <div style={{ fontSize: 48 * c.Z, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{children}</div>
    </div>
  );
  return (
    <>
      {body({ transform: `translate(${10 * k}px, ${18 * k}px)`, filter: `blur(${6 * c.Z}px)`, opacity: 0.32 * k, color: 'rgba(60,42,20,1)',
        fontFamily: FONT.serifZh, fontWeight: 700 })}
      {body({ transform: `translateZ(${lift}px)`, opacity: k, color: C.ink, fontFamily: FONT.serifZh, fontWeight: 600 })}
    </>
  );
};
const Mark: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span style={{ fontWeight: 800, background: `linear-gradient(transparent 58%, ${color} 58%, ${color} 92%, transparent 92%)`, padding: '0 .12em' }}>{children}</span>
);

export const Browser: React.FC<{ af: number; lf: number }> = ({ af, lf }) => {
  const c = cam(af);
  const n1 = Math.min(ramp(af, NOTE1_IN, NOTE1_IN + 14, EASE.out), 1 - ramp(af, 2232, 2242));
  const n2 = Math.min(ramp(af, NOTE2_IN, NOTE2_IN + 14, EASE.out), 1 - ramp(af, 2344, 2352));
  const frozen = lf >= BROWSE_LAST - LEAD;
  const atStart = lf < HOLD0;
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: PERSP, perspectiveOrigin: '50% 50%' }}>
      <div style={{
        position: 'absolute', left: c.wx - c.w / 2, top: c.wy - c.h / 2, width: c.w, height: c.h, transformStyle: 'preserve-3d',
        transform: `rotateX(${c.rx.toFixed(3)}deg) rotateY(${c.ry.toFixed(3)}deg)`,
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: PAGE_W, height: PAGE_H + CHROME_H, zoom: c.Z, borderRadius: 26, overflow: 'hidden',
          background: '#E6D6CA', boxShadow: '0 40px 90px rgba(60,42,20,.30), 0 6px 18px rgba(60,42,20,.16), 0 0 0 1px rgba(27,24,19,.08)' }}>
          <Chrome />
          <div style={{ position: 'absolute', left: 0, top: CHROME_H, width: PAGE_W, height: PAGE_H }}>
            <Freeze frame={atStart ? HOLD0 : BROWSE_LAST - LEAD} active={frozen || atStart}>
              <Sequence from={HOLD0} layout="none">
                <OffthreadVideo src={staticFile('web/museum-browse.mp4')} trimBefore={TRIM} muted
                  style={{ position: 'absolute', left: 0, top: 0, width: PAGE_W, height: PAGE_H, display: 'block' }} />
              </Sequence>
            </Freeze>
          </div>
        </div>
        <Note c={c} x={480} y={196} w={960} k={n1}>
          <Mark color="rgba(217,164,65,.55)">25 件数字文创</Mark> · 与 App 同一套浮雕算法
        </Note>
        <Note c={c} x={1009} y={166} w={720} k={n2}>
          拖动转动 · 取下 · <Mark color="rgba(178,74,44,.30)">盖章收藏</Mark>
        </Note>
      </div>
    </div>
  );
};
