import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-bone text-ink">
      <header className="sticky top-0 z-30 border-b border-line-strong bg-ink text-bone">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
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
            {user ? (
              <>
                <span className="hidden text-xs text-neutral-300 sm:inline">{user.email}</span>
                <button
                  type="button"
                  onClick={() => void logout()}
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
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
