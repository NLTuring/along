// S09 网站记忆馆 (absolute 2185–2400; pre-roll from 2165 under S08's six rows; drawn to 2410 under S10).
// The real website recording (museum-browse.mp4, 4K) in a minimal browser window on the dusk sky.
// The camera pushes in until the page fills the frame while the wall turns, then eases back as the
// Bund magnet is taken down so the record, the keepsake in hand and the stamp are all in view.
// The stamp click (browse k = 207) lands on 「收藏」 (2336). From 2350 the seal's ink starts to soak
// outward (T10 pre-phase; S10 continues it from 2366).
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useShot, useShotFrame } from '../lib/shot';
import { Sky } from '../components/Paper';
import { Browser, NOTE1_IN, NOTE2_IN } from './S09/Browser';
import { cam, project, SEAL, STAMP_ABS, PICK_ABS, BROWSE_K0_ABS } from './S09/camera';
import { InkBleed, INK } from './S10/InkBleed';
import CAP from '../../public/web/capture.json';

const FROM = 2185;
const L = (abs: number) => abs - FROM;
export const S09_BEATS = {
  revealed: L(2165), // -20: the window is uncovered by S08's rows (to 2195)
  wallRelease: L(BROWSE_K0_ABS + CAP.browse.release), // -8: the drag lets go, the wall coasts
  note1: L(NOTE1_IN), // 11: 「25 件数字文创」 note lifts off the page
  pageFilled: L(2222), // 37: the push-in fills the frame with the page (then eases back)
  wallSettled: L(BROWSE_K0_ABS + CAP.browse.turnSettled), // 61: the wall snaps onto the Bund magnet
  pick: L(PICK_ABS), // 61: taken down (panel slides in, keepsake to the hand)
  note2: L(NOTE2_IN), // 73: 「拖动转动 · 取下 · 盖章收藏」 note
  turnInHand: L(BROWSE_K0_ABS + CAP.browse.turn), // 97: turned in the hand (back + magnet pocket)
  stamp: L(STAMP_ABS), // 151: the stamp presses (= 「收藏」)
  inkSoak: L(INK.pre), // 165: the seal's ink begins to spread (T10)
};

/** The stamp point on film while the camera is still (2340 →): T10's ink origin. */
export const INK_ORIGIN = (() => { const p = project(cam(2366), SEAL.x, SEAL.y); return { x: p.x, y: p.y }; })();

export const S09: React.FC = () => {
  const s = useShot();
  const lf = useShotFrame() + s.pre; // the Sequence's own frame (0 at 2165)
  const af = lf + s.from - s.pre;
  return (
    <AbsoluteFill>
      <Sky from="dusk" horizon={80} />
      <AbsoluteFill style={{ background: 'radial-gradient(900px 520px at 50% 62%, rgba(255,214,170,.30), rgba(255,214,170,0) 70%)' }} />
      <Browser af={af} lf={lf} />
      {af >= INK.pre && af < INK.reveal && <InkBleed af={af} ox={INK_ORIGIN.x} oy={INK_ORIGIN.y} />}
    </AbsoluteFill>
  );
};
