import type { AdminUserDto } from '@yng/shared';
import type { CookieOptions, Response } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendError } from '../utils/response.js';

const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface AdminJwtPayload extends JwtPayload {
  sub: string;
  email: string;
  role: 'admin';
}

function parseDurationToMs(raw: string): number {
  const value = String(raw || '').trim();
  const match = /^(\d+)\s*([smhd])?$/i.exec(value);
  if (!match) return DEFAULT_MAX_AGE_MS;

  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers: Readonly<Record<string, number>> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (multipliers[unit] || 1000);
}

export function getAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
    maxAge: parseDurationToMs(env.jwtExpiresIn),
  };
}

export function signAdminToken(admin: Pick<AdminUserDto, 'id' | 'email'>): string {
  const signOptions: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  };

  return jwt.sign(
    {
      sub: String(admin.id),
      email: admin.email,
      role: 'admin',
    },
    env.jwtSecret,
    signOptions
  );
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === 'string') {
    throw new Error('Format token admin tidak valid.');
  }
  return decoded as AdminJwtPayload;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.cookieName, token, getAuthCookieOptions());
}

export function clearAuthCookie(res: Response): void {
  const { maxAge: _omit, ...baseOptions } = getAuthCookieOptions();
  res.clearCookie(env.cookieName, baseOptions);
}

export const requireAdmin = asyncHandler(async (req, res, next) => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const token = cookies?.[env.cookieName];
  if (!token) {
    return sendError(res, {
      status: 401,
      message: 'Autentikasi admin diperlukan.',
    });
  }

  let decoded: AdminJwtPayload;
  try {
    decoded = verifyAdminToken(token);
  } catch {
    clearAuthCookie(res);
    return sendError(res, {
      status: 401,
      message: 'Sesi admin tidak valid atau telah berakhir.',
    });
  }

  const adminId = Number.parseInt(decoded.sub, 10);
  if (!Number.isInteger(adminId) || adminId <= 0) {
    clearAuthCookie(res);
    return sendError(res, {
      status: 401,
      message: 'Sesi admin tidak valid.',
    });
  }

  const result = await query<AdminUserDto>(
    `SELECT id, name, email, is_active
     FROM admin_users
     WHERE id = $1 AND is_active = TRUE
     LIMIT 1`,
    [adminId]
  );

  const admin = result.rows[0];
  if (!admin) {
    clearAuthCookie(res);
    return sendError(res, {
      status: 401,
      message: 'Akun admin tidak ditemukan atau nonaktif.',
    });
  }

  req.admin = admin;
  return next();
});
