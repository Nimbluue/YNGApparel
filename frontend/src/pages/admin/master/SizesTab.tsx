import type { SizeDto } from '@yng/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ActiveStatusBadge,
  AdminFeedbackBanner,
} from '../../../components/admin/AdminFeedbackBanner';
import {
  createSize,
  deactivateSize,
  listSizes,
  updateSize,
} from '../../../services/adminMasterService';
import { extractApiError } from '../../../utils/apiError';
import { formatRupiah } from '../../../utils/formatRupiah';

interface SizesTabProps {
  includeInactive: boolean;
}

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(num) ? num : null;
}

export default function SizesTab({ includeInactive }: SizesTabProps) {
  const [sizes, setSizes] = useState<SizeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [extraCharge, setExtraCharge] = useState('0');
  const [sortOrder, setSortOrder] = useState('0');

  const [feedback, setFeedback] = useState<{
    variant: 'error' | 'success';
    message: string;
    details?: string[];
  } | null>(null);

  const loadSizes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSizes(includeInactive);
      setSizes(data);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat daftar ukuran.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void loadSizes();
  }, [loadSizes]);

  function resetForm() {
    setEditingId(null);
    setCode('');
    setExtraCharge('0');
    setSortOrder('0');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const normalizedCode = code.trim().toUpperCase();
    const parsedExtra = parseNonNegativeInt(extraCharge);
    const parsedSort = parseNonNegativeInt(sortOrder);

    if (!/^[A-Za-z0-9_-]{1,10}$/.test(normalizedCode)) {
      setFeedback({
        variant: 'error',
        message: 'Kode ukuran harus 1–10 karakter (huruf, angka, _ atau -).',
      });
      return;
    }

    if (parsedExtra === null) {
      setFeedback({
        variant: 'error',
        message: 'Biaya tambahan harus bilangan bulat rupiah (>= 0).',
      });
      return;
    }

    if (parsedSort === null) {
      setFeedback({ variant: 'error', message: 'Urutan harus bilangan bulat (>= 0).' });
      return;
    }

    setSubmitting(true);
    try {
      if (editingId !== null) {
        const updated = await updateSize(editingId, {
          code: normalizedCode,
          extraCharge: parsedExtra,
          sortOrder: parsedSort,
        });
        setFeedback({ variant: 'success', message: `Ukuran "${updated.code}" diperbarui.` });
      } else {
        const created = await createSize({
          code: normalizedCode,
          extraCharge: parsedExtra,
          sortOrder: parsedSort,
        });
        setFeedback({ variant: 'success', message: `Ukuran "${created.code}" ditambahkan.` });
      }
      resetForm();
      await loadSizes();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan data ukuran.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(size: SizeDto) {
    setBusyId(size.id);
    setFeedback(null);
    try {
      if (size.isActive) {
        await deactivateSize(size.id);
        setFeedback({ variant: 'success', message: `Ukuran "${size.code}" dinonaktifkan.` });
      } else {
        await updateSize(size.id, { isActive: true });
        setFeedback({
          variant: 'success',
          message: `Ukuran "${size.code}" diaktifkan kembali.`,
        });
      }
      await loadSizes();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status ukuran.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
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
          <h2 className="font-display text-base font-semibold text-ink">
            {editingId !== null ? 'Edit Ukuran' : 'Tambah Ukuran'}
          </h2>
          {editingId !== null ? (
            <button type="button" onClick={resetForm} className="btn-secondary px-4 py-2">
              Batal Edit
            </button>
          ) : null}
        </div>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="mt-4 grid gap-4 sm:grid-cols-4 sm:items-end"
          noValidate
        >
          <div>
            <label htmlFor="size-code" className="block text-sm font-medium text-ink">
              Kode Ukuran
            </label>
            <input
              id="size-code"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="XXL"
              className="input-sharp mt-1.5 font-mono uppercase"
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="size-extra" className="block text-sm font-medium text-ink">
              Biaya Ekstra (Rp)
            </label>
            <input
              id="size-extra"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={extraCharge}
              onChange={(event) => setExtraCharge(event.target.value)}
              className="input-sharp tabular-price mt-1.5"
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="size-sort" className="block text-sm font-medium text-ink">
              Urutan Tampil
            </label>
            <input
              id="size-sort"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="input-sharp tabular-price mt-1.5"
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Menyimpan...' : editingId !== null ? 'Simpan' : 'Tambah'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold text-ink">
          Daftar Ukuran (<span className="tabular-price">{sizes.length}</span>)
        </h2>

        {loading ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Memuat daftar ukuran...
          </div>
        ) : sizes.length === 0 ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Belum ada data ukuran untuk ditampilkan.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sizes.map((size) => (
              <article key={size.id} className="card-sharp flex flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-semibold text-ink">{size.code}</h3>
                    <ActiveStatusBadge isActive={size.isActive} />
                  </div>
                  <p className="tabular-price mt-2 text-sm font-semibold">
                    +{formatRupiah(size.extraCharge)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Urutan <span className="tabular-price text-ink">{size.sortOrder}</span>
                  </p>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFeedback(null);
                      setEditingId(size.id);
                      setCode(size.code);
                      setExtraCharge(String(size.extraCharge));
                      setSortOrder(String(size.sortOrder));
                    }}
                    className="btn-secondary flex-1 px-3 py-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(size)}
                    disabled={busyId === size.id}
                    className={`inline-flex min-h-touch flex-1 items-center justify-center rounded-full border px-3 py-2 font-display text-xs font-semibold transition-colors disabled:opacity-40 ${
                      size.isActive
                        ? 'border-status-err text-status-err hover:bg-status-err hover:text-white'
                        : 'border-status-ok text-status-ok hover:bg-status-ok hover:text-white'
                    }`}
                  >
                    {busyId === size.id ? '...' : size.isActive ? 'Nonaktifkan' : 'Aktifkan'}
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
