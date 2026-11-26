import { useQuery } from '@tanstack/react-query';
import { USER_ROLE } from '@yng/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, LogOut, Package, Shield, User, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useWishlist } from '../../context/WishlistContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { catalogQueryKeys, getCatalogModels } from '../../services/catalogService';
import { LanguageSwitcher } from './LanguageSwitcher';

export interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Drawer navigasi mobile dari kiri (`360px` friendly) dengan kategori model, bahasa, dan akun.
 */
// ASSUMPTION: karena skema katalog belum memiliki entitas kategori terpisah, menu Kategori memetakan setiap model aktif ke `/custom-lab?model=<slug>` dan tautan koleksi ke `/katalog`.
export function MobileNavDrawer({ open, onClose, returnFocusRef }: MobileNavDrawerProps) {
  const { user, isGuest, logout } = useAuth();
  const { t } = useLanguage();
  const { count: wishlistCount } = useWishlist();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useBodyScrollLock(open);
  useEscapeKey(open, onClose);

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const timer = window.setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(timer);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef?.current?.focus();
    }
    return undefined;
  }, [open, returnFocusRef]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      onClose();
      navigate('/');
    } finally {
      setLoggingOut(false);
    }
  }

  const firstName = user?.fullName?.trim().split(/\s+/)[0] || '';
  const models = modelsQuery.data ?? [];

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          <motion.nav
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.mobileAria')}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-y-0 left-0 z-10 flex w-[88vw] max-w-[360px] flex-col overflow-y-auto border-r border-line bg-white"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
              <Link
                to="/"
                onClick={onClose}
                className="inline-flex min-h-touch items-baseline gap-2"
              >
                <span className="font-display text-lg font-extrabold tracking-[0.18em] text-ink">
                  YNG
                </span>
                <span className="font-display text-[11px] font-light tracking-[0.32em] text-muted">
                  APPAREL
                </span>
              </Link>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label={t('nav.closeMenu')}
                className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-ink transition-colors hover:bg-surface"
              >
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-1 flex-col divide-y divide-line px-4 py-4">
              <div className="space-y-1 pb-4">
                <NavLink
                  to="/"
                  end
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex min-h-touch items-center py-2 text-sm font-semibold uppercase tracking-[0.14em] ${
                      isActive ? 'text-ink underline underline-offset-4' : 'text-ink'
                    }`
                  }
                >
                  {t('nav.home')}
                </NavLink>
                <NavLink
                  to="/custom-lab"
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex min-h-touch items-center py-2 text-sm font-semibold uppercase tracking-[0.14em] ${
                      isActive ? 'text-ink underline underline-offset-4' : 'text-ink'
                    }`
                  }
                >
                  {t('nav.customLab')}
                </NavLink>
                <NavLink
                  to="/track"
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex min-h-touch items-center py-2 text-sm font-semibold uppercase tracking-[0.14em] ${
                      isActive ? 'text-ink underline underline-offset-4' : 'text-ink'
                    }`
                  }
                >
                  {t('nav.track')}
                </NavLink>
              </div>

              <div className="py-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {t('nav.categories')}
                </p>
                <ul className="space-y-0.5">
                  {models.map((model, index) => (
                    <li key={model.id}>
                      <Link
                        to={`/custom-lab?model=${encodeURIComponent(model.slug)}`}
                        onClick={onClose}
                        className="flex min-h-touch items-center gap-3 py-1.5 text-sm text-ink transition-colors hover:text-muted"
                      >
                        <span className="font-mono text-[11px] text-muted tabular-nums">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate">{model.name}</span>
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      to="/katalog"
                      onClick={onClose}
                      className="flex min-h-touch items-center py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink"
                    >
                      {t('nav.allCollections')}
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="space-y-3 py-4">
                <Link
                  to="/wishlist"
                  onClick={onClose}
                  className="flex min-h-touch items-center justify-between gap-2.5 text-sm font-medium text-ink focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Heart size={18} strokeWidth={1.5} aria-hidden="true" />
                    <span>{t('tooltip.wishlist')}</span>
                  </span>
                  {wishlistCount > 0 ? (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm bg-ink px-1.5 font-mono text-[10px] font-semibold text-white tabular-nums">
                      {wishlistCount}
                    </span>
                  ) : null}
                </Link>
                <LanguageSwitcher variant="row" />
              </div>

              <div className="pt-4">
                {isGuest ? (
                  <div className="flex flex-col gap-2">
                    <Link
                      to="/login"
                      onClick={onClose}
                      className="inline-flex min-h-touch items-center justify-center rounded-sm border border-ink bg-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                    >
                      {t('account.login')}
                    </Link>
                    <Link
                      to="/register"
                      onClick={onClose}
                      className="inline-flex min-h-touch items-center justify-center rounded-sm border border-ink bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink"
                    >
                      {t('account.register')}
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {t('account.hello', { name: firstName })}
                    </p>
                    <Link
                      to="/akun"
                      onClick={onClose}
                      className="flex min-h-touch items-center gap-2.5 text-sm text-ink"
                    >
                      <User size={16} strokeWidth={1.5} aria-hidden="true" />
                      <span>{t('account.myAccount')}</span>
                    </Link>
                    <Link
                      to="/pesanan"
                      onClick={onClose}
                      className="flex min-h-touch items-center gap-2.5 text-sm text-ink"
                    >
                      <Package size={16} strokeWidth={1.5} aria-hidden="true" />
                      <span>{t('account.myOrders')}</span>
                    </Link>
                    {user?.role === USER_ROLE.ADMIN ? (
                      <Link
                        to="/admin/kanban"
                        onClick={onClose}
                        className="flex min-h-touch items-center gap-2.5 text-sm text-ink"
                      >
                        <Shield size={16} strokeWidth={1.5} aria-hidden="true" />
                        <span>{t('account.adminStudio')}</span>
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={loggingOut}
                      onClick={() => void handleLogout()}
                      className="flex min-h-touch w-full items-center gap-2.5 text-left text-sm text-ink disabled:opacity-40"
                    >
                      <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
                      <span>{loggingOut ? t('account.loggingOut') : t('account.logout')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.nav>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
