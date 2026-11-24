/**
 * ErrorState — tampilkan ketika request gagal.
 */
import type { ReactNode } from 'react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  retry?: () => void;
  children?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Terjadi Kesalahan',
  message = 'Gagal memuat data. Coba lagi.',
  retry,
  children,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`relative border-l-4 border-status-err py-6 pl-5 text-left ${className}`}
      role="alert"
    >
      <span
        aria-hidden="true"
        className="mb-2 block font-mono text-xs font-semibold text-status-err"
      >
        PERLU DICEK
      </span>
      <p className="font-display text-2xl font-bold tracking-tightest text-ink">{title}</p>
      <p className="mt-2 max-w-xl text-base text-muted">{message}</p>
      {children}
      {retry && (
        <div className="mt-6">
          <Button variant="secondary" size="sm" onClick={retry}>
            Coba Lagi
          </Button>
        </div>
      )}
    </div>
  );
}
