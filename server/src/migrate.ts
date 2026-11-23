import pg from 'pg';
import { loadConfig } from './config.js';
import { Database, migrate } from './db.js';
import { loadEnv } from './runtime.js';

loadEnv();
const config = loadConfig();
if (config.local) throw new Error('Use dev:local for the volatile development database');
const db = new Database(new pg.Pool({ connectionString: config.databaseUrl, max: 1 }));
try { await migrate(db); process.stdout.write('Database migrations completed.\n'); }
finally { await db.close(); }
