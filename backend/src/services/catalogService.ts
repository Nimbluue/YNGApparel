import type {
  AppSettingKey,
  CatalogCategorySummaryDto,
  CatalogCollectionSummaryDto,
  PublicCatalogCategoryDto,
  PublicCatalogCollectionDto,
  PublicCatalogConfigDto,
  PublicFabricColorDto,
  PublicFabricDto,
  PublicGarmentModelDto,
  PublicModelDetailDto,
  PublicPaymentAccountDto,
  PublicPrintSizeDto,
  PublicSizeDto,
  Rupiah,
} from '@yng/shared';
import { STORAGE_BUCKETS } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import catalogModel, { type CatalogRepository } from '../models/catalogModel.js';
import type {
  AppSettingRow,
  CatalogCategoryRow,
  CatalogCollectionRow,
  FabricColorRow,
  FabricRow,
  GarmentModelRow,
  PaymentAccountRow,
  PrintSizeRow,
  SizeRow,
} from '../models/masterModel.js';
import storageService from './storageService.js';

export interface CatalogServiceDeps {
  catalogRepo: CatalogRepository;
  getPublicCatalogUrl: (filePath: string | null) => string | null;
}

function toRupiahInt(value: number): Rupiah {
  return Math.round(Number(value));
}

function toNumber(value: number): number {
  return Number(value);
}

