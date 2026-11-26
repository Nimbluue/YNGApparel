import { Router, type RequestHandler } from 'express';
import {
  createTrackerController,
  trackLookupBodySchema,
  trackPaymentProofParamsSchema,
  trackUploadProofBodySchema,
  trackUuidParamSchema,
} from '../controllers/trackerController.js';
import { trackerLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { paymentProofUploadMiddleware } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import type { TrackerService } from '../services/trackerService.js';

export interface TrackerRouterOptions {
  trackerService?: TrackerService;
  trackerLimiterMiddleware?: RequestHandler;
  uploadLimiterMiddleware?: RequestHandler;
}

/**
 * Membangun router publik `/api/track/*` untuk lookup kode+WA, magic link, dan upload bukti tagihan lanjutan.
 */
export function createTrackerRouter(options: TrackerRouterOptions = {}): Router {
  const router = Router();
  const trackerLimiterMiddleware = options.trackerLimiterMiddleware ?? trackerLimiter;
  const uploadLimiterMiddleware = options.uploadLimiterMiddleware ?? uploadLimiter;
  const controller = createTrackerController(options.trackerService);

  router.post(
    '/',
    trackerLimiterMiddleware,
    validate({ body: trackLookupBodySchema }),
    controller.lookupOrder
  );

  router.get(
    '/:uuid',
    trackerLimiterMiddleware,
    validate({ params: trackUuidParamSchema }),
    controller.getOrderByMagicLink
  );

  router.post(
    '/:uuid/payments/:paymentUuid/proof',
    trackerLimiterMiddleware,
    uploadLimiterMiddleware,
    paymentProofUploadMiddleware,
    validate({ params: trackPaymentProofParamsSchema, body: trackUploadProofBodySchema }),
    controller.uploadPaymentProof
  );

  return router;
}

export default createTrackerRouter();
