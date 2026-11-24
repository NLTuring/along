// 来源：捏个 PINCH（packages/geometry/src/clay.ts），团队自有代码，原样移植。
/**
 * 体素泥巴：一张稠密的距离场网格，笔刷直接改格子里的值，只重新网格化被改到的 16³ 小块。
 * 值 < 0 在泥里面。网格外圈一层格子永远不改，保证网格闭合。
 */
import type { BrushKind, StrokeSym, Vec3 } from '../core';
import type { SDF3 } from './sdf';
import type { MeshData } from './surfacenets';

export const CHUNK = 16;

export interface ClaySpec { min: Vec3; cell: number; dims: [number, number, number] }

/** 覆盖包围盒的网格：最长边约 res 格，总格数不超过 maxCells */
export function claySpec(min: Vec3, max: Vec3, res: number, maxCells = 5_000_000): ClaySpec {
  const ext = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1);
  const pad = ext * 0.14 + 6;
  const lo: Vec3 = [min[0] - pad, min[1] - pad, min[2] - pad];
  const hi: Vec3 = [max[0] + pad, max[1] + pad, max[2] + pad];
  let cell = (ext + 2 * pad) / res;
  const dimsOf = (c: number) => [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / c) + 1) as [number, number, number];
  let dims = dimsOf(cell);
  while (dims[0] * dims[1] * dims[2] > maxCells) { cell *= 1.08; dims = dimsOf(cell); }
  return { min: lo, cell, dims };
}

/** 包围盒是否还在网格内（留 3 格余量） */
export function specFits(s: ClaySpec, b: { min: Vec3; max: Vec3 }): boolean {
  const m = s.cell * 3;
  for (let k = 0; k < 3; k++) if (b.min[k] < s.min[k] + m || b.max[k] > s.min[k] + (s.dims[k] - 1) * s.cell - m) return false;
  return true;
}

// ───────── 对称副本 ─────────

export interface Copies {
  n: number;
  c: Float64Array;
  nr: Float64Array;
  g: Float64Array | null;
  /**
   * 拉坯：这一笔绕轴转一整圈。d / rho 为这一圈的轴向位置与半径，nU / nA 为法线在"径向 / 轴向"上的分量。
   * 笔刷直接按轮廓平面里的距离计算（连续的圆环，没有条纹）；"抓"仍用离散副本，按角度找最近的一个。
   */
  radial: { o: Vec3; u: Vec3; v: Vec3; a: Vec3; d: number; rho: number; step: number; nU: number; nA: number } | null;
  min: Vec3;
  max: Vec3;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function expandDab(p: Vec3, n: Vec3, sym: StrokeSym | null, r: number, grab?: Vec3): Copies {
  const out = (cs: Vec3[], ns: Vec3[], gs: Vec3[] | null, radial: Copies['radial']): Copies => {
    const k = cs.length;
    const c = new Float64Array(k * 3), nr = new Float64Array(k * 3), g = gs ? new Float64Array(k * 3) : null;
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    const gl = grab ? Math.hypot(grab[0], grab[1], grab[2]) : 0;
    for (let i = 0; i < k; i++) {
      c.set(cs[i], i * 3); nr.set(ns[i], i * 3); if (g && gs) g.set(gs[i], i * 3);
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], cs[i][a] - r - gl); max[a] = Math.max(max[a], cs[i][a] + r + gl); }
    }
    return { n: k, c, nr, g, radial, min, max };
  };
  const g0 = grab ? [grab] : null;
  if (!sym) return out([p], [n], g0, null);
  if (sym.kind === 'mirror') {
    const m = norm(sym.normal), o = sym.point;
    const refl = (v: Vec3, pt: boolean): Vec3 => {
      const d = 2 * (pt ? (v[0] - o[0]) * m[0] + (v[1] - o[1]) * m[1] + (v[2] - o[2]) * m[2] : dot(v, m));
      return [v[0] - d * m[0], v[1] - d * m[1], v[2] - d * m[2]];
    };
    const q = refl(p, true);
    if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < r * 0.4) return out([p], [n], g0, null);
    return out([p, q], [n, refl(n, false)], grab ? [grab, refl(grab, false)] : null, null);
  }
  const a = norm(sym.axis), o = sym.point;
  const d = (p[0] - o[0]) * a[0] + (p[1] - o[1]) * a[1] + (p[2] - o[2]) * a[2];
  const foot: Vec3 = [o[0] + a[0] * d, o[1] + a[1] * d, o[2] + a[2] * d];
  const rv: Vec3 = [p[0] - foot[0], p[1] - foot[1], p[2] - foot[2]];
  const rho = Math.hypot(rv[0], rv[1], rv[2]);
  if (rho < r * 0.35) return out([p], [n], g0, null);
  const u: Vec3 = [rv[0] / rho, rv[1] / rho, rv[2] / rho];
  const v = cross(a, u);
  // 只有"抓"会用到离散副本（笔刷按轮廓平面连续计算）；副本足够密才不会出现竖条纹
  const count = Math.max(6, Math.min(1440, Math.ceil((2 * Math.PI * rho) / (r * 0.2))));
  const step = (2 * Math.PI) / count;
  const split = (w: Vec3) => [dot(w, u), dot(w, v), dot(w, a)];
  const ns = split(n), gs = grab ? split(grab) : null;
  const cs: Vec3[] = [], nn: Vec3[] = [], gg: Vec3[] | null = grab ? [] : null;
  for (let k = 0; k < count; k++) {
    const t = k * step, co = Math.cos(t), si = Math.sin(t);
    const du: Vec3 = [u[0] * co + v[0] * si, u[1] * co + v[1] * si, u[2] * co + v[2] * si];
    const dv: Vec3 = [v[0] * co - u[0] * si, v[1] * co - u[1] * si, v[2] * co - u[2] * si];
    cs.push([foot[0] + du[0] * rho, foot[1] + du[1] * rho, foot[2] + du[2] * rho]);
    const rot = (s: number[]): Vec3 => [du[0] * s[0] + dv[0] * s[1] + a[0] * s[2], du[1] * s[0] + dv[1] * s[1] + a[1] * s[2], du[2] * s[0] + dv[2] * s[1] + a[2] * s[2]];
    nn.push(rot(ns));
    if (gg && gs) gg.push(rot(gs));
  }
  return out(cs, nn, gg, { o, u, v, a, d, rho, step, nU: ns[0], nA: ns[2] });
}

