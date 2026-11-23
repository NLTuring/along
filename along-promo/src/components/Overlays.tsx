// Film-wide overlays drawn by Main (scenes do not draw these): bilingual captions, chapter rail,
// sample-data note. Sizes follow aesthetic-rules Q11 (captions ≥56px, auxiliary ≥32px).
import React from 'react';
import { interpolate, Sequence, useCurrentFrame } from 'remotion';
import { CAPTIONS, CHAPTERS, SAMPLE_NOTE } from '../timeline';
import { C, EASE, FONT } from '../tokens';
import { Mascot2D } from './Mascot2D';

const glass = (tone: 'night' | 'day') =>
  tone === 'night'
    ? { background: 'rgba(22,26,33,.62)', color: '#FFFDF8', boxShadow: '0 0 0 1px rgba(255,255,255,.10), 0 10px 30px rgba(0,0,0,.25)' }
    : { background: 'rgba(255,253,248,.80)', color: C.ink, boxShadow: '0 0 0 1px rgba(27,24,19,.07), 0 10px 30px rgba(60,42,20,.12)' };

export const CAPTION_DEFAULTS = { zhSize: 56, enSize: 34, bottom: 44 };

/** One bilingual caption; frame 0 = the caption's first frame, `duration` = how long it shows. */
export const CaptionView: React.FC<{
  zh?: string; en?: string; tone?: 'night' | 'day'; who?: string; duration?: number;
} & Partial<typeof CAPTION_DEFAULTS>> = ({
  zh = '', en = '', tone = 'day', who = '旁白', duration = 90,
  zhSize = CAPTION_DEFAULTS.zhSize, enSize = CAPTION_DEFAULTS.enSize, bottom = CAPTION_DEFAULTS.bottom,
}) => {
  const f = useCurrentFrame();
  const k = Math.min(interpolate(f, [0, 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out }),
    interpolate(f, [duration - 6, duration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const xy = who === '小游';
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{
        ...glass(tone), backdropFilter: 'blur(18px) saturate(1.1)', borderRadius: 26, padding: '14px 36px 16px',
        maxWidth: 1760, display: 'flex', alignItems: 'center', gap: 22,
        opacity: k, transform: `translateY(${(1 - k) * 14}px)`, filter: `blur(${(1 - k) * 6}px)`,
      }}>
        {xy && (
          <div style={{ flex: 'none', width: 74, height: 74, borderRadius: '50%', overflow: 'hidden',
            background: 'radial-gradient(circle at 50% 30%, #FFFDF8, #EFE7D8)', boxShadow: `inset 0 0 0 2px ${C.ink}` }}>
            <Mascot2D avatar expression="happy" action="talk" size={74} />
          </div>
        )}
        <div style={{ textAlign: xy ? 'left' : 'center' }}>
          <div style={{ fontFamily: FONT.sans, fontWeight: 500, fontSize: zhSize, lineHeight: 1.18, letterSpacing: '.01em', whiteSpace: 'nowrap' }}>{zh}</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: enSize, lineHeight: 1.2, marginTop: 4, opacity: 0.82, whiteSpace: 'nowrap' }}>{en}</div>
        </div>
      </div>
    </div>
  );
};

export const Captions: React.FC = () => (
  <>
    {CAPTIONS.map((c, i) => (
      <Sequence key={i} name={`字幕 ${c.zh.slice(0, 8)}`} from={c.from} durationInFrames={c.to - c.from} layout="none">
        <CaptionView zh={c.zh} en={c.en} tone={c.tone} who={c.who} duration={c.to - c.from} />
      </Sequence>
    ))}
  </>
);

export const ChapterRail: React.FC = () => {
  const f = useCurrentFrame();
  const i = CHAPTERS.findIndex((c) => f >= c.from && f < c.to);
  if (i < 0) return null;
  const ch = CHAPTERS[i];
  const inK = interpolate(f, [ch.from, ch.from + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out });
  const first = i === 0 || CHAPTERS[i - 1].to !== ch.from;
  const last = i === CHAPTERS.length - 1 || CHAPTERS[i + 1]?.from !== ch.to;
  const outK = last ? interpolate(f, [ch.to - 10, ch.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const boxK = first ? inK : 1;
  return (
    <div style={{ position: 'absolute', left: 40, top: 34, ...glass(ch.tone), backdropFilter: 'blur(14px)', borderRadius: 22,
      padding: '12px 24px 12px 20px', display: 'flex', alignItems: 'center', gap: 16, opacity: boxK * outK,
      transform: `translateY(${(1 - boxK) * -12}px)` }}>
      <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 40, color: C.accent, lineHeight: 1, width: 44, overflow: 'hidden', height: 42 }}>
        <div style={{ transform: `translateY(${(1 - inK) * 42}px)` }}>{ch.n}</div>
      </div>
      <div style={{ width: 1.5, height: 40, background: ch.tone === 'night' ? 'rgba(255,255,255,.25)' : 'rgba(27,24,19,.18)' }} />
      <div style={{ opacity: inK, transform: `translateX(${(1 - inK) * 10}px)`, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: FONT.serifZh, fontSize: 34, fontWeight: 600 }}>{ch.zh}</span>
        <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 32, opacity: 0.7 }}>{ch.en}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginLeft: 6 }}>
        {CHAPTERS.map((_, j) => (
          <div key={j} style={{ width: j === i ? 22 : 8, height: 8, borderRadius: 4,
            background: j === i ? C.accent : ch.tone === 'night' ? 'rgba(255,255,255,.3)' : 'rgba(27,24,19,.2)' }} />
        ))}
      </div>
    </div>
  );
};

export const SampleNote: React.FC = () => {
  const f = useCurrentFrame();
  if (f < SAMPLE_NOTE.from || f >= SAMPLE_NOTE.to) return null;
  const k = Math.min(interpolate(f, [SAMPLE_NOTE.from + 6, SAMPLE_NOTE.from + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(f, [SAMPLE_NOTE.to - 10, SAMPLE_NOTE.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <div style={{ position: 'absolute', right: 40, top: 40, ...glass('day'), backdropFilter: 'blur(14px)', borderRadius: 999,
      padding: '8px 22px', fontFamily: FONT.sans, fontSize: 32, color: C.body, opacity: k }}>
      画面为 App 示例数据 · <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>Sample data in the app</span>
    </div>
  );
};
