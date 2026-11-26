import {
  DESIGN_STATUS,
  getFulfillmentLabel,
  getProductionStatusLabel,
  type AdminOrderCardDto,
  type ProductionStatus,
} from '@yng/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, DesignBadge, PaymentBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { adminOrderQueryKeys, getAdminKanbanBoard } from '../../services/adminOrderService';
import { formatWibDate } from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';

function orderNeedsAttention(order: AdminOrderCardDto): boolean {
  return (
    order.hasPendingProof ||
    order.designStatus === DESIGN_STATUS.NEED_REVISION ||
    order.addressIncomplete ||
    order.readyToProcess
  );
}

interface KanbanOrderCardProps {
  order: AdminOrderCardDto;
}

function KanbanOrderCard({ order }: KanbanOrderCardProps) {
  return (
    <article className="w-full min-w-0 rounded-sm border border-line bg-white p-3.5 transition-colors hover:border-ink">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/admin/orders/${order.transactionUuid}`}
            className="font-mono text-sm font-bold tracking-wider text-ink tabular-nums underline-offset-4 hover:underline"
          >
            #{order.orderCode}
          </Link>
          <p className="mt-0.5 text-[11px] text-muted tabular-nums">
            {formatWibDate(order.createdAt)} · {order.totalQty} pcs ·{' '}
            {getFulfillmentLabel(order.fulfillmentType)}
          </p>
        </div>

        <span className="shrink-0 rounded-sm border border-line bg-[#FAFAFA] px-2 py-0.5 font-mono text-[10px] font-medium text-ink tabular-nums">
          QC {order.qcPhotoCount}
        </span>
      </div>

      <div className="mt-2.5 border-t border-line pt-2.5">
        <p className="truncate font-display text-sm font-semibold text-ink">{order.customerName}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted tabular-nums">
          {order.customerWhatsapp}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1">
        <DesignBadge status={order.designStatus} />
        {order.initialPaymentStatus ? (
          <PaymentBadge
            status={order.initialPaymentStatus}
            proofImagePath={order.initialPaymentHasProof ? 'has-proof' : null}
          />
        ) : null}
        {order.hasPendingProof ? (
          <Badge variant="warn" dot>
            Bukti Baru
          </Badge>
        ) : null}
        {order.readyToProcess ? (
          <Badge variant="ok" dot>
            Siap Cetak
          </Badge>
        ) : null}
        {order.addressIncomplete ? (
          <Badge variant="err" dot>
            Alamat Belum Lengkap
          </Badge>
        ) : null}
        {order.hasCustomColor ? <Badge variant="neutral">Warna Custom</Badge> : null}
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-line pt-2.5">
        <div className="min-w-0">
          <p className="text-[11px] text-muted">Total</p>
          <p className="tabular-price text-sm font-semibold text-ink">
            {formatRupiah(order.grandTotal)}
          </p>
          {order.remainingBalance > 0 ? (
            <p className="tabular-price text-[11px] font-medium text-status-warn">
              Sisa {formatRupiah(order.remainingBalance)}
            </p>
          ) : (
            <p className="text-[11px] font-medium text-status-ok">Lunas</p>
          )}
        </div>

        <Link
          to={`/admin/orders/${order.transactionUuid}`}
          className="inline-flex min-h-touch shrink-0 items-center rounded-sm border border-ink px-3 font-display text-xs font-semibold text-ink transition-colors hover:bg-ink hover:text-white"
        >
          Detail →
        </Link>
      </div>
    </article>
  );
}

export default function KanbanBoard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [mobileStatus, setMobileStatus] = useState<ProductionStatus | null>(null);

  const kanbanQuery = useQuery({
    queryKey: adminOrderQueryKeys.kanban,
    queryFn: getAdminKanbanBoard,
  });

  const filteredColumns = useMemo(() => {
    const columns = kanbanQuery.data?.columns ?? [];
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return columns.map((col) => {
      const orders = col.orders.filter((order) => {
        if (attentionOnly && !orderNeedsAttention(order)) return false;
        if (!normalizedSearch) return true;
        return (
          order.orderCode.toLowerCase().includes(normalizedSearch) ||
          order.customerName.toLowerCase().includes(normalizedSearch) ||
          order.customerWhatsapp.toLowerCase().includes(normalizedSearch)
        );
      });
      return {
        ...col,
        orders,
        filteredCount: orders.length,
      };
    });
  }, [kanbanQuery.data, searchTerm, attentionOnly]);

  const totalActiveOrders = useMemo(
    () => (kanbanQuery.data?.columns ?? []).reduce((sum, col) => sum + col.count, 0),
    [kanbanQuery.data]
  );

  const activeMobileColumn = useMemo(() => {
    if (filteredColumns.length === 0) return null;
    if (mobileStatus) {
      const matched = filteredColumns.find((col) => col.status === mobileStatus);
      if (matched) return matched;
    }
    return filteredColumns[0] ?? null;
  }, [filteredColumns, mobileStatus]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <section className="rounded-sm border border-line bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Ruang Produksi · Alur Pesanan</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
              Kanban Produksi
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Pantau antrean produksi aktif per tahap, verifikasi pembayaran dan desain, serta akses
              detail SPK dan pengiriman pesanan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/orders/new"
              className="inline-flex min-h-touch items-center rounded-sm border border-ink bg-ink px-4 font-display text-xs font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-neutral-800"
            >
              + Order Manual
            </Link>
            <Link
              to="/admin/payments"
              className="inline-flex min-h-touch items-center rounded-sm border border-line-strong bg-white px-4 font-display text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA]"
            >
              Antrean Pembayaran
            </Link>
            <Link
              to="/admin/orders"
              className="inline-flex min-h-touch items-center rounded-sm border border-line-strong bg-white px-4 font-display text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA]"
            >
              Semua Order
            </Link>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={kanbanQuery.isFetching}
              onClick={() => void kanbanQuery.refetch()}
            >
              Muat Ulang
            </Button>
          </div>
        </div>

        {kanbanQuery.data ? (
          <div className="mt-6 grid w-full grid-cols-3 gap-2.5 border-t border-line pt-5 sm:gap-4">
            <div className="rounded-sm border border-line bg-[#FAFAFA] p-3 sm:p-4">
              <p className="text-xs text-muted">Aktif Produksi</p>
              <p className="tabular-price mt-1 font-display text-xl font-bold text-ink sm:text-2xl">
                {totalActiveOrders}
              </p>
            </div>
            <div className="rounded-sm border border-line bg-[#FAFAFA] p-3 sm:p-4">
              <p className="text-xs text-muted">Selesai</p>
              <p className="tabular-price mt-1 font-display text-xl font-bold text-status-ok sm:text-2xl">
                {kanbanQuery.data.archivedCounts.completed}
              </p>
            </div>
            <div className="rounded-sm border border-line bg-[#FAFAFA] p-3 sm:p-4">
              <p className="text-xs text-muted">Dibatalkan</p>
              <p className="tabular-price mt-1 font-display text-xl font-bold text-muted sm:text-2xl">
                {kanbanQuery.data.archivedCounts.cancelled}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              aria-label="Cari pesanan di papan Kanban"
              placeholder="Cari kode order, nama, atau WhatsApp..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <label className="inline-flex min-h-touch cursor-pointer items-center gap-2.5 rounded-sm border border-line bg-[#FAFAFA] px-4 py-2 text-xs font-semibold text-ink">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(event) => setAttentionOnly(event.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <span>Hanya Perlu Perhatian</span>
          </label>
        </div>
      </section>

      {kanbanQuery.isLoading ? (
        <div className="flex min-h-60 items-center justify-center rounded-sm border border-line bg-white p-10">
          <Spinner label="Memuat papan Kanban produksi..." />
        </div>
      ) : kanbanQuery.isError ? (
        <ErrorState
          title="Gagal Memuat Papan Kanban"
          message={extractApiError(kanbanQuery.error, 'Tidak dapat memuat antrean Kanban.').message}
          retry={() => void kanbanQuery.refetch()}
        />
      ) : filteredColumns.length === 0 ? (
        <EmptyState
          title="Belum ada kolom Kanban"
          description="Data tahap produksi belum tersedia."
        />
      ) : (
        <>
          {/* Tampilan Mobile / Tablet Kecil (< 1024px) — Tab tahap + daftar vertikal penuh */}
          <section className="space-y-4 lg:hidden">
            <div
              role="tablist"
              aria-label="Tahap produksi Kanban"
              className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {filteredColumns.map((column) => {
                const isActive = activeMobileColumn?.status === column.status;
                return (
                  <button
                    key={column.status}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setMobileStatus(column.status)}
                    className={`inline-flex min-h-touch shrink-0 items-center gap-2 rounded-sm border px-4 py-2 font-display text-xs font-semibold transition-colors ${
                      isActive
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-white text-ink hover:border-ink'
                    }`}
                  >
                    <span className="whitespace-nowrap">
                      {column.label || getProductionStatusLabel(column.status)}
                    </span>
                    <span
                      className={`rounded-sm px-2 py-0.5 font-mono text-[11px] tabular-nums ${
                        isActive ? 'bg-white text-ink' : 'bg-surface text-muted'
                      }`}
                    >
                      {column.filteredCount}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeMobileColumn ? (
              activeMobileColumn.orders.length === 0 ? (
                <EmptyState
                  title="Tidak ada order pada tahap ini"
                  description={
                    searchTerm || attentionOnly
                      ? 'Coba ubah kata kunci pencarian atau matikan filter perhatian.'
                      : 'Pesanan yang masuk tahap ini akan muncul di sini.'
                  }
                />
              ) : (
                <div className="grid w-full grid-cols-1 gap-3">
                  {activeMobileColumn.orders.map((order) => (
                    <KanbanOrderCard key={order.transactionUuid} order={order} />
                  ))}
                </div>
              )
            ) : null}
          </section>

          {/* Tampilan Desktop — Grid penuh 5 kolom proporsional di xl (termasuk zoom 75%-100%), scroll horizontal mulus di lg */}
          <section className="hidden lg:block">
            <div className="flex w-full items-start gap-3.5 overflow-x-auto pb-4 xl:grid xl:grid-cols-5 xl:overflow-visible">
              {filteredColumns.map((column) => (
                <div
                  key={column.status}
                  className="flex w-[280px] shrink-0 flex-col rounded-sm border border-line bg-[#FAFAFA] p-3 xl:w-auto xl:min-w-0"
                >
                  <div className="mb-3 flex items-center justify-between gap-2 px-1 pt-0.5">
                    <h2 className="truncate font-display text-xs font-bold uppercase tracking-wide text-ink">
                      {column.label || getProductionStatusLabel(column.status)}
                    </h2>
                    <span className="shrink-0 rounded-sm border border-line bg-white px-2 py-0.5 font-mono text-xs font-semibold text-ink tabular-nums">
                      {column.filteredCount}
                    </span>
                  </div>

                  {column.orders.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-line-strong bg-white px-4 py-8 text-center text-xs text-muted">
                      Tidak ada pesanan di tahap ini.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {column.orders.map((order) => (
                        <KanbanOrderCard key={order.transactionUuid} order={order} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
