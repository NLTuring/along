// Physical bas-relief geometry. All coordinates here are millimetres, X/Y face, +Z front.
// A mask controls an explicitly modelled emboss/bevel, never inferred photographic depth.
export const GEOMETRY_VERSION = 1;
export const MAX_GRID = 96;
export const PHYSICAL_DEFAULTS = {
  MAGNET: { widthMm: 60, heightMm: 72, baseMm: 3.2, reliefMm: 3 },
  KEYCHAIN: { widthMm: 50, heightMm: 64, baseMm: 3.2, reliefMm: 3 },
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function physicalOptions(options = {}) {
  const product = options.product === 'KEYCHAIN' ? 'KEYCHAIN' : 'MAGNET';
  const defaults = PHYSICAL_DEFAULTS[product];
  const result = { product, shape: ['arch', 'oval', 'scallop', 'rounded'].includes(options.shape) ? options.shape : 'rounded' };
  for (const [key, range] of Object.entries({ widthMm: [35, 100], heightMm: [40, 120], baseMm: [2.4, 6], reliefMm: [0.5, 8] })) {
    result[key] = Number.isFinite(options[key]) ? clamp(options[key], ...range) : defaults[key];
  }
  return result;
}

export const PHOTO_FITS = ['FILL', 'WHOLE'];

// The photo's rectangle on the face, in face units (0..1, top-left origin, same as the texture).
// FILL covers the whole face and lets the shape trim the photo's edges; WHOLE keeps the complete
// photograph (and any watermark) inside the shape, as earlier keepsakes were made.
export function imagePlacement(shape, imageWidth, imageHeight, physicalAspect = 1, fit = 'WHOLE') {
  if (fit === 'FILL') {
    const aspect = (imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1) / physicalAspect;
    const w = Math.max(1, aspect), h = w / aspect;
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }
  const box = shape === 'oval' ? { x: .18, y: .20, w: .64, h: .62 }
    : shape === 'arch' ? { x: .12, y: .27, w: .76, h: .61 }
      : shape === 'scallop' ? { x: .21, y: .21, w: .58, h: .58 }
        : { x: .10, y: .18, w: .80, h: .72 };
  const aspect = (imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1) / physicalAspect;
  const w = Math.min(box.w, box.h * aspect);
  const h = w / aspect;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// Face dimensions that follow the photo's proportions, so a filled face crops as little as
// possible: the long side keeps the product's default length, both sides stay in range.
export function fitDimensions(product, imageWidth, imageHeight) {
  const defaults = PHYSICAL_DEFAULTS[product === 'KEYCHAIN' ? 'KEYCHAIN' : 'MAGNET'];
  if (!(imageWidth > 0 && imageHeight > 0)) return { widthMm: defaults.widthMm, heightMm: defaults.heightMm };
  const long = Math.max(defaults.widthMm, defaults.heightMm), aspect = imageWidth / imageHeight;
  const round = (n) => Math.round(n * 2) / 2;
  return aspect >= 1
    ? { widthMm: clamp(round(long), 35, 100), heightMm: clamp(round(long / aspect), 40, 120) }
    : { widthMm: clamp(round(long * aspect), 35, 100), heightMm: clamp(round(long), 40, 120) };
}

export function validMask(mask) {
  return !!mask && Number.isInteger(mask.width) && Number.isInteger(mask.height)
    && mask.width > 0 && mask.height > 0 && mask.width <= 2048 && mask.height <= 2048
    && mask.data?.length === mask.width * mask.height;
}

// Providers may return white person on black grayscale, or opacity as person coverage.
// Refuse coloured RGB masks rather than guessing classes. Caller checks pixel alignment.
export function maskFromRGBA({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > 2048 || height > 2048 || data?.length !== width * height * 4) throw new Error('MASK_INVALID');
  let alpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { alpha = true; break; }
  const mask = { width, height, data: new Uint8Array(width * height) };
  for (let i = 0; i < mask.data.length; i++) {
    const p = i * 4;
    if (!alpha && (Math.abs(data[p] - data[p + 1]) > 3 || Math.abs(data[p] - data[p + 2]) > 3)) throw new Error('MASK_FORMAT');
    mask.data[i] = (alpha ? data[p + 3] : data[p]) >= 128 ? 255 : 0;
  }
  return mask;
}

function insideShape(shape, u, v) {
  if (shape === 'oval') return (u * 2) ** 2 + (v * 2) ** 2 <= 1;
  if (shape === 'arch') return v <= 0 || u * u + v * v <= .25;
  if (shape === 'scallop') {
    const a = Math.atan2(v, u);
    return Math.hypot(u, v) <= .46 + .04 * Math.cos(12 * a);
  }
  const r = .16;
  return Math.hypot(Math.max(0, Math.abs(u) - .5 + r), Math.max(0, Math.abs(v) - .5 + r)) <= r;
}

function sampleMask(mask, u, v, rect) {
  const x = (u - rect.x) / rect.w, y = (v - rect.y) / rect.h;
  if (!validMask(mask) || x < 0 || x >= 1 || y < 0 || y >= 1) return false;
  return mask.data[Math.floor(y * mask.height) * mask.width + Math.floor(x * mask.width)] >= 128;
}

export function buildReliefMesh(options = {}) {
  const settings = physicalOptions(options);
  const { product, shape, widthMm, heightMm, baseMm, reliefMm } = settings;
  const n = clamp(Math.round(Number(options.resolution) || 80), 24, MAX_GRID);
  const stride = n + 1, dx = widthMm / n, dy = heightMm / n;
  const rect = imagePlacement(shape, options.imageWidth, options.imageHeight, widthMm / heightMm, options.photoFit === 'FILL' ? 'FILL' : 'WHOLE');
  const occupied = new Uint8Array(n * n);
  const hole = product === 'KEYCHAIN' ? { x: 0, y: heightMm * .39, radius: 2.5 } : null;
  const pocket = product === 'MAGNET' ? { x: 0, y: 0, radius: 9, depth: 1.2 } : null;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + .5) / n - .5, v = (y + .5) / n - .5;
    occupied[y * n + x] = insideShape(shape, u, v) && (!hole || Math.hypot(u * widthMm - hole.x, v * heightMm - hole.y) > hole.radius) ? 1 : 0;
  }
  // Eliminate diagonal-only joins at the discretized boundary: a genuine manifold wall.
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const a = y * n + x, b = a + 1, c = a + n, d = c + 1;
    if (occupied[a] && occupied[d] && !occupied[b] && !occupied[c]) occupied[a] = 0;
    if (occupied[b] && occupied[c] && !occupied[a] && !occupied[d]) occupied[b] = 0;
  }
  const foreground = new Uint8Array(stride * stride);
  const distance = new Float64Array(foreground.length);
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) {
    const i = y * stride + x;
    foreground[i] = sampleMask(options.mask, x / n, 1 - y / n, rect) ? 1 : 0;
    distance[i] = foreground[i] ? 1e6 : 0;
  }
  // Chamfer distance is only a geometric bevel inside a supplied person mask.
  const diag = Math.hypot(dx, dy);
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) {
    const i = y * stride + x;
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + dx);
    if (y) distance[i] = Math.min(distance[i], distance[i - stride] + dy);
    if (x && y) distance[i] = Math.min(distance[i], distance[i - stride - 1] + diag);
    if (x < n && y) distance[i] = Math.min(distance[i], distance[i - stride + 1] + diag);
  }
  for (let y = n; y >= 0; y--) for (let x = n; x >= 0; x--) {
    const i = y * stride + x;
    if (x < n) distance[i] = Math.min(distance[i], distance[i + 1] + dx);
    if (y < n) distance[i] = Math.min(distance[i], distance[i + stride] + dy);
    if (x < n && y < n) distance[i] = Math.min(distance[i], distance[i + stride + 1] + diag);
    if (x && y < n) distance[i] = Math.min(distance[i], distance[i + stride - 1] + diag);
  }
  const positions = [], uvs = [], front = [], body = [], frontVertices = [], personVertices = [];
  const vertices = new Map();
  function vertex(x, y, side) {
    const key = `${x},${y},${side}`;
    if (vertices.has(key)) return vertices.get(key);
    const i = y * stride + x, px = x * dx - widthMm / 2, py = y * dy - heightMm / 2;
    const height = foreground[i] ? reliefMm * Math.min(1, distance[i] / 1.8) : 0;
    const recess = pocket ? pocket.depth * clamp((pocket.radius - Math.hypot(px, py)) / .8, 0, 1) : 0;
    const index = positions.length / 3;
    positions.push(px, py, side ? baseMm + height : recess);
    uvs.push(x / n, 1 - y / n);
    if (side) { frontVertices.push(index); if (height > 0) personVertices.push(index); }
    vertices.set(key, index);
    return index;
  }
  const has = (x, y) => x >= 0 && y >= 0 && x < n && y < n && occupied[y * n + x];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!has(x, y)) continue;
    const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    const t = corners.map(([a, b]) => vertex(a, b, 1)), b = corners.map(([a, c]) => vertex(a, c, 0));
    front.push(t[0], t[1], t[2], t[0], t[2], t[3]);
    body.push(b[0], b[2], b[1], b[0], b[3], b[2]);
    const neighbours = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
    for (let k = 0; k < 4; k++) if (!has(...neighbours[k])) {
      const j = (k + 1) % 4;
      body.push(b[k], b[j], t[j], b[k], t[j], t[k]);
    }
  }
  const mesh = {
    positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array([...front, ...body]),
    frontIndexCount: front.length, frontVertices, personVertices,
    settings, resolution: n, maskSource: personVertices.length ? (options.maskSource === 'AI' ? 'AI' : 'MANUAL') : 'NONE',
    hasRelief: personVertices.length > 0, hole, pocket, imageRect: rect,
  };
  validateMesh(mesh);
  return mesh;
}

