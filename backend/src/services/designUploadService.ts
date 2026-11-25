import type { DesignUploadResultDto } from '@yng/shared';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { DEFAULT_MAX_DESIGN_FILE_MB, STORAGE_BUCKETS } from '../config/constants.js';
import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as storageService from './storageService.js';

export type AllowedPublicDesignMime =
  'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml' | 'application/pdf';

type DesignExtension = 'png' | 'jpg' | 'webp' | 'svg' | 'pdf';

const BINARY_MIME_TO_EXT: Readonly<
  Record<string, { mime: AllowedPublicDesignMime; ext: DesignExtension }>
> = {
  'image/png': { mime: 'image/png', ext: 'png' },
  'image/jpeg': { mime: 'image/jpeg', ext: 'jpg' },
  'image/webp': { mime: 'image/webp', ext: 'webp' },
  'application/pdf': { mime: 'application/pdf', ext: 'pdf' },
};

const SVG_CONTAINER_REGEX =
  /^(?:\uFEFF)?(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[\s\S]*?>\s*)?<svg[\s>][\s\S]*<\/svg>\s*$/i;
const DANGEROUS_SVG_PATTERNS = [
  /<script\b/i,
  /\bon[a-z]+\s*=/i,
  /javascript\s*:/i,
  /<foreignObject\b/i,
];

function isValidSafeSvg(buffer: Buffer): boolean {
  if (buffer.includes(0)) {
    return false;
  }

  const text = buffer.toString('utf8').trim();
  if (!SVG_CONTAINER_REGEX.test(text)) {
    return false;
  }

  for (const pattern of DANGEROUS_SVG_PATTERNS) {
    if (pattern.test(text)) {
      throw new AppError('File SVG mengandung elemen atau skrip aktif yang tidak diizinkan.', 400);
    }
  }

  return true;
}

/**
 * Membersihkan nama file asli pelanggan agar aman untuk metadata DB dan header unduhan.
 */
export function sanitizeDesignFileName(originalName: string, fallbackExt: DesignExtension): string {
  const baseName = path.basename(String(originalName || '').trim());
  const printableOnly = [...baseName]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  const cleaned = printableOnly
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 120);

  if (!cleaned) {
    return `design.${fallbackExt}`;
  }

  return cleaned;
}

export interface DesignUploadDependencies {
  getMaxDesignFileMb?: () => Promise<number>;
  uploadToStorage?: typeof storageService.upload;
}

async function defaultGetMaxDesignFileMb(): Promise<number> {
  const result = await query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'max_design_file_mb' LIMIT 1`
  );
  const parsed = Number.parseInt(result.rows[0]?.value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_DESIGN_FILE_MB;
}

/**
 * Membuat service upload file desain pelanggan ke bucket privat `designs` (`carts/<user_uuid>/...`).
 */
export function createDesignUploadService(deps: DesignUploadDependencies = {}) {
  const getMaxDesignFileMb = deps.getMaxDesignFileMb ?? defaultGetMaxDesignFileMb;
  const uploadToStorage = deps.uploadToStorage ?? storageService.upload;

  return {
    async uploadCustomerDesign(input: {
      userUuid: string;
      buffer: Buffer;
      originalName: string;
    }): Promise<DesignUploadResultDto> {
      const { userUuid, buffer, originalName } = input;

      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new AppError('File desain tidak boleh kosong.', 400);
      }

      const maxFileMb = await getMaxDesignFileMb();
      const maxBytes = maxFileMb * 1024 * 1024;
      if (buffer.length > maxBytes) {
        throw new AppError(`Ukuran file desain melebihi batas maksimum ${maxFileMb} MB.`, 400);
      }

      const detected = await fileTypeFromBuffer(buffer);
      let mimeType: AllowedPublicDesignMime;
      let ext: DesignExtension;

      if (detected && BINARY_MIME_TO_EXT[detected.mime]) {
        const mapped = BINARY_MIME_TO_EXT[detected.mime];
        mimeType = mapped.mime;
        ext = mapped.ext;
      } else if ((!detected || detected.mime === 'application/xml') && isValidSafeSvg(buffer)) {
        mimeType = 'image/svg+xml';
        ext = 'svg';
      } else {
        throw new AppError(
          'Format file desain tidak didukung. Hanya PNG, JPG, WEBP, SVG, dan PDF asli yang diizinkan.',
          400
        );
      }

      let width: number | null = null;
      let height: number | null = null;

      if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp') {
        try {
          const metadata = await sharp(buffer).metadata();
          if (!metadata.width || !metadata.height || metadata.width <= 0 || metadata.height <= 0) {
            throw new AppError('Dimensi file gambar desain tidak valid.', 400);
          }
          width = metadata.width;
          height = metadata.height;
        } catch (err: unknown) {
          if (err instanceof AppError) {
            throw err;
          }
          throw new AppError('File gambar desain rusak atau gagal dibaca.', 400);
        }
      }

      const randomName = crypto.randomBytes(16).toString('hex');
      const fileRef = `carts/${userUuid}/${randomName}.${ext}`;
      const fileName = sanitizeDesignFileName(originalName, ext);

      await uploadToStorage(STORAGE_BUCKETS.DESIGNS, fileRef, buffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '3600',
      });

      return {
        fileRef,
        fileName,
        mimeType,
        sizeBytes: buffer.length,
        width,
        height,
      };
    },
  };
}

export type DesignUploadService = ReturnType<typeof createDesignUploadService>;

export const designUploadService = createDesignUploadService();

export default designUploadService;
