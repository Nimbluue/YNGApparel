import type { PublicGarmentModelDto } from '@yng/shared';

const RECENTLY_VIEWED_STORAGE_KEY = 'yng:recently-viewed';
const MAX_RECENTLY_VIEWED = 8;

export interface RecentlyViewedModel {
  slug: string;
  name: string;
  imageUrl: string | null;
  basePrice: number;
  viewedAt: string;
}

function isValidRecentlyViewedEntry(value: unknown): value is RecentlyViewedModel {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.slug === 'string' &&
    record.slug.trim().length > 0 &&
    typeof record.name === 'string' &&
    record.name.trim().length > 0 &&
    (record.imageUrl === null || typeof record.imageUrl === 'string') &&
    typeof record.basePrice === 'number' &&
    Number.isFinite(record.basePrice) &&
    typeof record.viewedAt === 'string'
  );
}

/**
 * Mengambil daftar model pakaian yang baru dilihat pengguna dari `localStorage`.
 */
export function getRecentlyViewedModels(): RecentlyViewedModel[] {
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecentlyViewedEntry).slice(0, MAX_RECENTLY_VIEWED);
  } catch {
    return [];
  }
}

/**
 * Menyimpan model pakaian ke daftar "Baru Dilihat" (`localStorage`) dengan deduplikasi berdasar slug.
 */
export function rememberViewedModel(model: PublicGarmentModelDto): void {
  if (!model.slug || !model.name) return;

  const entry: RecentlyViewedModel = {
    slug: model.slug,
    name: model.name,
    imageUrl: model.imageUrl ?? null,
    basePrice: model.basePrice,
    viewedAt: new Date().toISOString(),
  };

  const current = getRecentlyViewedModels().filter((item) => item.slug !== entry.slug);
  const next = [entry, ...current].slice(0, MAX_RECENTLY_VIEWED);

  try {
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Abaikan kegagalan kuota/akses localStorage pada private browsing
  }
}
