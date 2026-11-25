import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  PRINT_POSITION,
  USER_ROLE,
  type CartItemDto,
  type CartListResponseDto,
  type DesignUploadResultDto,
} from '@yng/shared';
import express, { type RequestHandler } from 'express';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PricingLookupIds, PricingReferenceData } from '../src/models/catalogModel.js';
import type { CartItemRow, CartRepository } from '../src/models/cartModel.js';
import type {
  FabricColorRow,
  FabricRow,
  GarmentModelRow,
  PrintSizeRow,
  SizeRow,
} from '../src/models/masterModel.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { errorHandler, notFoundHandler } = await import('../src/middleware/errorHandler.js');
const { AppError } = await import('../src/middleware/errorHandler.js');
const { createCartRouter } = await import('../src/routes/cartRoutes.js');
const { createPublicRouter } = await import('../src/routes/publicRoutes.js');
const { createCartService } = await import('../src/services/cartService.js');
const { createDesignUploadService, sanitizeDesignFileName } =
  await import('../src/services/designUploadService.js');

const USER_A = {
  id: 101,
  userUuid: '11111111-1111-4111-8111-111111111111',
  fullName: 'Pelanggan A',
  email: 'a@example.com',
  whatsapp: '6281234567890',
  role: USER_ROLE.USER,
  tokenVersion: 0,
};

const USER_B = {
  id: 202,
  userUuid: '22222222-2222-4222-8222-222222222222',
  fullName: 'Pelanggan B',
  email: 'b@example.com',
  whatsapp: '6289876543210',
  role: USER_ROLE.USER,
  tokenVersion: 0,
};

