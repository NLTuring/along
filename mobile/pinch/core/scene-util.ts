// 来源：捏个 PINCH（packages/core/src/scene-util.ts），团队自有代码，原样移植。
import { halfExtents } from './primitives';
import { aabbCenter, apply3, eulerToMat3, mat3ToEuler, mul3, transpose3, unionAABB, worldAABB, type AABB, type Mat3 } from './math';
import { translateWorldStrokes } from './sculpt';
import type { Part, Scene, Transform, Vec3 } from './types';

export function partById(scene: Scene, id: string): Part | undefined {
  return scene.parts.find((p) => p.id === id);
}

export function partAABB(p: Part): AABB {
  return worldAABB(p.transform, halfExtents(p.primitive, p.params));
}

/** 整体包围盒；默认只算实体部件 */
export function sceneAABB(scene: Scene, ids?: string[], includeHoles = false): AABB | null {
  let box: AABB | null = null;
  for (const p of scene.parts) {
    if (ids && !ids.includes(p.id)) continue;
    if (!includeHoles && p.mode === 'hole') continue;
    box = unionAABB(box, partAABB(p));
  }
  return box;
}

export function partVolumeApprox(p: Part): number {
  const h = halfExtents(p.primitive, p.params);
  return 8 * h[0] * h[1] * h[2] * Math.abs(p.transform.scale[0] * p.transform.scale[1] * p.transform.scale[2]);
}

export interface TargetContext {
  selected?: string[];
  hovered?: string | null;
}

/** 把 target 解析成部件 id 数组；匹配不到返回空数组 */
export function resolveTarget(scene: Scene, target: string | string[], ctx: TargetContext = {}): string[] {
  const list = Array.isArray(target) ? target : [target];
  const out: string[] = [];
  const push = (id: string) => { if (!out.includes(id)) out.push(id); };
  for (const t of list) {
    if (t === 'all') scene.parts.forEach((p) => push(p.id));
    else if (t === 'selected') (ctx.selected ?? []).forEach((id) => partById(scene, id) && push(id));
    else if (t === 'hovered' || t.startsWith('hovered@')) { if (ctx.hovered && partById(scene, ctx.hovered)) push(ctx.hovered); }
    else if (partById(scene, t)) push(t);
    else {
      const byLabel = scene.parts.filter((p) => p.label === t || p.aliases.includes(t));
      byLabel.forEach((p) => push(p.id));
    }
  }
  return out;
}

/** 让实体部件的最低点落在地面 y = 0（世界坐标笔触跟着一起移动） */
export function groundScene(scene: Scene): void {
  const box = sceneAABB(scene);
  if (!box) return;
  const dy = -box.min[1];
  if (Math.abs(dy) < 1e-6) return;
  for (const p of scene.parts) p.transform.position[1] += dy;
  if (scene.strokes?.some((s) => !s.anchor)) scene.strokes = translateWorldStrokes(scene.strokes, [0, dy, 0]);
}

/**
 * 关于平面 axis = c 的镜像变换。
 * 镜像会翻转手性，所以右乘一个局部 Z 反射把它变回纯旋转；所有基本体都关于局部 Z 平面对称，形状不变。
 */
export function mirrorTransform(t: Transform, axis: 'x' | 'z', c: number): Transform {
  const R = eulerToMat3(t.rotation);
  const F: Mat3 = axis === 'x' ? [-1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, 1, 0, 0, 0, -1];
  const L: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];
  const R2 = mul3(mul3(F, R), L);
  const pos: Vec3 = [...t.position];
  const i = axis === 'x' ? 0 : 2;
  pos[i] = 2 * c - pos[i];
  return { position: pos, rotation: mat3ToEuler(R2), scale: [...t.scale] };
}

/** 子部件相对父部件的锚定关系（父部件局部坐标 + 相对旋转） */
/**
 * 子部件相对父部件的锚定关系（在父部件局部坐标系中）。
 * 靠近表面的方向记"离表面的距离"（父变大时子部件贴着表面走），其余方向记归一化比例。
 */
