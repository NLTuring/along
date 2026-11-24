// Phased deployment of Along to the authorized host under https://tokennext.top/along/.
// Usage: node tools/deploy-along.mjs <preflight|upload|build|start|nginx|verify|rollback-nginx>
// The SSH password is read from .android-local/server-ssh-password.txt and never printed.
// Each phase is idempotent and stops on the first failure; nothing outside /opt/along,
// /etc/nginx/snippets/along-host.conf and one include line in the tokennext.top HTTPS block changes.
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
const HOST = '118.25.147.213', USER = 'root', FINGERPRINT = 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU';
const BASE = '/opt/along', SNIPPET = '/etc/nginx/snippets/along-host.conf';
const COMPOSE = `docker compose --env-file ${BASE}/shared/production.env -f deploy/compose.yaml -f deploy/compose.single-host.yaml`;
const phase = process.argv[2];
const phases = ['preflight', 'probe-mirrors', 'images', 'upload', 'config', 'build', 'start', 'nginx', 'verify', 'rollback-nginx'];
// Docker Hub is unreachable from the host. Base images are pulled by full mirror name and
// tagged locally, so the global Docker daemon configuration is left untouched.
const IMAGES = ['postgres:17-bookworm', 'redis:7.4-alpine', 'node:24-bookworm-slim', 'nginx:1.28-alpine'];
const MIRRORS = ['mirror.ccs.tencentyun.com', 'docker.m.daocloud.io', 'docker.1ms.run'];
if (!phases.includes(phase)) throw Error(`Phase must be one of ${phases.join(', ')}`);

const local = (p) => join(ROOT, p);
const envText = await readFile(local('.android-local/along-production.env'), 'utf8');
const secrets = [];
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && /PASS|SECRET|KEY|TOKEN/.test(m[1])) { const v = m[2].trim().replace(/^'|'$/g, ''); if (v.length >= 8) secrets.push(v); }
}
const env = Object.fromEntries(envText.split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^'|'$/g, '')]));
if (env.NODE_ENV !== 'production' || env.PUBLIC_BASE_PATH !== '/along' || env.DEVELOPMENT_LOCAL === 'true' || env.DEV_OTP_DISPLAY === 'true') throw Error('Staged production env is not a production /along configuration');

const redact = (text) => secrets.reduce((t, s) => t.split(s).join('[redacted]'), String(text));
const passwordFile = local('.android-local/server-ssh-password.txt');

