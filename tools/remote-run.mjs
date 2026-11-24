// Run one shell command on the Along host and print its output with secrets redacted.
// Usage: node tools/remote-run.mjs "<command>"
// Same host key pin and password file as tools/deploy-along.mjs; the password is never printed.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOST = '118.25.147.213', FINGERPRINT = 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU';
const command = process.argv[2];
if (!command) throw Error('Pass the command to run');

const password = (await readFile(join(ROOT, '.android-local/server-ssh-password.txt'), 'utf8')).trim();
const secrets = [password];
for (const line of (await readFile(join(ROOT, '.android-local/along-production.env'), 'utf8')).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && /PASS|SECRET|KEY|TOKEN/.test(m[1]) && m[2].trim().length >= 8) secrets.push(m[2].trim().replace(/^'|'$/g, ''));
}
const redact = (text) => secrets.reduce((t, s) => t.split(s).join('[redacted]'), String(text));

const client = new Client();
client.on('ready', () => client.exec('bash -s', (error, stream) => {
  if (error) { console.error('cannot start command'); client.end(); return; }
  stream.on('data', (d) => process.stdout.write(redact(d)));
  stream.stderr.on('data', (d) => process.stderr.write(redact(d)));
  stream.on('close', (code) => { client.end(); process.exitCode = code; });
  stream.end(`set -uo pipefail\n${command}\n`);
}));
client.on('error', (e) => { console.error(`SSH failed: ${e.level || e.name}`); process.exitCode = 1; });
client.connect({ host: HOST, port: 22, username: 'root', password, readyTimeout: 20000, tryKeyboard: false,
  algorithms: { kex: ['curve25519-sha256', 'ecdh-sha2-nistp256'], serverHostKey: ['ssh-ed25519'] },
  hostVerifier: (key) => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` === FINGERPRINT });
