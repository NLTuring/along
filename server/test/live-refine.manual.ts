// Manual live check of draft AI → refine AI against the gateway in server/.env (not part of npm test).
// Usage: npx tsx test/live-refine.manual.ts "一只戴草帽的橘猫"
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { VisionLayoutProvider, checkLayout, cleanLayout } from '../src/ai-models.js';

const env = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const mesh = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('MESH_')));
const config = loadConfig({ ...mesh, NODE_ENV: 'development', DEVELOPMENT_LOCAL: 'true', DEVELOPMENT_LOCAL_ALLOW_MESH: 'true', SESSION_SECRET: randomBytes(48).toString('base64url') } as any);
const provider = new VisionLayoutProvider(config);
const started = Date.now();
const id = await provider.submit({ kind: 'text', images: [], prompt: process.argv[2] || '一只戴草帽的橘猫' });
let state: any;
for (;;) {
  state = await provider.poll(id);
  if (state.state !== 'running') break;
  await new Promise((r) => setTimeout(r, 2000));
}
console.log(JSON.stringify({ seconds: Math.round((Date.now() - started) / 1000), state: state.state, error: state.error, rounds: state.layout?.rounds, parts: state.layout?.parts?.length, notes: state.layout?.notes, issuesLeft: state.layout && checkLayout(cleanLayout(state.layout)) }, null, 1));
