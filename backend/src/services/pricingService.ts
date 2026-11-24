import {
  getPaymentSchemeLabel,
  PAYMENT_SCHEME,
  PRINT_POSITION,
  type PaymentScheme,
  type PricingPaymentSchemeOptionDto,
  type PricingQuoteItemBreakdownDto,
  type PricingQuotePrintBreakdownDto,
  type PricingQuoteRequestDto,
  type PricingQuoteResponseDto,
  type PricingQuoteSizeBreakdownDto,
  type PrintPosition,
  type Rupiah,
} from '@yng/shared';
import { AppError } from '../middleware/errorHandler.js';
import catalogModel, {
  type CatalogRepository,
  type PricingLookupIds,
  type PricingReferenceData,
  type SqlQueryExecutor,
} from '../models/catalogModel.js';

export interface PricingCalculationOptions {
  discountAmount?: Rupiah;
}

export interface PricingQuoteOptions extends PricingCalculationOptions {
  executor?: SqlQueryExecutor;
}

export interface InitialPaymentRequirement {
  paymentScheme: PaymentScheme;
  dpRequiredAmount: Rupiah;
  dpPercentSnapshot: number | null;
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

function toRupiahInt(value: number): Rupiah {
  return Math.round(Number(value));
}

function collectPricingLookupIds(input: PricingQuoteRequestDto): PricingLookupIds {
  const modelIds = new Set<number>();
  const fabricIds = new Set<number>();
  const fabricColorIds = new Set<number>();
  const sizeIds = new Set<number>();
  const printSizeIds = new Set<number>();

  for (const item of input.items) {
    modelIds.add(item.modelId);
    fabricIds.add(item.fabricId);

    if (item.fabricColorId !== undefined && item.fabricColorId !== null) {
      fabricColorIds.add(item.fabricColorId);
    }

    for (const sizeEntry of item.sizes) {
      sizeIds.add(sizeEntry.sizeId);
    }

    for (const printEntry of item.prints ?? []) {
      printSizeIds.add(printEntry.printSizeId);
    }
  }

  return {
    modelIds: [...modelIds],
    fabricIds: [...fabricIds],
    fabricColorIds: [...fabricColorIds],
    sizeIds: [...sizeIds],
    printSizeIds: [...printSizeIds],
  };
}

/**
 * Satu-satunya sumber kebenaran rumus harga YNG Apparel (SPEC 6.1 & 6.2).
 * Seluruh nominal dihitung dengan integer rupiah dan bersifat murni agar mudah dipakai ulang & diuji.
 */
export function calculateQuoteFromReferenceData(
  input: PricingQuoteRequestDto,
  ref: PricingReferenceData,
  options: PricingCalculationOptions = {}
): PricingQuoteResponseDto {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AppError('Minimal satu item konfigurasi harus dikirim untuk menghitung harga.', 400);
  }

  if (!Number.isInteger(ref.dpMinQty) || ref.dpMinQty < 1) {
    throw new AppError('Konfigurasi minimal kuantitas DP tidak valid.', 500);
  }
  if (!Number.isInteger(ref.dpPercent) || ref.dpPercent < 1 || ref.dpPercent > 99) {
    throw new AppError('Konfigurasi persentase DP tidak valid.', 500);
  }

  const itemBreakdowns: PricingQuoteItemBreakdownDto[] = [];
  let subtotalAmount: Rupiah = 0;
  let totalQty = 0;

