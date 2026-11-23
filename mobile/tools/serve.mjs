// Local preview with a fixed backend proxy. Binds only to loopback.
// Usage: node mobile/tools/serve.mjs [port] [folder]
import { createServer, request } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[3] ? resolve(process.argv[3]) : resolve(fileURLToPath(new URL('../assets', import.meta.url)));
const admin = resolve(fileURLToPath(new URL('../../admin', import.meta.url)));
const backend = new URL(process.env.ALONG_API_ORIGIN || 'http://127.0.0.1:3001');
if (backend.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname)) {
  throw new Error('The preview proxy must target a loopback HTTP backend');
}
const port = Number(process.argv[2] || process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary', '.stl': 'model/stl',
};

function proxy(req, res, path = req.url) {
  const headers = { ...req.headers, host: backend.host };
  delete headers['x-forwarded-for'];
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  const upstream = request({ hostname: backend.hostname, port: backend.port, method: req.method, path, headers }, (incoming) => {
    res.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(res);
  });
  upstream.setTimeout(180_000, () => upstream.destroy(new Error('Backend timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    if (!res.writableEnded) res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Start the Along backend before using online features.' } }));
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
  req.pipe(upstream);
}

createServer(async (req, res) => {
  if (!new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]).has(req.headers.host)) {
    res.writeHead(403).end('Forbidden host'); return;
  }
  if (req.url === '/along') { res.writeHead(308, { Location: '/along/' }).end(); return; }
  const requestPath = req.url.startsWith('/along/') ? req.url.slice('/along'.length) : req.url;
  if (requestPath === '/api' || requestPath.startsWith('/api/')) { proxy(req, res, requestPath); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end('Method not allowed'); return; }
  try {
    const pathname = decodeURIComponent(new URL(requestPath, 'http://localhost').pathname);
    if (pathname === '/admin') { res.writeHead(308, { Location: `${req.url.startsWith('/along/') ? '/along' : ''}/admin/` }).end(); return; }
    if (pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(403).end('Forbidden'); return; }
    const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
    const base = isAdmin ? admin : root;
    const relative = isAdmin ? pathname.slice('/admin'.length) : pathname;
    let file = normalize(join(base, relative));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end('Forbidden'); return; }
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const physical = await realpath(file);
    if (!physical.startsWith((await realpath(base)) + sep)) { res.writeHead(403).end('Forbidden'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Along preview: http://localhost:${port} — API ${backend.origin}`);
});
