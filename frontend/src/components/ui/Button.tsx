/**
 * Tombol workshop: bentuk tegas, aksi utama memakai tinta oranye.
 * Variasi: primary (hitam solid), secondary (outline), ghost, danger
 */
import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'inline-flex min-h-touch items-center justify-center border border-ink bg-accent px-5 py-3 font-display text-sm font-bold text-ink transition-colors hover:bg-ink hover:text-bone disabled:cursor-not-allowed disabled:opacity-40',
  secondary:
    'inline-flex min-h-touch items-center justify-center border border-line-strong bg-transparent px-5 py-3 font-display text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-bone disabled:cursor-not-allowed disabled:opacity-40',
  ghost:
    'inline-flex min-h-touch items-center justify-center border border-transparent px-4 py-3 font-display text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent disabled:cursor-not-allowed disabled:opacity-40',
  danger:
    'inline-flex min-h-touch items-center justify-center border border-status-err bg-status-err px-5 py-3 font-display text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-2 text-sm min-h-touch',
  md: '',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 animate-spin border border-current border-t-transparent"
          />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
