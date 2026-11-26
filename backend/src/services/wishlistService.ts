import type {
  MergeWishlistRequestDto,
  Rupiah,
  ToggleWishlistRequestDto,
  WishlistFabricSummaryDto,
  WishlistItemDto,
} from '@yng/shared';
import { STORAGE_BUCKETS } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import wishlistModel, {
  type WishlistFabricRow,
  type WishlistModelRow,
  type WishlistRepository,
} from '../models/wishlistModel.js';
import storageService from './storageService.js';

export interface WishlistServiceDeps {
  wishlistRepo: WishlistRepository;
  getPublicCatalogUrl: (filePath: string | null) => string | null;
}

function toRupiahInt(value: number): Rupiah {
  return Math.round(Number(value));
}

function toIsoString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function toFabricSummaryDto(row: WishlistFabricRow): WishlistFabricSummaryDto {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    additionalPrice: toRupiahInt(row.additional_price),
  };
}

/**
 * Mengelola wishlist model pakaian milik user (tersinkron lintas perangkat melalui PostgreSQL).
 */
export function createWishlistService(deps: WishlistServiceDeps) {
  const { wishlistRepo, getPublicCatalogUrl } = deps;

  function toWishlistItemDto(
    row: WishlistModelRow,
    fabrics: readonly WishlistFabricRow[]
  ): WishlistItemDto {
    return {
      garmentModelId: Number(row.garment_model_id),
      slug: row.slug,
      name: row.name,
      description: row.description,
      basePrice: toRupiahInt(row.base_price),
      imageUrl: getPublicCatalogUrl(row.image_path),
      fabrics: fabrics.map(toFabricSummaryDto),
      createdAt: toIsoString(row.created_at),
    };
  }

  async function listWishlist(userId: number): Promise<WishlistItemDto[]> {
    const { items, fabricsByModel } = await wishlistRepo.listActiveByUser(userId);
    return items.map((row) =>
      toWishlistItemDto(row, fabricsByModel.get(row.garment_model_id) ?? [])
    );
  }

  return {
    listWishlist,

    async addToWishlist(
      userId: number,
      input: ToggleWishlistRequestDto
    ): Promise<WishlistItemDto[]> {
      const target = await wishlistRepo.findActiveModel({
        modelSlug: input.modelSlug?.trim(),
        garmentModelId: input.garmentModelId,
      });
      if (!target) {
        throw new AppError('Model pakaian tidak ditemukan atau tidak aktif.', 404);
      }

      await wishlistRepo.addModel(userId, target.id);
      return listWishlist(userId);
    },

    async removeFromWishlist(userId: number, modelSlug: string): Promise<WishlistItemDto[]> {
      await wishlistRepo.removeModelBySlug(userId, modelSlug.trim());
      return listWishlist(userId);
    },

    async mergeWishlist(
      userId: number,
      input: MergeWishlistRequestDto
    ): Promise<WishlistItemDto[]> {
      const uniqueSlugs = Array.from(
        new Set(input.modelSlugs.map((slug) => slug.trim()).filter((slug) => slug.length > 0))
      );

      if (uniqueSlugs.length > 0) {
        await wishlistRepo.mergeModelSlugs(userId, uniqueSlugs);
      }

      return listWishlist(userId);
    },
  };
}

export type WishlistService = ReturnType<typeof createWishlistService>;

export const wishlistService = createWishlistService({
  wishlistRepo: wishlistModel,
  getPublicCatalogUrl: (filePath) => storageService.getPublicUrl(STORAGE_BUCKETS.CATALOG, filePath),
});

export default wishlistService;
