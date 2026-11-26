import { PRINT_POSITION, type PrintPosition, type PublicPrintSizeDto } from '@yng/shared';
import { useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatRupiah } from '../../utils/formatRupiah';
import { getLocalizedPrintPositionLabel } from '../../utils/localizedLabels';
import { ORDERED_PRINT_POSITIONS, type PrintSpotDraft } from './printSpotHelpers';

const ACCEPTED_DESIGN_INPUT =
  '.png,.jpg,.jpeg,.webp,.svg,.pdf,image/png,image/jpeg,image/webp,image/svg+xml,application/pdf';

interface PrintSpotPickerProps {
  spots: readonly PrintSpotDraft[];
  printSizes: readonly PublicPrintSizeDto[];
  isGuest: boolean;
  maxDesignFileMb: number;
  uploadingSpotKey: string | null;
  onAddSpot: () => void;
  onUpdateSpot: (key: string, patch: Partial<Omit<PrintSpotDraft, 'key'>>) => void;
  onRemoveSpot: (key: string) => void;
  onRequestLoginForUpload: () => void;
  onSelectDesignFile: (spotKey: string, file: File) => void;
  uploadFeedbackBySpotKey?: Readonly<Record<string, string>>;
}

export function PrintSpotPicker({
  spots,
  printSizes,
  isGuest,
  maxDesignFileMb,
  uploadingSpotKey,
  onAddSpot,
  onUpdateSpot,
  onRemoveSpot,
  onRequestLoginForUpload,
  onSelectDesignFile,
  uploadFeedbackBySpotKey = {},
}: PrintSpotPickerProps) {
  const { locale, pick } = useLanguage();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted">
          {pick(
            <>
              Tambahkan 1 atau lebih titik sablon, atau biarkan 0 titik untuk pesanan polos. Format
              desain: PNG, JPG, WEBP, SVG, PDF (maks.{' '}
              <span className="tabular-price">{maxDesignFileMb} MB</span>).
            </>,
            <>
              Add 1 or more print placements, or leave 0 spots for a blank garment. Accepted
              formats: PNG, JPG, WEBP, SVG, PDF (max{' '}
              <span className="tabular-price">{maxDesignFileMb} MB</span>).
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onAddSpot}
          className="btn-secondary shrink-0 px-4 py-2 text-xs"
        >
          {pick('+ Tambah Titik Sablon', '+ Add Print Spot')}
        </button>
      </div>

      {spots.length === 0 ? (
        <div className="rounded-sm border border-dashed border-line-strong bg-[#FAFAFA] p-5 text-center">
          <p className="text-sm font-medium text-ink">
            {pick('Belum ada titik sablon (Polos)', 'No print spots added (Plain)')}
          </p>
          <p className="mt-1 text-xs text-muted">
            {pick(
              'Klik “+ Tambah Titik Sablon” bila ingin menambahkan cetak desain.',
              'Click “+ Add Print Spot” if you want to add graphic prints.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {spots.map((spot, index) => {
            const feedback = uploadFeedbackBySpotKey[spot.key];
            const selectedSize = printSizes.find((size) => size.id === spot.printSizeId) ?? null;
            const isUploading = uploadingSpotKey === spot.key;

            return (
              <article key={spot.key} className="rounded-sm border border-line bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <p className="font-display text-sm font-semibold text-ink">
                      {pick('Titik Sablon #', 'Print Spot #')}
                      <span className="tabular-price">{index + 1}</span>
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
                    className="inline-flex min-h-touch items-center rounded-sm border border-line px-3.5 text-xs font-semibold text-status-err transition-colors hover:border-status-err hover:bg-red-50"
                  >
                    {pick('Hapus Titik', 'Remove Spot')}
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`print-pos-${spot.key}`}
                      className="block text-xs font-semibold text-ink"
                    >
                      {pick('Posisi Sablon', 'Print Placement')}
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
                            {getLocalizedPrintPositionLabel(position, locale)}
                            {isDuplicateBlocked ? pick(' (Sudah dipakai)', ' (Already used)') : ''}
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
                      {pick('Ukuran Sablon *', 'Print Size *')}
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
                      <option value="">{pick('Pilih ukuran sablon', 'Select print size')}</option>
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
                      onChange={(event) => {
                        const checked = event.target.checked;
                        onUpdateSpot(spot.key, {
                          needsDesignHelp: checked,
                          ...(checked
                            ? { fileRef: null, fileName: null, width: null, height: null }
                            : {}),
                        });
                      }}
                      className="h-4 w-4 accent-ink"
                    />
                    <span>{pick('Bantu desainkan saya (Gratis)', 'Request free design help')}</span>
                  </label>

                  {!spot.needsDesignHelp ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={(el) => {
                          fileInputRefs.current[spot.key] = el;
                        }}
                        type="file"
                        accept={ACCEPTED_DESIGN_INPUT}
                        className="sr-only"
                        aria-label={pick(
                          `Pilih file desain titik sablon ${index + 1}`,
                          `Choose design file for print spot ${index + 1}`
                        )}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) {
                            onSelectDesignFile(spot.key, file);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => {
                          if (isGuest) {
                            onRequestLoginForUpload();
                            return;
                          }
                          fileInputRefs.current[spot.key]?.click();
                        }}
                        className="btn-secondary w-full px-4 py-2 text-xs sm:w-auto"
                      >
                        {isUploading
                          ? pick('Mengunggah...', 'Uploading...')
                          : isGuest
                            ? pick('Upload Desain (Masuk Akun)', 'Upload Design (Sign In)')
                            : spot.fileRef
                              ? pick('Ganti File Desain', 'Replace Design File')
                              : pick('Upload Desain', 'Upload Design')}
                      </button>

                      {spot.fileRef ? (
                        <button
                          type="button"
                          disabled={isUploading}
                          onClick={() =>
                            onUpdateSpot(spot.key, {
                              fileRef: null,
                              fileName: null,
                              width: null,
                              height: null,
                            })
                          }
                          className="inline-flex min-h-touch items-center rounded-sm border border-line px-3.5 text-xs font-medium text-muted transition-colors hover:border-ink hover:text-ink"
                        >
                          {pick('Hapus File', 'Remove File')}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">
                      {pick(
                        'Tim desain kami akan menghubungi via WhatsApp (tanpa wajib unggah file).',
                        'Our design team will reach out via WhatsApp (no file upload required).'
                      )}
                    </span>
                  )}
                </div>

                {!spot.needsDesignHelp && spot.fileRef && spot.fileName ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-[#FAFAFA] px-3.5 py-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        {pick('File:', 'File:')} {spot.fileName}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted">
                        {spot.width && spot.height
                          ? `${spot.width}×${spot.height} px · ${pick('Terverifikasi', 'Verified')}`
                          : pick('Siap cetak · Terverifikasi', 'Print ready · Verified')}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-status-ok">
                      {pick('Terunggah', 'Uploaded')}
                    </span>
                  </div>
                ) : null}

                {feedback ? (
                  <p
                    role="status"
                    className="mt-3 rounded-sm border border-line bg-[#FAFAFA] px-3.5 py-2.5 text-xs leading-relaxed text-ink"
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
