import crypto from 'node:crypto';
import {
  buildTrackingUrl,
  getCourierByCode,
  getPaymentStageLabel,
  getProductionStatusLabel,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  type FulfillmentType,
  type OrderPaymentDto,
  type PaymentMethod,
  type ProductionStatus,
  type PublicPaymentAccountDto,
  type Rupiah,
  type TrackerOrderDto,
  type TrackerProductionStageDto,
  type TrackerStageKey,
  type TrackerStageState,
  type UploadPaymentProofResultDto,
} from '@yng/shared';
import { STORAGE_BUCKETS } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import catalogModel, { type CatalogRepository } from '../models/catalogModel.js';
import type { PaymentAccountRow } from '../models/masterModel.js';
import orderModel, {
  type OrderDetailRecord,
  type OrderPaymentRow,
  type OrderStatusHistoryRow,
  type TrackerRepository,
} from '../models/orderModel.js';
import {
  maskCustomerName,
  maskLocationSummary,
  maskWhatsApp,
  normalizeTrackerOrderCode,
} from '../utils/masking.js';
import defaultOrderService, { type OrderService } from './orderService.js';
import * as storageService from './storageService.js';

const TRACKER_STAGE_SEQUENCE: readonly TrackerStageKey[] = [
  PRODUCTION_STATUS.NEW_ORDER,
  PRODUCTION_STATUS.PRINT_QUEUE,
  PRODUCTION_STATUS.PRESSING_QC,
  PRODUCTION_STATUS.AWAITING_SETTLEMENT,
  PRODUCTION_STATUS.SHIPPING,
];

const GENERIC_LOOKUP_ERROR_MESSAGE =
  'Pesanan tidak ditemukan. Periksa kembali kode pesanan dan 4 digit terakhir nomor WhatsApp.';

const GENERIC_PROOF_ACCESS_ERROR_MESSAGE = 'Pesanan atau tagihan pembayaran tidak ditemukan.';

