import { USER_ROLE } from '@yng/shared';
import { Router, type RequestHandler } from 'express';
import {
  createAdminMasterController,
  createFabricBodySchema,
  createFabricColorBodySchema,
  createModelBodySchema,
  createPaymentAccountBodySchema,
  createPrintSizeBodySchema,
  createSizeBodySchema,
  fabricColorParamsSchema,
  idParamSchema,
  listMasterQuerySchema,
  replaceModelFabricsBodySchema,
  updateFabricBodySchema,
  updateFabricColorBodySchema,
  updateModelBodySchema,
  updatePaymentAccountBodySchema,
  updatePrintSizeBodySchema,
  updateSettingsBodySchema,
  updateSizeBodySchema,
  uploadImageBodySchema,
  uploadImageQuerySchema,
} from '../controllers/adminMasterController.js';
import {
  adminOrderUuidParamSchema,
  adminPaymentUuidParamSchema,
  adminQcPhotoParamsSchema,
  cancelOrderBodySchema,
  createAdminOrderController,
  createManualOrderBodySchema,
  listAdminOrdersQuerySchema,
  listAdminPaymentsQuerySchema,
  rejectPaymentBodySchema,
  reviewDesignBodySchema,
  transitionStatusBodySchema,
  updateAddressBodySchema,
  updateDiscountBodySchema,
  updateNotesBodySchema,
  updateShipmentBodySchema,
  updateShippingCostBodySchema,
  verifyPaymentBodySchema,
} from '../controllers/adminOrderController.js';
import {
  createAdminReportController,
  reportBaseQuerySchema,
  reportExportQuerySchema,
} from '../controllers/adminReportController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import {
  catalogImageUploadMiddleware,
  qcPhotosUploadMiddleware,
} from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import type { AdminMasterService } from '../services/adminMasterService.js';
import type { AdminOrderService } from '../services/adminOrderService.js';
import type { AdminReportService } from '../services/adminReportService.js';

export interface AdminRouterOptions {
  requireAuthMiddleware?: RequestHandler;
  masterService?: AdminMasterService;
  adminOrderService?: AdminOrderService;
  adminReportService?: AdminReportService;
  imageUploadLimiter?: RequestHandler;
}

/**
 * Membangun router `/api/admin/*` yang seluruh rutenya diproteksi `requireAuth` + `requireRole('ADMIN')`.
 */