// ───────── 网格 ─────────

export interface UndoLog { chunks: Map<number, Float32Array>; bytes: number; gen: number }

export interface ChunkMesh {
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint32Array;
  /** 每个三角形属于哪个部件 */
  own: Int16Array;
  /** 每个顶点对应的全局格子编号（拼接时焊接用） */
  cid: Uint32Array;
  min: Vec3;
  max: Vec3;
}

export interface SuperMesh {
  key: number;
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint32Array;
  /** [起始下标, 数量, 部件] —— 三角形按部件排好序 */
  groups: Array<[number, number, number]>;
  min: Vec3;
  max: Vec3;
}

export interface GrabState {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  snap: Float32Array;
  p: Vec3; n: Vec3; sym: StrokeSym | null; r: number;
  last: [number, number, number, number, number, number] | null;
}

const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** 压感 → 力度系数；鼠标没有压感，按满力度算 */
export const pressureK = (p: number | undefined) => (p === undefined ? 1 : 0.3 + 0.7 * Math.min(1, Math.max(0, p)));

/** 软笔刷 (1 − t²)³ 与刻线用的尖笔刷 (1 − t)³ */
const soft = (t2: number) => { const x = 1 - t2; return x * x * x; };
const sharp = (t2: number) => { const x = 1 - Math.sqrt(t2); return x * x * x; };

export class ClayGrid {
  readonly v: Float32Array;
  readonly nx: number; readonly ny: number; readonly nz: number;
  readonly ncx: number; readonly ncy: number; readonly ncz: number;
  readonly nsx: number; readonly nsy: number;
  readonly mark: Uint32Array;
  meshes = new Map<number, ChunkMesh | null>();
  dirty = new Set<number>();
  private gen = 1;

  constructor(readonly spec: ClaySpec) {
    [this.nx, this.ny, this.nz] = spec.dims;
    this.v = new Float32Array(this.nx * this.ny * this.nz);
    this.ncx = Math.ceil(this.nx / CHUNK); this.ncy = Math.ceil(this.ny / CHUNK); this.ncz = Math.ceil(this.nz / CHUNK);
    this.nsx = Math.ceil(this.ncx / 2); this.nsy = Math.ceil(this.ncy / 2);
    this.mark = new Uint32Array(this.ncx * this.ncy * this.ncz);
  }

  get chunkCount(): number { return this.ncx * this.ncy * this.ncz; }
  superOf(ci: number): number {
    const cx = ci % this.ncx, cy = Math.floor(ci / this.ncx) % this.ncy, cz = Math.floor(ci / (this.ncx * this.ncy));
    return (cx >> 1) + this.nsx * ((cy >> 1) + this.nsy * (cz >> 1));
  }
  newLog(): UndoLog { return { chunks: new Map(), bytes: 0, gen: ++this.gen }; }

