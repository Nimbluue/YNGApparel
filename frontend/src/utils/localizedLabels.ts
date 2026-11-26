import {
  DESIGN_STATUS,
  FULFILLMENT_TYPE,
  PAYMENT_SCHEME,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRINT_POSITION,
  PRINT_POSITION_LABELS,
  PRODUCTION_STATUS,
  getDesignStatusLabel,
  getFulfillmentLabel,
  getPaymentSchemeLabel,
  getPaymentStageLabel,
  getPaymentStatusLabel,
  getProductionStatusLabel,
  type DesignStatus,
  type FulfillmentType,
  type PaymentScheme,
  type PaymentStage,
  type PaymentStatus,
  type PrintPosition,
  type ProductionStatus,
  type Rupiah,
} from '@yng/shared';
import type { Locale } from '../context/LanguageContext';
import { formatRupiah } from './formatRupiah';

const EN_PRODUCTION_LABELS: Readonly<Record<ProductionStatus, string>> = {
  [PRODUCTION_STATUS.NEW_ORDER]: 'NEW ORDER & DESIGN CHECK',
  [PRODUCTION_STATUS.PRINT_QUEUE]: 'PRINTING QUEUE',
  [PRODUCTION_STATUS.PRESSING_QC]: 'PRESSING & QC',
  [PRODUCTION_STATUS.AWAITING_SETTLEMENT]: 'AWAITING SETTLEMENT',
  [PRODUCTION_STATUS.SHIPPING]: 'SHIPPING',
  [PRODUCTION_STATUS.COMPLETED]: 'COMPLETED',
  [PRODUCTION_STATUS.CANCELLED]: 'CANCELLED',
};

const EN_DESIGN_LABELS: Readonly<Record<DesignStatus, string>> = {
  [DESIGN_STATUS.PENDING]: 'PENDING REVIEW',
  [DESIGN_STATUS.NEED_REVISION]: 'NEEDS REVISION',
  [DESIGN_STATUS.APPROVED]: 'APPROVED',
};

const EN_FULFILLMENT_LABELS: Readonly<Record<FulfillmentType, string>> = {
  [FULFILLMENT_TYPE.SHIP]: 'DELIVERY',
  [FULFILLMENT_TYPE.PICKUP]: 'WORKSHOP PICKUP',
};

const EN_PRINT_POSITION_LABELS: Readonly<Record<PrintPosition, string>> = {
  [PRINT_POSITION.FRONT_CHEST]: 'Front Chest',
  [PRINT_POSITION.FRONT_CENTER]: 'Front Center',
  [PRINT_POSITION.BACK_CENTER]: 'Back Center',
  [PRINT_POSITION.BACK_UPPER]: 'Upper Back',
  [PRINT_POSITION.LEFT_SLEEVE]: 'Left Sleeve',
  [PRINT_POSITION.RIGHT_SLEEVE]: 'Right Sleeve',
  [PRINT_POSITION.COLLAR]: 'Collar',
  [PRINT_POSITION.OTHER]: 'Other',
};

export function getLocalizedProductionStatusLabel(
  status: ProductionStatus,
  fulfillmentType: FulfillmentType = FULFILLMENT_TYPE.SHIP,
  locale: Locale = 'id'
): string {
  if (locale !== 'en') {
    return getProductionStatusLabel(status, fulfillmentType);
  }
  if (status === PRODUCTION_STATUS.SHIPPING && fulfillmentType === FULFILLMENT_TYPE.PICKUP) {
    return 'READY FOR PICKUP';
  }
  return EN_PRODUCTION_LABELS[status] || status;
}

export function getLocalizedDesignStatusLabel(status: DesignStatus, locale: Locale = 'id'): string {
  if (locale !== 'en') {
    return getDesignStatusLabel(status);
  }
  return EN_DESIGN_LABELS[status] || status;
}

