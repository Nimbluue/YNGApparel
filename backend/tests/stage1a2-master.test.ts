import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  PAYMENT_METHOD,
  USER_ROLE,
  type AppSettingKey,
  type CreateFabricColorDto,
  type CreateFabricDto,
  type CreateGarmentModelDto,
  type CreatePaymentAccountDto,
  type CreatePrintSizeDto,
  type CreateSizeDto,
  type UpdateFabricColorDto,
  type UpdateFabricDto,
  type UpdateGarmentModelDto,
  type UpdatePaymentAccountDto,
  type UpdatePrintSizeDto,
  type UpdateSizeDto,
} from '@yng/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppSettingRow,
  FabricColorRow,
  FabricRow,
  GarmentModelRow,
  MasterRepository,
  PaymentAccountRow,
  PrintSizeRow,
  SizeRow,
} from '../src/models/masterModel.js';
import type { AuthDbUserRow } from '../src/types/auth.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { CATALOG_IMAGE_PATH_REGEX } = await import('../src/config/constants.js');
const { env } = await import('../src/config/env.js');
const { createRequireAuth, signAuthToken } = await import('../src/middleware/auth.js');
const { AppError, errorHandler, notFoundHandler } =
  await import('../src/middleware/errorHandler.js');
const { originCheck } = await import('../src/middleware/originCheck.js');
const { createAdminRouter } = await import('../src/routes/adminRoutes.js');
const { createAdminMasterService } = await import('../src/services/adminMasterService.js');

function createPgUniqueError(constraint: string): Error & { code: string; constraint: string } {
  const err = new Error(
    `duplicate key value violates unique constraint "${constraint}"`
  ) as Error & {
    code: string;
    constraint: string;
  };
  err.code = '23505';
  err.constraint = constraint;
  return err;
}

