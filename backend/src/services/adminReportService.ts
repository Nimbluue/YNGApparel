import {
  FULFILLMENT_TYPE,
  getFulfillmentLabel,
  getProductionStatusLabel,
  type AdminDashboardSummaryDto,
  type AdminOrdersReportDto,
  type AdminSalesReportDto,
  type AdminTopCustomersReportDto,
  type AdminTopModelsReportDto,
  type ReportDateRangeDto,
  type ReportExportType,
  type ReportGroupBy,
} from '@yng/shared';
import { AppError } from '../middleware/errorHandler.js';
import adminReportModel, {
  type AdminReportRepository,
  type ReportDateRangeFilter,
} from '../models/adminReportModel.js';
import { buildCsvDocument } from '../utils/csv.js';

export interface AdminReportServiceDeps {
  reportRepo?: AdminReportRepository;
  nowFn?: () => Date;
}

export interface DateRangeInput {
  startDate?: string;
  endDate?: string;
  allTime?: boolean;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatWibIsoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftIsoDateDays(isoDate: string, deltaDays: number): string {
  const baseMs = Date.parse(`${isoDate}T12:00:00Z`);
  return formatWibIsoDate(new Date(baseMs + deltaDays * 86400 * 1000));
}

function isValidCalendarDate(isoDate: string): boolean {
  if (!ISO_DATE_REGEX.test(isoDate)) return false;
  const [y, m, d] = isoDate.split('-').map((n) => Number(n));
  const parsed = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m! - 1 && parsed.getUTCDate() === d
  );
}

/**
 * Menormalkan filter rentang tanggal laporan (WIB Asia/Jakarta).
 * Default ke 30 hari terakhir jika `startDate`/`endDate` kosong dan `allTime !== true`.
 */
export function resolveReportDateRange(
  input: DateRangeInput = {},
  now: Date = new Date()
): ReportDateRangeDto {
  if (input.allTime) {
    return { startDate: null, endDate: null, allTime: true };
  }

  const todayWib = formatWibIsoDate(now);
  const rawStart = input.startDate?.trim() || null;
  const rawEnd = input.endDate?.trim() || null;

  if (rawStart && !isValidCalendarDate(rawStart)) {
    throw new AppError('Format startDate tidak valid. Gunakan YYYY-MM-DD.', 400);
  }
  if (rawEnd && !isValidCalendarDate(rawEnd)) {
    throw new AppError('Format endDate tidak valid. Gunakan YYYY-MM-DD.', 400);
  }

  const endDate = rawEnd ?? todayWib;
  const startDate = rawStart ?? shiftIsoDateDays(endDate, -29);

  if (startDate > endDate) {
    throw new AppError(
      'Tanggal mulai (startDate) tidak boleh lebih besar dari tanggal akhir (endDate).',
      400
    );
  }

  return {
    startDate,
    endDate,
    allTime: false,
  };
}

function buildRangeFileSuffix(range: ReportDateRangeFilter): string {
  if (range.allTime || (!range.startDate && !range.endDate)) {
    return 'semua';
  }
  return `${range.startDate ?? 'awal'}_${range.endDate ?? 'akhir'}`;
}

/**
 * Membangun service dashboard ringkas, laporan bisnis, & ekspor CSV aman untuk Admin.
 */