export function getLocalizedPaymentStatusLabel(
  status: PaymentStatus,
  proofImagePath: string | null = null,
  locale: Locale = 'id'
): string {
  if (locale !== 'en') {
    return getPaymentStatusLabel(status, proofImagePath);
  }
  if (status === PAYMENT_STATUS.PENDING) {
    return proofImagePath ? 'AWAITING VERIFICATION' : 'AWAITING PROOF';
  }
  if (status === PAYMENT_STATUS.VERIFIED) return 'VERIFIED';
  if (status === PAYMENT_STATUS.REJECTED) return 'REJECTED';
  return status;
}

export function getLocalizedPaymentStageLabel(
  stage: PaymentStage,
  dpPercentSnapshot: number | null = null,
  shippingCost = 0,
  locale: Locale = 'id'
): string {
  if (locale !== 'en') {
    return getPaymentStageLabel(stage, dpPercentSnapshot, shippingCost);
  }
  const pct = Number(dpPercentSnapshot);
  const hasPct = Number.isFinite(pct) && pct > 0 && pct < 100;

  if (stage === PAYMENT_STAGE.DP) {
    return hasPct ? `DEPOSIT ${pct}%` : 'DEPOSIT';
  }
  if (stage === PAYMENT_STAGE.SETTLEMENT) {
    const baseLabel = hasPct ? `BALANCE ${100 - pct}%` : 'FINAL BALANCE';
    return Number(shippingCost) > 0 ? `${baseLabel} + SHIPPING` : baseLabel;
  }
  if (stage === PAYMENT_STAGE.FULL) return 'FULL PAYMENT';
  if (stage === PAYMENT_STAGE.SHIPPING_FEE) return 'SHIPPING FEE';
  return stage;
}

export function getLocalizedPaymentSchemeLabel(
  scheme: PaymentScheme,
  dpPercentSnapshot: number | null = null,
  locale: Locale = 'id'
): string {
  if (locale !== 'en') {
    return getPaymentSchemeLabel(scheme, dpPercentSnapshot);
  }
  if (scheme === PAYMENT_SCHEME.FULL) return 'FULL PAYMENT';
  if (scheme === PAYMENT_SCHEME.DP) {
    const pct = Number(dpPercentSnapshot);
    return Number.isFinite(pct) && pct > 0 && pct < 100 ? `DEPOSIT ${pct}%` : 'DEPOSIT';
  }
  return scheme;
}

export function getLocalizedFulfillmentLabel(
  fulfillmentType: FulfillmentType,
  locale: Locale = 'id'
): string {
  if (locale !== 'en') {
    return getFulfillmentLabel(fulfillmentType);
  }
  return EN_FULFILLMENT_LABELS[fulfillmentType] || fulfillmentType;
}

export function getLocalizedPrintPositionLabel(
  position: PrintPosition,
  locale: Locale = 'id'
): string {
  if (locale !== 'en') {
    return PRINT_POSITION_LABELS[position] || position;
  }
  return EN_PRINT_POSITION_LABELS[position] || position;
}

export function formatLocalizedWibDateTime(
  value: string | null | undefined,
  locale: Locale = 'id'
): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (
    new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date) + ' WIB'
  );
}

export function formatLocalizedWibDate(
  value: string | null | undefined,
  locale: Locale = 'id'
): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatLocalizedShippingCostLabel(
  input: {
    fulfillmentType: FulfillmentType;
    shippingCost: Rupiah | null | undefined;
    productionStatus: ProductionStatus;
  },
  locale: Locale = 'id'
): string {
  if (input.fulfillmentType === FULFILLMENT_TYPE.PICKUP) {
    return locale === 'en' ? 'Free (Workshop Pickup)' : 'Gratis (Ambil di Workshop)';
  }
  const cost = Number(input.shippingCost ?? 0);
  if (cost > 0) {
    return formatRupiah(cost);
  }
  if (
    input.productionStatus === PRODUCTION_STATUS.NEW_ORDER ||
    input.productionStatus === PRODUCTION_STATUS.PRINT_QUEUE ||
    input.productionStatus === PRODUCTION_STATUS.PRESSING_QC
  ) {
    return locale === 'en' ? 'Pending QC' : 'Menunggu QC';
  }
  return formatRupiah(0);
}
