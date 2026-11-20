import type {
  AppSettingKey,
  CreateFabricColorDto,
  CreateFabricDto,
  CreateGarmentModelDto,
  CreatePaymentAccountDto,
  CreatePrintSizeDto,
  CreateSizeDto,
  PaymentMethod,
  UpdateFabricColorDto,
  UpdateFabricDto,
  UpdateGarmentModelDto,
  UpdatePaymentAccountDto,
  UpdatePrintSizeDto,
  UpdateSizeDto,
} from '@yng/shared';
import { query, withTransaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

export interface GarmentModelRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  base_price: number;
  image_path: string | null;
  mockup_template: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface FabricRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  gsm_weight: number | null;
  thickness_level: number;
  comfort_level: number | null;
  additional_price: number;
  image_path: string | null;
  macro_image_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface FabricColorRow {
  id: number;
  fabric_id: number;
  color_name: string;
  color_hex: string;
  sort_order: number;
  is_active: boolean;
}

export interface SizeRow {
  id: number;
  code: string;
  sort_order: number;
  extra_charge: number;
  is_active: boolean;
}

export interface PrintSizeRow {
  id: number;
  code: string;
  name: string;
  dimensions_cm: string;
  width_cm: number;
  height_cm: number;
  price_per_spot: number;
  sort_order: number;
  is_active: boolean;
}

export interface PaymentAccountRow {
  id: number;
  method: PaymentMethod;
  provider_name: string;
  account_number: string | null;
  account_holder: string;
  qr_image_path: string | null;
  instructions: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AppSettingRow {
  setting_key: AppSettingKey;
  setting_value: string;
  description: string | null;
  updated_at: Date | string;
}

export interface MasterRepository {
  listModels(includeInactive: boolean): Promise<{
    models: GarmentModelRow[];
    fabricIdsByModel: Map<number, number[]>;
  }>;
  findModelById(id: number): Promise<GarmentModelRow | null>;
  findModelFabricIds(modelId: number): Promise<number[]>;
  createModel(input: CreateGarmentModelDto): Promise<GarmentModelRow>;
  updateModel(id: number, patch: UpdateGarmentModelDto): Promise<GarmentModelRow | null>;
  deactivateModel(id: number): Promise<GarmentModelRow | null>;
  replaceModelFabrics(modelId: number, fabricIds: number[]): Promise<number[] | null>;

  listFabrics(includeInactive: boolean): Promise<{
    fabrics: FabricRow[];
    colorsByFabric: Map<number, FabricColorRow[]>;
  }>;
  findFabricById(id: number): Promise<FabricRow | null>;
  createFabric(input: CreateFabricDto): Promise<FabricRow>;
  updateFabric(id: number, patch: UpdateFabricDto): Promise<FabricRow | null>;
  deactivateFabric(id: number): Promise<FabricRow | null>;

  listFabricColors(fabricId: number, includeInactive: boolean): Promise<FabricColorRow[]>;
  findFabricColorById(fabricId: number, colorId: number): Promise<FabricColorRow | null>;
  createFabricColor(fabricId: number, input: CreateFabricColorDto): Promise<FabricColorRow>;
  updateFabricColor(
    fabricId: number,
    colorId: number,
    patch: UpdateFabricColorDto
  ): Promise<FabricColorRow | null>;
  deactivateFabricColor(fabricId: number, colorId: number): Promise<FabricColorRow | null>;

  listSizes(includeInactive: boolean): Promise<SizeRow[]>;
  findSizeById(id: number): Promise<SizeRow | null>;
  createSize(input: CreateSizeDto): Promise<SizeRow>;
  updateSize(id: number, patch: UpdateSizeDto): Promise<SizeRow | null>;
  deactivateSize(id: number): Promise<SizeRow | null>;

  listPrintSizes(includeInactive: boolean): Promise<PrintSizeRow[]>;
  findPrintSizeById(id: number): Promise<PrintSizeRow | null>;
  createPrintSize(input: CreatePrintSizeDto): Promise<PrintSizeRow>;
  updatePrintSize(id: number, patch: UpdatePrintSizeDto): Promise<PrintSizeRow | null>;
  deactivatePrintSize(id: number): Promise<PrintSizeRow | null>;

  listPaymentAccounts(includeInactive: boolean): Promise<PaymentAccountRow[]>;
  findPaymentAccountById(id: number): Promise<PaymentAccountRow | null>;
  createPaymentAccount(input: CreatePaymentAccountDto): Promise<PaymentAccountRow>;
  updatePaymentAccount(
    id: number,
    patch: UpdatePaymentAccountDto
  ): Promise<PaymentAccountRow | null>;
  deactivatePaymentAccount(id: number): Promise<PaymentAccountRow | null>;

  listSettings(): Promise<AppSettingRow[]>;
  updateSettingsAtomically(
    buildUpdates: (currentRows: AppSettingRow[]) => Array<{ key: AppSettingKey; value: string }>
  ): Promise<AppSettingRow[]>;
}

function buildUpdateSetClause(entries: ReadonlyArray<readonly [string, unknown]>): {
  setSql: string;
  values: unknown[];
} {
  const clauses: string[] = [];
  const values: unknown[] = [];

  for (const [column, value] of entries) {
    if (value !== undefined) {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
    }
  }

  return {
    setSql: clauses.join(', '),
    values,
  };
}

const MODEL_COLUMNS =
  'id, slug, name, description, base_price, image_path, mockup_template, sort_order, is_active, created_at, updated_at';
const FABRIC_COLUMNS =
  'id, code, name, description, gsm_weight, thickness_level, comfort_level, additional_price, image_path, macro_image_path, sort_order, is_active, created_at, updated_at';
const FABRIC_COLOR_COLUMNS = 'id, fabric_id, color_name, color_hex, sort_order, is_active';
const SIZE_COLUMNS = 'id, code, sort_order, extra_charge, is_active';
const PRINT_SIZE_COLUMNS =
  'id, code, name, dimensions_cm, width_cm, height_cm, price_per_spot, sort_order, is_active';
const PAYMENT_ACCOUNT_COLUMNS =
  'id, method, provider_name, account_number, account_holder, qr_image_path, instructions, is_active, created_at, updated_at';

export const masterModel: MasterRepository = {
  async listModels(includeInactive: boolean) {
    const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
    const modelsResult = await query<GarmentModelRow>(
      `SELECT ${MODEL_COLUMNS}
       FROM garment_models
       ${whereClause}
       ORDER BY sort_order ASC, id ASC`
    );

    const fabricIdsByModel = new Map<number, number[]>();
    if (modelsResult.rows.length > 0) {
      const modelIds = modelsResult.rows.map((row) => row.id);
      const relResult = await query<{ model_id: number; fabric_id: number }>(
        `SELECT model_id, fabric_id
         FROM model_fabrics
         WHERE model_id = ANY($1::bigint[])
         ORDER BY fabric_id ASC`,
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

  async findModelById(id: number) {
    const result = await query<GarmentModelRow>(
      `SELECT ${MODEL_COLUMNS} FROM garment_models WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async findModelFabricIds(modelId: number) {
    const result = await query<{ fabric_id: number }>(
      `SELECT fabric_id FROM model_fabrics WHERE model_id = $1 ORDER BY fabric_id ASC`,
      [modelId]
    );
    return result.rows.map((row) => row.fabric_id);
  },

  async createModel(input: CreateGarmentModelDto) {
    const result = await query<GarmentModelRow>(
      `INSERT INTO garment_models (slug, name, description, base_price, image_path, mockup_template, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${MODEL_COLUMNS}`,
      [
        input.slug,
        input.name,
        input.description ?? null,
        input.basePrice,
        input.imagePath ?? null,
        input.mockupTemplate ?? null,
        input.sortOrder ?? 0,
        input.isActive ?? true,
      ]
    );
    return result.rows[0];
  },

  async updateModel(id: number, patch: UpdateGarmentModelDto) {
    const { setSql, values } = buildUpdateSetClause([
      ['slug', patch.slug],
      ['name', patch.name],
      ['description', patch.description],
      ['base_price', patch.basePrice],
      ['image_path', patch.imagePath],
      ['mockup_template', patch.mockupTemplate],
      ['sort_order', patch.sortOrder],
      ['is_active', patch.isActive],
    ]);

    if (!setSql) {
      return this.findModelById(id);
    }

    const result = await query<GarmentModelRow>(
      `UPDATE garment_models
       SET ${setSql}
       WHERE id = $${values.length + 1}
       RETURNING ${MODEL_COLUMNS}`,
      [...values, id]
    );
    return result.rows[0] ?? null;
  },

  async deactivateModel(id: number) {
    const result = await query<GarmentModelRow>(
      `UPDATE garment_models
       SET is_active = FALSE
       WHERE id = $1
       RETURNING ${MODEL_COLUMNS}`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async replaceModelFabrics(modelId: number, fabricIds: number[]) {
    const uniqueFabricIds = [...new Set(fabricIds)];

    return withTransaction(async (client) => {
      const modelCheck = await client.query<{ id: number }>(
        `SELECT id FROM garment_models WHERE id = $1 FOR UPDATE`,
        [modelId]
      );
      if (modelCheck.rows.length === 0) {
        return null;
      }

      if (uniqueFabricIds.length > 0) {
        const fabricCheck = await client.query<{ id: number }>(
          `SELECT id FROM fabrics WHERE id = ANY($1::bigint[])`,
          [uniqueFabricIds]
        );
        const foundSet = new Set(fabricCheck.rows.map((row) => row.id));
        const missingIds = uniqueFabricIds.filter((fid) => !foundSet.has(fid));
        if (missingIds.length > 0) {
          throw new AppError(`ID bahan tidak ditemukan: ${missingIds.join(', ')}.`, 400);
        }
      }

      await client.query(`DELETE FROM model_fabrics WHERE model_id = $1`, [modelId]);

      if (uniqueFabricIds.length > 0) {
        await client.query(
          `INSERT INTO model_fabrics (model_id, fabric_id)
           SELECT $1, unnest($2::bigint[])
           ON CONFLICT DO NOTHING`,
          [modelId, uniqueFabricIds]
        );
      }

      return uniqueFabricIds;
    });
  },

  async listFabrics(includeInactive: boolean) {
    const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
    const fabricsResult = await query<FabricRow>(
      `SELECT ${FABRIC_COLUMNS}
       FROM fabrics
       ${whereClause}
       ORDER BY sort_order ASC, id ASC`
    );

    const colorsByFabric = new Map<number, FabricColorRow[]>();
    if (fabricsResult.rows.length > 0) {
      const fabricIds = fabricsResult.rows.map((row) => row.id);
      const colorFilter = includeInactive ? '' : 'AND is_active = TRUE';
      const colorsResult = await query<FabricColorRow>(
        `SELECT ${FABRIC_COLOR_COLUMNS}
         FROM fabric_colors
         WHERE fabric_id = ANY($1::bigint[]) ${colorFilter}
         ORDER BY sort_order ASC, id ASC`,
        [fabricIds]
      );
      for (const color of colorsResult.rows) {
        const list = colorsByFabric.get(color.fabric_id) ?? [];
        list.push(color);
        colorsByFabric.set(color.fabric_id, list);
      }
    }

    return { fabrics: fabricsResult.rows, colorsByFabric };
  },

  async findFabricById(id: number) {
    const result = await query<FabricRow>(
      `SELECT ${FABRIC_COLUMNS} FROM fabrics WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async createFabric(input: CreateFabricDto) {
    const result = await query<FabricRow>(
      `INSERT INTO fabrics (
         code, name, description, gsm_weight, thickness_level, comfort_level,
         additional_price, image_path, macro_image_path, sort_order, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${FABRIC_COLUMNS}`,
      [
        input.code,
        input.name,
        input.description ?? null,
        input.gsmWeight ?? null,
        input.thicknessLevel ?? 3,
        input.comfortLevel ?? null,
        input.additionalPrice ?? 0,
        input.imagePath ?? null,
        input.macroImagePath ?? null,
        input.sortOrder ?? 0,
        input.isActive ?? true,
      ]
    );
    return result.rows[0];
  },

  async updateFabric(id: number, patch: UpdateFabricDto) {
    const { setSql, values } = buildUpdateSetClause([
      ['code', patch.code],
      ['name', patch.name],
      ['description', patch.description],
      ['gsm_weight', patch.gsmWeight],
      ['thickness_level', patch.thicknessLevel],
      ['comfort_level', patch.comfortLevel],
      ['additional_price', patch.additionalPrice],
      ['image_path', patch.imagePath],
      ['macro_image_path', patch.macroImagePath],
      ['sort_order', patch.sortOrder],
      ['is_active', patch.isActive],
    ]);

    if (!setSql) {
      return this.findFabricById(id);
    }

    const result = await query<FabricRow>(
      `UPDATE fabrics
       SET ${setSql}
       WHERE id = $${values.length + 1}
       RETURNING ${FABRIC_COLUMNS}`,
      [...values, id]
    );
    return result.rows[0] ?? null;
  },

  async deactivateFabric(id: number) {
    const result = await query<FabricRow>(
      `UPDATE fabrics
       SET is_active = FALSE
       WHERE id = $1
       RETURNING ${FABRIC_COLUMNS}`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async listFabricColors(fabricId: number, includeInactive: boolean) {
    const activeFilter = includeInactive ? '' : 'AND is_active = TRUE';
    const result = await query<FabricColorRow>(
      `SELECT ${FABRIC_COLOR_COLUMNS}
       FROM fabric_colors
       WHERE fabric_id = $1 ${activeFilter}
       ORDER BY sort_order ASC, id ASC`,
      [fabricId]
    );
    return result.rows;
  },

  async findFabricColorById(fabricId: number, colorId: number) {
    const result = await query<FabricColorRow>(
      `SELECT ${FABRIC_COLOR_COLUMNS}
       FROM fabric_colors
       WHERE id = $1 AND fabric_id = $2
       LIMIT 1`,
      [colorId, fabricId]
    );
    return result.rows[0] ?? null;
  },

  async createFabricColor(fabricId: number, input: CreateFabricColorDto) {
    const result = await query<FabricColorRow>(
      `INSERT INTO fabric_colors (fabric_id, color_name, color_hex, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${FABRIC_COLOR_COLUMNS}`,
      [fabricId, input.colorName, input.colorHex, input.sortOrder ?? 0, input.isActive ?? true]
    );
    return result.rows[0];
  },

  async updateFabricColor(fabricId: number, colorId: number, patch: UpdateFabricColorDto) {
    const { setSql, values } = buildUpdateSetClause([
      ['color_name', patch.colorName],
      ['color_hex', patch.colorHex],
      ['sort_order', patch.sortOrder],
      ['is_active', patch.isActive],
    ]);

    if (!setSql) {
      return this.findFabricColorById(fabricId, colorId);
    }

    const result = await query<FabricColorRow>(
      `UPDATE fabric_colors
       SET ${setSql}
       WHERE id = $${values.length + 1} AND fabric_id = $${values.length + 2}
       RETURNING ${FABRIC_COLOR_COLUMNS}`,
      [...values, colorId, fabricId]
    );
    return result.rows[0] ?? null;
  },

  async deactivateFabricColor(fabricId: number, colorId: number) {
    const result = await query<FabricColorRow>(
      `UPDATE fabric_colors
       SET is_active = FALSE
       WHERE id = $1 AND fabric_id = $2
       RETURNING ${FABRIC_COLOR_COLUMNS}`,
      [colorId, fabricId]
    );
    return result.rows[0] ?? null;
  },

  async listSizes(includeInactive: boolean) {
    const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
    const result = await query<SizeRow>(
      `SELECT ${SIZE_COLUMNS}
       FROM sizes
       ${whereClause}
       ORDER BY sort_order ASC, id ASC`
    );
    return result.rows;
  },

  async findSizeById(id: number) {
    const result = await query<SizeRow>(`SELECT ${SIZE_COLUMNS} FROM sizes WHERE id = $1 LIMIT 1`, [
      id,
    ]);
    return result.rows[0] ?? null;
  },

  async createSize(input: CreateSizeDto) {
    const result = await query<SizeRow>(
      `INSERT INTO sizes (code, sort_order, extra_charge, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SIZE_COLUMNS}`,
      [input.code, input.sortOrder ?? 0, input.extraCharge ?? 0, input.isActive ?? true]
    );
    return result.rows[0];
  },

  async updateSize(id: number, patch: UpdateSizeDto) {
    const { setSql, values } = buildUpdateSetClause([
      ['code', patch.code],
      ['sort_order', patch.sortOrder],
      ['extra_charge', patch.extraCharge],
      ['is_active', patch.isActive],
    ]);

    if (!setSql) {
      return this.findSizeById(id);
    }

    const result = await query<SizeRow>(
      `UPDATE sizes
       SET ${setSql}
       WHERE id = $${values.length + 1}
       RETURNING ${SIZE_COLUMNS}`,
      [...values, id]
    );
    return result.rows[0] ?? null;
  },

  async deactivateSize(id: number) {
    const result = await query<SizeRow>(
      `UPDATE sizes
       SET is_active = FALSE
       WHERE id = $1
       RETURNING ${SIZE_COLUMNS}`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async listPrintSizes(includeInactive: boolean) {
    const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
    const result = await query<PrintSizeRow>(
      `SELECT ${PRINT_SIZE_COLUMNS}
       FROM print_sizes
       ${whereClause}
       ORDER BY sort_order ASC, id ASC`
    );
    return result.rows;
  },

  async findPrintSizeById(id: number) {
    const result = await query<PrintSizeRow>(
      `SELECT ${PRINT_SIZE_COLUMNS} FROM print_sizes WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async createPrintSize(input: CreatePrintSizeDto) {
    const result = await query<PrintSizeRow>(
      `INSERT INTO print_sizes (code, name, dimensions_cm, width_cm, height_cm, price_per_spot, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${PRINT_SIZE_COLUMNS}`,
      [
        input.code,
        input.name,
        input.dimensionsCm,
        input.widthCm,
        input.heightCm,
        input.pricePerSpot,
        input.sortOrder ?? 0,
        input.isActive ?? true,
      ]
    );
    return result.rows[0];
  },

  async updatePrintSize(id: number, patch: UpdatePrintSizeDto) {
    const { setSql, values } = buildUpdateSetClause([
      ['code', patch.code],
      ['name', patch.name],
      ['dimensions_cm', patch.dimensionsCm],
      ['width_cm', patch.widthCm],
      ['height_cm', patch.heightCm],
      ['price_per_spot', patch.pricePerSpot],
      ['sort_order', patch.sortOrder],
      ['is_active', patch.isActive],
    ]);

    if (!setSql) {
      return this.findPrintSizeById(id);
    }

    const result = await query<PrintSizeRow>(
      `UPDATE print_sizes
       SET ${setSql}
       WHERE id = $${values.length + 1}
       RETURNING ${PRINT_SIZE_COLUMNS}`,
      [...values, id]
    );
    return result.rows[0] ?? null;
  },

  async deactivatePrintSize(id: number) {
    const result = await query<PrintSizeRow>(
      `UPDATE print_sizes
       SET is_active = FALSE
       WHERE id = $1
       RETURNING ${PRINT_SIZE_COLUMNS}`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async listPaymentAccounts(includeInactive: boolean) {
    const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
    const result = await query<PaymentAccountRow>(
      `SELECT ${PAYMENT_ACCOUNT_COLUMNS}
       FROM payment_accounts
       ${whereClause}
       ORDER BY id ASC`
    );
    return result.rows;
  },

  async findPaymentAccountById(id: number) {
    const result = await query<PaymentAccountRow>(
      `SELECT ${PAYMENT_ACCOUNT_COLUMNS} FROM payment_accounts WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async createPaymentAccount(input: CreatePaymentAccountDto) {
    const result = await query<PaymentAccountRow>(
      `INSERT INTO payment_accounts (method, provider_name, account_number, account_holder, qr_image_path, instructions, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PAYMENT_ACCOUNT_COLUMNS}`,
      [
        input.method,
        input.providerName,
        input.accountNumber ?? null,
        input.accountHolder,
        input.qrImagePath ?? null,
        input.instructions ?? null,
        input.isActive ?? true,
      ]
    );
    return result.rows[0];
  },

  async updatePaymentAccount(id: number, patch: UpdatePaymentAccountDto) {
    const { setSql, values } = buildUpdateSetClause([
      ['method', patch.method],
      ['provider_name', patch.providerName],
      ['account_number', patch.accountNumber],
      ['account_holder', patch.accountHolder],
      ['qr_image_path', patch.qrImagePath],
      ['instructions', patch.instructions],
      ['is_active', patch.isActive],
    ]);

    if (!setSql) {
      return this.findPaymentAccountById(id);
    }

    const result = await query<PaymentAccountRow>(
      `UPDATE payment_accounts
       SET ${setSql}
       WHERE id = $${values.length + 1}
       RETURNING ${PAYMENT_ACCOUNT_COLUMNS}`,
      [...values, id]
    );
    return result.rows[0] ?? null;
  },

  async deactivatePaymentAccount(id: number) {
    const result = await query<PaymentAccountRow>(
      `UPDATE payment_accounts
       SET is_active = FALSE
       WHERE id = $1
       RETURNING ${PAYMENT_ACCOUNT_COLUMNS}`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async listSettings() {
    const result = await query<AppSettingRow>(
      `SELECT setting_key, setting_value, description, updated_at
       FROM app_settings
       ORDER BY setting_key ASC`
    );
    return result.rows;
  },

  async updateSettingsAtomically(
    buildUpdates: (currentRows: AppSettingRow[]) => Array<{ key: AppSettingKey; value: string }>
  ) {
    return withTransaction(async (client) => {
      const currentResult = await client.query<AppSettingRow>(
        `SELECT setting_key, setting_value, description, updated_at
         FROM app_settings
         ORDER BY setting_key ASC
         FOR UPDATE`
      );

      const updates = buildUpdates(currentResult.rows);
      for (const item of updates) {
        await client.query(
          `UPDATE app_settings
           SET setting_value = $1
           WHERE setting_key = $2`,
          [item.value, item.key]
        );
      }

      const refreshedResult = await client.query<AppSettingRow>(
        `SELECT setting_key, setting_value, description, updated_at
         FROM app_settings
         ORDER BY setting_key ASC`
      );
      return refreshedResult.rows;
    });
  },
};

export default masterModel;
