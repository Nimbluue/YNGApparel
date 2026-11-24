import { USER_ROLE } from '@yng/shared';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex min-h-touch shrink-0 items-center border-b-2 px-3 font-display text-sm font-semibold transition-colors ${
          isActive
            ? 'border-accent text-ink'
            : 'border-transparent text-muted hover:border-line-strong hover:text-ink'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function PublicLayout() {
  const { user, isGuest, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bone text-ink">
      <header className="site-header sticky top-0 z-30 border-b-2 border-ink bg-bone">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-10">
          <Link to="/" className="flex min-h-touch items-center gap-3">
            <span className="relative inline-flex h-11 w-11 items-center justify-center bg-ink font-display text-sm font-black text-bone">
              <span className="absolute -right-1 -top-1 font-mono text-sm leading-none text-accent">
                +
              </span>
              YNG
            </span>
            <div>
              <p className="font-display text-base font-extrabold leading-tight tracking-tightest">
                YNG APPAREL
              </p>
              <p className="font-mono text-[11px] leading-tight text-muted">
                Batam · Garment &amp; Sablon
              </p>
            </div>
          </Link>

          <nav aria-label="Navigasi utama" className="site-nav flex items-center gap-1 sm:gap-2">
            <NavItem to="/custom-lab">Custom Lab</NavItem>
            {isGuest ? (
              <Link
                to="/login"
                state={{ from: { pathname: '/keranjang' } }}
                className="inline-flex min-h-touch shrink-0 items-center border-b-2 border-transparent px-3 font-display text-sm font-semibold text-muted transition-colors hover:text-ink"
              >
                Keranjang
              </Link>
            ) : (
              <NavItem to="/keranjang">Keranjang</NavItem>
            )}
            <NavItem to="/track">Lacak Pesanan</NavItem>
            {isGuest ? (
              <NavItem to="/login">Masuk</NavItem>
            ) : (
              <>
                {user?.role === USER_ROLE.ADMIN ? <NavItem to="/admin">Admin</NavItem> : null}
                <NavItem to="/akun">Akun</NavItem>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="inline-flex min-h-touch shrink-0 items-center border border-line-strong px-3 font-display text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-bone disabled:opacity-40"
                >
                  {loggingOut ? 'Keluar...' : 'Keluar'}
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-8 sm:px-6 sm:py-12 lg:px-10">
        <Outlet />
      </main>

      <footer className="border-t-2 border-ink bg-ink text-bone">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-neutral-300 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p className="font-display font-bold text-bone">YNG Apparel · Batam, Indonesia</p>
          <p className="font-mono text-xs">
            Custom pakaian satuan &amp; grosir · @yng.apparel.official
          </p>
        </div>
      </footer>
    </div>
  );
}
