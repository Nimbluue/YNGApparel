import type { ApiErrorResponse } from '@yng/shared';
import axios, { type AxiosError } from 'axios';

export class ApiClientError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status = 0, data: unknown = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.data = data;
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const serverMessage = error.response?.data?.message;
    const normalizedError = new ApiClientError(
      serverMessage || 'Gagal terhubung ke server. Periksa koneksi Anda dan coba lagi.',
      error.response?.status || 0,
      error.response?.data?.data ?? null
    );
    return Promise.reject(normalizedError);
  }
);

export default api;
