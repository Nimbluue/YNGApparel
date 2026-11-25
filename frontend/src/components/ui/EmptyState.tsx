/**
 * EmptyState — tampilkan ketika data katalog atau daftar kosong.
 */
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center ${className}`}
    >
      <p className="eyebrow">Belum ada data</p>
      <p className="mt-2 font-display text-xl font-semibold text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
