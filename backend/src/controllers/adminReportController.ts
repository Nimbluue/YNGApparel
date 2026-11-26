import type {
  AdminDashboardSummaryDto,
  AdminOrdersReportDto,
  AdminSalesReportDto,
  AdminTopCustomersReportDto,
  AdminTopModelsReportDto,
  ReportExportType,
  ReportGroupBy,
} from '@yng/shared';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import defaultAdminReportService, {
  type AdminReportService,
  type DateRangeInput,
} from '../services/adminReportService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

const optionalIsoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.')
  .optional();

export const reportBaseQuerySchema = z
  .object({
    startDate: optionalIsoDateSchema,
    endDate: optionalIsoDateSchema,
    from: optionalIsoDateSchema,
    to: optionalIsoDateSchema,
    allTime: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    groupBy: z.enum(['day', 'month']).optional(),
    format: z.enum(['json', 'csv']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const reportExportQuerySchema = reportBaseQuerySchema
  .extend({
    type: z.enum(['sales', 'orders', 'top-models', 'customers']).optional().default('orders'),
  })
  .strict();

function extractRangeInput(query: z.infer<typeof reportBaseQuerySchema>): DateRangeInput {
  return {
    startDate: query.startDate ?? query.from,
    endDate: query.endDate ?? query.to,
    allTime: query.allTime,
  };
}

function sendCsvResponse(res: Response, filename: string, csv: string): Response {
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const buf = Buffer.from(csv, 'utf8');
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(buf);
}

/**
 * Controller Dashboard & Laporan Admin (`/api/admin/dashboard` & `/api/admin/reports/*`).
 */
export function createAdminReportController(
  service: AdminReportService = defaultAdminReportService
): {
  getDashboard: RequestHandler;
  getSalesReport: RequestHandler;
  getOrdersReport: RequestHandler;
  getTopModelsReport: RequestHandler;
  getTopCustomersReport: RequestHandler;
  exportCsv: RequestHandler;
} {
  return {
    getDashboard: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.infer<typeof reportBaseQuerySchema>;
      const data = await service.getDashboardSummary(extractRangeInput(q));
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminDashboardSummaryDto>(res, {
        message: 'Ringkasan dashboard admin berhasil dimuat.',
        data,
      });
    }),

    getSalesReport: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.infer<typeof reportBaseQuerySchema>;
      const range = extractRangeInput(q);
      const groupBy: ReportGroupBy = q.groupBy === 'month' ? 'month' : 'day';
      if (q.format === 'csv') {
        const exported = await service.exportReportCsv({ type: 'sales', range, groupBy });
        return sendCsvResponse(res, exported.filename, exported.csv);
      }
      const data = await service.getSalesReport({ ...range, groupBy });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminSalesReportDto>(res, {
        message: 'Laporan penjualan berhasil dimuat.',
        data,
      });
    }),

    getOrdersReport: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.infer<typeof reportBaseQuerySchema>;
      const range = extractRangeInput(q);
      if (q.format === 'csv') {
        const exported = await service.exportReportCsv({ type: 'orders', range });
        return sendCsvResponse(res, exported.filename, exported.csv);
      }
      const data = await service.getOrdersReport(range);
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminOrdersReportDto>(res, {
        message: 'Laporan order berhasil dimuat.',
        data,
      });
    }),

    getTopModelsReport: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.infer<typeof reportBaseQuerySchema>;
      const range = extractRangeInput(q);
      if (q.format === 'csv') {
        const exported = await service.exportReportCsv({
          type: 'top-models',
          range,
          limit: q.limit,
        });
        return sendCsvResponse(res, exported.filename, exported.csv);
      }
      const data = await service.getTopModelsReport({ ...range, limit: q.limit });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminTopModelsReportDto>(res, {
        message: 'Laporan model terlaris berhasil dimuat.',
        data,
      });
    }),

    getTopCustomersReport: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.infer<typeof reportBaseQuerySchema>;
      const range = extractRangeInput(q);
      if (q.format === 'csv') {
        const exported = await service.exportReportCsv({
          type: 'customers',
          range,
          limit: q.limit,
        });
        return sendCsvResponse(res, exported.filename, exported.csv);
      }
      const data = await service.getTopCustomersReport({ ...range, limit: q.limit });
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess<AdminTopCustomersReportDto>(res, {
        message: 'Laporan pelanggan teratas berhasil dimuat.',
        data,
      });
    }),

    exportCsv: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.infer<typeof reportExportQuerySchema>;
      const exported = await service.exportReportCsv({
        type: q.type as ReportExportType,
        range: extractRangeInput(q),
        groupBy: q.groupBy,
        limit: q.limit,
      });
      return sendCsvResponse(res, exported.filename, exported.csv);
    }),
  };
}
