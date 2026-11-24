/**
 * Normalisasi nomor WhatsApp ke format internasional Indonesia (62xxxxxxxxxx).
 * Selaras dengan backend/src/utils/phone.ts.
 * Hanya untuk UX tampilan — validasi final tetap di server.
 */
export function normalizeWhatsApp(raw: string): string | null {
  const stripped = raw.replace(/\D/g, '');
  if (!stripped) return null;

  let normalized: string;
  if (stripped.startsWith('0')) {
    normalized = '62' + stripped.slice(1);
  } else if (stripped.startsWith('62')) {
    normalized = stripped;
  } else if (stripped.startsWith('8')) {
    // Input tanpa awalan 0 / 62 (mis. 81234...)
    normalized = '62' + stripped;
  } else {
    return null;
  }

  // 9–17 digit setelah awalan negara
  if (normalized.length < 9 || normalized.length > 17) return null;
  return normalized;
}

/**
 * Format nomor WA ke tampilan (62812... → 0812...).
 */
export function formatWhatsApp(normalized: string): string {
  if (normalized.startsWith('62')) {
    return '0' + normalized.slice(2);
  }
  return normalized;
}

/**
 * Ambil 4 digit terakhir nomor WhatsApp (untuk tracker).
 */
export function getWhatsAppLast4(wa: string): string {
  return wa.replace(/\D/g, '').slice(-4);
}
