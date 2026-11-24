import type { PublicSizeDto } from '@yng/shared';
import { formatRupiah } from '../../utils/formatRupiah';

interface SizeMatrixProps {
  sizes: readonly PublicSizeDto[];
  quantities: Readonly<Record<number, number>>;
  onChangeQuantity: (sizeId: number, nextQty: number) => void;
}

export function SizeMatrix({ sizes, quantities, onChangeQuantity }: SizeMatrixProps) {
  const totalQty = sizes.reduce((sum, size) => sum + Math.max(0, quantities[size.id] ?? 0), 0);

  if (sizes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong bg-surface p-4 text-sm text-muted">
        Daftar ukuran belum tersedia di katalog.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {sizes.map((size) => {
          const qty = Math.max(0, quantities[size.id] ?? 0);
          return (
            <div
              key={size.id}
              className="flex items-center justify-between gap-2 px-3.5 py-3 sm:px-4"
            >
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-ink sm:text-base">
                  {size.code}
                </p>
                <p className="text-xs text-muted">
                  {size.extraCharge > 0 ? (
                    <span className="tabular-price">+{formatRupiah(size.extraCharge)}</span>
                  ) : (
                    'Harga standar'
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeQuantity(size.id, Math.max(0, qty - 1))}
                  disabled={qty === 0}
                  aria-label={`Kurangi ukuran ${size.code}`}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-white text-lg font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35"
                >
                  −
                </button>

                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  inputMode="numeric"
                  aria-label={`Jumlah ukuran ${size.code}`}
                  value={qty}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    const safeQty =
                      Number.isFinite(parsed) && parsed > 0 ? Math.min(100000, parsed) : 0;
                    onChangeQuantity(size.id, safeQty);
                  }}
                  className="tabular-price h-11 w-14 rounded-xl border border-line bg-surface px-1.5 text-center text-sm font-semibold text-ink focus:border-ink focus:bg-white focus:outline-none sm:w-16"
                />

                <button
                  type="button"
                  onClick={() => onChangeQuantity(size.id, Math.min(100000, qty + 1))}
                  aria-label={`Tambah ukuran ${size.code}`}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-white text-lg font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
        <span className="text-sm font-medium text-muted">Total kuantitas sementara</span>
        <span className="tabular-price rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">
          {totalQty} pcs
        </span>
      </div>
    </div>
  );
}
