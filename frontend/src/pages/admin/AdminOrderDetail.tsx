import {
  FULFILLMENT_TYPE,
  PAYMENT_STATUS,
  PRINT_POSITION_LABELS,
  getFulfillmentLabel,
  getPaymentSchemeLabel,
  getProductionStatusLabel,
  type AdminOrderDetailDto,
  type OrderPaymentDto,
  type ProductionStatus,
} from '@yng/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminFeedbackBanner } from '../../components/admin/AdminFeedbackBanner';
import { AdminOrderActionPanels } from '../../components/admin/AdminOrderActionPanels';
import { ImageLightboxModal } from '../../components/admin/ImageLightboxModal';
import { getOrderNextStepGuide, isImageFileName } from '../../components/admin/adminOrderHelpers';
import { Badge, DesignBadge, PaymentBadge, ProductionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Textarea } from '../../components/ui/Input';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import {
  adminOrderQueryKeys,
  deleteAdminOrderQcPhoto,
  downloadAdminOrderSpkPdf,
  getAdminOrderDetail,
  rejectAdminPayment,
  transitionAdminOrderStatus,
  uploadAdminOrderQcPhotos,
  verifyAdminPayment,
} from '../../services/adminOrderService';
import { formatWibDate, formatWibDateTime } from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';

const MAX_QC_FILES = 10;
const MAX_QC_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_QC_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface LightboxState {
  url: string;
  title: string;
  subtitle?: string | null;
}

