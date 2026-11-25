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
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/toastContext';
import { catalogQueryKeys, getCatalogConfig } from '../../services/catalogService';
import {
  formatWibDate,
  formatWibDateTime,
  getMyOrderDetail,
  orderQueryKeys,
  uploadPaymentProof,
} from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import { formatWhatsApp } from '../../utils/phone';
import { buildWaLink } from '../../utils/whatsapp';

const PROOF_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

function resolveProductionStageLabel(rawStatus: string, fulfillmentType: FulfillmentType): string {
  if (Object.values(PRODUCTION_STATUS).includes(rawStatus as ProductionStatus)) {
    return getProductionStatusLabel(rawStatus as ProductionStatus, fulfillmentType);
  }
  return rawStatus;
}

export default function MyOrderDetail() {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const justCreated = Boolean((location.state as { justCreated?: boolean } | null)?.justCreated);

  const orderQuery = useQuery({
    queryKey: orderQueryKeys.detail(uuid),
    queryFn: () => getMyOrderDetail(uuid),
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

  const [selectedPaymentUuid, setSelectedPaymentUuid] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHOD.BANK_TRANSFER);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Sinkronkan tagihan terpilih ke tagihan terbuka pertama
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

  // Set default metode bayar sesuai rekening yang tersedia saat order baru dimuat
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

  // Sinkronkan rekening tujuan ketika metode bayar berubah
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

  // Bersihkan object URL pratinjau agar tidak bocor memori
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const uploadMutation = useMutation({
    mutationFn: uploadPaymentProof,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orderQueryKeys.detail(uuid) }),
        queryClient.invalidateQueries({ queryKey: orderQueryKeys.all }),
      ]);
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
    });
  }

  if (orderQuery.isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="space-y-2 border-b border-line pb-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-72" />
        </div>
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
    const parsed = extractApiError(orderQuery.error, 'Detail pesanan tidak ditemukan.');
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState
          title="Pesanan tidak dapat dimuat"
          message={parsed.message}
          retry={() => void orderQuery.refetch()}
        />
        <div className="mt-4 text-center">
          <Link to="/pesanan" className="btn-secondary">
            Kembali ke Pesanan Saya
          </Link>
        </div>
      </div>
    );
  }

  const adminWhatsapp = configQuery.data?.adminWhatsapp ?? '';
  const waInquiryText = `Halo YNG Apparel, saya ingin menanyakan pesanan ${order.orderCode} (${order.totalQty} pcs, status: ${getProductionStatusLabel(order.productionStatus, order.fulfillmentType)}).`;
  const waInquiryHref = adminWhatsapp ? buildWaLink(adminWhatsapp, waInquiryText) : null;

  const bankAccounts = order.paymentAccounts.filter(
    (acc) => acc.method === PAYMENT_METHOD.BANK_TRANSFER
  );
  const qrisAccounts = order.paymentAccounts.filter((acc) => acc.method === PAYMENT_METHOD.QRIS);

  return (
    <div className="w-full space-y-6 pb-10">
      {justCreated ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-xs leading-relaxed text-status-ok sm:text-sm"
        >
          Pesanan <strong className="font-mono">{order.orderCode}</strong> berhasil dibuat. Silakan
          lakukan pembayaran ke rekening/QRIS di bawah ini dan unggah bukti pembayaran Anda.
        </div>
      ) : null}

      {/* Header Detail Pesanan */}
      <header className="space-y-4 border-b border-line pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/pesanan"
            className="inline-flex min-h-touch items-center text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            ← Kembali ke Daftar Pesanan
          </Link>

          {waInquiryHref ? (
            <a
              href={waInquiryHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary px-4 text-xs"
            >
              Tanya via WhatsApp
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="eyebrow">YNG Studio · Detail Pesanan</p>
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

      <div className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Kolom Kiri: Pembayaran, Upload Bukti, & Rincian Item */}
        <div className="w-full min-w-0 space-y-6 lg:col-span-7">
          {/* Status & Daftar Tahap Pembayaran */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <div>
                <p className="eyebrow">01 · Pembayaran Bertahap</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  Tagihan &amp; Status Verifikasi
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
                      ulang bukti pembayaran yang benar di form bawah.
                    </div>
                  ) : null}

                  {payment.proofImageUrl ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <a
                        href={payment.proofImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative inline-block overflow-hidden rounded-xl border border-line bg-white"
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

            {/* Instruksi Rekening Bank & QRIS Aktif */}
            <div className="mt-6 space-y-3 border-t border-line pt-5">
              <p className="text-xs font-semibold text-ink">
                Rekening Transfer &amp; QRIS Resmi YNG Apparel
              </p>

              {order.paymentAccounts.length === 0 ? (
                <p className="rounded-2xl border border-line bg-surface p-4 text-xs text-muted">
                  Belum ada rekening atau QRIS aktif terdaftar. Hubungi admin via WhatsApp untuk
                  konfirmasi tujuan transfer.
                </p>
              ) : (
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
              )}
            </div>

            {/* Form Unggah Bukti Pembayaran */}
            {unverifiedPayments.length > 0 ? (
              <form
                onSubmit={handleSubmitProof}
                className="mt-6 space-y-4 border-t border-line pt-5"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">Unggah Bukti Pembayaran</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Format JPG, PNG, atau WebP maksimal 5 MB. Unggahan baru menggantikan bukti yang
                    sebelumnya belum diverifikasi.
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
                      htmlFor="proof-payment-stage"
                      className="block text-xs font-semibold text-ink"
                    >
                      Pilih Tahap Tagihan
                    </label>
                    <select
                      id="proof-payment-stage"
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
                      htmlFor="proof-payment-account"
                      className="block text-xs font-semibold text-ink"
                    >
                      Rekening / QRIS Tujuan
                    </label>
                    <select
                      id="proof-payment-account"
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
                    htmlFor="proof-image-file"
                    className="block text-xs font-semibold text-ink"
                  >
                    Foto / Tangkapan Layar Bukti Transfer
                  </label>
                  <input
                    ref={fileInputRef}
                    id="proof-image-file"
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

          {/* Rincian Snapshot Item */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <div>
                <p className="eyebrow">02 · Spesifikasi Terkunci</p>
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
                <strong>Catatan Review Desain:</strong> {order.designReviewNotes}
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
              {order.items.map((item, idx) => (
                <article
                  key={`${order.transactionUuid}-item-${idx}`}
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
                        {s.lockedExtraCharge > 0 ? (
                          <span className="tabular-price text-[11px] text-muted">
                            (+{formatRupiah(s.lockedExtraCharge)})
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </div>

                  {item.prints.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {item.prints.map((print, pIdx) => (
                        <li
                          key={`${order.transactionUuid}-item-${idx}-print-${pIdx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs"
                        >
                          <span>
                            <strong className="text-ink">
                              {PRINT_POSITION_LABELS[print.printPosition]}
                            </strong>{' '}
                            <span className="text-muted">
                              ({print.printSizeCode} ·{' '}
                              <span className="tabular-price">
                                +{formatRupiah(print.lockedSpotPrice)}
                              </span>
                              /pcs)
                            </span>
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
                      <span className="font-semibold text-ink">Catatan Produksi: </span>
                      {item.productionNotes}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>

        {/* Kolom Kanan: Ringkasan Harga, Pengiriman & Tracking Resi, Foto QC, & Riwayat */}
        <aside className="w-full min-w-0 space-y-6 lg:col-span-5">
          {/* Ringkasan Snapshot Harga */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">Ringkasan Harga</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                Rincian Tagihan Pesanan
              </h2>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Subtotal item ({order.totalQty} pcs)</dt>
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
              <div className="flex items-center justify-between gap-2 text-xs">
                <dt className="text-muted">
                  Kewajiban awal (
                  {getPaymentSchemeLabel(order.paymentScheme, order.dpPercentSnapshot)})
                </dt>
                <dd className="tabular-price font-semibold text-ink">
                  {formatRupiah(order.dpRequiredAmount)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <dt className="font-semibold text-ink">Sisa Tagihan</dt>
                <dd className="tabular-price text-lg font-bold text-ink">
                  {formatRupiah(order.remainingBalance)}
                </dd>
              </div>
            </dl>

            {order.estimatedFinishDate ? (
              <p className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
                Estimasi selesai produksi:{' '}
                <strong className="tabular-price text-ink">
                  {formatWibDate(order.estimatedFinishDate)}
                </strong>
              </p>
            ) : null}
          </section>

          {/* Pengiriman & Pelacakan Resi */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">
                {order.fulfillmentType === FULFILLMENT_TYPE.SHIP
                  ? 'Pengiriman & Resi'
                  : 'Pengambilan di Workshop'}
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                {order.fulfillmentType === FULFILLMENT_TYPE.SHIP
                  ? 'Tujuan & Pelacakan Kurir'
                  : 'Informasi Pengambil'}
              </h2>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="font-semibold text-ink">{order.customerName}</p>
                <p className="tabular-price text-xs text-muted">
                  {formatWhatsApp(order.customerWhatsapp)}
                </p>
              </div>

              {order.fulfillmentType === FULFILLMENT_TYPE.SHIP ? (
                <>
                  <p className="text-xs leading-relaxed text-muted">
                    {order.fullAddress}, Kec. {order.districtName}, {order.cityName},{' '}
                    {order.provinceName} <span className="tabular-price">{order.postalCode}</span>
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
                          Kurir ini tidak memiliki tautan lacak web statis. Gunakan nomor resi di
                          atas pada aplikasi kurir terkait.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-line bg-surface p-3.5 text-xs text-muted">
                      Nomor resi dan kurir akan muncul setelah paket dikirim.
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-line bg-surface p-3.5 text-xs text-muted">
                  <p>Ambil langsung di workshop YNG Apparel, Batam.</p>
                  {order.shippedAt ? (
                    <p className="mt-1 font-semibold text-status-ok">
                      Siap diambil sejak {formatWibDateTime(order.shippedAt)}.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          {/* Foto QC (bila tersedia) */}
          {order.qcPhotos.length > 0 ? (
            <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
              <div className="border-b border-line pb-4">
                <p className="eyebrow">Quality Control</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  Foto Hasil Produksi ({order.qcPhotos.length})
                </h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {order.qcPhotos.map((photo, idx) => (
                  <a
                    key={`${photo.createdAt}-${idx}`}
                    href={photo.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group overflow-hidden rounded-2xl border border-line bg-surface"
                  >
                    <img
                      src={photo.photoUrl}
                      alt={`Foto QC #${idx + 1}`}
                      className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {/* Riwayat Status */}
          {order.statusHistory.length > 0 ? (
            <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
              <div className="border-b border-line pb-4">
                <p className="eyebrow">Linimasa</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  Riwayat Status Pesanan
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
                        {resolveProductionStageLabel(entry.toStatus, order.fulfillmentType)}
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
    </div>
  );
}
