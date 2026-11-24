/**
 * Skeleton loading placeholder — satu atau beberapa baris.
 */
interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className = '', lines = 1 }: SkeletonProps) {
  if (lines > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`animate-pulse bg-line ${i === lines - 1 ? 'w-3/4' : 'w-full'} h-4 ${className}`}
          />
        ))}
      </div>
    );
  }
  return <div className={`animate-pulse bg-line ${className}`} />;
}

/**
 * Skeleton untuk kartu (card-sharp style).
 */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`border-t border-line py-5 ${className}`}>
      <Skeleton className="mb-3 h-3 w-20" />
      <Skeleton className="mb-2 h-5 w-full" />
      <Skeleton lines={2} />
    </div>
  );
}
