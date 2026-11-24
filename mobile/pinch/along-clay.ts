/**
 * Along 捏泥工作台的引擎层。泥巴本身（距离场网格、六种笔刷、对称/拉坯、分块网格化、撤销快照）
 * 原样来自「捏个 PINCH」（packages/geometry/src/clay.ts 等，团队自有代码）；这里补上手机需要的：
 * 起手形状、把 AI 生成的网格变成泥、沿视线拾取泥面、撤销/重做栈、照片投影贴图、导出用的整体网格。
 * 单位毫米，Y 轴向上，地面 y = 0。
 */
import { createScene, normalizeParams, type BrushKind, type Part, type PrimitiveKind, type Scene, type StrokeSym, type Vec3 } from './core';
import { ClayGrid, claySpec, expandDab, pressureK, type SuperMesh, type UndoLog } from './geometry/clay';
import { compileScene } from './geometry/field';
import { edt3, occupancy } from './geometry/voxel';
import { meshBounds, volumeArea, weld, edgeStats } from './geometry/mesh-utils';
import type { MeshData } from './geometry/surfacenets';

export type { BrushKind, StrokeSym, Vec3, SuperMesh, MeshData };
export { volumeArea, weld, edgeStats, meshBounds };

export interface ClayStroke {
  id: string;
  brush: BrushKind;
  radius: number;
  strength: number;
  points: number[];
  normals: number[];
  pressure?: number[];
  grab?: Vec3;
  sym: StrokeSym | null;
}
export type ClayChange = Array<SuperMesh | { key: number; removed: true }>;

// ───────── 起手形状 ─────────

function part(id: string, primitive: PrimitiveKind, params: Record<string, number>, position: Vec3, extra: Partial<Part> = {}): Part {
  return {
    id, label: id, aliases: [], primitive, params: normalizeParams(primitive, params),
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, attach: null, blend: 0, mode: 'solid',
    material: { preset: 'clay', color: '#c98a5e', roughness: 0.85, metallic: 0, useTexture: false },
    symmetry: null, locked: false, ...extra,
  };
}
const scene = (parts: Part[]): Scene => ({ ...createScene('Along'), parts });

// ───────── 彩色部件布局（AI 照片生成、画廊示例都用它） ─────────

