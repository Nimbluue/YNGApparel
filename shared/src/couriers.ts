export const COURIER_CODES = [
  'JNE',
  'JNT',
  'SICEPAT',
  'ANTERAJA',
  'POS',
  'NINJA',
  'IDEXPRESS',
  'LIONPARCEL',
  'GOJEK',
  'GRAB',
  'OTHER',
] as const;

export type CourierCode = (typeof COURIER_CODES)[number];

export interface CourierInfo {
  code: CourierCode;
  name: string;
  trackingUrl: string | null;
  supportsDeepLink: boolean;
}

export const TRACKING_RECEIPT_REGEX = /^[A-Za-z0-9-]{4,40}$/;

/**
 * Daftar kurir awal menunggu konfirmasi akhir client.
 * URL lacak diambil dan diverifikasi dari situs resmi masing-masing kurir;
 * tidak memakai tautan agregator pihak ketiga dan tidak menebak query parameter yang tidak terdokumentasi.
 */
export const COURIERS: readonly CourierInfo[] = [
  // ASSUMPTION: situs resmi JNE adalah SPA tanpa parameter GET publik untuk auto-isi resi; tombol membuka halaman lacak resmi dan pengguna menyalin resi.
  {
    code: 'JNE',
    name: 'JNE Express',
    trackingUrl: 'https://www.jne.co.id/tracking-package',
    supportsDeepLink: false,
  },
  // ASSUMPTION: situs resmi J&T Express memakai antarmuka interaktif (terkadang meminta 4 digit akhir HP); tombol membuka halaman lacak resmi.
  {
    code: 'JNT',
    name: 'J&T Express',
    trackingUrl: 'https://www.jet.co.id/track',
    supportsDeepLink: false,
  },
  // ASSUMPTION: halaman cek resi resmi SiCepat memproses input AWB via state aplikasi web; tombol membuka halaman lacak resmi.
  {
    code: 'SICEPAT',
    name: 'SiCepat Ekspres',
    trackingUrl: 'https://www.sicepat.com/checkAwb',
    supportsDeepLink: false,
  },
  // ASSUMPTION: halaman pelacakan resmi Anteraja adalah SPA tanpa parameter GET publik terdokumentasi; tombol membuka halaman lacak resmi.
  {
    code: 'ANTERAJA',
    name: 'Anteraja',
    trackingUrl: 'https://anteraja.id/tracking',
    supportsDeepLink: false,
  },
  // ASSUMPTION: situs resmi Pos Indonesia (Next.js SPA) tidak mendokumentasikan parameter GET resi publik; tombol membuka halaman lacak resmi.
  {
    code: 'POS',
    name: 'Pos Indonesia',
    trackingUrl: 'https://www.posindonesia.co.id/id/tracking',
    supportsDeepLink: false,
  },
  // ASSUMPTION: halaman tracking Ninja Xpress Indonesia adalah web app interaktif tanpa parameter URL resi; tombol membuka halaman lacak resmi.
  {
    code: 'NINJA',
    name: 'Ninja Xpress',
    trackingUrl: 'https://www.ninjaxpress.co/id-id/tracking',
    supportsDeepLink: false,
  },
  // ASSUMPTION: halaman lacak ID Express berbasis SPA interaktif; tombol membuka halaman lacak resmi.
  {
    code: 'IDEXPRESS',
    name: 'ID Express',
    trackingUrl: 'https://idexpress.com/lacak-paket',
    supportsDeepLink: false,
  },
  // ASSUMPTION: halaman cek resi Lion Parcel (STT) berbasis antarmuka web interaktif; tombol membuka halaman lacak resmi.
  {
    code: 'LIONPARCEL',
    name: 'Lion Parcel',
    trackingUrl: 'https://lionparcel.com/track/stt',
    supportsDeepLink: false,
  },
  // ASSUMPTION: GoSend (Gojek) tidak menyediakan halaman cek resi web publik; pelacakan lewat aplikasi Gojek / link SMS kurir.
  {
    code: 'GOJEK',
    name: 'GoSend (Gojek)',
    trackingUrl: null,
    supportsDeepLink: false,
  },
  // ASSUMPTION: GrabExpress tidak menyediakan halaman cek resi web publik (hanya live link per order); tanpa halaman lacak statis.
  {
    code: 'GRAB',
    name: 'GrabExpress',
    trackingUrl: null,
    supportsDeepLink: false,
  },
  // ASSUMPTION: kode fallback untuk kurir instan / lokal area Batam tanpa tautan pelacakan eksternal.
  {
    code: 'OTHER',
    name: 'Kurir Instan / Lokal Batam',
    trackingUrl: null,
    supportsDeepLink: false,
  },
];

const COURIER_BY_CODE: Readonly<Record<string, CourierInfo>> = Object.fromEntries(
  COURIERS.map((courier) => [courier.code, courier])
);

export function getCourierByCode(code: string | null | undefined): CourierInfo | null {
  if (!code) return null;
  return COURIER_BY_CODE[code.trim().toUpperCase()] ?? null;
}

export function isValidCourierCode(code: string | null | undefined): code is CourierCode {
  if (!code) return false;
  return Object.prototype.hasOwnProperty.call(COURIER_BY_CODE, code.trim().toUpperCase());
}

export function isValidTrackingReceipt(receipt: string | null | undefined): boolean {
  if (!receipt) return false;
  return TRACKING_RECEIPT_REGEX.test(receipt.trim());
}

/**
 * Membuat URL lacak resmi kurir dari entri `CourierInfo` dan nomor resi.
 * Mengembalikan `null` jika kurir `OTHER`, tidak memiliki halaman lacak resmi,
 * atau resi tidak lolos validasi `^[A-Za-z0-9-]{4,40}$`.
 */
export function buildTrackingUrlFromCourier(
  courier: CourierInfo | null | undefined,
  resi: string | null | undefined
): string | null {
  if (!courier || courier.code === 'OTHER' || !courier.trackingUrl) {
    return null;
  }

  const trimmedResi = String(resi || '').trim();
  if (!TRACKING_RECEIPT_REGEX.test(trimmedResi)) {
    return null;
  }

  if (courier.supportsDeepLink) {
    const encodedResi = encodeURIComponent(trimmedResi);
    if (courier.trackingUrl.includes('{resi}')) {
      return courier.trackingUrl.replace('{resi}', encodedResi);
    }
    return `${courier.trackingUrl}${encodedResi}`;
  }

  return courier.trackingUrl;
}

export function buildTrackingUrl(
  code: string | null | undefined,
  resi: string | null | undefined
): string | null {
  const courier = getCourierByCode(code);
  return buildTrackingUrlFromCourier(courier, resi);
}
