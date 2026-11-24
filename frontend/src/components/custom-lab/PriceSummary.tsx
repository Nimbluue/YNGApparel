import {
  PAYMENT_SCHEME,
  getPaymentSchemeLabel,
  type PaymentScheme,
  type PricingQuoteResponseDto,
  type PublicCatalogConfigDto,
} from '@yng/shared';
import { useState } from 'react';
import { formatRupiah } from '../../utils/formatRupiah';
import type { LocalPricingEstimate } from '../../utils/pricing';

interface PriceSummaryProps {
  modelName: string | null;
  fabricName: string | null;
  colorSummary: string | null;
  printSpotsCount: number;
  localEstimate: LocalPricingEstimate;
  serverQuote: PricingQuoteResponseDto | null;
  isQuotePending: boolean;
  quoteError: string | null;
  isReadyForServerQuote: boolean;
  config: PublicCatalogConfigDto;
  selectedPaymentScheme: PaymentScheme;
  onChangePaymentScheme: (scheme: PaymentScheme) => void;
  isGuest: boolean;
  onAddToCart: () => void;
  onAskWhatsApp: () => void;
  actionFeedback: string | null;
}

export function PriceSummary({
  modelName,
  fabricName,
  colorSummary,
  printSpotsCount,
  localEstimate,
  serverQuote,
  isQuotePending,
  quoteError,
  isReadyForServerQuote,
  config,
  selectedPaymentScheme,
  onChangePaymentScheme,
  isGuest,
  onAddToCart,
  onAskWhatsApp,
  actionFeedback,
}: PriceSummaryProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const serverItem = serverQuote?.items[0] ?? null;
  const activeDpMinQty = serverQuote?.dpMinQty ?? config.dpMinQty;
  const activeDpPercent = serverQuote?.dpPercent ?? config.dpPercent;
  const activeTotalQty = serverQuote?.totalQty ?? localEstimate.totalQty;
  const activeSubtotal = serverQuote?.subtotalAmount ?? localEstimate.subtotalAmount;
  const activeDpEligible = serverQuote?.dpEligible ?? localEstimate.dpEligible;
  const activeDpAmount = serverQuote?.dpAmount ?? localEstimate.dpAmount;
  const activeSettlementAmount = serverQuote?.settlementAmount ?? localEstimate.settlementAmount;

  const effectiveScheme: PaymentScheme = activeDpEligible
    ? selectedPaymentScheme
    : PAYMENT_SCHEME.FULL;

  const fullLabel = getPaymentSchemeLabel(PAYMENT_SCHEME.FULL);
  const dpLabel = getPaymentSchemeLabel(PAYMENT_SCHEME.DP, activeDpPercent);
  const initialPayAmount = effectiveScheme === PAYMENT_SCHEME.DP ? activeDpAmount : activeSubtotal;
  const missingForDp = Math.max(0, activeDpMinQty - activeTotalQty);

  const sizeRows = serverItem?.sizes ?? localEstimate.sizeBreakdowns;
  const basePrice = serverItem?.basePrice ?? localEstimate.basePrice;
  const fabricAdditionalPrice =
    serverItem?.fabricAdditionalPrice ?? localEstimate.fabricAdditionalPrice;
  const printSpotsTotal = serverItem?.printSpotsTotal ?? localEstimate.printSpotsTotal;

  const syncStatusBadge = quoteError ? (
    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-status-err">
      Validasi server
    </span>
  ) : isQuotePending ? (
    <span className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
      Menghitung server...
    </span>
  ) : serverQuote ? (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-status-ok">
      Harga resmi server
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
      Estimasi sementara
    </span>
  );

  const summaryBody = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <p className="eyebrow">Ringkasan Harga</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink">
            {modelName ?? 'Belum pilih model'}
          </h2>
        </div>
        {syncStatusBadge}
      </div>

      <dl className="space-y-2.5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted">Bahan</dt>
          <dd className="text-right font-medium text-ink">{fabricName ?? '—'}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted">Warna</dt>
          <dd className="text-right font-medium text-ink">{colorSummary ?? '—'}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted">Titik Sablon</dt>
          <dd className="text-right font-medium text-ink">
            {printSpotsCount > 0 ? (
              <>
                <span className="tabular-price">{printSpotsCount}</span> titik
              </>
            ) : (
              <>
                Polos (<span className="tabular-price">0</span> titik)
              </>
            )}
          </dd>
        </div>
      </dl>

      <div className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Harga dasar model</span>
          <span className="tabular-price font-medium text-ink">{formatRupiah(basePrice)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Tambahan bahan</span>
          <span className="tabular-price font-medium text-ink">
            {formatRupiah(fabricAdditionalPrice)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Total sablon / pcs</span>
          <span className="tabular-price font-medium text-ink">
            {formatRupiah(printSpotsTotal)}
          </span>
        </div>

        {sizeRows.length > 0 ? (
          <div className="mt-2 space-y-1.5 border-t border-line pt-2.5">
            {sizeRows.map((row) => (
              <div key={row.sizeId} className="flex items-center justify-between gap-2">
                <span className="text-ink">
                  <span className="font-mono">{row.sizeCode}</span> ×{' '}
                  <span className="tabular-price">{row.qty}</span> pcs{' '}
                  {row.extraCharge > 0 ? (
                    <span className="text-muted">
                      (<span className="tabular-price">+{formatRupiah(row.extraCharge)}</span>)
                    </span>
                  ) : null}
                </span>
                <span className="tabular-price font-semibold text-ink">
                  {formatRupiah(row.lineTotal)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-t border-line pt-2.5 text-muted">
            Isi jumlah ukuran untuk melihat rincian per ukuran.
          </p>
        )}
      </div>

      {/* Dynamic DP Gatekeeper */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink">Skema Pembayaran</span>
          <span className="text-xs text-muted">
            Min. DP <span className="tabular-price font-medium text-ink">{activeDpMinQty} pcs</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangePaymentScheme(PAYMENT_SCHEME.FULL)}
            aria-pressed={effectiveScheme === PAYMENT_SCHEME.FULL}
            className={`flex min-h-touch flex-col items-start justify-center rounded-xl border px-3 py-2.5 text-left transition-colors ${
              effectiveScheme === PAYMENT_SCHEME.FULL
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-white text-ink hover:border-ink'
            }`}
          >
            <span className="text-xs font-semibold">{fullLabel}</span>
            <span
              className={`tabular-price text-[11px] ${
                effectiveScheme === PAYMENT_SCHEME.FULL ? 'text-neutral-300' : 'text-muted'
              }`}
            >
              {formatRupiah(activeSubtotal)}
            </span>
          </button>

          <button
            type="button"
            disabled={!activeDpEligible}
            onClick={() => onChangePaymentScheme(PAYMENT_SCHEME.DP)}
            aria-pressed={effectiveScheme === PAYMENT_SCHEME.DP}
            className={`flex min-h-touch flex-col items-start justify-center rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              effectiveScheme === PAYMENT_SCHEME.DP
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-white text-ink hover:border-ink'
            }`}
          >
            <span className="text-xs font-semibold">{dpLabel}</span>
            <span
              className={`tabular-price text-[11px] ${
                effectiveScheme === PAYMENT_SCHEME.DP ? 'text-neutral-300' : 'text-muted'
              }`}
            >
              {formatRupiah(activeDpAmount)}
            </span>
          </button>
        </div>

        {!activeDpEligible ? (
          <p className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted">
            Skema {dpLabel} terkunci. Tambah{' '}
            <strong className="tabular-price text-ink">{missingForDp} pcs</strong> lagi (total
            minimal <span className="tabular-price">{activeDpMinQty} pcs</span>) untuk membuka opsi
            DP.
          </p>
        ) : effectiveScheme === PAYMENT_SCHEME.DP ? (
          <p className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink">
            Bayar awal <strong className="tabular-price">{formatRupiah(activeDpAmount)}</strong>,
            sisa pelunasan{' '}
            <strong className="tabular-price">{formatRupiah(activeSettlementAmount)}</strong> (+
            ongkir bila kirim) setelah QC.
          </p>
        ) : (
          <p className="text-xs text-muted">
            Opsi {dpLabel} sudah terbuka untuk jumlah{' '}
            <span className="tabular-price font-medium text-ink">{activeTotalQty} pcs</span>.
          </p>
        )}
      </div>

      {quoteError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-status-err"
        >
          {quoteError}
        </p>
      ) : !isReadyForServerQuote ? (
        <p className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
          Lengkapi pilihan bahan, warna, jumlah ukuran, dan ukuran sablon untuk menghitung harga
          resmi server.
        </p>
      ) : null}

      <div className="space-y-1.5 border-t border-line pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted">
            Total (<span className="tabular-price text-ink">{activeTotalQty} pcs</span>)
          </span>
          <span className="tabular-price text-xl font-bold text-ink">
            {formatRupiah(activeSubtotal)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted">
            Tagihan awal ({effectiveScheme === 'DP' ? dpLabel : fullLabel})
          </span>
          <span className="tabular-price font-semibold text-ink">
            {formatRupiah(initialPayAmount)}
          </span>
        </div>
        <p className="text-[11px] text-muted">
          Belum termasuk ongkos kirim (diinput setelah QC) · Estimasi:{' '}
          {config.productionEstimateText}
        </p>
      </div>

      <div className="space-y-2.5">
        <button type="button" onClick={onAddToCart} className="btn-primary w-full">
          {isGuest ? 'Tambah ke Keranjang (Masuk)' : 'Tambah ke Keranjang'}
        </button>

        <button type="button" onClick={onAskWhatsApp} className="btn-secondary w-full">
          Tanya via WhatsApp
        </button>
      </div>

      {actionFeedback ? (
        <p
          role="status"
          className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs leading-relaxed text-ink"
        >
          {actionFeedback}
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Desktop sticky sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 rounded-3xl border border-line bg-white p-6 shadow-sm">
          {summaryBody}
        </div>
      </aside>

      {/* Mobile expandable bottom drawer */}
      {mobileExpanded ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-ink/40 backdrop-blur-[1px] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Rincian harga Custom Lab"
        >
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-line bg-white p-5 pb-28">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setMobileExpanded(false)}
                className="inline-flex min-h-touch items-center rounded-full border border-line px-4 text-xs font-semibold text-ink"
              >
                Tutup Rincian
              </button>
            </div>
            {summaryBody}
          </div>
        </div>
      ) : null}

      {/* Mobile bottom sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-3 py-2.5 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="tabular-price truncate text-sm font-bold text-ink">
              {formatRupiah(activeSubtotal)}
            </p>
            <p className="truncate text-xs text-muted">
              <span className="tabular-price font-medium text-ink">{activeTotalQty} pcs</span> ·{' '}
              {activeDpEligible ? (
                `${dpLabel} tersedia`
              ) : (
                <>
                  DP min. <span className="tabular-price">{activeDpMinQty} pcs</span>
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMobileExpanded((prev) => !prev)}
              className="inline-flex min-h-touch items-center rounded-full border border-line-strong bg-white px-3.5 text-xs font-semibold text-ink"
            >
              {mobileExpanded ? 'Tutup' : 'Rincian'}
            </button>
            <button
              type="button"
              onClick={onAddToCart}
              className="inline-flex min-h-touch items-center rounded-full bg-ink px-4 text-xs font-semibold text-white"
            >
              {isGuest ? 'Masuk' : 'Keranjang'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
