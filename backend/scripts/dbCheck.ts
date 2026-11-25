import { checkDbConnection, closePool } from '../src/config/database.js';

async function main(): Promise<void> {
  try {
    const info = await checkDbConnection();
    console.log('Koneksi database PostgreSQL BERHASIL:');
    console.log(`- Database     : ${info.database_name}`);
    console.log(`- User/Role    : ${info.db_user}`);
    console.log(`- Waktu UTC    : ${String(info.utc_now)}`);
    console.log(`- Waktu WIB    : ${String(info.wib_now)}`);
    console.log(`- Tabel public : ${info.public_table_count}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Koneksi database PostgreSQL GAGAL:', message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

void main();
