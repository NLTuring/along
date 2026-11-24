// 来源：捏个 PINCH（packages/core/src/math.ts），团队自有代码，原样移植。
import type { Transform, Vec3 } from './types';

export type Mat3 = [number, number, number, number, number, number, number, number, number];

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** 欧拉角（度，XYZ 顺序）→ 行主序 3x3 旋转矩阵，与 three.js Euler('XYZ') 一致 */
export function eulerToMat3(r: Vec3): Mat3 {
  const a = r[0] * D2R, b = r[1] * D2R, c = r[2] * D2R;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cc = Math.cos(c), sc = Math.sin(c);
  return [
    cb * cc, -cb * sc, sb,
    ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb,
    sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb,
  ];
}

function clean(v: number): number {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}

export function mat3ToEuler(m: Mat3): Vec3 {
  const m13 = Math.max(-1, Math.min(1, m[2]));
  const y = Math.asin(m13);
  let x: number, z: number;
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-m[5], m[8]);
    z = Math.atan2(-m[1], m[0]);
  } else {
    x = Math.atan2(m[7], m[4]);
    z = 0;
  }
  return [clean(x * R2D), clean(y * R2D), clean(z * R2D)];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}

export function transpose3(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function apply3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scl = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** 局部点 → 世界点：p' = R·(S·p) + t */
export function localToWorld(t: Transform, p: Vec3): Vec3 {
  const m = eulerToMat3(t.rotation);
  return add(apply3(m, [p[0] * t.scale[0], p[1] * t.scale[1], p[2] * t.scale[2]]), t.position);
}

/** 世界点 → 局部点 */
export function worldToLocal(t: Transform, p: Vec3): Vec3 {
  const mt = transpose3(eulerToMat3(t.rotation));
  const q = apply3(mt, sub(p, t.position));
  return [q[0] / t.scale[0], q[1] / t.scale[1], q[2] / t.scale[2]];
}

export interface AABB { min: Vec3; max: Vec3 }

/** 局部半尺寸 h 的盒子经变换后的世界包围盒（保守） */
export function worldAABB(t: Transform, h: Vec3): AABB {
  const m = eulerToMat3(t.rotation);
  const hs: Vec3 = [h[0] * Math.abs(t.scale[0]), h[1] * Math.abs(t.scale[1]), h[2] * Math.abs(t.scale[2])];
  const e: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    e[i] = Math.abs(m[i * 3]) * hs[0] + Math.abs(m[i * 3 + 1]) * hs[1] + Math.abs(m[i * 3 + 2]) * hs[2];
  }
  return { min: sub(t.position, e), max: add(t.position, e) };
}

export function unionAABB(a: AABB | null, b: AABB): AABB {
  if (!a) return { min: [...b.min], max: [...b.max] };
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

export const aabbSize = (b: AABB): Vec3 => sub(b.max, b.min);
export const aabbCenter = (b: AABB): Vec3 => scl(add(b.min, b.max), 0.5);

export function round(v: number, d = 2): number {
  const f = 10 ** d;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export const roundVec = (v: Vec3, d = 3): Vec3 => [round(v[0], d), round(v[1], d), round(v[2], d)];