/** 一个部件：基本体 + 尺寸 + 位置 + 颜色。和「捏个 PINCH」的布局行同一种写法。 */
export interface LayoutPart {
  id?: string;
  primitive: PrimitiveKind;
  params: Record<string, number>;
  position: Vec3;
  rotation?: Vec3;
  color?: string;
  mode?: 'solid' | 'hole';
  blend?: number;
  mirrorOf?: string;
}
const PRIMITIVE_KINDS: PrimitiveKind[] = ['sphere', 'box', 'cylinder', 'cone', 'capsule', 'torus', 'prism'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec = (v: unknown, fallback: Vec3): Vec3 => (Array.isArray(v) && v.length === 3 && v.every(finite) ? [v[0], v[1], v[2]] as Vec3 : fallback);

/**
 * 把模型给的布局变成场景：丢掉看不懂的行、补默认值、按 PINCH 的 mirrorOf 规则补出右边那一个，
 * 再整体放到地面上、最长边缩放到 size 毫米。最多 24 个部件。
 */
export function sceneFromLayout(input: unknown[], size = 72): { scene: Scene; colors: string[] } {
  const parts: Part[] = [];
  const colors: string[] = [];
  const byId = new Map<string, Part>();
  for (const raw of Array.isArray(input) ? input.slice(0, 40) : []) {
    if (parts.length >= 24 || !raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.slice(0, 32) : `p${parts.length}`;
    if (typeof o.mirrorOf === 'string') {
      const src = byId.get(o.mirrorOf);
      if (!src) continue;
      const m: Part = { ...src, id, params: { ...src.params }, transform: { position: [-src.transform.position[0], src.transform.position[1], src.transform.position[2]], rotation: [src.transform.rotation[0], -src.transform.rotation[1], -src.transform.rotation[2]], scale: [...src.transform.scale] as Vec3 } };
      parts.push(m); colors.push(colors[parts.indexOf(src)]); byId.set(id, m);
      continue;
    }
    if (!PRIMITIVE_KINDS.includes(o.primitive as PrimitiveKind)) continue;
    const params: Record<string, number> = {};
    for (const [k, v] of Object.entries((o.params as Record<string, unknown>) || {})) if (k.length <= 16 && finite(v)) params[k] = v;
    const p = part(id, o.primitive as PrimitiveKind, params, vec(o.position, [0, 0, 0]), {
      mode: o.mode === 'hole' ? 'hole' : 'solid',
      blend: finite(o.blend) ? Math.max(0, Math.min(12, o.blend)) : 1.5,
    });
    p.transform.rotation = vec(o.rotation, [0, 0, 0]).map((a) => Math.max(-360, Math.min(360, a))) as Vec3;
    parts.push(p); colors.push(typeof o.color === 'string' && HEX.test(o.color) ? o.color.toLowerCase() : '#c98a5e'); byId.set(id, p);
  }
  if (!parts.some((p) => p.mode === 'solid')) throw new Error('LAYOUT_EMPTY');
  // 放到地面上，统一缩放
  const f = compileScene(scene(parts));
  const ext = Math.max(f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]) || 1;
  const k = size / ext, cx = (f.min[0] + f.max[0]) / 2, cz = (f.min[2] + f.max[2]) / 2, y0 = f.min[1];
  for (const p of parts) {
    const t = p.transform.position;
    p.transform.position = [(t[0] - cx) * k, (t[1] - y0) * k, (t[2] - cz) * k];
    p.transform.scale = p.transform.scale.map((s) => s * k) as Vec3;
    p.blend *= k;
  }
  return { scene: scene(parts), colors };
}

export const TEMPLATE_KEYS = ['lump', 'tile', 'cup', 'hut'] as const;
export type TemplateKey = typeof TEMPLATE_KEYS[number];
/** 每个起手形状默认用哪种对称：杯子适合拉坯，其余左右对称 */
export const TEMPLATE_SYMMETRY: Record<TemplateKey, 'mirror' | 'radial' | 'none'> = { lump: 'mirror', tile: 'none', cup: 'radial', hut: 'mirror' };

export function templateScene(key: TemplateKey): Scene {
  switch (key) {
    case 'lump': {
      const p = part('clay', 'sphere', { r: 32 }, [0, 25, 0]);
      p.transform.scale = [1.12, 0.78, 1.12];
      return scene([p]);
    }
    // 一块圆饼，正面朝向镜头：适合贴一张风景照，做成冰箱贴或摆件
    case 'tile': {
      const p = part('tile', 'cylinder', { r: 34, h: 9, bevel: 3 }, [0, 34, 0]);
      p.transform.rotation = [90, 0, 0];
      return scene([p]);
    }
    case 'cup': return scene([part('cup', 'cylinder', { r: 26, h: 56, wall: 3.4, floor: 4, bevel: 1.5 }, [0, 28, 0])]);
    case 'hut': return scene([
      part('body', 'box', { w: 42, h: 34, d: 36, bevel: 3 }, [0, 17, 0], { blend: 2 }),
      part('roof', 'cone', { r1: 33, r2: 1, h: 26 }, [0, 46, 0], { blend: 2 }),
    ]);
  }
}

// ───────── 网格 → 泥 ─────────

/** 把任意三角网格（AI 生成的、画廊下载的）放到地面上，最长边缩放到 size 毫米 */
export function normalizeMesh(m: MeshData, size = 70): MeshData {
  const b = meshBounds(m);
  const ext = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) || 1;
  const k = size / ext, cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const p = new Float32Array(m.positions.length);
  for (let i = 0; i < p.length; i += 3) {
    p[i] = (m.positions[i] - cx) * k;
    p[i + 1] = (m.positions[i + 1] - b.min[1]) * k;
    p[i + 2] = (m.positions[i + 2] - cz) * k;
  }
  return { positions: p, normals: m.normals, indices: m.indices };
}

function blur(g: ClayGrid, passes: number): void {
  const { nx, ny, nz, v } = g;
  const tmp = new Float32Array(v.length);
  for (let pass = 0; pass < passes; pass++) {
    tmp.set(v);
    for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) {
      let o = 1 + nx * (y + ny * z);
      for (let x = 1; x < nx - 1; x++, o++) {
        // 只在表面附近抹：远处的值不影响网格
        if (Math.abs(tmp[o]) > g.spec.cell * 3) continue;
        v[o] = (tmp[o] * 2 + tmp[o - 1] + tmp[o + 1] + tmp[o - nx] + tmp[o + nx] + tmp[o - nx * ny] + tmp[o + nx * ny]) / 8;
      }
    }
  }
}

// ───────── 引擎 ─────────

