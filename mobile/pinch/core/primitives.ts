// 来源：捏个 PINCH（packages/core/src/primitives.ts），团队自有代码，原样移植。
import type { PrimitiveKind, Vec3 } from './types';

export interface ParamSpec {
  key: string;
  name: string;
  min: number;
  max: number;
  def: number;
  step: number;
  unit: 'mm' | '°' | '';
}

export interface PrimitiveSpec {
  kind: PrimitiveKind;
  name: string;
  code: string;
  params: ParamSpec[];
}

const mm = (key: string, name: string, min: number, max: number, def: number, step = 0.5): ParamSpec =>
  ({ key, name, min, max, def, step, unit: 'mm' });

export const PRIMITIVES: Record<PrimitiveKind, PrimitiveSpec> = {
  sphere: { kind: 'sphere', name: '球', code: 'SPH', params: [mm('r', '半径', 0.5, 300, 20)] },
  box: {
    kind: 'box', name: '方块', code: 'BOX', params: [
      mm('w', '宽', 0.5, 600, 40), mm('h', '高', 0.5, 600, 40), mm('d', '深', 0.5, 600, 40),
      mm('bevel', '圆角', 0, 100, 2, 0.2), mm('wall', '壁厚', 0, 50, 0, 0.2), mm('floor', '底厚', 0, 50, 2, 0.2),
    ],
  },
  cylinder: {
    kind: 'cylinder', name: '圆柱', code: 'CYL', params: [
      mm('r', '半径', 0.5, 300, 20), mm('h', '高', 0.5, 600, 40), mm('bevel', '圆角', 0, 100, 1, 0.2),
      mm('wall', '壁厚', 0, 50, 0, 0.2), mm('floor', '底厚', 0, 50, 2, 0.2), mm('flat', '切平', 0, 300, 0, 0.2),
    ],
  },
  cone: {
    kind: 'cone', name: '圆台', code: 'CON', params: [
      mm('r1', '底半径', 0, 300, 25), mm('r2', '顶半径', 0, 300, 10), mm('h', '高', 0.5, 600, 40),
      mm('wall', '壁厚', 0, 50, 0, 0.2), mm('floor', '底厚', 0, 50, 2, 0.2),
    ],
  },
  capsule: { kind: 'capsule', name: '胶囊', code: 'CAP', params: [mm('r', '半径', 0.5, 200, 8), mm('h', '总长', 1, 600, 40)] },
  torus: {
    kind: 'torus', name: '圆环', code: 'TOR', params: [
      mm('R', '环半径', 1, 300, 20), mm('r', '管半径', 0.3, 100, 4, 0.2),
      { key: 'arc', name: '弧度', min: 10, max: 360, def: 360, step: 5, unit: '°' },
    ],
  },
  prism: {
    kind: 'prism', name: '棱柱', code: 'PRM', params: [
      { key: 'n', name: '边数', min: 3, max: 12, def: 6, step: 1, unit: '' },
      mm('r', '外接半径', 0.5, 300, 25), mm('h', '高', 0.5, 600, 40), mm('bevel', '圆角', 0, 50, 0.5, 0.2),
      mm('wall', '壁厚', 0, 50, 0, 0.2), mm('floor', '底厚', 0, 50, 2, 0.2),
    ],
  },
};

export function paramSpec(kind: PrimitiveKind, key: string): ParamSpec | undefined {
  return PRIMITIVES[kind].params.find((p) => p.key === key);
}

/** 大模型可能给出的通用参数名 → 各基本体的实际参数 */
const GENERIC: Record<string, Partial<Record<PrimitiveKind, string>>> = {
  height: { box: 'h', cylinder: 'h', cone: 'h', capsule: 'h', prism: 'h', sphere: 'r', torus: 'R' },
  width: { box: 'w', cylinder: 'r', cone: 'r1', capsule: 'r', prism: 'r', sphere: 'r', torus: 'R' },
  depth: { box: 'd', cylinder: 'r', cone: 'r1', capsule: 'r', prism: 'r', sphere: 'r', torus: 'r' },
  radius: { sphere: 'r', cylinder: 'r', cone: 'r1', capsule: 'r', prism: 'r', torus: 'R' },
  thickness: { torus: 'r', capsule: 'r', box: 'd' },
  length: { capsule: 'h', box: 'w', cylinder: 'h', cone: 'h', prism: 'h' },
};

export function resolveParamKey(kind: PrimitiveKind, key: string): string | undefined {
  if (paramSpec(kind, key)) return key;
  return GENERIC[key]?.[kind];
}

