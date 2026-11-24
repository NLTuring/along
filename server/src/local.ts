import { randomBytes } from 'node:crypto';
import { loadConfig } from './config.js';
import { startServer } from './runtime.js';

if (process.env.NODE_ENV === 'production') throw new Error('Local development cannot run in production');
// Opt-in demo of photo-to-clay: copy only the MESH_* settings from server/.env, nothing else.
const meshEnv: Record<string, string> = {};
if (process.env.DEVELOPMENT_LOCAL_ALLOW_MESH === 'true') {
  try {
    const { parseEnv } = await import('node:util');
    const { readFileSync } = await import('node:fs');
    const all = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
    for (const [key, value] of Object.entries(all)) if (key.startsWith('MESH_') && typeof value === 'string') meshEnv[key] = value;
  } catch { /* no .env: the clay AI stays off */ }
}
const env = {
  ...process.env, ...meshEnv, NODE_ENV: 'development', DEVELOPMENT_LOCAL: 'true', DEV_OTP_DISPLAY: 'true',
  SESSION_SECRET: process.env.SESSION_SECRET || randomBytes(48).toString('base64url'),
  HOST: '127.0.0.1',
};
process.stdout.write(`LOCAL TEST MODE: volatile database; OTP displayed; do not use real user data. No mail calls; ${meshEnv.MESH_PROVIDER ? 'clay photo-to-3D enabled for this demo' : 'no AI calls'}.\n`);
await startServer(loadConfig(env));
