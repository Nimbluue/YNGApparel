import { useQuery } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { SiteHeader } from '../components/layout/SiteHeader';
import { IconTooltip } from '../components/ui/IconTooltip';
import { useLanguage } from '../context/LanguageContext';
import { catalogQueryKeys, getCatalogConfig } from '../services/catalogService';
import { buildWaLink } from '../utils/whatsapp';

export default function PublicLayout() {
  const { t } = useLanguage();
  const location = useLocation();

  const isHomePage = location.pathname === '/';
  const isCustomLab = location.pathname === '/custom-lab';

  const configQuery = useQuery({
    queryKey: catalogQueryKeys.config,
    queryFn: getCatalogConfig,
    retry: false,
  });

  const dpPercent = configQuery.data?.dpPercent ?? 70;
  const adminWhatsapp = configQuery.data?.adminWhatsapp ?? '';
  const waHref = adminWhatsapp ? buildWaLink(adminWhatsapp, t('footer.whatsappPrefill')) : null;
  const currentYear = new Date().getFullYear();

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-white text-ink">
        <SiteHeader />

        <main
          className={
            isHomePage
              ? 'w-full flex-1'
              : 'mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8 xl:px-12'
          }
        >
          <Outlet />
        </main>

        <footer className="border-t border-white/10 bg-[#0B0B0B] text-white">
          <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8 xl:px-12">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:gap-16">
              {/* Kolom Kiri: Wordmark, Lokasi, & Tautan Navigasi */}
              <div className="space-y-6">
                <div>
                  <Link
                    to="/"
                    className="inline-flex items-baseline gap-2 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
                  >
                    <span className="font-display text-lg font-extrabold tracking-[0.18em] text-white">
                      YNG
                    </span>
                    <span className="font-display text-[11px] font-light tracking-[0.32em] text-neutral-400">
                      APPAREL
                    </span>
                  </Link>
                  <p className="mt-2 text-xs text-neutral-400">{t('footer.location')}</p>
                </div>

                <div className="space-y-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                    {t('footer.navHeading')}
                  </p>
                  <nav
                    aria-label={t('footer.navHeading')}
                    className="flex flex-wrap gap-x-6 gap-y-2.5 text-xs font-medium uppercase tracking-[0.14em] text-neutral-300"
                  >
                    <Link
                      to="/custom-lab"
                      className="inline-flex min-h-[36px] items-center transition-colors hover:text-white"
                    >
                      {t('nav.customLab')}
                    </Link>
                    <Link
                      to="/katalog"
                      className="inline-flex min-h-[36px] items-center transition-colors hover:text-white"
                    >
                      {t('nav.categories')}
                    </Link>
                    <Link
                      to="/wishlist"
                      className="inline-flex min-h-[36px] items-center transition-colors hover:text-white"
                    >
                      {t('tooltip.wishlist')}
                    </Link>
                    <Link
                      to="/track"
                      className="inline-flex min-h-[36px] items-center transition-colors hover:text-white"
                    >
                      {t('nav.track')}
                    </Link>
                    <Link
                      to="/akun"
                      className="inline-flex min-h-[36px] items-center transition-colors hover:text-white"
                    >
                      {t('tooltip.account')}
                    </Link>
                  </nav>
                </div>
              </div>

              {/* Kolom Kanan: Pembayaran, Pengiriman, & Instagram */}
              <div className="space-y-6">
                <div className="space-y-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                    {t('footer.paymentsHeading')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      t('footer.paymentQris'),
                      t('footer.paymentBank'),
                      t('footer.paymentDp', { percent: dpPercent }),
                    ].map((badge) => (
                      <span
                        key={badge}
                        className="inline-flex items-center rounded-sm border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-neutral-200 tabular-nums"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                    {t('footer.shippingHeading')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['JNE', 'J&T', 'SiCepat', t('footer.shippingPickup')].map((courier) => (
                      <span
                        key={courier}
                        className="inline-flex items-center rounded-sm border border-white/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-neutral-300"
                      >
                        {courier}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <a
                    href="https://instagram.com/yng.apparel.official"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center font-mono text-xs tracking-[0.08em] text-neutral-300 transition-colors hover:text-white"
                  >
                    @yng.apparel.official
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-[11px] text-neutral-500">
              <p className="tabular-nums">{t('footer.copyright', { year: currentYear })}</p>
              <p>{t('footer.location')}</p>
            </div>
          </div>
        </footer>

        {waHref ? (
          <div
            className={`fixed right-4 z-40 sm:right-6 ${
              isCustomLab ? 'bottom-24 lg:bottom-6' : 'bottom-5 sm:bottom-6'
            }`}
          >
            <IconTooltip
              href={waHref}
              label={t('footer.whatsappTooltip')}
              tooltipPosition="left"
              tone="dark"
              className="h-12 w-12"
            >
              <MessageCircle size={20} strokeWidth={1.5} aria-hidden="true" />
            </IconTooltip>
          </div>
        ) : null}
      </div>
    </MotionConfig>
  );
}
