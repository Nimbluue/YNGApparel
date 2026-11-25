/**
 * Helper untuk membangun tautan wa.me dengan teks template.
 * Nomor harus dalam format 62xxxxxxxxxx.
 * Sesuai SPEC 6.7: hanya tautan wa.me, bukan WhatsApp API.
 */
export function buildWaLink(phoneNumber: string, text: string): string {
  const normalized = phoneNumber.replace(/\D/g, '');
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

/**
 * Buka tautan WhatsApp di tab baru.
 */
export function openWaLink(phoneNumber: string, text: string): void {
  const url = buildWaLink(phoneNumber, text);
  window.open(url, '_blank', 'noopener,noreferrer');
}
