export const RECENT_TRACKS_STORAGE_KEY = 'yng_recent_tracked_orders';
export const MAX_RECENT_TRACKS = 6;

export interface RecentTrackEntry {
  orderCode: string;
  phoneLast4: string;
  summary?: string;
  updatedAt: string;
}

export interface SaveRecentTrackInput {
  orderCode: string;
  phoneLast4: string;
  summary?: string;
  updatedAt?: string;
}

function normalizeOrderCode(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}

function normalizeLast4(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  return /^[0-9]{4}$/.test(last4) ? last4 : null;
}

function writeRecentTracks(entries: readonly RecentTrackEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(RECENT_TRACKS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(RECENT_TRACKS_STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    // Abaikan kegagalan storage pada private mode atau kuota penuh
  }
}

/**
 * Menyusun ringkasan singkat pesanan untuk tampilan kartu riwayat lacak.
 */
export function buildRecentTrackSummary(input: {
  items?: ReadonlyArray<{ modelName: string }>;
  totalQty?: number;
}): string | undefined {
  const parts: string[] = [];
  const items = input.items ?? [];
  if (items.length > 0 && items[0]?.modelName) {
    parts.push(
      items.length > 1 ? `${items[0].modelName} +${items.length - 1}` : items[0].modelName
    );
  }
  if (typeof input.totalQty === 'number' && input.totalQty > 0) {
    parts.push(`${input.totalQty} pcs`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * Membaca daftar riwayat lacak di perangkat ini (maks 6 item terbaru).
 */
export function getRecentTracks(): RecentTrackEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_TRACKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const deduped = new Map<string, RecentTrackEntry>();
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const item = row as Partial<RecentTrackEntry>;
      if (typeof item.orderCode !== 'string' || typeof item.phoneLast4 !== 'string') continue;

      const orderCode = normalizeOrderCode(item.orderCode);
      const phoneLast4 = normalizeLast4(item.phoneLast4);
      if (!orderCode || !phoneLast4) continue;

      const updatedAt =
        typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))
          ? item.updatedAt
          : new Date().toISOString();

      if (!deduped.has(orderCode)) {
        deduped.set(orderCode, {
          orderCode,
          phoneLast4,
          ...(typeof item.summary === 'string' && item.summary.trim()
            ? { summary: item.summary.trim() }
            : {}),
          updatedAt,
        });
      }
    }

    return Array.from(deduped.values())
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, MAX_RECENT_TRACKS);
  } catch {
    return [];
  }
}

/**
 * Menyimpan atau memindahkan kode order ke urutan teratas riwayat lacak perangkat ini.
 */
export function saveRecentTrack(input: SaveRecentTrackInput): RecentTrackEntry[] {
  const orderCode = normalizeOrderCode(input.orderCode);
  const phoneLast4 = normalizeLast4(input.phoneLast4);
  if (!orderCode || !phoneLast4) {
    return getRecentTracks();
  }

  const trimmedSummary = input.summary?.trim();
  const nextEntry: RecentTrackEntry = {
    orderCode,
    phoneLast4,
    ...(trimmedSummary ? { summary: trimmedSummary } : {}),
    updatedAt:
      input.updatedAt && !Number.isNaN(Date.parse(input.updatedAt))
        ? input.updatedAt
        : new Date().toISOString(),
  };

  const existing = getRecentTracks().filter((entry) => entry.orderCode !== orderCode);
  const nextList = [nextEntry, ...existing].slice(0, MAX_RECENT_TRACKS);
  writeRecentTracks(nextList);
  return nextList;
}

/**
 * Menghapus satu item riwayat lacak berdasarkan `orderCode`.
 */
export function removeRecentTrack(orderCode: string): RecentTrackEntry[] {
  const normalized = normalizeOrderCode(orderCode);
  const nextList = getRecentTracks().filter((entry) => entry.orderCode !== normalized);
  writeRecentTracks(nextList);
  return nextList;
}

/**
 * Menghapus seluruh riwayat lacak pesanan dari perangkat ini.
 */
export function clearRecentTracks(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENT_TRACKS_STORAGE_KEY);
  } catch {
    // Abaikan kegagalan storage pada private mode
  }
}
