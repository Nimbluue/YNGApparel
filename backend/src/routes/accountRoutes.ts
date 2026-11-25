import { Router, type RequestHandler } from 'express';
import {
  addressUuidParamSchema,
  createAccountController,
  createAddressBodySchema,
  deactivateAccountBodySchema,
  myOrdersQuerySchema,
  myOrderUuidParamSchema,
  updateAddressBodySchema,
  updateProfileBodySchema,
} from '../controllers/accountController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import type { AccountService } from '../services/accountService.js';
import type { OrderService } from '../services/orderService.js';

export interface AccountRouterOptions {
  accountService?: AccountService;
  orderService?: OrderService;
  requireAuthMiddleware?: RequestHandler;
}

/**
 * Membangun router `/api/me/*` yang seluruh rutenya wajib autentikasi dan terisolasi per `req.user.id`.
 */
export function createAccountRouter(options: AccountRouterOptions = {}): Router {
  const router = Router();
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const controller = createAccountController(options.accountService, options.orderService);

  router.use(requireAuthMiddleware);

  router.put('/profile', validate({ body: updateProfileBodySchema }), controller.updateProfile);
  router.post(
    '/deactivate',
    validate({ body: deactivateAccountBodySchema }),
    controller.deactivateAccount
  );

  router.get('/addresses', controller.listAddresses);
  router.post('/addresses', validate({ body: createAddressBodySchema }), controller.createAddress);
  router.put(
    '/addresses/:addressUuid',
    validate({ params: addressUuidParamSchema, body: updateAddressBodySchema }),
    controller.updateAddress
  );
  router.delete(
    '/addresses/:addressUuid',
    validate({ params: addressUuidParamSchema }),
    controller.deleteAddress
  );

  router.get('/orders', validate({ query: myOrdersQuerySchema }), controller.listMyOrders);
  router.get(
    '/orders/:uuid',
    validate({ params: myOrderUuidParamSchema }),
    controller.getMyOrderDetail
  );

  return router;
}

export default createAccountRouter();
