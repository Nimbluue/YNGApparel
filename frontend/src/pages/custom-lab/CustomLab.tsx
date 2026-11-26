import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PAYMENT_SCHEME,
  PRINT_POSITION,
  type PaymentScheme,
  type PricingQuoteRequestDto,
  type PricingQuoteResponseDto,
  type PublicCatalogConfigDto,
  type UpsertCartItemRequestDto,
} from '@yng/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ColorPicker } from '../../components/custom-lab/ColorPicker';
import { PriceSummary } from '../../components/custom-lab/PriceSummary';
import { PrintSpotPicker } from '../../components/custom-lab/PrintSpotPicker';
import {
  pickNextAvailablePrintPosition,
  type PrintSpotDraft,
} from '../../components/custom-lab/printSpotHelpers';
import { SizeMatrix } from '../../components/custom-lab/SizeMatrix';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { WishlistHeartButton } from '../../components/ui/WishlistHeartButton';
import { useToast } from '../../components/ui/toastContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  catalogQueryKeys,
  getCatalogConfig,
  getCatalogModelBySlug,
  getCatalogModels,
  getCatalogPrintSizes,
  getCatalogSizes,
} from '../../services/catalogService';
import {
  addCartItem,
  cartQueryKeys,
  getCartItems,
  updateCartItem,
  uploadDesignFile,
} from '../../services/cartService';
import { requestPricingQuote } from '../../services/pricingService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import { getLocalizedPrintPositionLabel } from '../../utils/localizedLabels';
import { estimateCustomLabPricing, resolveActivePaymentScheme } from '../../utils/pricing';
import { rememberViewedModel } from '../../utils/recentlyViewed';
import { openWaLink } from '../../utils/whatsapp';

const DRAFT_STORAGE_KEY = 'yng_custom_lab_draft_v1';
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const ALLOWED_DESIGN_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf']);

interface CustomLabDraft {
  modelId: number | null;
  fabricId: number | null;
  isCustomColor: boolean;
  fabricColorId: number | null;
  customColorName: string;
  customColorHex: string;
  quantities: Record<number, number>;
  prints: PrintSpotDraft[];
  productionNotes: string;
  paymentScheme: PaymentScheme;
}

const DEFAULT_DRAFT: CustomLabDraft = {
  modelId: null,
  fabricId: null,
  isCustomColor: false,
  fabricColorId: null,
  customColorName: '',
  customColorHex: '',
  quantities: {},
  prints: [],
  productionNotes: '',
  paymentScheme: PAYMENT_SCHEME.FULL,
};

const FALLBACK_CONFIG: PublicCatalogConfigDto = {
  storeName: 'YNG Apparel',
  adminWhatsapp: '6280000000000',
  dpPercent: 70,
  dpMinQty: 12,
  productionEstimateText: '7-14 hari kerja',
  maxDesignFileMb: 20,
};

function readInitialDraft(): CustomLabDraft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return DEFAULT_DRAFT;
    const parsed = JSON.parse(raw) as Partial<CustomLabDraft>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_DRAFT;

    const quantities: Record<number, number> = {};
    if (parsed.quantities && typeof parsed.quantities === 'object') {
      for (const [key, value] of Object.entries(parsed.quantities)) {
        const sizeId = Number(key);
        const qty = typeof value === 'number' ? Math.floor(value) : 0;
        if (Number.isInteger(sizeId) && sizeId > 0 && qty > 0) {
          quantities[sizeId] = qty;
        }
      }
    }

    const validPositions = new Set<string>(Object.values(PRINT_POSITION));
    const prints: PrintSpotDraft[] = Array.isArray(parsed.prints)
      ? parsed.prints
          .filter((spot): spot is PrintSpotDraft => Boolean(spot && typeof spot === 'object'))
          .map((spot) => ({
            key: typeof spot.key === 'string' && spot.key ? spot.key : crypto.randomUUID(),
            printPosition: validPositions.has(spot.printPosition)
              ? spot.printPosition
              : PRINT_POSITION.FRONT_CHEST,
            printSizeId:
              typeof spot.printSizeId === 'number' && Number.isInteger(spot.printSizeId)
                ? spot.printSizeId
                : null,
            needsDesignHelp: Boolean(spot.needsDesignHelp),
            fileRef: typeof spot.fileRef === 'string' && spot.fileRef ? spot.fileRef : null,
            fileName: typeof spot.fileName === 'string' && spot.fileName ? spot.fileName : null,
            width: typeof spot.width === 'number' ? spot.width : null,
            height: typeof spot.height === 'number' ? spot.height : null,
          }))
      : [];

    return {
      modelId:
        typeof parsed.modelId === 'number' && Number.isInteger(parsed.modelId)
          ? parsed.modelId
          : null,
      fabricId:
        typeof parsed.fabricId === 'number' && Number.isInteger(parsed.fabricId)
          ? parsed.fabricId
          : null,
      isCustomColor: Boolean(parsed.isCustomColor),
      fabricColorId:
        typeof parsed.fabricColorId === 'number' && Number.isInteger(parsed.fabricColorId)
          ? parsed.fabricColorId
          : null,
      customColorName: typeof parsed.customColorName === 'string' ? parsed.customColorName : '',
      customColorHex: typeof parsed.customColorHex === 'string' ? parsed.customColorHex : '',
      quantities,
      prints,
      productionNotes:
        typeof parsed.productionNotes === 'string' ? parsed.productionNotes.slice(0, 500) : '',
      paymentScheme:
        parsed.paymentScheme === PAYMENT_SCHEME.DP ? PAYMENT_SCHEME.DP : PAYMENT_SCHEME.FULL,
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function saveDraftToSessionStorage(draft: CustomLabDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Abaikan jika sessionStorage diblokir browser
  }
}

