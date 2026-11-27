import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

export interface BreadcrumbSegment {
  label: string;
  to?: string;
}

interface EditorialBackBarProps {
  fallbackTo: string;
  breadcrumbs: BreadcrumbSegment[];
  mobileContext?: string;
  rightSlot?: ReactNode;
  className?: string;
}

/**
 * Bilah navigasi kembali pintar (`← Kembali`) bermicro-animation + breadcrumb editorial tajam.
 */
export function EditorialBackBar({
  fallbackTo,
  breadcrumbs,
  mobileContext,
  rightSlot,
  className = '',
}: EditorialBackBarProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);

  function handleBack() {
    const historyIdx =
      typeof window !== 'undefined'
        ? (window.history.state as { idx?: number } | null)?.idx
        : undefined;
    if (typeof historyIdx === 'number' && historyIdx > 0) {
      navigate(-1);
    } else {
      navigate(fallbackTo);
    }
  }

  const lastSegment = breadcrumbs[breadcrumbs.length - 1];
  const mobileLabel = mobileContext ?? lastSegment?.label;

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-line pb-3 ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <motion.button
          type="button"
          onClick={handleBack}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onMouseUp={(event) => event.currentTarget.blur()}
          whileTap={{ scale: 0.97 }}
          className="relative inline-flex min-h-touch shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink"
        >
          <motion.span
            aria-hidden="true"
            animate={{ x: hovered ? -4 : 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 28 }}
            className="inline-flex items-center"
          >
            <ArrowLeft size={15} strokeWidth={1.5} />
          </motion.span>
          <span>{t('nav.back')}</span>
          <motion.span
            aria-hidden="true"
            initial={false}
            animate={{ scaleX: hovered ? 1 : 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute bottom-1.5 left-0 h-px w-full origin-left bg-ink"
          />
        </motion.button>

        {breadcrumbs.length > 0 ? (
          <>
            <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-line" />

            {/* Breadcrumb lengkap (sm ke atas) */}
            <nav
              aria-label={t('nav.breadcrumbAria')}
              className="hidden min-w-0 flex-1 items-center gap-1.5 text-xs sm:flex"
            >
              <ol className="flex min-w-0 items-center gap-1.5">
                {breadcrumbs.map((segment, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <li
                      key={`${index}-${segment.label}`}
                      className="flex min-w-0 items-center gap-1.5"
                    >
                      {index > 0 ? (
                        <span aria-hidden="true" className="shrink-0 text-neutral-400">
                          /
                        </span>
                      ) : null}
                      {segment.to && !isLast ? (
                        <Link
                          to={segment.to}
                          onMouseUp={(event) => event.currentTarget.blur()}
                          className="shrink-0 truncate text-muted transition-colors hover:text-ink hover:underline underline-offset-4 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink"
                        >
                          {segment.label}
                        </Link>
                      ) : (
                        <span
                          aria-current={isLast ? 'page' : undefined}
                          className="truncate font-medium text-ink"
                        >
                          {segment.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* Konteks ringkas mobile (360px safe) */}
            {mobileLabel ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted sm:hidden">
                <span aria-hidden="true" className="shrink-0 text-neutral-400">
                  /
                </span>
                <span className="truncate font-medium text-ink">{mobileLabel}</span>
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {rightSlot ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{rightSlot}</div>
      ) : null}
    </div>
  );
}
