/**
 * Badge status semantik dengan bentuk pill proporsional dan kontras monokrom bersih.
 */
import {
  DESIGN_STATUS,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  type DesignStatus,
  type FulfillmentType,
  type PaymentStatus,
  type ProductionStatus,
} from '@yng/shared';
import type { ReactNode } from 'react';
import type { Locale } from '../../context/LanguageContext';
import {
  getLocalizedDesignStatusLabel,
  getLocalizedPaymentStatusLabel,
  getLocalizedProductionStatusLabel,
} from '../../utils/localizedLabels';

type BadgeVariant = 'neutral' | 'ok' | 'warn' | 'err' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'border-line bg-surface text-ink',
  ok: 'border-emerald-200 bg-emerald-50 text-status-ok',
  warn: 'border-amber-200 bg-amber-50 text-status-warn',
  err: 'border-red-200 bg-red-50 text-status-err',
  info: 'border-ink bg-ink text-white',
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-ink',
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  err: 'bg-status-err',
  info: 'bg-white',
};

export function Badge({ variant = 'neutral', children, className = '', dot = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 py-1 font-sans text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[variant]}`}
        />
      )}
      {children}
    </span>
  );
}

const PROD_STATUS_VARIANT: Record<ProductionStatus, BadgeVariant> = {
  [PRODUCTION_STATUS.NEW_ORDER]: 'info',
  [PRODUCTION_STATUS.PRINT_QUEUE]: 'warn',
  [PRODUCTION_STATUS.PRESSING_QC]: 'warn',
  [PRODUCTION_STATUS.AWAITING_SETTLEMENT]: 'warn',
  [PRODUCTION_STATUS.SHIPPING]: 'ok',
  [PRODUCTION_STATUS.COMPLETED]: 'ok',
  [PRODUCTION_STATUS.CANCELLED]: 'err',
};

interface ProductionBadgeProps {
  status: ProductionStatus;
  fulfillmentType?: FulfillmentType;
  locale?: Locale;
  className?: string;
}

export function ProductionBadge({
  status,
  fulfillmentType,
  locale = 'id',
  className,
}: ProductionBadgeProps) {
  return (
    <Badge variant={PROD_STATUS_VARIANT[status]} dot className={className}>
      {getLocalizedProductionStatusLabel(status, fulfillmentType, locale)}
    </Badge>
  );
}

const PAY_STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  [PAYMENT_STATUS.PENDING]: 'warn',
  [PAYMENT_STATUS.VERIFIED]: 'ok',
  [PAYMENT_STATUS.REJECTED]: 'err',
};

interface PaymentBadgeProps {
  status: PaymentStatus;
  proofImagePath?: string | null;
  locale?: Locale;
  className?: string;
}

export function PaymentBadge({
  status,
  proofImagePath,
  locale = 'id',
  className,
}: PaymentBadgeProps) {
  return (
    <Badge variant={PAY_STATUS_VARIANT[status]} dot className={className}>
      {getLocalizedPaymentStatusLabel(status, proofImagePath ?? null, locale)}
    </Badge>
  );
}

const DESIGN_STATUS_VARIANT: Record<DesignStatus, BadgeVariant> = {
  [DESIGN_STATUS.PENDING]: 'neutral',
  [DESIGN_STATUS.NEED_REVISION]: 'err',
  [DESIGN_STATUS.APPROVED]: 'ok',
};

interface DesignBadgeProps {
  status: DesignStatus;
  locale?: Locale;
  className?: string;
}

export function DesignBadge({ status, locale = 'id', className }: DesignBadgeProps) {
  return (
    <Badge variant={DESIGN_STATUS_VARIANT[status]} dot className={className}>
      {getLocalizedDesignStatusLabel(status, locale)}
    </Badge>
  );
}
