import {
  DESIGN_STATUS,
  FULFILLMENT_TYPE,
  PAYMENT_SCHEME,
  PAYMENT_STAGE,
  PAYMENT_STATUS,
  PRODUCTION_STATUS,
  getProductionStatusLabel,
  type AdminOrderDetailDto,
  type ProductionStatus,
} from '@yng/shared';
import { formatRupiah } from '../../utils/formatRupiah';

export interface NextStatusOption {
  toStatus: ProductionStatus;
  label: string;
  enabled: boolean;
  blockedReasons: string[];
}

/**
 * Menghitung daftar status produksi tujuan yang sah sesuai mesin status di SPEC 6.3
 * beserta alasan pemblokiran jika prasyarat operasional belum terpenuhi.
 */
export function getValidNextStatuses(order: AdminOrderDetailDto): NextStatusOption[] {
  const from = order.productionStatus;

  if (from === PRODUCTION_STATUS.NEW_ORDER) {
    const blockedReasons: string[] = [];
    if (order.designStatus !== DESIGN_STATUS.APPROVED) {
      blockedReasons.push('Desain harus berstatus DISETUJUI terlebih dahulu.');
    }
    const expectedStage =
      order.paymentScheme === PAYMENT_SCHEME.DP ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
    const initialPayment = order.payments.find((p) => p.paymentStage === expectedStage);
    if (!initialPayment || initialPayment.status !== PAYMENT_STATUS.VERIFIED) {
      blockedReasons.push('Pembayaran awal harus berstatus TERVERIFIKASI.');
    }

    return [
      {
        toStatus: PRODUCTION_STATUS.PRINT_QUEUE,
        label: getProductionStatusLabel(PRODUCTION_STATUS.PRINT_QUEUE, order.fulfillmentType),
        enabled: blockedReasons.length === 0,
        blockedReasons,
      },
    ];
  }

  if (from === PRODUCTION_STATUS.PRINT_QUEUE) {
    return [
      {
        toStatus: PRODUCTION_STATUS.PRESSING_QC,
        label: getProductionStatusLabel(PRODUCTION_STATUS.PRESSING_QC, order.fulfillmentType),
        enabled: true,
        blockedReasons: [],
      },
    ];
  }

  if (from === PRODUCTION_STATUS.PRESSING_QC) {
    if (order.remainingBalance > 0) {
      const blockedReasons: string[] = [];
      if (order.qcPhotos.length < 1) {
        blockedReasons.push('Unggah minimal 1 foto hasil QC terlebih dahulu.');
      }
      return [
        {
          toStatus: PRODUCTION_STATUS.AWAITING_SETTLEMENT,
          label: getProductionStatusLabel(
            PRODUCTION_STATUS.AWAITING_SETTLEMENT,
            order.fulfillmentType
          ),
          enabled: blockedReasons.length === 0,
          blockedReasons,
        },
      ];
    }

    const blockedReasons: string[] = [];
    if (order.qcPhotos.length < 1) {
      blockedReasons.push('Unggah minimal 1 foto hasil QC terlebih dahulu.');
    }
    if (order.fulfillmentType === FULFILLMENT_TYPE.SHIP) {
      if (order.addressIncomplete) {
        blockedReasons.push('Alamat pengiriman lengkap wajib diisi terlebih dahulu.');
      }
      if (!order.shippingCourier?.trim() || !order.trackingReceiptNumber?.trim()) {
        blockedReasons.push('Kurir dan nomor resi wajib diisi terlebih dahulu.');
      }
    }
    return [
      {
        toStatus: PRODUCTION_STATUS.SHIPPING,
        label: getProductionStatusLabel(PRODUCTION_STATUS.SHIPPING, order.fulfillmentType),
        enabled: blockedReasons.length === 0,
        blockedReasons,
      },
    ];
  }

  if (from === PRODUCTION_STATUS.AWAITING_SETTLEMENT) {
    const blockedReasons: string[] = [];
    if (order.remainingBalance > 0) {
      blockedReasons.push('Sisa tagihan pesanan harus lunas (Rp0) sebelum pengiriman.');
    }
    if (order.fulfillmentType === FULFILLMENT_TYPE.SHIP) {
      if (order.addressIncomplete) {
        blockedReasons.push('Alamat pengiriman lengkap wajib diisi terlebih dahulu.');
      }
      if (!order.shippingCourier?.trim() || !order.trackingReceiptNumber?.trim()) {
        blockedReasons.push('Kurir dan nomor resi wajib diisi terlebih dahulu.');
      }
    }
    return [
      {
        toStatus: PRODUCTION_STATUS.SHIPPING,
        label: getProductionStatusLabel(PRODUCTION_STATUS.SHIPPING, order.fulfillmentType),
        enabled: blockedReasons.length === 0,
        blockedReasons,
      },
    ];
  }

  if (from === PRODUCTION_STATUS.SHIPPING) {
    const blockedReasons: string[] = [];
    if (order.remainingBalance > 0) {
      blockedReasons.push('Sisa tagihan pesanan masih belum lunas.');
    }
    return [
      {
        toStatus: PRODUCTION_STATUS.COMPLETED,
        label: getProductionStatusLabel(PRODUCTION_STATUS.COMPLETED, order.fulfillmentType),
        enabled: blockedReasons.length === 0,
        blockedReasons,
      },
    ];
  }

  return [];
}

