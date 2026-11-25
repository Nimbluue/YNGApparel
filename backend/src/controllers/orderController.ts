import {
  FULFILLMENT_TYPE,
  PAYMENT_METHOD,
  PAYMENT_SCHEME,
  type CreateOrderRequestDto,
  type FulfillmentType,
  type OrderDetailDto,
  type OrderPaymentsResponseDto,
  type PaymentMethod,
  type PaymentScheme,
  type UploadPaymentProofResultDto,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import defaultOrderService, { type OrderService } from '../services/orderService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

const FULFILLMENT_VALUES: readonly [FulfillmentType, ...FulfillmentType[]] = [
  FULFILLMENT_TYPE.SHIP,
  FULFILLMENT_TYPE.PICKUP,
];

const PAYMENT_SCHEME_VALUES: readonly [PaymentScheme, ...PaymentScheme[]] = [
  PAYMENT_SCHEME.FULL,
  PAYMENT_SCHEME.DP,
];

const PAYMENT_METHOD_VALUES: readonly [PaymentMethod, ...PaymentMethod[]] = [
  PAYMENT_METHOD.QRIS,
  PAYMENT_METHOD.BANK_TRANSFER,
];

export const orderUuidParamSchema = z
  .object({
    uuid: z.string().uuid('Format UUID pesanan tidak valid.'),
  })
  .strict();

export const paymentProofParamsSchema = z
  .object({
    uuid: z.string().uuid('Format UUID pesanan tidak valid.'),
    paymentUuid: z.string().uuid('Format UUID pembayaran tidak valid.'),
  })
  .strict();

const shippingAddressSchema = z
  .object({
    recipientName: z
      .string({ required_error: 'Nama penerima wajib diisi.' })
      .trim()
      .min(2, 'Nama penerima minimal 2 karakter.')
      .max(150, 'Nama penerima maksimal 150 karakter.'),
    recipientWhatsapp: z
      .string({ required_error: 'Nomor WhatsApp penerima wajib diisi.' })
      .trim()
      .min(8, 'Nomor WhatsApp penerima terlalu pendek.')
      .max(25, 'Nomor WhatsApp penerima terlalu panjang.'),
    provinceName: z
      .string({ required_error: 'Provinsi wajib diisi.' })
      .trim()
      .min(2, 'Nama provinsi minimal 2 karakter.')
      .max(100, 'Nama provinsi maksimal 100 karakter.'),
    cityName: z
      .string({ required_error: 'Kota/Kabupaten wajib diisi.' })
      .trim()
      .min(2, 'Nama kota/kabupaten minimal 2 karakter.')
      .max(100, 'Nama kota/kabupaten maksimal 100 karakter.'),
    districtName: z
      .string({ required_error: 'Kecamatan wajib diisi.' })
      .trim()
      .min(2, 'Nama kecamatan minimal 2 karakter.')
      .max(100, 'Nama kecamatan maksimal 100 karakter.'),
    postalCode: z
      .string({ required_error: 'Kode pos wajib diisi.' })
      .trim()
      .regex(/^[0-9]{5}$/, 'Kode pos harus terdiri dari 5 digit angka.'),
    fullAddress: z
      .string({ required_error: 'Alamat lengkap wajib diisi.' })
      .trim()
      .min(5, 'Alamat lengkap minimal 5 karakter.')
      .max(500, 'Alamat lengkap maksimal 500 karakter.'),
  })
  .strict();

export const createOrderBodySchema: z.ZodType<CreateOrderRequestDto> = z
  .object({
    cartItemUuids: z
      .array(z.string().uuid('Format UUID item keranjang tidak valid.'), {
        required_error: 'Pilih minimal satu item keranjang untuk checkout.',
      })
      .min(1, 'Pilih minimal satu item keranjang untuk checkout.')
      .max(20, 'Maksimal 20 item per checkout.'),
    fulfillmentType: z.enum(FULFILLMENT_VALUES, {
      required_error: 'Jenis pengambilan/pengiriman wajib dipilih.',
      invalid_type_error: 'Jenis pengiriman tidak valid.',
    }),
    addressUuid: z.string().uuid('Format UUID alamat tidak valid.').nullable().optional(),
    address: shippingAddressSchema.nullable().optional(),
    pickupName: z.string().trim().min(2).max(150).nullable().optional(),
    pickupWhatsapp: z.string().trim().min(8).max(25).nullable().optional(),
    paymentScheme: z.enum(PAYMENT_SCHEME_VALUES, {
      required_error: 'Skema pembayaran wajib dipilih.',
      invalid_type_error: 'Skema pembayaran tidak valid.',
    }),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.fulfillmentType === FULFILLMENT_TYPE.SHIP) {
      if (!data.addressUuid && !data.address) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address'],
          message: 'Alamat pengiriman wajib dipilih atau diisi untuk metode kirim.',
        });
      }
      if (data.addressUuid && data.address) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['addressUuid'],
          message: 'Pilih salah satu: addressUuid tersimpan atau objek address baru.',
        });
      }
    }
  });

