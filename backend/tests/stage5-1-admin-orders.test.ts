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
  type AdminKanbanBoardDto,
  type AdminOrderCardDto,
  type AdminOrderDetailDto,
  type AdminOrderQcPhotoDto,
  type AdminPaymentListItemDto,
  type PaginationMeta,
} from '@yng/shared';
import express, { type RequestHandler } from 'express';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminOrderListRow, AdminOrderRepository } from '../src/models/adminOrderModel.js';
import type {
  OrderDetailRecord,
  OrderItemPrintRow,
  OrderItemRow,
  OrderItemSizeRow,
  OrderPaymentRow,
  OrderQcPhotoRow,
  OrderRow,
  OrderStatusHistoryRow,
} from '../src/models/orderModel.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { STORAGE_BUCKETS } = await import('../src/config/constants.js');
const { AppError, errorHandler, notFoundHandler } =
  await import('../src/middleware/errorHandler.js');
const { createAdminRouter } = await import('../src/routes/adminRoutes.js');
const { assertValidStatusTransition, createAdminOrderService } =
  await import('../src/services/adminOrderService.js');
const { generateSpkPdfBuffer } = await import('../src/services/spkService.js');

const CUSTOMER_USER = {
  id: 101,
  userUuid: '11111111-1111-4111-8111-111111111111',
  fullName: 'Pelanggan Biasa',
  email: 'user@example.com',
  whatsapp: '6281234567890',
  role: USER_ROLE.USER,
  tokenVersion: 0,
};

const ADMIN_USER = {
  id: 1,
  userUuid: '99999999-9999-4999-8999-999999999999',
  fullName: 'Solo Admin YNG',
  email: 'admin@yng.test',
  whatsapp: null,
  role: USER_ROLE.ADMIN,
  tokenVersion: 0,
};

