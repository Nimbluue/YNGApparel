import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { CardSkeleton } from '../components/ui/Skeleton';
import { WishlistHeartButton } from '../components/ui/WishlistHeartButton';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useWishlist } from '../context/WishlistContext';
import { formatRupiah } from '../utils/formatRupiah';

/**
 * Halaman khusus `/wishlist` untuk tamu (localStorage) maupun user login (DB tersinkron).
 */
export default function Wishlist() {
  const { isGuest } = useAuth();
  const { items, count, loading } = useWishlist();
  const { t } = useLanguage();

  return (
    <div className="w-full space-y-8 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t('wishlist.title')}{' '}
            <span className="tabular-price font-mono text-lg font-normal text-muted">
              ({count})
            </span>
          </h1>
          <p className="text-sm text-muted">{t('wishlist.subtitle')}</p>
        </div>

        <Link
          to="/katalog"
          className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink hover:bg-surface"
        >
          {t('wishlist.browseCatalog')}
        </Link>
      </header>

      {isGuest && count > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-surface px-4 py-3 text-xs text-ink">
          <p className="leading-relaxed text-muted">{t('wishlist.guestNotice')}</p>
          <Link
            to="/login"
            state={{ from: '/wishlist' }}
            className="inline-flex min-h-touch items-center rounded-sm border border-ink bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-neutral-800"
          >
            {t('wishlist.loginToSync')}
          </Link>
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : items.length === 0 ? (
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
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
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
