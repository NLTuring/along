// 来源：捏个 PINCH（packages/geometry/src/sdf.ts），团队自有代码，原样移植。
import { eulerToMat3, halfExtents, worldAABB, type Part, type Scene, type Vec3 } from '../core';

/** 有符号距离函数：< 0 在内部 */
export type SDF3 = (x: number, y: number, z: number) => number;

const len2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const len3 = (a: number, b: number, c: number) => Math.sqrt(a * a + b * b + c * c);

export function smin(a: number, b: number, k: number): number {
  if (k <= 1e-6) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ───────── 基本体（局部坐标，中心在原点，轴向为 Y） ─────────

function sdBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, r: number): number {
  const rr = Math.max(0, Math.min(r, hx, hy, hz));
  const qx = Math.abs(x) - hx + rr, qy = Math.abs(y) - hy + rr, qz = Math.abs(z) - hz + rr;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - rr;
}

function sdRoundExtrude(d2: number, y: number, hh: number, b: number): number {
  const dy = Math.abs(y) - hh + b;
  return Math.min(Math.max(d2, dy), 0) + len2(Math.max(d2, 0), Math.max(dy, 0)) - b;
}

function sdCyl(x: number, y: number, z: number, r: number, hh: number, b: number): number {
  const bb = Math.max(0, Math.min(b, r * 0.95, hh * 0.95));
  return sdRoundExtrude(len2(x, z) - r + bb, y, hh, bb);
}

/** 圆台：底面（y = -hh）半径 r1，顶面（y = +hh）半径 r2 */
function sdCone(x: number, y: number, z: number, hh: number, r1: number, r2: number): number {
  const qx = len2(x, z), qy = y;
  const k1x = r2, k1y = hh, k2x = r2 - r1, k2y = 2 * hh;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2), cay = Math.abs(qy) - hh;
  const t = Math.min(1, Math.max(0, ((k1x - qx) * k2x + (k1y - qy) * k2y) / (k2x * k2x + k2y * k2y)));
  const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}

function sdCapsule(x: number, y: number, z: number, r: number, hh: number): number {
  const a = Math.max(0, hh - r);
  return len3(x, y - Math.max(-a, Math.min(a, y)), z) - r;
}

/** 圆环：环在局部 XY 平面，开口弧以 +X 为中心 */
function sdTorus(x: number, y: number, z: number, R: number, r: number, arc: number): number {
  if (arc >= 359.9) return len2(len2(x, y) - R, z) - r;
  const th = ((arc / 2) * Math.PI) / 180;
  const s = Math.sin(th), c = Math.cos(th);
  const px = Math.abs(y), py = x;
  const k = c * px > s * py ? px * s + py * c : len2(px, py);
  return Math.sqrt(Math.max(0, x * x + y * y + z * z + R * R - 2 * R * k)) - r;
}

/** 正 n 边形（XZ 平面，一个顶点在 +X），外接半径 R */
function sdPolygon(x: number, z: number, n: number, R: number): number {
  const an = Math.PI / n, two = 2 * an;
  const a = Math.atan2(z, x);
  const f = (((a % two) + two) % two) - an;
  const rho = len2(x, z);
  const u = rho * Math.cos(f), v = rho * Math.sin(f);
  const ap = R * Math.cos(an), he = R * Math.sin(an);
  if (u <= ap) return u - ap;
  return len2(u - ap, v - Math.max(-he, Math.min(he, v)));
}

function sdPrism(x: number, y: number, z: number, n: number, R: number, hh: number, b: number): number {
  const an = Math.PI / n;
  const ap = R * Math.cos(an);
  const bb = Math.max(0, Math.min(b, ap * 0.9, hh * 0.95));
  return sdRoundExtrude(sdPolygon(x, z, n, (ap - bb) / Math.cos(an)), y, hh, bb);
}

export function buildSolid(p: Part): SDF3 {
  const q = p.params;
  switch (p.primitive) {
    case 'sphere': return (x, y, z) => len3(x, y, z) - q.r;
    case 'box': return (x, y, z) => sdBox(x, y, z, q.w / 2, q.h / 2, q.d / 2, q.bevel ?? 0);
    case 'cylinder': {
      const f = (q.flat ?? 0) > 0 ? q.r - q.flat : null;
      return (x, y, z) => {
        const d = sdCyl(x, y, z, q.r, q.h / 2, q.bevel ?? 0);
        return f === null ? d : Math.max(d, x - f);
      };
    }
    case 'cone': return (x, y, z) => sdCone(x, y, z, q.h / 2, q.r1, q.r2);
    case 'capsule': return (x, y, z) => sdCapsule(x, y, z, q.r, q.h / 2);
    case 'torus': return (x, y, z) => sdTorus(x, y, z, q.R, q.r, q.arc ?? 360);
    case 'prism': return (x, y, z) => sdPrism(x, y, z, q.n, q.r, q.h / 2, q.bevel ?? 0);
  }
}