export interface TrackerServiceDeps {
  trackerRepo?: TrackerRepository;
  catalogRepo?: Pick<CatalogRepository, 'listActivePaymentAccounts'>;
  orderService?: Pick<OrderService, 'uploadPaymentProof'>;
  getSignedUrl?: typeof storageService.getSignedUrl;
  getPublicCatalogUrl?: (filePath: string | null) => string | null;
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

function extractLast4Digits(whatsapp: string | null | undefined): string | null {
  const digits = typeof whatsapp === 'string' ? whatsapp.replace(/\D/g, '') : '';
  if (digits.length < 4) {
    return null;
  }
  return digits.slice(-4);
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function toPublicPaymentAccountDto(
  row: PaymentAccountRow,
  getPublicCatalogUrl: (filePath: string | null) => string | null
): PublicPaymentAccountDto {
  return {
    id: Number(row.id),
    method: row.method,
    providerName: row.provider_name,
    accountNumber: row.account_number,
    accountHolder: row.account_holder,
    qrImageUrl: getPublicCatalogUrl(row.qr_image_path),
    instructions: row.instructions,
  };
}

/**
 * Menyusun progres 5 tahap produksi untuk Live Tracker publik (SPEC Bagian 5 & 9),
 * termasuk penandaan tahap pelunasan sebagai `skipped` bila tidak ada sisa tagihan.
 */
export function buildProductionStages(input: {
  productionStatus: ProductionStatus;
  fulfillmentType: FulfillmentType;
  remainingBalance: Rupiah;
  payments: readonly OrderPaymentRow[];
  statusHistory: readonly OrderStatusHistoryRow[];
}): TrackerProductionStageDto[] {
  const { productionStatus, fulfillmentType, remainingBalance, payments, statusHistory } = input;

  const hasFinalPayment = payments.some(
    (p) =>
      p.payment_stage === PAYMENT_STAGE.SETTLEMENT || p.payment_stage === PAYMENT_STAGE.SHIPPING_FEE
  );
  const visitedSettlement = statusHistory.some(
    (h) => h.to_status === PRODUCTION_STATUS.AWAITING_SETTLEMENT
  );
  const settlementSkipped = !hasFinalPayment && !visitedSettlement;

  if (productionStatus === PRODUCTION_STATUS.CANCELLED) {
    const lastStageEntry = [...statusHistory]
      .reverse()
      .find((h) => h.to_status !== PRODUCTION_STATUS.CANCELLED);
    const cancelEntry = [...statusHistory]
      .reverse()
      .find((h) => h.to_status === PRODUCTION_STATUS.CANCELLED);
    const candidateStatus = lastStageEntry?.to_status ?? cancelEntry?.from_status ?? '';
    const foundIdx = TRACKER_STAGE_SEQUENCE.indexOf(candidateStatus as TrackerStageKey);
    const cancelledIndex = foundIdx >= 0 ? foundIdx : 0;

    return TRACKER_STAGE_SEQUENCE.map((key, idx) => {
      let state: TrackerStageState;
      if (idx < cancelledIndex) {
        state =
          key === PRODUCTION_STATUS.AWAITING_SETTLEMENT && settlementSkipped
            ? 'skipped'
            : 'completed';
      } else if (idx === cancelledIndex) {
        state = 'cancelled';
      } else {
        state = 'upcoming';
      }

      return {
        step: idx + 1,
        key,
        label: getProductionStatusLabel(key, fulfillmentType),
        state,
      };
    });
  }

  const currentIndex =
    productionStatus === PRODUCTION_STATUS.COMPLETED
      ? TRACKER_STAGE_SEQUENCE.length
      : Math.max(0, TRACKER_STAGE_SEQUENCE.indexOf(productionStatus as TrackerStageKey));

  return TRACKER_STAGE_SEQUENCE.map((key, idx) => {
    let state: TrackerStageState;
    if (idx < currentIndex) {
      state =
        key === PRODUCTION_STATUS.AWAITING_SETTLEMENT && settlementSkipped
          ? 'skipped'
          : 'completed';
    } else if (idx === currentIndex) {
      state = 'current';
    } else if (
      key === PRODUCTION_STATUS.AWAITING_SETTLEMENT &&
      productionStatus === PRODUCTION_STATUS.PRESSING_QC &&
      settlementSkipped &&
      Number(remainingBalance) === 0
    ) {
      state = 'skipped';
    } else {
      state = 'upcoming';
    }

    return {
      step: idx + 1,
      key,
      label: getProductionStatusLabel(key, fulfillmentType),
      state,
    };
  });
}

async function resolveSignedUrlSafe(
  getSignedUrl: typeof storageService.getSignedUrl,
  bucket: typeof STORAGE_BUCKETS.PAYMENT_PROOFS | typeof STORAGE_BUCKETS.QC_PHOTOS,
  objectPath: string | null,
  expiresIn: number
): Promise<string | null> {
  if (!objectPath) return null;
  try {
    return await getSignedUrl(bucket, objectPath, expiresIn);
  } catch (err: unknown) {
    console.warn(`[TrackerService] Gagal membuat signed URL (${bucket}):`, err);
    return null;
  }
}

/**
 * Membangun service Live Tracker publik (`/api/track`, `/api/track/:uuid`, dan upload bukti lanjutan).
 */
export function createTrackerService(deps: TrackerServiceDeps = {}) {
  const trackerRepo = deps.trackerRepo ?? orderModel;
  const catalogRepo = deps.catalogRepo ?? catalogModel;
  const orderSvc = deps.orderService ?? defaultOrderService;
  const getSignedUrl = deps.getSignedUrl ?? storageService.getSignedUrl;
  const getPublicCatalogUrl =
    deps.getPublicCatalogUrl ??
    ((filePath: string | null) =>
      filePath ? storageService.getPublicUrl(STORAGE_BUCKETS.CATALOG, filePath) : null);

  async function mapRecordToTrackerDto(record: OrderDetailRecord): Promise<TrackerOrderDto> {
    const { order, items, itemSizes, itemPrints, payments, qcPhotos, statusHistory } = record;
    const hasOpenPayment =
      order.production_status !== PRODUCTION_STATUS.CANCELLED &&
      (payments.some((p) => p.status !== PAYMENT_STATUS.VERIFIED) ||
        Number(order.remaining_balance) > 0);

    const [expirySeconds, activeAccounts] = await Promise.all([
      trackerRepo.getSignedUrlExpirySeconds(),
      hasOpenPayment ? catalogRepo.listActivePaymentAccounts() : Promise.resolve([]),
    ]);

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
        payments.map(async (payment): Promise<OrderPaymentDto> => {
          const proofImageUrl = await resolveSignedUrlSafe(
            getSignedUrl,
            STORAGE_BUCKETS.PAYMENT_PROOFS,
            payment.proof_image_path,
            expirySeconds
          );
          return {
            paymentUuid: payment.payment_uuid,
            paymentStage: payment.payment_stage,
            paymentStageLabel: getPaymentStageLabel(
              payment.payment_stage,
              order.dp_percent_snapshot,
              order.shipping_cost
            ),
            paymentMethod: payment.payment_method,
            paymentAccountId:
              payment.payment_account_id !== null ? Number(payment.payment_account_id) : null,
            amount: Number(payment.amount),
            status: payment.status,
            hasProof: Boolean(payment.proof_image_path),
            proofImageUrl,
            rejectionReason: payment.rejection_reason,
            proofUploadedAt: toNullableIsoString(payment.proof_uploaded_at),
            verifiedAt: toNullableIsoString(payment.verified_at),
            createdAt: toIsoString(payment.created_at),
          };
        })
      ),
      Promise.all(
        qcPhotos.map(async (photo) => {
          const signed = await resolveSignedUrlSafe(
            getSignedUrl,
            STORAGE_BUCKETS.QC_PHOTOS,
            photo.photo_path,
            expirySeconds
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
    const stages = buildProductionStages({
      productionStatus: order.production_status,
      fulfillmentType: order.fulfillment_type,
      remainingBalance: Number(order.remaining_balance),
      payments,
      statusHistory,
    });

    return {
      transactionUuid: order.transaction_uuid,
      orderCode: order.order_code,
      source: order.source,
      customerNameMasked: maskCustomerName(order.customer_name),
      customerWhatsappMasked: maskWhatsApp(order.customer_whatsapp),
      fulfillmentType: order.fulfillment_type,
      cityName: order.city_name,
      provinceName: order.province_name,
      addressSummaryMasked: maskLocationSummary(order.city_name, order.province_name),
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
      stages,
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
      paymentAccounts: activeAccounts.map((acc) =>
        toPublicPaymentAccountDto(acc, getPublicCatalogUrl)
      ),
      qcPhotos: qcPhotoDtos.filter((photo) => photo.photoUrl.length > 0),
      statusHistory: statusHistory.map((h) => ({
        fromStatus: h.from_status,
        toStatus: h.to_status,
        notes: h.notes,
        createdAt: toIsoString(h.created_at),
      })),
    };
  }

  return {
    async lookupByCodeAndWhatsapp(code: string, whatsappLast4: string): Promise<TrackerOrderDto> {
      const normalizedCode = normalizeTrackerOrderCode(code);
      if (!normalizedCode) {
        throw new AppError(GENERIC_LOOKUP_ERROR_MESSAGE, 404);
      }

      const record = await trackerRepo.findOrderDetailByOrderCode(normalizedCode);
      if (!record) {
        throw new AppError(GENERIC_LOOKUP_ERROR_MESSAGE, 404);
      }

      const expectedLast4 = extractLast4Digits(record.order.customer_whatsapp);
      const trimmedLast4 = whatsappLast4.trim();
      if (!expectedLast4 || !constantTimeEquals(expectedLast4, trimmedLast4)) {
        throw new AppError(GENERIC_LOOKUP_ERROR_MESSAGE, 404);
      }

      return mapRecordToTrackerDto(record);
    },

    async getByMagicLinkUuid(transactionUuid: string): Promise<TrackerOrderDto> {
      const record = await trackerRepo.findOrderDetailByUuid(transactionUuid);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapRecordToTrackerDto(record);
    },

    async uploadPaymentProofViaTracker(input: {
      transactionUuid: string;
      paymentUuid: string;
      paymentMethod: PaymentMethod;
      paymentAccountId: number | null;
      buffer: Buffer;
      code?: string | null;
      whatsappLast4?: string | null;
    }): Promise<UploadPaymentProofResultDto> {
      const hasCode = typeof input.code === 'string' && input.code.trim().length > 0;
      const hasWaLast4 =
        typeof input.whatsappLast4 === 'string' && input.whatsappLast4.trim().length > 0;

      if (hasCode || hasWaLast4) {
        if (!hasCode || !hasWaLast4) {
          throw new AppError(GENERIC_PROOF_ACCESS_ERROR_MESSAGE, 404);
        }

        const normalizedCode = normalizeTrackerOrderCode(input.code!);
        const record = normalizedCode
          ? await trackerRepo.findOrderDetailByUuid(input.transactionUuid)
          : null;
        if (!record || !normalizedCode) {
          throw new AppError(GENERIC_PROOF_ACCESS_ERROR_MESSAGE, 404);
        }

        const expectedLast4 = extractLast4Digits(record.order.customer_whatsapp);
        const codeMatches = constantTimeEquals(
          record.order.order_code.toUpperCase(),
          normalizedCode
        );
        const waMatches =
          expectedLast4 !== null && constantTimeEquals(expectedLast4, input.whatsappLast4!.trim());

        if (!codeMatches || !waMatches) {
          throw new AppError(GENERIC_PROOF_ACCESS_ERROR_MESSAGE, 404);
        }
      }

      return orderSvc.uploadPaymentProof({
        transactionUuid: input.transactionUuid,
        paymentUuid: input.paymentUuid,
        paymentMethod: input.paymentMethod,
        paymentAccountId: input.paymentAccountId,
        buffer: input.buffer,
      });
    },
  };
}

export type TrackerService = ReturnType<typeof createTrackerService>;

export const trackerService = createTrackerService();

export default trackerService;
