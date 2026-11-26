import {
  COURIER_CODES,
  DESIGN_STATUS,
  FULFILLMENT_TYPE,
  ORDER_SOURCE,
  PAYMENT_METHOD,
  PAYMENT_SCHEME,
  PAYMENT_STATUS,
  PRINT_POSITION,
  PRODUCTION_STATUS,
  TRACKING_RECEIPT_REGEX,
  type AdminCancelOrderRequestDto,
  type AdminCreateManualOrderRequestDto,
  type AdminKanbanBoardDto,
  type AdminOrderCardDto,
  type AdminOrderDetailDto,
  type AdminOrderQcPhotoDto,
  type AdminPaymentListItemDto,
  type AdminRejectPaymentRequestDto,
  type AdminReviewDesignRequestDto,
  type AdminTransitionStatusRequestDto,
  type AdminUpdateAddressRequestDto,
  type AdminUpdateDiscountRequestDto,
  type AdminUpdateNotesRequestDto,
  type AdminUpdateShipmentRequestDto,
  type AdminUpdateShippingCostRequestDto,
  type AdminVerifyPaymentRequestDto,
  type CourierCode,
  type DesignStatus,
  type FulfillmentType,
  type ManualOrderSource,
  type PaymentMethod,
  type PaymentScheme,
  type PaymentStatus,
  type PrintPosition,
  type ProductionStatus,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import defaultAdminOrderService, { type AdminOrderService } from '../services/adminOrderService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

const PRODUCTION_STATUS_VALUES: readonly [ProductionStatus, ...ProductionStatus[]] = [
  PRODUCTION_STATUS.NEW_ORDER,
  PRODUCTION_STATUS.PRINT_QUEUE,
  PRODUCTION_STATUS.PRESSING_QC,
  PRODUCTION_STATUS.AWAITING_SETTLEMENT,
  PRODUCTION_STATUS.SHIPPING,
  PRODUCTION_STATUS.COMPLETED,
  PRODUCTION_STATUS.CANCELLED,
];

const PAYMENT_STATUS_VALUES: readonly [PaymentStatus, ...PaymentStatus[]] = [
  PAYMENT_STATUS.PENDING,
  PAYMENT_STATUS.VERIFIED,
  PAYMENT_STATUS.REJECTED,
];

const DESIGN_STATUS_VALUES: readonly [DesignStatus, ...DesignStatus[]] = [
  DESIGN_STATUS.PENDING,
  DESIGN_STATUS.NEED_REVISION,
  DESIGN_STATUS.APPROVED,
];

const FULFILLMENT_VALUES: readonly [FulfillmentType, ...FulfillmentType[]] = [
  FULFILLMENT_TYPE.SHIP,
  FULFILLMENT_TYPE.PICKUP,
];

const COURIER_CODE_VALUES: readonly [CourierCode, ...CourierCode[]] = [...COURIER_CODES] as [
  CourierCode,
  ...CourierCode[],
];

const MANUAL_ORDER_SOURCE_VALUES: readonly [ManualOrderSource, ...ManualOrderSource[]] = [
  ORDER_SOURCE.WHATSAPP,
  ORDER_SOURCE.INSTAGRAM,
  ORDER_SOURCE.MANUAL,
];

const PAYMENT_SCHEME_VALUES: readonly [PaymentScheme, ...PaymentScheme[]] = [
  PAYMENT_SCHEME.FULL,
  PAYMENT_SCHEME.DP,
];

const PAYMENT_METHOD_VALUES: readonly [PaymentMethod, ...PaymentMethod[]] = [
  PAYMENT_METHOD.QRIS,
  PAYMENT_METHOD.BANK_TRANSFER,
];

const PRINT_POSITION_VALUES: readonly [PrintPosition, ...PrintPosition[]] = [
  PRINT_POSITION.FRONT_CHEST,
  PRINT_POSITION.FRONT_CENTER,
  PRINT_POSITION.BACK_CENTER,
  PRINT_POSITION.BACK_UPPER,
  PRINT_POSITION.LEFT_SLEEVE,
  PRINT_POSITION.RIGHT_SLEEVE,
  PRINT_POSITION.COLLAR,
  PRINT_POSITION.OTHER,
];

export const adminOrderUuidParamSchema = z
  .object({
    uuid: z.string().uuid('Format UUID pesanan tidak valid.'),
  })
  .strict();

export const adminQcPhotoParamsSchema = z
  .object({
    uuid: z.string().uuid('Format UUID pesanan tidak valid.'),
    photoId: z.coerce.number().int('ID foto QC tidak valid.').positive('ID foto QC tidak valid.'),
  })
  .strict();

export const adminPaymentUuidParamSchema = z
  .object({
    paymentUuid: z.string().uuid('Format UUID pembayaran tidak valid.'),
  })
  .strict();

export const listAdminOrdersQuerySchema = z
  .object({
    status: z.enum(PRODUCTION_STATUS_VALUES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUS_VALUES).optional(),
    fulfillmentType: z.enum(FULFILLMENT_VALUES).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(1000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

export const listAdminPaymentsQuerySchema = z
  .object({
    status: z.enum(PAYMENT_STATUS_VALUES).optional(),
    hasProof: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).max(1000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

export const transitionStatusBodySchema: z.ZodType<AdminTransitionStatusRequestDto> = z
  .object({
    toStatus: z.enum(PRODUCTION_STATUS_VALUES, {
      required_error: 'Status produksi tujuan wajib dipilih.',
    }),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const reviewDesignBodySchema: z.ZodType<AdminReviewDesignRequestDto> = z
  .object({
    designStatus: z.enum(DESIGN_STATUS_VALUES, {
      required_error: 'Status review desain wajib dipilih.',
    }),
    designReviewNotes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.designStatus === DESIGN_STATUS.NEED_REVISION &&
      (!data.designReviewNotes || data.designReviewNotes.trim().length < 3)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['designReviewNotes'],
        message: 'Catatan revisi desain wajib diisi minimal 3 karakter saat meminta revisi.',
      });
    }
  });

export const cancelOrderBodySchema: z.ZodType<AdminCancelOrderRequestDto> = z
  .object({
    reason: z
      .string({ required_error: 'Alasan pembatalan wajib diisi.' })
      .trim()
      .min(3, 'Alasan pembatalan minimal 3 karakter.')
      .max(255, 'Alasan pembatalan maksimal 255 karakter.'),
    refundedAmount: z
      .number({ invalid_type_error: 'Nominal refund harus berupa bilangan bulat rupiah.' })
      .int('Nominal refund harus berupa bilangan bulat rupiah.')
      .min(0, 'Nominal refund tidak boleh negatif.')
      .optional(),
  })
  .strict();

export const updateDiscountBodySchema: z.ZodType<AdminUpdateDiscountRequestDto> = z
  .object({
    discountAmount: z
      .number({ required_error: 'Nominal diskon wajib diisi.' })
      .int('Nominal diskon harus berupa bilangan bulat rupiah.')
      .min(0, 'Nominal diskon tidak boleh negatif.'),
    discountNote: z.string().trim().max(255).nullable().optional(),
  })
  .strict();

export const updateAddressBodySchema: z.ZodType<AdminUpdateAddressRequestDto> = z
  .object({
    fulfillmentType: z.enum(FULFILLMENT_VALUES).optional(),
    customerName: z.string().trim().min(2).max(150).optional(),
    customerWhatsapp: z.string().trim().min(8).max(25).optional(),
    provinceName: z.string().trim().min(2).max(100).nullable().optional(),
    cityName: z.string().trim().min(2).max(100).nullable().optional(),
    districtName: z.string().trim().min(2).max(100).nullable().optional(),
    postalCode: z
      .string()
      .trim()
      .regex(/^[0-9]{5}$/, 'Kode pos harus 5 digit angka.')
      .nullable()
      .optional(),
    fullAddress: z.string().trim().min(5).max(1000).nullable().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, 'Minimal satu field alamat harus diisi.');

export const updateNotesBodySchema: z.ZodType<AdminUpdateNotesRequestDto> = z
  .object({
    adminNotes: z.string().trim().max(2000).nullable().optional(),
    estimatedFinishDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal estimasi selesai harus YYYY-MM-DD.')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, 'Minimal satu field catatan harus diisi.');

export const updateShippingCostBodySchema: z.ZodType<AdminUpdateShippingCostRequestDto> = z
  .object({
    shippingCost: z
      .number({ required_error: 'Ongkos kirim wajib diisi.' })
      .int('Ongkos kirim harus berupa bilangan bulat rupiah.')
      .min(0, 'Ongkos kirim tidak boleh negatif.'),
    notes: z.string().trim().max(255).nullable().optional(),
  })
  .strict();

export const updateShipmentBodySchema: z.ZodType<
  AdminUpdateShipmentRequestDto,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    shippingCourier: z
      .string({
        required_error: 'Kode kurir wajib dipilih dari daftar kurir resmi.',
        invalid_type_error: 'Kode kurir tidak valid atau belum terdaftar.',
      })
      .trim()
      .toUpperCase()
      .pipe(
        z.enum(COURIER_CODE_VALUES, {
          message: 'Kode kurir tidak valid atau belum terdaftar.',
        })
      ),
    shippingService: z.string().trim().max(100).nullable().optional(),
    trackingReceiptNumber: z
      .string({ required_error: 'Nomor resi wajib diisi.' })
      .trim()
      .regex(
        TRACKING_RECEIPT_REGEX,
        'Nomor resi harus 4–40 karakter alfanumerik atau tanda hubung (-).'
      ),
  })
  .strict();

export const verifyPaymentBodySchema: z.ZodType<AdminVerifyPaymentRequestDto> = z
  .object({
    approve: z.boolean({ required_error: 'Status approve wajib berupa boolean.' }),
    rejectionReason: z.string().trim().max(255).nullable().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.approve && (!data.rejectionReason || data.rejectionReason.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: 'Alasan penolakan wajib diisi minimal 3 karakter.',
      });
    }
  });

export const rejectPaymentBodySchema: z.ZodType<AdminRejectPaymentRequestDto> = z
  .object({
    rejectionReason: z
      .string({ required_error: 'Alasan penolakan wajib diisi.' })
      .trim()
      .min(3, 'Alasan penolakan minimal 3 karakter.')
      .max(255, 'Alasan penolakan maksimal 255 karakter.'),
  })
  .strict();

const manualOrderItemPrintSchema = z
  .object({
    printSizeId: z.number().int().positive('Ukuran sablon wajib dipilih.'),
    printPosition: z.enum(PRINT_POSITION_VALUES, {
      required_error: 'Posisi sablon wajib dipilih.',
    }),
    fileRef: z.string().trim().max(500).nullable().optional(),
    fileName: z.string().trim().max(255).nullable().optional(),
    notes: z.string().trim().max(255).nullable().optional(),
  })
  .strict();

const manualOrderItemSizeSchema = z
  .object({
    sizeId: z.number().int().positive('Ukuran pakaian wajib dipilih.'),
    qty: z
      .number({ required_error: 'Kuantitas ukuran wajib diisi.' })
      .int('Kuantitas ukuran harus bilangan bulat positif.')
      .positive('Kuantitas ukuran minimal 1.'),
  })
  .strict();

const manualOrderItemSchema = z
  .object({
    modelId: z.number().int().positive('Model pakaian wajib dipilih.'),
    fabricId: z.number().int().positive('Bahan pakaian wajib dipilih.'),
    isCustomColor: z.boolean().optional(),
    fabricColorId: z.number().int().positive().nullable().optional(),
    colorName: z.string().trim().max(50).nullable().optional(),
    colorHex: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Format warna hex harus #RRGGBB.')
      .nullable()
      .optional(),
    needsDesignHelp: z.boolean().optional(),
    productionNotes: z.string().trim().max(1000).nullable().optional(),
    sizes: z
      .array(manualOrderItemSizeSchema, {
        required_error: 'Minimal satu ukuran dengan kuantitas > 0 wajib diisi.',
      })
      .min(1, 'Minimal satu ukuran dengan kuantitas > 0 wajib diisi.'),
    prints: z.array(manualOrderItemPrintSchema).max(20).optional(),
  })
  .strict();

export const createManualOrderBodySchema: z.ZodType<AdminCreateManualOrderRequestDto> = z
  .object({
    source: z.enum(MANUAL_ORDER_SOURCE_VALUES, {
      required_error: 'Sumber order manual wajib dipilih (WHATSAPP, INSTAGRAM, atau MANUAL).',
    }),
    userUuid: z.string().uuid('Format UUID akun pelanggan tidak valid.').nullable().optional(),
    customerName: z
      .string({ required_error: 'Nama pelanggan wajib diisi.' })
      .trim()
      .min(2, 'Nama pelanggan minimal 2 karakter.')
      .max(150, 'Nama pelanggan maksimal 150 karakter.'),
    customerWhatsapp: z
      .string({ required_error: 'Nomor WhatsApp pelanggan wajib diisi.' })
      .trim()
      .min(8, 'Nomor WhatsApp terlalu pendek.')
      .max(25, 'Nomor WhatsApp terlalu panjang.'),
    fulfillmentType: z.enum(FULFILLMENT_VALUES, {
      required_error: 'Metode pemenuhan pesanan wajib dipilih.',
    }),
    provinceName: z.string().trim().max(100).nullable().optional(),
    cityName: z.string().trim().max(100).nullable().optional(),
    districtName: z.string().trim().max(100).nullable().optional(),
    postalCode: z
      .string()
      .trim()
      .regex(/^[0-9]{5}$/, 'Kode pos harus 5 digit angka.')
      .nullable()
      .optional(),
    fullAddress: z.string().trim().max(1000).nullable().optional(),
    items: z
      .array(manualOrderItemSchema, {
        required_error: 'Minimal satu item pesanan wajib diisi.',
      })
      .min(1, 'Minimal satu item pesanan wajib diisi.')
      .max(20, 'Maksimal 20 item per pesanan manual.'),
    paymentScheme: z.enum(PAYMENT_SCHEME_VALUES, {
      required_error: 'Skema pembayaran wajib dipilih.',
    }),
    discountAmount: z
      .number({ invalid_type_error: 'Nominal diskon harus berupa bilangan bulat rupiah.' })
      .int('Nominal diskon harus berupa bilangan bulat rupiah.')
      .min(0, 'Nominal diskon tidak boleh negatif.')
      .optional(),
    discountNote: z.string().trim().max(255).nullable().optional(),
    shippingCost: z
      .number({ invalid_type_error: 'Ongkos kirim harus berupa bilangan bulat rupiah.' })
      .int('Ongkos kirim harus berupa bilangan bulat rupiah.')
      .min(0, 'Ongkos kirim tidak boleh negatif.')
      .optional(),
    paymentReceived: z
      .object({
        received: z.boolean(),
        paymentMethod: z.enum(PAYMENT_METHOD_VALUES).nullable().optional(),
        paymentAccountId: z.number().int().positive().nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    noAutoCancel: z.boolean().optional(),
    adminNotes: z.string().trim().max(2000).nullable().optional(),
    estimatedFinishDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format estimasi selesai harus YYYY-MM-DD.')
      .nullable()
      .optional(),
  })
  .strict();

/**
 * Membangun controller operasional order & pembayaran untuk Admin (`/api/admin/orders*` & `/api/admin/payments*`).
 */
export function createAdminOrderController(service: AdminOrderService = defaultAdminOrderService): {
  listOrders: RequestHandler;
  getKanbanBoard: RequestHandler;
  getOrderDetail: RequestHandler;
  createManualOrder: RequestHandler;
  transitionStatus: RequestHandler;
  reviewDesign: RequestHandler;
  cancelOrder: RequestHandler;
  updateDiscount: RequestHandler;
  updateAddress: RequestHandler;
  updateNotes: RequestHandler;
  listPayments: RequestHandler;
  verifyOrRejectPayment: RequestHandler;
  rejectPayment: RequestHandler;
  uploadQcPhotos: RequestHandler;
  deleteQcPhoto: RequestHandler;
  updateShippingCost: RequestHandler;
  updateShipment: RequestHandler;
  downloadSpkPdf: RequestHandler;
} {
  return {
    listOrders: asyncHandler(async (req, res) => {
      const filters = req.query as unknown as z.infer<typeof listAdminOrdersQuerySchema>;
      const result = await service.listOrders(filters);
      return sendSuccess<AdminOrderCardDto[]>(res, {
        message: 'Daftar pesanan admin berhasil dimuat.',
        data: result.items,
        meta: result.meta,
      });
    }),

    getKanbanBoard: asyncHandler(async (_req, res) => {
      const board = await service.getKanbanBoard();
      return sendSuccess<AdminKanbanBoardDto>(res, {
        message: 'Board Kanban produksi berhasil dimuat.',
        data: board,
      });
    }),

    getOrderDetail: asyncHandler(async (req, res) => {
      const { uuid } = req.params as { uuid: string };
      const detail = await service.getOrderDetail(uuid);
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Detail pesanan admin berhasil dimuat.',
        data: detail,
      });
    }),

    createManualOrder: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const body = req.body as AdminCreateManualOrderRequestDto;
      const detail = await service.createManualOrder({
        adminUserId: req.user.id,
        adminUserUuid: req.user.userUuid,
        payload: body,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        status: 201,
        message: 'Order manual berhasil dibuat.',
        data: detail,
      });
    }),

    transitionStatus: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { uuid } = req.params as { uuid: string };
      const body = req.body as AdminTransitionStatusRequestDto;
      const detail = await service.transitionStatus({
        transactionUuid: uuid,
        toStatus: body.toStatus,
        notes: body.notes ?? null,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Status produksi pesanan berhasil diperbarui.',
        data: detail,
      });
    }),

    reviewDesign: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { uuid } = req.params as { uuid: string };
      const body = req.body as AdminReviewDesignRequestDto;
      const detail = await service.reviewDesign({
        transactionUuid: uuid,
        designStatus: body.designStatus,
        designReviewNotes: body.designReviewNotes ?? null,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Status review desain berhasil disimpan.',
        data: detail,
      });
    }),

    cancelOrder: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { uuid } = req.params as { uuid: string };
      const body = req.body as AdminCancelOrderRequestDto;
      const detail = await service.cancelOrder({
        transactionUuid: uuid,
        reason: body.reason,
        refundedAmount: body.refundedAmount,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Pesanan berhasil dibatalkan.',
        data: detail,
      });
    }),

    updateDiscount: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { uuid } = req.params as { uuid: string };
      const body = req.body as AdminUpdateDiscountRequestDto;
      const detail = await service.updateDiscount({
        transactionUuid: uuid,
        discountAmount: body.discountAmount,
        discountNote: body.discountNote ?? null,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Diskon pesanan berhasil diperbarui.',
        data: detail,
      });
    }),

    updateAddress: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { uuid } = req.params as { uuid: string };
      const body = req.body as AdminUpdateAddressRequestDto;
      const detail = await service.updateAddress({
        transactionUuid: uuid,
        patch: body,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Alamat dan metode penerima pesanan berhasil diperbarui.',
        data: detail,
      });
    }),

    updateNotes: asyncHandler(async (req, res) => {
      const { uuid } = req.params as { uuid: string };
      const body = req.body as AdminUpdateNotesRequestDto;
      const detail = await service.updateNotes({
        transactionUuid: uuid,
        adminNotes: body.adminNotes,
        estimatedFinishDate: body.estimatedFinishDate,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Catatan internal dan estimasi selesai berhasil disimpan.',
        data: detail,
      });
    }),

    listPayments: asyncHandler(async (req, res) => {
      const filters = req.query as unknown as z.infer<typeof listAdminPaymentsQuerySchema>;
      const result = await service.listPayments(filters);
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminPaymentListItemDto[]>(res, {
        message: 'Daftar antrean pembayaran berhasil dimuat.',
        data: result.items,
        meta: result.meta,
      });
    }),

    verifyOrRejectPayment: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { paymentUuid } = req.params as { paymentUuid: string };
      const body = req.body as AdminVerifyPaymentRequestDto;
      const item = await service.verifyOrRejectPayment({
        paymentUuid,
        approve: body.approve,
        rejectionReason: body.rejectionReason ?? null,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminPaymentListItemDto>(res, {
        message: body.approve
          ? 'Pembayaran berhasil diverifikasi.'
          : 'Bukti pembayaran ditolak dengan alasan tercatat.',
        data: item,
      });
    }),

    rejectPayment: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { paymentUuid } = req.params as { paymentUuid: string };
      const body = req.body as AdminRejectPaymentRequestDto;
      const item = await service.verifyOrRejectPayment({
        paymentUuid,
        approve: false,
        rejectionReason: body.rejectionReason,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminPaymentListItemDto>(res, {
        message: 'Bukti pembayaran ditolak dengan alasan tercatat.',
        data: item,
      });
    }),

    uploadQcPhotos: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { uuid } = req.params as { uuid: string };
      const filesMap = req.files as Record<string, Express.Multer.File[]> | undefined;
      const uploadedFiles = [...(filesMap?.files ?? []), ...(filesMap?.file ?? [])];
      if (uploadedFiles.length === 0) {
        throw new AppError(
          'Minimal satu file foto QC wajib diunggah pada field "files" atau "file".',
          400
        );
      }

      const photos = await service.uploadQcPhotos({
        transactionUuid: uuid,
        files: uploadedFiles.map((f) => f.buffer),
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderQcPhotoDto[]>(res, {
        status: 201,
        message: `${photos.length} foto QC berhasil diunggah.`,
        data: photos,
      });
    }),

    deleteQcPhoto: asyncHandler(async (req, res) => {
      const { uuid, photoId } = req.params as unknown as { uuid: string; photoId: number };
      const data = await service.deleteQcPhoto({ transactionUuid: uuid, photoId });
      return sendSuccess<{ deletedId: number }>(res, {
        message: 'Foto QC berhasil dihapus.',
        data,
      });
    }),

    updateShippingCost: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { uuid } = req.params as { uuid: string };
      const body = req.body as AdminUpdateShippingCostRequestDto;
      const detail = await service.updateShippingCost({
        transactionUuid: uuid,
        shippingCost: body.shippingCost,
        notes: body.notes ?? null,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Ongkos kirim dan tagihan akhir berhasil diperbarui.',
        data: detail,
      });
    }),

    updateShipment: asyncHandler(async (req, res) => {
      if (!req.user) throw new AppError('Autentikasi admin diperlukan.', 401);
      const { uuid } = req.params as { uuid: string };
      const body = req.body as AdminUpdateShipmentRequestDto;
      const detail = await service.updateShipment({
        transactionUuid: uuid,
        shippingCourier: body.shippingCourier,
        shippingService: body.shippingService ?? null,
        trackingReceiptNumber: body.trackingReceiptNumber,
        adminUserId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrderDetailDto>(res, {
        message: 'Kurir dan nomor resi pengiriman berhasil disimpan.',
        data: detail,
      });
    }),

    downloadSpkPdf: asyncHandler(async (req, res) => {
      const { uuid } = req.params as { uuid: string };
      const { orderCode, pdfBuffer } = await service.generateOrderSpkPdf(uuid);
      res.status(200);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(pdfBuffer.length));
      res.setHeader('Content-Disposition', `attachment; filename="SPK-${orderCode}.pdf"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(pdfBuffer);
    }),
  };
}
