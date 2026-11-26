import type {
  AdminCancelOrderRequestDto,
  AdminKanbanBoardDto,
  AdminOrderCardDto,
  AdminOrderDetailDto,
  AdminOrderQcPhotoDto,
  AdminPaymentListItemDto,
  AdminRejectPaymentRequestDto,
  AdminReviewDesignRequestDto,
  AdminTransitionStatusRequestDto,
  AdminUpdateAddressRequestDto,
  AdminUpdateDiscountRequestDto,
  AdminUpdateNotesRequestDto,
  AdminUpdateShipmentRequestDto,
  AdminUpdateShippingCostRequestDto,
  AdminVerifyPaymentRequestDto,
  ApiSuccessResponse,
  FulfillmentType,
  PaginationMeta,
  PaymentStatus,
  ProductionStatus,
} from '@yng/shared';
import api, { ApiClientError } from './api';

export interface AdminOrdersQueryParams {
  status?: ProductionStatus;
  paymentStatus?: PaymentStatus;
  fulfillmentType?: FulfillmentType;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminPaymentsQueryParams {
  status?: PaymentStatus;
  hasProof?: boolean;
  page?: number;
  limit?: number;
}

export const adminOrderQueryKeys = {
  all: ['admin-orders'] as const,
  kanban: ['admin-orders', 'kanban'] as const,
  list: (filters: AdminOrdersQueryParams) => ['admin-orders', 'list', filters] as const,
  detail: (uuid: string) => ['admin-orders', 'detail', uuid] as const,
  paymentsAll: ['admin-payments'] as const,
  payments: (filters: AdminPaymentsQueryParams) => ['admin-payments', 'list', filters] as const,
};

function sanitizeOrderParams(params: AdminOrdersQueryParams): Record<string, string | number> {
  const cleaned: Record<string, string | number> = {};
  if (params.status) cleaned.status = params.status;
  if (params.paymentStatus) cleaned.paymentStatus = params.paymentStatus;
  if (params.fulfillmentType) cleaned.fulfillmentType = params.fulfillmentType;
  if (params.search && params.search.trim().length > 0) cleaned.search = params.search.trim();
  if (typeof params.page === 'number' && params.page >= 1) cleaned.page = params.page;
  if (typeof params.limit === 'number' && params.limit >= 1) cleaned.limit = params.limit;
  return cleaned;
}

function sanitizePaymentParams(params: AdminPaymentsQueryParams): Record<string, string | number> {
  const cleaned: Record<string, string | number> = {};
  if (params.status) cleaned.status = params.status;
  if (typeof params.hasProof === 'boolean') {
    cleaned.hasProof = params.hasProof ? 'true' : 'false';
  }
  if (typeof params.page === 'number' && params.page >= 1) cleaned.page = params.page;
  if (typeof params.limit === 'number' && params.limit >= 1) cleaned.limit = params.limit;
  return cleaned;
}

/**
 * Mengambil daftar pesanan admin beserta paginasi (`GET /api/admin/orders`).
 */
export async function listAdminOrders(
  params: AdminOrdersQueryParams = {}
): Promise<{ items: AdminOrderCardDto[]; meta: PaginationMeta }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const response = await api.get<ApiSuccessResponse<AdminOrderCardDto[]>>('/admin/orders', {
    params: sanitizeOrderParams({ ...params, page, limit }),
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
 * Mengambil data board Kanban produksi aktif (`GET /api/admin/orders/kanban`).
 */
export async function getAdminKanbanBoard(): Promise<AdminKanbanBoardDto> {
  const response = await api.get<ApiSuccessResponse<AdminKanbanBoardDto>>('/admin/orders/kanban');
  return response.data.data;
}

/**
 * Mengambil detail lengkap pesanan untuk Admin tanpa masking (`GET /api/admin/orders/:uuid`).
 */
export async function getAdminOrderDetail(uuid: string): Promise<AdminOrderDetailDto> {
  const response = await api.get<ApiSuccessResponse<AdminOrderDetailDto>>(`/admin/orders/${uuid}`);
  return response.data.data;
}

/**
 * Mengubah status produksi pesanan melalui state machine (`PATCH /api/admin/orders/:uuid/status`).
 */
export async function transitionAdminOrderStatus(
  uuid: string,
  payload: AdminTransitionStatusRequestDto
): Promise<AdminOrderDetailDto> {
  const response = await api.patch<ApiSuccessResponse<AdminOrderDetailDto>>(
    `/admin/orders/${uuid}/status`,
    payload
  );
  return response.data.data;
}

/**
 * Menyimpan hasil review desain pesanan (`PATCH /api/admin/orders/:uuid/design`).
 */
export async function reviewAdminOrderDesign(
  uuid: string,
  payload: AdminReviewDesignRequestDto
): Promise<AdminOrderDetailDto> {
  const response = await api.patch<ApiSuccessResponse<AdminOrderDetailDto>>(
    `/admin/orders/${uuid}/design`,
    payload
  );
  return response.data.data;
}

/**
 * Membatalkan pesanan beserta pencatatan refund (`POST /api/admin/orders/:uuid/cancel`).
 */
export async function cancelAdminOrder(
  uuid: string,
  payload: AdminCancelOrderRequestDto
): Promise<AdminOrderDetailDto> {
  const response = await api.post<ApiSuccessResponse<AdminOrderDetailDto>>(
    `/admin/orders/${uuid}/cancel`,
    payload
  );
  return response.data.data;
}

/**
 * Memperbarui nominal diskon pesanan (`PATCH /api/admin/orders/:uuid/discount`).
 */
export async function updateAdminOrderDiscount(
  uuid: string,
  payload: AdminUpdateDiscountRequestDto
): Promise<AdminOrderDetailDto> {
  const response = await api.patch<ApiSuccessResponse<AdminOrderDetailDto>>(
    `/admin/orders/${uuid}/discount`,
    payload
  );
  return response.data.data;
}

/**
 * Memperbarui alamat atau data penerima pesanan (`PATCH /api/admin/orders/:uuid/address`).
 */
export async function updateAdminOrderAddress(
  uuid: string,
  payload: AdminUpdateAddressRequestDto
): Promise<AdminOrderDetailDto> {
  const response = await api.patch<ApiSuccessResponse<AdminOrderDetailDto>>(
    `/admin/orders/${uuid}/address`,
    payload
  );
  return response.data.data;
}

/**
 * Memperbarui catatan internal admin & estimasi selesai (`PATCH /api/admin/orders/:uuid/notes`).
 */
export async function updateAdminOrderNotes(
  uuid: string,
  payload: AdminUpdateNotesRequestDto
): Promise<AdminOrderDetailDto> {
  const response = await api.patch<ApiSuccessResponse<AdminOrderDetailDto>>(
    `/admin/orders/${uuid}/notes`,
    payload
  );
  return response.data.data;
}

/**
 * Menginput atau merevisi ongkos kirim pesanan secara atomik (`PATCH /api/admin/orders/:uuid/shipping-cost`).
 */
export async function updateAdminOrderShippingCost(
  uuid: string,
  payload: AdminUpdateShippingCostRequestDto
): Promise<AdminOrderDetailDto> {
  const response = await api.patch<ApiSuccessResponse<AdminOrderDetailDto>>(
    `/admin/orders/${uuid}/shipping-cost`,
    payload
  );
  return response.data.data;
}

/**
 * Menginput atau memperbarui kurir dan nomor resi resmi (`PATCH /api/admin/orders/:uuid/shipment`).
 */
export async function updateAdminOrderShipment(
  uuid: string,
  payload: AdminUpdateShipmentRequestDto
): Promise<AdminOrderDetailDto> {
  const response = await api.patch<ApiSuccessResponse<AdminOrderDetailDto>>(
    `/admin/orders/${uuid}/shipment`,
    payload
  );
  return response.data.data;
}

/**
 * Mengunggah satu atau beberapa foto QC pesanan (`POST /api/admin/orders/:uuid/qc-photos`).
 */
export async function uploadAdminOrderQcPhotos(
  uuid: string,
  files: File[]
): Promise<AdminOrderQcPhotoDto[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const response = await api.post<ApiSuccessResponse<AdminOrderQcPhotoDto[]>>(
    `/admin/orders/${uuid}/qc-photos`,
    formData,
    {
      headers: {
        'Content-Type': undefined,
      },
      timeout: 60000,
    }
  );
  return response.data.data;
}

/**
 * Menghapus foto QC pesanan (`DELETE /api/admin/orders/:uuid/qc-photos/:photoId`).
 */
export async function deleteAdminOrderQcPhoto(
  uuid: string,
  photoId: number
): Promise<{ deletedId: number }> {
  const response = await api.delete<ApiSuccessResponse<{ deletedId: number }>>(
    `/admin/orders/${uuid}/qc-photos/${photoId}`
  );
  return response.data.data;
}

/**
 * Mengunduh SPK PDF ukuran A4 tanpa harga (`GET /api/admin/orders/:uuid/spk`).
 */
export async function downloadAdminOrderSpkPdf(uuid: string, orderCode: string): Promise<void> {
  let rawBlob: Blob;
  try {
    const response = await api.get<Blob>(`/admin/orders/${uuid}/spk`, {
      responseType: 'blob',
      headers: {
        Accept: 'application/pdf',
        'Content-Type': undefined,
      },
      timeout: 30000,
    });
    rawBlob = response.data;
  } catch (err: unknown) {
    if (err instanceof ApiClientError && err.data instanceof Blob) {
      try {
        const text = await err.data.text();
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed.message) {
          throw new ApiClientError(parsed.message, err.status, parsed);
        }
      } catch (innerErr: unknown) {
        if (innerErr instanceof ApiClientError) throw innerErr;
      }
    }
    throw err;
  }

  const headerBytes = new Uint8Array(await rawBlob.slice(0, 5).arrayBuffer());
  const header = String.fromCharCode(...headerBytes);
  if (header !== '%PDF-') {
    let serverMsg = 'Dokumen SPK PDF yang diterima tidak valid.';
    try {
      const bodyText = await rawBlob.text();
      const parsed = JSON.parse(bodyText) as { message?: string };
      if (parsed.message) serverMsg = parsed.message;
    } catch {
      // Gunakan pesan fallback jika bukan JSON
    }
    throw new Error(serverMsg);
  }

  const blob = new Blob([rawBlob], { type: 'application/pdf' });
  const objectUrl = window.URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `SPK-${orderCode}.pdf`;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 10000);
  }
}

