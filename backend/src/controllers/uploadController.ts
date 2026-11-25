import type { DesignUploadResultDto } from '@yng/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import defaultDesignUploadService, {
  type DesignUploadService,
} from '../services/designUploadService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

/**
 * Membangun controller upload file desain pelanggan ke bucket privat `designs`.
 */
export function createUploadController(service: DesignUploadService = defaultDesignUploadService): {
  uploadDesign: RequestHandler;
} {
  return {
    uploadDesign: asyncHandler(async (req, res) => {
      if (!req.user) {
        throw new AppError('Silakan login terlebih dahulu.', 401);
      }

      if (!req.file) {
        throw new AppError('File desain wajib diunggah pada field "file".', 400);
      }

      const uploaded = await service.uploadCustomerDesign({
        userUuid: req.user.userUuid,
        buffer: req.file.buffer,
        originalName: req.file.originalname,
      });

      return sendSuccess<DesignUploadResultDto>(res, {
        status: 201,
        message: 'File desain berhasil diunggah.',
        data: uploaded,
      });
    }),
  };
}