const LOG_KEEP = 40;
const DEPTH_LIMIT = 4000;

export class AlongClay {
  readonly grid: ClayGrid;
  private base: Float32Array;
  private done: Array<{ s: ClayStroke; log: UndoLog | null }> = [];
  private undone: ClayStroke[] = [];
  private live: { s: ClayStroke; log: UndoLog; grab: ReturnType<ClayGrid['grabBegin']> } | null = null;
  /** 每个顶点属于哪个部件：彩色作品按部件分组上色；单色泥巴全是 0 */
  private owner: (x: number, y: number, z: number) => number = () => 0;
  /** 部件颜色（下标对应 SuperMesh.groups 里的部件号）；空数组表示整块一个颜色 */
  colors: string[] = [];

  private constructor(grid: ClayGrid) {
    this.grid = grid;
    this.base = grid.v.slice();
  }

  static fromTemplate(key: TemplateKey, res = 96): AlongClay {
    return AlongClay.fromScene(templateScene(key), [], res);
  }

  /** 任意部件场景 → 泥。给了颜色就按部件着色，之后捏出来的泥归最近的部件。 */
  static fromScene(s: Scene, colors: string[] = [], res = 96): AlongClay {
    const f = compileScene(s);
    if (f.empty) throw new Error('SCENE_EMPTY');
    // 网格留出余量，堆泥时不会顶到边
    const g = new ClayGrid(claySpec(f.min, f.max, res));
    g.sample(f.field);
    const clay = new AlongClay(g);
    if (colors.length) { clay.owner = (x, y, z) => Math.max(0, f.owner(x, y, z)); clay.colors = colors.slice(); }
    return clay;
  }

