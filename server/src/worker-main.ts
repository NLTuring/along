import { loadConfig } from './config.js';
import { createServices, loadEnv, startMaintenance } from './runtime.js';
import { startWorker } from './jobs.js';

loadEnv();
const services = await createServices(loadConfig());
const worker = startWorker(services);
const stopMaintenance = startMaintenance(services);
worker.on('error', () => process.stderr.write('Worker service unavailable; check private operational logs.\n'));
worker.on('failed', () => process.stderr.write('A queued task failed. Inspect its authorized status endpoint.\n'));
process.stdout.write('Along durable worker started.\n');
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  stopMaintenance();
  await worker.close();
  await services.tasks.close?.();
  await services.db.close();
};
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