export interface Anchor { local: Vec3; dir: Vec3; relRot: Mat3; surface: [boolean, boolean, boolean] }

function parentExtents(parent: Part): Vec3 {
  const h = halfExtents(parent.primitive, parent.params);
  const s = parent.transform.scale;
  return [h[0] * s[0], h[1] * s[1], h[2] * s[2]];
}

export function captureAnchor(parent: Part, child: Part): Anchor {
  const Rt = transpose3(eulerToMat3(parent.transform.rotation));
  const d = apply3(Rt, [
    child.transform.position[0] - parent.transform.position[0],
    child.transform.position[1] - parent.transform.position[1],
    child.transform.position[2] - parent.transform.position[2],
  ]);
  const ext = parentExtents(parent);
  const surface: [boolean, boolean, boolean] = [false, false, false];
  const local: Vec3 = [0, 0, 0];
  const dir: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    dir[i] = d[i] >= 0 ? 1 : -1;
    if (ext[i] > 1e-6 && Math.abs(d[i]) > ext[i] * 0.8) {
      surface[i] = true;
      local[i] = d[i] - dir[i] * ext[i];
    } else {
      local[i] = ext[i] > 1e-6 ? d[i] / ext[i] : 0;
    }
  }
  return { local, dir, relRot: mul3(Rt, eulerToMat3(child.transform.rotation)), surface };
}

export function restoreAnchor(parent: Part, child: Part, a: Anchor): void {
  const R = eulerToMat3(parent.transform.rotation);
  const ext = parentExtents(parent);
  const d: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) d[i] = a.surface[i] ? a.local[i] + a.dir[i] * ext[i] : a.local[i] * ext[i];
  const w = apply3(R, d);
  child.transform.position = [
    parent.transform.position[0] + w[0],
    parent.transform.position[1] + w[1],
    parent.transform.position[2] + w[2],
  ];
  child.transform.rotation = mat3ToEuler(mul3(R, a.relRot));
}

/** 父在前、子在后的顺序 */
export function topoOrder(scene: Scene): Part[] {
  const out: Part[] = [];
  const seen = new Set<string>();
  const visit = (p: Part, depth: number) => {
    if (seen.has(p.id) || depth > 32) return;
    const parent = p.attach ? partById(scene, p.attach) : undefined;
    if (parent && !seen.has(parent.id)) visit(parent, depth + 1);
    seen.add(p.id);
    out.push(p);
  };
  scene.parts.forEach((p) => visit(p, 0));
  return out;
}

export function isDescendant(scene: Scene, id: string, ancestor: string): boolean {
  let cur = partById(scene, id);
  for (let i = 0; cur && i < 64; i++) {
    if (!cur.attach) return false;
    if (cur.attach === ancestor) return true;
    cur = partById(scene, cur.attach);
  }
  return false;
}

/** 新部件没有指定附着对象时，附着到与它重叠最多、且体积更大的实体部件上 */
export function inferAttach(scene: Scene, ids: string[]): void {
  for (const id of ids) {
    const p = partById(scene, id);
    if (!p || p.attach) continue;
    const box = partAABB(p);
    const vol = partVolumeApprox(p);
    let best: { id: string; score: number } | null = null;
    for (const q of scene.parts) {
      if (q.id === p.id || q.mode === 'hole' || isDescendant(scene, q.id, p.id)) continue;
      if (partVolumeApprox(q) < vol && p.mode === 'solid') continue;
      const b = partAABB(q);
      const pad = 2;
      let ov = 1;
      for (let i = 0; i < 3; i++) {
        const o = Math.min(box.max[i], b.max[i] + pad) - Math.max(box.min[i], b.min[i] - pad);
        ov *= Math.max(0, o);
      }
      if (ov > 0 && (!best || ov > best.score)) best = { id: q.id, score: ov };
    }
    if (best) p.attach = best.id;
  }
}

export function sceneCenter(scene: Scene, ids?: string[]): Vec3 {
  const b = sceneAABB(scene, ids, true);
  return b ? aabbCenter(b) : [0, 0, 0];
}
