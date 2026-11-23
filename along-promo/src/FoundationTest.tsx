// Visual check of the shared components (stands in for the styleframe).
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Sky } from './components/Paper';
import { Phone3D, Screen, Stage3D, SoftShadow } from './components/Phone3D';
import { Mascot2D } from './components/Mascot2D';
import { LogoInk } from './components/LogoInk';
import { C, FONT } from './tokens';

export const FoundationTest: React.FC = () => {
  const f = useCurrentFrame();
  const ry = interpolate(f, [0, 120], [-35, 35]);
  return (
    <AbsoluteFill>
      <Sky from="day" />
      <SoftShadow x={1000} y={960} w={420} />
      <Stage3D>
        <Phone3D pose={{ x: 40, y: 0, rx: 6, ry }} height={820}>
          <Screen src="img/apk/window/shanghai-pearl-day.jpg" style={{ objectFit: 'cover' }} />
        </Phone3D>
      </Stage3D>
      <div style={{ position: 'absolute', left: 1380, top: 520 }}>
        <Mascot2D expression="happy" action="wave" size={300} />
      </div>
      <div style={{ position: 'absolute', left: 120, top: 220 }}>
        <LogoInk progress={interpolate(f, [0, 80], [0, 1], { extrapolateRight: 'clamp' })} settle={interpolate(f, [80, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} width={560} />
        <div style={{ fontFamily: FONT.serif, fontSize: 96, color: C.ink, marginTop: 40, lineHeight: 1.05 }}>
          让世界<em style={{ color: C.accent }}>一起游</em>
        </div>
        <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 40, color: C.mutedStrong, marginTop: 10 }}>Let the world travel along.</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 36, color: C.body, marginTop: 30 }}>中文无衬线 Noto Sans SC · 0123456789 · 24.1%</div>
      </div>
    </AbsoluteFill>
  );
};
