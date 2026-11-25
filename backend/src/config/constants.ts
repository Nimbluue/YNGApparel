export * from '@yng/shared';

export const ORDER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ORDER_CODE_PREFIX = 'YNG-';
export const ORDER_CODE_RANDOM_LENGTH = 6;

export const PASSWORD_MIN_LENGTH = 8;
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;
// ASSUMPTION: bcrypt cost 12 (memenuhi batas minimal >= 10 pada SPEC Bagian 13)
export const BCRYPT_SALT_ROUNDS = 12;

// ASSUMPTION: batas wajar operasional untuk satu akun pelanggan dan pembersih keranjang pasif
export const CART_MAX_ITEMS = 20;
export const USER_MAX_ADDRESSES = 5;
export const CART_INACTIVE_TTL_DAYS = 30;

export const STORAGE_BUCKETS = {
  CATALOG: 'catalog',
  DESIGNS: 'designs',
  PAYMENT_PROOFS: 'payment-proofs',
  QC_PHOTOS: 'qc-photos',
} as const;

export type StorageBucketName = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

export interface BucketSpec {
  name: StorageBucketName;
  public: boolean;
  fileSizeLimit: number;
  allowedMimeTypes: string[];
}

export const BUCKET_SPECS: readonly BucketSpec[] = [
  {
    name: STORAGE_BUCKETS.CATALOG,
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    name: STORAGE_BUCKETS.DESIGNS,
    public: false,
    fileSizeLimit: 20 * 1024 * 1024, // 20 MB (default max_design_file_mb)
    allowedMimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/postscript',
      'application/illustrator',
      'application/cdr',
      'application/x-cdr',
      'application/vnd.corel-draw',
      'image/vnd.adobe.photoshop',
      'application/x-photoshop',
      'application/octet-stream', // Fallback untuk PSD/AI/CDR/EPS/ZIP yang divalidasi magic bytes di middleware
    ],
  },
  {
    name: STORAGE_BUCKETS.PAYMENT_PROOFS,
    public: false,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
  {
    name: STORAGE_BUCKETS.QC_PHOTOS,
    public: false,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
];

// ASSUMPTION: batas sisi terpanjang gambar katalog & QRIS 2000px agar ringan tanpa mengurangi keterbacaan
export const CATALOG_IMAGE_FOLDERS = ['models', 'fabrics', 'qris', 'logs', 'ready'] as const;
export const CATALOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CATALOG_IMAGE_MAX_DIMENSION = 2000;
export const CATALOG_IMAGE_PATH_REGEX =
  /^(models|fabrics|qris|logs|ready)\/[a-f0-9]{32}\.(jpg|png|webp)$/;

export const DEFAULT_MAX_DESIGN_FILE_MB = 20;
// Batas keras Multer di atas default 20 MB agar admin masih bisa menaikkan max_design_file_mb di app_settings.
export const DESIGN_UPLOAD_HARD_LIMIT_BYTES = 50 * 1024 * 1024;
export const CART_DESIGN_PATH_REGEX =
  /^carts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-f0-9]{32}\.(png|jpg|webp|svg|pdf)$/i;

export const APP_SETTING_KEYS = [
  'store_name',
  'admin_whatsapp',
  'dp_percent',
  'dp_min_qty',
  'initial_payment_due_hours',
  'auto_complete_days',
  'dpi_ok_min',
  'dpi_warn_min',
  'max_design_file_mb',
  'signed_url_expiry_seconds',
  'temp_upload_ttl_hours',
  'production_estimate_text',
] as const;

// Kunci tetap untuk pg_advisory_lock / pg_try_advisory_xact_lock (SPEC 6.4)
export const ADVISORY_LOCKS = {
  MIGRATE: 910000,
  EXPIRE_UNPAID_ORDERS: 910001,
  AUTO_COMPLETE_SHIPPING: 910002,
  CLEANUP_TMP_DESIGNS: 910003,
  CLEANUP_STALE_CARTS: 910004,
} as const;
