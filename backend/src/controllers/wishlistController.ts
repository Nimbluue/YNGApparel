import type {
  MergeWishlistRequestDto,
  ToggleWishlistRequestDto,
  WishlistItemDto,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import defaultWishlistService, { type WishlistService } from '../services/wishlistService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const addWishlistBodySchema = z
  .object({
    modelSlug: z
      .string({ invalid_type_error: 'modelSlug harus berupa teks.' })
      .trim()
      .min(1, 'modelSlug tidak boleh kosong.')
      .max(120, 'modelSlug maksimal 120 karakter.')
      .optional(),
    garmentModelId: z
      .number({ invalid_type_error: 'garmentModelId harus berupa angka.' })
      .int('garmentModelId harus berupa bilangan bulat.')
      .positive('garmentModelId harus lebih dari 0.')
      .max(Number.MAX_SAFE_INTEGER, 'garmentModelId melebihi batas maksimum.')
      .optional(),
  })
  .strict()
  .refine((value) => Boolean(value.modelSlug) || value.garmentModelId !== undefined, {
    message: 'modelSlug atau garmentModelId wajib diisi.',
  });

export const wishlistSlugParamSchema = z
  .object({
    modelSlug: z
      .string({ required_error: 'modelSlug wajib diisi.' })
      .trim()
      .min(1, 'modelSlug tidak boleh kosong.')
      .max(120, 'modelSlug maksimal 120 karakter.'),
  })
  .strict();

export const mergeWishlistBodySchema = z
  .object({
    modelSlugs: z
      .array(
        z
          .string({ invalid_type_error: 'Setiap modelSlug harus berupa teks.' })
          .trim()
          .min(1, 'modelSlug tidak boleh kosong.')
          .max(120, 'modelSlug maksimal 120 karakter.'),
        { required_error: 'modelSlugs wajib berupa array.' }
      )
      .max(100, 'Maksimal 100 item dalam satu penggabungan wishlist.'),
  })
  .strict();

/**
 * Membangun controller API wishlist user (`/api/wishlist`).
 */
export function createWishlistController(service: WishlistService = defaultWishlistService): {
  listWishlist: RequestHandler;
  addToWishlist: RequestHandler;
  removeFromWishlist: RequestHandler;
  mergeWishlist: RequestHandler;
} {
  return {
    listWishlist: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }
      const items = await service.listWishlist(req.user.id);
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<WishlistItemDto[]>(res, {
        message: 'Daftar wishlist berhasil dimuat.',
        data: items,
      });
    }),

    addToWishlist: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }
      const items = await service.addToWishlist(req.user.id, req.body as ToggleWishlistRequestDto);
      return sendSuccess<WishlistItemDto[]>(res, {
        message: 'Model berhasil disimpan ke wishlist.',
        data: items,
      });
    }),

    removeFromWishlist: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }
      const { modelSlug } = req.params as { modelSlug: string };
      const items = await service.removeFromWishlist(req.user.id, modelSlug);
      return sendSuccess<WishlistItemDto[]>(res, {
        message: 'Model berhasil dihapus dari wishlist.',
        data: items,
      });
    }),

    mergeWishlist: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }
      const items = await service.mergeWishlist(req.user.id, req.body as MergeWishlistRequestDto);
      return sendSuccess<WishlistItemDto[]>(res, {
        message: 'Wishlist berhasil disinkronkan.',
        data: items,
      });
    }),
  };
}