export function createAdminReportService(deps: AdminReportServiceDeps = {}) {
  const repo = deps.reportRepo ?? adminReportModel;
  const nowFn = deps.nowFn ?? (() => new Date());

  return {
    async getDashboardSummary(input: DateRangeInput = {}): Promise<AdminDashboardSummaryDto> {
      const range = resolveReportDateRange(input, nowFn());
      const [kpi, operational] = await Promise.all([
        repo.getPeriodKpi(range),
        repo.getOperationalSnapshot(),
      ]);
      return { range, kpi, operational };
    },

    async getSalesReport(
      input: DateRangeInput & { groupBy?: ReportGroupBy } = {}
    ): Promise<AdminSalesReportDto> {
      const range = resolveReportDateRange(input, nowFn());
      const groupBy: ReportGroupBy = input.groupBy === 'month' ? 'month' : 'day';
      const [kpi, series, breakdowns] = await Promise.all([
        repo.getPeriodKpi(range),
        repo.getSalesSeries(range, groupBy),
        repo.getStatusAndSourceBreakdowns(range),
      ]);
      return {
        range,
        groupBy,
        kpi,
        series,
        byStatus: breakdowns.byStatus,
        bySource: breakdowns.bySource,
      };
    },

    async getOrdersReport(input: DateRangeInput = {}): Promise<AdminOrdersReportDto> {
      const range = resolveReportDateRange(input, nowFn());
      const [kpi, rows] = await Promise.all([
        repo.getPeriodKpi(range),
        repo.getOrderReportRows(range),
      ]);
      return { range, kpi, rows };
    },

    async getTopModelsReport(
      input: DateRangeInput & { limit?: number } = {}
    ): Promise<AdminTopModelsReportDto> {
      const range = resolveReportDateRange(input, nowFn());
      const limit = input.limit ?? 20;
      const items = await repo.getTopModels(range, limit);
      const totalQty = items.reduce((sum, i) => sum + i.totalQty, 0);
      const totalRevenue = items.reduce((sum, i) => sum + i.totalRevenue, 0);
      return { range, totalQty, totalRevenue, items };
    },

    async getTopCustomersReport(
      input: DateRangeInput & { limit?: number } = {}
    ): Promise<AdminTopCustomersReportDto> {
      const range = resolveReportDateRange(input, nowFn());
      const limit = input.limit ?? 50;
      const items = await repo.getTopCustomers(range, limit);
      return { range, items };
    },

    async exportReportCsv(input: {
      type: ReportExportType;
      range: DateRangeInput;
      groupBy?: ReportGroupBy;
      limit?: number;
    }): Promise<{ filename: string; csv: string }> {
      const resolvedRange = resolveReportDateRange(input.range, nowFn());
      const suffix = buildRangeFileSuffix(resolvedRange);

      if (input.type === 'sales') {
        const groupBy: ReportGroupBy = input.groupBy === 'month' ? 'month' : 'day';
        const series = await repo.getSalesSeries(resolvedRange, groupBy);
        const csv = buildCsvDocument(
          [
            'Periode',
            'Jumlah Order',
            'Total Pcs',
            'Pembayaran Terverifikasi (Rp)',
            'Refund (Rp)',
            'Omzet Bersih (Rp)',
          ],
          series.map((s) => [
            s.period,
            s.orderCount,
            s.totalQty,
            s.grossVerified,
            s.refundedAmount,
            s.netRevenue,
          ])
        );
        return { filename: `laporan-penjualan-${suffix}.csv`, csv };
      }

      if (input.type === 'top-models') {
        const items = await repo.getTopModels(resolvedRange, input.limit ?? 50);
        const csv = buildCsvDocument(
          [
            'Peringkat',
            'Model',
            'Jumlah Order',
            'Total Qty (pcs)',
            'Total Omzet (Rp)',
            'Kontribusi (%)',
          ],
          items.map((item, idx) => [
            idx + 1,
            item.modelName,
            item.orderCount,
            item.totalQty,
            item.totalRevenue,
            item.revenueSharePercent,
          ])
        );
        return { filename: `laporan-model-terlaris-${suffix}.csv`, csv };
      }

      if (input.type === 'customers') {
        const items = await repo.getTopCustomers(resolvedRange, input.limit ?? 100);
        const csv = buildCsvDocument(
          [
            'Peringkat',
            'Nama Pelanggan',
            'WhatsApp',
            'Akun Website',
            'Jumlah Order',
            'Total Qty (pcs)',
            'Total Belanja (Rp)',
            'Terverifikasi (Rp)',
            'Sisa Piutang (Rp)',
            'Order Terakhir',
          ],
          items.map((c, idx) => [
            idx + 1,
            c.customerName,
            c.customerWhatsapp,
            c.hasAccount ? 'Ya' : 'Manual / Tanpa Akun',
            c.orderCount,
            c.totalQty,
            c.totalSpent,
            c.verifiedPaid,
            c.outstandingBalance,
            c.lastOrderAt,
          ])
        );
        return { filename: `laporan-pelanggan-${suffix}.csv`, csv };
      }

      const rows = await repo.getOrderReportRows(resolvedRange);
      const csv = buildCsvDocument(
        [
          'Kode Order',
          'Tanggal Dibuat',
          'Sumber',
          'Nama Pelanggan',
          'WhatsApp',
          'Pengiriman',
          'Status Produksi',
          'Total Qty (pcs)',
          'Grand Total (Rp)',
          'Terverifikasi (Rp)',
          'Refund (Rp)',
          'Sisa Tagihan (Rp)',
        ],
        rows.map((r) => [
          r.orderCode,
          r.createdAt,
          r.source,
          r.customerName,
          r.customerWhatsapp,
          getFulfillmentLabel(r.fulfillmentType),
          getProductionStatusLabel(r.productionStatus, r.fulfillmentType ?? FULFILLMENT_TYPE.SHIP),
          r.totalQty,
          r.grandTotal,
          r.verifiedPaid,
          r.refundedAmount,
          r.remainingBalance,
        ])
      );
      return { filename: `laporan-order-${suffix}.csv`, csv };
    },
  };
}

export type AdminReportService = ReturnType<typeof createAdminReportService>;

export const adminReportService = createAdminReportService();

export default adminReportService;
