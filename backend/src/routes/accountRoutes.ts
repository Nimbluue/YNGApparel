import { Router, type RequestHandler } from 'express';
import {
  addressUuidParamSchema,
  createAccountController,
  createAddressBodySchema,
  deactivateAccountBodySchema,
  updateAddressBodySchema,
  updateProfileBodySchema,
} from '../controllers/accountController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import type { AccountService } from '../services/accountService.js';

export interface AccountRouterOptions {
  accountService?: AccountService;
  requireAuthMiddleware?: RequestHandler;
}

/**
 * Membangun router `/api/me/*` yang seluruh rutenya wajib autentikasi dan terisolasi per `req.user.id`.
 */
export function createAccountRouter(options: AccountRouterOptions = {}): Router {
  const router = Router();
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const controller = createAccountController(options.accountService);

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

  return router;
}

export default createAccountRouter();
