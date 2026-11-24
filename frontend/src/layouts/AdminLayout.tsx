import { USER_ROLE } from '@yng/shared';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
    <div className="flex min-h-screen flex-col bg-bone text-ink">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-ink text-bone">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <Link to="/admin" className="flex min-h-touch items-center gap-3">
            <span className="relative inline-flex h-11 w-11 items-center justify-center bg-accent font-display text-sm font-black text-ink">
              <span className="absolute -right-1 -top-1 font-mono text-sm leading-none text-bone">
                +
              </span>
              YNG
            </span>
            <div>
              <p className="font-display text-base font-extrabold leading-tight tracking-tightest">
                RUANG PRODUKSI
              </p>
              <p className="font-mono text-[11px] leading-tight text-neutral-300">
                YNG Apparel · Batam
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {user?.role === USER_ROLE.ADMIN ? (
              <>
                <span className="hidden font-mono text-xs text-neutral-300 sm:inline">
                  {user.email}
                </span>
                <Link
                  to="/"
                  className="inline-flex min-h-touch items-center border border-neutral-500 px-3 font-display text-sm font-semibold text-neutral-100 hover:border-accent hover:text-accent"
                >
                  Situs Publik
                </Link>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex min-h-touch items-center border border-bone px-4 font-display text-sm font-semibold text-bone hover:bg-bone hover:text-ink"
                >
                  Keluar
                </button>
              </>
            ) : (
              <Link
                to="/"
                className="inline-flex min-h-touch items-center border border-neutral-500 px-4 font-display text-sm font-semibold text-neutral-100 hover:border-accent hover:text-accent"
              >
                Ke Situs Publik
              </Link>
            )}
          </div>
        </div>

        {user?.role === USER_ROLE.ADMIN ? (
          <nav aria-label="Navigasi Admin" className="admin-nav border-t border-neutral-700 bg-ink">
            <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-6 lg:px-10">
              {ADMIN_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex min-h-touch shrink-0 items-center whitespace-nowrap border-b-2 px-3 font-display text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-accent text-accent'
                        : 'border-transparent text-neutral-300 hover:text-bone'
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

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 sm:px-6 sm:py-8 lg:px-10">
        <Outlet />
      </main>
    </div>
  );
}
