/**
 * Badge status semantik dengan aksen hemat dan penanda yang mudah dibaca.
 */
import type { ReactNode } from 'react';

type BadgeVariant = 'neutral' | 'ok' | 'warn' | 'err' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'border-line-strong text-ink bg-surface',
  ok: 'border-status-ok text-status-ok bg-surface',
  warn: 'border-status-warn text-status-warn bg-surface',
  err: 'border-status-err text-status-err bg-surface',
  info: 'border-accent text-ink bg-accent',
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-ink',
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  err: 'bg-status-err',
  info: 'bg-ink',
};

export function Badge({ variant = 'neutral', children, className = '', dot = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-2 border px-2.5 py-1 font-mono text-xs ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 shrink-0 ${DOT_CLASSES[variant]}`}
        />
      )}
      {children}
    </span>
  );
}

/**
 * Badge khusus untuk status produksi — mapping dari PRODUCTION_STATUS ke variant.
 */
import type { ProductionStatus } from '@yng/shared';
import { PRODUCTION_STATUS, getProductionStatusLabel, type FulfillmentType } from '@yng/shared';

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
  className?: string;
}

export function ProductionBadge({ status, fulfillmentType, className }: ProductionBadgeProps) {
  return (
    <Badge variant={PROD_STATUS_VARIANT[status]} dot className={className}>
      {getProductionStatusLabel(status, fulfillmentType)}
    </Badge>
  );
}

/**
 * Badge untuk status pembayaran.
 */
import type { PaymentStatus } from '@yng/shared';
import { PAYMENT_STATUS, getPaymentStatusLabel } from '@yng/shared';

const PAY_STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  [PAYMENT_STATUS.PENDING]: 'warn',
  [PAYMENT_STATUS.VERIFIED]: 'ok',
  [PAYMENT_STATUS.REJECTED]: 'err',
};

interface PaymentBadgeProps {
  status: PaymentStatus;
  proofImagePath?: string | null;
  className?: string;
}

export function PaymentBadge({ status, proofImagePath, className }: PaymentBadgeProps) {
  return (
    <Badge variant={PAY_STATUS_VARIANT[status]} dot className={className}>
      {getPaymentStatusLabel(status, proofImagePath ?? null)}
    </Badge>
  );
}

/**
 * Badge untuk status desain.
 */
import type { DesignStatus } from '@yng/shared';
import { DESIGN_STATUS, getDesignStatusLabel } from '@yng/shared';

const DESIGN_STATUS_VARIANT: Record<DesignStatus, BadgeVariant> = {
  [DESIGN_STATUS.PENDING]: 'neutral',
  [DESIGN_STATUS.NEED_REVISION]: 'err',
  [DESIGN_STATUS.APPROVED]: 'ok',
};

interface DesignBadgeProps {
  status: DesignStatus;
  className?: string;
}

export function DesignBadge({ status, className }: DesignBadgeProps) {
  return (
    <Badge variant={DESIGN_STATUS_VARIANT[status]} dot className={className}>
      {getDesignStatusLabel(status)}
    </Badge>
  );
}
