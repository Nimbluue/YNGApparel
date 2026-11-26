import path from 'node:path';
import {
  DESIGN_STATUS,
  FULFILLMENT_TYPE,
  PAYMENT_SCHEME,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  type AdminCreateManualOrderRequestDto,
  type AdminUpdateAddressRequestDto,
  type CourierCode,
  type DesignStatus,
  type FulfillmentType,
  type PaymentStage,
  type PaymentStatus,
  type PricingQuotePrintInputDto,
  type ProductionStatus,
  type Rupiah,
} from '@yng/shared';
import { query, withTransaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  calculateQuoteFromReferenceData,
  resolveInitialPaymentRequirement,
} from '../services/pricingService.js';
import { generateOrderCode } from '../utils/orderCode.js';
import { normalizeWhatsApp } from '../utils/phone.js';
import type { CatalogRepository, PricingLookupIds } from './catalogModel.js';
import orderModel, {
  buildUserCartFileRegex,
  type DesignFileTransferPlan,
  type OrderDetailRecord,
  type OrderPaymentRow,
  type OrderQcPhotoRow,
  type OrderRow,
} from './orderModel.js';

export interface AdminOrderListRow {
  id: number;
  transaction_uuid: string;
  order_code: string;
  source: OrderRow['source'];
  customer_name: string;
  customer_whatsapp: string;
  fulfillment_type: FulfillmentType;
  province_name: string | null;
  city_name: string | null;
  district_name: string | null;
  postal_code: string | null;
  full_address: string | null;
  total_qty: number;
  payment_scheme: OrderRow['payment_scheme'];
  dp_percent_snapshot: number | null;
  grand_total: Rupiah;
  remaining_balance: Rupiah;
  production_status: ProductionStatus;
  design_status: DesignStatus;
  initial_payment_status: PaymentStatus | null;
  initial_payment_has_proof: boolean;
  has_pending_proof: boolean;
  has_custom_color: boolean;
  qc_photo_count: number;
  shipping_courier: string | null;
  tracking_receipt_number: string | null;
  payment_due_at: Date | string | null;
  estimated_finish_date: Date | string | null;
  created_at: Date | string;
}

export interface AdminPaymentListRow extends OrderPaymentRow {
  order_transaction_uuid: string;
  order_code: string;
  customer_name: string;
  customer_whatsapp: string;
  production_status: ProductionStatus;
  dp_percent_snapshot: number | null;
  shipping_cost: Rupiah;
}

export interface AdminOrderListFilters {
  status?: ProductionStatus;
  paymentStatus?: PaymentStatus;
  fulfillmentType?: FulfillmentType;
  search?: string;
  page: number;
  limit: number;
}

export interface AdminPaymentListFilters {
  status?: PaymentStatus;
  hasProof?: boolean;
  page: number;
  limit: number;
}

export interface AdminOrderRepository {
  listOrders(filters: AdminOrderListFilters): Promise<{ rows: AdminOrderListRow[]; total: number }>;
  listKanbanOrders(): Promise<{
    activeRows: AdminOrderListRow[];
    completedCount: number;
    cancelledCount: number;
  }>;
  findOrderDetailByUuid(transactionUuid: string): Promise<OrderDetailRecord | null>;
  getSignedUrlExpirySeconds(): Promise<number>;
  transitionStatusAtomic(input: {
    transactionUuid: string;
    toStatus: ProductionStatus;
    notes: string | null;
    adminUserId: number;
  }): Promise<OrderDetailRecord | null>;
  reviewDesignAtomic(input: {
    transactionUuid: string;
    designStatus: DesignStatus;
    designReviewNotes: string | null;
    adminUserId: number;
  }): Promise<OrderDetailRecord | null>;
  cancelOrderAtomic(input: {
    transactionUuid: string;
    reason: string;
    refundedAmount?: Rupiah;
    adminUserId: number;
  }): Promise<OrderDetailRecord | null>;
  updateDiscountAtomic(input: {
    transactionUuid: string;
    discountAmount: Rupiah;
    discountNote: string | null;
    adminUserId: number;
  }): Promise<OrderDetailRecord | null>;
  updateAddressAtomic(input: {
    transactionUuid: string;
    patch: AdminUpdateAddressRequestDto;
    adminUserId: number;
  }): Promise<OrderDetailRecord | null>;
  updateNotesAtomic(input: {
    transactionUuid: string;
    adminNotes?: string | null;
    estimatedFinishDate?: string | null;
  }): Promise<OrderDetailRecord | null>;
  listPayments(
    filters: AdminPaymentListFilters
  ): Promise<{ rows: AdminPaymentListRow[]; total: number }>;
  verifyOrRejectPaymentAtomic(input: {
    paymentUuid: string;
    approve: boolean;
    rejectionReason: string | null;
    adminUserId: number;
  }): Promise<{ order: OrderRow; payment: OrderPaymentRow } | null>;
  addQcPhotosAtomic(input: {
    transactionUuid: string;
    photoPaths: string[];
    adminUserId: number;
  }): Promise<{ order: OrderRow; insertedPhotos: OrderQcPhotoRow[] } | null>;
  deleteQcPhotoAtomic(input: {
    transactionUuid: string;
    photoId: number;
  }): Promise<{ order: OrderRow; deletedPhotoPath: string } | null>;
  updateShippingCostAtomic(input: {
    transactionUuid: string;
    shippingCost: Rupiah;
    notes: string | null;
    adminUserId: number;
  }): Promise<OrderDetailRecord | null>;
  updateShipmentAtomic(input: {
    transactionUuid: string;
    shippingCourier: CourierCode;
    shippingService: string | null;
    trackingReceiptNumber: string;
    adminUserId: number;
  }): Promise<OrderDetailRecord | null>;
  createManualOrderAtomic(input: {
    adminUserId: number;
    adminUserUuid: string;
    payload: AdminCreateManualOrderRequestDto;
    catalogRepo: Pick<CatalogRepository, 'loadPricingReferenceData'>;
    executeDesignTransfers: (transfers: DesignFileTransferPlan[]) => Promise<void>;
  }): Promise<OrderDetailRecord>;
}

export interface AdminOrderModelDeps {
  query?: typeof query;
  withTransaction?: typeof withTransaction;
  findOrderDetailByUuid?: (transactionUuid: string) => Promise<OrderDetailRecord | null>;
  getSignedUrlExpirySeconds?: () => Promise<number>;
}

