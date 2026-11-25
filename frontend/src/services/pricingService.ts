import type {
  ApiSuccessResponse,
  PricingQuoteRequestDto,
  PricingQuoteResponseDto,
} from '@yng/shared';
import api from './api';

/**
 * Meminta kalkulasi harga resmi dari server (`POST /api/pricing/quote`).
 */
export async function requestPricingQuote(
  payload: PricingQuoteRequestDto,
  signal?: AbortSignal
): Promise<PricingQuoteResponseDto> {
  const response = await api.post<ApiSuccessResponse<PricingQuoteResponseDto>>(
    '/pricing/quote',
    payload,
    { signal }
  );
  return response.data.data;
}
