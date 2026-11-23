// Shot plumbing. Each scene is mounted inside <ShotSeq>, which starts `pre` frames early and
// runs `post` frames late. Inside a scene:
//   const f = useShotFrame();   // 0 = the shot's nominal start (negative during pre-roll)
//   const at = useLocal();      // at(cue('X2','落地')) → that cue as a local frame
import React, { createContext, useContext } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { Shot, SHOTS, ShotId } from '../timeline';

const Ctx = createContext<Shot | null>(null);

export const ShotSeq: React.FC<{ shot: Shot; children: React.ReactNode }> = ({ shot, children }) => (
  <Sequence name={shot.label} from={shot.from - shot.pre} durationInFrames={shot.pre + shot.dur + shot.post} layout="none">
    <Ctx.Provider value={shot}>
      <AbsoluteFill style={{ zIndex: shot.z }}>{children}</AbsoluteFill>
    </Ctx.Provider>
  </Sequence>
);

/** Provide a shot's context without a Sequence (the caller already starts at `from - pre`), e.g. the workbench. */
export const ShotScope: React.FC<{ shot: Shot; children: React.ReactNode }> = ({ shot, children }) => (
  <Ctx.Provider value={shot}>{children}</Ctx.Provider>
);

export function useShot(): Shot {
  const s = useContext(Ctx);
  if (!s) throw new Error('useShot outside <ShotSeq>');
  return s;
}

/** Frame relative to the shot's nominal start (negative during pre-roll). */
export function useShotFrame(): number {
  const s = useShot();
  return useCurrentFrame() - s.pre;
}

/** Convert absolute film frames (e.g. from cue()) to this shot's local frame. */
export function useLocal(): (abs: number) => number {
  const s = useShot();
  return (abs: number) => abs - s.from;
}

export const shotById = (id: ShotId) => SHOTS.find((s) => s.id === id)!;
