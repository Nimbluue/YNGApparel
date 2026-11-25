import {
  buildTrackingUrl,
  getCourierByCode,
  getPaymentStageLabel,
  type CreateOrderRequestDto,
  type OrderDetailDto,
  type OrderPaymentDto,
  type OrderPaymentsResponseDto,
  type OrderSummaryDto,
  type PaginationMeta,
  type PaymentMethod,
  type UploadPaymentProofResultDto,
} from '@yng/shared';
import { STORAGE_BUCKETS } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import catalogModel, { type CatalogRepository } from '../models/catalogModel.js';
import orderModel, {
  type DesignFileTransferPlan,
  type OrderDetailRecord,
  type OrderPaymentRow,
  type OrderRepository,
  type OrderRow,
} from '../models/orderModel.js';
import { processPaymentProofImage } from './imageService.js';
import * as storageService from './storageService.js';

export interface OrderServiceDeps {
  orderRepo?: OrderRepository;
  catalogRepo?: Pick<CatalogRepository, 'loadPricingReferenceData'>;
  storage?: {
    upload: typeof storageService.upload;
    download: typeof storageService.download;
    move: typeof storageService.move;
    remove: typeof storageService.remove;
    getSignedUrl: typeof storageService.getSignedUrl;
  };
  processProofImage?: typeof processPaymentProofImage;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return toIsoString(value);
}

async function resolveSignedUrlSafe(
  getSignedUrl: typeof storageService.getSignedUrl,
  bucket: typeof STORAGE_BUCKETS.PAYMENT_PROOFS | typeof STORAGE_BUCKETS.QC_PHOTOS,
  objectPath: string | null
): Promise<string | null> {
  if (!objectPath) return null;
  try {
    return await getSignedUrl(bucket, objectPath);
  } catch (err: unknown) {
    console.warn(`[OrderService] Gagal membuat signed URL (${bucket}):`, err);
    return null;
  }
}

async function mapPaymentRowToDto(
  payment: OrderPaymentRow,
  dpPercentSnapshot: number | null,
  getSignedUrl: typeof storageService.getSignedUrl
): Promise<OrderPaymentDto> {
  const proofImageUrl = await resolveSignedUrlSafe(
    getSignedUrl,
    STORAGE_BUCKETS.PAYMENT_PROOFS,
    payment.proof_image_path
  );

  return {
    paymentUuid: payment.payment_uuid,
    paymentStage: payment.payment_stage,
    paymentStageLabel: getPaymentStageLabel(payment.payment_stage, dpPercentSnapshot),
    paymentMethod: payment.payment_method,
    paymentAccountId: payment.payment_account_id !== null ? Number(payment.payment_account_id) : null,
    amount: Number(payment.amount),
    status: payment.status,
    hasProof: Boolean(payment.proof_image_path),
    proofImageUrl,
    rejectionReason: payment.rejection_reason,
    proofUploadedAt: toNullableIsoString(payment.proof_uploaded_at),
    verifiedAt: toNullableIsoString(payment.verified_at),
    createdAt: toIsoString(payment.created_at),
  };
}