  input.items.forEach((item, itemIndex) => {
    const label = `Item #${itemIndex + 1}`;
    const model = ref.modelsById.get(item.modelId);
    if (!model || !model.is_active) {
      throw new AppError(`${label}: model pakaian tidak ditemukan atau sedang nonaktif.`, 400);
    }

    const fabric = ref.fabricsById.get(item.fabricId);
    if (!fabric || !fabric.is_active) {
      throw new AppError(`${label}: bahan pakaian tidak ditemukan atau sedang nonaktif.`, 400);
    }

    if (!ref.compatibleModelFabrics.has(`${item.modelId}:${item.fabricId}`)) {
      throw new AppError(
        `${label}: bahan "${fabric.name}" tidak kompatibel dengan model "${model.name}".`,
        400
      );
    }

    // Validasi & resolusi warna preset vs warna custom
    const isCustomColor = item.isCustomColor === true;
    let resolvedColorId: number | null;
    let resolvedColorName: string;
    let resolvedColorHex: string | null;

    if (!isCustomColor) {
      if (
        (item.colorName !== undefined && item.colorName !== null) ||
        (item.colorHex !== undefined && item.colorHex !== null)
      ) {
        throw new AppError(
          `${label}: warna non-preset hanya diperbolehkan jika isCustomColor bernilai true.`,
          400
        );
      }

      if (item.fabricColorId === undefined || item.fabricColorId === null) {
        throw new AppError(
          `${label}: preset warna (fabricColorId) wajib dipilih jika bukan warna custom.`,
          400
        );
      }

      const preset = ref.fabricColorsById.get(item.fabricColorId);
      if (!preset || !preset.is_active || preset.fabric_id !== item.fabricId) {
        throw new AppError(
          `${label}: preset warna tidak valid, tidak aktif, atau bukan milik bahan yang dipilih.`,
          400
        );
      }

      resolvedColorId = Number(preset.id);
      resolvedColorName = preset.color_name;
      resolvedColorHex = preset.color_hex;
    } else {
      if (item.fabricColorId !== undefined && item.fabricColorId !== null) {
        throw new AppError(
          `${label}: warna custom tidak boleh menyertakan fabricColorId preset.`,
          400
        );
      }

      const trimmedColorName = typeof item.colorName === 'string' ? item.colorName.trim() : '';
      if (!trimmedColorName || trimmedColorName.length > 50) {
        throw new AppError(`${label}: nama warna custom wajib diisi (maksimal 50 karakter).`, 400);
      }

      let normalizedHex: string | null = null;
      if (item.colorHex !== undefined && item.colorHex !== null) {
        const trimmedHex = item.colorHex.trim();
        if (!HEX_COLOR_REGEX.test(trimmedHex)) {
          throw new AppError(`${label}: format kode warna hex harus #RRGGBB.`, 400);
        }
        normalizedHex = trimmedHex.toUpperCase();
      }

      resolvedColorId = null;
      resolvedColorName = trimmedColorName;
      resolvedColorHex = normalizedHex;
    }

    // Validasi & hitung titik sablon
    const printInputs = item.prints ?? [];
    const seenPositions = new Set<PrintPosition>();
    const printBreakdowns: PricingQuotePrintBreakdownDto[] = [];
    let printSpotsTotal: Rupiah = 0;

    for (const spot of printInputs) {
      if (spot.printPosition !== PRINT_POSITION.OTHER) {
        if (seenPositions.has(spot.printPosition)) {
          throw new AppError(
            `${label}: setiap posisi sablon hanya boleh dipilih satu kali per item (kecuali Lainnya).`,
            400
          );
        }
        seenPositions.add(spot.printPosition);
      }

      const printSize = ref.printSizesById.get(spot.printSizeId);
      if (!printSize || !printSize.is_active) {
        throw new AppError(`${label}: ukuran sablon tidak ditemukan atau sedang nonaktif.`, 400);
      }

      const pricePerSpot = toRupiahInt(printSize.price_per_spot);
      printSpotsTotal += pricePerSpot;
      printBreakdowns.push({
        printSizeId: Number(printSize.id),
        printSizeCode: printSize.code,
        printSizeName: printSize.name,
        printPosition: spot.printPosition,
        pricePerSpot,
      });
    }

    // Validasi & hitung harga per ukuran
    if (!Array.isArray(item.sizes) || item.sizes.length === 0) {
      throw new AppError(
        `${label}: minimal satu ukuran dengan jumlah lebih dari 0 harus dipilih.`,
        400
      );
    }

    const basePrice = toRupiahInt(model.base_price);
    const fabricAdditionalPrice = toRupiahInt(fabric.additional_price);
    const seenSizeIds = new Set<number>();
    const sizeBreakdowns: PricingQuoteSizeBreakdownDto[] = [];
    let itemQty = 0;
    let lineSubtotal: Rupiah = 0;

    for (const sizeEntry of item.sizes) {
      if (seenSizeIds.has(sizeEntry.sizeId)) {
        throw new AppError(`${label}: terdapat ukuran ganda dalam satu item.`, 400);
      }
      seenSizeIds.add(sizeEntry.sizeId);

      if (!Number.isInteger(sizeEntry.qty) || sizeEntry.qty <= 0) {
        throw new AppError(`${label}: kuantitas ukuran harus bilangan bulat lebih dari 0.`, 400);
      }

      const size = ref.sizesById.get(sizeEntry.sizeId);
      if (!size || !size.is_active) {
        throw new AppError(`${label}: ukuran pakaian tidak ditemukan atau sedang nonaktif.`, 400);
      }

      const extraCharge = toRupiahInt(size.extra_charge);
      const unitPrice = basePrice + fabricAdditionalPrice + extraCharge + printSpotsTotal;
      const lineTotal = sizeEntry.qty * unitPrice;

      itemQty += sizeEntry.qty;
      lineSubtotal += lineTotal;

      sizeBreakdowns.push({
        sizeId: Number(size.id),
        sizeCode: size.code,
        qty: sizeEntry.qty,
        extraCharge,
        unitPrice,
        lineTotal,
      });
    }

    subtotalAmount += lineSubtotal;
    totalQty += itemQty;

    itemBreakdowns.push({
      itemIndex,
      modelId: Number(model.id),
      modelSlug: model.slug,
      modelName: model.name,
      fabricId: Number(fabric.id),
      fabricCode: fabric.code,
      fabricName: fabric.name,
      isCustomColor,
      fabricColorId: resolvedColorId,
      colorName: resolvedColorName,
      colorHex: resolvedColorHex,
      basePrice,
      fabricAdditionalPrice,
      printSpotsTotal,
      itemQty,
      lineSubtotal,
      sizes: sizeBreakdowns,
      prints: printBreakdowns,
    });
  });

