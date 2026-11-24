import type { QueryResult, QueryResultRow } from 'pg';
import { query } from '../config/database.js';
import type {
  AppSettingRow,
  FabricColorRow,
  FabricRow,
  GarmentModelRow,
  PaymentAccountRow,
  PrintSizeRow,
  SizeRow,
} from './masterModel.js';
import type { AppSettingKey } from '@yng/shared';

export const PUBLIC_CATALOG_SETTING_KEYS: readonly AppSettingKey[] = [
  'store_name',
  'admin_whatsapp',
  'dp_percent',
  'dp_min_qty',
  'production_estimate_text',
  'max_design_file_mb',
];

export interface SqlQueryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

export interface PricingLookupIds {
  modelIds: number[];
  fabricIds: number[];
  fabricColorIds: number[];
  sizeIds: number[];
  printSizeIds: number[];
}

export interface PricingReferenceData {
  modelsById: Map<number, GarmentModelRow>;
  fabricsById: Map<number, FabricRow>;
  compatibleModelFabrics: Set<string>;
  fabricColorsById: Map<number, FabricColorRow>;
  sizesById: Map<number, SizeRow>;
  printSizesById: Map<number, PrintSizeRow>;
  dpMinQty: number;
  dpPercent: number;
}

export interface ActiveModelDetailResult {
  model: GarmentModelRow;
  fabrics: FabricRow[];
  colorsByFabric: Map<number, FabricColorRow[]>;
}

export interface CatalogRepository {
  listActiveModels(): Promise<{
    models: GarmentModelRow[];
    fabricIdsByModel: Map<number, number[]>;
  }>;
  findActiveModelDetailBySlug(slug: string): Promise<ActiveModelDetailResult | null>;
  listActiveFabrics(): Promise<{
    fabrics: FabricRow[];
    colorsByFabric: Map<number, FabricColorRow[]>;
  }>;
  listActiveSizes(): Promise<SizeRow[]>;
  listActivePrintSizes(): Promise<PrintSizeRow[]>;
  listPublicSettings(): Promise<AppSettingRow[]>;
  listActivePaymentAccounts(): Promise<PaymentAccountRow[]>;
  loadPricingReferenceData(
    lookup: PricingLookupIds,
    executor?: SqlQueryExecutor
  ): Promise<PricingReferenceData>;
}

const defaultExecutor: SqlQueryExecutor = { query };

const MODEL_COLUMNS =
  'id, slug, name, description, base_price, image_path, mockup_template, sort_order, is_active, created_at, updated_at';
const FABRIC_COLUMNS =
  'id, code, name, description, gsm_weight, thickness_level, comfort_level, additional_price, image_path, macro_image_path, sort_order, is_active, created_at, updated_at';
const FABRIC_COLUMNS_ALIASED =
  'f.id, f.code, f.name, f.description, f.gsm_weight, f.thickness_level, f.comfort_level, f.additional_price, f.image_path, f.macro_image_path, f.sort_order, f.is_active, f.created_at, f.updated_at';
const FABRIC_COLOR_COLUMNS = 'id, fabric_id, color_name, color_hex, sort_order, is_active';
const SIZE_COLUMNS = 'id, code, sort_order, extra_charge, is_active';
const PRINT_SIZE_COLUMNS =
  'id, code, name, dimensions_cm, width_cm, height_cm, price_per_spot, sort_order, is_active';
const PAYMENT_ACCOUNT_COLUMNS =
  'id, method, provider_name, account_number, account_holder, qr_image_path, instructions, is_active, created_at, updated_at';

function groupColorsByFabric(rows: readonly FabricColorRow[]): Map<number, FabricColorRow[]> {
  const colorsByFabric = new Map<number, FabricColorRow[]>();
  for (const color of rows) {
    const list = colorsByFabric.get(color.fabric_id) ?? [];
    list.push(color);
    colorsByFabric.set(color.fabric_id, list);
  }
  return colorsByFabric;
}

