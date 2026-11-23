// Read-only: compare deployed release files with local trees for the given paths.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FINGERPRINT = 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU';
const password = (await readFile(join(ROOT, '.android-local/server-ssh-password.txt'), 'utf8')).trim();
const targets = process.argv.slice(2);
if (!targets.length) throw Error('Usage: node tools/compare-release.mjs <relative-dir> [...]');

const client = await new Promise((resolve, reject) => {
  const c = new Client();
  c.on('ready', () => resolve(c));
  c.on('error', (e) => reject(Error(`SSH failed: ${e.level || e.name}`)));
  c.connect({ host: '118.25.147.213', port: 22, username: 'root', password, readyTimeout: 20000,
    hostVerifier: (key) => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` === FINGERPRINT });
});

const run = (script) => new Promise((resolve, reject) => {
  client.exec('bash -s', (error, stream) => {
    if (error) return reject(error);
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.on('close', () => resolve(out));
    stream.end(`set -euo pipefail\n${script}\n`);
  });
});

const parse = (text) => new Map(text.split(/\r?\n/).filter(Boolean).map((line) => {
  const m = line.match(/^([0-9a-f]{64})\s+\.?\/?(.+)$/);
  return m ? [m[2].split(sep).join('/'), m[1]] : null;
}).filter(Boolean));

async function walk(dir, base, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, out);
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

const scripts = targets.map((t) => `( cd /opt/along/current/${t} && find . -type f -print0 | sort -z | xargs -0 sha256sum | sed 's| \\./| ${t}/|' )`).join('\n');
const server = parse(await run(scripts));
client.end();

const report = {};
for (const target of targets) {
  const localDir = join(ROOT, target);
  const local = new Map();
  for (const rel of await walk(localDir, localDir, [])) {
    const bytes = await readFile(join(localDir, rel));
    local.set(`${target}/${rel}`, createHash('sha256').update(bytes).digest('hex'));
  }
  const keys = [...local.keys()];
  report[target] = {
    localFiles: local.size,
    serverFiles: [...server.keys()].filter((k) => k.startsWith(`${target}/`)).length,
    onlyLocal: keys.filter((k) => !server.has(k)).sort(),
    onlyServer: [...server.keys()].filter((k) => k.startsWith(`${target}/`) && !local.has(k)).sort(),
    differing: keys.filter((k) => server.has(k) && server.get(k) !== local.get(k)).sort(),
  };
}
console.log(JSON.stringify(report, null, 2));
