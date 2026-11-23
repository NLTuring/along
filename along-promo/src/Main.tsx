// The whole film. Only the producing agent renders this; scene owners use their own entry files.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Shots, Overlays, SceneMap } from './lib/makeRoot';
import { S00 } from './scenes/S00';
import { S01 } from './scenes/S01';
import { S02 } from './scenes/S02';
import { S03 } from './scenes/S03';
import { S04 } from './scenes/S04';
import { S05 } from './scenes/S05';
import { S06 } from './scenes/S06';
import { S07 } from './scenes/S07';
import { S08 } from './scenes/S08';
import { S09 } from './scenes/S09';
import { S10 } from './scenes/S10';
import { S11 } from './scenes/S11';

export const SCENES: SceneMap = { S00, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11 };

export const AlongMain: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Shots scenes={SCENES} />
    <Overlays />
  </AbsoluteFill>
);
