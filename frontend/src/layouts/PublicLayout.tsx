import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex min-h-touch items-center border-b-2 px-1 font-display text-xs uppercase tracking-[0.16em] transition-colors ${
          isActive
            ? 'border-ink font-semibold text-ink'
            : 'border-transparent text-muted hover:text-ink'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-bone text-ink">
      <header className="sticky top-0 z-30 border-b border-line-strong bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center border border-ink bg-ink font-display text-xs font-bold tracking-[0.12em] text-bone">
              YNG
            </span>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-[0.18em]">
                YNG Apparel
              </p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
                Custom Lab &amp; Production
              </p>
            </div>
          </Link>

          <nav className="flex items-center gap-4 sm:gap-6">
            <NavItem to="/custom-lab">Custom Lab</NavItem>
            <NavItem to="/track">Lacak Pesanan</NavItem>
            <NavItem to="/admin">Admin</NavItem>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-line-strong bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-display uppercase tracking-[0.14em] text-ink">
            YNG Apparel — Batam, Indonesia
          </p>
          <p>Custom Pakaian Satuan &amp; Grosir · @yng.apparel.official</p>
        </div>
      </footer>
    </div>
  );
}
