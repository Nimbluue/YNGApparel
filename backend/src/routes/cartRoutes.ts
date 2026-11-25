import { Router, type RequestHandler } from 'express';
import {
  cartItemUuidParamSchema,
  createCartController,
  upsertCartItemBodySchema,
} from '../controllers/cartController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import type { CartService } from '../services/cartService.js';

export interface CartRouterOptions {
  cartService?: CartService;
  requireAuthMiddleware?: RequestHandler;
}

/**
 * Membangun router `/api/cart/*` yang seluruh rutenya wajib login dan terisolasi per `req.user.id`.
 */
export function createCartRouter(options: CartRouterOptions = {}): Router {
  const router = Router();
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const controller = createCartController(options.cartService);

  router.use(requireAuthMiddleware);

  router.get('/items', controller.listItems);
  router.post('/items', validate({ body: upsertCartItemBodySchema }), controller.addItem);
  router.put(
    '/items/:cartItemUuid',
    validate({ params: cartItemUuidParamSchema, body: upsertCartItemBodySchema }),
    controller.updateItem
  );
  router.delete(
    '/items/:cartItemUuid',
    validate({ params: cartItemUuidParamSchema }),
    controller.deleteItem
  );

  return router;
}

export default createCartRouter();
