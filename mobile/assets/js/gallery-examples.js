// Along's own gallery pieces: glazed-clay figurines written as part recipes (the same layout
// lines the photo-to-clay model returns) and pixel-art bead patterns drawn cell by cell.
// Every piece is real: it opens on the clay bench or the bead page and can be remixed.

const P = (id, primitive, params, position, color, extra = {}) => ({ id, primitive, params, position, color, ...extra });
const M = (id, of) => ({ id, mirrorOf: of });

export const CLAY_EXAMPLES = [
  { id: 'ex_panda', city: '成都', price: 10, parts: [
    P('body', 'sphere', { r: 22 }, [0, 22, 0], '#f7f3ea'),
    P('belly', 'sphere', { r: 15 }, [0, 19, 9], '#fffaf0'),
    P('head', 'sphere', { r: 17 }, [0, 52, 2], '#f7f3ea'),
    P('ear_l', 'sphere', { r: 6.5 }, [-12, 66, 0], '#2b2a2e'),
    M('ear_r', 'ear_l'),
    P('eye_l', 'sphere', { r: 5 }, [-7, 54, 15], '#2b2a2e'),
    M('eye_r', 'eye_l'),
    P('nose', 'sphere', { r: 2.5 }, [0, 49, 18.5], '#2b2a2e'),
    P('arm_l', 'capsule', { r: 6, h: 22 }, [-19, 30, 6], '#2b2a2e', { rotation: [20, 0, -30] }),
    M('arm_r', 'arm_l'),
    P('bamboo', 'cylinder', { r: 2.6, h: 40 }, [9, 34, 16], '#6fbf5a', { rotation: [0, 0, -18] }),
    P('leaf', 'capsule', { r: 2.2, h: 14 }, [16, 52, 16], '#9ad36a', { rotation: [0, 0, -60] }),
  ] },
  { id: 'ex_lantern', city: '南京', price: 10, parts: [
    P('cap', 'cylinder', { r: 12, h: 5, bevel: 1 }, [0, 72, 0], '#e2b33c'),
    P('lamp', 'sphere', { r: 26 }, [0, 44, 0], '#e2433a'),
    P('rib_a', 'torus', { R: 25.6, r: 1.1 }, [0, 44, 0], '#f2c94c', { rotation: [0, 0, 0] }),
    P('rib_b', 'torus', { R: 25.6, r: 1.1 }, [0, 44, 0], '#f2c94c', { rotation: [0, 60, 0] }),
    P('rib_c', 'torus', { R: 25.6, r: 1.1 }, [0, 44, 0], '#f2c94c', { rotation: [0, 120, 0] }),
    P('base', 'cylinder', { r: 12, h: 5, bevel: 1 }, [0, 17, 0], '#e2b33c'),
    P('tassel', 'cone', { r1: 6, r2: 1.5, h: 15 }, [0, 7.5, 0], '#f2c94c'),
    P('hook', 'torus', { R: 4, r: 1.2 }, [0, 79, 0], '#e2b33c'),
  ] },
  { id: 'ex_pagoda', city: '南京', price: 12, parts: [
    P('step', 'box', { w: 50, h: 6, d: 50, bevel: 1.5 }, [0, 3, 0], '#cdb48c'),
    P('floor1', 'box', { w: 34, h: 15, d: 34, bevel: 1 }, [0, 13.5, 0], '#e9dcc4'),
    P('roof1', 'prism', { n: 4, r: 30, h: 5, bevel: 1 }, [0, 23.5, 0], '#2f7f6f', { rotation: [0, 45, 0] }),
    P('floor2', 'box', { w: 28, h: 13, d: 28, bevel: 1 }, [0, 32.5, 0], '#e9dcc4'),
    P('roof2', 'prism', { n: 4, r: 25, h: 5, bevel: 1 }, [0, 41.5, 0], '#2f7f6f', { rotation: [0, 45, 0] }),
    P('floor3', 'box', { w: 22, h: 11, d: 22, bevel: 1 }, [0, 49.5, 0], '#e9dcc4'),
    P('roof3', 'prism', { n: 4, r: 20, h: 5, bevel: 1 }, [0, 57.5, 0], '#2f7f6f', { rotation: [0, 45, 0] }),
    P('spire', 'cone', { r1: 6, r2: 0.6, h: 16 }, [0, 68, 0], '#e2b33c'),
    P('door', 'box', { w: 9, h: 11, d: 2 }, [0, 11.5, 17], '#b3462f'),
  ] },
  { id: 'ex_bao', city: '上海', price: 8, parts: [
    P('steamer', 'cylinder', { r: 34, h: 12, wall: 2.5, floor: 3, bevel: 1.5 }, [0, 6, 0], '#c9a26b'),
    P('bun_a', 'sphere', { r: 13 }, [-12, 18, -8], '#fff4e2'),
    P('bun_b', 'sphere', { r: 13 }, [13, 18, -6], '#fff4e2'),
    P('bun_c', 'sphere', { r: 13 }, [0, 18, 12], '#fff4e2'),
    P('pinch_a', 'cone', { r1: 4, r2: 0.5, h: 6 }, [-12, 31, -8], '#f6e3c4'),
    P('pinch_b', 'cone', { r1: 4, r2: 0.5, h: 6 }, [13, 31, -6], '#f6e3c4'),
    P('pinch_c', 'cone', { r1: 4, r2: 0.5, h: 6 }, [0, 31, 12], '#f6e3c4'),
    P('dot', 'sphere', { r: 2.2 }, [0, 28, 22.5], '#e2433a'),
  ] },
  { id: 'ex_bubbletea', city: '上海', price: 8, parts: [
    P('cup', 'cone', { r1: 15, r2: 19, h: 50, bevel: 1 }, [0, 25, 0], '#c98a5e'),
    P('lid', 'cylinder', { r: 20, h: 4, bevel: 1.5 }, [0, 52, 0], '#f2efe8'),
    P('straw', 'cylinder', { r: 2.6, h: 34 }, [5, 66, 0], '#e85d75', { rotation: [0, 0, -10] }),
    P('pearl_a', 'sphere', { r: 4.5 }, [-8, 7, 11], '#3a2a24'),
    P('pearl_b', 'sphere', { r: 4.5 }, [3, 6, 13], '#3a2a24'),
    P('pearl_c', 'sphere', { r: 4.5 }, [11, 8, 8], '#3a2a24'),
    P('band', 'cylinder', { r: 18.2, h: 8 }, [0, 34, 0], '#f2c94c'),
  ] },
  { id: 'ex_ferry', city: '上海', price: 10, parts: [
    P('hull', 'capsule', { r: 12, h: 74 }, [0, 10, 0], '#3d7fc6', { rotation: [0, 0, 90] }),
    P('deck', 'box', { w: 56, h: 4, d: 22, bevel: 1.5 }, [0, 20, 0], '#f7f3ea'),
    P('cabin', 'box', { w: 32, h: 16, d: 18, bevel: 2 }, [-4, 30, 0], '#f7f3ea'),
    P('roof', 'box', { w: 36, h: 3, d: 21, bevel: 1 }, [-4, 39.5, 0], '#e2433a'),
    P('funnel', 'cylinder', { r: 4.5, h: 14 }, [16, 46, 0], '#f2c94c'),
    P('window_l', 'box', { w: 6, h: 5, d: 1.6 }, [-14, 31, 9.6], '#7fc4d4'),
    P('window_m', 'box', { w: 6, h: 5, d: 1.6 }, [-4, 31, 9.6], '#7fc4d4'),
    P('window_r', 'box', { w: 6, h: 5, d: 1.6 }, [6, 31, 9.6], '#7fc4d4'),
    P('flag', 'box', { w: 8, h: 5, d: 1 }, [-22, 50, 0], '#e85d75'),
    P('mast', 'cylinder', { r: 0.9, h: 16 }, [-26, 44, 0], '#5a4630'),
  ] },
];

