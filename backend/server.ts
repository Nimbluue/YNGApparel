import app from './src/app.js';
import { closePool } from './src/config/database.js';
import { assertServerEnv, env } from './src/config/env.js';

assertServerEnv();

const server = app.listen(env.port, () => {
  console.log(`[YNG Backend] Server aktif pada port ${env.port} (${env.nodeEnv})`);
});

let isShuttingDown = false;

function shutdown(signal: string): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[YNG Backend] Menerima ${signal}, menutup server...`);
  server.close(() => {
    void closePool()
      .then(() => {
        console.log('[YNG Backend] Pool database ditutup. Keluar.');
        process.exit(0);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[YNG Backend] Gagal menutup pool database:', message);
        process.exit(1);
      });
  });

  setTimeout(() => {
    console.error('[YNG Backend] Shutdown paksa setelah timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