export const catalogModel: CatalogRepository = {
  async listActiveModels() {
    const modelsResult = await query<GarmentModelRow>(
      `SELECT ${MODEL_COLUMNS}
       FROM garment_models
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`
    );

    const fabricIdsByModel = new Map<number, number[]>();
    if (modelsResult.rows.length > 0) {
      const modelIds = modelsResult.rows.map((row) => row.id);
      const relResult = await query<{ model_id: number; fabric_id: number }>(
        `SELECT mf.model_id, mf.fabric_id
         FROM model_fabrics mf
         INNER JOIN fabrics f ON f.id = mf.fabric_id
         WHERE mf.model_id = ANY($1::bigint[]) AND f.is_active = TRUE
         ORDER BY f.sort_order ASC, f.id ASC`,
        [modelIds]
      );
      for (const rel of relResult.rows) {
        const list = fabricIdsByModel.get(rel.model_id) ?? [];
        list.push(rel.fabric_id);
        fabricIdsByModel.set(rel.model_id, list);
      }
    }

    return { models: modelsResult.rows, fabricIdsByModel };
  },

  async findActiveModelDetailBySlug(slug: string) {
    const modelResult = await query<GarmentModelRow>(
      `SELECT ${MODEL_COLUMNS}
       FROM garment_models
       WHERE slug = $1 AND is_active = TRUE
       LIMIT 1`,
      [slug]
    );
    const model = modelResult.rows[0];
    if (!model) {
      return null;
    }

    const fabricsResult = await query<FabricRow>(
      `SELECT ${FABRIC_COLUMNS_ALIASED}
       FROM fabrics f
       INNER JOIN model_fabrics mf ON mf.fabric_id = f.id
       WHERE mf.model_id = $1 AND f.is_active = TRUE
       ORDER BY f.sort_order ASC, f.id ASC`,
      [model.id]
    );

    let colorsByFabric = new Map<number, FabricColorRow[]>();
    if (fabricsResult.rows.length > 0) {
      const fabricIds = fabricsResult.rows.map((row) => row.id);
      const colorsResult = await query<FabricColorRow>(
        `SELECT ${FABRIC_COLOR_COLUMNS}
         FROM fabric_colors
         WHERE fabric_id = ANY($1::bigint[]) AND is_active = TRUE
         ORDER BY sort_order ASC, id ASC`,
        [fabricIds]
      );
      colorsByFabric = groupColorsByFabric(colorsResult.rows);
    }

    return { model, fabrics: fabricsResult.rows, colorsByFabric };
  },

  async listActiveFabrics() {
    const fabricsResult = await query<FabricRow>(
      `SELECT ${FABRIC_COLUMNS}
       FROM fabrics
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`
    );

    let colorsByFabric = new Map<number, FabricColorRow[]>();
    if (fabricsResult.rows.length > 0) {
      const fabricIds = fabricsResult.rows.map((row) => row.id);
      const colorsResult = await query<FabricColorRow>(
        `SELECT ${FABRIC_COLOR_COLUMNS}
         FROM fabric_colors
         WHERE fabric_id = ANY($1::bigint[]) AND is_active = TRUE
         ORDER BY sort_order ASC, id ASC`,
        [fabricIds]
      );
      colorsByFabric = groupColorsByFabric(colorsResult.rows);
    }

    return { fabrics: fabricsResult.rows, colorsByFabric };
  },

  async listActiveSizes() {
    const result = await query<SizeRow>(
      `SELECT ${SIZE_COLUMNS}
       FROM sizes
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`
    );
    return result.rows;
  },

  async listActivePrintSizes() {
    const result = await query<PrintSizeRow>(
      `SELECT ${PRINT_SIZE_COLUMNS}
       FROM print_sizes
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`
    );
    return result.rows;
  },

  async listPublicSettings() {
    const result = await query<AppSettingRow>(
      `SELECT setting_key, setting_value, description, updated_at
       FROM app_settings
       WHERE setting_key = ANY($1::text[])
       ORDER BY setting_key ASC`,
      [[...PUBLIC_CATALOG_SETTING_KEYS]]
    );
    return result.rows;
  },

  async listActivePaymentAccounts() {
    const result = await query<PaymentAccountRow>(
      `SELECT ${PAYMENT_ACCOUNT_COLUMNS}
       FROM payment_accounts
       WHERE is_active = TRUE
       ORDER BY id ASC`
    );
    return result.rows;
  },

  async loadPricingReferenceData(
    lookup: PricingLookupIds,
    executor: SqlQueryExecutor = defaultExecutor
  ): Promise<PricingReferenceData> {
    const modelsById = new Map<number, GarmentModelRow>();
    const fabricsById = new Map<number, FabricRow>();
    const compatibleModelFabrics = new Set<string>();
    const fabricColorsById = new Map<number, FabricColorRow>();
    const sizesById = new Map<number, SizeRow>();
    const printSizesById = new Map<number, PrintSizeRow>();

    if (lookup.modelIds.length > 0) {
      const modelsRes = await executor.query<GarmentModelRow>(
        `SELECT ${MODEL_COLUMNS} FROM garment_models WHERE id = ANY($1::bigint[])`,
        [lookup.modelIds]
      );
      for (const row of modelsRes.rows) {
        modelsById.set(row.id, row);
      }
    }

    if (lookup.fabricIds.length > 0) {
      const fabricsRes = await executor.query<FabricRow>(
        `SELECT ${FABRIC_COLUMNS} FROM fabrics WHERE id = ANY($1::bigint[])`,
        [lookup.fabricIds]
      );
      for (const row of fabricsRes.rows) {
        fabricsById.set(row.id, row);
      }
    }

    if (lookup.modelIds.length > 0 && lookup.fabricIds.length > 0) {
      const relRes = await executor.query<{ model_id: number; fabric_id: number }>(
        `SELECT model_id, fabric_id
         FROM model_fabrics
         WHERE model_id = ANY($1::bigint[]) AND fabric_id = ANY($2::bigint[])`,
        [lookup.modelIds, lookup.fabricIds]
      );
      for (const row of relRes.rows) {
        compatibleModelFabrics.add(`${row.model_id}:${row.fabric_id}`);
      }
    }

    if (lookup.fabricColorIds.length > 0) {
      const colorsRes = await executor.query<FabricColorRow>(
        `SELECT ${FABRIC_COLOR_COLUMNS} FROM fabric_colors WHERE id = ANY($1::bigint[])`,
        [lookup.fabricColorIds]
      );
      for (const row of colorsRes.rows) {
        fabricColorsById.set(row.id, row);
      }
    }

    if (lookup.sizeIds.length > 0) {
      const sizesRes = await executor.query<SizeRow>(
        `SELECT ${SIZE_COLUMNS} FROM sizes WHERE id = ANY($1::bigint[])`,
        [lookup.sizeIds]
      );
      for (const row of sizesRes.rows) {
        sizesById.set(row.id, row);
      }
    }

    if (lookup.printSizeIds.length > 0) {
      const printSizesRes = await executor.query<PrintSizeRow>(
        `SELECT ${PRINT_SIZE_COLUMNS} FROM print_sizes WHERE id = ANY($1::bigint[])`,
        [lookup.printSizeIds]
      );
      for (const row of printSizesRes.rows) {
        printSizesById.set(row.id, row);
      }
    }

    const settingsRes = await executor.query<AppSettingRow>(
      `SELECT setting_key, setting_value, description, updated_at
       FROM app_settings
       WHERE setting_key IN ('dp_percent', 'dp_min_qty')`
    );

    // ASSUMPTION: fallback default migrasi 001 (70% & 12 pcs) hanya dipakai bila kunci belum tersedia di app_settings
    let dpPercent = 70;
    let dpMinQty = 12;
    for (const row of settingsRes.rows) {
      const parsed = Number.parseInt(String(row.setting_value ?? ''), 10);
      if (
        row.setting_key === 'dp_percent' &&
        Number.isInteger(parsed) &&
        parsed >= 1 &&
        parsed <= 99
      ) {
        dpPercent = parsed;
      } else if (row.setting_key === 'dp_min_qty' && Number.isInteger(parsed) && parsed >= 1) {
        dpMinQty = parsed;
      }
    }

    return {
      modelsById,
      fabricsById,
      compatibleModelFabrics,
      fabricColorsById,
      sizesById,
      printSizesById,
      dpMinQty,
      dpPercent,
    };
  },
};

export default catalogModel;
