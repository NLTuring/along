// The website's entry recording (museum-intro.mp4, 3840×2160, UI chrome hidden), framed by a crop
// camera: s = film px per video px (≤ 0.64, so the 4K source is always downscaled — sharp), (cx, cy)
// = video px at the frame centre. Shared by S10 and S11 so the hard cut at 2500 matches exactly.
import React from 'react';
import { Freeze, OffthreadVideo, staticFile } from 'remotion';
import CAP from '../../../public/web/capture.json';
import { E, lerp, ramp } from '../S08/kit';

export const VW = 3840, VH = 2160;
export const FLOOR = '#D1BAA6'; // the hall floor at dusk, measured on the frozen frame
// intro frame k = page time (k+1)/30 s; the mark is complete at k = 104 (3.5 s) and still until 4.3 s.
export const INTRO_K0_ABS = 2365; // film frame showing intro k = 0 → mark done at 2469 (≈2471)
export const MARK_DONE_ABS = INTRO_K0_ABS + Math.round(CAP.intro.markDoneSec * 30 - 1); // 2469
export const FREEZE_K = 112; // a frame inside the still span (k 104–128, measured PSNR > 73 dB)
export const FREEZE_ABS = INTRO_K0_ABS + FREEZE_K; // 2477

export type Crop = { s: number; cx: number; cy: number };
export const CROP_WIDE: Crop = { s: 0.5, cx: 1920, cy: 1080 }; // the whole recording
export const CROP_MARK: Crop = { s: 0.64, cx: 1830, cy: 1070 }; // S10 end = S11 start (mark ≈ 1505 px wide)
export const CROP_CARD: Crop = { s: 0.52, cx: 1890, cy: 1120 }; // S11 end card: mark up and a little left, room for slogan + 小游

/** S10: slow push from the whole hall to the mark while it assembles (2366–2468), then still. */
export const cropS10 = (af: number): Crop => {
  const k = ramp(af, 2366, MARK_DONE_ABS, E.inOutSine);
  return { s: lerp(CROP_WIDE.s, CROP_MARK.s, k), cx: lerp(CROP_WIDE.cx, CROP_MARK.cx, k), cy: lerp(CROP_WIDE.cy, CROP_MARK.cy, k) };
};
/** S11: the S10 framing holds (mark still 2469–2503, R1), then pulls back for the slogan while 小游 jumps. */
export const S11_PULL = [2503, 2540];
export const cropS11 = (af: number): Crop => {
  const k = ramp(af, S11_PULL[0], S11_PULL[1], E.inOutCubic);
  return { s: lerp(CROP_MARK.s, CROP_CARD.s, k), cx: lerp(CROP_MARK.cx, CROP_CARD.cx, k), cy: lerp(CROP_MARK.cy, CROP_CARD.cy, k) };
};
/** Video px → film px under a crop. */
export const toFilm = (c: Crop, x: number, y: number) => ({ x: 960 + (x - c.cx) * c.s, y: 540 + (y - c.cy) * c.s });

/** The recording under a crop. `lf` = the Sequence's local frame; `trim` = intro k at lf 0. */
export const IntroFrame: React.FC<{ c: Crop; lf: number; trim: number; freezeAt?: number }> = ({ c, lf, trim, freezeAt }) => {
  const w = VW * c.s, h = VH * c.s;
  const frozen = freezeAt !== undefined && lf >= freezeAt;
  return (
    <div style={{ position: 'absolute', inset: 0, background: FLOOR, overflow: 'hidden' }}>
      <Freeze frame={freezeAt ?? 0} active={frozen}>
        <OffthreadVideo src={staticFile('web/museum-intro.mp4')} trimBefore={trim} muted
          style={{ position: 'absolute', left: 960 - c.cx * c.s, top: 540 - c.cy * c.s, width: w, height: h, display: 'block' }} />
      </Freeze>
    </div>
  );
};
