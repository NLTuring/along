// Read-only: dump checksums of the deployed web assets for comparison with the local tree.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FINGERPRINT = 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU';
const password = (await readFile(join(ROOT, '.android-local/server-ssh-password.txt'), 'utf8')).trim();
const client = await new Promise((resolve, reject) => {
  const c = new Client();
  c.on('ready', () => resolve(c));
  c.on('error', (e) => reject(Error(`SSH failed: ${e.level || e.name}`)));
  c.connect({ host: '118.25.147.213', port: 22, username: 'root', password, readyTimeout: 20000,
    hostVerifier: (key) => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` === FINGERPRINT });
});
client.exec('bash -s', (error, stream) => {
  if (error) { console.error(error.message); process.exit(1); }
  stream.on('data', (d) => process.stdout.write(d));
  stream.on('close', () => client.end());
  stream.end(`set -euo pipefail
cd /opt/along/current/mobile/assets
find . -type f -print0 | sort -z | xargs -0 sha256sum | sed 's| \\./| |'
`);
});
