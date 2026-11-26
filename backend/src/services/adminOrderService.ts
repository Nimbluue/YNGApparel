import {
  DESIGN_STATUS,
  FULFILLMENT_TYPE,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  buildTrackingUrl,
  getCourierByCode,
  getPaymentStageLabel,
  getProductionStatusLabel,
  type AdminKanbanBoardDto,
  type AdminOrderCardDto,
  type AdminOrderDetailDto,
  type AdminOrderQcPhotoDto,
  type AdminPaymentListItemDto,
  type AdminUpdateAddressRequestDto,
  type CourierCode,
  type DesignStatus,
  type PaginationMeta,
  type ProductionStatus,
  type Rupiah,
} from '@yng/shared';
import { STORAGE_BUCKETS } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import adminOrderModel, {
  assertValidStatusTransition,
  hasCompleteAddress,
  type AdminOrderListFilters,
  type AdminOrderListRow,
  type AdminOrderRepository,
  type AdminPaymentListFilters,
} from '../models/adminOrderModel.js';
import type { OrderDetailRecord } from '../models/orderModel.js';
import { processQcPhotoImage } from './imageService.js';
import { generateSpkPdfBuffer } from './spkService.js';
import * as storageService from './storageService.js';

export { assertValidStatusTransition };

const KANBAN_COLUMN_ORDER: readonly ProductionStatus[] = [
  PRODUCTION_STATUS.NEW_ORDER,
  PRODUCTION_STATUS.PRINT_QUEUE,
  PRODUCTION_STATUS.PRESSING_QC,
  PRODUCTION_STATUS.AWAITING_SETTLEMENT,
  PRODUCTION_STATUS.SHIPPING,
];

export interface AdminOrderServiceDeps {
  adminOrderRepo?: AdminOrderRepository;
  storage?: {
    upload: typeof storageService.upload;
    download: typeof storageService.download;
    remove: typeof storageService.remove;
    getSignedUrl: typeof storageService.getSignedUrl;
  };
  processQcPhoto?: typeof processQcPhotoImage;
  generateSpk?: typeof generateSpkPdfBuffer;
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
  bucket:
    | typeof STORAGE_BUCKETS.DESIGNS
    | typeof STORAGE_BUCKETS.PAYMENT_PROOFS
    | typeof STORAGE_BUCKETS.QC_PHOTOS,
  objectPath: string | null,
  expiresIn: number
): Promise<string | null> {
  if (!objectPath) return null;
  try {
    return await getSignedUrl(bucket, objectPath, expiresIn);
  } catch (err: unknown) {
    console.warn(`[AdminOrderService] Gagal membuat signed URL (${bucket}):`, err);
    return null;
  }
}

function mapAdminOrderCard(row: AdminOrderListRow): AdminOrderCardDto {
  return {
    id: Number(row.id),
    transactionUuid: row.transaction_uuid,
    orderCode: row.order_code,
    source: row.source,
    customerName: row.customer_name,
    customerWhatsapp: row.customer_whatsapp,
    fulfillmentType: row.fulfillment_type,
    totalQty: Number(row.total_qty),
    paymentScheme: row.payment_scheme,
    dpPercentSnapshot: row.dp_percent_snapshot !== null ? Number(row.dp_percent_snapshot) : null,
    grandTotal: Number(row.grand_total),
    remainingBalance: Number(row.remaining_balance),
    productionStatus: row.production_status,
    designStatus: row.design_status,
    initialPaymentStatus: row.initial_payment_status,
    initialPaymentHasProof: Boolean(row.initial_payment_has_proof),
    hasPendingProof: Boolean(row.has_pending_proof),
    readyToProcess:
      row.production_status === PRODUCTION_STATUS.NEW_ORDER &&
      row.design_status === DESIGN_STATUS.APPROVED &&
      row.initial_payment_status === PAYMENT_STATUS.VERIFIED,
    addressIncomplete: row.fulfillment_type === FULFILLMENT_TYPE.SHIP && !hasCompleteAddress(row),
    hasCustomColor: Boolean(row.has_custom_color),
    qcPhotoCount: Number(row.qc_photo_count),
    shippingCourier: row.shipping_courier,
    trackingReceiptNumber: row.tracking_receipt_number,
    paymentDueAt: toNullableIsoString(row.payment_due_at),
    estimatedFinishDate: toNullableIsoString(row.estimated_finish_date),
    createdAt: toIsoString(row.created_at),
  };
}

/**
 * Membangun service operasional pesanan admin (`/api/admin/orders/*` & `/api/admin/payments/*`).
 */
