import { useQueryClient } from '@tanstack/react-query';
import {
  COLLECTION_STATUS,
  type CatalogCategoryDto,
  type CatalogCollectionDto,
  type CollectionStatus,
} from '@yng/shared';
import { ArrowDown, ArrowUp, Pencil, Power, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ActiveStatusBadge,
  AdminFeedbackBanner,
} from '../../../components/admin/AdminFeedbackBanner';
import CatalogImageField from '../../../components/admin/CatalogImageField';
import { Badge } from '../../../components/ui/Badge';
import { IconTooltip } from '../../../components/ui/IconTooltip';
import {
  createCategory,
  createCollection,
  deactivateCategory,
  deactivateCollection,
  listCategories,
  listCollections,
  reorderCategories,
  reorderCollections,
  updateCategory,
  updateCollection,
} from '../../../services/adminMasterService';
import { catalogQueryKeys } from '../../../services/catalogService';
import { extractApiError } from '../../../utils/apiError';

interface CategoriesCollectionsTabProps {
  includeInactive: boolean;
}

interface CategoryFormState {
  name: string;
  slug: string;
  description: string;
  sizeChartImagePath: string | null;
  sizeChartImageUrl: string | null;
}

interface CollectionFormState {
  name: string;
  slug: string;
  status: CollectionStatus;
  description: string;
}

const INITIAL_CATEGORY_FORM: CategoryFormState = {
  name: '',
  slug: '',
  description: '',
  sizeChartImagePath: null,
  sizeChartImageUrl: null,
};

const INITIAL_COLLECTION_FORM: CollectionFormState = {
  name: '',
  slug: '',
  status: COLLECTION_STATUS.ACTIVE,
  description: '',
};

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s/_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCollectionStatusMeta(status: CollectionStatus): {
  label: string;
  variant: 'ok' | 'warn' | 'neutral';
} {
  if (status === COLLECTION_STATUS.SOLD_OUT) {
    return { label: 'Sold Out', variant: 'warn' };
  }
  if (status === COLLECTION_STATUS.ARCHIVED) {
    return { label: 'Arsip', variant: 'neutral' };
  }
  return { label: 'Aktif', variant: 'ok' };
}

function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved !== undefined) {
    next.splice(toIndex, 0, moved);
  }
  return next;
}

