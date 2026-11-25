import type {
  ApiSuccessResponse,
  CartItemDto,
  CartListResponseDto,
  DesignUploadResultDto,
  UpsertCartItemRequestDto,
} from '@yng/shared';
import api from './api';

export const cartQueryKeys = {
  all: ['cart'] as const,
  items: ['cart', 'items'] as const,
};

/**
 * Mengunggah file desain pelanggan ke `POST /api/uploads/design` (bucket privat `designs`).
 */
export async function uploadDesignFile(file: File): Promise<DesignUploadResultDto> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<ApiSuccessResponse<DesignUploadResultDto>>(
    '/uploads/design',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data.data;
}

/**
 * Mengambil seluruh item keranjang milik pengguna beserta kalkulasi harga dinamis dari server.
 */
export async function getCartItems(): Promise<CartListResponseDto> {
  const response = await api.get<ApiSuccessResponse<CartListResponseDto>>('/cart/items');
  return response.data.data;
}

/**
 * Menambahkan 1 konfigurasi Custom Lab ke keranjang (`POST /api/cart/items`).
 */
export async function addCartItem(payload: UpsertCartItemRequestDto): Promise<CartItemDto> {
  const response = await api.post<ApiSuccessResponse<CartItemDto>>('/cart/items', payload);
  return response.data.data;
}

/**
 * Memperbarui konfigurasi item keranjang (`PUT /api/cart/items/:cartItemUuid`).
 */
export async function updateCartItem(
  cartItemUuid: string,
  payload: UpsertCartItemRequestDto
): Promise<CartItemDto> {
  const response = await api.put<ApiSuccessResponse<CartItemDto>>(
    `/cart/items/${encodeURIComponent(cartItemUuid)}`,
    payload
  );
  return response.data.data;
}

/**
 * Menghapus item keranjang (`DELETE /api/cart/items/:cartItemUuid`).
 */
export async function deleteCartItem(cartItemUuid: string): Promise<{ cartItemUuid: string }> {
  const response = await api.delete<ApiSuccessResponse<{ cartItemUuid: string }>>(
    `/cart/items/${encodeURIComponent(cartItemUuid)}`
  );
  return response.data.data;
}