/**
 * Mengambil daftar antrean pembayaran admin (`GET /api/admin/payments`).
 */
export async function listAdminPayments(
  params: AdminPaymentsQueryParams = {}
): Promise<{ items: AdminPaymentListItemDto[]; meta: PaginationMeta }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const response = await api.get<ApiSuccessResponse<AdminPaymentListItemDto[]>>('/admin/payments', {
    params: sanitizePaymentParams({ ...params, page, limit }),
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
 * Memverifikasi atau menolak bukti pembayaran (`PATCH /api/admin/payments/:paymentUuid/verify`).
 */
export async function verifyAdminPayment(
  paymentUuid: string,
  payload: AdminVerifyPaymentRequestDto = { approve: true }
): Promise<AdminPaymentListItemDto> {
  const response = await api.patch<ApiSuccessResponse<AdminPaymentListItemDto>>(
    `/admin/payments/${paymentUuid}/verify`,
    payload
  );
  return response.data.data;
}

/**
 * Menolak bukti pembayaran dengan alasan wajib (`PATCH /api/admin/payments/:paymentUuid/reject`).
 */
export async function rejectAdminPayment(
  paymentUuid: string,
  payload: AdminRejectPaymentRequestDto
): Promise<AdminPaymentListItemDto> {
  const response = await api.patch<ApiSuccessResponse<AdminPaymentListItemDto>>(
    `/admin/payments/${paymentUuid}/reject`,
    payload
  );
  return response.data.data;
}
