import type { PublicFabricColorDto } from '@yng/shared';
import { useLanguage } from '../../context/LanguageContext';

interface ColorPickerProps {
  colors: readonly PublicFabricColorDto[];
  selectedColorId: number | null;
  isCustomColor: boolean;
  customColorName: string;
  customColorHex: string;
  onSelectPresetColor: (colorId: number) => void;
  onSelectCustomColor: () => void;
  onChangeCustomColorName: (value: string) => void;
  onChangeCustomColorHex: (value: string) => void;
  disabled?: boolean;
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function ColorPicker({
  colors,
  selectedColorId,
  isCustomColor,
  customColorName,
  customColorHex,
  onSelectPresetColor,
  onSelectCustomColor,
  onChangeCustomColorName,
  onChangeCustomColorHex,
  disabled = false,
}: ColorPickerProps) {
  const { pick } = useLanguage();
  const trimmedHex = customColorHex.trim();
  const isHexInvalid = trimmedHex.length > 0 && !HEX_COLOR_REGEX.test(trimmedHex);

  if (disabled) {
    return (
      <div className="rounded-sm border border-dashed border-line-strong bg-[#FAFAFA] p-4 text-sm text-muted">
        {pick(
          'Pilih bahan terlebih dahulu untuk menampilkan preset warna yang tersedia.',
          'Select a fabric first to view available preset colors.'
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2.5">
        {colors.map((color) => {
          const isSelected = !isCustomColor && selectedColorId === color.id;
          return (
            <button
              key={color.id}
              type="button"
              onClick={() => onSelectPresetColor(color.id)}
              aria-pressed={isSelected}
              className={`inline-flex min-h-touch max-w-full flex-wrap items-center gap-2 rounded-sm border px-3.5 py-2 text-left transition-colors sm:rounded-sm ${
                isSelected
                  ? 'border-ink bg-ink text-white'
                  : 'border-line-strong bg-white text-ink hover:border-ink hover:bg-[#FAFAFA]'
              }`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border border-neutral-300"
                style={{ backgroundColor: color.colorHex }}
                aria-hidden="true"
              />
              <span className="text-xs font-semibold sm:text-sm">{color.colorName}</span>
              <span
                className={`font-mono text-[11px] ${
                  isSelected ? 'text-neutral-300' : 'text-muted'
                }`}
              >
                {color.colorHex}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onSelectCustomColor}
          aria-pressed={isCustomColor}
          className={`inline-flex min-h-touch max-w-full items-center gap-2 rounded-sm border px-4 py-2 text-left text-xs font-semibold transition-colors sm:rounded-sm sm:text-sm ${
            isCustomColor
              ? 'border-ink bg-ink text-white'
              : 'border-line-strong bg-[#FAFAFA] text-ink hover:border-ink'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-2.5 w-2.5 rounded-full border ${
              isCustomColor ? 'border-white bg-white' : 'border-ink bg-transparent'
            }`}
          />
          {pick('Warna custom (konfirmasi via WhatsApp)', 'Custom color (confirm via WhatsApp)')}
        </button>
      </div>

      {colors.length === 0 && !isCustomColor ? (
        <p className="text-xs text-muted">
          {pick(
            'Belum ada preset warna pada bahan ini. Anda dapat memilih opsi warna custom di atas.',
            'No preset colors available for this fabric yet. You can choose the custom color option above.'
          )}
        </p>
      ) : null}

      {isCustomColor ? (
        <div className="space-y-4 rounded-sm border border-line bg-[#FAFAFA] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="custom-color-name" className="block text-xs font-semibold text-ink">
                {pick('Nama Warna Custom *', 'Custom Color Name *')}
              </label>
              <input
                id="custom-color-name"
                type="text"
                maxLength={50}
                value={customColorName}
                onChange={(event) => onChangeCustomColorName(event.target.value)}
                placeholder={pick(
                  'Contoh: Hijau Sage / Dusty Pink',
                  'Example: Sage Green / Dusty Pink'
                )}
                className="input-sharp mt-1.5"
              />
              {customColorName.trim().length === 0 ? (
                <p className="mt-1 text-xs text-muted">
                  {pick(
                    'Wajib diisi agar warna dapat dikonfirmasi.',
                    'Required so the color can be confirmed.'
                  )}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="custom-color-hex" className="block text-xs font-semibold text-ink">
                {pick('Kode Warna Hex (Opsional)', 'Hex Color Code (Optional)')}
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-sm border border-line-strong bg-white"
                  style={
                    HEX_COLOR_REGEX.test(trimmedHex) ? { backgroundColor: trimmedHex } : undefined
                  }
                />
                <input
                  id="custom-color-hex"
                  type="text"
                  maxLength={7}
                  value={customColorHex}
                  onChange={(event) => onChangeCustomColorHex(event.target.value)}
                  placeholder="#9CAF88"
                  className={`input-sharp font-mono uppercase ${
                    isHexInvalid ? 'border-status-err focus:border-status-err' : ''
                  }`}
                />
              </div>
              {isHexInvalid ? (
                <p role="alert" className="mt-1 text-xs text-status-err">
                  {pick(
                    'Format kode warna harus #RRGGBB (contoh: #9CAF88).',
                    'Color code format must be #RRGGBB (e.g. #9CAF88).'
                  )}
                </p>
              ) : null}
            </div>
          </div>

          <p className="rounded-sm border border-line bg-white px-3.5 py-2.5 text-xs leading-relaxed text-muted">
            {pick(
              'Ketersediaan stok bahan untuk warna custom akan dikonfirmasi oleh admin melalui WhatsApp sebelum pesanan masuk proses cetak.',
              'Fabric stock availability for custom colors will be confirmed by admin via WhatsApp before printing starts.'
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
