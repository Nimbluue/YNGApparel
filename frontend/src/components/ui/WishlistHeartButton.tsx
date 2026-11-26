import type { PublicGarmentModelDto } from '@yng/shared';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useWishlist } from '../../context/WishlistContext';

export interface WishlistHeartButtonProps {
  modelSlug: string;
  modelName?: string;
  modelHint?: PublicGarmentModelDto;
  variant?: 'overlay' | 'inline';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

/**
 * Tombol hati editorial dengan animasi heart-pop (merah marun #DC2626 saat aktif, outline #111111 saat belum aktif).
 */
export function WishlistHeartButton({
  modelSlug,
  modelName,
  modelHint,
  variant = 'overlay',
  size = 'md',
  showLabel = false,
  className = '',
}: WishlistHeartButtonProps) {
  const { isWishlisted, toggleWishlist } = useWishlist();
  const { t } = useLanguage();

  const saved = isWishlisted(modelSlug);
  const displayName = modelName ?? modelSlug;
  const ariaLabel = saved
    ? t('wishlist.removeAria', { name: displayName })
    : t('wishlist.addAria', { name: displayName });

  const iconSize = size === 'sm' ? 16 : 18;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    void toggleWishlist(modelSlug, modelHint);
  }

  const baseClasses =
    variant === 'overlay'
      ? 'inline-flex h-11 w-11 items-center justify-center rounded-sm border border-line bg-white/95 backdrop-blur-xs transition-colors hover:border-ink focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900'
      : 'inline-flex min-h-touch items-center justify-center gap-2 rounded-sm border border-line bg-white px-3.5 text-xs font-medium uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink hover:bg-surface focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900';

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      aria-pressed={saved}
      whileTap={{ scale: 0.92 }}
      className={[baseClasses, className].filter(Boolean).join(' ')}
    >
      <motion.span
        key={saved ? 'saved' : 'unsaved'}
        initial={saved ? { scale: 0.72 } : { scale: 1 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 20 }}
        className="inline-flex items-center justify-center"
      >
        <Heart
          size={iconSize}
          strokeWidth={1.5}
          aria-hidden="true"
          className={saved ? 'fill-[#DC2626] text-[#DC2626]' : 'fill-transparent text-[#111111]'}
        />
      </motion.span>
      {showLabel ? (
        <span className={saved ? 'text-[#DC2626]' : 'text-ink'}>
          {saved ? t('wishlist.savedLabel') : t('wishlist.addLabel')}
        </span>
      ) : null}
    </motion.button>
  );
}
