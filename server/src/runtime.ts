import pg from 'pg';
import { loadConfig, type Config } from './config.js';
import { Database, memoryDatabase } from './db.js';
import { FileStorage, S3Storage, type Storage } from './storage.js';
import { createMailer } from './auth.js';
import { DurableTasks, LocalTasks } from './jobs.js';
import { HttpImageProvider } from './providers.js';
import { AliyunImageProvider } from './aliyun-provider.js';
import { OpenAIPersonProvider } from './openai-person-provider.js';
import { flushOutbox, type Services } from './core.js';
import { createApp } from './app.js';

export function loadEnv() { try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch (error: any) { if (error.code !== 'ENOENT') throw error; } }
export async function createServices(config: Config): Promise<Services> {
  if (config.local && !['127.0.0.1', '::1', 'localhost'].includes(config.host)) throw new Error('Local development may bind only loopback');
  const db = config.local ? await memoryDatabase() : new Database(new pg.Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 30000 }));
  const storage: Storage = config.local || config.storageDriver === 'filesystem' ? new FileStorage(config.storageDir) : new S3Storage(config.s3);
  await storage.check?.();
  let services: Services;
  const tasks = config.local ? new LocalTasks(() => services) : new DurableTasks(config.redisUrl);
  services = { config, db, storage, tasks, mailer: createMailer(config), provider: config.ai.provider === 'openai-person' ? new OpenAIPersonProvider(config) : config.ai.provider === 'aliyun-dashscope' ? new AliyunImageProvider(config) : new HttpImageProvider(config) };
  await db.query('SELECT 1');
  if (!config.local) {
    for (const name of ['001_initial.sql', '002_person_detection.sql', '003_mobile_auth.sql']) {
      if (!await db.one('SELECT name FROM schema_migrations WHERE name=$1', [name])) throw new Error('Run npm run migrate first');
    }
  }
  return services;
}
export function startMaintenance(s: Services) {
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true;
    try {
      await flushOutbox(s);
      await s.db.query('DELETE FROM sessions WHERE expires_at<$1', [Date.now()]);
      await s.db.query('DELETE FROM otp_challenges WHERE expires_at<$1 AND locked_until<$1', [Date.now() - 86400000]);
      await s.db.query('DELETE FROM rate_limits WHERE window_start<$1', [Date.now() - 86400000]);
    } catch { process.stderr.write('Background maintenance unavailable; retrying\n'); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void run(); }, 2000); timer.unref(); void run();
  return () => clearInterval(timer);
}
export async function startServer(config = loadConfig()) {
  const services = await createServices(config), app = await createApp(services);
  const stopMaintenance = startMaintenance(services);
  await app.listen({ host: config.host, port: config.port });
  process.stdout.write(`Along API listening on ${config.host}:${config.port} (${config.local ? 'EXPLICIT LOCAL DEVELOPMENT, volatile database and queue' : config.mode})\n`);
  let closing = false;
  const close = async () => { if (closing) return; closing = true; stopMaintenance(); await app.close(); await services.tasks.close?.(); await services.db.close(); };
  process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
  return { app, services, close };
}