async function connect() {
  const password = (await readFile(passwordFile, 'utf8')).trim();
  if (!password) throw Error('Empty SSH password file');
  secrets.push(password);
  return new Promise((resolve, reject) => {
    const client = new Client();
    client.on('ready', () => resolve(client));
    client.on('error', (e) => reject(Error(`SSH failed: ${e.level || e.name}`)));
    client.connect({ host: HOST, port: 22, username: USER, password, readyTimeout: 20000, tryKeyboard: false, keepaliveInterval: 15000,
      algorithms: { kex: ['curve25519-sha256', 'ecdh-sha2-nistp256'], serverHostKey: ['ssh-ed25519'] },
      hostVerifier: (key) => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` === FINGERPRINT });
  });
}

function run(client, script, { timeout = 600000, label = phase } = {}) {
  return new Promise((resolve, reject) => {
    client.exec('bash -s', (error, stream) => {
      if (error) return reject(Error(`Cannot start ${label}`));
      let out = '';
      const timer = setTimeout(() => { stream.close(); reject(Error(`${label} timed out`)); }, timeout);
      const take = (chunk) => { const text = redact(chunk.toString()); out += text; process.stdout.write(text); };
      stream.on('data', take); stream.stderr.on('data', take);
      stream.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(Error(`${label} exited ${code}`)); });
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
backups = pathlib.Path(${JSON.stringify(BASE)}) / 'backups'
def blocks(text):
    # Top-level server blocks with comment/quote-aware brace matching.
    out, i, depth, start, n = [], 0, 0, None, len(text)
    while i < n:
        c = text[i]
        if c == '#':
            j = text.find('\\n', i); i = n if j < 0 else j; continue
        if c in '"\\'':
            j = i + 1
            while j < n and text[j] != c: j += 2 if text[j] == '\\\\' else 1
            i = j + 1; continue
        if c == '{':
            if depth == 0 and re.search(r'(^|[\\s;}])server\\s*$', text[max(0, i - 40):i]): start = text.rfind('server', 0, i)
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0 and start is not None: out.append((start, i + 1)); start = None
        i += 1
    return out
matches = []
for path in sorted(pathlib.Path('/etc/nginx/sites-enabled').iterdir()):
    real = path.resolve(); text = real.read_text()
    for s, e in blocks(text):
        body = text[s:e]
        if re.search(r'^\\s*server_name\\s+tokennext\\.top\\s*;', body, re.M) and re.search(r'^\\s*listen\\s+443\\b', body, re.M):
            matches.append((real, s, e))
if len(matches) != 1: sys.exit(f'Expected exactly one tokennext.top HTTPS server block, found {len(matches)}')
real, s, e = matches[0]
text = real.read_text(); body = text[s:e]
def test():
    r = subprocess.run(['nginx', '-t'], capture_output=True, text=True); return r.returncode == 0, r.stderr.strip().splitlines()[-1:]
if action == 'inspect':
    print('site file:', real); print('already included:', snippet in body)
    print('existing /along locations:', bool(re.search(r'location[^{]*/along', body)))
    sys.exit(0)
if action == 'rollback':
    found = sorted(backups.glob(real.name + '.*.bak'))
    if not found: sys.exit('No nginx backup to restore')
    shutil.copy2(found[-1], real); ok, msg = test(); print('restored', found[-1].name, 'nginx -t', ok, msg)
    if not ok: sys.exit(1)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True); print('nginx reloaded'); sys.exit(0)
if snippet in body: print('include already present; testing only')
else:
    if re.search(r'location[^{]*/along', body): sys.exit('The site already has an /along location; not editing')
    m = re.search(r'^[ \\t]*server_name\\s+tokennext\\.top\\s*;[^\\n]*\\n', body, re.M)
    backups.mkdir(parents=True, exist_ok=True)
    backup = backups / f'{real.name}.{time.strftime("%Y%m%d-%H%M%S")}.bak'
    shutil.copy2(real, backup); print('backup', backup)
    real.write_text(text[:s + m.end()] + include + '\\n' + text[s + m.end():])
    ok, msg = test()
    if not ok:
        shutil.copy2(backup, real); print('nginx -t failed, original restored:', msg); sys.exit(1)
ok, msg = test(); print('nginx -t', ok, msg)
if not ok: sys.exit(1)
subprocess.run(['systemctl', 'reload', 'nginx'], check=True); print('nginx reloaded')
PY`;

async function publicCheck() {
  const results = {};
  for (const [name, url] of [['main', 'https://tokennext.top/'], ['sord', 'https://sord.tokennext.top/'], ['along', 'https://tokennext.top/along/'],
    ['alongHealth', 'https://tokennext.top/along/api/health'], ['alongConfig', 'https://tokennext.top/along/api/config'], ['alongAdmin', 'https://tokennext.top/along/admin/']]) {
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const body = await r.text();
      results[name] = { status: r.status, type: r.headers.get('content-type'), sample: name === 'alongConfig' || name === 'alongHealth' ? body.slice(0, 400) : body.length };
    } catch (e) { results[name] = { error: e.name }; }
  }
  return results;
}

if (phase === 'verify') {
  console.log(JSON.stringify(await publicCheck(), null, 2));
  process.exit(0);
}

const client = await connect();
try {
  if (phase === 'preflight') {
    console.log(JSON.stringify({ publicBefore: await publicCheck() }, null, 2));
    await run(client, `
echo "== docker"; docker info --format 'server={{.ServerVersion}} mirrors={{json .RegistryConfig.Mirrors}} root={{.DockerRootDir}}'
docker compose version
echo "== containers"; docker ps -a --format '{{.Names}} {{.Status}}' | head -20
echo "== images"; docker images --format '{{.Repository}}:{{.Tag}}' | head -20
echo "== along state"; ls -la ${BASE} 2>/dev/null || echo "no ${BASE}"; docker volume ls --format '{{.Name}}' | grep -i along || echo "no along volumes"
echo "== port 4338"; (ss -lnt | grep -q ':4338 ') && echo "4338 IN USE" || echo "4338 free"
echo "== registry reachability"; for u in https://registry-1.docker.io/v2/ https://registry.npmjs.org/ https://registry.npmmirror.com/ https://deb.debian.org/; do printf '%s ' "$u"; curl -s -o /dev/null -m 10 -w '%{http_code}\\n' "$u" || echo fail; done
echo "== memory"; free -m | head -2; df -h / | tail -1
echo "== nginx"; ${nginxEditor('inspect').replace(/\n/g, '\n')}
`, { timeout: 120000 });
  }
  if (phase === 'probe-mirrors') {
    await run(client, MIRRORS.map((m) => `printf '%s ' ${m}; curl -s -o /dev/null -m 10 -w '%{http_code}\\n' https://${m}/v2/ || echo fail`).join('\n'), { timeout: 120000 });
  }
  if (phase === 'images') {
    await run(client, `
for image in ${IMAGES.join(' ')}; do
  if docker image inspect "$image" >/dev/null 2>&1; then echo "have $image"; continue; fi
  ok=
  for mirror in ${MIRRORS.join(' ')}; do
    if timeout 900 docker pull -q "$mirror/library/$image" >/dev/null 2>&1; then
      docker tag "$mirror/library/$image" "$image"; docker rmi "$mirror/library/$image" >/dev/null
      echo "pulled $image via $mirror $(docker image inspect -f '{{.Id}}' "$image" | cut -c1-19)"; ok=1; break
    fi
  done
  [ -n "$ok" ] || { echo "FAILED $image"; exit 1; }
done`, { timeout: 3600000 });
  }
  if (phase === 'upload') {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const archive = join(tmpdir(), `along-release-${stamp}.tar.gz`);
    const files = ['package.json', 'package-lock.json', 'mobile/assets', 'admin', 'deploy', 'server/package.json', 'server/package-lock.json',
      'server/tsconfig.json', 'server/tsconfig.build.json', 'server/src', 'server/migrations', 'mobile/pinch', 'mobile/tools/build-3d.mjs', 'mobile/tools/check.mjs'];
    execFileSync('tar', ['-czf', archive, '--exclude=__pycache__', '--exclude=node_modules', ...files], { cwd: ROOT });
    const archiveText = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    if (/(^|\/)(\.env|production\.env|.*\.p12|.*\.apk)$/m.test(archiveText)) throw Error('Release archive would include a secret or APK');
    const plain = execFileSync('tar', ['-xzOf', archive], { maxBuffer: 512 * 1024 * 1024 });
    if (secrets.some((s) => s.length >= 8 && plain.includes(Buffer.from(s)))) throw Error('Release archive contains a configured secret');
    console.log(`release ${stamp}: ${archiveText.split('\n').filter(Boolean).length} entries, ${(await stat(archive)).size} bytes`);
    await run(client, `install -d -m 755 ${BASE} ${BASE}/releases ${BASE}/backups && install -d -m 700 ${BASE}/shared && install -d -m 700 -o 1000 -g 1000 ${BASE}/shared/private`);
    await upload(client, archive, `${BASE}/releases/${stamp}.tar.gz`, 0o600);
    await upload(client, local('.android-local/along-production.env'), `${BASE}/shared/production.env.new`, 0o600);
    await run(client, `
cd ${BASE}/releases && mkdir ${stamp} && tar -xzf ${stamp}.tar.gz -C ${stamp} && rm ${stamp}.tar.gz
[ -f ${BASE}/shared/production.env ] && cp -p ${BASE}/shared/production.env ${BASE}/backups/production.env.$(date +%Y%m%d-%H%M%S).bak
echo "previous release: $(readlink ${BASE}/current 2>/dev/null || echo none)"
chmod 600 ${BASE}/shared/production.env.new && mv ${BASE}/shared/production.env.new ${BASE}/shared/production.env
ln -s ${BASE}/shared/production.env ${BASE}/releases/${stamp}/deploy/production.env
ln -sfn ${BASE}/releases/${stamp} ${BASE}/current
echo "current -> $(readlink ${BASE}/current)"; stat -c '%a %n' ${BASE}/shared/production.env`);
    await unlink(archive);
  }
  if (phase === 'config') {
    // Environment-only change: keep a dated copy of the old file, then recreate api/worker on the same images.
    await upload(client, local('.android-local/along-production.env'), `${BASE}/shared/production.env.new`, 0o600);
    await run(client, `
cp -p ${BASE}/shared/production.env ${BASE}/backups/production.env.$(date +%Y%m%d-%H%M%S).bak
chmod 600 ${BASE}/shared/production.env.new && mv ${BASE}/shared/production.env.new ${BASE}/shared/production.env
cd ${BASE}/current && ${COMPOSE} up -d --no-build --force-recreate api worker
for i in $(seq 1 30); do curl -fsS -m 5 http://127.0.0.1:4338/api/health >/dev/null 2>&1 && break; sleep 3; done
echo "== health"; curl -sS -m 5 http://127.0.0.1:4338/api/health; echo
echo "== config"; curl -sS -m 5 http://127.0.0.1:4338/api/config; echo
docker exec along-api-1 node -e "fetch('https://api.hualong-ai.com/v1/models',{signal:AbortSignal.timeout(10000)}).then(r=>console.log('provider reachable from api container, unauthenticated status',r.status)).catch(e=>console.log('provider ERR',e.cause?.code||e.name))"
${COMPOSE} ps --format '{{.Service}} {{.State}} {{.Status}}'`, { timeout: 300000 });
  }
  if (phase === 'build') {
    await upload(client, local('deploy/Dockerfile.server'), `${BASE}/current/deploy/Dockerfile.server`, 0o644);
    await run(client, `cd ${BASE}/current
${COMPOSE} build --progress plain --build-arg DEBIAN_MIRROR=http://mirrors.tencentyun.com > ${BASE}/build.log 2>&1; code=$?
tail -n 40 ${BASE}/build.log; exit $code`, { timeout: 3000000 });
  }
  if (phase === 'start') {
    await run(client, `
cd ${BASE}/current
${COMPOSE} up -d database redis
for i in $(seq 1 30); do [ "$(docker inspect -f '{{.State.Health.Status}}' along-database-1)" = healthy ] && [ "$(docker inspect -f '{{.State.Health.Status}}' along-redis-1)" = healthy ] && break; sleep 3; done
# A dated, private copy of the database before any migration runs.
dump=${BASE}/backups/along-db.$(date +%Y%m%d-%H%M%S).sql.gz
docker exec along-database-1 pg_dump -U along -d along --no-owner | gzip > "$dump" && chmod 600 "$dump" && echo "database backup $(basename "$dump") $(stat -c %s "$dump") bytes"
${COMPOSE} run --rm -T api node dist/migrate.js </dev/null
${COMPOSE} up -d api worker web
for i in $(seq 1 30); do curl -fsS -m 5 http://127.0.0.1:4338/api/health >/dev/null 2>&1 && break; sleep 3; done
echo "== health"; curl -sS -m 5 http://127.0.0.1:4338/api/health; echo
echo "== config"; curl -sS -m 5 http://127.0.0.1:4338/api/config; echo
echo "== index"; curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:4338/
${COMPOSE} ps --format '{{.Service}} {{.State}} {{.Status}}'
${COMPOSE} logs --tail 15 api worker 2>&1 | tail -n 30`, { timeout: 600000 });
  }
  if (phase === 'nginx') {
    await run(client, `install -m 644 ${BASE}/current/deploy/along-host.nginx.conf ${SNIPPET}\n${nginxEditor('apply')}`, { timeout: 120000 });
    console.log(JSON.stringify(await publicCheck(), null, 2));
  }
  if (phase === 'rollback-nginx') {
    await run(client, nginxEditor('rollback'), { timeout: 120000 });
  }
} finally {
  client.end();
}