function parseIntSetting(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toPublicFabricColorDto(row: FabricColorRow): PublicFabricColorDto {
  return {
    id: toNumber(row.id),
    fabricId: toNumber(row.fabric_id),
    colorName: row.color_name,
    colorHex: row.color_hex,
    sortOrder: toNumber(row.sort_order),
  };
}

function toPublicSizeDto(row: SizeRow): PublicSizeDto {
  return {
    id: toNumber(row.id),
    code: row.code,
    sortOrder: toNumber(row.sort_order),
    extraCharge: toRupiahInt(row.extra_charge),
  };
}

function toPublicPrintSizeDto(row: PrintSizeRow): PublicPrintSizeDto {
  return {
    id: toNumber(row.id),
    code: row.code,
    name: row.name,
    dimensionsCm: row.dimensions_cm,
    widthCm: toNumber(row.width_cm),
    heightCm: toNumber(row.height_cm),
    pricePerSpot: toRupiahInt(row.price_per_spot),
    sortOrder: toNumber(row.sort_order),
  };
}

function toPublicCatalogConfigDto(rows: readonly AppSettingRow[]): PublicCatalogConfigDto {
  const raw = new Map<AppSettingKey, string>();
  for (const row of rows) {
    raw.set(row.setting_key, row.setting_value);
  }

  return {
    storeName: raw.get('store_name') ?? 'YNG Apparel',
    adminWhatsapp: raw.get('admin_whatsapp') ?? '6280000000000',
    dpPercent: parseIntSetting(raw.get('dp_percent'), 70),
    dpMinQty: parseIntSetting(raw.get('dp_min_qty'), 12),
    productionEstimateText: raw.get('production_estimate_text') ?? '7-14 hari kerja',
    maxDesignFileMb: parseIntSetting(raw.get('max_design_file_mb'), 20),
  };
}

/**
 * Membuat service katalog publik yang hanya memaparkan data aktif dan tanpa kolom internal sensitif.
 */
export function createCatalogService(deps: CatalogServiceDeps) {
  const { catalogRepo, getPublicCatalogUrl } = deps;

  function toCategorySummaryDto(
    row: CatalogCategoryRow | null | undefined
  ): CatalogCategorySummaryDto | null {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sizeChartImageUrl: getPublicCatalogUrl(row.size_chart_image_path),
    };
  }

  function toCollectionSummaryDto(
    row: CatalogCollectionRow | null | undefined
  ): CatalogCollectionSummaryDto | null {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
    };
  }

  function toPublicCategoryDto(row: CatalogCategoryRow): PublicCatalogCategoryDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      sizeChartImageUrl: getPublicCatalogUrl(row.size_chart_image_path),
      sortOrder: toNumber(row.sort_order),
      activeModelCount: toNumber(row.active_model_count ?? 0),
    };
  }

  function toPublicCollectionDto(row: CatalogCollectionRow): PublicCatalogCollectionDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      status: row.status,
      sortOrder: toNumber(row.sort_order),
      activeModelCount: toNumber(row.active_model_count ?? 0),
    };
  }

  function toPublicGarmentModelDto(
    row: GarmentModelRow,
    fabricIds: number[],
    categoryRow?: CatalogCategoryRow | null,
    collectionRow?: CatalogCollectionRow | null
  ): PublicGarmentModelDto {
    const resolvedCategory = toCategorySummaryDto(categoryRow);
    const resolvedCollection = toCollectionSummaryDto(collectionRow);
    return {
      id: toNumber(row.id),
      slug: row.slug,
      name: row.name,
      description: row.description,
      basePrice: toRupiahInt(row.base_price),
      imageUrl: getPublicCatalogUrl(row.image_path),
      mockupTemplate: row.mockup_template,
      categoryId: resolvedCategory ? resolvedCategory.id : null,
      collectionId: resolvedCollection ? resolvedCollection.id : null,
      category: resolvedCategory,
      collection: resolvedCollection,
      sortOrder: toNumber(row.sort_order),
      fabricIds: fabricIds.map(toNumber),
    };
  }

  function toPublicFabricDto(row: FabricRow, colors: readonly FabricColorRow[]): PublicFabricDto {
    return {
      id: toNumber(row.id),
      code: row.code,
      name: row.name,
      description: row.description,
      gsmWeight: row.gsm_weight !== null ? toNumber(row.gsm_weight) : null,
      thicknessLevel: toNumber(row.thickness_level),
      comfortLevel: row.comfort_level !== null ? toNumber(row.comfort_level) : null,
      additionalPrice: toRupiahInt(row.additional_price),
      imageUrl: getPublicCatalogUrl(row.image_path),
      macroImageUrl: getPublicCatalogUrl(row.macro_image_path),
      sortOrder: toNumber(row.sort_order),
      colors: colors.map(toPublicFabricColorDto),
    };
  }

  function toPublicPaymentAccountDto(row: PaymentAccountRow): PublicPaymentAccountDto {
    return {
      id: toNumber(row.id),
      method: row.method,
      providerName: row.provider_name,
      accountNumber: row.account_number,
      accountHolder: row.account_holder,
      qrImageUrl: getPublicCatalogUrl(row.qr_image_path),
      instructions: row.instructions,
    };
  }

  return {
    async listCategories(): Promise<PublicCatalogCategoryDto[]> {
      const rows = await catalogRepo.listActiveCategories();
      return rows.map(toPublicCategoryDto);
    },

    async listCollections(): Promise<PublicCatalogCollectionDto[]> {
      const rows = await catalogRepo.listActiveCollections();
      return rows.map(toPublicCollectionDto);
    },

    async listModels(): Promise<PublicGarmentModelDto[]> {
      const { models, fabricIdsByModel, categoriesById, collectionsById } =
        await catalogRepo.listActiveModels();
      return models.map((row) =>
        toPublicGarmentModelDto(
          row,
          fabricIdsByModel.get(row.id) ?? [],
          row.category_id ? categoriesById.get(row.category_id) : null,
          row.collection_id ? collectionsById.get(row.collection_id) : null
        )
      );
    },

    async getModelBySlug(slug: string): Promise<PublicModelDetailDto> {
      const detail = await catalogRepo.findActiveModelDetailBySlug(slug);
      if (!detail) {
        throw new AppError('Model pakaian tidak ditemukan.', 404);
      }

      const fabrics = detail.fabrics.map((fabric) =>
        toPublicFabricDto(fabric, detail.colorsByFabric.get(fabric.id) ?? [])
      );

      return {
        ...toPublicGarmentModelDto(
          detail.model,
          fabrics.map((fabric) => fabric.id),
          detail.category,
          detail.collection
        ),
        fabrics,
      };
    },

    async listFabrics(): Promise<PublicFabricDto[]> {
      const { fabrics, colorsByFabric } = await catalogRepo.listActiveFabrics();
      return fabrics.map((row) => toPublicFabricDto(row, colorsByFabric.get(row.id) ?? []));
    },

    async listSizes(): Promise<PublicSizeDto[]> {
      const rows = await catalogRepo.listActiveSizes();
      return rows.map(toPublicSizeDto);
    },

    async listPrintSizes(): Promise<PublicPrintSizeDto[]> {
      const rows = await catalogRepo.listActivePrintSizes();
      return rows.map(toPublicPrintSizeDto);
    },

    async getConfig(): Promise<PublicCatalogConfigDto> {
      const rows = await catalogRepo.listPublicSettings();
      return toPublicCatalogConfigDto(rows);
    },

    async listPaymentAccounts(): Promise<PublicPaymentAccountDto[]> {
      const rows = await catalogRepo.listActivePaymentAccounts();
      return rows.map(toPublicPaymentAccountDto);
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;

export const catalogService = createCatalogService({
  catalogRepo: catalogModel,
  getPublicCatalogUrl: (filePath) => storageService.getPublicUrl(STORAGE_BUCKETS.CATALOG, filePath),
});

export default catalogService;
