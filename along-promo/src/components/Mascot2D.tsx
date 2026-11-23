// 小游 (Along), the app's own SVG character (src/vendor/assistant-mascot.js, copied from the APK).
// The app animates him with CSS keyframes; here every pose is computed from the frame so renders
// are deterministic. Keyframe values are the app's own (css/assistant.css).
import React, { useId } from 'react';
import { useCurrentFrame } from 'remotion';
// Plain JS module copied from the APK.
import { ensureMascotDefs, mascotSvg } from '../vendor/assistant-mascot.js';

export type Expression = 'normal' | 'happy' | 'wink' | 'surprised' | 'excited' | 'love' | 'thinking' | 'sleepy' | 'sorry' | 'proud';
export type Action = 'idle' | 'wave' | 'talk' | 'listen' | 'think' | 'nod' | 'guide' | 'jump' | 'cheer';

const BASE = `
svg.xy { display:block; width:100%; height:auto; overflow:visible; }
svg.xy :is(.p-all,.p-body,.p-armL,.p-armR,.p-head,.p-shadow,.p-tail,.eyes,.mouth,.pr-pin,.pr-spark g,.pr-heart g) { transform-box: fill-box; }
svg.xy .p-all, svg.xy .p-body { transform-origin: 50% 100%; }
svg.xy .p-armL { transform-origin: 85% 18%; }
svg.xy .p-armR { transform-origin: 15% 18%; }
svg.xy .p-head { transform-origin: 50% 92%; }
svg.xy .p-tail { transform-origin: 20% 0%; }
svg.xy .p-shadow, svg.xy .eyes, svg.xy .pr-spark g, svg.xy .pr-heart g { transform-origin: 50% 50%; }
svg.xy .mouth { transform-origin: 50% 35%; }
svg.xy .eye, svg.xy .mouth, svg.xy .brow, svg.xy .prop { display: none; }
svg.xy[data-e=normal] .e-normal, svg.xy[data-e=happy] .e-happy, svg.xy[data-e=wink] .e-wink, svg.xy[data-e=surprised] .e-round, svg.xy[data-e=excited] .e-star, svg.xy[data-e=love] .e-heart, svg.xy[data-e=thinking] .e-look, svg.xy[data-e=sleepy] .e-sleepy, svg.xy[data-e=sorry] .e-normal, svg.xy[data-e=proud] .e-happy { display: inline; }
svg.xy[data-e=normal] .m-smile, svg.xy[data-e=happy] .m-grin, svg.xy[data-e=wink] .m-smile, svg.xy[data-e=surprised] .m-o, svg.xy[data-e=excited] .m-grin, svg.xy[data-e=love] .m-smile, svg.xy[data-e=thinking] .m-flat, svg.xy[data-e=sleepy] .m-o-small, svg.xy[data-e=sorry] .m-sad, svg.xy[data-e=proud] .m-smirk { display: inline; }
svg.xy[data-e=sorry] .b-sad, svg.xy[data-e=surprised] .b-up, svg.xy[data-e=thinking] .b-think, svg.xy[data-e=proud] .b-proud { display: inline; }
svg.xy[data-e=sorry] .blush { opacity: .45; }
svg.xy[data-a=think] .pr-dots, svg.xy[data-a=guide] .pr-pin, svg.xy[data-a=listen] .pr-wave, svg.xy[data-a=cheer] .pr-spark, svg.xy[data-e=excited] .pr-spark, svg.xy[data-e=love] .pr-heart { display: inline; }
svg.xy--avatar :is(.p-armL,.p-armR,.p-shadow,.prop) { display: none; }
`;

// Piecewise-linear keyframes over a looping cycle; stops = [[pct, value], ...].
function kf(t: number, period: number, stops: [number, number][], offset = 0): number {
  const p = ((((t + offset) / period) % 1) + 1) % 1 * 100;
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, va] = stops[i], [b, vb] = stops[i + 1];
    if (p >= a && p <= b) {
      const k = b === a ? 0 : (p - a) / (b - a);
      const e = k * k * (3 - 2 * k); // ease-in-out between stops
      return va + (vb - va) * e;
    }
  }
  return stops[stops.length - 1][1];
}

