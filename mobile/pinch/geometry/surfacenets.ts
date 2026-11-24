// 来源：捏个 PINCH（packages/geometry/src/surfacenets.ts），团队自有代码，原样移植。
import type { SDF3 } from './sdf';

/** 三角网格（世界坐标，毫米） */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** 每个顶点属于哪个部件（scene.parts 的下标，-1 表示未知） */
  owners?: Int16Array;
}

export interface GridSpec {
  min: [number, number, number];
  cell: number;
  dims: [number, number, number];
}

/** 按包围盒和目标分辨率生成采样网格（留 2 格边距保证网格闭合） */
export function gridFor(min: number[], max: number[], resolution: number, maxCells = 6_000_000): GridSpec {
  const ext = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-3);
  let cell = ext / resolution;
  const dimsOf = (c: number) => [0, 1, 2].map((k) => Math.ceil((max[k] - min[k]) / c) + 5) as [number, number, number];
  let dims = dimsOf(cell);
  while (dims[0] * dims[1] * dims[2] > maxCells) { cell *= 1.15; dims = dimsOf(cell); }
  return { min: [min[0] - 2 * cell, min[1] - 2 * cell, min[2] - 2 * cell], cell, dims };
}

export function sampleGrid(f: SDF3, g: GridSpec): Float32Array {
  const [nx, ny, nz] = g.dims;
  const out = new Float32Array(nx * ny * nz);
  let i = 0;
  for (let z = 0; z < nz; z++) {
    const wz = g.min[2] + z * g.cell;
    for (let y = 0; y < ny; y++) {
      const wy = g.min[1] + y * g.cell;
      for (let x = 0; x < nx; x++) out[i++] = f(g.min[0] + x * g.cell, wy, wz);
    }
  }
  return out;
}

const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * Naive Surface Nets：每个跨越等值面的格子放一个顶点（各交点的平均），
 * 每条跨越等值面的网格边连接周围四个格子的顶点成一个四边形。输出天然闭合。
 */
export function surfaceNets(values: Float32Array, g: GridSpec, iso = 0, normalField?: SDF3): MeshData {
  const [nx, ny, nz] = g.dims;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos: number[] = [];
  const at = (x: number, y: number, z: number) => values[x + nx * (y + ny * z)] - iso;
  const cv = new Float64Array(8);
  for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) {
    let mask = 0;
    for (let k = 0; k < 8; k++) {
      const c = CORNERS[k];
      cv[k] = at(x + c[0], y + c[1], z + c[2]);
      if (cv[k] < 0) mask |= 1 << k;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const A = CORNERS[a], B = CORNERS[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t;
      n++;
    }
    cellVert[x + cx * (y + cy * z)] = pos.length / 3;
    pos.push(g.min[0] + (x + sx / n) * g.cell, g.min[1] + (y + sy / n) * g.cell, g.min[2] + (z + sz / n) * g.cell);
  }
  const idx: number[] = [];
  const cell = (x: number, y: number, z: number) => cellVert[x + cx * (y + cy * z)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b);
    else idx.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < cz; z++) for (let y = 1; y < cy; y++) for (let x = 0; x < cx; x++) {
    const a = at(x, y, z) < 0, b = at(x + 1, y, z) < 0;
    if (a === b) continue;
    quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), !a);
  }
  for (let z = 1; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 1; x < cx; x++) {
    const a = at(x, y, z) < 0, b = at(x, y + 1, z) < 0;
    if (a === b) continue;
    quad(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), !a);
  }
  for (let z = 0; z < cz; z++) for (let y = 1; y < cy; y++) for (let x = 1; x < cx; x++) {
    const a = at(x, y, z) < 0, b = at(x, y, z + 1) < 0;
    if (a === b) continue;
    quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), !a);
  }
  const positions = new Float32Array(pos);
  const indices = new Uint32Array(idx);
  const normals = normalField ? fieldNormals(positions, normalField, g.cell * 0.5) : faceNormals(positions, indices);
  return { positions, normals, indices };
}

export function fieldNormals(p: Float32Array, f: SDF3, h: number): Float32Array {
  const n = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const gx = f(x + h, y, z) - f(x - h, y, z);
    const gy = f(x, y + h, z) - f(x, y - h, z);
    const gz = f(x, y, z + h) - f(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    n[i] = gx / l; n[i + 1] = gy / l; n[i + 2] = gz / l;
  }
  return n;
}

export function faceNormals(p: Float32Array, idx: Uint32Array): Float32Array {
  const n = new Float32Array(p.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** 直接对距离场网格化 */
export function meshField(f: SDF3, min: number[], max: number[], resolution: number, withNormals = true): MeshData {
  const g = gridFor(min, max, resolution);
  return surfaceNets(sampleGrid(f, g), g, 0, withNormals ? f : undefined);
}
