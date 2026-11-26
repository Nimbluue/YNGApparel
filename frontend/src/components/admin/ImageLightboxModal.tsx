import { useEffect } from 'react';

interface ImageLightboxModalProps {
  open: boolean;
  imageUrl: string | null;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
}

/**
 * Lightbox gambar penuh untuk meninjau bukti transfer, foto QC, atau file desain.
 */
export function ImageLightboxModal({
  open,
  imageUrl,
  title,
  subtitle,
  onClose,
}: ImageLightboxModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-3 backdrop-blur-xs sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-touch items-center rounded-full border border-line-strong px-3.5 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-surface"
            >
              Tab Baru ↗
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pratinjau gambar"
              className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-full border border-line text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-neutral-950 p-3 sm:p-6">
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[76vh] w-auto max-w-full rounded-lg object-contain"
          />
        </div>
      </div>
    </div>
  );
}
