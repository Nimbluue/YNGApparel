import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PAYMENT_SCHEME, type CartItemDto, type UpsertCartItemRequestDto } from '@yng/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/toastContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCartStore } from '../../lib/store';
import {
  cartQueryKeys,
  deleteCartItem,
  getCartItems,
  updateCartItem,
} from '../../services/cartService';
import { catalogQueryKeys, getCatalogSizes } from '../../services/catalogService';
import { saveCheckoutSelection } from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import {
  getLocalizedPaymentSchemeLabel,
  getLocalizedPrintPositionLabel,
} from '../../utils/localizedLabels';

function buildUpsertPayloadFromItem(
  item: CartItemDto,
  nextSizes: Array<{ sizeId: number; qty: number }>,
  nextNotes: string
): UpsertCartItemRequestDto {
  const trimmedNotes = nextNotes.trim();
  return {
    modelId: item.modelId,
    fabricId: item.fabricId,
    isCustomColor: item.config.isCustomColor,
    ...(item.config.isCustomColor
      ? {
          colorName: item.config.colorName ?? '',
          ...(item.config.colorHex ? { colorHex: item.config.colorHex } : {}),
        }
      : { fabricColorId: item.config.fabricColorId }),
    sizes: nextSizes,
    prints: item.config.prints.map((p) => ({
      printSizeId: p.printSizeId,
      printPosition: p.printPosition,
      needsDesignHelp: p.needsDesignHelp,
      ...(p.needsDesignHelp ? {} : { fileRef: p.fileRef, fileName: p.fileName }),
    })),
    productionNotes: trimmedNotes.length > 0 ? trimmedNotes : null,
  };
}

