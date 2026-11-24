// Perler (fuse) bead patterns from a photo. Pure functions, no DOM, so they run in Node tests.
// A photo becomes a grid of pegs; every peg takes the nearest bead colour (CIE Lab, ΔE76),
// then the rarest colours are folded into their nearest neighbour until the kit has `maxColors`.
// Pattern shape matches the server (server/src/beads.ts): one character per cell, '.' empty.

export const CELL_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/';
export const BOARD_PEGS = 29;
// Pegs across: a single board, then two and three boards wide, up to a 128-peg picture for fine detail.
export const SIZES = Object.freeze([29, 58, 87, 116]);
export const MAX_PEGS = 128;
export const BEAD_MM = Object.freeze({ MIDI_5MM: 5, MINI_2_6MM: 2.6 });
// Kit pricing in fen, the same table the server uses for the order.
export const KIT_PRICES = Object.freeze({ bagCents: 600, bagSize: 1000, boardCents: 800, boardPegs: 29, toolsCents: 1500, shippingCents: 800 });

// A 5 mm bead palette in the common H-number scheme (H1 white … H49). Names are for the colour card.
export const PALETTE = Object.freeze([
  ['H1', '#f7f5f0', '白', 'White'], ['H2', '#f0e3c2', '奶油', 'Cream'], ['H3', '#f3d34a', '黄', 'Yellow'], ['H4', '#ef8a2c', '橙', 'Orange'],
  ['H5', '#c7322f', '红', 'Red'], ['H6', '#ef9fb8', '粉', 'Pink'], ['H7', '#8b5aa8', '紫', 'Purple'], ['H8', '#2c3f8f', '深蓝', 'Dark blue'],
  ['H9', '#3d7fc6', '蓝', 'Blue'], ['H10', '#2f8a4c', '绿', 'Green'], ['H11', '#8cc26a', '浅绿', 'Light green'], ['H12', '#7a4a2a', '棕', 'Brown'],
  ['H13', '#9a9a98', '灰', 'Grey'], ['H14', '#5a5a5c', '深灰', 'Dark grey'], ['H18', '#1d1c1f', '黑', 'Black'], ['H20', '#a3693c', '浅棕', 'Light brown'],
  ['H21', '#d9b48a', '肤色', 'Tan'], ['H22', '#f2c9a9', '浅肤', 'Peach'], ['H26', '#7c1f2b', '酒红', 'Wine'], ['H27', '#e6c35c', '芥末', 'Mustard'],
  ['H28', '#1f5c3b', '墨绿', 'Forest'], ['H29', '#7fc4d4', '天蓝', 'Sky blue'], ['H30', '#b9d7ec', '雾蓝', 'Mist blue'], ['H31', '#bfa6d6', '淡紫', 'Lavender'],
  ['H33', '#f26e5b', '珊瑚', 'Coral'], ['H35', '#4cb7a6', '青', 'Teal'], ['H38', '#d6d3cc', '浅灰', 'Light grey'], ['H40', '#e4a33a', '琥珀', 'Amber'],
  ['H43', '#5b7a3a', '橄榄', 'Olive'], ['H45', '#c46d8e', '玫红', 'Rose'], ['H47', '#2a6f8f', '湖蓝', 'Lake'], ['H49', '#e9dfcf', '米色', 'Beige'],
].map(([code, hex, zh, en]) => Object.freeze({ code, hex, zh, en })));

