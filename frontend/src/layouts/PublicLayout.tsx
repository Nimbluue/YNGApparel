import { USER_ROLE } from '@yng/shared';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BRAND_LOGO_ESSENTIAL_URL } from '../utils/brandAssets';

function NavItem({
  to,
  children,
  onClick,
}: {
  to: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `inline-flex min-h-touch shrink-0 items-center rounded-full px-3.5 py-2 font-display text-sm font-medium transition-colors ${
          isActive ? 'bg-ink text-white' : 'text-muted hover:bg-surface hover:text-ink'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      setMobileMenuOpen(false);
      navigate('/');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex min-h-touch min-w-0 items-center gap-2.5 sm:gap-3"
          >
            <span className="inline-flex h-9 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white sm:h-10 sm:w-28">
              <img
                src={BRAND_LOGO_ESSENTIAL_URL}
                alt="Logo YNG Apparel"
                className="h-full w-full scale-[1.35] object-cover object-center"
              />
            </span>
            <span className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate font-display text-xs font-semibold tracking-[0.04em] text-ink sm:text-sm">
                APPAREL
              </p>
              <p className="hidden truncate text-xs text-muted sm:block">Custom Studio · Batam</p>
            </div>
          </Link>

          <nav aria-label="Navigasi utama" className="hidden items-center gap-1 sm:flex">
            <NavItem to="/custom-lab">Custom Lab</NavItem>
            {isGuest ? (
              <Link
                to="/login"
                state={{ from: { pathname: '/keranjang' } }}
                className="inline-flex min-h-touch shrink-0 items-center rounded-full px-3.5 py-2 font-display text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                Keranjang
              </Link>
            ) : (
              <NavItem to="/keranjang">Keranjang</NavItem>
            )}
            <NavItem to="/track">Lacak Pesanan</NavItem>
            {isGuest ? (
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `ml-1 inline-flex min-h-touch shrink-0 items-center rounded-full border px-4 py-2 font-display text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-ink bg-ink text-white'
                      : 'border-line-strong bg-white text-ink hover:border-ink hover:bg-surface'
                  }`
                }
              >
                Masuk
              </NavLink>
            ) : (
              <>
                {user?.role === USER_ROLE.ADMIN ? <NavItem to="/admin">Admin</NavItem> : null}
                <NavItem to="/akun">Akun</NavItem>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="ml-1 inline-flex min-h-touch shrink-0 items-center rounded-full border border-line-strong bg-white px-4 py-2 font-display text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface disabled:opacity-40"
                >
                  {loggingOut ? 'Keluar...' : 'Keluar'}
                </button>
              </>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-public-menu"
            aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full border border-line px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-surface sm:hidden"
          >
            {mobileMenuOpen ? 'Tutup' : 'Menu'}
          </button>
        </div>

        {mobileMenuOpen ? (
          <nav
            id="mobile-public-menu"
            aria-label="Navigasi mobile"
            className="border-t border-line bg-white px-4 py-3 sm:hidden"
          >
            <div className="flex flex-col gap-1.5">
              <NavItem to="/custom-lab" onClick={() => setMobileMenuOpen(false)}>
                Custom Lab
              </NavItem>
              {isGuest ? (
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  state={{ from: { pathname: '/keranjang' } }}
                  className="inline-flex min-h-touch items-center rounded-full px-3.5 py-2 font-display text-sm font-medium text-muted hover:bg-surface hover:text-ink"
                >
                  Keranjang
                </Link>
              ) : (
                <NavItem to="/keranjang" onClick={() => setMobileMenuOpen(false)}>
                  Keranjang
                </NavItem>
              )}
              <NavItem to="/track" onClick={() => setMobileMenuOpen(false)}>
                Lacak Pesanan
              </NavItem>
              {isGuest ? (
                <NavItem to="/login" onClick={() => setMobileMenuOpen(false)}>
                  Masuk / Daftar
                </NavItem>
              ) : (
                <>
                  {user?.role === USER_ROLE.ADMIN ? (
                    <NavItem to="/admin" onClick={() => setMobileMenuOpen(false)}>
                      Admin Studio
                    </NavItem>
                  ) : null}
                  <NavItem to="/akun" onClick={() => setMobileMenuOpen(false)}>
                    Akun Saya
                  </NavItem>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    disabled={loggingOut}
                    className="mt-1 inline-flex min-h-touch items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 font-display text-sm font-semibold text-ink hover:border-ink disabled:opacity-40"
                  >
                    {loggingOut ? 'Keluar...' : 'Keluar'}
                  </button>
                </>
              )}
            </div>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface text-ink">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white">
              <img
                src={BRAND_LOGO_ESSENTIAL_URL}
                alt="YNG Apparel"
                className="h-full w-full scale-[1.35] object-cover object-center"
              />
            </span>
            <div>
              <p className="font-display text-sm font-semibold text-ink">YNG Apparel</p>
              <p className="text-xs text-muted">Batam, Indonesia</p>
            </div>
          </div>
          <p className="text-xs text-muted">
            Custom pakaian satuan &amp; produksi tim · @yng.apparel.official
          </p>
        </div>
      </footer>
    </div>
  );
}
