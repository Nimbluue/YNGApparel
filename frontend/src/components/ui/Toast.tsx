/**
 * Toast notification system — muncul di pojok kanan atas, auto-dismiss.
 * Gunakan hook useToast() untuk memicu notifikasi dari mana saja.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'ok' | 'err' | 'warn' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  ok: 'border-status-ok text-status-ok',
  err: 'border-status-err text-status-err',
  warn: 'border-status-warn text-status-warn',
  info: 'border-line-strong text-ink',
};

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
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
      className={`flex min-h-touch items-start justify-between gap-4 border-l-4 bg-surface px-4 py-3 ${VARIANT_CLASSES[item.variant]}`}
    >
      <p className="text-sm">{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Tutup notifikasi"
        className="min-h-touch min-w-touch shrink-0 text-sm text-muted hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

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
      {/* Toast container */}
      {toasts.length > 0 && (
        <div
          aria-live="assertive"
          className="fixed inset-x-3 top-3 z-[9999] flex flex-col gap-2 sm:left-auto sm:right-5 sm:top-5"
          style={{ maxWidth: 'min(360px, calc(100vw - 2rem))' }}
        >
          {toasts.map((item) => (
            <ToastItem key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): Omit<ToastContextValue, 'toasts'> {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus digunakan di dalam ToastProvider.');
  return { toast: ctx.toast, dismiss: ctx.dismiss };
}
