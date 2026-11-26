import { USER_ROLE } from '@yng/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, LogOut, Package, Shield, User } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { IconTooltip } from '../ui/IconTooltip';

/**
 * Menu dropdown akun pengguna pada sisi kanan navbar desktop.
 */
export function AccountMenu() {
  const { user, isGuest, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      setOpen(false);
      navigate('/');
    } finally {
      setLoggingOut(false);
    }
  }

  const firstName = user?.fullName?.trim().split(/\s+/)[0] || '';

  return (
    <div ref={containerRef} className="relative">
      <IconTooltip
        label={t('tooltip.account')}
        ariaExpanded={open}
        ariaControls={panelId}
        ariaHaspopup="menu"
        hideTooltip={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <User size={20} strokeWidth={1.5} aria-hidden="true" />
      </IconTooltip>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={panelId}
            role="menu"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-40 mt-2 w-60 rounded-none border border-line bg-white py-2 shadow-none"
          >
            {isGuest ? (
              <div className="flex flex-col">
                <Link
                  to="/login"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex min-h-touch items-center px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
                >
                  {t('account.login')}
                </Link>
                <Link
                  to="/register"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex min-h-touch items-center px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
                >
                  {t('account.register')}
                </Link>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="border-b border-line px-4 py-2.5">
                  <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    {t('account.hello', { name: firstName })}
                  </p>
                </div>
                <Link
                  to="/akun"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex min-h-touch items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface"
                >
                  <User size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span>{t('account.myAccount')}</span>
                </Link>
                <Link
                  to="/pesanan"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex min-h-touch items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface"
                >
                  <Package size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span>{t('account.myOrders')}</span>
                </Link>
                <Link
                  to="/akun?tab=wishlist"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex min-h-touch items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface"
                >
                  <Heart size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span>{t('tooltip.wishlist')}</span>
                </Link>
                {user?.role === USER_ROLE.ADMIN ? (
                  <Link
                    to="/admin/kanban"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex min-h-touch items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface"
                  >
                    <Shield size={16} strokeWidth={1.5} aria-hidden="true" />
                    <span>{t('account.adminStudio')}</span>
                  </Link>
                ) : null}
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                  className="flex min-h-touch w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface disabled:opacity-40"
                >
                  <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span>{loggingOut ? t('account.loggingOut') : t('account.logout')}</span>
                </button>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
