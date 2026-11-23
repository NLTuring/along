// Deploy the 一起游 APK web layer as a static site at https://tokennext.top/yqy/.
// Usage: node tools/deploy-yqy.mjs <upload|nginx|verify|rollback-nginx>
// Changes only /opt/yqy and /etc/nginx/snippets/yqy-host.conf plus one include line
// inside the existing tokennext.top HTTPS block. The SSH password is never printed.
import { createRequire } from 'node:module';
import { readFile, stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOST = '118.25.147.213', USER = 'root';
const FINGERPRINT = 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU';
const BASE = '/opt/yqy', SNIPPET = '/etc/nginx/snippets/yqy-host.conf';
const SRC = join(ROOT, '_inspect/apk-20261121/assets');
const phase = process.argv[2];
if (!['upload', 'nginx', 'verify', 'rollback-nginx', 'all'].includes(phase)) throw Error('Phase must be upload | nginx | verify | rollback-nginx | all');

const passwordFile = join(ROOT, '.android-local/server-ssh-password.txt');
const secrets = [(await readFile(passwordFile, 'utf8')).trim()];
const redact = (text) => secrets.reduce((t, s) => t.split(s).join('[redacted]'), String(text));

function connect() {
  return new Promise((resolve, reject) => {
    const client = new Client();
    client.on('ready', () => resolve(client));
    client.on('error', (e) => reject(Error(`SSH failed: ${e.level || e.name}`)));
    client.connect({ host: HOST, port: 22, username: USER, password: secrets[0], readyTimeout: 20000, keepaliveInterval: 15000,
      algorithms: { kex: ['curve25519-sha256', 'ecdh-sha2-nistp256'], serverHostKey: ['ssh-ed25519'] },
      hostVerifier: (key) => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` === FINGERPRINT });
  });
}

function run(client, script, label = phase) {
  return new Promise((resolve, reject) => {
    client.exec('bash -s', (error, stream) => {
      if (error) return reject(Error(`Cannot start ${label}`));
      let out = '';
      const take = (chunk) => { const text = redact(chunk.toString()); out += text; process.stdout.write(text); };
      stream.on('data', take); stream.stderr.on('data', take);
      stream.on('close', (code) => code === 0 ? resolve(out) : reject(Error(`${label} exited ${code}`)));
      stream.end(`set -euo pipefail\n${script}\n`);
    });
  });
}

function upload(client, from, to, mode) {
  return new Promise((resolve, reject) => client.sftp((error, sftp) => {
    if (error) return reject(Error('SFTP unavailable'));
    sftp.fastPut(from, to, { mode }, (e) => { sftp.end(); e ? reject(Error(`Upload failed: ${to}`)) : resolve(); });
  }));
}

const nginxEditor = (action) => `python3 -I - <<'PY'
import pathlib, re, shutil, subprocess, sys, time
action = ${JSON.stringify(action)}
snippet = ${JSON.stringify(SNIPPET)}
include = '    include ' + snippet + ';'
along = 'include /etc/nginx/snippets/along-host.conf;'
backups = pathlib.Path(${JSON.stringify(BASE)}) / 'backups'
enabled = list(pathlib.Path('/etc/nginx/sites-enabled').iterdir())
matches = [p.resolve() for p in enabled if p.is_file() and along in p.read_text()]
if len(matches) != 1: sys.exit(f'Expected exactly one tokennext.top site with the Along include, found {len(matches)}')
site = matches[0]
text = site.read_text()
def test():
    r = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
    return r.returncode == 0, (r.stderr.strip().splitlines() or [''])[-1]
if action == 'inspect':
    print('site file:', site); print('already included:', include in text); sys.exit(0)
if action == 'rollback':
    found = sorted(backups.glob(site.name + '.*.bak'))
    if not found: sys.exit('No nginx backup to restore')
    shutil.copy2(found[-1], site); ok, msg = test(); print('restored', found[-1].name, 'nginx -t', ok, msg)
    if not ok: sys.exit(1)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True); print('nginx reloaded'); sys.exit(0)
if include not in text:
    line = next((l for l in text.splitlines() if along in l), None)
    if line is None: sys.exit('Along include line not found')
    backups.mkdir(parents=True, exist_ok=True)
    backup = backups / f'{site.name}.{time.strftime("%Y%m%d-%H%M%S")}.bak'
    shutil.copy2(site, backup); print('backup', backup)
    lines = text.splitlines(keepends=True)
    i = next(i for i, l in enumerate(lines) if along in l)
    if include.strip() in '\\n'.join(lines): sys.exit('include already present')
    lines.insert(i + 1, include + '\\n')
    site.write_text(''.join(lines))
    ok, msg = test()
    if not ok:
        shutil.copy2(backup, site); print('nginx -t failed, original restored:', msg); sys.exit(1)
else:
    print('include already present; testing only')
ok, msg = test(); print('nginx -t', ok, msg)
if not ok: sys.exit(1)
subprocess.run(['systemctl', 'reload', 'nginx'], check=True); print('nginx reloaded')
PY`;

async function publicCheck() {
  const results = {};
  for (const [name, url] of [
    ['root', 'https://tokennext.top/'],
    ['along', 'https://tokennext.top/along/'],
    ['yqy', 'https://tokennext.top/yqy/'],
    ['yqyAppJs', 'https://tokennext.top/yqy/app.js'],
    ['yqyCss', 'https://tokennext.top/yqy/app.css'],
    ['yqyPhoto', 'https://tokennext.top/yqy/places/fuzimiao.jpg'],
  ]) {
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const body = await r.text();
      results[name] = { status: r.status, type: r.headers.get('content-type'), bytes: body.length, title: name === 'yqy' ? (body.match(/<title>([^<]*)<\/title>/) || [])[1] : undefined };
    } catch (e) { results[name] = { error: e.name }; }
  }
  return results;
}

if (phase === 'verify') { console.log(JSON.stringify(await publicCheck(), null, 2)); process.exit(0); }

const client = await connect();
try {
  if (phase === 'upload' || phase === 'all') {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const archive = join(tmpdir(), `yqy-${stamp}.tar.gz`);
    execFileSync('tar', ['-czf', archive, '-C', SRC, '--exclude=./dexopt', '.'], { cwd: ROOT });
    const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    if (/(^|\/)\.env$|\.p12$|\.apk$/m.test(listing)) throw Error('Archive would include a secret or APK');
    console.log(`release ${stamp}: ${listing.split('\n').filter(Boolean).length} entries, ${(await stat(archive)).size} bytes`);
    await run(client, `install -d -m 755 ${BASE} ${BASE}/releases ${BASE}/backups && install -d -m 755 ${BASE}/releases/${stamp}`);
    await upload(client, archive, `${BASE}/releases/${stamp}.tar.gz`, 0o644);
    await run(client, `
cd ${BASE}/releases && tar -xzf ${stamp}.tar.gz -C ${stamp} && rm ${stamp}.tar.gz
ln -sfn ${BASE}/releases/${stamp} ${BASE}/current
echo "current -> $(readlink ${BASE}/current)"; echo "files: $(find ${BASE}/current -type f | wc -l)"`);
    await unlink(archive);
  }
  if (phase === 'nginx' || phase === 'all') {
    await run(client, `install -d -m 755 ${BASE}/backups
cat > ${SNIPPET} <<'CONF'
# Static web layer of the 一起游 APK, served at https://tokennext.top/yqy/
location = /yqy { return 308 /yqy/; }
location ^~ /yqy/ {
    alias ${BASE}/current/;
    index index.html;
    add_header Cache-Control "no-cache";
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
}
CONF
chmod 644 ${SNIPPET}
${nginxEditor('apply')}`);
    console.log(JSON.stringify(await publicCheck(), null, 2));
  }
  if (phase === 'rollback-nginx') await run(client, nginxEditor('rollback'));
} finally {
  client.end();
}