export const Mascot2D: React.FC<{
  expression?: Expression;
  action?: Action;
  size?: number; // rendered width in px
  talk?: boolean; // mouth flaps regardless of action
  phase?: number; // seconds offset, to de-sync two mascots
  t?: number; // override time in seconds (default: from the current frame)
  avatar?: boolean; // face-only crop
  style?: React.CSSProperties;
}> = ({ expression = 'happy', action = 'idle', size = 220, talk = false, phase = 0, t, avatar = false, style }) => {
  const frame = useCurrentFrame();
  const time = (t ?? frame / 30) + phase;
  ensureMascotDefs(document);
  const cls = 'xy' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const rules: string[] = [];
  const set = (sel: string, tr: string) => rules.push(`.${cls} ${sel}{transform:${tr}}`);
  set('.p-tail', `rotate(${kf(time, 3.2, [[0, 0], [50, 7], [100, 0]])}deg)`);
  const blinkFree = ['sleepy', 'happy', 'proud', 'love', 'excited'].includes(expression);
  if (!blinkFree) set('.eyes', `scaleY(${kf(time, 5.2, [[0, 1], [93, 1], [95.5, 0.08], [100, 1]])})`);
  if (action === 'idle') {
    set('.p-body', `scale(${kf(time, 3.6, [[0, 1], [50, 1.018], [100, 1]])},${kf(time, 3.6, [[0, 1], [50, 0.985], [100, 1]])})`);
    set('.p-head', `rotate(${kf(time, 7, [[0, 0], [30, -2.5], [70, 2], [100, 0]])}deg)`);
  }
  if (action === 'wave') set('.p-armR', `rotate(${kf(time, 1.1, [[0, -104], [45, -140], [100, -104]])}deg)`);
  if (action === 'guide') set('.p-armR', 'rotate(-96deg)');
  if (action === 'talk' || action === 'listen') set('.p-head', `rotate(${kf(time, 2.4, [[0, 0], [50, 5], [100, 0]])}deg)`);
  if (action === 'talk' || talk) set('.mouth', `scaleY(${Math.floor(time / 0.19) % 2 ? 0.45 : 1})`);
  if (action === 'think') set('.p-head', `rotate(${kf(time, 3.4, [[0, -8], [50, -4], [100, -8]])}deg)`);
  if (action === 'nod') set('.p-head', `rotate(${kf(time, 1.1, [[0, 0], [35, 3], [65, 0], [100, 0]])}deg) translateY(${kf(time, 1.1, [[0, 0], [35, 5], [65, 0], [100, 0]])}px)`);
  if (action === 'guide') set('.pr-pin', `translateY(${kf(time, 1.5, [[0, 0], [50, -7], [100, 0]])}px)`);
  if (action === 'jump' || action === 'cheer') {
    const ty = kf(time, 1.15, [[0, 0], [14, 0], [44, -30], [62, -30], [82, 0], [100, 0]]);
    const sx = kf(time, 1.15, [[0, 1], [14, 1.07], [44, 0.95], [62, 1], [82, 1.06], [100, 1]]);
    const sy = kf(time, 1.15, [[0, 1], [14, 0.9], [44, 1.06], [62, 1], [82, 0.93], [100, 1]]);
    set('.p-all', `translateY(${ty}px) scale(${sx},${sy})`);
  }
  if (action === 'cheer' || expression === 'excited') {
    rules.push(`.${cls} .pr-spark g{opacity:${kf(time, 1.4, [[0, 0.15], [50, 1], [100, 0.15]])};transform:scale(${kf(time, 1.4, [[0, 0.6], [50, 1.1], [100, 0.6]])})}`);
  }
  const svg = (mascotSvg({ expression, action, crop: avatar ? 'avatar' : 'full', live: false }) as string).replace('class="xy', `class="xy ${cls}`);
  return (
    <div style={{ width: size, ...style }}>
      <style>{BASE + rules.join('\n')}</style>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
};
