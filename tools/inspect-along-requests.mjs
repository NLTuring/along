// Read-only: summarize /along/api request shapes and status codes from host nginx logs.
// Prints method, path with ids masked, status and a coarse client type. No IPs, queries or bodies.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const password = (await readFile(new URL('../.android-local/server-ssh-password.txt', import.meta.url), 'utf8')).trim();
const script = `echo '== access_log directives'; grep -hE 'access_log' /etc/nginx/sites-available/xindasys /etc/nginx/nginx.conf /etc/nginx/snippets/along-host.conf
python3 -I - <<'PY'
import re, collections, glob
line_re = re.compile(r'"(?P<m>[A-Z]+) (?P<p>/along/[^ ?"]*)[^"]*" (?P<s>\\d{3}) \\S+ "[^"]*" "(?P<ua>[^"]*)"')
counts, files = collections.Counter(), collections.Counter()
for name in glob.glob('/var/log/nginx/*.log') + glob.glob('/var/log/nginx/*.log.1'):
    for line in open(name, errors='replace'):
        m = line_re.search(line)
        if not m: continue
        files[name] += 1
        path = re.sub(r'/[0-9a-f]{8}-[0-9a-f-]{27}', '/:id', m['p'])
        if not path.startswith('/along/api/'): path = '/along/<static>'
        ua = m['ua']; kind = 'android-webview' if '; wv)' in ua else 'mobile-browser' if 'Mobile' in ua else 'desktop/other'
        counts[(m['m'], path, m['s'], kind)] += 1
print('== files', dict(files))
for (method, path, status, kind), n in sorted(counts.items(), key=lambda x: -x[1])[:40]:
    print(f'{n:4} {method:7} {path:40} {status} {kind}')
PY`;
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
