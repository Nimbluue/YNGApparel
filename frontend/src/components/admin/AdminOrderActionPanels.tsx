import {
  COURIERS,
  DESIGN_STATUS,
  FULFILLMENT_LABELS,
  FULFILLMENT_TYPE,
  PRODUCTION_STATUS,
  TRACKING_RECEIPT_REGEX,
  getPaymentSchemeLabel,
  type AdminOrderDetailDto,
  type CourierCode,
  type DesignStatus,
  type FulfillmentType,
  type ProductionStatus,
} from '@yng/shared';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { useToast } from '../ui/toastContext';
import {
  cancelAdminOrder,
  reviewAdminOrderDesign,
  transitionAdminOrderStatus,
  updateAdminOrderAddress,
  updateAdminOrderDiscount,
  updateAdminOrderNotes,
  updateAdminOrderShipment,
  updateAdminOrderShippingCost,
} from '../../services/adminOrderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import { openWaLink } from '../../utils/whatsapp';
import { AdminFeedbackBanner } from './AdminFeedbackBanner';
import {
  buildAdminWaTemplates,
  getTotalVerifiedPaid,
  getValidNextStatuses,
} from './adminOrderHelpers';

interface AdminOrderActionPanelsProps {
  order: AdminOrderDetailDto;
  onUpdated: (updated: AdminOrderDetailDto) => Promise<void>;
}

const DEFAULT_COURIER: CourierCode = 'JNE';

function resolveInitialCourier(courier: string | null): CourierCode {
  if (!courier) return DEFAULT_COURIER;
  const matched = COURIERS.find((item) => item.code === courier);
  return matched ? matched.code : DEFAULT_COURIER;
}

