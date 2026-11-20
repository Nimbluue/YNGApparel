interface AdminFeedbackBannerProps {
  variant: 'error' | 'success';
  message: string;
  details?: string[];
  onDismiss?: () => void;
}

export function AdminFeedbackBanner({
  variant,
  message,
  details = [],
  onDismiss,
}: AdminFeedbackBannerProps) {
  const isError = variant === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 border bg-surface px-4 py-3 text-sm ${
        isError ? 'border-status-err text-status-err' : 'border-status-ok text-status-ok'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
        {details.length > 0 ? (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
            {details.map((item, idx) => (
              <li key={`${idx}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-touch items-center px-2 font-mono text-xs uppercase tracking-[0.1em] text-ink hover:underline"
          aria-label="Tutup pesan"
        >
          Tutup
        </button>
      ) : null}
    </div>
  );
}

export function ActiveStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] ${
        isActive ? 'border-status-ok text-status-ok' : 'border-line-strong text-muted'
      }`}
    >
      {isActive ? 'AKTIF' : 'NONAKTIF'}
    </span>
  );
}
