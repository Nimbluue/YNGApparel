import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  FULFILLMENT_TYPE,
  ORDER_SOURCE,
  PRODUCTION_STATUS,
  USER_ROLE,
  type AdminDashboardSummaryDto,
  type AdminSalesReportDto,
  type AdminTopCustomersReportDto,
  type AdminTopModelsReportDto,
} from '@yng/shared';
import express, { type RequestHandler } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AdminReportRepository,
  ReportDateRangeFilter,
} from '../src/models/adminReportModel.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { errorHandler, notFoundHandler } = await import('../src/middleware/errorHandler.js');
const { createAdminRouter } = await import('../src/routes/adminRoutes.js');
const { createAdminReportService, resolveReportDateRange } =
  await import('../src/services/adminReportService.js');
const { buildCsvDocument, sanitizeCsvCell } = await import('../src/utils/csv.js');

const ADMIN_USER = {
  id: 1,
  userUuid: '99999999-9999-4999-8999-999999999999',
  fullName: 'Solo Admin YNG',
  email: 'admin@yng.test',
  whatsapp: null,
  role: USER_ROLE.ADMIN,
  tokenVersion: 0,
};

const CUSTOMER_USER = {
  id: 55,
  userUuid: '11111111-1111-4111-8111-111111111155',
  fullName: 'Pelanggan Biasa',
  email: 'cust@yng.test',
  whatsapp: '6281234567890',
  role: USER_ROLE.USER,
  tokenVersion: 0,
};

function createReportTestEnv() {
  const capturedRanges: ReportDateRangeFilter[] = [];

  const mockRepo: AdminReportRepository = {
    async getOperationalSnapshot() {
      return {
        newOrdersCount: 3,
        pendingPaymentProofCount: 2,
        readyToProcessCount: 1,
        printQueueCount: 4,
        awaitingSettlementCount: 1,
        overdueOrdersCount: 1,
        incompleteAddressCount: 1,
      };
    },

    async getPeriodKpi(range) {
      capturedRanges.push(range);
      return {
        verifiedRevenue: 2700000, // 3.000.000 - 300.000 refund
        grossVerifiedPayments: 3000000,
        refundedAmount: 300000,
        totalOrders: 5,
        activeOrders: 2,
        completedOrders: 2,
        cancelledOrders: 1,
        totalQty: 50,
        outstandingBalance: 450000,
      };
    },

    async getSalesSeries(range, groupBy) {
      capturedRanges.push(range);
      return [
        {
          period: groupBy === 'month' ? '2026-11' : '2026-11-25',
          orderCount: 5,
          totalQty: 50,
          grossVerified: 3000000,
          refundedAmount: 300000,
          netRevenue: 2700000,
        },
      ];
    },

    async getStatusAndSourceBreakdowns(range) {
      capturedRanges.push(range);
      return {
        byStatus: [
          {
            status: PRODUCTION_STATUS.COMPLETED,
            label: 'SELESAI',
            orderCount: 2,
            totalQty: 30,
            grandTotal: 2100000,
          },
          {
            status: PRODUCTION_STATUS.NEW_ORDER,
            label: 'ORDER MASUK & CEK DESAIN',
            orderCount: 2,
            totalQty: 20,
            grandTotal: 1350000,
          },
        ],
        bySource: [
          {
            source: ORDER_SOURCE.WEBSITE,
            orderCount: 3,
            totalQty: 35,
            grandTotal: 2450000,
          },
          {
            source: ORDER_SOURCE.WHATSAPP,
            orderCount: 2,
            totalQty: 15,
            grandTotal: 1000000,
          },
        ],
      };
    },

    async getOrderReportRows(range) {
      capturedRanges.push(range);
      return [
        {
          transactionUuid: 'aaaaaaaa-6666-4666-8666-000000000001',
          orderCode: 'YNG-RPT001',
          createdAt: '2026-11-25T10:00:00.000Z',
          source: ORDER_SOURCE.WHATSAPP,
          // Simulasi input pelanggan berbahaya untuk menguji CSV formula injection escaping
          customerName: '=CMD("calc"), Budi',
          customerWhatsapp: '6281200001111',
          fulfillmentType: FULFILLMENT_TYPE.SHIP,
          productionStatus: PRODUCTION_STATUS.COMPLETED,
          totalQty: 20,
          grandTotal: 1500000,
          verifiedPaid: 1500000,
          refundedAmount: 0,
          remainingBalance: 0,
        },
      ];
    },

    async getTopModels(range) {
      capturedRanges.push(range);
      return [
        {
          modelId: 1,
          modelName: 'Kaos Oversize Heavyweight',
          orderCount: 4,
          totalQty: 35,
          totalRevenue: 2400000,
          revenueSharePercent: 80,
        },
        {
          modelId: 2,
          modelName: 'Hoodie Boxy Fleece',
          orderCount: 1,
          totalQty: 15,
          totalRevenue: 600000,
          revenueSharePercent: 20,
        },
      ];
    },

    async getTopCustomers(range) {
      capturedRanges.push(range);
      return [
        {
          customerWhatsapp: '6281200001111',
          customerName: '+MaliciousName',
          hasAccount: false,
          orderCount: 2,
          totalQty: 25,
          totalSpent: 1900000,
          verifiedPaid: 1450000,
          outstandingBalance: 450000,
          lastOrderAt: '2026-11-25T10:00:00.000Z',
        },
      ];
    },
  };

  const adminReportService = createAdminReportService({
    reportRepo: mockRepo,
    nowFn: () => new Date('2026-11-26T05:00:00.000Z'), // 2026-11-26 12:00 WIB
  });

  return { capturedRanges, adminReportService };
}

