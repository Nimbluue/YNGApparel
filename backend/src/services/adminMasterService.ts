import {
  PAYMENT_METHOD,
  type AppSettingItemDto,
  type AppSettingKey,
  type AppSettingsMapDto,
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
  type SizeDto,
  type UpdateAppSettingsDto,
  type UpdateFabricColorDto,
  type UpdateFabricDto,
  type UpdateGarmentModelDto,
  type UpdatePaymentAccountDto,
  type UpdatePrintSizeDto,
  type UpdateSizeDto,
} from '@yng/shared';
import { APP_SETTING_KEYS, STORAGE_BUCKETS } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import masterModel, {
  type AppSettingRow,
  type FabricColorRow,
  type FabricRow,
  type GarmentModelRow,
  type MasterRepository,
  type PaymentAccountRow,
  type PrintSizeRow,
  type SizeRow,
} from '../models/masterModel.js';
import { processCatalogImage } from './imageService.js';
import storageService from './storageService.js';

export interface AdminMasterServiceDeps {
  masterRepo: MasterRepository;
  catalogStorage: Pick<typeof storageService, 'upload' | 'remove'>;
  getPublicCatalogUrl: (filePath: string | null) => string | null;
  processImage?: typeof processCatalogImage;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseIntSetting(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function buildSettingsMap(rows: readonly AppSettingRow[]): AppSettingsMapDto {
  const raw = new Map<AppSettingKey, string>();
  for (const row of rows) {
    raw.set(row.setting_key, row.setting_value);
  }

  return {
    store_name: raw.get('store_name') ?? 'YNG Apparel',
    admin_whatsapp: raw.get('admin_whatsapp') ?? '6280000000000',
    dp_percent: parseIntSetting(raw.get('dp_percent'), 70),
    dp_min_qty: parseIntSetting(raw.get('dp_min_qty'), 12),
    initial_payment_due_hours: parseIntSetting(raw.get('initial_payment_due_hours'), 24),
    auto_complete_days: parseIntSetting(raw.get('auto_complete_days'), 7),
    dpi_ok_min: parseIntSetting(raw.get('dpi_ok_min'), 150),
    dpi_warn_min: parseIntSetting(raw.get('dpi_warn_min'), 100),
    max_design_file_mb: parseIntSetting(raw.get('max_design_file_mb'), 20),
    signed_url_expiry_seconds: parseIntSetting(raw.get('signed_url_expiry_seconds'), 3600),
    temp_upload_ttl_hours: parseIntSetting(raw.get('temp_upload_ttl_hours'), 24),
    production_estimate_text: raw.get('production_estimate_text') ?? '7-14 hari kerja',
  };
}

function toSettingItems(rows: readonly AppSettingRow[]): AppSettingItemDto[] {
  return rows.map((row) => ({
    key: row.setting_key,
    value: row.setting_value,
    description: row.description,
    updatedAt: toIsoString(row.updated_at),
  }));
}

function toFabricColorDto(row: FabricColorRow): FabricColorDto {
  return {
    id: row.id,
    fabricId: row.fabric_id,
    colorName: row.color_name,
    colorHex: row.color_hex,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function toSizeDto(row: SizeRow): SizeDto {
  return {
    id: row.id,
    code: row.code,
    sortOrder: row.sort_order,
    extraCharge: row.extra_charge,
    isActive: row.is_active,
  };
}

function toPrintSizeDto(row: PrintSizeRow): PrintSizeDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    dimensionsCm: row.dimensions_cm,
    widthCm: row.width_cm,
    heightCm: row.height_cm,
    pricePerSpot: row.price_per_spot,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

/**
 * Membuat service manajemen master data admin, upload gambar catalog, dan pengaturan aplikasi.
 */
export function createAdminMasterService(deps: AdminMasterServiceDeps) {
  const {
    masterRepo,
    catalogStorage,
    getPublicCatalogUrl,
    processImage = processCatalogImage,
  } = deps;

  function toGarmentModelDto(row: GarmentModelRow, fabricIds: number[]): GarmentModelDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      basePrice: row.base_price,
      imagePath: row.image_path,
      imageUrl: getPublicCatalogUrl(row.image_path),
      mockupTemplate: row.mockup_template,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      fabricIds,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  }

  function toFabricDto(row: FabricRow, colors: readonly FabricColorRow[]): FabricDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      gsmWeight: row.gsm_weight,
      thicknessLevel: row.thickness_level,
      comfortLevel: row.comfort_level,
      additionalPrice: row.additional_price,
      imagePath: row.image_path,
      imageUrl: getPublicCatalogUrl(row.image_path),
      macroImagePath: row.macro_image_path,
      macroImageUrl: getPublicCatalogUrl(row.macro_image_path),
      sortOrder: row.sort_order,
      isActive: row.is_active,
      colors: colors.map(toFabricColorDto),
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  }

  function toPaymentAccountDto(row: PaymentAccountRow): PaymentAccountDto {
    return {
      id: row.id,
      method: row.method,
      providerName: row.provider_name,
      accountNumber: row.account_number,
      accountHolder: row.account_holder,
      qrImagePath: row.qr_image_path,
      qrImageUrl: getPublicCatalogUrl(row.qr_image_path),
      instructions: row.instructions,
      isActive: row.is_active,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  }

  async function cleanupReplacedPaths(
    oldPaths: readonly (string | null | undefined)[]
  ): Promise<void> {
    const uniquePaths = [...new Set(oldPaths.filter((item): item is string => Boolean(item)))];
    if (uniquePaths.length === 0) {
      return;
    }

    try {
      await catalogStorage.remove(STORAGE_BUCKETS.CATALOG, uniquePaths);
    } catch {
      // Best-effort: kegagalan hapus objek lama tidak menggagalkan transaksi DB dan tidak mencatat data sensitif.
      console.warn('[AdminMaster] Gagal menghapus objek gambar lama dari bucket catalog.');
    }
  }

  return {
    // ── Upload Gambar Catalog ──────────────────────────────────────────────
    async uploadCatalogImage(
      fileBuffer: Buffer,
      folder: CatalogImageFolder
    ): Promise<CatalogImageUploadDto> {
      const processed = await processImage(fileBuffer, folder);
      await catalogStorage.upload(STORAGE_BUCKETS.CATALOG, processed.path, processed.buffer, {
        contentType: processed.mimeType,
        upsert: false,
      });

      // Kembalikan path objek (bukan URL) untuk disimpan ke DB melalui endpoint master.
      return {
        path: processed.path,
        mimeType: processed.mimeType,
        sizeBytes: processed.sizeBytes,
      };
    },

    // ── Model Pakaian & Relasi Bahan ──────────────────────────────────────
    async listModels(includeInactive: boolean): Promise<GarmentModelDto[]> {
      const { models, fabricIdsByModel } = await masterRepo.listModels(includeInactive);
      return models.map((row) => toGarmentModelDto(row, fabricIdsByModel.get(row.id) ?? []));
    },

    async createModel(input: CreateGarmentModelDto): Promise<GarmentModelDto> {
      const created = await masterRepo.createModel(input);
      return toGarmentModelDto(created, []);
    },

    async updateModel(id: number, patch: UpdateGarmentModelDto): Promise<GarmentModelDto> {
      const existing = await masterRepo.findModelById(id);
      if (!existing) {
        throw new AppError('Model pakaian tidak ditemukan.', 404);
      }

      // Pembaruan basePrice hanya mengubah master; snapshot locked_base_price pada order lama tetap terkunci.
      const updated = await masterRepo.updateModel(id, patch);
      if (!updated) {
        throw new AppError('Model pakaian tidak ditemukan.', 404);
      }

      if (
        patch.imagePath !== undefined &&
        existing.image_path &&
        existing.image_path !== updated.image_path
      ) {
        await cleanupReplacedPaths([existing.image_path]);
      }

      const fabricIds = await masterRepo.findModelFabricIds(id);
      return toGarmentModelDto(updated, fabricIds);
    },

    async deactivateModel(id: number): Promise<GarmentModelDto> {
      const deactivated = await masterRepo.deactivateModel(id);
      if (!deactivated) {
        throw new AppError('Model pakaian tidak ditemukan.', 404);
      }
      const fabricIds = await masterRepo.findModelFabricIds(id);
      return toGarmentModelDto(deactivated, fabricIds);
    },

    async replaceModelFabrics(modelId: number, fabricIds: number[]): Promise<GarmentModelDto> {
      const updatedFabricIds = await masterRepo.replaceModelFabrics(modelId, fabricIds);
      if (updatedFabricIds === null) {
        throw new AppError('Model pakaian tidak ditemukan.', 404);
      }
      const model = await masterRepo.findModelById(modelId);
      if (!model) {
        throw new AppError('Model pakaian tidak ditemukan.', 404);
      }
      return toGarmentModelDto(model, updatedFabricIds);
    },

    // ── Bahan & Preset Warna ──────────────────────────────────────────────
    async listFabrics(includeInactive: boolean): Promise<FabricDto[]> {
      const { fabrics, colorsByFabric } = await masterRepo.listFabrics(includeInactive);
      return fabrics.map((row) => toFabricDto(row, colorsByFabric.get(row.id) ?? []));
    },

    async createFabric(input: CreateFabricDto): Promise<FabricDto> {
      const created = await masterRepo.createFabric(input);
      return toFabricDto(created, []);
    },

    async updateFabric(id: number, patch: UpdateFabricDto): Promise<FabricDto> {
      const existing = await masterRepo.findFabricById(id);
      if (!existing) {
        throw new AppError('Bahan pakaian tidak ditemukan.', 404);
      }

      // Pembaruan additionalPrice hanya mengubah master; snapshot locked_fabric_price pada order lama tetap terkunci.
      const updated = await masterRepo.updateFabric(id, patch);
      if (!updated) {
        throw new AppError('Bahan pakaian tidak ditemukan.', 404);
      }

      const stalePaths: string[] = [];
      if (
        patch.imagePath !== undefined &&
        existing.image_path &&
        existing.image_path !== updated.image_path &&
        existing.image_path !== updated.macro_image_path
      ) {
        stalePaths.push(existing.image_path);
      }
      if (
        patch.macroImagePath !== undefined &&
        existing.macro_image_path &&
        existing.macro_image_path !== updated.macro_image_path &&
        existing.macro_image_path !== updated.image_path
      ) {
        stalePaths.push(existing.macro_image_path);
      }
      await cleanupReplacedPaths(stalePaths);

      const colors = await masterRepo.listFabricColors(id, true);
      return toFabricDto(updated, colors);
    },

    async deactivateFabric(id: number): Promise<FabricDto> {
      const deactivated = await masterRepo.deactivateFabric(id);
      if (!deactivated) {
        throw new AppError('Bahan pakaian tidak ditemukan.', 404);
      }
      const colors = await masterRepo.listFabricColors(id, true);
      return toFabricDto(deactivated, colors);
    },

    async listFabricColors(fabricId: number, includeInactive: boolean): Promise<FabricColorDto[]> {
      const fabric = await masterRepo.findFabricById(fabricId);
      if (!fabric) {
        throw new AppError('Bahan pakaian tidak ditemukan.', 404);
      }
      const colors = await masterRepo.listFabricColors(fabricId, includeInactive);
      return colors.map(toFabricColorDto);
    },

    async createFabricColor(
      fabricId: number,
      input: CreateFabricColorDto
    ): Promise<FabricColorDto> {
      const fabric = await masterRepo.findFabricById(fabricId);
      if (!fabric) {
        throw new AppError('Bahan pakaian tidak ditemukan.', 404);
      }
      const created = await masterRepo.createFabricColor(fabricId, input);
      return toFabricColorDto(created);
    },

    async updateFabricColor(
      fabricId: number,
      colorId: number,
      patch: UpdateFabricColorDto
    ): Promise<FabricColorDto> {
      const existing = await masterRepo.findFabricColorById(fabricId, colorId);
      if (!existing) {
        throw new AppError('Preset warna bahan tidak ditemukan.', 404);
      }
      const updated = await masterRepo.updateFabricColor(fabricId, colorId, patch);
      if (!updated) {
        throw new AppError('Preset warna bahan tidak ditemukan.', 404);
      }
      return toFabricColorDto(updated);
    },

    async deactivateFabricColor(fabricId: number, colorId: number): Promise<FabricColorDto> {
      const deactivated = await masterRepo.deactivateFabricColor(fabricId, colorId);
      if (!deactivated) {
        throw new AppError('Preset warna bahan tidak ditemukan.', 404);
      }
      return toFabricColorDto(deactivated);
    },

    // ── Ukuran ────────────────────────────────────────────────────────────
    async listSizes(includeInactive: boolean): Promise<SizeDto[]> {
      const rows = await masterRepo.listSizes(includeInactive);
      return rows.map(toSizeDto);
    },

    async createSize(input: CreateSizeDto): Promise<SizeDto> {
      const created = await masterRepo.createSize(input);
      return toSizeDto(created);
    },

    async updateSize(id: number, patch: UpdateSizeDto): Promise<SizeDto> {
      // Pembaruan extraCharge hanya mengubah master; snapshot locked_extra_charge pada order lama tetap terkunci.
      const updated = await masterRepo.updateSize(id, patch);
      if (!updated) {
        throw new AppError('Ukuran tidak ditemukan.', 404);
      }
      return toSizeDto(updated);
    },

    async deactivateSize(id: number): Promise<SizeDto> {
      const deactivated = await masterRepo.deactivateSize(id);
      if (!deactivated) {
        throw new AppError('Ukuran tidak ditemukan.', 404);
      }
      return toSizeDto(deactivated);
    },

    // ── Ukuran Sablon ─────────────────────────────────────────────────────
    async listPrintSizes(includeInactive: boolean): Promise<PrintSizeDto[]> {
      const rows = await masterRepo.listPrintSizes(includeInactive);
      return rows.map(toPrintSizeDto);
    },

    async createPrintSize(input: CreatePrintSizeDto): Promise<PrintSizeDto> {
      const created = await masterRepo.createPrintSize(input);
      return toPrintSizeDto(created);
    },

    async updatePrintSize(id: number, patch: UpdatePrintSizeDto): Promise<PrintSizeDto> {
      // Pembaruan pricePerSpot hanya mengubah master; snapshot locked_spot_price pada order lama tetap terkunci.
      const updated = await masterRepo.updatePrintSize(id, patch);
      if (!updated) {
        throw new AppError('Ukuran sablon tidak ditemukan.', 404);
      }
      return toPrintSizeDto(updated);
    },

    async deactivatePrintSize(id: number): Promise<PrintSizeDto> {
      const deactivated = await masterRepo.deactivatePrintSize(id);
      if (!deactivated) {
        throw new AppError('Ukuran sablon tidak ditemukan.', 404);
      }
      return toPrintSizeDto(deactivated);
    },

    // ── Rekening Pembayaran & QRIS ────────────────────────────────────────
    async listPaymentAccounts(includeInactive: boolean): Promise<PaymentAccountDto[]> {
      const rows = await masterRepo.listPaymentAccounts(includeInactive);
      return rows.map(toPaymentAccountDto);
    },

    async createPaymentAccount(input: CreatePaymentAccountDto): Promise<PaymentAccountDto> {
      if (
        input.method === PAYMENT_METHOD.BANK_TRANSFER &&
        (!input.accountNumber || input.accountNumber.trim().length === 0)
      ) {
        throw new AppError('Nomor rekening wajib diisi untuk metode transfer bank.', 400);
      }

      const created = await masterRepo.createPaymentAccount(input);
      return toPaymentAccountDto(created);
    },

    async updatePaymentAccount(
      id: number,
      patch: UpdatePaymentAccountDto
    ): Promise<PaymentAccountDto> {
      const existing = await masterRepo.findPaymentAccountById(id);
      if (!existing) {
        throw new AppError('Akun pembayaran tidak ditemukan.', 404);
      }

      const effectiveMethod = patch.method ?? existing.method;
      const effectiveAccountNumber =
        patch.accountNumber !== undefined ? patch.accountNumber : existing.account_number;

      if (
        effectiveMethod === PAYMENT_METHOD.BANK_TRANSFER &&
        (!effectiveAccountNumber || effectiveAccountNumber.trim().length === 0)
      ) {
        throw new AppError('Nomor rekening wajib diisi untuk metode transfer bank.', 400);
      }

      const updated = await masterRepo.updatePaymentAccount(id, patch);
      if (!updated) {
        throw new AppError('Akun pembayaran tidak ditemukan.', 404);
      }

      if (
        patch.qrImagePath !== undefined &&
        existing.qr_image_path &&
        existing.qr_image_path !== updated.qr_image_path
      ) {
        await cleanupReplacedPaths([existing.qr_image_path]);
      }

      return toPaymentAccountDto(updated);
    },

    async deactivatePaymentAccount(id: number): Promise<PaymentAccountDto> {
      const deactivated = await masterRepo.deactivatePaymentAccount(id);
      if (!deactivated) {
        throw new AppError('Akun pembayaran tidak ditemukan.', 404);
      }
      return toPaymentAccountDto(deactivated);
    },

    // ── Pengaturan Aplikasi ───────────────────────────────────────────────
    async getSettings(): Promise<AppSettingsResponseDto> {
      const rows = await masterRepo.listSettings();
      return {
        settings: buildSettingsMap(rows),
        items: toSettingItems(rows),
      };
    },

    async updateSettings(patch: UpdateAppSettingsDto): Promise<AppSettingsResponseDto> {
      const rows = await masterRepo.updateSettingsAtomically((currentRows) => {
        const currentMap = buildSettingsMap(currentRows);
        const merged: AppSettingsMapDto = {
          ...currentMap,
          ...patch,
        };

        if (merged.dpi_ok_min <= merged.dpi_warn_min) {
          throw new AppError(
            'Nilai dpi_ok_min harus lebih besar daripada nilai dpi_warn_min.',
            400
          );
        }

        const updates: Array<{ key: AppSettingKey; value: string }> = [];
        for (const key of APP_SETTING_KEYS) {
          const newValue = patch[key];
          if (newValue !== undefined) {
            updates.push({
              key,
              value: String(newValue),
            });
          }
        }

        return updates;
      });

      return {
        settings: buildSettingsMap(rows),
        items: toSettingItems(rows),
      };
    },
  };
}

export type AdminMasterService = ReturnType<typeof createAdminMasterService>;

export const adminMasterService = createAdminMasterService({
  masterRepo: masterModel,
  catalogStorage: storageService,
  getPublicCatalogUrl: (filePath) => storageService.getPublicUrl(STORAGE_BUCKETS.CATALOG, filePath),
});

export default adminMasterService;
