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

type SearchFilterTab = 'all' | 'models' | 'fabrics';

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
 * Floating Command Palette pencarian katalog (`Ctrl+K` / `⌘K`) dengan tab filter Semua / Model / Bahan.
 */
export function SearchOverlay({ open, onClose, returnFocusRef }: SearchOverlayProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchFilterTab>('all');
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
      setActiveTab('all');
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

  const firstModelForFabric = useMemo(() => {
    const map = new Map<number, PublicGarmentModelDto>();
    for (const model of models) {
      for (const fabricId of model.fabricIds) {
        if (!map.has(fabricId)) {
          map.set(fabricId, model);
        }
      }
    }
    return map;
  }, [models]);

  const popularChips = useMemo(() => {
    const sortedModels = [...models].sort((a, b) => a.sortOrder - b.sortOrder);
    const modelNames = sortedModels.slice(0, 6).map((m) => m.name);
    const fabricNames = fabrics.slice(0, 4).map((f) => f.name);
    return Array.from(new Set([...modelNames, ...fabricNames]));
  }, [models, fabrics]);

  const normalizedQuery = normalizeSearchText(query);

  const matchedModels = useMemo<SearchMatchItem[]>(() => {
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

  const matchedFabrics = useMemo<PublicFabricDto[]>(() => {
    if (!normalizedQuery) return [];
    return fabrics.filter(
      (fabric) =>
        normalizeSearchText(fabric.name).includes(normalizedQuery) ||
        normalizeSearchText(fabric.code).includes(normalizedQuery)
    );
  }, [fabrics, normalizedQuery]);

  const visibleModelCount = activeTab === 'fabrics' ? 0 : matchedModels.length;
  const visibleFabricCount = activeTab === 'models' ? 0 : matchedFabrics.length;
  const totalVisibleResults = visibleModelCount + visibleFabricCount;
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
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('tooltip.search')}
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-3 top-14 z-10 mx-auto flex max-h-[calc(100vh-4.5rem)] w-auto max-w-2xl flex-col overflow-hidden rounded-sm border border-neutral-200 bg-white shadow-2xl sm:inset-x-4 md:top-24 md:max-h-[calc(100vh-8rem)]"
          >
            <div className="shrink-0 border-b border-line px-4 pt-3.5 pb-2.5 sm:px-5">
              <div className="flex items-center gap-3">
                <Search
                  size={18}
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
                  className="w-full min-w-0 border-0 bg-transparent py-1 font-display text-base text-ink placeholder:text-neutral-400 focus:outline-none sm:text-lg"
                />
                <span className="hidden shrink-0 rounded-sm border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:inline-flex">
                  {t('search.escHint')}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('search.close')}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ink transition-colors hover:bg-surface"
                >
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>

              {normalizedQuery ? (
                <div
                  role="tablist"
                  aria-label={t('tooltip.search')}
                  className="mt-2.5 flex items-center gap-1.5 border-t border-line/70 pt-2.5"
                >
                  {(
                    [
                      { key: 'all', label: t('search.tabAll') },
                      { key: 'models', label: t('search.tabModels') },
                      { key: 'fabrics', label: t('search.tabFabrics') },
                    ] as const
                  ).map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveTab(tab.key)}
                        className={`inline-flex min-h-[36px] items-center rounded-sm px-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                          isActive ? 'bg-ink text-white' : 'bg-surface text-muted hover:text-ink'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              {normalizedQuery ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted tabular-nums">
                      {t('search.results', { count: totalVisibleResults })}
                    </p>
                  </div>

                  {totalVisibleResults === 0 ? (
                    <p className="py-6 text-center text-sm text-muted">
                      {activeTab === 'fabrics'
                        ? t('search.noFabrics')
                        : activeTab === 'models'
                          ? t('search.noModels')
                          : t('search.noResults')}
                    </p>
                  ) : null}

                  {visibleModelCount > 0 ? (
                    <section className="space-y-3">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        {t('search.modelsHeading', { count: matchedModels.length })}
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
                        {matchedModels.map(({ model, matchedFabricName }) => (
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
                                <div className="flex h-full w-full items-center justify-center font-display text-xl font-bold uppercase tracking-[0.14em] text-muted">
                                  {model.name.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <p className="mt-2 truncate text-sm font-medium text-ink group-hover:underline">
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
                    </section>
                  ) : null}

                  {visibleFabricCount > 0 ? (
                    <section className="space-y-3">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        {t('search.fabricsHeading', { count: matchedFabrics.length })}
                      </p>
                      <ul className="divide-y divide-line border border-line bg-white">
                        {matchedFabrics.map((fabric) => {
                          const linkedModel = firstModelForFabric.get(fabric.id);
                          const targetUrl = linkedModel
                            ? `/custom-lab?model=${encodeURIComponent(linkedModel.slug)}`
                            : '/custom-lab';

                          return (
                            <li key={fabric.id}>
                              <Link
                                to={targetUrl}
                                onClick={onClose}
                                className="flex min-h-touch items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-ink">
                                    {fabric.name}
                                  </p>
                                  <p className="mt-0.5 font-mono text-[11px] text-muted tabular-nums">
                                    {fabric.code}
                                    {fabric.gsmWeight
                                      ? ` · ${t('search.fabricGsm', { gsm: fabric.gsmWeight })}`
                                      : ''}
                                  </p>
                                </div>
                                <span className="shrink-0 font-mono text-xs font-medium text-ink tabular-nums">
                                  {fabric.additionalPrice > 0
                                    ? t('search.fabricExtra', {
                                        price: formatRupiah(fabric.additionalPrice),
                                      })
                                    : t('search.fabricFree')}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-7">
                  {popularChips.length > 0 ? (
                    <div>
                      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
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
                      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
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
                                <div className="flex h-full w-full items-center justify-center font-display text-xl font-bold uppercase tracking-[0.14em] text-muted">
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
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