const ORDER_COLUMNS =
  'id, transaction_uuid, order_code, user_id, source, idempotency_key, customer_name, customer_whatsapp, fulfillment_type, province_name, city_name, district_name, postal_code, full_address, total_qty, dp_min_qty_snapshot, is_dp_eligible, payment_scheme, dp_percent_snapshot, subtotal_amount, discount_amount, discount_note, shipping_cost, grand_total, dp_required_amount, remaining_balance, refunded_amount, production_status, design_status, design_review_notes, admin_notes, estimated_finish_date, shipping_courier, shipping_service, tracking_receipt_number, shipped_at, payment_due_at, cancelled_reason, cancelled_at, completed_at, created_at, updated_at';

const PAYMENT_COLUMNS =
  'id, payment_uuid, order_id, payment_stage, payment_method, payment_account_id, amount, proof_image_path, status, rejection_reason, proof_uploaded_at, verified_at, created_at';

const ADMIN_ORDER_LIST_SELECT = `
  SELECT o.id,
         o.transaction_uuid,
         o.order_code,
         o.source,
         o.customer_name,
         o.customer_whatsapp,
         o.fulfillment_type,
         o.province_name,
         o.city_name,
         o.district_name,
         o.postal_code,
         o.full_address,
         o.total_qty,
         o.payment_scheme,
         o.dp_percent_snapshot,
         o.grand_total,
         o.remaining_balance,
         o.production_status,
         o.design_status,
         ip.status AS initial_payment_status,
         (ip.proof_image_path IS NOT NULL) AS initial_payment_has_proof,
         EXISTS (
           SELECT 1
           FROM payments pp
           WHERE pp.order_id = o.id
             AND pp.status = 'PENDING'
             AND pp.proof_image_path IS NOT NULL
         ) AS has_pending_proof,
         EXISTS (
           SELECT 1
           FROM order_items oi
           WHERE oi.order_id = o.id
             AND oi.is_custom_color = TRUE
         ) AS has_custom_color,
         (SELECT COUNT(*)::int FROM order_qc_photos qp WHERE qp.order_id = o.id) AS qc_photo_count,
         o.shipping_courier,
         o.tracking_receipt_number,
         o.payment_due_at,
         o.estimated_finish_date,
         o.created_at
  FROM orders o
  LEFT JOIN payments ip
    ON ip.order_id = o.id
   AND ip.payment_stage = CASE
     WHEN o.payment_scheme = 'DP' THEN 'DP'::payment_stage_t
     ELSE 'FULL'::payment_stage_t
   END`;

export function hasCompleteAddress(order: {
  province_name: string | null;
  city_name: string | null;
  district_name: string | null;
  postal_code: string | null;
  full_address: string | null;
}): boolean {
  return Boolean(
    order.province_name?.trim() &&
    order.city_name?.trim() &&
    order.district_name?.trim() &&
    order.postal_code?.trim() &&
    order.full_address?.trim()
  );
}

/**
 * Validasi mesin status produksi resmi sesuai SPEC 6.3.
 * Dipakai oleh repository di dalam transaksi `FOR UPDATE` dan diekspor untuk unit testing.
 */
export function assertValidStatusTransition(input: {
  order: Pick<
    OrderRow,
    | 'production_status'
    | 'design_status'
    | 'fulfillment_type'
    | 'province_name'
    | 'city_name'
    | 'district_name'
    | 'postal_code'
    | 'full_address'
    | 'shipping_courier'
    | 'tracking_receipt_number'
    | 'remaining_balance'
    | 'payment_scheme'
  >;
  toStatus: ProductionStatus;
  payments: readonly OrderPaymentRow[];
  qcPhotoCount: number;
}): void {
  const { order, toStatus, payments, qcPhotoCount } = input;
  const from = order.production_status;

  if (from === toStatus) {
    throw new AppError('Pesanan sudah berada pada status produksi tersebut.', 409);
  }

  if (toStatus === PRODUCTION_STATUS.CANCELLED) {
    throw new AppError(
      'Gunakan endpoint pembatalan khusus untuk membatalkan pesanan dan mencatat refund.',
      409
    );
  }

  if (from === PRODUCTION_STATUS.NEW_ORDER && toStatus === PRODUCTION_STATUS.PRINT_QUEUE) {
    if (order.design_status !== DESIGN_STATUS.APPROVED) {
      throw new AppError(
        'Desain harus disetujui (APPROVED) terlebih dahulu sebelum masuk antrean cetak.',
        409
      );
    }

    const expectedInitialStage =
      order.payment_scheme === PAYMENT_SCHEME.DP ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
    const initialPayment = payments.find((p) => p.payment_stage === expectedInitialStage);
    if (!initialPayment || initialPayment.status !== PAYMENT_STATUS.VERIFIED) {
      throw new AppError(
        'Pembayaran awal harus berstatus VERIFIED sebelum pesanan masuk antrean cetak.',
        409
      );
    }
    return;
  }

  if (from === PRODUCTION_STATUS.PRINT_QUEUE && toStatus === PRODUCTION_STATUS.PRESSING_QC) {
    return;
  }

  if (
    from === PRODUCTION_STATUS.PRESSING_QC &&
    toStatus === PRODUCTION_STATUS.AWAITING_SETTLEMENT
  ) {
    if (qcPhotoCount < 1) {
      throw new AppError(
        'Unggah minimal 1 foto hasil QC terlebih dahulu sebelum menagih pelunasan.',
        409
      );
    }
    if (Number(order.remaining_balance) <= 0) {
      throw new AppError(
        'Pesanan tidak memiliki sisa tagihan; lanjutkan langsung ke status Pengiriman / Siap Diambil.',
        409
      );
    }
    return;
  }

  if (
    (from === PRODUCTION_STATUS.PRESSING_QC || from === PRODUCTION_STATUS.AWAITING_SETTLEMENT) &&
    toStatus === PRODUCTION_STATUS.SHIPPING
  ) {
    if (from === PRODUCTION_STATUS.PRESSING_QC && qcPhotoCount < 1) {
      throw new AppError(
        'Unggah minimal 1 foto hasil QC terlebih dahulu sebelum menyelesaikan tahap QC.',
        409
      );
    }
    if (Number(order.remaining_balance) > 0) {
      throw new AppError(
        'Sisa tagihan pesanan harus lunas (0) sebelum masuk tahap Pengiriman / Siap Diambil.',
        409
      );
    }
    if (order.fulfillment_type === FULFILLMENT_TYPE.SHIP) {
      if (!hasCompleteAddress(order)) {
        throw new AppError(
          'Alamat pengiriman lengkap wajib diisi sebelum pesanan masuk tahap Pengiriman.',
          409
        );
      }
      if (!order.shipping_courier?.trim() || !order.tracking_receipt_number?.trim()) {
        throw new AppError(
          'Nama kurir dan nomor resi wajib diisi sebelum pesanan masuk tahap Pengiriman.',
          409
        );
      }
    }
    return;
  }

  if (from === PRODUCTION_STATUS.SHIPPING && toStatus === PRODUCTION_STATUS.COMPLETED) {
    if (Number(order.remaining_balance) > 0) {
      throw new AppError('Pesanan masih memiliki sisa tagihan yang belum lunas.', 409);
    }
    return;
  }

  throw new AppError(
    `Transisi status produksi dari ${from} ke ${toStatus} tidak diizinkan oleh mesin status.`,
    409
  );
}

