import { ORDER_CODE_ALPHABET, ORDER_CODE_PREFIX } from '../config/constants.js';

const NORMALIZED_ORDER_CODE_BODY_REGEX = new RegExp(`^[${ORDER_CODE_ALPHABET}]{6}$`);

/**
 * Menyamarkan nama pelanggan pada Live Tracker publik
 * (mis. `"Budi Santoso"` -> `"B*** S*****"`).
 */
export function maskCustomerName(name: string | null | undefined): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    return 'Pelanggan';
  }

  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 1) {
        return '*';
      }
      const starsCount = Math.min(Math.max(word.length - 1, 2), 6);
      return `${word.charAt(0)}${'*'.repeat(starsCount)}`;
    })
    .join(' ');
}

/**
 * Menyamarkan nomor WhatsApp pada Live Tracker publik dengan menyisakan 4 digit terakhir
 * (mis. `"6281234567890"` -> `"628****7890"`).
 */
export function maskWhatsApp(whatsapp: string | null | undefined): string {
  const digits = typeof whatsapp === 'string' ? whatsapp.replace(/\D/g, '') : '';
  if (digits.length <= 4) {
    return '****';
  }
  const last4 = digits.slice(-4);
  if (digits.length >= 8) {
    return `${digits.slice(0, 3)}****${last4}`;
  }
  return `****${last4}`;
}

/**
 * Menyusun ringkasan lokasi tersamarkan hanya dari kota & provinsi (tanpa alamat jalan,
 * kecamatan, atau kode pos). Mengembalikan `null` bila keduanya belum terisi.
 */
export function maskLocationSummary(
  cityName: string | null | undefined,
  provinceName: string | null | undefined
): string | null {
  const parts = [cityName, provinceName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0);

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Menormalkan input kode order tracker (menerima `"K7M2QX"` maupun `"YNG-K7M2QX"` case-insensitive)
 * menjadi format kanonik `"YNG-XXXXXX"`, atau `null` bila tidak sesuai alfabet kode order.
 */
export function normalizeTrackerOrderCode(rawCode: string): string | null {
  const cleaned = rawCode.trim().toUpperCase();
  if (!cleaned) {
    return null;
  }

  const body = cleaned.startsWith(ORDER_CODE_PREFIX)
    ? cleaned.slice(ORDER_CODE_PREFIX.length)
    : cleaned;

  if (!NORMALIZED_ORDER_CODE_BODY_REGEX.test(body)) {
    return null;
  }

  return `${ORDER_CODE_PREFIX}${body}`;
}