export interface OrderChecklistItem {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
}

export interface OrderNextStepGuide {
  stageHeading: string;
  summary: string;
  checklist: OrderChecklistItem[];
  primaryAction: {
    toStatus: ProductionStatus;
    label: string;
    enabled: boolean;
  } | null;
}

/**
 * Menghasilkan panduan "Langkah Selanjutnya" (checklist syarat tahap saat ini + CTA utama)
 * agar admin tidak perlu menebak syarat perpindahan tahap produksi.
 */
export function getOrderNextStepGuide(order: AdminOrderDetailDto): OrderNextStepGuide {
  const from = order.productionStatus;
  const stageHeading = getProductionStatusLabel(from, order.fulfillmentType);

  if (from === PRODUCTION_STATUS.NEW_ORDER) {
    const expectedStage =
      order.paymentScheme === PAYMENT_SCHEME.DP ? PAYMENT_STAGE.DP : PAYMENT_STAGE.FULL;
    const initialPayment = order.payments.find((p) => p.paymentStage === expectedStage);
    const paymentVerified = initialPayment?.status === PAYMENT_STATUS.VERIFIED;
    const designApproved = order.designStatus === DESIGN_STATUS.APPROVED;

    return {
      stageHeading,
      summary: 'Verifikasi pembayaran awal dan setujui desain sebelum masuk antrean cetak sablon.',
      checklist: [
        {
          id: 'verify-initial-payment',
          label: `Verifikasi pembayaran awal (${order.paymentScheme === PAYMENT_SCHEME.DP ? 'DP' : 'Lunas'})`,
          done: paymentVerified,
          required: true,
        },
        {
          id: 'approve-design',
          label: 'Setujui file desain produksi',
          done: designApproved,
          required: true,
        },
      ],
      primaryAction: {
        toStatus: PRODUCTION_STATUS.PRINT_QUEUE,
        label: 'Lanjut ke Antrean Cetak Sablon',
        enabled: paymentVerified && designApproved,
      },
    };
  }

  if (from === PRODUCTION_STATUS.PRINT_QUEUE) {
    return {
      stageHeading,
      summary:
        'Unduh SPK PDF untuk tim sablon, lalu lanjutkan ke Pressing & QC setelah cetak selesai.',
      checklist: [
        {
          id: 'download-spk',
          label: 'Unduh / cetak SPK PDF untuk operator workshop (opsional)',
          done: false,
          required: false,
        },
        {
          id: 'finish-print',
          label: 'Proses cetak sablon selesai dikerjakan',
          done: true,
          required: false,
        },
      ],
      primaryAction: {
        toStatus: PRODUCTION_STATUS.PRESSING_QC,
        label: 'Lanjut ke Pressing & QC',
        enabled: true,
      },
    };
  }

  if (from === PRODUCTION_STATUS.PRESSING_QC) {
    const hasQcPhoto = order.qcPhotos.length >= 1;
    const shippingChecked =
      order.fulfillmentType === FULFILLMENT_TYPE.PICKUP || order.shippingCost > 0;

    if (order.remainingBalance > 0) {
      return {
        stageHeading,
        summary:
          'Unggah minimal 1 foto hasil QC dan cek/input ongkos kirim sebelum menagih pelunasan pelanggan.',
        checklist: [
          {
            id: 'upload-qc',
            label: 'Unggah minimal 1 foto hasil QC',
            done: hasQcPhoto,
            required: true,
          },
          {
            id: 'check-shipping',
            label:
              order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
                ? 'Pesanan ambil di workshop (tanpa ongkir)'
                : 'Cek & input ongkos kirim aktual (jika belum)',
            done: shippingChecked,
            required: false,
          },
        ],
        primaryAction: {
          toStatus: PRODUCTION_STATUS.AWAITING_SETTLEMENT,
          label: 'Lanjut ke Menunggu Pelunasan',
          enabled: hasQcPhoto,
        },
      };
    }

    const addressReady =
      order.fulfillmentType === FULFILLMENT_TYPE.PICKUP || !order.addressIncomplete;
    const shipmentReady =
      order.fulfillmentType === FULFILLMENT_TYPE.PICKUP ||
      Boolean(order.shippingCourier?.trim() && order.trackingReceiptNumber?.trim());

    const checklist: OrderChecklistItem[] = [
      {
        id: 'upload-qc',
        label: 'Unggah minimal 1 foto hasil QC',
        done: hasQcPhoto,
        required: true,
      },
    ];
    if (order.fulfillmentType === FULFILLMENT_TYPE.SHIP) {
      checklist.push(
        {
          id: 'check-address',
          label: 'Pastikan alamat pengiriman lengkap',
          done: addressReady,
          required: true,
        },
        {
          id: 'input-shipment',
          label: 'Input kurir resmi & nomor resi',
          done: shipmentReady,
          required: true,
        }
      );
    }

    return {
      stageHeading,
      summary:
        order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
          ? 'Unggah foto QC untuk menandai pesanan siap diambil di workshop.'
          : 'Unggah foto QC serta lengkapi kurir & resi sebelum diserahkan ke pengiriman.',
      checklist,
      primaryAction: {
        toStatus: PRODUCTION_STATUS.SHIPPING,
        label:
          order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
            ? 'Tandai Siap Diambil'
            : 'Lanjut ke Pengiriman',
        enabled: hasQcPhoto && addressReady && shipmentReady,
      },
    };
  }

  if (from === PRODUCTION_STATUS.AWAITING_SETTLEMENT) {
    const paidOff = order.remainingBalance <= 0;
    const addressReady =
      order.fulfillmentType === FULFILLMENT_TYPE.PICKUP || !order.addressIncomplete;
    const shipmentReady =
      order.fulfillmentType === FULFILLMENT_TYPE.PICKUP ||
      Boolean(order.shippingCourier?.trim() && order.trackingReceiptNumber?.trim());

    const checklist: OrderChecklistItem[] = [
      {
        id: 'verify-settlement',
        label: 'Verifikasi pelunasan / ongkir hingga sisa Rp 0',
        done: paidOff,
        required: true,
      },
    ];
    if (order.fulfillmentType === FULFILLMENT_TYPE.SHIP) {
      checklist.push(
        {
          id: 'check-address',
          label: 'Pastikan alamat pengiriman lengkap',
          done: addressReady,
          required: true,
        },
        {
          id: 'input-shipment',
          label: 'Input kurir resmi & nomor resi',
          done: shipmentReady,
          required: true,
        }
      );
    }

    return {
      stageHeading,
      summary:
        order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
          ? 'Verifikasi pelunasan hingga sisa Rp 0 sebelum pesanan siap diambil.'
          : 'Verifikasi pelunasan serta input kurir & nomor resi sebelum pengiriman.',
      checklist,
      primaryAction: {
        toStatus: PRODUCTION_STATUS.SHIPPING,
        label:
          order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
            ? 'Tandai Siap Diambil'
            : 'Lanjut ke Pengiriman',
        enabled: paidOff && addressReady && shipmentReady,
      },
    };
  }

  if (from === PRODUCTION_STATUS.SHIPPING) {
    const paidOff = order.remainingBalance <= 0;
    const shipmentReady =
      order.fulfillmentType === FULFILLMENT_TYPE.PICKUP ||
      Boolean(order.shippingCourier?.trim() && order.trackingReceiptNumber?.trim());

    return {
      stageHeading,
      summary:
        order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
          ? 'Tandai pesanan selesai setelah pelanggan mengambil barang di workshop.'
          : 'Tandai pesanan selesai setelah paket terkonfirmasi diterima pelanggan.',
      checklist: [
        {
          id: 'shipment-info',
          label:
            order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
              ? 'Pesanan siap diambil di workshop'
              : 'Kurir & nomor resi tercatat',
          done: shipmentReady,
          required: false,
        },
        {
          id: 'paid-off',
          label: 'Pembayaran lunas (sisa Rp 0)',
          done: paidOff,
          required: true,
        },
      ],
      primaryAction: {
        toStatus: PRODUCTION_STATUS.COMPLETED,
        label: 'Tandai Pesanan Selesai',
        enabled: paidOff,
      },
    };
  }

  return {
    stageHeading,
    summary:
      from === PRODUCTION_STATUS.COMPLETED
        ? 'Pesanan telah selesai diproses dan diterima pelanggan.'
        : 'Pesanan ini telah dibatalkan.',
    checklist: [],
    primaryAction: null,
  };
}

