import { MotionConfig } from 'framer-motion';
import { Link, Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/layout/SiteHeader';
import { useLanguage } from '../context/LanguageContext';

export default function PublicLayout() {
  const { t } = useLanguage();

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-white text-ink">
        <SiteHeader />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8 xl:px-12">
          <Outlet />
        </main>

        <footer className="border-t border-line bg-surface text-ink">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 xl:px-12">
            <Link to="/" className="inline-flex items-baseline gap-2">
              <span className="font-display text-base font-extrabold tracking-[0.18em] text-ink">
                YNG
              </span>
              <span className="font-display text-[11px] font-light tracking-[0.32em] text-muted">
                APPAREL
              </span>
              <span className="ml-2 text-xs text-muted">· {t('footer.location')}</span>
            </Link>
            <p className="text-xs text-muted">{t('footer.tagline')}</p>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
