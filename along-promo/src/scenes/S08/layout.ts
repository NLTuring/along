// S08 geometry and beats. Frame numbers here are ABSOLUTE (film frames); S08.tsx converts to local.
import { cue, cueEnd } from '../../timeline';
import { C } from '../../tokens';
import { cubicPath } from './kit';

// ---- beats (absolute) ----
const N3 = {
  next: cue('N3', '下一步'), // 1938
  along: cue('N3', 'Along'), // 1964
  agencies: cue('N3', '国际旅行社'), // 2000
  inbound: cue('N3', '入境游'), // 2029
  more: cue('N3', '更多'), // 2071
  landscape: cue('N3', '山水'), // 2134
  scenery: cue('N3', '风光'), // 2145
  end: cueEnd('N3', '风光'), // 2158
};
export const B = {
  dust0: 1900, // particles turn back from the top-right (S07's powder)
  dustLast: 1958, // last particle lands
  header: N3.next,
  hubDisc: 1955, // hub seed grows into the disc
  logo: N3.along, // LogoInk starts writing
  hubLabel: N3.along + 30,
  left: N3.agencies, // left column lights up
  curvesL: N3.inbound, // curves grow (left → hub)
  curvesR: N3.inbound + 12, // hub → right
  pulse: N3.more, // pulses pour in
  ripple: N3.more + 26, // first packet reaches the hub
  roadmap: N3.more + 7,
  open: N3.landscape, // hub opens into a porthole
  turn: N3.scenery + 1, // the porthole turns A → B (app's six rows)
  grow: N3.end - 2, // porthole grows to full screen
  slats: N3.end + 10, // full-screen six rows slide away (T9)
  slatsEnd: 2195,
};
export const GROW_DUR = 12;
export const TURN_DUR = 16;

// ---- layout (1920×1080) ----
export const HUB = { x: 960, y: 418, r: 115 };
export const PORT = { w: 300, h: 400 }; // porthole 3:4 (glass.css .window--porthole)

export type Src = { y: number; zh: string; sub: string; tint: string };
export const LEFT_X = 90, LEFT_W = 470, CARD_H = 112;
export const SOURCES: Src[] = [
  { y: 290, zh: '日本 · 韩国', sub: '入境游旅行社', tint: C.accent },
  { y: 418, zh: '欧洲', sub: '旅行社 · 入境线路', tint: C.sage },
  { y: 546, zh: '北美', sub: '旅行社 · 来华团', tint: C.gold },
];
export type Dst = { y: number; zh: string; en: string; icon: 'friends' | 'scenic' | 'trip' | 'keepsake' };
export const RIGHT_X = 1340, RIGHT_W = 490, CHIP_H = 76;
export const SERVICES: Dst[] = [
  { y: 286, zh: '本地伙伴', en: 'Local friends', icon: 'friends' },
  { y: 374, zh: '景区', en: 'Scenic spots', icon: 'scenic' },
  { y: 462, zh: '行程', en: 'Itineraries', icon: 'trip' },
  { y: 550, zh: '3D 文创', en: 'Keepsakes', icon: 'keepsake' },
];

// Curves: card port → hub (left), hub → chip port (right). Ends tuck under the hub disc.
const L_END = { x: HUB.x - HUB.r + 8, y: HUB.y };
const R_START = { x: HUB.x + HUB.r - 8, y: HUB.y };
export const CURVES_L = SOURCES.map((s) => {
  const p0 = { x: LEFT_X + LEFT_W, y: s.y };
  const dx = L_END.x - p0.x;
  return cubicPath(p0, { x: p0.x + dx * 0.45, y: s.y }, { x: L_END.x - dx * 0.45, y: L_END.y }, L_END);
});
export const CURVES_R = SERVICES.map((d) => {
  const p3 = { x: RIGHT_X, y: d.y };
  const dx = p3.x - R_START.x;
  return cubicPath(R_START, { x: R_START.x + dx * 0.45, y: R_START.y }, { x: p3.x - dx * 0.45, y: d.y }, p3);
});

// Seeds the returning dust settles into (card ports, hub, chip ports).
export const SEEDS = [
  ...SOURCES.map((s, i) => ({ x: LEFT_X + LEFT_W, y: s.y, kind: 'L' as const, i, weight: 1 })),
  { x: HUB.x, y: HUB.y, kind: 'H' as const, i: 0, weight: 3.2 },
  ...SERVICES.map((d, i) => ({ x: RIGHT_X, y: d.y, kind: 'R' as const, i, weight: 1 })),
];

// Roadmap row (all steps are plans).
export const ROAD = { y: 700, xs: [500, 1000, 1500], labelX: 96, arrowTo: 1800 };
export const STEPS = [
  { zh: '试点 上海 · 南京', en: 'Pilot: Shanghai · Nanjing' },
  { zh: '对接海外旅行社入境线路', en: 'Overseas agency routes' },
  { zh: '拓展更多城市', en: 'More cities' },
];

// The window scenes (website window.js SCENES).
export const SCENE_A = { src: 'img/apk/window/nanjing-xuanwu-bridge.jpg', zh: '南京 · 玄武湖', pos: '50% 50%' };
export const SCENE_B = { src: 'img/apk/window/nanjing-lake-skyline.jpg', zh: '南京 · 湖光与城市', pos: '50% 30%' };

// Six rows in a fixed shuffled order (app: slatDelays, but seeded); rank → start offset grows
// t^0.78 so the gaps shrink (blinds-slice rhythm: sparse then dense).
export const SLAT_ORDER = [2, 5, 0, 3, 1, 4]; // row → rank
export const slatDelay = (row: number, spread: number) => spread * Math.pow(SLAT_ORDER[row] / 5, 0.78);
