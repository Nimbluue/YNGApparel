import type { PublicFabricColorDto } from '@yng/shared';

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
  const trimmedHex = customColorHex.trim();
  const isHexInvalid = trimmedHex.length > 0 && !HEX_COLOR_REGEX.test(trimmedHex);

  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-4 text-sm text-muted">
        Pilih bahan terlebih dahulu untuk menampilkan preset warna yang tersedia.
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
              className={`inline-flex min-h-touch max-w-full flex-wrap items-center gap-2 rounded-2xl border px-3.5 py-2 text-left transition-colors sm:rounded-full ${
                isSelected
                  ? 'border-ink bg-ink text-white'
                  : 'border-line-strong bg-white text-ink hover:border-ink hover:bg-surface'
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
          className={`inline-flex min-h-touch max-w-full items-center gap-2 rounded-2xl border px-4 py-2 text-left text-xs font-semibold transition-colors sm:rounded-full sm:text-sm ${
            isCustomColor
              ? 'border-ink bg-ink text-white'
              : 'border-line-strong bg-surface text-ink hover:border-ink'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-2.5 w-2.5 rounded-full border ${
              isCustomColor ? 'border-white bg-white' : 'border-ink bg-transparent'
            }`}
          />
          Warna custom (konfirmasi via WhatsApp)
        </button>
      </div>

      {colors.length === 0 && !isCustomColor ? (
        <p className="text-xs text-muted">
          Belum ada preset warna pada bahan ini. Anda dapat memilih opsi warna custom di atas.
        </p>
      ) : null}

      {isCustomColor ? (
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="custom-color-name" className="block text-xs font-semibold text-ink">
                Nama Warna Custom *
              </label>
              <input
                id="custom-color-name"
                type="text"
                maxLength={50}
                value={customColorName}
                onChange={(event) => onChangeCustomColorName(event.target.value)}
                placeholder="Contoh: Hijau Sage / Dusty Pink"
                className="input-sharp mt-1.5"
              />
              {customColorName.trim().length === 0 ? (
                <p className="mt-1 text-xs text-muted">
                  Wajib diisi agar warna dapat dikonfirmasi.
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="custom-color-hex" className="block text-xs font-semibold text-ink">
                Kode Warna Hex (Opsional)
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-xl border border-line-strong bg-white"
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
                  Format kode warna harus #RRGGBB (contoh: #9CAF88).
                </p>
              ) : null}
            </div>
          </div>

          <p className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs leading-relaxed text-muted">
            Ketersediaan stok bahan untuk warna custom akan dikonfirmasi oleh admin melalui WhatsApp
            sebelum pesanan masuk proses cetak.
          </p>
        </div>
      ) : null}
    </div>
  );
}
