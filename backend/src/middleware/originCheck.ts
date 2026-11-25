import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function extractOriginFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Middleware proteksi CSRF lintas situs (SPEC Bagian 13):
 * Menolak request ubah-data (`POST`, `PUT`, `PATCH`, `DELETE`) jika header `Origin`
 * (atau asal `Referer`) berada di luar `FRONTEND_ORIGIN`.
 */
export const originCheck: RequestHandler = (req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  const allowedOrigins = env.frontendOrigins;
  const requestOrigin = req.get('origin')?.trim().replace(/\/+$/, '');
  const refererOrigin = extractOriginFromReferer(req.get('referer'));
  const effectiveOrigin = requestOrigin || refererOrigin;

  if (effectiveOrigin) {
    if (!allowedOrigins.includes(effectiveOrigin)) {
      return sendError(res, {
        status: 403,
        message: 'Origin permintaan tidak diizinkan.',
      });
    }
    return next();
  }

  // ASSUMPTION: di production, request tanpa Origin/Referer yang membawa cookie admin ditolak untuk mencegah CSRF;
  // di development, request tanpa Origin/Referer diizinkan agar pengujian via curl/Postman tetap mudah.
  const cookies = req.cookies as Record<string, unknown> | undefined;
  if (env.isProduction && Boolean(cookies?.[env.cookieName])) {
    return sendError(res, {
      status: 403,
      message: 'Header Origin wajib disertakan pada permintaan terautentikasi.',
    });
  }

  return next();
};