  /** 稀疏采样：先算粗网格（每 4 格一个点），远离表面的块直接插值，靠近表面的块逐点精确计算 */
  sample(f: SDF3, S = 4): void {
    const { nx, ny, nz } = this, { min, cell } = this.spec;
    const gx = Math.ceil((nx - 1) / S) + 1, gy = Math.ceil((ny - 1) / S) + 1, gz = Math.ceil((nz - 1) / S) + 1;
    const fx = (i: number) => Math.min(i * S, nx - 1), fy = (j: number) => Math.min(j * S, ny - 1), fz = (k: number) => Math.min(k * S, nz - 1);
    const co = new Float32Array(gx * gy * gz);
    for (let k = 0; k < gz; k++) for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      co[i + gx * (j + gy * k)] = f(min[0] + fx(i) * cell, min[1] + fy(j) * cell, min[2] + fz(k) * cell);
    }
    const th = S * cell * 1.8;
    const v = this.v;
    for (let k = 0; k < gz - 1; k++) for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
      const c = (a: number, b: number, d: number) => co[i + a + gx * (j + b + gy * (k + d))];
      const c000 = c(0, 0, 0), c100 = c(1, 0, 0), c010 = c(0, 1, 0), c110 = c(1, 1, 0), c001 = c(0, 0, 1), c101 = c(1, 0, 1), c011 = c(0, 1, 1), c111 = c(1, 1, 1);
      const lo = Math.min(c000, c100, c010, c110, c001, c101, c011, c111), hi = Math.max(c000, c100, c010, c110, c001, c101, c011, c111);
      const far = lo > th || hi < -th;
      const x0 = fx(i), x1 = fx(i + 1), y0 = fy(j), y1 = fy(j + 1), z0 = fz(k), z1 = fz(k + 1);
      const xe = i === gx - 2 ? x1 : x1 - 1, ye = j === gy - 2 ? y1 : y1 - 1, ze = k === gz - 2 ? z1 : z1 - 1;
      for (let z = z0; z <= ze; z++) {
        const tz = (z - z0) / (z1 - z0 || 1), wz = min[2] + z * cell;
        for (let y = y0; y <= ye; y++) {
          const ty = (y - y0) / (y1 - y0 || 1), wy = min[1] + y * cell;
          let o = x0 + nx * (y + ny * z);
          for (let x = x0; x <= xe; x++, o++) {
            if (far) {
              const tx = (x - x0) / (x1 - x0 || 1);
              const a = c000 + (c100 - c000) * tx, b = c010 + (c110 - c010) * tx, cc = c001 + (c101 - c001) * tx, d = c011 + (c111 - c011) * tx;
              const e = a + (b - a) * ty, g = cc + (d - cc) * ty;
              v[o] = e + (g - e) * tz;
            } else v[o] = f(min[0] + x * cell, wy, wz);
          }
        }
      }
    }
    this.markAll();
  }

  markAll(): void { for (let i = 0; i < this.chunkCount; i++) this.dirty.add(i); this.meshes.clear(); }

  private chunkPts(ci: number): [number, number, number, number, number, number] {
    const cx = ci % this.ncx, cy = Math.floor(ci / this.ncx) % this.ncy, cz = Math.floor(ci / (this.ncx * this.ncy));
    const x0 = cx * CHUNK, y0 = cy * CHUNK, z0 = cz * CHUNK;
    return [x0, Math.min(this.nx, x0 + CHUNK), y0, Math.min(this.ny, y0 + CHUNK), z0, Math.min(this.nz, z0 + CHUNK)];
  }

  private save(log: UndoLog, ci: number): void {
    if (this.mark[ci] === log.gen) return;
    this.mark[ci] = log.gen;
    if (log.chunks.has(ci)) return;
    const [x0, x1, y0, y1, z0, z1] = this.chunkPts(ci);
    const w = x1 - x0, out = new Float32Array(w * (y1 - y0) * (z1 - z0));
    let o = 0;
    for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) { const s = x0 + this.nx * (y + this.ny * z); out.set(this.v.subarray(s, s + w), o); o += w; }
    log.chunks.set(ci, out);
    log.bytes += out.byteLength;
  }

  restore(log: UndoLog): void {
    for (const [ci, data] of log.chunks) {
      const [x0, x1, y0, y1, z0, z1] = this.chunkPts(ci);
      const w = x1 - x0;
      let o = 0;
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) { this.v.set(data.subarray(o, o + w), x0 + this.nx * (y + this.ny * z)); o += w; }
      this.touch(x0, x1 - 1, y0, y1 - 1, z0, z1 - 1);
    }
  }

  /** 标记点范围 [a, b] 周围需要重新网格化的小块 */
  touch(ax: number, bx: number, ay: number, by: number, az: number, bz: number): void {
    const c = (a: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(a / CHUNK)));
    const x0 = c(ax - 2, this.ncx), x1 = c(bx + 2, this.ncx), y0 = c(ay - 2, this.ncy), y1 = c(by + 2, this.ncy), z0 = c(az - 2, this.ncz), z1 = c(bz + 2, this.ncz);
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.dirty.add(x + this.ncx * (y + this.ncy * z));
  }

  private cellBox(mn: Vec3, mx: Vec3): [number, number, number, number, number, number] | null {
    const { min, cell } = this.spec;
    const lo = (k: number, n: number) => Math.max(1, Math.floor((mn[k] - min[k]) / cell));
    const hi = (k: number, n: number) => Math.min(n - 2, Math.ceil((mx[k] - min[k]) / cell));
    const b: [number, number, number, number, number, number] = [lo(0, this.nx), hi(0, this.nx), lo(1, this.ny), hi(1, this.ny), lo(2, this.nz), hi(2, this.nz)];
    return b[0] > b[1] || b[2] > b[3] || b[4] > b[5] ? null : b;
  }

  /** 最近的对称副本：返回 [下标, 距离²]（cx, cy, cz 为被测点） */
  private nearest(cp: Copies, x: number, y: number, z: number, dx: number, dy: number, dz: number): number {
    if (cp.radial) {
      const r = cp.radial;
      const wx = x - r.o[0], wy = y - r.o[1], wz = z - r.o[2];
      let k = Math.round(Math.atan2(wx * r.v[0] + wy * r.v[1] + wz * r.v[2], wx * r.u[0] + wy * r.u[1] + wz * r.u[2]) / r.step) % cp.n;
      if (k < 0) k += cp.n;
      return k;
    }
    let best = 0, bd = Infinity;
    for (let i = 0; i < cp.n; i++) {
      const ex = x - cp.c[i * 3] - dx * (cp.g ? cp.g[i * 3] : 0), ey = y - cp.c[i * 3 + 1] - dy * (cp.g ? cp.g[i * 3 + 1] : 0), ez = z - cp.c[i * 3 + 2] - dz * (cp.g ? cp.g[i * 3 + 2] : 0);
      const d = ex * ex + ey * ey + ez * ez;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** 按一下：在每个对称副本处改格子值 */
  stamp(brush: Exclude<BrushKind, 'grab'>, cp: Copies, r: number, strength: number, log: UndoLog | null): void {
    const b = this.cellBox(cp.min, cp.max);
    if (!b || strength <= 0) return;
    const [x0, x1, y0, y1, z0, z1] = b;
    const { nx, ny, v } = this, { min, cell } = this.spec;
    const r2 = r * r, inv = 1 / r2;
    let tmp: Float32Array | null = null, tw = 0, th = 0;
    if (brush === 'smooth') {
      tw = x1 - x0 + 3; th = y1 - y0 + 3;
      tmp = new Float32Array(tw * th * (z1 - z0 + 3));
      let o = 0;
      for (let z = z0 - 1; z <= z1 + 1; z++) for (let y = y0 - 1; y <= y1 + 1; y++) { const s = x0 - 1 + nx * (y + ny * z); tmp.set(v.subarray(s, s + tw), o); o += tw; }
    }
    const kB = 0.09 * r * strength, kC = 0.16 * r * strength;
    const rad = cp.radial;
    let mx0 = Infinity, mx1 = -1, my0 = Infinity, my1 = -1, mz0 = Infinity, mz1 = -1;
    for (let z = z0; z <= z1; z++) {
      const wz = min[2] + z * cell;
      for (let y = y0; y <= y1; y++) {
        const wy = min[1] + y * cell;
        let o = x0 + nx * (y + ny * z);
        for (let x = x0; x <= x1; x++, o++) {
          const wx = min[0] + x * cell;
          let d2: number, pl = 0;
          if (rad) {
            // 拉坯：在轮廓平面（径向 × 轴向）里算距离，整圈是一条连续的圆环
            const qx = wx - rad.o[0], qy = wy - rad.o[1], qz = wz - rad.o[2];
            const ax = qx * rad.a[0] + qy * rad.a[1] + qz * rad.a[2];
            const dz = ax - rad.d;
            if (Math.abs(dz) >= r) continue;
            const dr = Math.sqrt(Math.max(0, qx * qx + qy * qy + qz * qz - ax * ax)) - rad.rho;
            if (Math.abs(dr) >= r) continue;
            d2 = dr * dr + dz * dz;
            if (brush === 'flatten') pl = dr * rad.nU + dz * rad.nA;
          } else {
            const k = this.nearest(cp, wx, wy, wz, 0, 0, 0);
            const ex = wx - cp.c[k * 3], ey = wy - cp.c[k * 3 + 1], ez = wz - cp.c[k * 3 + 2];
            d2 = ex * ex + ey * ey + ez * ez;
            if (brush === 'flatten') pl = ex * cp.nr[k * 3] + ey * cp.nr[k * 3 + 1] + ez * cp.nr[k * 3 + 2];
          }
          if (d2 >= r2) continue;
          const t2 = d2 * inv;
          let nv: number;
          const cur = v[o];
          switch (brush) {
            case 'build': nv = cur - kB * soft(t2); break;
            case 'dig': nv = cur + kB * soft(t2); break;
            case 'crease': nv = cur + kC * sharp(t2); break;
            case 'flatten': {
              nv = cur + (pl - cur) * Math.min(1, 0.5 * strength * soft(t2));
              break;
            }
            case 'smooth': {
              let s = 0;
              const tx = x - x0 + 1, ty = y - y0 + 1, tz = z - z0 + 1;
              for (let c = -1; c <= 1; c++) for (let bb = -1; bb <= 1; bb++) {
                const row = tx - 1 + tw * (ty + bb + th * (tz + c));
                s += tmp![row] + tmp![row + 1] + tmp![row + 2];
              }
              nv = cur + (s / 27 - cur) * Math.min(1, strength * soft(t2));
              break;
            }
          }
          if (nv === cur) continue;
          if (log) this.save(log, (x >> 4) + this.ncx * ((y >> 4) + this.ncy * (z >> 4)));
          v[o] = nv;
          if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y; if (z < mz0) mz0 = z; if (z > mz1) mz1 = z;
        }
      }
    }
    if (mx1 >= 0) this.touch(mx0, mx1, my0, my1, mz0, mz1);
  }

  /** 抓：记下附近一块的原始值，之后每次移动都从原始值重新变形 */
  grabBegin(p: Vec3, n: Vec3, sym: StrokeSym | null, r: number): GrabState | null {
    const cp = expandDab(p, n, sym, r, [0, 0, 0]);
    const pad = r * 1.7;
    const b = this.cellBox([cp.min[0] - pad, cp.min[1] - pad, cp.min[2] - pad], [cp.max[0] + pad, cp.max[1] + pad, cp.max[2] + pad]);
    if (!b) return null;
    const [x0, x1, y0, y1, z0, z1] = b;
    const w = x1 - x0 + 1, snap = new Float32Array(w * (y1 - y0 + 1) * (z1 - z0 + 1));
    let o = 0;
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) { const s = x0 + this.nx * (y + this.ny * z); snap.set(this.v.subarray(s, s + w), o); o += w; }
    return { x0, y0, z0, x1, y1, z1, snap, p, n, sym, r, last: null };
  }

  grabUpdate(st: GrabState, delta: Vec3, log: UndoLog | null): void {
    const gl = Math.hypot(delta[0], delta[1], delta[2]), lim = st.r * 1.6;
    const d: Vec3 = gl > lim ? [delta[0] * lim / gl, delta[1] * lim / gl, delta[2] * lim / gl] : delta;
    const cp = expandDab(st.p, st.n, st.sym, st.r, d);
    const { nx, ny, v } = this, { min, cell } = this.spec;
    const sw = st.x1 - st.x0 + 1, sh = st.y1 - st.y0 + 1, sd = st.z1 - st.z0 + 1;
    const cur = this.cellBox(
      [cp.min[0] + Math.min(0, d[0]), cp.min[1] + Math.min(0, d[1]), cp.min[2] + Math.min(0, d[2])],
      [cp.max[0] + Math.max(0, d[0]), cp.max[1] + Math.max(0, d[1]), cp.max[2] + Math.max(0, d[2])],
    );
    if (!cur) return;
    const L = st.last ?? cur;
    const bx0 = Math.max(st.x0, Math.min(cur[0], L[0])), bx1 = Math.min(st.x1, Math.max(cur[1], L[1]));
    const by0 = Math.max(st.y0, Math.min(cur[2], L[2])), by1 = Math.min(st.y1, Math.max(cur[3], L[3]));
    const bz0 = Math.max(st.z0, Math.min(cur[4], L[4])), bz1 = Math.min(st.z1, Math.max(cur[5], L[5]));
    st.last = [Math.max(st.x0, cur[0]), Math.min(st.x1, cur[1]), Math.max(st.y0, cur[2]), Math.min(st.y1, cur[3]), Math.max(st.z0, cur[4]), Math.min(st.z1, cur[5])];
    const r2 = st.r * st.r, inv = 1 / r2;
    const sample = (gx: number, gy: number, gz: number) => {
      // gx.. 为格子坐标（浮点），在快照范围内三线性插值
      const fx = Math.min(sw - 1.0001, Math.max(0, gx - st.x0)), fy = Math.min(sh - 1.0001, Math.max(0, gy - st.y0)), fz = Math.min(sd - 1.0001, Math.max(0, gz - st.z0));
      const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const o = ix + sw * (iy + sh * iz), s = st.snap;
      const a = s[o] + (s[o + 1] - s[o]) * tx, b = s[o + sw] + (s[o + sw + 1] - s[o + sw]) * tx;
      const c = s[o + sw * sh] + (s[o + sw * sh + 1] - s[o + sw * sh]) * tx, e = s[o + sw * sh + sw] + (s[o + sw * sh + sw + 1] - s[o + sw * sh + sw]) * tx;
      const f = a + (b - a) * ty, g = c + (e - c) * ty;
      return f + (g - f) * tz;
    };
    let any = false;
    for (let z = bz0; z <= bz1; z++) {
      const wz = min[2] + z * cell;
      for (let y = by0; y <= by1; y++) {
        const wy = min[1] + y * cell;
        let o = bx0 + nx * (y + ny * z);
        for (let x = bx0; x <= bx1; x++, o++) {
          const wx = min[0] + x * cell;
          const k = this.nearest(cp, wx, wy, wz, 1, 1, 1);
          const gx = cp.g![k * 3], gy = cp.g![k * 3 + 1], gz = cp.g![k * 3 + 2];
          const ex = wx - cp.c[k * 3] - gx, ey = wy - cp.c[k * 3 + 1] - gy, ez = wz - cp.c[k * 3 + 2] - gz;
          const d2 = ex * ex + ey * ey + ez * ez;
          const w = d2 < r2 ? soft(d2 * inv) : 0;
          const nv = w > 0 ? sample(x - (w * gx) / cell, y - (w * gy) / cell, z - (w * gz) / cell) : st.snap[x - st.x0 + sw * (y - st.y0 + sh * (z - st.z0))];
          if (nv === v[o]) continue;
          if (log) this.save(log, (x >> 4) + this.ncx * ((y >> 4) + this.ncy * (z >> 4)));
          v[o] = nv;
          any = true;
        }
      }
    }
    if (any) this.touch(bx0, bx1, by0, by1, bz0, bz1);
  }

  /** 网格值的三线性插值（格子坐标） */
  private at(fx: number, fy: number, fz: number): number {
    const { nx, ny, nz, v } = this;
    const x = Math.min(nx - 1.0001, Math.max(0, fx)), y = Math.min(ny - 1.0001, Math.max(0, fy)), z = Math.min(nz - 1.0001, Math.max(0, fz));
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), tx = x - ix, ty = y - iy, tz = z - iz;
    const o = ix + nx * (iy + ny * iz), sy = nx, sz = nx * ny;
    const a = v[o] + (v[o + 1] - v[o]) * tx, b = v[o + sy] + (v[o + sy + 1] - v[o + sy]) * tx;
    const c = v[o + sz] + (v[o + sz + 1] - v[o + sz]) * tx, d = v[o + sz + sy] + (v[o + sz + sy + 1] - v[o + sz + sy]) * tx;
    const e = a + (b - a) * ty, f = c + (d - c) * ty;
    return e + (f - e) * tz;
  }

  meshChunk(ci: number, owner: (x: number, y: number, z: number) => number): ChunkMesh | null {
    const { nx, ny, nz, v } = this, { min, cell } = this.spec;
    const [x0, x1, y0, y1, z0, z1] = this.chunkPts(ci);
    const ax = Math.max(0, x0 - 1), bx = Math.min(x1, nx - 1), ay = Math.max(0, y0 - 1), by = Math.min(y1, ny - 1), az = Math.max(0, z0 - 1), bz = Math.min(z1, nz - 1);
    if (bx <= ax || by <= ay || bz <= az) return null;
    let neg = false, pos = false;
    for (let z = az; z <= bz && !(neg && pos); z++) for (let y = ay; y <= by; y++) {
      let o = ax + nx * (y + ny * z);
      for (let x = ax; x <= bx; x++, o++) { if (v[o] < 0) neg = true; else pos = true; }
    }
    if (!(neg && pos)) return null;
    const lw = bx - ax, lh = by - ay;
    const vid = new Int32Array(lw * lh * (bz - az)).fill(-1);
    const P: number[] = [], C: number[] = [];
    const cv = new Float64Array(8);
    for (let z = az; z < bz; z++) for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
      let mask = 0;
      for (let k = 0; k < 8; k++) {
        const c = CORNERS[k];
        cv[k] = v[x + c[0] + nx * (y + c[1] + ny * (z + c[2]))];
        if (cv[k] < 0) mask |= 1 << k;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of EDGES) {
        const va = cv[a], vb = cv[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb), A = CORNERS[a], B = CORNERS[b];
        sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t;
        n++;
      }
      vid[x - ax + lw * (y - ay + lh * (z - az))] = C.length;
      C.push(x + nx * (y + ny * z));
      P.push(x + sx / n, y + sy / n, z + sz / n);
    }
    const cellAt = (x: number, y: number, z: number) => vid[x - ax + lw * (y - ay + lh * (z - az))];
    const idx: number[] = [];
    const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
    };
    const val = (x: number, y: number, z: number) => v[x + nx * (y + ny * z)] < 0;
    const zl = Math.max(z0, 1), zh = Math.min(z1, nz - 1), yl = Math.max(y0, 1), yh = Math.min(y1, ny - 1), xl = Math.max(x0, 1), xh = Math.min(x1, nx - 1);
    for (let z = zl; z < zh; z++) for (let y = yl; y < yh; y++) for (let x = x0; x < Math.min(x1, nx - 1); x++) {
      const a = val(x, y, z);
      if (a === val(x + 1, y, z)) continue;
      quad(cellAt(x, y - 1, z - 1), cellAt(x, y, z - 1), cellAt(x, y, z), cellAt(x, y - 1, z), !a);
    }
    for (let z = zl; z < zh; z++) for (let y = y0; y < Math.min(y1, ny - 1); y++) for (let x = xl; x < xh; x++) {
      const a = val(x, y, z);
      if (a === val(x, y + 1, z)) continue;
      quad(cellAt(x - 1, y, z - 1), cellAt(x - 1, y, z), cellAt(x, y, z), cellAt(x, y, z - 1), !a);
    }
    for (let z = z0; z < Math.min(z1, nz - 1); z++) for (let y = yl; y < yh; y++) for (let x = xl; x < xh; x++) {
      const a = val(x, y, z);
      if (a === val(x, y, z + 1)) continue;
      quad(cellAt(x - 1, y - 1, z), cellAt(x, y - 1, z), cellAt(x, y, z), cellAt(x - 1, y, z), !a);
    }
    if (!idx.length) return null;
    const remap = new Int32Array(C.length).fill(-1);
    let nv = 0;
    for (const i of idx) if (remap[i] < 0) remap[i] = nv++;
    const pos3 = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), cid = new Uint32Array(nv);
    const mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
    const vOwn = new Int16Array(nv);
    for (let i = 0; i < C.length; i++) {
      const j = remap[i];
      if (j < 0) continue;
      const gx = P[i * 3], gy = P[i * 3 + 1], gz = P[i * 3 + 2];
      const wx = min[0] + gx * cell, wy = min[1] + gy * cell, wz = min[2] + gz * cell;
      pos3[j * 3] = wx; pos3[j * 3 + 1] = wy; pos3[j * 3 + 2] = wz;
      const h = 0.5;
      let ddx = this.at(gx + h, gy, gz) - this.at(gx - h, gy, gz), ddy = this.at(gx, gy + h, gz) - this.at(gx, gy - h, gz), ddz = this.at(gx, gy, gz + h) - this.at(gx, gy, gz - h);
      const l = Math.hypot(ddx, ddy, ddz) || 1;
      ddx /= l; ddy /= l; ddz /= l;
      nrm[j * 3] = ddx; nrm[j * 3 + 1] = ddy; nrm[j * 3 + 2] = ddz;
      cid[j] = C[i];
      vOwn[j] = owner(wx, wy, wz);
      if (wx < mn[0]) mn[0] = wx; if (wy < mn[1]) mn[1] = wy; if (wz < mn[2]) mn[2] = wz;
      if (wx > mx[0]) mx[0] = wx; if (wy > mx[1]) mx[1] = wy; if (wz > mx[2]) mx[2] = wz;
    }
    const ix = new Uint32Array(idx.length), own = new Int16Array(idx.length / 3);
    for (let i = 0; i < idx.length; i++) ix[i] = remap[idx[i]];
    for (let t = 0; t < own.length; t++) own[t] = vOwn[ix[t * 3]];
    return { pos: pos3, nrm, idx: ix, own, cid, min: mn, max: mx };
  }

  /** 重新网格化所有脏块，返回受影响的大块编号 */
  remesh(owner: (x: number, y: number, z: number) => number): number[] {
    const supers = new Set<number>();
    for (const ci of this.dirty) {
      const before = this.meshes.get(ci);
      const m = this.meshChunk(ci, owner);
      if (m || before) supers.add(this.superOf(ci));
      this.meshes.set(ci, m);
    }
    this.dirty.clear();
    return [...supers];
  }

  superMesh(si: number): SuperMesh | null {
    const sx = si % this.nsx, sy = Math.floor(si / this.nsx) % this.nsy, sz = Math.floor(si / (this.nsx * this.nsy));
    const parts: ChunkMesh[] = [];
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const cx = sx * 2 + dx, cy = sy * 2 + dy, cz = sz * 2 + dz;
      if (cx >= this.ncx || cy >= this.ncy || cz >= this.ncz) continue;
      const m = this.meshes.get(cx + this.ncx * (cy + this.ncy * cz));
      if (m) parts.push(m);
    }
    if (!parts.length) return null;
    let nv = 0, nt = 0;
    for (const m of parts) { nv += m.pos.length / 3; nt += m.own.length; }
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), tri = new Uint32Array(nt * 3), own = new Int16Array(nt);
    const mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
    let vo = 0, to = 0;
    for (const m of parts) {
      pos.set(m.pos, vo * 3); nrm.set(m.nrm, vo * 3);
      for (let i = 0; i < m.idx.length; i++) tri[to * 3 + i] = m.idx[i] + vo;
      own.set(m.own, to);
      vo += m.pos.length / 3; to += m.own.length;
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.min[k]); mx[k] = Math.max(mx[k], m.max[k]); }
    }
    // 三角形按部件排序，分组渲染
    const counts = new Map<number, number>();
    for (let t = 0; t < nt; t++) counts.set(own[t], (counts.get(own[t]) ?? 0) + 1);
    const keys = [...counts.keys()].sort((a, b) => a - b);
    const start = new Map<number, number>(), groups: Array<[number, number, number]> = [];
    let acc = 0;
    for (const k of keys) { start.set(k, acc); groups.push([acc * 3, counts.get(k)! * 3, k]); acc += counts.get(k)!; }
    const idx = new Uint32Array(nt * 3);
    for (let t = 0; t < nt; t++) {
      const p = start.get(own[t])!;
      start.set(own[t], p + 1);
      idx[p * 3] = tri[t * 3]; idx[p * 3 + 1] = tri[t * 3 + 1]; idx[p * 3 + 2] = tri[t * 3 + 2];
    }
    return { key: si, pos, nrm, idx, groups, min: mn, max: mx };
  }

  allSupers(): number[] {
    const s = new Set<number>();
    for (const [ci, m] of this.meshes) if (m) s.add(this.superOf(ci));
    return [...s];
  }

  /** 焊接后的整体网格（打印、导出用） */
  fullMesh(): MeshData {
    const map = new Map<number, number>();
    const P: number[] = [], N: number[] = [], O: number[] = [], I: number[] = [];
    for (const m of this.meshes.values()) {
      if (!m) continue;
      const local = new Uint32Array(m.cid.length);
      for (let i = 0; i < m.cid.length; i++) {
        let g = map.get(m.cid[i]);
        if (g === undefined) {
          g = P.length / 3;
          map.set(m.cid[i], g);
          P.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
          N.push(m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]);
          O.push(-2);
        }
        local[i] = g;
      }
      for (let t = 0; t < m.own.length; t++) {
        const a = local[m.idx[t * 3]], b = local[m.idx[t * 3 + 1]], c = local[m.idx[t * 3 + 2]];
        I.push(a, b, c);
        for (const q of [a, b, c]) if (O[q] === -2) O[q] = m.own[t];
      }
    }
    return { positions: new Float32Array(P), normals: new Float32Array(N), indices: new Uint32Array(I), owners: Int16Array.from(O, (o) => (o === -2 ? -1 : o)) };
  }

  /** 把一笔（世界坐标）完整地作用到网格上 */
  applyStroke(s: { brush: BrushKind; radius: number; strength: number; points: number[]; normals: number[]; pressure?: number[]; grab?: Vec3; sym: StrokeSym | null }, log: UndoLog | null): void {
    const P = s.points, N = s.normals;
    if (P.length < 3) return;
    if (s.brush === 'grab') {
      if (!s.grab) return;
      const st = this.grabBegin([P[0], P[1], P[2]], [N[0], N[1], N[2]], s.sym, s.radius);
      if (st) this.grabUpdate(st, s.grab, log);
      return;
    }
    for (let i = 0; i < P.length / 3; i++) {
      const p: Vec3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: Vec3 = [N[i * 3] ?? 0, N[i * 3 + 1] ?? 1, N[i * 3 + 2] ?? 0];
      this.stamp(s.brush, expandDab(p, n, s.sym, s.radius), s.radius, s.strength * pressureK(s.pressure?.[i]), log);
    }
  }

  /** 网格里泥巴的实际包围盒（由已网格化的小块汇总） */
  bounds(): { min: Vec3; max: Vec3 } | null {
    const mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const m of this.meshes.values()) {
      if (!m) continue;
      any = true;
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.min[k]); mx[k] = Math.max(mx[k], m.max[k]); }
    }
    return any ? { min: mn, max: mx } : null;
  }
}
