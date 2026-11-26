import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useWishlist } from '../../context/WishlistContext';
import { formatRupiah } from '../../utils/formatRupiah';
import { EmptyState } from '../ui/EmptyState';
import { CardSkeleton } from '../ui/Skeleton';
import { WishlistHeartButton } from '../ui/WishlistHeartButton';

/**
 * Tab Wishlist editorial (`3:4`, sharp corners, tombol Kustomisasi di Lab & hapus hati).
 */
export function AccountWishlistTab() {
  const { items, count, loading } = useWishlist();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            {t('wishlist.title')}{' '}
            <span className="tabular-price font-mono text-sm font-normal text-muted">
              ({count})
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted">{t('wishlist.subtitle')}</p>
        </div>

        <Link
          to="/katalog"
          className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink hover:bg-surface"
        >
          {t('wishlist.browseCatalog')}
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t('wishlist.emptyTitle')}
          description={t('wishlist.emptyBody')}
          action={
            <Link to="/katalog" className="btn-primary rounded-sm">
              {t('wishlist.browseCatalog')}
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.slug}
              className="group relative flex flex-col border border-line bg-white transition-colors hover:border-ink"
            >
              <WishlistHeartButton
                modelSlug={item.slug}
                modelName={item.name}
                variant="overlay"
                size="sm"
                className="absolute right-2.5 top-2.5 z-10"
              />

              <Link
                to={`/custom-lab?model=${encodeURIComponent(item.slug)}`}
                className="block aspect-[3/4] w-full overflow-hidden bg-surface"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-medium text-muted">
                    {item.name}
                  </div>
                )}
              </Link>

              <div className="flex flex-1 flex-col justify-between gap-3 p-3.5 sm:p-4">
                <div className="space-y-1">
                  <Link
                    to={`/custom-lab?model=${encodeURIComponent(item.slug)}`}
                    className="block font-display text-sm font-semibold text-ink hover:underline sm:text-base"
                  >
                    {item.name}
                  </Link>
                  {item.fabrics.length > 0 ? (
                    <p className="line-clamp-1 font-mono text-[11px] text-muted">
                      {t('wishlist.fabricsAvailable', { count: item.fabrics.length })}
                    </p>
                  ) : null}
                  <p className="tabular-price text-xs font-medium text-ink sm:text-sm">
                    {t('wishlist.startingFrom', { price: formatRupiah(item.basePrice) })}
                  </p>
                </div>

                <Link
                  to={`/custom-lab?model=${encodeURIComponent(item.slug)}`}
                  className="inline-flex min-h-touch w-full items-center justify-center rounded-sm border border-ink bg-ink px-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-neutral-800 sm:text-xs"
                >
                  {t('wishlist.customizeInLab')}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
