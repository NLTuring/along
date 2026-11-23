// Read-only status probe for the Along host. Prints no secrets.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOST = '118.25.147.213';
const FINGERPRINT = 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU';

const password = (await readFile(join(ROOT, '.android-local/server-ssh-password.txt'), 'utf8')).trim();
const client = await new Promise((resolve, reject) => {
  const c = new Client();
  c.on('ready', () => resolve(c));
  c.on('error', (e) => reject(Error(`SSH failed: ${e.level || e.name}`)));
  c.connect({
    host: HOST, port: 22, username: 'root', password, readyTimeout: 20000,
    hostVerifier: (key) => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` === FINGERPRINT,
  });
});

const script = `
set -uo pipefail
echo "== host"; hostname; uptime; free -m | head -2; df -h / | tail -1
echo "== containers"; docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' | head -20
echo "== along image"; docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -i along || echo none
echo "== along current"; readlink -f /opt/along/current 2>/dev/null || echo none
echo "== releases"; ls -1 /opt/along/releases 2>/dev/null | tail -5
echo "== index mtime"; stat -c '%y %n' /opt/along/current/mobile/assets/index.html 2>/dev/null || echo none
echo "== api health"; curl -sS -m 5 http://127.0.0.1:4338/api/health; echo
echo "== web root"; curl -sS -m 5 -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:4338/
echo "== nginx include"; grep -n 'along-host.conf' /etc/nginx/sites-enabled/* 2>/dev/null || echo none
echo "== nginx test"; nginx -t 2>&1 | tail -2
echo "== cert"; echo | openssl s_client -servername tokennext.top -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null || echo none
echo "== listening"; ss -lntp | grep -E ':(80|443|4338) ' || echo none
echo "== recent api logs"; cd /opt/along/current 2>/dev/null && docker compose --env-file /opt/along/shared/production.env -f deploy/compose.yaml -f deploy/compose.single-host.yaml logs --tail 12 api 2>&1 | tail -14
`;

client.exec('bash -s', (error, stream) => {
  if (error) { console.error('exec failed', error.message); process.exit(1); }
  stream.on('data', (d) => process.stdout.write(d));
  stream.stderr.on('data', (d) => process.stderr.write(d));
  stream.on('close', () => { client.end(); });
  stream.end(`set -uo pipefail\n${script}\n`);
});
