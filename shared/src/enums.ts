export const PAYMENT_METHOD = {
  QRIS: 'QRIS',
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const ORDER_SOURCE = {
  WEBSITE: 'WEBSITE',
  WHATSAPP: 'WHATSAPP',
  INSTAGRAM: 'INSTAGRAM',
  MANUAL: 'MANUAL',
} as const;
export type OrderSource = (typeof ORDER_SOURCE)[keyof typeof ORDER_SOURCE];

export const FULFILLMENT_TYPE = {
  SHIP: 'SHIP',
  PICKUP: 'PICKUP',
} as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPE)[keyof typeof FULFILLMENT_TYPE];

export const PAYMENT_SCHEME = {
  FULL: 'FULL',
  DP: 'DP',
} as const;
export type PaymentScheme = (typeof PAYMENT_SCHEME)[keyof typeof PAYMENT_SCHEME];

export const PAYMENT_STAGE = {
  DP: 'DP',
  SETTLEMENT: 'SETTLEMENT',
  FULL: 'FULL',
  SHIPPING_FEE: 'SHIPPING_FEE',
} as const;
export type PaymentStage = (typeof PAYMENT_STAGE)[keyof typeof PAYMENT_STAGE];

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PRODUCTION_STATUS = {
  NEW_ORDER: 'NEW_ORDER',
  PRINT_QUEUE: 'PRINT_QUEUE',
  PRESSING_QC: 'PRESSING_QC',
  AWAITING_SETTLEMENT: 'AWAITING_SETTLEMENT',
  SHIPPING: 'SHIPPING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ProductionStatus = (typeof PRODUCTION_STATUS)[keyof typeof PRODUCTION_STATUS];

export const DESIGN_STATUS = {
  PENDING: 'PENDING',
  NEED_REVISION: 'NEED_REVISION',
  APPROVED: 'APPROVED',
} as const;
export type DesignStatus = (typeof DESIGN_STATUS)[keyof typeof DESIGN_STATUS];

export const PRINT_POSITION = {
  FRONT_CHEST: 'FRONT_CHEST',
  FRONT_CENTER: 'FRONT_CENTER',
  BACK_CENTER: 'BACK_CENTER',
  BACK_UPPER: 'BACK_UPPER',
  LEFT_SLEEVE: 'LEFT_SLEEVE',
  RIGHT_SLEEVE: 'RIGHT_SLEEVE',
  COLLAR: 'COLLAR',
  OTHER: 'OTHER',
} as const;
export type PrintPosition = (typeof PRINT_POSITION)[keyof typeof PRINT_POSITION];

export const DPI_STATUS = {
  OK: 'OK',
  WARNING: 'WARNING',
  LOW: 'LOW',
  UNKNOWN: 'UNKNOWN',
} as const;
export type DpiStatus = (typeof DPI_STATUS)[keyof typeof DPI_STATUS];

export const COLLECTIVE_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CHECKED_OUT: 'CHECKED_OUT',
  EXPIRED: 'EXPIRED',
} as const;
export type CollectiveStatus = (typeof COLLECTIVE_STATUS)[keyof typeof COLLECTIVE_STATUS];
