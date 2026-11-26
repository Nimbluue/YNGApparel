import { useQuery } from '@tanstack/react-query';
import { Heart, Menu, Search, ShoppingBag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useWishlist } from '../../context/WishlistContext';
import { cartQueryKeys, getCartItems } from '../../services/cartService';
import { IconTooltip } from '../ui/IconTooltip';
import { AccountMenu } from './AccountMenu';
import { CartDrawer } from './CartDrawer';
import { CategoryMenu } from './CategoryMenu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MobileNavDrawer } from './MobileNavDrawer';
import { SearchOverlay } from './SearchOverlay';

function DesktopNavLink({ to, label, end = false }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative inline-flex min-h-touch items-center text-[12px] font-medium uppercase tracking-[0.14em] text-ink after:absolute after:bottom-2 after:left-0 after:h-px after:w-full after:origin-left after:bg-ink after:transition-transform after:duration-300 hover:after:scale-x-100 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 ${
          isActive ? 'after:scale-x-100' : 'after:scale-x-0'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

/**
 * Header publik 1 baris putih editorial (64px), shortcut Ctrl+K / ⌘K Command Palette,
 * badge Wishlist & Studio Bag, serta Mobile Drawer.
 */
export function SiteHeader() {
  const { isGuest, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { count: wishlistCount } = useWishlist();
  const location = useLocation();

  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const searchReturnRef = useRef<HTMLElement | null>(null);
  const cartReturnRef = useRef<HTMLElement | null>(null);
  const mobileMenuBtnRef = useRef<HTMLButtonElement>(null);

  const cartQuery = useQuery({
    queryKey: cartQueryKeys.items,
    queryFn: getCartItems,
    enabled: !isGuest && !authLoading,
  });

  useEffect(() => {
    setSearchOpen(false);
    setCartOpen(false);
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCartOpen(false);
        setMobileOpen(false);
        setSearchOpen((prev) => {
          if (!prev && document.activeElement instanceof HTMLElement) {
            searchReturnRef.current = document.activeElement;
          }
          return !prev;
        });
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const cartBadgeCount = !isGuest ? (cartQuery.data?.summary.totalItems ?? 0) : 0;

  function openSearch() {
    searchReturnRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCartOpen(false);
    setMobileOpen(false);
    setSearchOpen(true);
  }

  function openCart() {
    cartReturnRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearchOpen(false);
    setMobileOpen(false);
    setCartOpen(true);
  }

  function openMobileMenu() {
    setSearchOpen(false);
    setCartOpen(false);
    setMobileOpen(true);
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto grid h-16 max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex items-center justify-start">
            <Link
              to="/"
              className="inline-flex min-h-touch items-baseline gap-2 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
            >
              <span className="font-display text-lg font-extrabold tracking-[0.18em] text-ink">
                YNG
              </span>
              <span className="font-display text-[11px] font-light tracking-[0.32em] text-muted">
                APPAREL
              </span>
            </Link>
          </div>

          <nav aria-label={t('nav.primaryAria')} className="hidden items-center gap-8 lg:flex">
            <DesktopNavLink to="/" label={t('nav.home')} end />
            <DesktopNavLink to="/custom-lab" label={t('nav.customLab')} />
            <CategoryMenu />
            <DesktopNavLink to="/track" label={t('nav.track')} />
          </nav>

          <div className="flex items-center justify-end gap-0.5 sm:gap-1">
            <div className="hidden items-center gap-1 lg:flex">
              <LanguageSwitcher variant="compact" />
              <IconTooltip label={t('tooltip.search')} onClick={openSearch}>
                <Search size={20} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
              <IconTooltip
                label={t('tooltip.wishlist')}
                to="/akun?tab=wishlist"
                badge={wishlistCount}
              >
                <Heart size={20} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
              <IconTooltip label={t('tooltip.cart')} badge={cartBadgeCount} onClick={openCart}>
                <ShoppingBag size={20} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
              <AccountMenu />
            </div>

            <div className="flex items-center gap-0.5 lg:hidden">
              <IconTooltip label={t('tooltip.search')} onClick={openSearch}>
                <Search size={20} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
              <IconTooltip label={t('tooltip.cart')} badge={cartBadgeCount} onClick={openCart}>
                <ShoppingBag size={20} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
              <IconTooltip
                label={t('nav.menu')}
                buttonRef={mobileMenuBtnRef}
                ariaExpanded={mobileOpen}
                onClick={openMobileMenu}
                hideTooltip
              >
                <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
            </div>
          </div>
        </div>
      </header>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        returnFocusRef={searchReturnRef}
      />
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        returnFocusRef={cartReturnRef}
      />
      <MobileNavDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        returnFocusRef={mobileMenuBtnRef}
      />
    </>
  );
}
