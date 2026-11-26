import {
  FULFILLMENT_TYPE,
  PRODUCTION_STATUS,
  getProductionStatusLabel,
  type AdminOperationalSnapshotDto,
  type AdminOrderReportRowDto,
  type AdminReportKpiDto,
  type AdminSourceBreakdownDto,
  type AdminStatusBreakdownDto,
  type AdminTopCustomerItemDto,
  type AdminTopModelItemDto,
  type FulfillmentType,
  type OrderSource,
  type ProductionStatus,
  type ReportGroupBy,
  type Rupiah,
} from '@yng/shared';
import { query } from '../config/database.js';

export interface ReportDateRangeFilter {
  startDate: string | null;
  endDate: string | null;
  allTime: boolean;
}

export interface SalesSeriesRow {
  period: string;
  orderCount: number;
  totalQty: number;
  grossVerified: Rupiah;
  refundedAmount: Rupiah;
  netRevenue: Rupiah;
}

export interface AdminReportRepository {
  getOperationalSnapshot(): Promise<AdminOperationalSnapshotDto>;
  getPeriodKpi(range: ReportDateRangeFilter): Promise<AdminReportKpiDto>;
  getSalesSeries(range: ReportDateRangeFilter, groupBy: ReportGroupBy): Promise<SalesSeriesRow[]>;
  getStatusAndSourceBreakdowns(range: ReportDateRangeFilter): Promise<{
    byStatus: AdminStatusBreakdownDto[];
    bySource: AdminSourceBreakdownDto[];
  }>;
  getOrderReportRows(range: ReportDateRangeFilter): Promise<AdminOrderReportRowDto[]>;
  getTopModels(range: ReportDateRangeFilter, limit: number): Promise<AdminTopModelItemDto[]>;
  getTopCustomers(range: ReportDateRangeFilter, limit: number): Promise<AdminTopCustomerItemDto[]>;
}

export interface AdminReportModelDeps {
  query?: typeof query;
}

function buildCreatedAtRangeWhere(
  range: ReportDateRangeFilter,
  columnAlias = 'o.created_at',
  initialParams: unknown[] = []
): { clause: string; params: unknown[] } {
  const params = [...initialParams];
  if (range.allTime || (!range.startDate && !range.endDate)) {
    return { clause: 'TRUE', params };
  }

  const conditions: string[] = [];
  if (range.startDate) {
    params.push(range.startDate);
    conditions.push(
      `${columnAlias} >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Jakarta')`
    );
  }
  if (range.endDate) {
    params.push(range.endDate);
    conditions.push(
      `${columnAlias} < (($${params.length}::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Jakarta')`
    );
  }

  return {
    clause: conditions.length > 0 ? conditions.join(' AND ') : 'TRUE',
    params,
  };
}

/**
 * Repository query laporan & dashboard admin (raw SQL PostgreSQL dengan batas waktu eksplisit Asia/Jakarta).
 */
