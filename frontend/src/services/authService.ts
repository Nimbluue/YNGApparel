import type {
  ApiSuccessResponse,
  AuthUserDto,
  ChangePasswordRequestDto,
  LoginRequestDto,
  RegisterRequestDto,
} from '@yng/shared';
import api from './api';

export async function getMe(): Promise<AuthUserDto | null> {
  const response = await api.get<ApiSuccessResponse<AuthUserDto | null>>('/auth/me');
  return response.data.data ?? null;
}

export async function login(payload: LoginRequestDto): Promise<AuthUserDto> {
  const response = await api.post<ApiSuccessResponse<AuthUserDto>>('/auth/login', payload);
  return response.data.data;
}

export async function register(payload: RegisterRequestDto): Promise<AuthUserDto> {
  const response = await api.post<ApiSuccessResponse<AuthUserDto>>('/auth/register', payload);
  return response.data.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function changePassword(payload: ChangePasswordRequestDto): Promise<AuthUserDto> {
  const response = await api.put<ApiSuccessResponse<AuthUserDto>>('/auth/password', payload);
  return response.data.data;
}