export default function AdminOrderDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const qcFileInputRef = useRef<HTMLInputElement>(null);

  const [detailError, setDetailError] = useState<{ message: string; details: string[] } | null>(
    null
  );
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [downloadingSpk, setDownloadingSpk] = useState(false);

  // Payment verify / reject
  const [verifyTarget, setVerifyTarget] = useState<OrderPaymentDto | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OrderPaymentDto | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectFormError, setRejectFormError] = useState<string | null>(null);

  // QC upload & delete
  const [selectedQcFiles, setSelectedQcFiles] = useState<File[]>([]);
  const [qcSelectionError, setQcSelectionError] = useState<string | null>(null);
  const [deleteQcTargetId, setDeleteQcTargetId] = useState<number | null>(null);

  const detailQuery = useQuery({
    queryKey: adminOrderQueryKeys.detail(uuid ?? ''),
    queryFn: () => getAdminOrderDetail(uuid ?? ''),
    enabled: Boolean(uuid),
  });

  async function invalidateOrderQueries(targetUuid: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.detail(targetUuid) }),
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.kanban }),
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.paymentsAll }),
    ]);
  }

  async function handleOrderUpdated(updated: AdminOrderDetailDto) {
    queryClient.setQueryData(adminOrderQueryKeys.detail(updated.transactionUuid), updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.kanban }),
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.paymentsAll }),
    ]);
  }

  const verifyPaymentMutation = useMutation({
    mutationFn: (payment: OrderPaymentDto) =>
      verifyAdminPayment(payment.paymentUuid, { approve: true }),
    onSuccess: async () => {
      setVerifyTarget(null);
      setDetailError(null);
      toast('Pembayaran berhasil diverifikasi.', 'ok');
      if (uuid) await invalidateOrderQueries(uuid);
    },
    onError: (err) => {
      setVerifyTarget(null);
      setDetailError(extractApiError(err, 'Gagal memverifikasi pembayaran.'));
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: (input: { payment: OrderPaymentDto; reason: string }) =>
      rejectAdminPayment(input.payment.paymentUuid, { rejectionReason: input.reason }),
    onSuccess: async () => {
      setRejectTarget(null);
      setRejectionReason('');
      setRejectFormError(null);
      setDetailError(null);
      toast('Bukti pembayaran ditolak.', 'info');
      if (uuid) await invalidateOrderQueries(uuid);
    },
    onError: (err) => {
      const parsed = extractApiError(err, 'Gagal menolak bukti pembayaran.');
      setRejectFormError(parsed.message);
      setDetailError(parsed);
    },
  });

  const uploadQcMutation = useMutation({
    mutationFn: (files: File[]) => uploadAdminOrderQcPhotos(uuid ?? '', files),
    onSuccess: async (uploaded) => {
      setSelectedQcFiles([]);
      setQcSelectionError(null);
      setDetailError(null);
      if (qcFileInputRef.current) qcFileInputRef.current.value = '';
      toast(`${uploaded.length} foto QC berhasil diunggah.`, 'ok');
      if (uuid) await invalidateOrderQueries(uuid);
    },
    onError: (err) => {
      setDetailError(extractApiError(err, 'Gagal mengunggah foto QC.'));
    },
  });

  const deleteQcMutation = useMutation({
    mutationFn: (photoId: number) => deleteAdminOrderQcPhoto(uuid ?? '', photoId),
    onSuccess: async () => {
      setDeleteQcTargetId(null);
      setDetailError(null);
      toast('Foto QC berhasil dihapus.', 'info');
      if (uuid) await invalidateOrderQueries(uuid);
    },
    onError: (err) => {
      setDeleteQcTargetId(null);
      setDetailError(extractApiError(err, 'Gagal menghapus foto QC.'));
    },
  });

  const quickTransitionMutation = useMutation({
    mutationFn: (toStatus: ProductionStatus) =>
      transitionAdminOrderStatus(uuid ?? '', { toStatus }),
    onSuccess: async (updated) => {
      setDetailError(null);
      await handleOrderUpdated(updated);
      toast('Pesanan berhasil dipindahkan ke tahap berikutnya.', 'ok');
    },
    onError: (err) => {
      setDetailError(extractApiError(err, 'Gagal memindahkan tahap produksi pesanan.'));
    },
  });

  async function handleDownloadSpk(order: AdminOrderDetailDto) {
    setDownloadingSpk(true);
    try {
      await downloadAdminOrderSpkPdf(order.transactionUuid, order.orderCode);
      toast(`SPK-${order.orderCode}.pdf berhasil diunduh.`, 'ok');
    } catch (err) {
      setDetailError(extractApiError(err, 'Gagal mengunduh SPK PDF pesanan.'));
    } finally {
      setDownloadingSpk(false);
    }
  }

  function handleSelectQcFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(event.target.files ?? []);
    if (fileList.length === 0) {
      setSelectedQcFiles([]);
      setQcSelectionError(null);
      return;
    }

    if (fileList.length > MAX_QC_FILES) {
      setQcSelectionError(`Maksimal ${MAX_QC_FILES} foto QC dalam satu kali unggah.`);
      setSelectedQcFiles([]);
      return;
    }

    const invalidType = fileList.find((f) => !ALLOWED_QC_MIME.has(f.type));
    if (invalidType) {
      setQcSelectionError(
        `Format "${invalidType.name}" tidak didukung. Gunakan JPG, PNG, atau WebP.`
      );
      setSelectedQcFiles([]);
      return;
    }

    const oversized = fileList.find((f) => f.size > MAX_QC_FILE_BYTES);
    if (oversized) {
      setQcSelectionError(`Ukuran file "${oversized.name}" melebihi batas maksimal 5 MB.`);
      setSelectedQcFiles([]);
      return;
    }

    setQcSelectionError(null);
    setSelectedQcFiles(fileList);
  }

  async function handleCopyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} disalin.`, 'ok');
    } catch {
      toast('Gagal menyalin teks.', 'err');
    }
  }

  function handleSubmitRejectPayment() {
    if (!rejectTarget) return;
    const trimmed = rejectionReason.trim();
    if (trimmed.length < 3) {
      setRejectFormError('Alasan penolakan wajib diisi minimal 3 karakter.');
      return;
    }
    rejectPaymentMutation.mutate({ payment: rejectTarget, reason: trimmed });
  }

  if (!uuid) {
    return (
      <ErrorState
        title="UUID Order Tidak Valid"
        message="Parameter order tidak ditemukan pada alamat halaman."
      />
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-sm border border-line bg-white p-10">
        <Spinner label="Memuat detail order admin..." />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        title="Gagal Memuat Detail Order"
        message={extractApiError(detailQuery.error, 'Data order tidak ditemukan.').message}
        retry={() => void detailQuery.refetch()}
      >
        <div className="mt-4">
          <Link to="/admin/orders" className="btn-secondary inline-flex">
            Kembali ke Daftar Order
          </Link>
        </div>
      </ErrorState>
    );
  }

  const order = detailQuery.data;
  const nextStepGuide = getOrderNextStepGuide(order);

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Header Atas Detail Order */}
      <section className="rounded-sm border border-line bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Link to="/admin/kanban" className="hover:text-ink hover:underline">
            Kanban
          </Link>
          <span>/</span>
          <Link to="/admin/orders" className="hover:text-ink hover:underline">
            Semua Order
          </Link>
          <span>/</span>
          <span className="font-mono font-semibold text-ink">#{order.orderCode}</span>
        </div>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-2xl font-bold tracking-wider text-ink tabular-nums sm:text-3xl">
                #{order.orderCode}
              </h1>
              <ProductionBadge
                status={order.productionStatus}
                fulfillmentType={order.fulfillmentType}
              />
              <DesignBadge status={order.designStatus} />
              <Badge variant="neutral">{order.source}</Badge>
            </div>
            <p className="text-xs text-muted tabular-nums">
              Masuk: {formatWibDateTime(order.createdAt)} · {order.totalQty} pcs ·{' '}
              {getFulfillmentLabel(order.fulfillmentType)} ·{' '}
              {getPaymentSchemeLabel(order.paymentScheme, order.dpPercentSnapshot)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={downloadingSpk}
              onClick={() => void handleDownloadSpk(order)}
            >
              Unduh SPK PDF
            </Button>
            <Link
              to={`/track/${order.transactionUuid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-touch items-center rounded-sm border border-line-strong bg-white px-4 font-display text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA]"
            >
              Live Tracker ↗
            </Link>
          </div>
        </div>
      </section>

      {/* Kartu Panduan "Langkah Selanjutnya" */}
      <section className="rounded-sm border border-ink bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="eyebrow">Langkah Selanjutnya · {nextStepGuide.stageHeading}</p>
              <p className="mt-1 text-sm font-medium text-ink">{nextStepGuide.summary}</p>
            </div>

            {nextStepGuide.checklist.length > 0 ? (
              <ul className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {nextStepGuide.checklist.map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-center gap-2.5 rounded-sm border px-3 py-2 text-xs ${
                      item.done
                        ? 'border-emerald-200 bg-emerald-50/60 text-status-ok'
                        : item.required
                          ? 'border-amber-200 bg-amber-50/60 text-ink'
                          : 'border-line bg-[#FAFAFA] text-muted'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] font-bold ${
                        item.done
                          ? 'bg-status-ok text-white'
                          : item.required
                            ? 'bg-status-warn text-white'
                            : 'border border-line-strong bg-white text-muted'
                      }`}
                    >
                      {item.done ? '✓' : '○'}
                    </span>
                    <span className="min-w-0 flex-1 font-medium">
                      {item.label}
                      {!item.required ? (
                        <span className="ml-1 text-[11px] font-normal text-muted">(Opsional)</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {nextStepGuide.primaryAction ? (
            <div className="shrink-0">
              <Button
                type="button"
                variant="primary"
                disabled={!nextStepGuide.primaryAction.enabled}
                loading={quickTransitionMutation.isPending}
                onClick={() => {
                  if (nextStepGuide.primaryAction) {
                    quickTransitionMutation.mutate(nextStepGuide.primaryAction.toStatus);
                  }
                }}
                className="w-full lg:w-auto"
              >
                {nextStepGuide.primaryAction.label} →
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {detailError ? (
        <AdminFeedbackBanner
          variant="error"
          message={detailError.message}
          details={detailError.details}
          onDismiss={() => setDetailError(null)}
        />
      ) : null}

      {/* Grid Utama 12 Kolom */}
      <div className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Kolom Kiri — Informasi Lengkap Order */}
        <div className="w-full min-w-0 space-y-6 lg:col-span-7 xl:col-span-8">
          {/* 1. Data Pelanggan & Pengiriman (Unmasked) */}
          <section className="rounded-sm border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="eyebrow">Data Pelanggan &amp; Tujuan</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                  {order.customerName}
                </h2>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {order.addressIncomplete ? (
                  <Badge variant="err" dot>
                    Alamat Belum Lengkap
                  </Badge>
                ) : null}
                {order.readyToProcess ? (
                  <Badge variant="ok" dot>
                    Siap Cetak
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid w-full grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted">Nomor WhatsApp</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-ink tabular-nums">
                    {order.customerWhatsapp}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyText('Nomor WhatsApp', order.customerWhatsapp)}
                    className="rounded-sm border border-line px-2.5 py-0.5 text-[11px] font-semibold text-ink hover:border-ink"
                  >
                    Salin
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted">Metode Pemenuhan</p>
                <p className="text-sm font-medium text-ink">
                  {getFulfillmentLabel(order.fulfillmentType)}
                </p>
              </div>

              {order.fulfillmentType === FULFILLMENT_TYPE.SHIP ? (
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-xs text-muted">Alamat Pengiriman Lengkap</p>
                  {order.fullAddress ? (
                    <p className="text-sm leading-relaxed text-ink">
                      {order.fullAddress}
                      {[order.districtName, order.cityName, order.provinceName, order.postalCode]
                        .filter(Boolean)
                        .join(', ')
                        ? ` — ${[
                            order.districtName,
                            order.cityName,
                            order.provinceName,
                            order.postalCode,
                          ]
                            .filter(Boolean)
                            .join(', ')}`
                        : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-status-err">Alamat pengiriman belum dilengkapi.</p>
                  )}
                </div>
              ) : null}

              <div className="space-y-1">
                <p className="text-xs text-muted">Estimasi Selesai</p>
                <p className="text-sm font-medium text-ink tabular-nums">
                  {order.estimatedFinishDate
                    ? formatWibDate(order.estimatedFinishDate)
                    : 'Belum ditentukan'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted">Kurir &amp; Resi</p>
                {order.trackingReceiptNumber ? (
                  <p className="font-mono text-sm font-semibold text-ink tabular-nums">
                    {order.courierInfo?.name ?? order.shippingCourier ?? '-'}
                    {order.shippingService ? ` (${order.shippingService})` : ''} ·{' '}
                    {order.trackingReceiptNumber}
                  </p>
                ) : (
                  <p className="text-sm text-muted">Belum diinput</p>
                )}
              </div>
            </div>

            {order.adminNotes ? (
              <div className="mt-4 rounded-sm border border-line bg-[#FAFAFA] p-3 text-xs text-ink">
                <span className="font-semibold">Catatan Admin Internal:</span> {order.adminNotes}
              </div>
            ) : null}

            {order.designReviewNotes ? (
              <div className="mt-3 rounded-sm border border-amber-200 bg-amber-50/60 p-3 text-xs text-ink">
                <span className="font-semibold">Catatan Review Desain:</span>{' '}
                {order.designReviewNotes}
              </div>
            ) : null}

            {order.cancelledReason ? (
              <div className="mt-3 rounded-sm border border-red-200 bg-red-50/70 p-3 text-xs text-status-err">
                <p className="font-semibold">Pesanan Dibatalkan: {order.cancelledReason}</p>
                <p className="mt-1 tabular-nums">
                  Refund tercatat: {formatRupiah(order.refundedAmount)} ·{' '}
                  {formatWibDateTime(order.cancelledAt)}
                </p>
              </div>
            ) : null}
          </section>

          {/* 2. Rincian Item & File Desain */}
          <section className="rounded-sm border border-line bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="eyebrow">Spesifikasi Produksi</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                  Rincian Item &amp; Desain ({order.items.length})
                </h2>
              </div>
              <span className="font-mono text-sm font-semibold text-ink tabular-nums">
                Total {order.totalQty} pcs
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {order.items.map((item, idx) => (
                <article
                  key={item.id}
                  className="rounded-sm border border-line bg-[#FAFAFA] p-4 space-y-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold text-ink">
                        {idx + 1}. {item.modelName} — {item.fabricName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {item.colorHex ? (
                          <span
                            className="inline-block h-3.5 w-3.5 rounded-full border border-line-strong"
                            style={{ backgroundColor: item.colorHex }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="font-medium text-ink">{item.colorName}</span>
                        {item.isCustomColor ? <Badge variant="warn">Warna Custom</Badge> : null}
                        {item.needsDesignHelp ? (
                          <Badge variant="info">Perlu Bantuan Desain</Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <p className="tabular-price text-sm font-bold text-ink">
                        {formatRupiah(item.lineSubtotal)}
                      </p>
                      <p className="tabular-price text-xs text-muted">{item.itemQty} pcs</p>
                    </div>
                  </div>

                  {/* Matriks Ukuran */}
                  <div className="flex flex-wrap gap-1.5">
                    {item.sizes.map((sz) => (
                      <span
                        key={sz.sizeCode}
                        className="rounded-sm border border-line bg-white px-2.5 py-1 font-mono text-xs text-ink tabular-nums"
                      >
                        {sz.sizeCode}: <strong>{sz.qty}</strong>
                        {sz.lockedExtraCharge > 0
                          ? ` (+${formatRupiah(sz.lockedExtraCharge)})`
                          : ''}
                      </span>
                    ))}
                  </div>

                  {item.productionNotes ? (
                    <p className="rounded-sm border border-line bg-white px-3 py-2 text-xs text-ink">
                      <span className="font-semibold">Catatan Item:</span> {item.productionNotes}
                    </p>
                  ) : null}

                  {/* Titik Sablon & File Desain */}
                  {item.prints.length > 0 ? (
                    <div className="space-y-2 border-t border-line pt-3">
                      <p className="text-xs font-semibold text-ink">
                        Titik Sablon &amp; File Desain ({item.prints.length})
                      </p>
                      <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {item.prints.map((print) => {
                          const canPreview =
                            Boolean(print.designFileUrl) && isImageFileName(print.designFileName);
                          return (
                            <div
                              key={print.id}
                              className="flex items-center justify-between gap-3 rounded-sm border border-line bg-white p-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-ink">
                                  {PRINT_POSITION_LABELS[print.printPosition]} ·{' '}
                                  {print.printSizeCode}
                                </p>
                                <p className="tabular-price text-[11px] text-muted">
                                  {formatRupiah(print.lockedSpotPrice)}/pcs
                                </p>
                                {print.designFileName ? (
                                  <p className="mt-1 truncate font-mono text-[11px] text-ink">
                                    {print.designFileName}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-[11px] text-muted">Tanpa file</p>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-1.5">
                                {canPreview && print.designFileUrl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightbox({
                                        url: print.designFileUrl ?? '',
                                        title: `${PRINT_POSITION_LABELS[print.printPosition]} — ${print.designFileName ?? 'Desain'}`,
                                        subtitle: `${item.modelName} (${print.printSizeCode})`,
                                      })
                                    }
                                    className="rounded-sm border border-line-strong px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-ink"
                                  >
                                    Pratinjau
                                  </button>
                                ) : null}
                                {print.designFileUrl ? (
                                  <a
                                    href={print.designFileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-sm bg-ink px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-neutral-800"
                                  >
                                    Unduh ↗
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          {/* 3. Rincian Tagihan & Daftar Pembayaran */}
          <section className="rounded-sm border border-line bg-white p-5 sm:p-6">
            <p className="eyebrow">Tagihan &amp; Mutasi</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-ink">
              Ringkasan Keuangan &amp; Pembayaran
            </h2>

            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Subtotal Produksi</dt>
                <dd className="tabular-price font-medium text-ink">
                  {formatRupiah(order.subtotalAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">
                  Diskon{order.discountNote ? ` (${order.discountNote})` : ''}
                </dt>
                <dd className="tabular-price font-medium text-ink">
                  - {formatRupiah(order.discountAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Ongkos Kirim</dt>
                <dd className="tabular-price font-medium text-ink">
                  {formatRupiah(order.shippingCost)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-line pt-2 text-base font-bold text-ink">
                <dt>Grand Total</dt>
                <dd className="tabular-price">{formatRupiah(order.grandTotal)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Sisa Tagihan</dt>
                <dd
                  className={`tabular-price font-bold ${
                    order.remainingBalance > 0 ? 'text-status-warn' : 'text-status-ok'
                  }`}
                >
                  {formatRupiah(order.remainingBalance)}
                </dd>
              </div>
            </dl>

            <div className="mt-5 space-y-3 border-t border-line pt-5">
              <h3 className="font-display text-sm font-semibold text-ink">
                Daftar Tagihan ({order.payments.length})
              </h3>

              {order.payments.map((payment) => (
                <div
                  key={payment.paymentUuid}
                  className="flex flex-col gap-3 rounded-sm border border-line bg-[#FAFAFA] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-semibold text-ink">
                        {payment.paymentStageLabel}
                      </span>
                      <PaymentBadge
                        status={payment.status}
                        proofImagePath={payment.hasProof ? 'has-proof' : null}
                      />
                    </div>
                    <p className="tabular-price font-display text-lg font-bold text-ink">
                      {formatRupiah(payment.amount)}
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      {payment.proofUploadedAt
                        ? `Bukti diunggah: ${formatWibDateTime(payment.proofUploadedAt)}`
                        : `Dibuat: ${formatWibDateTime(payment.createdAt)}`}
                      {payment.verifiedAt
                        ? ` · Diverifikasi: ${formatWibDateTime(payment.verifiedAt)}`
                        : ''}
                    </p>
                    {payment.rejectionReason ? (
                      <p className="text-xs text-status-err">
                        Alasan tolak: {payment.rejectionReason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {payment.hasProof && payment.proofImageUrl ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setLightbox({
                            url: payment.proofImageUrl ?? '',
                            title: `Bukti ${payment.paymentStageLabel} — #${order.orderCode}`,
                            subtitle: formatRupiah(payment.amount),
                          })
                        }
                      >
                        Lihat Bukti
                      </Button>
                    ) : null}

                    {payment.status === PAYMENT_STATUS.PENDING && payment.hasProof ? (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => setVerifyTarget(payment)}
                        >
                          Verifikasi
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setRejectTarget(payment);
                            setRejectionReason('');
                            setRejectFormError(null);
                          }}
                        >
                          Tolak
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 4. Foto Hasil QC (Multi Upload & Hapus) */}
          <section className="rounded-sm border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="eyebrow">Quality Control</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                  Foto Hasil QC ({order.qcPhotos.length})
                </h2>
              </div>
            </div>

            <div className="mt-4 rounded-sm border border-dashed border-line-strong bg-[#FAFAFA] p-4">
              <label
                htmlFor="qc-upload-input"
                className="block font-display text-xs font-semibold text-ink"
              >
                Unggah Foto QC Baru (JPG, PNG, WebP · Maks 10 file, maks 5 MB/file)
              </label>
              <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={qcFileInputRef}
                  id="qc-upload-input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSelectQcFiles}
                  className="block w-full text-xs text-muted file:mr-3 file:min-h-touch file:rounded-sm file:border file:border-line-strong file:bg-white file:px-4 file:font-display file:text-xs file:font-semibold file:text-ink hover:file:border-ink"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={selectedQcFiles.length === 0}
                  loading={uploadQcMutation.isPending}
                  onClick={() => uploadQcMutation.mutate(selectedQcFiles)}
                  className="shrink-0"
                >
                  Unggah ({selectedQcFiles.length})
                </Button>
              </div>

              {qcSelectionError ? (
                <p className="mt-2 text-xs font-medium text-status-err" role="alert">
                  {qcSelectionError}
                </p>
              ) : null}

              {selectedQcFiles.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedQcFiles.map((file) => (
                    <span
                      key={`${file.name}-${file.size}`}
                      className="rounded-sm border border-line bg-white px-3 py-1 font-mono text-[11px] text-ink"
                    >
                      {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {order.qcPhotos.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Belum ada foto QC yang diunggah.</p>
            ) : (
              <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                {order.qcPhotos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="group overflow-hidden rounded-sm border border-line bg-[#FAFAFA]"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          url: photo.photoUrl,
                          title: `Foto QC #${index + 1} — Order #${order.orderCode}`,
                          subtitle: formatWibDateTime(photo.createdAt),
                        })
                      }
                      className="block w-full overflow-hidden"
                    >
                      <img
                        src={photo.photoUrl}
                        alt={`Foto QC #${index + 1}`}
                        className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </button>
                    <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                      <span className="truncate text-[11px] text-muted tabular-nums">
                        {formatWibDate(photo.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteQcTargetId(photo.id)}
                        className="text-xs font-semibold text-status-err hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 5. Riwayat Status Produksi */}
          <section className="rounded-sm border border-line bg-white p-5 sm:p-6">
            <p className="eyebrow">Audit Log</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-ink">
              Riwayat Status ({order.statusHistory.length})
            </h2>

            {order.statusHistory.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Belum ada catatan riwayat perubahan status.</p>
            ) : (
              <ol className="mt-4 space-y-3 border-l border-line pl-4">
                {order.statusHistory.map((entry, idx) => (
                  <li key={`${entry.createdAt}-${idx}`} className="relative space-y-0.5">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-white bg-ink"
                    />
                    <p className="font-display text-xs font-bold text-ink">
                      {getProductionStatusLabel(
                        entry.toStatus as AdminOrderDetailDto['productionStatus'],
                        order.fulfillmentType
                      )}
                    </p>
                    <p className="text-[11px] text-muted tabular-nums">
                      {formatWibDateTime(entry.createdAt)}
                    </p>
                    {entry.notes ? <p className="text-xs text-ink">{entry.notes}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Kolom Kanan — Panel Aksi Operasional */}
        <aside className="w-full min-w-0 lg:sticky lg:top-24 lg:col-span-5 xl:col-span-4">
          <AdminOrderActionPanels
            key={`${order.transactionUuid}:${order.updatedAt}`}
            order={order}
            onUpdated={handleOrderUpdated}
          />
        </aside>
      </div>

      <ImageLightboxModal
        open={Boolean(lightbox)}
        imageUrl={lightbox?.url ?? null}
        title={lightbox?.title ?? 'Pratinjau Gambar'}
        subtitle={lightbox?.subtitle}
        onClose={() => setLightbox(null)}
      />

      <ConfirmDialog
        open={Boolean(verifyTarget)}
        onClose={() => setVerifyTarget(null)}
        onConfirm={() => {
          if (verifyTarget) verifyPaymentMutation.mutate(verifyTarget);
        }}
        title="Verifikasi Pembayaran"
        message={
          verifyTarget
            ? `Konfirmasi verifikasi pembayaran ${verifyTarget.paymentStageLabel} sebesar ${formatRupiah(verifyTarget.amount)}?`
            : ''
        }
        confirmLabel="Ya, Verifikasi"
        loading={verifyPaymentMutation.isPending}
      />

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => {
          if (!rejectPaymentMutation.isPending) setRejectTarget(null);
        }}
        title="Tolak Bukti Pembayaran"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={rejectPaymentMutation.isPending}
              onClick={() => setRejectTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={rejectPaymentMutation.isPending}
              onClick={handleSubmitRejectPayment}
            >
              Tolak Bukti
            </Button>
          </div>
        }
      >
        <Textarea
          label="Alasan Penolakan"
          placeholder="Contoh: Nominal transfer tidak sesuai atau bukti transfer terpotong."
          rows={3}
          value={rejectionReason}
          onChange={(event) => {
            setRejectionReason(event.target.value);
            if (rejectFormError) setRejectFormError(null);
          }}
          error={rejectFormError ?? undefined}
          hint="Minimal 3 karakter."
        />
      </Modal>

      <ConfirmDialog
        open={deleteQcTargetId !== null}
        onClose={() => setDeleteQcTargetId(null)}
        onConfirm={() => {
          if (deleteQcTargetId !== null) deleteQcMutation.mutate(deleteQcTargetId);
        }}
        title="Hapus Foto QC"
        message="Foto QC yang dihapus akan hilang dari detail order dan Live Tracker pelanggan."
        confirmLabel="Hapus Foto"
        variant="danger"
        loading={deleteQcMutation.isPending}
      />
    </div>
  );
}
