import {
  FULFILLMENT_LABELS,
  FULFILLMENT_TYPE,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_LABELS,
  getFulfillmentLabel,
  type FulfillmentType,
  type PaymentStatus,
  type ProductionStatus,
} from '@yng/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, DesignBadge, PaymentBadge, ProductionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { adminOrderQueryKeys, listAdminOrders } from '../../services/adminOrderService';
import { formatWibDateTime } from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';

const STATUS_OPTIONS: readonly ProductionStatus[] = [
  PRODUCTION_STATUS.NEW_ORDER,
  PRODUCTION_STATUS.PRINT_QUEUE,
  PRODUCTION_STATUS.PRESSING_QC,
  PRODUCTION_STATUS.AWAITING_SETTLEMENT,
  PRODUCTION_STATUS.SHIPPING,
  PRODUCTION_STATUS.COMPLETED,
  PRODUCTION_STATUS.CANCELLED,
];

const PAYMENT_FILTER_OPTIONS: ReadonlyArray<{ value: PaymentStatus; label: string }> = [
  { value: PAYMENT_STATUS.PENDING, label: 'Menunggu' },
  { value: PAYMENT_STATUS.VERIFIED, label: 'Terverifikasi' },
  { value: PAYMENT_STATUS.REJECTED, label: 'Ditolak' },
];

const FULFILLMENT_OPTIONS: readonly FulfillmentType[] = [
  FULFILLMENT_TYPE.SHIP,
  FULFILLMENT_TYPE.PICKUP,
];

const PAGE_LIMIT = 15;

