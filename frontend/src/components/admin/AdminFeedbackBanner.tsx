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
      className={`flex items-start justify-between gap-3 border-l-4 bg-transparent px-4 py-3 text-base ${
        isError ? 'border-status-err text-status-err' : 'border-status-ok text-status-ok'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
        {details.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
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
          className="inline-flex min-h-touch items-center px-2 font-mono text-sm text-ink hover:underline"
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
      className={`inline-flex min-h-7 items-center border px-2.5 py-1 font-mono text-xs ${
        isActive ? 'border-status-ok bg-status-ok text-white' : 'border-line-strong text-muted'
      }`}
    >
      {isActive ? 'AKTIF' : 'NONAKTIF'}
    </span>
  );
}
