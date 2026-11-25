import type {
  ApiSuccessResponse,
  AppSettingsResponseDto,
  CatalogImageFolder,
  CatalogImageUploadDto,
  CreateFabricColorDto,
  CreateFabricDto,
  CreateGarmentModelDto,
  CreatePaymentAccountDto,
  CreatePrintSizeDto,
  CreateSizeDto,
  FabricColorDto,
  FabricDto,
  GarmentModelDto,
  PaymentAccountDto,
  PrintSizeDto,
  ReplaceModelFabricsDto,
  SizeDto,
  UpdateAppSettingsDto,
  UpdateFabricColorDto,
  UpdateFabricDto,
  UpdateGarmentModelDto,
  UpdatePaymentAccountDto,
  UpdatePrintSizeDto,
  UpdateSizeDto,
} from '@yng/shared';
import api from './api';

function buildIncludeInactiveParams(
  includeInactive: boolean
): { includeInactive: 'true' } | undefined {
  return includeInactive ? { includeInactive: 'true' } : undefined;
}

export async function uploadCatalogImage(
  file: File,
  folder: CatalogImageFolder
): Promise<CatalogImageUploadDto> {
  const formData = new FormData();
  formData.append('folder', folder);
  formData.append('image', file);

  const response = await api.post<ApiSuccessResponse<CatalogImageUploadDto>>(
    '/admin/uploads/image',
    formData,
    {
      headers: { 'Content-Type': undefined },
      timeout: 30000,
    }
  );
  return response.data.data;
}

// ── Model Pakaian & Relasi Bahan ───────────────────────────────────────────
export async function listModels(includeInactive = false): Promise<GarmentModelDto[]> {
  const response = await api.get<ApiSuccessResponse<GarmentModelDto[]>>('/admin/models', {
    params: buildIncludeInactiveParams(includeInactive),
  });
  return response.data.data;
}

export async function createModel(payload: CreateGarmentModelDto): Promise<GarmentModelDto> {
  const response = await api.post<ApiSuccessResponse<GarmentModelDto>>('/admin/models', payload);
  return response.data.data;
}

export async function updateModel(
  id: number,
  payload: UpdateGarmentModelDto
): Promise<GarmentModelDto> {
  const response = await api.put<ApiSuccessResponse<GarmentModelDto>>(
    `/admin/models/${id}`,
    payload
  );
  return response.data.data;
}

export async function deactivateModel(id: number): Promise<GarmentModelDto> {
  const response = await api.delete<ApiSuccessResponse<GarmentModelDto>>(`/admin/models/${id}`);
  return response.data.data;
}

export async function replaceModelFabrics(
  id: number,
  payload: ReplaceModelFabricsDto
): Promise<GarmentModelDto> {
  const response = await api.put<ApiSuccessResponse<GarmentModelDto>>(
    `/admin/models/${id}/fabrics`,
    payload
  );
  return response.data.data;
}

// ── Bahan & Preset Warna ───────────────────────────────────────────────────
export async function listFabrics(includeInactive = false): Promise<FabricDto[]> {
  const response = await api.get<ApiSuccessResponse<FabricDto[]>>('/admin/fabrics', {
    params: buildIncludeInactiveParams(includeInactive),
  });
  return response.data.data;
}

export async function createFabric(payload: CreateFabricDto): Promise<FabricDto> {
  const response = await api.post<ApiSuccessResponse<FabricDto>>('/admin/fabrics', payload);
  return response.data.data;
}

export async function updateFabric(id: number, payload: UpdateFabricDto): Promise<FabricDto> {
  const response = await api.put<ApiSuccessResponse<FabricDto>>(`/admin/fabrics/${id}`, payload);
  return response.data.data;
}

export async function deactivateFabric(id: number): Promise<FabricDto> {
  const response = await api.delete<ApiSuccessResponse<FabricDto>>(`/admin/fabrics/${id}`);
  return response.data.data;
}

export async function listFabricColors(
  fabricId: number,
  includeInactive = false
): Promise<FabricColorDto[]> {
  const response = await api.get<ApiSuccessResponse<FabricColorDto[]>>(
    `/admin/fabrics/${fabricId}/colors`,
    { params: buildIncludeInactiveParams(includeInactive) }
  );
  return response.data.data;
}

export async function createFabricColor(
  fabricId: number,
  payload: CreateFabricColorDto
): Promise<FabricColorDto> {
  const response = await api.post<ApiSuccessResponse<FabricColorDto>>(
    `/admin/fabrics/${fabricId}/colors`,
    payload
  );
  return response.data.data;
}