export function createAdminRouter(
  optionsOrRequireAuth: RequestHandler | AdminRouterOptions = {}
): Router {
  const options: AdminRouterOptions =
    typeof optionsOrRequireAuth === 'function'
      ? { requireAuthMiddleware: optionsOrRequireAuth }
      : optionsOrRequireAuth;

  const router = Router();
  const requireAuthMiddleware = options.requireAuthMiddleware ?? requireAuth;
  const imageUploadLimiter = options.imageUploadLimiter ?? uploadLimiter;
  const masterController = createAdminMasterController(options.masterService);
  const adminOrderController = createAdminOrderController(options.adminOrderService);
  const adminReportController = createAdminReportController(options.adminReportService);

  router.use(requireAuthMiddleware, requireRole(USER_ROLE.ADMIN));

  // Upload gambar katalog (bucket catalog)
  router.post(
    '/uploads/image',
    imageUploadLimiter,
    catalogImageUploadMiddleware,
    validate({ body: uploadImageBodySchema, query: uploadImageQuerySchema }),
    masterController.uploadImage
  );

  // Master: Model pakaian & relasi bahan
  router.get('/models', validate({ query: listMasterQuerySchema }), masterController.listModels);
  router.post('/models', validate({ body: createModelBodySchema }), masterController.createModel);
  router.put(
    '/models/:id',
    validate({ params: idParamSchema, body: updateModelBodySchema }),
    masterController.updateModel
  );
  router.delete(
    '/models/:id',
    validate({ params: idParamSchema }),
    masterController.deactivateModel
  );
  router.put(
    '/models/:id/fabrics',
    validate({ params: idParamSchema, body: replaceModelFabricsBodySchema }),
    masterController.replaceModelFabrics
  );

  // Master: Bahan & preset warna per bahan
  router.get('/fabrics', validate({ query: listMasterQuerySchema }), masterController.listFabrics);
  router.post(
    '/fabrics',
    validate({ body: createFabricBodySchema }),
    masterController.createFabric
  );
  router.put(
    '/fabrics/:id',
    validate({ params: idParamSchema, body: updateFabricBodySchema }),
    masterController.updateFabric
  );
  router.delete(
    '/fabrics/:id',
    validate({ params: idParamSchema }),
    masterController.deactivateFabric
  );
  router.get(
    '/fabrics/:id/colors',
    validate({ params: idParamSchema, query: listMasterQuerySchema }),
    masterController.listFabricColors
  );
  router.post(
    '/fabrics/:id/colors',
    validate({ params: idParamSchema, body: createFabricColorBodySchema }),
    masterController.createFabricColor
  );
  router.put(
    '/fabrics/:id/colors/:colorId',
    validate({ params: fabricColorParamsSchema, body: updateFabricColorBodySchema }),
    masterController.updateFabricColor
  );
  router.delete(
    '/fabrics/:id/colors/:colorId',
    validate({ params: fabricColorParamsSchema }),
    masterController.deactivateFabricColor
  );

  // Master: Ukuran
  router.get('/sizes', validate({ query: listMasterQuerySchema }), masterController.listSizes);
  router.post('/sizes', validate({ body: createSizeBodySchema }), masterController.createSize);
  router.put(
    '/sizes/:id',
    validate({ params: idParamSchema, body: updateSizeBodySchema }),
    masterController.updateSize
  );
  router.delete('/sizes/:id', validate({ params: idParamSchema }), masterController.deactivateSize);

  // Master: Ukuran sablon
  router.get(
    '/print-sizes',
    validate({ query: listMasterQuerySchema }),
    masterController.listPrintSizes
  );
  router.post(
    '/print-sizes',
    validate({ body: createPrintSizeBodySchema }),
    masterController.createPrintSize
  );
  router.put(
    '/print-sizes/:id',
    validate({ params: idParamSchema, body: updatePrintSizeBodySchema }),
    masterController.updatePrintSize
  );
  router.delete(
    '/print-sizes/:id',
    validate({ params: idParamSchema }),
    masterController.deactivatePrintSize
  );

  // Master: Rekening pembayaran & QRIS
  router.get(
    '/payment-accounts',
    validate({ query: listMasterQuerySchema }),
    masterController.listPaymentAccounts
  );
  router.post(
    '/payment-accounts',
    validate({ body: createPaymentAccountBodySchema }),
    masterController.createPaymentAccount
  );
  router.put(
    '/payment-accounts/:id',
    validate({ params: idParamSchema, body: updatePaymentAccountBodySchema }),
    masterController.updatePaymentAccount
  );
  router.delete(
    '/payment-accounts/:id',
    validate({ params: idParamSchema }),
    masterController.deactivatePaymentAccount
  );

  // Pengaturan aplikasi
  router.get('/settings', masterController.getSettings);
  router.put(
    '/settings',
    validate({ body: updateSettingsBodySchema }),
    masterController.updateSettings
  );

  // Operasional Order, Kanban, Foto QC, Ongkir/Resi, & SPK PDF
  router.get(
    '/orders',
    validate({ query: listAdminOrdersQuerySchema }),
    adminOrderController.listOrders
  );
  router.get('/orders/kanban', adminOrderController.getKanbanBoard);
  router.get('/orders/board', adminOrderController.getKanbanBoard);
  router.post(
    '/orders/manual',
    validate({ body: createManualOrderBodySchema }),
    adminOrderController.createManualOrder
  );
  router.get(
    '/orders/:uuid',
    validate({ params: adminOrderUuidParamSchema }),
    adminOrderController.getOrderDetail
  );
  router.patch(
    '/orders/:uuid/status',
    validate({ params: adminOrderUuidParamSchema, body: transitionStatusBodySchema }),
    adminOrderController.transitionStatus
  );
  router.put(
    '/orders/:uuid/status',
    validate({ params: adminOrderUuidParamSchema, body: transitionStatusBodySchema }),
    adminOrderController.transitionStatus
  );
  router.patch(
    '/orders/:uuid/design',
    validate({ params: adminOrderUuidParamSchema, body: reviewDesignBodySchema }),
    adminOrderController.reviewDesign
  );
  router.put(
    '/orders/:uuid/design',
    validate({ params: adminOrderUuidParamSchema, body: reviewDesignBodySchema }),
    adminOrderController.reviewDesign
  );
  router.post(
    '/orders/:uuid/cancel',
    validate({ params: adminOrderUuidParamSchema, body: cancelOrderBodySchema }),
    adminOrderController.cancelOrder
  );
  router.put(
    '/orders/:uuid/cancel',
    validate({ params: adminOrderUuidParamSchema, body: cancelOrderBodySchema }),
    adminOrderController.cancelOrder
  );
  router.patch(
    '/orders/:uuid/discount',
    validate({ params: adminOrderUuidParamSchema, body: updateDiscountBodySchema }),
    adminOrderController.updateDiscount
  );
  router.put(
    '/orders/:uuid/discount',
    validate({ params: adminOrderUuidParamSchema, body: updateDiscountBodySchema }),
    adminOrderController.updateDiscount
  );
  router.patch(
    '/orders/:uuid/address',
    validate({ params: adminOrderUuidParamSchema, body: updateAddressBodySchema }),
    adminOrderController.updateAddress
  );
  router.put(
    '/orders/:uuid/address',
    validate({ params: adminOrderUuidParamSchema, body: updateAddressBodySchema }),
    adminOrderController.updateAddress
  );
  router.patch(
    '/orders/:uuid/notes',
    validate({ params: adminOrderUuidParamSchema, body: updateNotesBodySchema }),
    adminOrderController.updateNotes
  );
  router.put(
    '/orders/:uuid/notes',
    validate({ params: adminOrderUuidParamSchema, body: updateNotesBodySchema }),
    adminOrderController.updateNotes
  );
  router.post(
    '/orders/:uuid/qc-photos',
    imageUploadLimiter,
    qcPhotosUploadMiddleware,
    validate({ params: adminOrderUuidParamSchema }),
    adminOrderController.uploadQcPhotos
  );
  router.delete(
    '/orders/:uuid/qc-photos/:photoId',
    validate({ params: adminQcPhotoParamsSchema }),
    adminOrderController.deleteQcPhoto
  );
  router.patch(
    '/orders/:uuid/shipping-cost',
    validate({ params: adminOrderUuidParamSchema, body: updateShippingCostBodySchema }),
    adminOrderController.updateShippingCost
  );
  router.put(
    '/orders/:uuid/shipping-cost',
    validate({ params: adminOrderUuidParamSchema, body: updateShippingCostBodySchema }),
    adminOrderController.updateShippingCost
  );
  router.patch(
    '/orders/:uuid/shipment',
    validate({ params: adminOrderUuidParamSchema, body: updateShipmentBodySchema }),
    adminOrderController.updateShipment
  );
  router.put(
    '/orders/:uuid/shipment',
    validate({ params: adminOrderUuidParamSchema, body: updateShipmentBodySchema }),
    adminOrderController.updateShipment
  );
  router.get(
    '/orders/:uuid/spk',
    validate({ params: adminOrderUuidParamSchema }),
    adminOrderController.downloadSpkPdf
  );

  // Antrean & Verifikasi Pembayaran
  router.get(
    '/payments',
    validate({ query: listAdminPaymentsQuerySchema }),
    adminOrderController.listPayments
  );
  router.patch(
    '/payments/:paymentUuid/verify',
    validate({ params: adminPaymentUuidParamSchema, body: verifyPaymentBodySchema }),
    adminOrderController.verifyOrRejectPayment
  );
  router.put(
    '/payments/:paymentUuid/verify',
    validate({ params: adminPaymentUuidParamSchema, body: verifyPaymentBodySchema }),
    adminOrderController.verifyOrRejectPayment
  );
  router.patch(
    '/payments/:paymentUuid/reject',
    validate({ params: adminPaymentUuidParamSchema, body: rejectPaymentBodySchema }),
    adminOrderController.rejectPayment
  );

  // Dashboard & Laporan + Export CSV (Tahap 6)
  router.get(
    '/dashboard',
    validate({ query: reportBaseQuerySchema }),
    adminReportController.getDashboard
  );
  router.get(
    '/reports/sales',
    validate({ query: reportBaseQuerySchema }),
    adminReportController.getSalesReport
  );
  router.get(
    '/reports/orders',
    validate({ query: reportBaseQuerySchema }),
    adminReportController.getOrdersReport
  );
  router.get(
    '/reports/top-models',
    validate({ query: reportBaseQuerySchema }),
    adminReportController.getTopModelsReport
  );
  router.get(
    '/reports/customers',
    validate({ query: reportBaseQuerySchema }),
    adminReportController.getTopCustomersReport
  );
  router.get(
    '/reports/export',
    validate({ query: reportExportQuerySchema }),
    adminReportController.exportCsv
  );
  router.get(
    '/reports/csv',
    validate({ query: reportExportQuerySchema }),
    adminReportController.exportCsv
  );

  return router;
}

export default createAdminRouter();
