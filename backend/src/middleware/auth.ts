import type { AuthUserDto, UserRole } from '@yng/shared';
import type { CookieOptions, RequestHandler, Response } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import type { AuthDbUserRow, AuthenticatedUser, FindUserByUuidFn } from '../types/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendError } from '../utils/response.js';

const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface AuthTokenPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  token_version: number;
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

export function signAuthToken(input: {
  userUuid: string;
  role: UserRole;
  tokenVersion: number;
}): string {
  const signOptions: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  };

  return jwt.sign(
    {
      sub: input.userUuid,
      role: input.role,
      token_version: input.tokenVersion,
    },
    env.jwtSecret,
    signOptions
  );
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (
    typeof decoded === 'string' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.token_version !== 'number'
  ) {
    throw new Error('Format token sesi tidak valid.');
  }
  return decoded as AuthTokenPayload;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.cookieName, token, getAuthCookieOptions());
}

export function clearAuthCookie(res: Response): void {
  const { maxAge: _omit, ...baseOptions } = getAuthCookieOptions();
  res.clearCookie(env.cookieName, baseOptions);
}

export function toAuthenticatedUser(row: AuthDbUserRow): AuthenticatedUser {
  return {
    id: row.id,
    userUuid: row.user_uuid,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    whatsapp: row.whatsapp,
    tokenVersion: row.token_version,
  };
}

export function toAuthUserDto(user: AuthenticatedUser): AuthUserDto {
  return {
    userUuid: user.userUuid,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
}

export async function defaultFindUserByUuid(userUuid: string): Promise<AuthDbUserRow | null> {
  const result = await query<AuthDbUserRow>(
    `SELECT id, user_uuid, role, full_name, email, whatsapp, is_active, token_version
     FROM users
     WHERE user_uuid = $1
     LIMIT 1`,
    [userUuid]
  );
  return result.rows[0] ?? null;
}

async function resolveSessionUser(
  token: string,
  findUserByUuid: FindUserByUuidFn
): Promise<AuthenticatedUser | null> {
  const decoded = verifyAuthToken(token);
  const dbUser = await findUserByUuid(decoded.sub);

  if (!dbUser || !dbUser.is_active) {
    return null;
  }

  if (dbUser.token_version !== decoded.token_version) {
    return null;
  }

  // Role dan identitas selalu diambil dari DB (bukan klaim role di JWT).
  return toAuthenticatedUser(dbUser);
}

export function createRequireAuth(
  findUserByUuid: FindUserByUuidFn = defaultFindUserByUuid
): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[env.cookieName];

    if (!token) {
      return sendError(res, {
        status: 401,
        message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
      });
    }

    try {
      const user = await resolveSessionUser(token, findUserByUuid);
      if (!user) {
        clearAuthCookie(res);
        return sendError(res, {
          status: 401,
          message: 'Sesi tidak valid, akun nonaktif, atau sesi telah dicabut.',
        });
      }

      req.user = user;
      return next();
    } catch {
      clearAuthCookie(res);
      return sendError(res, {
        status: 401,
        message: 'Sesi tidak valid atau telah berakhir.',
      });
    }
  });
}

export function createOptionalAuth(
  findUserByUuid: FindUserByUuidFn = defaultFindUserByUuid
): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[env.cookieName];

    if (!token) {
      req.user = undefined;
      return next();
    }

    try {
      const user = await resolveSessionUser(token, findUserByUuid);
      if (!user) {
        clearAuthCookie(res);
        req.user = undefined;
        return next();
      }

      req.user = user;
      return next();
    } catch {
      clearAuthCookie(res);
      req.user = undefined;
      return next();
    }
  });
}

export const requireAuth = createRequireAuth();
export const optionalAuth = createOptionalAuth();

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, {
        status: 401,
        message: 'Autentikasi diperlukan.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, {
        status: 403,
        message: 'Anda tidak memiliki izin untuk mengakses sumber daya ini.',
      });
    }

    return next();
  };
}