  const discountAmount = options.discountAmount ?? 0;
  if (!Number.isInteger(discountAmount) || discountAmount < 0 || discountAmount > subtotalAmount) {
    throw new AppError('Nominal diskon tidak valid atau melebihi subtotal pesanan.', 400);
  }

  const netSubtotal = subtotalAmount - discountAmount;
  const dpEligible = totalQty >= ref.dpMinQty;
  const dpAmount = Math.round((netSubtotal * ref.dpPercent) / 100);
  const settlementAmount = netSubtotal - dpAmount;

  const availablePaymentSchemes: PaymentScheme[] = dpEligible
    ? [PAYMENT_SCHEME.FULL, PAYMENT_SCHEME.DP]
    : [PAYMENT_SCHEME.FULL];

  const paymentSchemeOptions: PricingPaymentSchemeOptionDto[] = [
    {
      scheme: PAYMENT_SCHEME.FULL,
      label: getPaymentSchemeLabel(PAYMENT_SCHEME.FULL),
      available: true,
      initialAmount: netSubtotal,
      remainingAfterInitial: 0,
      reason: null,
    },
    {
      scheme: PAYMENT_SCHEME.DP,
      label: getPaymentSchemeLabel(PAYMENT_SCHEME.DP, ref.dpPercent),
      available: dpEligible,
      initialAmount: dpAmount,
      remainingAfterInitial: settlementAmount,
      reason: dpEligible
        ? null
        : `Minimal ${ref.dpMinQty} pcs untuk pembayaran DP ${ref.dpPercent}%.`,
    },
  ];

  return {
    items: itemBreakdowns,
    subtotalAmount,
    totalQty,
    dpEligible,
    dpMinQty: ref.dpMinQty,
    dpPercent: ref.dpPercent,
    dpAmount,
    settlementAmount,
    availablePaymentSchemes,
    paymentSchemeOptions,
  };
}

/**
 * Memvalidasi skema pembayaran yang dipilih terhadap gatekeeper DP dan menghitung kewajiban bayar awal.
 * Disiapkan untuk dipakai ulang di Tahap 3b (checkout) dan Tahap 5 (order manual / edit order).
 */
export function resolveInitialPaymentRequirement(
  quote: PricingQuoteResponseDto,
  paymentScheme: PaymentScheme,
  discountAmount?: Rupiah
): InitialPaymentRequirement {
  if (paymentScheme === PAYMENT_SCHEME.DP && !quote.dpEligible) {
    throw new AppError(
      `Total kuantitas (${quote.totalQty} pcs) belum memenuhi minimal DP (${quote.dpMinQty} pcs).`,
      400
    );
  }

  if (discountAmount !== undefined) {
    if (
      !Number.isInteger(discountAmount) ||
      discountAmount < 0 ||
      discountAmount > quote.subtotalAmount
    ) {
      throw new AppError('Nominal diskon tidak valid atau melebihi subtotal pesanan.', 400);
    }

    const netSubtotal = quote.subtotalAmount - discountAmount;
    if (paymentScheme === PAYMENT_SCHEME.DP) {
      return {
        paymentScheme: PAYMENT_SCHEME.DP,
        dpRequiredAmount: Math.round((netSubtotal * quote.dpPercent) / 100),
        dpPercentSnapshot: quote.dpPercent,
      };
    }

    return {
      paymentScheme: PAYMENT_SCHEME.FULL,
      dpRequiredAmount: netSubtotal,
      dpPercentSnapshot: null,
    };
  }

  const fullOption = quote.paymentSchemeOptions.find(
    (option) => option.scheme === PAYMENT_SCHEME.FULL
  );
  const netSubtotal = fullOption ? fullOption.initialAmount : quote.subtotalAmount;

  if (paymentScheme === PAYMENT_SCHEME.DP) {
    return {
      paymentScheme: PAYMENT_SCHEME.DP,
      dpRequiredAmount: quote.dpAmount,
      dpPercentSnapshot: quote.dpPercent,
    };
  }

  return {
    paymentScheme: PAYMENT_SCHEME.FULL,
    dpRequiredAmount: netSubtotal,
    dpPercentSnapshot: null,
  };
}

/**
 * Membuat service kalkulasi harga server-side yang membaca master katalog dan `app_settings` dari repository.
 */
export function createPricingService(deps: {
  catalogRepo: Pick<CatalogRepository, 'loadPricingReferenceData'>;
}) {
  const { catalogRepo } = deps;

  return {
    async calculateQuote(
      input: PricingQuoteRequestDto,
      options: PricingQuoteOptions = {}
    ): Promise<PricingQuoteResponseDto> {
      const lookup = collectPricingLookupIds(input);
      const refData = await catalogRepo.loadPricingReferenceData(lookup, options.executor);
      return calculateQuoteFromReferenceData(input, refData, {
        discountAmount: options.discountAmount,
      });
    },
  };
}

export type PricingService = ReturnType<typeof createPricingService>;

export const pricingService = createPricingService({ catalogRepo: catalogModel });

export default pricingService;
