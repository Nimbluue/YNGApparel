import { useQuery } from '@tanstack/react-query';
import { COLLECTION_STATUS } from '@yng/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  catalogQueryKeys,
  getCatalogCategories,
  getCatalogCollections,
} from '../../services/catalogService';

/**
 * Mega-dropdown desktop 2 kolom "Kategori" (Kategori jenis pakaian + Koleksi / Series dinamis).
 */
export function CategoryMenu() {
  const { t } = useLanguage();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const panelId = useId();

  const categoriesQuery = useQuery({
    queryKey: catalogQueryKeys.categories,
    queryFn: getCatalogCategories,
  });

  const collectionsQuery = useQuery({
    queryKey: catalogQueryKeys.collections,
    queryFn: getCatalogCollections,
  });

  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function cancelCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose() {
    cancelCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 120);
  }

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const collections = useMemo(() => collectionsQuery.data ?? [], [collectionsQuery.data]);
  const isLoadingMenu = categoriesQuery.isLoading || collectionsQuery.isLoading;
  const isCategoryRouteActive =
    location.pathname === '/katalog' || location.pathname === '/catalog';

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onMouseEnter={() => {
        cancelCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onMouseUp={(event) => event.currentTarget.blur()}
        onClick={() => {
          cancelCloseTimer();
          setOpen((prev) => !prev);
        }}
        className={`relative inline-flex min-h-touch items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-ink outline-none after:absolute after:bottom-2 after:left-0 after:h-px after:w-full after:origin-left after:bg-ink after:transition-transform after:duration-300 hover:after:scale-x-100 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 ${
          isCategoryRouteActive ? 'after:scale-x-100' : 'after:scale-x-0'
        }`}
      >
        <span>{t('nav.categories')}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-full z-40 mt-2 w-[480px] rounded-none border border-line bg-white shadow-none"
          >
            {isLoadingMenu ? (
              <div className="grid grid-cols-2 gap-6 p-5" aria-busy="true">
                <div className="space-y-2.5">
                  <div className="h-3 w-20 animate-pulse rounded-sm bg-surface" />
                  <div className="h-4 w-32 animate-pulse rounded-sm bg-surface" />
                  <div className="h-4 w-28 animate-pulse rounded-sm bg-surface" />
                </div>
                <div className="space-y-2.5">
                  <div className="h-3 w-24 animate-pulse rounded-sm bg-surface" />
                  <div className="h-4 w-36 animate-pulse rounded-sm bg-surface" />
                  <div className="h-4 w-32 animate-pulse rounded-sm bg-surface" />
                </div>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 divide-x divide-line">
                  {/* Kolom Kiri: Kategori Pakaian */}
                  <div className="py-3">
                    <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {t('nav.categoriesHeading')}
                    </p>
                    <ul className="space-y-0.5">
                      {categories.map((category) => (
                        <li key={category.id}>
                          <Link
                            to={`/katalog?kategori=${encodeURIComponent(category.slug)}`}
                            onClick={() => setOpen(false)}
                            onMouseUp={(event) => event.currentTarget.blur()}
                            className="flex min-h-[38px] items-center justify-between gap-2 px-4 py-1.5 text-sm text-ink outline-none transition-colors hover:bg-surface focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                          >
                            <span className="truncate font-medium">{category.name}</span>
                            <span className="font-mono text-[11px] text-muted tabular-nums">
                              {category.activeModelCount}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Kolom Kanan: Koleksi / Series */}
                  <div className="py-3">
                    <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {t('nav.collectionsHeading')}
                    </p>
                    <ul className="max-h-64 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
                      {collections.map((collection) => {
                        const isSoldOut = collection.status === COLLECTION_STATUS.SOLD_OUT;
                        return (
                          <li key={collection.id}>
                            <Link
                              to={`/katalog?koleksi=${encodeURIComponent(collection.slug)}`}
                              onClick={() => setOpen(false)}
                              onMouseUp={(event) => event.currentTarget.blur()}
                              className="flex min-h-[38px] items-center justify-between gap-2 px-4 py-1.5 text-sm text-ink outline-none transition-colors hover:bg-surface focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                            >
                              <span
                                className={`truncate font-medium ${
                                  isSoldOut ? 'text-muted' : 'text-ink'
                                }`}
                              >
                                {collection.name}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {isSoldOut ? (
                                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                                    {t('nav.soldOut')}
                                  </span>
                                ) : null}
                                <span className="font-mono text-[11px] text-muted tabular-nums">
                                  {collection.activeModelCount}
                                </span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                <div className="border-t border-line">
                  <Link
                    to="/katalog"
                    onClick={() => setOpen(false)}
                    onMouseUp={(event) => event.currentTarget.blur()}
                    className="flex min-h-touch items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink outline-none transition-colors hover:bg-surface focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                  >
                    <span>{t('nav.allCollections')}</span>
                    <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
