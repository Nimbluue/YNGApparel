import { getFulfillmentLabel, type ReportExportType, type ReportGroupBy } from '@yng/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminFeedbackBanner } from '../../components/admin/AdminFeedbackBanner';
import { Badge, ProductionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import { formatWibDate } from '../../services/orderService';
import {
  adminReportQueryKeys,
  downloadAdminReportCsv,
  getAdminDashboard,
  getAdminOrdersReport,
  getAdminSalesReport,
  getAdminTopCustomersReport,
  getAdminTopModelsReport,
  type ReportFilterParams,
} from '../../services/adminReportService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';

type RangePresetKey = '7D' | '30D' | 'THIS_MONTH' | 'ALL';

const REPORT_TABS: ReadonlyArray<{ key: ReportExportType; label: string }> = [
  { key: 'sales', label: 'Penjualan & Sumber' },
  { key: 'top-models', label: 'Model Terlaris' },
  { key: 'customers', label: 'Top Customer' },
  { key: 'orders', label: 'Rincian Order' },
];

function getWibTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftWibDays(isoDate: string, deltaDays: number): string {
  const baseMs = Date.parse(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(baseMs + deltaDays * 86400 * 1000));
}

function buildPresetRange(preset: RangePresetKey): {
  startDate: string;
  endDate: string;
  allTime: boolean;
} {
  const today = getWibTodayIso();
  if (preset === '7D') {
    return { startDate: shiftWibDays(today, -6), endDate: today, allTime: false };
  }
  if (preset === '30D') {
    return { startDate: shiftWibDays(today, -29), endDate: today, allTime: false };
  }
  if (preset === 'THIS_MONTH') {
    return { startDate: `${today.slice(0, 8)}01`, endDate: today, allTime: false };
  }
  return { startDate: '', endDate: '', allTime: true };
}

export default function Reports() {
  const { toast } = useToast();

  const [preset, setPreset] = useState<RangePresetKey | 'CUSTOM'>('30D');
  const [rangeState, setRangeState] = useState(() => buildPresetRange('30D'));
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('day');
  const [activeTab, setActiveTab] = useState<ReportExportType>('sales');
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<{ message: string; details: string[] } | null>(
    null
  );

  const dateInvalid =
    !rangeState.allTime &&
    Boolean(
      rangeState.startDate && rangeState.endDate && rangeState.startDate > rangeState.endDate
    );

  const filters: ReportFilterParams = useMemo(
    () => ({
      startDate: rangeState.allTime ? undefined : rangeState.startDate || undefined,
      endDate: rangeState.allTime ? undefined : rangeState.endDate || undefined,
      allTime: rangeState.allTime,
      groupBy,
    }),
    [rangeState, groupBy]
  );

  const dashboardQuery = useQuery({
    queryKey: adminReportQueryKeys.dashboard(filters),
    queryFn: () => getAdminDashboard(filters),
    enabled: !dateInvalid,
  });

  const salesQuery = useQuery({
    queryKey: adminReportQueryKeys.sales(filters),
    queryFn: () => getAdminSalesReport(filters),
    enabled: !dateInvalid && activeTab === 'sales',
  });

  const topModelsQuery = useQuery({
    queryKey: adminReportQueryKeys.topModels(filters),
    queryFn: () => getAdminTopModelsReport(filters),
    enabled: !dateInvalid && activeTab === 'top-models',
  });

  const customersQuery = useQuery({
    queryKey: adminReportQueryKeys.customers(filters),
    queryFn: () => getAdminTopCustomersReport(filters),
    enabled: !dateInvalid && activeTab === 'customers',
  });

  const ordersQuery = useQuery({
    queryKey: adminReportQueryKeys.orders(filters),
    queryFn: () => getAdminOrdersReport(filters),
    enabled: !dateInvalid && activeTab === 'orders',
  });

  function handleSelectPreset(nextPreset: RangePresetKey) {
    setPreset(nextPreset);
    setRangeState(buildPresetRange(nextPreset));
  }

  async function handleExportCsv() {
    if (dateInvalid) return;
    setExportingCsv(true);
    setExportError(null);
    try {
      const filename = await downloadAdminReportCsv({ type: activeTab, filters });
      toast(`File ${filename} berhasil diunduh.`, 'ok');
    } catch (err: unknown) {
      setExportError(extractApiError(err, 'Gagal mengekspor laporan ke CSV.'));
    } finally {
      setExportingCsv(false);
    }
  }

  function handleRefreshAll() {
    void dashboardQuery.refetch();
    if (activeTab === 'sales') void salesQuery.refetch();
    if (activeTab === 'top-models') void topModelsQuery.refetch();
    if (activeTab === 'customers') void customersQuery.refetch();
    if (activeTab === 'orders') void ordersQuery.refetch();
  }

  const kpi = dashboardQuery.data?.kpi;
  const operational = dashboardQuery.data?.operational;

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Header & Filter Rentang Tanggal */}
      <section className="rounded-sm border border-line bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Ruang Produksi · Analitik Bisnis</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
              Dashboard &amp; Laporan
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Ringkasan omzet terverifikasi bersih (setelah refund), performa model pakaian,
              pelanggan berulang, dan ekspor CSV siap olah.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={dashboardQuery.isFetching}
              onClick={handleRefreshAll}
            >
              Muat Ulang
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={dateInvalid}
              loading={exportingCsv}
              onClick={() => void handleExportCsv()}
            >
              Export CSV (Tab Aktif)
            </Button>
          </div>
        </div>

        {/* Preset Cepat + Input Tanggal */}
        <div className="mt-6 space-y-4 border-t border-line pt-5">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: '7D', label: '7 Hari' },
                { key: '30D', label: '30 Hari' },
                { key: 'THIS_MONTH', label: 'Bulan Ini' },
                { key: 'ALL', label: 'Semua Waktu' },
              ] as const
            ).map((btn) => {
              const isActive = preset === btn.key;
              return (
                <motion.button
                  key={btn.key}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelectPreset(btn.key)}
                  className={`inline-flex min-h-touch items-center rounded-sm border px-4 font-display text-xs font-semibold transition-colors ${
                    isActive
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-[#FAFAFA] text-ink hover:border-ink'
                  }`}
                >
                  {btn.label}
                </motion.button>
              );
            })}
          </div>

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Dari Tanggal"
              type="date"
              disabled={rangeState.allTime}
              value={rangeState.startDate}
              onChange={(e) => {
                setPreset('CUSTOM');
                setRangeState((prev) => ({
                  ...prev,
                  startDate: e.target.value,
                  allTime: false,
                }));
              }}
            />
            <Input
              label="Sampai Tanggal"
              type="date"
              disabled={rangeState.allTime}
              value={rangeState.endDate}
              onChange={(e) => {
                setPreset('CUSTOM');
                setRangeState((prev) => ({
                  ...prev,
                  endDate: e.target.value,
                  allTime: false,
                }));
              }}
            />
            <Select
              label="Kelompok Periode Penjualan"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as ReportGroupBy)}
            >
              <option value="day">Harian (WIB)</option>
              <option value="month">Bulanan (WIB)</option>
            </Select>
          </div>

          {dateInvalid ? (
            <p className="text-xs font-medium text-status-err" role="alert">
              Tanggal mulai tidak boleh lebih besar dari tanggal akhir.
            </p>
          ) : null}
        </div>
      </section>

      {exportError ? (
        <AdminFeedbackBanner
          variant="error"
          message={exportError.message}
          details={exportError.details}
          onDismiss={() => setExportError(null)}
        />
      ) : null}

      {/* Kartu KPI Periode + Snapshot Operasional Live */}
      {dashboardQuery.isLoading ? (
        <div className="flex min-h-40 items-center justify-center rounded-sm border border-line bg-white p-8">
          <Spinner label="Menghitung ringkasan KPI & laporan..." />
        </div>
      ) : dashboardQuery.isError ? (
        <ErrorState
          title="Gagal Memuat Ringkasan Dashboard"
          message={extractApiError(dashboardQuery.error, 'Tidak dapat mengambil data KPI.').message}
          retry={() => void dashboardQuery.refetch()}
        />
      ) : kpi && operational ? (
        <>
          <section className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="rounded-sm border border-ink bg-ink p-4 text-white sm:p-5"
            >
              <p className="text-xs text-neutral-300">Omzet Terverifikasi Bersih</p>
              <p className="tabular-price mt-2 font-display text-2xl font-bold">
                {formatRupiah(kpi.verifiedRevenue)}
              </p>
              <p className="tabular-price mt-1 text-[11px] text-neutral-300">
                Masuk {formatRupiah(kpi.grossVerifiedPayments)} · Refund{' '}
                {formatRupiah(kpi.refundedAmount)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.03 }}
              className="rounded-sm border border-line bg-white p-4 transition-colors hover:border-ink sm:p-5"
            >
              <p className="text-xs text-muted">Total Order Masuk</p>
              <p className="tabular-price mt-2 font-display text-2xl font-bold text-ink">
                {kpi.totalOrders}
              </p>
              <p className="tabular-price mt-1 text-xs text-muted">
                {kpi.totalQty} pcs · {kpi.activeOrders} aktif
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.06 }}
              className="rounded-sm border border-line bg-white p-4 transition-colors hover:border-ink sm:p-5"
            >
              <p className="text-xs text-muted">Order Selesai</p>
              <p className="tabular-price mt-2 font-display text-2xl font-bold text-status-ok">
                {kpi.completedOrders}
              </p>
              <p className="mt-1 text-xs text-muted">Tuntas dikirim / diambil</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.09 }}
              className="rounded-sm border border-line bg-white p-4 transition-colors hover:border-ink sm:p-5"
            >
              <p className="text-xs text-muted">Order Dibatalkan</p>
              <p className="tabular-price mt-2 font-display text-2xl font-bold text-status-err">
                {kpi.cancelledOrders}
              </p>
              <p className="tabular-price mt-1 text-xs text-muted">
                Refund {formatRupiah(kpi.refundedAmount)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.12 }}
              className="rounded-sm border border-line bg-white p-4 transition-colors hover:border-ink sm:p-5"
            >
              <p className="text-xs text-muted">Sisa Piutang Berjalan</p>
              <p className="tabular-price mt-2 font-display text-2xl font-bold text-status-warn">
                {formatRupiah(kpi.outstandingBalance)}
              </p>
              <p className="mt-1 text-xs text-muted">Dari order non-batal</p>
            </motion.div>
          </section>

          {/* Strip Snapshot Operasional Saat Ini */}
          <section className="rounded-sm border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
              <p className="eyebrow">Snapshot Operasional Live</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Link to="/admin/kanban" className="font-semibold text-ink hover:underline">
                  Kanban →
                </Link>
                <Link to="/admin/payments" className="font-semibold text-ink hover:underline">
                  Verifikasi Bayar →
                </Link>
              </div>
            </div>

            <div className="mt-3 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              {[
                { label: 'Order Baru', value: operational.newOrdersCount, warn: false },
                {
                  label: 'Bukti Pending',
                  value: operational.pendingPaymentProofCount,
                  warn: operational.pendingPaymentProofCount > 0,
                },
                { label: 'Siap Cetak', value: operational.readyToProcessCount, warn: false },
                { label: 'Antrean Cetak', value: operational.printQueueCount, warn: false },
                {
                  label: 'Tunggu Lunas',
                  value: operational.awaitingSettlementCount,
                  warn: false,
                },
                {
                  label: 'Terlambat',
                  value: operational.overdueOrdersCount,
                  warn: operational.overdueOrdersCount > 0,
                },
                {
                  label: 'Alamat Kurang',
                  value: operational.incompleteAddressCount,
                  warn: operational.incompleteAddressCount > 0,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-sm border border-line bg-[#FAFAFA] px-3 py-2.5"
                >
                  <p className="text-[11px] text-muted">{stat.label}</p>
                  <p
                    className={`tabular-price mt-0.5 font-display text-lg font-bold ${
                      stat.warn ? 'text-status-warn' : 'text-ink'
                    }`}
                  >
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {/* Navigasi Tab Laporan */}
      <section className="rounded-sm border border-line bg-white p-5 sm:p-6 space-y-5">
        <div
          role="tablist"
          aria-label="Kategori laporan"
          className="flex gap-2 overflow-x-auto border-b border-line pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {REPORT_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex min-h-touch shrink-0 items-center rounded-sm border px-4 font-display text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-[#FAFAFA] text-ink hover:border-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Penjualan & Sumber/Status */}
        {activeTab === 'sales' ? (
          salesQuery.isLoading ? (
            <Spinner label="Memuat rekap penjualan..." />
          ) : salesQuery.isError ? (
            <ErrorState
              title="Gagal Memuat Laporan Penjualan"
              message={extractApiError(salesQuery.error, 'Terjadi kesalahan.').message}
              retry={() => void salesQuery.refetch()}
            />
          ) : salesQuery.data ? (
            <div className="space-y-6">
              {/* Breakdown Sumber & Status */}
              <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-sm border border-line bg-[#FAFAFA] p-4 space-y-3">
                  <h2 className="font-display text-sm font-bold text-ink">Distribusi Sumber</h2>
                  {salesQuery.data.bySource.length === 0 ? (
                    <p className="text-xs text-muted">Belum ada order pada periode ini.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {salesQuery.data.bySource.map((src) => {
                        const pct =
                          salesQuery.data.kpi.totalOrders > 0
                            ? Math.round((src.orderCount / salesQuery.data.kpi.totalOrders) * 100)
                            : 0;
                        return (
                          <div key={src.source} className="space-y-1 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-ink">{src.source}</span>
                              <span className="tabular-price text-muted">
                                {src.orderCount} order · {src.totalQty} pcs ·{' '}
                                {formatRupiah(src.grandTotal)}
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-sm bg-white">
                              <div
                                className="h-full rounded-sm bg-ink"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-sm border border-line bg-[#FAFAFA] p-4 space-y-3">
                  <h2 className="font-display text-sm font-bold text-ink">
                    Distribusi Status Produksi
                  </h2>
                  {salesQuery.data.byStatus.length === 0 ? (
                    <p className="text-xs text-muted">Belum ada order pada periode ini.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {salesQuery.data.byStatus.map((st) => (
                        <div
                          key={st.status}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-white px-3 py-2 text-xs"
                        >
                          <ProductionBadge status={st.status} />
                          <span className="tabular-price font-medium text-ink">
                            {st.orderCount} order · {st.totalQty} pcs ·{' '}
                            {formatRupiah(st.grandTotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tabel Rekap Harian / Bulanan */}
              {salesQuery.data.series.length === 0 ? (
                <EmptyState
                  title="Belum ada transaksi penjualan"
                  description="Tidak ditemukan pesanan dalam rentang tanggal ini."
                />
              ) : (
                <>
                  <div className="grid w-full grid-cols-1 gap-3 md:hidden">
                    {salesQuery.data.series.map((row) => (
                      <div
                        key={row.period}
                        className="rounded-sm border border-line bg-[#FAFAFA] p-3.5 text-xs space-y-1.5"
                      >
                        <div className="flex justify-between font-semibold text-ink">
                          <span className="font-mono tabular-nums">{row.period}</span>
                          <span className="tabular-price">{formatRupiah(row.netRevenue)}</span>
                        </div>
                        <p className="tabular-price text-muted">
                          {row.orderCount} order · {row.totalQty} pcs · Masuk{' '}
                          {formatRupiah(row.grossVerified)}
                          {row.refundedAmount > 0
                            ? ` · Refund ${formatRupiah(row.refundedAmount)}`
                            : ''}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-line bg-[#FAFAFA] text-xs font-semibold text-muted uppercase">
                          <th className="px-4 py-3">Periode</th>
                          <th className="px-4 py-3 text-right">Order</th>
                          <th className="px-4 py-3 text-right">Total Pcs</th>
                          <th className="px-4 py-3 text-right">Bayar Terverifikasi</th>
                          <th className="px-4 py-3 text-right">Refund</th>
                          <th className="px-4 py-3 text-right">Omzet Bersih</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {salesQuery.data.series.map((row) => (
                          <tr key={row.period} className="hover:bg-[#FAFAFA]">
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-ink tabular-nums">
                              {row.period}
                            </td>
                            <td className="tabular-price px-4 py-3 text-right">{row.orderCount}</td>
                            <td className="tabular-price px-4 py-3 text-right">{row.totalQty}</td>
                            <td className="tabular-price px-4 py-3 text-right">
                              {formatRupiah(row.grossVerified)}
                            </td>
                            <td className="tabular-price px-4 py-3 text-right text-status-err">
                              {formatRupiah(row.refundedAmount)}
                            </td>
                            <td className="tabular-price px-4 py-3 text-right font-bold text-ink">
                              {formatRupiah(row.netRevenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : null
        ) : null}

        {/* Tab 2: Model Terlaris */}
        {activeTab === 'top-models' ? (
          topModelsQuery.isLoading ? (
            <Spinner label="Memuat peringkat model terlaris..." />
          ) : topModelsQuery.isError ? (
            <ErrorState
              title="Gagal Memuat Laporan Model Terlaris"
              message={extractApiError(topModelsQuery.error, 'Terjadi kesalahan.').message}
              retry={() => void topModelsQuery.refetch()}
            />
          ) : topModelsQuery.data && topModelsQuery.data.items.length === 0 ? (
            <EmptyState
              title="Belum ada data penjualan model"
              description="Belum ada item pesanan non-batal pada rentang tanggal yang dipilih."
            />
          ) : topModelsQuery.data ? (
            <>
              <div className="grid w-full grid-cols-1 gap-3 md:hidden">
                {topModelsQuery.data.items.map((item, idx) => (
                  <div
                    key={item.modelId}
                    className="rounded-sm border border-line bg-[#FAFAFA] p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold text-ink">
                        #{idx + 1} · {item.modelName}
                      </span>
                      <Badge variant="neutral">{item.revenueSharePercent}%</Badge>
                    </div>
                    <p className="tabular-price text-muted">
                      {item.totalQty} pcs · {item.orderCount} order ·{' '}
                      <strong className="text-ink">{formatRupiah(item.totalRevenue)}</strong>
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-[#FAFAFA] text-xs font-semibold text-muted uppercase">
                      <th className="px-4 py-3">Peringkat</th>
                      <th className="px-4 py-3">Model Pakaian</th>
                      <th className="px-4 py-3 text-right">Order</th>
                      <th className="px-4 py-3 text-right">Qty (Pcs)</th>
                      <th className="px-4 py-3 text-right">Total Subtotal</th>
                      <th className="px-4 py-3 text-right">Kontribusi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {topModelsQuery.data.items.map((item, idx) => (
                      <tr key={item.modelId} className="hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-ink tabular-nums">
                          #{idx + 1}
                        </td>
                        <td className="px-4 py-3 font-display font-semibold text-ink">
                          {item.modelName}
                        </td>
                        <td className="tabular-price px-4 py-3 text-right">{item.orderCount}</td>
                        <td className="tabular-price px-4 py-3 text-right font-semibold text-ink">
                          {item.totalQty}
                        </td>
                        <td className="tabular-price px-4 py-3 text-right font-bold text-ink">
                          {formatRupiah(item.totalRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-sm bg-[#FAFAFA]">
                              <span
                                className="block h-full rounded-sm bg-ink"
                                style={{ width: `${Math.min(100, item.revenueSharePercent)}%` }}
                              />
                            </span>
                            <span className="tabular-price font-mono text-xs text-ink">
                              {item.revenueSharePercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null
        ) : null}

        {/* Tab 3: Top Customer */}
        {activeTab === 'customers' ? (
          customersQuery.isLoading ? (
            <Spinner label="Memuat peringkat pelanggan..." />
          ) : customersQuery.isError ? (
            <ErrorState
              title="Gagal Memuat Laporan Pelanggan"
              message={extractApiError(customersQuery.error, 'Terjadi kesalahan.').message}
              retry={() => void customersQuery.refetch()}
            />
          ) : customersQuery.data && customersQuery.data.items.length === 0 ? (
            <EmptyState
              title="Belum ada data pelanggan"
              description="Belum ada transaksi pelanggan non-batal pada rentang tanggal yang dipilih."
            />
          ) : customersQuery.data ? (
            <>
              <div className="grid w-full grid-cols-1 gap-3 md:hidden">
                {customersQuery.data.items.map((c, idx) => (
                  <div
                    key={c.customerWhatsapp}
                    className="rounded-sm border border-line bg-[#FAFAFA] p-4 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold text-ink">
                        #{idx + 1} · {c.customerName}
                      </span>
                      <Badge variant={c.hasAccount ? 'ok' : 'neutral'}>
                        {c.hasAccount ? 'Akun Web' : 'WA/Manual'}
                      </Badge>
                    </div>
                    <p className="font-mono text-muted tabular-nums">{c.customerWhatsapp}</p>
                    <p className="tabular-price text-ink">
                      {c.orderCount} order · {c.totalQty} pcs · Belanja{' '}
                      <strong>{formatRupiah(c.totalSpent)}</strong>
                    </p>
                    <p className="tabular-price text-muted">
                      Order terakhir: {formatWibDate(c.lastOrderAt)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-[#FAFAFA] text-xs font-semibold text-muted uppercase">
                      <th className="px-4 py-3">Pelanggan</th>
                      <th className="px-4 py-3">Tipe</th>
                      <th className="px-4 py-3 text-right">Order</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Total Belanja</th>
                      <th className="px-4 py-3 text-right">Terverifikasi</th>
                      <th className="px-4 py-3 text-right">Sisa Piutang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {customersQuery.data.items.map((c) => (
                      <tr key={c.customerWhatsapp} className="hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3">
                          <p className="font-display font-semibold text-ink">{c.customerName}</p>
                          <p className="font-mono text-xs text-muted tabular-nums">
                            {c.customerWhatsapp} · {formatWibDate(c.lastOrderAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={c.hasAccount ? 'ok' : 'neutral'}>
                            {c.hasAccount ? 'Akun Web' : 'Manual'}
                          </Badge>
                        </td>
                        <td className="tabular-price px-4 py-3 text-right">{c.orderCount}</td>
                        <td className="tabular-price px-4 py-3 text-right">{c.totalQty}</td>
                        <td className="tabular-price px-4 py-3 text-right font-bold text-ink">
                          {formatRupiah(c.totalSpent)}
                        </td>
                        <td className="tabular-price px-4 py-3 text-right text-status-ok">
                          {formatRupiah(c.verifiedPaid)}
                        </td>
                        <td className="tabular-price px-4 py-3 text-right text-status-warn">
                          {formatRupiah(c.outstandingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null
        ) : null}

        {/* Tab 4: Rincian Order Periode */}
        {activeTab === 'orders' ? (
          ordersQuery.isLoading ? (
            <Spinner label="Memuat daftar order periode..." />
          ) : ordersQuery.isError ? (
            <ErrorState
              title="Gagal Memuat Laporan Order"
              message={extractApiError(ordersQuery.error, 'Terjadi kesalahan.').message}
              retry={() => void ordersQuery.refetch()}
            />
          ) : ordersQuery.data && ordersQuery.data.rows.length === 0 ? (
            <EmptyState
              title="Tidak ada pesanan pada periode ini"
              description="Coba perluas rentang tanggal laporan."
            />
          ) : ordersQuery.data ? (
            <>
              <div className="grid w-full grid-cols-1 gap-3 md:hidden">
                {ordersQuery.data.rows.map((r) => (
                  <article
                    key={r.transactionUuid}
                    className="rounded-sm border border-line bg-[#FAFAFA] p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to={`/admin/orders/${r.transactionUuid}`}
                        className="font-mono font-bold text-ink underline"
                      >
                        #{r.orderCode}
                      </Link>
                      <Badge variant="neutral">{r.source}</Badge>
                    </div>
                    <p className="font-semibold text-ink">
                      {r.customerName} · <span className="font-mono">{r.customerWhatsapp}</span>
                    </p>
                    <ProductionBadge
                      status={r.productionStatus}
                      fulfillmentType={r.fulfillmentType}
                    />
                    <p className="tabular-price text-ink">
                      {r.totalQty} pcs · Total <strong>{formatRupiah(r.grandTotal)}</strong> · Masuk{' '}
                      {formatRupiah(r.verifiedPaid)}
                    </p>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-[#FAFAFA] text-xs font-semibold text-muted uppercase">
                      <th className="px-4 py-3">Kode</th>
                      <th className="px-4 py-3">Pelanggan</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Grand Total</th>
                      <th className="px-4 py-3 text-right">Terverifikasi</th>
                      <th className="px-4 py-3 text-right">Sisa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ordersQuery.data.rows.map((r) => (
                      <tr key={r.transactionUuid} className="hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3">
                          <Link
                            to={`/admin/orders/${r.transactionUuid}`}
                            className="font-mono text-xs font-bold text-ink tabular-nums hover:underline"
                          >
                            #{r.orderCode}
                          </Link>
                          <p className="text-[11px] text-muted tabular-nums">
                            {formatWibDate(r.createdAt)} · {r.source} ·{' '}
                            {getFulfillmentLabel(r.fulfillmentType)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-display font-semibold text-ink">{r.customerName}</p>
                          <p className="font-mono text-xs text-muted tabular-nums">
                            {r.customerWhatsapp}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <ProductionBadge
                            status={r.productionStatus}
                            fulfillmentType={r.fulfillmentType}
                          />
                        </td>
                        <td className="tabular-price px-4 py-3 text-right">{r.totalQty}</td>
                        <td className="tabular-price px-4 py-3 text-right font-semibold text-ink">
                          {formatRupiah(r.grandTotal)}
                        </td>
                        <td className="tabular-price px-4 py-3 text-right text-status-ok">
                          {formatRupiah(r.verifiedPaid)}
                        </td>
                        <td className="tabular-price px-4 py-3 text-right text-status-warn">
                          {formatRupiah(r.remainingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null
        ) : null}
      </section>
    </div>
  );
}
