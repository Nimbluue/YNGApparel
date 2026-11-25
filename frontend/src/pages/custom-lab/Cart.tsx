import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PAYMENT_SCHEME,
  PRINT_POSITION_LABELS,
  getPaymentSchemeLabel,
  type CartItemDto,
  type UpsertCartItemRequestDto,
} from '@yng/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/toastContext';
import { useCartStore } from '../../lib/store';
import {
  cartQueryKeys,
  deleteCartItem,
  getCartItems,
  updateCartItem,
} from '../../services/cartService';
import { catalogQueryKeys, getCatalogSizes } from '../../services/catalogService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';

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

  // Sinkronkan item tercentang agar hanya memuat item tersedia yang masih ada di keranjang
  useEffect(() => {
    if (!cartQuery.data) return;
    const availableSet = new Set(availableItemUuids);
    const currentChecked = [...checkedItems].filter((uuid) => availableSet.has(uuid));
    if (currentChecked.length === 0 && availableItemUuids.length > 0 && checkedItems.size === 0) {
      setCheckedItems(availableItemUuids);
      return;
    }
    if (currentChecked.length !== checkedItems.size) {
      setCheckedItems(currentChecked);
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
      toast('Item keranjang berhasil diperbarui.', 'ok');
    },
    onError: (err) => {
      const parsed = extractApiError(err, 'Gagal memperbarui item keranjang.');
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
      toast('Item dihapus dari keranjang.', 'ok');
    },
    onError: (err) => {
      const parsed = extractApiError(err, 'Gagal menghapus item keranjang.');
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
      toast('Minimal satu ukuran harus memiliki jumlah lebih dari 0 pcs.', 'warn');
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
    const parsed = extractApiError(cartQuery.error, 'Gagal memuat keranjang Custom Lab.');
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState
          title="Keranjang belum dapat dimuat"
          message={parsed.message}
          retry={() => void cartQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="eyebrow">YNG Studio · Keranjang Custom Lab</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
            Keranjang Konfigurasi
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Harga dihitung ulang otomatis dari katalog server setiap keranjang dibuka.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {summary ? (
            <span className="inline-flex min-h-touch items-center rounded-full border border-line bg-surface px-4 text-xs font-medium text-ink">
              Kapasitas:{' '}
              <span className="tabular-price ml-1.5 font-semibold">
                {summary.totalItems}/{summary.maxItems}
              </span>
            </span>
          ) : null}
          <Link to="/custom-lab" className="btn-primary">
            + Tambah Konfigurasi
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Keranjang Custom Lab masih kosong"
          description="Rancang model, pilih bahan dan warna, atur matriks ukuran serta titik sablon di Custom Lab untuk menambahkannya ke sini."
          action={
            <Link to="/custom-lab" className="btn-primary">
              Buka Custom Lab
            </Link>
          }
        />
      ) : (
        <>
          {summary && summary.unavailableItemCount > 0 ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs leading-relaxed text-status-err sm:text-sm"
            >
              Terdapat <strong className="tabular-price">{summary.unavailableItemCount}</strong>{' '}
              item yang tidak lagi tersedia karena perubahan master katalog. Perbarui konfigurasi
              atau hapus item tersebut sebelum checkout.
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
            {/* Daftar Item Keranjang */}
            <div className="min-w-0 space-y-4 lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
                <p className="text-xs font-medium text-ink">
                  Dipilih:{' '}
                  <span className="tabular-price font-semibold">
                    {checkedSummary.selectedCount}
                  </span>{' '}
                  dari{' '}
                  <span className="tabular-price font-semibold">{availableItemUuids.length}</span>{' '}
                  item tersedia
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={availableItemUuids.length === 0}
                    onClick={() => checkAll(availableItemUuids)}
                    className="inline-flex min-h-touch items-center rounded-full border border-line bg-white px-3.5 text-xs font-semibold text-ink transition-colors hover:border-ink disabled:opacity-40"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    disabled={checkedItems.size === 0}
                    onClick={() => uncheckAll()}
                    className="inline-flex min-h-touch items-center rounded-full border border-line bg-white px-3.5 text-xs font-semibold text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
                  >
                    Kosongkan Pilihan
                  </button>
                </div>
              </div>

              {items.map((item, idx) => {
                const isChecked = item.isAvailable && checkedItems.has(item.cartItemUuid);
                const pricing = item.pricing;
                const colorName =
                  pricing?.colorName ??
                  item.config.colorName ??
                  (item.config.isCustomColor ? 'Warna Custom' : 'Preset warna');
                const colorHex = pricing?.colorHex ?? item.config.colorHex;

                return (
                  <article
                    key={item.cartItemUuid}
                    className={`rounded-2xl border bg-white p-4 sm:p-5 ${
                      item.isAvailable ? 'border-line' : 'border-red-200 bg-red-50/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <label className="inline-flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface">
                          <input
                            type="checkbox"
                            disabled={!item.isAvailable}
                            checked={isChecked}
                            onChange={() => toggleItem(item.cartItemUuid)}
                            aria-label={`Pilih item ${pricing?.modelName ?? `#${idx + 1}`}`}
                            className="h-4 w-4 accent-ink"
                          />
                        </label>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-display text-base font-semibold text-ink sm:text-lg">
                              {pricing?.modelName ?? `Model #${item.modelId}`}
                            </h2>
                            {!item.isAvailable ? (
                              <Badge variant="err">Perlu Diperbarui</Badge>
                            ) : null}
                            {item.config.isCustomColor ? (
                              <Badge variant="warn">Warna Custom · WA</Badge>
                            ) : null}
                          </div>

                          <p className="mt-1 text-xs text-muted">
                            Bahan:{' '}
                            <span className="font-medium text-ink">
                              {pricing?.fabricName ?? `#${item.fabricId}`}
                            </span>{' '}
                            · Warna:{' '}
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
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-status-err">
                        {item.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    ) : null}

                    {/* Rincian Ukuran */}
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-ink">Rincian Ukuran</p>
                      <div className="flex flex-wrap gap-2">
                        {pricing
                          ? pricing.sizes.map((s) => (
                              <span
                                key={s.sizeId}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs"
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
                                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs"
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
                        Titik Sablon ({item.config.prints.length})
                      </p>
                      {item.config.prints.length === 0 ? (
                        <p className="text-xs text-muted">Polos (tanpa sablon)</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {item.config.prints.map((spot, spotIdx) => {
                            const matchedPrint = pricing?.prints[spotIdx];
                            return (
                              <li
                                key={`${item.cartItemUuid}-spot-${spotIdx}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <span className="font-medium text-ink">
                                    {PRINT_POSITION_LABELS[spot.printPosition]}
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
                                  <Badge variant="neutral">Bantuan Desain Gratis</Badge>
                                ) : spot.fileName ? (
                                  <span className="truncate font-mono text-[11px] text-ink">
                                    {spot.fileName}
                                  </span>
                                ) : (
                                  <Badge variant="warn">Belum ada file</Badge>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {item.config.productionNotes ? (
                      <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
                        <span className="font-semibold text-ink">Catatan: </span>
                        {item.config.productionNotes}
                      </div>
                    ) : null}

                    {/* Tombol Aksi Item */}
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3.5">
                      {item.isAvailable ? (
                        <button
                          type="button"
                          onClick={() => openQuickEdit(item)}
                          className="inline-flex min-h-touch items-center rounded-full border border-line bg-white px-4 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-surface"
                        >
                          Ubah Qty / Catatan
                        </button>
                      ) : null}
                      <Link
                        to={`/custom-lab?edit=${encodeURIComponent(item.cartItemUuid)}`}
                        className="inline-flex min-h-touch items-center rounded-full border border-line bg-white px-4 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-surface"
                      >
                        Edit di Custom Lab
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex min-h-touch items-center rounded-full border border-line bg-white px-4 text-xs font-semibold text-status-err transition-colors hover:border-status-err hover:bg-red-50"
                      >
                        Hapus
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Ringkasan Keranjang & Gatekeeper DP */}
            <aside className="min-w-0 lg:col-span-4">
              <div className="space-y-5 rounded-3xl border border-line bg-white p-5 sm:p-6 lg:sticky lg:top-24">
                <div className="border-b border-line pb-4">
                  <p className="eyebrow">Ringkasan Keranjang</p>
                  <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                    Estimasi Tagihan Server
                  </h2>
                </div>

                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">Item dipilih</dt>
                    <dd className="tabular-price font-semibold text-ink">
                      {checkedSummary.selectedCount} item
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">Total kuantitas</dt>
                    <dd className="tabular-price font-semibold text-ink">
                      {checkedSummary.totalQty} pcs
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                    <dt className="font-medium text-ink">Subtotal item dipilih</dt>
                    <dd className="tabular-price text-lg font-bold text-ink">
                      {formatRupiah(checkedSummary.subtotalAmount)}
                    </dd>
                  </div>
                </dl>

                {/* Status Gatekeeper DP Dinamis */}
                <div className="space-y-2.5 rounded-2xl border border-line bg-surface p-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">Kelayakan Pembayaran DP</span>
                    <Badge variant={checkedSummary.dpEligible ? 'ok' : 'neutral'}>
                      {checkedSummary.dpEligible
                        ? `${getPaymentSchemeLabel(PAYMENT_SCHEME.DP, checkedSummary.dpPercent)} Terbuka`
                        : 'Hanya Lunas'}
                    </Badge>
                  </div>

                  {checkedSummary.dpEligible ? (
                    <div className="space-y-1 text-ink">
                      <p>
                        Estimasi DP ({checkedSummary.dpPercent}%):{' '}
                        <strong className="tabular-price">
                          {formatRupiah(checkedSummary.dpAmount)}
                        </strong>
                      </p>
                      <p className="text-muted">
                        Sisa pelunasan setelah QC:{' '}
                        <span className="tabular-price font-medium text-ink">
                          {formatRupiah(checkedSummary.settlementAmount)}
                        </span>{' '}
                        (+ ongkir bila kirim)
                      </p>
                    </div>
                  ) : (
                    <p className="leading-relaxed text-muted">
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
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled
                    className="btn-primary w-full cursor-not-allowed opacity-55"
                    title="Alur checkout pesanan akan aktif pada Tahap 3b"
                  >
                    Checkout Pesanan (Aktif di Tahap 3b)
                  </button>
                  <Link to="/custom-lab" className="btn-secondary w-full">
                    Tambah Konfigurasi Lain
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
        title="Ubah Kuantitas & Catatan"
        description="Perubahan akan dihitung ulang langsung oleh server."
        size="md"
      >
        {editingItem ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink">Jumlah per Ukuran</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {sizes.map((size) => {
                  const val = editQuantities[size.id] ?? 0;
                  return (
                    <label
                      key={size.id}
                      className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-2.5 text-xs"
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
                        className="input-sharp tabular-price bg-white"
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
                Catatan Produksi (Opsional)
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
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveQuickEdit}
                disabled={updateMutation.isPending}
                className="btn-primary"
              >
                {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal Konfirmasi Hapus */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Item Keranjang?"
        description="Item ini beserta file desain yang tidak digunakan item lain akan dihapus dari keranjang."
        size="sm"
      >
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={deleteMutation.isPending}
            className="btn-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={deleteMutation.isPending || !deleteTarget}
            onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate(deleteTarget.cartItemUuid);
              }
            }}
            className="inline-flex min-h-touch items-center justify-center rounded-full bg-status-err px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
