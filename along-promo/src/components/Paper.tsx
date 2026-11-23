// Backgrounds: the product's sky gradient over paper, with a fixed paper grain.
import React from 'react';
import { AbsoluteFill, interpolateColors, staticFile } from 'remotion';
import { SKY, SkyState } from '../tokens';

/** Paper grain overlay (static texture, seeded — public/img/paper-grain.png). */
export const Grain: React.FC<{ opacity?: number; scale?: number }> = ({ opacity = 0.5, scale = 1 }) => (
  <AbsoluteFill style={{ backgroundImage: `url(${staticFile('img/paper-grain.png')})`, backgroundSize: `${512 * scale}px`, opacity, mixBlendMode: 'multiply', pointerEvents: 'none' }} />
);

/** Sky gradient (top → horizon) like the app's `.sky`. `mix` blends from one state to another (0..1). */
export const Sky: React.FC<{ from: SkyState; to?: SkyState; mix?: number; horizon?: number; grain?: number }> = ({
  from, to, mix = 0, horizon = 78, grain = 0.45,
}) => {
  const a = SKY[from], b = SKY[to ?? from];
  const top = interpolateColors(mix, [0, 1], [a.top, b.top]);
  const hor = interpolateColors(mix, [0, 1], [a.horizon, b.horizon]);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${top} 0%, ${hor} ${horizon}%, ${hor} 100%)` }}>
      {grain > 0 && <Grain opacity={grain} />}
    </AbsoluteFill>
  );
};

/** Plain paper sheet colour with grain. */
export const PaperBg: React.FC<{ color?: string; grain?: number }> = ({ color = '#F7F2E8', grain = 0.5 }) => (
  <AbsoluteFill style={{ background: color }}>
    <Grain opacity={grain} />
  </AbsoluteFill>
);
