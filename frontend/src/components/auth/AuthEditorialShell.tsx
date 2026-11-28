import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { catalogQueryKeys, getCatalogModels } from '../../services/catalogService';

export interface AuthEditorialShellProps {
  mode: 'login' | 'register';
  heading: string;
  subheading: string;
  redirectState?: unknown;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Kontainer split editorial 2 kolom terpadu untuk halaman Masuk (`/login`) dan Daftar (`/register`).
 */
export function AuthEditorialShell({
  mode,
  heading,
  subheading,
  redirectState,
  children,
  footer,
}: AuthEditorialShellProps) {
  const { t } = useLanguage();
  const location = useLocation();

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const modelsWithImages = (modelsQuery.data ?? []).filter((model) => Boolean(model.imageUrl));
  const heroModel =
    mode === 'login' ? modelsWithImages[0] : (modelsWithImages[1] ?? modelsWithImages[0]);

  const tabClass = (active: boolean) =>
    [
      'inline-flex min-h-touch items-center justify-center rounded-none border-b-2 px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.16em] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ink',
      active
        ? 'border-ink text-ink'
        : 'border-transparent text-muted hover:border-neutral-300 hover:text-ink',
    ].join(' ');

  return (
    <section className="mx-auto w-full max-w-5xl py-2 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="grid w-full grid-cols-1 overflow-hidden rounded-sm border border-neutral-200 bg-white lg:grid-cols-2"
      >
        <aside className="relative hidden min-h-[540px] flex-col justify-end overflow-hidden bg-[#0B0B0B] p-10 text-white lg:flex">
          {heroModel?.imageUrl ? (
            <img
              src={heroModel.imageUrl}
              alt={heroModel.name}
              className="absolute inset-0 h-full w-full object-cover object-center opacity-75"
            />
          ) : (
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.12),transparent_55%)]"
              aria-hidden="true"
            />
          )}

          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25"
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-md space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-300">
              {t('auth.eyebrow')}
            </p>
            <h2 className="font-display text-3xl font-semibold uppercase leading-[1.1] tracking-[0.04em] text-white">
              {t(mode === 'login' ? 'auth.visualLoginTitle' : 'auth.visualRegisterTitle')}
            </h2>
            <p className="text-sm leading-relaxed text-neutral-300">{t('auth.visualSyncNote')}</p>
          </div>
        </aside>

        <div className="flex flex-col justify-center bg-white p-6 sm:p-10 lg:p-12">
          <nav
            aria-label={t('auth.tabsAria')}
            className="mb-8 grid grid-cols-2 border-b border-neutral-200"
          >
            <Link
              to={{ pathname: '/login', search: location.search }}
              state={redirectState}
              aria-current={mode === 'login' ? 'page' : undefined}
              className={tabClass(mode === 'login')}
            >
              {t('auth.tabLogin')}
            </Link>
            <Link
              to={{ pathname: '/register', search: location.search }}
              state={redirectState}
              aria-current={mode === 'register' ? 'page' : undefined}
              className={tabClass(mode === 'register')}
            >
              {t('auth.tabRegister')}
            </Link>
          </nav>

          <header className="mb-6 space-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {heading}
            </h1>
            <p className="text-sm leading-relaxed text-muted">{subheading}</p>
          </header>

          {children}

          <div className="mt-6 border-t border-neutral-200 pt-5 text-sm text-muted">{footer}</div>
        </div>
      </motion.div>
    </section>
  );
}
