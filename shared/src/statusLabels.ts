import {
  DESIGN_STATUS,
  FULFILLMENT_TYPE,
  PAYMENT_SCHEME,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRINT_POSITION,
  PRODUCTION_STATUS,
  type DesignStatus,
  type FulfillmentType,
  type PaymentScheme,
  type PaymentStage,
  type PaymentStatus,
  type PrintPosition,
  type ProductionStatus,
} from './enums.js';

export const PRODUCTION_STATUS_LABELS: Readonly<Record<ProductionStatus, string>> = {
  [PRODUCTION_STATUS.NEW_ORDER]: 'ORDER MASUK & CEK DESAIN',
  [PRODUCTION_STATUS.PRINT_QUEUE]: 'ANTREAN CETAK SABLON',
  [PRODUCTION_STATUS.PRESSING_QC]: 'PRESSING & QC',
  [PRODUCTION_STATUS.AWAITING_SETTLEMENT]: 'MENUNGGU PELUNASAN',
  [PRODUCTION_STATUS.SHIPPING]: 'PENGIRIMAN',
  [PRODUCTION_STATUS.COMPLETED]: 'SELESAI',
  [PRODUCTION_STATUS.CANCELLED]: 'DIBATALKAN',
};

export const DESIGN_STATUS_LABELS: Readonly<Record<DesignStatus, string>> = {
  [DESIGN_STATUS.PENDING]: 'MENUNGGU CEK',
  [DESIGN_STATUS.NEED_REVISION]: 'PERLU REVISI',
  [DESIGN_STATUS.APPROVED]: 'DISETUJUI',
};

export const FULFILLMENT_LABELS: Readonly<Record<FulfillmentType, string>> = {
  [FULFILLMENT_TYPE.SHIP]: 'KIRIM',
  [FULFILLMENT_TYPE.PICKUP]: 'AMBIL DI TEMPAT',
};

export const PRINT_POSITION_LABELS: Readonly<Record<PrintPosition, string>> = {
  [PRINT_POSITION.FRONT_CHEST]: 'Dada Depan',
  [PRINT_POSITION.FRONT_CENTER]: 'Tengah Depan',
  [PRINT_POSITION.BACK_CENTER]: 'Punggung Tengah',
  [PRINT_POSITION.BACK_UPPER]: 'Punggung Atas',
  [PRINT_POSITION.LEFT_SLEEVE]: 'Lengan Kiri',
  [PRINT_POSITION.RIGHT_SLEEVE]: 'Lengan Kanan',
  [PRINT_POSITION.COLLAR]: 'Kerah',
  [PRINT_POSITION.OTHER]: 'Lainnya',
};

export function getProductionStatusLabel(
  status: ProductionStatus,
  fulfillmentType: FulfillmentType = FULFILLMENT_TYPE.SHIP
): string {
  if (status === PRODUCTION_STATUS.SHIPPING && fulfillmentType === FULFILLMENT_TYPE.PICKUP) {
    return 'SIAP DIAMBIL';
  }
  return PRODUCTION_STATUS_LABELS[status] || status;
}

export function getDesignStatusLabel(status: DesignStatus): string {
  return DESIGN_STATUS_LABELS[status] || status;
}

export function getPaymentStatusLabel(
  status: PaymentStatus,
  proofImagePath: string | null = null
): string {
  if (status === PAYMENT_STATUS.PENDING) {
    return proofImagePath ? 'MENUNGGU VERIFIKASI' : 'MENUNGGU BUKTI';
  }
  if (status === PAYMENT_STATUS.VERIFIED) return 'TERVERIFIKASI';
  if (status === PAYMENT_STATUS.REJECTED) return 'DITOLAK';
  return status;
}

export function getPaymentStageLabel(
  stage: PaymentStage,
  dpPercentSnapshot: number | null = null,
  shippingCost = 0
): string {
  const pct = Number(dpPercentSnapshot);
  const hasPct = Number.isFinite(pct) && pct > 0 && pct < 100;

  if (stage === PAYMENT_STAGE.DP) {
    return hasPct ? `DP ${pct}%` : 'DP';
  }
  if (stage === PAYMENT_STAGE.SETTLEMENT) {
    const baseLabel = hasPct ? `PELUNASAN ${100 - pct}%` : 'PELUNASAN';
    return Number(shippingCost) > 0 ? `${baseLabel} + ONGKIR` : baseLabel;
  }
  if (stage === PAYMENT_STAGE.FULL) return 'LUNAS';
  if (stage === PAYMENT_STAGE.SHIPPING_FEE) return 'ONGKIR';
  return stage;
}

export function getPaymentSchemeLabel(
  scheme: PaymentScheme,
  dpPercentSnapshot: number | null = null
): string {
  if (scheme === PAYMENT_SCHEME.FULL) return 'LUNAS';
  if (scheme === PAYMENT_SCHEME.DP) {
    const pct = Number(dpPercentSnapshot);
    return Number.isFinite(pct) && pct > 0 && pct < 100 ? `DP ${pct}%` : 'DP';
  }
  return scheme;
}

export function getFulfillmentLabel(fulfillmentType: FulfillmentType): string {
  return FULFILLMENT_LABELS[fulfillmentType] || fulfillmentType;
}
