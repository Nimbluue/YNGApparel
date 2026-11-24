/**
 * Modal / Drawer — dialog dengan overlay untuk desktop, bottom sheet untuk mobile.
 * Aksesibilitas: focus trap, aria-modal, ESC untuk tutup.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // ESC untuk tutup
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Cegah scroll body saat modal terbuka
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-desc' : undefined}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-ink/75" onClick={onClose} aria-hidden="true" />

      {/* Panel — bottom sheet mobile, centered dialog desktop */}
      <div
        ref={dialogRef}
        className={`relative w-full border-2 border-ink bg-bone ${SIZE_CLASSES[size]} max-h-[90vh] overflow-y-auto`}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-line p-5">
            <div>
              {title && (
                <h2
                  id="modal-title"
                  className="font-display text-xl font-bold tracking-tightest text-ink"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-desc" className="mt-2 text-base text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup dialog"
              className="ml-4 inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center border border-line-strong text-muted hover:bg-ink hover:text-bone"
            >
              ✕
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5">{children}</div>

        {/* Footer */}
        {footer && <div className="border-t-2 border-ink p-5">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Dialog konfirmasi sederhana.
 */
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-neutral-600">{message}</p>
    </Modal>
  );
}