function createAdminTestEnv() {
  const now = '2026-11-26T03:00:00.000Z';
  const orderUuid = 'aaaaaaaa-5555-4555-8555-000000000001';
  const dpPaymentUuid = 'bbbbbbbb-5555-4555-8555-000000000011';

  let orders: OrderRow[] = [];
  let orderItems: OrderItemRow[] = [];
  let orderItemSizes: OrderItemSizeRow[] = [];
  let orderItemPrints: OrderItemPrintRow[] = [];
  let payments: OrderPaymentRow[] = [];
  let qcPhotos: OrderQcPhotoRow[] = [];
  let statusHistory: OrderStatusHistoryRow[] = [];
  let nextId = 100;

  const designFiles = new Map<string, Buffer>();
  const qcFiles = new Map<string, Buffer>();
  const removedQcPaths: string[] = [];
  let forceFailQcDb = false;

  function reset() {
    orders = [
      {
        id: 1,
        transaction_uuid: orderUuid,
        order_code: 'YNG-ADM001',
        user_id: CUSTOMER_USER.id,
        source: ORDER_SOURCE.WEBSITE,
        idempotency_key: null,
        customer_name: 'Rafi Pratama',
        customer_whatsapp: '6281234567890',
        fulfillment_type: FULFILLMENT_TYPE.SHIP,
        province_name: 'Kepulauan Riau',
        city_name: 'Kota Batam',
        district_name: 'Batam Kota',
        postal_code: '29444',
        full_address: 'Jl. Engku Putri No. 88',
        total_qty: 12,
        dp_min_qty_snapshot: 12,
        is_dp_eligible: true,
        payment_scheme: PAYMENT_SCHEME.DP,
        dp_percent_snapshot: 70,
        subtotal_amount: 1200000,
        discount_amount: 0,
        discount_note: null,
        shipping_cost: 0,
        grand_total: 1200000,
        dp_required_amount: 840000,
        remaining_balance: 1200000,
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
        payment_due_at: now,
        cancelled_reason: null,
        cancelled_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      },
    ];

    orderItems = [
      {
        id: 10,
        order_id: 1,
        model_id: 1,
        fabric_id: 2,
        model_name: 'Boxy Tee 24s',
        fabric_name: 'Cotton Combed 24s',
        fabric_color_id: 5,
        is_custom_color: true,
        color_name: 'Washed Charcoal',
        color_hex: '#2E2E32',
        needs_design_help: false,
        production_notes: 'Sablon presisi di tengah dada',
        locked_base_price: 75000,
        locked_fabric_price: 5000,
        item_qty: 12,
        line_subtotal: 1200000,
      },
    ];

    orderItemSizes = [
      { id: 100, order_item_id: 10, size_id: 1, size_code: 'L', qty: 8, locked_extra_charge: 0 },
      {
        id: 101,
        order_item_id: 10,
        size_id: 2,
        size_code: 'XXL',
        qty: 4,
        locked_extra_charge: 10000,
      },
    ];

    orderItemPrints = [
      {
        id: 200,
        order_item_id: 10,
        print_size_id: 1,
        print_size_code: 'A4',
        print_position: PRINT_POSITION.FRONT_CENTER,
        raw_design_file_path: `orders/${orderUuid}/front.png`,
        design_file_name: 'front-logo.png',
        locked_spot_price: 20000,
      },
    ];

    payments = [
      {
        id: 300,
        payment_uuid: dpPaymentUuid,
        order_id: 1,
        payment_stage: PAYMENT_STAGE.DP,
        payment_method: PAYMENT_METHOD.QRIS,
        payment_account_id: 2,
        amount: 840000,
        proof_image_path: `${orderUuid}/${dpPaymentUuid}/bukti-dp.png`,
        status: PAYMENT_STATUS.PENDING,
        rejection_reason: null,
        proof_uploaded_at: now,
        verified_at: null,
        created_at: now,
      },
    ];

    qcPhotos = [];
    statusHistory = [
      {
        id: 1,
        order_id: 1,
        from_status: null,
        to_status: PRODUCTION_STATUS.NEW_ORDER,
        notes: 'Pesanan dibuat dari keranjang website.',
        created_at: now,
      },
    ];
    nextId = 400;
    designFiles.clear();
    qcFiles.clear();
    removedQcPaths.length = 0;
    forceFailQcDb = false;
  }

  function toListRow(o: OrderRow): AdminOrderListRow {
    const orderPays = payments.filter((p) => p.order_id === o.id);
    const initStage =
      o.payment_scheme === PAYMENT_SCHEME.DP ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
    const initPay = orderPays.find((p) => p.payment_stage === initStage);
    return {
      id: o.id,
      transaction_uuid: o.transaction_uuid,
      order_code: o.order_code,
      source: o.source,
      customer_name: o.customer_name,
      customer_whatsapp: o.customer_whatsapp,
      fulfillment_type: o.fulfillment_type,
      province_name: o.province_name,
      city_name: o.city_name,
      district_name: o.district_name,
      postal_code: o.postal_code,
      full_address: o.full_address,
      total_qty: o.total_qty,
      payment_scheme: o.payment_scheme,
      dp_percent_snapshot: o.dp_percent_snapshot,
      grand_total: o.grand_total,
      remaining_balance: o.remaining_balance,
      production_status: o.production_status,
      design_status: o.design_status,
      initial_payment_status: initPay?.status ?? null,
      initial_payment_has_proof: Boolean(initPay?.proof_image_path),
      has_pending_proof: orderPays.some(
        (p) => p.status === PAYMENT_STATUS.PENDING && p.proof_image_path !== null
      ),
      has_custom_color: orderItems.some((i) => i.order_id === o.id && i.is_custom_color),
      qc_photo_count: qcPhotos.filter((q) => q.order_id === o.id).length,
      shipping_courier: o.shipping_courier,
      tracking_receipt_number: o.tracking_receipt_number,
      payment_due_at: o.payment_due_at,
      estimated_finish_date: o.estimated_finish_date,
      created_at: o.created_at,
    };
  }

  function assembleDetail(o: OrderRow): OrderDetailRecord {
    const items = orderItems.filter((i) => i.order_id === o.id);
    const itemIdSet = new Set(items.map((i) => i.id));
    return {
      order: o,
      items,
      itemSizes: orderItemSizes.filter((s) => itemIdSet.has(s.order_item_id)),
      itemPrints: orderItemPrints.filter((p) => itemIdSet.has(p.order_item_id)),
      payments: payments.filter((p) => p.order_id === o.id),
      qcPhotos: qcPhotos.filter((q) => q.order_id === o.id),
      statusHistory: statusHistory.filter((h) => h.order_id === o.id),
    };
  }

  const repo: AdminOrderRepository = {
    async listOrders(filters) {
      let filtered = [...orders];
      if (filters.status) {
        filtered = filtered.filter((o) => o.production_status === filters.status);
      }
      if (filters.fulfillmentType) {
        filtered = filtered.filter((o) => o.fulfillment_type === filters.fulfillmentType);
      }
      if (filters.paymentStatus) {
        filtered = filtered.filter((o) =>
          payments.some((p) => p.order_id === o.id && p.status === filters.paymentStatus)
        );
      }
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        filtered = filtered.filter(
          (o) =>
            o.order_code.toLowerCase().includes(q) ||
            o.customer_name.toLowerCase().includes(q) ||
            o.customer_whatsapp.toLowerCase().includes(q)
        );
      }
      const total = filtered.length;
      const offset = (filters.page - 1) * filters.limit;
      return {
        rows: filtered.slice(offset, offset + filters.limit).map(toListRow),
        total,
      };
    },

    async listKanbanOrders() {
      const activeRows = orders
        .filter(
          (o) =>
            o.production_status !== PRODUCTION_STATUS.COMPLETED &&
            o.production_status !== PRODUCTION_STATUS.CANCELLED
        )
        .map(toListRow);
      return {
        activeRows,
        completedCount: orders.filter((o) => o.production_status === PRODUCTION_STATUS.COMPLETED)
          .length,
        cancelledCount: orders.filter((o) => o.production_status === PRODUCTION_STATUS.CANCELLED)
          .length,
      };
    },

    async findOrderDetailByUuid(transactionUuid) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      return order ? assembleDetail(order) : null;
    },

    async getSignedUrlExpirySeconds() {
      return 3600;
    },

    async transitionStatusAtomic({ transactionUuid, toStatus, notes }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      const orderPays = payments.filter((p) => p.order_id === order.id);
      const qcCount = qcPhotos.filter((q) => q.order_id === order.id).length;

      assertValidStatusTransition({ order, toStatus, payments: orderPays, qcPhotoCount: qcCount });

      const fromStatus = order.production_status;
      order.production_status = toStatus;
      if (toStatus === PRODUCTION_STATUS.SHIPPING && !order.shipped_at) {
        order.shipped_at = new Date().toISOString();
      }
      if (toStatus === PRODUCTION_STATUS.COMPLETED && !order.completed_at) {
        order.completed_at = new Date().toISOString();
      }
      statusHistory.push({
        id: nextId++,
        order_id: order.id,
        from_status: fromStatus,
        to_status: toStatus,
        notes,
        created_at: new Date().toISOString(),
      });
      return assembleDetail(order);
    },

    async reviewDesignAtomic({ transactionUuid, designStatus, designReviewNotes }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (order.production_status !== PRODUCTION_STATUS.NEW_ORDER) {
        throw new AppError('Status desain hanya dapat diubah pada tahap Order Masuk.', 409);
      }
      order.design_status = designStatus;
      order.design_review_notes = designReviewNotes;
      statusHistory.push({
        id: nextId++,
        order_id: order.id,
        from_status: order.production_status,
        to_status: order.production_status,
        notes: `Review desain: ${designStatus}`,
        created_at: new Date().toISOString(),
      });
      return assembleDetail(order);
    },

    async cancelOrderAtomic({ transactionUuid, reason, refundedAmount }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (
        order.production_status !== PRODUCTION_STATUS.NEW_ORDER &&
        order.production_status !== PRODUCTION_STATUS.PRINT_QUEUE
      ) {
        throw new AppError(
          'Pesanan hanya dapat dibatalkan dari tahap Order Masuk atau Antrean Cetak.',
          409
        );
      }
      const verifiedSum = payments
        .filter((p) => p.order_id === order.id && p.status === PAYMENT_STATUS.VERIFIED)
        .reduce((sum, p) => sum + p.amount, 0);

      let finalRefund = 0;
      if (verifiedSum > 0) {
        if (refundedAmount === undefined || refundedAmount < 0 || refundedAmount > verifiedSum) {
          throw new AppError(
            'Nominal refund wajib diisi valid (0 sampai total terverifikasi).',
            400
          );
        }
        finalRefund = refundedAmount;
      } else if (refundedAmount !== undefined && refundedAmount > 0) {
        throw new AppError('Refund > 0 ditolak karena belum ada pembayaran terverifikasi.', 400);
      }

      const fromStatus = order.production_status;
      order.production_status = PRODUCTION_STATUS.CANCELLED;
      order.cancelled_reason = reason;
      order.cancelled_at = new Date().toISOString();
      order.refunded_amount = finalRefund;
      statusHistory.push({
        id: nextId++,
        order_id: order.id,
        from_status: fromStatus,
        to_status: PRODUCTION_STATUS.CANCELLED,
        notes: `Dibatalkan: ${reason}`,
        created_at: new Date().toISOString(),
      });
      return assembleDetail(order);
    },

    async updateDiscountAtomic({ transactionUuid, discountAmount, discountNote }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (order.production_status !== PRODUCTION_STATUS.NEW_ORDER) {
        throw new AppError('Diskon hanya dapat diubah pada tahap Order Masuk.', 409);
      }
      const orderPays = payments.filter((p) => p.order_id === order.id);
      if (orderPays.some((p) => p.status === PAYMENT_STATUS.VERIFIED)) {
        throw new AppError('Diskon tidak bisa diubah setelah ada pembayaran VERIFIED.', 409);
      }
      const initStage =
        order.payment_scheme === PAYMENT_SCHEME.DP ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
      const initPay = orderPays.find((p) => p.payment_stage === initStage);
      if (initPay && initPay.status === PAYMENT_STATUS.PENDING && initPay.proof_image_path) {
        throw new AppError('Tolak bukti pembayaran awal sebelum mengubah diskon.', 409);
      }
      if (discountAmount < 0 || discountAmount > order.subtotal_amount) {
        throw new AppError('Nominal diskon tidak valid.', 400);
      }
      const net = order.subtotal_amount - discountAmount;
      const dpReq =
        order.payment_scheme === PAYMENT_SCHEME.DP
          ? Math.round((net * Number(order.dp_percent_snapshot ?? 70)) / 100)
          : net;

      order.discount_amount = discountAmount;
      order.discount_note = discountNote;
      order.grand_total = net + order.shipping_cost;
      order.dp_required_amount = dpReq;
      order.remaining_balance = order.grand_total;
      if (initPay) initPay.amount = dpReq;
      return assembleDetail(order);
    },

    async updateAddressAtomic({ transactionUuid, patch }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (patch.fulfillmentType) order.fulfillment_type = patch.fulfillmentType;
      if (patch.customerName) order.customer_name = patch.customerName;
      if (patch.provinceName !== undefined) order.province_name = patch.provinceName;
      if (patch.cityName !== undefined) order.city_name = patch.cityName;
      if (patch.districtName !== undefined) order.district_name = patch.districtName;
      if (patch.postalCode !== undefined) order.postal_code = patch.postalCode;
      if (patch.fullAddress !== undefined) order.full_address = patch.fullAddress;
      return assembleDetail(order);
    },

    async updateNotesAtomic({ transactionUuid, adminNotes, estimatedFinishDate }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (adminNotes !== undefined) order.admin_notes = adminNotes;
      if (estimatedFinishDate !== undefined) order.estimated_finish_date = estimatedFinishDate;
      return assembleDetail(order);
    },

    async listPayments(filters) {
      let filtered = [...payments];
      if (filters.status) {
        filtered = filtered.filter((p) => p.status === filters.status);
      }
      if (filters.hasProof === true) {
        filtered = filtered.filter((p) => p.proof_image_path !== null);
      }
      const rows = filtered.map((p) => {
        const o = orders.find((ord) => ord.id === p.order_id)!;
        return {
          ...p,
          order_transaction_uuid: o.transaction_uuid,
          order_code: o.order_code,
          customer_name: o.customer_name,
          customer_whatsapp: o.customer_whatsapp,
          production_status: o.production_status,
          dp_percent_snapshot: o.dp_percent_snapshot,
          shipping_cost: o.shipping_cost,
        };
      });
      const offset = (filters.page - 1) * filters.limit;
      return { rows: rows.slice(offset, offset + filters.limit), total: rows.length };
    },

    async verifyOrRejectPaymentAtomic({ paymentUuid, approve, rejectionReason }) {
      const payment = payments.find((p) => p.payment_uuid === paymentUuid);
      if (!payment) return null;
      const order = orders.find((o) => o.id === payment.order_id)!;

      if (order.production_status === PRODUCTION_STATUS.CANCELLED) {
        throw new AppError('Order dibatalkan.', 409);
      }
      if (payment.status === PAYMENT_STATUS.VERIFIED) {
        throw new AppError('Pembayaran sudah VERIFIED.', 409);
      }

      if (approve) {
        if (!payment.proof_image_path) {
          throw new AppError('Bukti belum diunggah.', 409);
        }
        payment.status = PAYMENT_STATUS.VERIFIED;
        payment.rejection_reason = null;
        payment.verified_at = new Date().toISOString();

        const verifiedSum = payments
          .filter((p) => p.order_id === order.id && p.status === PAYMENT_STATUS.VERIFIED)
          .reduce((sum, p) => sum + p.amount, 0);
        order.remaining_balance = Math.max(0, order.grand_total - verifiedSum);
        return { order: { ...order }, payment: { ...payment } };
      }

      payment.status = PAYMENT_STATUS.REJECTED;
      payment.rejection_reason = rejectionReason?.trim() || 'Ditolak admin';
      payment.verified_at = null;
      return { order: { ...order }, payment: { ...payment } };
    },

    async addQcPhotosAtomic({ transactionUuid, photoPaths }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (forceFailQcDb) {
        throw new AppError('Simulasi gagal DB QC.', 500);
      }
      const insertedPhotos: OrderQcPhotoRow[] = photoPaths.map((photoPath) => {
        const row: OrderQcPhotoRow = {
          id: nextId++,
          order_id: order.id,
          photo_path: photoPath,
          created_at: new Date().toISOString(),
        };
        qcPhotos.push(row);
        return row;
      });
      return { order, insertedPhotos };
    },

    async deleteQcPhotoAtomic({ transactionUuid, photoId }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      const idx = qcPhotos.findIndex((q) => q.id === photoId && q.order_id === order.id);
      if (idx === -1) return null;
      const [removed] = qcPhotos.splice(idx, 1);
      return { order, deletedPhotoPath: removed!.photo_path };
    },

    async updateShippingCostAtomic({ transactionUuid, shippingCost }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (order.fulfillment_type === FULFILLMENT_TYPE.PICKUP) {
        throw new AppError('PICKUP tidak memakai ongkir.', 409);
      }
      if (
        order.production_status !== PRODUCTION_STATUS.PRESSING_QC &&
        order.production_status !== PRODUCTION_STATUS.AWAITING_SETTLEMENT
      ) {
        throw new AppError('Ongkir hanya bisa diubah pada PRESSING_QC / AWAITING_SETTLEMENT.', 409);
      }

      const finalStage =
        order.payment_scheme === PAYMENT_SCHEME.DP
          ? PAYMENT_STAGE.SETTLEMENT
          : PAYMENT_STAGE.SHIPPING_FEE;
      const existingFinal = payments.find(
        (p) => p.order_id === order.id && p.payment_stage === finalStage
      );

      if (existingFinal) {
        if (existingFinal.status === PAYMENT_STATUS.VERIFIED) {
          throw new AppError('Pembayaran tahap akhir sudah VERIFIED.', 409);
        }
        if (existingFinal.status === PAYMENT_STATUS.PENDING && existingFinal.proof_image_path) {
          throw new AppError('Tolak bukti tahap akhir sebelum merevisi ongkir.', 409);
        }
      }

      const verifiedSum = payments
        .filter((p) => p.order_id === order.id && p.status === PAYMENT_STATUS.VERIFIED)
        .reduce((sum, p) => sum + p.amount, 0);

      order.shipping_cost = shippingCost;
      order.grand_total = order.subtotal_amount - order.discount_amount + shippingCost;
      order.remaining_balance = Math.max(0, order.grand_total - verifiedSum);

      const finalAmount =
        order.payment_scheme === PAYMENT_SCHEME.DP
          ? Math.max(0, order.grand_total - verifiedSum)
          : shippingCost;

      if (finalAmount > 0) {
        if (existingFinal) {
          existingFinal.amount = finalAmount;
          existingFinal.status = PAYMENT_STATUS.PENDING;
          existingFinal.rejection_reason = null;
        } else {
          payments.push({
            id: nextId++,
            payment_uuid: crypto.randomUUID(),
            order_id: order.id,
            payment_stage: finalStage,
            payment_method: null,
            payment_account_id: null,
            amount: finalAmount,
            proof_image_path: null,
            status: PAYMENT_STATUS.PENDING,
            rejection_reason: null,
            proof_uploaded_at: null,
            verified_at: null,
            created_at: new Date().toISOString(),
          });
        }
      } else if (existingFinal) {
        payments = payments.filter((p) => p.id !== existingFinal.id);
      }

      return assembleDetail(order);
    },

    async updateShipmentAtomic({
      transactionUuid,
      shippingCourier,
      shippingService,
      trackingReceiptNumber,
    }) {
      const order = orders.find((o) => o.transaction_uuid === transactionUuid);
      if (!order) return null;
      if (order.fulfillment_type === FULFILLMENT_TYPE.PICKUP) {
        throw new AppError('PICKUP tidak membutuhkan kurir/resi.', 409);
      }
      order.shipping_courier = shippingCourier;
      order.shipping_service = shippingService;
      order.tracking_receipt_number = trackingReceiptNumber;
      return assembleDetail(order);
    },

    async createManualOrderAtomic() {
      throw new Error('createManualOrderAtomic tidak dipakai di stage5-1');
    },
  };

  const adminOrderService = createAdminOrderService({
    adminOrderRepo: repo,
    storage: {
      upload: async (bucket, filePath, buffer) => {
        if (bucket === STORAGE_BUCKETS.QC_PHOTOS) {
          qcFiles.set(filePath, buffer);
        }
        return { id: filePath, path: filePath, fullPath: filePath };
      },
      download: async (bucket, filePath) => {
        if (bucket === STORAGE_BUCKETS.DESIGNS && designFiles.has(filePath)) {
          return designFiles.get(filePath)!;
        }
        throw new Error(`Objek tidak ada: ${filePath}`);
      },
      remove: async (bucket, paths) => {
        const list = Array.isArray(paths) ? paths : [paths];
        for (const p of list) {
          if (bucket === STORAGE_BUCKETS.QC_PHOTOS) {
            qcFiles.delete(p);
            removedQcPaths.push(p);
          }
        }
        return [];
      },
      getSignedUrl: async (bucket, filePath) =>
        filePath ? `https://signed.example.test/${bucket}/${filePath}` : null,
    },
  });

  reset();

  return {
    orderUuid,
    dpPaymentUuid,
    designFiles,
    qcFiles,
    removedQcPaths,
    setForceFailQcDb: (val: boolean) => {
      forceFailQcDb = val;
    },
    getOrders: () => orders,
    getPayments: () => payments,
    getQcPhotos: () => qcPhotos,
    adminOrderService,
    reset,
  };
}

