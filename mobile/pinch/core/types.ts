// 来源：捏个 PINCH（packages/core/src/types.ts），团队自有代码，原样移植。
/** 场景图：项目的"配方"。网格只是它的缓存产物。单位一律为毫米，Y 轴向上，地面 y = 0。 */

export type Vec3 = [number, number, number];

export type PrimitiveKind = 'sphere' | 'box' | 'cylinder' | 'cone' | 'capsule' | 'torus' | 'prism';

/** solid = 实体；hole = 从其他实体里挖掉（打孔、开槽） */
export type PartMode = 'solid' | 'hole';

export interface Transform {
  position: Vec3;
  /** 欧拉角（度），XYZ 顺序，与 three.js 默认一致 */
  rotation: Vec3;
  scale: Vec3;
}

export interface MaterialDef {
  preset: string;
  color: string;
  roughness: number;
  metallic: number;
  /** 精细网格自带贴图时是否使用；用户改过颜色后为 false */
  useTexture: boolean;
}

export interface Part {
  id: string;
  label: string;
  aliases: string[];
  primitive: PrimitiveKind;
  params: Record<string, number>;
  transform: Transform;
  /** 附着的父部件；父部件变化时本部件跟随 */
  attach: string | null;
  /** 与其他部件的平滑融合半径（mm） */
  blend: number;
  mode: PartMode;
  material: MaterialDef;
  symmetry: { group: string; axis: 'x' | 'z' } | null;
  locked: boolean;
}

/** 精细网格绑定时，被绑定部件的状态快照 */
export interface PartBind {
  primitive: PrimitiveKind;
  params: Record<string, number>;
  transform: Transform;
}

export interface DetailRef {
  id: string;
  /** 资源内容哈希（sha256 十六进制） */
  asset: string;
  /** whole = 整体精修结果，按部件切分；part = 单个部件的重绘结果 */
  scope: 'whole' | 'part';
  partId?: string;
  /** 绑定时各部件的状态，用于计算之后编辑带来的变换差 */
  bind: Record<string, PartBind>;
  /** 把资源网格放进场景坐标系：先绕 Y 旋转，再统一缩放，再平移 */
  fit: { yaw: number; scale: number; offset: Vec3 };
  provider: string;
  hasTexture: boolean;
}

export type Filament = 'PLA' | 'PETG' | 'ABS' | 'TPU';

export interface PrintSettings {
  filament: Filament;
  minWall: number;
  buildVolume: Vec3;
  infill: number;
  overhangWarn: number;
  overhangFail: number;
}

export interface Seed {
  kind: 'text' | 'image' | 'template' | 'repair' | 'empty';
  text: string;
  /** 英文提示词（给云端 3D 生成用，可选） */
  promptEn?: string;
  image?: string;
}

/** 捏塑笔刷：堆 / 挖 / 抹平 / 压平 / 抓 / 刻线 */
export type BrushKind = 'build' | 'dig' | 'smooth' | 'flatten' | 'grab' | 'crease';

export type StrokeSym =
  | { kind: 'mirror'; point: Vec3; normal: Vec3 }
  /** 拉坯：绕轴旋转对称 */
  | { kind: 'radial'; point: Vec3; axis: Vec3 };

/**
 * 一笔捏塑。不可变：历史节点之间共享同一个对象。
 * anchor 存在时，所有坐标都在锚定部件的"归一化局部坐标"里（局部坐标 ÷ 绑定时的半尺寸），
 * 部件移动、旋转、改尺寸时笔触跟着走；anchor 为空时是世界坐标。
 */
export interface Stroke {
  id: string;
  brush: BrushKind;
  radius: number;
  strength: number;
  anchor: { part: string; ext: Vec3 } | null;
  /** 笔触中心点 [x,y,z, x,y,z, …] */
  points: number[];
  /** 表面法线，与 points 一一对应 */
  normals: number[];
  /** 0..1；鼠标为空 */
  pressure?: number[];
  /** 抓的位移（只有 grab 有） */
  grab?: Vec3;
  sym: StrokeSym | null;
}

export interface Scene {
  version: 1;
  units: 'mm';
  title: string;
  seed: Seed;
  parts: Part[];
  details: DetailRef[];
  print: PrintSettings;
  nextId: number;
  /** 捏塑笔触，按先后顺序作用在融合后的形体上 */
  strokes: Stroke[];
}

export const DEFAULT_PRINT: PrintSettings = {
  filament: 'PLA',
  minWall: 1.2,
  buildVolume: [256, 256, 256],
  infill: 0.15,
  overhangWarn: 45,
  overhangFail: 60,
};

export function createScene(title = '未命名'): Scene {
  return {
    version: 1,
    units: 'mm',
    title,
    seed: { kind: 'empty', text: '' },
    parts: [],
    details: [],
    print: { ...DEFAULT_PRINT, buildVolume: [...DEFAULT_PRINT.buildVolume] },
    nextId: 1,
    strokes: [],
  };
}

export const IDENTITY: Transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

export function cloneTransform(t: Transform): Transform {
  return { position: [...t.position], rotation: [...t.rotation], scale: [...t.scale] };
}
