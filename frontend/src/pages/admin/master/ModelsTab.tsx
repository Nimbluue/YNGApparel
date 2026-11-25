import { useQueryClient } from '@tanstack/react-query';
import type { FabricDto, GarmentModelDto } from '@yng/shared';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
import { catalogQueryKeys } from '../../../services/catalogService';
import { extractApiError } from '../../../utils/apiError';
import { formatRupiah } from '../../../utils/formatRupiah';

interface ModelsTabProps {
  includeInactive: boolean;
}

interface ModelFormState {
  name: string;
  slug: string;
  basePrice: string;
  mockupTemplate: string;
  description: string;
  imagePath: string | null;
  imageUrl: string | null;
}

interface DragSession {
  pointerId: number;
  draggedId: number;
  startPointerX: number;
  startPointerY: number;
  startOffsetLeft: number;
  startOffsetTop: number;
  startScrollX: number;
  startScrollY: number;
  lastClientX: number;
  lastClientY: number;
  initialModels: GarmentModelDto[];
}

interface CardPosition {
  left: number;
  top: number;
}

const INITIAL_FORM: ModelFormState = {
  name: '',
  slug: '',
  basePrice: '0',
  mockupTemplate: '',
  description: '',
  imagePath: null,
  imageUrl: null,
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

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const num = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(num) ? num : null;
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

function computeSequentialUpdates(
  nextModels: readonly GarmentModelDto[],
  previousModels: readonly GarmentModelDto[]
): {
  normalizedModels: GarmentModelDto[];
  changedItems: Array<{ id: number; sortOrder: number }>;
} {
  const previousSortById = new Map<number, number>();
  for (const item of previousModels) {
    previousSortById.set(item.id, item.sortOrder);
  }

  const normalizedModels = nextModels.map((item, idx) => ({
    ...item,
    sortOrder: idx + 1,
  }));

  const changedItems = normalizedModels
    .filter((item) => previousSortById.get(item.id) !== item.sortOrder)
    .map((item) => ({ id: item.id, sortOrder: item.sortOrder }));

  return { normalizedModels, changedItems };
}

export default function ModelsTab({ includeInactive }: ModelsTabProps) {
  const queryClient = useQueryClient();

  const [models, setModels] = useState<GarmentModelDto[]>([]);
  const [allFabrics, setAllFabrics] = useState<FabricDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<ModelFormState>(INITIAL_FORM);

  const [linkingModel, setLinkingModel] = useState<GarmentModelDto | null>(null);
  const [selectedFabricIds, setSelectedFabricIds] = useState<number[]>([]);
  const [savingFabrics, setSavingFabrics] = useState(false);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [feedback, setFeedback] = useState<{
    variant: 'error' | 'success';
    message: string;
    details?: string[];
  } | null>(null);

  const modelsRef = useRef<GarmentModelDto[]>([]);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const prevPositionsRef = useRef<Map<number, CardPosition>>(new Map());
  const dragSessionRef = useRef<DragSession | null>(null);

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  const fabricMap = useMemo(() => {
    const map = new Map<number, FabricDto>();
    for (const fabric of allFabrics) {
      map.set(fabric.id, fabric);
    }
    return map;
  }, [allFabrics]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const isFiltering = normalizedSearch.length > 0;

  const visibleModels = useMemo(() => {
    if (!normalizedSearch) return models;
    return models.filter(
      (model) =>
        model.name.toLowerCase().includes(normalizedSearch) ||
        model.slug.toLowerCase().includes(normalizedSearch)
    );
  }, [models, normalizedSearch]);

  const globalIndexById = useMemo(() => {
    const map = new Map<number, number>();
    models.forEach((model, index) => {
      map.set(model.id, index);
    });
    return map;
  }, [models]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsData, fabricsData] = await Promise.all([
        listModels(includeInactive),
        listFabrics(true),
      ]);
      modelsRef.current = modelsData;
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

  const captureCardPositions = useCallback(() => {
    const snapshot = new Map<number, CardPosition>();
    for (const model of modelsRef.current) {
      const el = cardRefs.current.get(model.id);
      if (el) {
        snapshot.set(model.id, { left: el.offsetLeft, top: el.offsetTop });
      }
    }
    prevPositionsRef.current = snapshot;
  }, []);

  const persistReorderedModels = useCallback(
    async (nextModels: GarmentModelDto[], previousModels: GarmentModelDto[]) => {
      const { normalizedModels, changedItems } = computeSequentialUpdates(
        nextModels,
        previousModels
      );

      if (changedItems.length === 0) {
        return;
      }

      modelsRef.current = normalizedModels;
      setModels(normalizedModels);
      setReordering(true);
      setFeedback(null);

      try {
        const updatedList = await Promise.all(
          changedItems.map((item) => updateModel(item.id, { sortOrder: item.sortOrder }))
        );
        const updatedById = new Map(updatedList.map((item) => [item.id, item]));
        const syncedModels = normalizedModels.map((item) => updatedById.get(item.id) ?? item);

        modelsRef.current = syncedModels;
        setModels(syncedModels);
        await queryClient.invalidateQueries({ queryKey: catalogQueryKeys.models });
        setFeedback({
          variant: 'success',
          message: `Urutan tampilan model diperbarui (${changedItems.length} model disimpan).`,
        });
      } catch (err: unknown) {
        const parsed = extractApiError(err, 'Gagal menyimpan urutan model pakaian.');
        setFeedback({ variant: 'error', message: parsed.message, details: parsed.details });
        await loadData();
      } finally {
        setReordering(false);
      }
    },
    [loadData, queryClient]
  );

  const orderKey = models.map((model) => model.id).join(',');

  useLayoutEffect(() => {
    const prevPositions = prevPositionsRef.current;
    if (prevPositions.size === 0) {
      return;
    }
    prevPositionsRef.current = new Map();

    const session = dragSessionRef.current;
    if (session) {
      const draggedEl = cardRefs.current.get(session.draggedId);
      if (draggedEl) {
        const travelX =
          session.lastClientX - session.startPointerX + (window.scrollX - session.startScrollX);
        const travelY =
          session.lastClientY - session.startPointerY + (window.scrollY - session.startScrollY);
        const visualLeft = session.startOffsetLeft + travelX;
        const visualTop = session.startOffsetTop + travelY;
        setDragOffset({
          x: visualLeft - draggedEl.offsetLeft,
          y: visualTop - draggedEl.offsetTop,
        });
      }
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      return;
    }

    const cleanupTimers: number[] = [];

    for (const model of modelsRef.current) {
      if (session && model.id === session.draggedId) {
        continue;
      }
      const el = cardRefs.current.get(model.id);
      const oldPos = prevPositions.get(model.id);
      if (!el || !oldPos) {
        continue;
      }

      const deltaX = oldPos.left - el.offsetLeft;
      const deltaY = oldPos.top - el.offsetTop;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        continue;
      }

      el.style.transition = 'none';
      el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
      void el.offsetHeight;

      window.requestAnimationFrame(() => {
        el.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = '';
      });

      const timer = window.setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
      }, 240);
      cleanupTimers.push(timer);
    }

    return () => {
      for (const timer of cleanupTimers) {
        window.clearTimeout(timer);
      }
    };
  }, [orderKey]);

  useEffect(() => {
    if (draggingId === null) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      session.lastClientX = event.clientX;
      session.lastClientY = event.clientY;

      const draggedEl = cardRefs.current.get(session.draggedId);
      if (!draggedEl) {
        return;
      }

      const travelX =
        event.clientX - session.startPointerX + (window.scrollX - session.startScrollX);
      const travelY =
        event.clientY - session.startPointerY + (window.scrollY - session.startScrollY);
      const visualLeft = session.startOffsetLeft + travelX;
      const visualTop = session.startOffsetTop + travelY;

      setDragOffset({
        x: visualLeft - draggedEl.offsetLeft,
        y: visualTop - draggedEl.offsetTop,
      });

      const currentList = modelsRef.current;
      const currentIndex = currentList.findIndex((item) => item.id === session.draggedId);
      if (currentIndex < 0) {
        return;
      }

      const draggedCenterX = visualLeft + draggedEl.offsetWidth / 2;
      const draggedCenterY = visualTop + draggedEl.offsetHeight / 2;

      let targetIndex = -1;
      for (let i = 0; i < currentList.length; i += 1) {
        const candidate = currentList[i];
        if (!candidate || candidate.id === session.draggedId) {
          continue;
        }
        const el = cardRefs.current.get(candidate.id);
        if (!el) {
          continue;
        }
        const padX = Math.min(24, el.offsetWidth * 0.12);
        const padY = Math.min(24, el.offsetHeight * 0.12);
        const withinX =
          draggedCenterX >= el.offsetLeft + padX &&
          draggedCenterX <= el.offsetLeft + el.offsetWidth - padX;
        const withinY =
          draggedCenterY >= el.offsetTop + padY &&
          draggedCenterY <= el.offsetTop + el.offsetHeight - padY;

        if (withinX && withinY) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex !== -1 && targetIndex !== currentIndex) {
        captureCardPositions();
        const swapped = moveItem(currentList, currentIndex, targetIndex);
        modelsRef.current = swapped;
        setModels(swapped);
      }
    }

    function finishDrag(event: PointerEvent, cancelled: boolean) {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      dragSessionRef.current = null;
      setDraggingId(null);
      setDragOffset({ x: 0, y: 0 });

      if (cancelled) {
        modelsRef.current = session.initialModels;
        setModels(session.initialModels);
        return;
      }

      const finalModels = modelsRef.current;
      const hasOrderChanged = finalModels.some(
        (item, idx) => session.initialModels[idx]?.id !== item.id
      );

      if (hasOrderChanged) {
        void persistReorderedModels(finalModels, session.initialModels);
      }
    }

    function handlePointerUp(event: PointerEvent) {
      finishDrag(event, false);
    }

    function handlePointerCancel(event: PointerEvent) {
      finishDrag(event, true);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [draggingId, captureCardPositions, persistReorderedModels]);

  function handleDragHandlePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    model: GarmentModelDto
  ) {
    if (reordering || loading || submitting || isFiltering || modelsRef.current.length < 2) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const cardEl = cardRefs.current.get(model.id);
    if (!cardEl) {
      return;
    }

    event.preventDefault();

    dragSessionRef.current = {
      pointerId: event.pointerId,
      draggedId: model.id,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startOffsetLeft: cardEl.offsetLeft,
      startOffsetTop: cardEl.offsetTop,
      startScrollX: window.scrollX,
      startScrollY: window.scrollY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      initialModels: modelsRef.current,
    };

    setDraggingId(model.id);
    setDragOffset({ x: 0, y: 0 });
  }

  function handleStepMove(index: number, delta: -1 | 1) {
    if (reordering || loading || isFiltering || draggingId !== null) {
      return;
    }
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= models.length) {
      return;
    }

    captureCardPositions();
    const nextModels = moveItem(models, index, targetIndex);
    void persistReorderedModels(nextModels, models);
  }

  function handleHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      handleStepMove(index, -1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      handleStepMove(index, 1);
    }
  }

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
      await queryClient.invalidateQueries({ queryKey: catalogQueryKeys.models });
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

    if (name.length < 2) {
      setFeedback({ variant: 'error', message: 'Nama model minimal 2 karakter.' });
      return;
    }

    if (slug.length < 2 || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setFeedback({
        variant: 'error',
        message:
          'Slug minimal 2 karakter dan hanya boleh huruf kecil, angka, dan tanda hubung (-).',
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

    setSubmitting(true);
    try {
      const basePayload = {
        name,
        slug,
        basePrice,
        mockupTemplate: form.mockupTemplate.trim() || null,
        description: form.description.trim() || null,
        imagePath: form.imagePath,
      };

      if (editingId !== null) {
        const updated = await updateModel(editingId, basePayload);
        setFeedback({
          variant: 'success',
          message: `Model "${updated.name}" berhasil diperbarui.`,
        });
      } else {
        const nextSortOrder =
          Math.max(
            models.length,
            models.reduce((max, item) => Math.max(max, item.sortOrder), 0)
          ) + 1;

        const created = await createModel({
          ...basePayload,
          sortOrder: nextSortOrder,
        });
        setFeedback({
          variant: 'success',
          message: `Model "${created.name}" berhasil ditambahkan pada urutan #${nextSortOrder}.`,
        });
      }

      resetForm();
      await loadData();
      await queryClient.invalidateQueries({ queryKey: catalogQueryKeys.models });
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
      await queryClient.invalidateQueries({ queryKey: catalogQueryKeys.models });
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
              Harga dasar dalam integer rupiah penuh tanpa desimal. Urutan tampil diatur lewat
              daftar model di bawah.
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
                  setForm((prev) => ({
                    ...prev,
                    slug: event.target.value.toLowerCase().replace(/\s+/g, '-'),
                  }));
                }}
                placeholder="kaos-lengan-pendek"
                className="input-sharp mt-1.5 font-mono"
                disabled={submitting}
              />
              {editingId === null ? (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {slugTouched
                      ? 'Edit manual aktif — perubahan Nama Model tidak menimpa slug.'
                      : 'Terisi otomatis dari Nama Model. Edit manual bila perlu.'}
                  </span>
                  {slugTouched ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSlugTouched(false);
                        setForm((prev) => ({ ...prev, slug: slugify(prev.name) }));
                      }}
                      className="inline-flex min-h-touch items-center font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                    >
                      Ikuti Nama Model lagi
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-muted">
                  Digunakan pada tautan katalog{' '}
                  <span className="font-mono text-ink">/custom-lab?model=…</span>.
                </p>
              )}
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
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                Opsional — persiapan untuk fitur pratinjau Mockup 2D di Fase 2. Boleh dikosongkan.
              </p>
            </div>
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
                    className={`flex min-h-touch cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                      checked ? 'border-ink bg-white' : 'border-line bg-surface hover:border-ink'
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

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              Daftar Model (<span className="tabular-price">{models.length}</span>)
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {isFiltering ? (
                <>
                  Menampilkan{' '}
                  <span className="tabular-price font-medium text-ink">{visibleModels.length}</span>{' '}
                  dari <span className="tabular-price font-medium text-ink">{models.length}</span>{' '}
                  model. Kosongkan pencarian untuk mengubah urutan tampil.
                </>
              ) : (
                'Tahan & geser pegangan atau gunakan tombol ↑/↓ untuk mengatur urutan tampil katalog.'
              )}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {reordering ? (
              <span role="status" className="text-xs font-medium text-muted">
                Menyimpan urutan...
              </span>
            ) : null}

            <div className="flex items-center gap-2 sm:w-72">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Cari model berdasarkan nama atau slug"
                placeholder="Cari nama atau slug model..."
                className="input-sharp"
              />
              {isFiltering ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="btn-secondary shrink-0 px-3.5 py-2 text-xs"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Memuat daftar model pakaian...
          </div>
        ) : models.length === 0 ? (
          <div className="card-sharp p-6 text-center text-sm text-muted">
            Belum ada model pakaian untuk ditampilkan.
          </div>
        ) : visibleModels.length === 0 ? (
          <div className="card-sharp space-y-3 p-6 text-center">
            <p className="text-sm text-muted">
              Tidak ada model yang cocok dengan pencarian &ldquo;{searchQuery.trim()}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="btn-secondary px-4 py-2 text-xs"
            >
              Tampilkan Semua
            </button>
          </div>
        ) : (
          <div
            className={`relative grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 ${
              draggingId !== null ? 'select-none' : ''
            }`}
          >
            {visibleModels.map((model, index) => {
              const globalIndex = globalIndexById.get(model.id) ?? index;
              const isDragging = draggingId === model.id;
              const isReorderLocked = reordering || isFiltering || models.length < 2;

              return (
                <article
                  key={model.id}
                  ref={(node) => {
                    if (node) {
                      cardRefs.current.set(model.id, node);
                    } else {
                      cardRefs.current.delete(model.id);
                    }
                  }}
                  style={
                    isDragging
                      ? {
                          transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) scale(1.01)`,
                        }
                      : undefined
                  }
                  className={`card-sharp flex flex-col justify-between p-4 transition-shadow duration-150 ${
                    isDragging ? 'relative z-20 border-ink shadow-lg ring-1 ring-ink/15' : ''
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={(event) => handleDragHandlePointerDown(event, model)}
                        onKeyDown={(event) => handleHandleKeyDown(event, globalIndex)}
                        disabled={isReorderLocked}
                        aria-label={`Seret untuk mengubah urutan ${model.name}`}
                        title={
                          isFiltering
                            ? 'Kosongkan pencarian untuk menggeser urutan'
                            : 'Tahan & geser atau tekan panah keyboard'
                        }
                        className="inline-flex h-11 w-11 touch-none cursor-grab items-center justify-center rounded-xl border border-line bg-surface text-ink transition-colors hover:border-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          className="h-4 w-4 fill-current"
                          aria-hidden="true"
                        >
                          <circle cx="5.5" cy="3.5" r="1.2" />
                          <circle cx="10.5" cy="3.5" r="1.2" />
                          <circle cx="5.5" cy="8" r="1.2" />
                          <circle cx="10.5" cy="8" r="1.2" />
                          <circle cx="5.5" cy="12.5" r="1.2" />
                          <circle cx="10.5" cy="12.5" r="1.2" />
                        </svg>
                      </button>

                      <span className="tabular-price inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink">
                        #{globalIndex + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleStepMove(globalIndex, -1)}
                        disabled={globalIndex === 0 || isReorderLocked || draggingId !== null}
                        aria-label={`Geser ${model.name} ke urutan sebelumnya`}
                        title="Geser ke urutan sebelumnya"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStepMove(globalIndex, 1)}
                        disabled={
                          globalIndex === models.length - 1 ||
                          isReorderLocked ||
                          draggingId !== null
                        }
                        aria-label={`Geser ${model.name} ke urutan berikutnya`}
                        title="Geser ke urutan berikutnya"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface">
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
                      <p className="tabular-price text-sm font-semibold text-ink">
                        {formatRupiah(model.basePrice)}
                      </p>
                      {model.mockupTemplate ? (
                        <p className="text-xs text-muted">
                          Template mockup:{' '}
                          <span className="font-mono text-ink">{model.mockupTemplate}</span>
                        </p>
                      ) : null}
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
                              className="rounded-lg border border-line-strong bg-surface px-2.5 py-0.5 font-mono text-[11px] text-ink"
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
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
