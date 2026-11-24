import { z } from 'zod';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { fail, id, json, owner, requireUser, sendFile, type App, type Services } from './core.js';
import { readMultipart } from './media.js';
import { objectKey } from './storage.js';
import type { Row } from './db.js';

export const modelMetadata = z.object({
  localCraftId: z.string().min(1).max(128), inputVersion: z.string().min(1).max(128),
  variant: z.enum(['REAL', 'ANIME']), product: z.enum(['MAGNET', 'KEYCHAIN']), shape: z.string().min(1).max(32),
  widthMm: z.number().min(20).max(150), heightMm: z.number().min(20).max(180), baseMm: z.number().min(2).max(10), reliefMm: z.number().min(0).max(15),
  sourceMediaId: z.string().uuid().optional(), maskSource: z.enum(['AI', 'MANUAL', 'NONE']), consent: z.literal(true),
}).strict();
type Metadata = z.infer<typeof modelMetadata>;
type Point = [number, number, number];
type Triangle = [Point, Point, Point];
const invalid = (code = 'INVALID_MODEL'): never => fail(422, code);
function check(condition: unknown, code?: string): asserts condition { if (!condition) invalid(code); }
const integer = (n: any, max = 100_000_000) => Number.isSafeInteger(n) && n >= 0 && n <= max;
function meshInfo(triangles: Triangle[]) {
  check(triangles.length >= 4 && triangles.length <= 100000, 'MODEL_TRIANGLE_LIMIT');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const edges = new Map<string, [number, number]>();
  let volume = 0;
  const vertex = (p: Point) => p.map(v => Math.round(v * 10000)).join(',');
  for (const [a, b, c] of triangles) {
    for (const p of [a, b, c]) for (let axis = 0; axis < 3; axis++) {
      check(Number.isFinite(p[axis]) && Math.abs(p[axis]) <= 1000, 'MODEL_NONFINITE_OR_BOUNDS');
      min[axis] = Math.min(min[axis], p[axis]); max[axis] = Math.max(max[axis], p[axis]);
    }
    const u = b.map((v, i) => v - a[i]), v = c.map((value, i) => value - a[i]);
    check(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-7, 'MODEL_DEGENERATE_TRIANGLE');
    volume += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    const points = [vertex(a), vertex(b), vertex(c)];
    for (let e = 0; e < 3; e++) {
      const from = points[e], to = points[(e + 1) % 3]; check(from !== to, 'MODEL_DEGENERATE_EDGE');
      const key = from < to ? `${from}:${to}` : `${to}:${from}`, entry = edges.get(key) || [0, 0];
      entry[0]++; entry[1] += from < to ? 1 : -1; edges.set(key, entry);
    }
  }
  check([...edges.values()].every(([count, direction]) => count === 2 && direction === 0), 'MODEL_NOT_CLOSED_MANIFOLD');
  check(volume > 0, 'MODEL_VOLUME_INVALID');
  return { min, max, dimensions: max.map((value, i) => value - min[i]), triangles: triangles.length, volumeMm3: volume / 6 };
}
function decodeSTL(bytes: Buffer): Triangle[] {
  check(bytes.length >= 84, 'STL_HEADER_INVALID');
  const count = bytes.readUInt32LE(80);
  check(count >= 4 && count <= 100000 && bytes.length === 84 + count * 50, 'STL_LENGTH_INVALID');
  const triangles: Triangle[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 84 + i * 50;
    check(bytes.readUInt16LE(offset + 48) === 0, 'STL_ATTRIBUTES_UNSUPPORTED');
    for (let n = 0; n < 3; n++) check(Number.isFinite(bytes.readFloatLE(offset + n * 4)), 'STL_NORMAL_INVALID');
    triangles.push([0, 1, 2].map(v => [0, 1, 2].map(axis => bytes.readFloatLE(offset + 12 + v * 12 + axis * 4))) as Triangle);
  }
  return triangles;
}
async function decodeGLB(bytes: Buffer): Promise<Triangle[]> {
  check(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, 'GLB_HEADER_INVALID');
  const jsonLength = bytes.readUInt32LE(12);
  check(jsonLength > 0 && jsonLength <= 1024 * 1024 && jsonLength % 4 === 0 && 20 + jsonLength + 8 <= bytes.length && bytes.readUInt32LE(16) === 0x4e4f534a, 'GLB_JSON_INVALID');
  let gltf: any; try { gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')); } catch { invalid('GLB_JSON_INVALID'); }
  const binOffset = 20 + jsonLength, binLength = bytes.readUInt32LE(binOffset);
  check(bytes.readUInt32LE(binOffset + 4) === 0x004e4942 && binLength % 4 === 0 && binOffset + 8 + binLength === bytes.length, 'GLB_BIN_INVALID');
  const bin = bytes.subarray(binOffset + 8);
  // Deliberately support canonical static meshes only, not external resources, executable extensions, morphs or scene transforms.
  check(gltf.asset?.version === '2.0' && gltf.buffers?.length === 1 && integer(gltf.buffers[0].byteLength) && gltf.buffers[0].byteLength <= binLength && binLength - gltf.buffers[0].byteLength < 4);
  function inspect(value: any, depth = 0) {
    check(depth < 40, 'GLB_STRUCTURE_LIMIT');
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) { check(!['uri', 'extensions', 'sparse'].includes(key), 'GLB_EXTERNAL_OR_EXTENSION_UNSUPPORTED'); inspect(v, depth + 1); }
  }
  inspect(gltf);
  check(!gltf.animations && !gltf.skins && !gltf.extensionsRequired && gltf.nodes?.length === 1 && gltf.meshes?.length === 1, 'GLB_SCENE_UNSUPPORTED');
  const node = gltf.nodes[0];
  check(node.mesh === 0 && !node.children && !node.matrix && !node.translation && !node.rotation && !node.scale && !node.weights, 'GLB_TRANSFORM_UNSUPPORTED');
  check(gltf.scene === 0 && gltf.scenes?.length === 1 && gltf.scenes[0].nodes?.length === 1 && gltf.scenes[0].nodes[0] === 0, 'GLB_SCENE_INVALID');
  check(Array.isArray(gltf.bufferViews) && gltf.bufferViews.length <= 100 && Array.isArray(gltf.accessors) && gltf.accessors.length <= 100);
  for (const view of gltf.bufferViews) check(view.buffer === 0 && integer(view.byteOffset || 0) && integer(view.byteLength) && (view.byteOffset || 0) + view.byteLength <= gltf.buffers[0].byteLength);
  const sizeMap: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  function accessor(index: number): { values: number[][]; type: string; componentType: number } {
    check(integer(index, gltf.accessors.length - 1));
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const size = sizeMap[a.componentType], count = components[a.type];
    check(view && size && count && !a.normalized && integer(a.count, 300000) && a.count > 0 && integer(a.byteOffset || 0));
    const stride = view.byteStride || size * count;
    check(integer(stride, 252) && stride >= size * count && stride % size === 0 && (a.byteOffset || 0) % size === 0);
    check((a.byteOffset || 0) + (a.count - 1) * stride + size * count <= view.byteLength, 'GLB_ACCESSOR_BOUNDS');
    const start = (view.byteOffset || 0) + (a.byteOffset || 0), values: number[][] = [];
    for (let i = 0; i < a.count; i++) {
      const tuple: number[] = [];
      for (let component = 0; component < count; component++) {
        const at = start + i * stride + component * size;
        const value = a.componentType === 5126 ? bin.readFloatLE(at) : size === 4 ? bin.readUInt32LE(at) : size === 2 ? bin.readUInt16LE(at) : bin.readUInt8(at);
        check(Number.isFinite(value), 'GLB_NONFINITE'); tuple.push(value);
      }
      values.push(tuple);
    }
    return { values, type: a.type, componentType: a.componentType };
  }
  const decoded = gltf.accessors.map((_: unknown, index: number) => accessor(index));
  const triangles: Triangle[] = [];
  check(gltf.meshes[0].primitives?.length >= 1 && gltf.meshes[0].primitives.length <= 8);
  for (const primitive of gltf.meshes[0].primitives) {
    check((primitive.mode ?? 4) === 4 && !primitive.targets, 'GLB_PRIMITIVE_UNSUPPORTED');
    const position = decoded[primitive.attributes?.POSITION], indices = decoded[primitive.indices];
    check(position?.type === 'VEC3' && position.componentType === 5126 && indices?.type === 'SCALAR' && [5121,5123,5125].includes(indices.componentType) && indices.values.length % 3 === 0);
    for (const index of Object.values(primitive.attributes)) { check(integer(index, decoded.length - 1)); check(decoded[index as number].values.length === position.values.length); }
    for (let i = 0; i < indices.values.length; i += 3) {
      const triangle = [0,1,2].map(v => {
        const index = indices.values[i + v][0]; check(integer(index, position.values.length - 1), 'GLB_INDEX_INVALID');
        return position.values[index].map((n: number) => n * 1000) as Point;
      }) as Triangle;
      triangles.push(triangle); check(triangles.length <= 100000, 'MODEL_TRIANGLE_LIMIT');
    }
  }
  check(!gltf.images || (Array.isArray(gltf.images) && gltf.images.length <= 4));
  for (const image of gltf.images || []) {
    check(['image/png', 'image/jpeg'].includes(image.mimeType) && integer(image.bufferView, gltf.bufferViews.length - 1), 'GLB_TEXTURE_INVALID');
    const view = gltf.bufferViews[image.bufferView]; check(view.byteLength <= 8 * 1024 * 1024, 'GLB_TEXTURE_TOO_LARGE');
    try { await sharp(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength), { limitInputPixels: 16_000_000, failOn: 'warning' }).raw().toBuffer(); } catch { invalid('GLB_TEXTURE_INVALID'); }
  }
  return triangles;
}
/** Gallery uploads: the same safe static-GLB structure rules, with bounds but no print/manifold requirement. */
export async function inspectGlb(glb: Buffer) {
  const triangles = await decodeGLB(glb);
  check(triangles.length >= 4, 'MODEL_TRIANGLE_LIMIT');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const triangle of triangles) for (const p of triangle) for (let axis = 0; axis < 3; axis++) {
    check(Number.isFinite(p[axis]) && Math.abs(p[axis]) <= 1000, 'MODEL_NONFINITE_OR_BOUNDS');
    min[axis] = Math.min(min[axis], p[axis]); max[axis] = Math.max(max[axis], p[axis]);
  }
  return { triangles: triangles.length, dimensions: max.map((value, i) => value - min[i]) };
}
export async function validateArtifacts(glb: Buffer, stl: Buffer, metadata: Metadata) {
  const glbTriangles = await decodeGLB(glb), stlTriangles = decodeSTL(stl);
  const a = meshInfo(glbTriangles), b = meshInfo(stlTriangles);
  check(a.triangles === b.triangles, 'MODEL_MESH_MISMATCH');
  // Canonical exporter preserves triangle order in both files. Require matching actual geometry, not just matching headers/bounds.
  for (let i = 0; i < a.triangles; i++) for (let v = 0; v < 3; v++) for (let axis = 0; axis < 3; axis++) check(Math.abs(glbTriangles[i][v][axis] - stlTriangles[i][v][axis]) < 0.005, 'MODEL_MESH_MISMATCH');
  const tolerance = Math.max(metadata.widthMm, metadata.heightMm) / 32 + 0.1;
  check(Math.abs(b.dimensions[0] - metadata.widthMm) <= tolerance && Math.abs(b.dimensions[1] - metadata.heightMm) <= tolerance, 'MODEL_DIMENSIONS_MISMATCH');
  check(b.dimensions[2] >= metadata.baseMm - 0.1 && b.dimensions[2] <= metadata.baseMm + metadata.reliefMm + 0.1 && Math.abs(b.min[2]) < 0.1, 'MODEL_DEPTH_MISMATCH');
  return { ...b, units: 'mm', glbUnits: 'm', axes: 'X-width/Y-height/Z-depth', closedManifold: true, manufacturingReviewRequired: true };
}
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const modelView = (r: Row) => ({ id: r.id, version: r.version, glbUrl: `/api/craft-models/${r.id}/glb`, stlUrl: `/api/craft-models/${r.id}/stl`, metadata: r.metadata });
export function modelRoutes(app: App, s: Services) {
  app.post('/api/craft-models', async req => {
    const user = requireUser(req), { files, fields } = await readMultipart(req, ['glb', 'stl'], s.config.limits.modelBytes, 1);
    let value: unknown; try { value = JSON.parse(fields.metadata || ''); } catch { fail(400, 'INVALID_METADATA_JSON'); }
    const metadata = modelMetadata.parse(value), glb = files.get('glb')!, stl = files.get('stl')!;
    if (metadata.sourceMediaId) {
      const source = await s.db.one('SELECT * FROM media WHERE id=$1', [metadata.sourceMediaId]);
      if (!source || source.owner_id !== user.id || source.kind !== 'IMAGE' || source.status !== 'READY') fail(422, 'SOURCE_MEDIA_NOT_OWNED_OR_READY');
    }
    const validation = await validateArtifacts(glb, stl, metadata);
    const glbKey = objectKey('models', 'glb'), stlKey = objectKey('models', 'stl'), modelId = id();
    try {
      await s.storage.put(glbKey, glb, 'model/gltf-binary'); await s.storage.put(stlKey, stl, 'model/stl');
      await s.db.tx(async c => {
        const counter = (await c.query(`INSERT INTO model_counters(owner_id,local_craft_id,version) VALUES($1,$2,1) ON CONFLICT(owner_id,local_craft_id) DO UPDATE SET version=model_counters.version+1 RETURNING version`, [user.id, metadata.localCraftId])).rows[0];
        await c.query(`INSERT INTO craft_models(id,owner_id,local_craft_id,version,input_version,glb_key,stl_key,glb_size,stl_size,glb_sha256,stl_sha256,metadata,validation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [modelId, user.id, metadata.localCraftId, counter.version, metadata.inputVersion, glbKey, stlKey, glb.length, stl.length, sha256(glb), sha256(stl), json(metadata), json(validation)]);
      });
    } catch (error) { await Promise.all([s.storage.remove(glbKey), s.storage.remove(stlKey)]); throw error; }
    return { model: modelView((await s.db.one('SELECT * FROM craft_models WHERE id=$1', [modelId]))!) };
  });
  app.get<{ Params: { id: string } }>('/api/craft-models/:id', async req => ({ model: modelView(owner(req, await s.db.one('SELECT * FROM craft_models WHERE id=$1', [req.params.id]))) }));
  for (const format of ['glb', 'stl'] as const) app.get<{ Params: { id: string } }>(`/api/craft-models/:id/${format}`, async (req, reply) => {
    const row = owner(req, await s.db.one('SELECT * FROM craft_models WHERE id=$1', [req.params.id]));
    return sendFile(req, reply, s.storage, row[`${format}_key`], format === 'glb' ? 'model/gltf-binary' : 'model/stl', `along-${row.id}-v${row.version}.${format}`);
  });
}
