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

/**
 * Interceptor response:
 * - 401: sesi habis → dispatch event agar AuthContext bisa logout + redirect
 * - 403: akses ditolak → dispatch event agar bisa ditangani UI
 * - Error lain: normalisasi ke ApiClientError
 */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const status = error.response?.status ?? 0;
    const serverMessage = error.response?.data?.message;

    const requestUrl = String(error.config?.url ?? '');
    const isPublicAuthProbe =
      requestUrl.includes('/auth/me') ||
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register');

    if (status === 401 && !isPublicAuthProbe) {
      // Dispatch custom event hanya untuk sesi yang habis pada rute terproteksi agar Guest bebas menjelajah
      window.dispatchEvent(new CustomEvent('yng:unauthorized'));
    }

    if (status === 403) {
      window.dispatchEvent(new CustomEvent('yng:forbidden'));
    }

    const normalizedData =
      error.response?.data instanceof Blob
        ? error.response.data
        : (error.response?.data?.data ?? null);

    const normalizedError = new ApiClientError(
      serverMessage || 'Gagal terhubung ke server. Periksa koneksi Anda dan coba lagi.',
      status,
      normalizedData
    );
    return Promise.reject(normalizedError);
  }
);

export default api;
