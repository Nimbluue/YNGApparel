const WA_REGEX = /^62[0-9]{7,15}$/;

/**
 * Normalisasi nomor WhatsApp ke format `62xxxxxxxxxx` sesuai constraint DB (`chk_orders_wa_format`).
 * Mengembalikan string ternormalisasi atau `null` jika format tidak valid.
 */
export function normalizeWhatsApp(rawPhone: string | null | undefined): string | null {
  if (rawPhone === null || rawPhone === undefined) {
    return null;
  }

  let digits = String(rawPhone).replace(/[^0-9]/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('0')) {
    digits = `62${digits.slice(1)}`;
  } else if (digits.startsWith('8')) {
    digits = `62${digits}`;
  }

  if (!WA_REGEX.test(digits)) {
    return null;
  }

  return digits;
}

export function getWhatsAppLast4(whatsapp: string | null | undefined): string {
  const normalized = normalizeWhatsApp(whatsapp);
  if (!normalized) {
    return '';
  }
  return normalized.slice(-4);
}

/**
 * Samarkan nama pelanggan untuk halaman Live Tracker publik (SPEC 5 Rute 3).
 * Contoh: "Budi Santoso" -> "B*** S*****"
 */
export function maskName(name: string | null | undefined): string {
  const cleaned = String(name || '').trim();
  if (!cleaned) {
    return '***';
  }

  return cleaned
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return '*';
      if (part.length === 2) return `${part[0]}*`;
      return `${part[0]}${'*'.repeat(Math.min(part.length - 1, 5))}`;
    })
    .join(' ');
}
