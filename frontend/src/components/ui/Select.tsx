/**
 * Select reusable bergaya bersih monokrom dengan target sentuh >= 44px.
 */
import { forwardRef, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, placeholder, className = '', id, children, ...props },
  ref
) {
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        {...props}
        className={`input-sharp appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%23111111' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")] bg-[right_0.75rem_center] bg-no-repeat pr-9 ${error ? 'border-status-err focus:border-status-err focus:ring-status-err' : ''} ${className}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${selectId}-err` : undefined}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      {error && (
        <p id={`${selectId}-err`} className="text-xs font-medium text-status-err" role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
});
