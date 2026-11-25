import { useQuery } from '@tanstack/react-query';
import {
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  getFulfillmentLabel,
  getPaymentSchemeLabel,
} from '@yng/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PaymentBadge, ProductionBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { formatWibDateTime, listMyOrders, orderQueryKeys } from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';

const ORDERS_PER_PAGE = 10;

export default function MyOrders() {
  const [page, setPage] = useState(1);

  const ordersQuery = useQuery({
    queryKey: orderQueryKeys.list(page, ORDERS_PER_PAGE),
    queryFn: () => listMyOrders(page, ORDERS_PER_PAGE),
  });

  if (ordersQuery.isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="space-y-2 border-b border-line pb-5">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-9 w-60" />
        </div>
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (ordersQuery.error) {
    const parsed = extractApiError(ordersQuery.error, 'Gagal memuat daftar pesanan Anda.');
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState
          title="Daftar pesanan belum dapat dimuat"
          message={parsed.message}
          retry={() => void ordersQuery.refetch()}
        />
      </div>
    );
  }

  const orders = ordersQuery.data?.items ?? [];
  const meta = ordersQuery.data?.meta ?? {
    page: 1,
    limit: ORDERS_PER_PAGE,
    total: 0,
    totalPages: 1,
  };

  return (
    <div className="w-full space-y-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="eyebrow">YNG Studio · Pesanan Saya</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
            Riwayat &amp; Status Pesanan
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Pantau tagihan pembayaran, verifikasi desain, progres sablon, hingga nomor resi kurir.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/keranjang" className="btn-secondary">
            Keranjang
          </Link>
          <Link to="/custom-lab" className="btn-primary">
            + Buat Custom Baru
          </Link>
        </div>
      </header>

      {orders.length === 0 ? (
        <EmptyState
          title="Belum ada pesanan"
          description="Pesanan custom yang Anda buat melalui checkout keranjang akan muncul di sini."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/custom-lab" className="btn-primary">
                Mulai di Custom Lab
              </Link>
              <Link to="/keranjang" className="btn-secondary">
                Cek Keranjang
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const needsInitialUpload =
              order.productionStatus === PRODUCTION_STATUS.NEW_ORDER &&
              order.initialPaymentStatus === PAYMENT_STATUS.PENDING &&
              !order.initialPaymentHasProof;

            return (
              <article
                key={order.transactionUuid}
                className="rounded-3xl border border-line bg-white p-5 transition-colors hover:border-line-strong sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-sm font-semibold text-ink">
                        {order.orderCode}
                      </span>
                      <ProductionBadge
                        status={order.productionStatus}
                        fulfillmentType={order.fulfillmentType}
                      />
                      {order.initialPaymentStatus ? (
                        <PaymentBadge
                          status={order.initialPaymentStatus}
                          proofImagePath={order.initialPaymentHasProof ? 'uploaded' : null}
                        />
                      ) : null}
                    </div>
                    <p className="tabular-price text-xs text-muted">
                      Dibuat: {formatWibDateTime(order.createdAt)}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-xs text-muted">Total Pesanan</p>
                    <p className="tabular-price text-lg font-bold text-ink">
                      {formatRupiah(order.grandTotal)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="grid w-full grid-cols-2 gap-x-6 gap-y-2 text-xs sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-6">
                    <div>
                      <span className="text-muted">Kuantitas</span>
                      <p className="tabular-price font-semibold text-ink">{order.totalQty} pcs</p>
                    </div>
                    <div>
                      <span className="text-muted">Penerimaan</span>
                      <p className="font-semibold text-ink">
                        {getFulfillmentLabel(order.fulfillmentType)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Skema Bayar</span>
                      <p className="font-semibold text-ink">
                        {getPaymentSchemeLabel(order.paymentScheme, order.dpPercentSnapshot)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Sisa Tagihan</span>
                      <p className="tabular-price font-semibold text-ink">
                        {formatRupiah(order.remainingBalance)}
                      </p>
                    </div>
                  </div>

                  <Link
                    to={`/pesanan/${order.transactionUuid}`}
                    className="btn-primary w-full sm:w-auto"
                  >
                    {needsInitialUpload ? 'Bayar & Unggah Bukti' : 'Lihat Detail Pesanan'}
                  </Link>
                </div>

                {needsInitialUpload && order.paymentDueAt ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-status-warn">
                    Menunggu bukti pembayaran awal sebelum{' '}
                    <span className="tabular-price font-semibold">
                      {formatWibDateTime(order.paymentDueAt)}
                    </span>
                    .
                  </p>
                ) : null}
              </article>
            );
          })}

          {meta.totalPages > 1 ? (
            <nav
              aria-label="Navigasi halaman pesanan"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
            >
              <p className="tabular-price text-xs text-muted">
                Halaman {meta.page} dari {meta.totalPages} ({meta.total} pesanan)
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn-secondary px-4 py-2 text-xs"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  className="btn-secondary px-4 py-2 text-xs"
                >
                  Berikutnya
                </button>
              </div>
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );
}
