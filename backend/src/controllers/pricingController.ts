import {
  PRINT_POSITION,
  type PricingQuoteRequestDto,
  type PricingQuoteResponseDto,
  type PrintPosition,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import pricingService, { type PricingService } from '../services/pricingService.js';
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

const pricingSizeItemSchema = z
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

const pricingPrintItemSchema = z
  .object({
    printSizeId: positiveIntIdSchema('ID ukuran sablon'),
    printPosition: z.enum(PRINT_POSITION_VALUES, {
      required_error: 'Posisi sablon wajib diisi.',
      invalid_type_error: 'Posisi sablon tidak valid.',
    }),
  })
  .strict();

const pricingQuoteItemSchema = z
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
      .array(pricingSizeItemSchema, {
        required_error: 'Daftar ukuran wajib diisi.',
        invalid_type_error: 'Daftar ukuran harus berupa array.',
      })
      .min(1, 'Minimal satu ukuran harus dipilih.')
      .max(50, 'Maksimal 50 ukuran per item.'),
    prints: z
      .array(pricingPrintItemSchema, {
        invalid_type_error: 'Daftar titik sablon harus berupa array.',
      })
      .max(20, 'Maksimal 20 titik sablon per item.')
      .optional()
      .default([]),
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
      if (
        item.colorName === undefined ||
        item.colorName === null ||
        item.colorName.trim().length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['colorName'],
          message: 'Nama warna wajib diisi untuk warna custom.',
        });
      }
    }

    const seenSizeIds = new Set<number>();
    item.sizes.forEach((sizeEntry, idx) => {
      if (seenSizeIds.has(sizeEntry.sizeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sizes', idx, 'sizeId'],
          message: 'Terdapat ukuran ganda dalam satu item.',
        });
      } else {
        seenSizeIds.add(sizeEntry.sizeId);
      }
    });

    const seenPositions = new Set<PrintPosition>();
    item.prints.forEach((printEntry, idx) => {
      if (printEntry.printPosition !== PRINT_POSITION.OTHER) {
        if (seenPositions.has(printEntry.printPosition)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['prints', idx, 'printPosition'],
            message:
              'Setiap posisi sablon hanya boleh dipilih satu kali per item (kecuali Lainnya).',
          });
        } else {
          seenPositions.add(printEntry.printPosition);
        }
      }
    });
  });

// ASSUMPTION: batas maksimal 50 item per permintaan simulasi quote
export const pricingQuoteBodySchema = z
  .object({
    items: z
      .array(pricingQuoteItemSchema, {
        required_error: 'Daftar item konfigurasi wajib diisi.',
        invalid_type_error: 'Daftar item konfigurasi harus berupa array.',
      })
      .min(1, 'Minimal satu item konfigurasi harus diisi.')
      .max(50, 'Maksimal 50 item dalam satu simulasi harga.'),
  })
  .strict();

export interface PricingController {
  calculateQuote: RequestHandler;
}

/**
 * Membuat controller endpoint kalkulator harga publik `POST /api/pricing/quote`.
 */
export function createPricingController(
  service: PricingService = pricingService
): PricingController {
  return {
    calculateQuote: asyncHandler(async (req, res) => {
      const body = req.body as PricingQuoteRequestDto;
      const data = await service.calculateQuote(body);
      return sendSuccess<PricingQuoteResponseDto>(res, {
        message: 'Estimasi harga berhasil dihitung.',
        data,
      });
    }),
  };
}

export const pricingController = createPricingController();
export default pricingController;
