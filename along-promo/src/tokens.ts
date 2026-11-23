// Along design tokens, copied from the product (APK css/tokens.css, website base.css).
// Every colour, font and easing in the film comes from here.
import { Easing } from 'remotion';

export const C = {
  paper: '#F7F2E8',
  surface: '#FFFDF8',
  ink: '#1B1813',
  body: '#3F3A32',
  muted: '#8B8375',
  mutedStrong: '#6F685C',
  line: '#E5DCCB',
  accent: '#B24A2C', // 印泥红
  accentSoft: '#F2E2D8',
  accentDeep: '#9A3D23',
  sage: '#5F6F5A',
  gold: '#D9A441',
  danger: '#A8322B',
};

// Sky states (tokens.css): top → horizon.
export const SKY = {
  dawn: { top: '#DDE3EA', horizon: '#F6E3D3', ink: C.ink },
  day: { top: '#DCE8EC', horizon: '#F7F2E8', ink: C.ink },
  dusk: { top: '#C9CBD8', horizon: '#F1D2B8', ink: C.ink },
  night: { top: '#1E2530', horizon: '#3A3F47', ink: '#FFFFFF' },
} as const;
export type SkyState = keyof typeof SKY;

export const FONT = {
  // Latin from Source Serif 4, Chinese from Noto Serif SC (the product's 'Along Song' is a subset of it).
  serif: "'Source Serif 4', 'Along Serif', serif",
  serifZh: "'Along Serif', serif",
  sans: "'Along Sans', sans-serif",
};

// Motion (tokens.css, ms → frames @30fps).
export const T = { press: 4, state: 7, sheetIn: 11, shared: 13, reeded: 16, sky: 36, base: 26, hold: 30 };
export const EASE = {
  out: Easing.bezier(0.16, 1, 0.3, 1), // --ease-out
  snap: Easing.bezier(0.2, 0.8, 0.2, 1), // --ease-snap
  in: Easing.bezier(0.4, 0, 1, 1), // --ease-in
  land: Easing.bezier(0.34, 1.56, 0.64, 1), // landing with overshoot (stamps, cards)
  inOut: Easing.bezier(0.42, 0, 0.32, 1), // the logo brush (logo.js)
};

// Glass (glass.css): one tint, three thicknesses.
export const GLASS = {
  1: { bg: 'rgba(255,253,248,.56)', blur: 12 },
  2: { bg: 'rgba(255,253,248,.72)', blur: 22 },
  3: { bg: 'rgba(255,253,248,.86)', blur: 32 },
  edge: 'inset 0 1px 0 rgba(255,255,255,.85), inset 0 -1px 0 rgba(255,255,255,.28), 0 0 0 1px rgba(27,24,19,.06)',
  shadow: '0 8px 24px rgba(60,42,20,.08), 0 1px 2px rgba(60,42,20,.05)',
};

export const R = { r12: 12, r16: 16, r20: 20, r26: 26, pill: 999 };
