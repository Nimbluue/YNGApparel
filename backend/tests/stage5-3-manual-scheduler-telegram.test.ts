import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DESIGN_STATUS,
  FULFILLMENT_TYPE,
  ORDER_SOURCE,
  PAYMENT_METHOD,
  PAYMENT_SCHEME,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRINT_POSITION,
  PRODUCTION_STATUS,
  USER_ROLE,
  type AdminOrderDetailDto,
} from '@yng/shared';
import express, { type RequestHandler } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PricingReferenceData } from '../src/models/catalogModel.js';
import type {
  OrderDetailRecord,
  OrderItemPrintRow,
  OrderItemRow,
  OrderItemSizeRow,
  OrderPaymentRow,
  OrderRow,
  OrderStatusHistoryRow,
} from '../src/models/orderModel.js';
import type { AdvisoryLockPool, StorageListEntry } from '../src/services/schedulerService.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { STORAGE_BUCKETS } = await import('../src/config/constants.js');
const { errorHandler, notFoundHandler } = await import('../src/middleware/errorHandler.js');
const { createAdminOrderModel } = await import('../src/models/adminOrderModel.js');
const { createAdminRouter } = await import('../src/routes/adminRoutes.js');
const { createAdminOrderService } = await import('../src/services/adminOrderService.js');
const { cleanupOrphanTmpDesigns, cleanupStaleCartItems, withAdvisoryLock } =
  await import('../src/services/schedulerService.js');
const { createTelegramService } = await import('../src/services/telegramService.js');

const ADMIN_USER = {
  id: 1,
  userUuid: '99999999-9999-4999-8999-999999999999',
  fullName: 'Solo Admin YNG',
  email: 'admin@yng.test',
  whatsapp: null,
  role: USER_ROLE.ADMIN,
  tokenVersion: 0,
};

const CUSTOMER_USER = {
  id: 77,
  userUuid: '11111111-2222-4333-8444-555555555555',
  fullName: 'Pelanggan Akun',
  email: 'pelanggan@yng.test',
  whatsapp: '6281234567890',
  role: USER_ROLE.USER,
  tokenVersion: 0,
};