/** 空腔（壁厚 > 0 的部件）：上方敞口，floor = 0 时下方也敞口 */
export function buildCavity(p: Part): SDF3 | null {
  const q = p.params;
  const w = q.wall ?? 0;
  if (!(w > 0) || !('h' in q)) return null;
  const hh = q.h / 2, ext = 0.6;
  const yb = (q.floor ?? 0) > 0 ? -hh + q.floor : -hh - ext;
  const yt = hh + ext;
  const cy = (yb + yt) / 2, ch = (yt - yb) / 2;
  const slab = (y: number) => Math.max(y - yt, yb - y);
  switch (p.primitive) {
    case 'cylinder': {
      const ri = q.r - w;
      if (ri <= 0.05) return null;
      const f = (q.flat ?? 0) > 0 ? q.r - q.flat - w : null;
      return (x, y, z) => {
        const d = Math.max(len2(x, z) - ri, slab(y));
        return f === null ? d : Math.max(d, x - f);
      };
    }
    case 'prism': {
      const an = Math.PI / q.n;
      const ap = q.r * Math.cos(an) - w;
      if (ap <= 0.05) return null;
      const Ri = ap / Math.cos(an);
      return (x, y, z) => Math.max(sdPolygon(x, z, q.n, Ri), slab(y));
    }
    case 'box': {
      const hx = q.w / 2 - w, hz = q.d / 2 - w;
      if (hx <= 0.05 || hz <= 0.05) return null;
      const b = Math.max(0, (q.bevel ?? 0) - w);
      return (x, y, z) => sdBox(x, y - cy, z, hx, ch, hz, b);
    }
    case 'cone': {
      const slope = (q.r2 - q.r1) / (2 * hh);
      const k = Math.sqrt(1 + slope * slope);
      const rr = (y: number) => q.r1 + slope * (y + hh) - w * k;
      const rb = rr(yb), rt = rr(yt);
      if (rb <= 0.05 && rt <= 0.05) return null;
      return (x, y, z) => sdCone(x, y - cy, z, ch, Math.max(0.05, rb), Math.max(0.05, rt));
    }
    default: return null;
  }
}

// ───────── 场景编译 ─────────

export interface CompiledPart {
  id: string;
  index: number;
  part: Part;
  /** 世界 → 局部：R^T、平移、缩放 */
  rt: number[];
  t: Vec3;
  s: Vec3;
  sMin: number;
  solid: SDF3;
  cavity: SDF3 | null;
  min: Vec3;
  max: Vec3;
}

function compilePart(p: Part, index: number): CompiledPart {
  const R = eulerToMat3(p.transform.rotation);
  const rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const s = p.transform.scale;
  const box = worldAABB(p.transform, halfExtents(p.primitive, p.params));
  return {
    id: p.id, index, part: p, rt, t: [...p.transform.position], s: [...s],
    sMin: Math.min(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2])),
    solid: buildSolid(p), cavity: buildCavity(p), min: box.min, max: box.max,
  };
}

/** 在部件局部坐标里求值，结果近似换算回世界距离 */
export function evalLocal(c: CompiledPart, f: SDF3, x: number, y: number, z: number): number {
  const dx = x - c.t[0], dy = y - c.t[1], dz = z - c.t[2];
  const r = c.rt;
  return f(
    (r[0] * dx + r[1] * dy + r[2] * dz) / c.s[0],
    (r[3] * dx + r[4] * dy + r[5] * dz) / c.s[1],
    (r[6] * dx + r[7] * dy + r[8] * dz) / c.s[2],
  ) * c.sMin;
}

function boxDist(c: CompiledPart, x: number, y: number, z: number): number {
  const dx = Math.max(c.min[0] - x, 0, x - c.max[0]);
  const dy = Math.max(c.min[1] - y, 0, y - c.max[1]);
  const dz = Math.max(c.min[2] - z, 0, z - c.max[2]);
  return len3(dx, dy, dz);
}

export { compilePart, boxDist };
