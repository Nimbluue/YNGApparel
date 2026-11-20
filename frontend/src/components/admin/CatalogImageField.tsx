import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { uploadCatalogImage } from '../../services/adminMasterService';
import { extractApiError } from '../../utils/apiError';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface CatalogImageFieldProps {
  id: string;
  label: string;
  folder: 'models' | 'fabrics' | 'qris';
  pathValue: string | null;
  existingUrl: string | null;
  onChange: (nextPath: string | null, nextPreviewUrl: string | null) => void;
  disabled?: boolean;
  helperText?: string;
}

interface LocalPreviewState {
  path: string;
  url: string;
}

export default function CatalogImageField({
  id,
  label,
  folder,
  pathValue,
  existingUrl,
  onChange,
  disabled = false,
  helperText,
}: CatalogImageFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<LocalPreviewState | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview?.url) {
        URL.revokeObjectURL(localPreview.url);
      }
    };
  }, [localPreview]);

  const effectivePreviewUrl =
    localPreview && pathValue && localPreview.path === pathValue ? localPreview.url : existingUrl;

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setUploadError(null);

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setUploadError('Format file harus JPEG, PNG, atau WebP.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError('Ukuran file gambar maksimal 5 MB.');
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadCatalogImage(file, folder);
      const previewUrl = URL.createObjectURL(file);
      setLocalPreview({ path: uploaded.path, url: previewUrl });
      onChange(uploaded.path, previewUrl);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengunggah gambar.');
      setUploadError(parsed.message);
    } finally {
      setUploading(false);
    }
  }

  function handleClear() {
    setUploadError(null);
    setLocalPreview(null);
    onChange(null, null);
  }

  return (
    <div className="space-y-2 border border-line bg-bone p-3.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
        >
          {label}
        </label>
        <span className="font-mono text-[11px] uppercase text-muted">
          JPG / PNG / WEBP · MAKS 5 MB
        </span>
      </div>

      {helperText ? <p className="text-xs text-neutral-600">{helperText}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center border border-line-strong bg-surface">
          {effectivePreviewUrl ? (
            <img src={effectivePreviewUrl} alt={label} className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center font-mono text-[10px] uppercase text-muted">
              Belum Ada Gambar
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void handleFileSelect(event)}
            className="sr-only"
            disabled={disabled || uploading}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              className="btn-secondary px-4 py-2"
            >
              {uploading ? 'Mengunggah...' : pathValue ? 'Ganti Gambar' : 'Unggah Gambar'}
            </button>

            {pathValue ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled || uploading}
                className="inline-flex min-h-touch items-center justify-center border border-status-err px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-status-err transition-colors hover:bg-status-err hover:text-bone disabled:opacity-40"
              >
                Hapus Gambar
              </button>
            ) : null}
          </div>

          {pathValue ? (
            <p className="break-all font-mono text-[11px] text-neutral-600">Path: {pathValue}</p>
          ) : (
            <p className="font-mono text-[11px] text-muted">Path objek belum diisi.</p>
          )}
        </div>
      </div>

      {uploadError ? (
        <p role="alert" className="text-xs font-medium text-status-err">
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}
