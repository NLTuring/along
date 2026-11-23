import { randomBytes } from 'node:crypto';
import { loadConfig } from './config.js';
import { startServer } from './runtime.js';

if (process.env.NODE_ENV === 'production') throw new Error('Local development cannot run in production');
const env = {
  ...process.env, NODE_ENV: 'development', DEVELOPMENT_LOCAL: 'true', DEV_OTP_DISPLAY: 'true',
  SESSION_SECRET: process.env.SESSION_SECRET || randomBytes(48).toString('base64url'),
  HOST: '127.0.0.1',
};
process.stdout.write('LOCAL TEST MODE: volatile database; OTP displayed; do not use real user data. No AI/mail provider calls.\n');
await startServer(loadConfig(env));
