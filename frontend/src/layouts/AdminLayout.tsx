import { USER_ROLE } from '@yng/shared';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BRAND_LOGO_ESSENTIAL_URL } from '../utils/brandAssets';

const ADMIN_NAV_ITEMS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: '/admin', label: 'Kanban', end: true },
  { to: '/admin/orders', label: 'Semua Order' },
  { to: '/admin/payments', label: 'Pembayaran' },
  { to: '/admin/master', label: 'Master Data' },
  { to: '/admin/payment-accounts', label: 'Rekening & QRIS' },
  { to: '/admin/settings', label: 'Pengaturan' },
  { to: '/admin/reports', label: 'Laporan' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-ink text-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8 xl:px-12">
          <Link to="/admin" className="flex min-h-touch min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="inline-flex h-9 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white sm:h-10 sm:w-28">
              <img
                src={BRAND_LOGO_ESSENTIAL_URL}
                alt="Logo YNG Apparel"
                className="h-full w-full scale-[1.35] object-cover object-center"
              />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-xs font-semibold tracking-[0.02em] text-white sm:text-sm">
                Ruang Produksi
              </p>
              <p className="hidden truncate text-xs text-neutral-400 sm:block">
                YNG Apparel · Admin
              </p>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {user?.role === USER_ROLE.ADMIN ? (
              <>
                <span className="hidden text-xs text-neutral-400 md:inline">{user.email}</span>
                <Link
                  to="/"
                  className="inline-flex min-h-touch items-center rounded-full border border-neutral-700 px-3 font-display text-xs font-semibold text-neutral-200 transition-colors hover:border-white hover:text-white sm:px-4"
                >
                  Publik
                </Link>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex min-h-touch items-center rounded-full bg-white px-3 font-display text-xs font-semibold text-ink transition-colors hover:bg-neutral-200 sm:px-4"
                >
                  Keluar
                </button>
              </>
            ) : (
              <Link
                to="/"
                className="inline-flex min-h-touch items-center rounded-full border border-neutral-700 px-3.5 font-display text-xs font-semibold text-neutral-200 hover:border-white hover:text-white sm:px-4"
              >
                Ke Situs Publik
              </Link>
            )}
          </div>
        </div>

        {user?.role === USER_ROLE.ADMIN ? (
          <nav aria-label="Navigasi Admin" className="border-t border-neutral-800 bg-ink">
            <div className="mx-auto flex max-w-[1400px] flex-nowrap items-center gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] sm:px-6 lg:px-8 xl:px-12 [&::-webkit-scrollbar]:hidden">
              {ADMIN_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex min-h-touch shrink-0 items-center whitespace-nowrap rounded-full px-3.5 font-display text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-white text-ink'
                        : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-6 sm:px-6 sm:py-8 lg:px-8 xl:px-12">
        <Outlet />
      </main>
    </div>
  );
}
