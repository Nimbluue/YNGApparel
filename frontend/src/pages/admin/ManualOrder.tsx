import {
  FULFILLMENT_LABELS,
  FULFILLMENT_TYPE,
  ORDER_SOURCE,
  PAYMENT_METHOD,
  PAYMENT_SCHEME,
  PRINT_POSITION,
  PRINT_POSITION_LABELS,
  type AdminCreateManualOrderItemDto,
  type AdminCreateManualOrderRequestDto,
  type FulfillmentType,
  type ManualOrderSource,
  type PaymentMethod,
  type PaymentScheme,
  type PricingQuoteRequestDto,
  type PrintPosition,
  type PublicModelDetailDto,
} from '@yng/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminFeedbackBanner } from '../../components/admin/AdminFeedbackBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input, Textarea } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import { adminOrderQueryKeys, createAdminManualOrder } from '../../services/adminOrderService';
import { uploadDesignFile } from '../../services/cartService';
import {
  catalogQueryKeys,
  getCatalogConfig,
  getCatalogModelBySlug,
  getCatalogModels,
  getCatalogPrintSizes,
  getCatalogSizes,
  getPaymentAccounts,
} from '../../services/catalogService';
import { requestPricingQuote } from '../../services/pricingService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';

const MANUAL_SOURCES: ReadonlyArray<{ value: ManualOrderSource; label: string }> = [
  { value: ORDER_SOURCE.WHATSAPP, label: 'WhatsApp' },
  { value: ORDER_SOURCE.INSTAGRAM, label: 'Instagram DM' },
  { value: ORDER_SOURCE.MANUAL, label: 'Walk-in / Manual' },
];

const PRINT_POSITIONS: readonly PrintPosition[] = [
  PRINT_POSITION.FRONT_CHEST,
  PRINT_POSITION.FRONT_CENTER,
  PRINT_POSITION.BACK_CENTER,
  PRINT_POSITION.BACK_UPPER,
  PRINT_POSITION.LEFT_SLEEVE,
  PRINT_POSITION.RIGHT_SLEEVE,
  PRINT_POSITION.COLLAR,
  PRINT_POSITION.OTHER,
];

interface ManualPrintDraft {
  localId: string;
  printPosition: PrintPosition;
  printSizeId: number | null;
  fileRef: string | null;
  fileName: string | null;
  uploading: boolean;
  notes: string;
}

interface ManualOrderItemDraft {
  localId: string;
  modelId: number | null;
  fabricId: number | null;
  isCustomColor: boolean;
  fabricColorId: number | null;
  customColorName: string;
  customColorHex: string;
  sizeQtyMap: Record<number, number>;
  prints: ManualPrintDraft[];
  needsDesignHelp: boolean;
  productionNotes: string;
}

function createId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function createEmptyItemDraft(defaultModelId: number | null = null): ManualOrderItemDraft {
  return {
    localId: createId(),
    modelId: defaultModelId,
    fabricId: null,
    isCustomColor: false,
    fabricColorId: null,
    customColorName: '',
    customColorHex: '#111111',
    sizeQtyMap: {},
    prints: [],
    needsDesignHelp: false,
    productionNotes: '',
  };
}