async function mapOrderDetailRecordToDto(
  record: OrderDetailRecord,
  getSignedUrl: typeof storageService.getSignedUrl
): Promise<OrderDetailDto> {
  const { order, items, itemSizes, itemPrints, payments, qcPhotos, statusHistory } = record;

  const sizesByItemId = new Map<number, typeof itemSizes>();
  for (const s of itemSizes) {
    const list = sizesByItemId.get(s.order_item_id) ?? [];
    list.push(s);
    sizesByItemId.set(s.order_item_id, list);
  }

  const printsByItemId = new Map<number, typeof itemPrints>();
  for (const p of itemPrints) {
    const list = printsByItemId.get(p.order_item_id) ?? [];
    list.push(p);
    printsByItemId.set(p.order_item_id, list);
  }

  const [paymentDtos, qcPhotoDtos] = await Promise.all([
    Promise.all(
      payments.map((payment) =>
        mapPaymentRowToDto(payment, order.dp_percent_snapshot, getSignedUrl)
      )
    ),
    Promise.all(
      qcPhotos.map(async (photo) => {
        const signed = await resolveSignedUrlSafe(
          getSignedUrl,
          STORAGE_BUCKETS.QC_PHOTOS,
          photo.photo_path
        );
        return {
          photoUrl: signed ?? '',
          createdAt: toIsoString(photo.created_at),
        };
      })
    ),
  ]);

  const courierInfo = getCourierByCode(order.shipping_courier);
  const trackingUrl = buildTrackingUrl(order.shipping_courier, order.tracking_receipt_number);

  return {
    transactionUuid: order.transaction_uuid,
    orderCode: order.order_code,
    source: order.source,
    customerName: order.customer_name,
    customerWhatsapp: order.customer_whatsapp,
    fulfillmentType: order.fulfillment_type,
    provinceName: order.province_name,
    cityName: order.city_name,
    districtName: order.district_name,
    postalCode: order.postal_code,
    fullAddress: order.full_address,
    totalQty: Number(order.total_qty),
    dpMinQtySnapshot: Number(order.dp_min_qty_snapshot),
    isDpEligible: Boolean(order.is_dp_eligible),
    paymentScheme: order.payment_scheme,
    dpPercentSnapshot:
      order.dp_percent_snapshot !== null ? Number(order.dp_percent_snapshot) : null,
    subtotalAmount: Number(order.subtotal_amount),
    discountAmount: Number(order.discount_amount),
    discountNote: order.discount_note,
    shippingCost: Number(order.shipping_cost),
    grandTotal: Number(order.grand_total),
    dpRequiredAmount: Number(order.dp_required_amount),
    remainingBalance: Number(order.remaining_balance),
    productionStatus: order.production_status,
    designStatus: order.design_status,
    designReviewNotes: order.design_review_notes,
    estimatedFinishDate: toNullableIsoString(order.estimated_finish_date),
    shippingCourier: order.shipping_courier,
    shippingService: order.shipping_service,
    trackingReceiptNumber: order.tracking_receipt_number,
    courierInfo,
    trackingUrl,
    shippedAt: toNullableIsoString(order.shipped_at),
    paymentDueAt: toNullableIsoString(order.payment_due_at),
    cancelledReason: order.cancelled_reason,
    cancelledAt: toNullableIsoString(order.cancelled_at),
    completedAt: toNullableIsoString(order.completed_at),
    createdAt: toIsoString(order.created_at),
    updatedAt: toIsoString(order.updated_at),
    items: items.map((item) => ({
      modelName: item.model_name,
      fabricName: item.fabric_name,
      isCustomColor: item.is_custom_color,
      colorName: item.color_name,
      colorHex: item.color_hex,
      needsDesignHelp: item.needs_design_help,
      productionNotes: item.production_notes,
      lockedBasePrice: Number(item.locked_base_price),
      lockedFabricPrice: Number(item.locked_fabric_price),
      itemQty: Number(item.item_qty),
      lineSubtotal: Number(item.line_subtotal),
      sizes: (sizesByItemId.get(item.id) ?? []).map((s) => ({
        sizeCode: s.size_code,
        qty: Number(s.qty),
        lockedExtraCharge: Number(s.locked_extra_charge),
      })),
      prints: (printsByItemId.get(item.id) ?? []).map((p) => ({
        printSizeCode: p.print_size_code,
        printPosition: p.print_position,
        designFileName: p.design_file_name,
        hasDesignFile: Boolean(p.raw_design_file_path),
        lockedSpotPrice: Number(p.locked_spot_price),
      })),
    })),
    payments: paymentDtos,
    qcPhotos: qcPhotoDtos.filter((photo) => photo.photoUrl.length > 0),
    statusHistory: statusHistory.map((h) => ({
      fromStatus: h.from_status,
      toStatus: h.to_status,
      notes: h.notes,
      createdAt: toIsoString(h.created_at),
    })),
  };
}

function buildOrderPaymentsResponse(
  order: OrderRow,
  paymentDtos: OrderPaymentDto[]
): OrderPaymentsResponseDto {
  return {
    transactionUuid: order.transaction_uuid,
    orderCode: order.order_code,
    productionStatus: order.production_status,
    paymentScheme: order.payment_scheme,
    dpPercentSnapshot:
      order.dp_percent_snapshot !== null ? Number(order.dp_percent_snapshot) : null,
    grandTotal: Number(order.grand_total),
    remainingBalance: Number(order.remaining_balance),
    paymentDueAt: toNullableIsoString(order.payment_due_at),
    payments: paymentDtos,
  };
}

/**
 * Membangun service pesanan pelanggan (`/api/orders`, `/api/me/orders`, upload bukti bayar).
 */
