import type {
  CartItemConfigDto,
  CartItemDto,
  CartListResponseDto,
  PricingQuoteItemInputDto,
  UpsertCartItemRequestDto,
} from '@yng/shared';
import { CART_MAX_ITEMS, STORAGE_BUCKETS } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import cartModel, { type CartItemRow, type CartRepository } from '../models/cartModel.js';
import catalogModel, {
  type CatalogRepository,
  type PricingLookupIds,
  type PricingReferenceData,
} from '../models/catalogModel.js';
import { calculateQuoteFromReferenceData } from './pricingService.js';
import * as storageService from './storageService.js';

export interface CartServiceDeps {
  cartRepo?: CartRepository;
  catalogRepo?: Pick<CatalogRepository, 'loadPricingReferenceData'>;
  removeStorageFiles?: typeof storageService.remove;
  maxCartItems?: number;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildUserCartFileRegex(userUuid: string): RegExp {
  const escapedUuid = userUuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^carts\\/${escapedUuid}\\/[a-f0-9]{32}\\.(png|jpg|webp|svg|pdf)$`, 'i');
}

function extractFileRefs(config: CartItemConfigDto): string[] {
  const refs: string[] = [];
  for (const spot of config.prints ?? []) {
    if (typeof spot.fileRef === 'string' && spot.fileRef.length > 0) {
      refs.push(spot.fileRef);
    }
  }
  return refs;
}

function normalizeCartConfig(userUuid: string, input: UpsertCartItemRequestDto): CartItemConfigDto {
  const isCustomColor = input.isCustomColor === true;
  const userFileRegex = buildUserCartFileRegex(userUuid);

  const normalizedPrints = (input.prints ?? []).map((spot, index) => {
    const label = `Titik sablon #${index + 1}`;
    const needsDesignHelp = spot.needsDesignHelp === true;
    const rawFileRef = typeof spot.fileRef === 'string' ? spot.fileRef.trim() : null;
    const rawFileName = typeof spot.fileName === 'string' ? spot.fileName.trim() : null;

    if (needsDesignHelp) {
      if (rawFileRef) {
        throw new AppError(
          `${label}: tidak perlu melampirkan file desain jika memilih bantuan desain gratis.`,
          400
        );
      }
      return {
        printSizeId: spot.printSizeId,
        printPosition: spot.printPosition,
        needsDesignHelp: true,
        fileRef: null,
        fileName: null,
      };
    }

    if (!rawFileRef) {
      throw new AppError(
        `${label}: wajib mengunggah file desain atau mencentang opsi bantuan desain gratis.`,
        400
      );
    }

    if (!userFileRegex.test(rawFileRef)) {
      throw new AppError(
        `${label}: referensi file desain tidak valid atau bukan milik akun Anda.`,
        400
      );
    }

    if (!rawFileName) {
      throw new AppError(`${label}: nama file desain wajib disertakan.`, 400);
    }

    return {
      printSizeId: spot.printSizeId,
      printPosition: spot.printPosition,
      needsDesignHelp: false,
      fileRef: rawFileRef,
      fileName: rawFileName,
    };
  });

  const rawNotes = typeof input.productionNotes === 'string' ? input.productionNotes.trim() : '';

  return {
    isCustomColor,
    fabricColorId: isCustomColor ? null : (input.fabricColorId ?? null),
    colorName: isCustomColor ? (input.colorName?.trim() ?? null) : null,
    colorHex: isCustomColor ? (input.colorHex?.trim().toUpperCase() ?? null) : null,
    sizes: input.sizes.map((entry) => ({ sizeId: entry.sizeId, qty: entry.qty })),
    prints: normalizedPrints,
    productionNotes: rawNotes.length > 0 ? rawNotes : null,
  };
}

function toPricingQuoteItem(
  modelId: number,
  fabricId: number,
  config: CartItemConfigDto
): PricingQuoteItemInputDto {
  return {
    modelId,
    fabricId,
    isCustomColor: config.isCustomColor,
    fabricColorId: config.fabricColorId,
    colorName: config.colorName,
    colorHex: config.colorHex,
    sizes: config.sizes.map((s) => ({ sizeId: s.sizeId, qty: s.qty })),
    prints: config.prints.map((p) => ({
      printSizeId: p.printSizeId,
      printPosition: p.printPosition,
    })),
  };
}