export default function CategoriesCollectionsTab({
  includeInactive,
}: CategoriesCollectionsTabProps) {
  const queryClient = useQueryClient();

  const [categories, setCategories] = useState<CatalogCategoryDto[]>([]);
  const [collections, setCollections] = useState<CatalogCollectionDto[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catSlugTouched, setCatSlugTouched] = useState(false);
  const [catForm, setCatForm] = useState<CategoryFormState>(INITIAL_CATEGORY_FORM);
  const [submittingCat, setSubmittingCat] = useState(false);
  const [busyCatId, setBusyCatId] = useState<string | null>(null);
  const [reorderingCats, setReorderingCats] = useState(false);

  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [colSlugTouched, setColSlugTouched] = useState(false);
  const [colForm, setColForm] = useState<CollectionFormState>(INITIAL_COLLECTION_FORM);
  const [submittingCol, setSubmittingCol] = useState(false);
  const [busyColId, setBusyColId] = useState<string | null>(null);
  const [reorderingCols, setReorderingCols] = useState(false);

  const [feedback, setFeedback] = useState<{
    variant: 'error' | 'success';
    message: string;
    details?: string[];
  } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, cols] = await Promise.all([
        listCategories(includeInactive),
        listCollections(includeInactive),
      ]);
      setCategories(cats);
      setCollections(cols);
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal memuat daftar kategori dan koleksi.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function invalidatePublicCatalog() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.categories }),
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.collections }),
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.models }),
    ]);
  }

  function resetCategoryForm() {
    setEditingCatId(null);
    setCatSlugTouched(false);
    setCatForm(INITIAL_CATEGORY_FORM);
  }

  function resetCollectionForm() {
    setEditingColId(null);
    setColSlugTouched(false);
    setColForm(INITIAL_COLLECTION_FORM);
  }

  function startEditCategory(cat: CatalogCategoryDto) {
    setFeedback(null);
    setEditingCatId(cat.id);
    setCatSlugTouched(true);
    setCatForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? '',
      sizeChartImagePath: cat.sizeChartImagePath,
      sizeChartImageUrl: cat.sizeChartImageUrl,
    });
  }

  function startEditCollection(col: CatalogCollectionDto) {
    setFeedback(null);
    setEditingColId(col.id);
    setColSlugTouched(true);
    setColForm({
      name: col.name,
      slug: col.slug,
      status: col.status,
      description: col.description ?? '',
    });
  }

  async function handleSubmitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const name = catForm.name.trim();
    const slug = catForm.slug.trim();

    if (name.length < 2) {
      setFeedback({ variant: 'error', message: 'Nama kategori minimal 2 karakter.' });
      return;
    }
    if (slug.length < 2 || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setFeedback({
        variant: 'error',
        message: 'Slug kategori hanya boleh huruf kecil, angka, dan tanda hubung (-).',
      });
      return;
    }

    setSubmittingCat(true);
    try {
      const basePayload = {
        name,
        slug,
        description: catForm.description.trim() || null,
        sizeChartImagePath: catForm.sizeChartImagePath,
      };

      if (editingCatId !== null) {
        const updated = await updateCategory(editingCatId, basePayload);
        setFeedback({
          variant: 'success',
          message: `Kategori "${updated.name}" berhasil diperbarui.`,
        });
      } else {
        const nextSortOrder =
          categories.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
        const created = await createCategory({ ...basePayload, sortOrder: nextSortOrder });
        setFeedback({
          variant: 'success',
          message: `Kategori "${created.name}" berhasil ditambahkan.`,
        });
      }

      resetCategoryForm();
      await loadAll();
      await invalidatePublicCatalog();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan data kategori.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSubmittingCat(false);
    }
  }

  async function handleToggleCategoryActive(cat: CatalogCategoryDto) {
    setBusyCatId(cat.id);
    setFeedback(null);
    try {
      if (cat.isActive) {
        await deactivateCategory(cat.id);
        setFeedback({ variant: 'success', message: `Kategori "${cat.name}" dinonaktifkan.` });
      } else {
        await updateCategory(cat.id, { isActive: true });
        setFeedback({ variant: 'success', message: `Kategori "${cat.name}" diaktifkan kembali.` });
      }
      await loadAll();
      await invalidatePublicCatalog();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status kategori.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setBusyCatId(null);
    }
  }

  async function handleMoveCategory(index: number, delta: -1 | 1) {
    const targetIndex = index + delta;
    if (reorderingCats || targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = moveItem(categories, index, targetIndex).map((item, idx) => ({
      ...item,
      sortOrder: idx + 1,
    }));
    setCategories(reordered);
    setReorderingCats(true);
    setFeedback(null);
    try {
      await reorderCategories({
        items: reordered.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
      });
      await loadAll();
      await invalidatePublicCatalog();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan urutan kategori.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
      await loadAll();
    } finally {
      setReorderingCats(false);
    }
  }

  async function handleSubmitCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const name = colForm.name.trim();
    const slug = colForm.slug.trim();

    if (name.length < 2) {
      setFeedback({ variant: 'error', message: 'Nama koleksi minimal 2 karakter.' });
      return;
    }
    if (slug.length < 2 || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setFeedback({
        variant: 'error',
        message: 'Slug koleksi hanya boleh huruf kecil, angka, dan tanda hubung (-).',
      });
      return;
    }

    setSubmittingCol(true);
    try {
      const basePayload = {
        name,
        slug,
        status: colForm.status,
        description: colForm.description.trim() || null,
      };

      if (editingColId !== null) {
        const updated = await updateCollection(editingColId, basePayload);
        setFeedback({
          variant: 'success',
          message: `Koleksi "${updated.name}" berhasil diperbarui.`,
        });
      } else {
        const nextSortOrder =
          collections.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
        const created = await createCollection({ ...basePayload, sortOrder: nextSortOrder });
        setFeedback({
          variant: 'success',
          message: `Koleksi "${created.name}" berhasil ditambahkan.`,
        });
      }

      resetCollectionForm();
      await loadAll();
      await invalidatePublicCatalog();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan data koleksi.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setSubmittingCol(false);
    }
  }

  async function handleToggleCollectionActive(col: CatalogCollectionDto) {
    setBusyColId(col.id);
    setFeedback(null);
    try {
      if (col.isActive) {
        await deactivateCollection(col.id);
        setFeedback({ variant: 'success', message: `Koleksi "${col.name}" dinonaktifkan.` });
      } else {
        await updateCollection(col.id, { isActive: true });
        setFeedback({ variant: 'success', message: `Koleksi "${col.name}" diaktifkan kembali.` });
      }
      await loadAll();
      await invalidatePublicCatalog();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal mengubah status koleksi.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
    } finally {
      setBusyColId(null);
    }
  }

  async function handleMoveCollection(index: number, delta: -1 | 1) {
    const targetIndex = index + delta;
    if (reorderingCols || targetIndex < 0 || targetIndex >= collections.length) return;

    const reordered = moveItem(collections, index, targetIndex).map((item, idx) => ({
      ...item,
      sortOrder: idx + 1,
    }));
    setCollections(reordered);
    setReorderingCols(true);
    setFeedback(null);
    try {
      await reorderCollections({
        items: reordered.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
      });
      await loadAll();
      await invalidatePublicCatalog();
    } catch (err: unknown) {
      const parsed = extractApiError(err, 'Gagal menyimpan urutan koleksi.');
      setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
      await loadAll();
    } finally {
      setReorderingCols(false);
    }
  }

  return (
    <div className="space-y-8">
      {feedback ? (
        <AdminFeedbackBanner
          variant={feedback.variant}
          message={feedback.message}
          details={feedback.details}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      {/* Seksi Kategori Pakaian */}
      <section className="space-y-4">
        <div className="card-sharp p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Kategori Pakaian</h2>
              <p className="text-xs text-muted">
                Kelola jenis pakaian dan foto panduan ukuran untuk Custom Lab.
              </p>
            </div>
            {editingCatId !== null ? (
              <button
                type="button"
                onClick={resetCategoryForm}
                className="btn-secondary px-4 py-2 text-xs"
              >
                Batal Edit
              </button>
            ) : null}
          </div>

          <form
            onSubmit={(event) => void handleSubmitCategory(event)}
            className="mt-4 space-y-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cat-name" className="block text-sm font-medium text-ink">
                  Nama Kategori
                </label>
                <input
                  id="cat-name"
                  type="text"
                  value={catForm.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setCatForm((prev) => ({
                      ...prev,
                      name: nextName,
                      slug:
                        !catSlugTouched && editingCatId === null ? slugify(nextName) : prev.slug,
                    }));
                  }}
                  placeholder="T-Shirt"
                  className="input-sharp mt-1.5"
                  disabled={submittingCat}
                />
              </div>

              <div>
                <label htmlFor="cat-slug" className="block text-sm font-medium text-ink">
                  Slug Unik
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="cat-slug"
                    type="text"
                    value={catForm.slug}
                    onChange={(event) => {
                      setCatSlugTouched(true);
                      setCatForm((prev) => ({
                        ...prev,
                        slug: event.target.value.toLowerCase().replace(/\s+/g, '-'),
                      }));
                    }}
                    placeholder="t-shirt"
                    className="input-sharp min-w-0 flex-1 font-mono"
                    disabled={submittingCat}
                  />
                  <IconTooltip
                    label="Samakan slug dengan nama"
                    disabled={submittingCat || !catForm.name.trim()}
                    onClick={() => {
                      setCatForm((prev) => ({ ...prev, slug: slugify(prev.name) }));
                      if (editingCatId === null) {
                        setCatSlugTouched(false);
                      }
                    }}
                    className="h-11 w-11 shrink-0 border border-neutral-300 bg-white hover:border-ink"
                  >
                    <Wand2 size={17} strokeWidth={1.5} aria-hidden="true" />
                  </IconTooltip>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="cat-desc" className="block text-sm font-medium text-ink">
                Deskripsi (Opsional)
              </label>
              <input
                id="cat-desc"
                type="text"
                value={catForm.description}
                onChange={(event) =>
                  setCatForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Keterangan singkat kategori"
                className="input-sharp mt-1.5"
                disabled={submittingCat}
              />
            </div>

            <CatalogImageField
              id="cat-size-chart-upload"
              label="Foto Size Chart"
              folder="size-charts"
              pathValue={catForm.sizeChartImagePath}
              existingUrl={catForm.sizeChartImageUrl}
              helperText="Ditampilkan pada tombol Panduan Ukuran di Custom Lab untuk seluruh model pada kategori ini."
              onChange={(nextPath, nextUrl) =>
                setCatForm((prev) => ({
                  ...prev,
                  sizeChartImagePath: nextPath,
                  sizeChartImageUrl: nextUrl,
                }))
              }
              disabled={submittingCat}
            />

            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submittingCat}>
              {submittingCat
                ? 'Menyimpan...'
                : editingCatId !== null
                  ? 'Simpan Perubahan Kategori'
                  : '+ Tambah Kategori'}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">Memuat kategori...</div>
        ) : categories.length === 0 ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Belum ada kategori pakaian.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat, idx) => (
              <article key={cat.id} className="card-sharp flex flex-col justify-between p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2 border-b border-line pb-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-semibold text-ink">
                          {cat.name}
                        </h3>
                        <ActiveStatusBadge isActive={cat.isActive} />
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted">{cat.slug}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <IconTooltip
                        label="Geser naik"
                        disabled={reorderingCats || idx === 0}
                        onClick={() => void handleMoveCategory(idx, -1)}
                        className="h-9 w-9 min-h-[36px] border border-line bg-white hover:border-ink"
                      >
                        <ArrowUp size={15} strokeWidth={1.5} aria-hidden="true" />
                      </IconTooltip>
                      <IconTooltip
                        label="Geser turun"
                        disabled={reorderingCats || idx === categories.length - 1}
                        onClick={() => void handleMoveCategory(idx, 1)}
                        className="h-9 w-9 min-h-[36px] border border-line bg-white hover:border-ink"
                      >
                        <ArrowDown size={15} strokeWidth={1.5} aria-hidden="true" />
                      </IconTooltip>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-[#FAFAFA]">
                      {cat.sizeChartImageUrl ? (
                        <img
                          src={cat.sizeChartImageUrl}
                          alt={`Size chart ${cat.name}`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="px-1 text-center text-[10px] text-muted">Tanpa chart</span>
                      )}
                    </div>
                    <div className="min-w-0 text-xs text-muted">
                      <p className="tabular-price font-medium text-ink">
                        {cat.activeModelCount ?? 0} model aktif
                      </p>
                      {cat.description ? (
                        <p className="mt-1 line-clamp-2">{cat.description}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
                  <IconTooltip
                    label={`Edit ${cat.name}`}
                    onClick={() => startEditCategory(cat)}
                    className="h-10 w-10 min-h-[40px] border border-line bg-white hover:border-ink"
                  >
                    <Pencil size={15} strokeWidth={1.5} aria-hidden="true" />
                  </IconTooltip>
                  <IconTooltip
                    label={cat.isActive ? `Nonaktifkan ${cat.name}` : `Aktifkan ${cat.name}`}
                    disabled={busyCatId === cat.id}
                    onClick={() => void handleToggleCategoryActive(cat)}
                    className={`h-10 w-10 min-h-[40px] border bg-white ${
                      cat.isActive
                        ? 'border-line text-status-err hover:border-status-err hover:bg-red-50'
                        : 'border-line text-status-ok hover:border-status-ok hover:bg-emerald-50'
                    }`}
                  >
                    <Power size={15} strokeWidth={1.5} aria-hidden="true" />
                  </IconTooltip>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Seksi Koleksi / Series */}
      <section className="space-y-4 border-t border-line pt-6">
        <div className="card-sharp p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Koleksi / Series</h2>
              <p className="text-xs text-muted">
                Kelompokkan rilis produk dan atur status Aktif, Sold Out, atau Arsip.
              </p>
            </div>
            {editingColId !== null ? (
              <button
                type="button"
                onClick={resetCollectionForm}
                className="btn-secondary px-4 py-2 text-xs"
              >
                Batal Edit
              </button>
            ) : null}
          </div>

          <form
            onSubmit={(event) => void handleSubmitCollection(event)}
            className="mt-4 space-y-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="col-name" className="block text-sm font-medium text-ink">
                  Nama Koleksi
                </label>
                <input
                  id="col-name"
                  type="text"
                  value={colForm.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setColForm((prev) => ({
                      ...prev,
                      name: nextName,
                      slug:
                        !colSlugTouched && editingColId === null ? slugify(nextName) : prev.slug,
                    }));
                  }}
                  placeholder="Urban Collection"
                  className="input-sharp mt-1.5"
                  disabled={submittingCol}
                />
              </div>

              <div>
                <label htmlFor="col-slug" className="block text-sm font-medium text-ink">
                  Slug Unik
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="col-slug"
                    type="text"
                    value={colForm.slug}
                    onChange={(event) => {
                      setColSlugTouched(true);
                      setColForm((prev) => ({
                        ...prev,
                        slug: event.target.value.toLowerCase().replace(/\s+/g, '-'),
                      }));
                    }}
                    placeholder="urban-collection"
                    className="input-sharp min-w-0 flex-1 font-mono"
                    disabled={submittingCol}
                  />
                  <IconTooltip
                    label="Samakan slug dengan nama"
                    disabled={submittingCol || !colForm.name.trim()}
                    onClick={() => {
                      setColForm((prev) => ({ ...prev, slug: slugify(prev.name) }));
                      if (editingColId === null) {
                        setColSlugTouched(false);
                      }
                    }}
                    className="h-11 w-11 shrink-0 border border-neutral-300 bg-white hover:border-ink"
                  >
                    <Wand2 size={17} strokeWidth={1.5} aria-hidden="true" />
                  </IconTooltip>
                </div>
              </div>

              <div>
                <label htmlFor="col-status" className="block text-sm font-medium text-ink">
                  Status Rilis
                </label>
                <select
                  id="col-status"
                  value={colForm.status}
                  onChange={(event) =>
                    setColForm((prev) => ({
                      ...prev,
                      status: event.target.value as CollectionStatus,
                    }))
                  }
                  className="input-sharp mt-1.5"
                  disabled={submittingCol}
                >
                  <option value={COLLECTION_STATUS.ACTIVE}>Aktif</option>
                  <option value={COLLECTION_STATUS.SOLD_OUT}>Sold Out</option>
                  <option value={COLLECTION_STATUS.ARCHIVED}>Arsip</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="col-desc" className="block text-sm font-medium text-ink">
                Deskripsi (Opsional)
              </label>
              <input
                id="col-desc"
                type="text"
                value={colForm.description}
                onChange={(event) =>
                  setColForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Keterangan singkat koleksi"
                className="input-sharp mt-1.5"
                disabled={submittingCol}
              />
            </div>

            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={submittingCol}>
              {submittingCol
                ? 'Menyimpan...'
                : editingColId !== null
                  ? 'Simpan Perubahan Koleksi'
                  : '+ Tambah Koleksi'}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">Memuat koleksi...</div>
        ) : collections.length === 0 ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Belum ada koleksi atau series.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {collections.map((col, idx) => {
              const statusMeta = getCollectionStatusMeta(col.status);
              return (
                <article key={col.id} className="card-sharp flex flex-col justify-between p-4">
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2 border-b border-line pb-2.5">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-base font-semibold text-ink">
                          {col.name}
                        </h3>
                        <p className="mt-0.5 truncate font-mono text-xs text-muted">{col.slug}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <IconTooltip
                          label="Geser naik"
                          disabled={reorderingCols || idx === 0}
                          onClick={() => void handleMoveCollection(idx, -1)}
                          className="h-9 w-9 min-h-[36px] border border-line bg-white hover:border-ink"
                        >
                          <ArrowUp size={15} strokeWidth={1.5} aria-hidden="true" />
                        </IconTooltip>
                        <IconTooltip
                          label="Geser turun"
                          disabled={reorderingCols || idx === collections.length - 1}
                          onClick={() => void handleMoveCollection(idx, 1)}
                          className="h-9 w-9 min-h-[36px] border border-line bg-white hover:border-ink"
                        >
                          <ArrowDown size={15} strokeWidth={1.5} aria-hidden="true" />
                        </IconTooltip>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      {!col.isActive ? <ActiveStatusBadge isActive={false} /> : null}
                      <span className="tabular-price text-xs text-muted">
                        {col.activeModelCount ?? 0} model aktif
                      </span>
                    </div>

                    {col.description ? (
                      <p className="line-clamp-2 text-xs text-muted">{col.description}</p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
                    <IconTooltip
                      label={`Edit ${col.name}`}
                      onClick={() => startEditCollection(col)}
                      className="h-10 w-10 min-h-[40px] border border-line bg-white hover:border-ink"
                    >
                      <Pencil size={15} strokeWidth={1.5} aria-hidden="true" />
                    </IconTooltip>
                    <IconTooltip
                      label={col.isActive ? `Nonaktifkan ${col.name}` : `Aktifkan ${col.name}`}
                      disabled={busyColId === col.id}
                      onClick={() => void handleToggleCollectionActive(col)}
                      className={`h-10 w-10 min-h-[40px] border bg-white ${
                        col.isActive
                          ? 'border-line text-status-err hover:border-status-err hover:bg-red-50'
                          : 'border-line text-status-ok hover:border-status-ok hover:bg-emerald-50'
                      }`}
                    >
                      <Power size={15} strokeWidth={1.5} aria-hidden="true" />
                    </IconTooltip>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
