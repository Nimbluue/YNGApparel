/**
 * EmptyState — tampilkan ketika data kosong (list kosong, belum ada pesanan, dll).
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
    <div className={`relative py-12 text-left ${className}`}>
      {/* garis dekoratif */}
      <span aria-hidden="true" className="mb-3 block font-mono text-2xl text-accent">
        +
      </span>
      <p className="font-display text-2xl font-bold tracking-tightest text-ink">{title}</p>
      {description && <p className="mt-2 max-w-md text-base text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
