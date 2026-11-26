import type {
  DesignStatus,
  FulfillmentType,
  OrderSource,
  PaymentMethod,
  PaymentScheme,
  PaymentStage,
  PaymentStatus,
  PrintPosition,
  ProductionStatus,
  UserRole,
} from './enums.js';
import type { CourierCode, CourierInfo } from './couriers.js';

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

export interface PublicFabricColorDto {
  id: number;
  fabricId: number;
  colorName: string;
  colorHex: string;
  sortOrder: number;
}

export interface PublicFabricDto {
  id: number;
  code: string;
  name: string;
  description: string | null;
  gsmWeight: number | null;
  thicknessLevel: number;
  comfortLevel: number | null;
  additionalPrice: Rupiah;
  imageUrl: string | null;
  macroImageUrl: string | null;
  sortOrder: number;
  colors: PublicFabricColorDto[];
}

export interface PublicGarmentModelDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  basePrice: Rupiah;
  imageUrl: string | null;
  mockupTemplate: string | null;
  sortOrder: number;
  fabricIds: number[];
}

export interface PublicModelDetailDto extends PublicGarmentModelDto {
  fabrics: PublicFabricDto[];
}

export interface PublicSizeDto {
  id: number;
  code: string;
  sortOrder: number;
  extraCharge: Rupiah;
}

export interface PublicPrintSizeDto {
  id: number;
  code: string;
  name: string;
  dimensionsCm: string;
  widthCm: number;
  heightCm: number;
  pricePerSpot: Rupiah;
  sortOrder: number;
}

export interface PublicCatalogConfigDto {
  storeName: string;
  adminWhatsapp: string;
  dpPercent: number;
  dpMinQty: number;
  productionEstimateText: string;
  maxDesignFileMb: number;
}

export interface PublicPaymentAccountDto {
  id: number;
  method: PaymentMethod;
  providerName: string;
  accountNumber: string | null;
  accountHolder: string;
  qrImageUrl: string | null;
  instructions: string | null;
}

export interface PricingQuoteSizeInputDto {
  sizeId: number;
  qty: number;
}

export interface PricingQuotePrintInputDto {
  printSizeId: number;
  printPosition: PrintPosition;
}

export interface PricingQuoteItemInputDto {
  modelId: number;
  fabricId: number;
  isCustomColor?: boolean;
  fabricColorId?: number | null;
  colorName?: string | null;
  colorHex?: string | null;
  sizes: PricingQuoteSizeInputDto[];
  prints?: PricingQuotePrintInputDto[];
}

export interface PricingQuoteRequestDto {
  items: PricingQuoteItemInputDto[];
}

export interface PricingQuoteSizeBreakdownDto {
  sizeId: number;
  sizeCode: string;
  qty: number;
  extraCharge: Rupiah;
  unitPrice: Rupiah;
  lineTotal: Rupiah;
}

export interface PricingQuotePrintBreakdownDto {
  printSizeId: number;
  printSizeCode: string;
  printSizeName: string;
  printPosition: PrintPosition;
  pricePerSpot: Rupiah;
}

export interface PricingQuoteItemBreakdownDto {
  itemIndex: number;
  modelId: number;
  modelSlug: string;
  modelName: string;
  fabricId: number;
  fabricCode: string;
  fabricName: string;
  isCustomColor: boolean;
  fabricColorId: number | null;
  colorName: string;
  colorHex: string | null;
  basePrice: Rupiah;
  fabricAdditionalPrice: Rupiah;
  printSpotsTotal: Rupiah;
  itemQty: number;
  lineSubtotal: Rupiah;
  sizes: PricingQuoteSizeBreakdownDto[];
  prints: PricingQuotePrintBreakdownDto[];
}

export interface PricingPaymentSchemeOptionDto {
  scheme: PaymentScheme;
  label: string;
  available: boolean;
  initialAmount: Rupiah;
  remainingAfterInitial: Rupiah;
  reason: string | null;
}