export function createOrderService(deps: OrderServiceDeps = {}) {
  const orderRepo = deps.orderRepo ?? orderModel;
  const catalogRepo = deps.catalogRepo ?? catalogModel;
  const storage = deps.storage ?? {
    upload: storageService.upload,
    download: storageService.download,
    move: storageService.move,
    remove: storageService.remove,
    getSignedUrl: storageService.getSignedUrl,
  };
  const processProof = deps.processProofImage ?? processPaymentProofImage;

  async function executeDesignTransfers(plans: DesignFileTransferPlan[]): Promise<void> {
    for (const plan of plans) {
      if (plan.mode === 'move') {
        await storage.move(STORAGE_BUCKETS.DESIGNS, plan.fromPath, plan.toPath);
      } else {
        const buffer = await storage.download(STORAGE_BUCKETS.DESIGNS, plan.fromPath);
        await storage.upload(STORAGE_BUCKETS.DESIGNS, plan.toPath, buffer, { upsert: true });
      }
    }
  }

  return {
    async checkoutFromCart(input: {
      userId: number;
      idempotencyKey: string | null;
      payload: CreateOrderRequestDto;
    }): Promise<{ order: OrderDetailDto; deduplicated: boolean }> {
      const created = await orderRepo.createWebsiteOrderAtomic({
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        catalogRepo,
        executeDesignTransfers,
      });

      const detail = await orderRepo.findOrderDetailByUuid(created.transactionUuid, input.userId);
      if (!detail) {
        throw new AppError('Pesanan berhasil dibuat tetapi gagal dimuat kembali.', 500);
      }

      const orderDto = await mapOrderDetailRecordToDto(detail, storage.getSignedUrl);
      return {
        order: orderDto,
        deduplicated: created.deduplicated,
      };
    },

    async listMyOrders(input: {
      userId: number;
      page: number;
      limit: number;
    }): Promise<{ items: OrderSummaryDto[]; meta: PaginationMeta }> {
      const { rows, total } = await orderRepo.listOrdersByUser(input.userId, {
        page: input.page,
        limit: input.limit,
      });

      const items: OrderSummaryDto[] = rows.map((row) => ({
        transactionUuid: row.transaction_uuid,
        orderCode: row.order_code,
        fulfillmentType: row.fulfillment_type,
        totalQty: Number(row.total_qty),
        paymentScheme: row.payment_scheme,
        dpPercentSnapshot:
          row.dp_percent_snapshot !== null ? Number(row.dp_percent_snapshot) : null,
        grandTotal: Number(row.grand_total),
        dpRequiredAmount: Number(row.dp_required_amount),
        remainingBalance: Number(row.remaining_balance),
        productionStatus: row.production_status,
        designStatus: row.design_status,
        initialPaymentStatus: row.initial_payment_status,
        initialPaymentHasProof: Boolean(row.initial_payment_has_proof),
        paymentDueAt: toNullableIsoString(row.payment_due_at),
        createdAt: toIsoString(row.created_at),
      }));

      return {
        items,
        meta: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.limit)),
        },
      };
    },

    async getMyOrderDetail(userId: number, transactionUuid: string): Promise<OrderDetailDto> {
      const record = await orderRepo.findOrderDetailByUuid(transactionUuid, userId);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapOrderDetailRecordToDto(record, storage.getSignedUrl);
    },

    async getOrderPayments(transactionUuid: string): Promise<OrderPaymentsResponseDto> {
      const result = await orderRepo.findOrderPaymentsByTransactionUuid(transactionUuid);
      if (!result) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      const paymentDtos = await Promise.all(
        result.payments.map((payment) =>
          mapPaymentRowToDto(payment, result.order.dp_percent_snapshot, storage.getSignedUrl)
        )
      );
      return buildOrderPaymentsResponse(result.order, paymentDtos);
    },

    async uploadPaymentProof(input: {
      transactionUuid: string;
      paymentUuid: string;
      paymentMethod: PaymentMethod;
      paymentAccountId: number | null;
      buffer: Buffer;
    }): Promise<UploadPaymentProofResultDto> {
      const result = await orderRepo.uploadPaymentProofAtomic({
        transactionUuid: input.transactionUuid,
        paymentUuid: input.paymentUuid,
        paymentMethod: input.paymentMethod,
        paymentAccountId: input.paymentAccountId,
        processAndUploadProof: async (orderUuid, paymentUuid) => {
          const processed = await processProof(input.buffer, orderUuid, paymentUuid);
          await storage.upload(STORAGE_BUCKETS.PAYMENT_PROOFS, processed.path, processed.buffer, {
            contentType: processed.mimeType,
            upsert: false,
          });
          return { path: processed.path };
        },
      });

      if (!result) {
        throw new AppError('Pesanan atau tagihan pembayaran tidak ditemukan.', 404);
      }

      if (result.previousProofPath && result.previousProofPath !== result.payment.proof_image_path) {
        try {
          await storage.remove(STORAGE_BUCKETS.PAYMENT_PROOFS, [result.previousProofPath]);
        } catch (err: unknown) {
          console.warn('[OrderService] Gagal menghapus bukti bayar lama:', err);
        }
      }

      const paymentDto = await mapPaymentRowToDto(
        result.payment,
        result.order.dp_percent_snapshot,
        storage.getSignedUrl
      );

      return {
        transactionUuid: result.order.transaction_uuid,
        orderCode: result.order.order_code,
        payment: paymentDto,
      };
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;

export const orderService = createOrderService();

export default orderService;