function collectLookupIdsFromRows(rows: readonly CartItemRow[]): PricingLookupIds {
  const modelIds = new Set<number>();
  const fabricIds = new Set<number>();
  const fabricColorIds = new Set<number>();
  const sizeIds = new Set<number>();
  const printSizeIds = new Set<number>();

  for (const row of rows) {
    modelIds.add(row.model_id);
    fabricIds.add(row.fabric_id);
    if (row.config.fabricColorId !== null && row.config.fabricColorId !== undefined) {
      fabricColorIds.add(row.config.fabricColorId);
    }
    for (const s of row.config.sizes ?? []) {
      sizeIds.add(s.sizeId);
    }
    for (const p of row.config.prints ?? []) {
      printSizeIds.add(p.printSizeId);
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

function buildCartItemDto(row: CartItemRow, refData: PricingReferenceData): CartItemDto {
  const pricingInput = toPricingQuoteItem(row.model_id, row.fabric_id, row.config);

  try {
    const quote = calculateQuoteFromReferenceData({ items: [pricingInput] }, refData);
    const breakdown = quote.items[0];
    return {
      cartItemUuid: row.cart_item_uuid,
      modelId: Number(row.model_id),
      fabricId: Number(row.fabric_id),
      configVersion: row.config_version,
      config: row.config,
      isAvailable: true,
      warnings: [],
      itemQty: breakdown.itemQty,
      lineSubtotal: breakdown.lineSubtotal,
      pricing: breakdown,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  } catch (err: unknown) {
    const fallbackQty = (row.config.sizes ?? []).reduce(
      (sum, entry) => sum + (Number.isInteger(entry.qty) && entry.qty > 0 ? entry.qty : 0),
      0
    );
    const warningMessage =
      err instanceof AppError
        ? err.message
        : 'Konfigurasi item keranjang tidak lagi valid terhadap katalog terbaru.';

    return {
      cartItemUuid: row.cart_item_uuid,
      modelId: Number(row.model_id),
      fabricId: Number(row.fabric_id),
      configVersion: row.config_version,
      config: row.config,
      isAvailable: false,
      warnings: [warningMessage],
      itemQty: fallbackQty,
      lineSubtotal: 0,
      pricing: null,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  }
}

/**
 * Membuat service keranjang Custom Lab yang menghitung ulang harga secara dinamis via `pricingService`
 * dan mengisolasi seluruh operasi berdasarkan `userId`.
 */
export function createCartService(deps: CartServiceDeps = {}) {
  const cartRepo = deps.cartRepo ?? cartModel;
  const catalogRepo = deps.catalogRepo ?? catalogModel;
  const removeStorageFiles = deps.removeStorageFiles ?? storageService.remove;
  const maxCartItems = deps.maxCartItems ?? CART_MAX_ITEMS;

  async function cleanupUnusedFiles(
    userUuid: string,
    candidateRefs: string[],
    activeRows: readonly CartItemRow[]
  ): Promise<void> {
    if (candidateRefs.length === 0) return;

    const userFileRegex = buildUserCartFileRegex(userUuid);
    const stillReferenced = new Set<string>();
    for (const row of activeRows) {
      for (const ref of extractFileRefs(row.config)) {
        stillReferenced.add(ref);
      }
    }

    const toDelete = [...new Set(candidateRefs)].filter(
      (ref) => userFileRegex.test(ref) && !stillReferenced.has(ref)
    );
    if (toDelete.length === 0) return;

    try {
      await removeStorageFiles(STORAGE_BUCKETS.DESIGNS, toDelete);
    } catch (err: unknown) {
      console.warn('[CartService] Gagal membersihkan file desain keranjang lama:', err);
    }
  }

  return {
    async listCart(userId: number): Promise<CartListResponseDto> {
      const rows = await cartRepo.listByUser(userId);
      const lookup = collectLookupIdsFromRows(rows);
      const refData = await catalogRepo.loadPricingReferenceData(lookup);

      const items = rows.map((row) => buildCartItemDto(row, refData));
      const availableItems = items.filter((item) => item.isAvailable);
      const totalQty = availableItems.reduce((sum, item) => sum + item.itemQty, 0);
      const subtotalAmount = availableItems.reduce((sum, item) => sum + item.lineSubtotal, 0);
      const dpEligible = totalQty >= refData.dpMinQty;
      const dpAmount = Math.round((subtotalAmount * refData.dpPercent) / 100);
      const settlementAmount = subtotalAmount - dpAmount;

      return {
        items,
        summary: {
          totalItems: items.length,
          maxItems: maxCartItems,
          availableItemCount: availableItems.length,
          unavailableItemCount: items.length - availableItems.length,
          totalQty,
          subtotalAmount,
          dpEligible,
          dpMinQty: refData.dpMinQty,
          dpPercent: refData.dpPercent,
          dpAmount,
          settlementAmount,
        },
      };
    },

    async addCartItem(
      userId: number,
      userUuid: string,
      input: UpsertCartItemRequestDto
    ): Promise<CartItemDto> {
      const config = normalizeCartConfig(userUuid, input);
      const pricingInput = toPricingQuoteItem(input.modelId, input.fabricId, config);
      const lookup = collectLookupIdsFromRows([
        {
          id: 0,
          cart_item_uuid: '',
          user_id: userId,
          model_id: input.modelId,
          fabric_id: input.fabricId,
          config,
          config_version: 1,
          created_at: '',
          updated_at: '',
        },
      ]);
      const refData = await catalogRepo.loadPricingReferenceData(lookup);
      // Validasi penuh terhadap katalog aktif & aturan harga sebelum menyimpan
      calculateQuoteFromReferenceData({ items: [pricingInput] }, refData);

      const created = await cartRepo.createAtomic({
        userId,
        modelId: input.modelId,
        fabricId: input.fabricId,
        config,
        maxItems: maxCartItems,
      });

      return buildCartItemDto(created, refData);
    },

    async updateCartItem(
      userId: number,
      userUuid: string,
      cartItemUuid: string,
      input: UpsertCartItemRequestDto
    ): Promise<CartItemDto> {
      const existing = await cartRepo.findByUuidAndUser(userId, cartItemUuid);
      if (!existing) {
        throw new AppError('Item keranjang tidak ditemukan.', 404);
      }

      const config = normalizeCartConfig(userUuid, input);
      const pricingInput = toPricingQuoteItem(input.modelId, input.fabricId, config);
      const lookup = collectLookupIdsFromRows([
        {
          ...existing,
          model_id: input.modelId,
          fabric_id: input.fabricId,
          config,
        },
      ]);
      const refData = await catalogRepo.loadPricingReferenceData(lookup);
      calculateQuoteFromReferenceData({ items: [pricingInput] }, refData);

      const updatedResult = await cartRepo.updateAtomic({
        userId,
        cartItemUuid,
        modelId: input.modelId,
        fabricId: input.fabricId,
        config,
      });
      if (!updatedResult) {
        throw new AppError('Item keranjang tidak ditemukan.', 404);
      }

      await cleanupUnusedFiles(userUuid, extractFileRefs(updatedResult.previousConfig), [
        updatedResult.updated,
        ...updatedResult.otherCartItems,
      ]);

      return buildCartItemDto(updatedResult.updated, refData);
    },

    async deleteCartItem(
      userId: number,
      userUuid: string,
      cartItemUuid: string
    ): Promise<{ cartItemUuid: string }> {
      const deletedResult = await cartRepo.deleteAtomic(userId, cartItemUuid);
      if (!deletedResult) {
        throw new AppError('Item keranjang tidak ditemukan.', 404);
      }

      await cleanupUnusedFiles(
        userUuid,
        extractFileRefs(deletedResult.deleted.config),
        deletedResult.remainingCartItems
      );

      return { cartItemUuid: deletedResult.deleted.cart_item_uuid };
    },
  };
}

export type CartService = ReturnType<typeof createCartService>;

export const cartService = createCartService();

export default cartService;
