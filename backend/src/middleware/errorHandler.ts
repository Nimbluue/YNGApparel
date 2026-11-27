import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

export class AppError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status = 400, data: unknown = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.data = data;
  }
}

export interface PostgresErrorLike {
  code?: string;
  constraint?: string;
}

export interface MappedHttpError {
  status: number;
  message: string;
}

const UNIQUE_CONSTRAINT_MESSAGES: Readonly<Record<string, MappedHttpError>> = {
  uq_users_email: { status: 409, message: 'Email sudah terdaftar.' },
  uq_ua_one_default: { status: 409, message: 'Hanya satu alamat utama yang diperbolehkan.' },
  catalog_categories_name_key: { status: 409, message: 'Nama kategori sudah digunakan.' },
  catalog_categories_slug_key: { status: 409, message: 'Slug kategori sudah digunakan.' },
  catalog_collections_name_key: { status: 409, message: 'Nama koleksi sudah digunakan.' },
  catalog_collections_slug_key: { status: 409, message: 'Slug koleksi sudah digunakan.' },
  garment_models_slug_key: { status: 409, message: 'Slug model pakaian sudah digunakan.' },
  fabrics_code_key: { status: 409, message: 'Kode bahan sudah digunakan.' },
  uq_fabric_color: { status: 409, message: 'Nama warna tersebut sudah ada pada bahan ini.' },
  sizes_code_key: { status: 409, message: 'Kode ukuran sudah digunakan.' },
  print_sizes_code_key: { status: 409, message: 'Kode ukuran sablon sudah digunakan.' },
  orders_order_code_key: {
    status: 409,
    message: 'Kode pesanan bentrok, silakan ulangi permintaan.',
  },
  orders_idempotency_key_key: {
    status: 409,
    message: 'Permintaan pembuatan pesanan sudah diproses.',
  },
  uq_item_size: { status: 400, message: 'Terdapat ukuran ganda dalam satu item pesanan.' },
  uq_oip_item_position: {
    status: 400,
    message: 'Setiap posisi sablon hanya boleh dipilih satu kali per item (kecuali Lainnya).',
  },
  uq_payment_stage: { status: 409, message: 'Tagihan untuk tahap pembayaran ini sudah tersedia.' },
  collective_links_public_code_key: { status: 409, message: 'Kode kolektif sudah digunakan.' },
  ready_products_slug_key: { status: 409, message: 'Slug produk sudah digunakan.' },
  ready_product_variants_sku_key: { status: 409, message: 'SKU varian sudah digunakan.' },
  uq_rpv_combo: { status: 409, message: 'Kombinasi ukuran dan warna varian sudah ada.' },
};

