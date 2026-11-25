import fs from 'node:fs/promises';
import path from 'node:path';
import { closePool, query, withTransaction } from '../src/config/database.js';
import { BACKEND_ROOT, env } from '../src/config/env.js';
import { assertSeedAllowed, sortSqlFiles } from '../src/utils/migrationHelpers.js';

const SEEDS_DIR = path.join(BACKEND_ROOT, 'db', 'seeds');

async function main(): Promise<void> {
  try {
    assertSeedAllowed(env.nodeEnv, process.argv);

    const schemaCheck = await query<{ migrations_tbl: string | null; models_tbl: string | null }>(
      `SELECT
         to_regclass('public.schema_migrations')::text AS migrations_tbl,
         to_regclass('public.garment_models')::text AS models_tbl`
    );
    const row = schemaCheck.rows[0];
    if (!row?.migrations_tbl || !row?.models_tbl) {
      throw new Error(
        'Skema database belum dimigrasi. Jalankan "npm run db:migrate" terlebih dahulu sebelum db:seed.'
      );
    }

    const entries = await fs.readdir(SEEDS_DIR);
    const seedFiles = sortSqlFiles(entries);

    if (seedFiles.length === 0) {
      console.log('[db:seed] Tidak ada file seed di backend/db/seeds/.');
      return;
    }

    for (const fileName of seedFiles) {
      const sql = await fs.readFile(path.join(SEEDS_DIR, fileName), 'utf8');
      console.log(`[db:seed] Menjalankan seed ${fileName}...`);
      await withTransaction(async (client) => {
        await client.query(sql);
      });
      console.log(`[db:seed] Selesai: ${fileName}`);
    }

    console.log('[db:seed] Seluruh seed placeholder berhasil dijalankan.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[db:seed] Gagal:', message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

void main();
