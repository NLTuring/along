// 来源：捏个 PINCH（packages/core/src/sculpt.ts），团队自有代码，原样移植。
/**
 * 捏塑笔触的坐标换算。
 * 锚定笔触存在部件的归一化局部坐标 u 里：world = R · (E ⊙ u) + t，E = 半尺寸 × 缩放。
 * 这样部件移动、旋转、拉长时，笔触跟着贴在表面上。
 */
import { eulerToMat3, transpose3, type AABB, type Mat3 } from './math';
import { halfExtents } from './primitives';
import type { BrushKind, Part, Scene, Stroke, Vec3 } from './types';

export const BRUSH_NAMES: Record<BrushKind, string> = { build: '堆', dig: '挖', smooth: '抹', flatten: '压', grab: '抓', crease: '刻' };

interface Frame { R: Mat3; Rt: Mat3; t: Vec3; E: Vec3 }

export function partFrame(p: Part): Frame {
  const R = eulerToMat3(p.transform.rotation);
  const h = halfExtents(p.primitive, p.params);
  const s = p.transform.scale;
  return {
    R, Rt: transpose3(R), t: [...p.transform.position],
    E: [Math.max(1e-6, Math.abs(h[0] * s[0])), Math.max(1e-6, Math.abs(h[1] * s[1])), Math.max(1e-6, Math.abs(h[2] * s[2]))],
  };
}

const mv = (m: Mat3, v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

type Map3 = (v: Vec3) => Vec3;
interface Maps { P: Map3; V: Map3; N: Map3 }

const frameIn = (f: Frame): Maps => ({
  P: (u) => { const w = mv(f.R, [u[0] * f.E[0], u[1] * f.E[1], u[2] * f.E[2]]); return [w[0] + f.t[0], w[1] + f.t[1], w[2] + f.t[2]]; },
  V: (u) => mv(f.R, [u[0] * f.E[0], u[1] * f.E[1], u[2] * f.E[2]]),
  N: (n) => unit(mv(f.R, [n[0] / f.E[0], n[1] / f.E[1], n[2] / f.E[2]])),
});

const frameOut = (f: Frame): Maps => ({
  P: (w) => { const u = mv(f.Rt, [w[0] - f.t[0], w[1] - f.t[1], w[2] - f.t[2]]); return [u[0] / f.E[0], u[1] / f.E[1], u[2] / f.E[2]]; },
  V: (w) => { const u = mv(f.Rt, w); return [u[0] / f.E[0], u[1] / f.E[1], u[2] / f.E[2]]; },
  N: (n) => { const u = mv(f.Rt, n); return unit([u[0] * f.E[0], u[1] * f.E[1], u[2] * f.E[2]]); },
});

function roundArr(a: number[], d: number): number[] {
  const k = 10 ** d;
  return a.map((v) => { const r = Math.round(v * k) / k; return Object.is(r, -0) ? 0 : r; });
}

function mapStroke(s: Stroke, m: Maps, rk: number, anchor: Stroke['anchor'], digits?: [number, number]): Stroke {
  const points = new Array<number>(s.points.length), normals = new Array<number>(s.normals.length);
  for (let i = 0; i < s.points.length; i += 3) {
    const p = m.P([s.points[i], s.points[i + 1], s.points[i + 2]]);
    points[i] = p[0]; points[i + 1] = p[1]; points[i + 2] = p[2];
    if (i < s.normals.length) {
      const n = m.N([s.normals[i], s.normals[i + 1], s.normals[i + 2]]);
      normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
    }
  }
  const sym: Stroke['sym'] = !s.sym ? null : s.sym.kind === 'mirror'
    ? { kind: 'mirror', point: m.P(s.sym.point), normal: m.N(s.sym.normal) }
    : { kind: 'radial', point: m.P(s.sym.point), axis: unit(m.V(s.sym.axis)) };
  const out: Stroke = { ...s, radius: s.radius * rk, anchor, points, normals, sym };
  if (s.grab) out.grab = m.V(s.grab);
  if (digits) {
    out.points = roundArr(points, digits[0]);
    out.normals = roundArr(normals, 3);
    if (out.grab) out.grab = roundArr(out.grab, digits[0]) as Vec3;
    if (out.sym) out.sym = out.sym.kind === 'mirror'
      ? { ...out.sym, point: roundArr(out.sym.point, digits[0]) as Vec3, normal: roundArr(out.sym.normal, 4) as Vec3 }
      : { ...out.sym, point: roundArr(out.sym.point, digits[0]) as Vec3, axis: roundArr(out.sym.axis, 4) as Vec3 };
    out.radius = Math.round(out.radius * 1000) / 1000;
  }
  return out;
}

/** 锚定笔触 → 世界坐标；锚定部件不存在时返回 null */
export function strokeToWorld(scene: Scene, s: Stroke): Stroke | null {
  if (!s.anchor) return s;
  const p = scene.parts.find((q) => q.id === s.anchor!.part);
  if (!p) return null;
  const f = partFrame(p);
  const e = s.anchor.ext;
  const rk = Math.cbrt((f.E[0] / e[0]) * (f.E[1] / e[1]) * (f.E[2] / e[2]));
  return mapStroke(s, frameIn(f), rk, null);
}

/** 世界坐标笔触 → 锚定到某个部件（partId 为空则保持世界坐标，只做取整） */
export function anchorStroke(scene: Scene, w: Stroke, partId: string | null): Stroke {
  const p = partId ? scene.parts.find((q) => q.id === partId) : undefined;
  const id: Maps = { P: (v) => v, V: (v) => v, N: (v) => unit(v) };
  if (!p) return mapStroke(w, id, 1, null, [3, 3]);
  const f = partFrame(p);
  return mapStroke(w, frameOut(f), 1, { part: p.id, ext: f.E.map((v) => Math.round(v * 1e4) / 1e4) as Vec3 }, [5, 3]);
}

export function worldStrokes(scene: Scene): Stroke[] {
  return (scene.strokes ?? []).map((s) => strokeToWorld(scene, s)).filter((s): s is Stroke => !!s);
}

/** 删除部件前：把锚在它身上的笔触转成世界坐标，捏出来的泥留在原处 */
export function worldifyStrokes(scene: Scene, partId: string): Stroke[] {
  return scene.strokes.map((s) => (s.anchor?.part === partId ? strokeToWorld(scene, s) ?? s : s));
}

/** 整体缩放时同步缩放世界坐标笔触（锚定笔触会跟着部件走） */
export function scaleWorldStrokes(strokes: Stroke[], c: Vec3, k: Vec3): Stroke[] {
  const m: Maps = {
    P: (p) => [c[0] + (p[0] - c[0]) * k[0], c[1] + (p[1] - c[1]) * k[1], c[2] + (p[2] - c[2]) * k[2]],
    V: (v) => [v[0] * k[0], v[1] * k[1], v[2] * k[2]],
    N: (n) => unit([n[0] / k[0], n[1] / k[1], n[2] / k[2]]),
  };
  const rk = Math.cbrt(Math.abs(k[0] * k[1] * k[2]));
  return strokes.map((s) => (s.anchor ? s : mapStroke(s, m, rk, null, [3, 3])));
}

export function translateWorldStrokes(strokes: Stroke[], d: Vec3): Stroke[] {
  const m: Maps = { P: (p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]], V: (v) => v, N: (n) => n };
  return strokes.map((s) => (s.anchor ? s : mapStroke(s, m, 1, null)));
}