export function createAdminOrderService(deps: AdminOrderServiceDeps = {}) {
  const repo = deps.adminOrderRepo ?? adminOrderModel;
  const storage = deps.storage ?? {
    upload: storageService.upload,
    download: storageService.download,
    remove: storageService.remove,
    getSignedUrl: storageService.getSignedUrl,
  };
  const processQcPhoto = deps.processQcPhoto ?? processQcPhotoImage;
  const generateSpk = deps.generateSpk ?? generateSpkPdfBuffer;

  async function mapDetailRecordToAdminDto(
    record: OrderDetailRecord
  ): Promise<AdminOrderDetailDto> {
    const { order, items, itemSizes, itemPrints, payments, qcPhotos, statusHistory } = record;
    const expirySeconds = await repo.getSignedUrlExpirySeconds();

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

    const printUrlMap = new Map<number, string | null>();
    await Promise.all(
      itemPrints.map(async (print) => {
        const url = await resolveSignedUrlSafe(
          storage.getSignedUrl,
          STORAGE_BUCKETS.DESIGNS,
          print.raw_design_file_path,
          expirySeconds
        );
        printUrlMap.set(print.id, url);
      })
    );

    const [paymentDtos, qcPhotoDtos] = await Promise.all([
      Promise.all(
        payments.map(async (payment) => {
          const proofImageUrl = await resolveSignedUrlSafe(
            storage.getSignedUrl,
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
        qcPhotos.map(async (photo): Promise<AdminOrderQcPhotoDto> => {
          const signed = await resolveSignedUrlSafe(
            storage.getSignedUrl,
            STORAGE_BUCKETS.QC_PHOTOS,
            photo.photo_path,
            expirySeconds
          );
          return {
            id: Number(photo.id),
            photoUrl: signed ?? '',
            createdAt: toIsoString(photo.created_at),
          };
        })
      ),
    ]);

    const courierInfo = getCourierByCode(order.shipping_courier);
    const trackingUrl = buildTrackingUrl(order.shipping_courier, order.tracking_receipt_number);
    const initialPayment = payments.find(
      (p) => p.payment_stage === (order.payment_scheme === 'DP' ? 'DP' : 'FULL')
    );

    return {
      id: Number(order.id),
      transactionUuid: order.transaction_uuid,
      orderCode: order.order_code,
      userId: order.user_id !== null ? Number(order.user_id) : null,
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
      refundedAmount: Number(order.refunded_amount),
      productionStatus: order.production_status,
      designStatus: order.design_status,
      designReviewNotes: order.design_review_notes,
      adminNotes: order.admin_notes,
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
      readyToProcess:
        order.production_status === PRODUCTION_STATUS.NEW_ORDER &&
        order.design_status === DESIGN_STATUS.APPROVED &&
        initialPayment?.status === PAYMENT_STATUS.VERIFIED,
      addressIncomplete:
        order.fulfillment_type === FULFILLMENT_TYPE.SHIP && !hasCompleteAddress(order),
      createdAt: toIsoString(order.created_at),
      updatedAt: toIsoString(order.updated_at),
      items: items.map((item) => ({
        id: Number(item.id),
        modelId: Number(item.model_id),
        fabricId: Number(item.fabric_id),
        fabricColorId: item.fabric_color_id !== null ? Number(item.fabric_color_id) : null,
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
          id: Number(p.id),
          printSizeCode: p.print_size_code,
          printPosition: p.print_position,
          designFileName: p.design_file_name,
          hasDesignFile: Boolean(p.raw_design_file_path),
          designFileUrl: printUrlMap.get(p.id) ?? null,
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

  return {
    async listOrders(
      filters: AdminOrderListFilters
    ): Promise<{ items: AdminOrderCardDto[]; meta: PaginationMeta }> {
      const { rows, total } = await repo.listOrders(filters);
      return {
        items: rows.map(mapAdminOrderCard),
        meta: {
          page: filters.page,
          limit: filters.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / filters.limit)),
        },
      };
    },

    async getKanbanBoard(): Promise<AdminKanbanBoardDto> {
      const { activeRows, completedCount, cancelledCount } = await repo.listKanbanOrders();
      const grouped = new Map<ProductionStatus, AdminOrderCardDto[]>();
      for (const status of KANBAN_COLUMN_ORDER) {
        grouped.set(status, []);
      }

      for (const row of activeRows) {
        const list = grouped.get(row.production_status);
        if (list) {
          list.push(mapAdminOrderCard(row));
        }
      }

      return {
        columns: KANBAN_COLUMN_ORDER.map((status) => {
          const orders = grouped.get(status) ?? [];
          return {
            status,
            label: getProductionStatusLabel(status),
            count: orders.length,
            orders,
          };
        }),
        archivedCounts: {
          completed: completedCount,
          cancelled: cancelledCount,
        },
      };
    },

    async getOrderDetail(transactionUuid: string): Promise<AdminOrderDetailDto> {
      const record = await repo.findOrderDetailByUuid(transactionUuid);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async transitionStatus(input: {
      transactionUuid: string;
      toStatus: ProductionStatus;
      notes: string | null;
      adminUserId: number;
    }): Promise<AdminOrderDetailDto> {
      const record = await repo.transitionStatusAtomic(input);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async reviewDesign(input: {
      transactionUuid: string;
      designStatus: DesignStatus;
      designReviewNotes: string | null;
      adminUserId: number;
    }): Promise<AdminOrderDetailDto> {
      const record = await repo.reviewDesignAtomic(input);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async cancelOrder(input: {
      transactionUuid: string;
      reason: string;
      refundedAmount?: Rupiah;
      adminUserId: number;
    }): Promise<AdminOrderDetailDto> {
      const record = await repo.cancelOrderAtomic(input);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async updateDiscount(input: {
      transactionUuid: string;
      discountAmount: Rupiah;
      discountNote: string | null;
      adminUserId: number;
    }): Promise<AdminOrderDetailDto> {
      const record = await repo.updateDiscountAtomic(input);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async updateAddress(input: {
      transactionUuid: string;
      patch: AdminUpdateAddressRequestDto;
      adminUserId: number;
    }): Promise<AdminOrderDetailDto> {
      const record = await repo.updateAddressAtomic(input);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async updateNotes(input: {
      transactionUuid: string;
      adminNotes?: string | null;
      estimatedFinishDate?: string | null;
    }): Promise<AdminOrderDetailDto> {
      const record = await repo.updateNotesAtomic(input);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async listPayments(
      filters: AdminPaymentListFilters
    ): Promise<{ items: AdminPaymentListItemDto[]; meta: PaginationMeta }> {
      const [{ rows, total }, expirySeconds] = await Promise.all([
        repo.listPayments(filters),
        repo.getSignedUrlExpirySeconds(),
      ]);

      const items = await Promise.all(
        rows.map(async (row): Promise<AdminPaymentListItemDto> => {
          const proofImageUrl = await resolveSignedUrlSafe(
            storage.getSignedUrl,
            STORAGE_BUCKETS.PAYMENT_PROOFS,
            row.proof_image_path,
            expirySeconds
          );
          return {
            paymentUuid: row.payment_uuid,
            orderTransactionUuid: row.order_transaction_uuid,
            orderCode: row.order_code,
            customerName: row.customer_name,
            customerWhatsapp: row.customer_whatsapp,
            productionStatus: row.production_status,
            paymentStage: row.payment_stage,
            paymentStageLabel: getPaymentStageLabel(
              row.payment_stage,
              row.dp_percent_snapshot,
              row.shipping_cost
            ),
            paymentMethod: row.payment_method,
            paymentAccountId:
              row.payment_account_id !== null ? Number(row.payment_account_id) : null,
            amount: Number(row.amount),
            status: row.status,
            hasProof: Boolean(row.proof_image_path),
            proofImageUrl,
            rejectionReason: row.rejection_reason,
            proofUploadedAt: toNullableIsoString(row.proof_uploaded_at),
            verifiedAt: toNullableIsoString(row.verified_at),
            createdAt: toIsoString(row.created_at),
          };
        })
      );

      return {
        items,
        meta: {
          page: filters.page,
          limit: filters.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / filters.limit)),
        },
      };
    },

    async verifyOrRejectPayment(input: {
      paymentUuid: string;
      approve: boolean;
      rejectionReason: string | null;
      adminUserId: number;
    }): Promise<AdminPaymentListItemDto> {
      const result = await repo.verifyOrRejectPaymentAtomic(input);
      if (!result) {
        throw new AppError('Data pembayaran tidak ditemukan.', 404);
      }

      const expirySeconds = await repo.getSignedUrlExpirySeconds();
      const proofImageUrl = await resolveSignedUrlSafe(
        storage.getSignedUrl,
        STORAGE_BUCKETS.PAYMENT_PROOFS,
        result.payment.proof_image_path,
        expirySeconds
      );

      return {
        paymentUuid: result.payment.payment_uuid,
        orderTransactionUuid: result.order.transaction_uuid,
        orderCode: result.order.order_code,
        customerName: result.order.customer_name,
        customerWhatsapp: result.order.customer_whatsapp,
        productionStatus: result.order.production_status,
        paymentStage: result.payment.payment_stage,
        paymentStageLabel: getPaymentStageLabel(
          result.payment.payment_stage,
          result.order.dp_percent_snapshot,
          result.order.shipping_cost
        ),
        paymentMethod: result.payment.payment_method,
        paymentAccountId:
          result.payment.payment_account_id !== null
            ? Number(result.payment.payment_account_id)
            : null,
        amount: Number(result.payment.amount),
        status: result.payment.status,
        hasProof: Boolean(result.payment.proof_image_path),
        proofImageUrl,
        rejectionReason: result.payment.rejection_reason,
        proofUploadedAt: toNullableIsoString(result.payment.proof_uploaded_at),
        verifiedAt: toNullableIsoString(result.payment.verified_at),
        createdAt: toIsoString(result.payment.created_at),
      };
    },

    async uploadQcPhotos(input: {
      transactionUuid: string;
      files: readonly Buffer[];
      adminUserId: number;
    }): Promise<AdminOrderQcPhotoDto[]> {
      if (input.files.length === 0) {
        throw new AppError('Minimal satu file foto QC wajib diunggah.', 400);
      }

      const existing = await repo.findOrderDetailByUuid(input.transactionUuid);
      if (!existing) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      if (
        existing.order.production_status === PRODUCTION_STATUS.CANCELLED ||
        existing.order.production_status === PRODUCTION_STATUS.COMPLETED
      ) {
        throw new AppError(
          'Foto QC tidak dapat ditambahkan pada pesanan yang sudah selesai atau dibatalkan.',
          409
        );
      }

      const uploadedPaths: string[] = [];
      try {
        for (const buf of input.files) {
          const processed = await processQcPhoto(buf, input.transactionUuid);
          await storage.upload(STORAGE_BUCKETS.QC_PHOTOS, processed.path, processed.buffer, {
            contentType: processed.mimeType,
            upsert: false,
          });
          uploadedPaths.push(processed.path);
        }

        const result = await repo.addQcPhotosAtomic({
          transactionUuid: input.transactionUuid,
          photoPaths: uploadedPaths,
          adminUserId: input.adminUserId,
        });
        if (!result) {
          throw new AppError('Pesanan tidak ditemukan.', 404);
        }

        const expirySeconds = await repo.getSignedUrlExpirySeconds();
        return await Promise.all(
          result.insertedPhotos.map(async (photo) => {
            const signed = await resolveSignedUrlSafe(
              storage.getSignedUrl,
              STORAGE_BUCKETS.QC_PHOTOS,
              photo.photo_path,
              expirySeconds
            );
            return {
              id: Number(photo.id),
              photoUrl: signed ?? '',
              createdAt: toIsoString(photo.created_at),
            };
          })
        );
      } catch (err: unknown) {
        if (uploadedPaths.length > 0) {
          try {
            await storage.remove(STORAGE_BUCKETS.QC_PHOTOS, uploadedPaths);
          } catch (cleanupErr: unknown) {
            console.warn('[AdminOrderService] Gagal membersihkan foto QC yatim:', cleanupErr);
          }
        }
        throw err;
      }
    },

    async deleteQcPhoto(input: {
      transactionUuid: string;
      photoId: number;
    }): Promise<{ deletedId: number }> {
      const deleted = await repo.deleteQcPhotoAtomic(input);
      if (!deleted) {
        throw new AppError('Foto QC atau pesanan tidak ditemukan.', 404);
      }

      try {
        await storage.remove(STORAGE_BUCKETS.QC_PHOTOS, [deleted.deletedPhotoPath]);
      } catch (err: unknown) {
        console.warn('[AdminOrderService] Gagal menghapus file foto QC dari storage:', err);
      }

      return { deletedId: input.photoId };
    },

    async updateShippingCost(input: {
      transactionUuid: string;
      shippingCost: Rupiah;
      notes: string | null;
      adminUserId: number;
    }): Promise<AdminOrderDetailDto> {
      const record = await repo.updateShippingCostAtomic(input);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async updateShipment(input: {
      transactionUuid: string;
      shippingCourier: CourierCode;
      shippingService: string | null;
      trackingReceiptNumber: string;
      adminUserId: number;
    }): Promise<AdminOrderDetailDto> {
      const record = await repo.updateShipmentAtomic(input);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }
      return mapDetailRecordToAdminDto(record);
    },

    async generateOrderSpkPdf(
      transactionUuid: string
    ): Promise<{ orderCode: string; pdfBuffer: Buffer }> {
      const record = await repo.findOrderDetailByUuid(transactionUuid);
      if (!record) {
        throw new AppError('Pesanan tidak ditemukan.', 404);
      }

      const pdfBuffer = await generateSpk(record, (filePath) =>
        storage.download(STORAGE_BUCKETS.DESIGNS, filePath)
      );

      return {
        orderCode: record.order.order_code,
        pdfBuffer,
      };
    },
  };
}

export type AdminOrderService = ReturnType<typeof createAdminOrderService>;

export const adminOrderService = createAdminOrderService();

export default adminOrderService;
