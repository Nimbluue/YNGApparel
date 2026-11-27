import crypto from 'node:crypto';
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
  type CreateOrderRequestDto,
  type OrderDetailDto,
  type OrderPaymentsResponseDto,
  type OrderSummaryDto,
  type PaginationMeta,
  type UploadPaymentProofResultDto,
} from '@yng/shared';
import express, { type RequestHandler } from 'express';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CartItemRow } from '../src/models/cartModel.js';
import type { PricingLookupIds, PricingReferenceData } from '../src/models/catalogModel.js';
import type {
  FabricColorRow,
  FabricRow,
  GarmentModelRow,
  PaymentAccountRow,
  PrintSizeRow,
  SizeRow,
} from '../src/models/masterModel.js';
import type {
  OrderDetailRecord,
  OrderItemPrintRow,
  OrderItemRow,
  OrderItemSizeRow,
  OrderPaymentRow,
  OrderRepository,
  OrderRow,
  OrderStatusHistoryRow,
  OrderSummaryRow,
} from '../src/models/orderModel.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { STORAGE_BUCKETS } = await import('../src/config/constants.js');
const { AppError, errorHandler, notFoundHandler } =
  await import('../src/middleware/errorHandler.js');
const { createOrderModel, buildDesignTransferPlans } = await import('../src/models/orderModel.js');
const { createAccountRouter } = await import('../src/routes/accountRoutes.js');
const { createOrderRouter } = await import('../src/routes/orderRoutes.js');
const { createOrderService } = await import('../src/services/orderService.js');
const { calculateQuoteFromReferenceData, resolveInitialPaymentRequirement } =
  await import('../src/services/pricingService.js');
const { generateOrderCode } = await import('../src/utils/orderCode.js');
const { normalizeWhatsApp } = await import('../src/utils/phone.js');

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

interface SavedAddressRecord {
  address_uuid: string;
  user_id: number;
  recipient_name: string;
  recipient_whatsapp: string;
  province_name: string;
  city_name: string;
  district_name: string;
  postal_code: string;
  full_address: string;
}

function makeQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

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
        category_id: null,
        collection_id: null,
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

  let paymentAccounts: PaymentAccountRow[] = [];
  let cartRows: CartItemRow[] = [];
  let addresses: SavedAddressRecord[] = [];
  let orders: OrderRow[] = [];
  let orderItems: OrderItemRow[] = [];
  let orderItemSizes: OrderItemSizeRow[] = [];
  let orderItemPrints: OrderItemPrintRow[] = [];
  let payments: OrderPaymentRow[] = [];
  let statusHistory: OrderStatusHistoryRow[] = [];

  const settings = {
    dpMinQty: 12,
    dpPercent: 70,
    paymentDueHours: 24,
  };

  let nextId = 1;
  const designFiles = new Map<string, Buffer>();
  const proofFiles = new Map<string, Buffer>();
  const removedProofPaths: string[] = [];

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
    async listActivePaymentAccounts(): Promise<PaymentAccountRow[]> {
      return paymentAccounts.filter((acc) => acc.is_active);
    },
  };

  const orderRepo: OrderRepository = {
    async createWebsiteOrderAtomic({
      userId,
      idempotencyKey,
      payload,
      catalogRepo: repo,
      executeDesignTransfers,
    }) {
      const user = userId === USER_A.id ? USER_A : userId === USER_B.id ? USER_B : null;
      if (!user) {
        throw new AppError('Akun pengguna tidak ditemukan atau tidak aktif.', 401);
      }

      if (idempotencyKey) {
        const existing = orders.find((o) => o.idempotency_key === idempotencyKey);
        if (existing) {
          if (existing.user_id !== userId) {
            throw new AppError('Idempotency-Key sudah digunakan.', 409);
          }
          return { transactionUuid: existing.transaction_uuid, deduplicated: true };
        }
      }

      const uniqueUuids = [...new Set(payload.cartItemUuids)];
      const selectedCarts = cartRows.filter(
        (c) => c.user_id === userId && uniqueUuids.includes(c.cart_item_uuid)
      );
      if (selectedCarts.length !== uniqueUuids.length) {
        throw new AppError(
          'Sebagian item keranjang yang dipilih tidak ditemukan atau bukan milik Anda.',
          404
        );
      }

      let customerName = user.fullName;
      let customerWhatsapp = user.whatsapp;
      let provinceName: string | null = null;
      let cityName: string | null = null;
      let districtName: string | null = null;
      let postalCode: string | null = null;
      let fullAddress: string | null = null;

      if (payload.fulfillmentType === FULFILLMENT_TYPE.SHIP) {
        if (payload.addressUuid) {
          const addr = addresses.find(
            (a) => a.address_uuid === payload.addressUuid && a.user_id === userId
          );
          if (!addr) {
            throw new AppError('Alamat tersimpan tidak ditemukan.', 404);
          }
          customerName = addr.recipient_name;
          customerWhatsapp = addr.recipient_whatsapp;
          provinceName = addr.province_name;
          cityName = addr.city_name;
          districtName = addr.district_name;
          postalCode = addr.postal_code;
          fullAddress = addr.full_address;
        } else if (payload.address) {
          const normalized = normalizeWhatsApp(payload.address.recipientWhatsapp);
          if (!normalized) {
            throw new AppError(
              'Nomor WhatsApp penerima harus berformat 62xxxxxxxxxx atau 08xxxxxxxxxx.',
              400
            );
          }
          customerName = payload.address.recipientName.trim();
          customerWhatsapp = normalized;
          provinceName = payload.address.provinceName.trim();
          cityName = payload.address.cityName.trim();
          districtName = payload.address.districtName.trim();
          postalCode = payload.address.postalCode.trim();
          fullAddress = payload.address.fullAddress.trim();
        } else {
          throw new AppError(
            'Pilih alamat tersimpan atau isi alamat pengiriman lengkap untuk opsi Kirim.',
            400
          );
        }
      } else {
        const normalized = normalizeWhatsApp(payload.pickupWhatsapp ?? user.whatsapp);
        if (!normalized) {
          throw new AppError('Nomor WhatsApp tidak valid.', 400);
        }
        customerName = (payload.pickupName ?? user.fullName).trim();
        customerWhatsapp = normalized;
      }

      const refData = await repo.loadPricingReferenceData({
        modelIds: selectedCarts.map((c) => c.model_id),
        fabricIds: selectedCarts.map((c) => c.fabric_id),
        fabricColorIds: [],
        sizeIds: [],
        printSizeIds: [],
      });

      const quote = calculateQuoteFromReferenceData(
        {
          items: selectedCarts.map((row) => ({
            modelId: row.model_id,
            fabricId: row.fabric_id,
            isCustomColor: row.config.isCustomColor,
            fabricColorId: row.config.fabricColorId,
            colorName: row.config.colorName,
            colorHex: row.config.colorHex,
            sizes: row.config.sizes,
            prints: (row.config.prints ?? []).map((p) => ({
              printSizeId: p.printSizeId,
              printPosition: p.printPosition,
            })),
          })),
        },
        refData
      );

      const paymentReq = resolveInitialPaymentRequirement(quote, payload.paymentScheme);
      const orderId = nextId++;
      const transactionUuid = crypto.randomUUID();
      const orderCode = generateOrderCode();
      const createdAt = new Date().toISOString();
      const dueAt = new Date(Date.now() + settings.paymentDueHours * 3600 * 1000).toISOString();

      const newOrder: OrderRow = {
        id: orderId,
        transaction_uuid: transactionUuid,
        order_code: orderCode,
        user_id: userId,
        source: ORDER_SOURCE.WEBSITE,
        idempotency_key: idempotencyKey,
        customer_name: customerName,
        customer_whatsapp: customerWhatsapp,
        fulfillment_type: payload.fulfillmentType,
        province_name: provinceName,
        city_name: cityName,
        district_name: districtName,
        postal_code: postalCode,
        full_address: fullAddress,
        total_qty: quote.totalQty,
        dp_min_qty_snapshot: quote.dpMinQty,
        is_dp_eligible: quote.dpEligible,
        payment_scheme: paymentReq.paymentScheme,
        dp_percent_snapshot: paymentReq.dpPercentSnapshot,
        subtotal_amount: quote.subtotalAmount,
        discount_amount: 0,
        discount_note: null,
        shipping_cost: 0,
        grand_total: quote.subtotalAmount,
        dp_required_amount: paymentReq.dpRequiredAmount,
        remaining_balance: quote.subtotalAmount,
        refunded_amount: 0,
        production_status: PRODUCTION_STATUS.NEW_ORDER,
        design_status: DESIGN_STATUS.PENDING,
        design_review_notes: null,
        admin_notes: null,
        estimated_finish_date: null,
        shipping_courier: null,
        shipping_service: null,
        tracking_receipt_number: null,
        shipped_at: null,
        payment_due_at: dueAt,
        cancelled_reason: null,
        cancelled_at: null,
        completed_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      };

      const stagedItems: OrderItemRow[] = [];
      const stagedSizes: OrderItemSizeRow[] = [];
      const stagedPrints: OrderItemPrintRow[] = [];
      const transfersByFromPath = new Map<string, string>();

      for (let i = 0; i < selectedCarts.length; i += 1) {
        const cartRow = selectedCarts[i]!;
        const breakdown = quote.items[i]!;
        const itemId = nextId++;
        const needsDesignHelp = (cartRow.config.prints ?? []).some((p) => p.needsDesignHelp);

        stagedItems.push({
          id: itemId,
          order_id: orderId,
          model_id: breakdown.modelId,
          fabric_id: breakdown.fabricId,
          model_name: breakdown.modelName,
          fabric_name: breakdown.fabricName,
          fabric_color_id: breakdown.fabricColorId,
          is_custom_color: breakdown.isCustomColor,
          color_name: breakdown.colorName,
          color_hex: breakdown.colorHex,
          needs_design_help: needsDesignHelp,
          production_notes: cartRow.config.productionNotes ?? null,
          locked_base_price: breakdown.basePrice,
          locked_fabric_price: breakdown.fabricAdditionalPrice,
          item_qty: breakdown.itemQty,
          line_subtotal: breakdown.lineSubtotal,
        });

        for (const s of breakdown.sizes) {
          stagedSizes.push({
            id: nextId++,
            order_item_id: itemId,
            size_id: s.sizeId,
            size_code: s.sizeCode,
            qty: s.qty,
            locked_extra_charge: s.extraCharge,
          });
        }

        const cfgPrints = cartRow.config.prints ?? [];
        for (let pIdx = 0; pIdx < breakdown.prints.length; pIdx += 1) {
          const printBreakdown = breakdown.prints[pIdx]!;
          const cfgPrint = cfgPrints[pIdx];
          let targetPath: string | null = null;
          let designFileName: string | null = null;

          if (cfgPrint && !cfgPrint.needsDesignHelp && cfgPrint.fileRef) {
            const filename = cfgPrint.fileRef.split('/').pop() ?? 'design.png';
            targetPath =
              transfersByFromPath.get(cfgPrint.fileRef) ?? `orders/${transactionUuid}/${filename}`;
            designFileName = cfgPrint.fileName ?? filename;
            if (!transfersByFromPath.has(cfgPrint.fileRef)) {
              transfersByFromPath.set(cfgPrint.fileRef, targetPath);
            }
          }

          stagedPrints.push({
            id: nextId++,
            order_item_id: itemId,
            print_size_id: printBreakdown.printSizeId,
            print_size_code: printBreakdown.printSizeCode,
            print_position: printBreakdown.printPosition,
            raw_design_file_path: targetPath,
            design_file_name: designFileName,
            locked_spot_price: printBreakdown.pricePerSpot,
          });
        }
      }

      const remainingCarts = cartRows.filter(
        (c) => !(c.user_id === userId && uniqueUuids.includes(c.cart_item_uuid))
      );
      const transferPlans = buildDesignTransferPlans(
        transfersByFromPath,
        remainingCarts.map((c) => c.config)
      );

      // Pindahkan/salin file sebelum commit akhir (mensimulasikan rollback bila storage gagal)
      await executeDesignTransfers(transferPlans);

      orders.push(newOrder);
      orderItems.push(...stagedItems);
      orderItemSizes.push(...stagedSizes);
      orderItemPrints.push(...stagedPrints);
      payments.push({
        id: nextId++,
        payment_uuid: crypto.randomUUID(),
        order_id: orderId,
        payment_stage:
          paymentReq.paymentScheme === PAYMENT_SCHEME.DP ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL,
        payment_method: null,
        payment_account_id: null,
        amount: paymentReq.dpRequiredAmount,
        proof_image_path: null,
        status: PAYMENT_STATUS.PENDING,
        rejection_reason: null,
        proof_uploaded_at: null,
        verified_at: null,
        created_at: createdAt,
      });
      statusHistory.push({
        id: nextId++,
        order_id: orderId,
        from_status: null,
        to_status: PRODUCTION_STATUS.NEW_ORDER,
        notes: 'Pesanan dibuat dari keranjang website.',
        created_at: createdAt,
      });
      cartRows = remainingCarts;

      return { transactionUuid, deduplicated: false };
    },

    async listOrdersByUser(userId, { page, limit }) {
      const userOrders = orders.filter((o) => o.user_id === userId).sort((a, b) => b.id - a.id);
      const total = userOrders.length;
      const offset = (page - 1) * limit;
      const sliced = userOrders.slice(offset, offset + limit);

      const rows: OrderSummaryRow[] = sliced.map((o) => {
        const expectedStage = o.payment_scheme === 'DP' ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
        const initPay = payments.find(
          (p) => p.order_id === o.id && p.payment_stage === expectedStage
        );
        return {
          transaction_uuid: o.transaction_uuid,
          order_code: o.order_code,
          fulfillment_type: o.fulfillment_type,
          total_qty: o.total_qty,
          payment_scheme: o.payment_scheme,
          dp_percent_snapshot: o.dp_percent_snapshot,
          grand_total: o.grand_total,
          dp_required_amount: o.dp_required_amount,
          remaining_balance: o.remaining_balance,
          production_status: o.production_status,
          design_status: o.design_status,
          initial_payment_status: initPay?.status ?? null,
          initial_payment_has_proof: Boolean(initPay?.proof_image_path),
          payment_due_at: o.payment_due_at,
          created_at: o.created_at,
        };
      });

      return { rows, total };
    },

    async findOrderDetailByUuid(transactionUuid, userId): Promise<OrderDetailRecord | null> {
      const order = orders.find(
        (o) =>
          o.transaction_uuid === transactionUuid && (userId === undefined || o.user_id === userId)
      );
      if (!order) return null;

      const items = orderItems.filter((i) => i.order_id === order.id);
      const itemIdSet = new Set(items.map((i) => i.id));
      return {
        order,
        items,
        itemSizes: orderItemSizes.filter((s) => itemIdSet.has(s.order_item_id)),
        itemPrints: orderItemPrints.filter((p) => itemIdSet.has(p.order_item_id)),
        payments: payments.filter((p) => p.order_id === order.id),
        qcPhotos: [],
        statusHistory: statusHistory.filter((h) => h.order_id === order.id),
      };
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

  const getBucketMap = (bucket: string) =>
    bucket === STORAGE_BUCKETS.PAYMENT_PROOFS ? proofFiles : designFiles;

  const orderService = createOrderService({
    orderRepo,
    catalogRepo,
    storage: {
      upload: async (bucket, filePath, buffer) => {
        getBucketMap(bucket).set(filePath, buffer);
        return { id: filePath, path: filePath, fullPath: filePath };
      },
      download: async (bucket, filePath) => {
        const buf = getBucketMap(bucket).get(filePath);
        if (!buf) {
          throw new Error(`Objek tidak ditemukan: ${bucket}/${filePath}`);
        }
        return buf;
      },
      move: async (bucket, fromPath, toPath) => {
        const map = getBucketMap(bucket);
        const buf = map.get(fromPath);
        if (!buf) {
          throw new Error(`Objek sumber tidak ditemukan untuk move: ${fromPath}`);
        }
        map.delete(fromPath);
        map.set(toPath, buf);
        return { message: 'Moved' };
      },
      remove: async (bucket, paths) => {
        const map = getBucketMap(bucket);
        const arr = Array.isArray(paths) ? paths : [paths];
        for (const p of arr) {
          map.delete(p);
          if (bucket === STORAGE_BUCKETS.PAYMENT_PROOFS) {
            removedProofPaths.push(p);
          }
        }
        return [];
      },
      getSignedUrl: async (bucket, filePath) =>
        filePath ? `https://signed.example.test/${bucket}/${filePath}` : null,
    },
    getPublicCatalogUrl: (filePath) =>
      filePath ? `https://cdn.example.test/catalog/${filePath}` : null,
  });

  function seedDefaultPaymentAccounts() {
    paymentAccounts = [
      {
        id: 1,
        method: PAYMENT_METHOD.BANK_TRANSFER,
        provider_name: 'BCA',
        account_number: '1234567890',
        account_holder: 'PT YNG Apparel Batam',
        qr_image_path: null,
        instructions: 'Tambahkan kode order pada berita transfer.',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 2,
        method: PAYMENT_METHOD.QRIS,
        provider_name: 'QRIS YNG Studio',
        account_number: null,
        account_holder: 'YNG Apparel',
        qr_image_path: 'qris/qris-aktif.png',
        instructions: 'Scan QRIS lalu unggah bukti transfer.',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 3,
        method: PAYMENT_METHOD.BANK_TRANSFER,
        provider_name: 'Mandiri Lama',
        account_number: '0000000000',
        account_holder: 'Arsip',
        qr_image_path: null,
        instructions: null,
        is_active: false,
        created_at: now,
        updated_at: now,
      },
    ];
  }

  function addCartRow(input: {
    userId: number;
    qtyM: number;
    qtyXxl?: number;
    fileRef?: string | null;
    needsDesignHelp?: boolean;
    printPosition?: CartItemRow['config']['prints'][number]['printPosition'];
  }): CartItemRow {
    const id = nextId++;
    const sizesCfg = [{ sizeId: 1, qty: input.qtyM }];
    if (input.qtyXxl && input.qtyXxl > 0) {
      sizesCfg.push({ sizeId: 2, qty: input.qtyXxl });
    }
    const printsCfg =
      input.fileRef || input.needsDesignHelp
        ? [
            {
              printSizeId: 1,
              printPosition: input.printPosition ?? PRINT_POSITION.FRONT_CENTER,
              needsDesignHelp: Boolean(input.needsDesignHelp),
              fileRef: input.needsDesignHelp ? null : (input.fileRef ?? null),
              fileName: input.needsDesignHelp ? null : 'logo-depan.png',
            },
          ]
        : [];

    const row: CartItemRow = {
      id,
      cart_item_uuid: crypto.randomUUID(),
      user_id: input.userId,
      model_id: 1,
      fabric_id: 10,
      config: {
        isCustomColor: false,
        fabricColorId: 100,
        colorName: null,
        colorHex: null,
        sizes: sizesCfg,
        prints: printsCfg,
        productionNotes: 'Jahit rapi',
      },
      config_version: 1,
      created_at: now,
      updated_at: now,
    };
    cartRows.push(row);
    return row;
  }

  function addSavedAddress(userId: number): SavedAddressRecord {
    const record: SavedAddressRecord = {
      address_uuid: crypto.randomUUID(),
      user_id: userId,
      recipient_name: 'Rafi Pratama',
      recipient_whatsapp: '6281122334455',
      province_name: 'Kepulauan Riau',
      city_name: 'Kota Batam',
      district_name: 'Batam Kota',
      postal_code: '29444',
      full_address: 'Jl. Engku Putri No. 12',
    };
    addresses.push(record);
    return record;
  }

  const reset = () => {
    models.get(1)!.base_price = 65000;
    models.get(1)!.is_active = true;
    fabrics.get(10)!.is_active = true;
    settings.dpMinQty = 12;
    settings.dpPercent = 70;
    settings.paymentDueHours = 24;
    cartRows = [];
    addresses = [];
    orders = [];
    orderItems = [];
    orderItemSizes = [];
    orderItemPrints = [];
    payments = [];
    statusHistory = [];
    designFiles.clear();
    proofFiles.clear();
    removedProofPaths.length = 0;
    nextId = 1;
    seedDefaultPaymentAccounts();
  };

  reset();

  return {
    models,
    fabrics,
    settings,
    designFiles,
    proofFiles,
    removedProofPaths,
    orderService,
    getCartRows: () => cartRows,
    getOrders: () => orders,
    getPayments: () => payments,
    addCartRow,
    addSavedAddress,
    reset,
  };
}

describe('Tahap 3b-1 — Backend Order dari Keranjang & Pembayaran Awal', () => {
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
      '/api/orders',
      createOrderRouter({
        orderService: env.orderService,
        requireAuthMiddleware: mockAuthMiddleware,
        uploadLimiterMiddleware: (_req, _res, next) => next(),
      })
    );
    app.use(
      '/api/me',
      createAccountRouter({
        orderService: env.orderService,
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

  describe('Audit SQL & Transaksi orderModel (tanpa PostgreSQL asli)', () => {
    it('memakai kolom setting_key/setting_value pada app_settings, retry 23505 order_code, hapus item terbeli, dan deduplikasi fileRef', async () => {
      const executedQueries: Array<{ sql: string; params: unknown[] }> = [];
      let orderInsertAttempts = 0;

      const sharedFileRef = `carts/${USER_A.userUuid}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png`;
      const cartUuid = 'cccccccc-cccc-4ccc-8ccc-000000000001';
      const createdTxUuid = 'dddddddd-dddd-4ddd-8ddd-000000000001';

      const mockClient = {
        async query<T extends QueryResultRow = QueryResultRow>(
          sql: string,
          params: unknown[] = []
        ): Promise<QueryResult<T>> {
          executedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });

          if (sql.includes('FROM users')) {
            return makeQueryResult([
              {
                id: USER_A.id,
                user_uuid: USER_A.userUuid,
                full_name: USER_A.fullName,
                whatsapp: USER_A.whatsapp,
              } as unknown as T,
            ]);
          }
          if (sql.includes('FROM orders') && sql.includes('idempotency_key')) {
            return makeQueryResult<T>([]);
          }
          if (sql.includes('FROM cart_items') && sql.includes('FOR UPDATE')) {
            const cartRow: CartItemRow = {
              id: 50,
              cart_item_uuid: cartUuid,
              user_id: USER_A.id,
              model_id: 1,
              fabric_id: 10,
              config: {
                isCustomColor: false,
                fabricColorId: 100,
                colorName: null,
                colorHex: null,
                sizes: [{ sizeId: 1, qty: 2 }],
                prints: [
                  {
                    printSizeId: 1,
                    printPosition: PRINT_POSITION.FRONT_CENTER,
                    needsDesignHelp: false,
                    fileRef: sharedFileRef,
                    fileName: 'depan.png',
                  },
                  {
                    printSizeId: 1,
                    printPosition: PRINT_POSITION.BACK_CENTER,
                    needsDesignHelp: false,
                    fileRef: sharedFileRef,
                    fileName: 'belakang.png',
                  },
                ],
                productionNotes: null,
              },
              config_version: 1,
              created_at: '2026-11-25T10:00:00.000Z',
              updated_at: '2026-11-25T10:00:00.000Z',
            };
            return makeQueryResult([cartRow as unknown as T]);
          }
          if (sql.includes('FROM app_settings')) {
            return makeQueryResult([{ setting_value: '48' } as unknown as T]);
          }
          if (sql.includes('INSERT INTO orders')) {
            orderInsertAttempts += 1;
            if (orderInsertAttempts === 1) {
              const dupErr = Object.assign(new Error('duplicate order_code'), {
                code: '23505',
                constraint: 'orders_order_code_key',
              });
              throw dupErr;
            }
            return makeQueryResult([
              {
                id: 901,
                transaction_uuid: createdTxUuid,
                order_code: 'YNG-234567',
              } as unknown as T,
            ]);
          }
          if (sql.includes('INSERT INTO order_items')) {
            return makeQueryResult([{ id: 701 } as unknown as T]);
          }
          if (sql.includes('SELECT config') && sql.includes('FROM cart_items')) {
            return makeQueryResult<T>([]);
          }
          return makeQueryResult<T>([]);
        },
      } as unknown as PoolClient;

      const model = createOrderModel({
        query: (async () =>
          makeQueryResult([])) as typeof import('../src/config/database.js').query,
        withTransaction: async <T>(fn: (client: PoolClient) => Promise<T>) => fn(mockClient),
      });

      const recordedTransfers: Array<{ fromPath: string; toPath: string; mode: string }> = [];

      const res = await model.createWebsiteOrderAtomic({
        userId: USER_A.id,
        idempotencyKey: null,
        payload: {
          cartItemUuids: [cartUuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        },
        catalogRepo: {
          async loadPricingReferenceData(): Promise<PricingReferenceData> {
            return {
              modelsById: env.models,
              fabricsById: env.fabrics,
              compatibleModelFabrics: new Set(['1:10']),
              fabricColorsById: new Map([
                [
                  100,
                  {
                    id: 100,
                    fabric_id: 10,
                    color_name: 'Hitam',
                    color_hex: '#111111',
                    sort_order: 1,
                    is_active: true,
                  },
                ],
              ]),
              sizesById: new Map([
                [1, { id: 1, code: 'M', sort_order: 1, extra_charge: 0, is_active: true }],
              ]),
              printSizesById: new Map([
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
              ]),
              dpMinQty: 12,
              dpPercent: 70,
            };
          },
        },
        executeDesignTransfers: async (plans) => {
          recordedTransfers.push(...plans);
        },
      });

      expect(res).toEqual({ transactionUuid: createdTxUuid, deduplicated: false });
      expect(orderInsertAttempts).toBe(2);

      // Pastikan query app_settings memakai kolom setting_key & setting_value (bukan key/value)
      const settingsQuery = executedQueries.find((q) => q.sql.includes('FROM app_settings'));
      expect(settingsQuery?.sql).toContain('SELECT setting_value FROM app_settings');
      expect(settingsQuery?.sql).toContain("WHERE setting_key = 'initial_payment_due_hours'");
      // Parameter ke-22 (paymentDueHours) berasal dari setting_value = '48'
      const secondInsertOrder = executedQueries.filter((q) =>
        q.sql.includes('INSERT INTO orders')
      )[1];
      expect(secondInsertOrder?.params[21]).toBe(48);

      // Pastikan fileRef kembar pada 2 titik sablon hanya ditransfer sekali (mode move)
      expect(recordedTransfers).toEqual([
        {
          fromPath: sharedFileRef,
          toPath: `orders/${createdTxUuid}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png`,
          mode: 'move',
        },
      ]);

      // Pastikan item terbeli dihapus di dalam transaksi
      const deleteQuery = executedQueries.find((q) => q.sql.includes('DELETE FROM cart_items'));
      expect(deleteQuery).toBeDefined();
      expect(deleteQuery?.params).toEqual([USER_A.id, [cartUuid]]);
    });

    it('menolak fileRef dari luar folder carts/<user_uuid>/ dengan 400', async () => {
      const foreignFileRef = `carts/${USER_B.userUuid}/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png`;
      const cartUuid = 'cccccccc-cccc-4ccc-8ccc-000000000002';

      const mockClient = {
        async query<T extends QueryResultRow = QueryResultRow>(
          sql: string
        ): Promise<QueryResult<T>> {
          if (sql.includes('FROM users')) {
            return makeQueryResult([
              {
                id: USER_A.id,
                user_uuid: USER_A.userUuid,
                full_name: USER_A.fullName,
                whatsapp: USER_A.whatsapp,
              } as unknown as T,
            ]);
          }
          if (sql.includes('FROM cart_items') && sql.includes('FOR UPDATE')) {
            const cartRow: CartItemRow = {
              id: 51,
              cart_item_uuid: cartUuid,
              user_id: USER_A.id,
              model_id: 1,
              fabric_id: 10,
              config: {
                isCustomColor: false,
                fabricColorId: 100,
                colorName: null,
                colorHex: null,
                sizes: [{ sizeId: 1, qty: 1 }],
                prints: [
                  {
                    printSizeId: 1,
                    printPosition: PRINT_POSITION.FRONT_CENTER,
                    needsDesignHelp: false,
                    fileRef: foreignFileRef,
                    fileName: 'curi.png',
                  },
                ],
                productionNotes: null,
              },
              config_version: 1,
              created_at: '2026-11-25T10:00:00.000Z',
              updated_at: '2026-11-25T10:00:00.000Z',
            };
            return makeQueryResult([cartRow as unknown as T]);
          }
          if (sql.includes('FROM app_settings')) {
            return makeQueryResult([{ setting_value: '24' } as unknown as T]);
          }
          if (sql.includes('INSERT INTO orders')) {
            return makeQueryResult([
              {
                id: 902,
                transaction_uuid: 'dddddddd-dddd-4ddd-8ddd-000000000002',
                order_code: 'YNG-777888',
              } as unknown as T,
            ]);
          }
          if (sql.includes('INSERT INTO order_items')) {
            return makeQueryResult([{ id: 702 } as unknown as T]);
          }
          return makeQueryResult<T>([]);
        },
      } as unknown as PoolClient;

      const model = createOrderModel({
        withTransaction: async <T>(fn: (client: PoolClient) => Promise<T>) => fn(mockClient),
      });

      await expect(
        model.createWebsiteOrderAtomic({
          userId: USER_A.id,
          idempotencyKey: null,
          payload: {
            cartItemUuids: [cartUuid],
            fulfillmentType: FULFILLMENT_TYPE.PICKUP,
            paymentScheme: PAYMENT_SCHEME.FULL,
          },
          catalogRepo: {
            async loadPricingReferenceData(): Promise<PricingReferenceData> {
              return {
                modelsById: env.models,
                fabricsById: env.fabrics,
                compatibleModelFabrics: new Set(['1:10']),
                fabricColorsById: new Map([
                  [
                    100,
                    {
                      id: 100,
                      fabric_id: 10,
                      color_name: 'Hitam',
                      color_hex: '#111111',
                      sort_order: 1,
                      is_active: true,
                    },
                  ],
                ]),
                sizesById: new Map([
                  [1, { id: 1, code: 'M', sort_order: 1, extra_charge: 0, is_active: true }],
                ]),
                printSizesById: new Map([
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
                ]),
                dpMinQty: 12,
                dpPercent: 70,
              };
            },
          },
          executeDesignTransfers: async () => {},
        })
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('POST /api/orders (Checkout dari Keranjang)', () => {
    it('menolak Guest dengan 401 dan memvalidasi alamat SHIP', async () => {
      const guestRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItemUuids: [crypto.randomUUID()],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      expect(guestRes.status).toBe(401);

      const cartItem = env.addCartRow({ userId: USER_A.id, qtyM: 2 });
      const missingAddressRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [cartItem.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.SHIP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      expect(missingAddressRes.status).toBe(400);
    });

    it('membuat order SHIP dengan snapshot harga terkunci, hapus hanya item tercentang, dan memindahkan file desain ke orders/', async () => {
      const checkedDesignRef = `carts/${USER_A.userUuid}/11111111111111111111111111111111.png`;
      const sharedDesignRef = `carts/${USER_A.userUuid}/22222222222222222222222222222222.png`;
      env.designFiles.set(checkedDesignRef, Buffer.from('checked-design'));
      env.designFiles.set(sharedDesignRef, Buffer.from('shared-design'));

      // Checked item 1: 2 M + 1 XXL dengan sablon (65k+5k+20k=90k per M, 100k per XXL => 280k)
      const checkedItem1 = env.addCartRow({
        userId: USER_A.id,
        qtyM: 2,
        qtyXxl: 1,
        fileRef: checkedDesignRef,
      });
      // Checked item 2: 3 M memakai sharedDesignRef (3 * 90k = 270k)
      const checkedItem2 = env.addCartRow({
        userId: USER_A.id,
        qtyM: 3,
        fileRef: sharedDesignRef,
      });
      // Unchecked item 3: tetap di keranjang & tetap mereferensikan sharedDesignRef
      const uncheckedItem = env.addCartRow({
        userId: USER_A.id,
        qtyM: 1,
        fileRef: sharedDesignRef,
      });
      const savedAddress = env.addSavedAddress(USER_A.id);

      const payload: CreateOrderRequestDto = {
        cartItemUuids: [checkedItem1.cart_item_uuid, checkedItem2.cart_item_uuid],
        fulfillmentType: FULFILLMENT_TYPE.SHIP,
        addressUuid: savedAddress.address_uuid,
        paymentScheme: PAYMENT_SCHEME.FULL,
      };

      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': 'A',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { success: boolean; data: OrderDetailDto };

      expect(res.status).toBe(201);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(body.success).toBe(true);
      expect(body.data.orderCode).toMatch(/^YNG-[A-HJ-NP-Z2-9]{6}$/);
      expect(body.data.totalQty).toBe(6);
      expect(body.data.subtotalAmount).toBe(550000);
      expect(body.data.grandTotal).toBe(550000);
      expect(body.data.dpRequiredAmount).toBe(550000);
      expect(body.data.paymentScheme).toBe(PAYMENT_SCHEME.FULL);
      expect(body.data.dpPercentSnapshot).toBeNull();
      expect(body.data.customerName).toBe(savedAddress.recipient_name);
      expect(body.data.cityName).toBe(savedAddress.city_name);
      expect(body.data.payments).toHaveLength(1);
      expect(body.data.payments[0]?.paymentStage).toBe(PAYMENT_STAGE.FULL);
      expect(body.data.payments[0]?.amount).toBe(550000);
      expect(body.data.payments[0]?.status).toBe(PAYMENT_STATUS.PENDING);
      expect(body.data.paymentAccounts).toHaveLength(2);

      // Hanya uncheckedItem yang tersisa di keranjang
      expect(env.getCartRows()).toHaveLength(1);
      expect(env.getCartRows()[0]?.cart_item_uuid).toBe(uncheckedItem.cart_item_uuid);

      // File khusus item terbeli dipindahkan (carts/ terhapus, orders/ ada)
      expect(env.designFiles.has(checkedDesignRef)).toBe(false);
      expect(
        env.designFiles.has(
          `orders/${body.data.transactionUuid}/11111111111111111111111111111111.png`
        )
      ).toBe(true);
      // File yang masih dipakai item unchecked tetap ada di carts/ DAN disalin ke orders/
      expect(env.designFiles.has(sharedDesignRef)).toBe(true);
      expect(
        env.designFiles.has(
          `orders/${body.data.transactionUuid}/22222222222222222222222222222222.png`
        )
      ).toBe(true);

      // Ubah harga master setelah order dibuat -> detail order tetap memakai snapshot lama
      env.models.get(1)!.base_price = 99000;
      const detailRes = await fetch(`${baseUrl}/orders/${body.data.transactionUuid}`, {
        headers: { 'x-test-user': 'A' },
      });
      const detailBody = (await detailRes.json()) as { data: OrderDetailDto };
      expect(detailBody.data.subtotalAmount).toBe(550000);
      expect(detailBody.data.items[0]?.lockedBasePrice).toBe(65000);
    });

    it('menegakkan Dynamic DP Gatekeeper berdasarkan total qty item tercentang & membuat order PICKUP', async () => {
      const itemSmall = env.addCartRow({ userId: USER_A.id, qtyM: 5 });
      const itemLarge = env.addCartRow({ userId: USER_A.id, qtyM: 12, needsDesignHelp: true });

      // Total tercentang = 5 (< 12) dengan DP -> ditolak 400
      const rejectRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [itemSmall.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.DP,
        }),
      });
      expect(rejectRes.status).toBe(400);
      expect(env.getCartRows()).toHaveLength(2);

      // Total tercentang = 12 (>= 12) dengan DP + PICKUP alamat inline -> diterima 201
      const acceptRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [itemLarge.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          pickupName: 'Andi Studio',
          pickupWhatsapp: '081299998888',
          paymentScheme: PAYMENT_SCHEME.DP,
        }),
      });
      const body = (await acceptRes.json()) as { data: OrderDetailDto };
      expect(acceptRes.status).toBe(201);
      expect(body.data.fulfillmentType).toBe(FULFILLMENT_TYPE.PICKUP);
      expect(body.data.customerName).toBe('Andi Studio');
      expect(body.data.customerWhatsapp).toBe('6281299998888');
      expect(body.data.isDpEligible).toBe(true);
      expect(body.data.paymentScheme).toBe(PAYMENT_SCHEME.DP);
      expect(body.data.dpPercentSnapshot).toBe(70);
      // 12 * (65k + 5k + 20k) = 1.080.000; 70% = 756.000
      expect(body.data.subtotalAmount).toBe(1080000);
      expect(body.data.dpRequiredAmount).toBe(756000);
      expect(body.data.payments[0]?.paymentStage).toBe(PAYMENT_STAGE.DP);
      expect(body.data.payments[0]?.paymentStageLabel).toBe('DP 70%');
      expect(body.data.payments[0]?.amount).toBe(756000);
      // itemSmall belum terbeli -> tetap ada
      expect(env.getCartRows()).toHaveLength(1);
    });

    it('mencegah duplikasi order lewat Idempotency-Key & menolak item nonaktif / milik user lain', async () => {
      const itemA = env.addCartRow({ userId: USER_A.id, qtyM: 2 });
      const itemB = env.addCartRow({ userId: USER_B.id, qtyM: 2 });
      const addrB = env.addSavedAddress(USER_B.id);
      const idempotencyKey = crypto.randomUUID();

      // Header & body idempotencyKey tidak cocok -> 400
      const mismatchRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': 'A',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          cartItemUuids: [itemA.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      expect(mismatchRes.status).toBe(400);

      // User A mencoba checkout item milik User B -> 404
      const stealItemRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [itemB.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      expect(stealItemRes.status).toBe(404);

      // User A mencoba memakai addressUuid milik User B -> 404
      const stealAddrRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [itemA.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.SHIP,
          addressUuid: addrB.address_uuid,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      expect(stealAddrRes.status).toBe(404);

      // Model nonaktif -> 400
      env.models.get(1)!.is_active = false;
      const inactiveRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [itemA.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      expect(inactiveRes.status).toBe(400);
      env.models.get(1)!.is_active = true;

      // Checkout valid dengan body idempotencyKey -> 201
      const firstRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [itemA.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.SHIP,
          address: {
            recipientName: 'Siti Aminah',
            recipientWhatsapp: '08123450000',
            provinceName: 'Kepulauan Riau',
            cityName: 'Kota Batam',
            districtName: 'Sekupang',
            postalCode: '29422',
            fullAddress: 'Perum Tiban Indah Blok C No. 4',
          },
          paymentScheme: PAYMENT_SCHEME.FULL,
          idempotencyKey,
        }),
      });
      const firstBody = (await firstRes.json()) as { data: OrderDetailDto };
      expect(firstRes.status).toBe(201);
      expect(firstBody.data.customerWhatsapp).toBe('628123450000');

      // Ulangi request dengan Idempotency-Key sama meski item keranjang sudah terhapus -> 200 tanpa duplikasi
      const secondRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': 'A',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          cartItemUuids: [itemA.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.SHIP,
          address: {
            recipientName: 'Siti Aminah',
            recipientWhatsapp: '08123450000',
            provinceName: 'Kepulauan Riau',
            cityName: 'Kota Batam',
            districtName: 'Sekupang',
            postalCode: '29422',
            fullAddress: 'Perum Tiban Indah Blok C No. 4',
          },
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      const secondBody = (await secondRes.json()) as { data: OrderDetailDto };
      expect(secondRes.status).toBe(200);
      expect(secondBody.data.transactionUuid).toBe(firstBody.data.transactionUuid);
      expect(env.getOrders()).toHaveLength(1);

      // User B memakai Idempotency-Key milik User A -> 409
      const crossUserRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': 'B',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          cartItemUuids: [itemB.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      expect(crossUserRes.status).toBe(409);
    });
  });

  describe('GET /api/orders & GET /api/orders/:uuid (+ /api/me/orders)', () => {
    it('mengisolasi daftar & detail pesanan per user, memuat rekening aktif, serta menghasilkan trackingUrl dari shared couriers', async () => {
      const itemA = env.addCartRow({ userId: USER_A.id, qtyM: 2 });
      const itemB = env.addCartRow({ userId: USER_B.id, qtyM: 3 });

      const createA = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [itemA.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      const orderA = ((await createA.json()) as { data: OrderDetailDto }).data;

      const createB = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'B' },
        body: JSON.stringify({
          cartItemUuids: [itemB.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      expect(createB.status).toBe(201);

      // Isi kurir & resi pada order A untuk verifikasi shared couriers.ts
      const storedOrderA = env
        .getOrders()
        .find((o) => o.transaction_uuid === orderA.transactionUuid)!;
      storedOrderA.shipping_courier = 'JNE';
      storedOrderA.shipping_service = 'REG';
      storedOrderA.tracking_receipt_number = 'JNE123456789';

      // Guest ditolak
      expect((await fetch(`${baseUrl}/orders`)).status).toBe(401);
      expect((await fetch(`${baseUrl}/orders/${orderA.transactionUuid}`)).status).toBe(401);

      // User A hanya melihat 1 pesanan miliknya
      const listRes = await fetch(`${baseUrl}/orders?page=1&limit=10`, {
        headers: { 'x-test-user': 'A' },
      });
      const listBody = (await listRes.json()) as { data: OrderSummaryDto[]; meta: PaginationMeta };
      expect(listRes.status).toBe(200);
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0]?.transactionUuid).toBe(orderA.transactionUuid);
      expect(listBody.meta.total).toBe(1);

      // Detail via /api/orders/:uuid dan /api/me/orders/:uuid identik
      const detailRes = await fetch(`${baseUrl}/orders/${orderA.transactionUuid}`, {
        headers: { 'x-test-user': 'A' },
      });
      const meDetailRes = await fetch(`${baseUrl}/me/orders/${orderA.transactionUuid}`, {
        headers: { 'x-test-user': 'A' },
      });
      const detailBody = (await detailRes.json()) as { data: OrderDetailDto };
      const meDetailBody = (await meDetailRes.json()) as { data: OrderDetailDto };

      expect(detailRes.status).toBe(200);
      expect(meDetailRes.status).toBe(200);
      expect(detailBody.data.courierInfo?.code).toBe('JNE');
      expect(detailBody.data.trackingReceiptNumber).toBe('JNE123456789');
      expect(detailBody.data.trackingUrl).toBe('https://www.jne.co.id/tracking-package');
      expect(detailBody.data.paymentAccounts.map((a) => a.providerName)).toEqual([
        'BCA',
        'QRIS YNG Studio',
      ]);
      expect(detailBody.data.paymentAccounts[1]?.qrImageUrl).toBe(
        'https://cdn.example.test/catalog/qris/qris-aktif.png'
      );
      expect(meDetailBody.data.orderCode).toBe(detailBody.data.orderCode);

      // User B mencoba mengakses order User A -> 404
      expect(
        (
          await fetch(`${baseUrl}/orders/${orderA.transactionUuid}`, {
            headers: { 'x-test-user': 'B' },
          })
        ).status
      ).toBe(404);
      expect(
        (
          await fetch(`${baseUrl}/me/orders/${orderA.transactionUuid}`, {
            headers: { 'x-test-user': 'B' },
          })
        ).status
      ).toBe(404);
    });
  });

  describe('Tagihan & Upload Bukti Pembayaran (/api/orders/:uuid/payments*)', () => {
    it('mengembalikan rekening aktif, memproses upload bukti bayar PNG/JPG via sharp, validasi status/rekening, dan hapus bukti lama saat re-upload', async () => {
      const cartItem = env.addCartRow({ userId: USER_A.id, qtyM: 2 });
      const createRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-user': 'A' },
        body: JSON.stringify({
          cartItemUuids: [cartItem.cart_item_uuid],
          fulfillmentType: FULFILLMENT_TYPE.PICKUP,
          paymentScheme: PAYMENT_SCHEME.FULL,
        }),
      });
      const order = ((await createRes.json()) as { data: OrderDetailDto }).data;
      const paymentUuid = order.payments[0]!.paymentUuid;

      const paymentsRes = await fetch(`${baseUrl}/orders/${order.transactionUuid}/payments`);
      const paymentsBody = (await paymentsRes.json()) as { data: OrderPaymentsResponseDto };
      expect(paymentsRes.status).toBe(200);
      expect(paymentsRes.headers.get('cache-control')).toBe('no-store');
      expect(paymentsBody.data.paymentAccounts).toHaveLength(2);
      expect(paymentsBody.data.payments[0]?.hasProof).toBe(false);

      // Magic bytes palsu ditolak 400
      const fakeForm = new FormData();
      fakeForm.append('paymentMethod', PAYMENT_METHOD.QRIS);
      fakeForm.append('paymentAccountId', '2');
      fakeForm.append(
        'file',
        new Blob([Buffer.from('not-an-image')], { type: 'image/png' }),
        'palsu.png'
      );
      const fakeRes = await fetch(
        `${baseUrl}/orders/${order.transactionUuid}/payments/${paymentUuid}/proof`,
        { method: 'POST', body: fakeForm }
      );
      expect(fakeRes.status).toBe(400);

      // File > 5 MB ditolak Multer dengan 400
      const bigForm = new FormData();
      bigForm.append('paymentMethod', PAYMENT_METHOD.QRIS);
      bigForm.append('paymentAccountId', '2');
      bigForm.append(
        'file',
        new Blob([new Uint8Array(5 * 1024 * 1024 + 128)], { type: 'image/png' }),
        'huge.png'
      );
      const bigRes = await fetch(
        `${baseUrl}/orders/${order.transactionUuid}/payments/${paymentUuid}/proof`,
        { method: 'POST', body: bigForm }
      );
      expect(bigRes.status).toBe(400);

      // Rekening nonaktif (#3) atau method tidak cocok (#1 BANK_TRANSFER dikirim sebagai QRIS) -> 400
      const pngBuffer = await sharp({
        create: {
          width: 120,
          height: 120,
          channels: 3,
          background: { r: 245, g: 245, b: 245 },
        },
      })
        .png()
        .toBuffer();

      const wrongMethodForm = new FormData();
      wrongMethodForm.append('paymentMethod', PAYMENT_METHOD.QRIS);
      wrongMethodForm.append('paymentAccountId', '1');
      wrongMethodForm.append(
        'file',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'bukti.png'
      );
      expect(
        (
          await fetch(`${baseUrl}/orders/${order.transactionUuid}/payments/${paymentUuid}/proof`, {
            method: 'POST',
            body: wrongMethodForm,
          })
        ).status
      ).toBe(400);

      // Upload bukti valid ke rekening #2 (QRIS)
      const validForm1 = new FormData();
      validForm1.append('paymentMethod', PAYMENT_METHOD.QRIS);
      validForm1.append('paymentAccountId', '2');
      validForm1.append(
        'file',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'bukti-1.png'
      );
      const uploadRes1 = await fetch(
        `${baseUrl}/orders/${order.transactionUuid}/payments/${paymentUuid}/proof`,
        { method: 'POST', body: validForm1 }
      );
      const uploadBody1 = (await uploadRes1.json()) as { data: UploadPaymentProofResultDto };
      expect(uploadRes1.status).toBe(200);
      expect(uploadBody1.data.payment.hasProof).toBe(true);
      expect(uploadBody1.data.payment.status).toBe(PAYMENT_STATUS.PENDING);
      expect(uploadBody1.data.payment.proofImageUrl).toContain(
        `${order.transactionUuid}/${paymentUuid}`
      );
      const firstStoredPath = env.getPayments()[0]!.proof_image_path!;
      expect(env.proofFiles.has(firstStoredPath)).toBe(true);

      // Simulasikan penolakan oleh admin lalu upload ulang (JPEG) -> reset PENDING & hapus file lama
      const storedPayment = env.getPayments()[0]!;
      storedPayment.status = PAYMENT_STATUS.REJECTED;
      storedPayment.rejection_reason = 'Nominal transfer belum sesuai.';

      const jpgBuffer = await sharp({
        create: { width: 100, height: 100, channels: 3, background: '#111111' },
      })
        .jpeg()
        .toBuffer();
      const validForm2 = new FormData();
      validForm2.append('paymentMethod', PAYMENT_METHOD.BANK_TRANSFER);
      validForm2.append('paymentAccountId', '1');
      validForm2.append(
        'file',
        new Blob([new Uint8Array(jpgBuffer)], { type: 'image/jpeg' }),
        'bukti-2.jpg'
      );
      const uploadRes2 = await fetch(
        `${baseUrl}/orders/${order.transactionUuid}/payments/${paymentUuid}/proof`,
        { method: 'POST', body: validForm2 }
      );
      const uploadBody2 = (await uploadRes2.json()) as { data: UploadPaymentProofResultDto };
      expect(uploadRes2.status).toBe(200);
      expect(uploadBody2.data.payment.status).toBe(PAYMENT_STATUS.PENDING);
      expect(uploadBody2.data.payment.rejectionReason).toBeNull();
      expect(uploadBody2.data.payment.paymentMethod).toBe(PAYMENT_METHOD.BANK_TRANSFER);
      expect(env.removedProofPaths).toContain(firstStoredPath);

      // Status VERIFIED atau order CANCELLED -> tolak 409
      storedPayment.status = PAYMENT_STATUS.VERIFIED;
      const verifiedForm = new FormData();
      verifiedForm.append('paymentMethod', PAYMENT_METHOD.BANK_TRANSFER);
      verifiedForm.append('paymentAccountId', '1');
      verifiedForm.append(
        'file',
        new Blob([new Uint8Array(jpgBuffer)], { type: 'image/jpeg' }),
        'bukti-3.jpg'
      );
      expect(
        (
          await fetch(`${baseUrl}/orders/${order.transactionUuid}/payments/${paymentUuid}/proof`, {
            method: 'POST',
            body: verifiedForm,
          })
        ).status
      ).toBe(409);

      storedPayment.status = PAYMENT_STATUS.PENDING;
      env.getOrders()[0]!.production_status = PRODUCTION_STATUS.CANCELLED;
      expect(
        (
          await fetch(`${baseUrl}/orders/${order.transactionUuid}/payments/${paymentUuid}/proof`, {
            method: 'POST',
            body: verifiedForm,
          })
        ).status
      ).toBe(409);
    });
  });
});
