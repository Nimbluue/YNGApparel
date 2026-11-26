import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { uploadCatalogImage } from '../../services/adminMasterService';
import { extractApiError } from '../../utils/apiError';
import { IconTooltip } from '../ui/IconTooltip';

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

  const uploadTooltipLabel = uploading
    ? 'Mengunggah gambar...'
    : pathValue
      ? 'Ganti Gambar'
      : 'Unggah Gambar';

  return (
    <div className="space-y-2 rounded-sm border border-line bg-[#FAFAFA] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <span className="text-xs text-muted">JPG / PNG / WebP · Maks 5 MB</span>
      </div>

      {helperText ? <p className="text-xs text-neutral-600">{helperText}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line-strong bg-white">
          {effectivePreviewUrl ? (
            <img src={effectivePreviewUrl} alt={label} className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-muted">Belum ada gambar</span>
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

          <div className="flex flex-wrap items-center gap-2">
            <IconTooltip
              label={uploadTooltipLabel}
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className="h-11 w-11 border border-neutral-300 bg-white hover:border-ink"
            >
              {uploading ? (
                <Loader2 size={18} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
              ) : (
                <ImagePlus size={18} strokeWidth={1.5} aria-hidden="true" />
              )}
            </IconTooltip>

            {pathValue ? (
              <IconTooltip
                label="Hapus Gambar"
                disabled={disabled || uploading}
                onClick={handleClear}
                className="h-11 w-11 border border-line bg-white text-muted hover:border-[#DC2626] hover:bg-red-50/40 hover:text-[#DC2626]"
              >
                <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
              </IconTooltip>
            ) : null}
          </div>

          {pathValue ? (
            <p className="break-all text-xs text-muted">
              Path: <span className="font-mono text-ink">{pathValue}</span>
            </p>
          ) : (
            <p className="text-xs text-muted">Path objek belum diisi.</p>
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
