/**
 * Tombol utama bergaya editorial monokrom dengan sudut pill proporsional dan target sentuh >= 44px.
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
    'inline-flex min-h-touch items-center justify-center rounded-sm border border-ink bg-ink px-6 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40',
  secondary:
    'inline-flex min-h-touch items-center justify-center rounded-sm border border-line-strong bg-white px-6 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-40',
  ghost:
    'inline-flex min-h-touch items-center justify-center rounded-sm border border-transparent px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-40',
  danger:
    'inline-flex min-h-touch items-center justify-center rounded-sm border border-status-err bg-status-err px-6 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-4 py-2 text-xs min-h-touch',
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
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
