/**
 * Input & Textarea reusable bergaya bersih monokrom dengan fokus tegas.
 */
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className = '', id, ...props },
  ref
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        {...props}
        className={`input-sharp ${error ? 'border-status-err focus:border-status-err focus:ring-status-err' : ''} ${className}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-err` : undefined}
      />
      {error && (
        <p id={`${inputId}-err`} className="text-xs font-medium text-status-err" role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className = '', id, ...props },
  ref
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        {...props}
        className={`input-sharp resize-y ${error ? 'border-status-err focus:border-status-err focus:ring-status-err' : ''} ${className}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-err` : undefined}
      />
      {error && (
        <p id={`${inputId}-err`} className="text-xs font-medium text-status-err" role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
});
