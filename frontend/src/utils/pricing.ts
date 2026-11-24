import {
  PAYMENT_SCHEME,
  getPaymentSchemeLabel,
  type PaymentScheme,
  type PublicCatalogConfigDto,
  type PublicFabricDto,
  type PublicGarmentModelDto,
  type PublicPrintSizeDto,
  type PublicSizeDto,
  type Rupiah,
} from '@yng/shared';

export interface LocalSizeQuantity {
  size: PublicSizeDto;
  qty: number;
}

export interface LocalSizeBreakdown {
  sizeId: number;
  sizeCode: string;
  qty: number;
  extraCharge: Rupiah;
  unitPrice: Rupiah;
  lineTotal: Rupiah;
}

export interface LocalPricingEstimate {
  basePrice: Rupiah;
  fabricAdditionalPrice: Rupiah;
  printSpotsTotal: Rupiah;
  totalQty: number;
  subtotalAmount: Rupiah;
  dpEligible: boolean;
  dpMinQty: number;
  dpPercent: number;
  dpAmount: Rupiah;
  settlementAmount: Rupiah;
  fullLabel: string;
  dpLabel: string;
  sizeBreakdowns: LocalSizeBreakdown[];
}

export interface LocalEstimateInput {
  model: PublicGarmentModelDto | null;
  fabric: PublicFabricDto | null;
  sizes: readonly PublicSizeDto[];
  quantities: Readonly<Record<number, number>>;
  selectedPrintSizes: readonly PublicPrintSizeDto[];
  config: Pick<PublicCatalogConfigDto, 'dpMinQty' | 'dpPercent'>;
}

function toRupiahInt(value: number): Rupiah {
  return Math.round(Number(value) || 0);
}

/**
 * Estimasi harga instan di browser untuk pengalaman UX yang responsif.
 * Sumber kebenaran harga tetap dihitung ulang oleh server (`POST /api/pricing/quote`).
 */
export function estimateCustomLabPricing(input: LocalEstimateInput): LocalPricingEstimate {
  const basePrice = input.model ? toRupiahInt(input.model.basePrice) : 0;
  const fabricAdditionalPrice = input.fabric ? toRupiahInt(input.fabric.additionalPrice) : 0;
  const printSpotsTotal = input.selectedPrintSizes.reduce(
    (sum, spot) => sum + toRupiahInt(spot.pricePerSpot),
    0
  );

  const sizeBreakdowns: LocalSizeBreakdown[] = [];
  let totalQty = 0;
  let subtotalAmount = 0;

  if (input.model && input.fabric) {
    for (const size of input.sizes) {
      const rawQty = input.quantities[size.id] ?? 0;
      const qty = Number.isInteger(rawQty) && rawQty > 0 ? rawQty : 0;
      if (qty === 0) continue;

      const extraCharge = toRupiahInt(size.extraCharge);
      const unitPrice = basePrice + fabricAdditionalPrice + extraCharge + printSpotsTotal;
      const lineTotal = qty * unitPrice;

      totalQty += qty;
      subtotalAmount += lineTotal;
      sizeBreakdowns.push({
        sizeId: size.id,
        sizeCode: size.code,
        qty,
        extraCharge,
        unitPrice,
        lineTotal,
      });
    }
  } else {
    for (const size of input.sizes) {
      const rawQty = input.quantities[size.id] ?? 0;
      if (Number.isInteger(rawQty) && rawQty > 0) {
        totalQty += rawQty;
      }
    }
  }

  const dpMinQty = Math.max(1, Math.round(Number(input.config.dpMinQty) || 1));
  const dpPercent = Math.min(99, Math.max(1, Math.round(Number(input.config.dpPercent) || 70)));
  const dpEligible = totalQty >= dpMinQty;
  const dpAmount = Math.round((subtotalAmount * dpPercent) / 100);
  const settlementAmount = subtotalAmount - dpAmount;

  return {
    basePrice,
    fabricAdditionalPrice,
    printSpotsTotal,
    totalQty,
    subtotalAmount,
    dpEligible,
    dpMinQty,
    dpPercent,
    dpAmount,
    settlementAmount,
    fullLabel: getPaymentSchemeLabel(PAYMENT_SCHEME.FULL),
    dpLabel: getPaymentSchemeLabel(PAYMENT_SCHEME.DP, dpPercent),
    sizeBreakdowns,
  };
}

export function resolveActivePaymentScheme(
  selectedScheme: PaymentScheme,
  dpEligible: boolean
): PaymentScheme {
  if (!dpEligible && selectedScheme === PAYMENT_SCHEME.DP) {
    return PAYMENT_SCHEME.FULL;
  }
  return selectedScheme;
}
