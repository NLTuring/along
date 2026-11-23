// Portable file encoders. GLB is glTF 2.0 metres, STL is binary millimetres.
import { validateMesh } from './craft-geometry.js';
const encoder = new TextEncoder();
const align4 = (n) => (n + 3) & ~3;

export function vertexNormals(mesh) {
  const normals = new Float32Array(mesh.positions.length), p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const at of [a, b, c]) for (let j = 0; j < 3; j++) normals[at + j] += n[j];
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    for (let j = 0; j < 3; j++) normals[i + j] /= length;
  }
  return normals;
}

export function encodeSTL(mesh) {
  validateMesh(mesh);
  const count = mesh.indices.length / 3;
  const bytes = new Uint8Array(84 + 50 * count);
  bytes.set(encoder.encode('Along sealed bas-relief | millimetres | X width Y height Z thickness'));
  const view = new DataView(bytes.buffer), p = mesh.positions;
  view.setUint32(80, count, true);
  for (let i = 0; i < count; i++) {
    const points = [0, 1, 2].map((j) => mesh.indices[i * 3 + j] * 3);
    const [a, b, c] = points;
    const u = [0, 1, 2].map((j) => p[b + j] - p[a + j]), v = [0, 1, 2].map((j) => p[c + j] - p[a + j]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal) || 1;
    let offset = 84 + i * 50;
    for (const n of normal) { view.setFloat32(offset, n / length, true); offset += 4; }
    for (const at of points) for (let j = 0; j < 3; j++) { view.setFloat32(offset, p[at + j], true); offset += 4; }
    view.setUint16(offset, 0, true);
  }
  return bytes;
}

export function encodeGLB(mesh, textureBytes, mimeType = 'image/png') {
  validateMesh(mesh);
  if (!(textureBytes instanceof Uint8Array) || textureBytes.length < 8 || textureBytes.length > 5 * 1024 * 1024) throw new Error('TEXTURE_INVALID');
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => textureBytes[i] === v);
  const jpeg = textureBytes[0] === 255 && textureBytes[1] === 216 && textureBytes[2] === 255;
  if ((mimeType === 'image/png' && !png) || (mimeType === 'image/jpeg' && !jpeg) || !['image/png', 'image/jpeg'].includes(mimeType)) throw new Error('TEXTURE_INVALID');
  const positions = Float32Array.from(mesh.positions, (value) => value / 1000);
  const normals = vertexNormals(mesh);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { const axis = i % 3; min[axis] = Math.min(min[axis], positions[i]); max[axis] = Math.max(max[axis], positions[i]); }
  const buffers = [], bufferViews = []; let length = 0;
  function append(array, target) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    buffers.push({ offset: length, bytes }); length += align4(bytes.byteLength);
    return index;
  }
  const pv = append(positions, 34962), nv = append(normals, 34962), uv = append(mesh.uvs, 34962);
  const front = mesh.indices.slice(0, mesh.frontIndexCount), body = mesh.indices.slice(mesh.frontIndexCount);
  const fv = append(front, 34963), bv = append(body, 34963), tv = append(textureBytes);
  const document = {
    asset: { version: '2.0', generator: 'Along physical bas-relief 1', extras: { units: 'metres', stlUnits: 'millimetres', maskSource: mesh.maskSource, hasRelief: mesh.hasRelief } },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Along bas-relief' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0, mode: 4 }, { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 4, material: 1, mode: 4 }] }],
    materials: [
      { name: 'Embedded photograph', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: .85 } },
      { name: 'Warm ivory base', pbrMetallicRoughness: { baseColorFactor: [.92, .85, .72, 1], metallicFactor: 0, roughnessFactor: .8 } },
    ],
    textures: [{ sampler: 0, source: 0 }], samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: tv, mimeType }], buffers: [{ byteLength: length }], bufferViews,
    accessors: [
      { bufferView: pv, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
      { bufferView: nv, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: uv, componentType: 5126, count: mesh.uvs.length / 2, type: 'VEC2' },
      { bufferView: fv, componentType: 5125, count: front.length, type: 'SCALAR' },
      { bufferView: bv, componentType: 5125, count: body.length, type: 'SCALAR' },
    ],
  };
  const json = encoder.encode(JSON.stringify(document)), jsonLength = align4(json.length);
  const result = new Uint8Array(12 + 8 + jsonLength + 8 + length), view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + jsonLength); result.set(json, 20);
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, length, true); view.setUint32(binHeader + 4, 0x004e4942, true);
  for (const { offset, bytes } of buffers) result.set(bytes, binHeader + 8 + offset);
  return result;
}

// The face texture. 2048 px keeps a phone photo sharp on a 6 cm face; a photo smaller than
// that is not enlarged beyond what it holds. The texture maps onto the whole face, so the
// photo's rectangle (which may overhang the face when it fills it) is drawn in face units.
export const TEXTURE_SIZE = 2048;
export function textureSize(image, mesh, max = TEXTURE_SIZE) {
  const width = image.naturalWidth || image.width || 0, height = image.naturalHeight || image.height || 0;
  const { w, h } = mesh.imageRect;
  // Pixels the photo needs across the face for 1:1 detail, rounded up to a power of two for mipmaps.
  const need = Math.max(width / Math.max(w, 1e-6), height / Math.max(h, 1e-6));
  let size = 512;
  while (size < max && size < need) size *= 2;
  return size;
}

export function drawTexture(image, mesh, size = textureSize(image, mesh)) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.fillStyle = '#fffdf8'; ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const { x, y, w, h } = mesh.imageRect;
  ctx.drawImage(image, x * size, y * size, w * size, h * size);
  return canvas;
}

// A photo texture compresses far better as JPEG; GLB and the server accept both.
const encodeCanvas = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('TEXTURE_ENCODE')), type, quality));
export async function exportArtifacts(mesh, textureCanvas) {
  let texture = await encodeCanvas(textureCanvas, 'image/jpeg', .92);
  if (texture.size > 4.5 * 1024 * 1024) texture = await encodeCanvas(textureCanvas, 'image/jpeg', .8);
  const textureBytes = new Uint8Array(await texture.arrayBuffer());
  return {
    glb: new Blob([encodeGLB(mesh, textureBytes, 'image/jpeg')], { type: 'model/gltf-binary' }),
    stl: new Blob([encodeSTL(mesh)], { type: 'model/stl' }),
    preview: await encodeCanvas(textureCanvas, 'image/png'),
  };
}

// Native exportImage is a PNG-only bridge, never a path for 3D files.
export function downloadArtifact(blob, name) {
  if (!(blob instanceof Blob) || !/\.(glb|stl|png)$/i.test(name)) throw new Error('DOWNLOAD_INVALID');
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.rel = 'noopener'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { started: true, nativeCaveat: !!globalThis.window?.Android };
}
