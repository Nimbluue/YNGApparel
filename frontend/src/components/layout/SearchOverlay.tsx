import { useQuery } from '@tanstack/react-query';
import type { PublicFabricDto, PublicGarmentModelDto } from '@yng/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  catalogQueryKeys,
  getCatalogFabrics,
  getCatalogModels,
} from '../../services/catalogService';
import { formatRupiah } from '../../utils/formatRupiah';
import { getRecentlyViewedModels, type RecentlyViewedModel } from '../../utils/recentlyViewed';

export interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

interface SearchMatchItem {
  model: PublicGarmentModelDto;
  matchedFabricName: string | null;
}

/**
 * Overlay pencarian katalog real-time (model, kategori/slug, bahan) dengan chip populer & riwayat baru dilihat.
 */
export function SearchOverlay({ open, onClose, returnFocusRef }: SearchOverlayProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [recentModels, setRecentModels] = useState<RecentlyViewedModel[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useBodyScrollLock(open);
  useEscapeKey(open, onClose);

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
    enabled: open,
  });

  const fabricsQuery = useQuery({
    queryKey: catalogQueryKeys.fabrics,
    queryFn: getCatalogFabrics,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      setRecentModels(getRecentlyViewedModels());
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(timer);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      setQuery('');
      returnFocusRef?.current?.focus();
    }
    return undefined;
  }, [open, returnFocusRef]);

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const fabrics = useMemo(() => fabricsQuery.data ?? [], [fabricsQuery.data]);

  const fabricById = useMemo(() => {
    const map = new Map<number, PublicFabricDto>();
    for (const fabric of fabrics) {
      map.set(fabric.id, fabric);
    }
    return map;
  }, [fabrics]);

  const popularChips = useMemo(() => {
    const sortedModels = [...models].sort((a, b) => a.sortOrder - b.sortOrder);
    const modelNames = sortedModels.slice(0, 6).map((m) => m.name);
    const fabricNames = fabrics.slice(0, 4).map((f) => f.name);
    return Array.from(new Set([...modelNames, ...fabricNames]));
  }, [models, fabrics]);

  const normalizedQuery = normalizeSearchText(query);

  const searchResults = useMemo<SearchMatchItem[]>(() => {
    if (!normalizedQuery) return [];

    const matched: SearchMatchItem[] = [];
    for (const model of models) {
      const nameHit = normalizeSearchText(model.name).includes(normalizedQuery);
      const slugHit = normalizeSearchText(model.slug.replace(/-/g, ' ')).includes(normalizedQuery);

      let matchedFabricName: string | null = null;
      for (const fabricId of model.fabricIds) {
        const fabric = fabricById.get(fabricId);
        if (fabric && normalizeSearchText(fabric.name).includes(normalizedQuery)) {
          matchedFabricName = fabric.name;
          break;
        }
      }

      if (nameHit || slugHit || matchedFabricName) {
        matched.push({ model, matchedFabricName });
      }
    }
    return matched;
  }, [models, fabricById, normalizedQuery]);

  const displayedRecent = useMemo(() => recentModels.slice(0, 4), [recentModels]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('tooltip.search')}
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 top-0 z-10 max-h-[85vh] overflow-y-auto border-b border-line bg-white"
          >
            <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 xl:px-12">
              <div className="flex items-center gap-3 border-b border-ink pb-2">
                <Search
                  size={20}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="shrink-0 text-ink"
                />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('search.placeholder')}
                  aria-label={t('tooltip.search')}
                  className="w-full min-w-0 border-0 bg-transparent py-1 font-display text-xl text-ink placeholder:text-neutral-400 focus:outline-none sm:text-3xl"
                />
                <span className="hidden shrink-0 rounded-sm border border-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted sm:inline-flex">
                  {t('search.escHint')}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('search.close')}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ink transition-colors hover:bg-surface"
                >
                  <X size={20} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-6">
                {normalizedQuery ? (
                  <div>
                    <p className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted tabular-nums">
                      {t('search.results', { count: searchResults.length })}
                    </p>
                    {searchResults.length === 0 ? (
                      <p className="py-8 text-sm text-muted">{t('search.noResults')}</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                        {searchResults.map(({ model, matchedFabricName }) => (
                          <Link
                            key={model.id}
                            to={`/custom-lab?model=${encodeURIComponent(model.slug)}`}
                            onClick={onClose}
                            className="group block"
                          >
                            <div className="aspect-[3/4] w-full overflow-hidden border border-line bg-surface">
                              {model.imageUrl ? (
                                <img
                                  src={model.imageUrl}
                                  alt={model.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold uppercase tracking-[0.14em] text-muted">
                                  {model.name.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <p className="mt-2.5 truncate text-sm font-medium text-ink group-hover:underline">
                              {model.name}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-muted tabular-nums">
                              {t('search.startingFrom', { price: formatRupiah(model.basePrice) })}
                            </p>
                            {matchedFabricName ? (
                              <p className="mt-0.5 truncate text-[11px] text-muted">
                                {t('search.fabric', { name: matchedFabricName })}
                              </p>
                            ) : null}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-8">
                    {popularChips.length > 0 ? (
                      <div>
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {t('search.popular')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {popularChips.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setQuery(chip)}
                              className="inline-flex h-9 min-h-[36px] items-center rounded-sm border border-line bg-white px-3 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {displayedRecent.length > 0 ? (
                      <div>
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {t('search.recent')}
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
                          {displayedRecent.map((item) => (
                            <Link
                              key={item.slug}
                              to={`/custom-lab?model=${encodeURIComponent(item.slug)}`}
                              onClick={onClose}
                              className="group block"
                            >
                              <div className="aspect-[3/4] w-full overflow-hidden border border-line bg-surface">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold uppercase tracking-[0.14em] text-muted">
                                    {item.name.slice(0, 2)}
                                  </div>
                                )}
                              </div>
                              <p className="mt-2 truncate text-sm font-medium text-ink group-hover:underline">
                                {item.name}
                              </p>
                              <p className="mt-0.5 font-mono text-xs text-muted tabular-nums">
                                {t('search.startingFrom', { price: formatRupiah(item.basePrice) })}
                              </p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
