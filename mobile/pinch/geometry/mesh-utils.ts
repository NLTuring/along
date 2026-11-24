// 来源：捏个 PINCH（packages/geometry/src/mesh-utils.ts），团队自有代码，原样移植。
import { faceNormals, type MeshData } from './surfacenets';

export function meshBounds(m: MeshData): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    if (p[i + k] < min[k]) min[k] = p[i + k];
    if (p[i + k] > max[k]) max[k] = p[i + k];
  }
  return { min, max };
}

/** 有符号体积（mm³）与表面积（mm²）；法线朝外时体积为正 */
export function volumeArea(m: MeshData): { volume: number; area: number; centroid: [number, number, number] } {
  const p = m.positions, idx = m.indices;
  let vol = 0, area = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const qx = p[c], qy = p[c + 1], qz = p[c + 2];
    const v = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6;
    vol += v;
    cx += v * (ax + bx + qx) / 4; cy += v * (ay + by + qy) / 4; cz += v * (az + bz + qz) / 4;
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = qx - ax, wy = qy - ay, wz = qz - az;
    area += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  }
  const k = Math.abs(vol) > 1e-9 ? 1 / vol : 0;
  return { volume: vol, area, centroid: [cx * k, cy * k, cz * k] };
}

export function mergeMeshes(list: MeshData[]): MeshData {
  let nv = 0, ni = 0;
  for (const m of list) { nv += m.positions.length; ni += m.indices.length; }
  const positions = new Float32Array(nv), normals = new Float32Array(nv), indices = new Uint32Array(ni);
  const owners = new Int16Array(nv / 3).fill(-1);
  let vo = 0, io = 0;
  for (const m of list) {
    positions.set(m.positions, vo);
    normals.set(m.normals.length === m.positions.length ? m.normals : faceNormals(m.positions, m.indices), vo);
    if (m.owners) owners.set(m.owners, vo / 3);
    const base = vo / 3;
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + base;
    vo += m.positions.length;
    io += m.indices.length;
  }
  return { positions, normals, indices, owners };
}

/** 4x4 列主序矩阵（与 three.js Matrix4.elements 一致） */
export function transformMesh(m: MeshData, e: ArrayLike<number>): MeshData {
  const p = m.positions;
  const positions = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    positions[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    positions[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    positions[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  const det = e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]);
  const indices = det < 0 ? flipWinding(m.indices) : m.indices.slice();
  return { positions, normals: faceNormals(positions, indices), indices, owners: m.owners };
}

function flipWinding(idx: Uint32Array): Uint32Array {
  const out = idx.slice();
  for (let t = 0; t < out.length; t += 3) { const b = out[t + 1]; out[t + 1] = out[t + 2]; out[t + 2] = b; }
  return out;
}

/** 合并重合顶点（STL / 分块网格导入后做拓扑检查前需要） */
export function weld(m: MeshData, eps = 1e-4): { positions: Float32Array; indices: Uint32Array; remap: Uint32Array } {
  const p = m.positions;
  const map = new Map<string, number>();
  const remap = new Uint32Array(p.length / 3);
  const out: number[] = [];
  const q = 1 / eps;
  for (let i = 0; i < p.length; i += 3) {
    const key = `${Math.round(p[i] * q)},${Math.round(p[i + 1] * q)},${Math.round(p[i + 2] * q)}`;
    let id = map.get(key);
    if (id === undefined) { id = out.length / 3; map.set(key, id); out.push(p[i], p[i + 1], p[i + 2]); }
    remap[i / 3] = id;
  }
  const indices = new Uint32Array(m.indices.length);
  for (let i = 0; i < indices.length; i++) indices[i] = remap[m.indices[i]];
  return { positions: new Float32Array(out), indices, remap };
}

/** 开放边（只被一个三角形使用）和非流形边（被三个及以上使用）的数量 */
export function edgeStats(indices: Uint32Array): { open: number; nonManifold: number; edges: number } {
  const count = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (a === b || b === c || a === c) continue;
    for (const k of [key(a, b), key(b, c), key(c, a)]) count.set(k, (count.get(k) ?? 0) + 1);
  }
  let open = 0, nonManifold = 0;
  for (const v of count.values()) { if (v === 1) open++; else if (v > 2) nonManifold++; }
  return { open, nonManifold, edges: count.size };
}