  /** 体素化：三个轴向射线奇偶投票判断内外，再做精确距离变换，最后轻轻抹一遍去掉台阶 */
  static fromMesh(mesh: MeshData, res = 96): AlongClay {
    const b = meshBounds(mesh);
    const spec = claySpec(b.min, b.max, res);
    const occ = occupancy(mesh, { min: [...spec.min] as [number, number, number], cell: spec.cell, dims: spec.dims });
    const dIn = edt3((i) => occ[i] === 1, spec.dims), dOut = edt3((i) => occ[i] === 0, spec.dims);
    const g = new ClayGrid(spec);
    let solid = 0;
    for (let i = 0; i < occ.length; i++) {
      if (occ[i]) solid++;
      g.v[i] = occ[i] ? -(Math.sqrt(dOut[i]) - 0.5) * spec.cell : (Math.sqrt(dIn[i]) - 0.5) * spec.cell;
    }
    if (!solid) throw new Error('MESH_EMPTY');
    blur(g, 2);
    g.markAll();
    return new AlongClay(g);
  }

  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }
  get strokes(): ClayStroke[] { return this.done.map((d) => d.s); }
  get cell() { return this.grid.spec.cell; }

  private trim(): void {
    for (let i = 0; i < this.done.length - LOG_KEEP; i++) this.done[i].log = null;
  }
  private changes(full = false): ClayChange {
    const touched = this.grid.remesh(this.owner);
    const keys = full ? this.grid.allSupers() : touched;
    return keys.map((k) => this.grid.superMesh(k) ?? { key: k, removed: true as const });
  }
  /** 所有大块（打开工作台、切换形状时用） */
  all(): ClayChange { return this.changes(true); }

  /** 一次性重放保存过的笔触 */
  replay(strokes: ClayStroke[]): ClayChange {
    for (const s of strokes) {
      const log = this.grid.newLog();
      this.grid.applyStroke(s, log);
      this.done.push({ s, log });
    }
    this.undone = [];
    this.trim();
    return this.changes(true);
  }

  begin(s: ClayStroke): void {
    if (this.live) this.cancel();
    const log = this.grid.newLog();
    const grab = s.brush === 'grab' && s.points.length >= 3
      ? this.grid.grabBegin([s.points[0], s.points[1], s.points[2]], [s.normals[0], s.normals[1], s.normals[2]], s.sym, s.radius)
      : null;
    this.live = { s: { ...s, points: [...s.points], normals: [...s.normals] }, log, grab };
  }
  dab(p: Vec3, n: Vec3, pressure?: number): ClayChange {
    const L = this.live;
    if (!L || L.s.brush === 'grab') return [];
    L.s.points.push(...p); L.s.normals.push(...n);
    if (pressure !== undefined) (L.s.pressure ??= []).push(pressure);
    this.grid.stamp(L.s.brush, expandDab(p, n, L.s.sym, L.s.radius), L.s.radius, L.s.strength * pressureK(pressure), L.log);
    return this.changes();
  }
  grab(delta: Vec3): ClayChange {
    const L = this.live;
    if (!L?.grab) return [];
    this.grid.grabUpdate(L.grab, delta, L.log);
    L.s.grab = delta;
    return this.changes();
  }
  end(): ClayChange {
    const L = this.live;
    if (!L) return [];
    this.live = null;
    const empty = L.s.brush === 'grab' ? !L.s.grab : L.s.points.length < 3;
    if (empty) { this.grid.restore(L.log); return this.changes(); }
    this.done.push({ s: L.s, log: L.log });
    this.undone = [];
    this.trim();
    return this.changes();
  }
  cancel(): ClayChange {
    const L = this.live;
    if (!L) return [];
    this.live = null;
    this.grid.restore(L.log);
    return this.changes();
  }
  undo(): ClayChange {
    if (this.live) this.cancel();
    const last = this.done.pop();
    if (!last) return [];
    this.undone.push(last.s);
    if (last.log) { this.grid.restore(last.log); return this.changes(); }
    // 太早的笔触已经没有快照：回到起手形状重放
    const keep = this.done.map((d) => d.s);
    this.grid.v.set(this.base);
    this.grid.markAll();
    this.done = [];
    for (const s of keep) { const log = this.grid.newLog(); this.grid.applyStroke(s, log); this.done.push({ s, log }); }
    this.trim();
    return this.changes(true);
  }
  redo(): ClayChange {
    const s = this.undone.pop();
    if (!s) return [];
    const log = this.grid.newLog();
    this.grid.applyStroke(s, log);
    this.done.push({ s, log });
    this.trim();
    return this.changes();
  }

  /** 网格值的三线性插值（世界坐标）；网格外返回很大的正数 */
  value(x: number, y: number, z: number): number {
    const g = this.grid, { min, cell } = g.spec;
    const fx = (x - min[0]) / cell, fy = (y - min[1]) / cell, fz = (z - min[2]) / cell;
    if (fx < 0 || fy < 0 || fz < 0 || fx > g.nx - 1.001 || fy > g.ny - 1.001 || fz > g.nz - 1.001) return 1e3;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const v = g.v, sy = g.nx, sz = g.nx * g.ny, o = ix + sy * iy + sz * iz;
    const a = v[o] + (v[o + 1] - v[o]) * tx, b = v[o + sy] + (v[o + sy + 1] - v[o + sy]) * tx;
    const c = v[o + sz] + (v[o + sz + 1] - v[o + sz]) * tx, d = v[o + sz + sy] + (v[o + sz + sy + 1] - v[o + sz + sy]) * tx;
    const e = a + (b - a) * ty, f = c + (d - c) * ty;
    return e + (f - e) * tz;
  }
  normal(p: Vec3): Vec3 {
    const h = this.cell * 0.7;
    const n: Vec3 = [
      this.value(p[0] + h, p[1], p[2]) - this.value(p[0] - h, p[1], p[2]),
      this.value(p[0], p[1] + h, p[2]) - this.value(p[0], p[1] - h, p[2]),
      this.value(p[0], p[1], p[2] + h) - this.value(p[0], p[1], p[2] - h),
    ];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }

  /** 沿视线找泥面：按距离值步进，越过表面后二分。返回交点、法线和沿射线的距离 */
  raycast(origin: Vec3, dir: Vec3): { point: Vec3; normal: Vec3; t: number } | null {
    const g = this.grid, { min, cell } = g.spec;
    const max: Vec3 = [min[0] + (g.nx - 1) * cell, min[1] + (g.ny - 1) * cell, min[2] + (g.nz - 1) * cell];
    let t0 = 0, t1 = DEPTH_LIMIT;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dir[k]) < 1e-9) { if (origin[k] < min[k] || origin[k] > max[k]) return null; continue; }
      let a = (min[k] - origin[k]) / dir[k], b = (max[k] - origin[k]) / dir[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 > t1) return null;
    const at = (t: number) => this.value(origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t);
    let t = t0 + cell * 0.01, prev = at(t);
    if (prev < 0) return null;
    for (let i = 0; i < 2000 && t < t1; i++) {
      const step = Math.max(cell * 0.35, prev * 0.8);
      const next = t + step, v = at(next);
      if (v < 0) {
        let lo = t, hi = next;
        for (let j = 0; j < 12; j++) { const mid = (lo + hi) / 2; if (at(mid) < 0) hi = mid; else lo = mid; }
        const point: Vec3 = [origin[0] + dir[0] * hi, origin[1] + dir[1] * hi, origin[2] + dir[2] * hi];
        return { point, normal: this.normal(point), t: hi };
      }
      t = next; prev = v;
    }
    return null;
  }

  bounds() { return this.grid.bounds(); }
  /** 焊接后的整体网格：一定闭合，可直接打印或上传 */
  fullMesh(): MeshData {
    this.grid.remesh(this.owner);
    return this.grid.fullMesh();
  }
}

