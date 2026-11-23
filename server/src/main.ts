import { loadEnv, startServer } from './runtime.js';
loadEnv();
await startServer();