describe('Tahap 6 — Dashboard, Laporan Penjualan/Model/Customer & Export CSV', () => {
  const env = createReportTestEnv();
  let server: http.Server;
  let baseUrl = '';

  const mockAuthMiddleware: RequestHandler = (req, res, next) => {
    const roleHeader = req.header('x-test-role');
    if (roleHeader === 'USER') {
      req.user = CUSTOMER_USER;
      return next();
    }
    if (roleHeader === 'ADMIN') {
      req.user = ADMIN_USER;
      return next();
    }
    return res.status(401).json({ success: false, message: 'Autentikasi diperlukan.', data: null });
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/admin',
      createAdminRouter({
        requireAuthMiddleware: mockAuthMiddleware,
        adminReportService: env.adminReportService,
        imageUploadLimiter: (_req, _res, next) => next(),
      })
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/admin`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe('Proteksi Role ADMIN & Validasi Rentang Tanggal', () => {
    it('menolak Guest (401) dan USER (403) pada seluruh endpoint dashboard & laporan', async () => {
      expect((await fetch(`${baseUrl}/dashboard`)).status).toBe(401);
      expect(
        (await fetch(`${baseUrl}/dashboard`, { headers: { 'x-test-role': 'USER' } })).status
      ).toBe(403);
      expect(
        (await fetch(`${baseUrl}/reports/sales`, { headers: { 'x-test-role': 'USER' } })).status
      ).toBe(403);
      expect(
        (await fetch(`${baseUrl}/reports/export`, { headers: { 'x-test-role': 'USER' } })).status
      ).toBe(403);
    });

    it('resolveReportDateRange mengatur default 30 hari WIB, mendukung allTime & menolak startDate > endDate', () => {
      const now = new Date('2026-11-26T05:00:00.000Z'); // 12:00 WIB
      expect(resolveReportDateRange({}, now)).toEqual({
        startDate: '2026-10-28',
        endDate: '2026-11-26',
        allTime: false,
      });
      expect(resolveReportDateRange({ allTime: true }, now)).toEqual({
        startDate: null,
        endDate: null,
        allTime: true,
      });
      expect(() =>
        resolveReportDateRange({ startDate: '2026-11-28', endDate: '2026-11-20' }, now)
      ).toThrow(/tidak boleh lebih besar/i);
    });
  });

  describe('Endpoint Dashboard & Laporan', () => {
    it('mengembalikan KPI dashboard, sales, top-models, dan customers sesuai rentang tanggal', async () => {
      const dashRes = await fetch(`${baseUrl}/dashboard`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const dashBody = (await dashRes.json()) as { data: AdminDashboardSummaryDto };
      expect(dashRes.status).toBe(200);
      expect(dashBody.data.range).toEqual({
        startDate: '2026-10-28',
        endDate: '2026-11-26',
        allTime: false,
      });
      expect(dashBody.data.kpi.verifiedRevenue).toBe(2700000);
      expect(dashBody.data.kpi.outstandingBalance).toBe(450000);
      expect(dashBody.data.operational.pendingPaymentProofCount).toBe(2);

      const salesRes = await fetch(
        `${baseUrl}/reports/sales?startDate=2026-11-01&endDate=2026-11-26&groupBy=month`,
        { headers: { 'x-test-role': 'ADMIN' } }
      );
      const salesBody = (await salesRes.json()) as { data: AdminSalesReportDto };
      expect(salesRes.status).toBe(200);
      expect(salesBody.data.groupBy).toBe('month');
      expect(salesBody.data.series[0]?.period).toBe('2026-11');
      expect(salesBody.data.bySource).toHaveLength(2);

      const modelsRes = await fetch(`${baseUrl}/reports/top-models?allTime=true`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const modelsBody = (await modelsRes.json()) as { data: AdminTopModelsReportDto };
      expect(modelsRes.status).toBe(200);
      expect(modelsBody.data.range.allTime).toBe(true);
      expect(modelsBody.data.items[0]?.revenueSharePercent).toBe(80);

      const custRes = await fetch(`${baseUrl}/reports/customers?from=2026-11-01&to=2026-11-26`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const custBody = (await custRes.json()) as { data: AdminTopCustomersReportDto };
      expect(custRes.status).toBe(200);
      expect(custBody.data.items[0]?.customerWhatsapp).toBe('6281200001111');

      const badRangeRes = await fetch(
        `${baseUrl}/reports/orders?startDate=2026-11-30&endDate=2026-11-01`,
        { headers: { 'x-test-role': 'ADMIN' } }
      );
      expect(badRangeRes.status).toBe(400);
    });
  });

  describe('Export CSV & Proteksi Formula Injection', () => {
    it('sanitizeCsvCell dan buildCsvDocument menetralkan awalan =, +, -, @, TAB dan kutip ganda', () => {
      expect(sanitizeCsvCell('=SUM(A1:A5)')).toBe(`"'=SUM(A1:A5)"`);
      expect(sanitizeCsvCell('+cmd|calc')).toBe(`"'+cmd|calc"`);
      expect(sanitizeCsvCell('-1+1')).toBe(`"'-1+1"`);
      expect(sanitizeCsvCell('@IMPORTXML')).toBe(`"'@IMPORTXML"`);
      expect(sanitizeCsvCell('  =1+1')).toBe(`"'  =1+1"`);
      expect(sanitizeCsvCell('Biasa "Quote", Test')).toBe(`"Biasa ""Quote"", Test"`);
      expect(sanitizeCsvCell(150000)).toBe('150000');

      const doc = buildCsvDocument(['Nama', 'Nominal'], [['=Evil', 50000]]);
      expect(doc.startsWith('\uFEFFNama,Nominal\r\n')).toBe(true);
      expect(doc).toContain(`"'=Evil",50000`);
    });

    it('GET /api/admin/reports/export dan ?format=csv mengirim text/csv dengan UTF-8 BOM & formula ter-escape', async () => {
      const exportRes = await fetch(
        `${baseUrl}/reports/export?type=orders&startDate=2026-11-01&endDate=2026-11-26`,
        { headers: { 'x-test-role': 'ADMIN' } }
      );
      const rawBuf = Buffer.from(await exportRes.arrayBuffer());
      const csvText = rawBuf.toString('utf8');

      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(exportRes.headers.get('content-disposition')).toBe(
        'attachment; filename="laporan-order-2026-11-01_2026-11-26.csv"'
      );
      expect(exportRes.headers.get('cache-control')).toBe('no-store');
      expect(rawBuf.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      expect(csvText).toContain(`"'=CMD(""calc""), Budi"`);

      const custCsvRes = await fetch(`${baseUrl}/reports/customers?format=csv&allTime=true`, {
        headers: { 'x-test-role': 'ADMIN' },
      });
      const custCsv = await custCsvRes.text();
      expect(custCsvRes.status).toBe(200);
      expect(custCsvRes.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(custCsv).toContain(`"'+MaliciousName"`);
    });
  });
});
