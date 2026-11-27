import type { PrintSizeDto } from '@yng/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ActiveStatusBadge } from '../../../components/admin/AdminFeedbackBanner';
import { useToast } from '../../../components/ui/toastContext';
import {
  createPrintSize,
  deactivatePrintSize,
  listPrintSizes,
  updatePrintSize,
} from '../../../services/adminMasterService';
import { extractApiError } from '../../../utils/apiError';
import { formatRupiah } from '../../../utils/formatRupiah';

interface PrintSizesTabProps {
  includeInactive: boolean;
}

interface PrintSizeFormState {
  code: string;
  name: string;
  dimensionsCm: string;
  widthCm: string;
  heightCm: string;
  pricePerSpot: string;
  sortOrder: string;
}

const INITIAL_FORM: PrintSizeFormState = {
  code: '',
  name: '',
  dimensionsCm: '',
  widthCm: '',
  heightCm: '',
  pricePerSpot: '0',
  sortOrder: '0',
};

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(num) ? num : null;
}

export default function PrintSizesTab({ includeInactive }: PrintSizesTabProps) {
  const { toast } = useToast();
  const [printSizes, setPrintSizes] = useState<PrintSizeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PrintSizeFormState>(INITIAL_FORM);

  const loadPrintSizes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPrintSizes(includeInactive);
      setPrintSizes(data);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat daftar ukuran sablon.');
      toast(parsed.message, 'err', { details: parsed.details });
    } finally {
      setLoading(false);
    }
  }, [includeInactive, toast]);

  useEffect(() => {
    void loadPrintSizes();
  }, [loadPrintSizes]);

  function resetForm() {
    setEditingId(null);
    setForm(INITIAL_FORM);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    const dimensionsCm = form.dimensionsCm.trim();
    const widthCm = Number(form.widthCm);
    const heightCm = Number(form.heightCm);
    const pricePerSpot = parseNonNegativeInt(form.pricePerSpot);
    const sortOrder = parseNonNegativeInt(form.sortOrder);

    if (!/^[A-Za-z0-9_-]{1,20}$/.test(code)) {
      toast('Kode sablon harus 1–20 karakter (huruf, angka, _ atau -).', 'err');
      return;
    }

    if (!name || !dimensionsCm) {
      toast('Nama dan label dimensi cm wajib diisi.', 'err');
      return;
    }

    if (!Number.isFinite(widthCm) || widthCm <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) {
      toast('Lebar dan tinggi (cm) harus lebih dari 0.', 'err');
      return;
    }

    if (pricePerSpot === null) {
      toast('Harga sablon harus berupa angka bulat (minimal 0).', 'err');
      return;
    }

    if (sortOrder === null) {
      toast('Urutan harus berupa angka bulat (minimal 0).', 'err');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        code,
        name,
        dimensionsCm,
        widthCm,
        heightCm,
        pricePerSpot,
        sortOrder,
      };

      if (editingId !== null) {
        const updated = await updatePrintSize(editingId, payload);
        toast(`Ukuran sablon "${updated.name}" diperbarui.`, 'ok');
      } else {
        const created = await createPrintSize(payload);
        toast(`Ukuran sablon "${created.name}" ditambahkan.`, 'ok');
      }

      resetForm();
      await loadPrintSizes();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan data ukuran sablon.');
      toast(parsed.message, 'err', { details: parsed.details });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(ps: PrintSizeDto) {
    setBusyId(ps.id);
    try {
      if (ps.isActive) {
        await deactivatePrintSize(ps.id);
        toast(`Ukuran sablon "${ps.name}" dinonaktifkan.`, 'ok');
      } else {
        await updatePrintSize(ps.id, { isActive: true });
        toast(`Ukuran sablon "${ps.name}" diaktifkan kembali.`, 'ok');
      }
      await loadPrintSizes();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status ukuran sablon.');
      toast(parsed.message, 'err', { details: parsed.details });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card-sharp p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <h2 className="font-display text-base font-semibold text-ink">
            {editingId !== null ? 'Edit Ukuran Sablon' : 'Tambah Ukuran Sablon'}
          </h2>
          {editingId !== null ? (
            <button type="button" onClick={resetForm} className="btn-secondary px-4 py-2">
              Batal Edit
            </button>
          ) : null}
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="ps-code" className="block text-sm font-medium text-ink">
                Kode
              </label>
              <input
                id="ps-code"
                type="text"
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
                }
                placeholder="A4"
                className="input-sharp mt-1.5 font-mono uppercase"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="ps-name" className="block text-sm font-medium text-ink">
                Nama Tampilan
              </label>
              <input
                id="ps-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="A4"
                className="input-sharp mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="ps-dim" className="block text-sm font-medium text-ink">
                Label Dimensi (cm)
              </label>
              <input
                id="ps-dim"
                type="text"
                value={form.dimensionsCm}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dimensionsCm: event.target.value }))
                }
                placeholder="21 x 29.7"
                className="input-sharp mt-1.5 font-mono"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="ps-width" className="block text-sm font-medium text-ink">
                Lebar (cm)
              </label>
              <input
                id="ps-width"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.1"
                value={form.widthCm}
                onChange={(event) => setForm((prev) => ({ ...prev, widthCm: event.target.value }))}
                placeholder="21"
                className="input-sharp tabular-price mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="ps-height" className="block text-sm font-medium text-ink">
                Tinggi (cm)
              </label>
              <input
                id="ps-height"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.1"
                value={form.heightCm}
                onChange={(event) => setForm((prev) => ({ ...prev, heightCm: event.target.value }))}
                placeholder="29.7"
                className="input-sharp tabular-price mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="ps-price" className="block text-sm font-medium text-ink">
                Harga / Desain (Rp)
              </label>
              <input
                id="ps-price"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.pricePerSpot}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, pricePerSpot: event.target.value }))
                }
                className="input-sharp tabular-price mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="ps-sort" className="block text-sm font-medium text-ink">
                Urutan Tampil
              </label>
              <input
                id="ps-sort"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sortOrder: event.target.value }))
                }
                className="input-sharp tabular-price mt-1.5"
                disabled={submitting}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
            {submitting
              ? 'Menyimpan...'
              : editingId !== null
                ? 'Simpan Perubahan Sablon'
                : 'Tambah Ukuran Sablon'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold text-ink">
          Daftar Ukuran Sablon (<span className="tabular-price">{printSizes.length}</span>)
        </h2>

        {loading ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Memuat daftar ukuran sablon...
          </div>
        ) : printSizes.length === 0 ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Belum ada ukuran sablon untuk ditampilkan.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {printSizes.map((ps) => (
              <article key={ps.id} className="card-sharp flex flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold text-ink">
                      {ps.name} <span className="font-mono text-xs text-muted">({ps.code})</span>
                    </h3>
                    <ActiveStatusBadge isActive={ps.isActive} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    <span className="tabular-price text-ink">
                      {ps.dimensionsCm} cm ({ps.widthCm} × {ps.heightCm} cm)
                    </span>{' '}
                    · Urutan <span className="tabular-price">{ps.sortOrder}</span>
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    <span className="tabular-price">{formatRupiah(ps.pricePerSpot)}</span> / titik
                  </p>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(ps.id);
                      setForm({
                        code: ps.code,
                        name: ps.name,
                        dimensionsCm: ps.dimensionsCm,
                        widthCm: String(ps.widthCm),
                        heightCm: String(ps.heightCm),
                        pricePerSpot: String(ps.pricePerSpot),
                        sortOrder: String(ps.sortOrder),
                      });
                    }}
                    className="btn-secondary flex-1 px-3 py-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(ps)}
                    disabled={busyId === ps.id}
                    className={`inline-flex min-h-touch flex-1 items-center justify-center rounded-sm border px-3 py-2 font-display text-xs font-semibold transition-colors disabled:opacity-40 ${
                      ps.isActive
                        ? 'border-status-err text-status-err hover:bg-status-err hover:text-white'
                        : 'border-status-ok text-status-ok hover:bg-status-ok hover:text-white'
                    }`}
                  >
                    {busyId === ps.id ? '...' : ps.isActive ? 'Nonaktifkan' : 'Aktifkan'}
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
