// 3D files for the clay bench. readGLB accepts what photo-to-3D services and the gallery return
// (node transforms, several meshes, one photo texture); writeGLB/writeSTL write the clay itself.
// GLB is glTF 2.0 in metres with Y up; STL is binary millimetres. No DOM, so it runs in Node tests.

const GLB = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const encoder = new TextEncoder();
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READERS = {
  5120: [1, (v, o) => v.getInt8(o), 127], 5121: [1, (v, o) => v.getUint8(o), 255],
  5122: [2, (v, o) => v.getInt16(o, true), 32767], 5123: [2, (v, o) => v.getUint16(o, true), 65535],
  5125: [4, (v, o) => v.getUint32(o, true), 0], 5126: [4, (v, o) => v.getFloat32(o, true), 0],
};
export const MAX_TRIANGLES = 600_000;

function mat4Multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}
function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix;
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1], [sx, sy, sz] = node.scale || [1, 1, 1], [tx, ty, tz] = node.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** → { positions (mm), indices, uvs | null, image: { bytes, mime } | null } */
export function readGLB(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== GLB || view.getUint32(4, true) !== 2) throw new Error('MODEL_NOT_GLB');
  let offset = 12, gltf = null, bin = null;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) gltf = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === BIN_CHUNK && !bin) bin = chunk;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!gltf) throw new Error('MODEL_NOT_GLB');
  // Draco or meshopt compressed models need a decoder this app does not carry.
  if ((gltf.extensionsRequired || []).length) throw new Error('MODEL_COMPRESSED');
  const binView = bin ? new DataView(bin.buffer, bin.byteOffset, bin.byteLength) : null;
  function accessor(index) {
    const a = gltf.accessors?.[index];
    if (!a || a.sparse) throw new Error('MODEL_UNSUPPORTED');
    const bv = gltf.bufferViews?.[a.bufferView], reader = READERS[a.componentType], n = COMPONENTS[a.type];
    if (!bv || !reader || !n || !binView || (bv.buffer ?? 0) !== 0) throw new Error('MODEL_UNSUPPORTED');
    const [size, read, max] = reader, stride = bv.byteStride || size * n, start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    if (start + (a.count - 1) * stride + size * n > bin.byteLength) throw new Error('MODEL_BOUNDS');
    const out = new Float64Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
      const value = read(binView, start + i * stride + k * size);
      out[i * n + k] = a.normalized && max ? Math.max(value / max, -1) : value;
    }
    return { values: out, n, count: a.count };
  }
  const positions = [], indices = [], uvs = [];
  const images = new Set();
  let textured = true, vertexBase = 0, triangles = 0;
  function addPrimitive(primitive, matrix) {
    if ((primitive.mode ?? 4) !== 4 || primitive.attributes?.POSITION === undefined) return;
    const p = accessor(primitive.attributes.POSITION);
    if (p.n !== 3) return;
    const idx = primitive.indices !== undefined ? accessor(primitive.indices).values : Float64Array.from({ length: p.count }, (_, i) => i);
    triangles += idx.length / 3;
    if (triangles > MAX_TRIANGLES) throw new Error('MODEL_TOO_DETAILED');
    for (let i = 0; i < p.count; i++) {
      const x = p.values[i * 3], y = p.values[i * 3 + 1], z = p.values[i * 3 + 2];
      positions.push(
        (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * 1000,
        (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * 1000,
        (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * 1000,
      );
    }
    for (let i = 0; i + 2 < idx.length; i += 3) indices.push(idx[i] + vertexBase, idx[i + 1] + vertexBase, idx[i + 2] + vertexBase);
    const texture = gltf.materials?.[primitive.material]?.pbrMetallicRoughness?.baseColorTexture;
    const source = texture ? gltf.textures?.[texture.index]?.source : undefined;
    if (source !== undefined && primitive.attributes.TEXCOORD_0 !== undefined && (texture.texCoord ?? 0) === 0) {
      images.add(source);
      const t = accessor(primitive.attributes.TEXCOORD_0);
      for (let i = 0; i < p.count; i++) uvs.push(t.values[i * 2], t.values[i * 2 + 1]);
    } else {
      textured = false;
      for (let i = 0; i < p.count; i++) uvs.push(0, 0);
    }
    vertexBase += p.count;
  }
  function visit(index, parent, depth) {
    const node = gltf.nodes?.[index];
    if (!node || depth > 32) return;
    const matrix = mat4Multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) for (const primitive of gltf.meshes?.[node.mesh]?.primitives || []) addPrimitive(primitive, matrix);
    for (const child of node.children || []) visit(child, matrix, depth + 1);
  }
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? (gltf.nodes || []).map((_, i) => i);
  for (const root of roots) visit(root, identity, 0);
  if (!indices.length) throw new Error('MODEL_EMPTY');
  let image = null;
  // One shared photo texture is kept; models that mix several textures fall back to plain clay.
  if (textured && images.size === 1) {
    const source = gltf.images?.[[...images][0]];
    const bv = source && gltf.bufferViews?.[source.bufferView];
    if (bv && ['image/png', 'image/jpeg', 'image/webp'].includes(source.mimeType)) {
      image = { bytes: bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), mime: source.mimeType };
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), uvs: image ? new Float32Array(uvs) : null, image };
}

