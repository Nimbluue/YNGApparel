import { AnimatePresence, motion } from 'framer-motion';
import { useState, type MouseEventHandler, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';

const MotionLink = motion.create(Link);

export interface IconTooltipProps {
  label: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
  to?: string;
  href?: string;
  state?: unknown;
  badge?: number;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaHaspopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  tone?: 'light' | 'dark';
  tooltipPosition?: 'bottom' | 'top' | 'left';
  hideTooltip?: boolean;
}

/**
 * Pembungkus tombol/tautan ikon dengan tactile hover/tap dan tooltip ringkas.
 */
export function IconTooltip({
  label,
  children,
  onClick,
  to,
  href,
  state,
  badge,
  ariaExpanded,
  ariaControls,
  ariaHaspopup,
  buttonRef,
  className = '',
  tone = 'light',
  tooltipPosition = 'bottom',
  hideTooltip = false,
}: IconTooltipProps) {
  const [visible, setVisible] = useState(false);

  const hasBadge = typeof badge === 'number' && badge > 0;
  const accessibleLabel = hasBadge ? `${label} (${badge})` : label;

  const toneClasses =
    tone === 'dark'
      ? 'border border-white/15 bg-[#0B0B0B] text-white shadow-lg hover:bg-neutral-800 focus-visible:ring-white'
      : 'text-ink hover:bg-surface focus-visible:ring-neutral-900';

  const triggerClasses = [
    'relative inline-flex min-h-touch min-w-touch items-center justify-center rounded-sm transition-colors duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-1',
    toneClasses,
    className || 'h-11 w-11',
  ]
    .filter(Boolean)
    .join(' ');

  const tooltipPositionClass =
    tooltipPosition === 'left'
      ? 'right-full top-1/2 z-50 mr-2 -translate-y-1/2'
      : tooltipPosition === 'top'
        ? 'bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2'
        : 'left-1/2 top-full z-50 mt-1.5 -translate-x-1/2';

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
      {href ? (
        <motion.a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          aria-label={accessibleLabel}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className={triggerClasses}
        >
          {inner}
        </motion.a>
      ) : to ? (
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
          <div className={`pointer-events-none absolute ${tooltipPositionClass}`}>
            <motion.span
              role="tooltip"
              initial={{ opacity: 0, y: tooltipPosition === 'left' ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: tooltipPosition === 'left' ? 0 : 4 }}
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