function createTestEnvironment() {
  const now = '2026-11-25T10:00:00.000Z';
  const models = new Map<number, GarmentModelRow>([
    [
      1,
      {
        id: 1,
        slug: 'kaos-lengan-pendek',
        name: 'Kaos Lengan Pendek',
        description: null,
        base_price: 65000,
        image_path: null,
        mockup_template: 'tee-short',
        sort_order: 1,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ],
  ]);

  const fabrics = new Map<number, FabricRow>([
    [
      10,
      {
        id: 10,
        code: 'COMBED30S',
        name: 'Cotton Combed 30s',
        description: null,
        gsm_weight: 150,
        thickness_level: 2,
        comfort_level: 5,
        additional_price: 5000,
        image_path: null,
        macro_image_path: null,
        sort_order: 1,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ],
  ]);

  const compatibleModelFabrics = new Set<string>(['1:10']);

  const fabricColors = new Map<number, FabricColorRow>([
    [
      100,
      {
        id: 100,
        fabric_id: 10,
        color_name: 'Hitam Pekat',
        color_hex: '#09090B',
        sort_order: 1,
        is_active: true,
      },
    ],
  ]);

  const sizes = new Map<number, SizeRow>([
    [1, { id: 1, code: 'M', sort_order: 1, extra_charge: 0, is_active: true }],
    [2, { id: 2, code: 'XXL', sort_order: 2, extra_charge: 10000, is_active: true }],
  ]);

  const printSizes = new Map<number, PrintSizeRow>([
    [
      1,
      {
        id: 1,
        code: 'A4',
        name: 'A4',
        dimensions_cm: '21x29 cm',
        width_cm: 21,
        height_cm: 29,
        price_per_spot: 20000,
        sort_order: 1,
        is_active: true,
      },
    ],
  ]);

  const settings = {
    dpMinQty: 12,
    dpPercent: 70,
    maxDesignFileMb: 20,
  };

  let cartRows: CartItemRow[] = [];
  let nextId = 1;
  const uploadedFiles = new Map<string, { buffer: Buffer; contentType: string }>();
  const removedPaths: string[] = [];

  const catalogRepo = {
    async loadPricingReferenceData(_lookup: PricingLookupIds): Promise<PricingReferenceData> {
      return {
        modelsById: models,
        fabricsById: fabrics,
        compatibleModelFabrics,
        fabricColorsById: fabricColors,
        sizesById: sizes,
        printSizesById: printSizes,
        dpMinQty: settings.dpMinQty,
        dpPercent: settings.dpPercent,
      };
    },
  };

  const cartRepo: CartRepository = {
    async listByUser(userId) {
      return cartRows.filter((row) => row.user_id === userId);
    },
    async findByUuidAndUser(userId, cartItemUuid) {
      return (
        cartRows.find((row) => row.user_id === userId && row.cart_item_uuid === cartItemUuid) ??
        null
      );
    },
    async createAtomic(input) {
      const userCount = cartRows.filter((row) => row.user_id === input.userId).length;
      if (userCount >= input.maxItems) {
        throw new AppError(`Keranjang sudah mencapai batas maksimal ${input.maxItems} item.`, 400);
      }
      const id = nextId++;
      const row: CartItemRow = {
        id,
        cart_item_uuid: `aaaaaaaa-aaaa-4aaa-8aaa-${String(id).padStart(12, '0')}`,
        user_id: input.userId,
        model_id: input.modelId,
        fabric_id: input.fabricId,
        config: input.config,
        config_version: 1,
        created_at: now,
        updated_at: now,
      };
      cartRows.push(row);
      return row;
    },
    async updateAtomic(input) {
      const idx = cartRows.findIndex(
        (row) => row.user_id === input.userId && row.cart_item_uuid === input.cartItemUuid
      );
      if (idx === -1) return null;
      const previousConfig = cartRows[idx].config;
      const updated: CartItemRow = {
        ...cartRows[idx],
        model_id: input.modelId,
        fabric_id: input.fabricId,
        config: input.config,
        updated_at: now,
      };
      cartRows[idx] = updated;
      const otherCartItems = cartRows.filter(
        (row) => row.user_id === input.userId && row.id !== updated.id
      );
      return { updated, previousConfig, otherCartItems };
    },
    async deleteAtomic(userId, cartItemUuid) {
      const idx = cartRows.findIndex(
        (row) => row.user_id === userId && row.cart_item_uuid === cartItemUuid
      );
      if (idx === -1) return null;
      const [deleted] = cartRows.splice(idx, 1);
      const remainingCartItems = cartRows.filter((row) => row.user_id === userId);
      return { deleted, remainingCartItems };
    },
  };

  const designUploadService = createDesignUploadService({
    getMaxDesignFileMb: async () => settings.maxDesignFileMb,
    uploadToStorage: async (_bucket, filePath, buffer, opts) => {
      uploadedFiles.set(filePath, {
        buffer,
        contentType: opts?.contentType ?? 'application/octet-stream',
      });
      return { id: filePath, path: filePath, fullPath: filePath };
    },
  });

  const cartService = createCartService({
    cartRepo,
    catalogRepo,
    removeStorageFiles: async (_bucket, paths) => {
      for (const p of paths) {
        uploadedFiles.delete(p);
        removedPaths.push(p);
      }
      return [];
    },
  });

  const reset = () => {
    cartRows = [];
    nextId = 1;
    uploadedFiles.clear();
    removedPaths.length = 0;
    models.get(1)!.base_price = 65000;
    models.get(1)!.is_active = true;
    settings.maxDesignFileMb = 20;
  };

  return {
    models,
    settings,
    getCartRows: () => cartRows,
    uploadedFiles,
    removedPaths,
    designUploadService,
    cartService,
    reset,
  };
}

describe('Tahap 3a-1 — Keranjang Custom Lab & Upload File Desain', () => {
  const env = createTestEnvironment();
  let server: http.Server;
  let baseUrl = '';

  const mockAuthMiddleware: RequestHandler = (req, res, next) => {
    const header = req.header('x-test-user');
    if (header === 'A') {
      req.user = USER_A;
      return next();
    }
    if (header === 'B') {
      req.user = USER_B;
      return next();
    }
    return res
      .status(401)
      .json({ success: false, message: 'Silakan login terlebih dahulu.', data: null });
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/cart',
      createCartRouter({
        cartService: env.cartService,
        requireAuthMiddleware: mockAuthMiddleware,
      })
    );
    app.use(
      '/api',
      createPublicRouter({
        designUploadService: env.designUploadService,
        requireAuthMiddleware: mockAuthMiddleware,
      })
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    env.reset();
  });

  describe('Upload File Desain (POST /api/uploads/design)', () => {
    it('menolak Guest tanpa login dengan 401', async () => {
      const form = new FormData();
      form.append('file', new Blob(['dummy'], { type: 'image/png' }), 'test.png');

      const res = await fetch(`${baseUrl}/uploads/design`, { method: 'POST', body: form });
      expect(res.status).toBe(401);
    });

    it('menerima PNG asli, membaca dimensi, membersihkan nama file, dan menyimpan ke carts/<userUuid>/', async () => {
      const pngBuffer = await sharp({
        create: {
          width: 320,
          height: 240,
          channels: 4,
          background: { r: 17, g: 17, b: 17, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'my logo (final)!.png'
      );

      const res = await fetch(`${baseUrl}/uploads/design`, {
        method: 'POST',
        headers: { 'x-test-user': 'A' },
        body: form,
      });
      const body = (await res.json()) as { success: boolean; data: DesignUploadResultDto };

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.fileRef).toMatch(
        new RegExp(`^carts/${USER_A.userUuid}/[a-f0-9]{32}\\.png$`)
      );
      expect(body.data.fileName).toBe('my_logo_final_.png');
      expect(body.data.mimeType).toBe('image/png');
      expect(body.data.width).toBe(320);
      expect(body.data.height).toBe(240);
      expect(env.uploadedFiles.has(body.data.fileRef)).toBe(true);
    });

    it('menerima SVG bersih dan PDF asli, tetapi menolak SVG dengan tag <script>', async () => {
      const safeSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
      const formSvg = new FormData();
      formSvg.append('file', new Blob([safeSvg], { type: 'image/svg+xml' }), 'vector.svg');
      const resSvg = await fetch(`${baseUrl}/uploads/design`, {
        method: 'POST',
        headers: { 'x-test-user': 'A' },
        body: formSvg,
      });
      const svgBody = (await resSvg.json()) as { data: DesignUploadResultDto };
      expect(resSvg.status).toBe(201);
      expect(svgBody.data.fileRef.endsWith('.svg')).toBe(true);
      expect(svgBody.data.width).toBeNull();

      const pdfBytes = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
        'utf8'
      );
      const formPdf = new FormData();
      formPdf.append(
        'file',
        new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }),
        'desain.pdf'
      );
      const resPdf = await fetch(`${baseUrl}/uploads/design`, {
        method: 'POST',
        headers: { 'x-test-user': 'A' },
        body: formPdf,
      });
      expect(resPdf.status).toBe(201);

      const xssSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const formXss = new FormData();
      formXss.append('file', new Blob([xssSvg], { type: 'image/svg+xml' }), 'xss.svg');
      const resXss = await fetch(`${baseUrl}/uploads/design`, {
        method: 'POST',
        headers: { 'x-test-user': 'A' },
        body: formXss,
      });
      expect(resXss.status).toBe(400);
    });

    it('menolak file dengan ekstensi palsu (magic bytes tidak cocok) dan ukuran melebihi batas', async () => {
      const fakePng = Buffer.from('ini bukan png asli', 'utf8');
      const formFake = new FormData();
      formFake.append(
        'file',
        new Blob([new Uint8Array(fakePng)], { type: 'image/png' }),
        'palsu.png'
      );
      const resFake = await fetch(`${baseUrl}/uploads/design`, {
        method: 'POST',
        headers: { 'x-test-user': 'A' },
        body: formFake,
      });
      expect(resFake.status).toBe(400);

      env.settings.maxDesignFileMb = 0; // batas 0 MB memaksa penolakan ukuran
      const pngBuffer = await sharp({
        create: { width: 10, height: 10, channels: 3, background: '#000000' },
      })
        .png()
        .toBuffer();
      const formBig = new FormData();
      formBig.append(
        'file',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'big.png'
      );
      const resBig = await fetch(`${baseUrl}/uploads/design`, {
        method: 'POST',
        headers: { 'x-test-user': 'A' },
        body: formBig,
      });
      expect(resBig.status).toBe(400);
    });

    it('membersihkan path traversal pada nama file', () => {
      expect(sanitizeDesignFileName('../../secret/../../logo final.png', 'png')).toBe(
        'logo_final.png'
      );
      expect(sanitizeDesignFileName('...', 'pdf')).toBe('design.pdf');
    });
  });

  describe('CRUD Keranjang Custom Lab (/api/cart/items)', () => {
    const validFileRefA = `carts/${USER_A.userUuid}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png`;
    const validFileRefB = `carts/${USER_B.userUuid}/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png`;

    it('menolak Guest dengan 401 dan mengembalikan ringkasan kosong untuk user baru', async () => {
      const guestRes = await fetch(`${baseUrl}/cart/items`);
      expect(guestRes.status).toBe(401);

      const userRes = await fetch(`${baseUrl}/cart/items`, { headers: { 'x-test-user': 'A' } });
      const body = (await userRes.json()) as { data: CartListResponseDto };
      expect(userRes.status).toBe(200);
      expect(body.data.items).toEqual([]);
      expect(body.data.summary.maxItems).toBe(20);
      expect(body.data.summary.totalItems).toBe(0);
    });

    it('menyimpan konfigurasi tanpa harga (baik dengan file desain maupun bantuan desain gratis) & menghitung harga dinamis', async () => {
      // 1. Dengan file desain milik User A
      const res1 = await fetch(`${baseUrl}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          modelId: 1,
          fabricId: 10,
          fabricColorId: 100,
          sizes: [
            { sizeId: 1, qty: 2 }, // 2 * (65000 + 5000 + 0 + 20000) = 180000
            { sizeId: 2, qty: 1 }, // 1 * (65000 + 5000 + 10000 + 20000) = 100000
          ],
          prints: [
            {
              printSizeId: 1,
              printPosition: PRINT_POSITION.FRONT_CENTER,
              fileRef: validFileRefA,
              fileName: 'logo.png',
            },
          ],
          productionNotes: 'Posisi agak naik 2 cm',
        }),
      });
      const body1 = (await res1.json()) as { data: CartItemDto };
      expect(res1.status).toBe(201);
      expect(body1.data.lineSubtotal).toBe(280000);
      expect(body1.data.itemQty).toBe(3);

      // Pastikan di penyimpanan DB (cart_items.config) tidak ada field harga
      const storedRow = env.getCartRows()[0];
      expect(storedRow).toBeDefined();
      const storedConfigRecord = storedRow.config as unknown as Record<string, unknown>;
      expect(storedConfigRecord.lineSubtotal).toBeUndefined();
      expect(storedConfigRecord.unitPrice).toBeUndefined();

      // 2. Dengan bantuan desain gratis (tanpa fileRef)
      const res2 = await fetch(`${baseUrl}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          modelId: 1,
          fabricId: 10,
          isCustomColor: true,
          colorName: 'Sage Green',
          colorHex: '#9CAF88',
          sizes: [{ sizeId: 1, qty: 10 }],
          prints: [
            {
              printSizeId: 1,
              printPosition: PRINT_POSITION.BACK_CENTER,
              needsDesignHelp: true,
            },
          ],
        }),
      });
      expect(res2.status).toBe(201);

      // 3. Simulasi perubahan harga master -> GET /api/cart/items langsung merefleksikan harga terbaru & DP eligible (3+10=13 >= 12)
      env.models.get(1)!.base_price = 75000;
      const listRes = await fetch(`${baseUrl}/cart/items`, { headers: { 'x-test-user': 'A' } });
      const listBody = (await listRes.json()) as { data: CartListResponseDto };
      expect(listRes.status).toBe(200);
      expect(listBody.data.summary.totalQty).toBe(13);
      expect(listBody.data.summary.dpEligible).toBe(true);
      // Item 1 baru: 2*(75k+5k+20k) + 1*(75k+5k+10k+20k) = 200k + 110k = 310k
      expect(listBody.data.items[0].lineSubtotal).toBe(310000);
    });

    it('menolak fileRef milik user lain, titik sablon tanpa file & tanpa bantuan desain, serta batas maksimal 20 item', async () => {
      const otherFileRes = await fetch(`${baseUrl}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          modelId: 1,
          fabricId: 10,
          fabricColorId: 100,
          sizes: [{ sizeId: 1, qty: 1 }],
          prints: [
            {
              printSizeId: 1,
              printPosition: PRINT_POSITION.FRONT_CENTER,
              fileRef: validFileRefB,
              fileName: 'curi.png',
            },
          ],
        }),
      });
      expect(otherFileRes.status).toBe(400);

      const missingFileRes = await fetch(`${baseUrl}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          modelId: 1,
          fabricId: 10,
          fabricColorId: 100,
          sizes: [{ sizeId: 1, qty: 1 }],
          prints: [{ printSizeId: 1, printPosition: PRINT_POSITION.FRONT_CENTER }],
        }),
      });
      expect(missingFileRes.status).toBe(400);

      // Tambah 20 item valid (polosan)
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`${baseUrl}/cart/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
          body: JSON.stringify({
            modelId: 1,
            fabricId: 10,
            fabricColorId: 100,
            sizes: [{ sizeId: 1, qty: 1 }],
          }),
        });
        expect(res.status).toBe(201);
      }

      // Item ke-21 harus ditolak
      const overLimitRes = await fetch(`${baseUrl}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          modelId: 1,
          fabricId: 10,
          fabricColorId: 100,
          sizes: [{ sizeId: 1, qty: 1 }],
        }),
      });
      expect(overLimitRes.status).toBe(400);
    });

    it('mengisolasi kepemilikan item (404 untuk user lain), menandai item nonaktif dengan peringatan, dan membersihkan file yatim saat PUT/DELETE', async () => {
      env.uploadedFiles.set(validFileRefA, {
        buffer: Buffer.from('img'),
        contentType: 'image/png',
      });

      const createRes = await fetch(`${baseUrl}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          modelId: 1,
          fabricId: 10,
          fabricColorId: 100,
          sizes: [{ sizeId: 1, qty: 2 }],
          prints: [
            {
              printSizeId: 1,
              printPosition: PRINT_POSITION.FRONT_CENTER,
              fileRef: validFileRefA,
              fileName: 'depan.png',
            },
          ],
        }),
      });
      const created = (await createRes.json()) as { data: CartItemDto };
      const uuid = created.data.cartItemUuid;

      // User B mencoba ubah/hapus milik User A -> 404
      const putByB = await fetch(`${baseUrl}/cart/items/${uuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'B' },
        body: JSON.stringify({
          modelId: 1,
          fabricId: 10,
          fabricColorId: 100,
          sizes: [{ sizeId: 1, qty: 5 }],
        }),
      });
      expect(putByB.status).toBe(404);

      const delByB = await fetch(`${baseUrl}/cart/items/${uuid}`, {
        method: 'DELETE',
        headers: { 'x-test-user': 'B' },
      });
      expect(delByB.status).toBe(404);

      // Nonaktifkan model -> GET /api/cart/items tetap 200 dengan peringatan
      env.models.get(1)!.is_active = false;
      const warnListRes = await fetch(`${baseUrl}/cart/items`, { headers: { 'x-test-user': 'A' } });
      const warnList = (await warnListRes.json()) as { data: CartListResponseDto };
      expect(warnListRes.status).toBe(200);
      expect(warnList.data.items[0].isAvailable).toBe(false);
      expect(warnList.data.items[0].warnings.length).toBeGreaterThan(0);
      expect(warnList.data.summary.unavailableItemCount).toBe(1);

      // Aktifkan lagi model, lalu PUT mengganti ke bantuan desain gratis -> file lama terhapus
      env.models.get(1)!.is_active = true;
      const putRes = await fetch(`${baseUrl}/cart/items/${uuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          modelId: 1,
          fabricId: 10,
          fabricColorId: 100,
          sizes: [{ sizeId: 1, qty: 4 }],
          prints: [
            {
              printSizeId: 1,
              printPosition: PRINT_POSITION.FRONT_CENTER,
              needsDesignHelp: true,
            },
          ],
        }),
      });
      expect(putRes.status).toBe(200);
      expect(env.removedPaths).toContain(validFileRefA);

      // DELETE item -> 200
      const delRes = await fetch(`${baseUrl}/cart/items/${uuid}`, {
        method: 'DELETE',
        headers: { 'x-test-user': 'A' },
      });
      expect(delRes.status).toBe(200);
    });
  });
});
