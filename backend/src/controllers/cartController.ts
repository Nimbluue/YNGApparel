import {
  PRINT_POSITION,
  type CartItemDto,
  type CartListResponseDto,
  type PrintPosition,
  type UpsertCartItemRequestDto,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import defaultCartService, { type CartService } from '../services/cartService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

const PRINT_POSITION_VALUES: readonly [PrintPosition, ...PrintPosition[]] = [
  PRINT_POSITION.FRONT_CHEST,
  PRINT_POSITION.FRONT_CENTER,
  PRINT_POSITION.BACK_CENTER,
  PRINT_POSITION.BACK_UPPER,
  PRINT_POSITION.LEFT_SLEEVE,
  PRINT_POSITION.RIGHT_SLEEVE,
  PRINT_POSITION.COLLAR,
  PRINT_POSITION.OTHER,
];

function positiveIntIdSchema(label: string) {
  return z
    .number({
      required_error: `${label} wajib diisi.`,
      invalid_type_error: `${label} harus berupa angka.`,
    })
    .int(`${label} harus berupa bilangan bulat.`)
    .positive(`${label} harus lebih dari 0.`)
    .max(Number.MAX_SAFE_INTEGER, `${label} melebihi batas maksimum.`);
}

export const cartItemUuidParamSchema = z
  .object({
    cartItemUuid: z.string().uuid('Format UUID item keranjang tidak valid.'),
  })
  .strict();

const cartSizeSchema = z
  .object({
    sizeId: positiveIntIdSchema('ID ukuran'),
    qty: z
      .number({
        required_error: 'Jumlah per ukuran wajib diisi.',
        invalid_type_error: 'Jumlah per ukuran harus berupa angka.',
      })
      .int('Jumlah per ukuran harus berupa bilangan bulat.')
      .min(1, 'Jumlah per ukuran minimal 1 pcs.')
      .max(100_000, 'Jumlah per ukuran melebihi batas maksimum.'),
  })
  .strict();

const cartPrintSchema = z
  .object({
    printSizeId: positiveIntIdSchema('ID ukuran sablon'),
    printPosition: z.enum(PRINT_POSITION_VALUES, {
      required_error: 'Posisi sablon wajib diisi.',
      invalid_type_error: 'Posisi sablon tidak valid.',
    }),
    needsDesignHelp: z
      .boolean({ invalid_type_error: 'needsDesignHelp harus berupa boolean.' })
      .optional()
      .default(false),
    fileRef: z
      .string({ invalid_type_error: 'Referensi file desain harus berupa teks.' })
      .trim()
      .min(1, 'Referensi file desain tidak boleh kosong.')
      .max(255, 'Referensi file desain terlalu panjang.')
      .nullable()
      .optional(),
    fileName: z
      .string({ invalid_type_error: 'Nama file desain harus berupa teks.' })
      .trim()
      .min(1, 'Nama file desain tidak boleh kosong.')
      .max(150, 'Nama file desain maksimal 150 karakter.')
      .nullable()
      .optional(),
  })
  .strict();

export const upsertCartItemBodySchema: z.ZodType<UpsertCartItemRequestDto> = z
  .object({
    modelId: positiveIntIdSchema('ID model'),
    fabricId: positiveIntIdSchema('ID bahan'),
    isCustomColor: z
      .boolean({ invalid_type_error: 'isCustomColor harus berupa boolean.' })
      .optional()
      .default(false),
    fabricColorId: positiveIntIdSchema('ID preset warna').nullable().optional(),
    colorName: z
      .string({ invalid_type_error: 'Nama warna harus berupa teks.' })
      .trim()
      .min(1, 'Nama warna tidak boleh kosong.')
      .max(50, 'Nama warna maksimal 50 karakter.')
      .nullable()
      .optional(),
    colorHex: z
      .string({ invalid_type_error: 'Kode warna hex harus berupa teks.' })
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Format kode warna hex harus #RRGGBB.')
      .transform((val) => val.toUpperCase())
      .nullable()
      .optional(),
    sizes: z
      .array(cartSizeSchema, {
        required_error: 'Daftar ukuran wajib diisi.',
        invalid_type_error: 'Daftar ukuran harus berupa array.',
      })
      .min(1, 'Minimal satu ukuran harus dipilih.')
      .max(50, 'Maksimal 50 ukuran per item.'),
    prints: z
      .array(cartPrintSchema, {
        invalid_type_error: 'Daftar titik sablon harus berupa array.',
      })
      .max(20, 'Maksimal 20 titik sablon per item.')
      .optional()
      .default([]),
    productionNotes: z
      .string({ invalid_type_error: 'Catatan produksi harus berupa teks.' })
      .trim()
      .max(500, 'Catatan produksi maksimal 500 karakter.')
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (!item.isCustomColor) {
      if (item.colorName !== undefined && item.colorName !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['colorName'],
          message: 'Warna non-preset hanya diperbolehkan jika isCustomColor bernilai true.',
        });
      }
      if (item.colorHex !== undefined && item.colorHex !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['colorHex'],
          message: 'Kode hex warna custom hanya diperbolehkan jika isCustomColor bernilai true.',
        });
      }
      if (item.fabricColorId === undefined || item.fabricColorId === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fabricColorId'],
          message: 'Preset warna (fabricColorId) wajib dipilih jika bukan warna custom.',
        });
      }
    } else {
      if (item.fabricColorId !== undefined && item.fabricColorId !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fabricColorId'],
          message: 'Warna custom tidak boleh menyertakan fabricColorId preset.',
        });
      }
      if (!item.colorName || item.colorName.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['colorName'],
          message: 'Nama warna custom wajib diisi.',
        });
      }
    }
  });

/**
 * Membangun controller CRUD keranjang Custom Lab (`/api/cart/items`).
 */
export function createCartController(service: CartService = defaultCartService): {
  listItems: RequestHandler;
  addItem: RequestHandler;
  updateItem: RequestHandler;
  deleteItem: RequestHandler;
} {
  return {
    listItems: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }
      const cart = await service.listCart(req.user.id);
      return sendSuccess<CartListResponseDto>(res, {
        message: 'Keranjang Custom Lab berhasil dimuat.',
        data: cart,
      });
    }),

    addItem: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }
      const item = await service.addCartItem(
        req.user.id,
        req.user.userUuid,
        req.body as UpsertCartItemRequestDto
      );
      return sendSuccess<CartItemDto>(res, {
        status: 201,
        message: 'Item berhasil ditambahkan ke keranjang.',
        data: item,
      });
    }),

    updateItem: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }
      const { cartItemUuid } = req.params as { cartItemUuid: string };
      const item = await service.updateCartItem(
        req.user.id,
        req.user.userUuid,
        cartItemUuid,
        req.body as UpsertCartItemRequestDto
      );
      return sendSuccess<CartItemDto>(res, {
        message: 'Item keranjang berhasil diperbarui.',
        data: item,
      });
    }),

    deleteItem: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }
      const { cartItemUuid } = req.params as { cartItemUuid: string };
      const deleted = await service.deleteCartItem(req.user.id, req.user.userUuid, cartItemUuid);
      return sendSuccess<{ cartItemUuid: string }>(res, {
        message: 'Item keranjang berhasil dihapus.',
        data: deleted,
      });
    }),
  };
}
