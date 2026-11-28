/**
 * Editorial Light Toast notification system — muncul di tengah atas layar (top-center) di bawah Navbar,
 * dengan kartu putih elevated berkontras tinggi, aksen kiri 3px, badge ikon semantik, framer-motion spring,
 * progress bar 2px, pause-on-hover/focus, stacking maks 3, dan tombol aksi opsional.
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

const VARIANT_STYLES: Record<
  ToastVariant,
  { accentBar: string; progressBar: string; iconBadge: string; iconText: string }
> = {
  ok: {
    accentBar: 'bg-[#059669]',
    progressBar: 'bg-[#059669]',
    iconBadge: 'bg-[#ECFDF5]',
    iconText: 'text-[#059669]',
  },
  warn: {
    accentBar: 'bg-[#D97706]',
    progressBar: 'bg-[#D97706]',
    iconBadge: 'bg-[#FFFBEB]',
    iconText: 'text-[#D97706]',
  },
  err: {
    accentBar: 'bg-[#DC2626]',
    progressBar: 'bg-[#DC2626]',
    iconBadge: 'bg-[#FEF2F2]',
    iconText: 'text-[#DC2626]',
  },
  info: {
    accentBar: 'bg-[#111111]',
    progressBar: 'bg-[#111111]',
    iconBadge: 'bg-[#F5F5F5]',
    iconText: 'text-[#111111]',
  },
};

function ToastVariantIcon({ variant }: { variant: ToastVariant }) {
  const style = VARIANT_STYLES[variant];
  const Icon =
    variant === 'ok'
      ? Check
      : variant === 'warn'
        ? AlertCircle
        : variant === 'err'
          ? XCircle
          : Info;

  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm ${style.iconBadge} ${style.iconText}`}
      aria-hidden="true"
    >
      <Icon size={15} strokeWidth={1.75} />
    </span>
  );
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

  const style = VARIANT_STYLES[item.variant];

  return (
    <motion.div
      layout
      role={item.variant === 'err' ? 'alert' : 'status'}
      aria-live={item.variant === 'err' ? 'assertive' : 'polite'}
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      className="pointer-events-auto relative overflow-hidden rounded-sm border border-neutral-200/90 bg-white/95 text-neutral-900 shadow-xl backdrop-blur-md"
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${style.accentBar}`} />

      <div className="flex items-start gap-3 py-3 pl-4 pr-3">
        <ToastVariantIcon variant={item.variant} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-neutral-900">{item.message}</p>

          {item.details && item.details.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-snug text-neutral-600">
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
                className="inline-flex items-center rounded-sm bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 disabled:opacity-50"
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
          className="-mr-1 -mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900"
        >
          <X size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div
        aria-hidden="true"
        className="absolute bottom-0 left-[3px] right-0 h-[2px] bg-neutral-200/70"
      >
        <div
          className={`h-full origin-left ${style.progressBar}`}
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
          className="pointer-events-none fixed left-1/2 top-20 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-2.5"
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
