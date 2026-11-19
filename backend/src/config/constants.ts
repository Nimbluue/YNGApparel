export * from '@yng/shared';

export const ORDER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ORDER_CODE_PREFIX = 'YNG-';
export const ORDER_CODE_RANDOM_LENGTH = 6;

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

// Kunci tetap untuk pg_advisory_lock / pg_try_advisory_xact_lock (SPEC 6.4)
export const ADVISORY_LOCKS = {
  MIGRATE: 910000,
  EXPIRE_UNPAID_ORDERS: 910001,
  AUTO_COMPLETE_SHIPPING: 910002,
  CLEANUP_TMP_DESIGNS: 910003,
} as const;