function createPricingRef(): PricingReferenceData {
  const now = '2026-11-26T00:00:00.000Z';
  return {
    dpMinQty: 12,
    dpPercent: 70,
    modelsById: new Map([
      [
        1,
        {
          id: 1,
          slug: 'kaos-reguler',
          name: 'Kaos Reguler',
          description: null,
          base_price: 55000,
          image_path: null,
          mockup_template: null,
          sort_order: 1,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ],
    ]),
    fabricsById: new Map([
      [
        1,
        {
          id: 1,
          code: 'COMBED-24S',
          name: 'Cotton Combed 24s',
          description: null,
          gsm_weight: 190,
          thickness_level: 3,
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
    ]),
    compatibleModelFabrics: new Set(['1:1']),
    fabricColorsById: new Map([
      [
        10,
        {
          id: 10,
          fabric_id: 1,
          color_name: 'Jet Black',
          color_hex: '#111111',
          sort_order: 1,
          is_active: true,
        },
      ],
    ]),
    sizesById: new Map([
      [1, { id: 1, code: 'L', sort_order: 1, extra_charge: 0, is_active: true }],
      [2, { id: 2, code: 'XXL', sort_order: 2, extra_charge: 10000, is_active: true }],
    ]),
    printSizesById: new Map([
      [
        1,
        {
          id: 1,
          code: 'A4',
          name: 'Sablon A4',
          dimensions_cm: '21 x 29 cm',
          width_cm: 21,
          height_cm: 29,
          price_per_spot: 15000,
          sort_order: 1,
          is_active: true,
        },
      ],
    ]),
  };
}

function createManualOrderTestEnv() {
  const createdTxUuid = 'cccccccc-6666-4666-8666-000000000001';
  const storedOrders: OrderRow[] = [];
  const storedItems: OrderItemRow[] = [];
  const storedSizes: OrderItemSizeRow[] = [];
  const storedPrints: OrderItemPrintRow[] = [];
  const storedPayments: OrderPaymentRow[] = [];
  const storedHistory: OrderStatusHistoryRow[] = [];
  const storageFiles = new Map<string, Buffer>();
  const movedPaths: Array<{ from: string; to: string }> = [];
  const telegramPayloads: Array<{ url: string; text: string }> = [];

  let nextId = 10;

  function reset() {
    storedOrders.length = 0;
    storedItems.length = 0;
    storedSizes.length = 0;
    storedPrints.length = 0;
    storedPayments.length = 0;
    storedHistory.length = 0;
    storageFiles.clear();
    movedPaths.length = 0;
    telegramPayloads.length = 0;
    nextId = 10;
  }

  const fakeClient = {
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (
        normalized.startsWith('SAVEPOINT') ||
        normalized.startsWith('RELEASE SAVEPOINT') ||
        normalized.startsWith('ROLLBACK TO SAVEPOINT')
      ) {
        return { rows: [] };
      }

      if (normalized.startsWith('SELECT id FROM users WHERE user_uuid = $1')) {
        if (params[0] === CUSTOMER_USER.userUuid) {
          return { rows: [{ id: CUSTOMER_USER.id }] };
        }
        return { rows: [] };
      }

      if (normalized.startsWith('SELECT id FROM payment_accounts WHERE id = $1')) {
        if (params[0] === 1) {
          return { rows: [{ id: 1 }] };
        }
        return { rows: [] };
      }

      if (normalized.startsWith('SELECT setting_value FROM app_settings')) {
        return { rows: [{ setting_value: '24' }] };
      }

      if (normalized.startsWith('INSERT INTO orders (')) {
        nextId += 1;
        const subtotal = Number(params[15]);
        const discount = Number(params[16]);
        const shipping = Number(params[18]);
        const dueHours = params[25] as number | null;
        const row: OrderRow = {
          id: nextId,
          transaction_uuid: createdTxUuid,
          order_code: String(params[0]),
          user_id: (params[1] as number | null) ?? null,
          source: params[2] as OrderRow['source'],
          idempotency_key: null,
          customer_name: String(params[3]),
          customer_whatsapp: String(params[4]),
          fulfillment_type: params[5] as OrderRow['fulfillment_type'],
          province_name: (params[6] as string | null) ?? null,
          city_name: (params[7] as string | null) ?? null,
          district_name: (params[8] as string | null) ?? null,
          postal_code: (params[9] as string | null) ?? null,
          full_address: (params[10] as string | null) ?? null,
          total_qty: Number(params[11]),
          dp_min_qty_snapshot: Number(params[12]),
          is_dp_eligible: Number(params[11]) >= Number(params[12]),
          payment_scheme: params[13] as OrderRow['payment_scheme'],
          dp_percent_snapshot: (params[14] as number | null) ?? null,
          subtotal_amount: subtotal,
          discount_amount: discount,
          discount_note: (params[17] as string | null) ?? null,
          shipping_cost: shipping,
          grand_total: subtotal - discount + shipping,
          dp_required_amount: Number(params[19]),
          remaining_balance: Number(params[20]),
          refunded_amount: 0,
          production_status: params[21] as OrderRow['production_status'],
          design_status: params[22] as OrderRow['design_status'],
          design_review_notes: null,
          admin_notes: (params[23] as string | null) ?? null,
          estimated_finish_date: (params[24] as string | null) ?? null,
          shipping_courier: null,
          shipping_service: null,
          tracking_receipt_number: null,
          shipped_at: null,
          payment_due_at: dueHours ? '2026-11-27T12:00:00.000Z' : null,
          cancelled_reason: null,
          cancelled_at: null,
          completed_at: null,
          created_at: '2026-11-26T05:00:00.000Z',
          updated_at: '2026-11-26T05:00:00.000Z',
        };
        storedOrders.push(row);
        return {
          rows: [
            { id: row.id, transaction_uuid: row.transaction_uuid, order_code: row.order_code },
          ],
        };
      }

      if (normalized.startsWith('INSERT INTO order_items (')) {
        nextId += 1;
        const itemRow: OrderItemRow = {
          id: nextId,
          order_id: Number(params[0]),
          model_id: Number(params[1]),
          fabric_id: Number(params[2]),
          model_name: String(params[3]),
          fabric_name: String(params[4]),
          fabric_color_id: (params[5] as number | null) ?? null,
          is_custom_color: Boolean(params[6]),
          color_name: String(params[7]),
          color_hex: (params[8] as string | null) ?? null,
          needs_design_help: Boolean(params[9]),
          production_notes: (params[10] as string | null) ?? null,
          locked_base_price: Number(params[11]),
          locked_fabric_price: Number(params[12]),
          item_qty: Number(params[13]),
          line_subtotal: Number(params[14]),
        };
        storedItems.push(itemRow);
        return { rows: [{ id: itemRow.id }] };
      }

      if (normalized.startsWith('INSERT INTO order_item_sizes (')) {
        nextId += 1;
        storedSizes.push({
          id: nextId,
          order_item_id: Number(params[0]),
          size_id: Number(params[1]),
          size_code: String(params[2]),
          qty: Number(params[3]),
          locked_extra_charge: Number(params[4]),
        });
        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO order_item_prints (')) {
        nextId += 1;
        storedPrints.push({
          id: nextId,
          order_item_id: Number(params[0]),
          print_size_id: Number(params[1]),
          print_size_code: String(params[2]),
          print_position: params[3] as OrderItemPrintRow['print_position'],
          raw_design_file_path: (params[4] as string | null) ?? null,
          design_file_name: (params[5] as string | null) ?? null,
          locked_spot_price: Number(params[6]),
        });
        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO payments (')) {
        nextId += 1;
        const isVerified = normalized.includes('verified_by');
        if (isVerified) {
          storedPayments.push({
            id: nextId,
            payment_uuid: `dddddddd-6666-4666-8666-0000000000${storedPayments.length + 1}`,
            order_id: Number(params[0]),
            payment_stage: params[1] as OrderPaymentRow['payment_stage'],
            payment_method: (params[2] as OrderPaymentRow['payment_method']) ?? null,
            payment_account_id: (params[3] as number | null) ?? null,
            amount: Number(params[4]),
            proof_image_path: null,
            status: params[5] as OrderPaymentRow['status'],
            rejection_reason: null,
            proof_uploaded_at: null,
            verified_at: '2026-11-26T05:00:00.000Z',
            created_at: '2026-11-26T05:00:00.000Z',
          });
        } else {
          storedPayments.push({
            id: nextId,
            payment_uuid: `dddddddd-6666-4666-8666-0000000000${storedPayments.length + 1}`,
            order_id: Number(params[0]),
            payment_stage: params[1] as OrderPaymentRow['payment_stage'],
            payment_method: null,
            payment_account_id: null,
            amount: Number(params[2]),
            proof_image_path: null,
            status: params[3] as OrderPaymentRow['status'],
            rejection_reason: null,
            proof_uploaded_at: null,
            verified_at: null,
            created_at: '2026-11-26T05:00:00.000Z',
          });
        }
        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO order_status_history (')) {
        nextId += 1;
        storedHistory.push({
          id: nextId,
          order_id: Number(params[0]),
          from_status: null,
          to_status: String(params[1]),
          notes: (params[2] as string | null) ?? null,
          created_at: '2026-11-26T05:00:00.000Z',
        });
        return { rows: [] };
      }

      throw new Error(`Query mock tidak dikenal: ${normalized}`);
    },
  };

  async function findOrderDetailByUuid(txUuid: string): Promise<OrderDetailRecord | null> {
    const order = storedOrders.find((o) => o.transaction_uuid === txUuid);
    if (!order) return null;
    const items = storedItems.filter((i) => i.order_id === order.id);
    const itemIds = new Set(items.map((i) => i.id));
    return {
      order,
      items,
      itemSizes: storedSizes.filter((s) => itemIds.has(s.order_item_id)),
      itemPrints: storedPrints.filter((p) => itemIds.has(p.order_item_id)),
      payments: storedPayments.filter((p) => p.order_id === order.id),
      qcPhotos: [],
      statusHistory: storedHistory.filter((h) => h.order_id === order.id),
    };
  }

  const adminOrderModel = createAdminOrderModel({
    query: async () => ({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }),
    withTransaction: (async <T>(fn: (client: unknown) => Promise<T>) =>
      fn(fakeClient)) as unknown as typeof import('../src/config/database.js').withTransaction,
    findOrderDetailByUuid,
    getSignedUrlExpirySeconds: async () => 600,
  });

  const telegram = createTelegramService({
    botToken: '12345:test-token',
    chatId: '-100123456',
    fetchFn: (async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { text?: string };
      telegramPayloads.push({ url: String(url), text: parsed.text ?? '' });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
  });

  const adminOrderService = createAdminOrderService({
    adminOrderRepo: adminOrderModel,
    catalogRepo: {
      loadPricingReferenceData: async () => createPricingRef(),
    },
    storage: {
      upload: async (_bucket, filePath, buffer) => {
        storageFiles.set(filePath, buffer);
        return { id: filePath, path: filePath, fullPath: filePath };
      },
      download: async (_bucket, filePath) => {
        const buf = storageFiles.get(filePath);
        if (!buf) throw new Error(`File tidak ditemukan: ${filePath}`);
        return buf;
      },
      move: async (_bucket, fromPath, toPath) => {
        const buf = storageFiles.get(fromPath);
        if (buf) {
          storageFiles.delete(fromPath);
          storageFiles.set(toPath, buf);
        }
        movedPaths.push({ from: fromPath, to: toPath });
        return { message: 'Moved' };
      },
      remove: async (_bucket, paths) => {
        for (const p of Array.isArray(paths) ? paths : [paths]) {
          storageFiles.delete(p);
        }
        return [];
      },
      getSignedUrl: async (bucket, filePath) =>
        filePath ? `https://signed.example.test/${bucket}/${filePath}` : null,
    },
    telegram,
  });

  return {
    reset,
    storageFiles,
    movedPaths,
    telegramPayloads,
    getOrders: () => storedOrders,
    getPayments: () => storedPayments,
    adminOrderService,
  };
}

describe('Tahap 5-3 — Order Manual Admin, Scheduler Advisory Lock & Notifikasi Telegram', () => {
  const env = createManualOrderTestEnv();
  let server: http.Server;
  let baseUrl = '';

  const mockAuthMiddleware: RequestHandler = (req, res, next) => {
    const roleHeader = req.header('x-test-role');
    if (roleHeader === 'USER') {
      req.user = CUSTOMER_USER;
      return next();
    }
    if (roleHeader === 'ADMIN') {
      req.user = ADMIN_USER;
      return next();
    }
    return res.status(401).json({ success: false, message: 'Autentikasi diperlukan.', data: null });
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/admin',
      createAdminRouter({
        requireAuthMiddleware: mockAuthMiddleware,
        adminOrderService: env.adminOrderService,
        imageUploadLimiter: (_req, _res, next) => next(),
      })
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/admin`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    env.reset();
  });

  describe('POST /api/admin/orders/manual', () => {
    it('menolak Guest (401) dan USER biasa (403)', async () => {
      const resGuest = await fetch(`${baseUrl}/orders/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(resGuest.status).toBe(401);

      const resUser = await fetch(`${baseUrl}/orders/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'USER' },
        body: JSON.stringify({}),
      });
      expect(resUser.status).toBe(403);
    });

    it('membuat order manual WhatsApp tanpa akun (user_id=NULL), tanpa alamat, DP VERIFIED, tanpa payment_due_at, memindahkan file desain ke orders/, & memicu Telegram', async () => {
      const adminUploadRef = `carts/${ADMIN_USER.userUuid}/0123456789abcdef0123456789abcdef.png`;
      env.storageFiles.set(adminUploadRef, Buffer.from('fake-png-bytes'));

      const res = await fetch(`${baseUrl}/orders/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({
          source: ORDER_SOURCE.WHATSAPP,
          customerName: 'Raka Batam',
          customerWhatsapp: '0812-7777-8888',
          fulfillmentType: FULFILLMENT_TYPE.SHIP,
          items: [
            {
              modelId: 1,
              fabricId: 1,
              isCustomColor: false,
              fabricColorId: 10,
              sizes: [
                { sizeId: 1, qty: 10 }, // (55k+5k+0+15k)*10 = 750.000
                { sizeId: 2, qty: 2 }, // (55k+5k+10k+15k)*2 = 170.000
              ],
              prints: [
                {
                  printSizeId: 1,
                  printPosition: PRINT_POSITION.FRONT_CENTER,
                  fileRef: adminUploadRef,
                  fileName: 'logo-raka.png',
                },
              ],
            },
          ],
          paymentScheme: PAYMENT_SCHEME.DP,
          discountAmount: 20000, // net = 900.000, DP 70% = 630.000
          discountNote: 'Langganan komunitas',
          shippingCost: 25000, // grandTotal = 925.000, remaining = 295.000
          paymentReceived: {
            received: true,
            paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
            paymentAccountId: 1,
          },
          noAutoCancel: true,
          adminNotes: 'Order masuk lewat WA admin',
        }),
      });

      const body = (await res.json()) as { success: boolean; data: AdminOrderDetailDto };
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.userId).toBeNull();
      expect(body.data.source).toBe(ORDER_SOURCE.WHATSAPP);
      expect(body.data.customerWhatsapp).toBe('6281277778888');
      expect(body.data.addressIncomplete).toBe(true);
      expect(body.data.totalQty).toBe(12);
      expect(body.data.subtotalAmount).toBe(920000);
      expect(body.data.discountAmount).toBe(20000);
      expect(body.data.shippingCost).toBe(25000);
      expect(body.data.grandTotal).toBe(925000);
      expect(body.data.dpRequiredAmount).toBe(630000);
      expect(body.data.remainingBalance).toBe(295000);
      expect(body.data.paymentDueAt).toBeNull();
      expect(body.data.productionStatus).toBe(PRODUCTION_STATUS.NEW_ORDER);
      expect(body.data.designStatus).toBe(DESIGN_STATUS.PENDING);

      // Pembayaran DP langsung VERIFIED
      expect(body.data.payments).toHaveLength(1);
      expect(body.data.payments[0]?.paymentStage).toBe(PAYMENT_STAGE.DP);
      expect(body.data.payments[0]?.status).toBe(PAYMENT_STATUS.VERIFIED);
      expect(body.data.payments[0]?.amount).toBe(630000);

      // File desain dipindah dari carts/admin -> orders/uuid/
      expect(env.movedPaths).toHaveLength(1);
      expect(env.movedPaths[0]).toEqual({
        from: adminUploadRef,
        to: `orders/${body.data.transactionUuid}/0123456789abcdef0123456789abcdef.png`,
      });
      expect(env.storageFiles.has(adminUploadRef)).toBe(false);

      // Notifikasi Telegram terkirim tanpa membocorkan alamat/WA
      await new Promise((r) => setTimeout(r, 10));
      expect(env.telegramPayloads).toHaveLength(1);
      expect(env.telegramPayloads[0]?.text).toContain(body.data.orderCode);
      expect(env.telegramPayloads[0]?.text).toContain('WHATSAPP');
      expect(env.telegramPayloads[0]?.text).not.toContain('6281277778888');
    });

    it('mendukung penautan userUuid aktif, skema FULL belum dibayar + noAutoCancel=false, dan menolak DP di bawah minimal', async () => {
      const failDp = await fetch(`${baseUrl}/orders/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({
          source: ORDER_SOURCE.INSTAGRAM,
          customerName: 'Pembeli IG',
          customerWhatsapp: '628111222333',
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          items: [
            {
              modelId: 1,
              fabricId: 1,
              isCustomColor: true,
              colorName: 'Abu Semen',
              colorHex: '#7A7A7A',
              sizes: [{ sizeId: 1, qty: 5 }],
              prints: [],
              needsDesignHelp: true,
            },
          ],
          paymentScheme: PAYMENT_SCHEME.DP, // minimal 12 pcs -> harus 400
        }),
      });
      expect(failDp.status).toBe(400);

      const okRes = await fetch(`${baseUrl}/orders/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({
          source: ORDER_SOURCE.INSTAGRAM,
          userUuid: CUSTOMER_USER.userUuid,
          customerName: 'Pelanggan Akun IG',
          customerWhatsapp: '08111222333',
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          items: [
            {
              modelId: 1,
              fabricId: 1,
              isCustomColor: true,
              colorName: 'Abu Semen',
              sizes: [{ sizeId: 1, qty: 5 }],
              prints: [],
              needsDesignHelp: true,
            },
          ],
          paymentScheme: PAYMENT_SCHEME.FULL,
          paymentReceived: { received: false },
          noAutoCancel: false,
        }),
      });

      const okBody = (await okRes.json()) as { data: AdminOrderDetailDto };
      expect(okRes.status).toBe(201);
      expect(okBody.data.userId).toBe(CUSTOMER_USER.id);
      expect(okBody.data.paymentDueAt).not.toBeNull();
      expect(okBody.data.payments[0]?.status).toBe(PAYMENT_STATUS.PENDING);
      expect(okBody.data.remainingBalance).toBe(300000);
    });
  });

  describe('Scheduler Pembersih + PostgreSQL Advisory Lock', () => {
    it('menjalankan tugas hanya saat pg_try_advisory_lock berhasil dan melepas lock di finally', async () => {
      const sqlLog: string[] = [];
      let released = false;

      const unlockedPool: AdvisoryLockPool = {
        connect: async () => ({
          async query(sql: string) {
            sqlLog.push(sql);
            if (sql.includes('pg_try_advisory_lock')) {
              return { rows: [{ locked: false }] } as { rows: never[] };
            }
            return { rows: [] };
          },
          release() {
            released = true;
          },
        }),
      };

      let ranSkipped = false;
      const skippedRes = await withAdvisoryLock(
        530001,
        async () => {
          ranSkipped = true;
          return 'ok';
        },
        unlockedPool
      );
      expect(skippedRes.acquired).toBe(false);
      expect(ranSkipped).toBe(false);
      expect(released).toBe(true);
      expect(sqlLog.some((s) => s.includes('pg_advisory_unlock'))).toBe(false);

      const lockedSqlLog: string[] = [];
      const lockedPool: AdvisoryLockPool = {
        connect: async () => ({
          async query(sql: string) {
            lockedSqlLog.push(sql);
            if (sql.includes('pg_try_advisory_lock')) {
              return { rows: [{ locked: true }] } as { rows: never[] };
            }
            return { rows: [] };
          },
          release() {},
        }),
      };

      const acquiredRes = await withAdvisoryLock(530001, async () => 42, lockedPool);
      expect(acquiredRes).toEqual({ acquired: true, result: 42 });
      expect(lockedSqlLog.some((s) => s.includes('pg_advisory_unlock'))).toBe(true);
    });

    it('cleanupOrphanTmpDesigns hanya menghapus file tmp/ yang lebih tua dari batas waktu', async () => {
      const removed: string[] = [];
      const nowMs = Date.parse('2026-11-26T12:00:00.000Z');
      const entries: StorageListEntry[] = [
        { id: '1', name: 'old-design.png', created_at: '2026-11-24T10:00:00.000Z' }, // > 24 jam
        { id: '2', name: 'fresh-design.png', created_at: '2026-11-26T08:00:00.000Z' }, // 4 jam lalu
        { id: null, name: 'subfolder', created_at: '2026-11-20T00:00:00.000Z' }, // placeholder folder
      ];

      const pool: AdvisoryLockPool = {
        connect: async () => ({
          async query(sql: string) {
            if (sql.includes('pg_try_advisory_lock')) {
              return { rows: [{ locked: true }] } as { rows: never[] };
            }
            return { rows: [] };
          },
          release() {},
        }),
      };

      const summary = await cleanupOrphanTmpDesigns({
        maxAgeHours: 24,
        nowMs,
        pool,
        storage: {
          list: async () => entries,
          remove: async (bucket, paths) => {
            expect(bucket).toBe(STORAGE_BUCKETS.DESIGNS);
            removed.push(...(Array.isArray(paths) ? paths : [paths]));
            return [];
          },
        },
      });

      expect(summary.acquired).toBe(true);
      expect(summary.deletedPaths).toEqual(['tmp/old-design.png']);
      expect(removed).toEqual(['tmp/old-design.png']);
    });

    it('cleanupStaleCartItems menghapus cart_items > 30 hari dan mempertahankan file desain yang masih direferensikan item aktif', async () => {
      const deletedCartIds: number[] = [];
      const removedFiles: string[] = [];

      const staleRows = [
        {
          id: 10,
          user_id: 77,
          config: {
            prints: [
              { fileRef: `carts/${CUSTOMER_USER.userUuid}/orphan11111111111111111111111111.png` },
              { fileRef: `carts/${CUSTOMER_USER.userUuid}/shared22222222222222222222222222.png` },
            ],
          },
        },
      ];
      const activeRemainingRows = [
        {
          config: {
            prints: [
              { fileRef: `carts/${CUSTOMER_USER.userUuid}/shared22222222222222222222222222.png` },
            ],
          },
        },
      ];

      const pool: AdvisoryLockPool = {
        connect: async () => ({
          async query<T extends Record<string, unknown> = Record<string, unknown>>(
            sql: string,
            params: unknown[] = []
          ): Promise<{ rows: T[] }> {
            if (sql.includes('pg_try_advisory_lock')) {
              return { rows: [{ locked: true }] as unknown as T[] };
            }
            if (sql.includes('FROM cart_items') && sql.includes('FOR UPDATE')) {
              return { rows: staleRows as unknown as T[] };
            }
            if (sql.startsWith('DELETE FROM cart_items')) {
              deletedCartIds.push(...(params[0] as number[]));
              return { rows: [] };
            }
            if (sql.includes('SELECT config') && sql.includes('FROM cart_items')) {
              return { rows: activeRemainingRows as unknown as T[] };
            }
            return { rows: [] };
          },
          release() {},
        }),
      };

      const summary = await cleanupStaleCartItems({
        staleDays: 30,
        pool,
        storage: {
          remove: async (bucket, paths) => {
            expect(bucket).toBe(STORAGE_BUCKETS.DESIGNS);
            removedFiles.push(...(Array.isArray(paths) ? paths : [paths]));
            return [];
          },
        },
      });

      expect(summary.acquired).toBe(true);
      expect(deletedCartIds).toEqual([10]);
      expect(summary.deletedCartItems).toBe(1);
      expect(removedFiles).toEqual([
        `carts/${CUSTOMER_USER.userUuid}/orphan11111111111111111111111111.png`,
      ]);
    });
  });

  describe('Notifikasi Telegram Opsional', () => {
    it('aman tanpa error (no-op) bila token/chatId kosong dan tidak melempar error saat HTTP/network gagal', async () => {
      let fetchCalled = false;
      const unconfigured = createTelegramService({
        botToken: '',
        chatId: '',
        fetchFn: (async () => {
          fetchCalled = true;
          return new Response('', { status: 200 });
        }) as typeof fetch,
      });

      expect(unconfigured.isConfigured()).toBe(false);
      const skipRes = await unconfigured.notifyNewOrder({
        orderCode: 'YNG-NOOP01',
        source: ORDER_SOURCE.WEBSITE,
        customerName: 'Guest',
        totalQty: 5,
        grandTotal: 300000,
        paymentScheme: PAYMENT_SCHEME.FULL,
        fulfillmentType: FULFILLMENT_TYPE.PICKUP,
      });
      expect(skipRes).toEqual({ sent: false, skipped: true });
      expect(fetchCalled).toBe(false);

      const failingTelegram = createTelegramService({
        botToken: 'bot-token',
        chatId: 'chat-id',
        fetchFn: (async () => {
          throw new Error('Network unreachable');
        }) as typeof fetch,
      });

      const failRes = await failingTelegram.notifyPaymentProofUploaded({
        orderCode: 'YNG-FAIL01',
        paymentStageLabel: 'DP 70%',
        amount: 500000,
        paymentMethod: PAYMENT_METHOD.QRIS,
      });
      expect(failRes.sent).toBe(false);
      expect(failRes.error).toContain('Network unreachable');
    });
  });
});
