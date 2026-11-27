import { Router, type RequestHandler } from 'express';
import { createCatalogController, modelSlugParamSchema } from '../controllers/catalogController.js';
import {
  createPricingController,
  pricingQuoteBodySchema,
} from '../controllers/pricingController.js';
import { createUploadController } from '../controllers/uploadController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { designFileUploadMiddleware } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import type { CatalogService } from '../services/catalogService.js';
import type { DesignUploadService } from '../services/designUploadService.js';
import type { PricingService } from '../services/pricingService.js';

export interface PublicRouterOptions {
  catalogService?: CatalogService;
  pricingService?: PricingService;
  designUploadService?: DesignUploadService;
  requireAuthMiddleware?: RequestHandler;
  uploadLimiterMiddleware?: RequestHandler;
}

/**
 * Membangun router publik untuk katalog, rekening pembayaran aktif, kalkulator harga, dan unggah desain.
 */
export function createPublicRouter(options: PublicRouterOptions = {}): Router {
  const router = Router();
  const catalogController = createCatalogController(options.catalogService);
  const pricingController = createPricingController(options.pricingService);
  const uploadController = createUploadController(options.designUploadService);
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const uploadLimiterMiddleware = options.uploadLimiterMiddleware ?? uploadLimiter;

  router.get('/catalog/categories', catalogController.listCategories);
  router.get('/catalog/collections', catalogController.listCollections);
  router.get('/catalog/models', catalogController.listModels);
  router.get(
    '/catalog/models/:slug',
    validate({ params: modelSlugParamSchema }),
    catalogController.getModelBySlug
  );
  router.get('/catalog/fabrics', catalogController.listFabrics);
  router.get('/catalog/sizes', catalogController.listSizes);
  router.get('/catalog/print-sizes', catalogController.listPrintSizes);
  router.get('/catalog/config', catalogController.getConfig);
  router.get('/payment-accounts', catalogController.listPaymentAccounts);

  router.post(
    '/pricing/quote',
    validate({ body: pricingQuoteBodySchema }),
    pricingController.calculateQuote
  );

  router.post(
    '/uploads/design',
    requireAuthMiddleware,
    uploadLimiterMiddleware,
    designFileUploadMiddleware,
    uploadController.uploadDesign
  );

  // Endpoint publik lainnya (order/pembayaran, tracker) ditambahkan pada Tahap 3b–4.

  return router;
}

export default createPublicRouter();
