import {
  PRINT_POSITION,
  PRINT_POSITION_LABELS,
  type PrintPosition,
  type PublicPrintSizeDto,
} from '@yng/shared';
import { formatRupiah } from '../../utils/formatRupiah';
import { ORDERED_PRINT_POSITIONS, type PrintSpotDraft } from './printSpotHelpers';

interface PrintSpotPickerProps {
  spots: readonly PrintSpotDraft[];
  printSizes: readonly PublicPrintSizeDto[];
  isGuest: boolean;
  onAddSpot: () => void;
  onUpdateSpot: (key: string, patch: Partial<Omit<PrintSpotDraft, 'key'>>) => void;
  onRemoveSpot: (key: string) => void;
  onRequestUploadDesign: (spotKey: string) => void;
  uploadFeedbackBySpotKey?: Readonly<Record<string, string>>;
}

export function PrintSpotPicker({
  spots,
  printSizes,
  isGuest,
  onAddSpot,
  onUpdateSpot,
  onRemoveSpot,
  onRequestUploadDesign,
  uploadFeedbackBySpotKey = {},
}: PrintSpotPickerProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted">
          Tambahkan 1 atau lebih titik sablon, atau biarkan 0 titik untuk pesanan polos.
        </p>
        <button
          type="button"
          onClick={onAddSpot}
          className="btn-secondary shrink-0 px-4 py-2 text-xs"
        >
          + Tambah Titik Sablon
        </button>
      </div>

      {spots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-5 text-center">
          <p className="text-sm font-medium text-ink">Belum ada titik sablon (Polos)</p>
          <p className="mt-1 text-xs text-muted">
            Klik &ldquo;+ Tambah Titik Sablon&rdquo; bila ingin menambahkan cetak desain.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {spots.map((spot, index) => {
            const feedback = uploadFeedbackBySpotKey[spot.key];
            const selectedSize = printSizes.find((size) => size.id === spot.printSizeId) ?? null;

            return (
              <article
                key={spot.key}
                className="rounded-2xl border border-line bg-white p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <p className="font-display text-sm font-semibold text-ink">
                      Titik Sablon #<span className="tabular-price">{index + 1}</span>
                    </p>
                    {selectedSize ? (
                      <p className="text-xs text-muted">
                        <span className="tabular-price">
                          +{formatRupiah(selectedSize.pricePerSpot)}
                        </span>{' '}
                        / pcs
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveSpot(spot.key)}
                    className="inline-flex min-h-touch items-center rounded-full border border-line px-3.5 text-xs font-semibold text-status-err transition-colors hover:border-status-err hover:bg-red-50"
                  >
                    Hapus Titik
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`print-pos-${spot.key}`}
                      className="block text-xs font-semibold text-ink"
                    >
                      Posisi Sablon
                    </label>
                    <select
                      id={`print-pos-${spot.key}`}
                      value={spot.printPosition}
                      onChange={(event) =>
                        onUpdateSpot(spot.key, {
                          printPosition: event.target.value as PrintPosition,
                        })
                      }
                      className="input-sharp mt-1.5"
                    >
                      {ORDERED_PRINT_POSITIONS.map((position) => {
                        const isDuplicateBlocked =
                          position !== PRINT_POSITION.OTHER &&
                          spots.some(
                            (other) => other.key !== spot.key && other.printPosition === position
                          );
                        return (
                          <option key={position} value={position} disabled={isDuplicateBlocked}>
                            {PRINT_POSITION_LABELS[position]}
                            {isDuplicateBlocked ? ' (Sudah dipakai)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`print-size-${spot.key}`}
                      className="block text-xs font-semibold text-ink"
                    >
                      Ukuran Sablon *
                    </label>
                    <select
                      id={`print-size-${spot.key}`}
                      value={spot.printSizeId ?? ''}
                      onChange={(event) => {
                        const nextId = event.target.value ? Number(event.target.value) : null;
                        onUpdateSpot(spot.key, { printSizeId: nextId });
                      }}
                      className="input-sharp mt-1.5"
                    >
                      <option value="">Pilih ukuran sablon</option>
                      {printSizes.map((printSize) => (
                        <option key={printSize.id} value={printSize.id}>
                          {printSize.name} ({printSize.dimensionsCm} cm) · +
                          {formatRupiah(printSize.pricePerSpot)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="inline-flex min-h-touch cursor-pointer items-center gap-2.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={spot.needsDesignHelp}
                      onChange={(event) =>
                        onUpdateSpot(spot.key, { needsDesignHelp: event.target.checked })
                      }
                      className="h-4 w-4 accent-ink"
                    />
                    <span>Bantu desainkan saya (Gratis)</span>
                  </label>

                  {!spot.needsDesignHelp ? (
                    <button
                      type="button"
                      onClick={() => onRequestUploadDesign(spot.key)}
                      className="btn-secondary w-full px-4 py-2 text-xs sm:w-auto"
                    >
                      {isGuest ? 'Upload Desain (Masuk Akun)' : 'Upload Desain'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted">
                      Tim desain kami akan menghubungi via WhatsApp.
                    </span>
                  )}
                </div>

                {feedback ? (
                  <p
                    role="status"
                    className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs leading-relaxed text-ink"
                  >
                    {feedback}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
