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
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        isError
          ? 'border-red-200 bg-red-50/70 text-status-err'
          : 'border-emerald-200 bg-emerald-50/70 text-status-ok'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
        {details.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
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
          className="inline-flex min-h-touch items-center rounded-full px-3 text-xs font-medium text-ink transition-colors hover:bg-white"
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
      className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-medium ${
        isActive
          ? 'border-emerald-200 bg-emerald-50 text-status-ok'
          : 'border-line bg-surface text-muted'
      }`}
    >
      {isActive ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}
