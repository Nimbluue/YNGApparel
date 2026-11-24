import { useMutation, useQuery } from '@tanstack/react-query';
import {
  PAYMENT_SCHEME,
  PRINT_POSITION,
  PRINT_POSITION_LABELS,
  type PaymentScheme,
  type PricingQuoteRequestDto,
  type PricingQuoteResponseDto,
  type PublicCatalogConfigDto,
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
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/toastContext';
import { useAuth } from '../../context/AuthContext';
import {
  catalogQueryKeys,
  getCatalogConfig,
  getCatalogModelBySlug,
  getCatalogModels,
  getCatalogPrintSizes,
  getCatalogSizes,
} from '../../services/catalogService';
import { requestPricingQuote } from '../../services/pricingService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import { estimateCustomLabPricing, resolveActivePaymentScheme } from '../../utils/pricing';
import { openWaLink } from '../../utils/whatsapp';

const DRAFT_STORAGE_KEY = 'yng_custom_lab_draft_v1';
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

interface CustomLabDraft {
  modelId: number | null;
  fabricId: number | null;
  isCustomColor: boolean;
  fabricColorId: number | null;
  customColorName: string;
  customColorHex: string;
  quantities: Record<number, number>;
  prints: PrintSpotDraft[];
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedModelSlug = searchParams.get('model');
  const { toast } = useToast();

  const [draft, setDraft] = useState<CustomLabDraft>(() => readInitialDraft());
  const [serverQuote, setServerQuote] = useState<PricingQuoteResponseDto | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [uploadFeedbackBySpotKey, setUploadFeedbackBySpotKey] = useState<Record<string, string>>(
    {}
  );
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

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

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const sizes = useMemo(() => sizesQuery.data ?? [], [sizesQuery.data]);
  const printSizes = useMemo(() => printSizesQuery.data ?? [], [printSizesQuery.data]);
  const config = configQuery.data ?? FALLBACK_CONFIG;

  const selectedModel = useMemo(
    () => models.find((m) => m.id === draft.modelId) ?? null,
    [models, draft.modelId]
  );

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
          const parsed = extractApiError(err, 'Gagal menghitung harga dari server.');
          setServerQuote(null);
          setQuoteError(parsed.message);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [quotePayload, fetchQuoteAsync]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSelectModel = useCallback((modelId: number) => {
    setActionFeedback(null);
    setServerQuote(null);
    setQuoteError(null);
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
    toast('Konfigurasi Custom Lab dikembalikan ke awal.', 'info');
  }, [models, toast]);

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

  const handleRequestUploadDesign = useCallback(
    (spotKey: string) => {
      saveDraftToSessionStorage(draft);
      if (isGuest) {
        navigate('/login', { state: { from: '/custom-lab' } });
        return;
      }

      const infoMessage =
        'Unggah file desain ke storage akan aktif pada Tahap 3a. Untuk sementara Anda dapat mencentang "Bantu desainkan saya" atau lanjutkan simulasi harga.';
      setUploadFeedbackBySpotKey((prev) => ({ ...prev, [spotKey]: infoMessage }));
      toast('Upload file desain aktif di Tahap 3a.', 'info');
    },
    [draft, isGuest, navigate, toast]
  );

  const colorSummary = useMemo(() => {
    if (draft.isCustomColor) {
      return draft.customColorName.trim()
        ? `${draft.customColorName.trim()} (Custom · WA)`
        : 'Warna custom (belum diisi)';
    }
    if (!selectedFabric || draft.fabricColorId === null) return null;
    return selectedFabric.colors.find((c) => c.id === draft.fabricColorId)?.colorName ?? null;
  }, [draft.isCustomColor, draft.customColorName, draft.fabricColorId, selectedFabric]);

  const handleAddToCart = useCallback(() => {
    saveDraftToSessionStorage(draft);
    if (isGuest) {
      navigate('/login', { state: { from: '/custom-lab' } });
      return;
    }

    if (!quotePayload) {
      const msg =
        'Lengkapi model, bahan, warna, jumlah ukuran (> 0), dan ukuran sablon terlebih dahulu.';
      setActionFeedback(msg);
      toast(msg, 'warn');
      return;
    }

    const msg =
      'Draft konfigurasi Anda sudah tersimpan di sesi ini. Penyimpanan ke Keranjang Custom Lab (/api/cart/items) akan aktif pada Tahap 3a.';
    setActionFeedback(msg);
    toast('Fitur Keranjang Custom Lab aktif pada Tahap 3a.', 'info');
  }, [draft, isGuest, navigate, quotePayload, toast]);

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
              return `${PRINT_POSITION_LABELS[spot.printPosition]} (${pSize?.name ?? 'Belum pilih ukuran'})`;
            })
            .join(', ')
        : 'Polos';

    const subtotal = serverQuote?.subtotalAmount ?? localEstimate.subtotalAmount;
    const totalQty = serverQuote?.totalQty ?? localEstimate.totalQty;

    const lines = [
      'Halo admin YNG Apparel, saya ingin konsultasi pesanan Custom Lab:',
      `- Model: ${selectedModel?.name ?? '-'}`,
      `- Bahan: ${selectedFabric?.name ?? '-'}`,
      `- Warna: ${colorSummary ?? '-'}`,
      `- Ukuran (${totalQty} pcs): ${sizeText || '-'}`,
      `- Sablon: ${printText}`,
      `- Estimasi subtotal: ${formatRupiah(subtotal)}`,
    ];

    openWaLink(config.adminWhatsapp, lines.join('\n'));
  }, [
    sizes,
    draft.quantities,
    draft.prints,
    printSizes,
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
      <div className="space-y-6">
        <div className="space-y-3 border-b border-line pb-6">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <CardSkeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (initialError) {
    const parsed = extractApiError(initialError, 'Gagal memuat katalog Custom Lab.');
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState
          title="Katalog belum dapat dimuat"
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
          title="Katalog produk belum tersedia"
          description="Admin belum mengaktifkan model pakaian di katalog. Silakan hubungi tim kami via WhatsApp."
          action={
            <button type="button" onClick={handleAskWhatsApp} className="btn-primary">
              Hubungi via WhatsApp
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-28 lg:pb-10">
      <header className="flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Custom Lab · {config.storeName}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl lg:text-5xl">
            Rancang Pakaian Custom
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Susun model, bahan, warna, matriks ukuran, dan titik sablon. Seluruh nominal harga
            divalidasi dan dihitung langsung oleh server.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-muted">
            Estimasi {config.productionEstimateText}
          </span>
          <button type="button" onClick={handleReset} className="btn-secondary px-4 py-2 text-xs">
            Reset
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-6">
          {/* Langkah 1: Model Pakaian */}
          <section className="card-sharp p-5 sm:p-6" aria-labelledby="step-model-heading">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="eyebrow">
                  Langkah <span className="tabular-price">01</span>
                </p>
                <h2
                  id="step-model-heading"
                  className="mt-1 font-display text-xl font-semibold text-ink"
                >
                  Pilih Model Pakaian
                </h2>
              </div>
              <span className="text-xs text-muted">
                <span className="tabular-price font-medium text-ink">{models.length}</span> model
                aktif
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {models.map((model) => {
                const isSelected = selectedModel?.id === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleSelectModel(model.id)}
                    aria-pressed={isSelected}
                    className={`flex flex-col overflow-hidden rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-white text-ink hover:border-line-strong hover:bg-surface'
                    }`}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-surface">
                      {model.imageUrl ? (
                        <img
                          src={model.imageUrl}
                          alt={model.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-medium text-muted">
                          {model.name}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-2 p-4">
                      <div>
                        <p className="font-display text-base font-semibold">{model.name}</p>
                        {model.description ? (
                          <p
                            className={`mt-1 line-clamp-2 text-xs leading-relaxed ${
                              isSelected ? 'text-neutral-300' : 'text-muted'
                            }`}
                          >
                            {model.description}
                          </p>
                        ) : null}
                      </div>
                      <p
                        className={`text-sm font-semibold ${
                          isSelected ? 'text-white' : 'text-ink'
                        }`}
                      >
                        Mulai <span className="tabular-price">{formatRupiah(model.basePrice)}</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Langkah 2: Bahan Pakaian (kompatibel dari model_fabrics) */}
          <section className="card-sharp p-5 sm:p-6" aria-labelledby="step-fabric-heading">
            <p className="eyebrow">
              Langkah <span className="tabular-price">02</span>
            </p>
            <h2
              id="step-fabric-heading"
              className="mt-1 font-display text-xl font-semibold text-ink"
            >
              Pilih Bahan Kompatibel
            </h2>
            <p className="mt-1 text-xs text-muted">
              Hanya bahan yang sesuai dengan model {selectedModel?.name ?? 'terpilih'} yang
              ditampilkan.
            </p>

            <div className="mt-4">
              {modelDetailQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : modelDetailQuery.error ? (
                <ErrorState
                  title="Gagal memuat bahan model"
                  message={
                    extractApiError(modelDetailQuery.error, 'Tidak dapat mengambil daftar bahan.')
                      .message
                  }
                  retry={() => void modelDetailQuery.refetch()}
                />
              ) : availableFabrics.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong bg-surface p-4 text-sm text-muted">
                  Belum ada bahan aktif yang terhubung dengan model ini.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableFabrics.map((fabric) => {
                    const isSelected = selectedFabric?.id === fabric.id;
                    return (
                      <button
                        key={fabric.id}
                        type="button"
                        onClick={() => handleSelectFabric(fabric.id)}
                        aria-pressed={isSelected}
                        className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
                          isSelected
                            ? 'border-ink bg-ink text-white'
                            : 'border-line bg-white text-ink hover:border-line-strong hover:bg-surface'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-display text-sm font-semibold sm:text-base">
                              {fabric.name}
                            </p>
                            {fabric.gsmWeight ? (
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] ${
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
                              className={`text-xs leading-relaxed ${
                                isSelected ? 'text-neutral-300' : 'text-muted'
                              }`}
                            >
                              {fabric.description}
                            </p>
                          ) : null}
                        </div>

                        <p
                          className={`mt-3 text-xs font-semibold ${
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
                            'Termasuk harga dasar'
                          )}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Langkah 3: Warna (Preset per bahan atau Warna Custom) */}
          <section className="card-sharp p-5 sm:p-6" aria-labelledby="step-color-heading">
            <p className="eyebrow">
              Langkah <span className="tabular-price">03</span>
            </p>
            <h2
              id="step-color-heading"
              className="mt-1 font-display text-xl font-semibold text-ink"
            >
              Pilih Warna Bahan
            </h2>
            <p className="mt-1 text-xs text-muted">
              Pilih dari warna preset stok tersedia atau ajukan warna custom untuk konfirmasi via
              WhatsApp.
            </p>

            <div className="mt-4">
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
            </div>
          </section>

          {/* Langkah 4: Matriks Ukuran */}
          <section className="card-sharp p-5 sm:p-6" aria-labelledby="step-size-heading">
            <p className="eyebrow">
              Langkah <span className="tabular-price">04</span>
            </p>
            <h2 id="step-size-heading" className="mt-1 font-display text-xl font-semibold text-ink">
              Atur Jumlah per Ukuran
            </h2>
            <p className="mt-1 text-xs text-muted">
              Masukkan jumlah pesanan per ukuran. Minimal{' '}
              <span className="tabular-price font-medium text-ink">{config.dpMinQty} pcs</span>{' '}
              total untuk membuka pembayaran DP{' '}
              <span className="tabular-price font-medium text-ink">{config.dpPercent}%</span>.
            </p>

            <div className="mt-4">
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
            </div>
          </section>

          {/* Langkah 5: Titik Sablon & Desain */}
          <section className="card-sharp p-5 sm:p-6" aria-labelledby="step-print-heading">
            <p className="eyebrow">
              Langkah <span className="tabular-price">05</span>
            </p>
            <h2
              id="step-print-heading"
              className="mt-1 font-display text-xl font-semibold text-ink"
            >
              Titik Sablon &amp; Desain
            </h2>

            <div className="mt-3">
              <PrintSpotPicker
                spots={draft.prints}
                printSizes={printSizes}
                isGuest={isGuest}
                onAddSpot={handleAddSpot}
                onUpdateSpot={handleUpdateSpot}
                onRemoveSpot={handleRemoveSpot}
                onRequestUploadDesign={handleRequestUploadDesign}
                uploadFeedbackBySpotKey={uploadFeedbackBySpotKey}
              />
            </div>
          </section>
        </div>

        <PriceSummary
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
          onAddToCart={handleAddToCart}
          onAskWhatsApp={handleAskWhatsApp}
          actionFeedback={actionFeedback}
        />
      </div>
    </div>
  );
}
