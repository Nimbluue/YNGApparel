import { createContext, useContext } from 'react';

export type ToastVariant = 'ok' | 'err' | 'warn' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastOptions {
  duration?: number;
  details?: string[];
  action?: ToastAction;
}

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  details?: string[];
  action?: ToastAction;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  toast: (
    message: string,
    variant?: ToastVariant,
    durationOrOptions?: number | ToastOptions
  ) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): Omit<ToastContextValue, 'toasts'> {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus digunakan di dalam ToastProvider.');
  return { toast: ctx.toast, dismiss: ctx.dismiss };
}