function createInMemoryMasterRepo() {
  let modelIdSeq = 1;
  let fabricIdSeq = 1;
  let colorIdSeq = 1;
  let sizeIdSeq = 1;
  let printSizeIdSeq = 1;
  let accountIdSeq = 1;

  const models = new Map<number, GarmentModelRow>();
  const modelFabrics = new Map<number, Set<number>>();
  const fabrics = new Map<number, FabricRow>();
  const fabricColors = new Map<number, FabricColorRow>();
  const sizes = new Map<number, SizeRow>();
  const printSizes = new Map<number, PrintSizeRow>();
  const paymentAccounts = new Map<number, PaymentAccountRow>();

  // Snapshot order dummy untuk memverifikasi perubahan harga master tidak mengubah order lama.
  const lockedOrderSnapshots = [
    {
      orderCode: 'YNG-LOCKED',
      modelId: 1,
      lockedBasePrice: 65000,
      lockedFabricPrice: 10000,
      lockedExtraCharge: 10000,
      lockedSpotPrice: 25000,
    },
  ];

  const defaultSettings: Array<[AppSettingKey, string, string]> = [
    ['store_name', 'YNG Apparel', 'Nama brand'],
    ['admin_whatsapp', '6280000000000', 'Nomor WA admin'],
    ['dp_percent', '70', 'Persentase DP'],
    ['dp_min_qty', '12', 'Minimal total pcs untuk DP'],
    ['initial_payment_due_hours', '24', 'Batas bayar awal'],
    ['auto_complete_days', '7', 'Auto complete hari'],
    ['dpi_ok_min', '150', 'DPI minimal aman'],
    ['dpi_warn_min', '100', 'DPI minimal peringatan'],
    ['max_design_file_mb', '20', 'Ukuran maksimal file desain'],
    ['signed_url_expiry_seconds', '3600', 'Masa berlaku signed URL'],
    ['temp_upload_ttl_hours', '24', 'TTL file sementara'],
    ['production_estimate_text', '7-14 hari kerja', 'Estimasi produksi'],
  ];

  const settings = new Map<AppSettingKey, AppSettingRow>(
    defaultSettings.map(([key, value, description]) => [
      key,
      {
        setting_key: key,
        setting_value: value,
        description,
        updated_at: new Date().toISOString(),
      },
    ])
  );

  const now = () => new Date().toISOString();

  const repo: MasterRepository = {
    async listModels(includeInactive) {
      const list = [...models.values()]
        .filter((m) => includeInactive || m.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const fabricIdsByModel = new Map<number, number[]>();
      for (const m of list) {
        fabricIdsByModel.set(
          m.id,
          [...(modelFabrics.get(m.id) ?? new Set<number>())].sort((a, b) => a - b)
        );
      }
      return { models: list.map((m) => ({ ...m })), fabricIdsByModel };
    },

    async findModelById(id) {
      const row = models.get(id);
      return row ? { ...row } : null;
    },

    async findModelFabricIds(modelId) {
      return [...(modelFabrics.get(modelId) ?? new Set<number>())].sort((a, b) => a - b);
    },

    async createModel(input: CreateGarmentModelDto) {
      for (const existing of models.values()) {
        if (existing.slug === input.slug) {
          throw createPgUniqueError('garment_models_slug_key');
        }
      }
      const created: GarmentModelRow = {
        id: modelIdSeq++,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        base_price: input.basePrice,
        image_path: input.imagePath ?? null,
        mockup_template: input.mockupTemplate ?? null,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
        created_at: now(),
        updated_at: now(),
      };
      models.set(created.id, created);
      return { ...created };
    },

    async updateModel(id, patch: UpdateGarmentModelDto) {
      const current = models.get(id);
      if (!current) return null;
      if (patch.slug && patch.slug !== current.slug) {
        for (const existing of models.values()) {
          if (existing.id !== id && existing.slug === patch.slug) {
            throw createPgUniqueError('garment_models_slug_key');
          }
        }
      }
      const updated: GarmentModelRow = {
        ...current,
        slug: patch.slug ?? current.slug,
        name: patch.name ?? current.name,
        description: patch.description !== undefined ? patch.description : current.description,
        base_price: patch.basePrice ?? current.base_price,
        image_path: patch.imagePath !== undefined ? patch.imagePath : current.image_path,
        mockup_template:
          patch.mockupTemplate !== undefined ? patch.mockupTemplate : current.mockup_template,
        sort_order: patch.sortOrder ?? current.sort_order,
        is_active: patch.isActive ?? current.is_active,
        updated_at: now(),
      };
      models.set(id, updated);
      return { ...updated };
    },

    async deactivateModel(id) {
      const current = models.get(id);
      if (!current) return null;
      const updated = { ...current, is_active: false, updated_at: now() };
      models.set(id, updated);
      return { ...updated };
    },

    async replaceModelFabrics(modelId, fabricIds) {
      if (!models.has(modelId)) return null;
      const uniqueIds = [...new Set(fabricIds)];
      const missing = uniqueIds.filter((fid) => !fabrics.has(fid));
      if (missing.length > 0) {
        throw new AppError(`ID bahan tidak ditemukan: ${missing.join(', ')}.`, 400);
      }
      modelFabrics.set(modelId, new Set(uniqueIds));
      return uniqueIds;
    },

    async listFabrics(includeInactive) {
      const list = [...fabrics.values()]
        .filter((f) => includeInactive || f.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const colorsByFabric = new Map<number, FabricColorRow[]>();
      for (const f of list) {
        const colors = [...fabricColors.values()]
          .filter((c) => c.fabric_id === f.id && (includeInactive || c.is_active))
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
          .map((c) => ({ ...c }));
        colorsByFabric.set(f.id, colors);
      }
      return { fabrics: list.map((f) => ({ ...f })), colorsByFabric };
    },

    async findFabricById(id) {
      const row = fabrics.get(id);
      return row ? { ...row } : null;
    },

    async createFabric(input: CreateFabricDto) {
      for (const existing of fabrics.values()) {
        if (existing.code === input.code) {
          throw createPgUniqueError('fabrics_code_key');
        }
      }
      const created: FabricRow = {
        id: fabricIdSeq++,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        gsm_weight: input.gsmWeight ?? null,
        thickness_level: input.thicknessLevel ?? 3,
        comfort_level: input.comfortLevel ?? null,
        additional_price: input.additionalPrice ?? 0,
        image_path: input.imagePath ?? null,
        macro_image_path: input.macroImagePath ?? null,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
        created_at: now(),
        updated_at: now(),
      };
      fabrics.set(created.id, created);
      return { ...created };
    },

    async updateFabric(id, patch: UpdateFabricDto) {
      const current = fabrics.get(id);
      if (!current) return null;
      if (patch.code && patch.code !== current.code) {
        for (const existing of fabrics.values()) {
          if (existing.id !== id && existing.code === patch.code) {
            throw createPgUniqueError('fabrics_code_key');
          }
        }
      }
      const updated: FabricRow = {
        ...current,
        code: patch.code ?? current.code,
        name: patch.name ?? current.name,
        description: patch.description !== undefined ? patch.description : current.description,
        gsm_weight: patch.gsmWeight !== undefined ? patch.gsmWeight : current.gsm_weight,
        thickness_level: patch.thicknessLevel ?? current.thickness_level,
        comfort_level:
          patch.comfortLevel !== undefined ? patch.comfortLevel : current.comfort_level,
        additional_price: patch.additionalPrice ?? current.additional_price,
        image_path: patch.imagePath !== undefined ? patch.imagePath : current.image_path,
        macro_image_path:
          patch.macroImagePath !== undefined ? patch.macroImagePath : current.macro_image_path,
        sort_order: patch.sortOrder ?? current.sort_order,
        is_active: patch.isActive ?? current.is_active,
        updated_at: now(),
      };
      fabrics.set(id, updated);
      return { ...updated };
    },

    async deactivateFabric(id) {
      const current = fabrics.get(id);
      if (!current) return null;
      const updated = { ...current, is_active: false, updated_at: now() };
      fabrics.set(id, updated);
      return { ...updated };
    },

    async listFabricColors(fabricId, includeInactive) {
      return [...fabricColors.values()]
        .filter((c) => c.fabric_id === fabricId && (includeInactive || c.is_active))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
        .map((c) => ({ ...c }));
    },

    async findFabricColorById(fabricId, colorId) {
      const row = fabricColors.get(colorId);
      return row && row.fabric_id === fabricId ? { ...row } : null;
    },

    async createFabricColor(fabricId, input: CreateFabricColorDto) {
      for (const existing of fabricColors.values()) {
        if (existing.fabric_id === fabricId && existing.color_name === input.colorName) {
          throw createPgUniqueError('uq_fabric_color');
        }
      }
      const created: FabricColorRow = {
        id: colorIdSeq++,
        fabric_id: fabricId,
        color_name: input.colorName,
        color_hex: input.colorHex,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
      };
      fabricColors.set(created.id, created);
      return { ...created };
    },

    async updateFabricColor(fabricId, colorId, patch: UpdateFabricColorDto) {
      const current = fabricColors.get(colorId);
      if (!current || current.fabric_id !== fabricId) return null;
      if (patch.colorName && patch.colorName !== current.color_name) {
        for (const existing of fabricColors.values()) {
          if (
            existing.id !== colorId &&
            existing.fabric_id === fabricId &&
            existing.color_name === patch.colorName
          ) {
            throw createPgUniqueError('uq_fabric_color');
          }
        }
      }
      const updated: FabricColorRow = {
        ...current,
        color_name: patch.colorName ?? current.color_name,
        color_hex: patch.colorHex ?? current.color_hex,
        sort_order: patch.sortOrder ?? current.sort_order,
        is_active: patch.isActive ?? current.is_active,
      };
      fabricColors.set(colorId, updated);
      return { ...updated };
    },

    async deactivateFabricColor(fabricId, colorId) {
      const current = fabricColors.get(colorId);
      if (!current || current.fabric_id !== fabricId) return null;
      const updated = { ...current, is_active: false };
      fabricColors.set(colorId, updated);
      return { ...updated };
    },

    async listSizes(includeInactive) {
      return [...sizes.values()]
        .filter((s) => includeInactive || s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
        .map((s) => ({ ...s }));
    },

    async findSizeById(id) {
      const row = sizes.get(id);
      return row ? { ...row } : null;
    },

    async createSize(input: CreateSizeDto) {
      for (const existing of sizes.values()) {
        if (existing.code === input.code) {
          throw createPgUniqueError('sizes_code_key');
        }
      }
      const created: SizeRow = {
        id: sizeIdSeq++,
        code: input.code,
        sort_order: input.sortOrder ?? 0,
        extra_charge: input.extraCharge ?? 0,
        is_active: input.isActive ?? true,
      };
      sizes.set(created.id, created);
      return { ...created };
    },

    async updateSize(id, patch: UpdateSizeDto) {
      const current = sizes.get(id);
      if (!current) return null;
      if (patch.code && patch.code !== current.code) {
        for (const existing of sizes.values()) {
          if (existing.id !== id && existing.code === patch.code) {
            throw createPgUniqueError('sizes_code_key');
          }
        }
      }
      const updated: SizeRow = {
        ...current,
        code: patch.code ?? current.code,
        sort_order: patch.sortOrder ?? current.sort_order,
        extra_charge: patch.extraCharge ?? current.extra_charge,
        is_active: patch.isActive ?? current.is_active,
      };
      sizes.set(id, updated);
      return { ...updated };
    },

    async deactivateSize(id) {
      const current = sizes.get(id);
      if (!current) return null;
      const updated = { ...current, is_active: false };
      sizes.set(id, updated);
      return { ...updated };
    },

    async listPrintSizes(includeInactive) {
      return [...printSizes.values()]
        .filter((p) => includeInactive || p.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
        .map((p) => ({ ...p }));
    },

    async findPrintSizeById(id) {
      const row = printSizes.get(id);
      return row ? { ...row } : null;
    },

    async createPrintSize(input: CreatePrintSizeDto) {
      for (const existing of printSizes.values()) {
        if (existing.code === input.code) {
          throw createPgUniqueError('print_sizes_code_key');
        }
      }
      const created: PrintSizeRow = {
        id: printSizeIdSeq++,
        code: input.code,
        name: input.name,
        dimensions_cm: input.dimensionsCm,
        width_cm: input.widthCm,
        height_cm: input.heightCm,
        price_per_spot: input.pricePerSpot,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
      };
      printSizes.set(created.id, created);
      return { ...created };
    },

    async updatePrintSize(id, patch: UpdatePrintSizeDto) {
      const current = printSizes.get(id);
      if (!current) return null;
      if (patch.code && patch.code !== current.code) {
        for (const existing of printSizes.values()) {
          if (existing.id !== id && existing.code === patch.code) {
            throw createPgUniqueError('print_sizes_code_key');
          }
        }
      }
      const updated: PrintSizeRow = {
        ...current,
        code: patch.code ?? current.code,
        name: patch.name ?? current.name,
        dimensions_cm: patch.dimensionsCm ?? current.dimensions_cm,
        width_cm: patch.widthCm ?? current.width_cm,
        height_cm: patch.heightCm ?? current.height_cm,
        price_per_spot: patch.pricePerSpot ?? current.price_per_spot,
        sort_order: patch.sortOrder ?? current.sort_order,
        is_active: patch.isActive ?? current.is_active,
      };
      printSizes.set(id, updated);
      return { ...updated };
    },

    async deactivatePrintSize(id) {
      const current = printSizes.get(id);
      if (!current) return null;
      const updated = { ...current, is_active: false };
      printSizes.set(id, updated);
      return { ...updated };
    },

    async listPaymentAccounts(includeInactive) {
      return [...paymentAccounts.values()]
        .filter((a) => includeInactive || a.is_active)
        .sort((a, b) => a.id - b.id)
        .map((a) => ({ ...a }));
    },

    async findPaymentAccountById(id) {
      const row = paymentAccounts.get(id);
      return row ? { ...row } : null;
    },

    async createPaymentAccount(input: CreatePaymentAccountDto) {
      const created: PaymentAccountRow = {
        id: accountIdSeq++,
        method: input.method,
        provider_name: input.providerName,
        account_number: input.accountNumber ?? null,
        account_holder: input.accountHolder,
        qr_image_path: input.qrImagePath ?? null,
        instructions: input.instructions ?? null,
        is_active: input.isActive ?? true,
        created_at: now(),
        updated_at: now(),
      };
      paymentAccounts.set(created.id, created);
      return { ...created };
    },

    async updatePaymentAccount(id, patch: UpdatePaymentAccountDto) {
      const current = paymentAccounts.get(id);
      if (!current) return null;
      const updated: PaymentAccountRow = {
        ...current,
        method: patch.method ?? current.method,
        provider_name: patch.providerName ?? current.provider_name,
        account_number:
          patch.accountNumber !== undefined ? patch.accountNumber : current.account_number,
        account_holder: patch.accountHolder ?? current.account_holder,
        qr_image_path: patch.qrImagePath !== undefined ? patch.qrImagePath : current.qr_image_path,
        instructions: patch.instructions !== undefined ? patch.instructions : current.instructions,
        is_active: patch.isActive ?? current.is_active,
        updated_at: now(),
      };
      paymentAccounts.set(id, updated);
      return { ...updated };
    },

    async deactivatePaymentAccount(id) {
      const current = paymentAccounts.get(id);
      if (!current) return null;
      const updated = { ...current, is_active: false, updated_at: now() };
      paymentAccounts.set(id, updated);
      return { ...updated };
    },

    async listSettings() {
      return [...settings.values()]
        .sort((a, b) => a.setting_key.localeCompare(b.setting_key))
        .map((s) => ({ ...s }));
    },

    async updateSettingsAtomically(buildUpdates) {
      // Simulasi transaksi atomik: validasi gagal tidak mengubah satu pun entri.
      const snapshotRows = [...settings.values()]
        .sort((a, b) => a.setting_key.localeCompare(b.setting_key))
        .map((s) => ({ ...s }));
      const updates = buildUpdates(snapshotRows);
      for (const item of updates) {
        const existing = settings.get(item.key);
        if (existing) {
          settings.set(item.key, {
            ...existing,
            setting_value: item.value,
            updated_at: now(),
          });
        }
      }
      return [...settings.values()]
        .sort((a, b) => a.setting_key.localeCompare(b.setting_key))
        .map((s) => ({ ...s }));
    },
  };

  return { repo, lockedOrderSnapshots };
}

function toImageBlob(buffer: Buffer, mimeType: string): Blob {
  return new Blob([Uint8Array.from(buffer)], { type: mimeType });
}

describe('Tahap 1a-2a — Master Data Admin, Upload Catalog, & Validasi Ketat', () => {
  const ADMIN_UUID = '11111111-1111-4111-8111-111111111111';
  const USER_UUID = '22222222-2222-4222-8222-222222222222';

  const authUsers = new Map<string, AuthDbUserRow>([
    [
      ADMIN_UUID,
      {
        id: 1,
        user_uuid: ADMIN_UUID,
        role: USER_ROLE.ADMIN,
        full_name: 'Owner YNG',
        email: 'owner@yngapparel.id',
        whatsapp: null,
        is_active: true,
        token_version: 0,
      },
    ],
    [
      USER_UUID,
      {
        id: 2,
        user_uuid: USER_UUID,
        role: USER_ROLE.USER,
        full_name: 'Customer Biasa',
        email: 'customer@gmail.com',
        whatsapp: '6281234567890',
        is_active: true,
        token_version: 0,
      },
    ],
  ]);

  let server: http.Server;
  let baseUrl: string;
  let adminCookie: string;
  let userCookie: string;
  let uploadedObjects: Map<string, { buffer: Buffer; contentType?: string }>;
  let removeMock: ReturnType<typeof vi.fn>;
  let lockedOrderSnapshots: ReturnType<typeof createInMemoryMasterRepo>['lockedOrderSnapshots'];

  beforeAll(async () => {
    const store = createInMemoryMasterRepo();
    lockedOrderSnapshots = store.lockedOrderSnapshots;
    uploadedObjects = new Map();

    removeMock = vi.fn(async (_bucket: string, paths: string | readonly string[]) => {
      const list = Array.isArray(paths) ? paths : [paths];
      for (const p of list) {
        uploadedObjects.delete(p);
      }
      return [];
    });

    const masterService = createAdminMasterService({
      masterRepo: store.repo,
      catalogStorage: {
        upload: async (_bucket, filePath, buffer, options) => {
          uploadedObjects.set(filePath, { buffer, contentType: options?.contentType });
          return { id: 'mock-id', path: filePath, fullPath: `catalog/${filePath}` };
        },
        remove: removeMock,
      },
      getPublicCatalogUrl: (filePath) =>
        filePath ? `https://cdn.example.com/storage/v1/object/public/catalog/${filePath}` : null,
    });

    const reqAuth = createRequireAuth(async (uuid) => authUsers.get(uuid) ?? null);
    const adminRouter = createAdminRouter({
      requireAuthMiddleware: reqAuth,
      masterService,
      imageUploadLimiter: (_req, _res, next) => next(),
    });

    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api', originCheck);
    app.use('/api/admin', adminRouter);
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    adminCookie = `${env.cookieName}=${signAuthToken({
      userUuid: ADMIN_UUID,
      role: USER_ROLE.ADMIN,
      tokenVersion: 0,
    })}`;
    userCookie = `${env.cookieName}=${signAuthToken({
      userUuid: USER_UUID,
      role: USER_ROLE.USER,
      tokenVersion: 0,
    })}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    removeMock.mockClear();
  });

  it('menjaga seluruh rute master data & upload hanya untuk ADMIN (Guest 401, USER 403)', async () => {
    expect((await fetch(`${baseUrl}/api/admin/models`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/admin/settings`)).status).toBe(401);

    expect(
      (
        await fetch(`${baseUrl}/api/admin/models`, {
          headers: { Cookie: userCookie },
        })
      ).status
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/admin/settings`, {
          method: 'PUT',
          headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dp_percent: 50 }),
        })
      ).status
    ).toBe(403);

    expect(
      (
        await fetch(`${baseUrl}/api/admin/models`, {
          headers: { Cookie: adminCookie },
        })
      ).status
    ).toBe(200);
  });

  it('POST /api/admin/uploads/image mempertahankan format asli, membuang EXIF, tidak mengecilkan qris <= 2000px, mengecilkan > 2000px, dan menolak file palsu', async () => {
    // 1. PNG asli -> folder models -> tetap PNG, mengembalikan path saja (tanpa URL)
    const pngInput = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .png()
      .toBuffer();
    const pngForm = new FormData();
    pngForm.append('folder', 'models');
    pngForm.append('image', toImageBlob(pngInput, 'image/png'), 'kaos.png');

    const pngRes = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: pngForm,
    });
    expect(pngRes.status).toBe(201);
    const pngJson = (await pngRes.json()) as {
      success: boolean;
      data: { path: string; mimeType: string; sizeBytes: number; url?: string };
    };
    expect(pngJson.data.path).toMatch(CATALOG_IMAGE_PATH_REGEX);
    expect(pngJson.data.path.startsWith('models/')).toBe(true);
    expect(pngJson.data.path.endsWith('.png')).toBe(true);
    expect(pngJson.data.mimeType).toBe('image/png');
    expect(pngJson.data.url).toBeUndefined();

    const storedPng = uploadedObjects.get(pngJson.data.path);
    expect(storedPng).toBeDefined();
    expect((await sharp(storedPng!.buffer).metadata()).format).toBe('png');

    // 2. JPEG dengan EXIF -> tetap JPEG dan EXIF terhapus
    const jpegWithExif = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 240, g: 240, b: 240 } },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'TestCam', Model: 'ModelX' } })
      .toBuffer();
    expect((await sharp(jpegWithExif).metadata()).exif).toBeDefined();

    const jpegForm = new FormData();
    jpegForm.append('folder', 'fabrics');
    jpegForm.append('image', toImageBlob(jpegWithExif, 'image/jpeg'), 'bahan.jpg');
    const jpegRes = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: jpegForm,
    });
    expect(jpegRes.status).toBe(201);
    const jpegJson = (await jpegRes.json()) as { data: { path: string; mimeType: string } };
    expect(jpegJson.data.path.endsWith('.jpg')).toBe(true);
    expect(jpegJson.data.mimeType).toBe('image/jpeg');

    const storedJpegMeta = await sharp(uploadedObjects.get(jpegJson.data.path)!.buffer).metadata();
    expect(storedJpegMeta.format).toBe('jpeg');
    expect(storedJpegMeta.exif).toBeUndefined();

    // 3. WebP 1200x1200 di folder qris -> tetap WebP dan TIDAK diperkecil
    const webpQris = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .webp()
      .toBuffer();
    const qrisForm = new FormData();
    qrisForm.append('folder', 'qris');
    qrisForm.append('image', toImageBlob(webpQris, 'image/webp'), 'qris.webp');
    const qrisRes = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: qrisForm,
    });
    expect(qrisRes.status).toBe(201);
    const qrisJson = (await qrisRes.json()) as { data: { path: string; mimeType: string } };
    expect(qrisJson.data.path.startsWith('qris/')).toBe(true);
    expect(qrisJson.data.path.endsWith('.webp')).toBe(true);
    const storedQrisMeta = await sharp(uploadedObjects.get(qrisJson.data.path)!.buffer).metadata();
    expect(storedQrisMeta.format).toBe('webp');
    expect(storedQrisMeta.width).toBe(1200);
    expect(storedQrisMeta.height).toBe(1200);

    // 4. PNG > 2000px di folder qris -> diperkecil proporsional maks 2000px
    const largeQrisPng = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const largeForm = new FormData();
    largeForm.append('folder', 'qris');
    largeForm.append('image', toImageBlob(largeQrisPng, 'image/png'), 'big.png');
    const largeRes = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: largeForm,
    });
    expect(largeRes.status).toBe(201);
    const largeJson = (await largeRes.json()) as { data: { path: string } };
    const largeMeta = await sharp(uploadedObjects.get(largeJson.data.path)!.buffer).metadata();
    expect(largeMeta.format).toBe('png');
    expect(largeMeta.width).toBe(2000);
    expect(largeMeta.height).toBe(1000);

    // 5. File ekstensi .png palsu (magic bytes teks) -> 400
    const fakeForm = new FormData();
    fakeForm.append('folder', 'models');
    fakeForm.append(
      'image',
      toImageBlob(Buffer.from('bukan gambar sama sekali'), 'image/png'),
      'palsu.png'
    );
    expect(
      (
        await fetch(`${baseUrl}/api/admin/uploads/image`, {
          method: 'POST',
          headers: { Cookie: adminCookie },
          body: fakeForm,
        })
      ).status
    ).toBe(400);

    // 6. Ukuran > 5 MB -> 400
    const tooBigForm = new FormData();
    tooBigForm.append('folder', 'models');
    tooBigForm.append(
      'image',
      toImageBlob(Buffer.alloc(5 * 1024 * 1024 + 10), 'image/png'),
      'oversize.png'
    );
    expect(
      (
        await fetch(`${baseUrl}/api/admin/uploads/image`, {
          method: 'POST',
          headers: { Cookie: adminCookie },
          body: tooBigForm,
        })
      ).status
    ).toBe(400);

    // 7. Folder invalid -> 400
    const badFolderForm = new FormData();
    badFolderForm.append('folder', '../etc');
    badFolderForm.append('image', toImageBlob(pngInput, 'image/png'), 'ok.png');
    expect(
      (
        await fetch(`${baseUrl}/api/admin/uploads/image`, {
          method: 'POST',
          headers: { Cookie: adminCookie },
          body: badFolderForm,
        })
      ).status
    ).toBe(400);
  });

  it('CRUD Model Pakaian + relasi bahan + validasi strict/path + cleanup gambar lama saat PUT', async () => {
    const oldModelPath = 'models/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
    const newModelPath = 'models/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png';
    uploadedObjects.set(oldModelPath, { buffer: Buffer.from('old'), contentType: 'image/png' });
    uploadedObjects.set(newModelPath, { buffer: Buffer.from('new'), contentType: 'image/png' });

    // Validasi ketat: field asing, harga desimal, path folder salah, dan URL ditolak 400
    expect(
      (
        await fetch(`${baseUrl}/api/admin/models`, {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'kaos-test',
            name: 'Kaos Test',
            basePrice: 65000,
            extraAsing: true,
          }),
        })
      ).status
    ).toBe(400);

    expect(
      (
        await fetch(`${baseUrl}/api/admin/models`, {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'kaos-test',
            name: 'Kaos Test',
            basePrice: 65000.5,
          }),
        })
      ).status
    ).toBe(400);

    expect(
      (
        await fetch(`${baseUrl}/api/admin/models`, {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'kaos-test',
            name: 'Kaos Test',
            basePrice: 65000,
            imagePath: 'qris/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
          }),
        })
      ).status
    ).toBe(400);

    expect(
      (
        await fetch(`${baseUrl}/api/admin/models`, {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'kaos-test',
            name: 'Kaos Test',
            basePrice: 65000,
            imagePath: 'https://cdn.example.com/kaos.png',
          }),
        })
      ).status
    ).toBe(400);

    // Create model sukses (imagePath + imageUrl turunan)
    const createRes = await fetch(`${baseUrl}/api/admin/models`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'kaos-pendek',
        name: 'Kaos Lengan Pendek',
        basePrice: 65000,
        imagePath: oldModelPath,
      }),
    });
    expect(createRes.status).toBe(201);
    const createdModel = ((await createRes.json()) as { data: { id: number; imageUrl: string } })
      .data;
    expect(createdModel.imageUrl).toBe(
      `https://cdn.example.com/storage/v1/object/public/catalog/${oldModelPath}`
    );

    // Duplikat slug -> 409
    expect(
      (
        await fetch(`${baseUrl}/api/admin/models`, {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'kaos-pendek',
            name: 'Kaos Duplikat',
            basePrice: 70000,
          }),
        })
      ).status
    ).toBe(409);

    // Parameter :id invalid -> 400
    expect(
      (
        await fetch(`${baseUrl}/api/admin/models/0`, {
          method: 'DELETE',
          headers: { Cookie: adminCookie },
        })
      ).status
    ).toBe(400);

    // PUT ganti imagePath + naikkan harga -> objek lama terhapus best-effort & snapshot order lama utuh
    const putRes = await fetch(`${baseUrl}/api/admin/models/${createdModel.id}`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        basePrice: 80000,
        imagePath: newModelPath,
      }),
    });
    expect(putRes.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith('catalog', [oldModelPath]);
    expect(uploadedObjects.has(oldModelPath)).toBe(false);
    expect(uploadedObjects.has(newModelPath)).toBe(true);
    expect(lockedOrderSnapshots[0]?.lockedBasePrice).toBe(65000);

    // Kegagalan storage.remove saat PUT tidak menggagalkan pembaruan DB
    const thirdModelPath = 'models/cccccccccccccccccccccccccccccccc.png';
    removeMock.mockRejectedValueOnce(new Error('Storage temporary error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const putRes2 = await fetch(`${baseUrl}/api/admin/models/${createdModel.id}`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagePath: thirdModelPath }),
    });
    warnSpy.mockRestore();
    expect(putRes2.status).toBe(200);

    // Soft delete idempoten & filter includeInactive
    const del1 = await fetch(`${baseUrl}/api/admin/models/${createdModel.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    expect(del1.status).toBe(200);
    expect(((await del1.json()) as { data: { isActive: boolean } }).data.isActive).toBe(false);

    const del2 = await fetch(`${baseUrl}/api/admin/models/${createdModel.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    expect(del2.status).toBe(200);

    const activeList = (await (
      await fetch(`${baseUrl}/api/admin/models`, { headers: { Cookie: adminCookie } })
    ).json()) as { data: unknown[] };
    expect(activeList.data).toHaveLength(0);

    const allList = (await (
      await fetch(`${baseUrl}/api/admin/models?includeInactive=true`, {
        headers: { Cookie: adminCookie },
      })
    ).json()) as { data: unknown[] };
    expect(allList.data).toHaveLength(1);

    // Re-aktivasi lewat PUT
    const reactivateRes = await fetch(`${baseUrl}/api/admin/models/${createdModel.id}`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    });
    expect(reactivateRes.status).toBe(200);
    expect(((await reactivateRes.json()) as { data: { isActive: boolean } }).data.isActive).toBe(
      true
    );

    // Relasi model_fabrics: fabricIds yang tidak ada ditolak 400
    expect(
      (
        await fetch(`${baseUrl}/api/admin/models/${createdModel.id}/fabrics`, {
          method: 'PUT',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fabricIds: [999] }),
        })
      ).status
    ).toBe(400);
  });

  it('CRUD Bahan, Preset Warna, Ukuran, Ukuran Sablon & relasi model_fabrics', async () => {
    const oldFabricImg = 'fabrics/11111111111111111111111111111111.jpg';
    const oldMacroImg = 'fabrics/22222222222222222222222222222222.jpg';
    const newMacroImg = 'fabrics/33333333333333333333333333333333.jpg';
    uploadedObjects.set(oldFabricImg, { buffer: Buffer.from('f1') });
    uploadedObjects.set(oldMacroImg, { buffer: Buffer.from('m1') });

    const fabricRes = await fetch(`${baseUrl}/api/admin/fabrics`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'cc30s',
        name: 'Cotton Combed 30s',
        gsmWeight: 150,
        thicknessLevel: 2,
        comfortLevel: 5,
        additionalPrice: 0,
        imagePath: oldFabricImg,
        macroImagePath: oldMacroImg,
      }),
    });
    expect(fabricRes.status).toBe(201);
    const fabricData = ((await fabricRes.json()) as { data: { id: number; code: string } }).data;
    expect(fabricData.code).toBe('CC30S');

    // Ganti macroImagePath memicu cleanup oldMacroImg
    const putFabricRes = await fetch(`${baseUrl}/api/admin/fabrics/${fabricData.id}`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        additionalPrice: 15000,
        macroImagePath: newMacroImg,
      }),
    });
    expect(putFabricRes.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith('catalog', [oldMacroImg]);
    expect(lockedOrderSnapshots[0]?.lockedFabricPrice).toBe(10000);

    // Hubungkan ke model id 1 (dari test sebelumnya)
    const linkRes = await fetch(`${baseUrl}/api/admin/models/1/fabrics`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fabricIds: [fabricData.id] }),
    });
    expect(linkRes.status).toBe(200);
    expect(((await linkRes.json()) as { data: { fabricIds: number[] } }).data.fabricIds).toEqual([
      fabricData.id,
    ]);

    // Preset warna hex invalid -> 400
    expect(
      (
        await fetch(`${baseUrl}/api/admin/fabrics/${fabricData.id}/colors`, {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ colorName: 'Salah', colorHex: '111111' }),
        })
      ).status
    ).toBe(400);

    const colorRes = await fetch(`${baseUrl}/api/admin/fabrics/${fabricData.id}/colors`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ colorName: 'Hitam Pekat', colorHex: '#09090b' }),
    });
    expect(colorRes.status).toBe(201);
    const colorData = ((await colorRes.json()) as { data: { id: number; colorHex: string } }).data;
    expect(colorData.colorHex).toBe('#09090B');

    // Duplikat warna dalam bahan yang sama -> 409
    expect(
      (
        await fetch(`${baseUrl}/api/admin/fabrics/${fabricData.id}/colors`, {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ colorName: 'Hitam Pekat', colorHex: '#111111' }),
        })
      ).status
    ).toBe(409);

    // Soft delete warna
    const delColorRes = await fetch(
      `${baseUrl}/api/admin/fabrics/${fabricData.id}/colors/${colorData.id}`,
      { method: 'DELETE', headers: { Cookie: adminCookie } }
    );
    expect(delColorRes.status).toBe(200);

    // Ukuran & Ukuran sablon
    const sizeRes = await fetch(`${baseUrl}/api/admin/sizes`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'xxl', sortOrder: 5, extraCharge: 10000 }),
    });
    expect(sizeRes.status).toBe(201);
    const sizeData = ((await sizeRes.json()) as { data: { id: number } }).data;

    await fetch(`${baseUrl}/api/admin/sizes/${sizeData.id}`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ extraCharge: 20000 }),
    });
    expect(lockedOrderSnapshots[0]?.lockedExtraCharge).toBe(10000);

    const printRes = await fetch(`${baseUrl}/api/admin/print-sizes`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'a4',
        name: 'A4',
        dimensionsCm: '21 x 29.7',
        widthCm: 21,
        heightCm: 29.7,
        pricePerSpot: 25000,
      }),
    });
    expect(printRes.status).toBe(201);
    const printData = ((await printRes.json()) as { data: { id: number } }).data;

    await fetch(`${baseUrl}/api/admin/print-sizes/${printData.id}`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricePerSpot: 40000 }),
    });
    expect(lockedOrderSnapshots[0]?.lockedSpotPrice).toBe(25000);
  });

  it('CRUD Rekening Pembayaran & QRIS menjaga validasi, cleanup QRIS lama, dan tidak mencatat data rekening di log', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      // BANK_TRANSFER tanpa nomor rekening -> 400
      expect(
        (
          await fetch(`${baseUrl}/api/admin/payment-accounts`, {
            method: 'POST',
            headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: PAYMENT_METHOD.BANK_TRANSFER,
              providerName: 'BCA',
              accountHolder: 'YNG Apparel',
            }),
          })
        ).status
      ).toBe(400);

      // qrImagePath dengan folder salah (models/) -> 400
      expect(
        (
          await fetch(`${baseUrl}/api/admin/payment-accounts`, {
            method: 'POST',
            headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: PAYMENT_METHOD.QRIS,
              providerName: 'QRIS YNG',
              accountHolder: 'YNG Apparel',
              qrImagePath: 'models/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
            }),
          })
        ).status
      ).toBe(400);

      const oldQr = 'qris/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
      const newQr = 'qris/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png';
      uploadedObjects.set(oldQr, { buffer: Buffer.from('qr-old') });

      const qrisRes = await fetch(`${baseUrl}/api/admin/payment-accounts`, {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: PAYMENT_METHOD.QRIS,
          providerName: 'QRIS Resmi',
          accountHolder: 'YNG Apparel',
          qrImagePath: oldQr,
        }),
      });
      expect(qrisRes.status).toBe(201);
      const qrisData = ((await qrisRes.json()) as { data: { id: number; qrImageUrl: string } })
        .data;
      expect(qrisData.qrImageUrl).toBe(
        `https://cdn.example.com/storage/v1/object/public/catalog/${oldQr}`
      );

      // Ganti QRIS lama (simulasi storage.remove gagal) -> 200 dan tetap tidak membocorkan path/rekening
      removeMock.mockRejectedValueOnce(new Error('network error'));
      const bankRes = await fetch(`${baseUrl}/api/admin/payment-accounts`, {
        method: 'POST',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: PAYMENT_METHOD.BANK_TRANSFER,
          providerName: 'BCA',
          accountNumber: '987654321098',
          accountHolder: 'YNG Rahasia',
        }),
      });
      expect(bankRes.status).toBe(201);

      const putQrisRes = await fetch(`${baseUrl}/api/admin/payment-accounts/${qrisData.id}`, {
        method: 'PUT',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrImagePath: newQr }),
      });
      expect(putQrisRes.status).toBe(200);

      const allLogs = [
        ...logSpy.mock.calls.flat(),
        ...warnSpy.mock.calls.flat(),
        ...errorSpy.mock.calls.flat(),
      ]
        .map(String)
        .join(' ');
      expect(allLogs).not.toContain('987654321098');
      expect(allLogs).not.toContain('YNG Rahasia');
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('GET & PUT /api/admin/settings melakukan partial update atomik dengan validasi lintas kolom terhadap nilai gabungan', async () => {
    const initialRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { Cookie: adminCookie },
    });
    expect(initialRes.status).toBe(200);
    const initialJson = (await initialRes.json()) as {
      data: { settings: { dpi_ok_min: number; dpi_warn_min: number } };
    };
    expect(initialJson.data.settings.dpi_ok_min).toBe(150);
    expect(initialJson.data.settings.dpi_warn_min).toBe(100);

    // Kunci asing ditolak 400 (.strict())
    expect(
      (
        await fetch(`${baseUrl}/api/admin/settings`, {
          method: 'PUT',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ unknown_key: 'abc' }),
        })
      ).status
    ).toBe(400);

    // Validasi lintas kolom gabungan: kirim dpi_warn_min: 160 saat dpi_ok_min di DB = 150 -> ditolak 400
    // dan nilai dp_percent dalam payload yang sama tidak ikut tersimpan (atomik).
    const invalidCrossRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dp_percent: 55,
        dpi_warn_min: 160,
      }),
    });
    expect(invalidCrossRes.status).toBe(400);

    const afterRollbackJson = (await (
      await fetch(`${baseUrl}/api/admin/settings`, { headers: { Cookie: adminCookie } })
    ).json()) as { data: { settings: { dp_percent: number; dpi_warn_min: number } } };
    expect(afterRollbackJson.data.settings.dp_percent).toBe(70);
    expect(afterRollbackJson.data.settings.dpi_warn_min).toBe(100);

    // Partial update valid + normalisasi admin_whatsapp
    const updateOkRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_whatsapp: '0812-1111-2222',
        dp_percent: 60,
        dpi_ok_min: 180,
      }),
    });
    expect(updateOkRes.status).toBe(200);
    const updatedJson = (await updateOkRes.json()) as {
      data: { settings: { admin_whatsapp: string; dp_percent: number; dpi_ok_min: number } };
    };
    expect(updatedJson.data.settings.admin_whatsapp).toBe('6281211112222');
    expect(updatedJson.data.settings.dp_percent).toBe(60);
    expect(updatedJson.data.settings.dpi_ok_min).toBe(180);
  });
});
