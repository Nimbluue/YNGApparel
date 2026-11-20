import type { FabricColorDto, FabricDto } from '@yng/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ActiveStatusBadge,
  AdminFeedbackBanner,
} from '../../../components/admin/AdminFeedbackBanner';
import CatalogImageField from '../../../components/admin/CatalogImageField';
import {
  createFabric,
  createFabricColor,
  deactivateFabric,
  deactivateFabricColor,
  listFabricColors,
  listFabrics,
  updateFabric,
  updateFabricColor,
} from '../../../services/adminMasterService';
import { extractApiError } from '../../../utils/apiError';
import { formatRupiah } from '../../../utils/formatRupiah';

interface FabricsTabProps {
  includeInactive: boolean;
}

interface FabricFormState {
  code: string;
  name: string;
  additionalPrice: string;
  gsmWeight: string;
  thicknessLevel: string;
  comfortLevel: string;
  sortOrder: string;
  description: string;
  imagePath: string | null;
  imageUrl: string | null;
  macroImagePath: string | null;
  macroImageUrl: string | null;
}

interface ColorFormState {
  colorName: string;
  colorHex: string;
  sortOrder: string;
}

const INITIAL_FABRIC_FORM: FabricFormState = {
  code: '',
  name: '',
  additionalPrice: '0',
  gsmWeight: '',
  thicknessLevel: '3',
  comfortLevel: '',
  sortOrder: '0',
  description: '',
  imagePath: null,
  imageUrl: null,
  macroImagePath: null,
  macroImageUrl: null,
};

const INITIAL_COLOR_FORM: ColorFormState = {
  colorName: '',
  colorHex: '#09090B',
  sortOrder: '0',
};

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(num) ? num : null;
}

