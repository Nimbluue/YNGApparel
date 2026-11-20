import pg, { type Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { assertDbEnv, env } from './env.js';

const { Pool: PgPool, types } = pg;

// SPEC Bagian 7 #5: pg mengembalikan BIGINT (OID 20) & NUMERIC (OID 1700) sebagai string.
// Konversi ke Number karena ID berukuran kecil dan harga memakai rupiah bulat.
types.setTypeParser(20, (val: string) => Number(val));
types.setTypeParser(1700, (val: string) => Number(val));

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    assertDbEnv();

    pool = new PgPool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl,
      max: env.databasePoolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err: Error) => {
      console.error('[DB Pool Error]', err.message);
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/**
 * Menjalankan callback di dalam transaksi PostgreSQL (`BEGIN` / `COMMIT` / `ROLLBACK`).
 * Seluruh query di dalam transaksi wajib melalui `client` yang diberikan.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      const message = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
      console.error('[DB Rollback Error]', message);
    }
    throw err;
  } finally {
    client.release();
  }
}

export interface DbConnectionInfo {
  database_name: string;
  db_user: string;
  utc_now: Date | string;
  wib_now: Date | string;
  public_table_count: number;
}

export async function checkDbConnection(): Promise<DbConnectionInfo> {
  const result = await query<DbConnectionInfo>(
    `SELECT
       current_database() AS database_name,
       current_user AS db_user,
       NOW() AT TIME ZONE 'UTC' AS utc_now,
       NOW() AT TIME ZONE 'Asia/Jakarta' AS wib_now,
       (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname = 'public') AS public_table_count`
  );
  return result.rows[0];
}

export async function closePool(): Promise<void> {
  if (pool) {
    const activePool = pool;
    pool = null;
    await activePool.end();
  }
}