// ───────── 照片投影 ─────────

/**
 * 两种贴法：view = 从当前视角像投影仪一样投上去（背面不贴）；wrap = 绕竖轴包一圈（杯子、瓶子）。
 * 贴图画布四周留一圈泥色，不该贴的地方指向那一圈。纹理坐标原点在左上角（与 glTF 一致）。
 */
export interface Projector {
  kind: 'view' | 'wrap';
  center: Vec3;
  /** view：投影方向（指向泥）、画面的右和上；wrap：不用 */
  forward: Vec3; right: Vec3; up: Vec3;
  /** 照片覆盖的半宽、半高（毫米）；wrap 时 halfH 为半高，halfW 不用 */
  halfW: number; halfH: number;
  /** 画布边上泥色那一圈占的比例 */
  margin: number;
}
const dot3 = (a: ArrayLike<number>, i: number, b: Vec3) => a[i] * b[0] + a[i + 1] * b[1] + a[i + 2] * b[2];

export function projectUVs(positions: Float32Array, normals: Float32Array, p: Projector): Float32Array {
  const uv = new Float32Array((positions.length / 3) * 2);
  const m = p.margin, span = 1 - 2 * m, blank = m * 0.4;
  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
    let u = -1, v = -1;
    if (p.kind === 'view') {
      if (dot3(normals, i, p.forward) < -0.12) {
        const dx = positions[i] - p.center[0], dy = positions[i + 1] - p.center[1], dz = positions[i + 2] - p.center[2];
        u = (dx * p.right[0] + dy * p.right[1] + dz * p.right[2]) / (2 * p.halfW) + 0.5;
        v = 0.5 - (dx * p.up[0] + dy * p.up[1] + dz * p.up[2]) / (2 * p.halfH);
      }
    } else if (Math.abs(normals[i + 1]) < 0.8) {
      const dx = positions[i] - p.center[0], dz = positions[i + 2] - p.center[2];
      u = Math.atan2(dx, dz) / (2 * Math.PI) + 0.5;
      v = 0.5 - (positions[i + 1] - p.center[1]) / (2 * p.halfH);
    }
    if (u < 0 || u > 1 || v < 0 || v > 1) { uv[j] = blank; uv[j + 1] = blank; }
    else { uv[j] = m + u * span; uv[j + 1] = m + v * span; }
  }
  return uv;
}

/** 让照片按比例盖满泥在投影方向上的轮廓 */
export function fitProjector(positions: Float32Array, kind: Projector['kind'], forward: Vec3, up: Vec3, aspect: number, scale = 1): Projector {
  const f = unit(forward), r = unit(cross(f, up)), u = cross(r, f);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], positions[i + k]); hi[k] = Math.max(hi[k], positions[i + k]); }
  }
  if (!Number.isFinite(lo[0])) { lo = [0, 0, 0]; hi = [0, 0, 0]; }
  const center: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const margin = 0.02;
  if (kind === 'wrap') return { kind, center, forward: f, right: r, up: u, halfW: 1, halfH: Math.max(1, (hi[1] - lo[1]) / 2) / scale, margin };
  let w = 0, h = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - center[0], dy = positions[i + 1] - center[1], dz = positions[i + 2] - center[2];
    w = Math.max(w, Math.abs(dx * r[0] + dy * r[1] + dz * r[2]));
    h = Math.max(h, Math.abs(dx * u[0] + dy * u[1] + dz * u[2]));
  }
  // cover：照片的短边对齐轮廓，长边多出来的部分裁掉
  let halfW = Math.max(w, 1), halfH = Math.max(h, 1);
  if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
  return { kind, center, forward: f, right: r, up: u, halfW: halfW / scale, halfH: halfH / scale, margin };
}
function unit(v: Vec3): Vec3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

export function newStrokeId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}
