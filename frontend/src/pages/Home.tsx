import { useQuery } from '@tanstack/react-query';
import useEmblaCarousel from 'embla-carousel-react';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Layers, PenTool, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EditorialCarousel } from '../components/home/EditorialCarousel';
import { EditorialButton } from '../components/ui/EditorialButton';
import { Skeleton } from '../components/ui/Skeleton';
import { WishlistHeartButton } from '../components/ui/WishlistHeartButton';
import { useLanguage } from '../context/LanguageContext';
import {
  catalogQueryKeys,
  getCatalogCategories,
  getCatalogFabrics,
  getCatalogModels,
} from '../services/catalogService';
import { formatRupiah } from '../utils/formatRupiah';

const REVEAL_TRANSITION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };
const HERO_AUTOPLAY_MS = 5000;

export default function Home() {
  const { t } = useLanguage();

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
    retry: false,
  });

  const categoriesQuery = useQuery({
    queryKey: catalogQueryKeys.categories,
    queryFn: getCatalogCategories,
    retry: false,
  });

  const fabricsQuery = useQuery({
    queryKey: catalogQueryKeys.fabrics,
    queryFn: getCatalogFabrics,
    retry: false,
  });

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const categories = useMemo(() => {
    const raw = categoriesQuery.data ?? [];
    return raw.map((category) => ({
      ...category,
      coverImageUrl:
        models.find((m) => m.categoryId === category.id && Boolean(m.imageUrl))?.imageUrl ??
        models.find((m) => m.categoryId === category.id)?.imageUrl ??
        null,
    }));
  }, [categoriesQuery.data, models]);
  const fabrics = useMemo(() => fabricsQuery.data ?? [], [fabricsQuery.data]);

  const heroSlides = useMemo(() => {
    const withImages = models.filter((model) => Boolean(model.imageUrl));
    if (withImages.length > 0) return withImages;
    if (models[0]) return [models[0]];
    return [];
  }, [models]);

  const [heroEmblaRef, heroEmblaApi] = useEmblaCarousel({
    loop: heroSlides.length > 1,
    align: 'start',
  });
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);

  const syncHeroSlide = useCallback(() => {
    if (!heroEmblaApi) return;
    setHeroIndex(heroEmblaApi.selectedScrollSnap());
  }, [heroEmblaApi]);

  useEffect(() => {
    if (!heroEmblaApi) return;
    syncHeroSlide();
    heroEmblaApi.on('select', syncHeroSlide);
    heroEmblaApi.on('reInit', syncHeroSlide);
    return () => {
      heroEmblaApi.off('select', syncHeroSlide);
      heroEmblaApi.off('reInit', syncHeroSlide);
    };
  }, [heroEmblaApi, syncHeroSlide]);

  useEffect(() => {
    if (!heroEmblaApi || heroSlides.length <= 1 || heroPaused) return;
    const timer = window.setInterval(() => {
      heroEmblaApi.scrollNext();
    }, HERO_AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [heroEmblaApi, heroPaused, heroSlides.length]);

  const primaryHeroModel = heroSlides[0] ?? models[0] ?? null;
  const lookbookLeftModel =
    models.find((model) => Boolean(model.imageUrl) && model.id !== primaryHeroModel?.id) ??
    primaryHeroModel;
  const lookbookRightModel =
    models.find(
      (model) =>
        Boolean(model.imageUrl) &&
        model.id !== primaryHeroModel?.id &&
        model.id !== lookbookLeftModel?.id
    ) ?? null;
  const lookbookRightImage =
    lookbookRightModel?.imageUrl ??
    fabrics.find((fabric) => Boolean(fabric.imageUrl))?.imageUrl ??
    fabrics.find((fabric) => Boolean(fabric.macroImageUrl))?.macroImageUrl ??
    primaryHeroModel?.imageUrl ??
    null;

  return (
    <div className="w-full">
      {/* 1. Hero Editorial Carousel */}
      <section
        aria-label={t('home.heroTitle')}
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
        onFocusCapture={() => setHeroPaused(true)}
        onBlurCapture={() => setHeroPaused(false)}
        className="relative flex min-h-[68vh] w-full items-end overflow-hidden bg-[#0B0B0B] text-white md:min-h-[78vh]"
      >
        {heroSlides.length > 0 ? (
          <div ref={heroEmblaRef} className="absolute inset-0 overflow-hidden">
            <div className="flex h-full">
              {heroSlides.map((slide) => (
                <div key={slide.id} className="relative h-full min-w-0 flex-[0_0_100%]">
                  {slide.imageUrl ? (
                    <img
                      src={slide.imageUrl}
                      alt={slide.name}
                      className="h-full w-full object-cover object-center opacity-75"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="h-full w-full bg-[radial-gradient(circle_at_75%_25%,#262626_0%,#0B0B0B_70%)]"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,#262626_0%,#0B0B0B_70%)]"
          />
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25"
        />

        {heroSlides.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => heroEmblaApi?.scrollPrev()}
              aria-label={t('home.prevSlide')}
              className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm border border-white/25 bg-black/40 text-white backdrop-blur-xs transition-colors hover:border-white hover:bg-black/70 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white md:inline-flex"
            >
              <ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => heroEmblaApi?.scrollNext()}
              aria-label={t('home.nextSlide')}
              className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm border border-white/25 bg-black/40 text-white backdrop-blur-xs transition-colors hover:border-white hover:bg-black/70 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white md:inline-flex"
            >
              <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={REVEAL_TRANSITION}
          className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8 xl:px-12"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-neutral-300">
            {t('home.heroEyebrow')}
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold uppercase leading-[1.04] tracking-[0.04em] text-white sm:text-5xl lg:text-6xl">
            {t('home.heroTitle')}
          </h1>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <EditorialButton to="/custom-lab" variant="inverse" className="w-full sm:w-auto">
              {t('home.heroCtaLab')}
            </EditorialButton>
            <EditorialButton to="/katalog" variant="outlineInverse" className="w-full sm:w-auto">
              {t('home.heroCtaCatalog')}
            </EditorialButton>
          </div>

          {heroSlides.length > 1 ? (
            <div className="mt-6 flex items-center gap-2">
              {heroSlides.map((slide, idx) => {
                const isActive = idx === heroIndex;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => heroEmblaApi?.scrollTo(idx)}
                    aria-label={t('home.heroGoToSlide', { index: idx + 1 })}
                    aria-current={isActive ? 'true' : undefined}
                    className="inline-flex min-h-[28px] items-center py-2 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
                  >
                    <span
                      className={`block h-0.5 transition-all duration-300 ${
                        isActive ? 'w-8 bg-white' : 'w-4 bg-white/35 hover:bg-white/60'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          ) : null}
        </motion.div>
      </section>

      {/* 2. Carousel KATEGORI */}
      {categoriesQuery.isLoading || categories.length > 0 ? (
        <section
          aria-labelledby="home-category-heading"
          className="mx-auto w-full max-w-[1400px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8 xl:px-12"
        >
          <h2
            id="home-category-heading"
            className="mb-8 text-center font-display text-lg font-semibold uppercase tracking-[0.28em] text-ink sm:mb-10 sm:text-xl"
          >
            {t('home.categoryHeading')}
          </h2>

          {categoriesQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Skeleton className="aspect-[3/4] w-full rounded-none" />
              <Skeleton className="aspect-[3/4] w-full rounded-none" />
              <Skeleton className="hidden aspect-[3/4] w-full rounded-none md:block" />
              <Skeleton className="hidden aspect-[3/4] w-full rounded-none md:block" />
            </div>
          ) : (
            <EditorialCarousel
              ariaLabel={t('home.categoryHeading')}
              prevLabel={t('home.prevSlide')}
              nextLabel={t('home.nextSlide')}
            >
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="min-w-0 shrink-0 basis-[74%] pl-4 sm:basis-[44%] md:basis-[31%] lg:basis-[24%]"
                >
                  <Link
                    to={`/katalog?kategori=${encodeURIComponent(category.slug)}`}
                    className="group relative block aspect-[3/4] w-full overflow-hidden bg-surface focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                  >
                    {category.coverImageUrl ? (
                      <img
                        src={category.coverImageUrl}
                        alt={category.name}
                        className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#181818] px-4 text-center">
                        <span className="font-display text-xs uppercase tracking-[0.2em] text-neutral-400">
                          {category.name}
                        </span>
                      </div>
                    )}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
                    />
                    <div className="absolute inset-x-4 bottom-4 flex items-baseline justify-between gap-2 text-white">
                      <span className="font-display text-xs font-semibold uppercase tracking-[0.18em] sm:text-sm">
                        {category.name}
                      </span>
                      <span className="font-mono text-[10px] tracking-[0.08em] text-neutral-300 tabular-nums">
                        {t('home.categoryModelsCount', { count: category.activeModelCount })}
                      </span>
                    </div>
                  </Link>
                </div>
              ))}
            </EditorialCarousel>
          )}
        </section>
      ) : null}

      {/* 3. Editorial Lookbook Split Grid (2 Kolom) */}
      <section
        aria-label="Studio Lookbook"
        className="mx-auto w-full max-w-[1400px] px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8 xl:px-12"
      >
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
          <Link
            to="/custom-lab"
            className="group relative flex aspect-[4/5] w-full items-end overflow-hidden bg-[#141414] focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 md:aspect-[5/6]"
          >
            {lookbookLeftModel?.imageUrl ? (
              <img
                src={lookbookLeftModel.imageUrl}
                alt={t('home.lookbookLeftTitle')}
                className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
              />
            ) : null}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
            />
            <div className="relative z-10 p-6 text-white sm:p-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-300">
                {t('home.lookbookLeftEyebrow')}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {t('home.lookbookLeftTitle')}
              </h2>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white underline-offset-4 group-hover:underline">
                <span>{t('home.lookbookLeftCta')}</span>
                <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
              </span>
            </div>
          </Link>

          <Link
            to="/katalog"
            className="group relative flex aspect-[4/5] w-full items-end overflow-hidden bg-[#1D1D1D] focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 md:aspect-[5/6]"
          >
            {lookbookRightImage ? (
              <img
                src={lookbookRightImage}
                alt={t('home.lookbookRightTitle')}
                className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
              />
            ) : null}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
            />
            <div className="relative z-10 p-6 text-white sm:p-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-300">
                {t('home.lookbookRightEyebrow')}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {t('home.lookbookRightTitle')}
              </h2>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white underline-offset-4 group-hover:underline">
                <span>{t('home.lookbookRightCta')}</span>
                <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* 4. Carousel KOLEKSI PILIHAN (Tanpa Kotak Berat) */}
      {modelsQuery.isLoading || models.length > 0 ? (
        <section
          aria-labelledby="home-collection-heading"
          className="mx-auto w-full max-w-[1400px] px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8 xl:px-12"
        >
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <h2
              id="home-collection-heading"
              className="font-display text-base font-semibold uppercase tracking-[0.22em] text-ink sm:text-lg"
            >
              {t('home.collectionHeading')}
            </h2>
            <Link
              to="/katalog"
              className="inline-flex min-h-touch items-center text-xs font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
            >
              {t('home.viewAll')}
            </Link>
          </div>

          {modelsQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Skeleton className="aspect-[3/4] w-full rounded-none" />
              <Skeleton className="aspect-[3/4] w-full rounded-none" />
              <Skeleton className="hidden aspect-[3/4] w-full rounded-none md:block" />
              <Skeleton className="hidden aspect-[3/4] w-full rounded-none md:block" />
            </div>
          ) : (
            <EditorialCarousel
              ariaLabel={t('home.collectionHeading')}
              prevLabel={t('home.prevSlide')}
              nextLabel={t('home.nextSlide')}
            >
              {models.map((model) => (
                <div
                  key={model.id}
                  className="min-w-0 shrink-0 basis-[66%] pl-4 sm:basis-[44%] md:basis-[31%] lg:basis-[24%]"
                >
                  <article className="group relative flex flex-col">
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
                      className="flex flex-col focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                    >
                      <div className="aspect-[3/4] w-full overflow-hidden bg-surface">
                        {model.imageUrl ? (
                          <img
                            src={model.imageUrl}
                            alt={model.name}
                            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-medium text-muted">
                            {model.name}
                          </div>
                        )}
                      </div>

                      <h3 className="mt-3 line-clamp-1 font-display text-sm font-medium text-ink group-hover:underline sm:text-[15px]">
                        {model.name}
                      </h3>
                      <p className="mt-1 tabular-price text-xs font-medium text-muted sm:text-sm">
                        {formatRupiah(model.basePrice)}
                      </p>
                    </Link>
                  </article>
                </div>
              ))}
            </EditorialCarousel>
          )}
        </section>
      ) : null}

      {/* 5. Strip Alur Studio Ringkas (3 Langkah, 1 Baris) */}
      <section aria-label="Studio Workflow" className="w-full border-t border-line bg-[#F8F8F8]">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 md:gap-10 md:py-12 lg:px-8 xl:px-12">
          <div className="flex items-start gap-3.5">
            <Layers
              size={20}
              strokeWidth={1.5}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-ink"
            />
            <div>
              <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink">
                {t('home.step1Title')}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{t('home.step1Body')}</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <PenTool
              size={20}
              strokeWidth={1.5}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-ink"
            />
            <div>
              <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink">
                {t('home.step2Title')}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{t('home.step2Body')}</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <Truck
              size={20}
              strokeWidth={1.5}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-ink"
            />
            <div>
              <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink">
                {t('home.step3Title')}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{t('home.step3Body')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
