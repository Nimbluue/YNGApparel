import type {
  AdminDashboardSummaryDto,
  AdminOrdersReportDto,
  AdminSalesReportDto,
  AdminTopCustomersReportDto,
  AdminTopModelsReportDto,
  ApiSuccessResponse,
  ReportExportType,
  ReportGroupBy,
} from '@yng/shared';
import api, { ApiClientError } from './api';

export interface ReportFilterParams {
  startDate?: string;
  endDate?: string;
  allTime?: boolean;
  groupBy?: ReportGroupBy;
  limit?: number;
}

export const adminReportQueryKeys = {
  all: ['admin-reports'] as const,
  dashboard: (filters: ReportFilterParams) => ['admin-reports', 'dashboard', filters] as const,
  sales: (filters: ReportFilterParams) => ['admin-reports', 'sales', filters] as const,
  orders: (filters: ReportFilterParams) => ['admin-reports', 'orders', filters] as const,
  topModels: (filters: ReportFilterParams) => ['admin-reports', 'top-models', filters] as const,
  customers: (filters: ReportFilterParams) => ['admin-reports', 'customers', filters] as const,
};

function serializeReportParams(filters: ReportFilterParams): Record<string, string | number> {
  const cleaned: Record<string, string | number> = {};
  if (filters.allTime) {
    cleaned.allTime = 'true';
  } else {
    if (filters.startDate) cleaned.startDate = filters.startDate;
    if (filters.endDate) cleaned.endDate = filters.endDate;
  }
  if (filters.groupBy) cleaned.groupBy = filters.groupBy;
  if (typeof filters.limit === 'number' && filters.limit > 0) cleaned.limit = filters.limit;
  return cleaned;
}

/**
 * Mengambil ringkasan KPI & snapshot operasional dashboard (`GET /api/admin/dashboard`).
 */
export async function getAdminDashboard(
  filters: ReportFilterParams = {}
): Promise<AdminDashboardSummaryDto> {
  const response = await api.get<ApiSuccessResponse<AdminDashboardSummaryDto>>('/admin/dashboard', {
    params: serializeReportParams(filters),
  });
  return response.data.data;
}

/**
 * Mengambil laporan penjualan harian/bulanan + distribusi sumber & status (`GET /api/admin/reports/sales`).
 */
export async function getAdminSalesReport(
  filters: ReportFilterParams = {}
): Promise<AdminSalesReportDto> {
  const response = await api.get<ApiSuccessResponse<AdminSalesReportDto>>('/admin/reports/sales', {
    params: serializeReportParams(filters),
  });
  return response.data.data;
}

/**
 * Mengambil rincian daftar order per periode (`GET /api/admin/reports/orders`).
 */
export async function getAdminOrdersReport(
  filters: ReportFilterParams = {}
): Promise<AdminOrdersReportDto> {
  const response = await api.get<ApiSuccessResponse<AdminOrdersReportDto>>(
    '/admin/reports/orders',
    {
      params: serializeReportParams(filters),
    }
  );
  return response.data.data;
}

/**
 * Mengambil peringkat model pakaian terlaris (`GET /api/admin/reports/top-models`).
 */
export async function getAdminTopModelsReport(
  filters: ReportFilterParams = {}
): Promise<AdminTopModelsReportDto> {
  const response = await api.get<ApiSuccessResponse<AdminTopModelsReportDto>>(
    '/admin/reports/top-models',
    {
      params: serializeReportParams(filters),
    }
  );
  return response.data.data;
}

/**
 * Mengambil peringkat pelanggan berdasarkan jumlah order & total belanja (`GET /api/admin/reports/customers`).
 */
export async function getAdminTopCustomersReport(
  filters: ReportFilterParams = {}
): Promise<AdminTopCustomersReportDto> {
  const response = await api.get<ApiSuccessResponse<AdminTopCustomersReportDto>>(
    '/admin/reports/customers',
    {
      params: serializeReportParams(filters),
    }
  );
  return response.data.data;
}

/**
 * Mengunduh file CSV laporan secara aman melalui `GET /api/admin/reports/export` (`responseType: 'blob'`).
 */
export async function downloadAdminReportCsv(input: {
  type: ReportExportType;
  filters: ReportFilterParams;
}): Promise<string> {
  const params = {
    ...serializeReportParams(input.filters),
    type: input.type,
  };

  let rawBlob: Blob;
  try {
    const response = await api.get<Blob>('/admin/reports/export', {
      params,
      responseType: 'blob',
      headers: {
        Accept: 'text/csv',
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

  // Pastikan response bukan payload HTML atau JSON error terselubung
  const previewText = await rawBlob.slice(0, 64).text();
  const trimmedPreview = previewText.trimStart();
  if (
    trimmedPreview.startsWith('{') ||
    trimmedPreview.startsWith('<!doctype') ||
    trimmedPreview.startsWith('<html')
  ) {
    throw new Error('Server tidak mengembalikan file CSV yang valid.');
  }

  const suffix = input.filters.allTime
    ? 'semua'
    : `${input.filters.startDate || 'awal'}_${input.filters.endDate || 'akhir'}`;
  const fileLabelMap: Record<ReportExportType, string> = {
    sales: 'laporan-penjualan',
    orders: 'laporan-order',
    'top-models': 'laporan-model-terlaris',
    customers: 'laporan-pelanggan',
  };
  const filename = `${fileLabelMap[input.type]}-${suffix}.csv`;

  const csvBlob = new Blob([rawBlob], { type: 'text/csv;charset=utf-8' });
  const objectUrl = window.URL.createObjectURL(csvBlob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 10000);
  }

  return filename;
}
