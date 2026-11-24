import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  PAYMENT_METHOD,
  PAYMENT_SCHEME,
  PRINT_POSITION,
  type AppSettingKey,
  type PricingQuoteResponseDto,
  type PublicCatalogConfigDto,
  type PublicFabricDto,
  type PublicGarmentModelDto,
  type PublicModelDetailDto,
  type PublicPaymentAccountDto,
  type PublicPrintSizeDto,
  type PublicSizeDto,
} from '@yng/shared';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PUBLIC_CATALOG_SETTING_KEYS,
  type CatalogRepository,
  type PricingLookupIds,
  type PricingReferenceData,
} from '../src/models/catalogModel.js';
import type {
  AppSettingRow,
  FabricColorRow,
  FabricRow,
  GarmentModelRow,
  PaymentAccountRow,
  PrintSizeRow,
  SizeRow,
} from '../src/models/masterModel.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { errorHandler, notFoundHandler } = await import('../src/middleware/errorHandler.js');
const { createPublicRouter } = await import('../src/routes/publicRoutes.js');
const { createCatalogService } = await import('../src/services/catalogService.js');
const { calculateQuoteFromReferenceData, createPricingService, resolveInitialPaymentRequirement } =
  await import('../src/services/pricingService.js');

const STORAGE_PUBLIC_BASE = 'https://cdn.example.test/storage/v1/object/public/catalog';

