// One connection to the explicitly authorized host; pinned identity; read-only commands.
import { createRequire } from 'node:module';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../_tools/ssh-check/package.json', import.meta.url));
const { Client } = require('ssh2');
const credentialPath = process.argv[2];
if (!credentialPath) throw Error('Provide a temporary credential-file path, never a password argument');
const config = JSON.parse(await readFile(credentialPath, 'utf8'));
await unlink(credentialPath); // one-use file created for this task only
if (config.host !== '118.25.147.213' || config.username !== 'root' || config.fingerprint !== 'SHA256:DqCLK3IOC7fN0o0qFI2Tt5sfdNB3niG92eOTbUYiCrU') throw Error('Unexpected server identity');
const remote = `import json,os,pathlib,shutil,subprocess,re
out={"inspection":"read-only"}
def command(args,limit=10000):
 try:
  r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=12)
  return {"exit":r.returncode,"output":r.stdout[:limit],"error":r.stderr[:500] if r.returncode else ""}
 except Exception as e:return {"error":type(e).__name__+": "+str(e)[:200]}
release=pathlib.Path('/etc/os-release')
if release.exists():out['os']=[s for s in release.read_text().splitlines() if s.startswith(('PRETTY_NAME=','VERSION_ID='))]
out['cpuCount']=os.cpu_count()
mem={}
for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
 if line.startswith(('MemTotal:','MemAvailable:','SwapTotal:','SwapFree:')):
  k,v=line.split(':',1);mem[k]=v.strip()
out['memory']=mem
out['disk']=command(['df','-h','/','/var','/opt'])
out['uptime']=command(['uptime'])
out['listening']=command(['ss','-lntp'])
out['services']=command(['systemctl','list-units','--type=service','--state=running','--no-pager','--no-legend'])
for tool in ['node','npm','docker','nginx','psql','redis-cli','ffmpeg']:
 out[tool+'Path']=shutil.which(tool)
 if shutil.which(tool):
  args=[tool,'--version'] if tool not in ['nginx','redis-cli','ffmpeg'] else [tool,'-v'] if tool=='nginx' else [tool,'--version'] if tool=='redis-cli' else [tool,'-version']
  out[tool+'Version']=command(args,1000)
if shutil.which('docker'):
 out['containers']=command(['docker','ps','--format','{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}}'])
if shutil.which('nginx'):
 try:
  r=subprocess.run(['nginx','-T'],capture_output=True,text=True,timeout=12)
  directives=[]
  for line in r.stdout.splitlines():
   if re.match(r'^\\s*(server_name|listen|root|proxy_pass|ssl_certificate)\\s+',line):
    line=re.sub(r'(https?://)[^/\\s@]+@',r'\\1[redacted]@',line)
    directives.append(line.strip())
  out['nginxSelectedDirectives']=directives[:160]
  out['nginxConfigCheckExit']=r.returncode
 except Exception as e:out['nginxError']=type(e).__name__
for folder in ['/etc/nginx/sites-enabled','/opt','/var/www']:
 p=pathlib.Path(folder)
 if p.is_dir():out['directory:'+folder]=[x.name for x in p.iterdir()][:50]
print(json.dumps(out,ensure_ascii=False))
`;
const result = await new Promise((resolve, reject) => {
  const client = new Client(); let settled = false;
  const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); client.end(); error ? reject(error) : resolve(value); };
  const timer = setTimeout(() => finish(new Error('Read-only inspection timed out')), 90000);
  client.on('error', error => finish(new Error(`SSH inspection failed: ${error.level || error.name}`)));
  client.on('ready', () => client.exec('python3 -I -', (error, stream) => {
    if (error) { finish(new Error('Cannot start read-only inspection')); return; }
    let stdout = '', stderr = '';
    stream.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 150000) { stream.close(); finish(new Error('Output limit exceeded')); } });
    stream.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1000); });
    stream.on('close', code => {
      if (code !== 0) { finish(new Error(`Read-only command exited ${code}: ${stderr.replaceAll(config.password, '[redacted]')}`)); return; }
      try { finish(null, JSON.parse(stdout)); } catch { finish(new Error('Invalid inspection JSON')); }
    });
    stream.end(remote);
  }));
  client.connect({ host: config.host, port: 22, username: config.username, password: config.password,
    readyTimeout: 15000, tryKeyboard: false,
    algorithms: { kex: ['curve25519-sha256', 'ecdh-sha2-nistp256'], serverHostKey: ['ssh-ed25519'] },
    hostVerifier: key => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}` === config.fingerprint,
  });
});
config.password = '';
await writeFile(fileURLToPath(new URL('../_build/server-readonly-check.json', import.meta.url)), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
