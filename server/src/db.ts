import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export type Row = Record<string, any>;
export interface SQL {
  query<T extends Row = Row>(sql: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}
export class Database implements SQL {
  constructor(readonly pool: pg.Pool, readonly memory = false) {}
  query<T extends Row = Row>(sql: string, values: unknown[] = []) { return this.pool.query<T>(sql, values); }
  async one<T extends Row = Row>(sql: string, values: unknown[] = []): Promise<T | undefined> { return (await this.query<T>(sql, values)).rows[0]; }
  async tx<T>(run: (client: SQL) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}
export async function migrate(db: Database) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL)');
  const folder = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(folder)).filter(n => n.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, folder), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const old = await db.one('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
    if (old) { if (old.checksum !== checksum) throw new Error('Applied migration checksum mismatch'); continue; }
    await db.tx(async c => { await c.query(sql); await c.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]); });
  }
}
// Explicit local development/test only. pg-mem does NOT provide PostgreSQL durability.
export async function memoryDatabase() {
  const { newDb } = await import('pg-mem');
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const db = new Database(new adapter.Pool() as unknown as pg.Pool, true);
  await migrate(db);
  // Serialize test/local transactions and restore snapshots: pg-mem itself lacks rollback/row locks.
  let chain: Promise<unknown> = Promise.resolve();
  db.tx = <T>(run: (client: SQL) => Promise<T>): Promise<T> => {
    const operation = chain.then(async () => {
      const backup = memory.backup();
      try { return await run(db); } catch (error) { backup.restore(); throw error; }
    });
    chain = operation.catch(() => undefined);
    return operation;
  };
  return db;
}
export async function audit(sql: SQL, actor: string, action: string, resource: string, from: string | null = null, to: string | null = null) {
  const { randomUUID } = await import('node:crypto');
  await sql.query('INSERT INTO audit_events(id,actor_id,action,resource_id,from_status,to_status) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), actor, action, resource, from, to]);
}
