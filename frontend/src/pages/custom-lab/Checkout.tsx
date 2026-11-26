import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FULFILLMENT_TYPE,
  PAYMENT_SCHEME,
  type CreateOrderRequestDto,
  type FulfillmentType,
  type PaymentScheme,
  type UserAddressDto,
} from '@yng/shared';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/toastContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCartStore } from '../../lib/store';
import { listAddresses } from '../../services/accountService';
import { ApiClientError } from '../../services/api';
import { cartQueryKeys, getCartItems } from '../../services/cartService';
import { catalogQueryKeys, getCatalogConfig } from '../../services/catalogService';
import {
  clearCheckoutSelection,
  createOrder,
  orderQueryKeys,
  readCheckoutSelection,
  saveCheckoutSelection,
} from '../../services/orderService';
import { extractApiError } from '../../utils/apiError';
import { formatRupiah } from '../../utils/formatRupiah';
import { generateIdempotencyKey } from '../../utils/idempotency';
import {
  getLocalizedPaymentSchemeLabel,
  getLocalizedPrintPositionLabel,
} from '../../utils/localizedLabels';
import { formatWhatsApp, normalizeWhatsApp } from '../../utils/phone';

interface ShippingAddressFormState {
  recipientName: string;
  recipientWhatsapp: string;
  provinceName: string;
  cityName: string;
  districtName: string;
  postalCode: string;
  fullAddress: string;
}

const EMPTY_SHIPPING_FORM: ShippingAddressFormState = {
  recipientName: '',
  recipientWhatsapp: '',
  provinceName: '',
  cityName: '',
  districtName: '',
  postalCode: '',
  fullAddress: '',
};