const CHECK_CONSTRAINT_MESSAGES: Readonly<Record<string, string>> = {
  chk_users_wa_format: 'Nomor WhatsApp harus berformat 62xxxxxxxxxx (diawali 62, 9–17 digit).',
  chk_users_user_wa: 'Nomor WhatsApp wajib diisi untuk akun pelanggan.',
  chk_ua_wa_format:
    'Nomor WhatsApp penerima harus berformat 62xxxxxxxxxx (diawali 62, 9–17 digit).',
  chk_cart_config_object: 'Konfigurasi item keranjang harus berupa objek JSON yang valid.',
  chk_gm_price: 'Harga dasar model tidak boleh negatif.',
  chk_fabric_thickness: 'Tingkat ketebalan bahan harus di antara 1 sampai 5.',
  chk_fabric_comfort: 'Tingkat kenyamanan bahan harus di antara 1 sampai 5.',
  chk_fabric_price: 'Tambahan harga bahan tidak boleh negatif.',
  chk_fc_hex: 'Format kode warna hex harus #RRGGBB.',
  chk_size_charge: 'Biaya tambahan ukuran tidak boleh negatif.',
  chk_print_price: 'Harga per titik sablon tidak boleh negatif.',
  chk_orders_qty: 'Total kuantitas pesanan harus lebih dari 0.',
  chk_orders_dp_min: 'Ambang minimal kuantitas DP harus lebih dari 0.',
  chk_orders_amounts:
    'Nominal harga, diskon, ongkir, DP, sisa tagihan, dan refund tidak boleh negatif.',
  chk_orders_discount: 'Nominal diskon tidak boleh melebihi subtotal pesanan.',
  chk_orders_dp_amount: 'Nominal DP tidak boleh melebihi subtotal bersih.',
  chk_orders_dp_rule: 'Total kuantitas belum memenuhi minimal syarat pembayaran DP.',
  chk_orders_dp_pct: 'Pengaturan persentase DP tidak valid untuk skema pembayaran yang dipilih.',
  chk_orders_wa_format: 'Nomor WhatsApp harus berformat 62xxxxxxxxxx (diawali 62, 9–17 digit).',
  chk_orders_addr_web:
    'Alamat lengkap (provinsi, kota, kecamatan, kode pos, alamat) wajib diisi untuk pengiriman order website.',
  chk_orders_addr_ship:
    'Alamat lengkap wajib diisi sebelum pesanan masuk tahap pengiriman atau selesai.',
  chk_orders_courier:
    'Nama kurir dan nomor resi wajib diisi sebelum pesanan masuk tahap pengiriman atau selesai.',
  chk_oi_qty: 'Kuantitas item harus lebih dari 0.',
  chk_oi_hex: 'Format kode warna hex item harus #RRGGBB.',
  chk_oi_color: 'Pilih warna preset bahan atau tandai sebagai warna custom.',
  chk_ois_qty: 'Jumlah per ukuran harus lebih dari 0.',
  chk_oip_price: 'Harga titik sablon tidak boleh negatif.',
  chk_payment_amount: 'Nominal pembayaran harus lebih dari 0.',
  chk_payment_verified: 'Waktu verifikasi wajib diisi saat pembayaran terverifikasi.',
  chk_payment_rejected: 'Alasan penolakan wajib diisi saat pembayaran ditolak.',
  chk_plog_qty: 'Total kuantitas log produksi harus lebih dari 0.',
  chk_cl_hex: 'Format kode warna hex kolektif harus #RRGGBB.',
  chk_ce_qty: 'Kuantitas anggota kolektif harus lebih dari 0.',
  chk_rp_price: 'Harga produk tidak boleh negatif.',
  chk_rp_sale: 'Harga promo harus lebih kecil dari harga normal dan tidak boleh negatif.',
  chk_rpv_stock: 'Stok varian tidak boleh negatif.',
  chk_catalog_collections_status: 'Status koleksi harus ACTIVE, SOLD_OUT, atau ARCHIVED.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function mapPostgresError(err: unknown): MappedHttpError | null {
  if (!isRecord(err) || typeof err.code !== 'string') {
    return null;
  }

  const constraint = typeof err.constraint === 'string' ? err.constraint : '';

  if (err.code === '23505') {
    const mapped = UNIQUE_CONSTRAINT_MESSAGES[constraint];
    return {
      status: mapped?.status || 409,
      message: mapped?.message || 'Data duplikat sudah terdaftar.',
    };
  }

  if (err.code === '23514') {
    const message = CHECK_CONSTRAINT_MESSAGES[constraint];
    return {
      status: 400,
      message: message || 'Data tidak memenuhi aturan validasi database.',
    };
  }

  if (err.code === '23503') {
    return {
      status: 400,
      message: 'Referensi data terkait tidak ditemukan atau masih digunakan oleh data lain.',
    };
  }

  if (err.code === '22P02') {
    return {
      status: 400,
      message: 'Format parameter atau nilai input tidak valid.',
    };
  }

  return null;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  return sendError(res, {
    status: 404,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
  });
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof AppError) {
    return sendError(res, {
      status: err.status,
      message: err.message,
      data: err.data,
    });
  }

  if (isRecord(err)) {
    const type = typeof err.type === 'string' ? err.type : '';
    const status = typeof err.status === 'number' ? err.status : undefined;
    const name = typeof err.name === 'string' ? err.name : '';
    const code = typeof err.code === 'string' ? err.code : '';

    if (type === 'entity.parse.failed' || (err instanceof SyntaxError && status === 400)) {
      return sendError(res, {
        status: 400,
        message: 'Format JSON pada body permintaan tidak valid.',
      });
    }

    if (name === 'MulterError') {
      const message =
        code === 'LIMIT_FILE_SIZE'
          ? 'Ukuran file melebihi batas maksimum yang diizinkan.'
          : 'Gagal memproses file unggahan.';
      return sendError(res, { status: 400, message });
    }

    if (name === 'JsonWebTokenError' || name === 'TokenExpiredError') {
      return sendError(res, {
        status: 401,
        message: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.',
      });
    }
  }

  const pgMapped = mapPostgresError(err);
  if (pgMapped) {
    return sendError(res, pgMapped);
  }

  if (!env.isProduction) {
    console.error('[ErrorHandler]', err);
  } else {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ErrorHandler]', message);
  }

  const rawStatus = isRecord(err) && typeof err.status === 'number' ? err.status : 500;
  const status =
    Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  const rawMessage = err instanceof Error ? err.message : '';
  const message =
    status < 500 && rawMessage
      ? rawMessage
      : 'Terjadi kesalahan pada server. Silakan coba lagi nanti.';

  return sendError(res, { status, message });
};
