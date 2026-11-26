import { USER_ROLE } from '@yng/shared';
import { MotionConfig } from 'framer-motion';
import {
  BarChart3,
  ClipboardList,
  Columns3,
  CreditCard,
  Landmark,
  Layers,
  LogOut,
  Settings,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { IconTooltip } from '../components/ui/IconTooltip';
import { useAuth } from '../context/AuthContext';
import { BRAND_LOGO_ESSENTIAL_URL } from '../utils/brandAssets';

const ADMIN_NAV_ITEMS: ReadonlyArray<{
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}> = [
  { to: '/admin/kanban', label: 'Dashboard', icon: Columns3 },
  { to: '/admin/orders', label: 'Order', icon: ClipboardList, end: true },
  { to: '/admin/payments', label: 'Pembayaran', icon: CreditCard },
  { to: '/admin/master', label: 'Master Data', icon: Layers },
  { to: '/admin/payment-accounts', label: 'Rekening', icon: Landmark },
  { to: '/admin/settings', label: 'Pengaturan', icon: Settings },
  { to: '/admin/reports', label: 'Laporan Keuangan', icon: BarChart3 },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isKanban = location.pathname === '/admin/kanban';

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-[#FAFAFA] text-ink">
        <header className="sticky top-0 z-30 border-b border-neutral-800 bg-ink text-white">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 lg:px-8 xl:px-12">
            <Link to="/admin" className="flex min-h-touch min-w-0 items-center gap-2.5 sm:gap-3">
              <span className="inline-flex h-9 w-24 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white sm:h-10 sm:w-28">
                <img
                  src={BRAND_LOGO_ESSENTIAL_URL}
                  alt="Logo YNG Apparel"
                  className="h-full w-full scale-[1.35] object-cover object-center"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-xs font-semibold tracking-[0.04em] text-white sm:text-sm">
                  Ruang Produksi
                </p>
                <p className="hidden truncate font-mono text-[11px] text-neutral-400 sm:block">
                  YNG Apparel · Admin
                </p>
              </div>
            </Link>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {user?.role === USER_ROLE.ADMIN ? (
                <>
                  <span className="mr-1 hidden font-mono text-xs text-neutral-400 md:inline">
                    {user.email}
                  </span>
                  <IconTooltip to="/" label="Buka Toko Publik" tone="dark" tooltipPosition="bottom">
                    <Store size={18} strokeWidth={1.5} aria-hidden="true" />
                  </IconTooltip>
                  <IconTooltip
                    label="Keluar dari Admin"
                    tone="dark"
                    tooltipPosition="bottom"
                    onClick={() => void handleLogout()}
                  >
                    <LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
                  </IconTooltip>
                </>
              ) : (
                <IconTooltip to="/" label="Ke Situs Publik" tone="dark" tooltipPosition="bottom">
                  <Store size={18} strokeWidth={1.5} aria-hidden="true" />
                </IconTooltip>
              )}
            </div>
          </div>

          {user?.role === USER_ROLE.ADMIN ? (
            <nav aria-label="Navigasi Admin" className="border-t border-neutral-800 bg-ink">
              <div className="mx-auto flex max-w-[1400px] flex-nowrap items-center gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:px-6 lg:px-8 xl:px-12 [&::-webkit-scrollbar]:hidden">
                {ADMIN_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `inline-flex min-h-touch shrink-0 items-center gap-2 whitespace-nowrap rounded-none border-b-2 px-3 py-2.5 font-display text-xs font-semibold tracking-[0.02em] transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white ${
                          isActive
                            ? 'border-white text-white'
                            : 'border-transparent text-neutral-400 hover:bg-neutral-900 hover:text-white'
                        }`
                      }
                    >
                      <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </nav>
          ) : null}
        </header>

        <main
          className={
            isKanban
              ? 'w-full flex-1 px-4 pb-16 pt-6 sm:px-6 sm:py-8 lg:px-8'
              : 'mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-6 sm:px-6 sm:py-8 lg:px-8 xl:px-12'
          }
        >
          <Outlet />
        </main>
      </div>
    </MotionConfig>
  );
}
