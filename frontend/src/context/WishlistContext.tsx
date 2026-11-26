import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicGarmentModelDto, WishlistItemDto } from '@yng/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from '../components/ui/toastContext';
import { catalogQueryKeys, getCatalogModels } from '../services/catalogService';
import {
  addWishlistItem,
  getWishlist,
  mergeGuestWishlist,
  removeWishlistItem,
  wishlistQueryKeys,
} from '../services/wishlistService';
import { extractApiError } from '../utils/apiError';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';

const GUEST_WISHLIST_STORAGE_KEY = 'yng_wishlist_guest';

function readGuestSlugs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUEST_WISHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === 'string')
          .map((slug) => slug.trim())
          .filter((slug) => slug.length > 0)
      )
    );
  } catch {
    return [];
  }
}

function writeGuestSlugs(slugs: readonly string[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (slugs.length === 0) {
      window.localStorage.removeItem(GUEST_WISHLIST_STORAGE_KEY);
    } else {
      window.localStorage.setItem(GUEST_WISHLIST_STORAGE_KEY, JSON.stringify(slugs));
    }
  } catch {
    // Abaikan kegagalan storage pada private mode
  }
}

export interface WishlistContextValue {
  items: WishlistItemDto[];
  savedSlugs: ReadonlySet<string>;
  count: number;
  loading: boolean;
  syncing: boolean;
  isWishlisted: (modelSlug: string) => boolean;
  toggleWishlist: (modelSlug: string, modelHint?: PublicGarmentModelDto) => Promise<void>;
  refreshWishlist: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, isGuest, checked } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [guestSlugs, setGuestSlugs] = useState<string[]>(() => readGuestSlugs());
  const [isMerging, setIsMerging] = useState(false);
  const [mutatingSlug, setMutatingSlug] = useState<string | null>(null);
  const mergedForUserRef = useRef<string | null>(null);

  const isAuthenticated = checked && !isGuest && Boolean(user);

  const wishlistQuery = useQuery({
    queryKey: wishlistQueryKeys.list,
    queryFn: getWishlist,
    enabled: isAuthenticated && !isMerging,
  });

  // Saat tamu memiliki slug di localStorage -> muat katalog aktif agar kartu Wishlist tamu punya metadata lengkap.
  const guestCatalogQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
    enabled: checked && isGuest && guestSlugs.length > 0,
  });

  // Sinkronisasi otomatis localStorage tamu ke DB begitu user login.
  useEffect(() => {
    if (!checked) return;

    if (isGuest || !user) {
      mergedForUserRef.current = null;
      queryClient.removeQueries({ queryKey: wishlistQueryKeys.list });
      return;
    }

    if (mergedForUserRef.current === user.userUuid) {
      return;
    }
    mergedForUserRef.current = user.userUuid;

    const pendingSlugs = readGuestSlugs();
    if (pendingSlugs.length === 0) {
      return;
    }

    let cancelled = false;
    setIsMerging(true);

    mergeGuestWishlist(pendingSlugs)
      .then((syncedItems) => {
        if (cancelled) return;
        writeGuestSlugs([]);
        setGuestSlugs([]);
        queryClient.setQueryData(wishlistQueryKeys.list, syncedItems);
      })
      .catch(() => {
        // Biarkan localStorage tetap utuh bila jaringan gagal agar tidak hilang dan bisa dicoba ulang
        if (!cancelled) {
          mergedForUserRef.current = null;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsMerging(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [checked, isGuest, queryClient, user]);

  const items = useMemo<WishlistItemDto[]>(() => {
    if (isAuthenticated) {
      return wishlistQuery.data ?? [];
    }

    const models = guestCatalogQuery.data ?? [];
    const bySlug = new Map<string, PublicGarmentModelDto>();
    for (const model of models) {
      bySlug.set(model.slug, model);
    }

    return guestSlugs
      .map((slug): WishlistItemDto | null => {
        const model = bySlug.get(slug);
        if (!model) return null;
        return {
          garmentModelId: model.id,
          slug: model.slug,
          name: model.name,
          description: model.description,
          basePrice: model.basePrice,
          imageUrl: model.imageUrl,
          fabrics: [],
          createdAt: '',
        };
      })
      .filter((item): item is WishlistItemDto => item !== null);
  }, [guestCatalogQuery.data, guestSlugs, isAuthenticated, wishlistQuery.data]);

  const savedSlugs = useMemo(() => {
    if (isAuthenticated) {
      return new Set((wishlistQuery.data ?? []).map((item) => item.slug));
    }
    return new Set(guestSlugs);
  }, [guestSlugs, isAuthenticated, wishlistQuery.data]);

  const count = savedSlugs.size;

  const isWishlisted = useCallback((modelSlug: string) => savedSlugs.has(modelSlug), [savedSlugs]);

  const toggleWishlist = useCallback(
    async (modelSlug: string, modelHint?: PublicGarmentModelDto) => {
      const normalized = modelSlug.trim();
      if (!normalized) return;

      const currentlySaved = savedSlugs.has(normalized);

      if (!isAuthenticated) {
        const nextSlugs = currentlySaved
          ? guestSlugs.filter((slug) => slug !== normalized)
          : [normalized, ...guestSlugs.filter((slug) => slug !== normalized)];
        setGuestSlugs(nextSlugs);
        writeGuestSlugs(nextSlugs);
        toast(currentlySaved ? t('wishlist.removedToast') : t('wishlist.addedToast'), 'info');
        return;
      }

      if (mutatingSlug === normalized) return;
      setMutatingSlug(normalized);

      const previous = queryClient.getQueryData<WishlistItemDto[]>(wishlistQueryKeys.list) ?? [];

      if (currentlySaved) {
        queryClient.setQueryData<WishlistItemDto[]>(
          wishlistQueryKeys.list,
          previous.filter((item) => item.slug !== normalized)
        );
      } else if (modelHint) {
        const optimisticItem: WishlistItemDto = {
          garmentModelId: modelHint.id,
          slug: modelHint.slug,
          name: modelHint.name,
          description: modelHint.description,
          basePrice: modelHint.basePrice,
          imageUrl: modelHint.imageUrl,
          fabrics: [],
          createdAt: new Date().toISOString(),
        };
        queryClient.setQueryData<WishlistItemDto[]>(wishlistQueryKeys.list, [
          optimisticItem,
          ...previous.filter((item) => item.slug !== normalized),
        ]);
      }

      try {
        const nextList = currentlySaved
          ? await removeWishlistItem(normalized)
          : await addWishlistItem({ modelSlug: normalized });
        queryClient.setQueryData(wishlistQueryKeys.list, nextList);
        toast(currentlySaved ? t('wishlist.removedToast') : t('wishlist.addedToast'), 'info');
      } catch (err: unknown) {
        queryClient.setQueryData(wishlistQueryKeys.list, previous);
        const parsed = extractApiError(err, t('wishlist.syncError'));
        toast(parsed.message, 'err');
      } finally {
        setMutatingSlug(null);
      }
    },
    [guestSlugs, isAuthenticated, mutatingSlug, queryClient, savedSlugs, t, toast]
  );

  const refreshWishlist = useCallback(async () => {
    if (!isAuthenticated) return;
    await wishlistQuery.refetch();
  }, [isAuthenticated, wishlistQuery]);

  const value = useMemo<WishlistContextValue>(
    () => ({
      items,
      savedSlugs,
      count,
      loading: isAuthenticated ? wishlistQuery.isLoading || isMerging : false,
      syncing: isMerging || mutatingSlug !== null,
      isWishlisted,
      toggleWishlist,
      refreshWishlist,
    }),
    [
      count,
      isAuthenticated,
      isMerging,
      isWishlisted,
      items,
      mutatingSlug,
      refreshWishlist,
      savedSlugs,
      toggleWishlist,
      wishlistQuery.isLoading,
    ]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook pendamping WishlistProvider ditempatkan bersama agar konsisten dengan AuthContext & LanguageContext
export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error('useWishlist harus dipakai di dalam WishlistProvider.');
  }
  return ctx;
}
