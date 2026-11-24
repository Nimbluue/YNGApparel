import type { FabricDto, GarmentModelDto } from '@yng/shared';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ActiveStatusBadge,
  AdminFeedbackBanner,
} from '../../../components/admin/AdminFeedbackBanner';
import CatalogImageField from '../../../components/admin/CatalogImageField';
import {
  createModel,
  deactivateModel,
  listFabrics,
  listModels,
  replaceModelFabrics,
  updateModel,
} from '../../../services/adminMasterService';
import { extractApiError } from '../../../utils/apiError';
import { formatRupiah } from '../../../utils/formatRupiah';

interface ModelsTabProps {
  includeInactive: boolean;
}

interface ModelFormState {
  name: string;
  slug: string;
  basePrice: string;
  sortOrder: string;
  mockupTemplate: string;
  description: string;
  imagePath: string | null;
  imageUrl: string | null;
}

const INITIAL_FORM: ModelFormState = {
  name: '',
  slug: '',
  basePrice: '0',
  sortOrder: '0',
  mockupTemplate: '',
  description: '',
  imagePath: null,
  imageUrl: null,
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const num = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(num) ? num : null;
}

export default function ModelsTab({ includeInactive }: ModelsTabProps) {
  const [models, setModels] = useState<GarmentModelDto[]>([]);
  const [allFabrics, setAllFabrics] = useState<FabricDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<ModelFormState>(INITIAL_FORM);

  const [linkingModel, setLinkingModel] = useState<GarmentModelDto | null>(null);
  const [selectedFabricIds, setSelectedFabricIds] = useState<number[]>([]);
  const [savingFabrics, setSavingFabrics] = useState(false);

  const [feedback, setFeedback] = useState<{
    variant: 'error' | 'success';
    message: string;
    details?: string[];
  } | null>(null);

  const fabricMap = useMemo(() => {
    const map = new Map<number, FabricDto>();
    for (const fabric of allFabrics) {
      map.set(fabric.id, fabric);
    }
    return map;
  }, [allFabrics]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsData, fabricsData] = await Promise.all([
        listModels(includeInactive),
        listFabrics(true),
      ]);
      setModels(modelsData);
      setAllFabrics(fabricsData);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat daftar model pakaian.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function resetForm() {
    setEditingId(null);
    setSlugTouched(false);
    setForm(INITIAL_FORM);
  }

  function startEdit(model: GarmentModelDto) {
    setFeedback(null);
    setEditingId(model.id);
    setSlugTouched(true);
    setForm({
      name: model.name,
      slug: model.slug,
      basePrice: String(model.basePrice),
      sortOrder: String(model.sortOrder),
      mockupTemplate: model.mockupTemplate ?? '',
      description: model.description ?? '',
      imagePath: model.imagePath,
      imageUrl: model.imageUrl,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openLinkFabrics(model: GarmentModelDto) {
    setFeedback(null);
    setLinkingModel(model);
    setSelectedFabricIds(model.fabricIds);
  }

  function toggleFabricSelection(fabricId: number) {
    setSelectedFabricIds((prev) =>
      prev.includes(fabricId) ? prev.filter((id) => id !== fabricId) : [...prev, fabricId]
    );
  }

  async function handleSaveFabrics() {
    if (!linkingModel) return;
    setSavingFabrics(true);
    setFeedback(null);
    try {
      const updated = await replaceModelFabrics(linkingModel.id, { fabricIds: selectedFabricIds });
      setModels((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setLinkingModel(null);
      setFeedback({
        variant: 'success',
        message: `Relasi bahan untuk model "${updated.name}" berhasil disimpan.`,
      });
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memperbarui relasi bahan model.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSavingFabrics(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const name = form.name.trim();
    const slug = form.slug.trim();
    const basePrice = parseNonNegativeInt(form.basePrice);
    const sortOrder = parseNonNegativeInt(form.sortOrder);

    if (name.length < 2) {
      setFeedback({ variant: 'error', message: 'Nama model minimal 2 karakter.' });
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setFeedback({
        variant: 'error',
        message: 'Slug hanya boleh huruf kecil, angka, dan tanda hubung (-).',
      });
      return;
    }

    if (basePrice === null) {
      setFeedback({
        variant: 'error',
        message: 'Harga dasar harus berupa bilangan bulat rupiah (>= 0).',
      });
      return;
    }

    if (sortOrder === null) {
      setFeedback({ variant: 'error', message: 'Urutan harus berupa bilangan bulat (>= 0).' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name,
        slug,
        basePrice,
        sortOrder,
        mockupTemplate: form.mockupTemplate.trim() || null,
        description: form.description.trim() || null,
        imagePath: form.imagePath,
      };

      if (editingId !== null) {
        const updated = await updateModel(editingId, payload);
        setFeedback({
          variant: 'success',
          message: `Model "${updated.name}" berhasil diperbarui.`,
        });
      } else {
        const created = await createModel(payload);
        setFeedback({
          variant: 'success',
          message: `Model "${created.name}" berhasil ditambahkan.`,
        });
      }

      resetForm();
      await loadData();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan data model.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(model: GarmentModelDto) {
    setBusyId(model.id);
    setFeedback(null);
    try {
      if (model.isActive) {
        await deactivateModel(model.id);
        setFeedback({ variant: 'success', message: `Model "${model.name}" dinonaktifkan.` });
      } else {
        await updateModel(model.id, { isActive: true });
        setFeedback({ variant: 'success', message: `Model "${model.name}" diaktifkan kembali.` });
      }
      await loadData();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status model.');
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
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              {editingId !== null ? 'Edit Model Pakaian' : 'Tambah Model Pakaian'}
            </h2>
            <p className="text-xs text-muted">
              Harga dasar dalam integer rupiah penuh tanpa desimal.
            </p>
          </div>
          {editingId !== null ? (
            <button type="button" onClick={resetForm} className="btn-secondary px-4 py-2">
              Batal Edit
            </button>
          ) : null}
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="model-name" className="block text-sm font-medium text-ink">
                Nama Model
              </label>
              <input
                id="model-name"
                type="text"
                value={form.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name: nextName,
                    slug: !slugTouched && editingId === null ? slugify(nextName) : prev.slug,
                  }));
                }}
                placeholder="Kaos Lengan Pendek"
                className="input-sharp mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="model-slug" className="block text-sm font-medium text-ink">
                Slug Unik
              </label>
              <input
                id="model-slug"
                type="text"
                value={form.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setForm((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }));
                }}
                placeholder="kaos-lengan-pendek"
                className="input-sharp mt-1.5 font-mono"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="model-price" className="block text-sm font-medium text-ink">
                Harga Dasar (Rp)
              </label>
              <input
                id="model-price"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.basePrice}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, basePrice: event.target.value }))
                }
                className="input-sharp tabular-price mt-1.5"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="model-sort" className="block text-sm font-medium text-ink">
                Urutan Tampil
              </label>
              <input
                id="model-sort"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="model-template" className="block text-sm font-medium text-ink">
                Template Mockup (Opsional)
              </label>
              <input
                id="model-template"
                type="text"
                value={form.mockupTemplate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, mockupTemplate: event.target.value }))
                }
                placeholder="tee-short"
                className="input-sharp mt-1.5 font-mono"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="model-description" className="block text-sm font-medium text-ink">
                Deskripsi (Opsional)
              </label>
              <input
                id="model-description"
                type="text"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Keterangan singkat model"
                className="input-sharp mt-1.5"
                disabled={submitting}
              />
            </div>
          </div>

          <CatalogImageField
            id="model-image-upload"
            label="Foto Model Pakaian"
            folder="models"
            pathValue={form.imagePath}
            existingUrl={form.imageUrl}
            onChange={(nextPath, nextUrl) =>
              setForm((prev) => ({ ...prev, imagePath: nextPath, imageUrl: nextUrl }))
            }
            disabled={submitting}
          />

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
              {submitting
                ? 'Menyimpan...'
                : editingId !== null
                  ? 'Simpan Perubahan Model'
                  : 'Tambah Model'}
            </button>
          </div>
        </form>
      </section>

      {linkingModel ? (
        <section className="card-sharp border-ink p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <p className="eyebrow">Relasi Model &amp; Bahan</p>
              <h3 className="font-display text-base font-semibold text-ink">
                Pilih Bahan untuk {linkingModel.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setLinkingModel(null)}
              className="btn-secondary px-4 py-2"
              disabled={savingFabrics}
            >
              Tutup
            </button>
          </div>

          {allFabrics.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Belum ada bahan. Tambahkan bahan pada tab Bahan &amp; Warna terlebih dahulu.
            </p>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {allFabrics.map((fabric) => {
                const checked = selectedFabricIds.includes(fabric.id);
                return (
                  <label
                    key={fabric.id}
                    className={`flex min-h-touch cursor-pointer items-center justify-between gap-3 border px-3.5 py-2.5 transition-colors ${
                      checked ? 'border-ink bg-bone' : 'border-line bg-surface hover:border-ink'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFabricSelection(fabric.id)}
                        className="h-4 w-4 accent-ink"
                        disabled={savingFabrics}
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {fabric.name}{' '}
                          {!fabric.isActive ? (
                            <span className="text-xs text-muted">(Nonaktif)</span>
                          ) : null}
                        </span>
                        <span className="font-mono text-xs text-muted">{fabric.code}</span>
                      </span>
                    </span>
                    <span className="tabular-price text-xs font-medium">
                      +{formatRupiah(fabric.additionalPrice)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveFabrics()}
              disabled={savingFabrics}
              className="btn-primary w-full sm:w-auto"
            >
              {savingFabrics ? 'Menyimpan Relasi...' : 'Simpan Relasi Bahan'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">
            Daftar Model (<span className="tabular-price">{models.length}</span>)
          </h2>
        </div>

        {loading ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Memuat daftar model pakaian...
          </div>
        ) : models.length === 0 ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Belum ada model pakaian untuk ditampilkan.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {models.map((model) => (
              <article key={model.id} className="card-sharp flex flex-col justify-between p-4">
                <div className="flex gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-line bg-bone">
                    {model.imageUrl ? (
                      <img
                        src={model.imageUrl}
                        alt={model.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="px-1 text-center text-xs text-muted">Tanpa foto</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-base font-semibold text-ink">
                        {model.name}
                      </h3>
                      <ActiveStatusBadge isActive={model.isActive} />
                    </div>
                    <p className="truncate font-mono text-xs text-muted">{model.slug}</p>
                    <p className="tabular-price text-sm font-semibold">
                      {formatRupiah(model.basePrice)}
                    </p>
                    <p className="text-xs text-muted">
                      Urutan <span className="tabular-price text-ink">{model.sortOrder}</span>
                      {model.mockupTemplate ? (
                        <>
                          {' '}
                          · Template{' '}
                          <span className="font-mono text-ink">{model.mockupTemplate}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>

                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-xs font-medium text-muted">
                    Bahan kompatibel (
                    <span className="tabular-price">{model.fabricIds.length}</span>)
                  </p>
                  {model.fabricIds.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {model.fabricIds.map((fid) => {
                        const f = fabricMap.get(fid);
                        return (
                          <span
                            key={fid}
                            className="border border-line-strong bg-bone px-2 py-0.5 font-mono text-[11px]"
                          >
                            {f ? f.code : `#${fid}`}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-status-warn">
                      Belum ada bahan terhubung. Klik &ldquo;Atur Bahan&rdquo;.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(model)}
                    className="btn-secondary flex-1 px-3 py-2 sm:flex-none"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => openLinkFabrics(model)}
                    className="btn-secondary flex-1 px-3 py-2 sm:flex-none"
                  >
                    Atur Bahan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(model)}
                    disabled={busyId === model.id}
                    className={`inline-flex min-h-touch flex-1 items-center justify-center rounded-full border px-3 py-2 font-display text-xs font-semibold transition-colors disabled:opacity-40 sm:flex-none ${
                      model.isActive
                        ? 'border-status-err text-status-err hover:bg-status-err hover:text-white'
                        : 'border-status-ok text-status-ok hover:bg-status-ok hover:text-white'
                    }`}
                  >
                    {busyId === model.id
                      ? 'Proses...'
                      : model.isActive
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
