import type { CatalogImageFolder } from '@yng/shared';
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { CATALOG_IMAGE_MAX_BYTES, CATALOG_IMAGE_MAX_DIMENSION } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';

export type AllowedCatalogImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ProcessedCatalogImage {
  buffer: Buffer;
  path: string;
  mimeType: AllowedCatalogImageMime;
  sizeBytes: number;
}

const MIME_TO_EXT: Readonly<Record<AllowedCatalogImageMime, 'jpg' | 'png' | 'webp'>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isAllowedCatalogMime(mime: string | undefined): mime is AllowedCatalogImageMime {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
}

/**
 * Memvalidasi magic bytes gambar katalog, membuang EXIF via re-encode Sharp,
 * mempertahankan format asli tanpa konversi lossy, dan hanya mengecilkan dimensi bila > 2000px.
 */
export async function processCatalogImage(
  inputBuffer: Buffer,
  folder: CatalogImageFolder
): Promise<ProcessedCatalogImage> {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new AppError('File gambar tidak boleh kosong.', 400);
  }

  if (inputBuffer.length > CATALOG_IMAGE_MAX_BYTES) {
    throw new AppError('Ukuran file gambar melebihi batas maksimum 5 MB.', 400);
  }

  const detected = await fileTypeFromBuffer(inputBuffer);
  if (!detected || !isAllowedCatalogMime(detected.mime)) {
    throw new AppError(
      'Format file gambar tidak didukung. Hanya JPEG, PNG, dan WebP asli yang diizinkan.',
      400
    );
  }

  const mimeType = detected.mime;
  const ext = MIME_TO_EXT[mimeType];

  try {
    const metadata = await sharp(inputBuffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width <= 0 || height <= 0) {
      throw new AppError('Dimensi file gambar tidak valid.', 400);
    }

    // .rotate() menormalkan orientasi sebelum re-encode; tanpa .withMetadata() EXIF/IPTC/XMP dibuang otomatis.
    let pipeline = sharp(inputBuffer).rotate();

    const maxSide = Math.max(width, height);
    if (maxSide > CATALOG_IMAGE_MAX_DIMENSION) {
      pipeline = pipeline.resize({
        width: CATALOG_IMAGE_MAX_DIMENSION,
        height: CATALOG_IMAGE_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    if (mimeType === 'image/png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (mimeType === 'image/webp') {
      pipeline = pipeline.webp({ lossless: true });
    } else {
      pipeline = pipeline.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
    }

    const outputBuffer = await pipeline.toBuffer();
    const randomName = crypto.randomBytes(16).toString('hex');

    return {
      buffer: outputBuffer,
      path: `${folder}/${randomName}.${ext}`,
      mimeType,
      sizeBytes: outputBuffer.length,
    };
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError('File gambar rusak atau gagal diproses.', 400);
  }
}