export default function FabricsTab({ includeInactive }: FabricsTabProps) {
  const [fabrics, setFabrics] = useState<FabricDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyFabricId, setBusyFabricId] = useState<number | null>(null);

  const [editingFabricId, setEditingFabricId] = useState<number | null>(null);
  const [form, setForm] = useState<FabricFormState>(INITIAL_FABRIC_FORM);

  // Panel Preset Warna per Bahan
  const [activeColorFabric, setActiveColorFabric] = useState<FabricDto | null>(null);
  const [colors, setColors] = useState<FabricColorDto[]>([]);
  const [loadingColors, setLoadingColors] = useState(false);
  const [editingColorId, setEditingColorId] = useState<number | null>(null);
  const [colorForm, setColorForm] = useState<ColorFormState>(INITIAL_COLOR_FORM);
  const [submittingColor, setSubmittingColor] = useState(false);
  const [busyColorId, setBusyColorId] = useState<number | null>(null);

  const [feedback, setFeedback] = useState<{
    variant: 'error' | 'success';
    message: string;
    details?: string[];
  } | null>(null);

  const loadFabrics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listFabrics(includeInactive);
      setFabrics(data);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat daftar bahan pakaian.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  const loadColorsForFabric = useCallback(
    async (fabricId: number) => {
      setLoadingColors(true);
      try {
        const list = await listFabricColors(fabricId, includeInactive);
        setColors(list);
      } catch (err: unknown) {
        const parsed = extractApiError(err, 'Gagal memuat preset warna bahan.');
        setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
      } finally {
        setLoadingColors(false);
      }
    },
    [includeInactive]
  );

  useEffect(() => {
    void loadFabrics();
  }, [loadFabrics]);

  useEffect(() => {
    if (activeColorFabric) {
      void loadColorsForFabric(activeColorFabric.id);
    }
  }, [activeColorFabric, loadColorsForFabric]);

  function resetFabricForm() {
    setEditingFabricId(null);
    setForm(INITIAL_FABRIC_FORM);
  }

  function startEditFabric(fabric: FabricDto) {
    setFeedback(null);
    setEditingFabricId(fabric.id);
    setForm({
      code: fabric.code,
      name: fabric.name,
      additionalPrice: String(fabric.additionalPrice),
      gsmWeight: fabric.gsmWeight !== null ? String(fabric.gsmWeight) : '',
      thicknessLevel: String(fabric.thicknessLevel),
      comfortLevel: fabric.comfortLevel !== null ? String(fabric.comfortLevel) : '',
      sortOrder: String(fabric.sortOrder),
      description: fabric.description ?? '',
      imagePath: fabric.imagePath,
      imageUrl: fabric.imageUrl,
      macroImagePath: fabric.macroImagePath,
      macroImageUrl: fabric.macroImageUrl,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openColorPanel(fabric: FabricDto) {
    setFeedback(null);
    setActiveColorFabric(fabric);
    setEditingColorId(null);
    setColorForm(INITIAL_COLOR_FORM);
  }

  async function handleFabricSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    const additionalPrice = parseNonNegativeInt(form.additionalPrice);
    const sortOrder = parseNonNegativeInt(form.sortOrder);
    const thicknessLevel = parseNonNegativeInt(form.thicknessLevel);

    if (!/^[A-Za-z0-9_-]{2,50}$/.test(code)) {
      setFeedback({
        variant: 'error',
        message: 'Kode bahan harus 2–50 karakter (huruf, angka, _ atau -).',
      });
      return;
    }

    if (name.length < 2) {
      setFeedback({ variant: 'error', message: 'Nama bahan minimal 2 karakter.' });
      return;
    }

    if (additionalPrice === null) {
      setFeedback({
        variant: 'error',
        message: 'Tambahan harga harus bilangan bulat rupiah (>= 0).',
      });
      return;
    }

    if (sortOrder === null) {
      setFeedback({ variant: 'error', message: 'Urutan harus bilangan bulat (>= 0).' });
      return;
    }

    if (thicknessLevel === null || thicknessLevel < 1 || thicknessLevel > 5) {
      setFeedback({ variant: 'error', message: 'Tingkat ketebalan harus di antara 1 sampai 5.' });
      return;
    }

    let gsmWeight: number | null = null;
    if (form.gsmWeight.trim() !== '') {
      const parsedGsm = parseNonNegativeInt(form.gsmWeight);
      if (parsedGsm === null || parsedGsm < 50 || parsedGsm > 1000) {
        setFeedback({ variant: 'error', message: 'Berat GSM harus di antara 50 sampai 1000.' });
        return;
      }
      gsmWeight = parsedGsm;
    }

    let comfortLevel: number | null = null;
    if (form.comfortLevel.trim() !== '') {
      const parsedComfort = parseNonNegativeInt(form.comfortLevel);
      if (parsedComfort === null || parsedComfort < 1 || parsedComfort > 5) {
        setFeedback({
          variant: 'error',
          message: 'Tingkat kenyamanan harus di antara 1 sampai 5.',
        });
        return;
      }
      comfortLevel = parsedComfort;
    }

    setSubmitting(true);
    try {
      const payload = {
        code,
        name,
        additionalPrice,
        gsmWeight,
        thicknessLevel,
        comfortLevel,
        sortOrder,
        description: form.description.trim() || null,
        imagePath: form.imagePath,
        macroImagePath: form.macroImagePath,
      };

      if (editingFabricId !== null) {
        const updated = await updateFabric(editingFabricId, payload);
        setFeedback({
          variant: 'success',
          message: `Bahan "${updated.name}" berhasil diperbarui.`,
        });
      } else {
        const created = await createFabric(payload);
        setFeedback({ variant: 'success', message: `Bahan "${created.name}" berhasil dibuat.` });
      }

      resetFabricForm();
      await loadFabrics();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan data bahan.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleFabricActive(fabric: FabricDto) {
    setBusyFabricId(fabric.id);
    setFeedback(null);
    try {
      if (fabric.isActive) {
        await deactivateFabric(fabric.id);
        setFeedback({ variant: 'success', message: `Bahan "${fabric.name}" dinonaktifkan.` });
      } else {
        await updateFabric(fabric.id, { isActive: true });
        setFeedback({
          variant: 'success',
          message: `Bahan "${fabric.name}" diaktifkan kembali.`,
        });
      }
      await loadFabrics();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status bahan.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setBusyFabricId(null);
    }
  }

  async function handleColorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeColorFabric) return;
    setFeedback(null);

    const colorName = colorForm.colorName.trim();
    const colorHex = colorForm.colorHex.trim().toUpperCase();
    const sortOrder = parseNonNegativeInt(colorForm.sortOrder);

    if (!colorName) {
      setFeedback({ variant: 'error', message: 'Nama warna wajib diisi.' });
      return;
    }

    if (!/^#[0-9A-F]{6}$/.test(colorHex)) {
      setFeedback({ variant: 'error', message: 'Kode hex warna harus berformat #RRGGBB.' });
      return;
    }

    if (sortOrder === null) {
      setFeedback({ variant: 'error', message: 'Urutan warna harus bilangan bulat (>= 0).' });
      return;
    }

    setSubmittingColor(true);
    try {
      if (editingColorId !== null) {
        await updateFabricColor(activeColorFabric.id, editingColorId, {
          colorName,
          colorHex,
          sortOrder,
        });
        setFeedback({ variant: 'success', message: `Warna "${colorName}" diperbarui.` });
      } else {
        await createFabricColor(activeColorFabric.id, { colorName, colorHex, sortOrder });
        setFeedback({ variant: 'success', message: `Warna "${colorName}" ditambahkan.` });
      }
      setEditingColorId(null);
      setColorForm(INITIAL_COLOR_FORM);
      await Promise.all([loadColorsForFabric(activeColorFabric.id), loadFabrics()]);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan preset warna.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSubmittingColor(false);
    }
  }

  async function handleToggleColorActive(color: FabricColorDto) {
    if (!activeColorFabric) return;
    setBusyColorId(color.id);
    setFeedback(null);
    try {
      if (color.isActive) {
        await deactivateFabricColor(activeColorFabric.id, color.id);
        setFeedback({
          variant: 'success',
          message: `Warna "${color.colorName}" dinonaktifkan.`,
        });
      } else {
        await updateFabricColor(activeColorFabric.id, color.id, { isActive: true });
        setFeedback({
          variant: 'success',
          message: `Warna "${color.colorName}" diaktifkan kembali.`,
        });
      }
      await Promise.all([loadColorsForFabric(activeColorFabric.id), loadFabrics()]);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status warna.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setBusyColorId(null);
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
          <div>
            <h2 className="font-display text-base font-bold uppercase tracking-[0.1em]">
              {editingFabricId !== null ? 'Edit Bahan Pakaian' : 'Tambah Bahan Pakaian'}
            </h2>
            <p className="text-xs text-muted">
              Kelola spesifikasi bahan, tambahan harga, dan foto serat makro.
            </p>
          </div>
          {editingFabricId !== null ? (
            <button type="button" onClick={resetFabricForm} className="btn-secondary px-4 py-2">
              Batal Edit
            </button>
          ) : null}
        </div>

        <form
          onSubmit={(event) => void handleFabricSubmit(event)}
          className="mt-4 space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="fabric-code"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Kode Bahan
              </label>
              <input
                id="fabric-code"
                type="text"
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
                }
                placeholder="CC30S"
                className="input-sharp mt-1.5 font-mono uppercase"
                disabled={submitting}
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="fabric-name"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Nama Bahan
              </label>
              <input
                id="fabric-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Cotton Combed 30s"
                className="input-sharp mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label
                htmlFor="fabric-price"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Tambahan Harga (Rp)
              </label>
              <input
                id="fabric-price"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.additionalPrice}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, additionalPrice: event.target.value }))
                }
                className="input-sharp tabular-price mt-1.5"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="fabric-gsm"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Berat GSM (Opsional)
              </label>
              <input
                id="fabric-gsm"
                type="number"
                inputMode="numeric"
                min={50}
                max={1000}
                step={1}
                value={form.gsmWeight}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, gsmWeight: event.target.value }))
                }
                placeholder="150"
                className="input-sharp tabular-price mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label
                htmlFor="fabric-thickness"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Ketebalan (1–5)
              </label>
              <select
                id="fabric-thickness"
                value={form.thicknessLevel}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, thicknessLevel: event.target.value }))
                }
                className="input-sharp mt-1.5"
                disabled={submitting}
              >
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <option key={lvl} value={String(lvl)}>
                    {lvl} / 5
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="fabric-comfort"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Kenyamanan (1–5)
              </label>
              <select
                id="fabric-comfort"
                value={form.comfortLevel}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, comfortLevel: event.target.value }))
                }
                className="input-sharp mt-1.5"
                disabled={submitting}
              >
                <option value="">Kosongkan</option>
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <option key={lvl} value={String(lvl)}>
                    {lvl} / 5
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="fabric-sort"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Urutan Tampil
              </label>
              <input
                id="fabric-sort"
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

          <div>
            <label
              htmlFor="fabric-description"
              className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
            >
              Deskripsi Bahan (Opsional)
            </label>
            <input
              id="fabric-description"
              type="text"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Karakteristik serat, adem, cocok untuk sablon DTF/plastisol"
              className="input-sharp mt-1.5"
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CatalogImageField
              id="fabric-image-upload"
              label="Foto Bahan"
              folder="fabrics"
              pathValue={form.imagePath}
              existingUrl={form.imageUrl}
              onChange={(nextPath, nextUrl) =>
                setForm((prev) => ({ ...prev, imagePath: nextPath, imageUrl: nextUrl }))
              }
              disabled={submitting}
            />

            <CatalogImageField
              id="fabric-macro-upload"
              label="Foto Makro Serat (Fabric Lab)"
              folder="fabrics"
              pathValue={form.macroImagePath}
              existingUrl={form.macroImageUrl}
              onChange={(nextPath, nextUrl) =>
                setForm((prev) => ({ ...prev, macroImagePath: nextPath, macroImageUrl: nextUrl }))
              }
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
            {submitting
              ? 'Menyimpan...'
              : editingFabricId !== null
                ? 'Simpan Perubahan Bahan'
                : 'Tambah Bahan'}
          </button>
        </form>
      </section>

      {activeColorFabric ? (
        <section className="card-sharp border-ink p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Preset Warna Stok — {activeColorFabric.code}
              </p>
              <h3 className="font-display text-base font-bold uppercase tracking-[0.08em]">
                Kelola Warna: {activeColorFabric.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveColorFabric(null)}
              className="btn-secondary px-4 py-2"
            >
              Tutup Panel Warna
            </button>
          </div>

          <form
            onSubmit={(event) => void handleColorSubmit(event)}
            className="mt-4 grid gap-3 border-b border-line pb-4 sm:grid-cols-12 sm:items-end"
            noValidate
          >
            <div className="sm:col-span-4">
              <label
                htmlFor="color-name"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Nama Warna
              </label>
              <input
                id="color-name"
                type="text"
                value={colorForm.colorName}
                onChange={(event) =>
                  setColorForm((prev) => ({ ...prev, colorName: event.target.value }))
                }
                placeholder="Hitam Jet"
                className="input-sharp mt-1.5"
                disabled={submittingColor}
              />
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="color-hex"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Kode Hex (#RRGGBB)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="color"
                  aria-label="Pemilih warna visual"
                  value={
                    /^#[0-9A-Fa-f]{6}$/.test(colorForm.colorHex) ? colorForm.colorHex : '#09090B'
                  }
                  onChange={(event) =>
                    setColorForm((prev) => ({
                      ...prev,
                      colorHex: event.target.value.toUpperCase(),
                    }))
                  }
                  className="h-[44px] w-12 shrink-0 cursor-pointer border border-line-strong bg-surface p-1"
                  disabled={submittingColor}
                />
                <input
                  id="color-hex"
                  type="text"
                  value={colorForm.colorHex}
                  onChange={(event) =>
                    setColorForm((prev) => ({
                      ...prev,
                      colorHex: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="#09090B"
                  className="input-sharp font-mono uppercase"
                  disabled={submittingColor}
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="color-sort"
                className="block font-display text-xs font-semibold uppercase tracking-[0.14em]"
              >
                Urutan
              </label>
              <input
                id="color-sort"
                type="number"
                inputMode="numeric"
                min={0}
                value={colorForm.sortOrder}
                onChange={(event) =>
                  setColorForm((prev) => ({ ...prev, sortOrder: event.target.value }))
                }
                className="input-sharp tabular-price mt-1.5"
                disabled={submittingColor}
              />
            </div>

            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className="btn-primary w-full" disabled={submittingColor}>
                {submittingColor ? '...' : editingColorId !== null ? 'Update' : 'Tambah'}
              </button>
              {editingColorId !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingColorId(null);
                    setColorForm(INITIAL_COLOR_FORM);
                  }}
                  className="btn-secondary px-3"
                >
                  Batal
                </button>
              ) : null}
            </div>
          </form>

          {loadingColors ? (
            <p className="mt-4 font-mono text-xs uppercase text-muted">Memuat preset warna...</p>
          ) : colors.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Belum ada preset warna untuk bahan ini. Tambahkan warna pertama di atas.
            </p>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {colors.map((color) => (
                <div
                  key={color.id}
                  className="flex flex-col justify-between gap-2 border border-line bg-bone p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-7 w-7 shrink-0 border border-line-strong"
                        style={{ backgroundColor: color.colorHex }}
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-semibold">{color.colorName}</p>
                        <p className="font-mono text-xs text-muted">{color.colorHex}</p>
                      </div>
                    </div>
                    <ActiveStatusBadge isActive={color.isActive} />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingColorId(color.id);
                        setColorForm({
                          colorName: color.colorName,
                          colorHex: color.colorHex,
                          sortOrder: String(color.sortOrder),
                        });
                      }}
                      className="btn-secondary flex-1 px-2 py-1.5"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleColorActive(color)}
                      disabled={busyColorId === color.id}
                      className={`inline-flex min-h-touch flex-1 items-center justify-center border px-2 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.1em] ${
                        color.isActive
                          ? 'border-status-err text-status-err hover:bg-status-err hover:text-bone'
                          : 'border-status-ok text-status-ok hover:bg-status-ok hover:text-bone'
                      }`}
                    >
                      {busyColorId === color.id
                        ? '...'
                        : color.isActive
                          ? 'Nonaktifkan'
                          : 'Aktifkan'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em]">
          Daftar Bahan ({fabrics.length})
        </h2>

        {loading ? (
          <div className="card-sharp p-6 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted">
            Memuat daftar bahan pakaian...
          </div>
        ) : fabrics.length === 0 ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Belum ada bahan pakaian untuk ditampilkan.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {fabrics.map((fabric) => (
              <article key={fabric.id} className="card-sharp flex flex-col justify-between p-4">
                <div className="flex gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-line bg-bone">
                    {fabric.imageUrl ? (
                      <img
                        src={fabric.imageUrl}
                        alt={fabric.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="px-1 text-center font-mono text-[10px] uppercase text-muted">
                        No Img
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-base font-bold uppercase tracking-[0.06em]">
                        {fabric.name}
                      </h3>
                      <ActiveStatusBadge isActive={fabric.isActive} />
                    </div>
                    <p className="font-mono text-xs text-muted">
                      {fabric.code}
                      {fabric.gsmWeight ? ` · ${fabric.gsmWeight} GSM` : ''}
                      {` · Tebal ${fabric.thicknessLevel}/5`}
                    </p>
                    <p className="tabular-price text-sm font-semibold">
                      +{formatRupiah(fabric.additionalPrice)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 border-t border-line pt-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                    Preset Warna ({fabric.colors.length})
                  </p>
                  {fabric.colors.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {fabric.colors.map((color) => (
                        <span
                          key={color.id}
                          title={`${color.colorName} (${color.colorHex})`}
                          className="inline-flex items-center gap-1.5 border border-line-strong bg-bone px-2 py-0.5 text-xs"
                        >
                          <span
                            className="inline-block h-3 w-3 border border-line-strong"
                            style={{ backgroundColor: color.colorHex }}
                          />
                          <span>{color.colorName}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-status-warn">Belum ada preset warna.</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEditFabric(fabric)}
                    className="btn-secondary flex-1 px-3 py-2 sm:flex-none"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => openColorPanel(fabric)}
                    className="btn-secondary flex-1 px-3 py-2 sm:flex-none"
                  >
                    Kelola Warna ({fabric.colors.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleFabricActive(fabric)}
                    disabled={busyFabricId === fabric.id}
                    className={`inline-flex min-h-touch flex-1 items-center justify-center border px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] transition-colors disabled:opacity-40 sm:flex-none ${
                      fabric.isActive
                        ? 'border-status-err text-status-err hover:bg-status-err hover:text-bone'
                        : 'border-status-ok text-status-ok hover:bg-status-ok hover:text-bone'
                    }`}
                  >
                    {busyFabricId === fabric.id
                      ? 'Proses...'
                      : fabric.isActive
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
