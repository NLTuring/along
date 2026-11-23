// Local preview server for Along website — loopback only
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('../public', import.meta.url)));
const assets = join(fileURLToPath(new URL('../assets', import.meta.url)));
const port = Number(process.env.PORT || 55000);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
};

createServer(async (req, res) => {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(req.headers.host?.split(':')[0])) {
    res.writeHead(403).end('Forbidden host');
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405).end('Method not allowed');
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    // Assets served from /assets/*, root HTML from /public/
    const base = pathname.startsWith('/assets/') ? assets : root;
    const relative = pathname.startsWith('/assets/') ? pathname.slice('/assets'.length) : pathname;
    let file = normalize(join(base, relative));
    
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(file)).isDirectory()) {
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Along website preview: http://localhost:${port}`);
});