/** 世界坐标笔触（含对称副本）影响到的包围盒 */
export function strokeBox(s: Stroke): AABB | null {
  if (s.points.length < 3) return null;
  const pad = s.radius * 1.15 + (s.grab ? Math.hypot(s.grab[0], s.grab[1], s.grab[2]) * 1.1 : 0);
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number, z: number, e: Vec3) => {
    const p = [x, y, z];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k] - e[k] - pad); max[k] = Math.max(max[k], p[k] + e[k] + pad); }
  };
  const zero: Vec3 = [0, 0, 0];
  for (let i = 0; i < s.points.length; i += 3) {
    const x = s.points[i], y = s.points[i + 1], z = s.points[i + 2];
    const sym = s.sym;
    if (sym?.kind === 'radial') {
      const a = unit(sym.axis), o = sym.point;
      const d = (x - o[0]) * a[0] + (y - o[1]) * a[1] + (z - o[2]) * a[2];
      const c: Vec3 = [o[0] + a[0] * d, o[1] + a[1] * d, o[2] + a[2] * d];
      const rho = Math.hypot(x - c[0], y - c[1], z - c[2]);
      add(c[0], c[1], c[2], [0, 1, 2].map((k) => rho * Math.sqrt(Math.max(0, 1 - a[k] * a[k]))) as Vec3);
    } else {
      add(x, y, z, zero);
      if (sym?.kind === 'mirror') {
        const n = unit(sym.normal), o = sym.point;
        const d = 2 * ((x - o[0]) * n[0] + (y - o[1]) * n[1] + (z - o[2]) * n[2]);
        add(x - d * n[0], y - d * n[1], z - d * n[2], zero);
      }
    }
  }
  return { min, max };
}

/** 生成笔触 id（前端预先分配，泥巴引擎和历史记录用同一个） */
export function newStrokeId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}
