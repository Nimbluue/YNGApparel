import { PAYMENT_STATUS, type AdminPaymentListItemDto, type PaymentStatus } from '@yng/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminFeedbackBanner } from '../../components/admin/AdminFeedbackBanner';
import { ImageLightboxModal } from '../../components/admin/ImageLightboxModal';
import { PaymentBadge, ProductionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Textarea } from '../../components/ui/Input';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import {
  adminOrderQueryKeys,
  listAdminPayments,
  rejectAdminPayment,
  verifyAdminPayment,
  type AdminPaymentsQueryParams,
} from '../../services/adminOrderService';
import { formatWibDateTime } from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';

type PaymentQueueTabKey =
  'PENDING_WITH_PROOF' | 'PENDING_NO_PROOF' | 'VERIFIED' | 'REJECTED' | 'ALL';

const QUEUE_TABS: ReadonlyArray<{
  key: PaymentQueueTabKey;
  label: string;
  filter: { status?: PaymentStatus; hasProof?: boolean };
}> = [
  {
    key: 'PENDING_WITH_PROOF',
    label: 'Menunggu Verifikasi',
    filter: { status: PAYMENT_STATUS.PENDING, hasProof: true },
  },
  {
    key: 'PENDING_NO_PROOF',
    label: 'Menunggu Bukti',
    filter: { status: PAYMENT_STATUS.PENDING, hasProof: false },
  },
  {
    key: 'VERIFIED',
    label: 'Terverifikasi',
    filter: { status: PAYMENT_STATUS.VERIFIED },
  },
  {
    key: 'REJECTED',
    label: 'Ditolak',
    filter: { status: PAYMENT_STATUS.REJECTED },
  },
  {
    key: 'ALL',
    label: 'Semua',
    filter: {},
  },
];

const PAGE_LIMIT = 20;

