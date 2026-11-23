// paper-title-card (demos/typography/paper-title-card/PaperTitleCard.tsx): the slogan pressed onto the
// paper (the hall's floor) word by word on 小游's own voice — scale 1.28→1 + blur 7→0 + opacity,
// 9f, bezier(.2,.75,.3,1); exactly one accent: 一起游 in 印泥红 italic; a short accent rule closes it;
// the English line rises after. No stamp motion (S09 used the stamp).
import React from 'react';
import { cue, cueEnd } from '../../timeline';
import { C, FONT } from '../../tokens';
import { ramp, E } from '../S08/kit';

const W = [
  { t: '让', at: cue('X6', '让') },
  { t: '世界', at: cue('X6', '世界') },
  { t: '一起', at: cue('X6', '一起'), accent: true },
  { t: '游', at: cue('X6', '游'), accent: true },
];
export const SLOGAN_RULE = cueEnd('X6', '游') + 2; // 2592
export const SLOGAN_EN = SLOGAN_RULE + 6; // 2598
export const SLOGAN_SET = SLOGAN_EN + 14; // everything still from here to 2700

const press = (af: number, at: number) => ramp(af, at, at + 9, E.press);
const word = (af: number, w: (typeof W)[number]) => {
  const k = press(af, w.at);
  return (
    <span key={w.t} style={{ display: 'inline-block', opacity: k, transform: `scale(${1.28 - 0.28 * k})`, filter: `blur(${((1 - k) * 7).toFixed(2)}px)` }}>
      {w.t}
    </span>
  );
};
// letterpress: a hairline of light under the stroke, a warm shade above
const PRESSED = '0 1.5px 0 rgba(255,250,240,.55), 0 -1px 0 rgba(60,42,20,.25)';

export const Slogan: React.FC<{ af: number; cx: number; top: number }> = ({ af, cx, top }) => {
  const rule = ramp(af, SLOGAN_RULE, SLOGAN_RULE + 18, E.inOutCubic);
  const en = ramp(af, SLOGAN_EN, SLOGAN_EN + 14, E.outCubic);
  return (
    <div style={{ position: 'absolute', left: cx - 700, width: 1400, top, textAlign: 'center' }}>
      <div style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 124, lineHeight: 1, color: C.ink, letterSpacing: '.04em', textShadow: PRESSED,
        display: 'flex', justifyContent: 'center', alignItems: 'baseline' }}>
        {word(af, W[0])}
        {word(af, W[1])}
        <span style={{ position: 'relative', display: 'inline-flex', color: C.accent, fontStyle: 'italic', marginLeft: '.12em' }}>
          {word(af, W[2])}
          {word(af, W[3])}
          <span style={{ position: 'absolute', left: '50%', bottom: -20, width: 220, height: 6, marginLeft: -110, borderRadius: 3, background: C.accent,
            transform: `scaleX(${rule})` }} />
        </span>
      </div>
      <div style={{ marginTop: 40, fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 50, lineHeight: 1.2, color: C.body, opacity: en,
        transform: `translateY(${(1 - en) * 14}px)`, filter: `blur(${((1 - en) * 4).toFixed(2)}px)` }}>
        Let the world travel along.
      </div>
    </div>
  );
};