export interface PricingQuoteResponseDto {
  items: PricingQuoteItemBreakdownDto[];
  subtotalAmount: Rupiah;
  totalQty: number;
  dpEligible: boolean;
  dpMinQty: number;
  dpPercent: number;
  dpAmount: Rupiah;
  settlementAmount: Rupiah;
  availablePaymentSchemes: PaymentScheme[];
  paymentSchemeOptions: PricingPaymentSchemeOptionDto[];
}

export interface DesignUploadResultDto {
  fileRef: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export interface CartItemSizeInputDto {
  sizeId: number;
  qty: number;
}

export interface CartItemPrintInputDto {
  printSizeId: number;
  printPosition: PrintPosition;
  needsDesignHelp?: boolean;
  fileRef?: string | null;
  fileName?: string | null;
}

export interface CartItemConfigDto {
  isCustomColor: boolean;
  fabricColorId: number | null;
  colorName: string | null;
  colorHex: string | null;
  sizes: CartItemSizeInputDto[];
  prints: Array<{
    printSizeId: number;
    printPosition: PrintPosition;
    needsDesignHelp: boolean;
    fileRef: string | null;
    fileName: string | null;
  }>;
  productionNotes: string | null;
}

export interface UpsertCartItemRequestDto {
  modelId: number;
  fabricId: number;
  isCustomColor?: boolean;
  fabricColorId?: number | null;
  colorName?: string | null;
  colorHex?: string | null;
  sizes: CartItemSizeInputDto[];
  prints?: CartItemPrintInputDto[];
  productionNotes?: string | null;
}

export interface CartItemDto {
  cartItemUuid: string;
  modelId: number;
  fabricId: number;
  configVersion: number;
  config: CartItemConfigDto;
  isAvailable: boolean;
  warnings: string[];
  itemQty: number;
  lineSubtotal: Rupiah;
  pricing: PricingQuoteItemBreakdownDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartSummaryDto {
  totalItems: number;
  maxItems: number;
  availableItemCount: number;
  unavailableItemCount: number;
  totalQty: number;
  subtotalAmount: Rupiah;
  dpEligible: boolean;
  dpMinQty: number;
  dpPercent: number;
  dpAmount: Rupiah;
  settlementAmount: Rupiah;
}

export interface CartListResponseDto {
  items: CartItemDto[];
  summary: CartSummaryDto;
}

export interface CreateOrderShippingAddressDto {
  recipientName: string;
  recipientWhatsapp: string;
  provinceName: string;
  cityName: string;
  districtName: string;
  postalCode: string;
  fullAddress: string;
}

export interface CreateOrderRequestDto {
  cartItemUuids: string[];
  fulfillmentType: FulfillmentType;
  addressUuid?: string | null;
  address?: CreateOrderShippingAddressDto | null;
  pickupName?: string | null;
  pickupWhatsapp?: string | null;
  paymentScheme: PaymentScheme;
  idempotencyKey?: string | null;
}

export interface OrderPaymentDto {
  paymentUuid: string;
  paymentStage: PaymentStage;
  paymentStageLabel: string;
  paymentMethod: PaymentMethod | null;
  paymentAccountId: number | null;
  amount: Rupiah;
  status: PaymentStatus;
  hasProof: boolean;
  proofImageUrl: string | null;
  rejectionReason: string | null;
  proofUploadedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface OrderPaymentsResponseDto {
  transactionUuid: string;
  orderCode: string;
  productionStatus: ProductionStatus;
  paymentScheme: PaymentScheme;
  dpPercentSnapshot: number | null;
  grandTotal: Rupiah;
  remainingBalance: Rupiah;
  paymentDueAt: string | null;
  payments: OrderPaymentDto[];
  paymentAccounts: PublicPaymentAccountDto[];
}

export interface UploadPaymentProofResultDto {
  transactionUuid: string;
  orderCode: string;
  payment: OrderPaymentDto;
}

export interface OrderItemSizeDto {
  sizeCode: string;
  qty: number;
  lockedExtraCharge: Rupiah;
}

export interface OrderItemPrintDto {
  printSizeCode: string;
  printPosition: PrintPosition;
  designFileName: string | null;
  hasDesignFile: boolean;
  lockedSpotPrice: Rupiah;
}

export interface OrderItemDto {
  modelName: string;
  fabricName: string;
  isCustomColor: boolean;
  colorName: string;
  colorHex: string | null;
  needsDesignHelp: boolean;
  productionNotes: string | null;
  lockedBasePrice: Rupiah;
  lockedFabricPrice: Rupiah;
  itemQty: number;
  lineSubtotal: Rupiah;
  sizes: OrderItemSizeDto[];
  prints: OrderItemPrintDto[];
}

export interface OrderQcPhotoDto {
  photoUrl: string;
  createdAt: string;
}

export interface OrderStatusHistoryDto {
  fromStatus: string | null;
  toStatus: string;
  notes: string | null;
  createdAt: string;
}

export interface OrderSummaryDto {
  transactionUuid: string;
  orderCode: string;
  fulfillmentType: FulfillmentType;
  totalQty: number;
  paymentScheme: PaymentScheme;
  dpPercentSnapshot: number | null;
  grandTotal: Rupiah;
  dpRequiredAmount: Rupiah;
  remainingBalance: Rupiah;
  productionStatus: ProductionStatus;
  designStatus: DesignStatus;
  initialPaymentStatus: PaymentStatus | null;
  initialPaymentHasProof: boolean;
  paymentDueAt: string | null;
  createdAt: string;
}

export interface OrderDetailDto {
  transactionUuid: string;
  orderCode: string;
  source: OrderSource;
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  provinceName: string | null;
  cityName: string | null;
  districtName: string | null;
  postalCode: string | null;
  fullAddress: string | null;
  totalQty: number;
  dpMinQtySnapshot: number;
  isDpEligible: boolean;
  paymentScheme: PaymentScheme;
  dpPercentSnapshot: number | null;
  subtotalAmount: Rupiah;
  discountAmount: Rupiah;
  discountNote: string | null;
  shippingCost: Rupiah;
  grandTotal: Rupiah;
  dpRequiredAmount: Rupiah;
  remainingBalance: Rupiah;
  productionStatus: ProductionStatus;
  designStatus: DesignStatus;
  designReviewNotes: string | null;
  estimatedFinishDate: string | null;
  shippingCourier: string | null;
  shippingService: string | null;
  trackingReceiptNumber: string | null;
  courierInfo: CourierInfo | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  paymentDueAt: string | null;
  cancelledReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDto[];
  payments: OrderPaymentDto[];
  paymentAccounts: PublicPaymentAccountDto[];
  qcPhotos: OrderQcPhotoDto[];
  statusHistory: OrderStatusHistoryDto[];
}

export interface AdminOrderCardDto {
  id: number;
  transactionUuid: string;
  orderCode: string;
  source: OrderSource;
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  totalQty: number;
  paymentScheme: PaymentScheme;
  dpPercentSnapshot: number | null;
  grandTotal: Rupiah;
  remainingBalance: Rupiah;
  productionStatus: ProductionStatus;
  designStatus: DesignStatus;
  initialPaymentStatus: PaymentStatus | null;
  initialPaymentHasProof: boolean;
  hasPendingProof: boolean;
  readyToProcess: boolean;
  addressIncomplete: boolean;
  hasCustomColor: boolean;
  qcPhotoCount: number;
  shippingCourier: string | null;
  trackingReceiptNumber: string | null;
  paymentDueAt: string | null;
  estimatedFinishDate: string | null;
  createdAt: string;
}

export interface AdminKanbanColumnDto {
  status: ProductionStatus;
  label: string;
  count: number;
  orders: AdminOrderCardDto[];
}

export interface AdminKanbanBoardDto {
  columns: AdminKanbanColumnDto[];
  archivedCounts: {
    completed: number;
    cancelled: number;
  };
}

export interface AdminOrderItemPrintDto extends OrderItemPrintDto {
  id: number;
  designFileUrl: string | null;
}

export interface AdminOrderItemDto {
  id: number;
  modelId: number;
  fabricId: number;
  fabricColorId: number | null;
  modelName: string;
  fabricName: string;
  isCustomColor: boolean;
  colorName: string;
  colorHex: string | null;
  needsDesignHelp: boolean;
  productionNotes: string | null;
  lockedBasePrice: Rupiah;
  lockedFabricPrice: Rupiah;
  itemQty: number;
  lineSubtotal: Rupiah;
  sizes: OrderItemSizeDto[];
  prints: AdminOrderItemPrintDto[];
}

export interface AdminOrderQcPhotoDto {
  id: number;
  photoUrl: string;
  createdAt: string;
}

export interface AdminOrderDetailDto {
  id: number;
  transactionUuid: string;
  orderCode: string;
  userId: number | null;
  source: OrderSource;
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  provinceName: string | null;
  cityName: string | null;
  districtName: string | null;
  postalCode: string | null;
  fullAddress: string | null;
  totalQty: number;
  dpMinQtySnapshot: number;
  isDpEligible: boolean;
  paymentScheme: PaymentScheme;
  dpPercentSnapshot: number | null;
  subtotalAmount: Rupiah;
  discountAmount: Rupiah;
  discountNote: string | null;
  shippingCost: Rupiah;
  grandTotal: Rupiah;
  dpRequiredAmount: Rupiah;
  remainingBalance: Rupiah;
  refundedAmount: Rupiah;
  productionStatus: ProductionStatus;
  designStatus: DesignStatus;
  designReviewNotes: string | null;
  adminNotes: string | null;
  estimatedFinishDate: string | null;
  shippingCourier: string | null;
  shippingService: string | null;
  trackingReceiptNumber: string | null;
  courierInfo: CourierInfo | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  paymentDueAt: string | null;
  cancelledReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  readyToProcess: boolean;
  addressIncomplete: boolean;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItemDto[];
  payments: OrderPaymentDto[];
  qcPhotos: AdminOrderQcPhotoDto[];
  statusHistory: OrderStatusHistoryDto[];
}

export interface AdminPaymentListItemDto {
  paymentUuid: string;
  orderTransactionUuid: string;
  orderCode: string;
  customerName: string;
  customerWhatsapp: string;
  productionStatus: ProductionStatus;
  paymentStage: PaymentStage;
  paymentStageLabel: string;
  paymentMethod: PaymentMethod | null;
  paymentAccountId: number | null;
  amount: Rupiah;
  status: PaymentStatus;
  hasProof: boolean;
  proofImageUrl: string | null;
  rejectionReason: string | null;
  proofUploadedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface AdminTransitionStatusRequestDto {
  toStatus: ProductionStatus;
  notes?: string | null;
}

export interface AdminReviewDesignRequestDto {
  designStatus: DesignStatus;
  designReviewNotes?: string | null;
}

export interface AdminCancelOrderRequestDto {
  reason: string;
  refundedAmount?: Rupiah;
}

export interface AdminUpdateDiscountRequestDto {
  discountAmount: Rupiah;
  discountNote?: string | null;
}

export interface AdminUpdateAddressRequestDto {
  fulfillmentType?: FulfillmentType;
  customerName?: string;
  customerWhatsapp?: string;
  provinceName?: string | null;
  cityName?: string | null;
  districtName?: string | null;
  postalCode?: string | null;
  fullAddress?: string | null;
}

export interface AdminUpdateNotesRequestDto {
  adminNotes?: string | null;
  estimatedFinishDate?: string | null;
}

export interface AdminUpdateShippingCostRequestDto {
  shippingCost: Rupiah;
  notes?: string | null;
}

export interface AdminUpdateShipmentRequestDto {
  shippingCourier: CourierCode;
  shippingService?: string | null;
  trackingReceiptNumber: string;
}

export interface AdminVerifyPaymentRequestDto {
  approve: boolean;
  rejectionReason?: string | null;
}

export interface AdminRejectPaymentRequestDto {
  rejectionReason: string;
}

export interface TrackOrderLookupRequestDto {
  code: string;
  whatsappLast4: string;
}

export type TrackerStageKey =
  'NEW_ORDER' | 'PRINT_QUEUE' | 'PRESSING_QC' | 'AWAITING_SETTLEMENT' | 'SHIPPING';

export type TrackerStageState = 'completed' | 'current' | 'upcoming' | 'skipped' | 'cancelled';

export interface TrackerProductionStageDto {
  step: number;
  key: TrackerStageKey;
  label: string;
  state: TrackerStageState;
}

export interface TrackerOrderDto {
  transactionUuid: string;
  orderCode: string;
  source: OrderSource;
  customerNameMasked: string;
  customerWhatsappMasked: string;
  fulfillmentType: FulfillmentType;
  cityName: string | null;
  provinceName: string | null;
  addressSummaryMasked: string | null;
  totalQty: number;
  dpMinQtySnapshot: number;
  isDpEligible: boolean;
  paymentScheme: PaymentScheme;
  dpPercentSnapshot: number | null;
  subtotalAmount: Rupiah;
  discountAmount: Rupiah;
  discountNote: string | null;
  shippingCost: Rupiah;
  grandTotal: Rupiah;
  dpRequiredAmount: Rupiah;
  remainingBalance: Rupiah;
  productionStatus: ProductionStatus;
  designStatus: DesignStatus;
  designReviewNotes: string | null;
  estimatedFinishDate: string | null;
  shippingCourier: string | null;
  shippingService: string | null;
  trackingReceiptNumber: string | null;
  courierInfo: CourierInfo | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  paymentDueAt: string | null;
  cancelledReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stages: TrackerProductionStageDto[];
  items: OrderItemDto[];
  payments: OrderPaymentDto[];
  paymentAccounts: PublicPaymentAccountDto[];
  qcPhotos: OrderQcPhotoDto[];
  statusHistory: OrderStatusHistoryDto[];
}

export interface AdminOrderCardDto {
  id: number;
  transactionUuid: string;
  orderCode: string;
  source: OrderSource;
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  totalQty: number;
  paymentScheme: PaymentScheme;
  dpPercentSnapshot: number | null;
  grandTotal: Rupiah;
  remainingBalance: Rupiah;
  productionStatus: ProductionStatus;
  designStatus: DesignStatus;
  initialPaymentStatus: PaymentStatus | null;
  initialPaymentHasProof: boolean;
  hasPendingProof: boolean;
  readyToProcess: boolean;
  addressIncomplete: boolean;
  hasCustomColor: boolean;
  qcPhotoCount: number;
  shippingCourier: string | null;
  trackingReceiptNumber: string | null;
  paymentDueAt: string | null;
  estimatedFinishDate: string | null;
  createdAt: string;
}

export interface AdminKanbanColumnDto {
  status: ProductionStatus;
  label: string;
  count: number;
  orders: AdminOrderCardDto[];
}

export interface AdminKanbanBoardDto {
  columns: AdminKanbanColumnDto[];
  archivedCounts: {
    completed: number;
    cancelled: number;
  };
}

export interface AdminOrderItemPrintDto extends OrderItemPrintDto {
  id: number;
  designFileUrl: string | null;
}

export interface AdminOrderItemDto {
  id: number;
  modelId: number;
  fabricId: number;
  fabricColorId: number | null;
  modelName: string;
  fabricName: string;
  isCustomColor: boolean;
  colorName: string;
  colorHex: string | null;
  needsDesignHelp: boolean;
  productionNotes: string | null;
  lockedBasePrice: Rupiah;
  lockedFabricPrice: Rupiah;
  itemQty: number;
  lineSubtotal: Rupiah;
  sizes: OrderItemSizeDto[];
  prints: AdminOrderItemPrintDto[];
}

export interface AdminOrderQcPhotoDto {
  id: number;
  photoUrl: string;
  createdAt: string;
}

export interface AdminOrderDetailDto {
  id: number;
  transactionUuid: string;
  orderCode: string;
  userId: number | null;
  source: OrderSource;
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  provinceName: string | null;
  cityName: string | null;
  districtName: string | null;
  postalCode: string | null;
  fullAddress: string | null;
  totalQty: number;
  dpMinQtySnapshot: number;
  isDpEligible: boolean;
  paymentScheme: PaymentScheme;
  dpPercentSnapshot: number | null;
  subtotalAmount: Rupiah;
  discountAmount: Rupiah;
  discountNote: string | null;
  shippingCost: Rupiah;
  grandTotal: Rupiah;
  dpRequiredAmount: Rupiah;
  remainingBalance: Rupiah;
  refundedAmount: Rupiah;
  productionStatus: ProductionStatus;
  designStatus: DesignStatus;
  designReviewNotes: string | null;
  adminNotes: string | null;
  estimatedFinishDate: string | null;
  shippingCourier: string | null;
  shippingService: string | null;
  trackingReceiptNumber: string | null;
  courierInfo: CourierInfo | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  paymentDueAt: string | null;
  cancelledReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  readyToProcess: boolean;
  addressIncomplete: boolean;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItemDto[];
  payments: OrderPaymentDto[];
  qcPhotos: AdminOrderQcPhotoDto[];
  statusHistory: OrderStatusHistoryDto[];
}

export interface AdminPaymentListItemDto {
  paymentUuid: string;
  orderTransactionUuid: string;
  orderCode: string;
  customerName: string;
  customerWhatsapp: string;
  productionStatus: ProductionStatus;
  paymentStage: PaymentStage;
  paymentStageLabel: string;
  paymentMethod: PaymentMethod | null;
  paymentAccountId: number | null;
  amount: Rupiah;
  status: PaymentStatus;
  hasProof: boolean;
  proofImageUrl: string | null;
  rejectionReason: string | null;
  proofUploadedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface AdminTransitionStatusRequestDto {
  toStatus: ProductionStatus;
  notes?: string | null;
}

export interface AdminReviewDesignRequestDto {
  designStatus: DesignStatus;
  designReviewNotes?: string | null;
}

export interface AdminCancelOrderRequestDto {
  reason: string;
  refundedAmount?: Rupiah;
}

export interface AdminUpdateDiscountRequestDto {
  discountAmount: Rupiah;
  discountNote?: string | null;
}

export interface AdminUpdateAddressRequestDto {
  fulfillmentType?: FulfillmentType;
  customerName?: string;
  customerWhatsapp?: string;
  provinceName?: string | null;
  cityName?: string | null;
  districtName?: string | null;
  postalCode?: string | null;
  fullAddress?: string | null;
}

export interface AdminUpdateNotesRequestDto {
  adminNotes?: string | null;
  estimatedFinishDate?: string | null;
}

export interface AdminUpdateShippingCostRequestDto {
  shippingCost: Rupiah;
  notes?: string | null;
}

export interface AdminUpdateShipmentRequestDto {
  shippingCourier: CourierCode;
  shippingService?: string | null;
  trackingReceiptNumber: string;
}

export interface AdminVerifyPaymentRequestDto {
  approve: boolean;
  rejectionReason?: string | null;
}

export interface AdminRejectPaymentRequestDto {
  rejectionReason: string;
}

export type ManualOrderSource = Exclude<OrderSource, 'WEBSITE'>;

export interface AdminCreateManualOrderItemPrintDto {
  printSizeId: number;
  printPosition: PrintPosition;
  fileRef?: string | null;
  fileName?: string | null;
  notes?: string | null;
}

export interface AdminCreateManualOrderItemDto {
  modelId: number;
  fabricId: number;
  isCustomColor?: boolean;
  fabricColorId?: number | null;
  colorName?: string | null;
  colorHex?: string | null;
  needsDesignHelp?: boolean;
  productionNotes?: string | null;
  sizes: CartItemSizeInputDto[];
  prints?: AdminCreateManualOrderItemPrintDto[];
}

export interface AdminManualPaymentReceivedDto {
  received: boolean;
  paymentMethod?: PaymentMethod | null;
  paymentAccountId?: number | null;
}

export interface AdminCreateManualOrderRequestDto {
  source: ManualOrderSource;
  userUuid?: string | null;
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  provinceName?: string | null;
  cityName?: string | null;
  districtName?: string | null;
  postalCode?: string | null;
  fullAddress?: string | null;
  items: AdminCreateManualOrderItemDto[];
  paymentScheme: PaymentScheme;
  discountAmount?: Rupiah;
  discountNote?: string | null;
  shippingCost?: Rupiah;
  paymentReceived?: AdminManualPaymentReceivedDto | null;
  noAutoCancel?: boolean;
  adminNotes?: string | null;
  estimatedFinishDate?: string | null;
}

export type ReportGroupBy = 'day' | 'month';

export type ReportExportType = 'sales' | 'orders' | 'top-models' | 'customers';

export interface ReportDateRangeDto {
  startDate: string | null;
  endDate: string | null;
  allTime: boolean;
}

export interface AdminReportKpiDto {
  verifiedRevenue: Rupiah;
  grossVerifiedPayments: Rupiah;
  refundedAmount: Rupiah;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalQty: number;
  outstandingBalance: Rupiah;
}

export interface AdminOperationalSnapshotDto {
  newOrdersCount: number;
  pendingPaymentProofCount: number;
  readyToProcessCount: number;
  printQueueCount: number;
  awaitingSettlementCount: number;
  overdueOrdersCount: number;
  incompleteAddressCount: number;
}

export interface AdminDashboardSummaryDto {
  range: ReportDateRangeDto;
  kpi: AdminReportKpiDto;
  operational: AdminOperationalSnapshotDto;
}

export interface AdminSalesBucketDto {
  period: string;
  orderCount: number;
  totalQty: number;
  grossVerified: Rupiah;
  refundedAmount: Rupiah;
  netRevenue: Rupiah;
}

export interface AdminStatusBreakdownDto {
  status: ProductionStatus;
  label: string;
  orderCount: number;
  totalQty: number;
  grandTotal: Rupiah;
}

export interface AdminSourceBreakdownDto {
  source: OrderSource;
  orderCount: number;
  totalQty: number;
  grandTotal: Rupiah;
}

export interface AdminSalesReportDto {
  range: ReportDateRangeDto;
  groupBy: ReportGroupBy;
  kpi: AdminReportKpiDto;
  series: AdminSalesBucketDto[];
  byStatus: AdminStatusBreakdownDto[];
  bySource: AdminSourceBreakdownDto[];
}

export interface AdminOrderReportRowDto {
  transactionUuid: string;
  orderCode: string;
  createdAt: string;
  source: OrderSource;
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  productionStatus: ProductionStatus;
  totalQty: number;
  grandTotal: Rupiah;
  verifiedPaid: Rupiah;
  refundedAmount: Rupiah;
  remainingBalance: Rupiah;
}

export interface AdminOrdersReportDto {
  range: ReportDateRangeDto;
  kpi: AdminReportKpiDto;
  rows: AdminOrderReportRowDto[];
}

export interface AdminTopModelItemDto {
  modelId: number;
  modelName: string;
  orderCount: number;
  totalQty: number;
  totalRevenue: Rupiah;
  revenueSharePercent: number;
}

export interface AdminTopModelsReportDto {
  range: ReportDateRangeDto;
  totalQty: number;
  totalRevenue: Rupiah;
  items: AdminTopModelItemDto[];
}

export interface AdminTopCustomerItemDto {
  customerWhatsapp: string;
  customerName: string;
  hasAccount: boolean;
  orderCount: number;
  totalQty: number;
  totalSpent: Rupiah;
  verifiedPaid: Rupiah;
  outstandingBalance: Rupiah;
  lastOrderAt: string;
}

export interface AdminTopCustomersReportDto {
  range: ReportDateRangeDto;
  items: AdminTopCustomerItemDto[];
}
