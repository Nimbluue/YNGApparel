import type {
  AuthUserDto,
  ChangePasswordRequestDto,
  LoginRequestDto,
  RegisterRequestDto,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '../config/constants.js';
import {
  clearAuthCookie,
  setAuthCookie,
  signAuthToken,
  toAuthUserDto,
} from '../middleware/auth.js';
import { authService, type AuthService } from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { normalizeWhatsApp } from '../utils/phone.js';
import { sendCreated, sendError, sendSuccess } from '../utils/response.js';

function passwordWithinByteLimit(label: string) {
  return z
    .string({
      required_error: `${label} wajib diisi.`,
      invalid_type_error: `${label} harus berupa teks.`,
    })
    .refine(
      (val) => Buffer.byteLength(val, 'utf8') <= PASSWORD_MAX_BYTES,
      `${label} maksimal ${PASSWORD_MAX_BYTES} byte UTF-8 (batas implementasi bcrypt).`
    );
}

const emailSchema = z
  .string({
    required_error: 'Email wajib diisi.',
    invalid_type_error: 'Email harus berupa teks.',
  })
  .trim()
  .min(1, 'Email wajib diisi.')
  .max(150, 'Email maksimal 150 karakter.')
  .email('Format email tidak valid.')
  .transform((val) => val.toLowerCase());

export const registerBodySchema = z.object({
  fullName: z
    .string({
      required_error: 'Nama lengkap wajib diisi.',
      invalid_type_error: 'Nama lengkap harus berupa teks.',
    })
    .trim()
    .min(2, 'Nama lengkap minimal 2 karakter.')
    .max(150, 'Nama lengkap maksimal 150 karakter.'),
  email: emailSchema,
  whatsapp: z
    .string({
      required_error: 'Nomor WhatsApp wajib diisi.',
      invalid_type_error: 'Nomor WhatsApp harus berupa teks.',
    })
    .trim()
    .min(1, 'Nomor WhatsApp wajib diisi.')
    .transform((val, ctx) => {
      const normalized = normalizeWhatsApp(val);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Format nomor WhatsApp tidak valid. Gunakan awalan 08 atau 62 (9–17 digit).',
        });
        return z.NEVER;
      }
      return normalized;
    }),
  password: passwordWithinByteLimit('Password').refine(
    (val) => val.length >= PASSWORD_MIN_LENGTH,
    `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`
  ),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: passwordWithinByteLimit('Password').refine(
    (val) => val.length >= 1,
    'Password wajib diisi.'
  ),
});

export const changePasswordBodySchema = z.object({
  currentPassword: passwordWithinByteLimit('Password lama').refine(
    (val) => val.length >= 1,
    'Password lama wajib diisi.'
  ),
  newPassword: passwordWithinByteLimit('Password baru').refine(
    (val) => val.length >= PASSWORD_MIN_LENGTH,
    `Password baru minimal ${PASSWORD_MIN_LENGTH} karakter.`
  ),
});

export interface AuthController {
  register: RequestHandler;
  login: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
  changePassword: RequestHandler;
}

/**
 * Membuat controller autentikasi terpadu (USER & ADMIN).
 */
export function createAuthController(service: AuthService = authService): AuthController {
  return {
    register: asyncHandler(async (req, res) => {
      const body = req.body as RegisterRequestDto;
      const user = await service.register(body);

      return sendCreated<AuthUserDto>(res, {
        message: 'Pendaftaran berhasil. Silakan masuk dengan akun Anda.',
        data: toAuthUserDto(user),
      });
    }),

    login: asyncHandler(async (req, res) => {
      const body = req.body as LoginRequestDto;
      const user = await service.login(body);

      const token = signAuthToken({
        userUuid: user.userUuid,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });
      setAuthCookie(res, token);

      return sendSuccess<AuthUserDto>(res, {
        message: 'Login berhasil.',
        data: toAuthUserDto(user),
      });
    }),

    // Idempoten tanpa requireAuth: selalu hapus cookie termasuk jika token kedaluwarsa/tidak valid.
    logout: asyncHandler(async (_req, res) => {
      clearAuthCookie(res);
      return sendSuccess(res, {
        message: 'Berhasil keluar.',
        data: null,
      });
    }),

    me: asyncHandler(async (req, res) => {
      if (!req.user) {
        return sendError(res, {
          status: 401,
          message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
        });
      }

      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AuthUserDto>(res, {
        message: 'Profil pengguna berhasil dimuat.',
        data: toAuthUserDto(req.user),
      });
    }),

    changePassword: asyncHandler(async (req, res) => {
      if (!req.user) {
        return sendError(res, {
          status: 401,
          message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
        });
      }

      const body = req.body as ChangePasswordRequestDto;
      const updated = await service.changePassword({
        userId: req.user.id,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });

      const newToken = signAuthToken({
        userUuid: updated.userUuid,
        role: updated.role,
        tokenVersion: updated.tokenVersion,
      });
      setAuthCookie(res, newToken);

      return sendSuccess<AuthUserDto>(res, {
        message: 'Password berhasil diperbarui. Semua sesi lain telah dicabut.',
        data: toAuthUserDto(updated),
      });
    }),
  };
}

export const authController = createAuthController();
export default authController;
