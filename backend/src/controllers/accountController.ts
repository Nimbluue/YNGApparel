import type {
  AuthUserDto,
  CreateUserAddressDto,
  DeactivateAccountRequestDto,
  UpdateProfileRequestDto,
  UpdateUserAddressDto,
  UserAddressDto,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { PASSWORD_MAX_BYTES } from '../config/constants.js';
import { clearAuthCookie } from '../middleware/auth.js';
import accountService, { type AccountService } from '../services/accountService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { normalizeWhatsApp } from '../utils/phone.js';
import { sendCreated, sendError, sendSuccess } from '../utils/response.js';

export const addressUuidParamSchema = z
  .object({
    addressUuid: z.string().uuid('Format UUID alamat tidak valid.'),
  })
  .strict();

function normalizedWhatsAppSchema(label: string) {
  return z
    .string({
      required_error: `${label} wajib diisi.`,
      invalid_type_error: `${label} harus berupa teks.`,
    })
    .trim()
    .min(1, `${label} tidak boleh kosong.`)
    .transform((val, ctx) => {
      const normalized = normalizeWhatsApp(val);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Format ${label} tidak valid. Gunakan awalan 08 atau 62 (9–17 digit).`,
        });
        return z.NEVER;
      }
      return normalized;
    });
}

export const updateProfileBodySchema = z
  .object({
    fullName: z
      .string({ invalid_type_error: 'Nama lengkap harus berupa teks.' })
      .trim()
      .min(2, 'Nama lengkap minimal 2 karakter.')
      .max(150, 'Nama lengkap maksimal 150 karakter.')
      .optional(),
    whatsapp: z.union([z.null(), normalizedWhatsAppSchema('Nomor WhatsApp')]).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, 'Minimal satu field profil harus diisi.');

export const deactivateAccountBodySchema = z
  .object({
    currentPassword: z
      .string({
        required_error: 'Password saat ini wajib diisi untuk menonaktifkan akun.',
        invalid_type_error: 'Password saat ini harus berupa teks.',
      })
      .refine(
        (val) => Buffer.byteLength(val, 'utf8') <= PASSWORD_MAX_BYTES,
        `Password maksimal ${PASSWORD_MAX_BYTES} byte UTF-8.`
      )
      .refine((val) => val.length >= 1, 'Password saat ini wajib diisi.'),
  })
  .strict();

export const createAddressBodySchema = z
  .object({
    label: z
      .string({
        required_error: 'Label alamat wajib diisi.',
        invalid_type_error: 'Label alamat harus berupa teks.',
      })
      .trim()
      .min(1, 'Label alamat wajib diisi.')
      .max(50, 'Label alamat maksimal 50 karakter.'),
    recipientName: z
      .string({
        required_error: 'Nama penerima wajib diisi.',
        invalid_type_error: 'Nama penerima harus berupa teks.',
      })
      .trim()
      .min(2, 'Nama penerima minimal 2 karakter.')
      .max(150, 'Nama penerima maksimal 150 karakter.'),
    recipientWhatsapp: normalizedWhatsAppSchema('Nomor WhatsApp penerima'),
    provinceName: z
      .string({
        required_error: 'Provinsi wajib diisi.',
        invalid_type_error: 'Provinsi harus berupa teks.',
      })
      .trim()
      .min(2, 'Nama provinsi minimal 2 karakter.')
      .max(100, 'Nama provinsi maksimal 100 karakter.'),
    cityName: z
      .string({
        required_error: 'Kota/Kabupaten wajib diisi.',
        invalid_type_error: 'Kota/Kabupaten harus berupa teks.',
      })
      .trim()
      .min(2, 'Nama kota/kabupaten minimal 2 karakter.')
      .max(100, 'Nama kota/kabupaten maksimal 100 karakter.'),
    districtName: z
      .string({
        required_error: 'Kecamatan wajib diisi.',
        invalid_type_error: 'Kecamatan harus berupa teks.',
      })
      .trim()
      .min(2, 'Nama kecamatan minimal 2 karakter.')
      .max(100, 'Nama kecamatan maksimal 100 karakter.'),
    // ASSUMPTION: kode pos Indonesia menggunakan format 5 digit angka.
    postalCode: z
      .string({
        required_error: 'Kode pos wajib diisi.',
        invalid_type_error: 'Kode pos harus berupa teks.',
      })
      .trim()
      .regex(/^[0-9]{5}$/, 'Kode pos harus terdiri dari 5 digit angka.'),
    fullAddress: z
      .string({
        required_error: 'Alamat lengkap wajib diisi.',
        invalid_type_error: 'Alamat lengkap harus berupa teks.',
      })
      .trim()
      .min(5, 'Alamat lengkap minimal 5 karakter.')
      .max(1000, 'Alamat lengkap maksimal 1000 karakter.'),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const updateAddressBodySchema = createAddressBodySchema
  .partial()
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, 'Minimal satu field alamat harus diperbarui.');

export interface AccountController {
  updateProfile: RequestHandler;
  deactivateAccount: RequestHandler;
  listAddresses: RequestHandler;
  createAddress: RequestHandler;
  updateAddress: RequestHandler;
  deleteAddress: RequestHandler;
}

/**
 * Membuat controller akun pelanggan & alamat tersimpan (`/api/me/*`).
 */
export function createAccountController(
  service: AccountService = accountService
): AccountController {
  return {
    updateProfile: asyncHandler(async (req, res) => {
      if (!req.user) {
        return sendError(res, {
          status: 401,
          message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
        });
      }

      const body = req.body as UpdateProfileRequestDto;
      const updated = await service.updateProfile(req.user, body);
      return sendSuccess<AuthUserDto>(res, {
        message: 'Profil akun berhasil diperbarui.',
        data: updated,
      });
    }),

    deactivateAccount: asyncHandler(async (req, res) => {
      if (!req.user) {
        return sendError(res, {
          status: 401,
          message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
        });
      }

      const body = req.body as DeactivateAccountRequestDto;
      await service.deactivateAccount(req.user, body.currentPassword);
      clearAuthCookie(res);

      return sendSuccess(res, {
        message: 'Akun Anda telah dinonaktifkan.',
        data: null,
      });
    }),

    listAddresses: asyncHandler(async (req, res) => {
      if (!req.user) {
        return sendError(res, {
          status: 401,
          message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
        });
      }

      const list = await service.listAddresses(req.user.id);
      return sendSuccess<UserAddressDto[]>(res, {
        message: 'Daftar alamat tersimpan berhasil dimuat.',
        data: list,
      });
    }),

    createAddress: asyncHandler(async (req, res) => {
      if (!req.user) {
        return sendError(res, {
          status: 401,
          message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
        });
      }

      const body = req.body as CreateUserAddressDto;
      const created = await service.createAddress(req.user.id, body);
      return sendCreated<UserAddressDto>(res, {
        message: 'Alamat baru berhasil disimpan.',
        data: created,
      });
    }),

    updateAddress: asyncHandler(async (req, res) => {
      if (!req.user) {
        return sendError(res, {
          status: 401,
          message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
        });
      }

      const body = req.body as UpdateUserAddressDto;
      const updated = await service.updateAddress(req.user.id, req.params.addressUuid, body);
      return sendSuccess<UserAddressDto>(res, {
        message: 'Alamat tersimpan berhasil diperbarui.',
        data: updated,
      });
    }),

    deleteAddress: asyncHandler(async (req, res) => {
      if (!req.user) {
        return sendError(res, {
          status: 401,
          message: 'Autentikasi diperlukan. Silakan login terlebih dahulu.',
        });
      }

      await service.deleteAddress(req.user.id, req.params.addressUuid);
      return sendSuccess(res, {
        message: 'Alamat tersimpan berhasil dihapus.',
        data: null,
      });
    }),
  };
}

export const accountController = createAccountController();
export default accountController;
