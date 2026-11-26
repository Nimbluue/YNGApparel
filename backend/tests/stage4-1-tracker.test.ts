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
  type TrackerOrderDto,
  type UploadPaymentProofResultDto,
} from '@yng/shared';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { QueryResult, QueryResultRow } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PaymentAccountRow } from '../src/models/masterModel.js';
import type {
  OrderDetailRecord,
  OrderItemPrintRow,
  OrderItemRow,
  OrderItemSizeRow,
  OrderPaymentRow,
  OrderQcPhotoRow,
  OrderRepository,
  OrderRow,
  OrderStatusHistoryRow,
  TrackerRepository,
} from '../src/models/orderModel.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { STORAGE_BUCKETS } = await import('../src/config/constants.js');
const { AppError, errorHandler, notFoundHandler } =
  await import('../src/middleware/errorHandler.js');
const { createOrderModel } = await import('../src/models/orderModel.js');
const { createTrackerRouter } = await import('../src/routes/trackerRoutes.js');
const { createOrderService } = await import('../src/services/orderService.js');
const { buildProductionStages, createTrackerService } =
  await import('../src/services/trackerService.js');
const { maskCustomerName, maskLocationSummary, maskWhatsApp, normalizeTrackerOrderCode } =
  await import('../src/utils/masking.js');

function makeQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

