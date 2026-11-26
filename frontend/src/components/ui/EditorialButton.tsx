import { motion } from 'framer-motion';
import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';

const MotionLink = motion.create(Link);

const sheenVariants = {
  rest: { x: '-130%' },
  hover: {
    x: '130%',
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export interface EditorialButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
  fullWidth?: boolean;
  to?: string;
  state?: unknown;
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Tombol editorial monokrom dengan tactile press (`whileTap`) dan kilau sheen tipis pada varian primary.
 */
export function EditorialButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  to,
  state,
  type = 'button',
  onClick,
  disabled = false,
  loading = false,
  className = '',
  ariaLabel,
  children,
}: EditorialButtonProps) {
  const isDisabled = disabled || loading;

  const sizeClasses =
    size === 'sm' ? 'h-10 min-h-[40px] px-4 text-[11px]' : 'h-12 min-h-[48px] px-6 text-[13px]';

  const variantClasses =
    variant === 'primary'
      ? 'border border-ink bg-ink text-white hover:bg-neutral-900'
      : variant === 'secondary'
        ? 'border border-ink bg-white text-ink hover:bg-ink hover:text-white'
        : 'border border-transparent bg-transparent text-ink underline-offset-4 hover:underline';

  const baseClasses = [
    'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-sm font-display font-semibold uppercase tracking-[0.14em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
    sizeClasses,
    variantClasses,
    fullWidth ? 'w-full' : '',
    isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {variant === 'primary' && !isDisabled ? (
        <motion.span
          aria-hidden="true"
          variants={sheenVariants}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
    </>
  );

  if (to && !isDisabled) {
    return (
      <MotionLink
        to={to}
        state={state}
        onClick={onClick}
        aria-label={ariaLabel}
        initial="rest"
        whileHover="hover"
        whileTap={{ scale: 0.97 }}
        className={baseClasses}
      >
        {content}
      </MotionLink>
    );
  }

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      initial={isDisabled ? false : 'rest'}
      whileHover={isDisabled ? undefined : 'hover'}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      className={baseClasses}
    >
      {content}
    </motion.button>
  );
}