export const uploadProofBodySchema = z
  .object({
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES, {
      required_error: 'Metode pembayaran wajib dipilih.',
      invalid_type_error: 'Metode pembayaran harus QRIS atau BANK_TRANSFER.',
    }),
    paymentAccountId: z.preprocess(
      (val) => {
        if (val === undefined || val === null || val === '') return null;
        return Number(val);
      },
      z
        .number({ invalid_type_error: 'ID rekening harus berupa angka.' })
        .int('ID rekening harus berupa bilangan bulat.')
        .positive('ID rekening harus lebih dari 0.')
        .nullable()
    ),
  })
  .strict();

const idempotencyHeaderSchema = z.string().uuid('Header Idempotency-Key harus berupa UUID valid.');

/**
 * Membangun controller checkout pesanan dan pembayaran pelanggan.
 */
export function createOrderController(service: OrderService = defaultOrderService): {
  createOrder: RequestHandler;
  getOrderPayments: RequestHandler;
  uploadPaymentProof: RequestHandler;
} {
  return {
    createOrder: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }

      const rawIdempotencyKey = req.get('Idempotency-Key')?.trim() ?? '';
      let idempotencyKey: string | null = null;
      if (rawIdempotencyKey.length > 0) {
        const parsed = idempotencyHeaderSchema.safeParse(rawIdempotencyKey);
        if (!parsed.success) {
          throw new AppError('Header Idempotency-Key harus berupa UUID yang valid.', 400);
        }
        idempotencyKey = parsed.data;
      }

      const result = await service.checkoutFromCart({
        userId: req.user.id,
        idempotencyKey,
        payload: req.body as CreateOrderRequestDto,
      });

      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<OrderDetailDto>(res, {
        status: result.deduplicated ? 200 : 201,
        message: result.deduplicated
          ? 'Pesanan dengan Idempotency-Key ini sudah dibuat sebelumnya.'
          : 'Pesanan berhasil dibuat.',
        data: result.order,
      });
    }),

    getOrderPayments: asyncHandler(async (req, res) => {
      const { uuid } = req.params as { uuid: string };
      const data = await service.getOrderPayments(uuid);
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<OrderPaymentsResponseDto>(res, {
        message: 'Informasi tagihan pembayaran berhasil dimuat.',
        data,
      });
    }),

    uploadPaymentProof: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError('File bukti pembayaran wajib diunggah pada field "file".', 400);
      }

      const { uuid, paymentUuid } = req.params as { uuid: string; paymentUuid: string };
      const parsedBody = req.body as {
        paymentMethod: PaymentMethod;
        paymentAccountId: number | null;
      };

      const data = await service.uploadPaymentProof({
        transactionUuid: uuid,
        paymentUuid,
        paymentMethod: parsedBody.paymentMethod,
        paymentAccountId: parsedBody.paymentAccountId,
        buffer: req.file.buffer,
      });

      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<UploadPaymentProofResultDto>(res, {
        message: 'Bukti pembayaran berhasil diunggah dan menunggu verifikasi admin.',
        data,
      });
    }),
  };
}
