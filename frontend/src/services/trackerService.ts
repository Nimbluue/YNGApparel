import type {
  ApiSuccessResponse,
  PaymentMethod,
  TrackOrderLookupRequestDto,
  TrackerOrderDto,
  UploadPaymentProofResultDto,
} from '@yng/shared';
import api from './api';

export const trackerQueryKeys = {
  all: ['tracker'] as const,
  detail: (transactionUuid: string) => ['tracker', 'detail', transactionUuid] as const,
};

/**
 * Mencari status pesanan publik dengan kode pesanan (6 karakter / `YNG-XXXXXX`)
 * dan 4 digit terakhir nomor WhatsApp (`POST /api/track`).
 */
export async function lookupTrackOrder(
  payload: TrackOrderLookupRequestDto
): Promise<TrackerOrderDto> {
  const response = await api.post<ApiSuccessResponse<TrackerOrderDto>>('/track', payload);
  return response.data.data;
}

/**
 * Mengambil detail Live Tracker publik melalui Magic Link (`GET /api/track/:uuid`).
 */
export async function getTrackOrderByUuid(transactionUuid: string): Promise<TrackerOrderDto> {
  const response = await api.get<ApiSuccessResponse<TrackerOrderDto>>(
    `/track/${encodeURIComponent(transactionUuid)}`
  );
  return response.data.data;
}

/**
 * Mengunggah bukti pembayaran tagihan lanjutan melalui halaman tracker
 * (`POST /api/track/:uuid/payments/:paymentUuid/proof`).
 */
export async function uploadTrackerPaymentProof(input: {
  transactionUuid: string;
  paymentUuid: string;
  paymentMethod: PaymentMethod;
  paymentAccountId: number | null;
  file: File;
  code?: string | null;
  whatsappLast4?: string | null;
}): Promise<UploadPaymentProofResultDto> {
  const formData = new FormData();
  formData.append('file', input.file);
  formData.append('paymentMethod', input.paymentMethod);
  if (input.paymentAccountId !== null) {
    formData.append('paymentAccountId', String(input.paymentAccountId));
  }
  if (input.code && input.whatsappLast4) {
    formData.append('code', input.code);
    formData.append('whatsappLast4', input.whatsappLast4);
  }

  const response = await api.post<ApiSuccessResponse<UploadPaymentProofResultDto>>(
    `/track/${encodeURIComponent(input.transactionUuid)}/payments/${encodeURIComponent(input.paymentUuid)}/proof`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data.data;
}
