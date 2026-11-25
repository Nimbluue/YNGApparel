import {
  PAYMENT_METHOD,
  type AppSettingsResponseDto,
  type CatalogImageFolder,
  type CatalogImageUploadDto,
  type CreateFabricColorDto,
  type CreateFabricDto,
  type CreateGarmentModelDto,
  type CreatePaymentAccountDto,
  type CreatePrintSizeDto,
  type CreateSizeDto,
  type FabricColorDto,
  type FabricDto,
  type GarmentModelDto,
  type PaymentAccountDto,
  type PrintSizeDto,
  type ReplaceModelFabricsDto,
  type SizeDto,
  type UpdateAppSettingsDto,
  type UpdateFabricColorDto,
  type UpdateFabricDto,
  type UpdateGarmentModelDto,
  type UpdatePaymentAccountDto,
  type UpdatePrintSizeDto,
  type UpdateSizeDto,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { CATALOG_IMAGE_FOLDERS, CATALOG_IMAGE_PATH_REGEX } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import adminMasterService, { type AdminMasterService } from '../services/adminMasterService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { normalizeWhatsApp } from '../utils/phone.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

const positiveIntParam = z
  .string()
  .regex(/^[1-9]\d*$/, 'Parameter ID harus berupa bilangan bulat positif.')
  .refine((val) => {
    const parsed = Number(val);
    return Number.isSafeInteger(parsed) && parsed > 0;
  }, 'Parameter ID tidak valid.');

export const idParamSchema = z
  .object({
    id: positiveIntParam,
  })
  .strict();

export const fabricColorParamsSchema = z
  .object({
    id: positiveIntParam,
    colorId: positiveIntParam,
  })
  .strict();

export const listMasterQuerySchema = z
  .object({
    includeInactive: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const uploadImageBodySchema = z
  .object({
    folder: z.enum(CATALOG_IMAGE_FOLDERS).optional(),
  })
  .strict();

export const uploadImageQuerySchema = z
  .object({
    folder: z.enum(CATALOG_IMAGE_FOLDERS).optional(),
  })
  .strict();

function rupiahSchema(label: string) {
  return z
    .number({
      required_error: `${label} wajib diisi.`,
      invalid_type_error: `${label} harus berupa angka.`,
    })
    .int(`${label} harus berupa bilangan bulat rupiah.`)
    .min(0, `${label} tidak boleh negatif.`)
    .max(999_999_999_999, `${label} melebihi batas maksimum.`);
}

const sortOrderSchema = z
  .number({
    invalid_type_error: 'Urutan tampilan harus berupa angka.',
  })
  .int('Urutan tampilan harus bilangan bulat.')
  .min(0, 'Urutan tampilan tidak boleh negatif.')
  .max(100_000, 'Urutan tampilan terlalu besar.');

function catalogImagePathSchema(folder: 'models' | 'fabrics' | 'qris') {
  return z
    .string({
      invalid_type_error: 'Path gambar harus berupa teks.',
    })
    .trim()
    .max(500, 'Path gambar maksimal 500 karakter.')
    .refine(
      (val) => CATALOG_IMAGE_PATH_REGEX.test(val) && val.startsWith(`${folder}/`),
      `Path gambar tidak valid. Harus berformat ${folder}/<32-hex>.(jpg|png|webp).`
    );
}

const slugSchema = z
  .string({
    required_error: 'Slug model wajib diisi.',
    invalid_type_error: 'Slug model harus berupa teks.',
  })
  .trim()
  .min(2, 'Slug model minimal 2 karakter.')
  .max(120, 'Slug model maksimal 120 karakter.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung (-).'
  );

function upperCodeSchema(label: string, maxLen: number, minLen = 1) {
  return z
    .string({
      required_error: `${label} wajib diisi.`,
      invalid_type_error: `${label} harus berupa teks.`,
    })
    .trim()
    .min(minLen, `${label} minimal ${minLen} karakter.`)
    .max(maxLen, `${label} maksimal ${maxLen} karakter.`)
    .regex(/^[A-Za-z0-9_-]+$/, `${label} hanya boleh berisi huruf, angka, _ atau -.`)
    .transform((val) => val.toUpperCase());
}

const colorHexSchema = z
  .string({
    required_error: 'Kode warna hex wajib diisi.',
    invalid_type_error: 'Kode warna hex harus berupa teks.',
  })
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Format kode warna hex harus #RRGGBB.')
  .transform((val) => val.toUpperCase());

function nonEmptyPatch<T extends Record<string, unknown>>(schema: z.ZodType<T>) {
  return schema.refine(
    (obj) => Object.keys(obj).length > 0,
    'Minimal satu field harus diisi untuk pembaruan.'
  );
}

// ── Skema Zod Model Pakaian ────────────────────────────────────────────────
export const createModelBodySchema = z
  .object({
    slug: slugSchema,
    name: z
      .string({
        required_error: 'Nama model wajib diisi.',
        invalid_type_error: 'Nama model harus berupa teks.',
      })
      .trim()
      .min(2, 'Nama model minimal 2 karakter.')
      .max(150, 'Nama model maksimal 150 karakter.'),
    description: z.string().trim().max(2000).nullable().optional(),
    basePrice: rupiahSchema('Harga dasar model'),
    imagePath: catalogImagePathSchema('models').nullable().optional(),
    mockupTemplate: z.string().trim().min(1).max(100).nullable().optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateModelBodySchema = nonEmptyPatch(createModelBodySchema.partial().strict());

export const replaceModelFabricsBodySchema = z
  .object({
    fabricIds: z
      .array(
        z
          .number({ invalid_type_error: 'ID bahan harus berupa angka.' })
          .int('ID bahan harus bilangan bulat.')
          .positive('ID bahan harus bilangan bulat positif.')
      )
      .max(100, 'Maksimal 100 bahan per model.'),
  })
  .strict();

// ── Skema Zod Bahan & Preset Warna ─────────────────────────────────────────
export const createFabricBodySchema = z
  .object({
    code: upperCodeSchema('Kode bahan', 50, 2),
    name: z
      .string({
        required_error: 'Nama bahan wajib diisi.',
        invalid_type_error: 'Nama bahan harus berupa teks.',
      })
      .trim()
      .min(2, 'Nama bahan minimal 2 karakter.')
      .max(150, 'Nama bahan maksimal 150 karakter.'),
    description: z.string().trim().max(2000).nullable().optional(),
    gsmWeight: z.number().int().min(50).max(1000).nullable().optional(),
    thicknessLevel: z
      .number({ invalid_type_error: 'Tingkat ketebalan harus berupa angka.' })
      .int('Tingkat ketebalan harus bilangan bulat.')
      .min(1, 'Tingkat ketebalan minimal 1.')
      .max(5, 'Tingkat ketebalan maksimal 5.')
      .optional(),
    comfortLevel: z
      .number({ invalid_type_error: 'Tingkat kenyamanan harus berupa angka.' })
      .int('Tingkat kenyamanan harus bilangan bulat.')
      .min(1, 'Tingkat kenyamanan minimal 1.')
      .max(5, 'Tingkat kenyamanan maksimal 5.')
      .nullable()
      .optional(),
    additionalPrice: rupiahSchema('Tambahan harga bahan').optional(),
    imagePath: catalogImagePathSchema('fabrics').nullable().optional(),
    macroImagePath: catalogImagePathSchema('fabrics').nullable().optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateFabricBodySchema = nonEmptyPatch(createFabricBodySchema.partial().strict());

export const createFabricColorBodySchema = z
  .object({
    colorName: z
      .string({
        required_error: 'Nama warna wajib diisi.',
        invalid_type_error: 'Nama warna harus berupa teks.',
      })
      .trim()
      .min(1, 'Nama warna wajib diisi.')
      .max(50, 'Nama warna maksimal 50 karakter.'),
    colorHex: colorHexSchema,
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateFabricColorBodySchema = nonEmptyPatch(
  createFabricColorBodySchema.partial().strict()
);

// ── Skema Zod Ukuran ───────────────────────────────────────────────────────
export const createSizeBodySchema = z
  .object({
    code: upperCodeSchema('Kode ukuran', 10, 1),
    sortOrder: sortOrderSchema.optional(),
    extraCharge: rupiahSchema('Biaya tambahan ukuran').optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateSizeBodySchema = nonEmptyPatch(createSizeBodySchema.partial().strict());

// ── Skema Zod Ukuran Sablon ────────────────────────────────────────────────
export const createPrintSizeBodySchema = z
  .object({
    code: upperCodeSchema('Kode ukuran sablon', 20, 1),
    name: z
      .string({
        required_error: 'Nama ukuran sablon wajib diisi.',
        invalid_type_error: 'Nama ukuran sablon harus berupa teks.',
      })
      .trim()
      .min(1, 'Nama ukuran sablon wajib diisi.')
      .max(100, 'Nama ukuran sablon maksimal 100 karakter.'),
    dimensionsCm: z
      .string({
        required_error: 'Dimensi cm wajib diisi.',
        invalid_type_error: 'Dimensi cm harus berupa teks.',
      })
      .trim()
      .min(1, 'Dimensi cm wajib diisi.')
      .max(30, 'Dimensi cm maksimal 30 karakter.'),
    widthCm: z
      .number({
        required_error: 'Lebar sablon (cm) wajib diisi.',
        invalid_type_error: 'Lebar sablon (cm) harus berupa angka.',
      })
      .positive('Lebar sablon harus lebih dari 0.')
      .max(200, 'Lebar sablon maksimal 200 cm.'),
    heightCm: z
      .number({
        required_error: 'Tinggi sablon (cm) wajib diisi.',
        invalid_type_error: 'Tinggi sablon (cm) harus berupa angka.',
      })
      .positive('Tinggi sablon harus lebih dari 0.')
      .max(200, 'Tinggi sablon maksimal 200 cm.'),
    pricePerSpot: rupiahSchema('Harga per titik sablon'),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updatePrintSizeBodySchema = nonEmptyPatch(
  createPrintSizeBodySchema.partial().strict()
);

// ── Skema Zod Rekening Pembayaran & QRIS ───────────────────────────────────
export const createPaymentAccountBodySchema = z
  .object({
    method: z.enum([PAYMENT_METHOD.QRIS, PAYMENT_METHOD.BANK_TRANSFER], {
      required_error: 'Metode pembayaran wajib diisi.',
      invalid_type_error: 'Metode pembayaran harus QRIS atau BANK_TRANSFER.',
    }),
    providerName: z
      .string({
        required_error: 'Nama penyedia/bank wajib diisi.',
        invalid_type_error: 'Nama penyedia/bank harus berupa teks.',
      })
      .trim()
      .min(2, 'Nama penyedia/bank minimal 2 karakter.')
      .max(100, 'Nama penyedia/bank maksimal 100 karakter.'),
    accountNumber: z
      .string({ invalid_type_error: 'Nomor rekening harus berupa teks.' })
      .trim()
      .min(3, 'Nomor rekening minimal 3 karakter.')
      .max(100, 'Nomor rekening maksimal 100 karakter.')
      .nullable()
      .optional(),
    accountHolder: z
      .string({
        required_error: 'Nama pemilik rekening wajib diisi.',
        invalid_type_error: 'Nama pemilik rekening harus berupa teks.',
      })
      .trim()
      .min(2, 'Nama pemilik rekening minimal 2 karakter.')
      .max(150, 'Nama pemilik rekening maksimal 150 karakter.'),
    qrImagePath: catalogImagePathSchema('qris').nullable().optional(),
    instructions: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updatePaymentAccountBodySchema = nonEmptyPatch(
  createPaymentAccountBodySchema.partial().strict()
);

// ── Skema Zod 12 Kunci Resmi Pengaturan Aplikasi ───────────────────────────
export const updateSettingsBodySchema = nonEmptyPatch(
  z
    .object({
      store_name: z.string().trim().min(1).max(100).optional(),
      admin_whatsapp: z
        .string()
        .trim()
        .min(1, 'Nomor WhatsApp admin tidak boleh kosong.')
        .transform((val, ctx) => {
          const normalized = normalizeWhatsApp(val);
          if (!normalized) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Format admin_whatsapp tidak valid. Gunakan awalan 08 atau 62 (9–17 digit).',
            });
            return z.NEVER;
          }
          return normalized;
        })
        .optional(),
      dp_percent: z.number().int().min(1).max(99).optional(),
      dp_min_qty: z.number().int().min(1).max(10_000).optional(),
      initial_payment_due_hours: z.number().int().min(1).max(720).optional(),
      auto_complete_days: z.number().int().min(1).max(90).optional(),
      dpi_ok_min: z.number().int().min(50).max(1200).optional(),
      dpi_warn_min: z.number().int().min(10).max(1200).optional(),
      max_design_file_mb: z.number().int().min(1).max(50).optional(),
      signed_url_expiry_seconds: z.number().int().min(60).max(86_400).optional(),
      temp_upload_ttl_hours: z.number().int().min(1).max(168).optional(),
      production_estimate_text: z.string().trim().min(1).max(200).optional(),
    })
    .strict()
);

export interface AdminMasterController {
  uploadImage: RequestHandler;
  listModels: RequestHandler;
  createModel: RequestHandler;
  updateModel: RequestHandler;
  deactivateModel: RequestHandler;
  replaceModelFabrics: RequestHandler;
  listFabrics: RequestHandler;
  createFabric: RequestHandler;
  updateFabric: RequestHandler;
  deactivateFabric: RequestHandler;
  listFabricColors: RequestHandler;
  createFabricColor: RequestHandler;
  updateFabricColor: RequestHandler;
  deactivateFabricColor: RequestHandler;
  listSizes: RequestHandler;
  createSize: RequestHandler;
  updateSize: RequestHandler;
  deactivateSize: RequestHandler;
  listPrintSizes: RequestHandler;
  createPrintSize: RequestHandler;
  updatePrintSize: RequestHandler;
  deactivatePrintSize: RequestHandler;
  listPaymentAccounts: RequestHandler;
  createPaymentAccount: RequestHandler;
  updatePaymentAccount: RequestHandler;
  deactivatePaymentAccount: RequestHandler;
  getSettings: RequestHandler;
  updateSettings: RequestHandler;
}

/**
 * Membuat controller master data admin, upload gambar bucket `catalog`, dan pengaturan aplikasi.
 */
export function createAdminMasterController(
  service: AdminMasterService = adminMasterService
): AdminMasterController {
  return {
    uploadImage: asyncHandler(async (req, res) => {
      const bodyFolder = (req.body as { folder?: CatalogImageFolder } | undefined)?.folder;
      const queryFolder = (req.query as { folder?: CatalogImageFolder } | undefined)?.folder;

      if (bodyFolder && queryFolder && bodyFolder !== queryFolder) {
        throw new AppError('Folder pada query dan body tidak cocok.', 400);
      }

      const folder = bodyFolder ?? queryFolder;
      if (!folder) {
        throw new AppError(
          'Folder tujuan unggahan wajib diisi (models, fabrics, qris, logs, ready).',
          400
        );
      }

      if (!req.file || !req.file.buffer) {
        throw new AppError('File gambar pada field "image" wajib diunggah.', 400);
      }

      const uploaded = await service.uploadCatalogImage(req.file.buffer, folder);
      return sendCreated<CatalogImageUploadDto>(res, {
        message: 'Gambar berhasil diunggah ke bucket catalog.',
        data: uploaded,
      });
    }),

    listModels: asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === 'true';
      const data = await service.listModels(includeInactive);
      return sendSuccess<GarmentModelDto[]>(res, {
        message: 'Daftar model pakaian berhasil dimuat.',
        data,
      });
    }),

    createModel: asyncHandler(async (req, res) => {
      const body = req.body as CreateGarmentModelDto;
      const created = await service.createModel(body);
      return sendCreated<GarmentModelDto>(res, {
        message: 'Model pakaian berhasil dibuat.',
        data: created,
      });
    }),

    updateModel: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const body = req.body as UpdateGarmentModelDto;
      const updated = await service.updateModel(id, body);
      return sendSuccess<GarmentModelDto>(res, {
        message: 'Model pakaian berhasil diperbarui.',
        data: updated,
      });
    }),

    deactivateModel: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const deactivated = await service.deactivateModel(id);
      return sendSuccess<GarmentModelDto>(res, {
        message: 'Model pakaian berhasil dinonaktifkan.',
        data: deactivated,
      });
    }),

    replaceModelFabrics: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const body = req.body as ReplaceModelFabricsDto;
      const updated = await service.replaceModelFabrics(id, body.fabricIds);
      return sendSuccess<GarmentModelDto>(res, {
        message: 'Daftar bahan yang kompatibel untuk model berhasil diperbarui.',
        data: updated,
      });
    }),

    listFabrics: asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === 'true';
      const data = await service.listFabrics(includeInactive);
      return sendSuccess<FabricDto[]>(res, {
        message: 'Daftar bahan berhasil dimuat.',
        data,
      });
    }),

    createFabric: asyncHandler(async (req, res) => {
      const body = req.body as CreateFabricDto;
      const created = await service.createFabric(body);
      return sendCreated<FabricDto>(res, {
        message: 'Bahan pakaian berhasil dibuat.',
        data: created,
      });
    }),

    updateFabric: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const body = req.body as UpdateFabricDto;
      const updated = await service.updateFabric(id, body);
      return sendSuccess<FabricDto>(res, {
        message: 'Bahan pakaian berhasil diperbarui.',
        data: updated,
      });
    }),

    deactivateFabric: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const deactivated = await service.deactivateFabric(id);
      return sendSuccess<FabricDto>(res, {
        message: 'Bahan pakaian berhasil dinonaktifkan.',
        data: deactivated,
      });
    }),

    listFabricColors: asyncHandler(async (req, res) => {
      const fabricId = Number(req.params.id);
      const includeInactive = req.query.includeInactive === 'true';
      const data = await service.listFabricColors(fabricId, includeInactive);
      return sendSuccess<FabricColorDto[]>(res, {
        message: 'Daftar preset warna bahan berhasil dimuat.',
        data,
      });
    }),

    createFabricColor: asyncHandler(async (req, res) => {
      const fabricId = Number(req.params.id);
      const body = req.body as CreateFabricColorDto;
      const created = await service.createFabricColor(fabricId, body);
      return sendCreated<FabricColorDto>(res, {
        message: 'Preset warna bahan berhasil dibuat.',
        data: created,
      });
    }),

    updateFabricColor: asyncHandler(async (req, res) => {
      const fabricId = Number(req.params.id);
      const colorId = Number(req.params.colorId);
      const body = req.body as UpdateFabricColorDto;
      const updated = await service.updateFabricColor(fabricId, colorId, body);
      return sendSuccess<FabricColorDto>(res, {
        message: 'Preset warna bahan berhasil diperbarui.',
        data: updated,
      });
    }),

    deactivateFabricColor: asyncHandler(async (req, res) => {
      const fabricId = Number(req.params.id);
      const colorId = Number(req.params.colorId);
      const deactivated = await service.deactivateFabricColor(fabricId, colorId);
      return sendSuccess<FabricColorDto>(res, {
        message: 'Preset warna bahan berhasil dinonaktifkan.',
        data: deactivated,
      });
    }),

    listSizes: asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === 'true';
      const data = await service.listSizes(includeInactive);
      return sendSuccess<SizeDto[]>(res, {
        message: 'Daftar ukuran berhasil dimuat.',
        data,
      });
    }),

    createSize: asyncHandler(async (req, res) => {
      const body = req.body as CreateSizeDto;
      const created = await service.createSize(body);
      return sendCreated<SizeDto>(res, {
        message: 'Ukuran berhasil dibuat.',
        data: created,
      });
    }),

    updateSize: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const body = req.body as UpdateSizeDto;
      const updated = await service.updateSize(id, body);
      return sendSuccess<SizeDto>(res, {
        message: 'Ukuran berhasil diperbarui.',
        data: updated,
      });
    }),

    deactivateSize: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const deactivated = await service.deactivateSize(id);
      return sendSuccess<SizeDto>(res, {
        message: 'Ukuran berhasil dinonaktifkan.',
        data: deactivated,
      });
    }),

    listPrintSizes: asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === 'true';
      const data = await service.listPrintSizes(includeInactive);
      return sendSuccess<PrintSizeDto[]>(res, {
        message: 'Daftar ukuran sablon berhasil dimuat.',
        data,
      });
    }),

    createPrintSize: asyncHandler(async (req, res) => {
      const body = req.body as CreatePrintSizeDto;
      const created = await service.createPrintSize(body);
      return sendCreated<PrintSizeDto>(res, {
        message: 'Ukuran sablon berhasil dibuat.',
        data: created,
      });
    }),

    updatePrintSize: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const body = req.body as UpdatePrintSizeDto;
      const updated = await service.updatePrintSize(id, body);
      return sendSuccess<PrintSizeDto>(res, {
        message: 'Ukuran sablon berhasil diperbarui.',
        data: updated,
      });
    }),

    deactivatePrintSize: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const deactivated = await service.deactivatePrintSize(id);
      return sendSuccess<PrintSizeDto>(res, {
        message: 'Ukuran sablon berhasil dinonaktifkan.',
        data: deactivated,
      });
    }),

    listPaymentAccounts: asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === 'true';
      const data = await service.listPaymentAccounts(includeInactive);
      return sendSuccess<PaymentAccountDto[]>(res, {
        message: 'Daftar rekening pembayaran berhasil dimuat.',
        data,
      });
    }),

    createPaymentAccount: asyncHandler(async (req, res) => {
      const body = req.body as CreatePaymentAccountDto;
      const created = await service.createPaymentAccount(body);
      return sendCreated<PaymentAccountDto>(res, {
        message: 'Rekening pembayaran berhasil dibuat.',
        data: created,
      });
    }),

    updatePaymentAccount: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const body = req.body as UpdatePaymentAccountDto;
      const updated = await service.updatePaymentAccount(id, body);
      return sendSuccess<PaymentAccountDto>(res, {
        message: 'Rekening pembayaran berhasil diperbarui.',
        data: updated,
      });
    }),

    deactivatePaymentAccount: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const deactivated = await service.deactivatePaymentAccount(id);
      return sendSuccess<PaymentAccountDto>(res, {
        message: 'Rekening pembayaran berhasil dinonaktifkan.',
        data: deactivated,
      });
    }),

    getSettings: asyncHandler(async (_req, res) => {
      const data = await service.getSettings();
      return sendSuccess<AppSettingsResponseDto>(res, {
        message: 'Pengaturan aplikasi berhasil dimuat.',
        data,
      });
    }),

    updateSettings: asyncHandler(async (req, res) => {
      const body = req.body as UpdateAppSettingsDto;
      const updated = await service.updateSettings(body);
      return sendSuccess<AppSettingsResponseDto>(res, {
        message: 'Pengaturan aplikasi berhasil diperbarui.',
        data: updated,
      });
    }),
  };
}

export const adminMasterController = createAdminMasterController();
export default adminMasterController;
