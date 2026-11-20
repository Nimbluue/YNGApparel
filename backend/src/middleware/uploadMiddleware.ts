import type { RequestHandler } from 'express';
import multer from 'multer';
import { CATALOG_IMAGE_MAX_BYTES } from '../config/constants.js';

// Backend bersifat stateless: upload diproses penuh di memoryStorage, tidak pernah menulis ke disk.
const catalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CATALOG_IMAGE_MAX_BYTES,
    files: 1,
  },
});

export const catalogImageUploadMiddleware: RequestHandler = catalogUpload.single('image');
