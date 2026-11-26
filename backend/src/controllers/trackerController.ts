import {
  PAYMENT_METHOD,
  type PaymentMethod,
  type TrackerOrderDto,
  type TrackOrderLookupRequestDto,
  type UploadPaymentProofResultDto,
} from '@yng/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ORDER_CODE_ALPHABET } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import defaultTrackerService, { type TrackerService } from '../services/trackerService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

const PAYMENT_METHOD_VALUES: readonly [PaymentMethod, ...PaymentMethod[]] = [
  PAYMENT_METHOD.QRIS,
  PAYMENT_METHOD.BANK_TRANSFER,
];

const TRACKER_ORDER_CODE_REGEX = new RegExp(`^(YNG-)?[${ORDER_CODE_ALPHABET}]{6}$`, 'i');

export const trackLookupBodySchema: z.ZodType<TrackOrderLookupRequestDto> = z
  .object({
    code: z
      .string({ required_error: 'Kode pesanan wajib diisi.' })
      .trim()
      .min(6, 'Kode pesanan minimal 6 karakter.')
      .max(10, 'Kode pesanan maksimal 10 karakter.')
      .regex(
        TRACKER_ORDER_CODE_REGEX,
        'Format kode pesanan harus YNG-XXXXXX atau 6 karakter valid.'
      ),
    whatsappLast4: z
      .string({ required_error: '4 digit terakhir nomor WhatsApp wajib diisi.' })
      .trim()
      .regex(/^[0-9]{4}$/, 'Masukkan tepat 4 digit terakhir nomor WhatsApp.'),
  })
  .strict();

export const trackUuidParamSchema = z
  .object({
    uuid: z.string().uuid('Format UUID pesanan tidak valid.'),
  })
  .strict();

export const trackPaymentProofParamsSchema = z
  .object({
    uuid: z.string().uuid('Format UUID pesanan tidak valid.'),
    paymentUuid: z.string().uuid('Format UUID pembayaran tidak valid.'),
  })
  .strict();

export const trackUploadProofBodySchema = z
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
    code: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z
        .string()
        .trim()
        .regex(TRACKER_ORDER_CODE_REGEX, 'Format kode pesanan tidak valid.')
        .optional()
    ),
    whatsappLast4: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z
        .string()
        .trim()
        .regex(/^[0-9]{4}$/, 'Masukkan tepat 4 digit terakhir nomor WhatsApp.')
        .optional()
    ),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasCode = data.code !== undefined;
    const hasWa = data.whatsappLast4 !== undefined;
    if (hasCode !== hasWa) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasCode ? ['whatsappLast4'] : ['code'],
        message: 'Kode pesanan dan 4 digit terakhir WhatsApp harus diisi bersamaan.',
      });
    }
  });

/**
 * Membangun controller Live Tracker publik (`/api/track/*`).
 */
export function createTrackerController(service: TrackerService = defaultTrackerService): {
  lookupOrder: RequestHandler;
  getOrderByMagicLink: RequestHandler;
  uploadPaymentProof: RequestHandler;
} {
  return {
    lookupOrder: asyncHandler(async (req, res) => {
      const { code, whatsappLast4 } = req.body as TrackOrderLookupRequestDto;
      const data = await service.lookupByCodeAndWhatsapp(code, whatsappLast4);
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<TrackerOrderDto>(res, {
        message: 'Status pesanan ditemukan.',
        data,
      });
    }),

    getOrderByMagicLink: asyncHandler(async (req, res) => {
      const { uuid } = req.params as { uuid: string };
      const data = await service.getByMagicLinkUuid(uuid);
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<TrackerOrderDto>(res, {
        message: 'Detail pelacakan pesanan berhasil dimuat.',
        data,
      });
    }),

    uploadPaymentProof: asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError('File bukti pembayaran wajib diunggah pada field "file".', 400);
      }

      const { uuid, paymentUuid } = req.params as { uuid: string; paymentUuid: string };
      const body = req.body as {
        paymentMethod: PaymentMethod;
        paymentAccountId: number | null;
        code?: string;
        whatsappLast4?: string;
      };

      const data = await service.uploadPaymentProofViaTracker({
        transactionUuid: uuid,
        paymentUuid,
        paymentMethod: body.paymentMethod,
        paymentAccountId: body.paymentAccountId,
        buffer: req.file.buffer,
        code: body.code ?? null,
        whatsappLast4: body.whatsappLast4 ?? null,
      });

      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<UploadPaymentProofResultDto>(res, {
        message: 'Bukti pembayaran berhasil diunggah dan menunggu verifikasi admin.',
        data,
      });
    }),
  };
}
