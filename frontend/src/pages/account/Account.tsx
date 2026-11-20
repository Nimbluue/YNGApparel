import { USER_ROLE, type UserAddressDto } from '@yng/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminFeedbackBanner } from '../../components/admin/AdminFeedbackBanner';
import { useAuth } from '../../context/AuthContext';
import {
  createAddress,
  deactivateAccount,
  deleteAddress,
  listAddresses,
  updateAddress,
  updateProfile,
} from '../../services/accountService';
import { changePassword } from '../../services/authService';
import { extractApiError } from '../../utils/apiError';

const MAX_SAVED_ADDRESSES = 5;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const textEncoder = new TextEncoder();

interface AddressFormState {
  label: string;
  recipientName: string;
  recipientWhatsapp: string;
  provinceName: string;
  cityName: string;
  districtName: string;
  postalCode: string;
  fullAddress: string;
  isDefault: boolean;
}

const INITIAL_ADDRESS_FORM: AddressFormState = {
  label: '',
  recipientName: '',
  recipientWhatsapp: '',
  provinceName: '',
  cityName: '',
  districtName: '',
  postalCode: '',
  fullAddress: '',
  isDefault: false,
};

interface SectionFeedback {
  variant: 'error' | 'success';
  message: string;
  details?: string[];
}