/** Area-weighted vertex normals (for meshes that arrive without any). */
export function computeNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    for (const o of [a, b, c]) { n[o] += x; n[o + 1] += y; n[o + 2] += z; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

const align4 = (n) => (n + 3) & ~3;
/**
 * One static mesh, no node transforms, no extensions or external files: the form the Along
 * gallery accepts. `texture` = { bytes, mime } with `uvs`, or a plain clay colour.
 */
/** Per-vertex linear RGB from part owners and part hex colours (for coloured clay). */
export function partColors(owners, hexes) {
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const table = hexes.map((h) => { const n = parseInt(h.slice(1), 16); return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]; });
  const out = new Float32Array(owners.length * 3);
  for (let i = 0; i < owners.length; i++) { const c = table[Math.min(Math.max(owners[i], 0), table.length - 1)]; out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}
export function writeGLB(mesh, { uvs = null, texture = null, color = [0.79, 0.54, 0.37], colors = null, name = 'Along clay' } = {}) {
  const count = mesh.positions.length / 3;
  if (!count || !mesh.indices.length || mesh.indices.length % 3) throw new Error('MESH_EMPTY');
  const positions = Float32Array.from(mesh.positions, (v) => v / 1000);
  const normals = mesh.normals?.length === mesh.positions.length ? Float32Array.from(mesh.normals) : computeNormals(mesh.positions, mesh.indices);
  const indices = mesh.indices instanceof Uint32Array ? mesh.indices : Uint32Array.from(mesh.indices);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) throw new Error('MESH_NONFINITE');
    min[i % 3] = Math.min(min[i % 3], positions[i]); max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  const parts = [], bufferViews = [];
  let length = 0;
  const append = (array, target) => {
    const data = array instanceof Uint8Array ? array : new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.byteLength, ...(target ? { target } : {}) });
    parts.push({ offset: length, data });
    length = align4(length + data.byteLength);
    return bufferViews.length - 1;
  };
  const textured = Boolean(texture && uvs && uvs.length === count * 2);
  const attributes = { POSITION: 0, NORMAL: 1 };
  const accessors = [
    { bufferView: append(positions, 34962), componentType: 5126, count, type: 'VEC3', min, max },
    { bufferView: append(normals, 34962), componentType: 5126, count, type: 'VEC3' },
  ];
  if (textured) { accessors.push({ bufferView: append(Float32Array.from(uvs), 34962), componentType: 5126, count, type: 'VEC2' }); attributes.TEXCOORD_0 = accessors.length - 1; }
  // Coloured clay keeps each part's glaze as linear vertex colours (multiplied by a white base).
  const colored = !textured && colors && colors.length === count * 3;
  if (colored) { accessors.push({ bufferView: append(Float32Array.from(colors), 34962), componentType: 5126, count, type: 'VEC3' }); attributes.COLOR_0 = accessors.length - 1; }
  accessors.push({ bufferView: append(indices, 34963), componentType: 5125, count: indices.length, type: 'SCALAR' });
  const doc = {
    asset: { version: '2.0', generator: 'Along clay bench (engine from 捏个 PINCH)' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }],
    meshes: [{ primitives: [{ attributes, indices: accessors.length - 1, material: 0, mode: 4 }] }],
    materials: [{ name: textured ? 'Photograph on clay' : colored ? 'Glazed clay' : 'Clay', pbrMetallicRoughness: { ...(textured ? { baseColorTexture: { index: 0 } } : { baseColorFactor: colored ? [1, 1, 1, 1] : [...color, 1] }), metallicFactor: 0, roughnessFactor: colored ? 0.62 : 0.88 } }],
    accessors, bufferViews, buffers: [{ byteLength: 0 }],
  };
  if (textured) {
    doc.images = [{ bufferView: append(texture.bytes), mimeType: texture.mime }];
    doc.textures = [{ sampler: 0, source: 0 }];
    doc.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
  }
  doc.buffers[0].byteLength = length;
  const json = encoder.encode(JSON.stringify(doc)), jsonLength = align4(json.length);
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + length), dv = new DataView(out.buffer);
  dv.setUint32(0, GLB, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jsonLength, true); dv.setUint32(16, JSON_CHUNK, true);
  out.fill(0x20, 20, 20 + jsonLength); out.set(json, 20);
  const binStart = 20 + jsonLength;
  dv.setUint32(binStart, length, true); dv.setUint32(binStart + 4, BIN_CHUNK, true);
  for (const { offset, data } of parts) out.set(data, binStart + 8 + offset);
  return out;
}

export function writeSTL(mesh, note = 'Along clay | millimetres | engine from PINCH') {
  const count = mesh.indices.length / 3, out = new Uint8Array(84 + count * 50), dv = new DataView(out.buffer), p = mesh.positions;
  out.set(encoder.encode(note).subarray(0, 80));
  dv.setUint32(80, count, true);
  for (let t = 0; t < count; t++) {
    const ids = [mesh.indices[t * 3] * 3, mesh.indices[t * 3 + 1] * 3, mesh.indices[t * 3 + 2] * 3];
    const [a, b, c] = ids;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    let o = 84 + t * 50;
    for (const v of [nx / l, ny / l, nz / l]) { dv.setFloat32(o, v, true); o += 4; }
    for (const at of ids) for (let k = 0; k < 3; k++) { dv.setFloat32(o, p[at + k], true); o += 4; }
  }
  return out;
}
