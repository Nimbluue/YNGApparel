import { useQuery } from '@tanstack/react-query';
import { COLLECTION_STATUS } from '@yng/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { CardSkeleton } from '../components/ui/Skeleton';
import { EditorialBackBar } from '../components/ui/EditorialBackBar';
import { WishlistHeartButton } from '../components/ui/WishlistHeartButton';
import { useLanguage } from '../context/LanguageContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  catalogQueryKeys,
  getCatalogCategories,
  getCatalogCollections,
  getCatalogFabrics,
  getCatalogModels,
} from '../services/catalogService';
import { extractApiError } from '../utils/apiError';
import { formatRupiah } from '../utils/formatRupiah';

type PricePreset = 'all' | 'under_100k' | '100k_to_200k' | 'over_200k';
type CatalogSortKey = 'featured' | 'price_asc' | 'price_desc' | 'name_asc';

function parseSlugListParam(raw: string): string[] {
  if (!raw.trim()) return [];
  const unique = new Set<string>();
  for (const part of raw.split(',')) {
    const normalized = part.trim().toLowerCase();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

/**
 * Halaman Katalog Koleksi (`/katalog` + `/catalog`) dengan filter kategori & koleksi dinamis,
 * drawer filter mobile (`360px`), urutkan, dan grid produk rasio 3:4 + WishlistHeartButton.
 */
export default function Catalog() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
  });

  const categoriesQuery = useQuery({
    queryKey: catalogQueryKeys.categories,
    queryFn: getCatalogCategories,
  });

  const collectionsQuery = useQuery({
    queryKey: catalogQueryKeys.collections,
    queryFn: getCatalogCollections,
  });

  const fabricsQuery = useQuery({
    queryKey: catalogQueryKeys.fabrics,
    queryFn: getCatalogFabrics,
  });

  const rawCategoryParam = searchParams.get('kategori') ?? '';
  const rawCollectionParam = searchParams.get('koleksi') ?? '';
  const selectedCategorySlugs = useMemo(
    () => parseSlugListParam(rawCategoryParam),
    [rawCategoryParam]
  );
  const selectedCollectionSlugs = useMemo(
    () => parseSlugListParam(rawCollectionParam),
    [rawCollectionParam]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFabricIds, setSelectedFabricIds] = useState<number[]>([]);
  const [pricePreset, setPricePreset] = useState<PricePreset>('all');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [sortBy, setSortBy] = useState<CatalogSortKey>('featured');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const filterCloseBtnRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(mobileFilterOpen);
  useEscapeKey(mobileFilterOpen, () => setMobileFilterOpen(false));

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const collections = useMemo(() => collectionsQuery.data ?? [], [collectionsQuery.data]);
  const fabrics = useMemo(() => fabricsQuery.data ?? [], [fabricsQuery.data]);

  const parsedMinPrice = minPriceInput.trim() ? Number.parseInt(minPriceInput, 10) : null;
  const parsedMaxPrice = maxPriceInput.trim() ? Number.parseInt(maxPriceInput, 10) : null;

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    selectedCategorySlugs.length > 0 ||
    selectedCollectionSlugs.length > 0 ||
    selectedFabricIds.length > 0 ||
    pricePreset !== 'all' ||
    parsedMinPrice !== null ||
    parsedMaxPrice !== null;

  function toggleSlugParam(paramKey: 'kategori' | 'koleksi', current: string[], slug: string) {
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];

    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (next.length > 0) {
          updated.set(paramKey, next.join(','));
        } else {
          updated.delete(paramKey);
        }
        return updated;
      },
      { replace: true }
    );
  }

  function toggleFabricId(fabricId: number) {
    setSelectedFabricIds((prev) =>
      prev.includes(fabricId) ? prev.filter((id) => id !== fabricId) : [...prev, fabricId]
    );
  }

  function selectPricePreset(nextPreset: PricePreset) {
    setPricePreset(nextPreset);
    setMinPriceInput('');
    setMaxPriceInput('');
  }

  function resetFilters() {
    setSearchTerm('');
    if (searchParams.has('kategori') || searchParams.has('koleksi')) {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          updated.delete('kategori');
          updated.delete('koleksi');
          return updated;
        },
        { replace: true }
      );
    }
    setSelectedFabricIds([]);
    setPricePreset('all');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSortBy('featured');
  }

  const filteredAndSortedModels = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    const filtered = models.filter((model) => {
      if (q) {
        const hay = `${model.name} ${model.slug} ${model.description ?? ''} ${
          model.category?.name ?? ''
        } ${model.collection?.name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (
        selectedCategorySlugs.length > 0 &&
        (!model.category || !selectedCategorySlugs.includes(model.category.slug))
      ) {
        return false;
      }

      if (
        selectedCollectionSlugs.length > 0 &&
        (!model.collection || !selectedCollectionSlugs.includes(model.collection.slug))
      ) {
        return false;
      }

      if (
        selectedFabricIds.length > 0 &&
        !selectedFabricIds.some((fabricId) => model.fabricIds.includes(fabricId))
      ) {
        return false;
      }

      const price = Number(model.basePrice);
      if (parsedMinPrice !== null && Number.isFinite(parsedMinPrice) && price < parsedMinPrice) {
        return false;
      }
      if (parsedMaxPrice !== null && Number.isFinite(parsedMaxPrice) && price > parsedMaxPrice) {
        return false;
      }

      if (parsedMinPrice === null && parsedMaxPrice === null) {
        if (pricePreset === 'under_100k' && price >= 100_000) return false;
        if (pricePreset === '100k_to_200k' && (price < 100_000 || price > 200_000)) return false;
        if (pricePreset === 'over_200k' && price <= 200_000) return false;
      }

      return true;
    });

    const sorted = [...filtered];
    if (sortBy === 'price_asc') {
      sorted.sort((a, b) => a.basePrice - b.basePrice || a.sortOrder - b.sortOrder);
    } else if (sortBy === 'price_desc') {
      sorted.sort((a, b) => b.basePrice - a.basePrice || a.sortOrder - b.sortOrder);
    } else if (sortBy === 'name_asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }

    return sorted;
  }, [
    models,
    parsedMaxPrice,
    parsedMinPrice,
    pricePreset,
    searchTerm,
    selectedCategorySlugs,
    selectedCollectionSlugs,
    selectedFabricIds,
    sortBy,
  ]);

  const activeFilterCount =
    selectedCategorySlugs.length +
    selectedCollectionSlugs.length +
    selectedFabricIds.length +
    (pricePreset !== 'all' || parsedMinPrice !== null || parsedMaxPrice !== null ? 1 : 0) +
    (searchTerm.trim() ? 1 : 0);

  function renderFilterControls(idPrefix: string) {
    return (
      <div className="space-y-6">
        <div>
          <label htmlFor={`${idPrefix}-search`} className="sr-only">
            {t('catalog.searchPlaceholder')}
          </label>
          <div className="relative">
            <Search
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              id={`${idPrefix}-search`}
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('catalog.searchPlaceholder')}
              className="min-h-touch w-full rounded-sm border border-line bg-white py-2 pl-9 pr-3 text-xs text-ink placeholder:text-neutral-400 focus:border-ink focus:outline-none"
            />
          </div>
        </div>

        {/* Kategori Dinamis */}
        {categories.length > 0 ? (
          <fieldset className="space-y-2.5 border-t border-line pt-5">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
              {t('catalog.categoriesLabel')}
            </legend>
            <div className="space-y-1">
              {categories.map((category) => {
                const checked = selectedCategorySlugs.includes(category.slug);
                return (
                  <label
                    key={category.id}
                    className="flex min-h-[36px] cursor-pointer items-center justify-between gap-2 py-1 text-xs text-ink"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleSlugParam('kategori', selectedCategorySlugs, category.slug)
                        }
                        className="h-4 w-4 shrink-0 rounded-none border-line accent-ink"
                      />
                      <span className="truncate">{category.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted tabular-nums">
                      {category.activeModelCount}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {/* Koleksi / Series Dinamis */}
        {collections.length > 0 ? (
          <fieldset className="space-y-2.5 border-t border-line pt-5">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
              {t('catalog.collectionsLabel')}
            </legend>
            <div className="space-y-1">
              {collections.map((collection) => {
                const checked = selectedCollectionSlugs.includes(collection.slug);
                const isSoldOut = collection.status === COLLECTION_STATUS.SOLD_OUT;
                return (
                  <label
                    key={collection.id}
                    className="flex min-h-[36px] cursor-pointer items-center justify-between gap-2 py-1 text-xs text-ink"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleSlugParam('koleksi', selectedCollectionSlugs, collection.slug)
                        }
                        className="h-4 w-4 shrink-0 rounded-none border-line accent-ink"
                      />
                      <span className="truncate">{collection.name}</span>
                      {isSoldOut ? (
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                          {t('catalog.soldOut')}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted tabular-nums">
                      {collection.activeModelCount}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {/* Jenis Bahan */}
        {fabrics.length > 0 ? (
          <fieldset className="space-y-2.5 border-t border-line pt-5">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
              {t('catalog.fabricsLabel')}
            </legend>
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {fabrics.map((fabric) => {
                const checked = selectedFabricIds.includes(fabric.id);
                return (
                  <label
                    key={fabric.id}
                    className="flex min-h-[36px] cursor-pointer items-center justify-between gap-2 py-1 text-xs text-ink"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFabricId(fabric.id)}
                        className="h-4 w-4 shrink-0 rounded-none border-line accent-ink"
                      />
                      <span className="truncate">{fabric.name}</span>
                    </span>
                    {fabric.gsmWeight ? (
                      <span className="shrink-0 font-mono text-[10px] text-muted tabular-nums">
                        {fabric.gsmWeight}G
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {/* Rentang Harga */}
        <fieldset className="space-y-2.5 border-t border-line pt-5">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
            {t('catalog.priceRangeLabel')}
          </legend>

          <div className="grid grid-cols-1 gap-1.5">
            {(
              [
                { key: 'all' as const, label: t('catalog.priceAll') },
                { key: 'under_100k' as const, label: t('catalog.priceUnder100k') },
                { key: '100k_to_200k' as const, label: t('catalog.price100kTo200k') },
                { key: 'over_200k' as const, label: t('catalog.priceOver200k') },
              ] satisfies Array<{ key: PricePreset; label: string }>
            ).map((preset) => {
              const active =
                pricePreset === preset.key && parsedMinPrice === null && parsedMaxPrice === null;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => selectPricePreset(preset.key)}
                  aria-pressed={active}
                  className={`flex min-h-[36px] items-center rounded-sm border px-3 py-1.5 text-left text-xs transition-colors ${
                    active
                      ? 'border-ink bg-ink font-medium text-white'
                      : 'border-line bg-white text-ink hover:border-ink hover:bg-surface'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <input
              type="text"
              inputMode="numeric"
              value={minPriceInput}
              onChange={(event) => {
                setPricePreset('all');
                setMinPriceInput(event.target.value.replace(/\D/g, ''));
              }}
              placeholder={t('catalog.minPricePlaceholder')}
              aria-label={t('catalog.minPricePlaceholder')}
              className="min-h-touch w-full rounded-sm border border-line bg-white px-2.5 py-1.5 font-mono text-xs text-ink tabular-nums placeholder:font-sans placeholder:text-neutral-400 focus:border-ink focus:outline-none"
            />
            <input
              type="text"
              inputMode="numeric"
              value={maxPriceInput}
              onChange={(event) => {
                setPricePreset('all');
                setMaxPriceInput(event.target.value.replace(/\D/g, ''));
              }}
              placeholder={t('catalog.maxPricePlaceholder')}
              aria-label={t('catalog.maxPricePlaceholder')}
              className="min-h-touch w-full rounded-sm border border-line bg-white px-2.5 py-1.5 font-mono text-xs text-ink tabular-nums placeholder:font-sans placeholder:text-neutral-400 focus:border-ink focus:outline-none"
            />
          </div>
        </fieldset>

        {hasActiveFilters ? (
          <div className="border-t border-line pt-4">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-sm border border-line bg-white px-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink hover:bg-surface"
            >
              <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>{t('catalog.resetFilters')}</span>
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const singleSelectedCategory = useMemo(() => {
    if (selectedCategorySlugs.length !== 1) return null;
    return categories.find((cat) => cat.slug === selectedCategorySlugs[0]) ?? null;
  }, [categories, selectedCategorySlugs]);

  const catalogBreadcrumbs = useMemo(
    () =>
      singleSelectedCategory
        ? [
            { label: t('breadcrumb.home'), to: '/' },
            { label: t('breadcrumb.catalog'), to: '/katalog' },
            { label: singleSelectedCategory.name },
          ]
        : [{ label: t('breadcrumb.home'), to: '/' }, { label: t('breadcrumb.catalog') }],
    [singleSelectedCategory, t]
  );

  return (
    <div className="w-full space-y-8 pb-10">
      <EditorialBackBar fallbackTo="/" breadcrumbs={catalogBreadcrumbs} />

      <header className="border-b border-line pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          {t('catalog.eyebrow')}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t('catalog.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('catalog.subtitle')}</p>
      </header>

      {modelsQuery.error ? (
        <ErrorState
          eyebrow={t('common.errorEyebrow')}
          retryLabel={t('common.retry')}
          title={t('catalog.loadErrorTitle')}
          message={extractApiError(modelsQuery.error, t('catalog.loadErrorBody')).message}
          retry={() => void modelsQuery.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* Sidebar Desktop */}
          <aside
            aria-label={t('catalog.filtersTitle')}
            className="hidden lg:sticky lg:top-24 lg:block lg:w-64 lg:shrink-0"
          >
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink">
                {t('catalog.filtersTitle')}
              </h2>
              {activeFilterCount > 0 ? (
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  ({activeFilterCount})
                </span>
              ) : null}
            </div>
            {renderFilterControls('desktop')}
          </aside>

          {/* Kolom Utama: Toolbar + Grid Produk */}
          <div className="min-w-0 flex-1 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(true)}
                  className="inline-flex min-h-touch items-center gap-2 rounded-sm border border-line bg-white px-3.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink lg:hidden"
                >
                  <SlidersHorizontal size={15} strokeWidth={1.5} aria-hidden="true" />
                  <span>{t('catalog.openFilters')}</span>
                  {activeFilterCount > 0 ? (
                    <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-sm bg-ink px-1 font-mono text-[10px] text-white tabular-nums">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </button>

                <p className="font-mono text-xs text-muted tabular-nums">
                  {t('catalog.resultsCount', { count: filteredAndSortedModels.length })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="catalog-sort"
                  className="text-xs font-medium uppercase tracking-[0.12em] text-muted"
                >
                  {t('catalog.sortLabel')}
                </label>
                <select
                  id="catalog-sort"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as CatalogSortKey)}
                  className="min-h-touch rounded-sm border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink focus:border-ink focus:outline-none"
                >
                  <option value="featured">{t('catalog.sortFeatured')}</option>
                  <option value="price_asc">{t('catalog.sortPriceAsc')}</option>
                  <option value="price_desc">{t('catalog.sortPriceDesc')}</option>
                  <option value="name_asc">{t('catalog.sortNameAsc')}</option>
                </select>
              </div>
            </div>

            {modelsQuery.isLoading ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-3">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : filteredAndSortedModels.length === 0 ? (
              <EmptyState
                title={t('catalog.emptyTitle')}
                description={t('catalog.emptyBody')}
                action={
                  hasActiveFilters ? (
                    <button type="button" onClick={resetFilters} className="btn-primary rounded-sm">
                      {t('catalog.resetFilters')}
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-3">
                {filteredAndSortedModels.map((model) => (
                  <article key={model.id} className="group relative flex flex-col">
                    <WishlistHeartButton
                      modelSlug={model.slug}
                      modelName={model.name}
                      modelHint={model}
                      variant="overlay"
                      size="sm"
                      className="absolute right-2.5 top-2.5 z-10"
                    />

                    <Link
                      to={`/custom-lab?model=${encodeURIComponent(model.slug)}`}
                      className="flex flex-1 flex-col"
                    >
                      <div className="aspect-[3/4] w-full overflow-hidden rounded-sm border border-line bg-surface">
                        {model.imageUrl ? (
                          <img
                            src={model.imageUrl}
                            alt={model.name}
                            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center">
                            <span className="font-display text-sm font-semibold text-ink">
                              {model.name}
                            </span>
                            <span className="text-[11px] text-muted">
                              {t('catalog.comingSoon')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 space-y-1">
                        {model.collection ? (
                          <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                            <span className="truncate">{model.collection.name}</span>
                            {model.collection.status === COLLECTION_STATUS.SOLD_OUT ? (
                              <span className="shrink-0 font-mono text-ink">
                                {t('catalog.soldOut')}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="line-clamp-2 font-display text-sm font-semibold text-ink group-hover:underline sm:text-base">
                            {model.name}
                          </h2>
                          <span className="shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted tabular-nums">
                            {t('catalog.fabricsCount', { count: model.fabricIds.length })}
                          </span>
                        </div>
                        <p className="tabular-price text-xs font-medium text-ink sm:text-sm">
                          {t('catalog.startingFrom', { price: formatRupiah(model.basePrice) })}
                        </p>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawer Filter Mobile (`360px` friendly) */}
      <AnimatePresence>
        {mobileFilterOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileFilterOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />

            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={t('catalog.filtersTitle')}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-10 flex w-[88vw] max-w-[360px] flex-col border-r border-line bg-white"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink">
                  {t('catalog.filtersTitle')}
                </span>
                <button
                  ref={filterCloseBtnRef}
                  type="button"
                  onClick={() => setMobileFilterOpen(false)}
                  aria-label={t('catalog.closeFilters')}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-ink transition-colors hover:bg-surface"
                >
                  <X size={20} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">{renderFilterControls('mobile')}</div>

              <div className="flex shrink-0 items-center gap-2 border-t border-line p-4">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="btn-secondary flex-1 rounded-sm px-3 text-xs"
                  >
                    {t('catalog.resetFilters')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(false)}
                  className="btn-primary flex-1 rounded-sm px-3 text-xs"
                >
                  {t('catalog.applyFilters', { count: filteredAndSortedModels.length })}
                </button>
              </div>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