function createTrackerTestEnv() {
  const now = '2026-11-26T02:00:00.000Z';
  const signedUrlTtlCalls: Array<{ bucket: string; path: string; expiresIn: number }> = [];
  const uploadedProofs = new Map<string, Buffer>();
  const removedProofPaths: string[] = [];
  let forceFailProofTx = false;
  let signedUrlExpirySetting = 7200;

  const orderShipUuid = 'aaaaaaaa-1111-4111-8111-000000000001';
  const orderManualUuid = 'bbbbbbbb-2222-4222-8222-000000000002';
  const dpPaymentUuid = 'cccccccc-1111-4111-8111-000000000011';
  const settlementPaymentUuid = 'dddddddd-1111-4111-8111-000000000012';
  const fullPaymentUuid = 'eeeeeeee-2222-4222-8222-000000000021';

  let orders: OrderRow[] = [];
  let orderItems: OrderItemRow[] = [];
  let orderItemSizes: OrderItemSizeRow[] = [];
  let orderItemPrints: OrderItemPrintRow[] = [];
  let payments: OrderPaymentRow[] = [];
  let qcPhotos: OrderQcPhotoRow[] = [];
  let statusHistory: OrderStatusHistoryRow[] = [];
  let paymentAccounts: PaymentAccountRow[] = [];

  function reset() {
    signedUrlTtlCalls.length = 0;
    uploadedProofs.clear();
    removedProofPaths.length = 0;
    forceFailProofTx = false;
    signedUrlExpirySetting = 7200;

    orders = [
      {
        id: 1,
        transaction_uuid: orderShipUuid,
        order_code: 'YNG-K7M2QX',
        user_id: 101,
        source: ORDER_SOURCE.WEBSITE,
        idempotency_key: null,
        customer_name: 'Budi Santoso',
        customer_whatsapp: '6281234567890',
        fulfillment_type: FULFILLMENT_TYPE.SHIP,
        province_name: 'Kepulauan Riau',
        city_name: 'Kota Batam',
        district_name: 'Batam Kota',
        postal_code: '29444',
        full_address: 'Jl. Rahasia Rumah No. 99',
        total_qty: 12,
        dp_min_qty_snapshot: 12,
        is_dp_eligible: true,
        payment_scheme: PAYMENT_SCHEME.DP,
        dp_percent_snapshot: 70,
        subtotal_amount: 1080000,
        discount_amount: 80000,
        discount_note: 'Promo komunitas',
        shipping_cost: 35000,
        grand_total: 1035000,
        dp_required_amount: 700000,
        remaining_balance: 335000,
        refunded_amount: 0,
        production_status: PRODUCTION_STATUS.AWAITING_SETTLEMENT,
        design_status: DESIGN_STATUS.APPROVED,
        design_review_notes: 'Siap cetak DTF',
        admin_notes: 'Catatan internal rahasia admin',
        estimated_finish_date: '2026-12-01',
        shipping_courier: 'JNE',
        shipping_service: 'REG',
        tracking_receipt_number: 'JNE987654321',
        shipped_at: null,
        payment_due_at: null,
        cancelled_reason: null,
        cancelled_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: 2,
        transaction_uuid: orderManualUuid,
        order_code: 'YNG-M4NU49',
        user_id: null,
        source: ORDER_SOURCE.WHATSAPP,
        idempotency_key: null,
        customer_name: 'Sari',
        customer_whatsapp: '6289988776655',
        fulfillment_type: FULFILLMENT_TYPE.PICKUP,
        province_name: null,
        city_name: null,
        district_name: null,
        postal_code: null,
        full_address: null,
        total_qty: 4,
        dp_min_qty_snapshot: 12,
        is_dp_eligible: false,
        payment_scheme: PAYMENT_SCHEME.FULL,
        dp_percent_snapshot: null,
        subtotal_amount: 320000,
        discount_amount: 0,
        discount_note: null,
        shipping_cost: 0,
        grand_total: 320000,
        dp_required_amount: 320000,
        remaining_balance: 0,
        refunded_amount: 0,
        production_status: PRODUCTION_STATUS.SHIPPING,
        design_status: DESIGN_STATUS.APPROVED,
        design_review_notes: null,
        admin_notes: null,
        estimated_finish_date: null,
        shipping_courier: null,
        shipping_service: null,
        tracking_receipt_number: null,
        shipped_at: now,
        payment_due_at: null,
        cancelled_reason: null,
        cancelled_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      },
    ];

    orderItems = [
      {
        id: 11,
        order_id: 1,
        model_id: 1,
        fabric_id: 10,
        model_name: 'Kaos Heavyweight',
        fabric_name: 'Cotton Combed 24s',
        fabric_color_id: 100,
        is_custom_color: false,
        color_name: 'Hitam Pekat',
        color_hex: '#111111',
        needs_design_help: false,
        production_notes: 'Posisi dada kiri',
        locked_base_price: 65000,
        locked_fabric_price: 5000,
        item_qty: 12,
        line_subtotal: 1080000,
      },
      {
        id: 21,
        order_id: 2,
        model_id: 1,
        fabric_id: 10,
        model_name: 'Kaos Lengan Pendek',
        fabric_name: 'Cotton Combed 30s',
        fabric_color_id: 100,
        is_custom_color: false,
        color_name: 'Putih',
        color_hex: '#FFFFFF',
        needs_design_help: true,
        production_notes: null,
        locked_base_price: 65000,
        locked_fabric_price: 15000,
        item_qty: 4,
        line_subtotal: 320000,
      },
    ];

    orderItemSizes = [
      { id: 101, order_item_id: 11, size_id: 1, size_code: 'L', qty: 12, locked_extra_charge: 0 },
      { id: 201, order_item_id: 21, size_id: 1, size_code: 'M', qty: 4, locked_extra_charge: 0 },
    ];

    orderItemPrints = [
      {
        id: 1001,
        order_item_id: 11,
        print_size_id: 1,
        print_size_code: 'A4',
        print_position: PRINT_POSITION.FRONT_CENTER,
        raw_design_file_path: `orders/${orderShipUuid}/abc.png`,
        design_file_name: 'komunitas.png',
        locked_spot_price: 20000,
      },
    ];

    payments = [
      {
        id: 501,
        payment_uuid: dpPaymentUuid,
        order_id: 1,
        payment_stage: PAYMENT_STAGE.DP,
        payment_method: PAYMENT_METHOD.BANK_TRANSFER,
        payment_account_id: 1,
        amount: 700000,
        proof_image_path: `${orderShipUuid}/${dpPaymentUuid}/old-dp.png`,
        status: PAYMENT_STATUS.VERIFIED,
        rejection_reason: null,
        proof_uploaded_at: now,
        verified_at: now,
        created_at: now,
      },
      {
        id: 502,
        payment_uuid: settlementPaymentUuid,
        order_id: 1,
        payment_stage: PAYMENT_STAGE.SETTLEMENT,
        payment_method: null,
        payment_account_id: null,
        amount: 335000,
        proof_image_path: null,
        status: PAYMENT_STATUS.PENDING,
        rejection_reason: null,
        proof_uploaded_at: null,
        verified_at: null,
        created_at: now,
      },
      {
        id: 503,
        payment_uuid: fullPaymentUuid,
        order_id: 2,
        payment_stage: PAYMENT_STAGE.FULL,
        payment_method: PAYMENT_METHOD.QRIS,
        payment_account_id: 2,
        amount: 320000,
        proof_image_path: `${orderManualUuid}/${fullPaymentUuid}/full.png`,
        status: PAYMENT_STATUS.VERIFIED,
        rejection_reason: null,
        proof_uploaded_at: now,
        verified_at: now,
        created_at: now,
      },
    ];

    qcPhotos = [
      { id: 1, order_id: 1, photo_path: `${orderShipUuid}/qc-depan.jpg`, created_at: now },
      { id: 2, order_id: 1, photo_path: `${orderShipUuid}/qc-sablon.jpg`, created_at: now },
      { id: 3, order_id: 2, photo_path: `${orderManualUuid}/qc-pickup.jpg`, created_at: now },
    ];

    statusHistory = [
      {
        id: 1,
        order_id: 1,
        from_status: null,
        to_status: PRODUCTION_STATUS.NEW_ORDER,
        notes: 'Order masuk',
        created_at: now,
      },
      {
        id: 2,
        order_id: 1,
        from_status: PRODUCTION_STATUS.NEW_ORDER,
        to_status: PRODUCTION_STATUS.PRINT_QUEUE,
        notes: 'Mulai cetak',
        created_at: now,
      },
      {
        id: 3,
        order_id: 1,
        from_status: PRODUCTION_STATUS.PRINT_QUEUE,
        to_status: PRODUCTION_STATUS.PRESSING_QC,
        notes: 'QC selesai',
        created_at: now,
      },
      {
        id: 4,
        order_id: 1,
        from_status: PRODUCTION_STATUS.PRESSING_QC,
        to_status: PRODUCTION_STATUS.AWAITING_SETTLEMENT,
        notes: 'Menunggu pelunasan + ongkir',
        created_at: now,
      },
      {
        id: 5,
        order_id: 2,
        from_status: null,
        to_status: PRODUCTION_STATUS.NEW_ORDER,
        notes: 'Order manual WA',
        created_at: now,
      },
      {
        id: 6,
        order_id: 2,
        from_status: PRODUCTION_STATUS.NEW_ORDER,
        to_status: PRODUCTION_STATUS.PRINT_QUEUE,
        notes: null,
        created_at: now,
      },
      {
        id: 7,
        order_id: 2,
        from_status: PRODUCTION_STATUS.PRINT_QUEUE,
        to_status: PRODUCTION_STATUS.PRESSING_QC,
        notes: null,
        created_at: now,
      },
      {
        id: 8,
        order_id: 2,
        from_status: PRODUCTION_STATUS.PRESSING_QC,
        to_status: PRODUCTION_STATUS.SHIPPING,
        notes: 'Siap diambil di workshop',
        created_at: now,
      },
    ];

    paymentAccounts = [
      {
        id: 1,
        method: PAYMENT_METHOD.BANK_TRANSFER,
        provider_name: 'BCA',
        account_number: '1234567890',
        account_holder: 'PT YNG Apparel Batam',
        qr_image_path: null,
        instructions: 'Cantumkan kode order.',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 2,
        method: PAYMENT_METHOD.QRIS,
        provider_name: 'QRIS Studio',
        account_number: null,
        account_holder: 'YNG Apparel',
        qr_image_path: 'qris/main.png',
        instructions: 'Scan QRIS.',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ];
  }

  function assembleRecord(order: OrderRow): OrderDetailRecord {
    const items = orderItems.filter((i) => i.order_id === order.id);
    const itemIdSet = new Set(items.map((i) => i.id));
    return {
      order,
      items,
      itemSizes: orderItemSizes.filter((s) => itemIdSet.has(s.order_item_id)),
      itemPrints: orderItemPrints.filter((p) => itemIdSet.has(p.order_item_id)),
      payments: payments.filter((p) => p.order_id === order.id),
      qcPhotos: qcPhotos.filter((q) => q.order_id === order.id),
      statusHistory: statusHistory.filter((h) => h.order_id === order.id),
    };
  }

  const catalogRepo = {
    async loadPricingReferenceData(): Promise<never> {
      throw new Error('Not used in tracker tests');
    },
    async listActivePaymentAccounts(): Promise<PaymentAccountRow[]> {
      return paymentAccounts.filter((acc) => acc.is_active);
    },
  };

  const repo: TrackerRepository & OrderRepository = {
    async createWebsiteOrderAtomic() {
      throw new Error('Not used');
    },
    async listOrdersByUser() {
      return { rows: [], total: 0 };
    },
    async findOrderDetailByUuid(transactionUuid, userId) {
      const order = orders.find(
        (o) =>
          o.transaction_uuid === transactionUuid && (userId === undefined || o.user_id === userId)
      );
      return order ? assembleRecord(order) : null;
    },
    async findOrderDetailByOrderCode(orderCode) {
      const order = orders.find((o) => o.order_code.toUpperCase() === orderCode.toUpperCase());
      return order ? assembleRecord(order) : null;
    },
    async getSignedUrlExpirySeconds() {
      return signedUrlExpirySetting;
    },
    async findOrderPaymentsByTransactionUuid(transactionUuid) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      return {
        order,
        payments: payments.filter((p) => p.order_id === order.id),
      };
    },
    async uploadPaymentProofAtomic({
      transactionUuid,
      paymentUuid,
      paymentMethod,
      paymentAccountId,
      processAndUploadProof,
    }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (order.production_status === PRODUCTION_STATUS.CANCELLED) {
        throw new AppError(
          'Pesanan yang sudah dibatalkan tidak dapat menerima bukti pembayaran.',
          409
        );
      }

      const payment = payments.find(
        (p) => p.payment_uuid === paymentUuid && p.order_id === order.id
      );
      if (!payment) return null;
      if (payment.status === PAYMENT_STATUS.VERIFIED) {
        throw new AppError('Pembayaran untuk tahap ini sudah terverifikasi.', 409);
      }

      if (paymentAccountId !== null) {
        const account = paymentAccounts.find((a) => a.id === paymentAccountId);
        if (!account || !account.is_active) {
          throw new AppError('Rekening atau QRIS pembayaran tidak ditemukan atau nonaktif.', 400);
        }
        if (account.method !== paymentMethod) {
          throw new AppError(
            `Metode pembayaran harus ${account.method === PAYMENT_METHOD.QRIS ? 'QRIS' : 'BANK_TRANSFER'} sesuai rekening yang dipilih.`,
            400
          );
        }
      }

      const uploaded = await processAndUploadProof(order.transaction_uuid, payment.payment_uuid);
      if (forceFailProofTx) {
        throw new AppError('Simulasi gagal commit database.', 500);
      }

      const previousProofPath = payment.proof_image_path;
      payment.payment_method = paymentMethod;
      payment.payment_account_id = paymentAccountId;
      payment.proof_image_path = uploaded.path;
      payment.status = PAYMENT_STATUS.PENDING;
      payment.rejection_reason = null;
      payment.proof_uploaded_at = new Date().toISOString();

      return {
        order,
        payment: { ...payment },
        previousProofPath,
      };
    },
  };

  const getSignedUrl = async (bucket: string, objectPath: string | null, expiresIn = 3600) => {
    if (!objectPath) return null;
    signedUrlTtlCalls.push({ bucket, path: objectPath, expiresIn });
    return `https://signed.example.test/${bucket}/${objectPath}?ttl=${expiresIn}`;
  };

  const orderService = createOrderService({
    orderRepo: repo,
    catalogRepo,
    storage: {
      upload: async (_bucket, filePath, buffer) => {
        uploadedProofs.set(filePath, buffer);
        return { id: filePath, path: filePath, fullPath: filePath };
      },
      download: async () => Buffer.alloc(0),
      move: async () => ({ message: 'ok' }),
      remove: async (_bucket, paths) => {
        const list = Array.isArray(paths) ? paths : [paths];
        for (const p of list) {
          uploadedProofs.delete(p);
          removedProofPaths.push(p);
        }
        return [];
      },
      getSignedUrl,
    },
    getPublicCatalogUrl: (p) => (p ? `https://cdn.example.test/catalog/${p}` : null),
  });

  const trackerService = createTrackerService({
    trackerRepo: repo,
    catalogRepo,
    orderService,
    getSignedUrl,
    getPublicCatalogUrl: (p) => (p ? `https://cdn.example.test/catalog/${p}` : null),
  });

  reset();

  return {
    orderShipUuid,
    orderManualUuid,
    dpPaymentUuid,
    settlementPaymentUuid,
    fullPaymentUuid,
    signedUrlTtlCalls,
    uploadedProofs,
    removedProofPaths,
    setForceFailProofTx: (val: boolean) => {
      forceFailProofTx = val;
    },
    getOrders: () => orders,
    getPayments: () => payments,
    trackerService,
    reset,
  };
}

