/**
 * Editorial Dark Toast notification system — muncul di pojok kiri bawah desktop (aman di mobile 360px),
 * dengan framer-motion spring, progress bar 2px, pause-on-hover, stacking maks 3, dan tombol aksi opsional.
 */
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { AlertCircle, Check, Info, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ToastContext,
  type ToastItem as ToastEntry,
  type ToastOptions,
  type ToastVariant,
} from './toastContext';

const MAX_VISIBLE_TOASTS = 3;

const PROGRESS_CLASSES: Record<ToastVariant, string> = {
  ok: 'bg-emerald-400/80',
  warn: 'bg-amber-400/80',
  err: 'bg-rose-400/80',
  info: 'bg-white/60',
};

function ToastVariantIcon({ variant }: { variant: ToastVariant }) {
  switch (variant) {
    case 'ok':
      return (
        <Check
          size={16}
          strokeWidth={1.5}
          className="shrink-0 text-emerald-400"
          aria-hidden="true"
        />
      );
    case 'warn':
      return (
        <AlertCircle
          size={16}
          strokeWidth={1.5}
          className="shrink-0 text-amber-400"
          aria-hidden="true"
        />
      );
    case 'err':
      return (
        <XCircle
          size={16}
          strokeWidth={1.5}
          className="shrink-0 text-rose-400"
          aria-hidden="true"
        />
      );
    default:
      return (
        <Info
          size={16}
          strokeWidth={1.5}
          className="shrink-0 text-neutral-300"
          aria-hidden="true"
        />
      );
  }
}

function ToastRow({ item, onDismiss }: { item: ToastEntry; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(1);
  const [runningAction, setRunningAction] = useState(false);

  const remainingMsRef = useRef(item.duration);
  const lastFrameRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const dismissedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused) {
      lastFrameRef.current = performance.now();
    }
  }, [paused]);

  useEffect(() => {
    remainingMsRef.current = item.duration;
    lastFrameRef.current = performance.now();
    dismissedRef.current = false;
    setProgress(1);

    let rafId = 0;

    const tick = (now: number) => {
      if (dismissedRef.current) return;

      if (!pausedRef.current) {
        const last = lastFrameRef.current ?? now;
        const delta = Math.max(0, now - last);
        remainingMsRef.current = Math.max(0, remainingMsRef.current - delta);
        const ratio = item.duration > 0 ? remainingMsRef.current / item.duration : 0;
        setProgress(ratio);

        if (remainingMsRef.current <= 0) {
          dismissedRef.current = true;
          onDismissRef.current(item.id);
          return;
        }
      }

      lastFrameRef.current = now;
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [item.duration, item.id]);

  async function handleActionClick() {
    if (!item.action || runningAction) return;
    setRunningAction(true);
    try {
      await item.action.onClick();
    } finally {
      setRunningAction(false);
      dismissedRef.current = true;
      onDismissRef.current(item.id);
    }
  }

  return (
    <motion.div
      layout
      role={item.variant === 'err' ? 'alert' : 'status'}
      aria-live={item.variant === 'err' ? 'assertive' : 'polite'}
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto relative overflow-hidden rounded-sm border border-white/10 bg-[#111111] px-4 py-3 text-white shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <ToastVariantIcon variant={item.variant} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-relaxed text-white sm:text-[13px]">
            {item.message}
          </p>

          {item.details && item.details.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-neutral-300">
              {item.details.slice(0, 3).map((detail, idx) => (
                <li key={`${idx}-${detail}`}>{detail}</li>
              ))}
            </ul>
          ) : null}

          {item.action ? (
            <div className="mt-2.5">
              <button
                type="button"
                disabled={runningAction}
                onClick={() => void handleActionClick()}
                className="inline-flex items-center rounded-sm border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-white hover:text-[#111111] disabled:opacity-50"
              >
                {item.action.label}
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            dismissedRef.current = true;
            onDismissRef.current(item.id);
          }}
          aria-label="Tutup notifikasi"
          className="-mr-1 -mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
        <div
          className={`h-full origin-left ${PROGRESS_CLASSES[item.variant]}`}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (
      message: string,
      variant: ToastVariant = 'info',
      durationOrOptions?: number | ToastOptions
    ): string => {
      const id = crypto.randomUUID();
      const options: ToastOptions =
        typeof durationOrOptions === 'number'
          ? { duration: durationOrOptions }
          : (durationOrOptions ?? {});

      const duration =
        options.duration ??
        (options.action
          ? 6000
          : variant === 'err' && options.details && options.details.length > 0
            ? 5500
            : 4000);

      const nextItem: ToastEntry = {
        id,
        message,
        variant,
        duration,
        ...(options.details && options.details.length > 0 ? { details: options.details } : {}),
        ...(options.action ? { action: options.action } : {}),
      };

      setToasts((prev) => [...prev, nextItem].slice(-MAX_VISIBLE_TOASTS));
      return id;
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <MotionConfig reducedMotion="user">
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-3 bottom-4 z-[9999] flex flex-col gap-2.5 sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[380px]"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {toasts.map((item) => (
              <ToastRow key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </ToastContext.Provider>
  );
}