const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function lab([r, g, b]) {
  const R = srgb(r), G = srgb(g), B = srgb(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const PALETTE_LAB = PALETTE.map((p) => lab(hexRgb(p.hex)));

/** Average the photo's pixels into a w×h grid (box filter, cover-cropped to the grid's aspect). */
export function sampleGrid(rgba, width, height, cols, rows) {
  const aspect = cols / rows;
  let cw = width, ch = height;
  if (width / height > aspect) cw = height * aspect; else ch = width / aspect;
  const ox = (width - cw) / 2, oy = (height - ch) / 2, out = new Float32Array(cols * rows * 4);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = Math.floor(ox + (c * cw) / cols), x1 = Math.max(x0 + 1, Math.floor(ox + ((c + 1) * cw) / cols));
    const y0 = Math.floor(oy + (r * ch) / rows), y1 = Math.max(y0 + 1, Math.floor(oy + ((r + 1) * ch) / rows));
    let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
    for (let y = y0; y < Math.min(y1, height); y++) for (let x = x0; x < Math.min(x1, width); x++) {
      const i = (y * width + x) * 4, a = rgba[i + 3] / 255;
      sr += rgba[i] * a; sg += rgba[i + 1] * a; sb += rgba[i + 2] * a; sa += a; n++;
    }
    const o = (r * cols + c) * 4;
    if (sa > 0) { out[o] = sr / sa; out[o + 1] = sg / sa; out[o + 2] = sb / sa; }
    out[o + 3] = n ? sa / n : 0;
  }
  return out;
}

/**
 * options: cols, rows, maxColors (2–24), dither (Floyd–Steinberg, softer for photos),
 * palette (subset of PALETTE codes), transparentBelow (alpha below this is an empty peg).
 */
export function buildPattern(rgba, width, height, { cols = 29, rows = cols, maxColors = 12, dither = false, palette = null, transparentBelow = 0.5, bead = 'MIDI_5MM' } = {}) {
  if (!(cols >= 8 && cols <= MAX_PEGS && rows >= 8 && rows <= MAX_PEGS)) throw new Error('BEAD_SIZE');
  const allowed = PALETTE.map((p, i) => i).filter((i) => !palette || palette.includes(PALETTE[i].code));
  if (!allowed.length) throw new Error('BEAD_PALETTE');
  const grid = sampleGrid(rgba, width, height, cols, rows);
  const nearest = (target, choices) => {
    let best = choices[0], bd = Infinity;
    for (const i of choices) { const d = dist(target, PALETTE_LAB[i]); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  const quantize = (choices) => {
    const work = Float32Array.from(grid), cells = new Int16Array(cols * rows).fill(-1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const o = (r * cols + c) * 4;
      if (work[o + 3] < transparentBelow) continue;
      const px = [Math.max(0, Math.min(255, work[o])), Math.max(0, Math.min(255, work[o + 1])), Math.max(0, Math.min(255, work[o + 2]))];
      const k = nearest(lab(px), choices);
      cells[r * cols + c] = k;
      if (!dither) continue;
      // Half-strength error diffusion: enough to suggest gradients without bead noise.
      const rgb = hexRgb(PALETTE[k].hex), err = [0, 1, 2].map((j) => (px[j] - rgb[j]) * 0.5);
      for (const [dc, dr, w] of [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || cc >= cols || rr >= rows) continue;
        const p = (rr * cols + cc) * 4;
        for (let j = 0; j < 3; j++) work[p + j] += err[j] * w;
      }
    }
    return cells;
  };
  let choices = allowed, cells = quantize(choices);
  const limit = Math.max(2, Math.min(32, maxColors));
  for (let guard = 0; guard < 40; guard++) {
    const counts = new Map();
    for (const k of cells) if (k >= 0) counts.set(k, (counts.get(k) || 0) + 1);
    if (counts.size <= limit) break;
    // Keep the most used colours and re-match the photo against only those.
    choices = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
    cells = quantize(choices);
  }
  const used = [...new Set([...cells].filter((k) => k >= 0))].sort((a, b) => a - b);
  if (!used.length) throw new Error('BEAD_EMPTY');
  const index = new Map(used.map((k, i) => [k, i]));
  return {
    width: cols, height: rows, bead,
    palette: used.map((k) => ({ code: PALETTE[k].code, hex: PALETTE[k].hex })),
    cells: [...cells].map((k) => (k < 0 ? '.' : CELL_ALPHABET[index.get(k)])).join(''),
  };
}

export function beadCounts(pattern) {
  const counts = new Array(pattern.palette.length).fill(0);
  for (const ch of pattern.cells) if (ch !== '.') counts[CELL_ALPHABET.indexOf(ch)]++;
  return pattern.palette.map((colour, i) => ({ ...colour, ...(PALETTE.find((p) => p.code === colour.code) || {}), count: counts[i] })).filter((c) => c.count > 0);
}
export const boardsFor = (pattern) => Math.ceil(pattern.width / BOARD_PEGS) * Math.ceil(pattern.height / BOARD_PEGS);
/** Finished size in centimetres: each 5 mm bead is about 5 mm across once ironed. */
export const finishedCm = (pattern) => [pattern.width, pattern.height].map((n) => Math.round(n * BEAD_MM[pattern.bead]) / 10);
export function kitQuote(pattern, kit) {
  const colours = beadCounts(pattern);
  const bags = colours.reduce((sum, c) => sum + Math.ceil(c.count / KIT_PRICES.bagSize), 0);
  const boards = kit === 'FULL_KIT' ? boardsFor(pattern) : 0;
  const lines = [
    { item: 'BEAD_BAGS', quantity: bags, cents: bags * KIT_PRICES.bagCents },
    ...(boards ? [{ item: 'PEGBOARDS', quantity: boards, cents: boards * KIT_PRICES.boardCents }, { item: 'TOOLS', quantity: 1, cents: KIT_PRICES.toolsCents }] : []),
    { item: 'SHIPPING', quantity: 1, cents: KIT_PRICES.shippingCents },
  ];
  return { colours, beads: colours.reduce((sum, c) => sum + c.count, 0), lines, totalCents: lines.reduce((sum, l) => sum + l.cents, 0) };
}
/** Stable id for a pattern, so paying twice for the same pattern is one charge. */
export function patternRef(pattern) {
  let h = 2166136261;
  const text = `${pattern.width}x${pattern.height}|${pattern.palette.map((p) => p.code).join(',')}|${pattern.cells}`;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `beads-${pattern.width}x${pattern.height}-${(h >>> 0).toString(36)}`;
}
export const validPattern = (p) => Boolean(p && Number.isInteger(p.width) && Number.isInteger(p.height) && p.width >= 8 && p.width <= MAX_PEGS && p.height >= 8 && p.height <= MAX_PEGS
  && Array.isArray(p.palette) && p.palette.length >= 1 && p.palette.length <= 48 && typeof p.cells === 'string' && p.cells.length === p.width * p.height
  && [...p.cells].every((ch) => ch === '.' || (CELL_ALPHABET.indexOf(ch) >= 0 && CELL_ALPHABET.indexOf(ch) < p.palette.length)));
