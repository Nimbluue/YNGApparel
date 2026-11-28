/**
 * Skeleton loading placeholder.
 */
interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className = '', lines = 1 }: SkeletonProps) {
  if (lines > 1) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`h-4 animate-pulse rounded-sm bg-line ${i === lines - 1 ? 'w-3/4' : 'w-full'} ${className}`}
          />
        ))}
      </div>
    );
  }
  return <div className={`animate-pulse rounded-sm bg-line ${className}`} />;
}

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-sm border border-line bg-white p-5 ${className}`}>
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-3 h-6 w-2/3" />
      <Skeleton lines={2} />
    </div>
  );
}
