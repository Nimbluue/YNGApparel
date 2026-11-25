/**
 * Spinner loading — dipakai di suspense atau loading tingkat halaman.
 */
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const SIZE_MAP = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-10 w-10' };

export function Spinner({ size = 'md', className = '', label = 'Memuat...' }: SpinnerProps) {
  return (
    <div role="status" aria-label={label} className={`inline-flex ${className}`}>
      <span
        aria-hidden="true"
        className={`animate-spin rounded-full border-2 border-ink border-t-transparent ${SIZE_MAP[size]}`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function PageLoader({ message = 'Memuat...' }: { message?: string }) {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="eyebrow">{message}</p>
    </div>
  );
}