export function validateMesh(mesh) {
  const { positions: p, indices: ix } = mesh;
  if (!p?.length || p.length % 3 || !ix?.length || ix.length % 3 || ix.length / 3 > 42000) throw new Error('MESH_INVALID');
  if (![...p].every(Number.isFinite)) throw new Error('MESH_NONFINITE');
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const ids = [ix[i], ix[i + 1], ix[i + 2]];
    if (ids.some((id) => !Number.isInteger(id) || id < 0 || id >= p.length / 3)) throw new Error('MESH_INDEX');
    const [a, b, c] = ids.map((id) => [p[id * 3], p[id * 3 + 1], p[id * 3 + 2]]);
    const u = b.map((v, j) => v - a[j]), v = c.map((n, j) => n - a[j]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...cross) < 1e-9) throw new Error('MESH_DEGENERATE');
    volume += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    for (let e = 0; e < 3; e++) {
      const from = ids[e], to = ids[(e + 1) % 3], key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const entry = edges.get(key) || [0, 0];
      entry[0]++; entry[1] += from < to ? 1 : -1; edges.set(key, entry);
    }
  }
  if ([...edges.values()].some(([count, direction]) => count !== 2 || direction !== 0)) throw new Error('MESH_OPEN');
  if (!(volume > 0)) throw new Error('MESH_VOLUME');
  return { triangles: ix.length / 3, volumeMm3: volume / 6, edges: edges.size };
}
