import { Router, type RequestHandler } from 'express';
import {
  createOrderBodySchema,
  createOrderController,
  orderUuidParamSchema,
  paymentProofParamsSchema,
  uploadProofBodySchema,
} from '../controllers/orderController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { paymentProofUploadMiddleware } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import type { OrderService } from '../services/orderService.js';

export interface OrderRouterOptions {
  orderService?: OrderService;
  requireAuthMiddleware?: RequestHandler;
  uploadLimiterMiddleware?: RequestHandler;
}

/**
 * Membangun router `/api/orders/*` untuk checkout keranjang dan pembayaran bertahap.
 */
export function createOrderRouter(options: OrderRouterOptions = {}): Router {
  const router = Router();
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const uploadLimiterMiddleware = options.uploadLimiterMiddleware ?? uploadLimiter;
  const controller = createOrderController(options.orderService);

  router.post(
    '/',
    requireAuthMiddleware,
    validate({ body: createOrderBodySchema }),
    controller.createOrder
  );

  router.get(
    '/:uuid/payments',
    validate({ params: orderUuidParamSchema }),
    controller.getOrderPayments
  );

  router.post(
    '/:uuid/payments/:paymentUuid/proof',
    uploadLimiterMiddleware,
    paymentProofUploadMiddleware,
    validate({ params: paymentProofParamsSchema, body: uploadProofBodySchema }),
    controller.uploadPaymentProof
  );

  return router;
}

export default createOrderRouter();
