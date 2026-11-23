// S11 3D 小游 + 口号 (absolute 2500–2700, the film's last shot; no captions, no chapter rail).
// Opens on S10's frozen last frame (same recording frame, same crop). 小游 (the website's 3D model,
// cel-shaded as in buddy.js) springs up from behind the crown of the mark's hat, turns once in the
// air and lands on the floor to the right of the mark, waving; the crop camera pulls back to make
// room; on X6 「让世界，一起游！」 the slogan is pressed onto the paper word by word, 一起游 in 印泥红
// italic, then the English line. Everything is still from ≈2612 to 2700 (≥2s).
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useShot, useShotFrame } from '../lib/shot';
import { IntroFrame, cropS11, toFilm, FREEZE_K } from './S10/intro';
import { Xiaoyou3D } from './S11/Xiaoyou3D';
import { act, placeVideo, shadowVideo, T } from './S11/motion';
import { Slogan, SLOGAN_RULE, SLOGAN_EN, SLOGAN_SET } from './S11/Slogan';
import { cue } from '../timeline';

const FROM = 2500;
const L = (abs: number) => abs - FROM;
export const S11_BEATS = {
  pop: L(T.pop), // 3: 小游 springs up from behind the hat
  leap: L(T.apex), // 13: leaps forward, turning once in the air
  land: L(T.land), // 26: lands to the right of the mark (squash), waves
  word1: L(cue('X6', '让')), // 43: 「让」 pressed onto the paper
  word2: L(cue('X6', '世界')), // 50: 「世界」
  word3: L(cue('X6', '一起')), // 70: 「一起」 (印泥红 italic)
  word4: L(cue('X6', '游')), // 81: 「游」
  rule: L(SLOGAN_RULE), // 92: accent rule draws under 一起游
  english: L(SLOGAN_EN), // 98: "Let the world travel along." rises
  still: L(SLOGAN_SET), // 112: all set; hold to 200
};

// The space behind the crown of the hat (video px, traced on the frozen frame): while 小游 is
// below this line he is behind the mark.
const HIDE: [number, number][] = [
  [1520, 1300], [1520, 629], [1683, 629], [1683, 573], [1755, 573], [1755, 587], [1960, 587],
  [1960, 573], [2140, 573], [2140, 629], [2390, 629], [2390, 1300],
];

export const S11: React.FC = () => {
  const s = useShot();
  const lf = useShotFrame() + s.pre;
  const af = lf + s.from - s.pre;
  const c = cropS11(af);
  const v = placeVideo(af);
  const feet = toFilm(c, v.x, v.y);
  const pose = { ...act(af), x: feet.x, y: feet.y, h: v.h * c.s };
  const sh = shadowVideo(af);
  const shp = toFilm(c, sh.x, sh.y);
  const clip = af < T.apex
    ? `path(evenodd, "M0 0H1920V1080H0Z M${HIDE.map(([x, y]) => { const p = toFilm(c, x, y); return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join(' L')}Z")`
    : undefined;
  return (
    <AbsoluteFill>
      <IntroFrame c={c} lf={lf} trim={FREEZE_K} freezeAt={0} />
      {sh.op > 0 && (
        <div style={{ position: 'absolute', left: shp.x - (sh.w * c.s) / 2, top: shp.y - sh.w * c.s * 0.13, width: sh.w * c.s, height: sh.w * c.s * 0.26,
          borderRadius: '50%', background: `radial-gradient(closest-side, rgba(60,42,20,${sh.op}), rgba(60,42,20,0))` }} />
      )}
      <Slogan af={af} cx={toFilm(c, 1837, 0).x} top={786} />
      <AbsoluteFill style={{ clipPath: clip }}>
        <Xiaoyou3D pose={pose} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