/** 参数主要影响的局部轴；-1 表示各向同性（壁厚、圆角等） */
export function paramAxis(kind: PrimitiveKind, key: string): number {
  if (key === 'h') return kind === 'torus' ? -1 : 1;
  if (key === 'd') return 2;
  if (key === 'w' || key === 'r1' || key === 'r2' || key === 'R') return 0;
  if (key === 'r') return kind === 'torus' ? -1 : 0;
  return -1;
}

/** 部件缩放对某个参数的放大倍数：实际尺寸 = 参数 × 倍数 */
export function paramScaleFactor(kind: PrimitiveKind, key: string, scale: Vec3): number {
  const spec = paramSpec(kind, key);
  if (!spec || spec.unit !== 'mm') return 1;
  const a = paramAxis(kind, key);
  return a >= 0 ? Math.abs(scale[a]) : Math.min(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]));
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 补默认值、夹到合法范围、处理参数之间的约束 */
export function normalizeParams(kind: PrimitiveKind, input: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of PRIMITIVES[kind].params) {
    const raw = input[s.key];
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : s.def;
    out[s.key] = clamp(v, s.min, s.max);
  }
  if (kind === 'prism') out.n = Math.round(out.n);
  if (kind === 'capsule') out.h = Math.max(out.h, out.r * 2);
  if (kind === 'torus') out.r = Math.min(out.r, out.R * 0.95);
  if (kind === 'box') {
    const m = Math.min(out.w, out.h, out.d) / 2;
    out.bevel = Math.min(out.bevel, m * 0.95);
    out.wall = Math.min(out.wall, Math.min(out.w, out.d) / 2 - 0.2);
    if (out.wall < 0) out.wall = 0;
  }
  if (kind === 'cylinder' || kind === 'prism') {
    out.bevel = Math.min(out.bevel, Math.min(out.r, out.h / 2) * 0.95);
    out.wall = Math.max(0, Math.min(out.wall, out.r - 0.2));
  }
  if (kind === 'cylinder') out.flat = Math.min(out.flat, out.r * 1.9);
  if (kind === 'cone') out.wall = Math.max(0, Math.min(out.wall, Math.max(out.r1, out.r2) - 0.2));
  if ('floor' in out && 'h' in out) out.floor = Math.min(out.floor, out.h - 0.2);
  return out;
}

/** 局部坐标下的半尺寸（以原点为中心） */
export function halfExtents(kind: PrimitiveKind, p: Record<string, number>): Vec3 {
  switch (kind) {
    case 'sphere': return [p.r, p.r, p.r];
    case 'box': return [p.w / 2, p.h / 2, p.d / 2];
    case 'cylinder': return [p.r, p.h / 2, p.r];
    case 'cone': { const r = Math.max(p.r1, p.r2); return [r, p.h / 2, r]; }
    case 'capsule': return [p.r, p.h / 2, p.r];
    case 'torus': return [p.R + p.r, p.R + p.r, p.r];
    case 'prism': return [p.r, p.h / 2, p.r];
  }
}

/**
 * 参数变化折算成局部三轴缩放，用于让精细网格跟随代理变形。
 * 返回 null 表示该变化无法用缩放表达（比如改了壁厚、边数），精细网格需要重新生成。
 */
export function paramAxisScale(kind: PrimitiveKind, from: Record<string, number>, to: Record<string, number>): Vec3 | null {
  const nonScaling = ['wall', 'floor', 'bevel', 'flat', 'arc', 'n'];
  for (const k of nonScaling) {
    if (k in from && Math.abs((from[k] ?? 0) - (to[k] ?? 0)) > 0.25) return null;
  }
  const q = (k: string) => (from[k] > 1e-6 ? to[k] / from[k] : 1);
  switch (kind) {
    case 'sphere': return [q('r'), q('r'), q('r')];
    case 'box': return [q('w'), q('h'), q('d')];
    case 'cylinder': case 'prism': case 'capsule': return [q('r'), q('h'), q('r')];
    case 'cone': {
      const a = Math.max(from.r1, from.r2), b = Math.max(to.r1, to.r2);
      const s = a > 1e-6 ? b / a : 1;
      return [s, q('h'), s];
    }
    case 'torus': { const s = (to.R + to.r) / (from.R + from.r); return [s, s, q('r')]; }
  }
}

/** 精细网格是否已"过期"：缩放超出 ±30% 或发生了无法缩放表达的变化 */
export function detailIsStale(kind: PrimitiveKind, from: Record<string, number>, to: Record<string, number>, bindKind: PrimitiveKind): boolean {
  if (kind !== bindKind) return true;
  const s = paramAxisScale(kind, from, to);
  if (!s) return true;
  return s.some((v) => v < 0.7 || v > 1.3);
}
