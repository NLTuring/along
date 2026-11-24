// 来源：捏个 PINCH（packages/geometry/src/voxel.ts），团队自有代码，原样移植。
import { meshBounds } from './mesh-utils';
import type { SDF3 } from './sdf';
import { gridFor, surfaceNets, type GridSpec, type MeshData } from './surfacenets';

const INF = 1e20;

/** 沿三个轴各做一次射线奇偶测试，两票以上算"在内部"。对有小破洞的网格也比较稳。 */
export function occupancy(m: MeshData, g: GridSpec): Uint8Array {
  const [nx, ny] = g.dims;
  const N = g.dims[0] * g.dims[1] * g.dims[2];
  const votes = new Uint8Array(N);
  const p = m.positions, idx = m.indices;
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const nu = g.dims[u], nv = g.dims[v], na = g.dims[axis];
    const cols: Array<number[] | undefined> = new Array(nu * nv);
    const ju = g.cell * 1.234e-3, jv = g.cell * 2.718e-3;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const au = p[a + u], av = p[a + v], bu = p[b + u], bv = p[b + v], cu = p[c + u], cv = p[c + v];
      const den = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
      if (Math.abs(den) < 1e-14) continue;
      const i0 = Math.max(0, Math.ceil((Math.min(au, bu, cu) - g.min[u] - ju) / g.cell));
      const i1 = Math.min(nu - 1, Math.floor((Math.max(au, bu, cu) - g.min[u] - ju) / g.cell));
      const k0 = Math.max(0, Math.ceil((Math.min(av, bv, cv) - g.min[v] - jv) / g.cell));
      const k1 = Math.min(nv - 1, Math.floor((Math.max(av, bv, cv) - g.min[v] - jv) / g.cell));
      for (let iu = i0; iu <= i1; iu++) {
        const pu = g.min[u] + iu * g.cell + ju;
        for (let iv = k0; iv <= k1; iv++) {
          const pv = g.min[v] + iv * g.cell + jv;
          const l1 = ((bv - cv) * (pu - cu) + (cu - bu) * (pv - cv)) / den;
          const l2 = ((cv - av) * (pu - cu) + (au - cu) * (pv - cv)) / den;
          const l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          const w = l1 * p[a + axis] + l2 * p[b + axis] + l3 * p[c + axis];
          (cols[iu + nu * iv] ??= []).push(w);
        }
      }
    }
    const coord = [0, 0, 0];
    for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
      const hits = cols[iu + nu * iv];
      if (!hits || hits.length < 2) continue;
      hits.sort((x, y) => x - y);
      let h = 0;
      coord[u] = iu; coord[v] = iv;
      for (let k = 0; k < na; k++) {
        const wa = g.min[axis] + k * g.cell;
        while (h < hits.length && hits[h] < wa) h++;
        if (h & 1) {
          coord[axis] = k;
          votes[coord[0] + nx * (coord[1] + ny * coord[2])]++;
        }
      }
    }
  }
  for (let i = 0; i < N; i++) votes[i] = votes[i] >= 2 ? 1 : 0;
  return votes;
}

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** 精确欧氏距离变换（Felzenszwalb）：到最近"特征体素"的距离平方，单位为格 */
export function edt3(isFeature: (i: number) => boolean, dims: [number, number, number]): Float32Array {
  const [nx, ny, nz] = dims;
  const g = new Float32Array(nx * ny * nz);
  for (let i = 0; i < g.length; i++) g[i] = isFeature(i) ? 0 : INF;
  const m = Math.max(nx, ny, nz);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  const pass = (n: number, count: number, index: (line: number, k: number) => number) => {
    for (let line = 0; line < count; line++) {
      for (let k = 0; k < n; k++) f[k] = g[index(line, k)];
      edt1d(f, n, d, v, z);
      for (let k = 0; k < n; k++) g[index(line, k)] = d[k];
    }
  };
  pass(nx, ny * nz, (l, k) => k + nx * l);
  pass(ny, nx * nz, (l, k) => (l % nx) + nx * (k + ny * Math.floor(l / nx)));
  pass(nz, nx * ny, (l, k) => l + nx * ny * k);
  return g;
}

export interface VoxelOptions {
  /** 体素边长（mm），会按最大格数自动放大 */
  cell: number;
  /** 等值面外扩（mm）：> 0 加厚，< 0 收缩 */
  offset?: number;
  maxCells?: number;
  /** 重建后再减掉的区域（比如场景里的孔），< 0 为要减掉的部分 */
  subtract?: SDF3 | null;
}

/** 体素化重建：得到一定闭合、无自交的网格（细节会被平滑到体素尺度） */
export function voxelRemesh(m: MeshData, opt: VoxelOptions): MeshData {
  const b = meshBounds(m);
  const offset = opt.offset ?? 0;
  const pad = Math.abs(offset) + opt.cell * 2;
  const min = [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad];
  const max = [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad];
  const ext = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const g = gridFor(min, max, ext / opt.cell, opt.maxCells ?? 6_000_000);
  const occ = occupancy(m, g);
  const dIn = edt3((i) => occ[i] === 1, g.dims);
  const dOut = edt3((i) => occ[i] === 0, g.dims);
  const values = new Float32Array(occ.length);
  for (let i = 0; i < occ.length; i++) {
    values[i] = occ[i] ? -(Math.sqrt(dOut[i]) - 0.5) * g.cell : (Math.sqrt(dIn[i]) - 0.5) * g.cell;
  }
  if (opt.subtract) {
    const [nx, ny, nz] = g.dims;
    let i = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, i++) {
      if (values[i] - offset > g.cell * 3) continue;
      const h = opt.subtract(g.min[0] + x * g.cell, g.min[1] + y * g.cell, g.min[2] + z * g.cell);
      values[i] = Math.max(values[i], offset - h);
    }
  }
  return surfaceNets(values, g, offset);
}
