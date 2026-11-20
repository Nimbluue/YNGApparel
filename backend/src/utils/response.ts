import type { ApiErrorResponse, ApiSuccessResponse, PaginationMeta } from '@yng/shared';
import type { Response } from 'express';

export interface SuccessOptions<T> {
  message?: string;
  data?: T;
  status?: number;
  meta?: PaginationMeta;
}

export interface PaginatedOptions<T> {
  message?: string;
  data?: T[];
  page?: number;
  limit?: number;
  total?: number;
}

export interface ErrorOptions<T> {
  message?: string;
  status?: number;
  data?: T;
}

export function sendSuccess<T = null>(
  res: Response,
  { message = 'Berhasil', data = null as T, status = 200, meta }: SuccessOptions<T> = {}
): Response<ApiSuccessResponse<T>> {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    message,
    data,
  };

  if (meta !== undefined) {
    payload.meta = meta;
  }

  return res.status(status).json(payload);
}

export function sendCreated<T = null>(
  res: Response,
  { message = 'Berhasil dibuat', data = null as T }: Omit<SuccessOptions<T>, 'status' | 'meta'> = {}
): Response<ApiSuccessResponse<T>> {
  return sendSuccess(res, { message, data, status: 201 });
}

export function sendPaginated<T>(
  res: Response,
  { message = 'Berhasil', data = [], page = 1, limit = 20, total = 0 }: PaginatedOptions<T> = {}
): Response<ApiSuccessResponse<T[]>> {
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
  return sendSuccess(res, {
    message,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  });
}

export function sendError<T = null>(
  res: Response,
  { message = 'Terjadi kesalahan', status = 500, data = null as T }: ErrorOptions<T> = {}
): Response<ApiErrorResponse<T>> {
  return res.status(status).json({
    success: false,
    message,
    data,
  });
}
