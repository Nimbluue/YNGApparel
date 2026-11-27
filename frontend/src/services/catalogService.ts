import type {
  ApiSuccessResponse,
  PublicCatalogCategoryDto,
  PublicCatalogCollectionDto,
  PublicCatalogConfigDto,
  PublicFabricDto,
  PublicGarmentModelDto,
  PublicModelDetailDto,
  PublicPaymentAccountDto,
  PublicPrintSizeDto,
  PublicSizeDto,
} from '@yng/shared';
import api from './api';

export const catalogQueryKeys = {
  categories: ['catalog', 'categories'] as const,
  collections: ['catalog', 'collections'] as const,
  models: ['catalog', 'models'] as const,
  modelDetail: (slug: string) => ['catalog', 'models', slug] as const,
  fabrics: ['catalog', 'fabrics'] as const,
  sizes: ['catalog', 'sizes'] as const,
  printSizes: ['catalog', 'print-sizes'] as const,
  config: ['catalog', 'config'] as const,
  paymentAccounts: ['catalog', 'payment-accounts'] as const,
};

export async function getCatalogCategories(): Promise<PublicCatalogCategoryDto[]> {
  const response =
    await api.get<ApiSuccessResponse<PublicCatalogCategoryDto[]>>('/catalog/categories');
  return response.data.data;
}

export async function getCatalogCollections(): Promise<PublicCatalogCollectionDto[]> {
  const response =
    await api.get<ApiSuccessResponse<PublicCatalogCollectionDto[]>>('/catalog/collections');
  return response.data.data;
}

export async function getCatalogModels(): Promise<PublicGarmentModelDto[]> {
  const response = await api.get<ApiSuccessResponse<PublicGarmentModelDto[]>>('/catalog/models');
  return response.data.data;
}

export async function getCatalogModelBySlug(slug: string): Promise<PublicModelDetailDto> {
  const response = await api.get<ApiSuccessResponse<PublicModelDetailDto>>(
    `/catalog/models/${encodeURIComponent(slug)}`
  );
  return response.data.data;
}

export async function getCatalogFabrics(): Promise<PublicFabricDto[]> {
  const response = await api.get<ApiSuccessResponse<PublicFabricDto[]>>('/catalog/fabrics');
  return response.data.data;
}

export async function getCatalogSizes(): Promise<PublicSizeDto[]> {
  const response = await api.get<ApiSuccessResponse<PublicSizeDto[]>>('/catalog/sizes');
  return response.data.data;
}

export async function getCatalogPrintSizes(): Promise<PublicPrintSizeDto[]> {
  const response = await api.get<ApiSuccessResponse<PublicPrintSizeDto[]>>('/catalog/print-sizes');
  return response.data.data;
}

export async function getCatalogConfig(): Promise<PublicCatalogConfigDto> {
  const response = await api.get<ApiSuccessResponse<PublicCatalogConfigDto>>('/catalog/config');
  return response.data.data;
}

export async function getPaymentAccounts(): Promise<PublicPaymentAccountDto[]> {
  const response =
    await api.get<ApiSuccessResponse<PublicPaymentAccountDto[]>>('/payment-accounts');
  return response.data.data;
}
