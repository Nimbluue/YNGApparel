import { useLanguage } from '../../context/LanguageContext';
import { IconTooltip } from '../ui/IconTooltip';
import { GbFlag, IdFlag } from './FlagIcon';

export interface LanguageSwitcherProps {
  variant?: 'compact' | 'row';
}

/**
 * Pengalih bahasa antarmuka (`ID` / `EN`) tanpa border berat pada mode kompak desktop.
 */
export function LanguageSwitcher({ variant = 'compact' }: LanguageSwitcherProps) {
  const { locale, setLocale, toggleLocale, t } = useLanguage();

  if (variant === 'row') {
    return (
      <div className="flex items-center gap-2" role="group" aria-label={t('tooltip.language')}>
        <button
          type="button"
          onClick={() => setLocale('id')}
          aria-pressed={locale === 'id'}
          className={`inline-flex min-h-touch flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] tabular-nums transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 ${
            locale === 'id' ? 'bg-ink text-white' : 'bg-surface text-muted hover:text-ink'
          }`}
        >
          <IdFlag />
          <span>ID</span>
        </button>
        <button
          type="button"
          onClick={() => setLocale('en')}
          aria-pressed={locale === 'en'}
          className={`inline-flex min-h-touch flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] tabular-nums transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 ${
            locale === 'en' ? 'bg-ink text-white' : 'bg-surface text-muted hover:text-ink'
          }`}
        >
          <GbFlag />
          <span>EN</span>
        </button>
      </div>
    );
  }

  return (
    <IconTooltip
      label={t('tooltip.language')}
      onClick={toggleLocale}
      className="h-11 w-auto gap-1.5 border-0 bg-transparent px-2.5"
    >
      {locale === 'id' ? <IdFlag /> : <GbFlag />}
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] tabular-nums text-ink">
        {locale === 'id' ? 'ID' : 'EN'}
      </span>
    </IconTooltip>
  );
}