export default function PaymentsQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<PaymentQueueTabKey>('PENDING_WITH_PROOF');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<{ message: string; details: string[] } | null>(
    null
  );

  const [lightboxItem, setLightboxItem] = useState<AdminPaymentListItemDto | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<AdminPaymentListItemDto | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminPaymentListItemDto | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectFormError, setRejectFormError] = useState<string | null>(null);

  const currentTabConfig = QUEUE_TABS.find((t) => t.key === activeTab) ?? QUEUE_TABS[0];
  const queryParams: AdminPaymentsQueryParams = {
    ...currentTabConfig.filter,
    page,
    limit: PAGE_LIMIT,
  };

  const paymentsQuery = useQuery({
    queryKey: adminOrderQueryKeys.payments(queryParams),
    queryFn: () => listAdminPayments(queryParams),
  });

  async function invalidateAfterPaymentAction(orderTransactionUuid: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.paymentsAll }),
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.kanban }),
      queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.detail(orderTransactionUuid) }),
    ]);
  }

  const verifyMutation = useMutation({
    mutationFn: (payment: AdminPaymentListItemDto) =>
      verifyAdminPayment(payment.paymentUuid, { approve: true }),
    onSuccess: async (updated) => {
      setVerifyTarget(null);
      setActionError(null);
      toast(`Pembayaran #${updated.orderCode} berhasil diverifikasi.`, 'ok');
      await invalidateAfterPaymentAction(updated.orderTransactionUuid);
    },
    onError: (err) => {
      setVerifyTarget(null);
      setActionError(extractApiError(err, 'Gagal memverifikasi pembayaran.'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { payment: AdminPaymentListItemDto; reason: string }) =>
      rejectAdminPayment(input.payment.paymentUuid, { rejectionReason: input.reason }),
    onSuccess: async (updated) => {
      setRejectTarget(null);
      setRejectionReason('');
      setRejectFormError(null);
      setActionError(null);
      toast(`Bukti pembayaran #${updated.orderCode} telah ditolak.`, 'info');
      await invalidateAfterPaymentAction(updated.orderTransactionUuid);
    },
    onError: (err) => {
      const parsed = extractApiError(err, 'Gagal menolak bukti pembayaran.');
      setRejectFormError(parsed.message);
      setActionError(parsed);
    },
  });

  function handleOpenRejectModal(item: AdminPaymentListItemDto) {
    setRejectTarget(item);
    setRejectionReason('');
    setRejectFormError(null);
  }

  function handleSubmitReject() {
    if (!rejectTarget) return;
    const trimmed = rejectionReason.trim();
    if (trimmed.length < 3) {
      setRejectFormError('Alasan penolakan wajib diisi minimal 3 karakter.');
      return;
    }
    setRejectFormError(null);
    rejectMutation.mutate({ payment: rejectTarget, reason: trimmed });
  }

  const items = paymentsQuery.data?.items ?? [];
  const meta = paymentsQuery.data?.meta;

  return (
    <div className="w-full min-w-0 space-y-6">
      <section className="rounded-sm border border-line bg-white p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Ruang Produksi · Keuangan</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
              Antrean Pembayaran
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Periksa bukti transfer atau QRIS pelanggan sebelum pesanan masuk tahap produksi cetak
              atau pelunasan pengiriman.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={paymentsQuery.isFetching}
            onClick={() => void paymentsQuery.refetch()}
          >
            Muat Ulang
          </Button>
        </div>

        <div
          role="tablist"
          aria-label="Filter status pembayaran"
          className="mt-6 flex gap-2 overflow-x-auto border-t border-line pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {QUEUE_TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                className={`inline-flex min-h-touch shrink-0 items-center rounded-sm border px-4 py-2 font-display text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-white text-ink hover:border-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {actionError ? (
        <AdminFeedbackBanner
          variant="error"
          message={actionError.message}
          details={actionError.details}
          onDismiss={() => setActionError(null)}
        />
      ) : null}

      {paymentsQuery.isLoading ? (
        <div className="flex min-h-60 items-center justify-center rounded-sm border border-line bg-white p-10">
          <Spinner label="Memuat antrean pembayaran..." />
        </div>
      ) : paymentsQuery.isError ? (
        <ErrorState
          title="Gagal Memuat Antrean Pembayaran"
          message={
            extractApiError(paymentsQuery.error, 'Tidak dapat mengambil data pembayaran.').message
          }
          retry={() => void paymentsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Antrean pembayaran kosong"
          description="Belum ada transaksi pada kategori filter ini."
        />
      ) : (
        <>
          <div className="grid w-full grid-cols-1 gap-4">
            {items.map((item) => (
              <article
                key={item.paymentUuid}
                className="w-full min-w-0 rounded-sm border border-line bg-white p-4 sm:p-6"
              >
                <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-12 md:items-center">
                  {/* Info Order & Pembayaran */}
                  <div className="min-w-0 space-y-2 md:col-span-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/admin/orders/${item.orderTransactionUuid}`}
                        className="font-mono text-base font-bold tracking-wider text-ink tabular-nums underline-offset-4 hover:underline"
                      >
                        #{item.orderCode}
                      </Link>
                      <span className="rounded-sm border border-line bg-[#FAFAFA] px-2.5 py-0.5 text-xs font-semibold text-ink">
                        {item.paymentStageLabel}
                      </span>
                      <PaymentBadge
                        status={item.status}
                        proofImagePath={item.hasProof ? 'has-proof' : null}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <ProductionBadge status={item.productionStatus} />
                      <span>·</span>
                      <span className="font-medium text-ink">{item.customerName}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">{item.customerWhatsapp}</span>
                    </div>

                    <div className="pt-1">
                      <p className="text-xs text-muted">Nominal Tagihan</p>
                      <p className="tabular-price font-display text-2xl font-bold text-ink">
                        {formatRupiah(item.amount)}
                      </p>
                    </div>

                    <div className="text-xs text-muted tabular-nums">
                      {item.proofUploadedAt ? (
                        <p>Bukti diunggah: {formatWibDateTime(item.proofUploadedAt)}</p>
                      ) : (
                        <p>Dibuat: {formatWibDateTime(item.createdAt)}</p>
                      )}
                      {item.verifiedAt ? (
                        <p>Diverifikasi: {formatWibDateTime(item.verifiedAt)}</p>
                      ) : null}
                    </div>

                    {item.rejectionReason ? (
                      <div className="rounded-sm border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-status-err">
                        <span className="font-semibold">Alasan penolakan:</span>{' '}
                        {item.rejectionReason}
                      </div>
                    ) : null}
                  </div>

                  {/* Pratinjau Bukti Transfer */}
                  <div className="min-w-0 md:col-span-3">
                    {item.hasProof && item.proofImageUrl ? (
                      <button
                        type="button"
                        onClick={() => setLightboxItem(item)}
                        className="group relative flex w-full items-center justify-center overflow-hidden rounded-sm border border-line bg-[#FAFAFA] p-2 transition-colors hover:border-ink"
                      >
                        <img
                          src={item.proofImageUrl}
                          alt={`Bukti bayar #${item.orderCode}`}
                          className="h-36 w-full rounded-sm object-cover"
                        />
                        <span className="absolute right-3 bottom-3 rounded-sm bg-ink/85 px-3 py-1 text-[11px] font-semibold text-white">
                          Perbesar ↗
                        </span>
                      </button>
                    ) : (
                      <div className="flex h-36 w-full items-center justify-center rounded-sm border border-dashed border-line-strong bg-[#FAFAFA] p-4 text-center text-xs text-muted">
                        Pelanggan belum mengunggah bukti transfer.
                      </div>
                    )}
                  </div>

                  {/* Aksi Verifikasi / Tolak & Detail */}
                  <div className="flex flex-col gap-2.5 md:col-span-3 md:items-end">
                    {item.status === PAYMENT_STATUS.PENDING && item.hasProof ? (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="w-full md:w-auto md:min-w-[160px]"
                          onClick={() => setVerifyTarget(item)}
                        >
                          Verifikasi Lunas
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          className="w-full md:w-auto md:min-w-[160px]"
                          onClick={() => handleOpenRejectModal(item)}
                        >
                          Tolak Bukti
                        </Button>
                      </>
                    ) : null}

                    <Link
                      to={`/admin/orders/${item.orderTransactionUuid}`}
                      className="inline-flex min-h-touch w-full items-center justify-center rounded-sm border border-line-strong px-4 font-display text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-[#FAFAFA] md:w-auto md:min-w-[160px]"
                    >
                      Detail Order →
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {meta && meta.totalPages > 1 ? (
            <div className="flex flex-col items-center justify-between gap-3 rounded-sm border border-line bg-white px-5 py-4 sm:flex-row">
              <p className="text-xs text-muted tabular-nums">
                Halaman {meta.page} dari {meta.totalPages} · Total {meta.total} tagihan
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage((prev) => Math.min(meta.totalPages, prev + 1))}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <ImageLightboxModal
        open={Boolean(lightboxItem)}
        imageUrl={lightboxItem?.proofImageUrl ?? null}
        title={
          lightboxItem
            ? `Bukti Pembayaran #${lightboxItem.orderCode} (${lightboxItem.paymentStageLabel})`
            : 'Bukti Pembayaran'
        }
        subtitle={
          lightboxItem
            ? `${lightboxItem.customerName} · ${formatRupiah(lightboxItem.amount)}`
            : undefined
        }
        onClose={() => setLightboxItem(null)}
      />

      <ConfirmDialog
        open={Boolean(verifyTarget)}
        onClose={() => setVerifyTarget(null)}
        onConfirm={() => {
          if (verifyTarget) verifyMutation.mutate(verifyTarget);
        }}
        title="Verifikasi Bukti Pembayaran"
        message={
          verifyTarget
            ? `Pastikan mutasi rekening sudah sesuai nominal ${formatRupiah(verifyTarget.amount)} untuk pesanan #${verifyTarget.orderCode} (${verifyTarget.paymentStageLabel}). Lanjutkan verifikasi?`
            : ''
        }
        confirmLabel="Ya, Verifikasi"
        loading={verifyMutation.isPending}
      />

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => {
          if (!rejectMutation.isPending) setRejectTarget(null);
        }}
        title={
          rejectTarget
            ? `Tolak Bukti Pembayaran #${rejectTarget.orderCode}`
            : 'Tolak Bukti Pembayaran'
        }
        description="Pelanggan dapat mengunggah ulang bukti transfer setelah penolakan tercatat."
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={rejectMutation.isPending}
              onClick={() => setRejectTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={rejectMutation.isPending}
              onClick={handleSubmitReject}
            >
              Tolak Bukti
            </Button>
          </div>
        }
      >
        <Textarea
          label="Alasan Penolakan"
          placeholder="Contoh: Nominal transfer kurang atau foto buram tidak terbaca."
          rows={3}
          value={rejectionReason}
          onChange={(event) => {
            setRejectionReason(event.target.value);
            if (rejectFormError) setRejectFormError(null);
          }}
          error={rejectFormError ?? undefined}
          hint="Minimal 3 karakter, maksimal 255 karakter."
        />
      </Modal>
    </div>
  );
}
