import { PAYMENT_METHOD, type PaymentAccountDto, type PaymentMethod } from '@yng/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ActiveStatusBadge, AdminFeedbackBanner } from '../../components/admin/AdminFeedbackBanner';
import CatalogImageField from '../../components/admin/CatalogImageField';
import {
  createPaymentAccount,
  deactivatePaymentAccount,
  listPaymentAccounts,
  updatePaymentAccount,
} from '../../services/adminMasterService';
import { extractApiError } from '../../utils/apiError';

interface PaymentFormState {
  method: PaymentMethod;
  providerName: string;
  accountNumber: string;
  accountHolder: string;
  qrImagePath: string | null;
  qrImageUrl: string | null;
  instructions: string;
}

const INITIAL_FORM: PaymentFormState = {
  method: PAYMENT_METHOD.BANK_TRANSFER,
  providerName: '',
  accountNumber: '',
  accountHolder: '',
  qrImagePath: null,
  qrImageUrl: null,
  instructions: '',
};

export default function PaymentAccounts() {
  const [accounts, setAccounts] = useState<PaymentAccountDto[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PaymentFormState>(INITIAL_FORM);

  const [feedback, setFeedback] = useState<{
    variant: 'error' | 'success';
    message: string;
    details?: string[];
  } | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPaymentAccounts(includeInactive);
      setAccounts(data);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat daftar rekening pembayaran.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  function resetForm() {
    setEditingId(null);
    setForm(INITIAL_FORM);
  }

  function startEdit(account: PaymentAccountDto) {
    setFeedback(null);
    setEditingId(account.id);
    setForm({
      method: account.method,
      providerName: account.providerName,
      accountNumber: account.accountNumber ?? '',
      accountHolder: account.accountHolder,
      qrImagePath: account.qrImagePath,
      qrImageUrl: account.qrImageUrl,
      instructions: account.instructions ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const providerName = form.providerName.trim();
    const accountHolder = form.accountHolder.trim();
    const trimmedNumber = form.accountNumber.trim();
    const accountNumber = trimmedNumber.length > 0 ? trimmedNumber : null;

    if (providerName.length < 2) {
      setFeedback({ variant: 'error', message: 'Nama penyedia / bank minimal 2 karakter.' });
      return;
    }

    if (accountHolder.length < 2) {
      setFeedback({ variant: 'error', message: 'Nama pemilik rekening minimal 2 karakter.' });
      return;
    }

    if (
      form.method === PAYMENT_METHOD.BANK_TRANSFER &&
      (!accountNumber || accountNumber.length < 3)
    ) {
      setFeedback({
        variant: 'error',
        message: 'Nomor rekening wajib diisi (minimal 3 karakter) untuk metode transfer bank.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        method: form.method,
        providerName,
        accountNumber,
        accountHolder,
        qrImagePath: form.qrImagePath,
        instructions: form.instructions.trim() || null,
      };

      if (editingId !== null) {
        const updated = await updatePaymentAccount(editingId, payload);
        setFeedback({
          variant: 'success',
          message: `Akun pembayaran "${updated.providerName}" berhasil diperbarui.`,
        });
      } else {
        const created = await createPaymentAccount(payload);
        setFeedback({
          variant: 'success',
          message: `Akun pembayaran "${created.providerName}" berhasil ditambahkan.`,
        });
      }

      resetForm();
      await loadAccounts();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan rekening pembayaran.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(account: PaymentAccountDto) {
    setBusyId(account.id);
    setFeedback(null);
    try {
      if (account.isActive) {
        await deactivatePaymentAccount(account.id);
        setFeedback({
          variant: 'success',
          message: `Akun pembayaran "${account.providerName}" dinonaktifkan.`,
        });
      } else {
        await updatePaymentAccount(account.id, { isActive: true });
        setFeedback({
          variant: 'success',
          message: `Akun pembayaran "${account.providerName}" diaktifkan kembali.`,
        });
      }
      await loadAccounts();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status akun pembayaran.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card-sharp p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              Admin · Pembayaran
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-[0.08em]">
              Rekening &amp; QRIS
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Kelola rekening bank dan kode QRIS resmi toko. Hanya akun pembayaran berstatus aktif
              yang akan ditampilkan ke pelanggan saat memilih metode bayar.
            </p>
          </div>

          <label className="inline-flex min-h-touch shrink-0 cursor-pointer items-center gap-2.5 border border-line-strong bg-bone px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.1em]">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <span>Tampilkan Nonaktif</span>
          </label>
        </div>
      </section>

      {feedback ? (
        <AdminFeedbackBanner
          variant={feedback.variant}
          message={feedback.message}
          details={feedback.details}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <section className="card-sharp p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <h2 className="font-display text-base font-bold uppercase tracking-[0.1em]">
            {editingId !== null ? 'Edit Akun Pembayaran' : 'Tambah Akun Pembayaran'}
          </h2>
          {editingId !== null ? (
            <button type="button" onClick={resetForm} className="btn-secondary px-4 py-2">
              Batal Edit
            </button>
          ) : null}
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="pa-method"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Metode Pembayaran
              </label>
              <select
                id="pa-method"
                value={form.method}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    method: event.target.value as PaymentMethod,
                  }))
                }
                className="input-sharp mt-1.5"
                disabled={submitting}
              >
                <option value={PAYMENT_METHOD.BANK_TRANSFER}>Transfer Bank</option>
                <option value={PAYMENT_METHOD.QRIS}>QRIS</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="pa-provider"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Nama Bank / Penyedia
              </label>
              <input
                id="pa-provider"
                type="text"
                value={form.providerName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, providerName: event.target.value }))
                }
                placeholder={form.method === PAYMENT_METHOD.QRIS ? 'QRIS YNG Apparel' : 'BCA'}
                className="input-sharp mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label
                htmlFor="pa-number"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Nomor Rekening{' '}
                {form.method === PAYMENT_METHOD.BANK_TRANSFER ? '(Wajib)' : '(Opsional)'}
              </label>
              <input
                id="pa-number"
                type="text"
                value={form.accountNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, accountNumber: event.target.value }))
                }
                placeholder={
                  form.method === PAYMENT_METHOD.QRIS ? 'Opsional untuk QRIS' : '1234567890'
                }
                className="input-sharp mt-1.5 font-mono"
                disabled={submitting}
              />
            </div>

            <div>
              <label
                htmlFor="pa-holder"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Atas Nama
              </label>
              <input
                id="pa-holder"
                type="text"
                value={form.accountHolder}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, accountHolder: event.target.value }))
                }
                placeholder="YNG Apparel"
                className="input-sharp mt-1.5"
                disabled={submitting}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="pa-instructions"
              className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
            >
              Instruksi Pembayaran (Opsional)
            </label>
            <textarea
              id="pa-instructions"
              rows={2}
              value={form.instructions}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, instructions: event.target.value }))
              }
              placeholder="Transfer sesuai nominal tagihan lalu unggah bukti pembayaran."
              className="input-sharp mt-1.5"
              disabled={submitting}
            />
          </div>

          <CatalogImageField
            id="pa-qris-upload"
            label="Gambar Kode QRIS (Folder qris)"
            folder="qris"
            pathValue={form.qrImagePath}
            existingUrl={form.qrImageUrl}
            helperText="Resolusi <= 2000px dipertahankan tanpa diperkecil agar QR mudah dipindai."
            onChange={(nextPath, nextUrl) =>
              setForm((prev) => ({ ...prev, qrImagePath: nextPath, qrImageUrl: nextUrl }))
            }
            disabled={submitting}
          />

          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
            {submitting
              ? 'Menyimpan...'
              : editingId !== null
                ? 'Simpan Perubahan Rekening'
                : 'Tambah Akun Pembayaran'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em]">
          Daftar Akun Pembayaran ({accounts.length})
        </h2>

        {loading ? (
          <div className="card-sharp p-6 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted">
            Memuat daftar rekening pembayaran...
          </div>
        ) : accounts.length === 0 ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Belum ada rekening atau QRIS yang tersimpan.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((account) => (
              <article key={account.id} className="card-sharp flex flex-col justify-between p-4">
                <div className="flex gap-4">
                  {account.qrImageUrl ? (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center border border-line-strong bg-bone">
                      <img
                        src={account.qrImageUrl}
                        alt={`QRIS ${account.providerName}`}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : null}

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="border border-ink bg-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-bone">
                        {account.method === PAYMENT_METHOD.QRIS ? 'QRIS' : 'TRANSFER BANK'}
                      </span>
                      <ActiveStatusBadge isActive={account.isActive} />
                    </div>

                    <h3 className="font-display text-base font-bold uppercase tracking-[0.06em]">
                      {account.providerName}
                    </h3>

                    {account.accountNumber ? (
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {account.accountNumber}
                      </p>
                    ) : null}

                    <p className="text-xs text-neutral-600">a.n. {account.accountHolder}</p>

                    {account.instructions ? (
                      <p className="text-xs leading-relaxed text-neutral-600">
                        {account.instructions}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(account)}
                    className="btn-secondary flex-1 px-3 py-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(account)}
                    disabled={busyId === account.id}
                    className={`inline-flex min-h-touch flex-1 items-center justify-center border px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] transition-colors disabled:opacity-40 ${
                      account.isActive
                        ? 'border-status-err text-status-err hover:bg-status-err hover:text-bone'
                        : 'border-status-ok text-status-ok hover:bg-status-ok hover:text-bone'
                    }`}
                  >
                    {busyId === account.id
                      ? 'Proses...'
                      : account.isActive
                        ? 'Nonaktifkan'
                        : 'Aktifkan'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
