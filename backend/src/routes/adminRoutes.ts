import { USER_ROLE } from '@yng/shared';
import { Router, type RequestHandler } from 'express';
import {
  createAdminMasterController,
  createFabricBodySchema,
  createFabricColorBodySchema,
  createModelBodySchema,
  createPaymentAccountBodySchema,
  createPrintSizeBodySchema,
  createSizeBodySchema,
  fabricColorParamsSchema,
  idParamSchema,
  listMasterQuerySchema,
  replaceModelFabricsBodySchema,
  updateFabricBodySchema,
  updateFabricColorBodySchema,
  updateModelBodySchema,
  updatePaymentAccountBodySchema,
  updatePrintSizeBodySchema,
  updateSettingsBodySchema,
  updateSizeBodySchema,
  uploadImageBodySchema,
  uploadImageQuerySchema,
} from '../controllers/adminMasterController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { catalogImageUploadMiddleware } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import type { AdminMasterService } from '../services/adminMasterService.js';

export interface AdminRouterOptions {
  requireAuthMiddleware?: RequestHandler;
  masterService?: AdminMasterService;
  imageUploadLimiter?: RequestHandler;
}

/**
 * Membangun router `/api/admin/*` yang seluruh rutenya diproteksi `requireAuth` + `requireRole('ADMIN')`.
 */
export function createAdminRouter(
  optionsOrRequireAuth: RequestHandler | AdminRouterOptions = {}
): Router {
  const options: AdminRouterOptions =
    typeof optionsOrRequireAuth === 'function'
      ? { requireAuthMiddleware: optionsOrRequireAuth }
      : optionsOrRequireAuth;

  const router = Router();
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const imageUploadLimiter = options.imageUploadLimiter ?? uploadLimiter;
  const masterController = createAdminMasterController(options.masterService);

  router.use(requireAuthMiddleware, requireRole(USER_ROLE.ADMIN));

  // Upload gambar katalog (bucket catalog)
  router.post(
    '/uploads/image',
    imageUploadLimiter,
    catalogImageUploadMiddleware,
    validate({ body: uploadImageBodySchema, query: uploadImageQuerySchema }),
    masterController.uploadImage
  );

  // Master: Model pakaian & relasi bahan
  router.get('/models', validate({ query: listMasterQuerySchema }), masterController.listModels);
  router.post('/models', validate({ body: createModelBodySchema }), masterController.createModel);
  router.put(
    '/models/:id',
    validate({ params: idParamSchema, body: updateModelBodySchema }),
    masterController.updateModel
  );
  router.delete(
    '/models/:id',
    validate({ params: idParamSchema }),
    masterController.deactivateModel
  );
  router.put(
    '/models/:id/fabrics',
    validate({ params: idParamSchema, body: replaceModelFabricsBodySchema }),
    masterController.replaceModelFabrics
  );

  // Master: Bahan & preset warna per bahan
  router.get('/fabrics', validate({ query: listMasterQuerySchema }), masterController.listFabrics);
  router.post(
    '/fabrics',
    validate({ body: createFabricBodySchema }),
    masterController.createFabric
  );
  router.put(
    '/fabrics/:id',
    validate({ params: idParamSchema, body: updateFabricBodySchema }),
    masterController.updateFabric
  );
  router.delete(
    '/fabrics/:id',
    validate({ params: idParamSchema }),
    masterController.deactivateFabric
  );
  router.get(
    '/fabrics/:id/colors',
    validate({ params: idParamSchema, query: listMasterQuerySchema }),
    masterController.listFabricColors
  );
  router.post(
    '/fabrics/:id/colors',
    validate({ params: idParamSchema, body: createFabricColorBodySchema }),
    masterController.createFabricColor
  );
  router.put(
    '/fabrics/:id/colors/:colorId',
    validate({ params: fabricColorParamsSchema, body: updateFabricColorBodySchema }),
    masterController.updateFabricColor
  );
  router.delete(
    '/fabrics/:id/colors/:colorId',
    validate({ params: fabricColorParamsSchema }),
    masterController.deactivateFabricColor
  );

  // Master: Ukuran
  router.get('/sizes', validate({ query: listMasterQuerySchema }), masterController.listSizes);
  router.post('/sizes', validate({ body: createSizeBodySchema }), masterController.createSize);
  router.put(
    '/sizes/:id',
    validate({ params: idParamSchema, body: updateSizeBodySchema }),
    masterController.updateSize
  );
  router.delete('/sizes/:id', validate({ params: idParamSchema }), masterController.deactivateSize);

  // Master: Ukuran sablon
  router.get(
    '/print-sizes',
    validate({ query: listMasterQuerySchema }),
    masterController.listPrintSizes
  );
  router.post(
    '/print-sizes',
    validate({ body: createPrintSizeBodySchema }),
    masterController.createPrintSize
  );
  router.put(
    '/print-sizes/:id',
    validate({ params: idParamSchema, body: updatePrintSizeBodySchema }),
    masterController.updatePrintSize
  );
  router.delete(
    '/print-sizes/:id',
    validate({ params: idParamSchema }),
    masterController.deactivatePrintSize
  );

  // Master: Rekening pembayaran & QRIS
  router.get(
    '/payment-accounts',
    validate({ query: listMasterQuerySchema }),
    masterController.listPaymentAccounts
  );
  router.post(
    '/payment-accounts',
    validate({ body: createPaymentAccountBodySchema }),
    masterController.createPaymentAccount
  );
  router.put(
    '/payment-accounts/:id',
    validate({ params: idParamSchema, body: updatePaymentAccountBodySchema }),
    masterController.updatePaymentAccount
  );
  router.delete(
    '/payment-accounts/:id',
    validate({ params: idParamSchema }),
    masterController.deactivatePaymentAccount
  );

  // Pengaturan aplikasi
  router.get('/settings', masterController.getSettings);
  router.put(
    '/settings',
    validate({ body: updateSettingsBodySchema }),
    masterController.updateSettings
  );

  // Endpoint admin lain (kanban, order manual, pembayaran, laporan) akan ditambahkan pada Tahap 5–6.

  return router;
}

export default createAdminRouter();
