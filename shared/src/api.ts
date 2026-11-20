import type { PaymentMethod, UserRole } from './enums.js';

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

export interface AuthUserDto {
  userUuid: string;
  fullName: string;
  email: string;
  whatsapp: string | null;
  role: UserRole;
}

export interface RegisterRequestDto {
  fullName: string;
  email: string;
  whatsapp: string;
  password: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface ChangePasswordRequestDto {
  currentPassword: string;
  newPassword: string;
}

export type CatalogImageFolder = 'models' | 'fabrics' | 'qris' | 'logs' | 'ready';

export interface CatalogImageUploadDto {
  path: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
}

export interface FabricColorDto {
  id: number;
  fabricId: number;
  colorName: string;
  colorHex: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateFabricColorDto {
  colorName: string;
  colorHex: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateFabricColorDto {
  colorName?: string;
  colorHex?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface FabricDto {
  id: number;
  code: string;
  name: string;
  description: string | null;
  gsmWeight: number | null;
  thicknessLevel: number;
  comfortLevel: number | null;
  additionalPrice: Rupiah;
  imagePath: string | null;
  imageUrl: string | null;
  macroImagePath: string | null;
  macroImageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  colors: FabricColorDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateFabricDto {
  code: string;
  name: string;
  description?: string | null;
  gsmWeight?: number | null;
  thicknessLevel?: number;
  comfortLevel?: number | null;
  additionalPrice?: Rupiah;
  imagePath?: string | null;
  macroImagePath?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateFabricDto {
  code?: string;
  name?: string;
  description?: string | null;
  gsmWeight?: number | null;
  thicknessLevel?: number;
  comfortLevel?: number | null;
  additionalPrice?: Rupiah;
  imagePath?: string | null;
  macroImagePath?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface GarmentModelDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  basePrice: Rupiah;
  imagePath: string | null;
  imageUrl: string | null;
  mockupTemplate: string | null;
  sortOrder: number;
  isActive: boolean;
  fabricIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGarmentModelDto {
  slug: string;
  name: string;
  description?: string | null;
  basePrice: Rupiah;
  imagePath?: string | null;
  mockupTemplate?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateGarmentModelDto {
  slug?: string;
  name?: string;
  description?: string | null;
  basePrice?: Rupiah;
  imagePath?: string | null;
  mockupTemplate?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface ReplaceModelFabricsDto {
  fabricIds: number[];
}

export interface SizeDto {
  id: number;
  code: string;
  sortOrder: number;
  extraCharge: Rupiah;
  isActive: boolean;
}

export interface CreateSizeDto {
  code: string;
  sortOrder?: number;
  extraCharge?: Rupiah;
  isActive?: boolean;
}

export interface UpdateSizeDto {
  code?: string;
  sortOrder?: number;
  extraCharge?: Rupiah;
  isActive?: boolean;
}

export interface PrintSizeDto {
  id: number;
  code: string;
  name: string;
  dimensionsCm: string;
  widthCm: number;
  heightCm: number;
  pricePerSpot: Rupiah;
  sortOrder: number;
  isActive: boolean;
}

export interface CreatePrintSizeDto {
  code: string;
  name: string;
  dimensionsCm: string;
  widthCm: number;
  heightCm: number;
  pricePerSpot: Rupiah;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdatePrintSizeDto {
  code?: string;
  name?: string;
  dimensionsCm?: string;
  widthCm?: number;
  heightCm?: number;
  pricePerSpot?: Rupiah;
  sortOrder?: number;
  isActive?: boolean;
}

export interface PaymentAccountDto {
  id: number;
  method: PaymentMethod;
  providerName: string;
  accountNumber: string | null;
  accountHolder: string;
  qrImagePath: string | null;
  qrImageUrl: string | null;
  instructions: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentAccountDto {
  method: PaymentMethod;
  providerName: string;
  accountNumber?: string | null;
  accountHolder: string;
  qrImagePath?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}

export interface UpdatePaymentAccountDto {
  method?: PaymentMethod;
  providerName?: string;
  accountNumber?: string | null;
  accountHolder?: string;
  qrImagePath?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}

export type AppSettingKey =
  | 'store_name'
  | 'admin_whatsapp'
  | 'dp_percent'
  | 'dp_min_qty'
  | 'initial_payment_due_hours'
  | 'auto_complete_days'
  | 'dpi_ok_min'
  | 'dpi_warn_min'
  | 'max_design_file_mb'
  | 'signed_url_expiry_seconds'
  | 'temp_upload_ttl_hours'
  | 'production_estimate_text';

export interface AppSettingsMapDto {
  store_name: string;
  admin_whatsapp: string;
  dp_percent: number;
  dp_min_qty: number;
  initial_payment_due_hours: number;
  auto_complete_days: number;
  dpi_ok_min: number;
  dpi_warn_min: number;
  max_design_file_mb: number;
  signed_url_expiry_seconds: number;
  temp_upload_ttl_hours: number;
  production_estimate_text: string;
}

export interface AppSettingItemDto {
  key: AppSettingKey;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface AppSettingsResponseDto {
  settings: AppSettingsMapDto;
  items: AppSettingItemDto[];
}

export type UpdateAppSettingsDto = Partial<AppSettingsMapDto>;

export interface UpdateProfileRequestDto {
  fullName?: string;
  whatsapp?: string | null;
}

export interface DeactivateAccountRequestDto {
  currentPassword: string;
}

export interface UserAddressDto {
  addressUuid: string;
  label: string;
  recipientName: string;
  recipientWhatsapp: string;
  provinceName: string;
  cityName: string;
  districtName: string;
  postalCode: string;
  fullAddress: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserAddressDto {
  label: string;
  recipientName: string;
  recipientWhatsapp: string;
  provinceName: string;
  cityName: string;
  districtName: string;
  postalCode: string;
  fullAddress: string;
  isDefault?: boolean;
}

export type UpdateUserAddressDto = Partial<CreateUserAddressDto>;