/**
 * Membangun repository operasional pesanan dan verifikasi pembayaran untuk Admin (`pg` raw query).
 */
export function createAdminOrderModel(deps: AdminOrderModelDeps = {}): AdminOrderRepository {
  const dbQuery = deps.query ?? query;
  const runInTransaction = deps.withTransaction ?? withTransaction;
  const loadDetail =
    deps.findOrderDetailByUuid ??
    ((transactionUuid: string) => orderModel.findOrderDetailByUuid(transactionUuid));
  const loadSignedUrlTtl =
    deps.getSignedUrlExpirySeconds ?? (() => orderModel.getSignedUrlExpirySeconds());

  return {
    async listOrders(filters) {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.status) {
        params.push(filters.status);
        conditions.push(`o.production_status = $${params.length}`);
      }
      if (filters.fulfillmentType) {
        params.push(filters.fulfillmentType);
        conditions.push(`o.fulfillment_type = $${params.length}`);
      }
      if (filters.paymentStatus) {
        params.push(filters.paymentStatus);
        conditions.push(
          `EXISTS (SELECT 1 FROM payments pf WHERE pf.order_id = o.id AND pf.status = $${params.length})`
        );
      }
      if (filters.search && filters.search.trim().length > 0) {
        params.push(`%${filters.search.trim()}%`);
        const idx = params.length;
        conditions.push(
          `(o.order_code ILIKE $${idx} OR o.customer_name ILIKE $${idx} OR o.customer_whatsapp ILIKE $${idx})`
        );
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countRes = await dbQuery<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM orders o ${whereClause}`,
        params
      );
      const total = countRes.rows[0]?.total ?? 0;

      const offset = (filters.page - 1) * filters.limit;
      const rowsParams = [...params, filters.limit, offset];
      const rowsRes = await dbQuery<AdminOrderListRow>(
        `${ADMIN_ORDER_LIST_SELECT}
         ${whereClause}
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
        rowsParams
      );

      return { rows: rowsRes.rows, total };
    },

    async listKanbanOrders() {
      const [activeRes, archivedRes] = await Promise.all([
        dbQuery<AdminOrderListRow>(
          `${ADMIN_ORDER_LIST_SELECT}
           WHERE o.production_status IN ('NEW_ORDER','PRINT_QUEUE','PRESSING_QC','AWAITING_SETTLEMENT','SHIPPING')
           ORDER BY o.created_at ASC, o.id ASC`
        ),
        dbQuery<{ completed_count: number; cancelled_count: number }>(
          `SELECT
             COUNT(*) FILTER (WHERE production_status = 'COMPLETED')::int AS completed_count,
             COUNT(*) FILTER (WHERE production_status = 'CANCELLED')::int AS cancelled_count
           FROM orders`
        ),
      ]);

      return {
        activeRows: activeRes.rows,
        completedCount: archivedRes.rows[0]?.completed_count ?? 0,
        cancelledCount: archivedRes.rows[0]?.cancelled_count ?? 0,
      };
    },

    findOrderDetailByUuid: loadDetail,
    getSignedUrlExpirySeconds: loadSignedUrlTtl,

    async transitionStatusAtomic({ transactionUuid, toStatus, notes, adminUserId }) {
      const updatedTxUuid = await runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        const [paymentsRes, qcCountRes] = await Promise.all([
          client.query<OrderPaymentRow>(
            `SELECT ${PAYMENT_COLUMNS}
             FROM payments
             WHERE order_id = $1
             ORDER BY id ASC
             FOR UPDATE`,
            [order.id]
          ),
          client.query<{ cnt: number }>(
            `SELECT COUNT(*)::int AS cnt FROM order_qc_photos WHERE order_id = $1`,
            [order.id]
          ),
        ]);

        assertValidStatusTransition({
          order,
          toStatus,
          payments: paymentsRes.rows,
          qcPhotoCount: qcCountRes.rows[0]?.cnt ?? 0,
        });

        if (toStatus === PRODUCTION_STATUS.SHIPPING) {
          await client.query(
            `UPDATE orders
             SET production_status = $1,
                 shipped_at = COALESCE(shipped_at, NOW())
             WHERE id = $2`,
            [toStatus, order.id]
          );
        } else if (toStatus === PRODUCTION_STATUS.COMPLETED) {
          await client.query(
            `UPDATE orders
             SET production_status = $1,
                 completed_at = COALESCE(completed_at, NOW())
             WHERE id = $2`,
            [toStatus, order.id]
          );
        } else {
          await client.query(`UPDATE orders SET production_status = $1 WHERE id = $2`, [
            toStatus,
            order.id,
          ]);
        }

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [order.id, order.production_status, toStatus, notes, adminUserId]
        );

        return order.transaction_uuid;
      });

      if (!updatedTxUuid) return null;
      return loadDetail(updatedTxUuid);
    },

    async reviewDesignAtomic({ transactionUuid, designStatus, designReviewNotes, adminUserId }) {
      const updatedTxUuid = await runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        if (order.production_status !== PRODUCTION_STATUS.NEW_ORDER) {
          throw new AppError(
            'Status desain hanya dapat diubah saat pesanan berada pada tahap Order Masuk.',
            409
          );
        }

        await client.query(
          `UPDATE orders
           SET design_status = $1,
               design_review_notes = $2
           WHERE id = $3`,
          [designStatus, designReviewNotes, order.id]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            order.production_status,
            order.production_status,
            `Review desain: ${designStatus}${designReviewNotes ? ` — ${designReviewNotes}` : ''}`,
            adminUserId,
          ]
        );

        return order.transaction_uuid;
      });

      if (!updatedTxUuid) return null;
      return loadDetail(updatedTxUuid);
    },

    async cancelOrderAtomic({ transactionUuid, reason, refundedAmount, adminUserId }) {
      const updatedTxUuid = await runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
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

        const verifiedRes = await client.query<{ total_verified: number }>(
          `SELECT COALESCE(SUM(amount), 0)::numeric AS total_verified
           FROM payments
           WHERE order_id = $1
             AND status = 'VERIFIED'`,
          [order.id]
        );
        const totalVerified = Math.round(Number(verifiedRes.rows[0]?.total_verified ?? 0));

        let finalRefund = 0;
        if (totalVerified > 0) {
          if (refundedAmount === undefined || !Number.isInteger(refundedAmount)) {
            throw new AppError(
              'Pesanan sudah memiliki pembayaran terverifikasi; nominal refund wajib diisi (0 bila hangus).',
              400
            );
          }
          if (refundedAmount < 0 || refundedAmount > totalVerified) {
            throw new AppError(
              `Nominal refund harus antara 0 sampai total pembayaran terverifikasi (${totalVerified}).`,
              400
            );
          }
          finalRefund = refundedAmount;
        } else if (refundedAmount !== undefined && refundedAmount > 0) {
          throw new AppError(
            'Nominal refund tidak boleh lebih dari 0 karena belum ada pembayaran terverifikasi.',
            400
          );
        }

        await client.query(
          `UPDATE orders
           SET production_status = $1,
               cancelled_reason = $2,
               cancelled_at = NOW(),
               refunded_amount = $3
           WHERE id = $4`,
          [PRODUCTION_STATUS.CANCELLED, reason, finalRefund, order.id]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            order.production_status,
            PRODUCTION_STATUS.CANCELLED,
            `Dibatalkan: ${reason} (Refund: Rp ${finalRefund})`,
            adminUserId,
          ]
        );

        return order.transaction_uuid;
      });

      if (!updatedTxUuid) return null;
      return loadDetail(updatedTxUuid);
    },

    async updateDiscountAtomic({ transactionUuid, discountAmount, discountNote, adminUserId }) {
      const updatedTxUuid = await runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        if (order.production_status !== PRODUCTION_STATUS.NEW_ORDER) {
          throw new AppError('Diskon hanya dapat diubah saat pesanan berstatus Order Masuk.', 409);
        }

        const paymentsRes = await client.query<OrderPaymentRow>(
          `SELECT ${PAYMENT_COLUMNS}
           FROM payments
           WHERE order_id = $1
           FOR UPDATE`,
          [order.id]
        );

        const hasVerified = paymentsRes.rows.some((p) => p.status === PAYMENT_STATUS.VERIFIED);
        if (hasVerified) {
          throw new AppError(
            'Diskon tidak dapat diubah karena sudah ada pembayaran terverifikasi.',
            409
          );
        }

        const initialStage =
          order.payment_scheme === PAYMENT_SCHEME.DP ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
        const initialPayment = paymentsRes.rows.find((p) => p.payment_stage === initialStage);
        if (
          initialPayment &&
          initialPayment.status === PAYMENT_STATUS.PENDING &&
          initialPayment.proof_image_path !== null
        ) {
          throw new AppError(
            'Tolak bukti pembayaran awal yang menunggu verifikasi sebelum mengubah diskon.',
            409
          );
        }

        const subtotal = Math.round(Number(order.subtotal_amount));
        if (!Number.isInteger(discountAmount) || discountAmount < 0 || discountAmount > subtotal) {
          throw new AppError('Nominal diskon tidak valid atau melebihi subtotal pesanan.', 400);
        }

        const netSubtotal = subtotal - discountAmount;
        const dpRequiredAmount =
          order.payment_scheme === PAYMENT_SCHEME.DP
            ? Math.round((netSubtotal * Number(order.dp_percent_snapshot ?? 70)) / 100)
            : netSubtotal;
        const newRemainingBalance = netSubtotal + Math.round(Number(order.shipping_cost));

        await client.query(
          `UPDATE orders
           SET discount_amount = $1,
               discount_note = $2,
               dp_required_amount = $3,
               remaining_balance = $4
           WHERE id = $5`,
          [discountAmount, discountNote, dpRequiredAmount, newRemainingBalance, order.id]
        );

        if (initialPayment && dpRequiredAmount > 0) {
          await client.query(`UPDATE payments SET amount = $1 WHERE id = $2`, [
            dpRequiredAmount,
            initialPayment.id,
          ]);
        }

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            order.production_status,
            order.production_status,
            `Diskon diperbarui menjadi Rp ${discountAmount}${discountNote ? ` (${discountNote})` : ''}`,
            adminUserId,
          ]
        );

        return order.transaction_uuid;
      });

      if (!updatedTxUuid) return null;
      return loadDetail(updatedTxUuid);
    },

    async updateAddressAtomic({ transactionUuid, patch, adminUserId }) {
      const updatedTxUuid = await runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        if (
          order.production_status === PRODUCTION_STATUS.COMPLETED ||
          order.production_status === PRODUCTION_STATUS.CANCELLED
        ) {
          throw new AppError(
            'Alamat tidak dapat diubah pada pesanan yang sudah selesai atau dibatalkan.',
            409
          );
        }

        const nextFulfillment = patch.fulfillmentType ?? order.fulfillment_type;
        const nextName = (patch.customerName ?? order.customer_name).trim();
        let nextWhatsapp = order.customer_whatsapp;
        if (patch.customerWhatsapp !== undefined) {
          const normalized = normalizeWhatsApp(patch.customerWhatsapp);
          if (!normalized) {
            throw new AppError('Format nomor WhatsApp tidak valid (gunakan 08 atau 62).', 400);
          }
          nextWhatsapp = normalized;
        }

        const nextProvince =
          patch.provinceName !== undefined ? patch.provinceName : order.province_name;
        const nextCity = patch.cityName !== undefined ? patch.cityName : order.city_name;
        const nextDistrict =
          patch.districtName !== undefined ? patch.districtName : order.district_name;
        const nextPostal = patch.postalCode !== undefined ? patch.postalCode : order.postal_code;
        const nextFullAddress =
          patch.fullAddress !== undefined ? patch.fullAddress : order.full_address;

        if (
          nextFulfillment === FULFILLMENT_TYPE.SHIP &&
          (order.source === 'WEBSITE' || order.production_status === PRODUCTION_STATUS.SHIPPING) &&
          !hasCompleteAddress({
            province_name: nextProvince,
            city_name: nextCity,
            district_name: nextDistrict,
            postal_code: nextPostal,
            full_address: nextFullAddress,
          })
        ) {
          throw new AppError(
            'Alamat lengkap (provinsi, kota, kecamatan, kode pos, alamat) wajib terisi untuk pengiriman.',
            400
          );
        }

        await client.query(
          `UPDATE orders
           SET fulfillment_type = $1,
               customer_name = $2,
               customer_whatsapp = $3,
               province_name = $4,
               city_name = $5,
               district_name = $6,
               postal_code = $7,
               full_address = $8
           WHERE id = $9`,
          [
            nextFulfillment,
            nextName,
            nextWhatsapp,
            nextProvince,
            nextCity,
            nextDistrict,
            nextPostal,
            nextFullAddress,
            order.id,
          ]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            order.production_status,
            order.production_status,
            'Data pengiriman / alamat diperbarui oleh admin.',
            adminUserId,
          ]
        );

        return order.transaction_uuid;
      });

      if (!updatedTxUuid) return null;
      return loadDetail(updatedTxUuid);
    },

    async updateNotesAtomic({ transactionUuid, adminNotes, estimatedFinishDate }) {
      const updatedTxUuid = await runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        const nextAdminNotes = adminNotes !== undefined ? adminNotes : order.admin_notes;
        const nextEstimated =
          estimatedFinishDate !== undefined ? estimatedFinishDate : order.estimated_finish_date;

        await client.query(
          `UPDATE orders
           SET admin_notes = $1,
               estimated_finish_date = $2
           WHERE id = $3`,
          [nextAdminNotes, nextEstimated, order.id]
        );

        return order.transaction_uuid;
      });

      if (!updatedTxUuid) return null;
      return loadDetail(updatedTxUuid);
    },

    async listPayments(filters) {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.status) {
        params.push(filters.status);
        conditions.push(`p.status = $${params.length}`);
      }
      if (filters.hasProof === true) {
        conditions.push('p.proof_image_path IS NOT NULL');
      } else if (filters.hasProof === false) {
        conditions.push('p.proof_image_path IS NULL');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countRes = await dbQuery<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM payments p
         INNER JOIN orders o ON o.id = p.order_id
         ${whereClause}`,
        params
      );
      const total = countRes.rows[0]?.total ?? 0;

      const offset = (filters.page - 1) * filters.limit;
      const rowsParams = [...params, filters.limit, offset];
      const rowsRes = await dbQuery<AdminPaymentListRow>(
        `SELECT p.id,
                p.payment_uuid,
                p.order_id,
                p.payment_stage,
                p.payment_method,
                p.payment_account_id,
                p.amount,
                p.proof_image_path,
                p.status,
                p.rejection_reason,
                p.proof_uploaded_at,
                p.verified_at,
                p.created_at,
                o.transaction_uuid AS order_transaction_uuid,
                o.order_code,
                o.customer_name,
                o.customer_whatsapp,
                o.production_status,
                o.dp_percent_snapshot,
                o.shipping_cost
         FROM payments p
         INNER JOIN orders o ON o.id = p.order_id
         ${whereClause}
         ORDER BY COALESCE(p.proof_uploaded_at, p.created_at) DESC, p.id DESC
         LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
        rowsParams
      );

      return { rows: rowsRes.rows, total };
    },

    async verifyOrRejectPaymentAtomic({ paymentUuid, approve, rejectionReason, adminUserId }) {
      return runInTransaction(async (client) => {
        const paymentRes = await client.query<OrderPaymentRow>(
          `SELECT ${PAYMENT_COLUMNS}
           FROM payments
           WHERE payment_uuid = $1
           FOR UPDATE`,
          [paymentUuid]
        );
        const payment = paymentRes.rows[0];
        if (!payment) return null;

        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE id = $1
           FOR UPDATE`,
          [payment.order_id]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        if (order.production_status === PRODUCTION_STATUS.CANCELLED) {
          throw new AppError(
            'Pesanan yang sudah dibatalkan tidak dapat diverifikasi pembayarannya.',
            409
          );
        }

        if (payment.status === PAYMENT_STATUS.VERIFIED) {
          throw new AppError('Pembayaran ini sudah berstatus VERIFIED.', 409);
        }

        if (approve) {
          if (!payment.proof_image_path) {
            throw new AppError(
              'Bukti pembayaran belum diunggah sehingga tidak dapat diverifikasi.',
              409
            );
          }

          const updatedPayRes = await client.query<OrderPaymentRow>(
            `UPDATE payments
             SET status = $1,
                 rejection_reason = NULL,
                 verified_by = $2,
                 verified_at = NOW()
             WHERE id = $3
             RETURNING ${PAYMENT_COLUMNS}`,
            [PAYMENT_STATUS.VERIFIED, adminUserId, payment.id]
          );

          const verifiedSumRes = await client.query<{ total_verified: number }>(
            `SELECT COALESCE(SUM(amount), 0)::numeric AS total_verified
             FROM payments
             WHERE order_id = $1
               AND status = 'VERIFIED'`,
            [order.id]
          );
          const totalVerified = Math.round(Number(verifiedSumRes.rows[0]?.total_verified ?? 0));
          const nextRemaining = Math.max(0, Math.round(Number(order.grand_total)) - totalVerified);

          const updatedOrderRes = await client.query<OrderRow>(
            `UPDATE orders
             SET remaining_balance = $1
             WHERE id = $2
             RETURNING ${ORDER_COLUMNS}`,
            [nextRemaining, order.id]
          );

          await client.query(
            `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              order.id,
              order.production_status,
              order.production_status,
              `Pembayaran ${payment.payment_stage} sebesar Rp ${payment.amount} diverifikasi.`,
              adminUserId,
            ]
          );

          return {
            order: updatedOrderRes.rows[0]!,
            payment: updatedPayRes.rows[0]!,
          };
        }

        const reason = rejectionReason?.trim() ?? '';
        if (!reason) {
          throw new AppError('Alasan penolakan pembayaran wajib diisi.', 400);
        }

        const rejectedRes = await client.query<OrderPaymentRow>(
          `UPDATE payments
           SET status = $1,
               rejection_reason = $2,
               verified_by = NULL,
               verified_at = NULL
           WHERE id = $3
           RETURNING ${PAYMENT_COLUMNS}`,
          [PAYMENT_STATUS.REJECTED, reason, payment.id]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            order.production_status,
            order.production_status,
            `Pembayaran ${payment.payment_stage} ditolak: ${reason}`,
            adminUserId,
          ]
        );

        return {
          order,
          payment: rejectedRes.rows[0]!,
        };
      });
    },

    async addQcPhotosAtomic({ transactionUuid, photoPaths, adminUserId }) {
      return runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        if (
          order.production_status === PRODUCTION_STATUS.CANCELLED ||
          order.production_status === PRODUCTION_STATUS.COMPLETED
        ) {
          throw new AppError(
            'Foto QC tidak dapat ditambahkan pada pesanan yang sudah selesai atau dibatalkan.',
            409
          );
        }

        const insertedPhotos: OrderQcPhotoRow[] = [];
        for (const photoPath of photoPaths) {
          const insRes = await client.query<OrderQcPhotoRow>(
            `INSERT INTO order_qc_photos (order_id, photo_path)
             VALUES ($1, $2)
             RETURNING id, order_id, photo_path, created_at`,
            [order.id, photoPath]
          );
          insertedPhotos.push(insRes.rows[0]!);
        }

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            order.production_status,
            order.production_status,
            `Admin mengunggah ${photoPaths.length} foto QC.`,
            adminUserId,
          ]
        );

        return { order, insertedPhotos };
      });
    },

    async deleteQcPhotoAtomic({ transactionUuid, photoId }) {
      return runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        const delRes = await client.query<{ photo_path: string }>(
          `DELETE FROM order_qc_photos
           WHERE id = $1
             AND order_id = $2
           RETURNING photo_path`,
          [photoId, order.id]
        );
        const deleted = delRes.rows[0];
        if (!deleted) return null;

        return { order, deletedPhotoPath: deleted.photo_path };
      });
    },

    async updateShippingCostAtomic({ transactionUuid, shippingCost, notes, adminUserId }) {
      const updatedTxUuid = await runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        if (order.fulfillment_type === FULFILLMENT_TYPE.PICKUP) {
          throw new AppError('Pesanan Ambil di Workshop (PICKUP) tidak memakai ongkos kirim.', 409);
        }

        if (
          order.production_status !== PRODUCTION_STATUS.PRESSING_QC &&
          order.production_status !== PRODUCTION_STATUS.AWAITING_SETTLEMENT
        ) {
          throw new AppError(
            'Ongkos kirim hanya dapat diinput atau direvisi pada tahap Pressing & QC atau Menunggu Pelunasan.',
            409
          );
        }

        const paymentsRes = await client.query<OrderPaymentRow>(
          `SELECT ${PAYMENT_COLUMNS}
           FROM payments
           WHERE order_id = $1
           FOR UPDATE`,
          [order.id]
        );

        const finalStage: PaymentStage =
          order.payment_scheme === PAYMENT_SCHEME.DP
            ? PAYMENT_STAGE.SETTLEMENT
            : PAYMENT_STAGE.SHIPPING_FEE;
        const existingFinalPayment = paymentsRes.rows.find((p) => p.payment_stage === finalStage);

        if (existingFinalPayment) {
          if (existingFinalPayment.status === PAYMENT_STATUS.VERIFIED) {
            throw new AppError(
              'Ongkir tidak dapat diubah karena pembayaran tahap akhir sudah terverifikasi.',
              409
            );
          }
          if (
            existingFinalPayment.status === PAYMENT_STATUS.PENDING &&
            existingFinalPayment.proof_image_path !== null
          ) {
            throw new AppError(
              'Tolak bukti pembayaran tahap akhir yang menunggu verifikasi sebelum merevisi ongkir.',
              409
            );
          }
        }

        const verifiedSum = paymentsRes.rows
          .filter((p) => p.status === PAYMENT_STATUS.VERIFIED)
          .reduce((sum, p) => sum + Math.round(Number(p.amount)), 0);

        const netSubtotal = Math.max(
          0,
          Math.round(Number(order.subtotal_amount)) - Math.round(Number(order.discount_amount))
        );
        const newGrandTotal = netSubtotal + shippingCost;
        const newRemainingBalance = Math.max(0, newGrandTotal - verifiedSum);

        const targetFinalAmount =
          order.payment_scheme === PAYMENT_SCHEME.DP
            ? Math.max(0, newGrandTotal - verifiedSum)
            : shippingCost;

        if (targetFinalAmount > 0) {
          const upsertRes = await client.query<{ id: number }>(
            `INSERT INTO payments (order_id, payment_stage, amount, status)
             VALUES ($1, $2, $3, 'PENDING')
             ON CONFLICT (order_id, payment_stage) DO UPDATE
               SET amount = EXCLUDED.amount,
                   status = 'PENDING',
                   rejection_reason = NULL
               WHERE payments.status <> 'VERIFIED'
                 AND (payments.status = 'REJECTED' OR payments.proof_image_path IS NULL)
             RETURNING id`,
            [order.id, finalStage, targetFinalAmount]
          );
          if (upsertRes.rows.length === 0) {
            throw new AppError(
              'Gagal memperbarui tagihan tahap akhir karena sudah ada bukti/terverifikasi.',
              409
            );
          }
        } else if (existingFinalPayment) {
          await client.query(`DELETE FROM payments WHERE id = $1`, [existingFinalPayment.id]);
        }

        await client.query(
          `UPDATE orders
           SET shipping_cost = $1,
               remaining_balance = $2
           WHERE id = $3`,
          [shippingCost, newRemainingBalance, order.id]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            order.production_status,
            order.production_status,
            `Ongkir diatur ke Rp ${shippingCost}${notes ? ` (${notes})` : ''}`,
            adminUserId,
          ]
        );

        return order.transaction_uuid;
      });

      if (!updatedTxUuid) return null;
      return loadDetail(updatedTxUuid);
    },

    async updateShipmentAtomic({
      transactionUuid,
      shippingCourier,
      shippingService,
      trackingReceiptNumber,
      adminUserId,
    }) {
      const updatedTxUuid = await runInTransaction(async (client) => {
        const orderRes = await client.query<OrderRow>(
          `SELECT ${ORDER_COLUMNS}
           FROM orders
           WHERE transaction_uuid = $1
           FOR UPDATE`,
          [transactionUuid]
        );
        const order = orderRes.rows[0];
        if (!order) return null;

        if (order.fulfillment_type === FULFILLMENT_TYPE.PICKUP) {
          throw new AppError(
            'Pesanan Ambil di Workshop (PICKUP) tidak memerlukan kurir maupun nomor resi.',
            409
          );
        }

        if (
          order.production_status === PRODUCTION_STATUS.COMPLETED ||
          order.production_status === PRODUCTION_STATUS.CANCELLED
        ) {
          throw new AppError(
            'Data pengiriman tidak dapat diubah pada pesanan yang sudah selesai atau dibatalkan.',
            409
          );
        }

        await client.query(
          `UPDATE orders
           SET shipping_courier = $1,
               shipping_service = $2,
               tracking_receipt_number = $3
           WHERE id = $4`,
          [shippingCourier, shippingService, trackingReceiptNumber, order.id]
        );

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            order.production_status,
            order.production_status,
            `Resi pengiriman diperbarui: ${shippingCourier} (${trackingReceiptNumber})`,
            adminUserId,
          ]
        );

        return order.transaction_uuid;
      });

      if (!updatedTxUuid) return null;
      return loadDetail(updatedTxUuid);
    },

    async createManualOrderAtomic({
      adminUserId,
      adminUserUuid,
      payload,
      catalogRepo,
      executeDesignTransfers,
    }) {
      const normalizedWa = normalizeWhatsApp(payload.customerWhatsapp);
      if (!normalizedWa) {
        throw new AppError(
          'Nomor WhatsApp pelanggan harus berformat 62xxxxxxxxxx atau 08xxxxxxxxxx.',
          400
        );
      }

      const discountAmount = payload.discountAmount ?? 0;
      const shippingCost = payload.shippingCost ?? 0;
      if (payload.fulfillmentType === FULFILLMENT_TYPE.PICKUP && shippingCost > 0) {
        throw new AppError(
          'Ongkos kirim harus Rp 0 untuk pesanan Ambil di Workshop (PICKUP).',
          400
        );
      }

      const TMP_ADMIN_FILE_REGEX = /^tmp\/[a-f0-9]{32}\.(png|jpg|webp|svg|pdf)$/i;
      const adminCartFileRegex = buildUserCartFileRegex(adminUserUuid);

      const createdTxUuid = await runInTransaction(async (client) => {
        let resolvedUserId: number | null = null;
        if (payload.userUuid) {
          const userRes = await client.query<{ id: number }>(
            `SELECT id
             FROM users
             WHERE user_uuid = $1
               AND is_active = TRUE
             LIMIT 1`,
            [payload.userUuid]
          );
          const linkedUser = userRes.rows[0];
          if (!linkedUser) {
            throw new AppError('Akun pelanggan (userUuid) tidak ditemukan atau tidak aktif.', 404);
          }
          resolvedUserId = Number(linkedUser.id);
        }

        if (payload.paymentReceived?.received && payload.paymentReceived.paymentAccountId) {
          const accRes = await client.query<{ id: number }>(
            `SELECT id FROM payment_accounts WHERE id = $1 LIMIT 1`,
            [payload.paymentReceived.paymentAccountId]
          );
          if (!accRes.rows[0]) {
            throw new AppError('Rekening/QRIS pembayaran yang dipilih tidak ditemukan.', 400);
          }
        }

        // Kumpulkan ID master untuk kalkulasi harga server
        const modelIds = new Set<number>();
        const fabricIds = new Set<number>();
        const fabricColorIds = new Set<number>();
        const sizeIds = new Set<number>();
        const printSizeIds = new Set<number>();

        for (const item of payload.items) {
          modelIds.add(item.modelId);
          fabricIds.add(item.fabricId);
          if (item.fabricColorId !== null && item.fabricColorId !== undefined) {
            fabricColorIds.add(item.fabricColorId);
          }
          for (const s of item.sizes) {
            sizeIds.add(s.sizeId);
          }
          for (const p of item.prints ?? []) {
            printSizeIds.add(p.printSizeId);
          }
        }

        const lookup: PricingLookupIds = {
          modelIds: [...modelIds],
          fabricIds: [...fabricIds],
          fabricColorIds: [...fabricColorIds],
          sizeIds: [...sizeIds],
          printSizeIds: [...printSizeIds],
        };

        const refData = await catalogRepo.loadPricingReferenceData(lookup, client);
        const quote = calculateQuoteFromReferenceData(
          {
            items: payload.items.map((item) => ({
              modelId: item.modelId,
              fabricId: item.fabricId,
              isCustomColor: item.isCustomColor,
              fabricColorId: item.fabricColorId,
              colorName: item.colorName,
              colorHex: item.colorHex,
              sizes: item.sizes,
              prints: (item.prints ?? []).map((p): PricingQuotePrintInputDto => ({
                printSizeId: p.printSizeId,
                printPosition: p.printPosition,
              })),
            })),
          },
          refData,
          { discountAmount }
        );

        const paymentReq = resolveInitialPaymentRequirement(
          quote,
          payload.paymentScheme,
          discountAmount
        );

        const isPaymentReceived = Boolean(payload.paymentReceived?.received);
        const disableAutoCancel = payload.noAutoCancel !== false || isPaymentReceived;

        let paymentDueHours: number | null = null;
        if (!disableAutoCancel) {
          const dueRes = await client.query<{ setting_value: string }>(
            `SELECT setting_value FROM app_settings WHERE setting_key = 'initial_payment_due_hours' LIMIT 1`
          );
          const parsedDue = Number.parseInt(dueRes.rows[0]?.setting_value ?? '', 10);
          paymentDueHours = Number.isInteger(parsedDue) && parsedDue > 0 ? parsedDue : 24;
        }

        const grandTotal = quote.subtotalAmount - discountAmount + shippingCost;
        const initialPaid =
          isPaymentReceived && paymentReq.dpRequiredAmount > 0 ? paymentReq.dpRequiredAmount : 0;
        const remainingBalance = Math.max(0, grandTotal - initialPaid);

        const provinceName =
          payload.fulfillmentType === FULFILLMENT_TYPE.SHIP
            ? payload.provinceName?.trim() || null
            : null;
        const cityName =
          payload.fulfillmentType === FULFILLMENT_TYPE.SHIP
            ? payload.cityName?.trim() || null
            : null;
        const districtName =
          payload.fulfillmentType === FULFILLMENT_TYPE.SHIP
            ? payload.districtName?.trim() || null
            : null;
        const postalCode =
          payload.fulfillmentType === FULFILLMENT_TYPE.SHIP
            ? payload.postalCode?.trim() || null
            : null;
        const fullAddress =
          payload.fulfillmentType === FULFILLMENT_TYPE.SHIP
            ? payload.fullAddress?.trim() || null
            : null;

        let insertedOrder: { id: number; transaction_uuid: string; order_code: string } | null =
          null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const candidateCode = generateOrderCode();
          try {
            await client.query('SAVEPOINT sp_insert_manual_order');
            const insertRes = await client.query<{
              id: number;
              transaction_uuid: string;
              order_code: string;
            }>(
              `INSERT INTO orders (
                 order_code, user_id, source,
                 customer_name, customer_whatsapp,
                 fulfillment_type, province_name, city_name, district_name, postal_code, full_address,
                 total_qty, dp_min_qty_snapshot, payment_scheme, dp_percent_snapshot,
                 subtotal_amount, discount_amount, discount_note, shipping_cost,
                 dp_required_amount, remaining_balance,
                 production_status, design_status, admin_notes, estimated_finish_date,
                 payment_due_at
               )
               VALUES (
                 $1, $2, $3,
                 $4, $5,
                 $6, $7, $8, $9, $10, $11,
                 $12, $13, $14, $15,
                 $16, $17, $18, $19,
                 $20, $21,
                 $22, $23, $24, $25,
                 CASE WHEN $26::int IS NULL THEN NULL ELSE NOW() + ($26::int * INTERVAL '1 hour') END
               )
               RETURNING id, transaction_uuid, order_code`,
              [
                candidateCode,
                resolvedUserId,
                payload.source,
                payload.customerName.trim(),
                normalizedWa,
                payload.fulfillmentType,
                provinceName,
                cityName,
                districtName,
                postalCode,
                fullAddress,
                quote.totalQty,
                quote.dpMinQty,
                paymentReq.paymentScheme,
                paymentReq.dpPercentSnapshot,
                quote.subtotalAmount,
                discountAmount,
                payload.discountNote?.trim() || null,
                shippingCost,
                paymentReq.dpRequiredAmount,
                remainingBalance,
                PRODUCTION_STATUS.NEW_ORDER,
                DESIGN_STATUS.PENDING,
                payload.adminNotes?.trim() || null,
                payload.estimatedFinishDate?.trim() || null,
                paymentDueHours,
              ]
            );
            await client.query('RELEASE SAVEPOINT sp_insert_manual_order');
            insertedOrder = insertRes.rows[0];
            break;
          } catch (err: unknown) {
            await client.query('ROLLBACK TO SAVEPOINT sp_insert_manual_order');
            const pgErr = err as { code?: string; constraint?: string };
            if (pgErr.code === '23505' && pgErr.constraint === 'orders_order_code_key') {
              continue;
            }
            throw err;
          }
        }

        if (!insertedOrder) {
          throw new AppError('Gagal menghasilkan kode pesanan unik. Silakan coba lagi.', 500);
        }

        const transferByFromPath = new Map<string, string>();
        for (let i = 0; i < payload.items.length; i += 1) {
          const itemInput = payload.items[i]!;
          const breakdown = quote.items[i]!;
          const needsDesignHelp = Boolean(itemInput.needsDesignHelp);

          const itemRes = await client.query<{ id: number }>(
            `INSERT INTO order_items (
               order_id, model_id, fabric_id, model_name, fabric_name,
               fabric_color_id, is_custom_color, color_name, color_hex,
               needs_design_help, production_notes,
               locked_base_price, locked_fabric_price, item_qty, line_subtotal
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id`,
            [
              insertedOrder.id,
              breakdown.modelId,
              breakdown.fabricId,
              breakdown.modelName,
              breakdown.fabricName,
              breakdown.fabricColorId,
              breakdown.isCustomColor,
              breakdown.colorName,
              breakdown.colorHex,
              needsDesignHelp,
              itemInput.productionNotes?.trim() || null,
              breakdown.basePrice,
              breakdown.fabricAdditionalPrice,
              breakdown.itemQty,
              breakdown.lineSubtotal,
            ]
          );
          const orderItemId = Number(itemRes.rows[0]!.id);

          for (const sz of breakdown.sizes) {
            await client.query(
              `INSERT INTO order_item_sizes (
                 order_item_id, size_id, size_code, qty, locked_extra_charge
               )
               VALUES ($1, $2, $3, $4, $5)`,
              [orderItemId, sz.sizeId, sz.sizeCode, sz.qty, sz.extraCharge]
            );
          }

          const inputPrints = itemInput.prints ?? [];
          for (let pIdx = 0; pIdx < breakdown.prints.length; pIdx += 1) {
            const pBreakdown = breakdown.prints[pIdx]!;
            const pInput = inputPrints[pIdx];
            let targetDesignPath: string | null = null;
            let designFileName: string | null = null;

            const rawFileRef = pInput?.fileRef?.trim() || null;
            if (rawFileRef) {
              if (!adminCartFileRegex.test(rawFileRef) && !TMP_ADMIN_FILE_REGEX.test(rawFileRef)) {
                throw new AppError(
                  'Referensi file desain order manual tidak valid atau bukan milik sesi admin.',
                  400
                );
              }
              const existingTarget = transferByFromPath.get(rawFileRef);
              const baseFile = path.posix.basename(rawFileRef);
              targetDesignPath =
                existingTarget ?? `orders/${insertedOrder.transaction_uuid}/${baseFile}`;
              designFileName = pInput?.fileName?.trim() || baseFile;
              if (!existingTarget) {
                transferByFromPath.set(rawFileRef, targetDesignPath);
              }
            }

            await client.query(
              `INSERT INTO order_item_prints (
                 order_item_id, print_size_id, print_size_code, print_position,
                 raw_design_file_path, design_file_name, locked_spot_price, notes
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                orderItemId,
                pBreakdown.printSizeId,
                pBreakdown.printSizeCode,
                pBreakdown.printPosition,
                targetDesignPath,
                designFileName,
                pBreakdown.pricePerSpot,
                pInput?.notes?.trim() || null,
              ]
            );
          }
        }

        if (paymentReq.dpRequiredAmount > 0) {
          const initialStage =
            paymentReq.paymentScheme === PAYMENT_SCHEME.DP ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
          if (isPaymentReceived) {
            await client.query(
              `INSERT INTO payments (
                 order_id, payment_stage, payment_method, payment_account_id,
                 amount, status, verified_by, verified_at
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
              [
                insertedOrder.id,
                initialStage,
                payload.paymentReceived?.paymentMethod ?? null,
                payload.paymentReceived?.paymentAccountId ?? null,
                paymentReq.dpRequiredAmount,
                PAYMENT_STATUS.VERIFIED,
                adminUserId,
              ]
            );
          } else {
            await client.query(
              `INSERT INTO payments (order_id, payment_stage, amount, status)
               VALUES ($1, $2, $3, $4)`,
              [insertedOrder.id, initialStage, paymentReq.dpRequiredAmount, PAYMENT_STATUS.PENDING]
            );
          }
        }

        if (paymentReq.paymentScheme === PAYMENT_SCHEME.FULL && shippingCost > 0) {
          await client.query(
            `INSERT INTO payments (order_id, payment_stage, amount, status)
             VALUES ($1, $2, $3, $4)`,
            [insertedOrder.id, PAYMENT_STAGE.SHIPPING_FEE, shippingCost, PAYMENT_STATUS.PENDING]
          );
        }

        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, notes, changed_by)
           VALUES ($1, NULL, $2, $3, $4)`,
          [
            insertedOrder.id,
            PRODUCTION_STATUS.NEW_ORDER,
            `Order manual (${payload.source}) dibuat oleh admin${isPaymentReceived ? ' dengan pembayaran awal diterima' : ''}`,
            adminUserId,
          ]
        );

        const transferPlans: DesignFileTransferPlan[] = [];
        for (const [fromPath, toPath] of transferByFromPath.entries()) {
          transferPlans.push({ fromPath, toPath, mode: 'move' });
        }

        if (transferPlans.length > 0) {
          await executeDesignTransfers(transferPlans);
        }

        return insertedOrder.transaction_uuid;
      });

      const detail = await loadDetail(createdTxUuid);
      if (!detail) {
        throw new AppError('Order manual berhasil dibuat tetapi gagal dimuat kembali.', 500);
      }
      return detail;
    },
  };
}

export const adminOrderModel: AdminOrderRepository = createAdminOrderModel();

export default adminOrderModel;