export default function CustomLab() {
  const { isGuest } = useAuth();
  const { locale, t, pick } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedModelSlug = searchParams.get('model');
  const editCartItemUuid = searchParams.get('edit');
  const { toast } = useToast();

  const [draft, setDraft] = useState<CustomLabDraft>(() => readInitialDraft());
  const [serverQuote, setServerQuote] = useState<PricingQuoteResponseDto | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [uploadFeedbackBySpotKey, setUploadFeedbackBySpotKey] = useState<Record<string, string>>(
    {}
  );
  const [uploadingSpotKey, setUploadingSpotKey] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);

  const hydratedEditUuidRef = useRef<string | null>(null);
  const quoteRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const modelsQuery = useQuery({
    queryKey: catalogQueryKeys.models,
    queryFn: getCatalogModels,
  });

  const sizesQuery = useQuery({
    queryKey: catalogQueryKeys.sizes,
    queryFn: getCatalogSizes,
  });

  const printSizesQuery = useQuery({
    queryKey: catalogQueryKeys.printSizes,
    queryFn: getCatalogPrintSizes,
  });

  const configQuery = useQuery({
    queryKey: catalogQueryKeys.config,
    queryFn: getCatalogConfig,
  });

  const editCartQuery = useQuery({
    queryKey: cartQueryKeys.items,
    queryFn: getCartItems,
    enabled: Boolean(editCartItemUuid) && !isGuest,
  });

  useEffect(() => {
    if (!editCartItemUuid || !editCartQuery.data) return;
    if (hydratedEditUuidRef.current === editCartItemUuid) return;

    const targetItem = editCartQuery.data.items.find(
      (item) => item.cartItemUuid === editCartItemUuid
    );
    if (!targetItem) {
      hydratedEditUuidRef.current = editCartItemUuid;
      toast(
        pick(
          'Item keranjang yang akan diubah tidak ditemukan.',
          'The cart item to edit was not found.'
        ),
        'warn'
      );
      return;
    }

    const quantities: Record<number, number> = {};
    for (const s of targetItem.config.sizes) {
      if (s.qty > 0) {
        quantities[s.sizeId] = s.qty;
      }
    }

    hydratedEditUuidRef.current = editCartItemUuid;
    setServerQuote(null);
    setQuoteError(null);
    setActionFeedback(null);
    setDraft({
      modelId: targetItem.modelId,
      fabricId: targetItem.fabricId,
      isCustomColor: targetItem.config.isCustomColor,
      fabricColorId: targetItem.config.fabricColorId,
      customColorName: targetItem.config.colorName ?? '',
      customColorHex: targetItem.config.colorHex ?? '',
      quantities,
      prints: targetItem.config.prints.map((p) => ({
        key: crypto.randomUUID(),
        printPosition: p.printPosition,
        printSizeId: p.printSizeId,
        needsDesignHelp: p.needsDesignHelp,
        fileRef: p.fileRef,
        fileName: p.fileName,
        width: null,
        height: null,
      })),
      productionNotes: targetItem.config.productionNotes ?? '',
      paymentScheme: PAYMENT_SCHEME.FULL,
    });
  }, [editCartItemUuid, editCartQuery.data, toast, pick]);

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const sizes = useMemo(() => sizesQuery.data ?? [], [sizesQuery.data]);
  const printSizes = useMemo(() => printSizesQuery.data ?? [], [printSizesQuery.data]);
  const config = configQuery.data ?? FALLBACK_CONFIG;

  const selectedModel = useMemo(
    () => models.find((m) => m.id === draft.modelId) ?? null,
    [models, draft.modelId]
  );

  useEffect(() => {
    if (selectedModel) {
      rememberViewedModel(selectedModel);
    }
  }, [selectedModel]);

  const selectedModelIndex = useMemo(() => {
    if (!selectedModel) return 0;
    const idx = models.findIndex((m) => m.id === selectedModel.id);
    return idx >= 0 ? idx : 0;
  }, [models, selectedModel]);

  const modelDetailQuery = useQuery({
    queryKey: catalogQueryKeys.modelDetail(selectedModel?.slug ?? ''),
    queryFn: () => getCatalogModelBySlug(selectedModel!.slug),
    enabled: Boolean(selectedModel?.slug),
  });

  const availableFabrics = useMemo(
    () => modelDetailQuery.data?.fabrics ?? [],
    [modelDetailQuery.data]
  );

  const selectedFabric = useMemo(
    () => availableFabrics.find((f) => f.id === draft.fabricId) ?? null,
    [availableFabrics, draft.fabricId]
  );

  // Sinkronkan draft ke sessionStorage agar tidak hilang saat Guest pindah ke /login
  useEffect(() => {
    saveDraftToSessionStorage(draft);
  }, [draft]);

  // Pilih model dari parameter ?model=<slug> atau model pertama otomatis bila draft belum valid
  useEffect(() => {
    if (models.length === 0) return;

    if (requestedModelSlug) {
      const matched = models.find((m) => m.slug === requestedModelSlug);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('model');
          return next;
        },
        { replace: true }
      );
      if (matched && matched.id !== draft.modelId) {
        setServerQuote(null);
        setQuoteError(null);
        setDraft((prev) => ({
          ...prev,
          modelId: matched.id,
          fabricId: null,
          isCustomColor: false,
          fabricColorId: null,
          customColorName: '',
          customColorHex: '',
        }));
        return;
      }
    }

    if (!draft.modelId || !models.some((m) => m.id === draft.modelId)) {
      setDraft((prev) => ({
        ...prev,
        modelId: models[0]!.id,
        fabricId: null,
        isCustomColor: false,
        fabricColorId: null,
        customColorName: '',
        customColorHex: '',
      }));
      setServerQuote(null);
    }
  }, [models, draft.modelId, requestedModelSlug, setSearchParams]);

  // Validasi ulang bahan dari draft hanya setelah detail model selesai dimuat
  useEffect(() => {
    if (!selectedModel || !modelDetailQuery.data) return;
    if (modelDetailQuery.data.id !== selectedModel.id) return;

    if (
      draft.fabricId !== null &&
      !modelDetailQuery.data.fabrics.some((f) => f.id === draft.fabricId)
    ) {
      setDraft((prev) => ({
        ...prev,
        fabricId: null,
        isCustomColor: false,
        fabricColorId: null,
        customColorName: '',
        customColorHex: '',
      }));
      setServerQuote(null);
    }
  }, [selectedModel, modelDetailQuery.data, draft.fabricId]);

  // Validasi ulang preset warna bila bahan dimuat ulang
  useEffect(() => {
    if (!selectedFabric || draft.isCustomColor) return;
    if (
      draft.fabricColorId !== null &&
      !selectedFabric.colors.some((c) => c.id === draft.fabricColorId)
    ) {
      setDraft((prev) => ({
        ...prev,
        fabricColorId: null,
      }));
      setServerQuote(null);
    }
  }, [selectedFabric, draft.isCustomColor, draft.fabricColorId]);

  const selectedPrintSizes = useMemo(() => {
    const map = new Map(printSizes.map((ps) => [ps.id, ps]));
    return draft.prints
      .map((spot) => (spot.printSizeId !== null ? map.get(spot.printSizeId) : undefined))
      .filter((ps): ps is NonNullable<typeof ps> => Boolean(ps));
  }, [draft.prints, printSizes]);

  const localEstimate = useMemo(
    () =>
      estimateCustomLabPricing({
        model: selectedModel,
        fabric: selectedFabric,
        sizes,
        quantities: draft.quantities,
        selectedPrintSizes,
        config,
      }),
    [selectedModel, selectedFabric, sizes, draft.quantities, selectedPrintSizes, config]
  );

  // Reset pilihan pembayaran ke FULL secara otomatis bila qty di bawah ambang dpMinQty
  useEffect(() => {
    const activeMinQty = serverQuote?.dpMinQty ?? config.dpMinQty;
    const isEligible = localEstimate.totalQty >= activeMinQty;
    if (!isEligible && draft.paymentScheme === PAYMENT_SCHEME.DP) {
      setDraft((prev) => ({
        ...prev,
        paymentScheme: resolveActivePaymentScheme(prev.paymentScheme, false),
      }));
    }
  }, [localEstimate.totalQty, serverQuote?.dpMinQty, config.dpMinQty, draft.paymentScheme]);

  // Bangun payload POST /api/pricing/quote bila seluruh field wajib lengkap
  const quotePayload = useMemo<PricingQuoteRequestDto | null>(() => {
    if (!selectedModel || !selectedFabric) return null;

    const sizeEntries = sizes
      .map((size) => ({
        sizeId: size.id,
        qty: Math.max(0, Math.floor(draft.quantities[size.id] ?? 0)),
      }))
      .filter((entry) => entry.qty > 0);

    if (sizeEntries.length === 0) return null;

    if (draft.isCustomColor) {
      const trimmedName = draft.customColorName.trim();
      const trimmedHex = draft.customColorHex.trim();
      if (!trimmedName) return null;
      if (trimmedHex.length > 0 && !HEX_COLOR_REGEX.test(trimmedHex)) return null;
    } else if (!draft.fabricColorId) {
      return null;
    }

    if (draft.prints.some((spot) => spot.printSizeId === null)) {
      return null;
    }

    return {
      items: [
        {
          modelId: selectedModel.id,
          fabricId: selectedFabric.id,
          isCustomColor: draft.isCustomColor,
          ...(draft.isCustomColor
            ? {
                colorName: draft.customColorName.trim(),
                ...(draft.customColorHex.trim()
                  ? { colorHex: draft.customColorHex.trim().toUpperCase() }
                  : {}),
              }
            : {
                fabricColorId: draft.fabricColorId!,
              }),
          sizes: sizeEntries,
          prints: draft.prints.map((spot) => ({
            printSizeId: spot.printSizeId!,
            printPosition: spot.printPosition,
          })),
        },
      ],
    };
  }, [
    selectedModel,
    selectedFabric,
    sizes,
    draft.quantities,
    draft.isCustomColor,
    draft.customColorName,
    draft.customColorHex,
    draft.fabricColorId,
    draft.prints,
  ]);

  const quoteMutation = useMutation({
    mutationFn: async (vars: { payload: PricingQuoteRequestDto; signal: AbortSignal }) =>
      requestPricingQuote(vars.payload, vars.signal),
  });

  const { mutateAsync: fetchQuoteAsync } = quoteMutation;

  useEffect(() => {
    if (!quotePayload) {
      abortControllerRef.current?.abort();
      setServerQuote(null);
      setQuoteError(null);
      return;
    }

    const requestId = ++quoteRequestIdRef.current;
    const timer = window.setTimeout(() => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      void fetchQuoteAsync({ payload: quotePayload, signal: controller.signal })
        .then((quoteData) => {
          if (quoteRequestIdRef.current !== requestId) return;
          setServerQuote(quoteData);
          setQuoteError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || quoteRequestIdRef.current !== requestId) return;
          const parsed = extractApiError(
            err,
            pick('Gagal menghitung harga dari server.', 'Failed to calculate quote from server.')
          );
          setServerQuote(null);
          setQuoteError(parsed.message);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [quotePayload, fetchQuoteAsync, pick]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSelectModel = useCallback((modelId: number) => {
    setActionFeedback(null);
    setServerQuote(null);
    setQuoteError(null);
    setCatalogModalOpen(false);
    setDraft((prev) => {
      if (prev.modelId === modelId) return prev;
      return {
        ...prev,
        modelId,
        fabricId: null,
        isCustomColor: false,
        fabricColorId: null,
        customColorName: '',
        customColorHex: '',
      };
    });
  }, []);

  const handleSelectFabric = useCallback((fabricId: number) => {
    setActionFeedback(null);
    setServerQuote(null);
    setQuoteError(null);
    setDraft((prev) => ({
      ...prev,
      fabricId,
      isCustomColor: false,
      fabricColorId: null,
      customColorName: '',
      customColorHex: '',
    }));
  }, []);

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort();
    setServerQuote(null);
    setQuoteError(null);
    setUploadFeedbackBySpotKey({});
    setActionFeedback(null);
    setDraft({
      ...DEFAULT_DRAFT,
      modelId: models[0]?.id ?? null,
    });
    toast(
      pick(
        'Konfigurasi Custom Lab dikembalikan ke awal.',
        'Custom Lab configuration has been reset.'
      ),
      'info'
    );
  }, [models, pick, toast]);

  const handleAddSpot = useCallback(() => {
    setActionFeedback(null);
    setDraft((prev) => ({
      ...prev,
      prints: [
        ...prev.prints,
        {
          key: crypto.randomUUID(),
          printPosition: pickNextAvailablePrintPosition(prev.prints),
          printSizeId: printSizes[0]?.id ?? null,
          needsDesignHelp: false,
          fileRef: null,
          fileName: null,
          width: null,
          height: null,
        },
      ],
    }));
  }, [printSizes]);

  const handleUpdateSpot = useCallback(
    (key: string, patch: Partial<Omit<PrintSpotDraft, 'key'>>) => {
      setActionFeedback(null);
      setDraft((prev) => ({
        ...prev,
        prints: prev.prints.map((spot) => (spot.key === key ? { ...spot, ...patch } : spot)),
      }));
    },
    []
  );

  const handleRemoveSpot = useCallback((key: string) => {
    setActionFeedback(null);
    setUploadFeedbackBySpotKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDraft((prev) => ({
      ...prev,
      prints: prev.prints.filter((spot) => spot.key !== key),
    }));
  }, []);

  const uploadDesignMutation = useMutation({
    mutationFn: async ({ spotKey, file }: { spotKey: string; file: File }) => {
      const result = await uploadDesignFile(file);
      return { spotKey, result };
    },
    onSuccess: ({ spotKey, result }) => {
      setDraft((prev) => ({
        ...prev,
        prints: prev.prints.map((spot) =>
          spot.key === spotKey
            ? {
                ...spot,
                needsDesignHelp: false,
                fileRef: result.fileRef,
                fileName: result.fileName,
                width: result.width,
                height: result.height,
              }
            : spot
        ),
      }));
      setUploadFeedbackBySpotKey((prev) => ({
        ...prev,
        [spotKey]: pick(
          `File "${result.fileName}" berhasil diunggah ke storage.`,
          `File "${result.fileName}" uploaded to storage.`
        ),
      }));
      toast(pick('File desain berhasil diunggah.', 'Design file uploaded successfully.'), 'ok');
    },
    onError: (err, variables) => {
      const parsed = extractApiError(
        err,
        pick('Gagal mengunggah file desain.', 'Failed to upload design file.')
      );
      setUploadFeedbackBySpotKey((prev) => ({ ...prev, [variables.spotKey]: parsed.message }));
      toast(parsed.message, 'err');
    },
    onSettled: () => {
      setUploadingSpotKey(null);
    },
  });

  const handleRequestLoginForUpload = useCallback(() => {
    saveDraftToSessionStorage(draft);
    toast(
      pick(
        'Silakan masuk terlebih dahulu untuk mengunggah file desain.',
        'Please sign in first to upload a design file.'
      ),
      'info'
    );
    navigate('/login', { state: { from: '/custom-lab' } });
  }, [draft, navigate, pick, toast]);

  const handleSelectDesignFile = useCallback(
    (spotKey: string, file: File) => {
      saveDraftToSessionStorage(draft);
      if (isGuest) {
        handleRequestLoginForUpload();
        return;
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_DESIGN_EXTENSIONS.has(ext)) {
        const msg = pick(
          'Format file tidak didukung. Gunakan PNG, JPG, WEBP, SVG, atau PDF.',
          'Unsupported file format. Use PNG, JPG, WEBP, SVG, or PDF.'
        );
        setUploadFeedbackBySpotKey((prev) => ({ ...prev, [spotKey]: msg }));
        toast(msg, 'warn');
        return;
      }

      const maxBytes = config.maxDesignFileMb * 1024 * 1024;
      if (file.size <= 0 || file.size > maxBytes) {
        const msg = pick(
          `Ukuran file harus lebih dari 0 dan maksimal ${config.maxDesignFileMb} MB.`,
          `File size must be greater than 0 and up to ${config.maxDesignFileMb} MB.`
        );
        setUploadFeedbackBySpotKey((prev) => ({ ...prev, [spotKey]: msg }));
        toast(msg, 'warn');
        return;
      }

      setUploadingSpotKey(spotKey);
      setUploadFeedbackBySpotKey((prev) => {
        const next = { ...prev };
        delete next[spotKey];
        return next;
      });
      uploadDesignMutation.mutate({ spotKey, file });
    },
    [
      config.maxDesignFileMb,
      draft,
      handleRequestLoginForUpload,
      isGuest,
      pick,
      toast,
      uploadDesignMutation,
    ]
  );

  const colorSummary = useMemo(() => {
    if (draft.isCustomColor) {
      return draft.customColorName.trim()
        ? `${draft.customColorName.trim()} (Custom · WA)`
        : pick('Warna custom (belum diisi)', 'Custom color (not filled)');
    }
    if (!selectedFabric || draft.fabricColorId === null) return null;
    return selectedFabric.colors.find((c) => c.id === draft.fabricColorId)?.colorName ?? null;
  }, [draft.isCustomColor, draft.customColorName, draft.fabricColorId, pick, selectedFabric]);

  const activeColorHex = useMemo(() => {
    if (draft.isCustomColor) {
      const trimmed = draft.customColorHex.trim();
      return HEX_COLOR_REGEX.test(trimmed) ? trimmed.toUpperCase() : null;
    }
    if (!selectedFabric || draft.fabricColorId === null) return null;
    return selectedFabric.colors.find((c) => c.id === draft.fabricColorId)?.colorHex ?? null;
  }, [draft.isCustomColor, draft.customColorHex, draft.fabricColorId, selectedFabric]);

  const saveCartMutation = useMutation({
    mutationFn: async (payload: UpsertCartItemRequestDto) => {
      if (editCartItemUuid) {
        return updateCartItem(editCartItemUuid, payload);
      }
      return addCartItem(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cartQueryKeys.items });
      setDraft({
        ...DEFAULT_DRAFT,
        modelId: models[0]?.id ?? null,
      });
      setServerQuote(null);
      setQuoteError(null);
      setUploadFeedbackBySpotKey({});
      setActionFeedback(null);
      toast(
        editCartItemUuid
          ? pick(
              'Konfigurasi item keranjang berhasil diperbarui.',
              'Bag item configuration updated.'
            )
          : pick(
              'Item berhasil ditambahkan ke Keranjang Custom Lab.',
              'Item added to your Custom Lab bag.'
            ),
        'ok'
      );
      navigate('/keranjang');
    },
    onError: (err) => {
      const parsed = extractApiError(
        err,
        pick('Gagal menyimpan item ke keranjang.', 'Failed to save item to bag.')
      );
      setActionFeedback(parsed.message);
      toast(parsed.message, 'err');
    },
  });

  const handleAddToCart = useCallback(() => {
    saveDraftToSessionStorage(draft);
    if (isGuest) {
      toast(
        pick(
          'Silakan masuk terlebih dahulu untuk menyimpan ke keranjang.',
          'Please sign in first to save to your bag.'
        ),
        'info'
      );
      navigate('/login', { state: { from: '/custom-lab' } });
      return;
    }

    if (uploadingSpotKey) {
      const msg = pick(
        'Tunggu proses unggah file desain selesai terlebih dahulu.',
        'Please wait for the design file upload to finish.'
      );
      setActionFeedback(msg);
      toast(msg, 'warn');
      return;
    }

    if (!quotePayload || !quotePayload.items[0]) {
      const msg = pick(
        'Lengkapi model, bahan, warna, jumlah ukuran (> 0), dan ukuran sablon terlebih dahulu.',
        'Complete model, fabric, color, size quantities (> 0), and print sizes first.'
      );
      setActionFeedback(msg);
      toast(msg, 'warn');
      return;
    }

    for (let i = 0; i < draft.prints.length; i += 1) {
      const spot = draft.prints[i]!;
      if (!spot.needsDesignHelp && !spot.fileRef) {
        const msg = pick(
          `Titik sablon #${i + 1}: unggah file desain atau centang "Bantu desainkan saya (Gratis)".`,
          `Print spot #${i + 1}: upload a design file or select "Request free design help".`
        );
        setActionFeedback(msg);
        toast(msg, 'warn');
        return;
      }
    }

    const baseItem = quotePayload.items[0];
    const trimmedNotes = draft.productionNotes.trim();
    const payload: UpsertCartItemRequestDto = {
      modelId: baseItem.modelId,
      fabricId: baseItem.fabricId,
      isCustomColor: baseItem.isCustomColor,
      ...(baseItem.isCustomColor
        ? {
            colorName: baseItem.colorName ?? '',
            ...(baseItem.colorHex ? { colorHex: baseItem.colorHex } : {}),
          }
        : { fabricColorId: baseItem.fabricColorId ?? null }),
      sizes: baseItem.sizes,
      prints: draft.prints.map((spot) => ({
        printSizeId: spot.printSizeId!,
        printPosition: spot.printPosition,
        needsDesignHelp: spot.needsDesignHelp,
        ...(spot.needsDesignHelp ? {} : { fileRef: spot.fileRef, fileName: spot.fileName }),
      })),
      ...(trimmedNotes ? { productionNotes: trimmedNotes } : { productionNotes: null }),
    };

    setActionFeedback(null);
    saveCartMutation.mutate(payload);
  }, [draft, isGuest, navigate, pick, quotePayload, saveCartMutation, toast, uploadingSpotKey]);

  const handleAskWhatsApp = useCallback(() => {
    const sizeText = sizes
      .map((s) => ({ code: s.code, qty: draft.quantities[s.id] ?? 0 }))
      .filter((item) => item.qty > 0)
      .map((item) => `${item.code}:${item.qty}`)
      .join(', ');

    const printText =
      draft.prints.length > 0
        ? draft.prints
            .map((spot) => {
              const pSize = printSizes.find((p) => p.id === spot.printSizeId);
              return `${getLocalizedPrintPositionLabel(spot.printPosition, locale)} (${pSize?.name ?? pick('Belum pilih ukuran', 'No size selected')})`;
            })
            .join(', ')
        : pick('Polos', 'Plain');

    const subtotal = serverQuote?.subtotalAmount ?? localEstimate.subtotalAmount;
    const totalQty = serverQuote?.totalQty ?? localEstimate.totalQty;

    const lines = [
      pick(
        'Halo admin YNG Apparel, saya ingin konsultasi pesanan Custom Lab:',
        'Hello YNG Apparel admin, I would like to consult on a Custom Lab order:'
      ),
      `- Model: ${selectedModel?.name ?? '-'}`,
      `- ${pick('Bahan', 'Fabric')}: ${selectedFabric?.name ?? '-'}`,
      `- ${pick('Warna', 'Color')}: ${colorSummary ?? '-'}`,
      `- ${pick('Ukuran', 'Sizes')} (${totalQty} pcs): ${sizeText || '-'}`,
      `- ${pick('Sablon', 'Print')}: ${printText}`,
      `- ${pick('Estimasi subtotal', 'Estimated subtotal')}: ${formatRupiah(subtotal)}`,
    ];

    openWaLink(config.adminWhatsapp, lines.join('\n'));
  }, [
    sizes,
    draft.quantities,
    draft.prints,
    printSizes,
    locale,
    pick,
    serverQuote?.subtotalAmount,
    serverQuote?.totalQty,
    localEstimate.subtotalAmount,
    localEstimate.totalQty,
    selectedModel?.name,
    selectedFabric?.name,
    colorSummary,
    config.adminWhatsapp,
  ]);

  const isInitialLoading =
    modelsQuery.isLoading ||
    sizesQuery.isLoading ||
    printSizesQuery.isLoading ||
    configQuery.isLoading;

  const initialError =
    modelsQuery.error || sizesQuery.error || printSizesQuery.error || configQuery.error;

  if (isInitialLoading) {
    return (
      <div className="grid gap-8 lg:grid-cols-2 xl:gap-12">
        <div className="space-y-4">
          <Skeleton className="aspect-[4/5] w-full rounded-3xl" />
          <div className="flex gap-2.5 overflow-hidden">
            <Skeleton className="aspect-[4/5] w-20 shrink-0 rounded-xl sm:w-24" />
            <Skeleton className="aspect-[4/5] w-20 shrink-0 rounded-xl sm:w-24" />
            <Skeleton className="aspect-[4/5] w-20 shrink-0 rounded-xl sm:w-24" />
          </div>
        </div>
        <div className="space-y-5">
          <div className="space-y-3 border-b border-line pb-5">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-48" />
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (initialError) {
    const parsed = extractApiError(
      initialError,
      pick('Gagal memuat katalog Custom Lab.', 'Failed to load Custom Lab catalog.')
    );
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState
          eyebrow={t('common.errorEyebrow')}
          retryLabel={t('common.retry')}
          title={pick('Katalog belum dapat dimuat', 'Catalog could not be loaded')}
          message={parsed.message}
          retry={() => {
            void modelsQuery.refetch();
            void sizesQuery.refetch();
            void printSizesQuery.refetch();
            void configQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <EmptyState
          title={pick('Katalog produk belum tersedia', 'No catalog models available')}
          description={pick(
            'Admin belum mengaktifkan model pakaian di katalog. Silakan hubungi tim kami via WhatsApp.',
            'No garment models are active in the catalog yet. Please contact our team via WhatsApp.'
          )}
          action={
            <button type="button" onClick={handleAskWhatsApp} className="btn-primary">
              {pick('Hubungi via WhatsApp', 'Contact via WhatsApp')}
            </button>
          }
        />
      </div>
    );
  }

  const formattedIndex = String(selectedModelIndex + 1).padStart(2, '0');
  const formattedTotal = String(models.length).padStart(2, '0');

  return (
    <div className="pb-28 lg:pb-12">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start xl:gap-12">
        {/* Kolom Kiri PDP: Galeri Model Aktif & Thumbnail Strip (sticky di desktop) */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
          <div className="aspect-[4/5] w-full overflow-hidden rounded-3xl border border-line bg-surface">
            {selectedModel?.imageUrl ? (
              <img
                src={selectedModel.imageUrl}
                alt={selectedModel.name}
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
                <span className="font-display text-lg font-semibold text-ink">
                  {selectedModel?.name ?? pick('Model Pakaian', 'Garment Model')}
                </span>
                <span className="text-xs text-muted">
                  {pick('Foto katalog segera hadir', 'Catalog photo coming soon')}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
            <span>
              <span className="tabular-price font-medium text-ink">
                {formattedIndex} / {formattedTotal}
              </span>{' '}
              · {selectedModel?.name ?? '—'}
            </span>
            {colorSummary ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                {activeColorHex ? (
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full border border-neutral-300"
                    style={{ backgroundColor: activeColorHex }}
                    aria-hidden="true"
                  />
                ) : null}
                <span>{colorSummary}</span>
              </span>
            ) : null}
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink">
                {pick('Model Pakaian', 'Garment Models')}
              </p>
              {models.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setCatalogModalOpen(true)}
                  className="inline-flex min-h-touch items-center rounded-full px-3 text-xs font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
                >
                  {pick('Lihat Semua Model', 'Browse All Models')}
                </button>
              ) : null}
            </div>

            <div
              role="region"
              aria-label={pick('Pilihan model pakaian', 'Garment model selector')}
              className="flex gap-2.5 overflow-x-auto pb-1.5 [scrollbar-width:thin]"
            >
              {models.map((model) => {
                const isSelected = selectedModel?.id === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleSelectModel(model.id)}
                    aria-pressed={isSelected}
                    className="group w-20 shrink-0 text-left sm:w-24"
                  >
                    <div
                      className={`aspect-[4/5] w-full overflow-hidden rounded-xl border bg-surface transition-colors ${
                        isSelected
                          ? 'border-ink ring-1 ring-ink'
                          : 'border-line group-hover:border-line-strong'
                      }`}
                    >
                      {model.imageUrl ? (
                        <img
                          src={model.imageUrl}
                          alt={model.name}
                          className="h-full w-full object-cover object-center"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-1.5 text-center text-[11px] font-medium text-muted">
                          {model.name}
                        </div>
                      )}
                    </div>
                    <p
                      className={`mt-1.5 truncate text-xs ${
                        isSelected ? 'font-semibold text-ink' : 'font-medium text-muted'
                      }`}
                    >
                      {model.name}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Kolom Kanan PDP: Info Produk, Konfigurator Bahan/Warna/Ukuran/Sablon, & Ringkasan */}
        <div className="min-w-0 space-y-7">
          <header className="border-b border-line pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow">Custom Lab · {config.storeName}</p>
              <div className="flex items-center gap-2">
                {selectedModel ? (
                  <WishlistHeartButton
                    modelSlug={selectedModel.slug}
                    modelName={selectedModel.name}
                    modelHint={selectedModel}
                    variant="inline"
                    size="sm"
                    showLabel
                  />
                ) : null}
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-4 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-surface"
                >
                  {pick('Reset', 'Reset')}
                </button>
              </div>
            </div>

            <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl lg:text-4xl">
              {selectedModel?.name ?? pick('Rancang Pakaian Custom', 'Design Custom Apparel')}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-base font-semibold text-ink">
                {pick('Mulai', 'From')}{' '}
                <span className="tabular-price">{formatRupiah(selectedModel?.basePrice ?? 0)}</span>{' '}
                <span className="text-xs font-normal text-muted">/ pcs</span>
              </p>
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
                {pick('Estimasi', 'Lead time')} {config.productionEstimateText}
              </span>
            </div>

            {selectedModel?.description ? (
              <p className="mt-3 text-sm leading-relaxed text-muted">{selectedModel.description}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              {pick(
                'Seluruh rincian harga divalidasi dan dihitung langsung oleh server.',
                'All pricing breakdowns are validated and calculated directly on the server.'
              )}
            </p>
          </header>

          {/* 01 · Bahan Pakaian (kompatibel dari model_fabrics) */}
          <section
            className="space-y-3 border-b border-line pb-6"
            aria-labelledby="step-fabric-heading"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id="step-fabric-heading"
                className="font-display text-base font-semibold text-ink"
              >
                <span className="tabular-price mr-1.5 text-muted">01</span>{' '}
                {pick('Pilih Bahan', 'Select Fabric')}
              </h2>
              <span className="text-xs text-muted">
                {pick('Kompatibel untuk', 'Compatible with')}{' '}
                {selectedModel?.name ?? pick('model terpilih', 'selected model')}
              </span>
            </div>

            {modelDetailQuery.isLoading ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : modelDetailQuery.error ? (
              <ErrorState
                eyebrow={t('common.errorEyebrow')}
                retryLabel={t('common.retry')}
                title={pick('Gagal memuat bahan model', 'Failed to load model fabrics')}
                message={
                  extractApiError(
                    modelDetailQuery.error,
                    pick('Tidak dapat mengambil daftar bahan.', 'Could not fetch fabric list.')
                  ).message
                }
                retry={() => void modelDetailQuery.refetch()}
              />
            ) : availableFabrics.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong bg-surface p-4 text-sm text-muted">
                {pick(
                  'Belum ada bahan aktif yang terhubung dengan model ini.',
                  'No active fabrics are linked to this model yet.'
                )}
              </p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {availableFabrics.map((fabric) => {
                  const isSelected = selectedFabric?.id === fabric.id;
                  return (
                    <button
                      key={fabric.id}
                      type="button"
                      onClick={() => handleSelectFabric(fabric.id)}
                      aria-pressed={isSelected}
                      className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-colors ${
                        isSelected
                          ? 'border-ink bg-ink text-white'
                          : 'border-line bg-white text-ink hover:border-line-strong hover:bg-surface'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-sm font-semibold">{fabric.name}</p>
                          {fabric.gsmWeight ? (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] ${
                                isSelected
                                  ? 'bg-neutral-800 text-neutral-200'
                                  : 'bg-surface text-muted'
                              }`}
                            >
                              {fabric.gsmWeight} GSM
                            </span>
                          ) : null}
                        </div>
                        {fabric.description ? (
                          <p
                            className={`line-clamp-2 text-xs leading-relaxed ${
                              isSelected ? 'text-neutral-300' : 'text-muted'
                            }`}
                          >
                            {fabric.description}
                          </p>
                        ) : null}
                      </div>

                      <p
                        className={`mt-2.5 text-xs font-semibold ${
                          isSelected ? 'text-white' : 'text-ink'
                        }`}
                      >
                        {fabric.additionalPrice > 0 ? (
                          <>
                            <span className="tabular-price">
                              +{formatRupiah(fabric.additionalPrice)}
                            </span>{' '}
                            / pcs
                          </>
                        ) : (
                          pick('Termasuk harga dasar', 'Included in base price')
                        )}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 02 · Warna (Preset per bahan atau Warna Custom) */}
          <section
            className="space-y-3 border-b border-line pb-6"
            aria-labelledby="step-color-heading"
          >
            <div>
              <h2 id="step-color-heading" className="font-display text-base font-semibold text-ink">
                <span className="tabular-price mr-1.5 text-muted">02</span>{' '}
                {pick('Pilih Warna Bahan', 'Select Fabric Color')}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {pick(
                  'Pilih preset stok bahan atau ajukan warna custom untuk konfirmasi via WhatsApp.',
                  'Choose an in-stock preset color or request a custom shade via WhatsApp.'
                )}
              </p>
            </div>

            <ColorPicker
              colors={selectedFabric?.colors ?? []}
              selectedColorId={draft.fabricColorId}
              isCustomColor={draft.isCustomColor}
              customColorName={draft.customColorName}
              customColorHex={draft.customColorHex}
              disabled={!selectedFabric}
              onSelectPresetColor={(colorId) => {
                setActionFeedback(null);
                setDraft((prev) => ({
                  ...prev,
                  isCustomColor: false,
                  fabricColorId: colorId,
                  customColorName: '',
                  customColorHex: '',
                }));
              }}
              onSelectCustomColor={() => {
                setActionFeedback(null);
                setDraft((prev) => ({
                  ...prev,
                  isCustomColor: true,
                  fabricColorId: null,
                }));
              }}
              onChangeCustomColorName={(value) => {
                setActionFeedback(null);
                setDraft((prev) => ({ ...prev, customColorName: value }));
              }}
              onChangeCustomColorHex={(value) => {
                setActionFeedback(null);
                setDraft((prev) => ({ ...prev, customColorHex: value }));
              }}
            />
          </section>

          {/* 03 · Matriks Ukuran */}
          <section
            className="space-y-3 border-b border-line pb-6"
            aria-labelledby="step-size-heading"
          >
            <div>
              <h2 id="step-size-heading" className="font-display text-base font-semibold text-ink">
                <span className="tabular-price mr-1.5 text-muted">03</span>{' '}
                {pick('Jumlah per Ukuran', 'Size Matrix')}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {pick(
                  <>
                    Minimal{' '}
                    <span className="tabular-price font-medium text-ink">
                      {config.dpMinQty} pcs
                    </span>{' '}
                    total untuk membuka pembayaran DP{' '}
                    <span className="tabular-price font-medium text-ink">{config.dpPercent}%</span>.
                  </>,
                  <>
                    Minimum{' '}
                    <span className="tabular-price font-medium text-ink">
                      {config.dpMinQty} pcs
                    </span>{' '}
                    total to unlock{' '}
                    <span className="tabular-price font-medium text-ink">{config.dpPercent}%</span>{' '}
                    deposit.
                  </>
                )}
              </p>
            </div>

            <SizeMatrix
              sizes={sizes}
              quantities={draft.quantities}
              onChangeQuantity={(sizeId, nextQty) => {
                setActionFeedback(null);
                setDraft((prev) => {
                  const nextQuantities = { ...prev.quantities };
                  if (nextQty <= 0) {
                    delete nextQuantities[sizeId];
                  } else {
                    nextQuantities[sizeId] = nextQty;
                  }
                  return { ...prev, quantities: nextQuantities };
                });
              }}
            />
          </section>

          {/* 04 · Titik Sablon & Desain */}
          <section
            className="space-y-3 border-b border-line pb-6"
            aria-labelledby="step-print-heading"
          >
            <h2 id="step-print-heading" className="font-display text-base font-semibold text-ink">
              <span className="tabular-price mr-1.5 text-muted">04</span>{' '}
              {pick('Titik Sablon & Desain', 'Print Spots & Artwork')}
            </h2>

            <PrintSpotPicker
              spots={draft.prints}
              printSizes={printSizes}
              isGuest={isGuest}
              maxDesignFileMb={config.maxDesignFileMb}
              uploadingSpotKey={uploadingSpotKey}
              onAddSpot={handleAddSpot}
              onUpdateSpot={handleUpdateSpot}
              onRemoveSpot={handleRemoveSpot}
              onRequestLoginForUpload={handleRequestLoginForUpload}
              onSelectDesignFile={handleSelectDesignFile}
              uploadFeedbackBySpotKey={uploadFeedbackBySpotKey}
            />
          </section>

          {/* 05 · Catatan Produksi */}
          <section className="space-y-3" aria-labelledby="step-notes-heading">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="step-notes-heading" className="font-display text-base font-semibold text-ink">
                <span className="tabular-price mr-1.5 text-muted">05</span>{' '}
                {pick('Catatan Produksi', 'Production Notes')}
              </h2>
              <span className="text-xs text-muted">
                {pick('Opsional · maks. 500 karakter', 'Optional · max 500 chars')}
              </span>
            </div>
            <textarea
              id="custom-lab-production-notes"
              rows={3}
              maxLength={500}
              value={draft.productionNotes}
              onChange={(event) => {
                setActionFeedback(null);
                setDraft((prev) => ({ ...prev, productionNotes: event.target.value }));
              }}
              placeholder={pick(
                'Contoh: posisi logo 3 cm di bawah kerah, atau instruksi khusus untuk tim desain.',
                'Example: logo 3 cm below collar, or specific notes for the design team.'
              )}
              className="input-sharp min-h-[88px] resize-y py-2.5"
            />
          </section>

          <PriceSummary
            layout="inline"
            modelName={selectedModel?.name ?? null}
            fabricName={selectedFabric?.name ?? null}
            colorSummary={colorSummary}
            printSpotsCount={draft.prints.length}
            localEstimate={localEstimate}
            serverQuote={serverQuote}
            isQuotePending={quoteMutation.isPending}
            quoteError={quoteError}
            isReadyForServerQuote={Boolean(quotePayload)}
            config={config}
            selectedPaymentScheme={draft.paymentScheme}
            onChangePaymentScheme={(scheme) =>
              setDraft((prev) => ({
                ...prev,
                paymentScheme: resolveActivePaymentScheme(
                  scheme,
                  serverQuote?.dpEligible ?? localEstimate.dpEligible
                ),
              }))
            }
            isGuest={isGuest}
            isSubmittingCart={saveCartMutation.isPending}
            submitCartLabel={
              editCartItemUuid ? pick('Simpan Perubahan Keranjang', 'Save Bag Changes') : undefined
            }
            onAddToCart={handleAddToCart}
            onAskWhatsApp={handleAskWhatsApp}
            actionFeedback={actionFeedback}
          />
        </div>
      </div>

      <Modal
        open={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
        title={pick('Pilih Model Pakaian', 'Select Garment Model')}
        description={pick(
          'Pilih siluet pakaian untuk dikonfigurasi di Custom Lab.',
          'Pick a garment silhouette to configure in Custom Lab.'
        )}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {models.map((model) => {
            const isSelected = selectedModel?.id === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => handleSelectModel(model.id)}
                aria-pressed={isSelected}
                className={`flex flex-col overflow-hidden rounded-2xl border text-left transition-colors ${
                  isSelected
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-white text-ink hover:border-line-strong hover:bg-surface'
                }`}
              >
                <div className="aspect-[4/5] w-full overflow-hidden bg-surface">
                  {model.imageUrl ? (
                    <img
                      src={model.imageUrl}
                      alt={model.name}
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-medium text-muted">
                      {model.name}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between gap-1.5 p-3">
                  <p className="font-display text-sm font-semibold">{model.name}</p>
                  <p
                    className={`tabular-price text-xs font-semibold ${
                      isSelected ? 'text-neutral-200' : 'text-muted'
                    }`}
                  >
                    {pick('Mulai', 'From')} {formatRupiah(model.basePrice)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