export default function AdminOrders() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | ''>('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | ''>('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentType | ''>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryParams = {
    status: statusFilter || undefined,
    paymentStatus: paymentFilter || undefined,
    fulfillmentType: fulfillmentFilter || undefined,
    search: debouncedSearch || undefined,
    page,
    limit: PAGE_LIMIT,
  };

  const ordersQuery = useQuery({
    queryKey: adminOrderQueryKeys.list(queryParams),
    queryFn: () => listAdminOrders(queryParams),
  });

  const hasActiveFilter = Boolean(
    searchInput.trim() || statusFilter || paymentFilter || fulfillmentFilter
  );

  function handleResetFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('');
    setPaymentFilter('');
    setFulfillmentFilter('');
    setPage(1);
  }

  const items = ordersQuery.data?.items ?? [];
  const meta = ordersQuery.data?.meta;

  return (
    <div className="w-full min-w-0 space-y-6">
      <section className="rounded-2xl border border-line bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Ruang Produksi · Arsip &amp; Pencarian</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
              Semua Order
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Cari pesanan berdasarkan kode 6 karakter, nama pelanggan, atau nomor WhatsApp, lalu
              kelola produksi hingga selesai.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/kanban"
              className="inline-flex min-h-touch items-center rounded-full border border-line-strong bg-white px-4 font-display text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-surface"
            >
              Lihat Kanban
            </Link>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={ordersQuery.isFetching}
              onClick={() => void ordersQuery.refetch()}
            >
              Muat Ulang
            </Button>
          </div>
        </div>

        <div className="mt-6 grid w-full grid-cols-1 gap-3 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-4">
            <Input
              label="Pencarian"
              placeholder="Kode order, nama, atau no. WA..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <div className="min-w-0 lg:col-span-3">
            <Select
              label="Status Produksi"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as ProductionStatus | '');
                setPage(1);
              }}
            >
              <option value="">Semua Status Produksi</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {PRODUCTION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <Select
              label="Status Pembayaran"
              value={paymentFilter}
              onChange={(event) => {
                setPaymentFilter(event.target.value as PaymentStatus | '');
                setPage(1);
              }}
            >
              <option value="">Semua Pembayaran</option>
              {PAYMENT_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <Select
              label="Pengiriman"
              value={fulfillmentFilter}
              onChange={(event) => {
                setFulfillmentFilter(event.target.value as FulfillmentType | '');
                setPage(1);
              }}
            >
              <option value="">Semua Metode</option>
              {FULFILLMENT_OPTIONS.map((ft) => (
                <option key={ft} value={ft}>
                  {FULFILLMENT_LABELS[ft]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end lg:col-span-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!hasActiveFilter}
              onClick={handleResetFilters}
              className="w-full"
            >
              Reset
            </Button>
          </div>
        </div>
      </section>

      {ordersQuery.isLoading ? (
        <div className="flex min-h-60 items-center justify-center rounded-2xl border border-line bg-white p-10">
          <Spinner label="Memuat daftar pesanan admin..." />
        </div>
      ) : ordersQuery.isError ? (
        <ErrorState
          title="Gagal Memuat Daftar Order"
          message={
            extractApiError(ordersQuery.error, 'Tidak dapat mengambil data pesanan.').message
          }
          retry={() => void ordersQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Tidak ada pesanan ditemukan"
          description={
            hasActiveFilter
              ? 'Tidak ada pesanan yang cocok dengan filter saat ini.'
              : 'Belum ada pesanan masuk pada sistem.'
          }
          action={
            hasActiveFilter ? (
              <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                Reset Filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Kartu Mobile (360px+) */}
          <div className="grid w-full grid-cols-1 gap-3 lg:hidden">
            {items.map((order) => (
              <article
                key={order.transactionUuid}
                className="w-full min-w-0 rounded-2xl border border-line bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/admin/orders/${order.transactionUuid}`}
                      className="font-mono text-sm font-bold tracking-wider text-ink tabular-nums underline-offset-4 hover:underline"
                    >
                      #{order.orderCode}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatWibDateTime(order.createdAt)}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-xs font-medium text-ink tabular-nums">
                    {order.totalQty} pcs
                  </span>
                </div>

                <div className="mt-3 border-t border-line pt-3">
                  <p className="truncate font-display text-sm font-semibold text-ink">
                    {order.customerName}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted tabular-nums">
                    {order.customerWhatsapp} · {getFulfillmentLabel(order.fulfillmentType)}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <ProductionBadge
                    status={order.productionStatus}
                    fulfillmentType={order.fulfillmentType}
                  />
                  <DesignBadge status={order.designStatus} />
                  {order.initialPaymentStatus ? (
                    <PaymentBadge
                      status={order.initialPaymentStatus}
                      proofImagePath={order.initialPaymentHasProof ? 'has-proof' : null}
                    />
                  ) : null}
                  {order.hasPendingProof ? (
                    <Badge variant="warn" dot>
                      Bukti Pending
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
                  <div>
                    <p className="tabular-price text-sm font-semibold text-ink">
                      {formatRupiah(order.grandTotal)}
                    </p>
                    <p className="tabular-price text-xs text-muted">
                      Sisa: {formatRupiah(order.remainingBalance)}
                    </p>
                  </div>

                  <Link
                    to={`/admin/orders/${order.transactionUuid}`}
                    className="inline-flex min-h-touch items-center rounded-full bg-ink px-4 font-display text-xs font-semibold text-white transition-colors hover:bg-neutral-800"
                  >
                    Detail
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {/* Tabel Desktop */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-white lg:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-xs font-semibold tracking-wide text-muted uppercase">
                    <th className="px-4 py-3.5">Order</th>
                    <th className="px-4 py-3.5">Pelanggan</th>
                    <th className="px-4 py-3.5">Qty / Metode</th>
                    <th className="px-4 py-3.5">Status Produksi &amp; Desain</th>
                    <th className="px-4 py-3.5">Pembayaran</th>
                    <th className="px-4 py-3.5 text-right">Total &amp; Sisa</th>
                    <th className="px-4 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((order) => (
                    <tr key={order.transactionUuid} className="hover:bg-surface/60">
                      <td className="px-4 py-4 align-top">
                        <Link
                          to={`/admin/orders/${order.transactionUuid}`}
                          className="font-mono text-sm font-bold tracking-wider text-ink tabular-nums underline-offset-4 hover:underline"
                        >
                          #{order.orderCode}
                        </Link>
                        <p className="mt-1 text-xs text-muted tabular-nums">
                          {formatWibDateTime(order.createdAt)}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-display font-semibold text-ink">{order.customerName}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted tabular-nums">
                          {order.customerWhatsapp}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-mono text-xs font-semibold text-ink tabular-nums">
                          {order.totalQty} pcs
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {getFulfillmentLabel(order.fulfillmentType)}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <ProductionBadge
                            status={order.productionStatus}
                            fulfillmentType={order.fulfillmentType}
                          />
                          <DesignBadge status={order.designStatus} />
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {order.initialPaymentStatus ? (
                            <PaymentBadge
                              status={order.initialPaymentStatus}
                              proofImagePath={order.initialPaymentHasProof ? 'has-proof' : null}
                            />
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                          {order.hasPendingProof ? (
                            <Badge variant="warn" dot>
                              Bukti Pending
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right align-top">
                        <p className="tabular-price font-semibold text-ink">
                          {formatRupiah(order.grandTotal)}
                        </p>
                        <p
                          className={`tabular-price mt-0.5 text-xs ${
                            order.remainingBalance > 0 ? 'text-status-warn' : 'text-status-ok'
                          }`}
                        >
                          {order.remainingBalance > 0
                            ? `Sisa ${formatRupiah(order.remainingBalance)}`
                            : 'Lunas'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right align-top">
                        <Link
                          to={`/admin/orders/${order.transactionUuid}`}
                          className="inline-flex min-h-touch items-center rounded-full border border-ink px-4 font-display text-xs font-semibold text-ink transition-colors hover:bg-ink hover:text-white"
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {meta && meta.totalPages > 1 ? (
            <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-4 sm:flex-row">
              <p className="text-xs text-muted tabular-nums">
                Halaman {meta.page} dari {meta.totalPages} · Total {meta.total} pesanan
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage((prev) => Math.min(meta.totalPages, prev + 1))}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
