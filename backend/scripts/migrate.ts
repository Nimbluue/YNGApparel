import fs from 'node:fs/promises';
import path from 'node:path';
import { ADVISORY_LOCKS } from '../src/config/constants.js';
import { closePool, getPool } from '../src/config/database.js';
import { BACKEND_ROOT } from '../src/config/env.js';
import {
  type AppliedMigrationRow,
  computeSqlChecksum,
  sortSqlFiles,
  verifyAppliedMigrations,
} from '../src/utils/migrationHelpers.js';

const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'db', 'migrations');

interface MigrationFilePayload {
  version: string;
  checksum: string;
  sql: string;
}

async function readMigrationFiles(): Promise<MigrationFilePayload[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  const sortedNames = sortSqlFiles(entries);

  const files: MigrationFilePayload[] = [];
  for (const version of sortedNames) {
    const filePath = path.join(MIGRATIONS_DIR, version);
    const sql = await fs.readFile(filePath, 'utf8');
    files.push({
      version,
      checksum: computeSqlChecksum(sql),
      sql,
    });
  }
  return files;
}

async function main(): Promise<void> {
  const client = await getPool().connect();
  let lockAcquired = false;

  try {
    // ASSUMPTION: pg_advisory_lock memakai session lock agar berlaku lintas transaksi per file;
    // jalankan db:migrate melalui Session Pooler (port 5432) atau koneksi langsung, bukan Transaction Pooler (port 6543).
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCKS.MIGRATE]);
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      -- ASSUMPTION: aktifkan RLS tanpa policy pada schema_migrations agar 100% tabel public tertutup dari Data API Supabase
      ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
    `);

    const appliedResult = await client.query<AppliedMigrationRow>(
      'SELECT version, checksum FROM public.schema_migrations ORDER BY version ASC'
    );

    const diskFiles = await readMigrationFiles();
    const pendingFiles = verifyAppliedMigrations(
      appliedResult.rows,
      diskFiles.map(({ version, checksum }) => ({ version, checksum }))
    );

    if (pendingFiles.length === 0) {
      console.log('[db:migrate] Semua migrasi sudah terpasang dan checksum terverifikasi.');
    } else {
      const payloadByVersion = new Map(diskFiles.map((file) => [file.version, file]));
      for (const pending of pendingFiles) {
        const payload = payloadByVersion.get(pending.version);
        if (!payload) {
          throw new Error(`Payload migrasi "${pending.version}" tidak ditemukan.`);
        }

        console.log(`[db:migrate] Menjalankan migrasi ${payload.version}...`);
        await client.query('BEGIN');
        try {
          // Gunakan 1 argumen (simple query protocol) agar multi-statement & blok DO $$ berjalan utuh.
          await client.query(payload.sql);
          await client.query(
            'INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)',
            [payload.version, payload.checksum]
          );
          await client.query('COMMIT');
          console.log(`[db:migrate] Selesai: ${payload.version}`);
        } catch (err) {
          await client.query('ROLLBACK');
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Migrasi "${payload.version}" gagal dan di-rollback: ${msg}`);
        }
      }
    }

    const tableCountResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM pg_tables WHERE schemaname = 'public'`
    );
    const totalTables = tableCountResult.rows[0]?.total ?? 0;
    console.log(
      `[db:migrate] Total tabel di skema public: ${totalTables} (termasuk schema_migrations).`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[db:migrate] Gagal:', message);
    process.exitCode = 1;
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCKS.MIGRATE]);
      } catch (unlockErr) {
        const msg = unlockErr instanceof Error ? unlockErr.message : String(unlockErr);
        console.error('[db:migrate] Gagal melepas advisory lock:', msg);
      }
    }
    client.release();
    await closePool();
  }
}

void main();
