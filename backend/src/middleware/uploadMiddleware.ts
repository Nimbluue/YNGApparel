import type { RequestHandler } from 'express';
import multer from 'multer';
import { CATALOG_IMAGE_MAX_BYTES, DESIGN_UPLOAD_HARD_LIMIT_BYTES } from '../config/constants.js';

// Backend bersifat stateless: upload diproses penuh di memoryStorage, tidak pernah menulis ke disk.
const catalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CATALOG_IMAGE_MAX_BYTES,
    files: 1,
  },
});

const designUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: DESIGN_UPLOAD_HARD_LIMIT_BYTES,
    files: 1,
  },
});

const paymentProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CATALOG_IMAGE_MAX_BYTES,
    files: 1,
  },
});

export const catalogImageUploadMiddleware: RequestHandler = catalogUpload.single('image');
export const designFileUploadMiddleware: RequestHandler = designUpload.single('file');
export const paymentProofUploadMiddleware: RequestHandler = paymentProofUpload.single('file');