describe('Tahap 5-1 — Backend Operasional Order Admin, Verifikasi Bayar, Foto QC & SPK PDF', () => {
  const env = createAdminTestEnv();
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

  describe('Proteksi Role ADMIN & Daftar / Board Kanban / Detail Order', () => {
    it('menolak Guest (401) & USER (403) dan mengizinkan ADMIN (200)', async () => {
      expect((await fetch(`${baseUrl}/orders`)).status).toBe(401);
      expect(
        (await fetch(`${baseUrl}/orders`, { headers: { 'x-test-role': 'USER' } })).status
      ).toBe(403);
      expect(
        (await fetch(`${baseUrl}/orders/kanban`, { headers: { 'x-test-role': 'USER' } })).status
      ).toBe(403);
      expect(
        (await fetch(`${baseUrl}/payments`, { headers: { 'x-test-role': 'USER' } })).status
      ).toBe(403);

      const listRes = await fetch(`${baseUrl}/orders?search=ADM001&status=NEW_ORDER`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const listBody = (await listRes.json()) as {
        data: AdminOrderCardDto[];
        meta: PaginationMeta;
      };
      expect(listRes.status).toBe(200);
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0]?.hasCustomColor).toBe(true);
      expect(listBody.data[0]?.hasPendingProof).toBe(true);
      expect(listBody.meta.total).toBe(1);

      const boardRes = await fetch(`${baseUrl}/orders/kanban`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const boardBody = (await boardRes.json()) as { data: AdminKanbanBoardDto };
      expect(boardRes.status).toBe(200);
      expect(boardBody.data.columns).toHaveLength(5);
      expect(boardBody.data.columns[0]?.orders).toHaveLength(1);

      const detailRes = await fetch(`${baseUrl}/orders/${env.orderUuid}`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const detailBody = (await detailRes.json()) as { data: AdminOrderDetailDto };
      expect(detailRes.status).toBe(200);
      expect(detailRes.headers.get('cache-control')).toBe('no-store');
      expect(detailBody.data.fullAddress).toBe('Jl. Engku Putri No. 88');
      expect(detailBody.data.items[0]?.prints[0]?.designFileUrl).toContain('designs/orders/');
    });
  });

  describe('Alur Mesin Status Produksi, Review Desain, Verifikasi Bayar, Ongkir, & Resi', () => {
    it('menegakkan mesin status (tolak syarat tidak lengkap & loncat status) serta alur lengkap DP sampai COMPLETED', async () => {
      // 1. Belum APPROVED & DP belum VERIFIED -> tolak PRINT_QUEUE (409)
      const failPrintQueue = await fetch(`${baseUrl}/orders/${env.orderUuid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ toStatus: PRODUCTION_STATUS.PRINT_QUEUE }),
      });
      expect(failPrintQueue.status).toBe(409);

      // Tolak loncat status NEW_ORDER -> SHIPPING (409)
      const failJump = await fetch(`${baseUrl}/orders/${env.orderUuid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ toStatus: PRODUCTION_STATUS.SHIPPING }),
      });
      expect(failJump.status).toBe(409);

      // 2. Uji diskon sebelum verifikasi bayar (1.2jt -> diskon 200k = 1jt -> DP 70% = 700k)
      const discountRes = await fetch(`${baseUrl}/orders/${env.orderUuid}/discount`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ discountAmount: 200000, discountNote: 'Diskon awal' }),
      });
      // Gagal 409 karena bukti pembayaran awal sudah diupload
      expect(discountRes.status).toBe(409);

      // 3. Antrean pembayaran + tolak lalu verifikasi DP
      const paymentsRes = await fetch(`${baseUrl}/payments?status=PENDING&hasProof=true`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const paymentsBody = (await paymentsRes.json()) as { data: AdminPaymentListItemDto[] };
      expect(paymentsRes.status).toBe(200);
      expect(paymentsBody.data).toHaveLength(1);
      expect(paymentsBody.data[0]?.proofImageUrl).toContain('payment-proofs/');

      const rejectRes = await fetch(`${baseUrl}/payments/${env.dpPaymentUuid}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ rejectionReason: 'Foto buram' }),
      });
      expect(rejectRes.status).toBe(200);

      // Sekarang diskon boleh diubah karena status DP REJECTED (bukan PENDING+bukti / VERIFIED)
      const discountOk = await fetch(`${baseUrl}/orders/${env.orderUuid}/discount`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ discountAmount: 200000, discountNote: 'Diskon komunitas' }),
      });
      const discountBody = (await discountOk.json()) as { data: AdminOrderDetailDto };
      expect(discountOk.status).toBe(200);
      expect(discountBody.data.dpRequiredAmount).toBe(700000);

      // Verifikasi pembayaran DP -> remaining_balance = 1.000.000 - 700.000 = 300.000
      const verifyDpRes = await fetch(`${baseUrl}/payments/${env.dpPaymentUuid}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ approve: true }),
      });
      expect(verifyDpRes.status).toBe(200);
      expect(env.getOrders()[0]?.remaining_balance).toBe(300000);

      // 4. Review desain NEED_REVISION tanpa catatan -> 400; APPROVED -> 200
      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/design`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({ designStatus: DESIGN_STATUS.NEED_REVISION }),
          })
        ).status
      ).toBe(400);

      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/design`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({
              designStatus: DESIGN_STATUS.APPROVED,
              designReviewNotes: 'Desain oke',
            }),
          })
        ).status
      ).toBe(200);

      // 5. Pindah NEW_ORDER -> PRINT_QUEUE -> PRESSING_QC
      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({ toStatus: PRODUCTION_STATUS.PRINT_QUEUE }),
          })
        ).status
      ).toBe(200);

      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({ toStatus: PRODUCTION_STATUS.PRESSING_QC }),
          })
        ).status
      ).toBe(200);

      // 6. Coba masuk AWAITING_SETTLEMENT sebelum upload foto QC -> tolak 409
      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({ toStatus: PRODUCTION_STATUS.AWAITING_SETTLEMENT }),
          })
        ).status
      ).toBe(409);

      // Upload multi foto QC (2 PNG via sharp)
      const png1 = await sharp({
        create: { width: 80, height: 80, channels: 3, background: '#111111' },
      })
        .png()
        .toBuffer();
      const png2 = await sharp({
        create: { width: 80, height: 80, channels: 3, background: '#F5F5F5' },
      })
        .png()
        .toBuffer();

      const qcForm = new FormData();
      qcForm.append('files', new Blob([new Uint8Array(png1)], { type: 'image/png' }), 'qc1.png');
      qcForm.append('files', new Blob([new Uint8Array(png2)], { type: 'image/png' }), 'qc2.png');
      const qcUploadRes = await fetch(`${baseUrl}/orders/${env.orderUuid}/qc-photos`, {
        method: 'POST',
        headers: { 'x-test-role': 'ADMIN' },
        body: qcForm,
      });
      const qcBody = (await qcUploadRes.json()) as { data: AdminOrderQcPhotoDto[] };
      expect(qcUploadRes.status).toBe(201);
      expect(qcBody.data).toHaveLength(2);
      expect(env.qcFiles.size).toBe(2);

      // 7. Input ongkir Rp 40.000 -> SETTLEMENT = 300.000 + 40.000 = 340.000
      const shipCostRes = await fetch(`${baseUrl}/orders/${env.orderUuid}/shipping-cost`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ shippingCost: 40000 }),
      });
      const shipCostBody = (await shipCostRes.json()) as { data: AdminOrderDetailDto };
      expect(shipCostRes.status).toBe(200);
      expect(shipCostBody.data.remainingBalance).toBe(340000);
      const settlementPay = shipCostBody.data.payments.find(
        (p) => p.paymentStage === PAYMENT_STAGE.SETTLEMENT
      )!;
      expect(settlementPay.amount).toBe(340000);

      // Masuk AWAITING_SETTLEMENT
      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({ toStatus: PRODUCTION_STATUS.AWAITING_SETTLEMENT }),
          })
        ).status
      ).toBe(200);

      // Simulasikan bukti pelunasan masuk & verifikasi -> remainingBalance menjadi 0
      const rawSettlement = env
        .getPayments()
        .find((p) => p.payment_uuid === settlementPay.paymentUuid)!;
      rawSettlement.proof_image_path = `${env.orderUuid}/${settlementPay.paymentUuid}/lunas.png`;
      expect(
        (
          await fetch(`${baseUrl}/payments/${settlementPay.paymentUuid}/verify`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({ approve: true }),
          })
        ).status
      ).toBe(200);
      expect(env.getOrders()[0]?.remaining_balance).toBe(0);

      // 8. Validasi kurir & resi: kurir tidak dikenal -> 400; JNE valid -> 200 + trackingUrl
      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/shipment`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({
              shippingCourier: 'KURIR_PALSU',
              trackingReceiptNumber: '12345',
            }),
          })
        ).status
      ).toBe(400);

      const shipmentRes = await fetch(`${baseUrl}/orders/${env.orderUuid}/shipment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({
          shippingCourier: 'JNE',
          shippingService: 'REG',
          trackingReceiptNumber: 'JNE123456789',
        }),
      });
      const shipmentBody = (await shipmentRes.json()) as { data: AdminOrderDetailDto };
      expect(shipmentRes.status).toBe(200);
      expect(shipmentBody.data.trackingUrl).toBe('https://www.jne.co.id/tracking-package');

      // 9. Pindah ke SHIPPING lalu COMPLETED
      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({ toStatus: PRODUCTION_STATUS.SHIPPING }),
          })
        ).status
      ).toBe(200);

      expect(
        (
          await fetch(`${baseUrl}/orders/${env.orderUuid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
            body: JSON.stringify({ toStatus: PRODUCTION_STATUS.COMPLETED }),
          })
        ).status
      ).toBe(200);
    });
  });

  describe('Upload/Hapus Foto QC, Pembatalan+Refund, & Endpoint SPK PDF', () => {
    it('membersihkan foto QC yatim jika DB gagal, menghapus foto QC via DELETE, serta menegakkan aturan refund pembatalan', async () => {
      const pngBuffer = await sharp({
        create: { width: 60, height: 60, channels: 3, background: '#111111' },
      })
        .png()
        .toBuffer();

      // Simulasikan gagal DB setelah upload ke storage -> objek qc-photos dibersihkan otomatis
      env.setForceFailQcDb(true);
      const failForm = new FormData();
      failForm.append(
        'files',
        new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
        'a.png'
      );
      const failRes = await fetch(`${baseUrl}/orders/${env.orderUuid}/qc-photos`, {
        method: 'POST',
        headers: { 'x-test-role': 'ADMIN' },
        body: failForm,
      });
      expect(failRes.status).toBe(500);
      expect(env.qcFiles.size).toBe(0);
      expect(env.removedQcPaths).toHaveLength(1);
      env.setForceFailQcDb(false);

      // Upload valid lalu hapus 1 foto QC
      const okForm = new FormData();
      okForm.append('files', new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }), 'b.png');
      const okRes = await fetch(`${baseUrl}/orders/${env.orderUuid}/qc-photos`, {
        method: 'POST',
        headers: { 'x-test-role': 'ADMIN' },
        body: okForm,
      });
      const okBody = (await okRes.json()) as { data: AdminOrderQcPhotoDto[] };
      const photoId = okBody.data[0]!.id;

      const delRes = await fetch(`${baseUrl}/orders/${env.orderUuid}/qc-photos/${photoId}`, {
        method: 'DELETE',
        headers: { 'x-test-role': 'ADMIN' },
      });
      expect(delRes.status).toBe(200);
      expect(env.getQcPhotos()).toHaveLength(0);

      // Verifikasi DP lalu batalkan order: wajib menyertakan refundedAmount
      await fetch(`${baseUrl}/payments/${env.dpPaymentUuid}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ approve: true }),
      });

      const cancelMissingRefund = await fetch(`${baseUrl}/orders/${env.orderUuid}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ reason: 'Pelanggan membatalkan desain' }),
      });
      expect(cancelMissingRefund.status).toBe(400);

      const cancelOk = await fetch(`${baseUrl}/orders/${env.orderUuid}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
        body: JSON.stringify({
          reason: 'Pelanggan membatalkan desain',
          refundedAmount: 500000,
        }),
      });
      const cancelBody = (await cancelOk.json()) as { data: AdminOrderDetailDto };
      expect(cancelOk.status).toBe(200);
      expect(cancelBody.data.productionStatus).toBe(PRODUCTION_STATUS.CANCELLED);
      expect(cancelBody.data.refundedAmount).toBe(500000);
    });

    it('menghasilkan SPK PDF valid (%PDF-) dengan gambar desain dan tanpa harga via GET /api/admin/orders/:uuid/spk', async () => {
      const designPng = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 17, g: 17, b: 17, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();
      env.designFiles.set(`orders/${env.orderUuid}/front.png`, designPng);

      const res = await fetch(`${baseUrl}/orders/${env.orderUuid}/spk`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/pdf');
      expect(res.headers.get('content-length')).toBe(String(buf.length));
      expect(res.headers.get('content-disposition')).toBe(
        'attachment; filename="SPK-YNG-ADM001.pdf"'
      );
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
      expect(buf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
      expect(buf.length).toBeGreaterThan(1000);

      // Pastikan generator langsung juga aman bila dipanggil tanpa buffer desain
      const rawPdf = await generateSpkPdfBuffer({
        order: env.getOrders()[0]!,
        items: [],
        itemSizes: [],
        itemPrints: [],
        payments: [],
        qcPhotos: [],
        statusHistory: [],
      });
      expect(rawPdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    });
  });
});
