import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FULFILLMENT_TYPE,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PRINT_POSITION_LABELS,
  PRODUCTION_STATUS,
  getFulfillmentLabel,
  getPaymentSchemeLabel,
  getProductionStatusLabel,
  type FulfillmentType,
  type OrderPaymentDto,
  type PaymentMethod,
  type ProductionStatus,
} from '@yng/shared';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Badge, DesignBadge, PaymentBadge, ProductionBadge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { ProductionStepper } from '../../components/ui/Stepper';
import { useToast } from '../../components/ui/toastContext';
import { catalogQueryKeys, getCatalogConfig } from '../../services/catalogService';
import { formatWibDate, formatWibDateTime } from '../../services/orderService';
import {
  getTrackOrderByUuid,
  trackerQueryKeys,
  uploadTrackerPaymentProof,
} from '../../services/trackerService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import { buildWaLink } from '../../utils/whatsapp';

const PROOF_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

function resolveHistoryStageLabel(rawStatus: string, fulfillmentType: FulfillmentType): string {
  if (Object.values(PRODUCTION_STATUS).includes(rawStatus as ProductionStatus)) {
    return getProductionStatusLabel(rawStatus as ProductionStatus, fulfillmentType);
  }
  return rawStatus;
}

export default function TrackDetail() {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lookupCredentials = useMemo(() => {
    const rawState = location.state as {
      lookupCredentials?: { code?: unknown; whatsappLast4?: unknown };
    } | null;
    const code =
      typeof rawState?.lookupCredentials?.code === 'string'
        ? rawState.lookupCredentials.code
        : null;
    const whatsappLast4 =
      typeof rawState?.lookupCredentials?.whatsappLast4 === 'string'
        ? rawState.lookupCredentials.whatsappLast4
        : null;
    return code && whatsappLast4 ? { code, whatsappLast4 } : null;
  }, [location.state]);

  const orderQuery = useQuery({
    queryKey: trackerQueryKeys.detail(uuid),
    queryFn: () => getTrackOrderByUuid(uuid),
    enabled: uuid.length > 0,
  });

  const configQuery = useQuery({
    queryKey: catalogQueryKeys.config,
    queryFn: getCatalogConfig,
  });

  const order = orderQuery.data ?? null;

  const unverifiedPayments = useMemo<OrderPaymentDto[]>(() => {
    if (!order || order.productionStatus === PRODUCTION_STATUS.CANCELLED) {
      return [];
    }
    return order.payments.filter((payment) => payment.status !== PAYMENT_STATUS.VERIFIED);
  }, [order]);

  const [selectedPaymentUuid, setSelectedPaymentUuid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHOD.BANK_TRANSFER);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (unverifiedPayments.length === 0) {
      setSelectedPaymentUuid('');
      return;
    }
    const stillValid = unverifiedPayments.some((p) => p.paymentUuid === selectedPaymentUuid);
    if (!stillValid) {
      const target = unverifiedPayments[0]!;
      setSelectedPaymentUuid(target.paymentUuid);
      if (target.paymentMethod) {
        setPaymentMethod(target.paymentMethod);
      }
    }
  }, [selectedPaymentUuid, unverifiedPayments]);

  const matchingAccounts = useMemo(() => {
    if (!order) return [];
    return order.paymentAccounts.filter((acc) => acc.method === paymentMethod);
  }, [order, paymentMethod]);

  useEffect(() => {
    if (!order) return;
    const hasBank = order.paymentAccounts.some(
      (acc) => acc.method === PAYMENT_METHOD.BANK_TRANSFER
    );
    const hasQris = order.paymentAccounts.some((acc) => acc.method === PAYMENT_METHOD.QRIS);
    if (!hasBank && hasQris) {
      setPaymentMethod(PAYMENT_METHOD.QRIS);
    }
  }, [order]);

  useEffect(() => {
    if (matchingAccounts.length === 0) {
      setSelectedAccountId(null);
      return;
    }
    const exists =
      selectedAccountId !== null && matchingAccounts.some((acc) => acc.id === selectedAccountId);
    if (!exists) {
      setSelectedAccountId(matchingAccounts[0]!.id);
    }
  }, [matchingAccounts, selectedAccountId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const uploadMutation = useMutation({
    mutationFn: uploadTrackerPaymentProof,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trackerQueryKeys.detail(uuid) });
      setSelectedFile(null);
      setPreviewUrl(null);
      setUploadError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast('Bukti pembayaran berhasil diunggah. Menunggu verifikasi admin.', 'ok');
    },
    onError: (err) => {
      const parsed = extractApiError(err, 'Gagal mengunggah bukti pembayaran.');
      setUploadError(parsed.message);
      toast(parsed.message, 'err');
    },
  });

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} berhasil disalin.`, 'ok');
    } catch {
      toast(`Tidak dapat menyalin otomatis. Salin manual: ${text}`, 'warn');
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!PROOF_ALLOWED_TYPES.has(file.type)) {
      setUploadError('Format file harus berupa JPG, PNG, atau WebP.');
      event.target.value = '';
      return;
    }
    if (file.size > PROOF_MAX_BYTES) {
      setUploadError('Ukuran file maksimal 5 MB.');
      event.target.value = '';
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleClearFile() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleSubmitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    if (!order || !selectedPaymentUuid) {
      setUploadError('Pilih tahap tagihan pembayaran terlebih dahulu.');
      return;
    }
    if (!selectedFile) {
      setUploadError('Pilih gambar bukti transfer/QRIS sebelum mengunggah.');
      return;
    }
    uploadMutation.mutate({
      transactionUuid: order.transactionUuid,
      paymentUuid: selectedPaymentUuid,
      paymentMethod,
      paymentAccountId: selectedAccountId,
      file: selectedFile,
      code: lookupCredentials?.code ?? null,
      whatsappLast4: lookupCredentials?.whatsappLast4 ?? null,
    });
  }

  if (orderQuery.isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="space-y-2 border-b border-line pb-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-72" />
        </div>
        <Skeleton className="h-28 w-full rounded-3xl" />
        <div className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="w-full min-w-0 space-y-4 lg:col-span-7">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <div className="w-full min-w-0 space-y-4 lg:col-span-5">
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (orderQuery.error || !order) {
    const parsed = extractApiError(orderQuery.error, 'Tautan tracker pesanan tidak ditemukan.');
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState
          title="Pesanan tidak ditemukan"
          message={parsed.message}
          retry={() => void orderQuery.refetch()}
        />
        <div className="mt-4 text-center">
          <Link to="/track" className="btn-secondary">
            Cari dengan Kode Pesanan Lain
          </Link>
        </div>
      </div>
    );
  }

  const magicLinkUrl = `${window.location.origin}/track/${order.transactionUuid}`;
  const adminWhatsapp = configQuery.data?.adminWhatsapp ?? '';
  const waInquiryText = `Halo YNG Apparel, saya ingin menanyakan progres pesanan ${order.orderCode} (status: ${getProductionStatusLabel(order.productionStatus, order.fulfillmentType)}).`;
  const waInquiryHref = adminWhatsapp ? buildWaLink(adminWhatsapp, waInquiryText) : null;

  const bankAccounts = order.paymentAccounts.filter(
    (acc) => acc.method === PAYMENT_METHOD.BANK_TRANSFER
  );
  const qrisAccounts = order.paymentAccounts.filter((acc) => acc.method === PAYMENT_METHOD.QRIS);

  const activeLightboxPhoto =
    lightboxIndex !== null && order.qcPhotos[lightboxIndex] ? order.qcPhotos[lightboxIndex] : null;

  return (
    <div className="w-full space-y-6 pb-10">
      {/* Header & Identitas Tersamarkan */}
      <header className="space-y-4 border-b border-line pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <Link
            to="/track"
            className="inline-flex min-h-touch items-center text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            ← Lacak Pesanan Lain
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyToClipboard(magicLinkUrl, 'Magic link tracker')}
              className="btn-secondary px-4 text-xs"
            >
              Salin Magic Link
            </button>
            {waInquiryHref ? (
              <a
                href={waInquiryHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary px-4 text-xs"
              >
                Tanya via WhatsApp
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="eyebrow">YNG Studio · Live Tracker Publik</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                {order.orderCode}
              </h1>
              <button
                type="button"
                onClick={() => void copyToClipboard(order.orderCode, 'Kode pesanan')}
                className="inline-flex min-h-touch items-center rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-ink transition-colors hover:border-ink"
              >
                Salin Kode
              </button>
            </div>
            <p className="tabular-price text-xs text-muted">
              Dibuat {formatWibDateTime(order.createdAt)} ·{' '}
              {getFulfillmentLabel(order.fulfillmentType)} ·{' '}
              {getPaymentSchemeLabel(order.paymentScheme, order.dpPercentSnapshot)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ProductionBadge
              status={order.productionStatus}
              fulfillmentType={order.fulfillmentType}
            />
            <DesignBadge status={order.designStatus} />
          </div>
        </div>

        {/* Kartu Data Pemesan Tersamarkan */}
        <div className="grid w-full grid-cols-1 gap-3 rounded-2xl border border-line bg-surface p-4 text-xs sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-muted">Pemesan</p>
            <p className="mt-0.5 truncate font-semibold text-ink">{order.customerNameMasked}</p>
          </div>
          <div className="min-w-0">
            <p className="text-muted">WhatsApp Terdaftar</p>
            <p className="tabular-price mt-0.5 font-semibold text-ink">
              {order.customerWhatsappMasked}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-muted">
              {order.fulfillmentType === FULFILLMENT_TYPE.SHIP ? 'Kota Tujuan' : 'Pengambilan'}
            </p>
            <p className="mt-0.5 truncate font-semibold text-ink">
              {order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
                ? 'Workshop YNG Apparel, Batam'
                : (order.addressSummaryMasked ?? 'Kota tujuan belum dilengkapi')}
            </p>
          </div>
        </div>
      </header>

      {order.productionStatus === PRODUCTION_STATUS.CANCELLED ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs leading-relaxed text-status-err sm:text-sm"
        >
          <p className="font-semibold">Pesanan Dibatalkan</p>
          {order.cancelledReason ? <p className="mt-1">Alasan: {order.cancelledReason}</p> : null}
        </div>
      ) : null}

      {/* Progres 5 Tahap Produksi */}
      <section className="w-full rounded-3xl border border-line bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
          <div>
            <p className="eyebrow">Progres Produksi</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-ink">
              5 Tahap Pengerjaan Pesanan
            </h2>
          </div>
          {order.estimatedFinishDate ? (
            <span className="tabular-price text-xs font-medium text-muted">
              Estimasi selesai:{' '}
              <strong className="text-ink">{formatWibDate(order.estimatedFinishDate)}</strong>
            </span>
          ) : null}
        </div>

        <ProductionStepper
          currentStatus={order.productionStatus}
          fulfillmentType={order.fulfillmentType}
          stages={order.stages}
        />
      </section>

      <div className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Kolom Kiri: Foto QC, Pembayaran & Upload Bukti, Rincian Item */}
        <div className="w-full min-w-0 space-y-6 lg:col-span-7">
          {/* Galeri Foto QC */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <div>
                <p className="eyebrow">Quality Control</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  Galeri Foto QC ({order.qcPhotos.length})
                </h2>
              </div>
              {order.qcPhotos.length > 0 ? (
                <span className="text-xs text-muted">Klik foto untuk memperbesar</span>
              ) : null}
            </div>

            {order.qcPhotos.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-line bg-surface px-4 py-4 text-xs leading-relaxed text-muted">
                Foto hasil Quality Control belum diunggah. Foto akan muncul di sini setelah tahap
                Pressing &amp; QC dikerjakan oleh tim workshop.
              </p>
            ) : (
              <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                {order.qcPhotos.map((photo, idx) => (
                  <button
                    key={`${photo.createdAt}-${idx}`}
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className="group relative aspect-square w-full overflow-hidden rounded-2xl border border-line bg-surface text-left transition-colors hover:border-ink"
                  >
                    <img
                      src={photo.photoUrl}
                      alt={`Foto QC #${idx + 1}`}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="tabular-price absolute bottom-2 left-2 rounded-full bg-ink/80 px-2.5 py-0.5 text-[11px] font-medium text-white">
                      QC #{idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Tagihan Pembayaran & Upload Bukti Tagihan Lanjutan */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <div>
                <p className="eyebrow">Pembayaran Bertahap</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  Tagihan &amp; Bukti Pembayaran
                </h2>
              </div>
              {order.paymentDueAt && order.productionStatus === PRODUCTION_STATUS.NEW_ORDER ? (
                <span className="tabular-price text-xs font-medium text-status-warn">
                  Batas bayar: {formatWibDateTime(order.paymentDueAt)}
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {order.payments.map((payment) => (
                <div
                  key={payment.paymentUuid}
                  className="rounded-2xl border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-semibold text-ink">
                          {payment.paymentStageLabel}
                        </span>
                        <PaymentBadge
                          status={payment.status}
                          proofImagePath={payment.hasProof ? 'uploaded' : null}
                        />
                      </div>
                      {payment.proofUploadedAt ? (
                        <p className="tabular-price text-xs text-muted">
                          Bukti diunggah: {formatWibDateTime(payment.proofUploadedAt)}
                        </p>
                      ) : null}
                      {payment.verifiedAt ? (
                        <p className="tabular-price text-xs text-status-ok">
                          Terverifikasi: {formatWibDateTime(payment.verifiedAt)}
                        </p>
                      ) : null}
                    </div>

                    <p className="tabular-price text-base font-bold text-ink">
                      {formatRupiah(payment.amount)}
                    </p>
                  </div>

                  {payment.status === PAYMENT_STATUS.REJECTED && payment.rejectionReason ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-status-err">
                      <strong>Alasan Penolakan:</strong> {payment.rejectionReason}. Silakan unggah
                      ulang bukti transfer di form bawah.
                    </div>
                  ) : null}

                  {payment.proofImageUrl ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <a
                        href={payment.proofImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-block overflow-hidden rounded-xl border border-line bg-white"
                      >
                        <img
                          src={payment.proofImageUrl}
                          alt={`Bukti ${payment.paymentStageLabel}`}
                          className="h-20 w-20 object-cover transition-transform group-hover:scale-105"
                        />
                      </a>
                      <a
                        href={payment.proofImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-ink underline"
                      >
                        Lihat bukti pembayaran
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Rekening Bank & QRIS Aktif bila ada tagihan berjalan */}
            {order.paymentAccounts.length > 0 ? (
              <div className="mt-6 space-y-3 border-t border-line pt-5">
                <p className="text-xs font-semibold text-ink">
                  Rekening Transfer &amp; QRIS Resmi YNG Apparel
                </p>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  {bankAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
                    >
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Transfer Bank · {acc.providerName}
                        </span>
                        <p className="tabular-price text-base font-bold text-ink">
                          {acc.accountNumber ?? '—'}
                        </p>
                        <p className="text-xs text-muted">a.n. {acc.accountHolder}</p>
                        {acc.instructions ? (
                          <p className="pt-1 text-xs leading-relaxed text-muted">
                            {acc.instructions}
                          </p>
                        ) : null}
                      </div>

                      {acc.accountNumber ? (
                        <button
                          type="button"
                          onClick={() =>
                            void copyToClipboard(
                              acc.accountNumber ?? '',
                              `No. rekening ${acc.providerName}`
                            )
                          }
                          className="btn-secondary w-full px-3 text-xs"
                        >
                          Salin No. Rekening
                        </button>
                      ) : null}
                    </div>
                  ))}

                  {qrisAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
                    >
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          QRIS · {acc.providerName}
                        </span>
                        <p className="text-xs font-medium text-ink">a.n. {acc.accountHolder}</p>
                        {acc.instructions ? (
                          <p className="text-xs leading-relaxed text-muted">{acc.instructions}</p>
                        ) : null}
                      </div>

                      {acc.qrImageUrl ? (
                        <a
                          href={acc.qrImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex flex-col items-center rounded-xl border border-line bg-white p-3 transition-colors hover:border-ink"
                        >
                          <img
                            src={acc.qrImageUrl}
                            alt={`QRIS ${acc.providerName}`}
                            className="h-36 w-36 object-contain"
                          />
                          <span className="mt-2 text-xs font-semibold text-ink underline">
                            Perbesar QRIS
                          </span>
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Form Upload Bukti Pembayaran Tagihan Terbuka */}
            {unverifiedPayments.length > 0 ? (
              <form
                onSubmit={handleSubmitProof}
                className="mt-6 space-y-4 border-t border-line pt-5"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">Unggah Bukti Pembayaran</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Format JPG, PNG, atau WebP maksimal 5 MB untuk DP awal, pelunasan, maupun ongkos
                    kirim.
                  </p>
                </div>

                {uploadError ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-status-err"
                  >
                    {uploadError}
                  </div>
                ) : null}

                {unverifiedPayments.length > 1 ? (
                  <div>
                    <label
                      htmlFor="tracker-payment-stage"
                      className="block text-xs font-semibold text-ink"
                    >
                      Pilih Tahap Tagihan
                    </label>
                    <select
                      id="tracker-payment-stage"
                      value={selectedPaymentUuid}
                      onChange={(e) => setSelectedPaymentUuid(e.target.value)}
                      className="input-sharp mt-1.5"
                    >
                      {unverifiedPayments.map((p) => (
                        <option key={p.paymentUuid} value={p.paymentUuid}>
                          {p.paymentStageLabel} — {formatRupiah(p.amount)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="grid w-full grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod(PAYMENT_METHOD.BANK_TRANSFER)}
                    className={`min-h-touch w-full rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      paymentMethod === PAYMENT_METHOD.BANK_TRANSFER
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-surface text-ink hover:border-ink'
                    }`}
                  >
                    Transfer Bank
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod(PAYMENT_METHOD.QRIS)}
                    className={`min-h-touch w-full rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      paymentMethod === PAYMENT_METHOD.QRIS
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-surface text-ink hover:border-ink'
                    }`}
                  >
                    QRIS
                  </button>
                </div>

                {matchingAccounts.length > 0 ? (
                  <div>
                    <label
                      htmlFor="tracker-payment-account"
                      className="block text-xs font-semibold text-ink"
                    >
                      Rekening / QRIS Tujuan
                    </label>
                    <select
                      id="tracker-payment-account"
                      value={selectedAccountId ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setSelectedAccountId(val);
                      }}
                      className="input-sharp mt-1.5"
                    >
                      {matchingAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.providerName}
                          {acc.accountNumber ? ` · ${acc.accountNumber}` : ''} ({acc.accountHolder})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label
                    htmlFor="tracker-proof-file"
                    className="block text-xs font-semibold text-ink"
                  >
                    Foto / Tangkapan Layar Bukti Transfer
                  </label>
                  <input
                    ref={fileInputRef}
                    id="tracker-proof-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileChange}
                    className="mt-1.5 block min-h-touch w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink file:mr-3 file:min-h-[32px] file:rounded-full file:border file:border-line file:bg-white file:px-3.5 file:text-xs file:font-semibold file:text-ink hover:file:border-ink"
                  />
                </div>

                {previewUrl && selectedFile ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <img
                        src={previewUrl}
                        alt="Pratinjau bukti pembayaran"
                        className="h-16 w-16 shrink-0 rounded-xl border border-line bg-white object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-ink">
                          {selectedFile.name}
                        </p>
                        <p className="tabular-price text-[11px] text-muted">
                          {Math.max(1, Math.round(selectedFile.size / 1024))} KB
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearFile}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      Ganti File
                    </button>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={uploadMutation.isPending || !selectedFile}
                  className="btn-primary w-full"
                >
                  {uploadMutation.isPending ? 'Mengunggah Bukti...' : 'Kirim Bukti Pembayaran'}
                </button>
              </form>
            ) : null}
          </section>

          {/* Rincian Item */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <div>
                <p className="eyebrow">Spesifikasi Produksi</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  Rincian Item &amp; Sablon ({order.items.length})
                </h2>
              </div>
              <span className="tabular-price text-xs font-semibold text-muted">
                {order.totalQty} pcs
              </span>
            </div>

            {order.designReviewNotes ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-status-warn">
                <strong>Catatan Desain:</strong> {order.designReviewNotes}
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
              {order.items.map((item, idx) => (
                <article
                  key={`${order.transactionUuid}-track-item-${idx}`}
                  className="rounded-2xl border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-semibold text-ink">
                          {item.modelName}
                        </h3>
                        {item.isCustomColor ? <Badge variant="warn">Warna Custom</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Bahan: <span className="font-medium text-ink">{item.fabricName}</span> ·
                        Warna:{' '}
                        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                          {item.colorHex ? (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border border-neutral-300"
                              style={{ backgroundColor: item.colorHex }}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span>{item.colorName}</span>
                        </span>
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="tabular-price text-base font-bold text-ink">
                        {formatRupiah(item.lineSubtotal)}
                      </p>
                      <p className="tabular-price text-xs text-muted">{item.itemQty} pcs</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.sizes.map((s) => (
                      <span
                        key={s.sizeCode}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs"
                      >
                        <span className="font-mono font-semibold text-ink">{s.sizeCode}</span>
                        <span className="tabular-price text-muted">× {s.qty}</span>
                      </span>
                    ))}
                  </div>

                  {item.prints.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {item.prints.map((print, pIdx) => (
                        <li
                          key={`${order.transactionUuid}-track-print-${idx}-${pIdx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs"
                        >
                          <span>
                            <strong className="text-ink">
                              {PRINT_POSITION_LABELS[print.printPosition]}
                            </strong>{' '}
                            <span className="text-muted">({print.printSizeCode})</span>
                          </span>
                          <span className="truncate font-mono text-[11px] text-ink">
                            {print.hasDesignFile
                              ? (print.designFileName ?? 'File desain terpasang')
                              : 'Bantuan Desain Gratis'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2.5 text-xs text-muted">Polos (tanpa sablon)</p>
                  )}

                  {item.productionNotes ? (
                    <p className="mt-2.5 rounded-xl border border-line bg-white px-3 py-2 text-xs text-muted">
                      <span className="font-semibold text-ink">Catatan: </span>
                      {item.productionNotes}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>

        {/* Kolom Kanan: Ringkasan Tagihan, Kurir & Lacak Resi, Riwayat Status */}
        <aside className="w-full min-w-0 space-y-6 lg:col-span-5">
          {/* Ringkasan Tagihan */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">Ringkasan Biaya</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                Tagihan &amp; Sisa Pembayaran
              </h2>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Subtotal ({order.totalQty} pcs)</dt>
                <dd className="tabular-price font-semibold text-ink">
                  {formatRupiah(order.subtotalAmount)}
                </dd>
              </div>
              {order.discountAmount > 0 ? (
                <div className="flex items-center justify-between gap-2 text-status-ok">
                  <dt>Diskon{order.discountNote ? ` (${order.discountNote})` : ''}</dt>
                  <dd className="tabular-price font-semibold">
                    -{formatRupiah(order.discountAmount)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Ongkos kirim</dt>
                <dd className="tabular-price font-semibold text-ink">
                  {order.fulfillmentType === FULFILLMENT_TYPE.PICKUP
                    ? formatRupiah(0)
                    : order.shippingCost > 0
                      ? formatRupiah(order.shippingCost)
                      : 'Menunggu QC'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <dt className="font-semibold text-ink">Grand Total</dt>
                <dd className="tabular-price text-lg font-bold text-ink">
                  {formatRupiah(order.grandTotal)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <dt className="font-semibold text-ink">Sisa Tagihan</dt>
                <dd className="tabular-price text-lg font-bold text-ink">
                  {formatRupiah(order.remainingBalance)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Pengiriman & Lacak Resi Eksternal */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">
                {order.fulfillmentType === FULFILLMENT_TYPE.SHIP
                  ? 'Pengiriman & Resi'
                  : 'Pengambilan di Workshop'}
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                {order.fulfillmentType === FULFILLMENT_TYPE.SHIP
                  ? 'Kurir & Pelacakan Eksternal'
                  : 'Status Pengambilan'}
              </h2>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {order.fulfillmentType === FULFILLMENT_TYPE.SHIP ? (
                <>
                  <p className="text-xs text-muted">
                    Tujuan:{' '}
                    <span className="font-semibold text-ink">
                      {order.addressSummaryMasked ?? 'Kota tujuan belum diisi'}
                    </span>
                  </p>

                  {order.shippingCourier || order.trackingReceiptNumber ? (
                    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted">Kurir &amp; Layanan</p>
                          <p className="text-sm font-semibold text-ink">
                            {order.courierInfo?.name ?? order.shippingCourier ?? 'Kurir'}
                            {order.shippingService ? ` · ${order.shippingService}` : ''}
                          </p>
                        </div>
                        {order.shippedAt ? (
                          <span className="tabular-price text-xs text-muted">
                            Dikirim {formatWibDate(order.shippedAt)}
                          </span>
                        ) : null}
                      </div>

                      {order.trackingReceiptNumber ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[11px] text-muted">Nomor Resi</p>
                            <p className="truncate font-mono text-sm font-bold text-ink">
                              {order.trackingReceiptNumber}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              void copyToClipboard(order.trackingReceiptNumber ?? '', 'Nomor resi')
                            }
                            className="btn-secondary px-3 py-1.5 text-xs"
                          >
                            Salin Resi
                          </button>
                        </div>
                      ) : null}

                      {order.trackingUrl ? (
                        <a
                          href={order.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary w-full text-xs"
                        >
                          Lacak Resi di {order.courierInfo?.name ?? 'Situs Kurir'} ↗
                        </a>
                      ) : order.trackingReceiptNumber ? (
                        <p className="text-xs text-muted">
                          Kurir ini tidak memiliki halaman cek resi statis. Gunakan nomor resi di
                          atas pada aplikasi kurir terkait.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-line bg-surface p-3.5 text-xs text-muted">
                      Nomor resi dan kurir akan tampil di sini setelah pesanan masuk tahap
                      pengiriman.
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-line bg-surface p-3.5 text-xs text-muted">
                  <p>Ambil langsung di studio YNG Apparel, Batam.</p>
                  {order.shippedAt ? (
                    <p className="mt-1 font-semibold text-status-ok">
                      Siap diambil sejak {formatWibDateTime(order.shippedAt)}.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          {/* Riwayat Status */}
          {order.statusHistory.length > 0 ? (
            <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
              <div className="border-b border-line pb-4">
                <p className="eyebrow">Linimasa</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  Riwayat Status Produksi
                </h2>
              </div>

              <ol className="mt-4 space-y-3">
                {order.statusHistory.map((entry, idx) => (
                  <li
                    key={`${entry.createdAt}-${idx}`}
                    className="rounded-2xl border border-line bg-surface px-3.5 py-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {resolveHistoryStageLabel(entry.toStatus, order.fulfillmentType)}
                      </span>
                      <span className="tabular-price text-[11px] text-muted">
                        {formatWibDateTime(entry.createdAt)}
                      </span>
                    </div>
                    {entry.notes ? <p className="mt-1 text-muted">{entry.notes}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </div>

      {/* Lightbox Foto QC */}
      <Modal
        open={activeLightboxPhoto !== null}
        onClose={() => setLightboxIndex(null)}
        title={lightboxIndex !== null ? `Foto Quality Control #${lightboxIndex + 1}` : 'Foto QC'}
        description={
          activeLightboxPhoto
            ? `Diunggah ${formatWibDateTime(activeLightboxPhoto.createdAt)}`
            : undefined
        }
        size="lg"
      >
        {activeLightboxPhoto ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <img
                src={activeLightboxPhoto.photoUrl}
                alt={`Foto QC #${(lightboxIndex ?? 0) + 1}`}
                className="max-h-[65vh] w-full object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {order.qcPhotos.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxIndex((prev) =>
                          prev === null
                            ? 0
                            : (prev - 1 + order.qcPhotos.length) % order.qcPhotos.length
                        )
                      }
                      className="btn-secondary px-4 py-2 text-xs"
                    >
                      ← Sebelumnya
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxIndex((prev) =>
                          prev === null ? 0 : (prev + 1) % order.qcPhotos.length
                        )
                      }
                      className="btn-secondary px-4 py-2 text-xs"
                    >
                      Berikutnya →
                    </button>
                  </>
                ) : null}
              </div>

              <a
                href={activeLightboxPhoto.photoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary px-4 py-2 text-xs"
              >
                Buka Ukuran Penuh ↗
              </a>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
