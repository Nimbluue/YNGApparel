import type {
  PublicCatalogConfigDto,
  PublicFabricDto,
  PublicGarmentModelDto,
  PublicModelDetailDto,
  PublicPaymentAccountDto,
  PublicPrintSizeDto,
  PublicSizeDto,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import catalogService, { type CatalogService } from '../services/catalogService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const modelSlugParamSchema = z
  .object({
    slug: z
      .string({
        required_error: 'Slug model wajib diisi.',
        invalid_type_error: 'Slug model harus berupa teks.',
      })
      .trim()
      .min(1, 'Slug model wajib diisi.')
      .max(120, 'Slug model maksimal 120 karakter.'),
  })
  .strict();

export interface CatalogController {
  listModels: RequestHandler;
  getModelBySlug: RequestHandler;
  listFabrics: RequestHandler;
  listSizes: RequestHandler;
  listPrintSizes: RequestHandler;
  getConfig: RequestHandler;
  listPaymentAccounts: RequestHandler;
}

/**
 * Membuat controller katalog publik dan rekening pembayaran aktif.
 */
export function createCatalogController(
  service: CatalogService = catalogService
): CatalogController {
  return {
    listModels: asyncHandler(async (_req, res) => {
      const data = await service.listModels();
      return sendSuccess<PublicGarmentModelDto[]>(res, {
        message: 'Daftar model katalog berhasil dimuat.',
        data,
      });
    }),

    getModelBySlug: asyncHandler(async (req, res) => {
      const slug = String(req.params.slug ?? '');
      const data = await service.getModelBySlug(slug);
      return sendSuccess<PublicModelDetailDto>(res, {
        message: 'Detail model katalog berhasil dimuat.',
        data,
      });
    }),

    listFabrics: asyncHandler(async (_req, res) => {
      const data = await service.listFabrics();
      return sendSuccess<PublicFabricDto[]>(res, {
        message: 'Daftar bahan katalog berhasil dimuat.',
        data,
      });
    }),

    listSizes: asyncHandler(async (_req, res) => {
      const data = await service.listSizes();
      return sendSuccess<PublicSizeDto[]>(res, {
        message: 'Daftar ukuran katalog berhasil dimuat.',
        data,
      });
    }),

    listPrintSizes: asyncHandler(async (_req, res) => {
      const data = await service.listPrintSizes();
      return sendSuccess<PublicPrintSizeDto[]>(res, {
        message: 'Daftar ukuran sablon katalog berhasil dimuat.',
        data,
      });
    }),

    getConfig: asyncHandler(async (_req, res) => {
      const data = await service.getConfig();
      return sendSuccess<PublicCatalogConfigDto>(res, {
        message: 'Konfigurasi katalog publik berhasil dimuat.',
        data,
      });
    }),

    listPaymentAccounts: asyncHandler(async (_req, res) => {
      const data = await service.listPaymentAccounts();
      return sendSuccess<PublicPaymentAccountDto[]>(res, {
        message: 'Daftar rekening pembayaran berhasil dimuat.',
        data,
      });
    }),
  };
}

export const catalogController = createCatalogController();
export default catalogController;