/**
 * Menghitung total nominal pembayaran yang sudah berstatus TERVERIFIKASI.
 */
export function getTotalVerifiedPaid(order: AdminOrderDetailDto): number {
  return order.payments.reduce(
    (sum, p) => (p.status === PAYMENT_STATUS.VERIFIED ? sum + p.amount : sum),
    0
  );
}

/**
 * Memeriksa apakah nama file desain adalah gambar yang bisa ditampilkan sebagai thumbnail.
 */
export function isImageFileName(fileName: string | null | undefined): boolean {
  if (!fileName) return false;
  return /\.(png|jpe?g|webp|svg)$/i.test(fileName.trim());
}

export interface AdminWaTemplate {
  key: string;
  label: string;
  description: string;
  message: string;
}

/**
 * Membangun daftar template pesan WhatsApp cepat untuk admin pada halaman detail order.
 */
export function buildAdminWaTemplates(
  order: AdminOrderDetailDto,
  origin: string
): AdminWaTemplate[] {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const trackerUrl = `${cleanOrigin}/track/${order.transactionUuid}`;
  const customerFirstName = order.customerName.trim() || 'Kak';

  const courierLabel = order.courierInfo?.name ?? order.shippingCourier ?? 'Kurir';
  const shippingInfoMessage =
    order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
      ? [
          `Halo ${customerFirstName}, pesanan YNG Apparel #${order.orderCode} sudah selesai QC dan siap diambil di workshop.`,
          'Silakan cek detail & foto QC melalui Live Tracker:',
          trackerUrl,
        ].join('\n')
      : [
          `Halo ${customerFirstName}, pesanan YNG Apparel #${order.orderCode} sudah diserahkan ke pengiriman.`,
          `Kurir: ${courierLabel}${order.shippingService ? ` (${order.shippingService})` : ''}`,
          `No. Resi: ${order.trackingReceiptNumber ?? '-'}`,
          order.trackingUrl ? `Lacak resi resmi: ${order.trackingUrl}` : '',
          `Pantau progres lengkap: ${trackerUrl}`,
        ]
          .filter(Boolean)
          .join('\n');

  const settlementLines = [
    `Halo ${customerFirstName}, pesanan YNG Apparel #${order.orderCode} siap masuk tahap pelunasan.`,
    order.shippingCost > 0 ? `Ongkos kirim tercatat: ${formatRupiah(order.shippingCost)}.` : '',
    `Sisa tagihan saat ini: ${formatRupiah(order.remainingBalance)}.`,
    `Silakan unggah bukti transfer pelunasan melalui tautan Live Tracker berikut:`,
    trackerUrl,
  ]
    .filter(Boolean)
    .join('\n');

  const revisionLines = [
    `Halo ${customerFirstName}, desain untuk pesanan #${order.orderCode} memerlukan penyesuaian.`,
    order.designReviewNotes ? `Catatan tim desain: ${order.designReviewNotes}` : '',
    'Mohon konfirmasi file/revisi melalui chat ini agar produksi dapat segera dilanjutkan.',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    {
      key: 'tracker',
      label: 'Kirim Magic Link Tracker',
      description: 'Tautan langsung Live Tracker + kode pesanan 6 karakter.',
      message: [
        `Halo ${customerFirstName}, berikut tautan Live Tracker untuk memantau pesanan YNG Apparel #${order.orderCode} (${order.totalQty} pcs):`,
        trackerUrl,
      ].join('\n'),
    },
    {
      key: 'settlement',
      label: 'Info Tagihan Pelunasan / Ongkir',
      description: 'Nominal sisa tagihan & tautan unggah bukti bayar.',
      message: settlementLines,
    },
    {
      key: 'shipment',
      label:
        order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
          ? 'Info Siap Diambil'
          : 'Info Resi Pengiriman',
      description:
        order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
          ? 'Pemberitahuan pesanan siap diambil di workshop.'
          : 'Nama kurir, nomor resi, dan tautan pelacakan resmi.',
      message: shippingInfoMessage,
    },
    {
      key: 'revision',
      label: 'Info Revisi Desain',
      description: 'Pemberitahuan penyesuaian file desain kepada pelanggan.',
      message: revisionLines,
    },
  ];
}
