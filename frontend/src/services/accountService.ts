import type {
  ApiSuccessResponse,
  AuthUserDto,
  CreateUserAddressDto,
  DeactivateAccountRequestDto,
  UpdateProfileRequestDto,
  UpdateUserAddressDto,
  UserAddressDto,
} from '@yng/shared';
import api from './api';

export async function updateProfile(payload: UpdateProfileRequestDto): Promise<AuthUserDto> {
  const response = await api.put<ApiSuccessResponse<AuthUserDto>>('/me/profile', payload);
  return response.data.data;
}

export async function deactivateAccount(payload: DeactivateAccountRequestDto): Promise<void> {
  await api.post('/me/deactivate', payload);
}

export async function listAddresses(): Promise<UserAddressDto[]> {
  const response = await api.get<ApiSuccessResponse<UserAddressDto[]>>('/me/addresses');
  return response.data.data;
}

export async function createAddress(payload: CreateUserAddressDto): Promise<UserAddressDto> {
  const response = await api.post<ApiSuccessResponse<UserAddressDto>>('/me/addresses', payload);
  return response.data.data;
}

export async function updateAddress(
  addressUuid: string,
  payload: UpdateUserAddressDto
): Promise<UserAddressDto> {
  const response = await api.put<ApiSuccessResponse<UserAddressDto>>(
    `/me/addresses/${addressUuid}`,
    payload
  );
  return response.data.data;
}

export async function deleteAddress(addressUuid: string): Promise<void> {
  await api.delete(`/me/addresses/${addressUuid}`);
}
