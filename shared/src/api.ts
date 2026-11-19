/**
 * Nilai uang dalam aplikasi YNG Apparel selalu memakai bilangan bulat rupiah (integer).
 */
export type Rupiah = number;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ValidationErrorItem {
  field: string;
  message: string;
}

export interface ValidationErrorPayload {
  errors: ValidationErrorItem[];
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse<T = unknown> {
  success: false;
  message: string;
  data: T;
}

export type ApiResponse<T = unknown, E = unknown> = ApiSuccessResponse<T> | ApiErrorResponse<E>;

export interface HealthStatusDto {
  status: 'ok';
  env: string;
  timestamp: string;
}

export interface DbHealthStatusDto {
  status: 'ok';
  database: string;
  publicTables: number;
  utcNow: string | Date;
  wibNow: string | Date;
}

export interface AdminUserDto {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
}
