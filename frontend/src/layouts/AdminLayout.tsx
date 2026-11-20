import { USER_ROLE } from '@yng/shared';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ADMIN_NAV_ITEMS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: '/admin', label: 'Kanban', end: true },
  { to: '/admin/master', label: 'Master Data' },
  { to: '/admin/payment-accounts', label: 'Rekening & QRIS' },
  { to: '/admin/settings', label: 'Pengaturan' },
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
      <header className="sticky top-0 z-30 border-b border-line-strong bg-ink text-bone">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/admin" className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center border border-bone font-display text-xs font-bold tracking-[0.12em]">
              YNG
            </span>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-[0.18em]">
                Solo-Admin Studio
              </p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">
                Production Kanban &amp; Master Data
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {user?.role === USER_ROLE.ADMIN ? (
              <>
                <span className="hidden text-xs text-neutral-300 sm:inline">{user.email}</span>
                <Link
                  to="/"
                  className="inline-flex min-h-touch items-center border border-neutral-600 px-3 font-display text-xs uppercase tracking-[0.14em] text-neutral-200 hover:border-bone hover:text-bone"
                >
                  Situs Publik
                </Link>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex min-h-touch items-center border border-bone px-4 font-display text-xs uppercase tracking-[0.14em] text-bone hover:bg-bone hover:text-ink"
                >
                  Keluar
                </button>
              </>
            ) : (
              <Link
                to="/"
                className="inline-flex min-h-touch items-center border border-neutral-600 px-4 font-display text-xs uppercase tracking-[0.14em] text-neutral-200 hover:border-bone hover:text-bone"
              >
                Ke Situs Publik
              </Link>
            )}
          </div>
        </div>

        {user?.role === USER_ROLE.ADMIN ? (
          <nav aria-label="Navigasi Admin" className="border-t border-neutral-800 bg-ink">
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 sm:px-6">
              {ADMIN_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex min-h-touch shrink-0 items-center whitespace-nowrap border-b-2 px-3 font-display text-xs uppercase tracking-[0.14em] transition-colors ${
                      isActive
                        ? 'border-bone font-semibold text-bone'
                        : 'border-transparent text-neutral-400 hover:text-bone'
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

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
