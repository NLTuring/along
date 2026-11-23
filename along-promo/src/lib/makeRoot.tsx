// Composition factory. Every composition uses ABSOLUTE film frames: frame N here is frame N of the
// final film, so `npx remotion still src/entry-x.ts <Comp> out.png --frame=N` needs no arithmetic.
//   Range-<name>  : the shots in `ids` (+ overlays) over their whole span
//   Shot-<id>     : one shot alone over the full film length (render only its frames)
import React from 'react';
import { AbsoluteFill, Composition, Sequence, Audio, getInputProps, staticFile } from 'remotion';
import '../fonts';
import { SHOTS, ShotId, TOTAL, FPS, W, H, VO_START, VO_FRAMES, VoId } from '../timeline';
import { ShotSeq } from './shot';
import { Captions, ChapterRail, SampleNote } from '../components/Overlays';
import { SFX, sfxDuration } from '../sfx';

export type SceneMap = Partial<Record<ShotId, React.FC>>;

export const Shots: React.FC<{ scenes: SceneMap; only?: ShotId[] }> = ({ scenes, only }) => (
  <>
    {SHOTS.filter((s) => (!only || only.includes(s.id)) && scenes[s.id]).map((s) => {
      const Scene = scenes[s.id]!;
      return (
        <ShotSeq key={s.id} shot={s}>
          <Scene />
        </ShotSeq>
      );
    })}
  </>
);

// inputProps: {"vo": false} renders without the voice-over (used to measure SFX timing).
const voOn = () => (getInputProps() as { vo?: boolean }).vo !== false;

export const Overlays: React.FC<{ audio?: boolean }> = ({ audio = true }) => (
  <>
    <AbsoluteFill style={{ zIndex: 50, pointerEvents: 'none' }}>
      <ChapterRail />
      <SampleNote />
      <Captions />
    </AbsoluteFill>
    {audio && voOn() &&
      (Object.keys(VO_START) as VoId[]).map((id) => (
        <Sequence key={id} name={`VO ${id}`} from={VO_START[id]} durationInFrames={VO_FRAMES(id) + 6} layout="none">
          <Audio src={staticFile(`vo/${id}.mp3`)} volume={1} />
        </Sequence>
      ))}
    {audio &&
      SFX.map((s, i) => (
        <Sequence key={`sfx${i}`} name={`SFX ${s.label ?? s.src}`} from={s.from} durationInFrames={sfxDuration(s)} layout="none">
          <Audio src={staticFile(`sfx/${s.src}`)} volume={s.volume} />
        </Sequence>
      ))}
  </>
);

export function makeRoot(name: string, scenes: SceneMap, ids: ShotId[], opts: { overlays?: boolean } = {}) {
  const span = SHOTS.filter((s) => ids.includes(s.id));
  const start = Math.min(...span.map((s) => s.from - s.pre));
  const end = Math.max(...span.map((s) => s.from + s.dur + s.post));
  const Range: React.FC = () => (
    <AbsoluteFill style={{ background: '#000' }}>
      <Shots scenes={scenes} only={ids} />
      {opts.overlays !== false && <Overlays audio={false} />}
    </AbsoluteFill>
  );
  const one = (id: ShotId) => {
    const C: React.FC = () => (
      <AbsoluteFill style={{ background: '#000' }}>
        <Shots scenes={scenes} only={[id]} />
      </AbsoluteFill>
    );
    return C;
  };
  const Root: React.FC = () => (
    <>
      <Composition id={`Range-${name}`} component={Range} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
      {ids.map((id) => (
        <Composition key={id} id={`Shot-${id}`} component={one(id)} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
      ))}
    </>
  );
  return { Root, range: [start, end] as const };
}
