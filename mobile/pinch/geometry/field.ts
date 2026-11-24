// 来源：捏个 PINCH（packages/geometry/src/field.ts），团队自有代码，原样移植。
import { halfExtents, partById, type Part, type Scene, type Vec3 } from '../core';
import { boxDist, buildCavity, buildSolid, compilePart, evalLocal, smin, type CompiledPart, type SDF3 } from './sdf';

/**
 * 场景的整体距离场。
 * 规则：
 *  - 空腔只挖它的主人和主人的后代（中心落在空腔里的后代除外，比如收纳盒的隔板）；
 *  - 共享同一组"挖它的空腔"的部件先融合、再一起挖，这样把手和杯身的接缝不会把杯壁内侧鼓出来；
 *  - 孔（mode = hole）最后从整体里减掉。
 */
export interface SceneField {
  field: SDF3;
  /** 离该点最近的实体部件在 ids 里的下标；没有返回 -1 */
  owner: (x: number, y: number, z: number) => number;
  ids: string[];
  min: Vec3;
  max: Vec3;
  empty: boolean;
}

interface Group { members: CompiledPart[]; carvers: CompiledPart[]; blend: number; min: Vec3; max: Vec3 }

const boxDistRaw = (min: Vec3, max: Vec3, x: number, y: number, z: number) => {
  const dx = Math.max(min[0] - x, 0, x - max[0]);
  const dy = Math.max(min[1] - y, 0, y - max[1]);
  const dz = Math.max(min[2] - z, 0, z - max[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export function compileScene(scene: Scene): SceneField {
  const all = scene.parts.map((p, i) => compilePart(p, i));
  const byId = new Map(all.map((c) => [c.id, c]));
  const solids = all.filter((c) => c.part.mode === 'solid');
  const holes = all.filter((c) => c.part.mode === 'hole');
  const ids = scene.parts.map((p) => p.id);

  const groups = new Map<string, Group>();
  for (const s of solids) {
    const carvers: CompiledPart[] = [];
    let cur: Part | undefined = s.part;
    for (let guard = 0; cur && guard < 32; guard++) {
      const c = byId.get(cur.id);
      if (c?.cavity && c.part.mode === 'solid') {
        const inside = c !== s && evalLocal(c, c.cavity, s.t[0], s.t[1], s.t[2]) < 0;
        if (!inside) carvers.push(c);
      }
      cur = cur.attach ? partById(scene, cur.attach) : undefined;
    }
    const key = carvers.map((c) => c.id).sort().join('|');
    const pad = s.part.blend + 0.5;
    const g = groups.get(key) ?? { members: [], carvers, blend: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    g.members.push(s);
    g.blend = Math.max(g.blend, s.part.blend);
    for (let k = 0; k < 3; k++) { g.min[k] = Math.min(g.min[k], s.min[k] - pad); g.max[k] = Math.max(g.max[k], s.max[k] + pad); }
    groups.set(key, g);
  }
  const glist = [...groups.values()];

  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const g of glist) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], g.min[k]); max[k] = Math.max(max[k], g.max[k]); }
  const empty = !solids.length;

  const field: SDF3 = (x, y, z) => {
    if (empty) return 1e9;
    let acc = Infinity;
    for (const g of glist) {
      if (acc !== Infinity && boxDistRaw(g.min, g.max, x, y, z) > acc + g.blend) continue;
      let gd = Infinity;
      for (const m of g.members) {
        if (gd !== Infinity && boxDist(m, x, y, z) > gd + m.part.blend) continue;
        const d = evalLocal(m, m.solid, x, y, z);
        gd = gd === Infinity ? d : smin(gd, d, m.part.blend);
      }
      for (const c of g.carvers) {
        if (boxDist(c, x, y, z) > 0.7) continue;
        gd = Math.max(gd, -evalLocal(c, c.cavity!, x, y, z));
      }
      acc = acc === Infinity ? gd : smin(acc, gd, g.blend);
    }
    for (const h of holes) {
      if (boxDist(h, x, y, z) > Math.max(0, -acc) + h.part.blend) continue;
      acc = smax(acc, -evalLocal(h, h.solid, x, y, z), h.part.blend);
    }
    return acc;
  };

  const owner = (x: number, y: number, z: number): number => {
    let best = -1, bd = Infinity;
    for (const s of solids) {
      if (boxDist(s, x, y, z) > bd) continue;
      const d = evalLocal(s, s.solid, x, y, z);
      if (d < bd) { bd = d; best = s.index; }
    }
    return best;
  };

  return { field, owner, ids, min, max, empty };
}

/** 场景里所有孔的并集距离场（< 0 在孔内）；没有孔返回 null */
export function holesField(scene: Scene): SDF3 | null {
  const holes = scene.parts.map((p, i) => compilePart(p, i)).filter((c) => c.part.mode === 'hole');
  if (!holes.length) return null;
  return (x, y, z) => {
    let d = Infinity;
    for (const h of holes) {
      if (boxDist(h, x, y, z) > d) continue;
      d = Math.min(d, evalLocal(h, h.solid, x, y, z));
    }
    return d;
  };
}

/** 单个部件在自己局部坐标系里的距离场（拖拽预览用，只挖自己的空腔） */
export function partLocalField(p: Part): { field: SDF3; min: Vec3; max: Vec3 } {
  const solid = buildSolid(p), cav = buildCavity(p);
  const h = halfExtents(p.primitive, p.params);
  const pad = 1.5;
  return {
    field: cav ? (x, y, z) => Math.max(solid(x, y, z), -cav(x, y, z)) : solid,
    min: [-h[0] - pad, -h[1] - pad, -h[2] - pad],
    max: [h[0] + pad, h[1] + pad, h[2] + pad],
  };
}