export function createAdminReportModel(deps: AdminReportModelDeps = {}): AdminReportRepository {
  const dbQuery = deps.query ?? query;

  return {
    async getOperationalSnapshot(): Promise<AdminOperationalSnapshotDto> {
      const res = await dbQuery<{
        new_orders_count: number;
        pending_payment_proof_count: number;
        ready_to_process_count: number;
        print_queue_count: number;
        awaiting_settlement_count: number;
        overdue_orders_count: number;
        incomplete_address_count: number;
      }>(`
        SELECT
          (SELECT COUNT(*)::int FROM orders WHERE production_status = 'NEW_ORDER') AS new_orders_count,
          (SELECT COUNT(*)::int FROM payments WHERE status = 'PENDING' AND proof_image_path IS NOT NULL) AS pending_payment_proof_count,
          (
            SELECT COUNT(*)::int
            FROM orders o
            WHERE o.production_status = 'NEW_ORDER'
              AND o.design_status = 'APPROVED'
              AND EXISTS (
                SELECT 1
                FROM payments p
                WHERE p.order_id = o.id
                  AND p.status = 'VERIFIED'
                  AND p.payment_stage = CASE
                    WHEN o.payment_scheme = 'DP' THEN 'DP'::payment_stage_t
                    ELSE 'FULL'::payment_stage_t
                  END
              )
          ) AS ready_to_process_count,
          (SELECT COUNT(*)::int FROM orders WHERE production_status = 'PRINT_QUEUE') AS print_queue_count,
          (SELECT COUNT(*)::int FROM orders WHERE production_status = 'AWAITING_SETTLEMENT') AS awaiting_settlement_count,
          (
            SELECT COUNT(*)::int
            FROM orders
            WHERE production_status NOT IN ('COMPLETED', 'CANCELLED')
              AND estimated_finish_date IS NOT NULL
              AND estimated_finish_date < (NOW() AT TIME ZONE 'Asia/Jakarta')::date
          ) AS overdue_orders_count,
          (
            SELECT COUNT(*)::int
            FROM orders
            WHERE production_status NOT IN ('COMPLETED', 'CANCELLED')
              AND fulfillment_type = 'SHIP'
              AND (
                NULLIF(BTRIM(COALESCE(province_name, '')), '') IS NULL
                OR NULLIF(BTRIM(COALESCE(city_name, '')), '') IS NULL
                OR NULLIF(BTRIM(COALESCE(district_name, '')), '') IS NULL
                OR NULLIF(BTRIM(COALESCE(postal_code, '')), '') IS NULL
                OR NULLIF(BTRIM(COALESCE(full_address, '')), '') IS NULL
              )
          ) AS incomplete_address_count
      `);

      const row = res.rows[0];
      return {
        newOrdersCount: Number(row?.new_orders_count ?? 0),
        pendingPaymentProofCount: Number(row?.pending_payment_proof_count ?? 0),
        readyToProcessCount: Number(row?.ready_to_process_count ?? 0),
        printQueueCount: Number(row?.print_queue_count ?? 0),
        awaitingSettlementCount: Number(row?.awaiting_settlement_count ?? 0),
        overdueOrdersCount: Number(row?.overdue_orders_count ?? 0),
        incompleteAddressCount: Number(row?.incomplete_address_count ?? 0),
      };
    },

    async getPeriodKpi(range: ReportDateRangeFilter): Promise<AdminReportKpiDto> {
      const { clause, params } = buildCreatedAtRangeWhere(range, 'o.created_at');

      const res = await dbQuery<{
        total_orders: number;
        active_orders: number;
        completed_orders: number;
        cancelled_orders: number;
        total_qty: number;
        outstanding_balance: number;
        gross_verified_payments: number;
        refunded_amount: number;
      }>(
        `
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE o.production_status NOT IN ('COMPLETED', 'CANCELLED'))::int AS active_orders,
          COUNT(*) FILTER (WHERE o.production_status = 'COMPLETED')::int AS completed_orders,
          COUNT(*) FILTER (WHERE o.production_status = 'CANCELLED')::int AS cancelled_orders,
          COALESCE(SUM(o.total_qty) FILTER (WHERE o.production_status <> 'CANCELLED'), 0)::int AS total_qty,
          COALESCE(SUM(o.remaining_balance) FILTER (WHERE o.production_status <> 'CANCELLED'), 0)::bigint AS outstanding_balance,
          COALESCE(SUM(COALESCE(vp.verified_sum, 0)), 0)::bigint AS gross_verified_payments,
          COALESCE(SUM(o.refunded_amount), 0)::bigint AS refunded_amount
        FROM orders o
        LEFT JOIN (
          SELECT order_id, COALESCE(SUM(amount), 0)::bigint AS verified_sum
          FROM payments
          WHERE status = 'VERIFIED'
          GROUP BY order_id
        ) vp ON vp.order_id = o.id
        WHERE ${clause}
        `,
        params
      );

      const row = res.rows[0];
      const grossVerified = Number(row?.gross_verified_payments ?? 0);
      const refundedAmount = Number(row?.refunded_amount ?? 0);

      return {
        verifiedRevenue: grossVerified - refundedAmount,
        grossVerifiedPayments: grossVerified,
        refundedAmount,
        totalOrders: Number(row?.total_orders ?? 0),
        activeOrders: Number(row?.active_orders ?? 0),
        completedOrders: Number(row?.completed_orders ?? 0),
        cancelledOrders: Number(row?.cancelled_orders ?? 0),
        totalQty: Number(row?.total_qty ?? 0),
        outstandingBalance: Number(row?.outstanding_balance ?? 0),
      };
    },

    async getSalesSeries(
      range: ReportDateRangeFilter,
      groupBy: ReportGroupBy
    ): Promise<SalesSeriesRow[]> {
      const { clause, params } = buildCreatedAtRangeWhere(range, 'o.created_at');
      const truncUnit = groupBy === 'month' ? 'month' : 'day';
      const dateFormat = groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';

      const res = await dbQuery<{
        period: string;
        order_count: number;
        total_qty: number;
        gross_verified: number;
        refunded_amount: number;
      }>(
        `
        SELECT
          to_char(date_trunc('${truncUnit}', o.created_at AT TIME ZONE 'Asia/Jakarta'), '${dateFormat}') AS period,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(o.total_qty) FILTER (WHERE o.production_status <> 'CANCELLED'), 0)::int AS total_qty,
          COALESCE(SUM(COALESCE(vp.verified_sum, 0)), 0)::bigint AS gross_verified,
          COALESCE(SUM(o.refunded_amount), 0)::bigint AS refunded_amount
        FROM orders o
        LEFT JOIN (
          SELECT order_id, COALESCE(SUM(amount), 0)::bigint AS verified_sum
          FROM payments
          WHERE status = 'VERIFIED'
          GROUP BY order_id
        ) vp ON vp.order_id = o.id
        WHERE ${clause}
        GROUP BY 1
        ORDER BY 1 ASC
        `,
        params
      );

      return res.rows.map((row) => {
        const grossVerified = Number(row.gross_verified ?? 0);
        const refundedAmount = Number(row.refunded_amount ?? 0);
        return {
          period: row.period,
          orderCount: Number(row.order_count ?? 0),
          totalQty: Number(row.total_qty ?? 0),
          grossVerified,
          refundedAmount,
          netRevenue: grossVerified - refundedAmount,
        };
      });
    },

    async getStatusAndSourceBreakdowns(range: ReportDateRangeFilter): Promise<{
      byStatus: AdminStatusBreakdownDto[];
      bySource: AdminSourceBreakdownDto[];
    }> {
      const { clause, params } = buildCreatedAtRangeWhere(range, 'o.created_at');

      const [statusRes, sourceRes] = await Promise.all([
        dbQuery<{
          production_status: ProductionStatus;
          order_count: number;
          total_qty: number;
          grand_total: number;
        }>(
          `
          SELECT
            o.production_status,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(o.total_qty), 0)::int AS total_qty,
            COALESCE(SUM(o.grand_total), 0)::bigint AS grand_total
          FROM orders o
          WHERE ${clause}
          GROUP BY o.production_status
          ORDER BY order_count DESC, o.production_status ASC
          `,
          params
        ),
        dbQuery<{
          source: OrderSource;
          order_count: number;
          total_qty: number;
          grand_total: number;
        }>(
          `
          SELECT
            o.source,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(o.total_qty), 0)::int AS total_qty,
            COALESCE(SUM(o.grand_total), 0)::bigint AS grand_total
          FROM orders o
          WHERE ${clause}
          GROUP BY o.source
          ORDER BY order_count DESC, o.source ASC
          `,
          params
        ),
      ]);

      return {
        byStatus: statusRes.rows.map((row) => ({
          status: row.production_status,
          label: getProductionStatusLabel(row.production_status, FULFILLMENT_TYPE.SHIP),
          orderCount: Number(row.order_count ?? 0),
          totalQty: Number(row.total_qty ?? 0),
          grandTotal: Number(row.grand_total ?? 0),
        })),
        bySource: sourceRes.rows.map((row) => ({
          source: row.source,
          orderCount: Number(row.order_count ?? 0),
          totalQty: Number(row.total_qty ?? 0),
          grandTotal: Number(row.grand_total ?? 0),
        })),
      };
    },

    async getOrderReportRows(range: ReportDateRangeFilter): Promise<AdminOrderReportRowDto[]> {
      const { clause, params } = buildCreatedAtRangeWhere(range, 'o.created_at');

      const res = await dbQuery<{
        transaction_uuid: string;
        order_code: string;
        created_at: Date | string;
        source: OrderSource;
        customer_name: string;
        customer_whatsapp: string;
        fulfillment_type: FulfillmentType;
        production_status: ProductionStatus;
        total_qty: number;
        grand_total: number;
        verified_paid: number;
        refunded_amount: number;
        remaining_balance: number;
      }>(
        `
        SELECT
          o.transaction_uuid,
          o.order_code,
          o.created_at,
          o.source,
          o.customer_name,
          o.customer_whatsapp,
          o.fulfillment_type,
          o.production_status,
          o.total_qty,
          o.grand_total,
          COALESCE(vp.verified_sum, 0)::bigint AS verified_paid,
          o.refunded_amount,
          o.remaining_balance
        FROM orders o
        LEFT JOIN (
          SELECT order_id, COALESCE(SUM(amount), 0)::bigint AS verified_sum
          FROM payments
          WHERE status = 'VERIFIED'
          GROUP BY order_id
        ) vp ON vp.order_id = o.id
        WHERE ${clause}
        ORDER BY o.created_at DESC
        LIMIT 5000
        `,
        params
      );

      return res.rows.map((row) => ({
        transactionUuid: row.transaction_uuid,
        orderCode: row.order_code,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : new Date(row.created_at).toISOString(),
        source: row.source,
        customerName: row.customer_name,
        customerWhatsapp: row.customer_whatsapp,
        fulfillmentType: row.fulfillment_type,
        productionStatus: row.production_status,
        totalQty: Number(row.total_qty ?? 0),
        grandTotal: Number(row.grand_total ?? 0),
        verifiedPaid: Number(row.verified_paid ?? 0),
        refundedAmount: Number(row.refunded_amount ?? 0),
        remainingBalance: Number(row.remaining_balance ?? 0),
      }));
    },

    async getTopModels(
      range: ReportDateRangeFilter,
      limit: number
    ): Promise<AdminTopModelItemDto[]> {
      const { clause, params } = buildCreatedAtRangeWhere(range, 'o.created_at');
      params.push(limit);
      const limitIdx = params.length;

      const res = await dbQuery<{
        model_id: number;
        model_name: string;
        order_count: number;
        total_qty: number;
        total_revenue: number;
      }>(
        `
        SELECT
          oi.model_id,
          MAX(oi.model_name) AS model_name,
          COUNT(DISTINCT oi.order_id)::int AS order_count,
          COALESCE(SUM(oi.item_qty), 0)::int AS total_qty,
          COALESCE(SUM(oi.line_subtotal), 0)::bigint AS total_revenue
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        WHERE o.production_status <> '${PRODUCTION_STATUS.CANCELLED}'
          AND ${clause}
        GROUP BY oi.model_id
        ORDER BY total_qty DESC, total_revenue DESC, model_name ASC
        LIMIT $${limitIdx}
        `,
        params
      );

      const grandModelRevenue = res.rows.reduce((sum, r) => sum + Number(r.total_revenue ?? 0), 0);

      return res.rows.map((row) => {
        const rev = Number(row.total_revenue ?? 0);
        const share = grandModelRevenue > 0 ? Math.round((rev / grandModelRevenue) * 1000) / 10 : 0;
        return {
          modelId: Number(row.model_id),
          modelName: row.model_name,
          orderCount: Number(row.order_count ?? 0),
          totalQty: Number(row.total_qty ?? 0),
          totalRevenue: rev,
          revenueSharePercent: share,
        };
      });
    },

    async getTopCustomers(
      range: ReportDateRangeFilter,
      limit: number
    ): Promise<AdminTopCustomerItemDto[]> {
      const { clause, params } = buildCreatedAtRangeWhere(range, 'o.created_at');
      params.push(limit);
      const limitIdx = params.length;

      const res = await dbQuery<{
        customer_whatsapp: string;
        customer_name: string;
        has_account: boolean;
        order_count: number;
        total_qty: number;
        total_spent: number;
        verified_paid: number;
        outstanding_balance: number;
        last_order_at: Date | string;
      }>(
        `
        SELECT
          o.customer_whatsapp,
          (ARRAY_AGG(o.customer_name ORDER BY o.created_at DESC))[1] AS customer_name,
          BOOL_OR(o.user_id IS NOT NULL) AS has_account,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(o.total_qty), 0)::int AS total_qty,
          COALESCE(SUM(o.grand_total), 0)::bigint AS total_spent,
          COALESCE(SUM(COALESCE(vp.verified_sum, 0)), 0)::bigint AS verified_paid,
          COALESCE(SUM(o.remaining_balance), 0)::bigint AS outstanding_balance,
          MAX(o.created_at) AS last_order_at
        FROM orders o
        LEFT JOIN (
          SELECT order_id, COALESCE(SUM(amount), 0)::bigint AS verified_sum
          FROM payments
          WHERE status = 'VERIFIED'
          GROUP BY order_id
        ) vp ON vp.order_id = o.id
        WHERE o.production_status <> '${PRODUCTION_STATUS.CANCELLED}'
          AND ${clause}
        GROUP BY o.customer_whatsapp
        ORDER BY total_spent DESC, order_count DESC, o.customer_whatsapp ASC
        LIMIT $${limitIdx}
        `,
        params
      );

      return res.rows.map((row) => ({
        customerWhatsapp: row.customer_whatsapp,
        customerName: row.customer_name,
        hasAccount: Boolean(row.has_account),
        orderCount: Number(row.order_count ?? 0),
        totalQty: Number(row.total_qty ?? 0),
        totalSpent: Number(row.total_spent ?? 0),
        verifiedPaid: Number(row.verified_paid ?? 0),
        outstandingBalance: Number(row.outstanding_balance ?? 0),
        lastOrderAt:
          row.last_order_at instanceof Date
            ? row.last_order_at.toISOString()
            : new Date(row.last_order_at).toISOString(),
      }));
    },
  };
}

export const adminReportModel: AdminReportRepository = createAdminReportModel();

export default adminReportModel;