export default function Checkout() {
  const { locale, t, pick } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { checkedItems, uncheckAll } = useCartStore();

  const stateUuids = useMemo(() => {
    const rawState = location.state as { cartItemUuids?: unknown } | null;
    if (Array.isArray(rawState?.cartItemUuids)) {
      return rawState.cartItemUuids.filter(
        (uuid): uuid is string => typeof uuid === 'string' && uuid.length > 0
      );
    }
    return [];
  }, [location.state]);

  const targetUuids = useMemo(() => {
    if (stateUuids.length > 0) return stateUuids;
    if (checkedItems.size > 0) return [...checkedItems];
    return readCheckoutSelection();
  }, [checkedItems, stateUuids]);

  useEffect(() => {
    if (targetUuids.length > 0) {
      saveCheckoutSelection(targetUuids);
    }
  }, [targetUuids]);

  const cartQuery = useQuery({
    queryKey: cartQueryKeys.items,
    queryFn: getCartItems,
  });

  const addressesQuery = useQuery({
    queryKey: ['account', 'addresses'] as const,
    queryFn: listAddresses,
  });

  const configQuery = useQuery({
    queryKey: catalogQueryKeys.config,
    queryFn: getCatalogConfig,
  });

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(FULFILLMENT_TYPE.SHIP);
  const [addressMode, setAddressMode] = useState<'saved' | 'new'>('saved');
  const [selectedAddressUuid, setSelectedAddressUuid] = useState<string | null>(null);
  const [shippingForm, setShippingForm] = useState<ShippingAddressFormState>(EMPTY_SHIPPING_FORM);
  const [pickupName, setPickupName] = useState('');
  const [pickupWhatsapp, setPickupWhatsapp] = useState('');
  const [paymentScheme, setPaymentScheme] = useState<PaymentScheme>(PAYMENT_SCHEME.FULL);
  const [formError, setFormError] = useState<string | null>(null);

  const selectionSignature = targetUuids.join(',');
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());
  const prevSignatureRef = useRef<string>(selectionSignature);

  useEffect(() => {
    if (prevSignatureRef.current !== selectionSignature) {
      prevSignatureRef.current = selectionSignature;
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
  }, [selectionSignature]);

  // Isi bawaan nama & WA dari profil user jika kolom masih kosong
  useEffect(() => {
    if (!user) return;
    const defaultWa = user.whatsapp ? formatWhatsApp(user.whatsapp) : '';
    setPickupName((prev) => (prev.trim() ? prev : user.fullName));
    setPickupWhatsapp((prev) => (prev.trim() ? prev : defaultWa));
    setShippingForm((prev) => ({
      ...prev,
      recipientName: prev.recipientName.trim() ? prev.recipientName : user.fullName,
      recipientWhatsapp: prev.recipientWhatsapp.trim() ? prev.recipientWhatsapp : defaultWa,
    }));
  }, [user]);

  const addresses: UserAddressDto[] = useMemo(
    () => addressesQuery.data ?? [],
    [addressesQuery.data]
  );

  // Sinkronkan mode & alamat tersimpan bawaan
  useEffect(() => {
    if (addressesQuery.isLoading) return;
    if (addresses.length === 0) {
      setAddressMode('new');
      setSelectedAddressUuid(null);
      return;
    }
    const stillExists =
      selectedAddressUuid !== null &&
      addresses.some((addr) => addr.addressUuid === selectedAddressUuid);
    if (!stillExists) {
      const preferred = addresses.find((addr) => addr.isDefault) ?? addresses[0];
      setSelectedAddressUuid(preferred ? preferred.addressUuid : null);
    }
  }, [addresses, addressesQuery.isLoading, selectedAddressUuid]);

  const selectedItems = useMemo(() => {
    const allItems = cartQuery.data?.items ?? [];
    const targetSet = new Set(targetUuids);
    return allItems.filter((item) => targetSet.has(item.cartItemUuid));
  }, [cartQuery.data?.items, targetUuids]);

  const checkoutSummary = useMemo(() => {
    const dpMinQty = cartQuery.data?.summary.dpMinQty ?? configQuery.data?.dpMinQty ?? 12;
    const dpPercent = cartQuery.data?.summary.dpPercent ?? configQuery.data?.dpPercent ?? 70;
    const hasUnavailable = selectedItems.some((item) => !item.isAvailable);
    const totalQty = selectedItems
      .filter((item) => item.isAvailable)
      .reduce((sum, item) => sum + item.itemQty, 0);
    const subtotalAmount = selectedItems
      .filter((item) => item.isAvailable)
      .reduce((sum, item) => sum + item.lineSubtotal, 0);
    const dpEligible = !hasUnavailable && totalQty >= dpMinQty;
    const dpAmount = Math.round((subtotalAmount * dpPercent) / 100);
    const settlementAmount = subtotalAmount - dpAmount;

    return {
      hasUnavailable,
      totalQty,
      subtotalAmount,
      dpMinQty,
      dpPercent,
      dpEligible,
      dpAmount,
      settlementAmount,
      missingForDp: Math.max(0, dpMinQty - totalQty),
      payableNow: paymentScheme === PAYMENT_SCHEME.DP && dpEligible ? dpAmount : subtotalAmount,
    };
  }, [
    cartQuery.data?.summary.dpMinQty,
    cartQuery.data?.summary.dpPercent,
    configQuery.data?.dpMinQty,
    configQuery.data?.dpPercent,
    paymentScheme,
    selectedItems,
  ]);

  // Turunkan ke skema LUNAS bila total qty item terpilih tidak lagi memenuhi DP
  useEffect(() => {
    if (!checkoutSummary.dpEligible && paymentScheme === PAYMENT_SCHEME.DP) {
      setPaymentScheme(PAYMENT_SCHEME.FULL);
    }
  }, [checkoutSummary.dpEligible, paymentScheme]);

  const createOrderMutation = useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateOrderRequestDto;
      idempotencyKey: string;
    }) => createOrder(payload, idempotencyKey),
    onSuccess: async (order) => {
      queryClient.setQueryData(orderQueryKeys.detail(order.transactionUuid), order);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cartQueryKeys.items }),
        queryClient.invalidateQueries({ queryKey: orderQueryKeys.all }),
      ]);
      uncheckAll();
      clearCheckoutSelection();
      toast(
        pick(`Pesanan ${order.orderCode} berhasil dibuat.`, `Order ${order.orderCode} created.`),
        'ok'
      );
      navigate(`/pesanan/${order.transactionUuid}`, {
        replace: true,
        state: { justCreated: true },
      });
    },
    onError: (err) => {
      const parsed = extractApiError(
        err,
        pick(
          'Gagal membuat pesanan. Silakan periksa kembali data Anda.',
          'Failed to create order. Please review your details.'
        )
      );
      const detailMsg =
        parsed.details.length > 0
          ? `${parsed.message} (${parsed.details.join('; ')})`
          : parsed.message;
      setFormError(detailMsg);
      toast(parsed.message, 'err');
      if (err instanceof ApiClientError && (err.status === 400 || err.status === 409)) {
        idempotencyKeyRef.current = generateIdempotencyKey();
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (selectedItems.length === 0) {
      setFormError(
        pick(
          'Tidak ada item keranjang yang dipilih untuk checkout.',
          'No bag items selected for checkout.'
        )
      );
      return;
    }

    if (checkoutSummary.hasUnavailable) {
      setFormError(
        pick(
          'Sebagian item yang dipilih sudah tidak tersedia. Kembali ke keranjang untuk memperbarui atau menghapusnya.',
          'Some selected items are no longer available. Return to your bag to update or remove them.'
        )
      );
      return;
    }

    const effectiveScheme: PaymentScheme =
      paymentScheme === PAYMENT_SCHEME.DP && checkoutSummary.dpEligible
        ? PAYMENT_SCHEME.DP
        : PAYMENT_SCHEME.FULL;

    const cartItemUuids = selectedItems.map((item) => item.cartItemUuid);

    if (fulfillmentType === FULFILLMENT_TYPE.SHIP) {
      if (addressMode === 'saved' && addresses.length > 0) {
        if (!selectedAddressUuid) {
          setFormError(
            pick(
              'Pilih alamat pengiriman tersimpan terlebih dahulu.',
              'Please select a saved shipping address first.'
            )
          );
          return;
        }
        createOrderMutation.mutate({
          idempotencyKey: idempotencyKeyRef.current,
          payload: {
            cartItemUuids,
            fulfillmentType: FULFILLMENT_TYPE.SHIP,
            addressUuid: selectedAddressUuid,
            paymentScheme: effectiveScheme,
          },
        });
        return;
      }

      const recipientName = shippingForm.recipientName.trim();
      const normalizedWa = normalizeWhatsApp(shippingForm.recipientWhatsapp);
      const provinceName = shippingForm.provinceName.trim();
      const cityName = shippingForm.cityName.trim();
      const districtName = shippingForm.districtName.trim();
      const postalCode = shippingForm.postalCode.trim();
      const fullAddress = shippingForm.fullAddress.trim();

      if (recipientName.length < 2) {
        setFormError(
          pick('Nama penerima minimal 2 karakter.', 'Recipient name must be at least 2 characters.')
        );
        return;
      }
      if (!normalizedWa) {
        setFormError(
          pick(
            'Format WhatsApp penerima tidak valid. Gunakan awalan 08 atau 62.',
            'Invalid recipient WhatsApp format. Use 08 or 62 prefix.'
          )
        );
        return;
      }
      if (provinceName.length < 2 || cityName.length < 2 || districtName.length < 2) {
        setFormError(
          pick(
            'Provinsi, kota/kabupaten, dan kecamatan wajib diisi lengkap.',
            'Province, city, and district are required.'
          )
        );
        return;
      }
      if (!/^[0-9]{5}$/.test(postalCode)) {
        setFormError(
          pick('Kode pos harus terdiri dari 5 digit angka.', 'Postal code must be 5 digits.')
        );
        return;
      }
      if (fullAddress.length < 5) {
        setFormError(
          pick(
            'Alamat lengkap minimal 5 karakter.',
            'Full street address must be at least 5 characters.'
          )
        );
        return;
      }

      createOrderMutation.mutate({
        idempotencyKey: idempotencyKeyRef.current,
        payload: {
          cartItemUuids,
          fulfillmentType: FULFILLMENT_TYPE.SHIP,
          address: {
            recipientName,
            recipientWhatsapp: normalizedWa,
            provinceName,
            cityName,
            districtName,
            postalCode,
            fullAddress,
          },
          paymentScheme: effectiveScheme,
        },
      });
      return;
    }

    const trimmedPickupName = pickupName.trim();
    const normalizedPickupWa = normalizeWhatsApp(pickupWhatsapp);
    if (trimmedPickupName.length < 2) {
      setFormError(
        pick(
          'Nama pengambil pesanan minimal 2 karakter.',
          'Pickup contact name must be at least 2 characters.'
        )
      );
      return;
    }
    if (!normalizedPickupWa) {
      setFormError(
        pick(
          'Format nomor WhatsApp pengambil pesanan tidak valid.',
          'Invalid pickup WhatsApp number format.'
        )
      );
      return;
    }

    createOrderMutation.mutate({
      idempotencyKey: idempotencyKeyRef.current,
      payload: {
        cartItemUuids,
        fulfillmentType: FULFILLMENT_TYPE.PICKUP,
        pickupName: trimmedPickupName,
        pickupWhatsapp: normalizedPickupWa,
        paymentScheme: effectiveScheme,
      },
    });
  }

  if (cartQuery.isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="space-y-2 border-b border-line pb-5">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="w-full min-w-0 space-y-4 lg:col-span-7">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <div className="w-full min-w-0 lg:col-span-5">
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (cartQuery.error) {
    const parsed = extractApiError(
      cartQuery.error,
      pick('Gagal memuat data checkout dari keranjang.', 'Failed to load checkout data from bag.')
    );
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState
          eyebrow={t('common.errorEyebrow')}
          retryLabel={t('common.retry')}
          title={pick('Halaman checkout belum dapat dimuat', 'Checkout page could not be loaded')}
          message={parsed.message}
          retry={() => void cartQuery.refetch()}
        />
      </div>
    );
  }

  if (selectedItems.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <EmptyState
          title={pick('Belum ada item keranjang dipilih', 'No bag items selected')}
          description={pick(
            'Pilih minimal satu konfigurasi Custom Lab di keranjang sebelum melanjutkan ke tahap checkout.',
            'Select at least one Custom Lab configuration in your bag before proceeding to checkout.'
          )}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/keranjang" className="btn-primary">
                {pick('Kembali ke Keranjang', 'Back to Bag')}
              </Link>
              <Link to="/custom-lab" className="btn-secondary">
                {pick('Buka Custom Lab', 'Open Custom Lab')}
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="eyebrow">YNG Studio · {pick('Checkout Pesanan', 'Order Checkout')}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
            {pick('Konfirmasi Pengiriman & Pembayaran', 'Confirm Delivery & Payment')}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {pick(
              'Harga final dan syarat DP dihitung ulang dan dikunci otomatis oleh server saat pesanan dibuat.',
              'Final pricing and deposit eligibility are recalculated and locked by the server when placing the order.'
            )}
          </p>
        </div>
        <Link to="/keranjang" className="btn-secondary">
          {pick('Kembali ke Keranjang', 'Back to Bag')}
        </Link>
      </header>

      {checkoutSummary.hasUnavailable ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs leading-relaxed text-status-err sm:text-sm"
        >
          {pick(
            <>
              Sebagian item yang dipilih sudah tidak tersedia karena pembaruan katalog. Kembali ke{' '}
              <Link to="/keranjang" className="font-semibold underline">
                Keranjang
              </Link>{' '}
              untuk memperbarui atau menghapus item terkait.
            </>,
            <>
              Some selected items are unavailable due to catalog updates. Return to your{' '}
              <Link to="/keranjang" className="font-semibold underline">
                Bag
              </Link>{' '}
              to update or remove them.
            </>
          )}
        </div>
      ) : null}

      {formError ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs leading-relaxed text-status-err sm:text-sm"
        >
          {formError}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12"
      >
        {/* Kolom Kiri: Pengiriman, Pembayaran, & Rincian Item */}
        <div className="w-full min-w-0 space-y-6 lg:col-span-7">
          {/* 01. Metode Pengiriman / Pengambilan */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">
                {pick('01 · Pengiriman / Pengambilan', '01 · Delivery / Pickup')}
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                {pick('Pilih Metode Penerimaan Pesanan', 'Choose Fulfillment Method')}
              </h2>
            </div>

            <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFulfillmentType(FULFILLMENT_TYPE.SHIP)}
                className={`flex min-h-touch w-full flex-col items-start rounded-2xl border p-4 text-left transition-colors ${
                  fulfillmentType === FULFILLMENT_TYPE.SHIP
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-surface text-ink hover:border-ink'
                }`}
              >
                <span className="font-display text-sm font-semibold">
                  {pick('Kirim ke Alamat', 'Ship to Address')}
                </span>
                <span
                  className={`mt-1 text-xs ${
                    fulfillmentType === FULFILLMENT_TYPE.SHIP ? 'text-neutral-300' : 'text-muted'
                  }`}
                >
                  {pick(
                    'Dikirim via kurir dari Batam. Ongkir diinput admin setelah QC selesai.',
                    'Shipped via courier from Batam. Shipping fee is added by admin after QC.'
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFulfillmentType(FULFILLMENT_TYPE.PICKUP)}
                className={`flex min-h-touch w-full flex-col items-start rounded-2xl border p-4 text-left transition-colors ${
                  fulfillmentType === FULFILLMENT_TYPE.PICKUP
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-surface text-ink hover:border-ink'
                }`}
              >
                <span className="font-display text-sm font-semibold">
                  {pick('Ambil di Workshop', 'Workshop Pickup')}
                </span>
                <span
                  className={`mt-1 text-xs ${
                    fulfillmentType === FULFILLMENT_TYPE.PICKUP ? 'text-neutral-300' : 'text-muted'
                  }`}
                >
                  {pick(
                    'Ambil langsung di studio YNG Apparel Batam tanpa biaya ongkos kirim.',
                    'Pick up directly at YNG Apparel Batam studio with zero shipping fee.'
                  )}
                </span>
              </button>
            </div>

            {fulfillmentType === FULFILLMENT_TYPE.SHIP ? (
              <div className="mt-5 space-y-4">
                {addresses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAddressMode('saved')}
                      className={`inline-flex min-h-touch items-center rounded-full border px-4 text-xs font-semibold transition-colors ${
                        addressMode === 'saved'
                          ? 'border-ink bg-ink text-white'
                          : 'border-line bg-white text-ink hover:border-ink'
                      }`}
                    >
                      {pick('Pilih Alamat Tersimpan', 'Saved Addresses')} ({addresses.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddressMode('new')}
                      className={`inline-flex min-h-touch items-center rounded-full border px-4 text-xs font-semibold transition-colors ${
                        addressMode === 'new'
                          ? 'border-ink bg-ink text-white'
                          : 'border-line bg-white text-ink hover:border-ink'
                      }`}
                    >
                      {pick('+ Pakai Alamat Baru', '+ Use New Address')}
                    </button>
                  </div>
                ) : null}

                {addressMode === 'saved' && addresses.length > 0 ? (
                  <div className="space-y-2.5">
                    {addresses.map((addr) => {
                      const active = selectedAddressUuid === addr.addressUuid;
                      return (
                        <button
                          key={addr.addressUuid}
                          type="button"
                          onClick={() => setSelectedAddressUuid(addr.addressUuid)}
                          className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                            active
                              ? 'border-ink bg-surface ring-1 ring-ink'
                              : 'border-line bg-white hover:border-ink'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display text-sm font-semibold text-ink">
                                {addr.label}
                              </span>
                              {addr.isDefault ? (
                                <Badge variant="info">{pick('Utama', 'Default')}</Badge>
                              ) : null}
                            </div>
                            <span className="tabular-price text-xs text-muted">
                              {formatWhatsApp(addr.recipientWhatsapp)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm font-medium text-ink">
                            {addr.recipientName}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted">
                            {addr.fullAddress}, {addr.districtName}, {addr.cityName},{' '}
                            {addr.provinceName}{' '}
                            <span className="tabular-price">{addr.postalCode}</span>
                          </p>
                        </button>
                      );
                    })}
                    <p className="text-xs text-muted">
                      {pick(
                        <>
                          Alamat disalin sebagai snapshot pesanan ini. Kelola buku alamat permanen
                          di{' '}
                          <Link to="/akun" className="font-semibold text-ink underline">
                            Akun Saya
                          </Link>
                          .
                        </>,
                        <>
                          Address is copied as a snapshot for this order. Manage saved addresses in{' '}
                          <Link to="/akun" className="font-semibold text-ink underline">
                            My Account
                          </Link>
                          .
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="checkout-recipient-name"
                        className="block text-xs font-semibold text-ink"
                      >
                        {pick('Nama Penerima', 'Recipient Name')}
                      </label>
                      <input
                        id="checkout-recipient-name"
                        type="text"
                        required
                        maxLength={150}
                        value={shippingForm.recipientName}
                        onChange={(e) =>
                          setShippingForm((prev) => ({ ...prev, recipientName: e.target.value }))
                        }
                        placeholder={pick('Nama lengkap penerima', 'Recipient full name')}
                        className="input-sharp mt-1.5"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="checkout-recipient-wa"
                        className="block text-xs font-semibold text-ink"
                      >
                        {pick('WhatsApp Penerima', 'Recipient WhatsApp')}
                      </label>
                      <input
                        id="checkout-recipient-wa"
                        type="tel"
                        required
                        maxLength={25}
                        value={shippingForm.recipientWhatsapp}
                        onChange={(e) =>
                          setShippingForm((prev) => ({
                            ...prev,
                            recipientWhatsapp: e.target.value,
                          }))
                        }
                        placeholder="0812xxxxxxxx"
                        className="input-sharp tabular-price mt-1.5"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="checkout-province"
                        className="block text-xs font-semibold text-ink"
                      >
                        {pick('Provinsi', 'Province')}
                      </label>
                      <input
                        id="checkout-province"
                        type="text"
                        required
                        maxLength={100}
                        value={shippingForm.provinceName}
                        onChange={(e) =>
                          setShippingForm((prev) => ({ ...prev, provinceName: e.target.value }))
                        }
                        placeholder="Kepulauan Riau"
                        className="input-sharp mt-1.5"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="checkout-city"
                        className="block text-xs font-semibold text-ink"
                      >
                        {pick('Kota / Kabupaten', 'City / Regency')}
                      </label>
                      <input
                        id="checkout-city"
                        type="text"
                        required
                        maxLength={100}
                        value={shippingForm.cityName}
                        onChange={(e) =>
                          setShippingForm((prev) => ({ ...prev, cityName: e.target.value }))
                        }
                        placeholder="Kota Batam"
                        className="input-sharp mt-1.5"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="checkout-district"
                        className="block text-xs font-semibold text-ink"
                      >
                        {pick('Kecamatan', 'District')}
                      </label>
                      <input
                        id="checkout-district"
                        type="text"
                        required
                        maxLength={100}
                        value={shippingForm.districtName}
                        onChange={(e) =>
                          setShippingForm((prev) => ({ ...prev, districtName: e.target.value }))
                        }
                        placeholder="Batam Kota"
                        className="input-sharp mt-1.5"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="checkout-postal"
                        className="block text-xs font-semibold text-ink"
                      >
                        {pick('Kode Pos', 'Postal Code')}
                      </label>
                      <input
                        id="checkout-postal"
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={5}
                        value={shippingForm.postalCode}
                        onChange={(e) =>
                          setShippingForm((prev) => ({
                            ...prev,
                            postalCode: e.target.value.replace(/\D/g, '').slice(0, 5),
                          }))
                        }
                        placeholder="29444"
                        className="input-sharp tabular-price mt-1.5"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="checkout-full-address"
                        className="block text-xs font-semibold text-ink"
                      >
                        {pick('Alamat Lengkap', 'Full Address')}
                      </label>
                      <textarea
                        id="checkout-full-address"
                        required
                        rows={3}
                        maxLength={500}
                        value={shippingForm.fullAddress}
                        onChange={(e) =>
                          setShippingForm((prev) => ({ ...prev, fullAddress: e.target.value }))
                        }
                        placeholder={pick(
                          'Nama jalan, nomor rumah/ruko, RT/RW, patokan',
                          'Street name, house/unit number, landmarks'
                        )}
                        className="input-sharp mt-1.5 min-h-[88px] resize-y py-2"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
                  <p className="font-semibold text-ink">
                    {pick('Pengambilan Langsung di Studio Batam', 'Direct Pickup at Batam Studio')}
                  </p>
                  <p className="mt-1">
                    {pick(
                      <>
                        Anda akan mendapat notifikasi status <strong>Siap Diambil</strong> pada
                        halaman detail pesanan setelah proses pressing &amp; QC selesai.
                      </>,
                      <>
                        Your order status will update to <strong>Ready for Pickup</strong> on the
                        order detail page once pressing &amp; QC are completed.
                      </>
                    )}
                  </p>
                </div>

                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="checkout-pickup-name"
                      className="block text-xs font-semibold text-ink"
                    >
                      {pick('Nama Pengambil', 'Pickup Contact Name')}
                    </label>
                    <input
                      id="checkout-pickup-name"
                      type="text"
                      required
                      maxLength={150}
                      value={pickupName}
                      onChange={(e) => setPickupName(e.target.value)}
                      placeholder={pick('Nama yang akan mengambil', 'Name of person picking up')}
                      className="input-sharp mt-1.5"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="checkout-pickup-wa"
                      className="block text-xs font-semibold text-ink"
                    >
                      {pick('WhatsApp Pengambil', 'Pickup WhatsApp')}
                    </label>
                    <input
                      id="checkout-pickup-wa"
                      type="tel"
                      required
                      maxLength={25}
                      value={pickupWhatsapp}
                      onChange={(e) => setPickupWhatsapp(e.target.value)}
                      placeholder="0812xxxxxxxx"
                      className="input-sharp tabular-price mt-1.5"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 02. Skema Pembayaran (Dynamic DP Gatekeeper) */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">{pick('02 · Skema Pembayaran', '02 · Payment Scheme')}</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                {pick('Pilih Pembayaran Lunas atau DP', 'Choose Full Payment or Deposit')}{' '}
                <span className="tabular-price">{checkoutSummary.dpPercent}%</span>
              </h2>
            </div>

            <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentScheme(PAYMENT_SCHEME.FULL)}
                className={`flex min-h-touch w-full flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
                  paymentScheme === PAYMENT_SCHEME.FULL
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-surface text-ink hover:border-ink'
                }`}
              >
                <div className="w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold">
                      {pick('Lunas (100%)', 'Full Payment (100%)')}
                    </span>
                    <span className="tabular-price text-sm font-bold">
                      {formatRupiah(checkoutSummary.subtotalAmount)}
                    </span>
                  </div>
                  <p
                    className={`mt-1.5 text-xs ${
                      paymentScheme === PAYMENT_SCHEME.FULL ? 'text-neutral-300' : 'text-muted'
                    }`}
                  >
                    {pick(
                      'Bayar penuh biaya produksi di awal. Ongkir (jika kirim) ditagihkan setelah QC.',
                      'Pay 100% production cost upfront. Shipping (if delivered) is billed after QC.'
                    )}
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={!checkoutSummary.dpEligible}
                onClick={() => {
                  if (checkoutSummary.dpEligible) {
                    setPaymentScheme(PAYMENT_SCHEME.DP);
                  }
                }}
                className={`flex min-h-touch w-full flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
                  !checkoutSummary.dpEligible
                    ? 'cursor-not-allowed border-line bg-surface/70 opacity-60'
                    : paymentScheme === PAYMENT_SCHEME.DP
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-ink hover:border-ink'
                }`}
              >
                <div className="w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold">
                      {getLocalizedPaymentSchemeLabel(
                        PAYMENT_SCHEME.DP,
                        checkoutSummary.dpPercent,
                        locale
                      )}
                    </span>
                    <span className="tabular-price text-sm font-bold">
                      {formatRupiah(checkoutSummary.dpAmount)}
                    </span>
                  </div>
                  {checkoutSummary.dpEligible ? (
                    <p
                      className={`mt-1.5 text-xs ${
                        paymentScheme === PAYMENT_SCHEME.DP ? 'text-neutral-300' : 'text-muted'
                      }`}
                    >
                      {pick('Sisa pelunasan', 'Remaining balance')}{' '}
                      <span className="tabular-price font-semibold">
                        {formatRupiah(checkoutSummary.settlementAmount)}
                      </span>{' '}
                      {pick('dibayar setelah pressing & QC.', 'paid after pressing & QC.')}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted">
                      {pick(
                        <>
                          Minimal{' '}
                          <span className="tabular-price font-semibold text-ink">
                            {checkoutSummary.dpMinQty} pcs
                          </span>{' '}
                          pada item terpilih (kurang{' '}
                          <span className="tabular-price font-semibold text-ink">
                            {checkoutSummary.missingForDp} pcs
                          </span>
                          ).
                        </>,
                        <>
                          Minimum{' '}
                          <span className="tabular-price font-semibold text-ink">
                            {checkoutSummary.dpMinQty} pcs
                          </span>{' '}
                          on selected items (add{' '}
                          <span className="tabular-price font-semibold text-ink">
                            {checkoutSummary.missingForDp} pcs
                          </span>
                          ).
                        </>
                      )}
                    </p>
                  )}
                </div>
              </button>
            </div>
          </section>

          {/* 03. Rincian Item Terpilih */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <div>
                <p className="eyebrow">{pick('03 · Rincian Item', '03 · Item Details')}</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  {pick('Item yang Akan Diproduksi', 'Items for Production')} (
                  {selectedItems.length})
                </h2>
              </div>
              <span className="tabular-price text-xs font-semibold text-muted">
                {checkoutSummary.totalQty} pcs
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {selectedItems.map((item, idx) => {
                const pricing = item.pricing;
                const colorName =
                  pricing?.colorName ??
                  item.config.colorName ??
                  (item.config.isCustomColor
                    ? pick('Warna Custom', 'Custom Color')
                    : pick('Preset warna', 'Preset color'));
                const colorHex = pricing?.colorHex ?? item.config.colorHex;

                return (
                  <article
                    key={item.cartItemUuid}
                    className="rounded-2xl border border-line bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-sm font-semibold text-ink sm:text-base">
                            {pricing?.modelName ?? `Item #${idx + 1}`}
                          </h3>
                          {item.config.isCustomColor ? (
                            <Badge variant="warn">
                              {pick('Warna Custom · WA', 'Custom Color · WA')}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {pick('Bahan:', 'Fabric:')}{' '}
                          <span className="font-medium text-ink">
                            {pricing?.fabricName ?? `#${item.fabricId}`}
                          </span>{' '}
                          · {pick('Warna:', 'Color:')}{' '}
                          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                            {colorHex ? (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full border border-neutral-300"
                                style={{ backgroundColor: colorHex }}
                                aria-hidden="true"
                              />
                            ) : null}
                            <span>{colorName}</span>
                          </span>
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="tabular-price text-sm font-bold text-ink sm:text-base">
                          {item.isAvailable ? formatRupiah(item.lineSubtotal) : '—'}
                        </p>
                        <p className="tabular-price text-xs text-muted">{item.itemQty} pcs</p>
                      </div>
                    </div>

                    {pricing ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {pricing.sizes.map((s) => (
                          <span
                            key={s.sizeId}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs"
                          >
                            <span className="font-mono font-semibold text-ink">{s.sizeCode}</span>
                            <span className="tabular-price text-muted">× {s.qty}</span>
                            <span className="tabular-price text-ink">
                              ({formatRupiah(s.unitPrice)})
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {item.config.prints.length > 0 ? (
                      <ul className="mt-3 space-y-1">
                        {item.config.prints.map((spot, spotIdx) => {
                          const matched = pricing?.prints[spotIdx];
                          return (
                            <li
                              key={`${item.cartItemUuid}-print-${spotIdx}`}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"
                            >
                              <span>
                                {pick('Sablon', 'Print')}{' '}
                                {getLocalizedPrintPositionLabel(spot.printPosition, locale)}
                                {matched ? ` · ${matched.printSizeName}` : ''}
                              </span>
                              {spot.needsDesignHelp ? (
                                <span className="font-medium text-ink">
                                  {pick('Bantuan Desain Gratis', 'Free Design Help')}
                                </span>
                              ) : (
                                <span className="truncate font-mono text-[11px] text-ink">
                                  {spot.fileName ?? pick('File terunggah', 'File uploaded')}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        {pick('Polos (tanpa sablon)', 'Plain (no prints)')}
                      </p>
                    )}

                    {item.config.productionNotes ? (
                      <p className="mt-2 rounded-lg border border-line bg-white px-3 py-2 text-xs text-muted">
                        <span className="font-semibold text-ink">
                          {pick('Catatan: ', 'Notes: ')}
                        </span>
                        {item.config.productionNotes}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        {/* Kolom Kanan: Ringkasan Tagihan Sticky */}
        <aside className="w-full min-w-0 lg:sticky lg:top-24 lg:col-span-5">
          <div className="w-full space-y-5 rounded-3xl border border-line bg-white p-5 sm:p-6">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">{pick('Ringkasan Tagihan', 'Invoice Summary')}</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                {pick('Total Produksi Terkunci', 'Locked Production Total')}
              </h2>
            </div>

            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{pick('Item tercentang', 'Selected items')}</dt>
                <dd className="tabular-price font-semibold text-ink">
                  {selectedItems.length} {pick('item', 'items')} · {checkoutSummary.totalQty} pcs
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{pick('Metode terima', 'Fulfillment')}</dt>
                <dd className="font-medium text-ink">
                  {fulfillmentType === FULFILLMENT_TYPE.SHIP
                    ? pick('Kirim ke Alamat', 'Ship to Address')
                    : pick('Ambil di Workshop', 'Workshop Pickup')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{pick('Subtotal produksi', 'Production subtotal')}</dt>
                <dd className="tabular-price font-semibold text-ink">
                  {formatRupiah(checkoutSummary.subtotalAmount)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{pick('Ongkos kirim', 'Shipping fee')}</dt>
                <dd className="text-xs font-medium text-muted">
                  {fulfillmentType === FULFILLMENT_TYPE.PICKUP
                    ? pick('Rp 0 (Ambil di tempat)', 'Rp 0 (Workshop pickup)')
                    : pick('Diinput admin setelah QC', 'Added by admin after QC')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                <dt className="font-semibold text-ink">
                  {pick('Tagihan awal', 'Initial bill')} (
                  {paymentScheme === PAYMENT_SCHEME.DP && checkoutSummary.dpEligible
                    ? getLocalizedPaymentSchemeLabel(
                        PAYMENT_SCHEME.DP,
                        checkoutSummary.dpPercent,
                        locale
                      )
                    : getLocalizedPaymentSchemeLabel(PAYMENT_SCHEME.FULL, null, locale)}
                  )
                </dt>
                <dd className="tabular-price text-xl font-bold text-ink">
                  {formatRupiah(checkoutSummary.payableNow)}
                </dd>
              </div>
              {paymentScheme === PAYMENT_SCHEME.DP && checkoutSummary.dpEligible ? (
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <dt>{pick('Sisa pelunasan setelah QC', 'Remaining balance after QC')}</dt>
                  <dd className="tabular-price font-semibold text-ink">
                    {formatRupiah(checkoutSummary.settlementAmount)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
              <p className="font-semibold text-ink">
                {pick('Langkah setelah Buat Pesanan:', 'Next step after placing order:')}
              </p>
              <p className="mt-1">
                {pick(
                  'Anda akan diarahkan ke halaman detail pesanan untuk melihat rekening bank/QRIS resmi studio dan mengunggah bukti pembayaran awal.',
                  'You will be taken to the order detail page to view studio bank/QRIS accounts and upload your initial payment proof.'
                )}
              </p>
              {configQuery.data?.productionEstimateText ? (
                <p className="mt-2">
                  {pick('Estimasi produksi:', 'Production lead time:')}{' '}
                  <strong className="text-ink">{configQuery.data.productionEstimateText}</strong>
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={createOrderMutation.isPending || checkoutSummary.hasUnavailable}
              className="btn-primary w-full"
            >
              {createOrderMutation.isPending
                ? pick('Memproses Pesanan...', 'Placing Order...')
                : pick('Buat Pesanan Sekarang', 'Place Order Now')}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