export default function Account() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  // 01. Profil
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<SectionFeedback | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setWhatsapp(user.whatsapp ?? '');
    }
  }, [user]);

  // 02. Alamat tersimpan
  const [addresses, setAddresses] = useState<UserAddressDto[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [editingAddressUuid, setEditingAddressUuid] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<AddressFormState>(INITIAL_ADDRESS_FORM);
  const [savingAddress, setSavingAddress] = useState(false);
  const [busyAddressUuid, setBusyAddressUuid] = useState<string | null>(null);
  const [confirmDeleteUuid, setConfirmDeleteUuid] = useState<string | null>(null);
  const [addressFeedback, setAddressFeedback] = useState<SectionFeedback | null>(null);

  // 03. Ganti password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<SectionFeedback | null>(null);

  // 04. Nonaktifkan akun
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivateAgreed, setDeactivateAgreed] = useState(false);
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateFeedback, setDeactivateFeedback] = useState<SectionFeedback | null>(null);

  const loadAddresses = useCallback(async () => {
    setLoadingAddresses(true);
    try {
      const list = await listAddresses();
      setAddresses(list);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat daftar alamat tersimpan.');
      setAddressFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setLoadingAddresses(false);
    }
  }, []);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  function resetAddressForm() {
    setEditingAddressUuid(null);
    setAddressForm(INITIAL_ADDRESS_FORM);
  }

  function startEditAddress(addr: UserAddressDto) {
    setAddressFeedback(null);
    setConfirmDeleteUuid(null);
    setEditingAddressUuid(addr.addressUuid);
    setAddressForm({
      label: addr.label,
      recipientName: addr.recipientName,
      recipientWhatsapp: addr.recipientWhatsapp,
      provinceName: addr.provinceName,
      cityName: addr.cityName,
      districtName: addr.districtName,
      postalCode: addr.postalCode,
      fullAddress: addr.fullAddress,
      isDefault: addr.isDefault,
    });
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setProfileFeedback(null);

    const trimmedName = fullName.trim();
    const trimmedWa = whatsapp.trim();

    if (trimmedName.length < 2) {
      setProfileFeedback({ variant: 'error', message: 'Nama lengkap minimal 2 karakter.' });
      return;
    }

    if (user.role === USER_ROLE.USER && !trimmedWa) {
      setProfileFeedback({
        variant: 'error',
        message: 'Nomor WhatsApp wajib diisi untuk akun pelanggan.',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await updateProfile({
        fullName: trimmedName,
        whatsapp: trimmedWa ? trimmedWa : null,
      });
      setUser(updated);
      setProfileFeedback({
        variant: 'success',
        message: 'Profil akun berhasil diperbarui.',
      });
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memperbarui profil.');
      setProfileFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAddressSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddressFeedback(null);

    if (editingAddressUuid === null && addresses.length >= MAX_SAVED_ADDRESSES) {
      setAddressFeedback({
        variant: 'error',
        message: `Maksimal ${MAX_SAVED_ADDRESSES} alamat tersimpan per akun.`,
      });
      return;
    }

    const payload = {
      label: addressForm.label.trim(),
      recipientName: addressForm.recipientName.trim(),
      recipientWhatsapp: addressForm.recipientWhatsapp.trim(),
      provinceName: addressForm.provinceName.trim(),
      cityName: addressForm.cityName.trim(),
      districtName: addressForm.districtName.trim(),
      postalCode: addressForm.postalCode.trim(),
      fullAddress: addressForm.fullAddress.trim(),
      isDefault: addressForm.isDefault,
    };

    if (!payload.label) {
      setAddressFeedback({ variant: 'error', message: 'Label alamat wajib diisi.' });
      return;
    }
    if (payload.recipientName.length < 2) {
      setAddressFeedback({ variant: 'error', message: 'Nama penerima minimal 2 karakter.' });
      return;
    }
    if (!payload.recipientWhatsapp) {
      setAddressFeedback({ variant: 'error', message: 'Nomor WhatsApp penerima wajib diisi.' });
      return;
    }
    if (!payload.provinceName || !payload.cityName || !payload.districtName) {
      setAddressFeedback({
        variant: 'error',
        message: 'Provinsi, kota/kabupaten, dan kecamatan wajib diisi.',
      });
      return;
    }
    if (!/^[0-9]{5}$/.test(payload.postalCode)) {
      setAddressFeedback({
        variant: 'error',
        message: 'Kode pos harus terdiri dari 5 digit angka.',
      });
      return;
    }
    if (payload.fullAddress.length < 5) {
      setAddressFeedback({ variant: 'error', message: 'Alamat lengkap minimal 5 karakter.' });
      return;
    }

    setSavingAddress(true);
    try {
      if (editingAddressUuid !== null) {
        await updateAddress(editingAddressUuid, payload);
        setAddressFeedback({
          variant: 'success',
          message: `Alamat "${payload.label}" berhasil diperbarui.`,
        });
      } else {
        await createAddress(payload);
        setAddressFeedback({
          variant: 'success',
          message: `Alamat "${payload.label}" berhasil disimpan.`,
        });
      }
      resetAddressForm();
      await loadAddresses();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan alamat.');
      setAddressFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleSetDefaultAddress(addr: UserAddressDto) {
    setBusyAddressUuid(addr.addressUuid);
    setAddressFeedback(null);
    try {
      await updateAddress(addr.addressUuid, { isDefault: true });
      setAddressFeedback({
        variant: 'success',
        message: `"${addr.label}" ditetapkan sebagai alamat utama.`,
      });
      await loadAddresses();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menetapkan alamat utama.');
      setAddressFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setBusyAddressUuid(null);
    }
  }

  async function handleDeleteAddress(addr: UserAddressDto) {
    setBusyAddressUuid(addr.addressUuid);
    setAddressFeedback(null);
    try {
      await deleteAddress(addr.addressUuid);
      setConfirmDeleteUuid(null);
      if (editingAddressUuid === addr.addressUuid) {
        resetAddressForm();
      }
      setAddressFeedback({
        variant: 'success',
        message: `Alamat "${addr.label}" berhasil dihapus.`,
      });
      await loadAddresses();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menghapus alamat.');
      setAddressFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setBusyAddressUuid(null);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFeedback(null);

    if (!currentPassword) {
      setPasswordFeedback({ variant: 'error', message: 'Password saat ini wajib diisi.' });
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordFeedback({
        variant: 'error',
        message: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.`,
      });
      return;
    }

    if (
      textEncoder.encode(currentPassword).length > MAX_PASSWORD_BYTES ||
      textEncoder.encode(newPassword).length > MAX_PASSWORD_BYTES
    ) {
      setPasswordFeedback({
        variant: 'error',
        message: `Password maksimal ${MAX_PASSWORD_BYTES} byte UTF-8.`,
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordFeedback({
        variant: 'error',
        message: 'Konfirmasi password baru tidak cocok.',
      });
      return;
    }

    setSavingPassword(true);
    try {
      const updatedUser = await changePassword({
        currentPassword,
        newPassword,
      });
      setUser(updatedUser);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordFeedback({
        variant: 'success',
        message:
          'Password berhasil diperbarui. Sesi aktif saat ini tetap masuk, sedangkan sesi di perangkat lain telah dicabut.',
      });
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memperbarui password.');
      setPasswordFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeactivateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeactivateFeedback(null);

    if (!deactivateAgreed) {
      setDeactivateFeedback({
        variant: 'error',
        message: 'Centang konfirmasi persetujuan sebelum menonaktifkan akun.',
      });
      return;
    }

    if (!deactivatePassword) {
      setDeactivateFeedback({
        variant: 'error',
        message: 'Masukkan password saat ini untuk konfirmasi.',
      });
      return;
    }

    if (textEncoder.encode(deactivatePassword).length > MAX_PASSWORD_BYTES) {
      setDeactivateFeedback({
        variant: 'error',
        message: `Password maksimal ${MAX_PASSWORD_BYTES} byte UTF-8.`,
      });
      return;
    }

    setDeactivating(true);
    try {
      await deactivateAccount({ currentPassword: deactivatePassword });
      setUser(null);
      navigate('/login', {
        replace: true,
        state: {
          statusMessage: 'Akun Anda telah dinonaktifkan. Semua sesi telah berakhir.',
        },
      });
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menonaktifkan akun.');
      setDeactivateFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setDeactivating(false);
    }
  }

  const isAddressLimitReached =
    editingAddressUuid === null && addresses.length >= MAX_SAVED_ADDRESSES;

  return (
    <div className="space-y-8">
      <section className="card-sharp p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              Akun &amp; Preferensi
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-[0.08em]">
              Profil Saya
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Kelola data profil, alamat pengiriman tersimpan untuk checkout cepat, password, dan
              keamanan akun Anda.
            </p>
          </div>
          {user ? (
            <span className="border border-ink bg-ink px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-bone">
              {user.role === USER_ROLE.ADMIN ? 'ADMIN' : 'PELANGGAN'}
            </span>
          ) : null}
        </div>
      </section>

      {/* 01 / Profil Akun */}
      <section className="card-sharp p-4 sm:p-6">
        <h2 className="border-b border-line pb-3 font-display text-base font-bold uppercase tracking-[0.1em]">
          01 / Informasi Profil
        </h2>

        {profileFeedback ? (
          <div className="mt-4">
            <AdminFeedbackBanner
              variant={profileFeedback.variant}
              message={profileFeedback.message}
              details={profileFeedback.details}
              onDismiss={() => setProfileFeedback(null)}
            />
          </div>
        ) : null}

        <form
          onSubmit={(event) => void handleProfileSubmit(event)}
          className="mt-4 space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="acc-email"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Email
              </label>
              <input
                id="acc-email"
                type="email"
                value={user?.email ?? ''}
                disabled
                className="input-sharp mt-1.5 bg-bone text-muted"
              />
            </div>

            <div>
              <label
                htmlFor="acc-fullname"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Nama Lengkap
              </label>
              <input
                id="acc-fullname"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="input-sharp mt-1.5"
                disabled={savingProfile}
              />
            </div>

            <div>
              <label
                htmlFor="acc-whatsapp"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Nomor WhatsApp {user?.role === USER_ROLE.ADMIN ? '(Opsional)' : ''}
              </label>
              <input
                id="acc-whatsapp"
                type="tel"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="081234567890"
                className="input-sharp mt-1.5 font-mono"
                disabled={savingProfile}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={savingProfile}>
            {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
          </button>
        </form>
      </section>

      {/* 02 / Alamat Tersimpan */}
      <section className="card-sharp p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div>
            <h2 className="font-display text-base font-bold uppercase tracking-[0.1em]">
              02 / Alamat Tersimpan ({addresses.length}/{MAX_SAVED_ADDRESSES})
            </h2>
            <p className="text-xs text-muted">
              Maksimal {MAX_SAVED_ADDRESSES} alamat tersimpan. Alamat yang dipilih saat checkout
              akan disalin ke pesanan.
            </p>
          </div>
          {editingAddressUuid !== null ? (
            <button type="button" onClick={resetAddressForm} className="btn-secondary px-4 py-2">
              Batal Edit
            </button>
          ) : null}
        </div>

        {addressFeedback ? (
          <div className="mt-4">
            <AdminFeedbackBanner
              variant={addressFeedback.variant}
              message={addressFeedback.message}
              details={addressFeedback.details}
              onDismiss={() => setAddressFeedback(null)}
            />
          </div>
        ) : null}

        <form
          onSubmit={(event) => void handleAddressSubmit(event)}
          className="mt-4 space-y-4 border-b border-line pb-6"
          noValidate
        >
          <p className="font-display text-xs font-semibold uppercase tracking-[0.14em]">
            {editingAddressUuid !== null ? 'Edit Alamat Tersimpan' : 'Tambah Alamat Baru'}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="addr-label"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Label Alamat
              </label>
              <input
                id="addr-label"
                type="text"
                value={addressForm.label}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, label: event.target.value }))
                }
                placeholder="Rumah / Kantor"
                className="input-sharp mt-1.5"
                disabled={savingAddress || isAddressLimitReached}
              />
            </div>

            <div>
              <label
                htmlFor="addr-recipient"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Nama Penerima
              </label>
              <input
                id="addr-recipient"
                type="text"
                value={addressForm.recipientName}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, recipientName: event.target.value }))
                }
                placeholder="Budi Santoso"
                className="input-sharp mt-1.5"
                disabled={savingAddress || isAddressLimitReached}
              />
            </div>

            <div>
              <label
                htmlFor="addr-wa"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                WhatsApp Penerima
              </label>
              <input
                id="addr-wa"
                type="tel"
                value={addressForm.recipientWhatsapp}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, recipientWhatsapp: event.target.value }))
                }
                placeholder="081234567890"
                className="input-sharp mt-1.5 font-mono"
                disabled={savingAddress || isAddressLimitReached}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="addr-province"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Provinsi
              </label>
              <input
                id="addr-province"
                type="text"
                value={addressForm.provinceName}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, provinceName: event.target.value }))
                }
                placeholder="Kepulauan Riau"
                className="input-sharp mt-1.5"
                disabled={savingAddress || isAddressLimitReached}
              />
            </div>

            <div>
              <label
                htmlFor="addr-city"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Kota / Kabupaten
              </label>
              <input
                id="addr-city"
                type="text"
                value={addressForm.cityName}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, cityName: event.target.value }))
                }
                placeholder="Kota Batam"
                className="input-sharp mt-1.5"
                disabled={savingAddress || isAddressLimitReached}
              />
            </div>

            <div>
              <label
                htmlFor="addr-district"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Kecamatan
              </label>
              <input
                id="addr-district"
                type="text"
                value={addressForm.districtName}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, districtName: event.target.value }))
                }
                placeholder="Batam Kota"
                className="input-sharp mt-1.5"
                disabled={savingAddress || isAddressLimitReached}
              />
            </div>

            <div>
              <label
                htmlFor="addr-postal"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Kode Pos
              </label>
              <input
                id="addr-postal"
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={addressForm.postalCode}
                onChange={(event) =>
                  setAddressForm((prev) => ({ ...prev, postalCode: event.target.value }))
                }
                placeholder="29464"
                className="input-sharp tabular-price mt-1.5"
                disabled={savingAddress || isAddressLimitReached}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="addr-full"
              className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
            >
              Alamat Lengkap
            </label>
            <textarea
              id="addr-full"
              rows={2}
              value={addressForm.fullAddress}
              onChange={(event) =>
                setAddressForm((prev) => ({ ...prev, fullAddress: event.target.value }))
              }
              placeholder="Nama jalan, nomor rumah, RT/RW, patokan"
              className="input-sharp mt-1.5"
              disabled={savingAddress || isAddressLimitReached}
            />
          </div>

          <label className="inline-flex min-h-touch cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={addressForm.isDefault}
              onChange={(event) =>
                setAddressForm((prev) => ({ ...prev, isDefault: event.target.checked }))
              }
              className="h-4 w-4 accent-ink"
              disabled={savingAddress || isAddressLimitReached}
            />
            <span>Jadikan sebagai alamat utama</span>
          </label>

          {isAddressLimitReached ? (
            <p className="text-xs text-status-warn">
              Batas {MAX_SAVED_ADDRESSES} alamat tersimpan telah tercapai. Edit atau hapus salah
              satu alamat di bawah untuk menambah alamat baru.
            </p>
          ) : null}

          <div>
            <button
              type="submit"
              className="btn-primary w-full sm:w-auto"
              disabled={savingAddress || isAddressLimitReached}
            >
              {savingAddress
                ? 'Menyimpan...'
                : editingAddressUuid !== null
                  ? 'Simpan Perubahan Alamat'
                  : 'Simpan Alamat Baru'}
            </button>
          </div>
        </form>

        <div className="mt-6 space-y-3">
          {loadingAddresses ? (
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
              Memuat alamat tersimpan...
            </p>
          ) : addresses.length === 0 ? (
            <p className="text-sm text-muted">
              Belum ada alamat tersimpan. Tambahkan alamat pengiriman di atas agar checkout lebih
              cepat.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {addresses.map((addr) => {
                const isBusy = busyAddressUuid === addr.addressUuid;
                const isConfirmingDelete = confirmDeleteUuid === addr.addressUuid;
                return (
                  <article
                    key={addr.addressUuid}
                    className={`flex flex-col justify-between border p-4 ${
                      addr.isDefault ? 'border-ink bg-bone' : 'border-line bg-surface'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-base font-bold uppercase tracking-[0.06em]">
                          {addr.label}
                        </h3>
                        {addr.isDefault ? (
                          <span className="border border-ink bg-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-bone">
                            UTAMA
                          </span>
                        ) : null}
                      </div>

                      <p className="text-sm font-medium">
                        {addr.recipientName} ·{' '}
                        <span className="font-mono text-xs">{addr.recipientWhatsapp}</span>
                      </p>
                      <p className="text-sm leading-relaxed text-neutral-600">{addr.fullAddress}</p>
                      <p className="font-mono text-xs text-muted">
                        {addr.districtName}, {addr.cityName}, {addr.provinceName} ·{' '}
                        {addr.postalCode}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2 border-t border-line pt-3">
                      {isConfirmingDelete ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-status-err">
                            Hapus alamat ini?
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAddress(addr)}
                            disabled={isBusy}
                            className="inline-flex min-h-touch flex-1 items-center justify-center border border-status-err bg-status-err px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bone disabled:opacity-40"
                          >
                            {isBusy ? 'Menghapus...' : 'Ya, Hapus'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUuid(null)}
                            disabled={isBusy}
                            className="btn-secondary flex-1 px-3 py-2"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {!addr.isDefault ? (
                            <button
                              type="button"
                              onClick={() => void handleSetDefaultAddress(addr)}
                              disabled={isBusy}
                              className="btn-secondary flex-1 px-3 py-2 sm:flex-none"
                            >
                              {isBusy ? '...' : 'Jadikan Utama'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => startEditAddress(addr)}
                            disabled={isBusy}
                            className="btn-secondary flex-1 px-3 py-2 sm:flex-none"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUuid(addr.addressUuid)}
                            disabled={isBusy}
                            className="inline-flex min-h-touch flex-1 items-center justify-center border border-status-err px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-status-err transition-colors hover:bg-status-err hover:text-bone disabled:opacity-40 sm:flex-none"
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 03 / Keamanan — Ganti Password */}
      <section className="card-sharp p-4 sm:p-6">
        <h2 className="border-b border-line pb-3 font-display text-base font-bold uppercase tracking-[0.1em]">
          03 / Keamanan — Ganti Password
        </h2>
        <p className="mt-2 text-xs text-muted">
          Mengganti password akan langsung mencabut seluruh sesi login di browser/perangkat lain dan
          menerbitkan sesi baru untuk browser ini.
        </p>

        {passwordFeedback ? (
          <div className="mt-4">
            <AdminFeedbackBanner
              variant={passwordFeedback.variant}
              message={passwordFeedback.message}
              details={passwordFeedback.details}
              onDismiss={() => setPasswordFeedback(null)}
            />
          </div>
        ) : null}

        <form
          onSubmit={(event) => void handlePasswordSubmit(event)}
          className="mt-4 space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="pw-current"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Password Saat Ini
              </label>
              <input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="input-sharp mt-1.5"
                disabled={savingPassword}
              />
            </div>

            <div>
              <label
                htmlFor="pw-new"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Password Baru
              </label>
              <input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Min 8 karakter (maks 72 byte)"
                className="input-sharp mt-1.5"
                disabled={savingPassword}
              />
            </div>

            <div>
              <label
                htmlFor="pw-confirm"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Konfirmasi Password Baru
              </label>
              <input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className="input-sharp mt-1.5"
                disabled={savingPassword}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={savingPassword}>
            {savingPassword ? 'Memperbarui...' : 'Perbarui Password'}
          </button>
        </form>
      </section>

      {/* 04 / Nonaktifkan Akun */}
      <section className="card-sharp border-status-err p-4 sm:p-6">
        <h2 className="border-b border-line pb-3 font-display text-base font-bold uppercase tracking-[0.1em] text-status-err">
          04 / Nonaktifkan Akun
        </h2>

        {user?.role === USER_ROLE.ADMIN ? (
          <p className="mt-3 text-sm text-neutral-600">
            Akun <strong>ADMIN</strong> tidak dapat dinonaktifkan dari halaman ini untuk mencegah
            terkuncinya akses operasional dashboard.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-neutral-600">
              Menonaktifkan akun akan menghentikan akses login Anda dan mengakhiri semua sesi aktif.
              Riwayat pesanan yang sudah tercatat tetap disimpan untuk keperluan garansi/arsip dan
              masih dapat dipantau melalui Live Tracker menggunakan kode order.
            </p>

            {deactivateFeedback ? (
              <AdminFeedbackBanner
                variant={deactivateFeedback.variant}
                message={deactivateFeedback.message}
                details={deactivateFeedback.details}
                onDismiss={() => setDeactivateFeedback(null)}
              />
            ) : null}

            {!showDeactivateConfirm ? (
              <button
                type="button"
                onClick={() => {
                  setDeactivateFeedback(null);
                  setShowDeactivateConfirm(true);
                }}
                className="inline-flex min-h-touch items-center justify-center border border-status-err px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-status-err transition-colors hover:bg-status-err hover:text-bone"
              >
                Nonaktifkan Akun Saya
              </button>
            ) : (
              <form
                onSubmit={(event) => void handleDeactivateSubmit(event)}
                className="space-y-4 border border-status-err bg-bone p-4"
                noValidate
              >
                <label className="flex min-h-touch cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={deactivateAgreed}
                    onChange={(event) => setDeactivateAgreed(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-ink"
                    disabled={deactivating}
                  />
                  <span>
                    Saya mengerti akun ini akan dinonaktifkan dan saya akan langsung dikeluarkan
                    dari semua sesi.
                  </span>
                </label>

                <div className="max-w-sm">
                  <label
                    htmlFor="deactivate-password"
                    className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
                  >
                    Konfirmasi Password Saat Ini
                  </label>
                  <input
                    id="deactivate-password"
                    type="password"
                    autoComplete="current-password"
                    value={deactivatePassword}
                    onChange={(event) => setDeactivatePassword(event.target.value)}
                    placeholder="Masukkan password Anda"
                    className="input-sharp mt-1.5"
                    disabled={deactivating}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={deactivating}
                    className="inline-flex min-h-touch w-full items-center justify-center border border-status-err bg-status-err px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-bone disabled:opacity-40 sm:w-auto"
                  >
                    {deactivating ? 'Memproses...' : 'Konfirmasi Nonaktifkan Akun'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeactivateConfirm(false);
                      setDeactivateAgreed(false);
                      setDeactivatePassword('');
                      setDeactivateFeedback(null);
                    }}
                    disabled={deactivating}
                    className="btn-secondary w-full sm:w-auto"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
