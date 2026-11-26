/**
 * Toast notification system — muncul di pojok kanan atas, auto-dismiss.
 * Gunakan hook useToast() dari `./toastContext` untuk memicu notifikasi dari mana saja.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastItem as ToastEntry, type ToastVariant } from './toastContext';

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  ok: 'border-l-4 border-l-status-ok text-ink',
  err: 'border-l-4 border-l-status-err text-status-err',
  warn: 'border-l-4 border-l-status-warn text-ink',
  info: 'border-l-4 border-l-ink text-ink',
};

function ToastRow({ item, onDismiss }: { item: ToastEntry; onDismiss: () => void }) {
  const duration = item.duration ?? 4000;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-touch items-center justify-between gap-3 rounded-sm border border-line bg-white px-4 py-2.5 shadow-sm ${VARIANT_CLASSES[item.variant]}`}
    >
      <p className="text-sm font-medium">{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Tutup notifikasi"
        className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-sm text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info', duration?: number) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant, duration }]);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="assertive"
          className="fixed inset-x-3 top-3 z-[9999] flex flex-col gap-2 sm:left-auto sm:right-5 sm:top-5"
          style={{ maxWidth: 'min(360px, calc(100vw - 2rem))' }}
        >
          {toasts.map((item) => (
            <ToastRow key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
