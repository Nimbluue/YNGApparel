import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { catalogQueryKeys, getCatalogModels } from '../../services/catalogService';

/**
 * Dropdown desktop "Kategori" yang menampilkan daftar model aktif dari katalog API.
 */
// ASSUMPTION: karena skema katalog belum memiliki entitas kategori terpisah, menu Kategori memetakan setiap model aktif ke `/custom-lab?model=<slug>`.
export function CategoryMenu() {
  const { t } = useLanguage();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const panelId = useId();

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
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

  const models = modelsQuery.data ?? [];

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
        onClick={() => {
          cancelCloseTimer();
          setOpen((prev) => !prev);
        }}
        className="relative inline-flex min-h-touch items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-ink after:absolute after:bottom-2 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-ink after:transition-transform after:duration-300 hover:after:scale-x-100 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
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
            className="absolute left-0 top-full z-40 mt-2 min-w-[280px] rounded-none border border-line bg-white py-2 shadow-none"
          >
            {modelsQuery.isLoading ? (
              <div className="space-y-2 px-4 py-2" aria-busy="true">
                <div className="h-4 w-40 animate-pulse rounded-sm bg-surface" />
                <div className="h-4 w-32 animate-pulse rounded-sm bg-surface" />
                <div className="h-4 w-36 animate-pulse rounded-sm bg-surface" />
              </div>
            ) : (
              <ul className="divide-y divide-line/60">
                {models.map((model, index) => (
                  <li key={model.id}>
                    <Link
                      to={`/custom-lab?model=${encodeURIComponent(model.slug)}`}
                      onClick={() => setOpen(false)}
                      className="flex min-h-touch items-center gap-3 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface"
                    >
                      <span className="font-mono text-[11px] text-muted tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate font-medium">{model.name}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/katalog"
                    onClick={() => setOpen(false)}
                    className="flex min-h-touch items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-surface focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                  >
                    <span>{t('nav.allCollections')}</span>
                    <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                </li>
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