export async function updateFabricColor(
  fabricId: number,
  colorId: number,
  payload: UpdateFabricColorDto
): Promise<FabricColorDto> {
  const response = await api.put<ApiSuccessResponse<FabricColorDto>>(
    `/admin/fabrics/${fabricId}/colors/${colorId}`,
    payload
  );
  return response.data.data;
}

export async function deactivateFabricColor(
  fabricId: number,
  colorId: number
): Promise<FabricColorDto> {
  const response = await api.delete<ApiSuccessResponse<FabricColorDto>>(
    `/admin/fabrics/${fabricId}/colors/${colorId}`
  );
  return response.data.data;
}

// ── Ukuran ─────────────────────────────────────────────────────────────────
export async function listSizes(includeInactive = false): Promise<SizeDto[]> {
  const response = await api.get<ApiSuccessResponse<SizeDto[]>>('/admin/sizes', {
    params: buildIncludeInactiveParams(includeInactive),
  });
  return response.data.data;
}

export async function createSize(payload: CreateSizeDto): Promise<SizeDto> {
  const response = await api.post<ApiSuccessResponse<SizeDto>>('/admin/sizes', payload);
  return response.data.data;
}

export async function updateSize(id: number, payload: UpdateSizeDto): Promise<SizeDto> {
  const response = await api.put<ApiSuccessResponse<SizeDto>>(`/admin/sizes/${id}`, payload);
  return response.data.data;
}

export async function deactivateSize(id: number): Promise<SizeDto> {
  const response = await api.delete<ApiSuccessResponse<SizeDto>>(`/admin/sizes/${id}`);
  return response.data.data;
}

// ── Ukuran Sablon ──────────────────────────────────────────────────────────
export async function listPrintSizes(includeInactive = false): Promise<PrintSizeDto[]> {
  const response = await api.get<ApiSuccessResponse<PrintSizeDto[]>>('/admin/print-sizes', {
    params: buildIncludeInactiveParams(includeInactive),
  });
  return response.data.data;
}

export async function createPrintSize(payload: CreatePrintSizeDto): Promise<PrintSizeDto> {
  const response = await api.post<ApiSuccessResponse<PrintSizeDto>>('/admin/print-sizes', payload);
  return response.data.data;
}

export async function updatePrintSize(
  id: number,
  payload: UpdatePrintSizeDto
): Promise<PrintSizeDto> {
  const response = await api.put<ApiSuccessResponse<PrintSizeDto>>(
    `/admin/print-sizes/${id}`,
    payload
  );
  return response.data.data;
}

export async function deactivatePrintSize(id: number): Promise<PrintSizeDto> {
  const response = await api.delete<ApiSuccessResponse<PrintSizeDto>>(`/admin/print-sizes/${id}`);
  return response.data.data;
}

// ── Rekening Pembayaran & QRIS ─────────────────────────────────────────────
export async function listPaymentAccounts(includeInactive = false): Promise<PaymentAccountDto[]> {
  const response = await api.get<ApiSuccessResponse<PaymentAccountDto[]>>(
    '/admin/payment-accounts',
    { params: buildIncludeInactiveParams(includeInactive) }
  );
  return response.data.data;
}

export async function createPaymentAccount(
  payload: CreatePaymentAccountDto
): Promise<PaymentAccountDto> {
  const response = await api.post<ApiSuccessResponse<PaymentAccountDto>>(
    '/admin/payment-accounts',
    payload
  );
  return response.data.data;
}

export async function updatePaymentAccount(
  id: number,
  payload: UpdatePaymentAccountDto
): Promise<PaymentAccountDto> {
  const response = await api.put<ApiSuccessResponse<PaymentAccountDto>>(
    `/admin/payment-accounts/${id}`,
    payload
  );
  return response.data.data;
}

export async function deactivatePaymentAccount(id: number): Promise<PaymentAccountDto> {
  const response = await api.delete<ApiSuccessResponse<PaymentAccountDto>>(
    `/admin/payment-accounts/${id}`
  );
  return response.data.data;
}

// ── Pengaturan Aplikasi ────────────────────────────────────────────────────
export async function getSettings(): Promise<AppSettingsResponseDto> {
  const response = await api.get<ApiSuccessResponse<AppSettingsResponseDto>>('/admin/settings');
  return response.data.data;
}

export async function updateSettings(
  payload: UpdateAppSettingsDto
): Promise<AppSettingsResponseDto> {
  const response = await api.put<ApiSuccessResponse<AppSettingsResponseDto>>(
    '/admin/settings',
    payload
  );
  return response.data.data;
}
