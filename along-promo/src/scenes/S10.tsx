// S10 文创拼标志 (absolute 2366–2500, above S09).
// T10 (2366–2406): ink-bleed-reveal from the stamp point eats S09; inside it the website's entry
// recording develops (museum-intro.mp4, 4K, UI hidden): the row of small keepsakes, which then fly
// out one by one in the logo's brush order and land face up to spell the Along mark (done 2469).
// The crop camera pushes slowly from the whole hall to the mark (downscaled 4K — sharp), then the
// frame freezes and holds to 2500 (R1, 31 f). S11 opens on the same frozen frame and crop.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useShot, useShotFrame } from '../lib/shot';
import { InkBleed, INK } from './S10/InkBleed';
import { IntroFrame, cropS10, FREEZE_ABS, INTRO_K0_ABS, MARK_DONE_ABS } from './S10/intro';
import { INK_ORIGIN } from './S09';

const FROM = 2366;
const L = (abs: number) => abs - FROM;
const TRIM = FROM - INTRO_K0_ABS; // intro k shown at the Sequence's frame 0 (= 1)
export const S10_BEATS = {
  inkBleed: L(INK.reveal), // 0: ink eats S09 from the stamp point (outward spread to 36)
  inkFull: L(INK.unmask), // 40: fully revealed, mask dropped
  tilesFly: L(INTRO_K0_ABS + 10), // 9: first small keepsake leaves the row (they fly in brush order)
  firstLand: L(INTRO_K0_ABS + 32), // 31: first keepsake lands face up (landings continue to markDone)
  hatDone: L(INTRO_K0_ABS + 55), // 54: the hat (first stroke) is laid
  markDone: L(MARK_DONE_ABS), // 103: last keepsake lands — the Along mark is complete; still to 134
};

export const S10: React.FC = () => {
  const s = useShot();
  const lf = useShotFrame() + s.pre;
  const af = lf + s.from - s.pre;
  const scene = <IntroFrame c={cropS10(af)} lf={lf} trim={TRIM} freezeAt={FREEZE_ABS - FROM} />;
  return (
    <AbsoluteFill>
      {af >= INK.unmask ? scene : <InkBleed af={af} ox={INK_ORIGIN.x} oy={INK_ORIGIN.y}>{scene}</InkBleed>}
    </AbsoluteFill>
  );
};
