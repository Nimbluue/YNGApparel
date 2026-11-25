import type {
  ApiSuccessResponse,
  CreateOrderRequestDto,
  OrderDetailDto,
  OrderSummaryDto,
  PaginationMeta,
  PaymentMethod,
  UploadPaymentProofResultDto,
} from '@yng/shared';
import api from './api';

export const CHECKOUT_SELECTION_STORAGE_KEY = 'yng_checkout_selection_v1';

export const orderQueryKeys = {
  all: ['orders'] as const,
  list: (page: number, limit: number) => ['orders', 'list', page, limit] as const,
  detail: (transactionUuid: string) => ['orders', 'detail', transactionUuid] as const,
};

/**
 * Menyimpan daftar UUID item keranjang yang dipilih untuk checkout di `sessionStorage`.
 */
export function saveCheckoutSelection(cartItemUuids: readonly string[]): void {
  try {
    sessionStorage.setItem(CHECKOUT_SELECTION_STORAGE_KEY, JSON.stringify([...cartItemUuids]));
  } catch {
    // Abaikan kegagalan storage (mis. mode privat ketat)
  }
}

/**
 * Membaca daftar UUID item keranjang yang sebelumnya dipilih untuk checkout.
 */
export function readCheckoutSelection(): string[] {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SELECTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}

/**
 * Menghapus daftar pilihan checkout sementara setelah order berhasil dibuat.
 */
export function clearCheckoutSelection(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_SELECTION_STORAGE_KEY);
  } catch {
    // Abaikan kegagalan storage
  }
}

/**
 * Memformat stempel waktu ISO menjadi tampilan tanggal & jam WIB (`Asia/Jakarta`).
 */
export function formatWibDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date) + ' WIB'
  );
}

/**
 * Memformat stempel waktu ISO menjadi tanggal singkat Indonesia.
 */
export function formatWibDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Membuat pesanan baru dari item keranjang tercentang (`POST /api/orders`).
 */
export async function createOrder(
  payload: CreateOrderRequestDto,
  idempotencyKey: string
): Promise<OrderDetailDto> {
  const response = await api.post<ApiSuccessResponse<OrderDetailDto>>('/orders', payload, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  });
  return response.data.data;
}

/**
 * Mengambil daftar pesanan milik pengguna yang sedang login (`GET /api/orders`).
 */
export async function listMyOrders(
  page = 1,
  limit = 10
): Promise<{ items: OrderSummaryDto[]; meta: PaginationMeta }> {
  const response = await api.get<ApiSuccessResponse<OrderSummaryDto[]>>('/orders', {
    params: { page, limit },
  });
  const items = response.data.data;
  const meta: PaginationMeta = response.data.meta ?? {
    page,
    limit,
    total: items.length,
    totalPages: 1,
  };
  return { items, meta };
}

/**
 * Mengambil detail lengkap satu pesanan milik pengguna (`GET /api/orders/:uuid`).
 */
export async function getMyOrderDetail(transactionUuid: string): Promise<OrderDetailDto> {
  const response = await api.get<ApiSuccessResponse<OrderDetailDto>>(
    `/orders/${encodeURIComponent(transactionUuid)}`
  );
  return response.data.data;
}

/**
 * Mengunggah bukti pembayaran ke `POST /api/orders/:uuid/payments/:paymentUuid/proof`.
 */
export async function uploadPaymentProof(input: {
  transactionUuid: string;
  paymentUuid: string;
  paymentMethod: PaymentMethod;
  paymentAccountId: number | null;
  file: File;
}): Promise<UploadPaymentProofResultDto> {
  const formData = new FormData();
  formData.append('file', input.file);
  formData.append('paymentMethod', input.paymentMethod);
  if (input.paymentAccountId !== null) {
    formData.append('paymentAccountId', String(input.paymentAccountId));
  }

  const response = await api.post<ApiSuccessResponse<UploadPaymentProofResultDto>>(
    `/orders/${encodeURIComponent(input.transactionUuid)}/payments/${encodeURIComponent(input.paymentUuid)}/proof`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data.data;
}
