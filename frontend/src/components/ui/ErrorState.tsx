/**
 * ErrorState — tampilkan ketika permintaan ke server gagal.
 */
import type { ReactNode } from 'react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  eyebrow?: string;
  retryLabel?: string;
  retry?: () => void;
  children?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Terjadi Kesalahan',
  message = 'Gagal memuat data. Coba lagi.',
  eyebrow = 'Perlu dicek',
  retryLabel = 'Coba Lagi',
  retry,
  children,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`rounded-sm border border-red-200 bg-red-50/60 p-6 text-left ${className}`}
      role="alert"
    >
      <span className="inline-block text-xs font-semibold text-status-err">{eyebrow}</span>
      <p className="mt-2 font-display text-xl font-semibold text-ink">{title}</p>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">{message}</p>
      {children}
      {retry && (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={retry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