describe('Tahap 4-1 — Backend Live Tracker', () => {
  const env = createTrackerTestEnv();
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const strictTestLimiter = rateLimit({
      windowMs: 60_000,
      max: 20,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          success: false,
          message: 'Terlalu banyak percobaan pelacakan pesanan. Silakan tunggu.',
          data: null,
        }),
    });

    app.use(
      '/api/track',
      createTrackerRouter({
        trackerService: env.trackerService,
        trackerLimiterMiddleware: strictTestLimiter,
        uploadLimiterMiddleware: (_req, _res, next) => next(),
      })
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/track`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    env.reset();
  });

  describe('Utilitas Masking, Normalisasi Kode, & 5 Tahap Produksi', () => {
    it('menyamarkan nama, nomor WhatsApp, dan lokasi kota/provinsi dengan aman', () => {
      expect(maskCustomerName('Budi Santoso')).toBe('B*** S******');
      expect(maskCustomerName('A')).toBe('*');
      expect(maskCustomerName(null)).toBe('Pelanggan');

      expect(maskWhatsApp('6281234567890')).toBe('628****7890');
      expect(maskWhatsApp('1234')).toBe('****');
      expect(maskWhatsApp(null)).toBe('****');

      expect(maskLocationSummary('Kota Batam', 'Kepulauan Riau')).toBe(
        'Kota Batam, Kepulauan Riau'
      );
      expect(maskLocationSummary(null, null)).toBeNull();

      expect(normalizeTrackerOrderCode('k7m2qx')).toBe('YNG-K7M2QX');
      expect(normalizeTrackerOrderCode(' YNG-k7m2qx ')).toBe('YNG-K7M2QX');
      expect(normalizeTrackerOrderCode('YNG-00000O')).toBeNull();
    });

    it('menyusun 5 tahap produksi termasuk dilewati pada pelunasan (FULL tanpa ongkir) & CANCELLED', () => {
      const skippedStages = buildProductionStages({
        productionStatus: PRODUCTION_STATUS.SHIPPING,
        fulfillmentType: FULFILLMENT_TYPE.PICKUP,
        remainingBalance: 0,
        payments: [],
        statusHistory: [
          {
            id: 1,
            order_id: 2,
            from_status: null,
            to_status: PRODUCTION_STATUS.NEW_ORDER,
            notes: null,
            created_at: '',
          },
          {
            id: 2,
            order_id: 2,
            from_status: PRODUCTION_STATUS.NEW_ORDER,
            to_status: PRODUCTION_STATUS.PRINT_QUEUE,
            notes: null,
            created_at: '',
          },
          {
            id: 3,
            order_id: 2,
            from_status: PRODUCTION_STATUS.PRINT_QUEUE,
            to_status: PRODUCTION_STATUS.PRESSING_QC,
            notes: null,
            created_at: '',
          },
          {
            id: 4,
            order_id: 2,
            from_status: PRODUCTION_STATUS.PRESSING_QC,
            to_status: PRODUCTION_STATUS.SHIPPING,
            notes: null,
            created_at: '',
          },
        ],
      });

      expect(skippedStages).toHaveLength(5);
      expect(skippedStages[3]?.key).toBe('AWAITING_SETTLEMENT');
      expect(skippedStages[3]?.state).toBe('skipped');
      expect(skippedStages[4]?.label).toBe('SIAP DIAMBIL');
      expect(skippedStages[4]?.state).toBe('current');

      const cancelledStages = buildProductionStages({
        productionStatus: PRODUCTION_STATUS.CANCELLED,
        fulfillmentType: FULFILLMENT_TYPE.SHIP,
        remainingBalance: 0,
        payments: [],
        statusHistory: [
          {
            id: 1,
            order_id: 1,
            from_status: null,
            to_status: PRODUCTION_STATUS.NEW_ORDER,
            notes: null,
            created_at: '',
          },
          {
            id: 2,
            order_id: 1,
            from_status: PRODUCTION_STATUS.NEW_ORDER,
            to_status: PRODUCTION_STATUS.PRINT_QUEUE,
            notes: null,
            created_at: '',
          },
          {
            id: 3,
            order_id: 1,
            from_status: PRODUCTION_STATUS.PRINT_QUEUE,
            to_status: PRODUCTION_STATUS.CANCELLED,
            notes: 'Dibatalkan',
            created_at: '',
          },
        ],
      });

      expect(cancelledStages.map((s) => s.state)).toEqual([
        'completed',
        'cancelled',
        'upcoming',
        'upcoming',
        'upcoming',
      ]);
    });
  });

  describe('Audit SQL orderModel untuk Tracker', () => {
    it('menggunakan UPPER(order_code) = $1 dan setting_key signed_url_expiry_seconds', async () => {
      const queries: Array<{ sql: string; params: unknown[] }> = [];
      const model = createOrderModel({
        query: (async <T extends QueryResultRow = QueryResultRow>(
          sql: string,
          params: unknown[] = []
        ): Promise<QueryResult<T>> => {
          queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
          if (sql.includes('signed_url_expiry_seconds')) {
            return makeQueryResult([{ setting_value: '1800' } as unknown as T]);
          }
          return makeQueryResult<T>([]);
        }) as typeof import('../src/config/database.js').query,
      });

      const missing = await model.findOrderDetailByOrderCode('yng-k7m2qx');
      expect(missing).toBeNull();
      expect(queries[0]?.sql).toContain('WHERE UPPER(order_code) = $1');
      expect(queries[0]?.params).toEqual(['YNG-K7M2QX']);

      const ttl = await model.getSignedUrlExpirySeconds();
      expect(ttl).toBe(1800);
      expect(queries[1]?.sql).toContain("setting_key = 'signed_url_expiry_seconds'");
    });
  });

  describe('POST /api/track (Lookup Kode Order + 4 Digit Akhir WA)', () => {
    it('menemukan order dengan kode 6 karakter / prefix YNG-, menyamarkan data PII, dan mengembalikan trackingUrl & 5 tahap', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'k7m2qx', whatsappLast4: '7890' }),
      });
      const body = (await res.json()) as { success: boolean; data: TrackerOrderDto };

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(body.success).toBe(true);
      expect(body.data.orderCode).toBe('YNG-K7M2QX');
      expect(body.data.customerNameMasked).toBe('B*** S******');
      expect(body.data.customerWhatsappMasked).toBe('628****7890');
      expect(body.data.addressSummaryMasked).toBe('Kota Batam, Kepulauan Riau');
      expect(body.data.stages).toHaveLength(5);
      expect(body.data.stages[3]?.state).toBe('current');
      expect(body.data.courierInfo?.code).toBe('JNE');
      expect(body.data.trackingUrl).toBe('https://www.jne.co.id/tracking-package');
      expect(body.data.paymentAccounts).toHaveLength(2);
      expect(body.data.qcPhotos).toHaveLength(2);
      expect(body.data.qcPhotos[0]?.photoUrl).toContain('?ttl=7200');
      expect(
        env.signedUrlTtlCalls.some(
          (c) => c.bucket === STORAGE_BUCKETS.QC_PHOTOS && c.expiresIn === 7200
        )
      ).toBe(true);

      // Pastikan data sensitif / internal id TIDAK pernah muncul dalam JSON respons publik
      const rawRecord = body.data as unknown as Record<string, unknown>;
      expect(rawRecord.id).toBeUndefined();
      expect(rawRecord.userId).toBeUndefined();
      expect(rawRecord.fullAddress).toBeUndefined();
      expect(rawRecord.districtName).toBeUndefined();
      expect(rawRecord.postalCode).toBeUndefined();
      expect(rawRecord.adminNotes).toBeUndefined();
      expect(JSON.stringify(body.data)).not.toContain('Jl. Rahasia Rumah No. 99');
      expect(JSON.stringify(body.data)).not.toContain('Catatan internal rahasia admin');
    });

    it('menangani order manual tanpa alamat (NULL) dan menyamakan respons gagal 404 tanpa membocorkan kode', async () => {
      const manualRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'YNG-M4NU49', whatsappLast4: '6655' }),
      });
      const manualBody = (await manualRes.json()) as { data: TrackerOrderDto };
      expect(manualRes.status).toBe(200);
      expect(manualBody.data.addressSummaryMasked).toBeNull();
      expect(manualBody.data.paymentAccounts).toEqual([]); // sudah lunas penuh

      // Kode salah vs kode benar dengan 4 digit WA salah harus membalas pesan identik
      const wrongCodeRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'YNG-ZZZZZ9', whatsappLast4: '7890' }),
      });
      const wrongWaRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'YNG-K7M2QX', whatsappLast4: '0000' }),
      });

      const wrongCodeBody = (await wrongCodeRes.json()) as { message: string };
      const wrongWaBody = (await wrongWaRes.json()) as { message: string };
      expect(wrongCodeRes.status).toBe(404);
      expect(wrongWaRes.status).toBe(404);
      expect(wrongCodeBody.message).toBe(wrongWaBody.message);

      // Validasi format input tidak sah -> 400
      const invalidRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'AB', whatsappLast4: '12' }),
      });
      expect(invalidRes.status).toBe(400);
    });
  });

  describe('GET /api/track/:uuid (Magic Link)', () => {
    it('mengembalikan detail tracker tersamarkan + signed URL QC & menolak UUID tidak ditemukan/invalid', async () => {
      const okRes = await fetch(`${baseUrl}/${env.orderShipUuid}`);
      const okBody = (await okRes.json()) as { data: TrackerOrderDto };
      expect(okRes.status).toBe(200);
      expect(okRes.headers.get('cache-control')).toBe('no-store');
      expect(okBody.data.transactionUuid).toBe(env.orderShipUuid);
      expect(okBody.data.qcPhotos).toHaveLength(2);
      expect(okBody.data.discountAmount).toBe(80000);
      expect(okBody.data.discountNote).toBe('Promo komunitas');

      expect((await fetch(`${baseUrl}/99999999-9999-4999-8999-999999999999`)).status).toBe(404);
      expect((await fetch(`${baseUrl}/bukan-uuid`)).status).toBe(400);
    });
  });

  describe('POST /api/track/:uuid/payments/:paymentUuid/proof (Upload Bukti Tagihan Lanjutan)', () => {
    it('menerima upload bukti pelunasan/ongkir via magic link maupun kode+WA, tolak verifikasi salah & bersihkan file jika DB gagal', async () => {
      const pngBuffer = await sharp({
        create: { width: 120, height: 120, channels: 3, background: '#111111' },
      })
        .png()
        .toBuffer();

      // 1. Jika kode+WA disertakan tapi salah -> ditolak 404 tanpa upload ke storage
      const badVerifyForm = new FormData();
      badVerifyForm.append('paymentMethod', PAYMENT_METHOD.QRIS);
      badVerifyForm.append('paymentAccountId', '2');
      badVerifyForm.append('code', 'YNG-K7M2QX');
      badVerifyForm.append('whatsappLast4', '0000');
      badVerifyForm.append(
        'file',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'pelunasan.png'
      );
      const badVerifyRes = await fetch(
        `${baseUrl}/${env.orderShipUuid}/payments/${env.settlementPaymentUuid}/proof`,
        { method: 'POST', body: badVerifyForm }
      );
      expect(badVerifyRes.status).toBe(404);
      expect(env.uploadedProofs.size).toBe(0);

      // 2. Upload tagihan pelunasan valid dengan kode + 4 digit WA yang cocok
      const okForm = new FormData();
      okForm.append('paymentMethod', PAYMENT_METHOD.QRIS);
      okForm.append('paymentAccountId', '2');
      okForm.append('code', 'k7m2qx');
      okForm.append('whatsappLast4', '7890');
      okForm.append(
        'file',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'pelunasan.png'
      );
      const okRes = await fetch(
        `${baseUrl}/${env.orderShipUuid}/payments/${env.settlementPaymentUuid}/proof`,
        { method: 'POST', body: okForm }
      );
      const okBody = (await okRes.json()) as { data: UploadPaymentProofResultDto };
      expect(okRes.status).toBe(200);
      expect(okRes.headers.get('cache-control')).toBe('no-store');
      expect(okBody.data.payment.paymentStage).toBe(PAYMENT_STAGE.SETTLEMENT);
      expect(okBody.data.payment.hasProof).toBe(true);
      expect(env.uploadedProofs.size).toBe(1);

      // 3. Jika DB transaksi gagal setelah file terunggah -> file baru dibersihkan otomatis
      env.setForceFailProofTx(true);
      const failTxForm = new FormData();
      failTxForm.append('paymentMethod', PAYMENT_METHOD.BANK_TRANSFER);
      failTxForm.append('paymentAccountId', '1');
      failTxForm.append(
        'file',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'gagal-tx.png'
      );
      const failTxRes = await fetch(
        `${baseUrl}/${env.orderShipUuid}/payments/${env.settlementPaymentUuid}/proof`,
        { method: 'POST', body: failTxForm }
      );
      expect(failTxRes.status).toBe(500);
      // Hanya 1 file dari upload #2 yang bertahan; file upload #3 langsung terhapus via rollback cleanup
      expect(env.uploadedProofs.size).toBe(1);
      expect(env.removedProofPaths.length).toBeGreaterThanOrEqual(1);
      env.setForceFailProofTx(false);

      // 4. File palsu / tahap sudah VERIFIED ditolak
      const fakeForm = new FormData();
      fakeForm.append('paymentMethod', PAYMENT_METHOD.QRIS);
      fakeForm.append('paymentAccountId', '2');
      fakeForm.append('file', new Blob([Buffer.from('bukan-png')], { type: 'image/png' }), 'x.png');
      expect(
        (
          await fetch(
            `${baseUrl}/${env.orderShipUuid}/payments/${env.settlementPaymentUuid}/proof`,
            { method: 'POST', body: fakeForm }
          )
        ).status
      ).toBe(400);

      const verifiedForm = new FormData();
      verifiedForm.append('paymentMethod', PAYMENT_METHOD.QRIS);
      verifiedForm.append('paymentAccountId', '2');
      verifiedForm.append(
        'file',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'dp-lagi.png'
      );
      expect(
        (
          await fetch(`${baseUrl}/${env.orderShipUuid}/payments/${env.dpPaymentUuid}/proof`, {
            method: 'POST',
            body: verifiedForm,
          })
        ).status
      ).toBe(409);
    });

    it('menerapkan rate limiting 429 pada endpoint tracker publik', async () => {
      let lastStatus = 200;
      for (let i = 0; i < 21; i += 1) {
        const res = await fetch(`${baseUrl}/${env.orderShipUuid}`);
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
    });
  });
});
