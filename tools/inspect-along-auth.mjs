// Read-only login diagnosis on the Along host: counts and states only, no emails, codes or tokens.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const password = (await readFile(new URL('../.android-local/server-ssh-password.txt', import.meta.url), 'utf8')).trim();
const sql = `SELECT 'users' k, count(*)::text v FROM users
UNION ALL SELECT 'sessions:'||client_kind, count(*)::text FROM sessions GROUP BY client_kind
UNION ALL SELECT 'otp_pending', count(*)::text FROM otp_challenges
UNION ALL SELECT 'otp_tries_max', coalesce(max(tries),0)::text FROM otp_challenges
UNION ALL SELECT 'otp_locked', count(*)::text FROM otp_challenges WHERE locked_until > extract(epoch from now())*1000
UNION ALL SELECT 'otp_expired', count(*)::text FROM otp_challenges WHERE expires_at <= extract(epoch from now())*1000
UNION ALL SELECT 'ratelimit:'||split_part(r.key,':',1), max(r.hits)::text FROM rate_limits r GROUP BY split_part(r.key,':',1)
UNION ALL SELECT 'craft:'||variant||':'||status||':'||coalesce(error,'-')||':attempted='||detection_attempted, count(*)::text FROM craft_jobs GROUP BY 1
UNION ALL SELECT 'media:'||kind||':'||status, count(*)::text FROM media GROUP BY 1;`;
const script = `cd /opt/along/current
docker exec -i along-database-1 psql -U along -d along -At -F '=' <<'SQL'
${sql}
SQL
echo '== api status codes for auth routes (from web tier access log, paths only)'
docker logs along-web-1 2>&1 | grep -oE '"(GET|POST|OPTIONS) /api/auth/[a-z]+[^"]*" [0-9]{3}' | sed -E 's/\\?[^ "]*//' | sort | uniq -c | tail -20
echo '== host nginx access for /along/api/auth (status only)'
ls /var/log/nginx/ | head; grep -rhoE '"(GET|POST|OPTIONS) /along/api/auth/[a-z]+[^"]*" [0-9]{3}' /var/log/nginx/ 2>/dev/null | sed -E 's/\\?[^ "]*//' | sort | uniq -c | tail -20
echo '== api errors'
docker logs --since 2026-11-15T07:11:30Z along-api-1 2>&1 | grep -viE 'FastifyWarning|FastifyDeprecation|trace-warnings|^$' | tail -15
echo '== worker log'
docker logs --since 2026-11-15T07:11:30Z along-worker-1 2>&1 | grep -viE 'FastifyWarning|FastifyDeprecation|trace-warnings|^$' | tail -15
echo '== all /along/api requests at host nginx since deploy (method, path shape, status, client kind)'
awk '$4 >= "[15/Nov/2026:15:11"' /var/log/nginx/access.log 2>/dev/null | grep -E '"[A-Z]+ /along/api/' | grep -oE '"[A-Z]+ /along/api/[^ ]* HTTP/[0-9.]+" [0-9]{3} [0-9]+ "[^"]*" "[^"]*"' | sed -E 's#/[0-9a-f-]{36}#/:id#g; s/\\?[^ "]*//; s/"[^"]*" "([^"]*)"$/\\1/' | awk '{ua=($0 ~ /wv\\)|; wv/) ? "android-webview" : ($0 ~ /Mobile/ ? "mobile-browser" : "other"); print $1, $2, $4, ua}' | sort | uniq -c | sort -rn | head -30
echo '== provider reachability from api container'
docker exec along-api-1 node -e "fetch('https://api.hualong-ai.com/v1/models',{signal:AbortSignal.timeout(10000)}).then(r=>console.log('hualong',r.status)).catch(e=>console.log('hualong ERR',e.cause?.code||e.name)); fetch('https://openai.goldgom.top/v1/models',{signal:AbortSignal.timeout(10000)}).then(r=>console.log('goldgom',r.status)).catch(e=>console.log('goldgom ERR',e.cause?.code||e.name))"`;
const client = new Client();
client.on('ready', () => client.exec('bash -s', (e, s) => {
  s.on('data', d => process.stdout.write(d.toString().split(password).join('[redacted]')));
  s.stderr.on('data', d => process.stdout.write(d.toString()));
  s.on('close', () => client.end());
  s.end(script + '\n');
}));
client.on('error', e => console.error('ssh', e.level));
client.connect({ host: '118.25.147.213', username: 'root', password, readyTimeout: 20000,
  algorithms: { kex: ['curve25519-sha256', 'ecdh-sha2-nistp256'], serverHostKey: ['ssh-ed25519'] },
  hostVerifier: k => `SHA256:${createHash('sha256').update(k).digest('base64').replace(/=+$/, '')}` === 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU' });
