import type { DbHealthStatusDto, HealthStatusDto } from '@yng/shared';
import { Router } from 'express';
import { checkDbConnection } from '../config/database.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import adminRoutes from './adminRoutes.js';
import publicRoutes from './publicRoutes.js';

const router = Router();

router.get('/health', (_req, res) => {
  return sendSuccess<HealthStatusDto>(res, {
    message: 'Server YNG Apparel aktif.',
    data: {
      status: 'ok',
      env: env.nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
});

router.get(
  '/health/db',
  asyncHandler(async (_req, res) => {
    const dbStatus = await checkDbConnection();
    return sendSuccess<DbHealthStatusDto>(res, {
      message: 'Koneksi database PostgreSQL berhasil.',
      data: {
        status: 'ok',
        database: dbStatus.database_name,
        publicTables: dbStatus.public_table_count,
        utcNow: dbStatus.utc_now,
        wibNow: dbStatus.wib_now,
      },
    });
  })
);

router.use('/', publicRoutes);
router.use('/admin', adminRoutes);

export default router;