function createInMemoryCatalogStore() {
  const now = '2026-11-20T10:00:00.000Z';

  const models: GarmentModelRow[] = [
    {
      id: 2,
      slug: 'hoodie',
      name: 'Hoodie',
      description: 'Hoodie fleece tebal',
      base_price: 160000,
      image_path: null,
      mockup_template: 'hoodie',
      sort_order: 2,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 1,
      slug: 'kaos-lengan-pendek',
      name: 'Kaos Lengan Pendek',
      description: 'Kaos harian custom',
      base_price: 65000,
      image_path: 'models/11111111111111111111111111111111.jpg',
      mockup_template: 'tee-short',
      sort_order: 1,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      slug: 'jaket-arsip',
      name: 'Jaket Nonaktif',
      description: 'Model arsip',
      base_price: 200000,
      image_path: 'models/33333333333333333333333333333333.jpg',
      mockup_template: 'jacket-zip',
      sort_order: 3,
      is_active: false,
      created_at: now,
      updated_at: now,
    },
  ];

  const fabrics: FabricRow[] = [
    {
      id: 1,
      code: 'CC30S',
      name: 'Cotton Combed 30s',
      description: 'Adem dan ringan',
      gsm_weight: 150,
      thickness_level: 2,
      comfort_level: 5,
      additional_price: 0,
      image_path: 'fabrics/aaaa1111111111111111111111111111.png',
      macro_image_path: 'fabrics/bbbb1111111111111111111111111111.webp',
      sort_order: 1,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      code: 'CF280',
      name: 'Cotton Fleece 280',
      description: 'Fleece lembut',
      gsm_weight: 280,
      thickness_level: 5,
      comfort_level: 5,
      additional_price: 15000,
      image_path: null,
      macro_image_path: null,
      sort_order: 2,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      code: 'OLD_FAB',
      name: 'Bahan Nonaktif',
      description: 'Tidak diproduksi lagi',
      gsm_weight: 190,
      thickness_level: 3,
      comfort_level: 3,
      additional_price: 5000,
      image_path: null,
      macro_image_path: null,
      sort_order: 3,
      is_active: false,
      created_at: now,
      updated_at: now,
    },
  ];

  const modelFabrics: Array<{ model_id: number; fabric_id: number }> = [
    { model_id: 1, fabric_id: 1 },
    { model_id: 1, fabric_id: 3 }, // bahan nonaktif terpasang ke model aktif -> harus tersaring di publik
    { model_id: 2, fabric_id: 2 },
    { model_id: 3, fabric_id: 1 },
  ];

  const fabricColors: FabricColorRow[] = [
    {
      id: 1,
      fabric_id: 1,
      color_name: 'Hitam',
      color_hex: '#111111',
      sort_order: 1,
      is_active: true,
    },
    {
      id: 2,
      fabric_id: 1,
      color_name: 'Putih',
      color_hex: '#FFFFFF',
      sort_order: 2,
      is_active: true,
    },
    {
      id: 3,
      fabric_id: 1,
      color_name: 'Merah Lama',
      color_hex: '#AA0000',
      sort_order: 3,
      is_active: false,
    },
    {
      id: 4,
      fabric_id: 2,
      color_name: 'Abu Misty',
      color_hex: '#9CA3AF',
      sort_order: 1,
      is_active: true,
    },
    {
      id: 5,
      fabric_id: 3,
      color_name: 'Biru Tua',
      color_hex: '#001144',
      sort_order: 1,
      is_active: true,
    },
  ];

  const sizes: SizeRow[] = [
    { id: 1, code: 'S', sort_order: 1, extra_charge: 0, is_active: true },
    { id: 2, code: 'M', sort_order: 2, extra_charge: 0, is_active: true },
    { id: 3, code: 'L', sort_order: 3, extra_charge: 0, is_active: true },
    { id: 4, code: 'XXL', sort_order: 4, extra_charge: 10000, is_active: true },
    { id: 5, code: 'XXXL', sort_order: 5, extra_charge: 20000, is_active: false },
  ];

  const printSizes: PrintSizeRow[] = [
    {
      id: 1,
      code: 'LOGO',
      name: 'Logo',
      dimensions_cm: '10 x 10',
      width_cm: 10,
      height_cm: 10,
      price_per_spot: 10000,
      sort_order: 1,
      is_active: true,
    },
    {
      id: 2,
      code: 'A4',
      name: 'A4',
      dimensions_cm: '21 x 29.7',
      width_cm: 21,
      height_cm: 29.7,
      price_per_spot: 25000,
      sort_order: 2,
      is_active: true,
    },
    {
      id: 3,
      code: 'A3',
      name: 'A3',
      dimensions_cm: '29.7 x 42',
      width_cm: 29.7,
      height_cm: 42,
      price_per_spot: 35000,
      sort_order: 3,
      is_active: true,
    },
    {
      id: 4,
      code: 'BANNER',
      name: 'Banner Nonaktif',
      dimensions_cm: '40 x 50',
      width_cm: 40,
      height_cm: 50,
      price_per_spot: 50000,
      sort_order: 4,
      is_active: false,
    },
  ];

  const paymentAccounts: PaymentAccountRow[] = [
    {
      id: 1,
      method: PAYMENT_METHOD.QRIS,
      provider_name: 'QRIS YNG Apparel',
      account_number: null,
      account_holder: 'YNG Apparel',
      qr_image_path: 'qris/cccc1111111111111111111111111111.png',
      instructions: 'Scan QRIS, bayar sesuai nominal.',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      method: PAYMENT_METHOD.BANK_TRANSFER,
      provider_name: 'BCA',
      account_number: '1234567890',
      account_holder: 'YNG Apparel',
      qr_image_path: null,
      instructions: 'Transfer sesuai nominal.',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      method: PAYMENT_METHOD.BANK_TRANSFER,
      provider_name: 'Mandiri Arsip',
      account_number: '9999999999',
      account_holder: 'YNG Apparel',
      qr_image_path: null,
      instructions: 'Nonaktif',
      is_active: false,
      created_at: now,
      updated_at: now,
    },
  ];

  const settings = new Map<AppSettingKey, string>([
    ['store_name', 'YNG Apparel'],
    ['admin_whatsapp', '6281234567890'],
    ['dp_percent', '70'],
    ['dp_min_qty', '12'],
    ['initial_payment_due_hours', '24'],
    ['auto_complete_days', '7'],
    ['dpi_ok_min', '150'],
    ['dpi_warn_min', '100'],
    ['max_design_file_mb', '20'],
    ['signed_url_expiry_seconds', '3600'],
    ['temp_upload_ttl_hours', '24'],
    ['production_estimate_text', '7-14 hari kerja'],
  ]);

  const setSetting = (key: AppSettingKey, value: string) => {
    settings.set(key, value);
  };

  const catalogRepo: CatalogRepository = {
    async listActiveModels() {
      const activeModels = models
        .filter((m) => m.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const activeFabricSet = new Set(fabrics.filter((f) => f.is_active).map((f) => f.id));
      const fabricById = new Map(fabrics.map((f) => [f.id, f]));
      const fabricIdsByModel = new Map<number, number[]>();

      for (const m of activeModels) {
        const linked = modelFabrics
          .filter((rel) => rel.model_id === m.id && activeFabricSet.has(rel.fabric_id))
          .map((rel) => rel.fabric_id)
          .sort((a, b) => {
            const fa = fabricById.get(a);
            const fb = fabricById.get(b);
            return (fa?.sort_order ?? 0) - (fb?.sort_order ?? 0) || a - b;
          });
        fabricIdsByModel.set(m.id, linked);
      }

      return { models: activeModels, fabricIdsByModel };
    },

    async findActiveModelDetailBySlug(slug: string) {
      const model = models.find((m) => m.slug === slug && m.is_active);
      if (!model) return null;

      const linkedIds = new Set(
        modelFabrics.filter((rel) => rel.model_id === model.id).map((rel) => rel.fabric_id)
      );
      const activeFabrics = fabrics
        .filter((f) => f.is_active && linkedIds.has(f.id))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

      const colorsByFabric = new Map<number, FabricColorRow[]>();
      for (const f of activeFabrics) {
        colorsByFabric.set(
          f.id,
          fabricColors
            .filter((c) => c.fabric_id === f.id && c.is_active)
            .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
        );
      }

      return { model, fabrics: activeFabrics, colorsByFabric };
    },

    async listActiveFabrics() {
      const activeFabrics = fabrics
        .filter((f) => f.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const colorsByFabric = new Map<number, FabricColorRow[]>();
      for (const f of activeFabrics) {
        colorsByFabric.set(
          f.id,
          fabricColors
            .filter((c) => c.fabric_id === f.id && c.is_active)
            .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
        );
      }
      return { fabrics: activeFabrics, colorsByFabric };
    },

    async listActiveSizes() {
      return sizes
        .filter((s) => s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    },

    async listActivePrintSizes() {
      return printSizes
        .filter((p) => p.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    },

    async listPublicSettings() {
      const rows: AppSettingRow[] = [];
      for (const key of PUBLIC_CATALOG_SETTING_KEYS) {
        const val = settings.get(key);
        if (val !== undefined) {
          rows.push({
            setting_key: key,
            setting_value: val,
            description: null,
            updated_at: now,
          });
        }
      }
      return rows;
    },

    async listActivePaymentAccounts() {
      return paymentAccounts.filter((p) => p.is_active).sort((a, b) => a.id - b.id);
    },

    async loadPricingReferenceData(lookup: PricingLookupIds): Promise<PricingReferenceData> {
      const modelsById = new Map<number, GarmentModelRow>();
      for (const m of models) {
        if (lookup.modelIds.includes(m.id)) modelsById.set(m.id, m);
      }

      const fabricsById = new Map<number, FabricRow>();
      for (const f of fabrics) {
        if (lookup.fabricIds.includes(f.id)) fabricsById.set(f.id, f);
      }

      const compatibleModelFabrics = new Set<string>();
      for (const rel of modelFabrics) {
        if (lookup.modelIds.includes(rel.model_id) && lookup.fabricIds.includes(rel.fabric_id)) {
          compatibleModelFabrics.add(`${rel.model_id}:${rel.fabric_id}`);
        }
      }

      const fabricColorsById = new Map<number, FabricColorRow>();
      for (const c of fabricColors) {
        if (lookup.fabricColorIds.includes(c.id)) fabricColorsById.set(c.id, c);
      }

      const sizesById = new Map<number, SizeRow>();
      for (const s of sizes) {
        if (lookup.sizeIds.includes(s.id)) sizesById.set(s.id, s);
      }

      const printSizesById = new Map<number, PrintSizeRow>();
      for (const p of printSizes) {
        if (lookup.printSizeIds.includes(p.id)) printSizesById.set(p.id, p);
      }

      return {
        modelsById,
        fabricsById,
        compatibleModelFabrics,
        fabricColorsById,
        sizesById,
        printSizesById,
        dpPercent: Number.parseInt(settings.get('dp_percent') ?? '70', 10),
        dpMinQty: Number.parseInt(settings.get('dp_min_qty') ?? '12', 10),
      };
    },
  };

  return { catalogRepo, setSetting };
}

describe('Tahap 2a — Endpoint Katalog Publik, Pricing Engine, & Validasi', () => {
  let server: http.Server;
  let baseUrl: string;
  let store: ReturnType<typeof createInMemoryCatalogStore>;
  let pricingSvc: ReturnType<typeof createPricingService>;

  beforeAll(async () => {
    store = createInMemoryCatalogStore();
    const catalogSvc = createCatalogService({
      catalogRepo: store.catalogRepo,
      getPublicCatalogUrl: (filePath) => (filePath ? `${STORAGE_PUBLIC_BASE}/${filePath}` : null),
    });
    pricingSvc = createPricingService({ catalogRepo: store.catalogRepo });

    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      createPublicRouter({
        catalogService: catalogSvc,
        pricingService: pricingSvc,
      })
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    store.setSetting('dp_percent', '70');
    store.setSetting('dp_min_qty', '12');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('endpoint katalog publik hanya mengembalikan data aktif, tanpa kolom internal, dengan URL publik & tipe number', async () => {
    // 1. GET /api/catalog/models
    const modelsRes = await fetch(`${baseUrl}/api/catalog/models`);
    expect(modelsRes.status).toBe(200);
    const modelsBody = (await modelsRes.json()) as { data: PublicGarmentModelDto[] };
    expect(modelsBody.data).toHaveLength(2);
    expect(modelsBody.data.map((m) => m.slug)).toEqual(['kaos-lengan-pendek', 'hoodie']);
    const tee = modelsBody.data[0]!;
    expect(typeof tee.basePrice).toBe('number');
    expect(Number.isInteger(tee.basePrice)).toBe(true);
    expect(tee.basePrice).toBe(65000);
    expect(tee.imageUrl).toBe(`${STORAGE_PUBLIC_BASE}/models/11111111111111111111111111111111.jpg`);
    expect(tee.fabricIds).toEqual([1]); // bahan nonaktif id=3 tersaring
    expect(tee).not.toHaveProperty('imagePath');
    expect(tee).not.toHaveProperty('isActive');
    expect(tee).not.toHaveProperty('createdAt');
    expect(tee).not.toHaveProperty('updatedAt');

    // 2. GET /api/catalog/models/:slug (aktif vs nonaktif vs tidak ada)
    const detailRes = await fetch(`${baseUrl}/api/catalog/models/kaos-lengan-pendek`);
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as { data: PublicModelDetailDto };
    expect(detailBody.data.fabrics).toHaveLength(1);
    expect(detailBody.data.fabrics[0]?.code).toBe('CC30S');
    expect(detailBody.data.fabrics[0]?.colors.map((c) => c.colorName)).toEqual(['Hitam', 'Putih']);

    expect((await fetch(`${baseUrl}/api/catalog/models/jaket-arsip`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/catalog/models/tidak-ada`)).status).toBe(404);

    // 3. GET /api/catalog/fabrics
    const fabricsRes = await fetch(`${baseUrl}/api/catalog/fabrics`);
    expect(fabricsRes.status).toBe(200);
    const fabricsBody = (await fabricsRes.json()) as { data: PublicFabricDto[] };
    expect(fabricsBody.data.map((f) => f.code)).toEqual(['CC30S', 'CF280']);
    const cc30s = fabricsBody.data[0]!;
    expect(typeof cc30s.additionalPrice).toBe('number');
    expect(cc30s.imageUrl).toBe(
      `${STORAGE_PUBLIC_BASE}/fabrics/aaaa1111111111111111111111111111.png`
    );
    expect(cc30s.macroImageUrl).toBe(
      `${STORAGE_PUBLIC_BASE}/fabrics/bbbb1111111111111111111111111111.webp`
    );
    expect(cc30s.colors.map((c) => c.id)).toEqual([1, 2]);
    expect(cc30s).not.toHaveProperty('imagePath');
    expect(cc30s).not.toHaveProperty('macroImagePath');
    expect(cc30s).not.toHaveProperty('isActive');

    // 4. GET /api/catalog/sizes
    const sizesRes = await fetch(`${baseUrl}/api/catalog/sizes`);
    expect(sizesRes.status).toBe(200);
    const sizesBody = (await sizesRes.json()) as { data: PublicSizeDto[] };
    expect(sizesBody.data.map((s) => s.code)).toEqual(['S', 'M', 'L', 'XXL']);
    expect(typeof sizesBody.data[3]?.extraCharge).toBe('number');
    expect(sizesBody.data[3]?.extraCharge).toBe(10000);
    expect(sizesBody.data[0]).not.toHaveProperty('isActive');

    // 5. GET /api/catalog/print-sizes
    const printSizesRes = await fetch(`${baseUrl}/api/catalog/print-sizes`);
    expect(printSizesRes.status).toBe(200);
    const printSizesBody = (await printSizesRes.json()) as { data: PublicPrintSizeDto[] };
    expect(printSizesBody.data.map((p) => p.code)).toEqual(['LOGO', 'A4', 'A3']);
    expect(typeof printSizesBody.data[1]?.pricePerSpot).toBe('number');
    expect(printSizesBody.data[1]?.pricePerSpot).toBe(25000);
    expect(printSizesBody.data[1]).not.toHaveProperty('isActive');

    // 6. GET /api/catalog/config
    const configRes = await fetch(`${baseUrl}/api/catalog/config`);
    expect(configRes.status).toBe(200);
    const configBody = (await configRes.json()) as { data: PublicCatalogConfigDto };
    expect(configBody.data).toEqual({
      storeName: 'YNG Apparel',
      adminWhatsapp: '6281234567890',
      dpPercent: 70,
      dpMinQty: 12,
      productionEstimateText: '7-14 hari kerja',
      maxDesignFileMb: 20,
    });
    expect(typeof configBody.data.dpPercent).toBe('number');
    expect(typeof configBody.data.dpMinQty).toBe('number');
    expect(typeof configBody.data.maxDesignFileMb).toBe('number');
    expect(configBody.data).not.toHaveProperty('signed_url_expiry_seconds');
    expect(configBody.data).not.toHaveProperty('dpi_ok_min');

    // 7. GET /api/payment-accounts
    const payRes = await fetch(`${baseUrl}/api/payment-accounts`);
    expect(payRes.status).toBe(200);
    const payBody = (await payRes.json()) as { data: PublicPaymentAccountDto[] };
    expect(payBody.data).toHaveLength(2);
    expect(payBody.data[0]?.qrImageUrl).toBe(
      `${STORAGE_PUBLIC_BASE}/qris/cccc1111111111111111111111111111.png`
    );
    expect(payBody.data[0]).not.toHaveProperty('qrImagePath');
    expect(payBody.data[0]).not.toHaveProperty('isActive');
    expect(payBody.data[0]).not.toHaveProperty('createdAt');
  });

  it('menghitung quote multi-item + ekstra biaya XXL + banyak titik sablon + 0 sablon + warna custom', async () => {
    const res = await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            modelId: 1, // Kaos 65.000
            fabricId: 1, // CC30S +0
            fabricColorId: 1, // Hitam
            sizes: [
              { sizeId: 2, qty: 5 }, // M +0 -> unit 100.000 -> 500.000
              { sizeId: 4, qty: 2 }, // XXL +10.000 -> unit 110.000 -> 220.000
            ],
            prints: [
              { printSizeId: 1, printPosition: PRINT_POSITION.FRONT_CHEST }, // +10.000
              { printSizeId: 2, printPosition: PRINT_POSITION.BACK_CENTER }, // +25.000
            ],
          },
          {
            modelId: 2, // Hoodie 160.000
            fabricId: 2, // CF280 +15.000
            isCustomColor: true,
            colorName: 'Hijau Sage',
            colorHex: '#9caf88',
            sizes: [{ sizeId: 3, qty: 5 }], // L +0, sablon LOGO (10k) + A3 (35k) = 45k -> unit 220.000 -> 1.100.000
            prints: [
              { printSizeId: 1, printPosition: PRINT_POSITION.OTHER },
              { printSizeId: 3, printPosition: PRINT_POSITION.OTHER }, // lebih dari 1 OTHER diperbolehkan
            ],
          },
          {
            modelId: 1, // Kaos 65.000
            fabricId: 1, // CC30S +0
            isCustomColor: true,
            colorName: 'Sand Polos', // hex opsional diabaikan, tanpa sablon
            sizes: [{ sizeId: 1, qty: 1 }], // S +0 -> unit 65.000
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: PricingQuoteResponseDto };
    const quote = body.data;

    expect(quote.totalQty).toBe(13);
    // 720.000 + 1.100.000 + 65.000 = 1.885.000
    expect(quote.subtotalAmount).toBe(1885000);
    expect(typeof quote.subtotalAmount).toBe('number');
    expect(Number.isInteger(quote.subtotalAmount)).toBe(true);
    expect(quote.dpEligible).toBe(true);
    expect(quote.dpMinQty).toBe(12);
    expect(quote.dpPercent).toBe(70);
    expect(quote.dpAmount).toBe(Math.round((1885000 * 70) / 100)); // 1.319.500
    expect(quote.settlementAmount).toBe(1885000 - 1319500); // 565.500
    expect(quote.availablePaymentSchemes).toEqual([PAYMENT_SCHEME.FULL, PAYMENT_SCHEME.DP]);

    expect(quote.items[0]?.printSpotsTotal).toBe(35000);
    expect(quote.items[0]?.sizes[0]?.unitPrice).toBe(100000);
    expect(quote.items[0]?.sizes[1]?.unitPrice).toBe(110000);
    expect(quote.items[0]?.lineSubtotal).toBe(720000);

    expect(quote.items[1]?.isCustomColor).toBe(true);
    expect(quote.items[1]?.fabricColorId).toBeNull();
    expect(quote.items[1]?.colorName).toBe('Hijau Sage');
    expect(quote.items[1]?.colorHex).toBe('#9CAF88');
    expect(quote.items[1]?.lineSubtotal).toBe(1100000);

    expect(quote.items[2]?.colorHex).toBeNull();
    expect(quote.items[2]?.printSpotsTotal).toBe(0);
    expect(quote.items[2]?.lineSubtotal).toBe(65000);
  });

  it('gatekeeper DP dinamis membaca app_settings (totalQty < dpMinQty vs >= dpMinQty)', async () => {
    // 11 pcs < 12 -> DP terkunci
    const lockedRes = await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            modelId: 1,
            fabricId: 1,
            fabricColorId: 1,
            sizes: [{ sizeId: 2, qty: 11 }],
            prints: [],
          },
        ],
      }),
    });
    expect(lockedRes.status).toBe(200);
    const lockedQuote = ((await lockedRes.json()) as { data: PricingQuoteResponseDto }).data;
    expect(lockedQuote.totalQty).toBe(11);
    expect(lockedQuote.dpEligible).toBe(false);
    expect(lockedQuote.availablePaymentSchemes).toEqual([PAYMENT_SCHEME.FULL]);
    expect(lockedQuote.paymentSchemeOptions.find((o) => o.scheme === PAYMENT_SCHEME.DP)).toEqual({
      scheme: PAYMENT_SCHEME.DP,
      label: 'DP 70%',
      available: false,
      initialAmount: lockedQuote.dpAmount,
      remainingAfterInitial: lockedQuote.settlementAmount,
      reason: 'Minimal 12 pcs untuk pembayaran DP 70%.',
    });

    // Tepat 12 pcs -> DP terbuka
    const unlockedRes = await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            modelId: 1,
            fabricId: 1,
            fabricColorId: 1,
            sizes: [{ sizeId: 2, qty: 12 }],
          },
        ],
      }),
    });
    expect(unlockedRes.status).toBe(200);
    const unlockedQuote = ((await unlockedRes.json()) as { data: PricingQuoteResponseDto }).data;
    expect(unlockedQuote.dpEligible).toBe(true);
    expect(unlockedQuote.availablePaymentSchemes).toEqual([PAYMENT_SCHEME.FULL, PAYMENT_SCHEME.DP]);

    // Ubah app_settings: dp_min_qty=20 & dp_percent=50 -> 15 pcs terkunci, 20 pcs terbuka dengan 50%
    store.setSetting('dp_min_qty', '20');
    store.setSetting('dp_percent', '50');

    const custom15Res = await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            modelId: 1,
            fabricId: 1,
            fabricColorId: 2,
            sizes: [{ sizeId: 2, qty: 15 }],
          },
        ],
      }),
    });
    expect(custom15Res.status).toBe(200);
    const custom15 = ((await custom15Res.json()) as { data: PricingQuoteResponseDto }).data;
    expect(custom15.dpEligible).toBe(false);
    expect(custom15.dpMinQty).toBe(20);
    expect(custom15.dpPercent).toBe(50);
    expect(custom15.dpAmount).toBe(Math.round((15 * 65000 * 50) / 100));
    expect(custom15.paymentSchemeOptions.find((o) => o.scheme === PAYMENT_SCHEME.DP)?.label).toBe(
      'DP 50%'
    );
  });

  it('menolak relasi model_fabrics tidak cocok dan master data nonaktif', async () => {
    // Kaos (model 1) dengan Cotton Fleece (fabric 2) tidak ada di model_fabrics
    const mismatchRes = await fetch(`${baseUrl}/api/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            modelId: 1,
            fabricId: 2,
            fabricColorId: 4,
            sizes: [{ sizeId: 2, qty: 2 }],
          },
        ],
      }),
    });
    expect(mismatchRes.status).toBe(400);

    // Model nonaktif (id 3)
    expect(
      (
        await fetch(`${baseUrl}/api/pricing/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ modelId: 3, fabricId: 1, fabricColorId: 1, sizes: [{ sizeId: 2, qty: 1 }] }],
          }),
        })
      ).status
    ).toBe(400);

    // Bahan nonaktif (id 3) meski ada baris relasi
    expect(
      (
        await fetch(`${baseUrl}/api/pricing/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ modelId: 1, fabricId: 3, fabricColorId: 5, sizes: [{ sizeId: 2, qty: 1 }] }],
          }),
        })
      ).status
    ).toBe(400);

    // Ukuran nonaktif (id 5)
    expect(
      (
        await fetch(`${baseUrl}/api/pricing/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ modelId: 1, fabricId: 1, fabricColorId: 1, sizes: [{ sizeId: 5, qty: 1 }] }],
          }),
        })
      ).status
    ).toBe(400);

    // Ukuran sablon nonaktif (id 4)
    expect(
      (
        await fetch(`${baseUrl}/api/pricing/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                modelId: 1,
                fabricId: 1,
                fabricColorId: 1,
                sizes: [{ sizeId: 2, qty: 1 }],
                prints: [{ printSizeId: 4, printPosition: PRINT_POSITION.FRONT_CHEST }],
              },
            ],
          }),
        })
      ).status
    ).toBe(400);
  });

  it('menolak warna non-preset tanpa isCustomColor=true, preset nonaktif/salah bahan, serta payload custom/preset bercampur', async () => {
    const postQuote = (item: Record<string, unknown>) =>
      fetch(`${baseUrl}/api/pricing/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [item] }),
      });

    // Warna non-preset tanpa isCustomColor
    expect(
      (
        await postQuote({
          modelId: 1,
          fabricId: 1,
          colorName: 'Hijau Mint',
          colorHex: '#AAFFCC',
          sizes: [{ sizeId: 2, qty: 2 }],
        })
      ).status
    ).toBe(400);

    // isCustomColor=false tanpa fabricColorId
    expect(
      (
        await postQuote({
          modelId: 1,
          fabricId: 1,
          isCustomColor: false,
          sizes: [{ sizeId: 2, qty: 2 }],
        })
      ).status
    ).toBe(400);

    // isCustomColor=false dengan fabricColorId preset + colorName (campuran)
    expect(
      (
        await postQuote({
          modelId: 1,
          fabricId: 1,
          isCustomColor: false,
          fabricColorId: 1,
          colorName: 'Hitam Custom',
          sizes: [{ sizeId: 2, qty: 2 }],
        })
      ).status
    ).toBe(400);

    // Preset warna nonaktif (id 3)
    expect(
      (
        await postQuote({
          modelId: 1,
          fabricId: 1,
          fabricColorId: 3,
          sizes: [{ sizeId: 2, qty: 2 }],
        })
      ).status
    ).toBe(400);

    // Preset warna milik bahan lain (id 4 milik fabric 2, dipakai di fabric 1)
    expect(
      (
        await postQuote({
          modelId: 1,
          fabricId: 1,
          fabricColorId: 4,
          sizes: [{ sizeId: 2, qty: 2 }],
        })
      ).status
    ).toBe(400);

    // isCustomColor=true tanpa colorName
    expect(
      (
        await postQuote({
          modelId: 1,
          fabricId: 1,
          isCustomColor: true,
          sizes: [{ sizeId: 2, qty: 2 }],
        })
      ).status
    ).toBe(400);

    // isCustomColor=true dengan fabricColorId
    expect(
      (
        await postQuote({
          modelId: 1,
          fabricId: 1,
          isCustomColor: true,
          fabricColorId: 1,
          colorName: 'Sage',
          sizes: [{ sizeId: 2, qty: 2 }],
        })
      ).status
    ).toBe(400);
  });

  it('menolak posisi sablon duplikat selain OTHER, mengizinkan banyak OTHER & posisi sama lintas item, dan menolak ukuran duplikat', async () => {
    // Duplikat FRONT_CHEST dalam satu item -> 400
    expect(
      (
        await fetch(`${baseUrl}/api/pricing/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                modelId: 1,
                fabricId: 1,
                fabricColorId: 1,
                sizes: [{ sizeId: 2, qty: 1 }],
                prints: [
                  { printSizeId: 1, printPosition: PRINT_POSITION.FRONT_CHEST },
                  { printSizeId: 2, printPosition: PRINT_POSITION.FRONT_CHEST },
                ],
              },
            ],
          }),
        })
      ).status
    ).toBe(400);

    // Posisi sama (FRONT_CHEST) di dua item berbeda + 2 OTHER di item pertama -> 200
    expect(
      (
        await fetch(`${baseUrl}/api/pricing/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                modelId: 1,
                fabricId: 1,
                fabricColorId: 1,
                sizes: [{ sizeId: 2, qty: 1 }],
                prints: [
                  { printSizeId: 1, printPosition: PRINT_POSITION.FRONT_CHEST },
                  { printSizeId: 1, printPosition: PRINT_POSITION.OTHER },
                  { printSizeId: 2, printPosition: PRINT_POSITION.OTHER },
                ],
              },
              {
                modelId: 2,
                fabricId: 2,
                fabricColorId: 4,
                sizes: [{ sizeId: 3, qty: 1 }],
                prints: [{ printSizeId: 2, printPosition: PRINT_POSITION.FRONT_CHEST }],
              },
            ],
          }),
        })
      ).status
    ).toBe(200);

    // Ukuran duplikat dalam satu item -> 400
    expect(
      (
        await fetch(`${baseUrl}/api/pricing/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                modelId: 1,
                fabricId: 1,
                fabricColorId: 1,
                sizes: [
                  { sizeId: 2, qty: 1 },
                  { sizeId: 2, qty: 3 },
                ],
              },
            ],
          }),
        })
      ).status
    ).toBe(400);
  });

  it('menegakkan validasi Zod .strict() untuk field asing dan input batas', async () => {
    const postRaw = (payload: unknown) =>
      fetch(`${baseUrl}/api/pricing/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

    // Field asing di root (mis. discountAmount dari client)
    expect(
      (
        await postRaw({
          discountAmount: 50000,
          items: [{ modelId: 1, fabricId: 1, fabricColorId: 1, sizes: [{ sizeId: 2, qty: 1 }] }],
        })
      ).status
    ).toBe(400);

    // Field asing di item (manipulasi basePrice)
    expect(
      (
        await postRaw({
          items: [
            {
              modelId: 1,
              fabricId: 1,
              fabricColorId: 1,
              basePrice: 1,
              sizes: [{ sizeId: 2, qty: 1 }],
            },
          ],
        })
      ).status
    ).toBe(400);

    // Field asing di size & print
    expect(
      (
        await postRaw({
          items: [
            {
              modelId: 1,
              fabricId: 1,
              fabricColorId: 1,
              sizes: [{ sizeId: 2, qty: 1, extraCharge: 0 }],
            },
          ],
        })
      ).status
    ).toBe(400);
    expect(
      (
        await postRaw({
          items: [
            {
              modelId: 1,
              fabricId: 1,
              fabricColorId: 1,
              sizes: [{ sizeId: 2, qty: 1 }],
              prints: [
                { printSizeId: 1, printPosition: PRINT_POSITION.FRONT_CHEST, pricePerSpot: 0 },
              ],
            },
          ],
        })
      ).status
    ).toBe(400);

    // Array kosong & qty invalid
    expect((await postRaw({ items: [] })).status).toBe(400);
    expect(
      (await postRaw({ items: [{ modelId: 1, fabricId: 1, fabricColorId: 1, sizes: [] }] })).status
    ).toBe(400);
    expect(
      (
        await postRaw({
          items: [{ modelId: 1, fabricId: 1, fabricColorId: 1, sizes: [{ sizeId: 2, qty: 0 }] }],
        })
      ).status
    ).toBe(400);
    expect(
      (
        await postRaw({
          items: [{ modelId: 1, fabricId: 1, fabricColorId: 1, sizes: [{ sizeId: 2, qty: 1.5 }] }],
        })
      ).status
    ).toBe(400);
  });

  it('pricingService mendukung pemakaian ulang dengan diskon server-side dan gatekeeper checkout (resolveInitialPaymentRequirement)', async () => {
    const sample12 = {
      items: [
        {
          modelId: 1,
          fabricId: 1,
          fabricColorId: 1,
          sizes: [{ sizeId: 2, qty: 12 }],
        },
      ],
    };
    const discountedQuote = await pricingSvc.calculateQuote(sample12, { discountAmount: 80000 });
    // Subtotal 12 * 65.000 = 780.000; bersih = 700.000; DP 70% = 490.000
    expect(discountedQuote.subtotalAmount).toBe(780000);
    expect(discountedQuote.dpAmount).toBe(490000);
    expect(discountedQuote.settlementAmount).toBe(210000);

    expect(resolveInitialPaymentRequirement(discountedQuote, PAYMENT_SCHEME.DP)).toEqual({
      paymentScheme: PAYMENT_SCHEME.DP,
      dpRequiredAmount: 490000,
      dpPercentSnapshot: 70,
    });
    expect(resolveInitialPaymentRequirement(discountedQuote, PAYMENT_SCHEME.FULL)).toEqual({
      paymentScheme: PAYMENT_SCHEME.FULL,
      dpRequiredAmount: 700000,
      dpPercentSnapshot: null,
    });

    // Diskon > subtotal ditolak
    await expect(
      pricingSvc.calculateQuote(sample12, { discountAmount: 900000 })
    ).rejects.toMatchObject({ status: 400 });

    // Qty di bawah dpMinQty menolak skema DP saat checkout
    const refData = await store.catalogRepo.loadPricingReferenceData({
      modelIds: [1],
      fabricIds: [1],
      fabricColorIds: [1],
      sizeIds: [2],
      printSizeIds: [],
    });
    const quote5 = calculateQuoteFromReferenceData(
      {
        items: [{ modelId: 1, fabricId: 1, fabricColorId: 1, sizes: [{ sizeId: 2, qty: 5 }] }],
      },
      refData
    );
    expect(() => resolveInitialPaymentRequirement(quote5, PAYMENT_SCHEME.DP)).toThrowError(
      /belum memenuhi minimal DP/
    );
  });
});
