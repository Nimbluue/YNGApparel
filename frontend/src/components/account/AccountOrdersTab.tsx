import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { listMyOrders, orderQueryKeys } from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import {
  formatLocalizedWibDateTime,
  getLocalizedFulfillmentLabel,
} from '../../utils/localizedLabels';
import { PaymentBadge, ProductionBadge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { CardSkeleton } from '../ui/Skeleton';

/**
 * Tab Pesanan di halaman `/akun` — menampilkan daftar ringkas pesanan pelanggan.
 */
export function AccountOrdersTab() {
  const { locale, t, pick } = useLanguage();

  const ordersQuery = useQuery({
    queryKey: orderQueryKeys.list(1, 10),
    queryFn: () => listMyOrders(1, 10),
  });

  if (ordersQuery.isLoading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (ordersQuery.error) {
    const parsed = extractApiError(
      ordersQuery.error,
      pick('Gagal memuat daftar pesanan.', 'Failed to load orders.')
    );
    return (
      <ErrorState
        eyebrow={t('common.errorEyebrow')}
        retryLabel={t('common.retry')}
        title={pick('Daftar pesanan belum dapat dimuat', 'Unable to load orders')}
        message={parsed.message}
        retry={() => void ordersQuery.refetch()}
      />
    );
  }

  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.meta.total ?? orders.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            {t('account.ordersTitle')}{' '}
            <span className="tabular-price font-mono text-sm font-normal text-muted">
              ({total})
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted">{t('account.ordersSubtitle')}</p>
        </div>

        <Link
          to="/pesanan"
          className="inline-flex min-h-touch items-center gap-1.5 rounded-sm border border-line bg-white px-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink hover:bg-surface"
        >
          <span>{t('account.viewAllOrders')}</span>
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title={t('account.ordersEmptyTitle')}
          description={t('account.ordersEmptyBody')}
          action={
            <Link to="/custom-lab" className="btn-primary rounded-sm">
              {t('account.startCustomLab')}
            </Link>
          }
        />
      ) : (
        <div className="divide-y divide-line rounded-sm border border-line bg-white">
          {orders.map((order) => (
            <article
              key={order.transactionUuid}
              className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                    {order.orderCode}
                  </span>
                  <ProductionBadge
                    status={order.productionStatus}
                    fulfillmentType={order.fulfillmentType}
                    locale={locale}
                  />
                  {order.initialPaymentStatus ? (
                    <PaymentBadge
                      status={order.initialPaymentStatus}
                      proofImagePath={order.initialPaymentHasProof ? 'uploaded' : null}
                      locale={locale}
                    />
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="tabular-price">
                    {formatLocalizedWibDateTime(order.createdAt, locale)}
                  </span>
                  <span className="tabular-price font-medium text-ink">{order.totalQty} pcs</span>
                  <span>{getLocalizedFulfillmentLabel(order.fulfillmentType, locale)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-end">
                <div className="text-left sm:text-right">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
                    {pick('Total', 'Total')}
                  </p>
                  <p className="tabular-price text-base font-semibold text-ink">
                    {formatRupiah(order.grandTotal)}
                  </p>
                </div>

                <Link
                  to={`/pesanan/${order.transactionUuid}`}
                  className="inline-flex min-h-touch items-center justify-center rounded-sm border border-ink bg-ink px-4 text-xs font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-neutral-800"
                >
                  {t('account.openDetail')}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
