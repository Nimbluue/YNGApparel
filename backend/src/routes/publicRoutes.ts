import { Router } from 'express';
import { createCatalogController, modelSlugParamSchema } from '../controllers/catalogController.js';
import {
  createPricingController,
  pricingQuoteBodySchema,
} from '../controllers/pricingController.js';
import { validate } from '../middleware/validate.js';
import type { CatalogService } from '../services/catalogService.js';
import type { PricingService } from '../services/pricingService.js';

export interface PublicRouterOptions {
  catalogService?: CatalogService;
  pricingService?: PricingService;
}

/**
 * Membangun router publik untuk katalog, rekening pembayaran aktif, dan kalkulator harga.
 */
export function createPublicRouter(options: PublicRouterOptions = {}): Router {
  const router = Router();
  const catalogController = createCatalogController(options.catalogService);
  const pricingController = createPricingController(options.pricingService);

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

  // Endpoint publik lainnya (upload desain, order/pembayaran, tracker) ditambahkan pada Tahap 2b–4.

  return router;
}

export default createPublicRouter();