export default function ManualOrder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Data pelanggan & pengiriman
  const [source, setSource] = useState<ManualOrderSource>(ORDER_SOURCE.WHATSAPP);
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [userUuid, setUserUuid] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(FULFILLMENT_TYPE.SHIP);
  const [provinceName, setProvinceName] = useState('');
  const [cityName, setCityName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [fullAddress, setFullAddress] = useState('');

  // Konfigurasi item
  const [items, setItems] = useState<ManualOrderItemDraft[]>(() => [createEmptyItemDraft()]);

  // Pembayaran, diskon, ongkir & jadwal
  const [paymentScheme, setPaymentScheme] = useState<PaymentScheme>(PAYMENT_SCHEME.FULL);
  const [discountInput, setDiscountInput] = useState('0');
  const [discountNote, setDiscountNote] = useState('');
  const [shippingCostInput, setShippingCostInput] = useState('0');
  const [paymentReceived, setPaymentReceived] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHOD.BANK_TRANSFER);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [noAutoCancel, setNoAutoCancel] = useState(true);
  const [estimatedFinishDate, setEstimatedFinishDate] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const [formError, setFormError] = useState<{ message: string; details: string[] } | null>(null);

  // Katalog aktif
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
  const accountsQuery = useQuery({
    queryKey: catalogQueryKeys.paymentAccounts,
    queryFn: getPaymentAccounts,
  });

  const activeModels = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const activeSizes = useMemo(() => sizesQuery.data ?? [], [sizesQuery.data]);
  const activePrintSizes = useMemo(() => printSizesQuery.data ?? [], [printSizesQuery.data]);
  const paymentAccounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const selectedModelSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const item of items) {
      if (item.modelId !== null) {
        const matched = activeModels.find((m) => m.id === item.modelId);
        if (matched) slugs.add(matched.slug);
      }
    }
    return [...slugs];
  }, [items, activeModels]);

  const modelDetailQueries = useQueries({
    queries: selectedModelSlugs.map((slug) => ({
      queryKey: catalogQueryKeys.modelDetail(slug),
      queryFn: () => getCatalogModelBySlug(slug),
      enabled: Boolean(slug),
    })),
  });

  const modelDetailsById = useMemo(() => {
    const map = new Map<number, PublicModelDetailDto>();
    for (const q of modelDetailQueries) {
      if (q.data) {
        map.set(q.data.id, q.data);
      }
    }
    return map;
  }, [modelDetailQueries]);

  // Sinkronisasi awal akun bank/QRIS yang cocok dengan metode bayar
  const matchingPaymentAccounts = useMemo(
    () => paymentAccounts.filter((acc) => acc.method === paymentMethod),
    [paymentAccounts, paymentMethod]
  );

  // Hitung item yang siap dihitung quote-nya
  const quotePayloadItems = useMemo<PricingQuoteRequestDto['items']>(() => {
    const valid: PricingQuoteRequestDto['items'] = [];
    for (const item of items) {
      if (item.modelId === null || item.fabricId === null) continue;
      const sizeEntries = Object.entries(item.sizeQtyMap)
        .map(([sizeIdStr, qty]) => ({ sizeId: Number(sizeIdStr), qty }))
        .filter((entry) => entry.qty > 0);
      if (sizeEntries.length === 0) continue;

      if (!item.isCustomColor && item.fabricColorId === null) continue;
      if (item.isCustomColor && !item.customColorName.trim()) continue;

      const prints = item.prints
        .filter((p) => p.printSizeId !== null)
        .map((p) => ({
          printSizeId: p.printSizeId!,
          printPosition: p.printPosition,
        }));

      valid.push({
        modelId: item.modelId,
        fabricId: item.fabricId,
        isCustomColor: item.isCustomColor,
        fabricColorId: item.isCustomColor ? null : item.fabricColorId,
        colorName: item.isCustomColor ? item.customColorName.trim() : null,
        colorHex: item.isCustomColor ? item.customColorHex.trim() || null : null,
        sizes: sizeEntries,
        prints,
      });
    }
    return valid;
  }, [items]);

  const [debouncedQuoteItems, setDebouncedQuoteItems] = useState<PricingQuoteRequestDto['items']>(
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuoteItems(quotePayloadItems);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [quotePayloadItems]);

  const quoteQuery = useQuery({
    queryKey: ['admin-manual-order-quote', debouncedQuoteItems],
    queryFn: ({ signal }) => requestPricingQuote({ items: debouncedQuoteItems }, signal),
    enabled: debouncedQuoteItems.length > 0,
  });

  const quote = quotePayloadItems.length > 0 ? quoteQuery.data : undefined;
  const dpMinQty = configQuery.data?.dpMinQty ?? quote?.dpMinQty ?? 12;
  const dpPercent = configQuery.data?.dpPercent ?? quote?.dpPercent ?? 70;
  const totalQty =
    quote?.totalQty ??
    items.reduce(
      (sum, item) => sum + Object.values(item.sizeQtyMap).reduce((s, q) => s + (q || 0), 0),
      0
    );
  const dpEligible = totalQty >= dpMinQty;
  const effectiveScheme: PaymentScheme =
    paymentScheme === PAYMENT_SCHEME.DP && !dpEligible ? PAYMENT_SCHEME.FULL : paymentScheme;

  const parsedDiscount = Math.max(0, Math.round(Number(discountInput) || 0));
  const parsedShippingCost =
    fulfillmentType === FULFILLMENT_TYPE.PICKUP
      ? 0
      : Math.max(0, Math.round(Number(shippingCostInput) || 0));

  const subtotalAmount = quote?.subtotalAmount ?? 0;
  const netSubtotal = Math.max(0, subtotalAmount - parsedDiscount);
  const grandTotal = netSubtotal + parsedShippingCost;
  const initialDueAmount =
    effectiveScheme === PAYMENT_SCHEME.DP
      ? Math.round((netSubtotal * dpPercent) / 100)
      : netSubtotal;
  const remainingAfterInitial = Math.max(0, grandTotal - (paymentReceived ? initialDueAmount : 0));

  function updateItem(
    localId: string,
    updater: (prev: ManualOrderItemDraft) => ManualOrderItemDraft
  ) {
    setItems((prev) => prev.map((it) => (it.localId === localId ? updater(it) : it)));
  }

  function handleSelectModel(localId: string, newModelId: number | null) {
    const detail = newModelId !== null ? modelDetailsById.get(newModelId) : undefined;
    updateItem(localId, (prev) => {
      const firstFabric = detail?.fabrics[0] ?? null;
      const firstColor = firstFabric?.colors[0] ?? null;
      return {
        ...prev,
        modelId: newModelId,
        fabricId: firstFabric ? firstFabric.id : null,
        fabricColorId: !prev.isCustomColor && firstColor ? firstColor.id : null,
      };
    });
  }

  function handleSelectFabric(
    localId: string,
    detail: PublicModelDetailDto | undefined,
    fabricId: number | null
  ) {
    const fabric = detail?.fabrics.find((f) => f.id === fabricId);
    const firstColor = fabric?.colors[0] ?? null;
    updateItem(localId, (prev) => ({
      ...prev,
      fabricId,
      fabricColorId: !prev.isCustomColor && firstColor ? firstColor.id : null,
    }));
  }

  function handleAddPrintSpot(localId: string) {
    const defaultPrintSizeId = activePrintSizes[0]?.id ?? null;
    updateItem(localId, (prev) => {
      const usedPositions = new Set(prev.prints.map((p) => p.printPosition));
      const nextPos =
        PRINT_POSITIONS.find((pos) => pos !== PRINT_POSITION.OTHER && !usedPositions.has(pos)) ??
        PRINT_POSITION.OTHER;
      return {
        ...prev,
        prints: [
          ...prev.prints,
          {
            localId: createId(),
            printPosition: nextPos,
            printSizeId: defaultPrintSizeId,
            fileRef: null,
            fileName: null,
            uploading: false,
            notes: '',
          },
        ],
      };
    });
  }

  async function handleUploadSpotFile(itemLocalId: string, printLocalId: string, file: File) {
    updateItem(itemLocalId, (prev) => ({
      ...prev,
      prints: prev.prints.map((p) => (p.localId === printLocalId ? { ...p, uploading: true } : p)),
    }));
    try {
      const uploaded = await uploadDesignFile(file);
      updateItem(itemLocalId, (prev) => ({
        ...prev,
        prints: prev.prints.map((p) =>
          p.localId === printLocalId
            ? {
                ...p,
                uploading: false,
                fileRef: uploaded.fileRef,
                fileName: uploaded.fileName,
              }
            : p
        ),
      }));
      toast(`File "${uploaded.fileName}" berhasil diunggah.`, 'ok');
    } catch (err: unknown) {
      updateItem(itemLocalId, (prev) => ({
        ...prev,
        prints: prev.prints.map((p) =>
          p.localId === printLocalId ? { ...p, uploading: false } : p
        ),
      }));
      const parsed = extractApiError(err, 'Gagal mengunggah file desain.');
      setFormError(parsed);
    }
  }

  const createMutation = useMutation({
    mutationFn: (payload: AdminCreateManualOrderRequestDto) => createAdminManualOrder(payload),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.kanban }),
        queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.paymentsAll }),
      ]);
      toast(`Order manual #${created.orderCode} berhasil dibuat.`, 'ok');
      navigate(`/admin/orders/${created.transactionUuid}`);
    },
    onError: (err: unknown) => {
      setFormError(extractApiError(err, 'Gagal membuat order manual. Periksa kembali isian Anda.'));
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (customerName.trim().length < 2) {
      setFormError({ message: 'Nama pelanggan minimal 2 karakter.', details: [] });
      return;
    }
    if (customerWhatsapp.trim().length < 8) {
      setFormError({ message: 'Nomor WhatsApp pelanggan tidak valid.', details: [] });
      return;
    }

    const trimmedPostal = postalCode.trim();
    if (
      fulfillmentType === FULFILLMENT_TYPE.SHIP &&
      trimmedPostal &&
      !/^[0-9]{5}$/.test(trimmedPostal)
    ) {
      setFormError({
        message: 'Kode pos harus 5 digit angka (atau kosongkan sementara).',
        details: [],
      });
      return;
    }

    const builtItems: AdminCreateManualOrderItemDto[] = [];
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx]!;
      if (item.modelId === null || item.fabricId === null) {
        setFormError({
          message: `Item #${idx + 1}: Model dan Bahan pakaian wajib dipilih.`,
          details: [],
        });
        return;
      }
      if (!item.isCustomColor && item.fabricColorId === null) {
        setFormError({
          message: `Item #${idx + 1}: Pilih warna preset atau centang Warna Custom.`,
          details: [],
        });
        return;
      }
      if (item.isCustomColor && !item.customColorName.trim()) {
        setFormError({
          message: `Item #${idx + 1}: Nama warna custom wajib diisi.`,
          details: [],
        });
        return;
      }

      const sizes = Object.entries(item.sizeQtyMap)
        .map(([sizeIdStr, qty]) => ({ sizeId: Number(sizeIdStr), qty }))
        .filter((s) => Number.isInteger(s.qty) && s.qty > 0);
      if (sizes.length === 0) {
        setFormError({
          message: `Item #${idx + 1}: Minimal 1 ukuran dengan jumlah > 0 harus diisi.`,
          details: [],
        });
        return;
      }

      if (item.prints.some((p) => p.uploading)) {
        setFormError({
          message: `Item #${idx + 1}: Tunggu hingga unggahan file desain selesai.`,
          details: [],
        });
        return;
      }

      const prints = item.prints.map((p) => {
        if (p.printSizeId === null) {
          throw new Error(`Item #${idx + 1}: Ukuran sablon pada semua titik wajib dipilih.`);
        }
        return {
          printSizeId: p.printSizeId,
          printPosition: p.printPosition,
          fileRef: p.fileRef,
          fileName: p.fileName,
          notes: p.notes.trim() || null,
        };
      });

      builtItems.push({
        modelId: item.modelId,
        fabricId: item.fabricId,
        isCustomColor: item.isCustomColor,
        fabricColorId: item.isCustomColor ? null : item.fabricColorId,
        colorName: item.isCustomColor ? item.customColorName.trim() : null,
        colorHex: item.isCustomColor ? item.customColorHex.trim() || null : null,
        needsDesignHelp: item.needsDesignHelp,
        productionNotes: item.productionNotes.trim() || null,
        sizes,
        prints,
      });
    }

    if (subtotalAmount > 0 && parsedDiscount > subtotalAmount) {
      setFormError({
        message: 'Nominal diskon tidak boleh melebihi subtotal pesanan.',
        details: [],
      });
      return;
    }

    const effectiveAccountId =
      paymentReceived && matchingPaymentAccounts.some((acc) => acc.id === paymentAccountId)
        ? paymentAccountId
        : (matchingPaymentAccounts[0]?.id ?? null);

    createMutation.mutate({
      source,
      userUuid: userUuid.trim() || null,
      customerName: customerName.trim(),
      customerWhatsapp: customerWhatsapp.trim(),
      fulfillmentType,
      provinceName: fulfillmentType === FULFILLMENT_TYPE.SHIP ? provinceName.trim() || null : null,
      cityName: fulfillmentType === FULFILLMENT_TYPE.SHIP ? cityName.trim() || null : null,
      districtName: fulfillmentType === FULFILLMENT_TYPE.SHIP ? districtName.trim() || null : null,
      postalCode: fulfillmentType === FULFILLMENT_TYPE.SHIP ? trimmedPostal || null : null,
      fullAddress: fulfillmentType === FULFILLMENT_TYPE.SHIP ? fullAddress.trim() || null : null,
      items: builtItems,
      paymentScheme: effectiveScheme,
      discountAmount: parsedDiscount,
      discountNote: discountNote.trim() || null,
      shippingCost: parsedShippingCost,
      paymentReceived: paymentReceived
        ? {
            received: true,
            paymentMethod,
            paymentAccountId: effectiveAccountId,
          }
        : { received: false },
      noAutoCancel,
      adminNotes: adminNotes.trim() || null,
      estimatedFinishDate: estimatedFinishDate.trim() || null,
    });
  }

  const catalogLoading = modelsQuery.isLoading || sizesQuery.isLoading || printSizesQuery.isLoading;
  const catalogError = modelsQuery.isError || sizesQuery.isError || printSizesQuery.isError;

  if (catalogLoading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-sm border border-line bg-white p-10">
        <Spinner label="Memuat katalog aktif untuk form order manual..." />
      </div>
    );
  }

  if (catalogError) {
    return (
      <ErrorState
        title="Gagal Memuat Katalog"
        message="Tidak dapat memuat model, ukuran, atau harga sablon aktif."
        retry={() => {
          void modelsQuery.refetch();
          void sizesQuery.refetch();
          void printSizesQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <section className="rounded-sm border border-line bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Link to="/admin/kanban" className="hover:text-ink hover:underline">
            Kanban
          </Link>
          <span>/</span>
          <Link to="/admin/orders" className="hover:text-ink hover:underline">
            Semua Order
          </Link>
          <span>/</span>
          <span className="font-semibold text-ink">Order Manual Baru</span>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Ruang Produksi · Input Langsung</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">
              Buat Order Manual
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Catat pesanan dari WhatsApp, Instagram DM, atau walk-in.
            </p>
          </div>
          <Link to="/admin/orders" className="btn-secondary shrink-0 text-xs">
            ← Kembali ke Semua Order
          </Link>
        </div>
      </section>

      {formError ? (
        <AdminFeedbackBanner
          variant="error"
          message={formError.message}
          details={formError.details}
          onDismiss={() => setFormError(null)}
        />
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12"
      >
        {/* Kolom Kiri — Pelanggan & Daftar Item */}
        <div className="w-full min-w-0 space-y-6 lg:col-span-7 xl:col-span-8">
          {/* 1. Sumber & Data Pelanggan */}
          <section className="rounded-sm border border-line bg-white p-5 sm:p-6 space-y-4">
            <div>
              <p className="eyebrow">Data Pemesan</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                Sumber Order &amp; Kontak Pelanggan
              </h2>
            </div>

            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Sumber Pesanan"
                value={source}
                onChange={(e) => setSource(e.target.value as ManualOrderSource)}
              >
                {MANUAL_SOURCES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>

              <Select
                label="Metode Pemenuhan"
                value={fulfillmentType}
                onChange={(e) => setFulfillmentType(e.target.value as FulfillmentType)}
              >
                <option value={FULFILLMENT_TYPE.SHIP}>
                  {FULFILLMENT_LABELS[FULFILLMENT_TYPE.SHIP]}
                </option>
                <option value={FULFILLMENT_TYPE.PICKUP}>
                  {FULFILLMENT_LABELS[FULFILLMENT_TYPE.PICKUP]}
                </option>
              </Select>

              <Input
                label="Nama Pelanggan / Penerima *"
                placeholder="Contoh: Budi Santoso"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />

              <Input
                label="Nomor WhatsApp *"
                placeholder="081234567890 atau 6281234567890"
                value={customerWhatsapp}
                onChange={(e) => setCustomerWhatsapp(e.target.value)}
                required
              />
            </div>

            {fulfillmentType === FULFILLMENT_TYPE.SHIP ? (
              <div className="space-y-3 border-t border-line pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-xs font-semibold text-ink">
                    Alamat Pengiriman (Opsional Saat Input Awal)
                  </p>
                  <Badge variant="neutral">Bisa dilengkapi sebelum kirim</Badge>
                </div>

                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Provinsi"
                    placeholder="Contoh: Kepulauan Riau"
                    value={provinceName}
                    onChange={(e) => setProvinceName(e.target.value)}
                  />
                  <Input
                    label="Kota / Kabupaten"
                    placeholder="Contoh: Kota Batam"
                    value={cityName}
                    onChange={(e) => setCityName(e.target.value)}
                  />
                  <Input
                    label="Kecamatan"
                    placeholder="Contoh: Batam Kota"
                    value={districtName}
                    onChange={(e) => setDistrictName(e.target.value)}
                  />
                  <Input
                    label="Kode Pos (5 digit)"
                    placeholder="29432"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                  <div className="sm:col-span-2">
                    <Textarea
                      label="Alamat Lengkap"
                      rows={2}
                      placeholder="Nama jalan, nomor rumah, blok, patokan..."
                      value={fullAddress}
                      onChange={(e) => setFullAddress(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <details className="rounded-sm border border-line bg-[#FAFAFA] p-3.5">
              <summary className="cursor-pointer font-display text-xs font-semibold text-ink">
                Tautkan ke Akun Pelanggan (Opsional)
              </summary>
              <div className="mt-3">
                <Input
                  label="ID Akun Pelanggan"
                  placeholder="UUID akun user terdaftar (opsional)"
                  value={userUuid}
                  onChange={(e) => setUserUuid(e.target.value)}
                />
              </div>
            </details>
          </section>

          {/* 2. Rincian Item Kustomisasi */}
          <section className="rounded-sm border border-line bg-white p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Spesifikasi Item</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  Item Pesanan ({items.length})
                </h2>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={items.length >= 20}
                onClick={() =>
                  setItems((prev) => [...prev, createEmptyItemDraft(activeModels[0]?.id ?? null)])
                }
              >
                + Tambah Item
              </Button>
            </div>

            <div className="space-y-5">
              {items.map((item, idx) => {
                const modelDetail =
                  item.modelId !== null ? modelDetailsById.get(item.modelId) : undefined;
                const availableFabrics = modelDetail?.fabrics ?? [];
                const selectedFabric = availableFabrics.find((f) => f.id === item.fabricId);
                const availableColors = selectedFabric?.colors ?? [];
                const itemTotalQty = Object.values(item.sizeQtyMap).reduce(
                  (sum, q) => sum + (q || 0),
                  0
                );

                return (
                  <article
                    key={item.localId}
                    className="rounded-sm border border-line bg-[#FAFAFA] p-4 sm:p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-bold text-ink">
                          Item #{idx + 1}
                        </span>
                        <span className="rounded-sm border border-line bg-white px-2.5 py-0.5 font-mono text-xs text-ink tabular-nums">
                          {itemTotalQty} pcs
                        </span>
                      </div>

                      {items.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) => prev.filter((it) => it.localId !== item.localId))
                          }
                          className="text-xs font-semibold text-status-err hover:underline"
                        >
                          Hapus Item
                        </button>
                      ) : null}
                    </div>

                    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                      <Select
                        label="Model Pakaian *"
                        value={item.modelId ?? ''}
                        onChange={(e) =>
                          handleSelectModel(
                            item.localId,
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      >
                        <option value="">-- Pilih Model --</option>
                        {activeModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name} ({formatRupiah(model.basePrice)})
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Bahan *"
                        value={item.fabricId ?? ''}
                        disabled={item.modelId === null}
                        onChange={(e) =>
                          handleSelectFabric(
                            item.localId,
                            modelDetail,
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      >
                        <option value="">
                          {item.modelId === null
                            ? '-- Pilih Model dulu --'
                            : modelDetail
                              ? '-- Pilih Bahan --'
                              : 'Memuat bahan...'}
                        </option>
                        {availableFabrics.map((fab) => (
                          <option key={fab.id} value={fab.id}>
                            {fab.name}
                            {fab.additionalPrice > 0
                              ? ` (+${formatRupiah(fab.additionalPrice)})`
                              : ''}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {/* Pilihan Warna */}
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-ink">Warna Pakaian *</span>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
                          <input
                            type="checkbox"
                            checked={item.isCustomColor}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                isCustomColor: e.target.checked,
                                fabricColorId: e.target.checked
                                  ? null
                                  : (availableColors[0]?.id ?? null),
                              }))
                            }
                            className="h-4 w-4 accent-ink"
                          />
                          <span>Warna Custom (Konfirmasi Stok)</span>
                        </label>
                      </div>

                      {item.isCustomColor ? (
                        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                          <Input
                            label="Nama Warna Custom *"
                            placeholder="Contoh: Sage Olive"
                            value={item.customColorName}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                customColorName: e.target.value,
                              }))
                            }
                          />
                          <Input
                            label="Kode Hex (Opsional)"
                            placeholder="#4A5D4E"
                            value={item.customColorHex}
                            onChange={(e) =>
                              updateItem(item.localId, (prev) => ({
                                ...prev,
                                customColorHex: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ) : (
                        <Select
                          value={item.fabricColorId ?? ''}
                          disabled={item.fabricId === null}
                          onChange={(e) =>
                            updateItem(item.localId, (prev) => ({
                              ...prev,
                              fabricColorId: e.target.value ? Number(e.target.value) : null,
                            }))
                          }
                        >
                          <option value="">
                            {item.fabricId === null
                              ? '-- Pilih Bahan dulu --'
                              : availableColors.length === 0
                                ? 'Tidak ada preset aktif — centang Warna Custom'
                                : '-- Pilih Warna Preset --'}
                          </option>
                          {availableColors.map((col) => (
                            <option key={col.id} value={col.id}>
                              {col.colorName} ({col.colorHex})
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>

                    {/* Matriks Ukuran */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-ink">Matriks Ukuran *</p>
                      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {activeSizes.map((sz) => {
                          const qty = item.sizeQtyMap[sz.id] ?? 0;
                          return (
                            <label
                              key={sz.id}
                              className="flex flex-col gap-1 rounded-sm border border-line bg-white p-2.5 text-xs"
                            >
                              <span className="font-mono font-bold text-ink">
                                {sz.code}
                                {sz.extraCharge > 0 ? (
                                  <span className="ml-1 font-normal text-muted">
                                    (+{formatRupiah(sz.extraCharge)})
                                  </span>
                                ) : null}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={qty}
                                onChange={(e) => {
                                  const nextQty = Math.max(
                                    0,
                                    Math.floor(Number(e.target.value) || 0)
                                  );
                                  updateItem(item.localId, (prev) => ({
                                    ...prev,
                                    sizeQtyMap: {
                                      ...prev.sizeQtyMap,
                                      [sz.id]: nextQty,
                                    },
                                  }));
                                }}
                                className="input-sharp tabular-price py-1.5 text-sm"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Titik Sablon & File Desain */}
                    <div className="space-y-2.5 border-t border-line pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-ink">
                          Desain Sablon ({item.prints.length})
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink">
                            <input
                              type="checkbox"
                              checked={item.needsDesignHelp}
                              onChange={(e) =>
                                updateItem(item.localId, (prev) => ({
                                  ...prev,
                                  needsDesignHelp: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 accent-ink"
                            />
                            <span>Bantuan Desain Gratis</span>
                          </label>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleAddPrintSpot(item.localId)}
                          >
                            + Tambah Desain
                          </Button>
                        </div>
                      </div>

                      {item.prints.map((spot) => (
                        <div
                          key={spot.localId}
                          className="rounded-sm border border-line bg-white p-3 space-y-2.5"
                        >
                          <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
                            <Select
                              label="Posisi Sablon"
                              value={spot.printPosition}
                              onChange={(e) =>
                                updateItem(item.localId, (prev) => ({
                                  ...prev,
                                  prints: prev.prints.map((p) =>
                                    p.localId === spot.localId
                                      ? { ...p, printPosition: e.target.value as PrintPosition }
                                      : p
                                  ),
                                }))
                              }
                            >
                              {PRINT_POSITIONS.map((pos) => (
                                <option key={pos} value={pos}>
                                  {PRINT_POSITION_LABELS[pos]}
                                </option>
                              ))}
                            </Select>

                            <Select
                              label="Ukuran Sablon"
                              value={spot.printSizeId ?? ''}
                              onChange={(e) =>
                                updateItem(item.localId, (prev) => ({
                                  ...prev,
                                  prints: prev.prints.map((p) =>
                                    p.localId === spot.localId
                                      ? {
                                          ...p,
                                          printSizeId: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        }
                                      : p
                                  ),
                                }))
                              }
                            >
                              <option value="">-- Pilih Ukuran --</option>
                              {activePrintSizes.map((ps) => (
                                <option key={ps.id} value={ps.id}>
                                  {ps.code} · {ps.dimensionsCm} (+{formatRupiah(ps.pricePerSpot)})
                                </option>
                              ))}
                            </Select>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <input
                                type="file"
                                accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
                                disabled={spot.uploading}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    void handleUploadSpotFile(item.localId, spot.localId, f);
                                  }
                                }}
                                className="block w-full text-xs text-muted file:mr-3 file:min-h-touch file:rounded-sm file:border file:border-line-strong file:bg-[#FAFAFA] file:px-3.5 file:text-xs file:font-semibold file:text-ink"
                              />
                              {spot.fileName ? (
                                <p className="mt-1 truncate font-mono text-[11px] text-status-ok">
                                  Terunggah: {spot.fileName}
                                </p>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                updateItem(item.localId, (prev) => ({
                                  ...prev,
                                  prints: prev.prints.filter((p) => p.localId !== spot.localId),
                                }))
                              }
                              className="self-start text-xs font-semibold text-status-err hover:underline sm:self-center"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Textarea
                      label="Catatan Produksi Item (Opsional)"
                      rows={2}
                      placeholder="Mis. sablon agak turun 2cm dari kerah..."
                      value={item.productionNotes}
                      onChange={(e) =>
                        updateItem(item.localId, (prev) => ({
                          ...prev,
                          productionNotes: e.target.value,
                        }))
                      }
                    />
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        {/* Kolom Kanan — Ringkasan Tagihan, Skema Bayar & Submit */}
        <aside className="w-full min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-span-5 xl:col-span-4">
          <section className="rounded-sm border border-ink bg-white p-5 space-y-4">
            <div>
              <p className="eyebrow">Tagihan &amp; Pembayaran</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                Ringkasan Order Manual
              </h2>
            </div>

            <dl className="space-y-2 border-t border-line pt-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Total Kuantitas</dt>
                <dd className="tabular-price font-semibold text-ink">{totalQty} pcs</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Subtotal Katalog</dt>
                <dd className="tabular-price font-semibold text-ink">
                  {quoteQuery.isFetching ? 'Menghitung...' : formatRupiah(subtotalAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Diskon</dt>
                <dd className="tabular-price font-medium text-ink">
                  - {formatRupiah(parsedDiscount)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Ongkos Kirim</dt>
                <dd className="tabular-price font-medium text-ink">
                  {formatRupiah(parsedShippingCost)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-line pt-2 text-base font-bold text-ink">
                <dt>Grand Total</dt>
                <dd className="tabular-price">{formatRupiah(grandTotal)}</dd>
              </div>
              <div className="flex justify-between gap-2 text-xs">
                <dt className="text-muted">
                  Kewajiban Awal (
                  {effectiveScheme === PAYMENT_SCHEME.DP ? `DP ${dpPercent}%` : 'Lunas'})
                </dt>
                <dd className="tabular-price font-semibold text-ink">
                  {formatRupiah(initialDueAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 text-xs">
                <dt className="text-muted">Estimasi Sisa Tagihan</dt>
                <dd className="tabular-price font-semibold text-ink">
                  {formatRupiah(remainingAfterInitial)}
                </dd>
              </div>
            </dl>

            {/* Pilihan Skema Bayar */}
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-xs font-semibold text-ink">Skema Pembayaran</p>
              <div className="grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentScheme(PAYMENT_SCHEME.FULL)}
                  className={`min-h-touch rounded-sm border px-3 py-2 text-xs font-semibold transition-colors ${
                    effectiveScheme === PAYMENT_SCHEME.FULL
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-[#FAFAFA] text-ink hover:border-ink'
                  }`}
                >
                  Lunas (100%)
                </button>
                <button
                  type="button"
                  disabled={!dpEligible}
                  onClick={() => setPaymentScheme(PAYMENT_SCHEME.DP)}
                  className={`min-h-touch rounded-sm border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    effectiveScheme === PAYMENT_SCHEME.DP
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-[#FAFAFA] text-ink hover:border-ink'
                  }`}
                >
                  DP {dpPercent}%
                </button>
              </div>
              {!dpEligible ? (
                <p className="text-[11px] text-muted tabular-nums">
                  Minimal {dpMinQty} pcs untuk mengaktifkan opsi DP {dpPercent}%.
                </p>
              ) : null}
            </div>

            {/* Diskon & Ongkir */}
            <div className="space-y-3 border-t border-line pt-3">
              <Input
                label="Diskon Manual (Rp)"
                type="number"
                min={0}
                step={1}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
              />
              {parsedDiscount > 0 ? (
                <Input
                  label="Catatan Diskon"
                  placeholder="Contoh: Harga khusus reseller"
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                />
              ) : null}

              {fulfillmentType === FULFILLMENT_TYPE.SHIP ? (
                <Input
                  label="Ongkos Kirim Awal (Rp)"
                  type="number"
                  min={0}
                  step={1}
                  value={shippingCostInput}
                  onChange={(e) => setShippingCostInput(e.target.value)}
                />
              ) : null}
            </div>

            {/* Status Pembayaran Diterima & Auto Cancel */}
            <div className="space-y-3 border-t border-line pt-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={paymentReceived}
                  onChange={(e) => setPaymentReceived(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-ink"
                />
                <span>
                  <strong className="block">Pembayaran awal sudah diterima</strong>
                  <span className="text-muted">
                    Tandai lunas/DP langsung terverifikasi agar tidak menunggu bukti transfer.
                  </span>
                </span>
              </label>

              {paymentReceived ? (
                <div className="grid w-full grid-cols-1 gap-2.5 rounded-sm border border-line bg-[#FAFAFA] p-3">
                  <Select
                    label="Metode Diterima"
                    value={paymentMethod}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value as PaymentMethod);
                      setPaymentAccountId(null);
                    }}
                  >
                    <option value={PAYMENT_METHOD.BANK_TRANSFER}>Transfer Bank</option>
                    <option value={PAYMENT_METHOD.QRIS}>QRIS</option>
                  </Select>

                  {matchingPaymentAccounts.length > 0 ? (
                    <Select
                      label="Rekening / QRIS Tujuan"
                      value={paymentAccountId ?? matchingPaymentAccounts[0]?.id ?? ''}
                      onChange={(e) =>
                        setPaymentAccountId(e.target.value ? Number(e.target.value) : null)
                      }
                    >
                      {matchingPaymentAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.providerName}
                          {acc.accountNumber ? ` · ${acc.accountNumber}` : ''}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                </div>
              ) : (
                <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={noAutoCancel}
                    onChange={(e) => setNoAutoCancel(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-ink"
                  />
                  <span>
                    <strong className="block">Tanpa batas auto-cancel 24 jam</strong>
                    <span className="text-muted">
                      Disarankan untuk order WA/IG yang pembayarannya fleksibel.
                    </span>
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-3 border-t border-line pt-3">
              <Input
                label="Estimasi Selesai (Opsional)"
                type="date"
                value={estimatedFinishDate}
                onChange={(e) => setEstimatedFinishDate(e.target.value)}
              />
              <Textarea
                label="Catatan Admin Internal (Opsional)"
                rows={2}
                placeholder="Catatan internal workshop..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
            >
              Simpan &amp; Buat Order Manual
            </Button>
          </section>
        </aside>
      </form>
    </div>
  );
}
