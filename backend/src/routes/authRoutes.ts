import { Router, type RequestHandler } from 'express';
import {
  changePasswordBodySchema,
  createAuthController,
  loginBodySchema,
  registerBodySchema,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLoginLimiter, authRegisterLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import type { AuthService } from '../services/authService.js';

export interface AuthRouterOptions {
  authService?: AuthService;
  requireAuthMiddleware?: RequestHandler;
  loginLimiter?: RequestHandler;
  registerLimiter?: RequestHandler;
}

/**
 * Membangun router `/api/auth` dengan dependensi yang dapat di-override pada pengujian.
 */
export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const router = Router();
  const controller = createAuthController(options.authService);
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const loginLimiter = options.loginLimiter ?? authLoginLimiter;
  const registerLimiter = options.registerLimiter ?? authRegisterLimiter;

  router.post(
    '/register',
    registerLimiter,
    validate({ body: registerBodySchema }),
    controller.register
  );
  router.post('/login', loginLimiter, validate({ body: loginBodySchema }), controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuthMiddleware, controller.me);
  router.put(
    '/password',
    requireAuthMiddleware,
    validate({ body: changePasswordBodySchema }),
    controller.changePassword
  );

  return router;
}

export default createAuthRouter();
