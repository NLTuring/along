// Read-only: compare one local file with one remote file by SHA-256.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FINGERPRINT = 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU';
const [localPath, remotePath] = process.argv.slice(2);
if (!localPath || !remotePath) throw Error('Usage: node tools/compare-file.mjs <local> <remote>');
const password = (await readFile(join(ROOT, '.android-local/server-ssh-password.txt'), 'utf8')).trim();
const client = await new Promise((resolve, reject) => {
  const c = new Client();
  c.on('ready', () => resolve(c));
  c.on('error', (e) => reject(Error(`SSH failed: ${e.level || e.name}`)));
  c.connect({ host: '118.25.147.213', port: 22, username: 'root', password, readyTimeout: 20000,
    hostVerifier: (key) => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` === FINGERPRINT });
});
const remote = await new Promise((resolve, reject) => {
  client.exec(`sha256sum ${JSON.stringify(remotePath)}`, (error, stream) => {
    if (error) return reject(error);
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.on('close', () => resolve(out.trim().split(/\s+/)[0]));
  });
});
client.end();
const local = createHash('sha256').update(await readFile(join(ROOT, localPath))).digest('hex');
console.log(JSON.stringify({ local, remote, identical: local === remote }));
