import { AnimatePresence, motion } from 'framer-motion';
import { useState, type MouseEventHandler, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';

const MotionLink = motion.create(Link);

export interface IconTooltipProps {
  label: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
  to?: string;
  state?: unknown;
  badge?: number;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaHaspopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  hideTooltip?: boolean;
}

/**
 * Pembungkus tombol/tautan ikon dengan tactile hover/tap dan tooltip ringkas di bawah ikon.
 */
export function IconTooltip({
  label,
  children,
  onClick,
  to,
  state,
  badge,
  ariaExpanded,
  ariaControls,
  ariaHaspopup,
  buttonRef,
  className = '',
  hideTooltip = false,
}: IconTooltipProps) {
  const [visible, setVisible] = useState(false);

  const hasBadge = typeof badge === 'number' && badge > 0;
  const accessibleLabel = hasBadge ? `${label} (${badge})` : label;

  const triggerClasses = [
    'relative inline-flex min-h-touch min-w-touch items-center justify-center rounded-sm text-ink transition-colors duration-150 hover:bg-surface',
    className || 'h-11 w-11',
  ]
    .filter(Boolean)
    .join(' ');

  const showHandlers = {
    onMouseEnter: () => setVisible(true),
    onMouseLeave: () => setVisible(false),
    onFocus: () => setVisible(true),
    onBlur: () => setVisible(false),
  };

  const inner = (
    <>
      {children}
      {hasBadge ? (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-sm bg-ink px-1 font-mono text-[10px] font-semibold leading-none text-white tabular-nums ring-2 ring-white"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="relative inline-flex items-center" {...showHandlers}>
      {to ? (
        <MotionLink
          to={to}
          state={state}
          onClick={onClick}
          aria-label={accessibleLabel}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className={triggerClasses}
        >
          {inner}
        </MotionLink>
      ) : (
        <motion.button
          ref={buttonRef}
          type="button"
          onClick={onClick}
          aria-label={accessibleLabel}
          aria-expanded={ariaExpanded}
          aria-controls={ariaControls}
          aria-haspopup={ariaHaspopup}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className={triggerClasses}
        >
          {inner}
        </motion.button>
      )}

      <AnimatePresence>
        {visible && !hideTooltip ? (
          <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2">
            <motion.span
              role="tooltip"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="block whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-[11px] font-medium tracking-[0.06em] text-white"
            >
              {label}
            </motion.span>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