export function AdminOrderActionPanels({ order, onUpdated }: AdminOrderActionPanelsProps) {
  const { toast } = useToast();
  const [panelError, setPanelError] = useState<{ message: string; details: string[] } | null>(null);

  const isTerminal =
    order.productionStatus === PRODUCTION_STATUS.COMPLETED ||
    order.productionStatus === PRODUCTION_STATUS.CANCELLED;

  const validNextStatuses = useMemo(() => getValidNextStatuses(order), [order]);
  const [selectedNextStatus, setSelectedNextStatus] = useState<ProductionStatus | ''>(
    validNextStatuses[0]?.toStatus ?? ''
  );
  const [statusNotes, setStatusNotes] = useState('');

  const effectiveNextOption =
    validNextStatuses.find((opt) => opt.toStatus === selectedNextStatus) ??
    validNextStatuses[0] ??
    null;

  // Review desain
  const [designReviewNotes, setDesignReviewNotes] = useState(order.designReviewNotes ?? '');

  // Ongkir & Resi
  const [shippingCostInput, setShippingCostInput] = useState(String(order.shippingCost));
  const [shippingCostNotes, setShippingCostNotes] = useState('');
  const [shippingCourier, setShippingCourier] = useState<CourierCode>(
    resolveInitialCourier(order.shippingCourier)
  );
  const [shippingService, setShippingService] = useState(order.shippingService ?? '');
  const [trackingReceiptNumber, setTrackingReceiptNumber] = useState(
    order.trackingReceiptNumber ?? ''
  );

  // Diskon, alamat & catatan
  const [discountAmountInput, setDiscountAmountInput] = useState(String(order.discountAmount));
  const [discountNote, setDiscountNote] = useState(order.discountNote ?? '');
  const [adminNotes, setAdminNotes] = useState(order.adminNotes ?? '');
  const [estimatedFinishDate, setEstimatedFinishDate] = useState(
    order.estimatedFinishDate ? order.estimatedFinishDate.slice(0, 10) : ''
  );

  const [editFulfillmentType, setEditFulfillmentType] = useState<FulfillmentType>(
    order.fulfillmentType
  );
  const [editCustomerName, setEditCustomerName] = useState(order.customerName);
  const [editCustomerWhatsapp, setEditCustomerWhatsapp] = useState(order.customerWhatsapp);
  const [editProvinceName, setEditProvinceName] = useState(order.provinceName ?? '');
  const [editCityName, setEditCityName] = useState(order.cityName ?? '');
  const [editDistrictName, setEditDistrictName] = useState(order.districtName ?? '');
  const [editPostalCode, setEditPostalCode] = useState(order.postalCode ?? '');
  const [editFullAddress, setEditFullAddress] = useState(order.fullAddress ?? '');

  // Modal pembatalan + refund
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundAmountInput, setRefundAmountInput] = useState('0');
  const [cancelFormError, setCancelFormError] = useState<string | null>(null);

  const totalVerifiedPaid = useMemo(() => getTotalVerifiedPaid(order), [order]);
  const waTemplates = useMemo(
    () =>
      buildAdminWaTemplates(
        order,
        typeof window !== 'undefined' ? window.location.origin : 'https://yngapparel.id'
      ),
    [order]
  );

  async function handleMutationSuccess(updated: AdminOrderDetailDto, successMessage: string) {
    setPanelError(null);
    await onUpdated(updated);
    toast(successMessage, 'ok');
  }

  function handleMutationError(err: unknown, fallback: string) {
    setPanelError(extractApiError(err, fallback));
  }

  const transitionMutation = useMutation({
    mutationFn: (input: { toStatus: ProductionStatus; notes: string | null }) =>
      transitionAdminOrderStatus(order.transactionUuid, input),
    onSuccess: (updated) =>
      void handleMutationSuccess(updated, 'Status produksi pesanan berhasil diperbarui.'),
    onError: (err) => handleMutationError(err, 'Gagal mengubah status produksi pesanan.'),
  });

  const designMutation = useMutation({
    mutationFn: (input: { designStatus: DesignStatus; designReviewNotes: string | null }) =>
      reviewAdminOrderDesign(order.transactionUuid, input),
    onSuccess: (updated) =>
      void handleMutationSuccess(updated, 'Status review desain berhasil disimpan.'),
    onError: (err) => handleMutationError(err, 'Gagal menyimpan status review desain.'),
  });

  const shippingCostMutation = useMutation({
    mutationFn: (input: { shippingCost: number; notes: string | null }) =>
      updateAdminOrderShippingCost(order.transactionUuid, input),
    onSuccess: (updated) =>
      void handleMutationSuccess(updated, 'Ongkos kirim pesanan berhasil diperbarui.'),
    onError: (err) => handleMutationError(err, 'Gagal memperbarui ongkos kirim.'),
  });

  const shipmentMutation = useMutation({
    mutationFn: (input: {
      shippingCourier: CourierCode;
      shippingService: string | null;
      trackingReceiptNumber: string;
    }) => updateAdminOrderShipment(order.transactionUuid, input),
    onSuccess: (updated) =>
      void handleMutationSuccess(updated, 'Kurir dan nomor resi berhasil disimpan.'),
    onError: (err) => handleMutationError(err, 'Gagal menyimpan kurir dan nomor resi.'),
  });

  const discountMutation = useMutation({
    mutationFn: (input: { discountAmount: number; discountNote: string | null }) =>
      updateAdminOrderDiscount(order.transactionUuid, input),
    onSuccess: (updated) =>
      void handleMutationSuccess(updated, 'Diskon pesanan berhasil diperbarui.'),
    onError: (err) => handleMutationError(err, 'Gagal memperbarui diskon pesanan.'),
  });

  const notesMutation = useMutation({
    mutationFn: (input: { adminNotes: string | null; estimatedFinishDate: string | null }) =>
      updateAdminOrderNotes(order.transactionUuid, input),
    onSuccess: (updated) =>
      void handleMutationSuccess(updated, 'Catatan admin dan estimasi selesai disimpan.'),
    onError: (err) => handleMutationError(err, 'Gagal menyimpan catatan admin.'),
  });

  const addressMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminOrderAddress>[1]) =>
      updateAdminOrderAddress(order.transactionUuid, payload),
    onSuccess: (updated) =>
      void handleMutationSuccess(updated, 'Data penerima & alamat berhasil diperbarui.'),
    onError: (err) => handleMutationError(err, 'Gagal memperbarui alamat pesanan.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (input: { reason: string; refundedAmount?: number }) =>
      cancelAdminOrder(order.transactionUuid, input),
    onSuccess: async (updated) => {
      setCancelModalOpen(false);
      setCancelFormError(null);
      await handleMutationSuccess(updated, 'Pesanan telah dibatalkan.');
    },
    onError: (err) => {
      const parsed = extractApiError(err, 'Gagal membatalkan pesanan.');
      setCancelFormError(parsed.message);
      setPanelError(parsed);
    },
  });

  function handleTransitionSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!effectiveNextOption || !effectiveNextOption.enabled) return;
    transitionMutation.mutate({
      toStatus: effectiveNextOption.toStatus,
      notes: statusNotes.trim() || null,
    });
  }

  function handleReviewDesign(targetStatus: DesignStatus) {
    const trimmedNotes = designReviewNotes.trim();
    if (targetStatus === DESIGN_STATUS.NEED_REVISION && trimmedNotes.length < 3) {
      setPanelError({
        message: 'Catatan revisi desain wajib diisi minimal 3 karakter saat meminta revisi.',
        details: [],
      });
      return;
    }
    designMutation.mutate({
      designStatus: targetStatus,
      designReviewNotes: trimmedNotes || null,
    });
  }

  function handleShippingCostSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedCost = Number(shippingCostInput);
    if (!Number.isInteger(parsedCost) || parsedCost < 0) {
      setPanelError({
        message: 'Ongkos kirim harus berupa bilangan bulat rupiah minimal 0.',
        details: [],
      });
      return;
    }
    shippingCostMutation.mutate({
      shippingCost: parsedCost,
      notes: shippingCostNotes.trim() || null,
    });
  }

  function handleShipmentSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedReceipt = trackingReceiptNumber.trim();
    if (!TRACKING_RECEIPT_REGEX.test(trimmedReceipt)) {
      setPanelError({
        message: 'Nomor resi harus 4–40 karakter alfanumerik atau tanda hubung (-).',
        details: [],
      });
      return;
    }
    shipmentMutation.mutate({
      shippingCourier,
      shippingService: shippingService.trim() || null,
      trackingReceiptNumber: trimmedReceipt,
    });
  }

  function handleDiscountSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedDiscount = Number(discountAmountInput);
    if (!Number.isInteger(parsedDiscount) || parsedDiscount < 0) {
      setPanelError({
        message: 'Nominal diskon harus berupa bilangan bulat rupiah minimal 0.',
        details: [],
      });
      return;
    }
    discountMutation.mutate({
      discountAmount: parsedDiscount,
      discountNote: discountNote.trim() || null,
    });
  }

  function handleNotesSubmit(event: React.FormEvent) {
    event.preventDefault();
    notesMutation.mutate({
      adminNotes: adminNotes.trim() || null,
      estimatedFinishDate: estimatedFinishDate.trim() || null,
    });
  }

  function handleAddressSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedPostal = editPostalCode.trim();
    if (trimmedPostal && !/^[0-9]{5}$/.test(trimmedPostal)) {
      setPanelError({
        message: 'Kode pos harus terdiri dari 5 digit angka.',
        details: [],
      });
      return;
    }

    addressMutation.mutate({
      fulfillmentType: editFulfillmentType,
      customerName: editCustomerName.trim(),
      customerWhatsapp: editCustomerWhatsapp.trim(),
      provinceName: editProvinceName.trim() || null,
      cityName: editCityName.trim() || null,
      districtName: editDistrictName.trim() || null,
      postalCode: trimmedPostal || null,
      fullAddress: editFullAddress.trim() || null,
    });
  }

  function handleOpenCancelModal() {
    setCancelReason('');
    setRefundAmountInput(String(totalVerifiedPaid));
    setCancelFormError(null);
    setCancelModalOpen(true);
  }

  function handleConfirmCancel() {
    const trimmedReason = cancelReason.trim();
    if (trimmedReason.length < 3) {
      setCancelFormError('Alasan pembatalan wajib diisi minimal 3 karakter.');
      return;
    }
    const parsedRefund = Number(refundAmountInput);
    if (!Number.isInteger(parsedRefund) || parsedRefund < 0) {
      setCancelFormError('Nominal refund harus berupa bilangan bulat rupiah minimal 0.');
      return;
    }
    if (parsedRefund > totalVerifiedPaid) {
      setCancelFormError(
        `Nominal refund tidak boleh melebihi total pembayaran terverifikasi (${formatRupiah(totalVerifiedPaid)}).`
      );
      return;
    }
    setCancelFormError(null);
    cancelMutation.mutate({
      reason: trimmedReason,
      refundedAmount: parsedRefund,
    });
  }

  async function handleCopyWaText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Teks pesan WhatsApp disalin.', 'ok');
    } catch {
      toast('Gagal menyalin ke clipboard browser.', 'err');
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      {panelError ? (
        <AdminFeedbackBanner
          variant="error"
          message={panelError.message}
          details={panelError.details}
          onDismiss={() => setPanelError(null)}
        />
      ) : null}

      {/* 1. Panel Transisi Status Produksi */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <p className="eyebrow">Alur Produksi</p>
        <h2 className="mt-1 font-display text-lg font-semibold text-ink">
          Pindahkan Tahap Produksi
        </h2>

        {validNextStatuses.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-muted">
            Pesanan sudah berada pada status akhir ({order.productionStatus}) sehingga tidak ada
            transisi tahap lanjutan.
          </p>
        ) : (
          <form onSubmit={handleTransitionSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              {validNextStatuses.map((option) => {
                const isSelected = effectiveNextOption?.toStatus === option.toStatus;
                return (
                  <button
                    key={option.toStatus}
                    type="button"
                    onClick={() => setSelectedNextStatus(option.toStatus)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-ink bg-surface'
                        : 'border-line bg-white hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-xs font-bold text-ink">
                        → {option.label}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          option.enabled
                            ? 'bg-emerald-50 text-status-ok'
                            : 'bg-amber-50 text-status-warn'
                        }`}
                      >
                        {option.enabled ? 'Siap Dipindah' : 'Syarat Belum Lengkap'}
                      </span>
                    </div>

                    {option.blockedReasons.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-status-warn">
                        {option.blockedReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <Textarea
              label="Catatan Transisi (Opsional)"
              placeholder="Catatan untuk riwayat perubahan status..."
              rows={2}
              value={statusNotes}
              onChange={(event) => setStatusNotes(event.target.value)}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={!effectiveNextOption?.enabled}
              loading={transitionMutation.isPending}
            >
              Pindahkan ke Tahap Ini
            </Button>
          </form>
        )}
      </section>

      {/* 2. Panel Review Desain */}
      {!isTerminal ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <p className="eyebrow">Cek File &amp; Pra-Cetak</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink">Review Desain</h2>

          <div className="mt-4 space-y-3">
            <Textarea
              label="Catatan Review Desain"
              placeholder="Wajib diisi jika meminta revisi desain ke pelanggan..."
              rows={3}
              value={designReviewNotes}
              onChange={(event) => setDesignReviewNotes(event.target.value)}
            />

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={
                  designMutation.isPending &&
                  designMutation.variables?.designStatus === DESIGN_STATUS.APPROVED
                }
                disabled={designMutation.isPending}
                onClick={() => handleReviewDesign(DESIGN_STATUS.APPROVED)}
              >
                Setujui Desain
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={
                  designMutation.isPending &&
                  designMutation.variables?.designStatus === DESIGN_STATUS.NEED_REVISION
                }
                disabled={designMutation.isPending}
                onClick={() => handleReviewDesign(DESIGN_STATUS.NEED_REVISION)}
              >
                Minta Revisi
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* 3. Panel Ongkos Kirim & Kurir/Resi */}
      {order.fulfillmentType === FULFILLMENT_TYPE.SHIP ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <p className="eyebrow">Logistik &amp; Pengiriman</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink">
            Ongkos Kirim &amp; Nomor Resi
          </h2>

          {!isTerminal ? (
            <form
              onSubmit={handleShippingCostSubmit}
              className="mt-4 space-y-3 border-b border-line pb-5"
            >
              <Input
                label="Ongkos Kirim (Rp)"
                type="number"
                min={0}
                step={1}
                value={shippingCostInput}
                onChange={(event) => setShippingCostInput(event.target.value)}
                hint={`Ongkir saat ini: ${formatRupiah(order.shippingCost)} (${getPaymentSchemeLabel(order.paymentScheme, order.dpPercentSnapshot)}).`}
              />
              <Input
                label="Catatan Ongkir (Opsional)"
                placeholder="Mis. JNE REG 2 kg"
                value={shippingCostNotes}
                onChange={(event) => setShippingCostNotes(event.target.value)}
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="w-full"
                loading={shippingCostMutation.isPending}
              >
                Simpan / Revisi Ongkir
              </Button>
            </form>
          ) : null}

          <form onSubmit={handleShipmentSubmit} className="mt-4 space-y-3">
            <Select
              label="Kurir Resmi"
              value={shippingCourier}
              disabled={isTerminal}
              onChange={(event) => setShippingCourier(event.target.value as CourierCode)}
            >
              {COURIERS.map((courier) => (
                <option key={courier.code} value={courier.code}>
                  {courier.name} ({courier.code})
                </option>
              ))}
            </Select>

            <Input
              label="Layanan Kurir (Opsional)"
              placeholder="Contoh: REG / YES / Kargo"
              value={shippingService}
              disabled={isTerminal}
              onChange={(event) => setShippingService(event.target.value)}
            />

            <Input
              label="Nomor Resi"
              placeholder="Contoh: JNE-123456789"
              value={trackingReceiptNumber}
              disabled={isTerminal}
              onChange={(event) => setTrackingReceiptNumber(event.target.value)}
              hint="4–40 karakter huruf, angka, atau tanda hubung (-)."
            />

            {!isTerminal ? (
              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="w-full"
                loading={shipmentMutation.isPending}
              >
                Simpan Kurir &amp; Resi
              </Button>
            ) : null}

            {order.trackingUrl ? (
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-touch w-full items-center justify-center rounded-full border border-line-strong bg-surface px-4 font-display text-xs font-semibold text-ink transition-colors hover:border-ink"
              >
                Buka Lacak Resi Eksternal ({order.courierInfo?.name ?? order.shippingCourier}) ↗
              </a>
            ) : null}
          </form>
        </section>
      ) : null}

      {/* 4. Panel Template WhatsApp Cepat (Ringkas / Collapsible) */}
      <details className="rounded-2xl border border-line bg-white p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <div>
            <p className="eyebrow">Komunikasi Pelanggan</p>
            <h2 className="mt-1 font-display text-base font-semibold text-ink">
              Template Pesan WhatsApp ({waTemplates.length})
            </h2>
          </div>
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold text-muted">
            Buka / Tutup
          </span>
        </summary>

        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          Tautan <span className="font-mono">wa.me</span> ke{' '}
          <span className="font-mono tabular-nums">{order.customerWhatsapp}</span>:
        </p>

        <ul className="mt-3 space-y-2">
          {waTemplates.map((tpl) => (
            <li
              key={tpl.key}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2"
            >
              <span className="min-w-0 truncate font-display text-xs font-semibold text-ink">
                {tpl.label}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openWaLink(order.customerWhatsapp, tpl.message)}
                  className="inline-flex min-h-touch items-center rounded-full bg-ink px-3 font-display text-[11px] font-semibold text-white transition-colors hover:bg-neutral-800"
                >
                  WA ↗
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyWaText(tpl.message)}
                  className="inline-flex min-h-touch items-center rounded-full border border-line-strong bg-white px-3 font-display text-[11px] font-semibold text-ink transition-colors hover:border-ink"
                >
                  Salin
                </button>
              </div>
            </li>
          ))}
        </ul>
      </details>

      {/* 5. Panel Penyesuaian (Diskon, Alamat, Catatan Admin) */}
      <section className="rounded-2xl border border-line bg-white p-5 space-y-4">
        <div>
          <p className="eyebrow">Penyesuaian Data</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink">
            Diskon, Alamat &amp; Catatan
          </h2>
        </div>

        <details className="rounded-xl border border-line bg-surface p-3.5">
          <summary className="cursor-pointer font-display text-xs font-semibold text-ink">
            Atur Diskon Pesanan (Saat ini {formatRupiah(order.discountAmount)})
          </summary>
          <form
            onSubmit={handleDiscountSubmit}
            className="mt-3 space-y-3 border-t border-line pt-3"
          >
            <Input
              label="Nominal Diskon (Rp)"
              type="number"
              min={0}
              step={1}
              disabled={isTerminal}
              value={discountAmountInput}
              onChange={(event) => setDiscountAmountInput(event.target.value)}
            />
            <Input
              label="Catatan Diskon (Opsional)"
              placeholder="Contoh: Promo komunitas 10%"
              disabled={isTerminal}
              value={discountNote}
              onChange={(event) => setDiscountNote(event.target.value)}
            />
            {!isTerminal ? (
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="w-full"
                loading={discountMutation.isPending}
              >
                Simpan Diskon
              </Button>
            ) : null}
          </form>
        </details>

        <details className="rounded-xl border border-line bg-surface p-3.5">
          <summary className="cursor-pointer font-display text-xs font-semibold text-ink">
            Catatan Internal Admin &amp; Estimasi Selesai
          </summary>
          <form onSubmit={handleNotesSubmit} className="mt-3 space-y-3 border-t border-line pt-3">
            <Input
              label="Estimasi Selesai"
              type="date"
              value={estimatedFinishDate}
              onChange={(event) => setEstimatedFinishDate(event.target.value)}
            />
            <Textarea
              label="Catatan Admin Internal"
              placeholder="Catatan internal workshop (tidak ditampilkan ke tracker publik)..."
              rows={3}
              value={adminNotes}
              onChange={(event) => setAdminNotes(event.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="w-full"
              loading={notesMutation.isPending}
            >
              Simpan Catatan
            </Button>
          </form>
        </details>

        <details className="rounded-xl border border-line bg-surface p-3.5">
          <summary className="cursor-pointer font-display text-xs font-semibold text-ink">
            Edit Metode Kirim, Penerima &amp; Alamat
          </summary>
          <form onSubmit={handleAddressSubmit} className="mt-3 space-y-3 border-t border-line pt-3">
            <Select
              label="Metode Pemenuhan"
              value={editFulfillmentType}
              disabled={isTerminal}
              onChange={(event) => setEditFulfillmentType(event.target.value as FulfillmentType)}
            >
              <option value={FULFILLMENT_TYPE.SHIP}>
                {FULFILLMENT_LABELS[FULFILLMENT_TYPE.SHIP]}
              </option>
              <option value={FULFILLMENT_TYPE.PICKUP}>
                {FULFILLMENT_LABELS[FULFILLMENT_TYPE.PICKUP]}
              </option>
            </Select>
            <Input
              label="Nama Penerima / Pelanggan"
              disabled={isTerminal}
              value={editCustomerName}
              onChange={(event) => setEditCustomerName(event.target.value)}
            />
            <Input
              label="Nomor WhatsApp"
              disabled={isTerminal}
              value={editCustomerWhatsapp}
              onChange={(event) => setEditCustomerWhatsapp(event.target.value)}
            />
            {editFulfillmentType === FULFILLMENT_TYPE.SHIP ? (
              <>
                <Input
                  label="Provinsi"
                  disabled={isTerminal}
                  value={editProvinceName}
                  onChange={(event) => setEditProvinceName(event.target.value)}
                />
                <Input
                  label="Kota / Kabupaten"
                  disabled={isTerminal}
                  value={editCityName}
                  onChange={(event) => setEditCityName(event.target.value)}
                />
                <Input
                  label="Kecamatan"
                  disabled={isTerminal}
                  value={editDistrictName}
                  onChange={(event) => setEditDistrictName(event.target.value)}
                />
                <Input
                  label="Kode Pos (5 digit)"
                  disabled={isTerminal}
                  value={editPostalCode}
                  onChange={(event) => setEditPostalCode(event.target.value)}
                />
                <Textarea
                  label="Alamat Lengkap"
                  rows={2}
                  disabled={isTerminal}
                  value={editFullAddress}
                  onChange={(event) => setEditFullAddress(event.target.value)}
                />
              </>
            ) : null}
            {!isTerminal ? (
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="w-full"
                loading={addressMutation.isPending}
              >
                Simpan Data Penerima &amp; Alamat
              </Button>
            ) : null}
          </form>
        </details>
      </section>

      {/* 6. Zona Pembatalan & Refund */}
      {!isTerminal ? (
        <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5">
          <p className="text-xs font-semibold text-status-err">Tindakan Berisiko</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink">
            Pembatalan &amp; Refund
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Membatalkan pesanan tidak dapat dikembalikan ke antrean produksi. Dana terverifikasi
            tercatat:{' '}
            <span className="tabular-price font-semibold text-ink">
              {formatRupiah(totalVerifiedPaid)}
            </span>
            .
          </p>
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="mt-4 w-full"
            onClick={handleOpenCancelModal}
          >
            Batalkan Pesanan
          </Button>
        </section>
      ) : null}

      <Modal
        open={cancelModalOpen}
        onClose={() => {
          if (!cancelMutation.isPending) setCancelModalOpen(false);
        }}
        title={`Batalkan Pesanan #${order.orderCode}`}
        description="Catat alasan pembatalan dan nominal refund apabila ada pembayaran yang sudah terverifikasi."
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={cancelMutation.isPending}
              onClick={() => setCancelModalOpen(false)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={cancelMutation.isPending}
              onClick={handleConfirmCancel}
            >
              Ya, Batalkan Order
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Textarea
            label="Alasan Pembatalan"
            placeholder="Contoh: Dibatalkan atas permintaan pelanggan sebelum cetak."
            rows={3}
            value={cancelReason}
            onChange={(event) => {
              setCancelReason(event.target.value);
              if (cancelFormError) setCancelFormError(null);
            }}
            hint="Minimal 3 karakter."
          />

          <Input
            label="Nominal Refund (Rp)"
            type="number"
            min={0}
            max={totalVerifiedPaid}
            step={1}
            value={refundAmountInput}
            onChange={(event) => {
              setRefundAmountInput(event.target.value);
              if (cancelFormError) setCancelFormError(null);
            }}
            hint={`Maksimal sesuai pembayaran terverifikasi: ${formatRupiah(totalVerifiedPaid)}.`}
          />

          {cancelFormError ? (
            <p className="text-xs font-medium text-status-err" role="alert">
              {cancelFormError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