export default function Cart() {
  const { locale, t, pick } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { checkedItems, toggleItem, setCheckedItems, checkAll, uncheckAll } = useCartStore();

  const [editingItem, setEditingItem] = useState<CartItemDto | null>(null);
  const [editQuantities, setEditQuantities] = useState<Record<number, number>>({});
  const [editNotes, setEditNotes] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CartItemDto | null>(null);

  const cartQuery = useQuery({
    queryKey: cartQueryKeys.items,
    queryFn: getCartItems,
  });

  const sizesQuery = useQuery({
    queryKey: catalogQueryKeys.sizes,
    queryFn: getCatalogSizes,
  });

  const items = useMemo(() => cartQuery.data?.items ?? [], [cartQuery.data]);
  const summary = cartQuery.data?.summary ?? null;
  const sizes = useMemo(() => sizesQuery.data ?? [], [sizesQuery.data]);

  const sizeCodeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const size of sizes) {
      map.set(size.id, size.code);
    }
    return map;
  }, [sizes]);

  const availableItemUuids = useMemo(
    () => items.filter((item) => item.isAvailable).map((item) => item.cartItemUuid),
    [items]
  );

  const hasInitializedSelectionRef = useRef(false);

  // Inisialisasi pilih semua hanya sekali saat keranjang pertama dimuat; selanjutnya hanya buang item yang terhapus/nonaktif
  useEffect(() => {
    if (!cartQuery.data) return;
    const availableSet = new Set(availableItemUuids);
    const prunedChecked = [...checkedItems].filter((uuid) => availableSet.has(uuid));

    if (!hasInitializedSelectionRef.current) {
      hasInitializedSelectionRef.current = true;
      if (checkedItems.size === 0 && availableItemUuids.length > 0) {
        setCheckedItems(availableItemUuids);
        return;
      }
      if (prunedChecked.length !== checkedItems.size) {
        setCheckedItems(prunedChecked);
      }
      return;
    }

    if (prunedChecked.length !== checkedItems.size) {
      setCheckedItems(prunedChecked);
    }
  }, [availableItemUuids, cartQuery.data, checkedItems, setCheckedItems]);

  const updateMutation = useMutation({
    mutationFn: ({
      cartItemUuid,
      payload,
    }: {
      cartItemUuid: string;
      payload: UpsertCartItemRequestDto;
    }) => updateCartItem(cartItemUuid, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cartQueryKeys.items });
      setEditingItem(null);
      toast(pick('Item keranjang berhasil diperbarui.', 'Bag item updated.'), 'ok');
    },
    onError: (err) => {
      const parsed = extractApiError(
        err,
        pick('Gagal memperbarui item keranjang.', 'Failed to update bag item.')
      );
      toast(parsed.message, 'err');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (cartItemUuid: string) => deleteCartItem(cartItemUuid),
    onSuccess: async (deleted) => {
      await queryClient.invalidateQueries({ queryKey: cartQueryKeys.items });
      const nextChecked = [...checkedItems].filter((uuid) => uuid !== deleted.cartItemUuid);
      setCheckedItems(nextChecked);
      setDeleteTarget(null);
      toast(pick('Item dihapus dari keranjang.', 'Item removed from bag.'), 'ok');
    },
    onError: (err) => {
      const parsed = extractApiError(
        err,
        pick('Gagal menghapus item keranjang.', 'Failed to remove bag item.')
      );
      toast(parsed.message, 'err');
    },
  });

  function openQuickEdit(item: CartItemDto) {
    const qtyMap: Record<number, number> = {};
    for (const entry of item.config.sizes) {
      if (entry.qty > 0) {
        qtyMap[entry.sizeId] = entry.qty;
      }
    }
    setEditQuantities(qtyMap);
    setEditNotes(item.config.productionNotes ?? '');
    setEditingItem(item);
  }

  function handleSaveQuickEdit() {
    if (!editingItem) return;
    const nextSizes = Object.entries(editQuantities)
      .map(([sizeIdStr, qty]) => ({
        sizeId: Number(sizeIdStr),
        qty: Math.max(0, Math.floor(qty)),
      }))
      .filter((entry) => entry.qty > 0);

    if (nextSizes.length === 0) {
      toast(
        pick(
          'Minimal satu ukuran harus memiliki jumlah lebih dari 0 pcs.',
          'At least one size must have quantity greater than 0 pcs.'
        ),
        'warn'
      );
      return;
    }

    const payload = buildUpsertPayloadFromItem(editingItem, nextSizes, editNotes);
    updateMutation.mutate({ cartItemUuid: editingItem.cartItemUuid, payload });
  }

  // Hitung ringkasan item yang dicentang berdasarkan angka resmi server per item
  const checkedSummary = useMemo(() => {
    const dpMinQty = summary?.dpMinQty ?? 12;
    const dpPercent = summary?.dpPercent ?? 70;
    const selectedItems = items.filter(
      (item) => item.isAvailable && checkedItems.has(item.cartItemUuid)
    );
    const totalQty = selectedItems.reduce((sum, item) => sum + item.itemQty, 0);
    const subtotalAmount = selectedItems.reduce((sum, item) => sum + item.lineSubtotal, 0);
    const dpEligible = totalQty >= dpMinQty;
    const dpAmount = Math.round((subtotalAmount * dpPercent) / 100);
    const settlementAmount = subtotalAmount - dpAmount;

    return {
      selectedCount: selectedItems.length,
      totalQty,
      subtotalAmount,
      dpEligible,
      dpMinQty,
      dpPercent,
      dpAmount,
      settlementAmount,
      missingForDp: Math.max(0, dpMinQty - totalQty),
    };
  }, [checkedItems, items, summary?.dpMinQty, summary?.dpPercent]);

  const selectedAvailableUuids = useMemo(
    () =>
      items
        .filter((item) => item.isAvailable && checkedItems.has(item.cartItemUuid))
        .map((item) => item.cartItemUuid),
    [checkedItems, items]
  );

  const hasUnavailableItems = (summary?.unavailableItemCount ?? 0) > 0;
  const canCheckout = selectedAvailableUuids.length > 0 && !hasUnavailableItems;

  function handleProceedToCheckout() {
    if (!canCheckout) return;
    saveCheckoutSelection(selectedAvailableUuids);
    navigate('/checkout', { state: { cartItemUuids: selectedAvailableUuids } });
  }

  if (cartQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 border-b border-line pb-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-72" />
        </div>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <div className="lg:col-span-4">
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (cartQuery.error) {
    const parsed = extractApiError(
      cartQuery.error,
      pick('Gagal memuat keranjang Custom Lab.', 'Failed to load Custom Lab bag.')
    );
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState
          eyebrow={t('common.errorEyebrow')}
          retryLabel={t('common.retry')}
          title={pick('Keranjang belum dapat dimuat', 'Studio bag could not be loaded')}
          message={parsed.message}
          retry={() => void cartQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="eyebrow">YNG Studio · {pick('Keranjang Custom Lab', 'Studio Bag')}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
            {pick('Keranjang Konfigurasi', 'Saved Configurations')}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {pick(
              'Harga dihitung ulang otomatis dari katalog server setiap keranjang dibuka.',
              'Pricing is automatically recalculated from the server catalog each time you open your bag.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {summary ? (
            <span className="inline-flex min-h-touch items-center rounded-sm border border-line bg-[#FAFAFA] px-4 text-xs font-medium text-ink">
              {pick('Kapasitas:', 'Capacity:')}{' '}
              <span className="tabular-price ml-1.5 font-semibold">
                {summary.totalItems}/{summary.maxItems}
              </span>
            </span>
          ) : null}
          <Link to="/custom-lab" className="btn-primary">
            {pick('+ Tambah Konfigurasi', '+ New Configuration')}
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title={pick('Keranjang Custom Lab masih kosong', 'Your Custom Lab bag is empty')}
          description={pick(
            'Rancang model, pilih bahan dan warna, atur matriks ukuran serta titik sablon di Custom Lab untuk menambahkannya ke sini.',
            'Pick a model, fabric, color, size matrix, and print spots in Custom Lab to add configurations here.'
          )}
          action={
            <Link to="/custom-lab" className="btn-primary">
              {pick('Buka Custom Lab', 'Open Custom Lab')}
            </Link>
          }
        />
      ) : (
        <>
          {summary && summary.unavailableItemCount > 0 ? (
            <div
              role="alert"
              className="rounded-sm border border-red-200 bg-red-50 px-4 py-3.5 text-xs leading-relaxed text-status-err sm:text-sm"
            >
              {pick(
                <>
                  Terdapat <strong className="tabular-price">{summary.unavailableItemCount}</strong>{' '}
                  item yang tidak lagi tersedia karena perubahan master katalog. Perbarui
                  konfigurasi atau hapus item tersebut sebelum checkout.
                </>,
                <>
                  <strong className="tabular-price">{summary.unavailableItemCount}</strong> item(s)
                  are no longer available due to catalog updates. Edit or remove them before
                  checkout.
                </>
              )}
            </div>
          ) : null}

          <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* Daftar Item Keranjang */}
            <div className="w-full min-w-0 space-y-4 lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-[#FAFAFA] px-4 py-3">
                <p className="text-xs font-medium text-ink">
                  {pick('Dipilih:', 'Selected:')}{' '}
                  <span className="tabular-price font-semibold">
                    {checkedSummary.selectedCount}
                  </span>{' '}
                  {pick('dari', 'of')}{' '}
                  <span className="tabular-price font-semibold">{availableItemUuids.length}</span>{' '}
                  {pick('item tersedia', 'available items')}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={availableItemUuids.length === 0}
                    onClick={() => checkAll(availableItemUuids)}
                    className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-3.5 text-xs font-semibold text-ink transition-colors hover:border-ink disabled:opacity-40"
                  >
                    {pick('Pilih Semua', 'Select All')}
                  </button>
                  <button
                    type="button"
                    disabled={checkedItems.size === 0}
                    onClick={() => uncheckAll()}
                    className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-3.5 text-xs font-semibold text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
                  >
                    {pick('Kosongkan Pilihan', 'Clear Selection')}
                  </button>
                </div>
              </div>

              {items.map((item, idx) => {
                const isChecked = item.isAvailable && checkedItems.has(item.cartItemUuid);
                const pricing = item.pricing;
                const colorName =
                  pricing?.colorName ??
                  item.config.colorName ??
                  (item.config.isCustomColor
                    ? pick('Warna Custom', 'Custom Color')
                    : pick('Preset warna', 'Preset color'));
                const colorHex = pricing?.colorHex ?? item.config.colorHex;

                return (
                  <article
                    key={item.cartItemUuid}
                    className={`rounded-sm border bg-white p-4 sm:p-5 ${
                      item.isAvailable ? 'border-line' : 'border-red-200 bg-red-50/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <label className="inline-flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-sm border border-line bg-[#FAFAFA]">
                          <input
                            type="checkbox"
                            disabled={!item.isAvailable}
                            checked={isChecked}
                            onChange={() => toggleItem(item.cartItemUuid)}
                            aria-label={pick(
                              `Pilih item ${pricing?.modelName ?? `#${idx + 1}`}`,
                              `Select item ${pricing?.modelName ?? `#${idx + 1}`}`
                            )}
                            className="h-4 w-4 accent-ink"
                          />
                        </label>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-display text-base font-semibold text-ink sm:text-lg">
                              {pricing?.modelName ?? `Model #${item.modelId}`}
                            </h2>
                            {!item.isAvailable ? (
                              <Badge variant="err">
                                {pick('Perlu Diperbarui', 'Needs Update')}
                              </Badge>
                            ) : null}
                            {item.config.isCustomColor ? (
                              <Badge variant="warn">
                                {pick('Warna Custom · WA', 'Custom Color · WA')}
                              </Badge>
                            ) : null}
                          </div>

                          <p className="mt-1 text-xs text-muted">
                            {pick('Bahan:', 'Fabric:')}{' '}
                            <span className="font-medium text-ink">
                              {pricing?.fabricName ?? `#${item.fabricId}`}
                            </span>{' '}
                            · {pick('Warna:', 'Color:')}{' '}
                            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                              {colorHex ? (
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full border border-neutral-300"
                                  style={{ backgroundColor: colorHex }}
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span>{colorName}</span>
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="tabular-price text-base font-bold text-ink sm:text-lg">
                          {item.isAvailable ? formatRupiah(item.lineSubtotal) : '—'}
                        </p>
                        <p className="text-xs text-muted">
                          <span className="tabular-price font-medium text-ink">
                            {item.itemQty} pcs
                          </span>
                        </p>
                      </div>
                    </div>

                    {!item.isAvailable && item.warnings.length > 0 ? (
                      <div className="mt-3 rounded-sm border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-status-err">
                        {item.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    ) : null}

                    {/* Rincian Ukuran */}
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-ink">
                        {pick('Rincian Ukuran', 'Size Breakdown')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {pricing
                          ? pricing.sizes.map((s) => (
                              <span
                                key={s.sizeId}
                                className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-[#FAFAFA] px-3 py-1.5 text-xs"
                              >
                                <span className="font-mono font-semibold text-ink">
                                  {s.sizeCode}
                                </span>
                                <span className="tabular-price text-muted">× {s.qty}</span>
                                <span className="tabular-price text-ink">
                                  ({formatRupiah(s.unitPrice)})
                                </span>
                              </span>
                            ))
                          : item.config.sizes.map((s) => (
                              <span
                                key={s.sizeId}
                                className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-[#FAFAFA] px-3 py-1.5 text-xs"
                              >
                                <span className="font-mono font-semibold text-ink">
                                  {sizeCodeMap.get(s.sizeId) ?? `#${s.sizeId}`}
                                </span>
                                <span className="tabular-price text-muted">× {s.qty}</span>
                              </span>
                            ))}
                      </div>
                    </div>

                    {/* Rincian Titik Sablon & Desain */}
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-ink">
                        {pick('Titik Sablon', 'Print Spots')} ({item.config.prints.length})
                      </p>
                      {item.config.prints.length === 0 ? (
                        <p className="text-xs text-muted">
                          {pick('Polos (tanpa sablon)', 'Plain (no prints)')}
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {item.config.prints.map((spot, spotIdx) => {
                            const matchedPrint = pricing?.prints[spotIdx];
                            return (
                              <li
                                key={`${item.cartItemUuid}-spot-${spotIdx}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-[#FAFAFA] px-3 py-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <span className="font-medium text-ink">
                                    {getLocalizedPrintPositionLabel(spot.printPosition, locale)}
                                  </span>
                                  {matchedPrint ? (
                                    <span className="text-muted">
                                      {' '}
                                      · {matchedPrint.printSizeName} (
                                      <span className="tabular-price">
                                        +{formatRupiah(matchedPrint.pricePerSpot)}
                                      </span>
                                      /pcs)
                                    </span>
                                  ) : null}
                                </div>
                                {spot.needsDesignHelp ? (
                                  <Badge variant="neutral">
                                    {pick('Bantuan Desain Gratis', 'Free Design Help')}
                                  </Badge>
                                ) : spot.fileName ? (
                                  <span className="truncate font-mono text-[11px] text-ink">
                                    {spot.fileName}
                                  </span>
                                ) : (
                                  <Badge variant="warn">
                                    {pick('Belum ada file', 'No file uploaded')}
                                  </Badge>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {item.config.productionNotes ? (
                      <div className="mt-3 rounded-sm border border-line bg-[#FAFAFA] px-3.5 py-2.5 text-xs text-muted">
                        <span className="font-semibold text-ink">
                          {pick('Catatan: ', 'Notes: ')}
                        </span>
                        {item.config.productionNotes}
                      </div>
                    ) : null}

                    {/* Tombol Aksi Item */}
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3.5">
                      {item.isAvailable ? (
                        <button
                          type="button"
                          onClick={() => openQuickEdit(item)}
                          className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-4 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA]"
                        >
                          {pick('Ubah Qty / Catatan', 'Edit Qty / Notes')}
                        </button>
                      ) : null}
                      <Link
                        to={`/custom-lab?edit=${encodeURIComponent(item.cartItemUuid)}`}
                        className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-4 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA]"
                      >
                        {pick('Edit di Custom Lab', 'Edit in Custom Lab')}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex min-h-touch items-center rounded-sm border border-line bg-white px-4 text-xs font-semibold text-status-err transition-colors hover:border-status-err hover:bg-red-50"
                      >
                        {pick('Hapus', 'Remove')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Ringkasan Keranjang & Gatekeeper DP */}
            <aside className="w-full min-w-0 lg:sticky lg:top-24 lg:col-span-4">
              <div className="w-full space-y-5 rounded-sm border border-line bg-white p-5 sm:p-6">
                <div className="border-b border-line pb-4">
                  <p className="eyebrow">{pick('Ringkasan Keranjang', 'Bag Summary')}</p>
                  <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                    {pick('Estimasi Tagihan Server', 'Server Quote Summary')}
                  </h2>
                </div>

                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">{pick('Item dipilih', 'Selected items')}</dt>
                    <dd className="tabular-price font-semibold text-ink">
                      {checkedSummary.selectedCount} {pick('item', 'items')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">{pick('Total kuantitas', 'Total quantity')}</dt>
                    <dd className="tabular-price font-semibold text-ink">
                      {checkedSummary.totalQty} pcs
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                    <dt className="font-medium text-ink">
                      {pick('Subtotal item dipilih', 'Selected subtotal')}
                    </dt>
                    <dd className="tabular-price text-lg font-bold text-ink">
                      {formatRupiah(checkedSummary.subtotalAmount)}
                    </dd>
                  </div>
                </dl>

                {/* Status Gatekeeper DP Dinamis */}
                <div className="space-y-2.5 rounded-sm border border-line bg-[#FAFAFA] p-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {pick('Kelayakan Pembayaran DP', 'Deposit Eligibility')}
                    </span>
                    <Badge variant={checkedSummary.dpEligible ? 'ok' : 'neutral'}>
                      {checkedSummary.dpEligible
                        ? `${getLocalizedPaymentSchemeLabel(PAYMENT_SCHEME.DP, checkedSummary.dpPercent, locale)} ${pick('Terbuka', 'Unlocked')}`
                        : pick('Hanya Lunas', 'Full Pay Only')}
                    </Badge>
                  </div>

                  {checkedSummary.dpEligible ? (
                    <div className="space-y-1 text-ink">
                      <p>
                        {pick('Estimasi DP', 'Estimated deposit')} ({checkedSummary.dpPercent}%):{' '}
                        <strong className="tabular-price">
                          {formatRupiah(checkedSummary.dpAmount)}
                        </strong>
                      </p>
                      <p className="text-muted">
                        {pick('Sisa pelunasan setelah QC:', 'Remaining balance after QC:')}{' '}
                        <span className="tabular-price font-medium text-ink">
                          {formatRupiah(checkedSummary.settlementAmount)}
                        </span>{' '}
                        {pick('(+ ongkir bila kirim)', '(+ shipping if delivered)')}
                      </p>
                    </div>
                  ) : (
                    <p className="leading-relaxed text-muted">
                      {pick(
                        <>
                          Minimal{' '}
                          <strong className="tabular-price text-ink">
                            {checkedSummary.dpMinQty} pcs
                          </strong>{' '}
                          total pada item tercentang untuk membuka opsi DP{' '}
                          <span className="tabular-price">{checkedSummary.dpPercent}%</span> (kurang{' '}
                          <strong className="tabular-price text-ink">
                            {checkedSummary.missingForDp} pcs
                          </strong>
                          ).
                        </>,
                        <>
                          Minimum{' '}
                          <strong className="tabular-price text-ink">
                            {checkedSummary.dpMinQty} pcs
                          </strong>{' '}
                          selected to unlock{' '}
                          <span className="tabular-price">{checkedSummary.dpPercent}%</span> deposit
                          (add{' '}
                          <strong className="tabular-price text-ink">
                            {checkedSummary.missingForDp} pcs
                          </strong>
                          ).
                        </>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={!canCheckout}
                    onClick={handleProceedToCheckout}
                    className="btn-primary w-full"
                  >
                    {pick('Checkout Pesanan', 'Checkout Order')} ({checkedSummary.selectedCount})
                  </button>
                  {!canCheckout ? (
                    <p className="text-center text-xs text-muted">
                      {hasUnavailableItems
                        ? pick(
                            'Perbarui atau hapus item yang tidak tersedia sebelum checkout.',
                            'Update or remove unavailable items before checkout.'
                          )
                        : pick(
                            'Centang minimal satu item untuk melanjutkan ke checkout.',
                            'Select at least one item to proceed to checkout.'
                          )}
                    </p>
                  ) : null}
                  <Link to="/custom-lab" className="btn-secondary w-full">
                    {pick('Tambah Konfigurasi Lain', 'Add Another Configuration')}
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      {/* Modal Ubah Qty & Catatan */}
      <Modal
        open={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        title={pick('Ubah Kuantitas & Catatan', 'Edit Quantity & Notes')}
        description={pick(
          'Perubahan akan dihitung ulang langsung oleh server.',
          'Changes will be recalculated automatically by the server.'
        )}
        size="md"
      >
        {editingItem ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink">
                {pick('Jumlah per Ukuran', 'Quantity per Size')}
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {sizes.map((size) => {
                  const val = editQuantities[size.id] ?? 0;
                  return (
                    <label
                      key={size.id}
                      className="flex flex-col gap-1 rounded-sm border border-line bg-[#FAFAFA] p-2.5 text-xs"
                    >
                      <span className="font-mono font-semibold text-ink">{size.code}</span>
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        value={val}
                        onChange={(event) => {
                          const parsed = Number.parseInt(event.target.value || '0', 10);
                          setEditQuantities((prev) => ({
                            ...prev,
                            [size.id]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
                          }));
                        }}
                        className="input-sharp tabular-price no-spinner bg-white"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor="cart-quick-edit-notes"
                className="block text-xs font-semibold text-ink"
              >
                {pick('Catatan Produksi (Opsional)', 'Production Notes (Optional)')}
              </label>
              <textarea
                id="cart-quick-edit-notes"
                rows={3}
                maxLength={500}
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
                className="input-sharp mt-1.5 min-h-[84px] resize-y py-2"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                disabled={updateMutation.isPending}
                className="btn-secondary"
              >
                {pick('Batal', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveQuickEdit}
                disabled={updateMutation.isPending}
                className="btn-primary"
              >
                {updateMutation.isPending
                  ? pick('Menyimpan...', 'Saving...')
                  : pick('Simpan Perubahan', 'Save Changes')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal Konfirmasi Hapus */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={pick('Hapus Item Keranjang?', 'Remove Bag Item?')}
        description={pick(
          'Item ini beserta file desain yang tidak digunakan item lain akan dihapus dari keranjang.',
          'This item and any unused design files will be removed from your bag.'
        )}
        size="sm"
      >
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={deleteMutation.isPending}
            className="btn-secondary"
          >
            {pick('Batal', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={deleteMutation.isPending || !deleteTarget}
            onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate(deleteTarget.cartItemUuid);
              }
            }}
            className="inline-flex min-h-touch items-center justify-center rounded-sm bg-status-err px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            {deleteMutation.isPending
              ? pick('Menghapus...', 'Removing...')
              : pick('Ya, Hapus', 'Yes, Remove')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
