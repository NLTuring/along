import React from 'react';
import { Composition } from 'remotion';
import './fonts';
import { AlongMain } from './Main';
import { FoundationTest } from './FoundationTest';
import { FPS, H, TOTAL, W } from './timeline';

export const Root: React.FC = () => (
  <>
    <Composition id="AlongPromo" component={AlongMain} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="FoundationTest" component={FoundationTest} durationInFrames={120} fps={FPS} width={W} height={H} />
  </>
);
