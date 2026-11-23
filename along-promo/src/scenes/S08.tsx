// S08 对接国际旅行社 (absolute 1915–2185, pre-roll from 1900 under S07, out by 2195).
// Dusk. S07's powder turns back from the top-right and settles into the network's seeds; the
// left column (overseas agencies, all generic, no names/logos) lights up on 「国际旅行社」, the
// curves grow on 「入境游」, pulses pour in on 「更多」, the hub opens into a porthole on 「山水」,
// and T9: the porthole fills the frame and its six rows slide away to uncover S09.
// Cards: bezier-source-converge-merge (curves draw-on, pulses on the true curve) +
// integration-hub-map (comet pulses inside light tubes, one receive ripple).
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useShotFrame, useShot } from '../lib/shot';
import { Sky } from '../components/Paper';
import { C, EASE, FONT } from '../tokens';
import { ramp } from './S08/kit';
import { B, HUB } from './S08/layout';
import { Dust } from './S08/Dust';
import { Curves, SourceCards, ServiceChips, ColumnHeads, leftOn, rightOn } from './S08/Network';
import { Roadmap, PlanPill } from './S08/Roadmap';
import { Hub, coveredAt } from './S08/Porthole';

const FROM = 1915;
const L = (abs: number) => abs - FROM;
export const S08_BEATS = {
  dustReturn: L(B.dust0), // -15: powder turns back from the top-right
  dustSettled: L(B.dustLast), // 43: last speck lands in a seed
  logoWrite: L(B.logo), // 49: Along mark writes itself in the hub
  leftLight: L(B.left), // 85: three agency cards light up (staggered 0/5/9f)
  curvesGrow: L(B.curvesL), // 114: curves draw on (left, then right +12f)
  pulsesPour: L(B.pulse), // 156: comet pulses pour into the hub
  hubRipple: L(B.ripple), // 182: first pulse reaches the hub (one ripple)
  roadmap: L(B.roadmap), // 163: roadmap draws, steps pop at +4/+13/+20
  portholeOpen: L(B.open), // 219: hub turns into a porthole, shade lifts
  windowTurn: L(B.turn), // 231: porthole turns A → B (six rows)
  windowGrow: L(B.grow), // 241: porthole grows to fill the frame
  slatsOut: L(B.slats), // 253: T9 six full-screen rows slide away (to 280)
};

export const S08: React.FC = () => {
  const s = useShot();
  const af = useShotFrame() + s.from; // absolute film frame
  const covered = coveredAt(af);
  const hk = ramp(af, B.header, B.header + 12, EASE.out);
  const glow = ramp(af, B.hubDisc, B.hubDisc + 30);
  const seedHidden = (i: number) =>
    i < 3 ? af >= leftOn(i) + 2 : i === 3 ? af >= B.hubDisc : af >= rightOn(i - 4) + 2;
  return (
    <AbsoluteFill>
      {!covered && (
        <>
          <Sky from="day" to="dusk" mix={ramp(af, 1900, 1990, EASE.inOut)} horizon={80} />
          <AbsoluteFill style={{ background: `radial-gradient(620px 420px at ${HUB.x}px ${HUB.y}px, rgba(255,214,170,${(0.42 * glow).toFixed(3)}), rgba(255,214,170,0) 70%)` }} />
          {hk > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 44, textAlign: 'center', opacity: hk, transform: `translateY(${(1 - hk) * 12}px)` }}>
              <div style={{ fontFamily: FONT.serifZh, fontWeight: 700, fontSize: 56, lineHeight: 1.1, color: C.ink, letterSpacing: '.02em' }}>对接国际旅行社 · 入境游</div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 12 }}>
                <PlanPill />
                <span style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 32, color: C.mutedStrong }}>Inbound tours with international travel agencies</span>
              </div>
            </div>
          )}
          <ColumnHeads af={af} />
          <Curves af={af} />
          <SourceCards af={af} />
          <ServiceChips af={af} />
          <Roadmap af={af} />
          <Dust af={af} hideSeed={seedHidden} />
        </>
      )}
      <Hub af={af} />
    </AbsoluteFill>
  );
};
