import { Router, type RequestHandler } from 'express';
import {
  addWishlistBodySchema,
  createWishlistController,
  mergeWishlistBodySchema,
  wishlistSlugParamSchema,
} from '../controllers/wishlistController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import type { WishlistService } from '../services/wishlistService.js';

export interface WishlistRouterOptions {
  wishlistService?: WishlistService;
  requireAuthMiddleware?: RequestHandler;
}

/**
 * Router `/api/wishlist/*` yang mewajibkan akun aktif (`USER` & `ADMIN`) dan terisolasi per `req.user.id`.
 */
export function createWishlistRouter(options: WishlistRouterOptions = {}): Router {
  const router = Router();
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const controller = createWishlistController(options.wishlistService);

  router.use(requireAuthMiddleware);

  router.get('/', controller.listWishlist);
  router.post('/', validate({ body: addWishlistBodySchema }), controller.addToWishlist);
  router.post('/merge', validate({ body: mergeWishlistBodySchema }), controller.mergeWishlist);
  router.delete(
    '/:modelSlug',
    validate({ params: wishlistSlugParamSchema }),
    controller.removeFromWishlist
  );

  return router;
}

export default createWishlistRouter();