// Pixel-art bead patterns. Each row is a string; a letter picks a palette colour, '.' is an empty peg.
const pattern = (rows, colours) => {
  const keys = Object.keys(colours), width = rows[0].length;
  return {
    width, height: rows.length, bead: 'MIDI_5MM',
    palette: keys.map((k) => colours[k]),
    cells: rows.map((r) => [...r].map((ch) => (ch === '.' ? '.' : String(keys.indexOf(ch)))).join('')).join(''),
  };
};
const C = (code, hex) => ({ code, hex });

export const BEAD_EXAMPLES = [
  { id: 'ex_beads_panda', city: '成都', price: 5, pattern: pattern([
    'GGGGGGGGGGGGGGGG', 'GGGKKGGGGGGKKGGG', 'GGKKKKGGGGKKKKGG', 'GGKKWWWWWWWWKKGG', 'GGGWWWWWWWWWWGGG', 'GGWWWWWWWWWWWWGG',
    'GGWKKKWWWWKKKWGG', 'GGWKWKWWWWKWKWGG', 'GGWKKKWWWWKKKWGG', 'GGWWWWWKKWWWWWGG', 'GGWWWWWWWWWWWWGG', 'GGGWWPWWWWPWWGGG',
    'GGGGWWWWWWWWGGGG', 'GGKKKWWWWWWKKKGG', 'GKKKKKWWWWKKKKKG', 'GGGGGGGGGGGGGGGG',
  ], { G: C('H11', '#8cc26a'), K: C('H18', '#1d1c1f'), W: C('H1', '#f7f5f0'), P: C('H6', '#ef9fb8') }) },
  { id: 'ex_beads_lantern', city: '南京', price: 5, pattern: pattern([
    '................', '.......YY.......', '......YYYY......', '....RRRRRRRR....', '...RRRYRRYRRR...', '..RRRRYRRYRRRR..',
    '..RRRRYRRYRRRR..', '..RYYYYYYYYYYR..', '..RRRRYRRYRRRR..', '..RRRRYRRYRRRR..', '...RRRYRRYRRR...', '....RRRRRRRR....',
    '......YYYY......', '.......OO.......', '.......OO.......', '......O..O......',
  ], { R: C('H5', '#c7322f'), Y: C('H3', '#f3d34a'), O: C('H4', '#ef8a2c') }) },
  { id: 'ex_beads_dumpling', city: '上海', price: 5, pattern: pattern([
    'BBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB', 'BBBBBWBWBWBWBBBB', 'BBBBWWWWWWWWWBBB', 'BBBWWWWWWWWWWWBB', 'BBWWWWWWWWWWWWWB',
    'BBWWWKWWWWWKWWWB', 'BBWWWWWWWWWWWWWB', 'BBWWWPWKKWPWWWWB', 'BBWWWWWWWWWWWWWB', 'BBBWWWWWWWWWWWBB', 'BBBTTTTTTTTTTTBB',
    'BBTTTTTTTTTTTTTB', 'BBTBTBTBTBTBTBTB', 'BBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB',
  ], { B: C('H29', '#7fc4d4'), W: C('H2', '#f0e3c2'), K: C('H18', '#1d1c1f'), P: C('H6', '#ef9fb8'), T: C('H20', '#a3693c') }) },
  { id: 'ex_beads_skyline', city: '上海', price: 8, pattern: pattern([
    'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSSSSSSSSSSSSSS', 'SSSSSSSSSSSPSSSSSSSSSSSS', 'SSSSSSSSSSSPSSSSSSSSSSSS', 'SSSSSSSSSSPPPSSSSSSSSSSS', 'SSSSSSSSSSPRPSSSSSSSSSSS',
    'SSSSSSSSSSSPSSSSSSSBSSSS', 'SSSSSSSSSSSPSSSSSSSBSSSS', 'SSSSSSSSSSPPPSSSSSBBBSSS', 'SSSSSSSSSPRRRPSSSSBBBSSS', 'SSSSSSSSSSPPPSSSSSBBBSSS', 'SSSSGGSSSSSPSSSSSSBBBSSS',
    'SSSSGGSSSSSPSSSSSSBBBBSS', 'SSSGGGGSSSPPPSSGGSBBBBSS', 'SSSGGGGSSSPPPSSGGSBBBBSS', 'SSGGGGGGSPPPPPGGGGBBBBBS', 'SSGGGGGGGPPPPPGGGGBBBBBS', 'WWWWWWWWWWWWWWWWWWWWWWWW',
    'WLWWWLWWWWLWWWWLWWWWLWWW', 'WWWWWWWWWWWWWWWWWWWWWWWW', 'WWLWWWWWLWWWWWWWLWWWWWLW', 'WWWWWWWWWWWWWWWWWWWWWWWW',
  ], { S: C('H30', '#b9d7ec'), P: C('H45', '#c46d8e'), R: C('H5', '#c7322f'), B: C('H8', '#2c3f8f'), G: C('H14', '#5a5a5c'), W: C('H47', '#2a6f8f'), L: C('H3', '#f3d34a') }) },
];
