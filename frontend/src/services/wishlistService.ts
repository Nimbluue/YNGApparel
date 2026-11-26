import type { ApiSuccessResponse, ToggleWishlistRequestDto, WishlistItemDto } from '@yng/shared';
import api from './api';

export const wishlistQueryKeys = {
  list: ['wishlist'] as const,
};

export async function getWishlist(): Promise<WishlistItemDto[]> {
  const response = await api.get<ApiSuccessResponse<WishlistItemDto[]>>('/wishlist');
  return response.data.data;
}

export async function addWishlistItem(
  payload: ToggleWishlistRequestDto
): Promise<WishlistItemDto[]> {
  const response = await api.post<ApiSuccessResponse<WishlistItemDto[]>>('/wishlist', payload);
  return response.data.data;
}

export async function removeWishlistItem(modelSlug: string): Promise<WishlistItemDto[]> {
  const response = await api.delete<ApiSuccessResponse<WishlistItemDto[]>>(
    `/wishlist/${encodeURIComponent(modelSlug)}`
  );
  return response.data.data;
}

export async function mergeGuestWishlist(modelSlugs: string[]): Promise<WishlistItemDto[]> {
  const response = await api.post<ApiSuccessResponse<WishlistItemDto[]>>('/wishlist/merge', {
    modelSlugs,
  });
  return response.data.data;
}
